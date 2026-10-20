/* Master Artist — shared site script.
   Every page loads this one module. Each renderer only runs when its target
   element exists on the page, and only the Supabase views that page needs are
   fetched. All reads use public, read-only views, so the anon key is safe here. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { firstTouch, refCode, withRef } from './attribution.mjs';
import {
  STUDIO_WHATSAPP, formatWhen, moneyMYR, qtyLabel, reserveMessage, icsCalendar,
  purchaseShouldFire, eventJsonLd, timeBand, seatsBadge,
} from './studio-booking.mjs';

const SUPABASE_URL  = 'https://fudaosneozobacdalncv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZGFvc25lb3pvYmFjZGFsbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTIwNDUsImV4cCI6MjEwMjQ2ODA0NX0.0PKbkncE8goPg-iJlAUacNUa3MjWJSj1ZLeqTpkqPZ0';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* WhatsApp number used until site_settings loads (and if it never does). */
let waDigits = '60102779426';

/* Google Ads conversions. GA4 (G-2X9E7MWMWM) is linked to AW-18457946758.
   send_to is the full label from Google Ads → Goals → Conversions → Tag setup.
   The trial-form conversion is the RM50 trial (value 50, currency MYR).
   Set a label to '' to switch that conversion off. */
const GOOGLE_ADS_LABELS = {
  trial_form: 'AW-18457946758/YaQtCP7vkp8dEIbVt-FE',
  whatsapp:   'AW-18457946758/3h9QCIHwkp8dEIbVt-FE',
  // Studio Sessions purchase. Paste the label from Google Ads → Goals →
  // Conversions → Tag setup. Empty skips the Ads hit; the GA4 purchase still fires.
  workshop_purchase: '',
};

/* First-touch campaign details, kept for 90 days. Captured once per browser. */
const ATTR_KEY = 'ma_first_touch';
function currentTouch() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(ATTR_KEY) || 'null'); }
  catch { stored = null; }
  const { touch, wrote } = firstTouch({
    stored,
    now: Date.now(),
    search: location.search,
    landing: location.href.split('#')[0],
    referrer: document.referrer || '',
  });
  if (wrote) {
    try { localStorage.setItem(ATTR_KEY, JSON.stringify(touch)); } catch { /* private mode */ }
  }
  return touch;
}
const touch = currentTouch();
const blank = v => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

/* Google reviews come from the "google-reviews" Supabase Edge Function
   (supabase/functions/google-reviews). The Google API key lives only in
   Supabase's secrets — never in this file. */
const GOOGLE_REVIEWS_ON  = true;
const GOOGLE_PROFILE_URL = 'https://www.google.com/maps/place/Master+Artist/@3.1624067,101.6486298,17z/data=!4m6!3m5!1s0x31cc49005b1494ff:0xf62cc7d031e9047f!8m2!3d3.1624067!4d101.6486298!16s%2Fg%2F11m5plgbv3';

/* ---------------------------------------------------------------- helpers */
async function q(builder) {
  try {
    const { data, error } = await builder;
    if (error) { console.warn('[site]', error.message); return null; }
    return data;
  } catch (e) { console.warn('[site]', e); return null; }
}

function waLink(text) {
  return 'https://wa.me/' + waDigits + '?text=' + encodeURIComponent(withRef(text, touch));
}

function applyWhatsApp() {
  document.querySelectorAll('[data-wa]').forEach(a => {
    a.href = waLink(a.dataset.waText || '');
    a.target = '_blank';
    a.rel = 'noopener';
  });
  // Plain wa.me links (privacy, terms) get the same ref prefix.
  document.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
    if (a.hasAttribute('data-wa')) return;
    let existing = '';
    try { existing = new URL(a.href, location.href).searchParams.get('text') || ''; }
    catch { existing = ''; }
    a.href = waLink(existing);
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return ''; }
}

function realStat(v) { return v != null && String(v).trim() !== '' && !/tbc/i.test(String(v)); }

/* ------------------------------------------------------------- mobile menu */
(function initBurgerMenu() {
  const btn = $('burgerBtn'), menu = $('navDropdown');
  if (!btn || !menu) return;
  const open = () => { menu.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { menu.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); };
  const isOpen = () => menu.classList.contains('is-open');
  btn.addEventListener('click', e => { e.stopPropagation(); isOpen() ? close() : open(); });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('click', e => { if (isOpen() && !menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { close(); btn.focus(); } });
})();

/* --------------------------------- generic rotator (banner + hero photos) */
function rotator(items, dotHost, dotClass, interval, hoverHost, slide) {
  if (!items.length) return;
  let i = 0, timer = null; const dots = [];
  if (dotHost && items.length > 1) {
    items.forEach((_, n) => {
      const d = document.createElement('button');
      d.className = dotClass + (n === 0 ? ' is-on' : '');
      d.setAttribute('aria-label', 'Show item ' + (n + 1));
      d.addEventListener('click', () => { go(n); restart(); });
      dotHost.appendChild(d); dots.push(d);
    });
  }
  function go(n) {
    n = (n + items.length) % items.length;
    if (n === i) return;
    const fwd = ((n - i + items.length) % items.length) <= (items.length / 2);
    const prev = items[i], next = items[n];
    if (slide) {
      prev.classList.remove('is-on'); prev.classList.toggle('back', !fwd); prev.classList.add('is-out');
      next.classList.remove('is-out'); next.classList.toggle('back', !fwd);
      void next.offsetWidth; next.classList.add('is-on');
    } else { prev.classList.remove('is-on'); next.classList.add('is-on'); }
    if (dots[i]) dots[i].classList.remove('is-on');
    if (dots[n]) dots[n].classList.add('is-on');
    i = n;
  }
  const start = () => { if (!reduce && items.length > 1) timer = setInterval(() => go(i + 1), interval); };
  const stop = () => clearInterval(timer);
  const restart = () => { stop(); start(); };
  if (hoverHost) {
    hoverHost.addEventListener('mouseenter', stop); hoverHost.addEventListener('mouseleave', start);
    hoverHost.addEventListener('focusin', stop); hoverHost.addEventListener('focusout', start);
  }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : restart(); });
  start();
}

/* ---------------------------------------------------------------- lightbox
   Delegated, so photos injected later by renderers work too. Any image with
   data-lightbox-group="x" opens and pages through its group. */
(function initLightbox() {
  const overlay = $('lightbox');
  if (!overlay) return;
  const imgEl = overlay.querySelector('img'), countEl = overlay.querySelector('.lightbox-count');
  const prevBtn = overlay.querySelector('.lightbox-prev'), nextBtn = overlay.querySelector('.lightbox-next');
  let group = [], idx = 0;
  function show(i) {
    idx = (i + group.length) % group.length;
    imgEl.src = group[idx].src; imgEl.alt = group[idx].alt || '';
    const cap = group[idx].alt || '';
    countEl.textContent = [cap, group.length > 1 ? (idx + 1) + ' / ' + group.length : ''].filter(Boolean).join('  ·  ');
    prevBtn.style.display = nextBtn.style.display = group.length > 1 ? '' : 'none';
  }
  const close = () => { overlay.classList.remove('is-open'); document.body.style.overflow = ''; };
  document.addEventListener('click', e => {
    const img = e.target.closest && e.target.closest('[data-lightbox-group]');
    if (!img) return;
    group = [...document.querySelectorAll('[data-lightbox-group="' + img.dataset.lightboxGroup + '"]')];
    show(group.indexOf(img));
    overlay.classList.add('is-open'); document.body.style.overflow = 'hidden';
  });
  overlay.querySelector('.lightbox-close').addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(idx - 1));
  nextBtn.addEventListener('click', () => show(idx + 1));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
})();

/* ---------------------------------------------------------------- tracking
   One place that reports conversions to GA4, Google Ads and the Meta Pixel.
   Each call is wrapped so a blocked tracker can never break the page. */
// WhatsApp opens in a new tab, so this page stays open and the event always
// has time to send — no delayed-navigation helper is needed.
function adsLead(source, where) {
  const label = GOOGLE_ADS_LABELS[source];
  if (!label || !window.gtag) return;
  // beacon transport survives a tab switch or unload, same as before.
  const payload = { send_to: label, link_location: where, transport_type: 'beacon' };
  if (source === 'trial_form') {
    payload.value = 50;
    payload.currency = 'MYR';
  }
  try {
    gtag('event', 'conversion', payload);
  } catch { /* a blocked tag must not break the page */ }
}

// The Google tag copies every page_view on this domain into generate_lead.
// The head snippet drops those hits unless a save has just opened this window.
function allowLeadHit() {
  window.__allowGenerateLead = (window.__allowGenerateLead || 0) + 1;
  setTimeout(() => {
    window.__allowGenerateLead = Math.max(0, (window.__allowGenerateLead || 1) - 1);
  }, 2000);
}

function track(kind, detail) {
  const where = detail.where || '';
  if (kind === 'trial') {
    allowLeadHit();
    try { window.fbq && fbq('track', 'Lead', { content_name: detail.programme || 'Trial class' }); } catch {}
    try { window.gtag && gtag('event', 'generate_lead', { programme: detail.programme || '', link_location: where, value: 50, currency: 'MYR', transport_type: 'beacon' }); } catch {}
    adsLead('trial_form', where);
  } else if (kind === 'whatsapp') {
    try { window.fbq && fbq('track', 'Contact', { content_name: where }); } catch {}
    try { window.gtag && gtag('event', 'whatsapp_click', { link_location: where, page: location.pathname, transport_type: 'beacon' }); } catch {}
    adsLead('whatsapp', where);
  }
}

