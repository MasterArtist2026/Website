// Creates a Studio Session hold and, when STRIPE_SECRET_KEY is set, a Checkout
// Session in MYR (card, FPX, GrabPay). Until that key exists — or when
// STUDIO_BOOKING_MODE=whatsapp — the booking stays pending and the page opens
// WhatsApp. Seat holds are 15 minutes for Stripe and 24 hours for WhatsApp.
import { adminClient, bookingMode } from "../_shared/supabase.ts";
import { allowedOrigin, json } from "../_shared/cors.ts";
import { stripePost } from "../_shared/stripe.ts";

const WHATSAPP = "60102779426";

function httpStatus(message: string) {
  if (message === "sold_out") return 409;
  if (["not_published", "not_bookable", "session_closed", "child_required", "invalid_gift"].includes(message)) return 409;
  if (["invalid_qty", "invalid_contact", "missing_session", "invalid_addon", "invalid_amount"].includes(message)) return 400;
  return 500;
}

async function stripeCheckout(
  secret: string,
  admin: ReturnType<typeof adminClient>,
  spec: {
    amount_sen: number;
    name: string;
    description: string;
    success: string;
    cancel: string;
    customer_email: string;
    client_reference_id: string;
    metadata: Record<string, string>;
    idempotency: string;
    table: "bookings" | "gift_vouchers";
    row_id: string;
  },
  extra: Record<string, unknown>,
  origin: string | null,
) {
  const base = {
    mode: "payment",
    success_url: spec.success,
    cancel_url: spec.cancel,
    client_reference_id: spec.client_reference_id,
    customer_email: spec.customer_email,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: spec.metadata,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "myr",
        unit_amount: spec.amount_sen,
        product_data: { name: spec.name, description: spec.description },
      },
    }],
    payment_intent_data: { metadata: spec.metadata },
  };
  const methodSets = [["card", "fpx", "grabpay"], ["card", "fpx"], ["card"]];
  let checkout: { id: string; url: string } | null = null;
  let lastError: Error | null = null;
  for (const methods of methodSets) {
    try {
      checkout = await stripePost(secret, "checkout/sessions", {
        ...base,
        payment_method_types: methods,
      }, `${spec.idempotency}-${methods.join("-")}`);
      break;
    } catch (error) {
      lastError = error as Error;
      const text = String((error as Error).message || "");
      if (!/payment method|grabpay|fpx|currency/i.test(text)) break;
    }
  }
  if (!checkout?.url) {
    await admin.from(spec.table).update({ status: "cancelled" }).eq("id", spec.row_id);
    console.error("stripe checkout failed", lastError?.message);
    return json({ error: "payment_unavailable" }, 502, origin);
  }
  const saved = await admin.from(spec.table).update({ payment_ref: checkout.id }).eq("id", spec.row_id);
  if (saved.error) console.error("could not store payment ref", saved.error.message);
  return json({ ...extra, checkout_url: checkout.url }, 200, origin);
}

