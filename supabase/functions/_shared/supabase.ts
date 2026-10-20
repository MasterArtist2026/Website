import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("supabase env missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bookingMode() {
  const forced = (Deno.env.get("STUDIO_BOOKING_MODE") || "").trim().toLowerCase();
  const key = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
  if (forced === "whatsapp") return "whatsapp";
  if (forced === "stripe" && key) return "stripe";
  return key ? "stripe" : "whatsapp";
}
