// Optional confirmation email. Skips cleanly when RESEND_API_KEY is unset.
// Only the service role may call it. The webhook does that after a paid booking.
import { adminClient } from "../_shared/supabase.ts";

function authorised(req: Request) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const header = req.headers.get("Authorization") || "";
  return Boolean(key) && header === `Bearer ${key}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!authorised(req)) return new Response("not allowed", { status: 401 });

  const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!apiKey) return Response.json({ skipped: true });

  let body: { booking_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "missing booking" }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.from("bookings").select(`
    public_code, status, amount_myr, qty, people, booker_name, email,
    voucher_code, voucher_credits, child_name,
    workshop_sessions ( starts_at, ends_at, room, workshop_formats ( name ) )
  `).eq("id", body.booking_id).maybeSingle();
  if (error || !data) return Response.json({ error: "missing booking" }, { status: 404 });
  if (data.status !== "paid" && data.status !== "pending") {
    return Response.json({ skipped: true, reason: data.status });
  }

  const session = Array.isArray(data.workshop_sessions) ? data.workshop_sessions[0] : data.workshop_sessions;
  const format = session
    ? (Array.isArray(session.workshop_formats) ? session.workshop_formats[0] : session.workshop_formats)
    : null;
  const when = session
    ? new Intl.DateTimeFormat("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(session.starts_at))
    : "";
  const voucher = data.voucher_code
    ? `Your academy trial voucher is ${data.voucher_code}: RM50 credit for each of the ${data.voucher_credits} attendee${data.voucher_credits === 1 ? "" : "s"}.`
    : "Your RM50 academy trial voucher is issued once payment is confirmed.";
  const text = [
    `Hello ${data.booker_name},`,
    "",
    `Booking ${data.public_code} for ${format?.name || "your Studio Session"} is ${data.status}.`,
    when ? `When: ${when} (Kuala Lumpur)` : "",
    session?.room ? `Room: ${session.room}` : "",
    `Amount: RM${Number(data.amount_myr)} for ${data.qty}.`,
    data.child_name ? `Child: ${data.child_name}` : "",
    "",
    voucher,
    "",
    "Studio Sessions are prepaid and non-refundable. You can reschedule free of charge within 24 hours of booking; after that it is RM10 a person. A session needs 3 people to run. If fewer than 3 are confirmed 48 hours beforehand, we reschedule the session or refund you.",
    "",
    "Please arrive 15 minutes early. Master Artist, 38-2 Jalan 28/70A, Desa Sri Hartamas.",
    "Taught by working artists, in the room with the view.",
  ].filter(Boolean).join("\n");

  const from = Deno.env.get("RESEND_FROM") || "Master Artist <bookings@masterartist.co>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [data.email],
      subject: `Studio Session ${data.public_code} — ${format?.name || "Master Artist"}`,
      text,
    }),
  });
  if (!res.ok) {
    console.error("resend failed", res.status, await res.text());
    return Response.json({ sent: false }, { status: 200 });
  }
  return Response.json({ sent: true });
});
