// Supabase Edge Function: booking-notify
// Called by the workshop_bookings insert trigger (supabase/bookings.sql). Sends Sabrina
// the report for that session: who just booked, then everyone booked so far, seats
// taken, pairs, Savor meals, allergies and photo consent.
//   · Email (full list) through Resend
//   · WhatsApp (short alert with the counts and a link to the admin portal) through the
//     WhatsApp Cloud API. Names of children never go into either message.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   BOOKING_HOOK_SECRET   same value as the Vault secret booking_hook_secret
//   RESEND_API_KEY        Resend API key (domain masterartist.co verified in Resend)
//   REPORT_EMAIL_TO       comma-separated, e.g. Sabrina's address
// Optional:
//   REPORT_EMAIL_FROM     defaults to "Master Artist Bookings <bookings@masterartist.co>"
//   WHATSAPP_TOKEN        WhatsApp Cloud API permanent token
//   WHATSAPP_PHONE_ID     the Cloud API sender's phone number ID
//   WHATSAPP_TO           comma-separated numbers in international form, e.g. 60102779426
//   WHATSAPP_TEMPLATE     approved template name (default new_booking), language en
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_URL = "https://masterartist.co/admin.html#bookings";
const LIVE = ["requested", "confirmed", "paid"];

type Booking = {
  id: string; created_at: string; session_id: string; session_name: string; session_when: string; cap: number | null;
  name: string; phone: string; email: string | null; qty: number; ticket: string; people: number; amount: number;
  dine: boolean; allergies: string | null; child_name: string | null; child_age: string | null; photo_consent: string | null;
  status: string; source: string | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const ticketText = (b: Booking) => b.ticket === "pair" ? `${b.qty} pair${b.qty > 1 ? "s" : ""} (${b.people} people)` : `${b.people} seat${b.people > 1 ? "s" : ""}`;
const waNum = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("0") ? "6" + d : d; };  // 012… → 6012…
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function report(b: Booking, all: Booking[]) {
  const live = all.filter((x) => LIVE.includes(x.status));
  const taken = live.reduce((n, x) => n + x.people, 0);
  const left = b.cap ? Math.max(0, b.cap - taken) : null;
  const meals = live.filter((x) => x.dine).reduce((n, x) => n + x.people, 0);
  const allergies = live.filter((x) => x.allergies && !/^(none|no|nil|-|n\/a)$/i.test(x.allergies.trim()));
  const noPhoto = live.filter((x) => x.photo_consent === "no");
  const paid = live.filter((x) => x.status === "paid").reduce((n, x) => n + x.amount, 0);
  const due = live.filter((x) => x.status !== "paid").reduce((n, x) => n + x.amount, 0);

  const counts = `${taken}${b.cap ? ` of ${b.cap}` : ""} seats taken${left !== null ? `, ${left} left` : ""}`;
  const subject = `New booking: ${b.name}, ${b.session_name}, ${b.session_when} (${counts})`;

  const rows = live.map((x, i) => `<tr${x.id === b.id ? ' style="background:#FBF1DC"' : ""}>
    <td>${i + 1}</td><td>${esc(x.name)}${x.child_age ? `<br><small>child, age ${esc(x.child_age)}</small>` : ""}</td>
    <td><a href="https://wa.me/${waNum(x.phone)}">${esc(x.phone)}</a>${x.email ? `<br><small>${esc(x.email)}</small>` : ""}</td>
    <td>${ticketText(x)}</td><td>${x.dine ? "Yes" : ""}</td><td>${esc(x.allergies || "")}</td>
    <td>${x.photo_consent === "no" ? "<b>No</b>" : esc(x.photo_consent || "")}</td><td>RM${x.amount} ${esc(x.status)}</td></tr>`).join("");

  const html = `<div style="font-family:Arial,sans-serif;color:#2A1240;max-width:760px">
  <h2 style="margin:0 0 4px">${esc(b.session_name)}</h2>
  <p style="margin:0 0 14px;color:#555">${esc(b.session_when)}</p>
  <p style="font-size:16px"><b>Just booked:</b> ${esc(b.name)}, ${ticketText(b)}${b.dine ? ", with a Savor meal" : ""}, RM${b.amount} (${esc(b.status)}).</p>
  <p style="font-size:16px"><b>${counts}.</b> Savor meals: ${meals}. Paid RM${paid}${due ? `, still to collect RM${due}` : ""}.</p>
  ${allergies.length ? `<p><b>Allergies and needs:</b> ${allergies.map((x) => `${esc(x.name)}: ${esc(x.allergies)}`).join("; ")}</p>` : ""}
  ${noPhoto.length ? `<p><b>No photos please:</b> ${noPhoto.map((x) => esc(x.name)).join(", ")}</p>` : ""}
  <table cellpadding="6" style="border-collapse:collapse;font-size:13px;width:100%" border="1" bordercolor="#e5dccb">
    <tr style="background:#3B1C5A;color:#F6F1E8"><th>#</th><th>Name</th><th>Phone</th><th>Tickets</th><th>Savor</th><th>Allergies</th><th>Photos</th><th>Amount</th></tr>
    ${rows}</table>
  <p><a href="${ADMIN_URL}">Open Bookings in the admin portal</a></p></div>`;

  const text = [`New booking: ${b.name}, ${ticketText(b)}`, `${b.session_name}, ${b.session_when}`, `${counts}. Savor meals: ${meals}.`,
    allergies.length ? `Allergies/needs: ${allergies.length} booking(s), see the email.` : "", ADMIN_URL].filter(Boolean).join("\n");
  return { subject, html, text, counts, meals };
}

