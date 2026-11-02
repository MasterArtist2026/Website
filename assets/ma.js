/* Master Artist — site behaviour (handoff 02-SITE-SPEC §3–5, §8).
   Content is readable without this file; it adds WhatsApp pre-fill with the
   visitor's ad source, the tracking events, and the WhatsApp booking form. */
(function () {
  'use strict';
  var WA = document.documentElement.getAttribute('data-wa') || '60102779426';
  var TRIAL = Number(document.documentElement.getAttribute('data-trial-price')) || 0;   // from classes-seed.json
  var SB_URL = 'https://fudaosneozobacdalncv.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZGFvc25lb3pvYmFjZGFsbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTIwNDUsImV4cCI6MjEwMjQ2ODA0NX0.0PKbkncE8goPg-iJlAUacNUa3MjWJSj1ZLeqTpkqPZ0';

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
  function cookie(n) { var m = document.cookie.match('(?:^|; )' + n + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : ''; }
  function track(name, params) {
    // event_id is shared by the browser pixel and the Conversions API so Meta counts each event once
    var eventId = name + '.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 8);
    params = Object.assign({ source: source }, params || {});
    window.dataLayer.push(Object.assign({ event: name, event_id: eventId, meta_event: META_NAMES[name] || '' }, params));
    var html = document.documentElement;
    if (html.getAttribute('data-direct-tags') === '1') {
      try { window.gtag && gtag('event', name, params); } catch (e) {}
      try { window.fbq && fbq('trackCustom', name, params); if (META_NAMES[name]) fbq('track', META_NAMES[name], params, { eventID: eventId }); } catch (e) {}
    }
    if (html.getAttribute('data-direct-tags') === '1' && name === 'whatsapp_click') adsConversion('whatsapp');
    if (html.getAttribute('data-capi') === '1' && META_NAMES[name]) {
      try {
        fetch(SB_URL + '/functions/v1/meta-capi', {
          method: 'POST', keepalive: true,
          headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_name: META_NAMES[name], event_id: eventId, event_source_url: location.href,
                                 fbp: cookie('_fbp'), fbc: cookie('_fbc') || (utm.fbclid ? 'fb.1.' + Date.now() + '.' + utm.fbclid : ''),
                                 custom_data: params })
        }).catch(function () {});
      } catch (e) {}
    }
  }
  window.maTrack = track;

  /* Google Ads conversions (labels in site.json tracking.ads_labels), sent while the direct tags are on */
  function adsConversion(kind) {
    var label = document.documentElement.getAttribute('data-ads-' + (kind === 'trial_form' ? 'trial' : kind));
    if (!label || !window.gtag) return;
    var payload = { send_to: label, transport_type: 'beacon' };
    if (kind === 'trial_form') { payload.value = TRIAL; payload.currency = 'MYR'; }
    try { gtag('event', 'conversion', payload); } catch (e) {}
  }
  // The head filter drops generate_lead hits unless a trial row has just been saved
  function allowLeadHit() {
    window.__allowGenerateLead = (window.__allowGenerateLead || 0) + 1;
    setTimeout(function () { window.__allowGenerateLead = Math.max(0, (window.__allowGenerateLead || 1) - 1); }, 2000);
  }

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
    startBooking(document.querySelector('#' + pick + ' form.booking[data-session]'));
  }
  document.querySelectorAll('.times a').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      history.replaceState(null, '', '#' + a.getAttribute('data-slot'));
      showSlot(a.getAttribute('data-slot'));
    });
  });
  if (slots.length > 1) showSlot(location.hash.slice(1));

  document.querySelectorAll('form.booking[data-session]').forEach(function (form) {
    var d = form.dataset;
    if (slots.length < 2) startBooking(form);
    var price = Number(d.price || 0), pair = Number(d.pair || 0);
    function total() {
      var f = new FormData(form), qty = Math.max(1, Number(f.get('qty') || 1));
      var isPair = f.get('ticket') === 'pair', people = isPair ? qty * 2 : qty;
      var sum = isPair ? pair * qty : price * qty;
      var out = form.querySelector('[data-total]');
      if (out) out.textContent = 'RM' + sum.toLocaleString('en-MY');
      return { qty: qty, isPair: isPair, people: people, sum: sum, f: f };
    }
    form.addEventListener('input', total);
    total();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var t = total(), f = t.f, get = function (k) { return String(f.get(k) || '').trim(); };
      // International form, +<country code><number>: a number typed with its own + code wins over the list;
      // otherwise the local number loses its leading 0 (012… → +6012…)
      var typed = get('phone'), local = typed.replace(/\D/g, '');
      var phone = typed.charAt(0) === '+' ? '+' + local : '+' + (get('cc') || '60') + local.replace(/^0+/, ''), digits = phone.slice(1);
      if (digits.length < 8 || digits.length > 15 || !/^\+?[0-9(). -]+$/.test(typed)) {
        var ph = form.querySelector('[name=phone]'); ph.setCustomValidity('Please add a phone number we can WhatsApp.'); ph.reportValidity();
        ph.addEventListener('input', function () { ph.setCustomValidity(''); }, { once: true });
        return;
      }
      var lines = [
        'Hi, I\'d like to book ' + d.name + ' on ' + d.when + '.',
        (t.isPair ? t.qty + ' pair ticket(s)' : t.qty + ' ' + (d.unit || 'seat(s)')) + ' — RM' + t.sum + '.' + (f.get('dine') === 'yes' ? ' Plus a meal at Savor for ' + t.people + (d.dineUrl ? ' (I\'ll order from the menu link).' : ': please send me Savor\'s menu link.') : '')
      ];
      lines.push('Name: ' + get('first_name') + ' ' + get('last_name'), 'WhatsApp: ' + phone, 'Email: ' + get('email'));
      var LABELS = { child_name: "Child's name", child_age: "Child's age", allergies: 'Allergies or needs', collector: 'Adult collecting' };
      Object.keys(LABELS).forEach(function (k) { if (f.get(k)) lines.push(LABELS[k] + ': ' + f.get(k)); });
      if (f.get('photo')) lines.push('Photo consent: ' + f.get('photo'));
      var CONSENTS = { parent: 'Parent/guardian consent: given', kitchen: 'Kitchen and allergen notice: confirmed', terms: 'Participation and booking terms: agreed' };
      Object.keys(CONSENTS).forEach(function (k) { if (f.get(k)) lines.push(CONSENTS[k]); });
      lines.push('Session: ' + d.session + '. Source: ' + source + '.');
      track('whatsapp_click', { voice: 'studio', format: d.format, session_id: d.session, value: t.sum, currency: 'MYR' });
      window.open(waUrl(lines.join('\n')), '_blank', 'noopener');
      form.classList.add('sent');
      // Save the booking for the admin portal and Sabrina's report. WhatsApp opens first (a popup opened
      // after a network wait is blocked on phones); keepalive lets the save finish as the page loses focus.
      var blank = function (v) { return v ? v : null; };
      var consents = ['parent', 'kitchen', 'terms'].filter(function (k) { return f.get(k); });
      var row = {
        session_id: d.session, format: d.format, session_name: d.name, session_when: d.when, session_date: d.date,
        cap: d.cap ? Number(d.cap) : null, first_name: get('first_name'), last_name: get('last_name'),
        name: get('first_name') + ' ' + get('last_name'), phone: phone, email: get('email').toLowerCase(),
        qty: t.qty, ticket: t.isPair ? 'pair' : 'single', people: t.people, amount: t.sum, dine: f.get('dine') === 'yes',
        allergies: blank(get('allergies')), child_name: blank(get('child_name')), child_age: blank(get('child_age')),
        collector: blank(get('collector')), photo_consent: blank(get('photo')), consents: consents, source: blank(source),
        utm_source: blank(utm.utm_source), utm_medium: blank(utm.utm_medium), utm_campaign: blank(utm.utm_campaign),
        utm_content: blank(utm.utm_content), gclid: blank(utm.gclid), fbclid: blank(utm.fbclid), landing_page: location.pathname
      };
      try {
        fetch(SB_URL + '/rest/v1/workshop_bookings', {
          method: 'POST', body: JSON.stringify(row), keepalive: true,
          headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
        }).catch(function () {});
      } catch (err) {}
    });
  });

  /* ---------- short WhatsApp forms (groups quote, gift vouchers): answers fill data-msg ---------- */
  document.querySelectorAll('form.wa-form').forEach(function (form) {
    var pick = new URLSearchParams(location.search).get('package'), sel = form.querySelector('[name=package]');
    function choose(name) { if (sel && [].some.call(sel.options, function (o) { return o.text === name; })) sel.value = name; }
    if (pick) choose(pick);
    document.querySelectorAll('[data-pick-package]').forEach(function (a) {
      a.addEventListener('click', function () { choose(a.getAttribute('data-pick-package')); });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      var f = new FormData(form);
      var msg = form.getAttribute('data-msg').replace(/\{(\w+)\}/g, function (m, k) {
        if (k === 'source') return source;
        var v = String(f.get(k) || '').trim();
        if (k === 'date' && v) { var d = new Date(v + 'T00:00:00'); v = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
        if (k === 'company') return v ? ' Company: ' + v + '.' : '';
        if (k === 'notes') return v ? ' Note: ' + v : '';
        return v;
      });
      track('whatsapp_click', { voice: form.getAttribute('data-voice') || 'studio', format: form.getAttribute('data-format') || '' });
      window.open(waUrl(msg), '_blank', 'noopener');
      form.classList.add('sent');
    });
  });

  /* ---------- Google rating and reviews (google-reviews Edge Function) ---------- */
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
        /* /reviews/: sort Google reviews into the two voices by what they mention */
        var STUDIO = /workshop|bake|baking|focaccia|ciabatta|bread|canvas|paint(ing)? (night|session)|team|birthday|date|friends|dinner/i;
        var ACADEMY = /class|lesson|teacher|son|daughter|child|kid|progress|term|voice|singing/i;
        document.querySelectorAll('[data-greviews-voice]').forEach(function (list) {
          var v = list.getAttribute('data-greviews-voice');
          var mine = reviews.filter(function (r) { var ac = ACADEMY.test(r.text) && !STUDIO.test(r.text); return v === 'academy' ? ac : !ac; });
          if (!mine.length) return;
          list.innerHTML = mine.map(function (r) {
            return '<figure class="review">' + stars(r.rating) + '<blockquote>' + esc(r.text) + '</blockquote><figcaption>' + esc(r.author || 'Google user') +
              '<span class="src">' + esc(r.when || '') + ' · Posted on Google</span></figcaption></figure>';
          }).join('');
          list.closest('[data-voice-section]').hidden = false;
        });
        document.querySelectorAll('[data-greviews-split] .reviews').forEach(function (g) { g.remove(); });
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
      var lines = ["Hi, I'd like to book the RM" + TRIAL + " trial for " + progLabel + '.', 'Name: ' + name, 'Phone: ' + phone,
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
        allowLeadHit();
        track('trial_requested', { voice: 'academy', programme: sel.value, lead_saved: 'yes', value: TRIAL, currency: 'MYR' });
        if (document.documentElement.getAttribute('data-direct-tags') === '1') {
          try { window.gtag && gtag('event', 'generate_lead', { programme: sel.value, value: TRIAL, currency: 'MYR', transport_type: 'beacon' }); } catch (e) {}
          adsConversion('trial_form');
        }
        window.open(waLink, '_blank', 'noopener');
        form.classList.add('sent');
      }).catch(function () {
        form.dataset.sending = ''; btn.disabled = false; btn.textContent = label;
        fail('We could not save your details just now. <a href="' + esc(waLink) + '" target="_blank" rel="noopener">Message us on WhatsApp</a> and we will take it from there.');
      });
    });
  });
})();
