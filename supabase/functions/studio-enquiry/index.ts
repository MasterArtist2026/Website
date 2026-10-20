// Saves a corporate or private-event enquiry. No anon insert on the table.
// This is not a trial lead, so it does not fire generate_lead.
import { adminClient } from "../_shared/supabase.ts";
import { allowedOrigin, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: json({}, 200, origin).headers });
  if (!allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403, origin);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_contact" }, 400, origin);
  }

  const admin = adminClient();
  const saved = await admin.rpc("create_studio_enquiry", { payload: body });
  if (saved.error || !saved.data) {
    const message = saved.error?.message || "";
    const code = /invalid_contact/.test(message) ? "invalid_contact" : "enquiry_failed";
    return json({ error: code }, code === "invalid_contact" ? 400 : 500, origin);
  }
  return json({ id: saved.data, ok: true }, 200, origin);
});
