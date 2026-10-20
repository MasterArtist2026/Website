/** Pure helpers for Studio Sessions. No DOM, no secrets. */

export const STUDIO_WHATSAPP = '60102779426';
export const STUDIO_TZ = 'Asia/Kuala_Lumpur';

export const STUDIO_ADDRESS = {
  name: 'Master Artist',
  street: '38-2, Jalan 28/70A, Desa Sri Hartamas (above Savor)',
  locality: 'Kuala Lumpur',
  postal: '50480',
  region: 'Wilayah Persekutuan Kuala Lumpur',
  country: 'MY',
  url: 'https://masterartist.co/',
};

const BANDS = [
  ['morning', 12 * 60 + 30],
  ['afternoon', 18 * 60],
  ['evening', 24 * 60],
];

function klParts(iso) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: STUDIO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(new Date(iso));
  const get = type => parts.find(p => p.type === type)?.value || '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

/** Morning before 12:30, afternoon before 18:00, otherwise evening. Asia/Kuala_Lumpur. */
export function timeBand(iso) {
  const { hour, minute } = klParts(iso);
  const mins = hour * 60 + minute;
  return BANDS.find(([, end]) => mins < end)[0];
}

export function moneyMYR(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'RM0';
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return 'RM' + text;
}

/** Public seat badge. Zero is sold out; any other count is "N left". */
export function seatsBadge(seatsLeft) {
  const left = Number(seatsLeft);
  if (!Number.isFinite(left) || left <= 0) return 'Sold out';
  return left === 1 ? '1 left' : left + ' left';
}

export function qtyLabel(qty, unit) {
  const n = Number(qty) || 0;
  if (unit === 'pair') return n === 1 ? '1 pair' : n + ' pairs';
  return n === 1 ? '1 place' : n + ' places';
}

export function formatWhen(starts, ends) {
  const start = new Date(starts);
  const day = new Intl.DateTimeFormat('en-MY', {
    timeZone: STUDIO_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(start);
  const clock = new Intl.DateTimeFormat('en-MY', {
    timeZone: STUDIO_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return day + ', ' + clock.format(start) + '–' + clock.format(new Date(ends));
}

/** GA4 purchase and the Ads conversion fire only for a paid booking or a saved WhatsApp reservation. */
export function purchaseShouldFire(status, mode) {
  if (status === 'paid') return true;
  return status === 'pending' && mode === 'whatsapp';
}

export function reserveMessage(booking) {
  const lines = [
    "Hi Master Artist! I'd like to reserve a Studio Session.",
    '',
    'Booking ID: ' + (booking.public_code || ''),
    'Reference: ' + (booking.booking_id || ''),
    booking.format_name || '',
    booking.when || '',
    booking.room || '',
    [booking.qty_label, booking.amount_label].filter(Boolean).join(' · '),
    'Name: ' + (booking.name || ''),
    'Phone: ' + (booking.phone || ''),
    'Email: ' + (booking.email || ''),
  ];
  if (booking.child_name) {
    lines.push('Child: ' + booking.child_name + (booking.child_age ? ' (' + booking.child_age + ')' : ''));
  }
  lines.push('', 'Prepaid and non-refundable. Please confirm this reservation.');
  return lines.join('\n');
}

function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function icsStamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function icsCalendar(event) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Master Artist//Studio Sessions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + icsEscape(event.uid),
    'DTSTAMP:' + icsStamp(event.stamp || new Date().toISOString()),
    'DTSTART:' + icsStamp(event.starts),
    'DTEND:' + icsStamp(event.ends),
    'SUMMARY:' + icsEscape(event.summary),
    'LOCATION:' + icsEscape(event.location),
    'DESCRIPTION:' + icsEscape(event.description),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

export function eventJsonLd(session) {
  const soldOut = Number(session.seats_left) <= 0;
  const price = Number(session.unit_price_myr);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: session.name + ' — Master Artist Studio Sessions',
    description: session.summary || session.name,
    startDate: session.starts_at,
    endDate: session.ends_at,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: session.image_path ? 'https://masterartist.co' + session.image_path : 'https://masterartist.co/hero-1.jpg',
    url: 'https://masterartist.co/studio-sessions/book/?session=' + session.id,
    location: {
      '@type': 'Place',
      name: session.room + ', Master Artist — the room with the view',
      address: {
        '@type': 'PostalAddress',
        streetAddress: STUDIO_ADDRESS.street,
        addressLocality: STUDIO_ADDRESS.locality,
        postalCode: STUDIO_ADDRESS.postal,
        addressRegion: STUDIO_ADDRESS.region,
        addressCountry: STUDIO_ADDRESS.country,
      },
    },
    organizer: {
      '@type': 'EducationalOrganization',
      name: STUDIO_ADDRESS.name,
      url: STUDIO_ADDRESS.url,
    },
    offers: {
      '@type': 'Offer',
      price: Number.isFinite(price) ? price.toFixed(2) : '0.00',
      priceCurrency: 'MYR',
      availability: soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      url: 'https://masterartist.co/studio-sessions/book/?session=' + session.id,
      validFrom: new Date().toISOString(),
    },
  };
}
