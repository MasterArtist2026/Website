/* Drops leaked generate_lead hits and repeated Ads conversions.
   Loaded synchronously before gtag. GA4 create-event rule 16134847184 copies
   every page_view on this domain into generate_lead. A real form save sets
   window.__maLead.nonce and sends that nonce on the one generate_lead hit.
   Ads conversion hits are capped at one per label per page, plus one more
   when our code arms window.__maLead.armedLabel (a real trial or WhatsApp). */
(function (root) {
  function payloadText(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) return data.toString();
    return '';
  }

  function haystack(url, data) {
    return String(url || '') + '&' + payloadText(data);
  }

  function isGenerateLead(url, data) {
    return /(?:^|[?&#])en=generate_lead(?:&|$)/.test(haystack(url, data));
  }

  function conversionKey(url, data) {
    var hay = haystack(url, data);
    var adsPixel = /googleadservices\.com\/pagead\/conversion/i.test(hay) || /google\.com\/pagead\/conversion/i.test(hay);
    var named = /(?:^|[?&#])en=conversion(?:&|$)/.test(hay);
    if (!adsPixel && !named) return '';
    var label = (hay.match(/(?:^|[?&])(?:label|send_to)=([^&]+)/) || [])[1] || 'conversion';
    try { label = decodeURIComponent(label); } catch (e) { /* keep raw */ }
    return label;
  }

  function freshState(state) {
    state = state || {};
    return {
      nonce: state.nonce || '',
      allowance: state.allowance || 0,
      armedLabel: state.armedLabel || '',
      armUsed: !!state.armUsed,
      counts: Object.assign({}, state.counts || {}),
    };
  }

  /**
   * Decide whether to drop this transport call.
   * Returns { block, state }. state must be kept for the next call.
   */
  function hasNonce(hay, nonce) {
    if (!nonce) return false;
    return hay.indexOf('lead_nonce=' + nonce) !== -1 ||
      hay.indexOf('ep.lead_nonce=' + nonce) !== -1 ||
      hay.indexOf('lead_nonce%3D' + encodeURIComponent(nonce)) !== -1;
  }

  function consumeArm(next) {
    next.armUsed = true;
    next.armedLabel = '';
  }

  function judgeLeadHit(url, data, state) {
    var next = freshState(state);
    var hay = haystack(url, data);
    var body = payloadText(data);

    if (isGenerateLead(url, data)) {
      var armedLead = !!(next.nonce || next.allowance > 0);
      if (!armedLead) return { block: true, state: next };
      // The page-view copy is a readable hit without our nonce. Leave the
      // nonce in place so the real beacon can still pass.
      if (body && next.nonce && !hasNonce(hay, next.nonce)) return { block: true, state: next };
      next.nonce = '';
      next.allowance = 0;
      return { block: false, state: next };
    }

    var key = conversionKey(url, data);
    if (!key) return { block: false, state: next };
    var count = next.counts[key] || 0;
    var armed = !!(next.armedLabel && !next.armUsed && (
      hay.indexOf(next.armedLabel) !== -1 ||
      hay.indexOf(encodeURIComponent(next.armedLabel)) !== -1 ||
      body === ''
    ));
    if (count === 0) {
      next.counts[key] = 1;
      if (armed) consumeArm(next);
      return { block: false, state: next };
    }
    // One extra hit when a trial form or WhatsApp click just armed this label.
    // Every other repeat — the double fire, or a loop on a landing page — drops.
    if (armed) {
      next.counts[key] = count + 1;
      consumeArm(next);
      return { block: false, state: next };
    }
    return { block: true, state: next };
  }

  function install() {
    if (root.__maLeadGate) return;
    root.__maLeadGate = true;
    if (!root.__maLead) root.__maLead = freshState();

    function blocked(url, data) {
      var judged = judgeLeadHit(url, data, root.__maLead || {});
      root.__maLead = judged.state;
      return judged.block;
    }

    if (root.navigator && root.navigator.sendBeacon) {
      var beacon = root.navigator.sendBeacon.bind(root.navigator);
      root.navigator.sendBeacon = function (url, data) {
        if (blocked(url, data)) return true;
        return beacon(url, data);
      };
    }
    if (root.fetch) {
      var origFetch = root.fetch.bind(root);
      root.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var body = init && init.body;
        if (blocked(url, body)) return Promise.resolve(new Response('', { status: 204 }));
        return origFetch(input, init);
      };
    }
    if (typeof HTMLImageElement !== 'undefined') {
      var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (desc && desc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function (value) {
            if (!blocked(value, '')) desc.set.call(this, value);
          },
        });
      }
    }
    if (typeof XMLHttpRequest !== 'undefined') {
      var xo = XMLHttpRequest.prototype.open;
      var xs = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__maUrl = url;
        return xo.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        if (blocked(this.__maUrl, body)) return;
        return xs.apply(this, arguments);
      };
    }
  }

  root.__maJudgeLeadHit = judgeLeadHit;
  install();
})(typeof window !== 'undefined' ? window : globalThis);
