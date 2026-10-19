// Stripe webhook. Marks a hold paid, mints the RM50 voucher (via the database
// trigger), releases expired holds, and asks the email function to write when
// RESEND_API_KEY is set. Signature secret: STRIPE_WEBHOOK_SECRET.
import { adminClient } from "../_shared/supabase.ts";
import { verifyStripeSignature } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  if (!secret) return new Response("webhook secret not set", { status: 500 });

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  try {
    await verifyStripeSignature(payload, signature, secret);
  } catch (error) {
    console.error("stripe signature", (error as Error).message);
    return new Response("bad signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  const admin = adminClient();
  await admin.rpc("release_expired_studio_holds");

  const type = event.type as string;
  const session = event.data?.object || {};
  const bookingId = session.metadata?.booking_id || session.client_reference_id;
  if (!bookingId) return new Response(JSON.stringify({ ignored: true }), { status: 200 });

  if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
    await admin.from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId)
      .eq("status", "pending");
    return new Response(JSON.stringify({ released: true }), { status: 200 });
  }

  const paidEvent = type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded";
  if (!paidEvent) return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  if (session.payment_status && session.payment_status !== "paid") {
    return new Response(JSON.stringify({ waiting: true }), { status: 200 });
  }

  const expected = Number(session.amount_total);
  const { data: row, error: readError } = await admin.from("bookings")
    .select("id, amount_myr, currency")
    .eq("id", bookingId)
    .maybeSingle();
  if (readError || !row) {
    console.error("booking missing", bookingId, readError?.message);
    return new Response("booking missing", { status: 500 });
  }
  const sen = Math.round(Number(row.amount_myr) * 100);
  if (row.currency !== "MYR" || !Number.isFinite(expected) || expected !== sen) {
    console.error("amount mismatch", bookingId, expected, sen);
    return new Response("amount mismatch", { status: 500 });
  }

  const settled = await admin.rpc("settle_studio_payment", {
    p_booking: bookingId,
    p_payment_ref: session.id || null,
  });
  if (settled.error) {
    console.error("settle failed", settled.error.message);
    return new Response("settle failed", { status: 500 });
  }

  if (settled.data?.ok) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      try {
        await fetch(`${url}/functions/v1/send-booking-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            apikey: key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ booking_id: bookingId }),
        });
      } catch (error) {
        console.error("email call failed", (error as Error).message);
      }
    }
  }

  return new Response(JSON.stringify(settled.data), { status: 200 });
});