// Which part of the page a click came from, e.g. "floating-button", "orchestra", "footer"
function placeOf(el) {
  if (el.id === 'fabWhatsapp') return 'floating-button';
  if (el.closest('footer')) return 'footer';
  const sec = el.closest('[id]');
  return sec ? sec.id : 'page';
}

// Every WhatsApp link on the site (buttons, footer, floating button)
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href*="wa.me/"]');
  if (a) track('whatsapp', { where: placeOf(a) });
}, true);

/* -------------------------------------------------------------- trial form
   The form inserts a row into public.trial_leads. generate_lead and the Ads
   conversion fire only after that insert succeeds. WhatsApp then opens so the
   family can send the same details. A failed save does not count as a lead. */
const PROGRAMME_SLUGS = {
  'Voice with Sabrina Hew': 'voice',
  'Group Voice': 'group-voice',
  'Piano & Instruments': 'piano',
  'Mont Kiara Orchestra': 'orchestra',
  'Art — Young Kids (4–8)': 'art-young-kids',
  'Art — Older Kids (9–15)': 'art-older-kids',
  'Graphic Design (10+)': 'graphic-design',
  'Photography': 'photography',
  'Videography & Film': 'videography',
  'Adult Art (mornings)': 'adult-art',
  'Adult Voice & Piano (mornings)': 'adult-voice-piano',
  'Baking workshop': 'baking-workshop',
  'Painting workshop': 'painting-workshop',
  'Craft workshop': 'craft-workshop',
  'Not sure yet': 'not-sure',
};

function programmeSlug(label) {
  if (PROGRAMME_SLUGS[label]) return PROGRAMME_SLUGS[label];
  const slug = String(label || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

// anon can INSERT these columns only. id, created_at and status stay off the
// payload so Postgres fills them. Prefer: return=minimal, because asking
// PostgREST to return the row needs SELECT and anon does not have it.
async function insertTrialLead(row) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/trial_leads', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (res.status === 201 || res.status === 204) return { ok: true };
  let message = 'HTTP ' + res.status;
  try {
    const body = await res.json();
    if (body && body.message) message = body.message;
  } catch { /* empty body */ }
  return { ok: false, message };
}

function formNote(form, kind, html) {
  let el = form.querySelector('.' + kind);
  if (!el) {
    el = document.createElement('p');
    el.className = 'full ' + kind;
    const fine = form.querySelector('.fine');
    if (fine) fine.before(el); else form.appendChild(el);
  }
  el.innerHTML = html;
  return el;
}

function addContactFields(form, n) {
  if (form.querySelector('[name="phone"]')) return;
  const nameField = form.querySelector('[name="name"]');
  const host = nameField ? nameField.closest('div') : null;
  const block = document.createElement('div');
  block.className = 'full lead-contact';
  block.innerHTML =
    '<div><label for="tf-phone-' + n + '">Phone / WhatsApp</label>' +
    '<input id="tf-phone-' + n + '" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="40"></div>' +
    '<div><label for="tf-email-' + n + '">Email <span style="font-weight:400;color:var(--muted)">(optional)</span></label>' +
    '<input id="tf-email-' + n + '" name="email" type="email" autocomplete="email" maxlength="320"></div>';
  if (host) host.insertAdjacentElement('afterend', block);
  else form.prepend(block);
}

(function initTrialForms() {
  const params = new URLSearchParams(location.search);
  document.querySelectorAll('form.trial-form').forEach((form, n) => {
    addContactFields(form, n);
    const pick = params.get('programme');
    const sel = form.querySelector('[name=programme]');
    if (sel && pick && [...sel.options].some(o => o.value === pick)) sel.value = pick;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.dataset.sending === '1' || form.classList.contains('sent')) return;
      const f = Object.fromEntries(new FormData(form));
      const name = String(f.name || '').trim();
      const phone = String(f.phone || '').trim();
      const email = String(f.email || '').trim();
      const phoneDigits = phone.replace(/\D/g, '');
      if (name.length < 1 || name.length > 120) {
        form.classList.add('failed');
        formNote(form, 'err', 'Please add your name.');
        return;
      }
      if (phoneDigits.length < 8 || phoneDigits.length > 15 || !/^[0-9+(). -]+$/.test(phone)) {
        form.classList.add('failed');
        formNote(form, 'err', 'Please add a phone number we can WhatsApp.');
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        form.classList.add('failed');
        formNote(form, 'err', 'Please check the email address, or leave it blank.');
        return;
      }
      const note = [];
      if (f.day && f.day !== 'Any day') note.push('Preferred day: ' + f.day);
      if (f.message && String(f.message).trim()) note.push(String(f.message).trim());
      const programme = f.programme || '';
      const row = {
        parent_name: name,
        phone,
        email: blank(email),
        child_age: blank(f.age),
        programme_slug: programmeSlug(programme),
        message: blank(note.join('\n\n')),
        ref_code: refCode(touch),
        utm_source: blank(touch.utm_source),
        utm_medium: blank(touch.utm_medium),
        utm_campaign: blank(touch.utm_campaign),
        utm_term: blank(touch.utm_term),
        utm_content: blank(touch.utm_content),
        gclid: blank(touch.gclid),
        fbclid: blank(touch.fbclid),
        landing_page: blank(touch.landing_page),
        referrer: blank(touch.referrer),
      };
      const lines = [
        "Hi Master Artist! I'd like to book a RM50 trial class.",
        '',
        'Name: ' + name,
        'Phone: ' + phone,
        "Student's age: " + (f.age || '-'),
        'Programme: ' + (programme || '-'),
        'Preferred day: ' + (f.day || '-'),
      ];
      if (email) lines.push('Email: ' + email);
      if (f.message && String(f.message).trim()) lines.push('', String(f.message).trim());
      const btn = form.querySelector('[type=submit]');
      const label = btn ? btn.textContent : '';
      form.dataset.sending = '1';
      form.classList.remove('failed');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      let saved = { ok: false, message: 'The save did not finish.' };
      try { saved = await insertTrialLead(row); }
      catch (err) { saved = { ok: false, message: err && err.message }; }
      form.dataset.sending = '';
      if (!saved.ok) {
        console.warn('[site] trial lead', saved.message);
        if (btn) { btn.disabled = false; btn.textContent = label; }
        form.classList.add('failed');
        formNote(form, 'err', 'We could not save your enquiry just now. <a href="' + esc(waLink(lines.join('\n'))) + '" target="_blank" rel="noopener">Message us on WhatsApp</a> and we will take it from there.');
        return;
      }
      track('trial', { programme, where: placeOf(form) });
      window.open(waLink(lines.join('\n')), '_blank', 'noopener');
      form.classList.add('sent');
      if (btn) btn.textContent = 'Sent';
    });
  });
  // "Book this class" buttons pre-select the programme in the nearest form
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-pick]');
    if (!a) return;
    document.querySelectorAll('form.trial-form [name=programme]').forEach(sel => {
      if ([...sel.options].some(o => o.value === a.dataset.pick)) sel.value = a.dataset.pick;
    });
  });
})();

/* =============================================================== renderers */
function renderBanner(rows) {
  const wrap = $('announce');
  if (!wrap) return;
  if (!rows || !rows.length) { wrap.style.display = 'none'; return; }
  const track = $('annTrack');
  track.innerHTML = rows.map((b, n) => `
    <a class="ann-item${n === 0 ? ' is-on' : ''}" href="${esc(b.link || '#trial')}">
      ${b.tag ? `<span class="tag">${esc(b.tag)}</span>` : ''}
      <span>${esc(b.message)}</span>
      <span class="go">${b.link ? 'View' : ''}</span>
    </a>`).join('');
  rotator([...track.querySelectorAll('.ann-item')], $('annDots'), 'ann-dot', 5200, wrap, true);
}

function renderSettings(s) {
  if (!s) return;
  if (s.whatsapp) {
    const d = s.whatsapp.replace(/[^0-9]/g, '');
    if (d) waDigits = d;
  }
  applyWhatsApp();
  const set = (id, v) => { const el = $(id); if (el && v) el.textContent = v; };
  set('visitAddress', s.address); set('fAddress', s.address);
  set('visitHours', s.opening_hours); set('fHours', s.opening_hours);
  set('visitWhatsapp', s.whatsapp); set('fWhatsapp', s.whatsapp);
  set('visitEmail', s.email);
  const dir = $('visitDirections');
  if (dir && s.maps_url) dir.href = s.maps_url;
  const map = $('visitMap');
  if (map && s.map_lat != null && s.map_lng != null) {
    const qy = s.map_lat + ',' + s.map_lng;
    map.innerHTML = `<iframe src="https://maps.google.com/maps?q=${encodeURIComponent(qy)}&z=16&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Studio location map"></iframe>`;
  }
  // Stats only appear once real numbers are entered in the admin panel.
  [['statStudents', s.stat_students], ['statRatio', s.stat_ratio]].forEach(([id, v]) => {
    const el = $(id);
    if (el && realStat(v)) { el.textContent = v; el.closest('.stat').hidden = false; }
  });
}

function renderHero(h, photos) {
  if (h) {
    if (h.eyebrow) $('heroEyebrow').textContent = h.eyebrow;
    if (h.headline) $('heroHeadline').innerHTML = esc(h.headline) + (h.emphasis ? ' <em>' + esc(h.emphasis) + '</em>' : '');
    if (h.lede) $('heroLede').textContent = h.lede;
    if (h.cta_primary) $('heroCtaPrimary').textContent = h.cta_primary;
    if (h.note) $('heroNote').textContent = h.note;
  }
  const host = $('heroSlides');
  if (photos && photos.length) {
    // The first photo is built into the page as a compressed, preloaded copy
    // (data-db-src says which admin photo it stands in for); add the rest.
    const dots = $('heroDots');
    const built = new Set([...host.querySelectorAll('.hslide[data-db-src]')].map(el => el.dataset.dbSrc));
    host.querySelectorAll('.hslide:not([data-db-src])').forEach(el => el.remove());
    photos.filter(p => !built.has(p.image_path)).forEach(p => {
      const div = document.createElement('div');
      div.className = 'hslide' + (host.querySelector('.hslide') ? '' : ' is-on');
      div.innerHTML = `<img src="${esc(p.image_path)}" alt="${esc(p.alt_text)}" loading="lazy">`;
      host.insertBefore(div, dots);
    });
  }
  rotator([...host.querySelectorAll('.hslide')], $('heroDots'), 'hdot', 6000, host, false);
}

