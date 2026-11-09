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

  /* WhatsApp numbers in international form, +<country code><number>, or '' if it can't be one. A number typed
     with its own + code wins over the country list; otherwise the local number loses its leading 0 (012… → +6012…). */
  function intlPhone(f) {
    var typed = String(f.get('phone') || '').trim(), local = typed.replace(/\D/g, '');
    var phone = typed.charAt(0) === '+' ? '+' + local : '+' + (String(f.get('cc') || '60')) + local.replace(/^0+/, '');
    return phone.length >= 9 && phone.length <= 16 && /^\+?[0-9(). -]+$/.test(typed) ? phone : '';
  }

  /* Lead source code the trial_leads table requires (same rules as attribution.mjs refCode) */
  function refCode() {
    var src = String(utm.utm_source || '').toLowerCase();
    var fbSrc = /facebook|instagram|meta|^fb$|^ig$/.test(src), ggSrc = /google/.test(src);
    if (utm.fbclid && utm.gclid) return ggSrc && !fbSrc ? 'GG' : 'FB';
    if (utm.fbclid || fbSrc) return 'FB';
    if (utm.gclid || ggSrc) return 'GG';
    return 'WEB';
  }

  /* ---------- repeating child blocks: .kids holds one .kid fieldset per child (trial form, kids' workshops) ---------- */
  function kidBlocks(form, onChange) {
    var box = form.querySelector('[data-kids]');
    if (!box) return null;
    var first = box.querySelector('.kid'), max = Number(box.getAttribute('data-max') || 6), made = 1;
    function renumber() {
      [].forEach.call(box.querySelectorAll('.kid'), function (k, i) {
        k.querySelector('[data-n]').textContent = i + 1;
        var rm = k.querySelector('.kid-remove'); if (rm) rm.hidden = i === 0;
      });
      var add = form.querySelector('.add-kid'); if (add) add.hidden = count() >= max;
      if (onChange) onChange();
    }
    function count() { return box.querySelectorAll('.kid').length; }
    function add(focus) {
      if (count() >= max) return;
      made += 1;
      var k = first.cloneNode(true);
      [].forEach.call(k.querySelectorAll('input, select, textarea'), function (el) {
        if (el.tagName === 'SELECT') el.selectedIndex = first.querySelector('[name=' + el.name + ']').selectedIndex; else el.value = '';
        var lab = k.querySelector('label[for="' + el.id + '"]'), id = el.id.replace(/\d+$/, '') + made;
        if (lab) lab.setAttribute('for', id);
        el.id = id;
      });
      box.appendChild(k);
      renumber();
      if (focus) k.querySelector('input').focus();
    }
    box.addEventListener('click', function (ev) {
      var rm = ev.target.closest('.kid-remove');
      if (rm) { rm.closest('.kid').remove(); renumber(); }
    });
    var addBtn = form.querySelector('.add-kid');
    if (addBtn) addBtn.addEventListener('click', function () { add(true); });
    renumber();
    return {
      count: count,
      setCount: function (n) { n = Math.max(1, Math.min(max, n)); while (count() < n) add(false); while (count() > n) box.lastElementChild.remove(); renumber(); },
      show: function (on) { box.hidden = !on; if (addBtn) addBtn.hidden = !on || count() >= max;
        [].forEach.call(box.querySelectorAll('input, select'), function (el) { el.disabled = !on; }); },
      list: function () {
        return [].map.call(box.querySelectorAll('.kid'), function (k) {
          var v = function (n) { var el = k.querySelector('[name=' + n + ']'); return el ? String(el.value || '').trim() : ''; };
          var sel = k.querySelector('select[name=kid_programme]');
          return { name: v('kid_name'), age: v('kid_age'), allergies: v('kid_allergies'), school: v('kid_school'), programme: v('kid_programme'),
                   programmeLabel: sel ? sel.options[sel.selectedIndex].text : '' };
        });
      }
    };
  }

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
  if (/[?&]cancelled=1/.test(location.search)) document.querySelectorAll('form.booking[data-session] .err').forEach(function (el) {
    el.textContent = 'Payment was not completed, so your seat is not booked yet. You can try again below.'; el.hidden = false;
  });

  document.querySelectorAll('form.booking[data-session]').forEach(function (form) {
    var d = form.dataset;
    if (slots.length < 2) startBooking(form);
    var price = Number(d.price || 0), pair = Number(d.pair || 0);
    function total() {
      var f = new FormData(form), qty = Math.max(1, Number(f.get('qty') || 1));
      var isPair = f.get('ticket') === 'pair', people = isPair ? qty * 2 : qty;
      var sum = isPair ? pair * qty : price * qty;
      [].forEach.call(form.querySelectorAll('[data-total]'), function (out) { out.textContent = 'RM' + sum.toLocaleString('en-MY'); });
      return { qty: qty, isPair: isPair, people: people, sum: sum, f: f };
    }
    // Savor's menu opens in a new tab; clicking it marks this booking as dining
    var dineLink = form.querySelector('.dine-link');
    if (dineLink) dineLink.addEventListener('click', function () { form.querySelector('[name=dine]').value = 'yes'; });
    // Kids' workshops: one child block per seat
    var kids = kidBlocks(form);
    function syncKids() { if (kids) kids.setCount(Math.max(1, Number(new FormData(form).get('qty') || 1))); }
    form.addEventListener('input', function (ev) { total(); if (ev.target.name === 'qty') syncKids(); });
    total(); syncKids();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var t = total(), f = t.f, get = function (k) { return String(f.get(k) || '').trim(); };
      var phone = intlPhone(f);
      if (!phone) {
        var ph = form.querySelector('[name=phone]'); ph.setCustomValidity('Please add a phone number we can WhatsApp.'); ph.reportValidity();
        ph.addEventListener('input', function () { ph.setCustomValidity(''); }, { once: true });
        return;
      }
      var lines = [
        'Hi, I\'d like to book ' + d.name + ' on ' + d.when + '.',
        (t.isPair ? t.qty + ' pair ticket(s)' : t.qty + ' ' + (d.unit || 'seat(s)')) + ' — RM' + t.sum + '.' + (f.get('dine') === 'yes' ? ' Plus a meal at Savor for ' + t.people + (d.dineUrl ? ' (I\'ll order from the menu link).' : ': please send me Savor\'s menu link.') : '')
      ];
      lines.push('Name: ' + get('first_name') + ' ' + get('last_name'), 'WhatsApp: ' + phone, 'Email: ' + get('email'));
      var children = kids ? kids.list() : [];
      children.forEach(function (k, i) {
        lines.push('Child ' + (i + 1) + ': ' + k.name + ', age ' + k.age + (k.allergies && !/^none$/i.test(k.allergies) ? ' (allergies/needs: ' + k.allergies + ')' : ''));
      });
      var LABELS = { allergies: 'Allergies or needs', collector: 'Adult collecting' };
      Object.keys(LABELS).forEach(function (k) { if (f.get(k)) lines.push(LABELS[k] + ': ' + f.get(k)); });
      if (f.get('photo')) lines.push('Photo consent: ' + f.get('photo'));
      var CONSENTS = { parent: 'Parent/guardian consent: given', kitchen: 'Kitchen and allergen notice: confirmed', terms: 'Participation and booking terms: agreed' };
      Object.keys(CONSENTS).forEach(function (k) { if (f.get(k)) lines.push(CONSENTS[k]); });
      lines.push('Session: ' + d.session + '. Source: ' + source + '.');
      var blank = function (v) { return v ? v : null; };
      var consents = ['parent', 'kitchen', 'terms'].filter(function (k) { return f.get(k); });
      var row = {
        session_id: d.session, format: d.format, session_name: d.name, session_when: d.when, session_date: d.date,
        cap: d.cap ? Number(d.cap) : null, first_name: get('first_name'), last_name: get('last_name'),
        name: get('first_name') + ' ' + get('last_name'), phone: phone, email: get('email').toLowerCase(),
        qty: t.qty, ticket: t.isPair ? 'pair' : 'single', people: t.people, amount: t.sum, dine: f.get('dine') === 'yes',
        // Children's allergies as "Child 1 (age 7): nuts", so the emailed report never carries a child's name
        allergies: blank(get('allergies') || children.map(function (k, i) {
          return k.allergies && !/^none$/i.test(k.allergies) ? 'Child ' + (i + 1) + ' (age ' + k.age + '): ' + k.allergies : '';
        }).filter(Boolean).join('; ')),
        child_name: blank(children.map(function (k) { return k.name; }).join(', ')),
        child_age: blank(children.map(function (k) { return k.age; }).join(', ')),
        children: children.map(function (k) { return { name: k.name, age: k.age, allergies: k.allergies || null, school: k.school || null }; }),
        collector: blank(get('collector')), photo_consent: blank(get('photo')), consents: consents, source: blank(source),
        utm_source: blank(utm.utm_source), utm_medium: blank(utm.utm_medium), utm_campaign: blank(utm.utm_campaign),
        utm_content: blank(utm.utm_content), gclid: blank(utm.gclid), fbclid: blank(utm.fbclid), landing_page: location.pathname,
        marketing_consent: f.get('news') === 'yes'
      };
      var waLink = waUrl(lines.join('\n')), errEl = form.querySelector('.err');

      // Online payment: the create-checkout function prices and saves the booking, then we go to Stripe
      if (document.documentElement.getAttribute('data-pay') === '1') {
        var btn = form.querySelector('[type=submit]'), label = btn.innerHTML;
        if (form.dataset.sending === '1') return;
        form.dataset.sending = '1'; btn.disabled = true; btn.textContent = 'Opening secure payment…'; errEl.hidden = true;
        track('booking_checkout', { voice: 'studio', format: d.format, session_id: d.session, value: t.sum, currency: 'MYR' });
        fetch(SB_URL + '/functions/v1/create-checkout', {
          method: 'POST', body: JSON.stringify(row),
          headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' }
        }).then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
          .then(function (r) {
            if (!r.ok || !r.j.url) throw new Error(r.j.error || 'error');
            location.href = r.j.url;
          }).catch(function (err) {
            form.dataset.sending = ''; btn.disabled = false; btn.innerHTML = label;
            var msg = err && err.message && err.message !== 'error' && !/fetch|network/i.test(err.message) ? esc(err.message) : 'We could not open the payment page just now.';
            errEl.innerHTML = msg + ' <a href="' + esc(waLink) + '" target="_blank" rel="noopener">Book on WhatsApp instead</a>.';
            errEl.hidden = false;
          });
        return;
      }

      track('whatsapp_click', { voice: 'studio', format: d.format, session_id: d.session, value: t.sum, currency: 'MYR' });
      window.open(waLink, '_blank', 'noopener');
      form.classList.add('sent');
      // Save the booking for the admin portal, the CRM and Sabrina's report. WhatsApp opens first (a popup opened
      // after a network wait is blocked on phones); keepalive lets the save finish as the page loses focus.
      try {
        fetch(SB_URL + '/rest/v1/workshop_bookings', {
          method: 'POST', body: JSON.stringify(row), keepalive: true,
          headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
        }).catch(function () {});
      } catch (err) {}
    });
  });

  /* ---------- after Stripe: show the booking's status, fire booking_paid once ---------- */
  var statusBox = document.querySelector('[data-booking-status]');
  if (statusBox) {
    var qp = new URLSearchParams(location.search), bid = qp.get('b') || '', sid = qp.get('s') || '', tries = 0;
    var lede = document.querySelector('.page-hero p:not(.hero-facts)');
    var show = function (k) { ['paid', 'wait', 'fail'].forEach(function (x) { statusBox.querySelector('[data-' + x + ']').hidden = x !== k; }); };
    (function check() {
      fetch(SB_URL + '/functions/v1/create-checkout?b=' + encodeURIComponent(bid) + '&s=' + encodeURIComponent(sid), {
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON }
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (bk) {
        if (!bk) { show('fail'); if (lede) lede.textContent = ''; return; }
        if (bk.status === 'paid') {
          show('paid'); if (lede) lede.textContent = 'See you at the studio.';
          statusBox.querySelector('[data-what]').textContent = bk.session_name + ' · ' + bk.people + (bk.people > 1 ? ' people' : ' person');
          statusBox.querySelector('[data-when]').textContent = bk.session_when + ' · RM' + bk.amount + ' paid';
          var key = 'ma_paid_' + bid;
          try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) {}
          track('booking_paid', { voice: 'studio', format: bk.format, session_id: bk.session_id, value: bk.amount, currency: 'MYR', transaction_id: bid });
        } else if (bk.status === 'pending' && tries++ < 20) { show('wait'); if (lede) lede.textContent = ''; setTimeout(check, 3000); }
        else { show(bk.status === 'pending' ? 'wait' : 'fail'); if (lede) lede.textContent = ''; }
      }).catch(function () { show('wait'); if (lede) lede.textContent = ''; });
    })();
  }

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

  /* ---------- trial form: one parent or adult, one or more students; one trial_leads row per student, then WhatsApp ---------- */
  document.querySelectorAll('form.trial-form').forEach(function (form) {
    var params = new URLSearchParams(location.search), pick = params.get('programme');
    var errEl = form.querySelector('.err'), selfBox = form.querySelector('.self-only'), selfSel = form.querySelector('[name=self_programme]');
    var totalEl = form.querySelector('[data-trial-total]');
    function who() { var r = form.querySelector('[name=for]:checked'); return r ? r.value : 'child'; }
    function students() { return (who() === 'child' ? 0 : 1) + (who() === 'self' ? 0 : kids.count()); }
    function update() {
      if (!kids) return;
      var n = students();
      if (totalEl) totalEl.textContent = n + ' trial' + (n > 1 ? 's' : '') + ' · RM' + (n * TRIAL);
    }
    var kids = kidBlocks(form, update);
    function mode() {
      selfBox.hidden = who() === 'child'; selfSel.disabled = who() === 'child';
      kids.show(who() !== 'self');
      update();
    }
    // ?programme= from a class page: preselect it for the child (or for the adult, if it is an adult class)
    if (pick) [form.querySelector('[name=kid_programme]'), selfSel].forEach(function (s) {
      if (s && [].some.call(s.options, function (o) { return o.value === pick; })) s.value = pick;
    });
    [].forEach.call(form.querySelectorAll('[name=for]'), function (r) { r.addEventListener('change', mode); });
    mode();
    function fail(msg) { errEl.innerHTML = msg; errEl.hidden = false; }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (form.dataset.sending === '1') return;
      var f = new FormData(form), get = function (k) { return String(f.get(k) || '').trim(); };
      var first = get('first_name'), last = get('last_name'), name = (first + ' ' + last).trim(), phone = intlPhone(f), email = get('email');
      if (!first || !last) return fail('Please add your first and last name.');
      if (!phone) return fail('Please add a phone number we can WhatsApp.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please add your email address.');
      var list = who() === 'self' ? [] : kids.list();
      if (list.some(function (k) { return !k.name || !k.age; })) return fail("Please add each child's name and age, or remove the empty one.");
      errEl.hidden = true;
      var selfLabel = selfSel.options[selfSel.selectedIndex].text;
      var studentsList = (who() === 'child' ? [] : [{ self: true, programme: selfSel.value, programmeLabel: selfLabel }]).concat(list);
      var n = studentsList.length, blank = function (v) { return v ? v : null; }, extra = [];
      if (get('day') && get('day') !== 'Any day') extra.push('Preferred day: ' + get('day'));
      if (get('message')) extra.push(get('message'));
      var forText = { child: 'Child trial (parent booking)', self: 'Adult trial (for themselves)', both: 'Parent and child trials' }[who()];
      var rows = studentsList.map(function (st, i) {
        var line = st.self ? 'For: ' + name + ' (adult, booking for themselves)' : 'For: ' + st.name + ', age ' + st.age + ' (child of ' + name + ')';
        if (n > 1) line += ' · ' + (i + 1) + ' of ' + n + ' in this request';
        if (st.school) line += '\nSchool: ' + st.school;
        return {
          parent_name: name, phone: phone, email: email, child_age: st.self ? null : st.age, programme_slug: st.programme,
          ref_code: refCode(), marketing_consent: f.get('news') === 'yes',
          message: [forText, line].concat(extra).join('\n'), utm_source: blank(utm.utm_source), utm_medium: blank(utm.utm_medium),
          utm_campaign: blank(utm.utm_campaign), utm_content: blank(utm.utm_content), gclid: blank(utm.gclid), fbclid: blank(utm.fbclid),
          landing_page: location.pathname, referrer: blank(document.referrer)
        };
      });
      var lines = ["Hi, I'd like to book " + (n > 1 ? n + ' RM' + TRIAL + ' trials' : 'the RM' + TRIAL + ' trial') + '.', 'Name: ' + name, 'WhatsApp: ' + phone, 'Email: ' + email];
      studentsList.forEach(function (st, i) {
        lines.push((n > 1 ? (i + 1) + '. ' : '') + (st.self ? 'Me' : st.name + ', age ' + st.age) + ' — ' + st.programmeLabel);
      });
      if (get('day')) lines.push('Preferred day: ' + get('day'));
      if (get('message')) lines.push('', get('message'));
      lines.push('Source: ' + source + '.');
      var waLink = waUrl(lines.join('\n'));
      var btn = form.querySelector('[type=submit]'), label = btn.textContent;
      form.dataset.sending = '1'; btn.disabled = true; btn.textContent = 'Sending…';
      fetch(SB_URL + '/rest/v1/trial_leads', {
        method: 'POST', body: JSON.stringify(rows),
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
      }).then(function (res) {
        form.dataset.sending = ''; btn.disabled = false; btn.textContent = label;
        if (res.status !== 201 && res.status !== 204) throw new Error('HTTP ' + res.status);
        allowLeadHit();
        track('trial_requested', { voice: 'academy', programme: studentsList[0].programme, students: n, lead_saved: 'yes', value: TRIAL * n, currency: 'MYR' });
        if (document.documentElement.getAttribute('data-direct-tags') === '1') {
          try { window.gtag && gtag('event', 'generate_lead', { programme: studentsList[0].programme, value: TRIAL * n, currency: 'MYR', transport_type: 'beacon' }); } catch (e) {}
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
