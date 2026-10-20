// Returns one booking to the person who holds its unguessable token.
// Used by the confirmation page. Does not list other bookings.
import { adminClient } from "../_shared/supabase.ts";
import { allowedOrigin, json } from "../_shared/cors.ts";

function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: json({}, 200, origin).headers });
  if (!allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403, origin);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, origin);

  let body: { booking_id?: string; gift_id?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "not_found" }, 404, origin);
  }

  if (body.gift_id) {
    const giftId = String(body.gift_id);
    const giftToken = String(body.token || "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(giftId) || !/^[0-9a-f-]{36}$/i.test(giftToken)) {
      return json({ error: "not_found" }, 404, origin);
    }
    const adminGift = adminClient();
    const gift = await adminGift.from("gift_vouchers").select(
      "id, public_code, public_token, amount_myr, balance_myr, status, payment_mode, recipient_name, purchaser_name",
    ).eq("id", giftId).maybeSingle();
    if (gift.error || !gift.data || !sameToken(String(gift.data.public_token).toLowerCase(), giftToken)) {
      return json({ error: "not_found" }, 404, origin);
    }
    return json({
      kind: "gift",
      gift_id: gift.data.id,
      public_code: gift.data.public_code,
      amount_myr: gift.data.amount_myr,
      balance_myr: gift.data.balance_myr,
      status: gift.data.status,
      payment_mode: gift.data.payment_mode,
      recipient_name: gift.data.recipient_name,
      name: gift.data.purchaser_name,
    }, 200, origin);
  }

  const bookingId = String(body.booking_id || "");
  const token = String(body.token || "").toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !/^[0-9a-f-]{36}$/i.test(token)) {
    return json({ error: "not_found" }, 404, origin);
  }

  const admin = adminClient();
  const { data, error } = await admin.from("bookings").select(`
    id, public_code, public_token, status, payment_mode, amount_myr, currency,
    qty, people, booker_name, phone, email, child_name, child_age,
    voucher_code, voucher_credits, hold_expires_at, needs_refund, reschedule_fee_myr,
    booked_at, gift_credit_myr,
    booking_addons ( name, qty, amount_myr ),
    workshop_sessions (
      starts_at, ends_at, room, promo_label,
      workshop_formats ( slug, name, unit, seats_per_unit, page_path, summary )
    )
  `).eq("id", bookingId).maybeSingle();

  if (error || !data || !sameToken(String(data.public_token).toLowerCase(), token)) {
    return json({ error: "not_found" }, 404, origin);
  }

  const session = Array.isArray(data.workshop_sessions) ? data.workshop_sessions[0] : data.workshop_sessions;
  const format = session
    ? (Array.isArray(session.workshop_formats) ? session.workshop_formats[0] : session.workshop_formats)
    : null;

  return json({
    booking_id: data.id,
    public_code: data.public_code,
    status: data.status,
    payment_mode: data.payment_mode,
    amount_myr: data.amount_myr,
    currency: data.currency,
    qty: data.qty,
    people: data.people,
    unit: format?.unit || "pax",
    name: data.booker_name,
    phone: data.phone,
    email: data.email,
    child_name: data.child_name,
    child_age: data.child_age,
    voucher_code: data.voucher_code,
    voucher_credits: data.voucher_credits,
    hold_expires_at: data.hold_expires_at,
    needs_refund: data.needs_refund,
    gift_credit_myr: data.gift_credit_myr,
    addons: data.booking_addons || [],
    reschedule_fee_myr: data.reschedule_fee_myr,
    booked_at: data.booked_at,
    session: session ? {
      name: format?.name || "",
      slug: format?.slug || "",
      summary: format?.summary || "",
      page_path: format?.page_path || "/studio-sessions.html",
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      room: session.room,
      promo_label: session.promo_label,
    } : null,
  }, 200, origin);
});
