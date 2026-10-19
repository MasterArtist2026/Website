import assert from 'node:assert/strict';
import {
  timeBand, moneyMYR, qtyLabel, formatWhen, purchaseShouldFire, reserveMessage, icsCalendar, eventJsonLd,
  STUDIO_WHATSAPP,
} from '../studio-booking.mjs';

assert.equal(timeBand('2026-11-15T02:00:00Z'), 'morning'); // 10:00 KL
assert.equal(timeBand('2026-11-15T02:30:00Z'), 'morning'); // 10:30 KL
assert.equal(timeBand('2026-11-15T04:29:00Z'), 'morning'); // 12:29 KL
assert.equal(timeBand('2026-11-15T04:30:00Z'), 'afternoon'); // 12:30 KL
assert.equal(timeBand('2026-11-15T07:00:00Z'), 'afternoon'); // 15:00 KL
assert.equal(timeBand('2026-11-15T07:30:00Z'), 'afternoon'); // 15:30 KL
assert.equal(timeBand('2026-11-15T09:59:00Z'), 'afternoon'); // 17:59 KL
assert.equal(timeBand('2026-11-15T10:00:00Z'), 'evening'); // 18:00 KL
assert.equal(timeBand('2026-11-10T11:30:00Z'), 'evening'); // 19:30 KL
assert.equal(timeBand('2026-11-12T12:00:00Z'), 'evening'); // 20:00 KL

assert.equal(moneyMYR(108), 'RM108');
assert.equal(moneyMYR(107.8), 'RM107.80');
assert.equal(moneyMYR(160), 'RM160');

assert.equal(qtyLabel(1, 'pax'), '1 place');
assert.equal(qtyLabel(2, 'pax'), '2 places');
assert.equal(qtyLabel(1, 'pair'), '1 pair');
assert.equal(qtyLabel(2, 'pair'), '2 pairs');

assert.match(formatWhen('2026-11-15T07:00:00Z', '2026-11-15T09:30:00Z'), /15 Nov 2026/);
assert.match(formatWhen('2026-11-15T07:00:00Z', '2026-11-15T09:30:00Z'), /3:00/);
assert.match(formatWhen('2026-11-15T07:00:00Z', '2026-11-15T09:30:00Z'), /5:30/);

assert.equal(purchaseShouldFire('paid', 'stripe'), true);
assert.equal(purchaseShouldFire('paid', 'whatsapp'), true);
assert.equal(purchaseShouldFire('pending', 'whatsapp'), true);
assert.equal(purchaseShouldFire('pending', 'stripe'), false);
assert.equal(purchaseShouldFire('cancelled', 'whatsapp'), false);
assert.equal(purchaseShouldFire('rescheduled', 'stripe'), false);

const message = reserveMessage({
  public_code: 'SS-AB12CD',
  booking_id: '11111111-1111-1111-1111-111111111111',
  format_name: 'Canvas Night',
  when: 'Sun 15 Nov 2026, 3:00 pm–5:30 pm',
  room: 'L2 front room',
  qty_label: '2 places',
  amount_label: 'RM216',
  name: 'Amina Yusuf',
  phone: '0123456789',
  email: 'amina@example.com',
});
assert.match(message, /Booking ID: SS-AB12CD/);
assert.match(message, /Reference: 11111111-1111-1111-1111-111111111111/);
assert.match(message, /Canvas Night/);
assert.match(message, /L2 front room/);
assert.doesNotMatch(message, /sip and paint/i);
assert.doesNotMatch(message, /cheaper than/i);

const ics = icsCalendar({
  uid: 'SS-AB12CD@masterartist.co',
  starts: '2026-11-15T07:00:00Z',
  ends: '2026-11-15T09:30:00Z',
  summary: 'Canvas Night — Master Artist',
  location: 'L2 front room, Master Artist',
  description: 'Booking SS-AB12CD. Line\nbreak, and; semi',
});
assert.match(ics, /DTSTART:20261115T070000Z/);
assert.match(ics, /DTEND:20261115T093000Z/);
assert.match(ics, /DESCRIPTION:Booking SS-AB12CD\. Line\\nbreak\\, and\\; semi/);
assert.ok(ics.endsWith('\r\n'));

const ld = eventJsonLd({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Canvas Night',
  summary: 'Taught by working artists.',
  starts_at: '2026-11-15T07:00:00Z',
  ends_at: '2026-11-15T09:30:00Z',
  room: 'L2 front room',
  seats_left: 3,
  unit_price_myr: 108,
  image_path: '/golden-shores-workshop-1.jpg',
});
assert.equal(ld['@type'], 'Event');
assert.equal(ld.offers.priceCurrency, 'MYR');
assert.equal(ld.offers.price, '108.00');
assert.equal(ld.offers.availability, 'https://schema.org/InStock');
assert.match(ld.location.name, /room with the view/);
assert.equal(eventJsonLd({ ...ld, seats_left: 0, unit_price_myr: 98 }).offers.availability, 'https://schema.org/SoldOut');

assert.equal(STUDIO_WHATSAPP, '60102779426');
console.log('studio-booking tests ok');
