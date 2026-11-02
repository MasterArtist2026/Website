/** Public lead payloads and CRM helpers. No DOM, no network of its own. */

export const PUBLIC_SOURCES = ['trial_form', 'workshop_form', 'booking_form', 'enquiry_form'];

const PHONE_RE = /^[0-9+(). -]{8,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function blank(value, max) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
}

/** Open pipeline rows with no edit in the last 24 hours. */
export function needsFollowUp(lead, now = Date.now()) {
  if (!lead || ['paid', 'attended', 'lost'].includes(lead.stage)) return false;
  const stamp = new Date(lead.updated_at || lead.created_at).getTime();
  if (!Number.isFinite(stamp)) return false;
  return now - stamp >= 24 * 60 * 60 * 1000;
}

/** Two or more bookings that were not cancelled. */
export function repeatCustomer(bookings) {
  return (bookings || []).filter(row => row && row.status !== 'cancelled').length >= 2;
}

/** Seats still counting toward capacity, revenue, and ad cost per booking. */
export function workshopStats(workshop, bookings) {
  const rows = (bookings || []).filter(row => row && row.status !== 'cancelled');
  const seats = rows.reduce((sum, row) => sum + (Number(row.seats) || 1), 0);
  const revenue = rows
    .filter(row => row.status === 'paid' || row.status === 'attended')
    .reduce((sum, row) => sum + (Number(row.price_paid) || 0), 0);
  const spend = Number(workshop && workshop.ad_spend) || 0;
  return {
    seats,
    revenue,
    capacity: Number(workshop && workshop.capacity) || 0,
    adCostPerBooking: seats > 0 ? spend / seats : null,
  };
}

/**
 * Validate a public form and return the anon insert payload.
 * `touch` is the first-touch object from attribution.mjs.
 */
export function buildPublicLead(input) {
  const name = String((input && input.name) || '').trim();
  const phone = String((input && input.phone) || '').trim();
  const email = String((input && input.email) || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (name.length < 1 || name.length > 120) return { ok: false, error: 'Please add your name.' };
  if (digits.length < 8 || digits.length > 15 || !PHONE_RE.test(phone)) {
    return { ok: false, error: 'Please add a phone number we can WhatsApp.' };
  }
  if (email && (email.length > 320 || !EMAIL_RE.test(email))) {
    return { ok: false, error: 'Please check the email address, or leave it blank.' };
  }
  const source = PUBLIC_SOURCES.includes(input && input.source) ? input.source : '';
  if (!source) return { ok: false, error: 'This form could not be saved.' };
  const touch = (input && input.touch) || {};
  return {
    ok: true,
    row: {
      name,
      phone,
      email: email || null,
      interest: blank(input.interest, 200),
      child_age: blank(input.childAge, 40),
      message: blank(input.message, 4000),
      source,
      source_page: blank(input.sourcePage, 500),
      landing_page: blank(touch.landing_page, 500),
      referrer: blank(touch.referrer, 500),
      utm_source: blank(touch.utm_source, 200),
      utm_medium: blank(touch.utm_medium, 200),
      utm_campaign: blank(touch.utm_campaign, 200),
      utm_term: blank(touch.utm_term, 200),
      utm_content: blank(touch.utm_content, 200),
      gclid: blank(touch.gclid, 200),
      fbclid: blank(touch.fbclid, 200),
    },
  };
}

/** POST one lead. Prefer return=minimal because anon cannot select the row. */
export async function postLead({ fetchImpl, endpoint, anonKey, row }) {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (res.status === 201 || res.status === 204) return { ok: true };
  let message = 'HTTP ' + res.status;
  try {
    const body = await res.json();
    if (body && (body.message || body.error)) message = body.message || body.error;
  } catch { /* empty body */ }
  return { ok: false, message };
}
