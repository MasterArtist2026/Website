/* Master Artist — site behaviour (handoff 02-SITE-SPEC §3–5, §8).
   Content is readable without this file; it adds WhatsApp pre-fill with the
   visitor's ad source, the tracking events, and the WhatsApp booking form. */
(function () {
  'use strict';
  var WA = document.documentElement.getAttribute('data-wa') || '60102779426';

  /* ---------- UTM persistence: a later WhatsApp click still carries the source ---------- */
  var KEY = 'ma_utm';
  function readUtm() {
    var p = new URLSearchParams(location.search), out = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'gclid'].forEach(function (k) {
      if (p.get(k)) out[k] = p.get(k);
    });
    try {
      if (Object.keys(out).length) sessionStorage.setItem(KEY, JSON.stringify(out));
      return JSON.parse(sessionStorage.getItem(KEY) || '{}');
    } catch (e) { return out; }
  }
  var utm = readUtm();
  var source = utm.utm_source ? utm.utm_source + (utm.utm_campaign ? '/' + utm.utm_campaign : '') : (utm.fbclid ? 'facebook' : utm.gclid ? 'google' : 'site');

  /* ---------- tracking: GTM dataLayer first; direct gtag/fbq until GTM tags are live ---------- */
  window.dataLayer = window.dataLayer || [];
  var META_NAMES = { whatsapp_click: 'Contact', booking_started: 'InitiateCheckout', booking_paid: 'Purchase', trial_requested: 'Lead', view_format: 'ViewContent' };
  function track(name, params) {
    params = Object.assign({ source: source }, params || {});
    window.dataLayer.push(Object.assign({ event: name }, params));
    if (document.documentElement.getAttribute('data-direct-tags') === '1') {
      try { window.gtag && gtag('event', name, params); } catch (e) {}
      try { window.fbq && fbq('trackCustom', name, params); if (META_NAMES[name]) fbq('track', META_NAMES[name], params); } catch (e) {}
    }
  }
  window.maTrack = track;

  /* ---------- WhatsApp buttons: <a data-wa-msg="..." data-voice data-format> ---------- */
  function waUrl(msg) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg); }
  function withSource(msg) { return msg.replace(/\{source\}/g, source); }
  document.querySelectorAll('[data-wa-msg]').forEach(function (a) {
    a.href = waUrl(withSource(a.getAttribute('data-wa-msg')));
    a.target = '_blank'; a.rel = 'noopener';
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (!a) return;
    track(a.hasAttribute('data-trial') ? 'trial_requested' : 'whatsapp_click', {
      voice: a.getAttribute('data-voice') || document.body.getAttribute('data-voice') || 'both',
      format: a.getAttribute('data-format') || document.body.getAttribute('data-format') || '',
      programme: a.getAttribute('data-programme') || '',
      session_id: a.getAttribute('data-session') || ''
    });
  }, true);

  /* ---------- page view events ---------- */
  var b = document.body;
  if (b.getAttribute('data-page') === 'format') track('view_format', { voice: 'studio', format: b.getAttribute('data-format') });

  /* ---------- booking embed (WhatsApp fallback until a payment tool is chosen) ---------- */
  /* formats that run twice in a day: one slot visible at a time, chosen by #tHHMM */
  document.documentElement.classList.add('js');
  var slots = document.querySelectorAll('.slot');
  var started = {};
  function startBooking(form) {
    if (!form || started[form.dataset.session]) return;
    started[form.dataset.session] = true;
    track('booking_started', { voice: 'studio', format: form.dataset.format, session_id: form.dataset.session });
  }
  function showSlot(id) {
    if (slots.length < 2) return;
    var pick = document.getElementById(id) && document.getElementById(id).classList.contains('slot') ? id : slots[0].id;
    slots.forEach(function (sl) { sl.hidden = sl.id !== pick; });
    document.querySelectorAll('.times a').forEach(function (a) {
      if (a.getAttribute('data-slot') === pick) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    startBooking(document.querySelector('#' + pick + ' form.booking'));
  }
  document.querySelectorAll('.times a').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      history.replaceState(null, '', '#' + a.getAttribute('data-slot'));
      showSlot(a.getAttribute('data-slot'));
    });
  });
  if (slots.length > 1) showSlot(location.hash.slice(1));

  document.querySelectorAll('form.booking').forEach(function (form) {
    var d = form.dataset;
    if (slots.length < 2) startBooking(form);
    var price = Number(d.price || 0), pair = Number(d.pair || 0), dine = Number(d.dine || 0), dinePair = Number(d.dinePair || 0);
    function total() {
      var f = new FormData(form), qty = Math.max(1, Number(f.get('qty') || 1));
      var isPair = f.get('ticket') === 'pair', people = isPair ? qty * 2 : qty;
      var sum = isPair ? pair * qty : price * qty;
      if (f.get('dine') === 'yes') sum += isPair ? dinePair * qty : dine * qty;
      var out = form.querySelector('[data-total]');
      if (out) out.textContent = 'RM' + sum.toLocaleString('en-MY');
      return { qty: qty, isPair: isPair, people: people, sum: sum, f: f };
    }
    form.addEventListener('input', total);
    total();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var t = total(), f = t.f;
      var lines = [
        'Hi, I\'d like to book ' + d.name + ' on ' + d.when + '.',
        (t.isPair ? t.qty + ' pair ticket(s)' : t.qty + ' seat(s)') + (f.get('dine') === 'yes' ? ' + Dine' : '') + ' — RM' + t.sum + '.'
      ];
      ['name', 'child_name', 'child_age', 'allergies', 'collector'].forEach(function (k) {
        if (f.get(k)) lines.push(k.replace('_', ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + ': ' + f.get(k));
      });
      if (f.get('photo')) lines.push('Photo consent: ' + f.get('photo'));
      lines.push('Consent confirmed on the website.', 'Session: ' + d.session + '. Source: ' + source + '.');
      track('whatsapp_click', { voice: 'studio', format: d.format, session_id: d.session, value: t.sum, currency: 'MYR' });
      window.open(waUrl(lines.join('\n')), '_blank', 'noopener');
      form.classList.add('sent');
    });
  });

  /* ---------- Google rating and reviews (google-reviews Edge Function) ---------- */
  var SB_URL = 'https://fudaosneozobacdalncv.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZGFvc25lb3pvYmFjZGFsbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTIwNDUsImV4cCI6MjEwMjQ2ODA0NX0.0PKbkncE8goPg-iJlAUacNUa3MjWJSj1ZLeqTpkqPZ0';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stars(n) { var r = Math.round(n || 0); return '<span class="stars" aria-label="' + r + ' out of 5">' + '★★★★★'.slice(0, r) + '</span>'; }
  var gHosts = document.querySelectorAll('[data-greviews]');
  if (gHosts.length) {
    fetch(SB_URL + '/functions/v1/google-reviews', { method: 'POST', headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (place) {
        if (!place || (!place.rating && !(place.reviews || []).length)) return;
        var reviews = (place.reviews || []).filter(function (r) { return r.text; });
        var profile = place.googleMapsUri || 'https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(place.placeId || '');
        gHosts.forEach(function (host) {
          var n = Number(host.getAttribute('data-greviews')) || 2;
          host.innerHTML = '<div class="g-head"><b>' + Number(place.rating || 0).toFixed(1) + '</b><div>' + stars(place.rating) +
            '<span class="count">' + (place.userRatingCount ? place.userRatingCount + ' Google reviews' : 'Google reviews') + '</span></div>' +
            '<div class="hero-cta"><a class="btn ghost" href="' + esc(profile) + '" target="_blank" rel="noopener">Read all reviews</a></div></div>' +
            '<div class="reviews">' + reviews.slice(0, n).map(function (r) {
              return '<figure class="review">' + stars(r.rating) + '<blockquote>' + esc(r.text) + '</blockquote><figcaption>' +
                (r.authorUri ? '<a href="' + esc(r.authorUri) + '" target="_blank" rel="noopener">' + esc(r.author || 'Google user') + '</a>' : esc(r.author || 'Google user')) +
                '<span class="src">' + esc(r.when || '') + ' · Posted on Google</span></figcaption></figure>';
            }).join('') + '</div>';
          host.hidden = false;
        });
      })
      .catch(function () {});
  }

  /* ---------- trial form: save to trial_leads, then trial_requested, then WhatsApp ---------- */
  document.querySelectorAll('form.trial-form').forEach(function (form) {
    var params = new URLSearchParams(location.search), sel = form.querySelector('[name=programme]');
    if (sel && params.get('programme') && [].some.call(sel.options, function (o) { return o.value === params.get('programme'); })) sel.value = params.get('programme');
    var errEl = form.querySelector('.err');
    function fail(msg) { errEl.innerHTML = msg; errEl.hidden = false; }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (form.dataset.sending === '1') return;
      var f = new FormData(form), get = function (k) { return String(f.get(k) || '').trim(); };
      var name = get('name'), phone = get('phone'), email = get('email'), digits = phone.replace(/\D/g, '');
      if (!name) return fail('Please add your name.');
      if (digits.length < 8 || digits.length > 15 || !/^[0-9+(). -]+$/.test(phone)) return fail('Please add a phone number we can WhatsApp.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please check the email address, or leave it blank.');
      errEl.hidden = true;
      var progLabel = sel.options[sel.selectedIndex].text, note = [];
      if (get('day') && get('day') !== 'Any day') note.push('Preferred day: ' + get('day'));
      if (get('message')) note.push(get('message'));
      var blank = function (v) { return v ? v : null; };
      var row = {
        parent_name: name, phone: phone, email: blank(email), child_age: blank(get('age')), programme_slug: sel.value,
        message: blank(note.join('\n\n')), utm_source: blank(utm.utm_source), utm_medium: blank(utm.utm_medium),
        utm_campaign: blank(utm.utm_campaign), utm_content: blank(utm.utm_content), gclid: blank(utm.gclid), fbclid: blank(utm.fbclid),
        landing_page: location.pathname, referrer: blank(document.referrer)
      };
      var lines = ["Hi, I'd like to book the RM50 trial for " + progLabel + '.', 'Name: ' + name, 'Phone: ' + phone,
        "Student's age: " + (get('age') || '-'), 'Preferred day: ' + (get('day') || '-')];
      if (get('message')) lines.push('', get('message'));
      lines.push('Source: ' + source + '.');
      var waLink = waUrl(lines.join('\n'));
      var btn = form.querySelector('[type=submit]'), label = btn.textContent;
      form.dataset.sending = '1'; btn.disabled = true; btn.textContent = 'Sending…';
      fetch(SB_URL + '/rest/v1/trial_leads', {
        method: 'POST', body: JSON.stringify(row),
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
      }).then(function (res) {
        form.dataset.sending = ''; btn.disabled = false; btn.textContent = label;
        if (res.status !== 201 && res.status !== 204) throw new Error('HTTP ' + res.status);
        track('trial_requested', { voice: 'academy', programme: sel.value });
        window.open(waLink, '_blank', 'noopener');
        form.classList.add('sent');
      }).catch(function () {
        form.dataset.sending = ''; btn.disabled = false; btn.textContent = label;
        fail('We could not save your details just now. <a href="' + esc(waLink) + '" target="_blank" rel="noopener">Message us on WhatsApp</a> and we will take it from there.');
      });
    });
  });
})();
