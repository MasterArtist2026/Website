// Supabase Edge Function: stripe-webhook
// Stripe calls this when a Checkout payment finishes. It checks Stripe's signature, then sets
// the booking to 'paid' (which updates the customer's total in the CRM and sends Sabrina the
// report) or to 'expired' if the customer left without paying.
//
// Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   https://fudaosneozobacdalncv.supabase.co/functions/v1/stripe-webhook
//   events: checkout.session.completed, checkout.session.async_payment_succeeded,
//           checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
// Secret: STRIPE_WEBHOOK_SECRET = the endpoint's signing secret (whsec_…).
// Deploy with --no-verify-jwt (Stripe does not send a Supabase JWT; the signature is the check).

import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function verify(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts.t, sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const payload = await req.text();
  if (!secret || !(await verify(payload, req.headers.get("Stripe-Signature") ?? "", secret))) return json({ error: "bad signature" }, 400);

  const event = JSON.parse(payload);
  const obj = event.data?.object ?? {};
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bookingId = obj.metadata?.booking_id ?? obj.client_reference_id;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // FPX and cards are usually paid at once; a delayed method completes later with async_payment_succeeded
      if (obj.payment_status !== "paid" || !bookingId) break;
      await sb.from("workshop_bookings").update({ status: "paid", paid_at: new Date().toISOString(), stripe_session: obj.id,
        amount: Math.round((obj.amount_total ?? 0) / 100) }).eq("id", bookingId).in("status", ["pending", "expired", "requested", "confirmed"]);
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      if (bookingId) await sb.from("workshop_bookings").update({ status: "expired" }).eq("id", bookingId).eq("status", "pending");
      break;
    case "charge.refunded": {
      // Full refunds only; find the booking through the Checkout session that took the payment
      if (!obj.refunded || !obj.payment_intent) break;
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(obj.payment_intent)}`,
        { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}` } });
      const id = res.ok ? (await res.json()).data?.[0]?.metadata?.booking_id : null;
      if (id) await sb.from("workshop_bookings").update({ status: "refunded" }).eq("id", id);
      break;
    }
  }
  return json({ received: true });
});
