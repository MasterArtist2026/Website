/** Stripe REST helpers. The secret is read from the environment on each call. */

function encode(value: unknown, prefix: string, out: URLSearchParams) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => encode(item, `${prefix}[${index}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      encode(item, prefix ? `${prefix}[${key}]` : key, out);
    }
    return;
  }
  out.append(prefix, String(value));
}

export function formBody(payload: Record<string, unknown>) {
  const body = new URLSearchParams();
  encode(payload, "", body);
  return body;
}

export async function stripePost(
  secret: string,
  path: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: formBody(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message || "stripe request failed";
    const err = new Error(message) as Error & { code?: string; status?: number };
    err.code = json?.error?.code || json?.error?.param || "";
    err.status = res.status;
    throw err;
  }
  return json;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) throw new Error("bad signature header");
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) throw new Error("signature timestamp");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const hex = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!signatures.some((signature) => timingSafeEqual(hex, signature))) {
    throw new Error("signature mismatch");
  }
}
