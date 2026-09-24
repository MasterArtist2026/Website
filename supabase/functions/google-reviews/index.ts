// Supabase Edge Function: google-reviews
// Fetches Master Artist's Google rating and reviews from the Places API (New)
// on the server, so the Google API key never appears in the website's code.
//
// Secret required (Supabase → Edge Functions → Secrets):
//   GOOGLE_PLACES_KEY  — a Google API key restricted to "Places API (New)" only
// Optional:
//   GOOGLE_PLACE_ID    — defaults to Master Artist's place below

const PLACE_ID = Deno.env.get("GOOGLE_PLACE_ID") ?? "ChIJ_5QUWwBJzDERfwTpMdDHLPY";
const ALLOWED_ORIGINS = [
  "https://masterartist.co",
  "https://www.masterartist.co",
  "http://localhost:8765",
];

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  // Only answer requests coming from the website itself
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers });
  }

  const key = Deno.env.get("GOOGLE_PLACES_KEY");
  if (!key) return new Response(JSON.stringify({ error: "GOOGLE_PLACES_KEY not set" }), { status: 500, headers });

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
    },
  });
  if (!res.ok) {
    console.error("Places API error", res.status, await res.text());
    return new Response(JSON.stringify({ error: "places request failed" }), { status: 502, headers });
  }
  const p = await res.json();

  // Return only what the website displays
  const body = {
    placeId: PLACE_ID,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    reviews: (p.reviews ?? []).map((r: any) => ({
      author: r.authorAttribution?.displayName ?? "Google user",
      authorUri: r.authorAttribution?.uri ?? null,
      authorPhoto: r.authorAttribution?.photoUri ?? null,
      rating: r.rating ?? 0,
      when: r.relativePublishTimeDescription ?? null,
      publishTime: r.publishTime ?? null,
      text: r.text?.text ?? r.originalText?.text ?? "",
    })),
  };
  return new Response(JSON.stringify(body), { headers });
});
