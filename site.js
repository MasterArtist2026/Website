/* Master Artist — shared site script.
   Every page loads this one module. Each renderer only runs when its target
   element exists on the page, and only the Supabase views that page needs are
   fetched. All reads use public, read-only views, so the anon key is safe here. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const SUPABASE_URL  = 'https://fudaosneozobacdalncv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZGFvc25lb3pvYmFjZGFsbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTIwNDUsImV4cCI6MjEwMjQ2ODA0NX0.0PKbkncE8goPg-iJlAUacNUa3MjWJSj1ZLeqTpkqPZ0';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* WhatsApp number used until site_settings loads (and if it never does). */
let waDigits = '60102779426';

/* Google reviews (live, via the Places API). Leave GOOGLE_MAPS_KEY empty to
   turn the live block off — hand-picked testimonials still show. The key must
   be restricted to masterartist.co in Google Cloud (see docs/google-reviews.md).
   If GOOGLE_PLACE_ID is empty the place is looked up by name, and its ID is
   printed in the browser console so it can be pasted here (saves one call). */
const GOOGLE_MAPS_KEY    = 'AIzaSyAbbyES0hybZNER4_alOcFKzxzFH2F5n9M';
const GOOGLE_PLACE_ID    = 'ChIJ_5QUWwBJzDERfwTpMdDHLPY';
const GOOGLE_PLACE_QUERY = 'Master Artist, 38-2 Jalan 28/70a, Desa Sri Hartamas, 50480 Kuala Lumpur';
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
  return 'https://wa.me/' + waDigits + (text ? '?text=' + encodeURIComponent(text) : '');
}

