import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildPublicLead, needsFollowUp, postLead, repeatCustomer, workshopStats } from './lead-capture.mjs';

const hour = 60 * 60 * 1000;
const now = Date.parse('2026-11-02T00:00:00Z');

assert.equal(needsFollowUp({ stage: 'new', updated_at: new Date(now - 25 * hour).toISOString() }, now), true);
assert.equal(needsFollowUp({ stage: 'new', updated_at: new Date(now - 2 * hour).toISOString() }, now), false);
assert.equal(needsFollowUp({ stage: 'lost', updated_at: new Date(now - 48 * hour).toISOString() }, now), false);
assert.equal(needsFollowUp({ stage: 'paid', created_at: new Date(now - 48 * hour).toISOString() }, now), false);

assert.equal(repeatCustomer([{ status: 'paid' }, { status: 'attended' }]), true);
assert.equal(repeatCustomer([{ status: 'paid' }, { status: 'cancelled' }]), false);

const stats = workshopStats(
  { capacity: 8, ad_spend: 160 },
  [
    { status: 'paid', seats: 2, price_paid: 200 },
    { status: 'cancelled', seats: 1, price_paid: 100 },
    { status: 'reserved', seats: 1, price_paid: 0 },
  ],
);
assert.equal(stats.seats, 3);
assert.equal(stats.revenue, 200);
assert.equal(stats.adCostPerBooking, 160 / 3);

const bad = buildPublicLead({ name: '', phone: '0123456789', source: 'trial_form' });
assert.equal(bad.ok, false);

const good = buildPublicLead({
  name: 'Alya',
  phone: '012-345 6789',
  email: '',
  interest: 'Textured canvas painting',
  childAge: '7–9',
  message: 'Sunday if possible',
  source: 'workshop_form',
  sourcePage: '/workshops.html',
  touch: { utm_source: 'google', gclid: 'abc', landing_page: 'https://masterartist.co/workshops.html', referrer: '' },
});
assert.equal(good.ok, true);
assert.equal(good.row.source, 'workshop_form');
assert.equal(good.row.email, null);
assert.equal(good.row.gclid, 'abc');
assert.equal(good.row.stage, undefined);
assert.equal(buildPublicLead({ name: 'A', phone: '0123456789', source: 'whatsapp' }).ok, false);

let posted = null;
const saved = await postLead({
  endpoint: 'https://example.test/leads',
  anonKey: 'anon',
  row: good.row,
  fetchImpl: async (url, init) => {
    posted = { url, init };
    return { status: 201, json: async () => ({}) };
  },
});
assert.equal(saved.ok, true);
assert.equal(posted.init.keepalive, true);
assert.equal(posted.init.headers.Prefer, 'return=minimal');
assert.equal(JSON.parse(posted.init.body).name, 'Alya');

const failed = await postLead({
  endpoint: 'https://example.test/leads',
  anonKey: 'anon',
  row: good.row,
  fetchImpl: async () => ({ status: 401, json: async () => ({ message: 'nope' }) }),
});
assert.equal(failed.ok, false);
assert.equal(failed.message, 'nope');

const context = {
  window: {},
  navigator: { sendBeacon() { return true; } },
  fetch() { return Promise.resolve(); },
  HTMLImageElement: function HTMLImageElement() {},
  XMLHttpRequest: function XMLHttpRequest() {},
  Response,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  Date,
  Object,
  Promise,
  console,
};
context.window = context;
context.HTMLImageElement.prototype = {};
context.XMLHttpRequest.prototype = { open() {}, send() {} };
Object.defineProperty(context.HTMLImageElement.prototype, 'src', { set() {}, configurable: true });
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('./lead-gate.js', import.meta.url), 'utf8'), context);
const judge = context.__maJudgeLeadHit;

let state = { nonce: '', allowance: 0, armedLabel: '', armUsed: false, counts: {} };
let hit = judge('https://www.google-analytics.com/g/collect?en=generate_lead', '', state);
assert.equal(hit.block, true, 'page-view copies are dropped');

state = { nonce: 'abc', allowance: 1, armedLabel: '', armUsed: false, counts: {} };
hit = judge('https://www.google-analytics.com/g/collect?en=generate_lead&ep.lead_source=page', 'en=generate_lead&ep.lead_source=page', state);
assert.equal(hit.block, true, 'readable copy without the nonce is dropped');
assert.equal(hit.state.nonce, 'abc');
hit = judge('https://www.google-analytics.com/g/collect?en=generate_lead&ep.lead_nonce=abc', '', hit.state);
assert.equal(hit.block, false, 'the real hit passes once');
hit = judge('https://www.google-analytics.com/g/collect?en=generate_lead&ep.lead_nonce=abc', '', hit.state);
assert.equal(hit.block, true, 'a second generate_lead is dropped');

state = { nonce: '', allowance: 0, armedLabel: '', armUsed: false, counts: {} };
for (let i = 0; i < 11; i++) {
  hit = judge('https://www.googleadservices.com/pagead/conversion/1/?label=AW-1/textured', '', state);
  state = hit.state;
  assert.equal(hit.block, i !== 0, 'conversion ' + i);
}
state.armedLabel = 'AW-1/textured';
state.armUsed = false;
hit = judge('https://www.google-analytics.com/g/collect?en=conversion&send_to=AW-1/textured', '', state);
assert.equal(hit.block, false, 'an armed form conversion still sends');
hit = judge('https://www.google-analytics.com/g/collect?en=conversion&send_to=AW-1/textured', '', hit.state);
assert.equal(hit.block, true, 'the armed label cannot double-fire');

console.log('lead capture tests passed');