/* Programme cards and prices are written into the pages directly (from the
   Master Artist price list), so the admin Programmes/Fees sections no longer
   drive them. Timetables, gallery, teachers and the hero still come from admin. */

/* Timetable: classes from the admin panel, plus any fixed sessions listed in a
   <script type="application/json" data-extra> next to the timetable (used for
   the Mont Kiara Orchestra). */
function renderSchedule(rows) {
  const host = $('schedList');
  if (!host) return;
  const only = (host.dataset.programmes || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = (rows || []).filter(c => !only.length || only.includes(c.programme_slug)).map(c => ({
    day: c.day_of_week, start: c.start_time, end: c.end_time, name: c.programme_name,
    who: [c.age_range, c.teacher_name].filter(Boolean).join(' · ')
  }));
  const extraEl = host.parentElement.querySelector('script[data-extra]');
  if (extraEl) { try { list.push(...JSON.parse(extraEl.textContent)); } catch (e) { console.warn('[site] bad timetable extras', e); } }
  if (!list.length) return; // keep the static fallback text
  const toMin = t => { const m = String(t || '').match(/(\d+)(?::(\d+))?\s*(am|pm)?/i); if (!m) return 0; let h = +m[1] % 12; if (/pm/i.test(m[3] || '')) h += 12; return h * 60 + (+m[2] || 0); };
  const byDay = {};
  list.forEach(c => (byDay[c.day] = byDay[c.day] || []).push(c));
  host.innerHTML = DAYS.filter(d => byDay[d]).map(day => `
    <div class="sched-day">
      <h3>${esc(day)}</h3>
      ${byDay[day].sort((x, y) => toMin(x.start) - toMin(y.start)).map(c => `
        <div class="sched-row">
          <span class="time">${esc(c.start)}${c.end ? '–' + esc(c.end) : ''}</span>
          <span class="what">${esc(c.name || '')}</span>
          <span class="who">${esc(c.who || '')}</span>
        </div>`).join('')}
    </div>`).join('');
}

/* Gallery: optional filter tabs (data-filters) by programme, captions on
   every photo and in the full-size view. */
function renderGallery(rows, programmes) {
  const grid = $('galGrid');
  if (!grid) return;
  const limit = parseInt(grid.dataset.limit || '0', 10);
  if (rows && rows.length) {
    const progName = Object.fromEntries((programmes || []).map(p => [p.id, p.name]));
    const list = limit ? rows.slice(0, limit) : rows;
    grid.innerHTML = list.map(g => `
      <figure class="gal" data-prog="${esc(progName[g.programme_id] || '')}">
        ${g.image_path ? `<img src="${esc(/^(https?:)?\/\//.test(g.image_path) || g.image_path.startsWith('/') ? g.image_path : '/' + g.image_path)}" alt="${esc(g.caption || '')}" loading="lazy" data-lightbox-group="gallery">` : esc(g.caption || 'Student work')}
        ${g.caption && g.image_path ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}
      </figure>`).join('');
    const tabs = $('galTabs');
    if (tabs && grid.dataset.filters !== undefined) {
      const names = [...new Set(list.map(g => progName[g.programme_id]).filter(Boolean))];
      if (names.length > 1) {
        tabs.innerHTML = ['All', ...names].map((n, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-f="${i === 0 ? '' : esc(n)}">${esc(n)}</button>`).join('');
        tabs.hidden = false;
        tabs.addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b) return;
          tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          grid.querySelectorAll('.gal:not(.gal-brand)').forEach(el => {
            const show = !b.dataset.f || el.dataset.prog === b.dataset.f;
            el.hidden = !show;
            const img = el.querySelector('img'); if (img) img.dataset.lightboxGroup = show ? 'gallery' : 'gallery-off';
          });
          placeBrandTile(grid);
        });
      }
    }
  }
  placeBrandTile(grid);
}

// Fills the leftover space in the gallery's last row with the Master Artist
// mark, so the grid never ends on an empty strip. Recomputed on resize.
function placeBrandTile(grid) {
  let tile = $('galBrand');
  if (!tile) {
    tile = document.createElement('div');
    tile.id = 'galBrand'; tile.className = 'gal gal-brand';
    tile.innerHTML = '<img class="brand-mark" src="/logo.svg" alt="Master Artist logo"><span>Master Artist</span>';
  }
  grid.appendChild(tile);
  const count = grid.querySelectorAll('.gal:not(.gal-brand):not([hidden])').length;
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const rem = count % cols;
  tile.style.gridColumn = `span ${Math.max(1, Math.min(rem === 0 ? cols : cols - rem, cols))}`;
}
let brandT;
window.addEventListener('resize', () => {
  clearTimeout(brandT);
  brandT = setTimeout(() => { const g = $('galGrid'); if (g && $('galBrand')) placeBrandTile(g); }, 150);
});

// Text typed in the admin panel sometimes uses "--" or " - " for dashes.
const tidy = s => String(s || '').replace(/\s*--\s*/g, ' — ').replace(/\s+-\s+/g, ' — ');

function renderTeachers(rows) {
  const sec = $('teachers');
  if (!sec || !rows || !rows.length) return; // stays hidden until real teachers exist
  sec.hidden = false; sec.style.display = '';
  $('teachGrid').innerHTML = rows.map(t => `
    <div class="teach">
      ${t.image_path
        ? `<img class="photo" src="${esc(t.image_path)}" alt="${esc(t.full_name)}" loading="lazy">`
        : `<div class="photo">${esc((t.full_name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</div>`}
      <h3>${esc(t.full_name)}</h3>
      ${t.role_title ? `<span class="role">${esc(tidy(t.role_title))}</span>` : ''}
      <p>${esc(tidy(t.bio))}</p>
    </div>`).join('');
}

const G_LOGO = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
const stars = n => '<span class="stars" aria-label="' + n + ' out of 5 stars">' + '★'.repeat(Math.round(n)) + '<span class="off">' + '★'.repeat(5 - Math.round(n)) + '</span></span>';

/* Hand-picked quotes from the admin panel. Put "Google review" in the note
   field to show a Google badge on a quote copied from Google. */
function renderTestimonials(rows) {
  const sec = $('quotes'), grid = $('qGrid');
  if (!sec || !grid || !rows || !rows.length) return; // hidden until real quotes are added
  grid.innerHTML = rows.map(t => {
    const fromGoogle = /google/i.test(t.author_note || '');
    return `
    <figure class="q">
      <span class="mark">&ldquo;</span>
      <blockquote><p>${esc(t.quote)}</p></blockquote>
      <figcaption><cite>${esc(t.author_name || '')}${t.author_note ? ' · ' + esc(t.author_note) : ''}</cite>${fromGoogle ? `<a class="g-src" href="${GOOGLE_PROFILE_URL}" target="_blank" rel="noopener">${G_LOGO}</a>` : ''}</figcaption>
    </figure>`;
  }).join('');
  sec.hidden = false;
}

/* Live Google rating + up to 5 reviews (Google chooses which). Shown with the
   reviewer's name, photo, date and Google attribution, as Google requires. */
async function renderGoogleReviews() {
  const host = $('gReviews');
  if (!host || !GOOGLE_REVIEWS_ON) return;
  try {
    const { data: place, error } = await sb.functions.invoke('google-reviews');
    if (error || !place) { console.warn('[site] Google reviews unavailable:', error && error.message); return; }
    const reviews = (place.reviews || []).filter(r => r.text);
    if (!place.rating && !reviews.length) return;
    const profile = place.googleMapsUri || GOOGLE_PROFILE_URL;
    const writeUrl = 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(place.placeId || '');
    host.innerHTML = `
      <div class="g-head">
        ${G_LOGO}
        <div class="g-score">
          <b>${Number(place.rating || 0).toFixed(1)}</b> ${stars(place.rating || 0)}
          <span>${place.userRatingCount ? place.userRatingCount + ' Google review' + (place.userRatingCount === 1 ? '' : 's') : 'Google reviews'}</span>
        </div>
        <div class="g-actions">
          <a class="btn btn-ghost-dark btn-sm" href="${esc(profile)}" target="_blank" rel="noopener">Read all reviews</a>
          <a class="btn btn-purple btn-sm" href="${esc(writeUrl)}" target="_blank" rel="noopener">Write a review</a>
        </div>
      </div>
      ${reviews.length ? `<div class="g-grid">${reviews.map(r => {
        const name = esc(r.author || 'Google user');
        return `
        <figure class="g-review">
          <figcaption>
            ${r.authorPhoto ? `<img src="${esc(r.authorPhoto)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="g-av">${name.slice(0, 1)}</span>`}
            <span><b>${r.authorUri ? `<a href="${esc(r.authorUri)}" target="_blank" rel="noopener">${name}</a>` : name}</b><small>${esc(r.when || fmtDate(r.publishTime))}</small></span>
          </figcaption>
          ${stars(r.rating || 0)}
          <blockquote><p>${esc(r.text)}</p></blockquote>
          <span class="g-posted">${G_LOGO} Posted on Google</span>
        </figure>`;
      }).join('')}</div>` : ''}`;
    host.hidden = false;
    $('quotes').hidden = false;
  } catch (e) {
    console.warn('[site] Google reviews unavailable:', e);
  }
}

/* ------------------------------------------------------------------- blog */
function postCard(p) {
  return `
  <a class="post-card" href="/blog/${encodeURIComponent(p.slug)}.html">
    ${p.cover_image
      ? `<img class="cover" src="${esc(p.cover_image)}" alt="${esc(p.cover_alt || '')}" loading="lazy">`
      : `<div class="cover ph"><img src="/logo.svg" alt=""></div>`}
    <div class="meta">${esc(fmtDate(p.published_at))}${p.tags && p.tags.length ? ' · ' + esc(p.tags[0]) : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.excerpt || '')}</p>
    <span class="more">Read article</span>
  </a>`;
}

function mergePosts(local, remote) {
  const remoteList = Array.isArray(remote) ? remote : [];
  const seen = new Set(remoteList.map(p => p.slug));
  const extra = (Array.isArray(local) ? local : []).filter(p => p && p.slug && !seen.has(p.slug));
  return [...remoteList, ...extra].sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
}

async function localBlogPosts() {
  try {
    const res = await fetch('/content/blog/manifest.json');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function renderBlogList(rows) {
  const grid = $('blogGrid');
  if (!grid) return;
  const teaser = $('blogTeaser');
  if (!rows || !rows.length) {
    if (teaser) { teaser.hidden = true; return; }
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>First articles coming soon</h3><p>Tips for parents, student stories and news from the studio will appear here.</p></div>`;
    return;
  }
  if (teaser) teaser.hidden = false;
  const limit = parseInt(grid.dataset.limit || '0', 10);
  const list = limit ? rows.slice(0, limit) : rows;
  const tagsHost = $('blogTags');
  const draw = tag => {
    const shown = tag ? list.filter(p => (p.tags || []).includes(tag)) : list;
    grid.innerHTML = shown.map(postCard).join('');
  };
  if (tagsHost) {
    const tags = [...new Set(list.flatMap(p => p.tags || []))].slice(0, 12);
    if (tags.length) {
      tagsHost.innerHTML = ['All', ...tags].map((t, n) => `<button type="button" class="${n === 0 ? 'on' : ''}" data-tag="${n === 0 ? '' : esc(t)}">${esc(t)}</button>`).join('');
      tagsHost.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        tagsHost.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        draw(b.dataset.tag);
      });
    }
  }
  draw('');
}

function setMeta(name, content, attr = 'name') {
  let m = document.querySelector(`meta[${attr}="${name}"]`);
  if (!m) { m = document.createElement('meta'); m.setAttribute(attr, name); document.head.appendChild(m); }
  m.setAttribute('content', content);
}

function renderPost(p, more) {
  const host = $('post');
  if (!host) return;
  if (!p) {
    $('postTitle').textContent = 'Article not found';
    $('postMeta').textContent = '';
    host.innerHTML = `<div class="empty"><h3>This article isn't available</h3><p>It may have been moved or unpublished. <a href="/blog.html" style="color:var(--purple);font-weight:600">See all articles</a>.</p></div>`;
    return;
  }
  const url = 'https://masterartist.co/blog/' + encodeURIComponent(p.slug) + '.html';
  const desc = p.seo_description || p.excerpt || '';
  document.title = p.title + ' — Master Artist';
  setMeta('description', desc);
  setMeta('og:title', p.title, 'property');
  setMeta('og:description', desc, 'property');
  setMeta('og:type', 'article', 'property');
  setMeta('og:url', url, 'property');
  if (p.cover_image) setMeta('og:image', new URL(p.cover_image, location.href).href, 'property');
  const canon = document.querySelector('link[rel=canonical]');
  if (canon) canon.href = url;
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc,
    datePublished: p.published_at, dateModified: p.updated_at || p.published_at,
    author: { '@type': 'Organization', name: p.author || 'Master Artist' },
    publisher: { '@type': 'Organization', name: 'Master Artist', logo: { '@type': 'ImageObject', url: 'https://masterartist.co/logo.svg' } },
    image: p.cover_image ? new URL(p.cover_image, location.href).href : undefined, mainEntityOfPage: url
  });
  document.head.appendChild(ld);

  $('postTitle').textContent = p.title;
  $('postCrumb').textContent = p.title;
  $('postMeta').innerHTML = [esc(fmtDate(p.published_at)), esc(p.author || 'Master Artist'), ...(p.tags || []).slice(0, 3).map(esc)].filter(Boolean).map(x => `<span>${x}</span>`).join('');

  // Post bodies come from the blog automation, so they are sanitised before
  // being inserted. If the sanitiser failed to load, fall back to plain text.
  const body = window.DOMPurify
    ? window.DOMPurify.sanitize(p.body_html || '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'iframe'], FORBID_ATTR: ['style'] })
    : null;
  host.innerHTML = `
    ${p.cover_image ? `<img class="cover" src="${esc(p.cover_image)}" alt="${esc(p.cover_alt || '')}">` : ''}
    <div class="prose" id="postBody"></div>`;
  const bodyEl = $('postBody');
  if (body != null) bodyEl.innerHTML = body; else bodyEl.textContent = (p.body_html || '').replace(/<[^>]+>/g, ' ');
  bodyEl.querySelectorAll('a[href^="http"]').forEach(a => { if (!a.href.includes('masterartist.co')) { a.target = '_blank'; a.rel = 'noopener'; } });

  const moreHost = $('moreGrid');
  const others = (more || []).filter(x => x.slug !== p.slug).slice(0, 3);
  if (moreHost && others.length) { moreHost.innerHTML = others.map(postCard).join(''); $('morePosts').hidden = false; }
}

/* Dated items (e.g. upcoming workshops) hide themselves after their date */
(function hidePast() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('[data-until]').forEach(el => { if (el.dataset.until < today) el.hidden = true; });
  document.querySelectorAll('.up-list').forEach(list => {
    const none = list.parentElement.querySelector('.up-none');
    if (none) none.hidden = !!list.querySelector('.up:not([hidden])');
  });
})();

