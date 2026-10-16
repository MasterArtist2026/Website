import assert from 'node:assert/strict';
import { firstTouch, refCode, withRef, ATTR_TTL_MS } from '../attribution.mjs';

const now = Date.parse('2026-10-16T00:00:00Z');

assert.equal(refCode({ fbclid: 'abc' }), 'FB');
assert.equal(refCode({ utm_source: 'Instagram' }), 'FB');
assert.equal(refCode({ utm_source: 'facebook_ads' }), 'FB');
assert.equal(refCode({ gclid: 'xyz' }), 'GG');
assert.equal(refCode({ utm_source: 'google' }), 'GG');
assert.equal(refCode({ utm_source: 'Google' }), 'GG');
assert.equal(refCode({}), 'WEB');
assert.equal(refCode({ utm_source: 'newsletter' }), 'WEB');
assert.equal(refCode({ fbclid: 'a', gclid: 'b', utm_source: 'google' }), 'GG');
assert.equal(refCode({ fbclid: 'a', gclid: 'b' }), 'FB');

assert.equal(withRef('Hi there', { fbclid: '1' }), 'Ref: FB\nHi there');
assert.equal(withRef('Ref: WEB\nHi there', { gclid: '1' }), 'Ref: GG\nHi there');
assert.equal(withRef('', {}), 'Ref: WEB');

const first = firstTouch({
  stored: null,
  now,
  search: '?utm_source=facebook&utm_medium=cpc&gclid=&fbclid=IwAR',
  landing: 'https://masterartist.co/music.html?utm_source=facebook&fbclid=IwAR',
  referrer: 'https://m.facebook.com/',
});
assert.equal(first.wrote, true);
assert.equal(first.touch.utm_source, 'facebook');
assert.equal(first.touch.utm_medium, 'cpc');
assert.equal(first.touch.fbclid, 'IwAR');
assert.equal(first.touch.expires, now + ATTR_TTL_MS);
assert.equal(refCode(first.touch), 'FB');

const again = firstTouch({
  stored: first.touch,
  now: now + 10 * 24 * 60 * 60 * 1000,
  search: '?utm_source=google&gclid=new',
  landing: 'https://masterartist.co/?gclid=new',
  referrer: 'https://www.google.com/',
});
assert.equal(again.wrote, false);
assert.equal(again.touch.utm_source, 'facebook');
assert.equal(again.touch.fbclid, 'IwAR');

const expired = firstTouch({
  stored: first.touch,
  now: now + ATTR_TTL_MS + 1,
  search: '?utm_source=google&gclid=later',
  landing: 'https://masterartist.co/pricing.html?gclid=later',
  referrer: '',
});
assert.equal(expired.wrote, true);
assert.equal(expired.touch.utm_source, 'google');
assert.equal(expired.touch.gclid, 'later');
assert.equal(expired.touch.landing_page, 'https://masterartist.co/pricing.html?gclid=later');
assert.equal(refCode(expired.touch), 'GG');

console.log('attribution tests passed');
