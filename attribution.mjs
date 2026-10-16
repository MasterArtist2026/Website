/** First-touch ad attribution and the WhatsApp ref code. No DOM. */

export const ATTR_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid',
];
export const ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sourceTokens(src) {
  return String(src || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasSource(src, names) {
  const tokens = sourceTokens(src);
  return names.some(name => tokens.includes(name));
}

/** FB if fbclid or a facebook/instagram utm_source; else GG for gclid or google; else WEB. */
export function refCode(attr) {
  const src = attr && attr.utm_source;
  const fbSource = hasSource(src, ['facebook', 'instagram']);
  const ggSource = hasSource(src, ['google']);
  const fbClick = Boolean(attr && attr.fbclid);
  const ggClick = Boolean(attr && attr.gclid);
  if (fbClick && ggClick) {
    if (ggSource && !fbSource) return 'GG';
    return 'FB';
  }
  if (fbClick || fbSource) return 'FB';
  if (ggClick || ggSource) return 'GG';
  return 'WEB';
}

/**
 * Keep the first stored touch until it expires. `stored` is the parsed
 * localStorage value (or null). Returns the touch to keep and whether the
 * caller should write it.
 */
export function firstTouch({ stored, now, search, landing, referrer }) {
  if (stored && typeof stored === 'object' && Number(stored.expires) > now) {
    return { touch: stored, wrote: false };
  }
  const params = new URLSearchParams(search || '');
  const touch = { expires: now + ATTR_TTL_MS };
  for (const key of ATTR_FIELDS) touch[key] = (params.get(key) || '').slice(0, 200);
  touch.landing_page = String(landing || '').slice(0, 500);
  touch.referrer = String(referrer || '').slice(0, 500);
  return { touch, wrote: true };
}

/** Prefix a WhatsApp message with "Ref: FB|GG|WEB", replacing an old ref line. */
export function withRef(text, attr) {
  const ref = 'Ref: ' + refCode(attr);
  const body = String(text || '').replace(/^\s*Ref:\s*(?:FB|GG|WEB)\s*\n?/i, '').trim();
  return body ? ref + '\n' + body : ref;
}