/* ---------------------------------------------------------------- events
   Events come from the admin panel (Supabase view events_public). The build
   also writes them into the page (<script id="eventsData">) so the calendar
   works instantly and search engines can read them; the live list replaces
   that copy as soon as it loads. Used by the homepage calendar and the
   Workshops page's upcoming list. */
const pad2 = n => String(n).padStart(2, '0');
const isoDay = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
function fmtTime(t) {
  const [h, m] = String(t || '').split(':').map(Number);
  if (isNaN(h)) return '';
  return (h % 12 || 12) + (m ? ':' + pad2(m) : '') + (h < 12 ? 'am' : 'pm');
}
function eventLabel(e) {
  const d = new Date(e.date + 'T00:00');
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + d.getDate() + ' ' + d.toLocaleDateString('en-GB', { month: 'short' });
  let s = fmtTime(e.start), f = fmtTime(e.end);
  if (f && s.slice(-2) === f.slice(-2)) s = s.slice(0, -2);   // "3–5pm" rather than "3pm–5pm"
  return day + ', ' + s + (f ? '–' + f : '');
}
const fromRow = r => ({ date: r.event_date, start: String(r.start_time).slice(0, 5), end: r.end_time ? String(r.end_time).slice(0, 5) : '',
  title: r.title, kind: r.kind || '', category: r.category || 'Workshop', desc: r.description || '', reserve: r.allow_reserve !== false });
const typeLabel = e => (e.kind ? e.kind + ' ' : '') + (e.category || 'Workshop').toLowerCase();
const reserveText = e => e.category === 'Workshop'
  ? `Hi Master Artist! I'd like to reserve a spot at the ${e.label} workshop: ${e.title}.`
  : `Hi Master Artist! I'd like to know more about ${e.title} on ${e.label}.`;

function embeddedEvents() {
  try { return JSON.parse($('eventsData').textContent).map(e => ({ ...e, category: e.category || 'Workshop', reserve: e.reserve !== false })); }
  catch { return []; }
}

