// Supabase Edge Function: meta-capi
// Relays the website's key events (Contact, InitiateCheckout, Lead, ViewContent,
// Purchase) to the Meta Conversions API, server to server, with the same
// event_id the browser pixel used, so Meta de-duplicates and counts each once.
//
// Secret required (Supabase → Edge Functions → Secrets):
//   META_CAPI_TOKEN   — a Conversions API access token from Events Manager
// Optional:
//   META_PIXEL_ID     — defaults to Master Artist's pixel below
//   META_TEST_CODE    — an Events Manager "Test events" code while verifying
//
// The site only calls this when data/site.json tracking.capi is true.

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "1104757255303373";
const ALLOWED_ORIGINS = [
  "https://masterartist.co",
  "https://www.masterartist.co",
  "http://localhost:8765",
];
const ALLOWED_EVENTS = new Set(["Contact", "InitiateCheckout", "Lead", "ViewContent", "Purchase"]);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers });
  }

  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!token) return new Response(JSON.stringify({ error: "META_CAPI_TOKEN not set" }), { status: 500, headers });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers }); }

  const eventName = str(body.event_name, 40);
  const eventId = str(body.event_id, 100);
  const sourceUrl = str(body.event_source_url, 500);
  if (!ALLOWED_EVENTS.has(eventName) || !eventId || !sourceUrl.startsWith(origin)) {
    return new Response(JSON.stringify({ error: "invalid event" }), { status: 400, headers });
  }

  // Only the non-personal parameters the site sends; no names, phones or emails ever reach Meta from here.
  const cd = (body.custom_data ?? {}) as Record<string, unknown>;
  const custom_data: Record<string, unknown> = {};
  for (const k of ["voice", "format", "programme", "session_id", "source", "currency"]) {
    if (str(cd[k])) custom_data[k] = str(cd[k]);
  }
  const value = Number(cd.value);
  if (Number.isFinite(value) && value > 0) { custom_data.value = value; custom_data.currency = custom_data.currency || "MYR"; }

  const user_data: Record<string, string> = {
    client_user_agent: str(req.headers.get("user-agent"), 400),
  };
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip) user_data.client_ip_address = ip;
  if (str(body.fbp)) user_data.fbp = str(body.fbp);
  if (str(body.fbc)) user_data.fbc = str(body.fbc);

  const payload: Record<string, unknown> = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: sourceUrl,
      user_data,
      custom_data,
    }],
  };
  const test = Deno.env.get("META_TEST_CODE");
  if (test) payload.test_event_code = test;

  const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: res.ok, events_received: out.events_received ?? 0 }), { status: res.ok ? 200 : 502, headers });
});