function applyWhatsApp() {
  document.querySelectorAll('[data-wa]').forEach(a => {
    a.href = waLink(a.dataset.waText || '');
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
    countEl.textContent = group.length > 1 ? (idx + 1) + ' / ' + group.length : '';
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

/* -------------------------------------------------------------- trial form
   Nothing is stored by the website: the form composes a WhatsApp message and
   opens it, so the family sends it themselves. It also fires a Lead event for
   Meta and Google so ad conversions can be measured. */
(function initTrialForms() {
  const params = new URLSearchParams(location.search);
  document.querySelectorAll('form.trial-form').forEach(form => {
    const pick = params.get('programme');
    const sel = form.querySelector('[name=programme]');
    if (sel && pick && [...sel.options].some(o => o.value === pick)) sel.value = pick;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const lines = [
        "Hi Master Artist! I'd like to book a RM50 trial class.",
        '',
        'Name: ' + (f.name || '-'),
        "Student's age: " + (f.age || '-'),
        'Programme: ' + (f.programme || '-'),
        'Preferred day: ' + (f.day || '-'),
      ];
      if (f.message && f.message.trim()) lines.push('', f.message.trim());
      try { window.fbq && fbq('track', 'Lead', { content_name: f.programme || 'Trial class' }); } catch {}
      try { window.gtag && gtag('event', 'generate_lead', { programme: f.programme || '' }); } catch {}
      window.open(waLink(lines.join('\n')), '_blank', 'noopener');
      form.classList.add('sent');
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
    const dots = $('heroDots');
    host.querySelectorAll('.hslide').forEach(el => el.remove());
    photos.forEach((p, n) => {
      const div = document.createElement('div');
      div.className = 'hslide' + (n === 0 ? ' is-on' : '');
      div.innerHTML = `<img src="${esc(p.image_path)}" alt="${esc(p.alt_text)}">`;
      host.insertBefore(div, dots);
    });
  }
  rotator([...host.querySelectorAll('.hslide')], $('heroDots'), 'hdot', 6000, host, false);
}

const PROG_ICONS = {
  music: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="18" r="3"/><circle cx="17" cy="15.5" r="3"/><path d="M9.5 18V6l10.5-3v12.5"/><path d="M9.5 9L20 6"/></svg>',
  art: '<svg viewBox="0 0 24 24"><path d="M3.5 20.5c-.5-2.5.5-4.5 2.5-4.5s3 1.3 3 3-1.8 2.9-5.5 1.5z"/><path d="M9 17L20.2 5.8a2.6 2.6 0 0 0-3.7-3.7L5.3 13.3"/><path d="M15.5 4.5l4 4"/></svg>',
  'graphic-design': '<svg viewBox="0 0 24 24"><path d="M12 2.2l7.6 7.4L12 21.8 4.4 9.6z"/><circle cx="12" cy="9.6" r="2.3"/><path d="M12 11.9v9.9"/></svg>',
  videography: '<svg viewBox="0 0 24 24"><rect x="1.8" y="6.5" width="13.5" height="11" rx="1.6"/><path d="M15.3 10.6l6.9-3.3v9.4l-6.9-3.3z"/><path d="M5 6.5l2 -3.5M10 6.5l2 -3.5"/></svg>',
  baking: '<svg viewBox="0 0 24 24"><path d="M4.6 11.5h14.8l-1.9 9.4a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M4.6 11.5a3.6 3.6 0 0 1 2.2-3.3 3.9 3.9 0 0 1 7.4-1.6 3.3 3.3 0 0 1 5.2 4.9"/><path d="M10.4 15.2l-.8 5M13.6 15.2l.8 5"/></svg>',
  _default: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>'
};
const PROG_PHOTOS = {
  music: { src: 'vocal-singing.jpg', alt: 'Sabrina Hew performing as a vocalist' },
  art: { src: 'art-photo-1.jpg', alt: 'Students at Master Artist showing their finished paintings' },
  baking: { src: 'baking-1.jpg', alt: 'Students baking together at a Master Artist workshop' }
};
const PROG_LINKS = { music: 'music.html', baking: 'workshops.html', art: 'art.html' };
const isSoon = p => (p.cta_label || '').trim().toLowerCase() === 'coming soon';

function renderProgrammes(rows) {
  const grid = $('progGrid');
  if (!grid || !rows || !rows.length) return; // keep the static cards as a fallback
  const available = rows.filter(p => !isSoon(p)), soon = rows.filter(isSoon);
  grid.innerHTML = available.map((p, n) => `
    <a class="prog" href="${PROG_LINKS[p.slug] || 'pricing.html'}">
      ${PROG_PHOTOS[p.slug] ? `<img class="prog-photo" src="${esc(PROG_PHOTOS[p.slug].src)}" alt="${esc(PROG_PHOTOS[p.slug].alt)}">` : ''}
      <span class="num">${String(n + 1).padStart(2, '0')}</span>
      <div class="prog-icon">${PROG_ICONS[p.slug] || PROG_ICONS._default}</div>
      <h3>${esc(p.name)}</h3>
      <span class="ages">${esc(p.age_range || '')}</span>
      <p>${esc(p.blurb || '')}</p>
      <span class="more">${esc(p.cta_label || 'Explore')}</span>
    </a>`).join('');
  const note = $('progComingSoon');
  if (note) {
    if (soon.length) {
      note.innerHTML = 'Also opening next term: ' + soon.map(p => `<strong>${esc(p.name)}</strong> (${esc(p.age_range || '')})`).join(' and ') + '.';
      note.style.display = '';
    } else note.style.display = 'none';
  }
}

function renderPricing(rows, fees) {
  const grid = $('priceGrid');
  if (grid && rows && rows.length) {
    const trial = grid.querySelector('.price.feature');
    const cards = rows.map(p => {
      const hasFee = p.fee_myr != null && String(p.fee_myr).trim() !== '';
      const amount = hasFee ? 'RM' + Number(p.fee_myr).toLocaleString('en-MY') : 'Ask us';
      const per = hasFee ? (p.term_length ? 'per term · ' + esc(p.term_length) : 'per term') : (p.term_length ? esc(p.term_length) + ' terms' : 'Fees on request');
      const soon = isSoon(p);
      return `
      <div class="price">
        <span class="badge">${soon ? 'Opening next term' : 'Programme'}</span>
        <h3>${esc(p.name)}</h3>
        <div class="ages">${esc(p.age_range || '')}</div>
        <div class="amt">${amount}</div>
        <div class="per">${per}</div>
        <p>${esc(p.blurb || '')}</p>
        ${soon
          ? `<a class="btn btn-ghost-dark" data-wa data-wa-text="Hi Master Artist! Please let me know when ${esc(p.name)} opens.">Register interest</a>`
          : `<a class="btn btn-purple" href="#trial" data-pick="${esc(p.name)}">Book a trial</a>`}
      </div>`;
    }).join('');
    grid.innerHTML = '';
    if (trial) grid.appendChild(trial);
    grid.insertAdjacentHTML('beforeend', cards);
    applyWhatsApp();
  }
  const box = $('feesBox');
  if (box && fees) {
    const items = [
      ['Registration', fees.registration_myr != null && fees.registration_myr !== '' ? 'RM' + Number(fees.registration_myr).toLocaleString('en-MY') + ' one-time fee' : ''],
      ['Materials', fees.materials_note],
      ['Siblings', fees.sibling_discount],
      ['Make-up classes', fees.makeup_policy],
      ['Refunds', fees.refund_policy],
    ].filter(([, v]) => v && String(v).trim());
    if (items.length) {
      box.innerHTML = items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
      box.hidden = false;
    }
  }
}

function renderSchedule(rows) {
  const host = $('schedList');
  if (!host || !rows) return;
  const only = (host.dataset.programmes || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = only.length ? rows.filter(c => only.includes(c.programme_slug)) : rows;
  if (!list.length) return; // keep the static fallback text
  const byDay = {};
  list.forEach(c => (byDay[c.day_of_week] = byDay[c.day_of_week] || []).push(c));
  host.innerHTML = DAYS.filter(d => byDay[d]).map(day => `
    <div class="sched-day">
      <h3>${esc(day)}</h3>
      ${byDay[day].map(c => `
        <div class="sched-row">
          <span class="time">${esc(c.start_time)}${c.end_time ? '–' + esc(c.end_time) : ''}</span>
          <span class="what">${esc(c.programme_name || '')}</span>
          <span class="who">${esc(c.age_range || '')}${c.teacher_name ? ' · ' + esc(c.teacher_name) : ''}</span>
        </div>`).join('')}
    </div>`).join('');
}

function renderGallery(rows) {
  const grid = $('galGrid');
  if (!grid) return;
  const limit = parseInt(grid.dataset.limit || '0', 10);
  if (rows && rows.length) {
    const list = limit ? rows.slice(0, limit) : rows;
    grid.innerHTML = list.map(g => `
      <div class="gal">
        ${g.image_path ? `<img src="${esc(g.image_path)}" alt="${esc(g.caption || '')}" loading="lazy" data-lightbox-group="gallery">` : esc(g.caption || 'Student work')}
      </div>`).join('');
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
    tile.innerHTML = '<img class="brand-mark" src="logo.svg" alt="Master Artist logo"><span>Master Artist</span>';
  }
  grid.appendChild(tile);
  const count = grid.querySelectorAll('.gal:not(.gal-brand)').length;
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const rem = count % cols;
  tile.style.gridColumn = `span ${Math.max(1, Math.min(rem === 0 ? cols : cols - rem, cols))}`;
}
let brandT;
window.addEventListener('resize', () => {
  clearTimeout(brandT);
  brandT = setTimeout(() => { const g = $('galGrid'); if (g && $('galBrand')) placeBrandTile(g); }, 150);
});

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
      ${t.role_title ? `<span class="role">${esc(t.role_title)}</span>` : ''}
      <p>${esc(t.bio || '')}</p>
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
function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google && google.maps && google.maps.importLibrary) return resolve();
    window.__maGoogleReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_KEY) + '&v=weekly&loading=async&callback=__maGoogleReady';
    s.async = true; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function renderGoogleReviews() {
  const host = $('gReviews');
  if (!host || !GOOGLE_MAPS_KEY) return;
  try {
    await loadGoogleMaps();
    const { Place } = await google.maps.importLibrary('places');
    let id = GOOGLE_PLACE_ID;
    if (!id) {
      const { places } = await Place.searchByText({ textQuery: GOOGLE_PLACE_QUERY, fields: ['id'], maxResultCount: 1 });
      if (!places || !places.length) return;
      id = places[0].id;
      console.info('[site] Google Place ID for Master Artist:', id, '— paste into GOOGLE_PLACE_ID in site.js');
    }
    const place = new Place({ id });
    await place.fetchFields({ fields: ['rating', 'userRatingCount', 'reviews', 'googleMapsURI'] });
    const reviews = (place.reviews || []).filter(r => r.text);
    if (!place.rating && !reviews.length) return;
    const profile = place.googleMapsURI || GOOGLE_PROFILE_URL;
    const writeUrl = 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(id);
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
        const a = r.authorAttribution || {};
        const name = esc(a.displayName || 'Google user');
        return `
        <figure class="g-review">
          <figcaption>
            ${a.photoURI ? `<img src="${esc(a.photoURI)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="g-av">${name.slice(0, 1)}</span>`}
            <span><b>${a.uri ? `<a href="${esc(a.uri)}" target="_blank" rel="noopener">${name}</a>` : name}</b><small>${esc(r.relativePublishTimeDescription || fmtDate(r.publishTime))}</small></span>
          </figcaption>
          ${stars(r.rating || 0)}
          <blockquote><p>${esc(typeof r.text === 'string' ? r.text : (r.text && r.text.text) || '')}</p></blockquote>
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
  <a class="post-card" href="post.html?slug=${encodeURIComponent(p.slug)}">
    ${p.cover_image
      ? `<img class="cover" src="${esc(p.cover_image)}" alt="${esc(p.cover_alt || '')}" loading="lazy">`
      : `<div class="cover ph"><img src="logo.svg" alt=""></div>`}
    <div class="meta">${esc(fmtDate(p.published_at))}${p.tags && p.tags.length ? ' · ' + esc(p.tags[0]) : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.excerpt || '')}</p>
    <span class="more">Read article</span>
  </a>`;
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
    host.innerHTML = `<div class="empty"><h3>This article isn't available</h3><p>It may have been moved or unpublished. <a href="blog.html" style="color:var(--purple);font-weight:600">See all articles</a>.</p></div>`;
    return;
  }
  const url = 'https://masterartist.co/post.html?slug=' + encodeURIComponent(p.slug);
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
  if ($('progGrid') || $('priceGrid')) jobs.programmes = q(sb.from('programmes_public').select('*'));
  if ($('feesBox')) jobs.fees = q(sb.from('fees_public').select('*').maybeSingle());
  if ($('schedList')) jobs.classes = q(sb.from('classes_public').select('*'));
  if ($('galGrid')) jobs.gallery = q(sb.from('gallery_publishable').select('*'));
  if ($('teachGrid')) jobs.teachers = q(sb.from('teachers_public').select('*'));
  if ($('qGrid')) jobs.testimonials = q(sb.from('testimonials_public').select('*'));
  if ($('blogGrid') || $('moreGrid')) {
    const limit = $('blogGrid') ? parseInt($('blogGrid').dataset.limit || '60', 10) : 4;
    jobs.posts = q(sb.from('blog_public').select('slug,title,excerpt,cover_image,cover_alt,tags,published_at').order('published_at', { ascending: false }).limit(limit));
  }
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
  renderProgrammes(d.programmes);
  renderPricing(d.programmes, d.fees);
  renderSchedule(d.classes);
  renderGallery(d.gallery);
  renderTeachers(d.teachers);
  renderTestimonials(d.testimonials);
  renderGoogleReviews();
  if ($('blogGrid')) renderBlogList(d.posts);
  if ($('post')) renderPost(d.post, d.posts);
}

boot();