/* Homepage "What's on" calendar */
let calState = null;
function drawCalendar(events) {
  const host = $('calendar');
  if (!host) return;
  const now = new Date(), todayIso = isoDay(now);
  const upcoming = events.filter(e => e.date >= todayIso).map(e => ({ ...e, label: eventLabel(e) }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const byDate = {};
  upcoming.forEach(e => (byDate[e.date] = byDate[e.date] || []).push(e));
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (!calState) {
    calState = { offset: 0 };
    for (let k = 0; k < 3; k++) {       // open on the first month with something coming up
      const m = new Date(now.getFullYear(), now.getMonth() + k, 1);
      if (upcoming.some(e => e.date.startsWith(m.getFullYear() + '-' + pad2(m.getMonth() + 1)))) { calState.offset = k; break; }
    }
    host.addEventListener('click', ev => {
      const nav = ev.target.closest('.cal-nav');
      if (nav) { calState.offset = Math.max(0, Math.min(2, calState.offset + Number(nav.dataset.dir))); drawMonth(); return; }
      const b = ev.target.closest('.cal-ev'); if (b) showDetail(calState.find(b.dataset.key));
    });
    $('calList').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) showDetail(calState.find(b.dataset.key)); });
  }
  calState.find = key => upcoming.find(e => e.date + e.start === key);

  function showDetail(e) {
    if (!e) return;
    const box = $('calDetail');
    box.innerHTML = `<span class="cal-kind">${esc(typeLabel(e))}</span><h4>${esc(e.title)}</h4>
      <p class="cal-when">${esc(e.label)}</p>${e.desc ? `<p>${esc(e.desc)}</p>` : ''}
      ${e.category === 'Workshop' ? '<p class="cal-meta">All ages · no experience needed · at our studio above Savor</p>' : ''}
      ${e.reserve ? `<a class="btn btn-purple btn-sm" href="${waLink(reserveText(e))}" target="_blank" rel="noopener" data-cal-reserve>${e.category === 'Workshop' ? 'Reserve on WhatsApp' : 'Ask on WhatsApp'}</a>` : ''}`;
    box.hidden = false;
    host.querySelectorAll('.cal-ev').forEach(b => b.classList.toggle('on', b.dataset.key === e.date + e.start));
    $('calList').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.key === e.date + e.start));
  }
  function drawMonth() {
    const first = new Date(now.getFullYear(), now.getMonth() + calState.offset, 1);
    const y = first.getFullYear(), m = first.getMonth(), days = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first.getDay(); i++) cells += '<div class="cal-cell blank"></div>';
    for (let d = 1; d <= days; d++) {
      const key = y + '-' + pad2(m + 1) + '-' + pad2(d), dow = new Date(y, m, d).getDay(), evs = byDate[key] || [];
      const cls = ['cal-cell', key < todayIso ? 'past' : '', key === todayIso ? 'today' : '', dow === 6 ? 'closed' : '', evs.length ? 'has' : ''].join(' ');
      cells += `<div class="${cls}"><span class="cal-d">${d}</span>${dow === 6 ? '<span class="cal-closed">Closed</span>' : ''}
        ${evs.map(e => `<button type="button" class="cal-ev" data-key="${e.date + e.start}" title="${esc(e.title)}"><span>${esc(e.title)}</span></button>`).join('')}</div>`;
    }
    host.innerHTML = `<div class="cal-head">
        <button type="button" class="cal-nav" data-dir="-1" aria-label="Previous month" ${calState.offset <= 0 ? 'disabled' : ''}>‹</button>
        <h3>${MONTHS[m]} ${y}</h3>
        <button type="button" class="cal-nav" data-dir="1" aria-label="Next month" ${calState.offset >= 2 ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-grid" role="grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>`;
  }
  const limit = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const soon = upcoming.filter(e => e.date <= limit);
  $('calList').innerHTML = soon.length
    ? soon.map(e => `<button type="button" data-key="${e.date + e.start}"><b>${esc(e.label)}</b><span>${esc(e.title)}</span></button>`).join('')
    : `<p class="cal-empty">Nothing in the next 30 days yet — <a href="${waLink('Hi Master Artist! When is the next workshop?')}" target="_blank" rel="noopener">ask us what's coming up</a>.</p>`;
  drawMonth();
  if (upcoming.length) showDetail(soon[0] || upcoming[0]); else $('calDetail').hidden = true;
}

/* Workshops page "Upcoming workshops" list */
function drawUpcomingList(events) {
  const list = document.querySelector('.up-list');
  if (!list) return;
  const today = isoDay(new Date());
  const ws = events.filter(e => e.date >= today && (e.category || 'Workshop') === 'Workshop')
    .map(e => ({ ...e, label: eventLabel(e) })).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  list.innerHTML = ws.map(e => `<div class="up"><div class="when">${esc(e.label)}</div><div class="what"><b>${esc(e.title)}</b>
      <small>${esc(typeLabel(e))} · all ages · no experience needed</small></div>
      ${e.reserve ? `<a class="btn btn-purple btn-sm" href="${waLink(reserveText(e))}" target="_blank" rel="noopener">Reserve</a>` : ''}</div>`).join('');
  const none = list.parentElement.querySelector('.up-none');
  if (none) none.hidden = ws.length > 0;
}

(function initEvents() {
  if (!$('calendar') && !document.querySelector('.up-list')) return;
  const first = embeddedEvents();
  if (first.length) { drawCalendar(first); drawUpcomingList(first); }
  q(sb.from('events_public').select('*')).then(rows => {
    if (!rows) return;   // events table not set up yet — keep what the page already shows
    const live = rows.map(fromRow);
    drawCalendar(live); drawUpcomingList(live);
  });
})();

/* -------------------------------------------------------- studio sessions
   Timetable, booking and confirmation. Reads the public seats view. Creating
   a booking goes through the create-checkout Edge Function, never a direct
   insert. Purchase tracking fires only after a paid or reserved booking. */
const SS_BANDS = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
];
const SS_AUDIENCES = [
  ['all', 'All'],
  ['couples', 'Couples'],
  ['friends', 'Friends'],
  ['women', 'Women'],
  ['families', 'Families'],
  ['kids', 'Kids'],
  ['adults', 'Adults'],
  ['teams', 'Teams'],
  ['creators', 'Creators'],
  ['everyone', 'Everyone'],
];

function trackPurchase(detail) {
  const key = 'ma_purchase_' + detail.transaction_id;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { /* a blocked store must not block the page; GA4 still dedupes on transaction_id */ }
  const item = {
    item_id: detail.slug || '',
    item_name: detail.format || '',
    price: detail.value,
    quantity: detail.quantity || 1,
  };
  try {
    window.gtag && gtag('event', 'purchase', {
      transaction_id: detail.transaction_id,
      value: detail.value,
      currency: 'MYR',
      items: [item],
      transport_type: 'beacon',
    });
  } catch { /* a blocked tag must not break the page */ }
  const label = GOOGLE_ADS_LABELS.workshop_purchase;
  if (label && window.gtag) {
    try {
      gtag('event', 'conversion', {
        send_to: label,
        value: detail.value,
        currency: 'MYR',
        transaction_id: detail.transaction_id,
        transport_type: 'beacon',
      });
    } catch { /* a blocked tag must not break the page */ }
  }
  try {
    window.fbq && fbq('track', 'Purchase', {
      value: detail.value,
      currency: 'MYR',
      content_name: detail.format || '',
      content_ids: detail.slug ? [detail.slug] : [],
    });
  } catch { /* a blocked pixel must not break the page */ }
}

