export const ALLOWED_ORIGINS = [
  "https://masterartist.co",
  "https://www.masterartist.co",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
];

export function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

export function allowedOrigin(origin: string | null) {
  return Boolean(origin && ALLOWED_ORIGINS.includes(origin));
}