async function sendEmail(subject: string, html: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY"), to = (Deno.env.get("REPORT_EMAIL_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) return "email not configured";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("REPORT_EMAIL_FROM") ?? "Master Artist Bookings <bookings@masterartist.co>", to, subject, html, text }),
  });
  return res.ok ? "email sent" : `email failed ${res.status}: ${(await res.text()).slice(0, 200)}`;
}

// Business-initiated WhatsApp messages must use an approved template. new_booking body:
// "New booking: {{1}} for {{2}}, {{3}}. {{4}}. Full list in the admin portal."
async function sendWhatsApp(b: Booking, counts: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN"), phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  const to = (Deno.env.get("WHATSAPP_TO") ?? "").split(",").map((s) => waNum(s)).filter(Boolean);
  if (!token || !phoneId || !to.length) return "whatsapp not configured";
  const params = [`${b.name} (${ticketText(b)})`, b.session_name, b.session_when, counts].map((t) => ({ type: "text", text: t.slice(0, 200) }));
  const out: string[] = [];
  for (const n of to) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: n, type: "template",
        template: { name: Deno.env.get("WHATSAPP_TEMPLATE") ?? "new_booking", language: { code: "en" }, components: [{ type: "body", parameters: params }] } }),
    });
    out.push(res.ok ? "whatsapp sent" : `whatsapp failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return out.join("; ");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = Deno.env.get("BOOKING_HOOK_SECRET");
  if (!secret || req.headers.get("x-hook-secret") !== secret) return json({ error: "forbidden" }, 403);

  let body: { booking_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!body.booking_id || !/^[0-9a-f-]{36}$/.test(body.booking_id)) return json({ error: "booking_id required" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: b, error } = await sb.from("workshop_bookings").select("*").eq("id", body.booking_id).maybeSingle();
  if (error || !b) return json({ error: error?.message ?? "not found" }, 404);
  const { data: all } = await sb.from("workshop_bookings").select("*").eq("session_id", b.session_id).order("created_at");

  const r = report(b as Booking, (all ?? []) as Booking[]);
  const [email, whatsapp] = await Promise.all([sendEmail(r.subject, r.html, r.text), sendWhatsApp(b as Booking, r.counts)]);
  return json({ email, whatsapp });
});