function clientError(error: { message?: string } | null) {
  const message = error?.message || "booking failed";
  const known = message.match(/sold_out|not_published|not_bookable|session_closed|child_required|invalid_qty|invalid_contact|missing_session|invalid_addon|invalid_gift|invalid_amount/);
  return known ? known[0] : "booking failed";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: json({}, 200, origin).headers });
  if (!allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403, origin);

  const mode = bookingMode();
  if (req.method === "GET") {
    return json({ mode, currency: "MYR", whatsapp: WHATSAPP }, 200, origin);
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_contact" }, 400, origin);
  }

  const admin = adminClient();
  await admin.rpc("release_expired_studio_holds");

  const payload = {
    session_id: body.session_id,
    qty: body.qty,
    name: body.name,
    phone: body.phone,
    email: body.email,
    child_name: body.child_name,
    child_age: body.child_age,
    payment_mode: mode,
    utm_source: body.utm_source,
    utm_medium: body.utm_medium,
    utm_campaign: body.utm_campaign,
    utm_term: body.utm_term,
    utm_content: body.utm_content,
    gclid: body.gclid,
    fbclid: body.fbclid,
    ref_code: body.ref_code,
    landing_page: body.landing_page,
    referrer: body.referrer,
    addons: body.addons,
    gift_code: body.gift_code,
  };

  if (body.kind === "gift") {
    const heldGift = await admin.rpc("hold_gift_voucher", { payload: { ...payload, amount_myr: body.amount_myr, recipient_name: body.recipient_name } });
    if (heldGift.error || !heldGift.data) {
      const code = clientError(heldGift.error);
      return json({ error: code }, httpStatus(code), origin);
    }
    const gift = heldGift.data;
    if (mode === "whatsapp") return json({ ...gift, mode, whatsapp: WHATSAPP, kind: "gift" }, 200, origin);
    const secret = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const success = `${origin}/studio-sessions/confirmation/?gift=${gift.gift_id}&token=${gift.public_token}`;
    const cancel = `${origin}/gift-vouchers/`;
    return await stripeCheckout(secret, admin, {
      amount_sen: gift.amount_sen,
      name: `Studio Session gift voucher RM${gift.amount_myr}`,
      description: gift.public_code,
      success,
      cancel,
      customer_email: String(body.email || "").trim(),
      client_reference_id: gift.gift_id,
      metadata: { gift_id: gift.gift_id, public_code: gift.public_code, kind: "gift" },
      idempotency: `gift-${gift.gift_id}`,
      table: "gift_vouchers",
      row_id: gift.gift_id,
    }, { ...gift, mode, whatsapp: WHATSAPP, kind: "gift" }, origin);
  }

  const held = await admin.rpc("hold_studio_booking", { payload });
  if (held.error || !held.data) {
    const code = clientError(held.error);
    return json({ error: code }, httpStatus(code), origin);
  }

  const booking = held.data;
  const session = booking.session;
  const success = `${origin}/studio-sessions/confirmation/?booking=${booking.booking_id}&token=${booking.public_token}`;
  if (Number(booking.amount_sen) === 0) {
    return json({ ...booking, mode: "paid", whatsapp: WHATSAPP, checkout_url: success }, 200, origin);
  }
  if (mode === "whatsapp") {
    return json({ ...booking, mode, whatsapp: WHATSAPP }, 200, origin);
  }

  const secret = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const description = `${session.name} · ${session.room}`;
  const cancel = `${origin}/studio-sessions/book/?session=${session.id}`;
  const base = {
    mode: "payment",
    success_url: success,
    cancel_url: cancel,
    client_reference_id: booking.booking_id,
    customer_email: String(body.email || "").trim(),
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: { booking_id: booking.booking_id, public_code: booking.public_code },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "myr",
        unit_amount: booking.amount_sen,
        product_data: { name: session.name, description },
      },
    }],
    payment_intent_data: {
      metadata: { booking_id: booking.booking_id, public_code: booking.public_code },
    },
  };

  const methodSets = [
    ["card", "fpx", "grabpay"],
    ["card", "fpx"],
    ["card"],
  ];
  let checkout: { id: string; url: string } | null = null;
  let lastError: Error | null = null;
  for (const methods of methodSets) {
    try {
      checkout = await stripePost(secret, "checkout/sessions", {
        ...base,
        payment_method_types: methods,
      }, `studio-${booking.booking_id}-${methods.join("-")}`);
      break;
    } catch (error) {
      lastError = error as Error;
      const text = String((error as Error).message || "");
      if (!/payment method|grabpay|fpx|currency/i.test(text)) break;
    }
  }

  if (!checkout?.url) {
    await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.booking_id);
    console.error("stripe checkout failed", lastError?.message);
    return json({ error: "payment_unavailable" }, 502, origin);
  }

  const saved = await admin.from("bookings").update({ payment_ref: checkout.id }).eq("id", booking.booking_id);
  if (saved.error) {
    console.error("could not store payment ref", saved.error.message);
  }

  return json({ ...booking, mode, whatsapp: WHATSAPP, checkout_url: checkout.url }, 200, origin);
});