function studioFn(name, body) {
  return fetch(SUPABASE_URL + '/functions/v1/' + name, {
    method: body ? 'POST' : 'GET',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function injectSessionEvents(rows) {
  document.querySelectorAll('script[data-ss-event]').forEach(node => node.remove());
  rows.forEach(row => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.ssEvent = row.id;
    script.textContent = JSON.stringify(eventJsonLd(row));
    document.head.appendChild(script);
  });
}

function sessionMatches(row, audience) {
  if (!audience || audience === 'all') return true;
  const tags = row.audiences || [];
  return tags.includes(audience) || tags.includes('everyone');
}

function seatsPhrase(row) {
  if (!row.bookable) return 'Enquire';
  const left = Number(row.seats_left);
  if (left <= 0) return 'Sold out';
  if (row.unit === 'pair') return left === 1 ? '1 pair left' : left + ' pairs left';
  return seatsBadge(left);
}

function renderSessionRows(rows) {
  if (!rows.length) {
    return `<div class="empty"><h3>No dates in this filter yet</h3><p>New sessions appear here when the studio publishes them. <a data-wa data-wa-text="Hi Master Artist! Which Studio Sessions are coming up?">Ask on WhatsApp</a>.</p></div>`;
  }
  return SS_BANDS.map(([band, label]) => {
    const items = rows.filter(row => (row.time_band || timeBand(row.starts_at)) === band);
    if (!items.length) return '';
    return `<div class="ss-band"><h3>${label}</h3><div class="ss-list">${items.map(row => {
      const full = row.bookable && Number(row.seats_left) <= 0;
      const price = moneyMYR(row.unit_price_myr) + (row.unit === 'pair' ? ' / pair' : '');
      const action = !row.bookable
        ? `<a class="btn btn-purple btn-sm" data-wa data-wa-text="Hi Master Artist! I'd like to enquire about a private Studio Session.">Enquire</a>`
        : full
          ? `<span class="btn btn-ghost-dark btn-sm" aria-disabled="true">Full</span>`
          : `<a class="btn btn-purple btn-sm" href="/studio-sessions/book/?session=${encodeURIComponent(row.id)}">Book</a>`;
      return `<article class="ss-row">
        <div class="when">${esc(formatWhen(row.starts_at, row.ends_at))}</div>
        <div class="what"><b><a href="${esc(row.page_path || '/studio-sessions/')}">${esc(row.name)}</a></b>
          <small>${esc(row.room)} · ${esc(row.discipline)} · ${esc(price)}${row.public_holiday ? ' · public-holiday rate' : ''}${row.promo_label ? ' · ' + esc(row.promo_label) : ''}</small></div>
        <div class="actions"><span class="ss-badge${full ? ' is-full' : ''}">${esc(seatsPhrase(row))}</span>${action}</div>
      </article>`;
    }).join('')}</div></div>`;
  }).join('');
}

function klDateKey(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
  return parts;
}

function weekBounds() {
  const key = klDateKey(new Date().toISOString());
  const [year, month, day] = key.split('-').map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  const dow = noon.getUTCDay();
  const monday = new Date(noon);
  monday.setUTCDate(noon.getUTCDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const stamp = date => date.toISOString().slice(0, 10);
  return { start: stamp(monday), end: stamp(sunday) };
}

function renderDateRows(rows) {
  if (!rows.length) {
    return `<div class="empty"><h3>No dates in this filter yet</h3><p>New sessions appear here when the studio publishes them. <a data-wa data-wa-text="Hi Master Artist! Which Studio Sessions are coming up?">Ask on WhatsApp</a>.</p></div>`;
  }
  const groups = new Map();
  rows.forEach(row => {
    const key = row.session_date || klDateKey(row.starts_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([key, items]) => {
    const label = new Intl.DateTimeFormat('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur', weekday: 'long', day: 'numeric', month: 'short',
    }).format(new Date(key + 'T04:00:00Z'));
    return `<div class="ss-day"><h3>${esc(label)}</h3><div class="ss-list">${items.map(row => {
      const full = row.bookable && Number(row.seats_left) <= 0;
      const price = moneyMYR(row.unit_price_myr) + (row.unit === 'pair' ? ' / pair' : '');
      const action = !row.bookable
        ? `<a class="btn btn-purple btn-sm" data-wa data-wa-text="Hi Master Artist! I'd like to enquire about a private Studio Session.">Enquire</a>`
        : full
          ? `<span class="btn btn-ghost-dark btn-sm" aria-disabled="true">Sold out</span>`
          : `<a class="btn btn-purple btn-sm" href="/studio-sessions/book/?session=${encodeURIComponent(row.id)}">Book</a>`;
      return `<article class="ss-row">
        <div class="when">${esc(formatWhen(row.starts_at, row.ends_at).split(', ').slice(1).join(', ') || formatWhen(row.starts_at, row.ends_at))}</div>
        <div class="what"><b><a href="${esc(row.page_path || '/studio-sessions/')}">${esc(row.name)}</a></b>
          <small>${esc(row.room)} · ${esc(price)}${row.promo_label ? ' · ' + esc(row.promo_label) : ''}</small></div>
        <div class="actions"><span class="ss-badge${full ? ' is-full' : ''}">${esc(seatsPhrase(row))}</span>${action}</div>
      </article>`;
    }).join('')}</div></div>`;
  }).join('');
}

function audiencePageMatch(row, kind) {
  if (kind === 'families') return sessionMatches(row, 'families') || sessionMatches(row, 'kids');
  if (kind === 'adults') return (row.audiences || []).some(tag => ['adults', 'couples', 'friends', 'women', 'creators', 'teams', 'everyone'].includes(tag));
  if (kind === 'weekday-mornings') {
    const date = new Date(row.starts_at);
    const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'short' }).format(date);
    return weekday !== 'Sun' && weekday !== 'Sat' && (row.time_band || timeBand(row.starts_at)) === 'morning';
  }
  return true;
}

async function initStudioTimetable() {
  const host = $('sessionTimetable') || $('formatSessions') || $('weekSessions') || $('whatsOn') || $('audienceSessions');
  if (!host) return;
  const slug = host.dataset.slug || '';
  const audienceKind = host.dataset.audience || '';
  const weekOnly = host.id === 'weekSessions';
  const byDate = host.id === 'whatsOn' || weekOnly || audienceKind;
  let audience = 'all';
  let day = 'all';
  let format = slug || 'all';
  let maxPrice = 'all';
  let rows = [];
  const filters = $('ssFilters');
  const draw = () => {
    const bounds = weekBounds();
    const shown = rows.filter(row => {
      if (format !== 'all' && row.slug !== format) return false;
      if (!audiencePageMatch(row, audienceKind)) return false;
      if (!sessionMatches(row, audience)) return false;
      if (day !== 'all' && (row.session_date || klDateKey(row.starts_at)) !== day) return false;
      if (maxPrice !== 'all' && Number(row.unit_price_myr) > Number(maxPrice)) return false;
      if (weekOnly) {
        const key = row.session_date || klDateKey(row.starts_at);
        if (key < bounds.start || key > bounds.end) return false;
      }
      return true;
    });
    if (weekOnly && !shown.length) {
      host.innerHTML = `<div class="empty"><h3>Nothing published this week yet</h3><p>Dates go on sale when the studio publishes them. <a href="/whats-on/">See the full timetable</a>.</p></div>`;
    } else {
      host.innerHTML = byDate ? renderDateRows(shown) : renderSessionRows(shown);
    }
    injectSessionEvents(shown);
    applyWhatsApp();
  };
  if (filters && host.id === 'whatsOn') {
    filters.addEventListener('change', () => {
      day = $('ssDay') ? $('ssDay').value : 'all';
      format = $('ssFormatFilter') ? $('ssFormatFilter').value : 'all';
      audience = $('ssAudience') ? $('ssAudience').value : 'all';
      maxPrice = $('ssPrice') ? $('ssPrice').value : 'all';
      draw();
    });
  } else if (filters) {
    filters.innerHTML = SS_AUDIENCES.map(([id, label]) =>
      `<button type="button" class="${id === 'all' ? 'on' : ''}" data-audience="${id}">${label}</button>`).join('');
    filters.addEventListener('click', event => {
      const button = event.target.closest('button[data-audience]');
      if (!button) return;
      audience = button.dataset.audience;
      filters.querySelectorAll('button').forEach(item => item.classList.toggle('on', item === button));
      draw();
    });
  }
  host.innerHTML = `<p class="fine">Loading the timetable…</p>`;
  rows = await q(sb.from('workshop_seats_left').select('*').order('starts_at')) || [];
  if (host.id === 'whatsOn' && filters) {
    const days = [...new Set(rows.map(row => row.session_date || klDateKey(row.starts_at)))];
    const formats = [...new Map(rows.map(row => [row.slug, row.name])).entries()];
    filters.innerHTML = `<label>Day <select id="ssDay"><option value="all">Any day</option>${days.map(dayKey => `<option value="${esc(dayKey)}">${esc(dayKey)}</option>`).join('')}</select></label>
      <label>Format <select id="ssFormatFilter"><option value="all">Any format</option>${formats.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select></label>
      <label>Audience <select id="ssAudience">${SS_AUDIENCES.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select></label>
      <label>Price <select id="ssPrice"><option value="all">Any price</option><option value="98">Up to RM98</option><option value="128">Up to RM128</option><option value="160">Up to RM160</option></select></label>`;
  }
  draw();
}

async function initStudioBooking() {
  const host = $('bookingFlow');
  if (!host) return;
  const params = new URLSearchParams(location.search);
  const sessionId = params.get('session') || '';
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    host.innerHTML = `<div class="empty"><h3>Choose a session first</h3><p><a href="/whats-on/">Back to the timetable</a></p></div>`;
    return;
  }
  host.innerHTML = `<p class="fine">Loading this session…</p>`;
  const rows = await q(sb.from('workshop_seats_left').select('*').eq('id', sessionId).limit(1));
  const row = rows && rows[0];
  if (!row || !row.bookable) {
    host.innerHTML = `<div class="empty"><h3>This session isn't on sale</h3><p><a href="/whats-on/">See the timetable</a></p></div>`;
    return;
  }
  let mode = 'whatsapp';
  try {
    const res = await studioFn('create-checkout');
    if (res.ok) mode = (await res.json()).mode || mode;
  } catch { /* the form still explains both paths */ }
  const addons = (await q(sb.from('workshop_addons').select('slug,name,description,price_myr,format_id').eq('active', true).order('sort_order')) || [])
    .filter(addon => !addon.format_id || addon.format_id === row.format_id);
  const full = Number(row.seats_left) <= 0;
  const unitWord = row.unit === 'pair' ? 'Pairs' : 'Places';
  host.innerHTML = `<div class="book-layout">
    <form class="book-form" id="bookForm">
      <h2>Your <em>details</em></h2>
      <div class="full"><label for="bookQty">${esc(unitWord)}</label>
        <input id="bookQty" name="qty" type="number" min="1" max="${Number(row.seats_left) || 1}" value="1" required ${full ? 'disabled' : ''}></div>
      <div class="child-fields" ${row.requires_child ? '' : 'hidden'}>
        <label for="bookChild">Child's name</label>
        <input id="bookChild" name="child_name" autocomplete="name" ${row.requires_child ? 'required' : ''}>
        <label for="bookAge">Child's age</label>
        <input id="bookAge" name="child_age" inputmode="numeric">
      </div>
      <div><label for="bookName">Your name</label><input id="bookName" name="name" required autocomplete="name"></div>
      <div><label for="bookPhone">WhatsApp number</label><input id="bookPhone" name="phone" required autocomplete="tel" inputmode="tel"></div>
      <div class="full"><label for="bookEmail">Email</label><input id="bookEmail" name="email" type="email" required autocomplete="email"></div>
      <div class="full" id="bookAddons">${addons.map(addon => `<label class="check"><input type="checkbox" name="addon" value="${esc(addon.slug)}" data-price="${Number(addon.price_myr)}"> ${esc(addon.name)} · ${esc(moneyMYR(addon.price_myr))} <span class="fine">${esc(addon.description)}</span></label>`).join('')}</div>
      <div class="full"><label for="bookGift">Gift voucher code</label><input id="bookGift" name="gift_code" autocomplete="off" placeholder="Optional, GV-…"></div>
      <p class="full fine" id="bookTotal"></p>
      <label class="full check"><input type="checkbox" name="policy" required> I understand Studio Sessions are prepaid and non-refundable. Rescheduling is free within 24 hours of booking, then RM10 a person. A session runs with at least 3 people; under 3 confirmed 48 hours before the start, the studio reschedules it or refunds me.</label>
      <p class="full err" id="bookErr" hidden></p>
      <button class="btn btn-gold full" type="submit" ${full ? 'disabled' : ''}>${mode === 'stripe' ? 'Continue to payment' : 'Reserve and open WhatsApp'}</button>
      <p class="full fine">${mode === 'stripe'
        ? 'You’ll pay in MYR by card, FPX or GrabPay. The seat is held for 15 minutes.'
        : 'Card payment isn’t switched on yet. Reserving saves your seat for 24 hours and opens WhatsApp ' + STUDIO_WHATSAPP + ' with the booking ID filled in.'}</p>
    </form>
    <aside class="facts">
      <img class="cover" src="${esc(row.image_path || '/hero-1.jpg')}" alt="">
      <dl>
        <div><dt>Session</dt><dd>${esc(row.name)}</dd></div>
        <div><dt>When</dt><dd>${esc(formatWhen(row.starts_at, row.ends_at))}</dd></div>
        <div><dt>Room</dt><dd>${esc(row.room)}</dd></div>
        <div><dt>Price</dt><dd>${esc(moneyMYR(row.unit_price_myr))}${row.unit === 'pair' ? ' / pair' : ''}</dd></div>
        <div><dt>Left</dt><dd>${esc(seatsPhrase(row))}</dd></div>
      </dl>
      <p class="fine">Taught by working artists. You’ll actually get better. Every attendee leaves with a credited RM50 academy trial voucher.</p>
    </aside>
  </div>`;
  const qty = $('bookQty');
  const total = $('bookTotal');
  const showTotal = () => {
    const n = Math.max(1, Number(qty.value) || 1);
    const extra = [...formAddons()].reduce((sum, box) => sum + (box.checked ? Number(box.dataset.price) * n : 0), 0);
    total.textContent = qtyLabel(n, row.unit) + ' · ' + moneyMYR(Number(row.unit_price_myr) * n + extra)
      + (extra ? ' including optional add-ons' : '')
      + (row.public_holiday ? ' (includes the 10% public-holiday rate)' : '')
      + '. Materials are included. A gift voucher code is taken off at the next step.';
  };
  const formAddons = () => [...document.querySelectorAll('#bookAddons input[name=addon]')];
  qty.addEventListener('input', showTotal);
  formAddons().forEach(box => box.addEventListener('change', showTotal));
  showTotal();
  $('bookForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const err = $('bookErr');
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const res = await studioFn('create-checkout', {
        session_id: row.id,
        qty: Number(data.qty),
        name: data.name,
        phone: data.phone,
        email: data.email,
        child_name: data.child_name || null,
        child_age: data.child_age || null,
        gift_code: data.gift_code || null,
        addons: [...formAddons()].filter(box => box.checked).map(box => ({ slug: box.value, qty: Number(data.qty) })),
        utm_source: blank(touch.utm_source),
        utm_medium: blank(touch.utm_medium),
        utm_campaign: blank(touch.utm_campaign),
        utm_term: blank(touch.utm_term),
        utm_content: blank(touch.utm_content),
        gclid: blank(touch.gclid),
        fbclid: blank(touch.fbclid),
        ref_code: refCode(touch),
        landing_page: blank(touch.landing_page),
        referrer: blank(touch.referrer),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const copy = {
          sold_out: 'Those last seats just went. Please pick another quantity or another date.',
          child_required: 'Add the child’s name for this session.',
          invalid_contact: 'Please check the name, WhatsApp number and email.',
          invalid_qty: 'Choose a number of places within the seats left.',
          not_published: 'This session is no longer on sale.',
          invalid_gift: 'That gift voucher code is not available. Check the code, or leave the field empty.',
          invalid_addon: 'That add-on is not available for this session.',
          payment_unavailable: 'Payment couldn’t be started. Nothing was charged. Message the studio on WhatsApp and quote the time of this session.',
        };
        err.textContent = copy[body.error] || 'The booking could not be saved. Nothing was reserved.';
        err.hidden = false;
        button.disabled = false;
        return;
      }
      if (body.checkout_url && (body.mode === 'stripe' || body.mode === 'paid')) {
        location.href = body.checkout_url;
        return;
      }
      const message = withRef(reserveMessage({
        public_code: body.public_code,
        booking_id: body.booking_id,
        format_name: body.session?.name || row.name,
        when: formatWhen(body.session?.starts_at || row.starts_at, body.session?.ends_at || row.ends_at),
        room: body.session?.room || row.room,
        qty_label: qtyLabel(body.qty, body.unit || row.unit),
        amount_label: moneyMYR(body.amount_myr),
        name: data.name,
        phone: data.phone,
        email: data.email,
        child_name: data.child_name,
        child_age: data.child_age,
      }), touch);
      window.open('https://wa.me/' + (body.whatsapp || STUDIO_WHATSAPP) + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
      location.href = '/studio-sessions/confirmation/?booking=' + encodeURIComponent(body.booking_id) + '&token=' + encodeURIComponent(body.public_token);
    } catch {
      err.textContent = 'The booking could not be saved. Nothing was reserved.';
      err.hidden = false;
      button.disabled = false;
    }
  });
}

function confirmationHtml(booking) {
  const session = booking.session || {};
  const when = session.starts_at ? formatWhen(session.starts_at, session.ends_at) : '';
  const reserved = booking.status === 'pending' && booking.payment_mode === 'whatsapp';
  const paid = booking.status === 'paid';
  const heading = paid ? 'You’re booked' : reserved ? 'Seat reserved' : booking.needs_refund ? 'Payment needs a refund' : 'Confirming your booking';
  const voucher = booking.voucher_code
    ? `<p class="voucher"><span>Academy trial voucher</span><b>${esc(booking.voucher_code)}</b><small>RM50 credit for each of ${esc(booking.voucher_credits)} attendee${Number(booking.voucher_credits) === 1 ? '' : 's'}, toward a trial at the academy.</small></p>`
    : paid ? '' : '<p class="fine">The RM50 academy trial voucher appears here once the booking is confirmed.</p>';
  return `<div class="confirm-card">
    <span class="eyebrow">Studio Sessions</span>
    <h2>${heading}</h2>
    <p class="lede-tight">Booking <b>${esc(booking.public_code)}</b>${when ? ' · ' + esc(when) : ''}</p>
    <dl class="confirm-dl">
      <div><dt>Session</dt><dd>${esc(session.name || '')}</dd></div>
      <div><dt>Room</dt><dd>${esc(session.room || '')}</dd></div>
      <div><dt>Name</dt><dd>${esc(booking.name || '')}</dd></div>
      <div><dt>Places</dt><dd>${esc(qtyLabel(booking.qty, booking.unit))}</dd></div>
      ${(booking.addons || []).length ? `<div><dt>Add-ons</dt><dd>${(booking.addons || []).map(item => esc(item.name) + ' × ' + esc(item.qty)).join(', ')}</dd></div>` : ''}
      ${Number(booking.gift_credit_myr) ? `<div><dt>Gift voucher</dt><dd>${esc(moneyMYR(booking.gift_credit_myr))} off</dd></div>` : ''}
      <div><dt>Amount</dt><dd>${esc(moneyMYR(booking.amount_myr))}</dd></div>
      <div><dt>Status</dt><dd>${esc(booking.status)}</dd></div>
      ${booking.child_name ? `<div><dt>Child</dt><dd>${esc(booking.child_name)}${booking.child_age ? ' · ' + esc(booking.child_age) : ''}</dd></div>` : ''}
    </dl>
    ${voucher}
    ${booking.needs_refund ? '<p class="callout">The payment arrived after the seat hold expired and the session was already full. The studio will refund it. Quote this booking ID on WhatsApp.</p>' : ''}
    ${reserved ? '<p class="callout">This reservation is held for 24 hours. Pay the studio on WhatsApp to confirm it. The message includes your booking ID.</p>' : ''}
    <div class="hero-cta">
      <button type="button" class="btn btn-gold" id="icsBtn">Add to calendar</button>
      ${reserved ? '<button type="button" class="btn btn-purple" id="waBtn">Open WhatsApp to pay</button>' : ''}
      <a class="btn btn-ghost-dark" href="${esc(session.page_path || '/studio-sessions/')}">Session details</a>
    </div>
    <p class="fine">Prepaid and non-refundable. Free reschedule within 24 hours of booking, then RM10 a person. Arrive 15 minutes early. Taught by working artists — you’ll actually get better.</p>
  </div>`;
}

function giftConfirmHtml(gift) {
  const ready = gift.status === 'paid' || gift.status === 'redeemed';
  return `<div class="confirm-card">
    <span class="eyebrow">Gift voucher</span>
    <h2>${ready ? 'Gift voucher ready' : 'Confirming the voucher'}</h2>
    <p class="lede-tight">${esc(moneyMYR(gift.amount_myr))} · code <b>${esc(gift.public_code)}</b></p>
    <p>${gift.recipient_name ? 'For ' + esc(gift.recipient_name) + '. ' : ''}Use this code on the booking page. It comes off the session price. Materials are already included in that price.</p>
    ${gift.status === 'pending' && gift.payment_mode === 'whatsapp' ? '<p class="callout">This code is held for 24 hours. Pay the studio on WhatsApp to activate it.</p>' : ''}
    <div class="hero-cta"><a class="btn btn-gold" href="/studio-sessions/book/">Book a seat</a></div>
  </div>`;
}

async function initStudioConfirmation() {
  const host = $('bookingConfirm');
  if (!host) return;
  const params = new URLSearchParams(location.search);
  const giftId = params.get('gift') || '';
  const bookingId = params.get('booking') || '';
  const token = params.get('token') || '';
  if (/^[0-9a-f-]{36}$/i.test(giftId) && /^[0-9a-f-]{36}$/i.test(token)) {
    host.innerHTML = `<p class="fine">Loading your voucher…</p>`;
    let gift = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await studioFn('booking-receipt', { gift_id: giftId, token });
      if (res.ok) gift = await res.json();
      if (!gift) break;
      if (!(gift.payment_mode === 'stripe' && gift.status === 'pending')) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!gift) {
      host.innerHTML = `<div class="empty"><h3>We couldn’t find that voucher</h3><p><a href="/gift-vouchers/">Back to gift vouchers</a></p></div>`;
      return;
    }
    host.innerHTML = giftConfirmHtml(gift);
    if (purchaseShouldFire(gift.status === 'redeemed' ? 'paid' : gift.status, gift.payment_mode)) {
      trackPurchase({ transaction_id: gift.public_code, value: Number(gift.amount_myr), format: 'Gift voucher', slug: 'gift-voucher', quantity: 1 });
    }
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !/^[0-9a-f-]{36}$/i.test(token)) {
    host.innerHTML = `<div class="empty"><h3>No booking to show</h3><p><a href="/studio-sessions/">Browse Studio Sessions</a></p></div>`;
    return;
  }
  host.innerHTML = `<p class="fine">Loading your booking…</p>`;
  let booking = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await studioFn('booking-receipt', { booking_id: bookingId, token });
    if (res.ok) booking = await res.json();
    if (!booking) break;
    const wait = booking.payment_mode === 'stripe' && booking.status === 'pending';
    if (!wait) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!booking) {
    host.innerHTML = `<div class="empty"><h3>We couldn’t find that booking</h3><p>Open the link from your payment page again, or message the studio with the time you booked.</p></div>`;
    return;
  }
  host.innerHTML = confirmationHtml(booking);
  if (purchaseShouldFire(booking.status, booking.payment_mode)) {
    trackPurchase({
      transaction_id: booking.public_code,
      value: Number(booking.amount_myr),
      format: booking.session?.name || '',
      slug: booking.session?.slug || '',
      quantity: Number(booking.qty) || 1,
    });
  }
  const icsBtn = $('icsBtn');
  if (icsBtn && booking.session) {
    icsBtn.addEventListener('click', () => {
      const ics = icsCalendar({
        uid: booking.public_code + '@masterartist.co',
        starts: booking.session.starts_at,
        ends: booking.session.ends_at,
        summary: (booking.session.name || 'Studio Session') + ' — Master Artist',
        location: booking.session.room + ', Master Artist, 38-2 Jalan 28/70A, Desa Sri Hartamas',
        description: 'Booking ' + booking.public_code + '. Prepaid, non-refundable. Free reschedule within 24 hours of booking.',
      });
      const file = new Blob([ics], { type: 'text/calendar' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = booking.public_code + '.ics';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }
  const waBtn = $('waBtn');
  if (waBtn && booking.session) {
    waBtn.addEventListener('click', () => {
      const message = withRef(reserveMessage({
        public_code: booking.public_code,
        booking_id: booking.booking_id,
        format_name: booking.session?.name,
        when: formatWhen(booking.session.starts_at, booking.session.ends_at),
        room: booking.session.room,
        qty_label: qtyLabel(booking.qty, booking.unit),
        amount_label: moneyMYR(booking.amount_myr),
        name: booking.name,
        phone: booking.phone,
        email: booking.email,
        child_name: booking.child_name,
        child_age: booking.child_age,
      }), touch);
      window.open('https://wa.me/' + STUDIO_WHATSAPP + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
    });
  }
}

async function initGiftVouchers() {
  const host = $('giftFlow');
  if (!host) return;
  let mode = 'whatsapp';
  try {
    const res = await studioFn('create-checkout');
    if (res.ok) mode = (await res.json()).mode || mode;
  } catch { /* the form still explains both paths */ }
  host.innerHTML = `<form class="book-form" id="giftForm">
    <h2>Buy a <em>voucher</em></h2>
    <div class="full"><label for="giftAmount">Amount</label>
      <select id="giftAmount" name="amount_myr" required>
        <option value="88">RM88</option><option value="98">RM98</option><option value="108" selected>RM108</option>
        <option value="118">RM118</option><option value="128">RM128</option><option value="160">RM160</option>
      </select></div>
    <div><label for="giftName">Your name</label><input id="giftName" name="name" required autocomplete="name"></div>
    <div><label for="giftPhone">WhatsApp number</label><input id="giftPhone" name="phone" required autocomplete="tel"></div>
    <div class="full"><label for="giftEmail">Email</label><input id="giftEmail" name="email" type="email" required autocomplete="email"></div>
    <div class="full"><label for="giftFor">Recipient’s name</label><input id="giftFor" name="recipient_name" autocomplete="off"></div>
    <p class="full err" id="giftErr" hidden></p>
    <button class="btn btn-gold full" type="submit">${mode === 'stripe' ? 'Continue to payment' : 'Reserve and open WhatsApp'}</button>
    <p class="full fine">One price. The code is redeemed on the booking page and comes off that session. ${mode === 'stripe' ? 'Pay in MYR by card, FPX or GrabPay.' : 'Card payment isn’t switched on yet, so this opens WhatsApp ' + STUDIO_WHATSAPP + '.'}</p>
  </form>`;
  $('giftForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const err = $('giftErr');
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const res = await studioFn('create-checkout', {
        kind: 'gift',
        amount_myr: Number(data.amount_myr),
        name: data.name,
        phone: data.phone,
        email: data.email,
        recipient_name: data.recipient_name || null,
        ref_code: refCode(touch),
        utm_source: blank(touch.utm_source),
        utm_medium: blank(touch.utm_medium),
        utm_campaign: blank(touch.utm_campaign),
        gclid: blank(touch.gclid),
        fbclid: blank(touch.fbclid),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        err.textContent = body.error === 'invalid_amount' ? 'Choose one of the voucher amounts.' : 'The voucher could not be saved.';
        err.hidden = false;
        button.disabled = false;
        return;
      }
      if (body.checkout_url) { location.href = body.checkout_url; return; }
      const message = withRef('Hi Master Artist! I would like to buy a Studio Session gift voucher.\n\nVoucher: ' + body.public_code + '\nAmount: ' + moneyMYR(body.amount_myr) + '\nName: ' + data.name + '\nPhone: ' + data.phone, touch);
      window.open('https://wa.me/' + (body.whatsapp || STUDIO_WHATSAPP) + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
      location.href = '/studio-sessions/confirmation/?gift=' + encodeURIComponent(body.gift_id) + '&token=' + encodeURIComponent(body.public_token);
    } catch {
      err.textContent = 'The voucher could not be saved.';
      err.hidden = false;
      button.disabled = false;
    }
  });
}

function initStudioEnquiry() {
  document.querySelectorAll('form.enquiry-form').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const err = form.querySelector('.err');
      const note = form.querySelector('.form-note');
      if (err) err.hidden = true;
      const data = Object.fromEntries(new FormData(form));
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const res = await studioFn('studio-enquiry', {
          kind: form.dataset.kind,
          name: data.name,
          company: data.company || null,
          phone: data.phone,
          email: data.email,
          package: data.package || null,
          event_date: data.event_date || null,
          headcount: data.headcount || null,
          message: data.message || null,
          ref_code: refCode(touch),
          utm_source: blank(touch.utm_source),
          utm_medium: blank(touch.utm_medium),
          utm_campaign: blank(touch.utm_campaign),
          gclid: blank(touch.gclid),
          fbclid: blank(touch.fbclid),
        });
        if (!res.ok) {
          if (err) { err.hidden = false; err.textContent = 'Please check the name, number and email.'; }
          button.disabled = false;
          return;
        }
        form.classList.add('sent');
        if (note) note.hidden = false;
        button.disabled = true;
      } catch {
        if (err) { err.hidden = false; err.textContent = 'The enquiry could not be sent. WhatsApp is just below.'; }
        button.disabled = false;
      }
    });
  });
}

