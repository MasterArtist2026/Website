// Supabase Edge Function: create-checkout
// POST from the booking form on a dated workshop page: checks the session and the seats left,
// prices the booking from the published schedule (never from the browser), saves it as
// 'pending' (which also creates or updates the customer in the CRM) and returns a Stripe
// Checkout link. stripe-webhook marks it 'paid' when the money is in.
// GET ?b=<booking id>&s=<Stripe session id> returns that booking's status for the thank-you page.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   sk_test_… while testing, sk_live_… to take real payments
// Optional:
//   SITE_URL            defaults to https://masterartist.co (where data/workshops.json is read)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://masterartist.co";
const ALLOWED_ORIGINS = ["https://masterartist.co", "https://www.masterartist.co", "http://localhost:8765"];
const HOLD_MINUTES = 35;   // a pending booking holds its seats while the customer is on Stripe (Checkout expires at 30)

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => str(v, max) || null;

type Session = { id: string; format: string; date: string; time: string; end: string; name: string; theme?: string; public: boolean;
  type?: string; cap: number; price: number; pair_price?: number; room?: string };

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe ${res.status}`);
  return body;
}

const when = (s: Session) => {
  const d = new Date(`${s.date}T00:00:00`);
  const [h, m] = s.time.split(":").map(Number);
  const t = `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} at ${t}`;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- thank-you page: status of one booking, only with its own Stripe session id ----
  if (req.method === "GET") {
    const u = new URL(req.url), b = u.searchParams.get("b") ?? "", s = u.searchParams.get("s") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(b) || !/^cs_[A-Za-z0-9_]+$/.test(s)) return out({ error: "bad request" }, 400);
    const { data } = await sb.from("workshop_bookings").select("status, amount, format, session_id, session_name, session_when, people")
      .eq("id", b).eq("stripe_session", s).maybeSingle();
    return data ? out(data) : out({ error: "not found" }, 404);
  }

  if (req.method !== "POST") return out({ error: "POST only" }, 405);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return out({ error: "origin not allowed" }, 403);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return out({ error: "payments not set up" }, 503);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return out({ error: "bad json" }, 400); }

  // The session as published on the site
  const data = await fetch(`${SITE}/data/workshops.json`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  const s: Session | undefined = data?.sessions?.find((x: Session) => x.id === b.session_id);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  if (!s || !s.public || s.type === "course" || s.date < today) return out({ error: "This session is no longer on sale." }, 404);

  const qty = Math.floor(Number(b.qty));
  const pair = b.ticket === "pair" && !!s.pair_price;
  if (!(qty >= 1 && qty <= 20)) return out({ error: "Please choose how many seats." }, 400);
  const people = pair ? qty * 2 : qty, amount = (pair ? s.pair_price! : s.price) * qty;

  // Seats: confirmed, paid and requested bookings, plus checkouts still open
  const since = new Date(Date.now() - HOLD_MINUTES * 60000).toISOString();
  const { data: taken } = await sb.from("workshop_bookings").select("people, status, created_at").eq("session_id", s.id)
    .or(`status.in.(requested,confirmed,paid),and(status.eq.pending,created_at.gte.${since})`);
  const left = (s.cap || 999) - (taken ?? []).reduce((n, r) => n + (r.people as number), 0);
  if (people > left) return out({ error: left > 0 ? `Only ${left} seat${left > 1 ? "s" : ""} left for this session.` : "This session is full." }, 409);

  const first = str(b.first_name, 60), last = str(b.last_name, 60), email = str(b.email, 320).toLowerCase(), phone = str(b.phone, 40);
  if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[0-9]{8,15}$/.test(phone)) {
    return out({ error: "Please check your name, WhatsApp number and email." }, 400);
  }
  const theme = s.theme ? `${s.theme} (${s.name})` : s.name;
  const children = Array.isArray(b.children) ? (b.children as Record<string, unknown>[]).slice(0, 12).map((k) => ({
    name: str(k.name, 60), age: str(k.age, 20), allergies: opt(k.allergies, 300), school: opt(k.school, 80) })) : [];
  const consents = Array.isArray(b.consents) ? (b.consents as unknown[]).map((c) => str(c, 20)).filter((c) => ["parent", "kitchen", "terms"].includes(c)) : [];

  const { data: row, error } = await sb.from("workshop_bookings").insert({
    session_id: s.id, format: s.format, session_name: theme, session_when: when(s), session_date: s.date, cap: s.cap,
    first_name: first, last_name: last, name: `${first} ${last}`, phone, email, qty, ticket: pair ? "pair" : "single", people, amount,
    dine: b.dine === true, allergies: opt(b.allergies, 1000), child_name: opt(b.child_name, 400), child_age: opt(b.child_age, 40),
    children, collector: opt(b.collector, 120), photo_consent: opt(b.photo_consent, 30), consents, source: opt(b.source, 200),
    utm_source: opt(b.utm_source, 200), utm_medium: opt(b.utm_medium, 200), utm_campaign: opt(b.utm_campaign, 200),
    utm_content: opt(b.utm_content, 200), gclid: opt(b.gclid, 200), fbclid: opt(b.fbclid, 200), landing_page: opt(b.landing_page, 500),
    marketing_consent: b.marketing_consent === true, status: "pending",
  }).select("id").single();
  if (error || !row) return out({ error: "We could not save your booking. Please try again or WhatsApp us." }, 500);

  const page = `${SITE}/workshops/${s.format}/${s.date}/`;
  try {
    const cs = await stripe("checkout/sessions", {
      mode: "payment",
      customer_email: email,
      client_reference_id: row.id,
      "metadata[booking_id]": row.id,
      "metadata[session_id]": s.id,
      "payment_intent_data[description]": `${theme}, ${when(s)}: ${pair ? `${qty} pair` : `${people} seat`}${people > 1 && !pair ? "s" : ""}`,
      "payment_intent_data[metadata][booking_id]": row.id,
      "line_items[0][quantity]": String(qty),
      "line_items[0][price_data][currency]": "myr",
      "line_items[0][price_data][unit_amount]": String((pair ? s.pair_price! : s.price) * 100),
      "line_items[0][price_data][product_data][name]": `${theme}${pair ? " · pair ticket" : ""}`,
      "line_items[0][price_data][product_data][description]": `${when(s)} · Master Artist, Desa Sri Hartamas`,
      success_url: `${SITE}/booking/thanks/?b=${row.id}&s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${page}?cancelled=1#book`,
      expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    });
    await sb.from("workshop_bookings").update({ stripe_session: cs.id }).eq("id", row.id);
    return out({ url: cs.url });
  } catch (e) {
    await sb.from("workshop_bookings").update({ status: "expired", notes: `Stripe: ${String(e).slice(0, 200)}` }).eq("id", row.id);
    return out({ error: "Payment could not be started. Please try again or WhatsApp us." }, 502);
  }
});