function initStudioSessions() {
  initStudioTimetable();
  initStudioBooking();
  initStudioConfirmation();
  initGiftVouchers();
  initStudioEnquiry();
}

/* =================================================================== boot */
async function boot() {
  applyWhatsApp();
  const jobs = {
    banner: q(sb.from('banner_live').select('*')),
    settings: q(sb.from('site_settings_public').select('*').maybeSingle()),
  };
  if ($('heroSlides')) {
    jobs.hero = q(sb.from('hero_public').select('*').maybeSingle());
    jobs.heroPhotos = q(sb.from('hero_photos_public').select('*'));
  }
  if ($('galGrid') && $('galGrid').dataset.filters !== undefined) jobs.programmes = q(sb.from('programmes_public').select('id,name'));
  if ($('schedList')) jobs.classes = q(sb.from('classes_public').select('*'));
  if ($('galGrid')) jobs.gallery = q(sb.from('gallery_publishable').select('*'));
  if ($('teachGrid')) jobs.teachers = q(sb.from('teachers_public').select('*'));
  if ($('qGrid')) jobs.testimonials = q(sb.from('testimonials_public').select('*'));
  if ($('blogGrid') || $('moreGrid')) {
    const limit = $('blogGrid') ? parseInt($('blogGrid').dataset.limit || '60', 10) : 4;
    jobs.posts = q(sb.from('blog_public').select('slug,title,excerpt,cover_image,cover_alt,tags,published_at').order('published_at', { ascending: false }).limit(limit));
  }
  if ($('blogGrid') || $('moreGrid') || $('post')) jobs.localPosts = localBlogPosts();
  if ($('post')) {
    const slug = new URLSearchParams(location.search).get('slug') || '';
    jobs.post = slug ? q(sb.from('blog_public').select('*').eq('slug', slug).maybeSingle()) : Promise.resolve(null);
  }

  const keys = Object.keys(jobs);
  const vals = await Promise.all(keys.map(k => jobs[k]));
  const d = Object.fromEntries(keys.map((k, n) => [k, vals[n]]));

  renderBanner(d.banner);
  renderSettings(d.settings);
  if ($('heroSlides')) renderHero(d.hero, d.heroPhotos);
  renderSchedule(d.classes);
  renderGallery(d.gallery, d.programmes);
  renderTeachers(d.teachers);
  renderTestimonials(d.testimonials);
  renderGoogleReviews();
  const posts = mergePosts(d.localPosts, d.posts);
  if ($('blogGrid')) renderBlogList(posts);
  if ($('post')) renderPost(d.post, posts);
}

initStudioSessions();
boot();
