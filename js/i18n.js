/* ═══════════════════════════════════════════════════════════════
   i18n.js — the site's own text in the user's language (MSSI18n).
   Loaded in the <head> of every page, before anything is drawn.

   The language is the one picked in Settings → Language (MSSLang,
   config.js; stored as 'mss_lang'). When the site has its own text in
   that language (UI_LANGS), the page is translated; otherwise it stays
   in English and only TMDB content follows the language.

   How it works — no page code has to change:
   • js/lang/<code>.json maps English text → translated text. {0}, {1}…
     stand for numbers / names: "{0} picks" → "{0} انتخاب".
   • Every text node and the placeholder / aria-label / title / alt of
     every element is looked up as it's added to the page (a
     MutationObserver, from the first byte of <body>), so dynamic
     popups, toasts and cards are translated too. Canvas text (create
     cards, exports) goes through the same lookup.
   • Anything inside [translate="no"] (titles, notes, usernames — people's
     own words) is left alone, and anything without a translation stays in
     English. Saved data never changes: only what's on screen does.
   • Right-to-left languages set <html dir="rtl">; the CSS uses logical
     properties (margin-inline-start…), so the layout mirrors itself.
   • English: none of this runs — no observer, no extra request.

   The dictionary is kept on the device (localStorage) so a page never
   waits for it; it's refreshed in the background when VERSION changes.

     mssT('Saved.')                    → translated string (canvas / JS-built text)
     mssT('Season {0}', 3)             → 'Temporada 3'
     MSSI18n.lang / .dir / .locale     → 'fa' / 'rtl' / 'fa-IR-u-nu-latn'
     MSSI18n.has(code)                 → is there a site translation for this TMDB language?
     MSSI18n.prepare(code)             → Promise: download + keep a language before switching to it
═══════════════════════════════════════════════════════════════ */
const MSSI18n = (() => {
  const VERSION = '2';
  const UI_LANGS = ['ar', 'fa', 'hr', 'es', 'fr', 'pt', 'de', 'it', 'tr', 'ru', 'hi', 'ur', 'ja', 'zh'];
  const RTL = new Set(['ar', 'fa', 'ur', 'he']);
  const STORE = 'mss_i18n_';
  // A {0} that captured part of an English sentence ("rate its") isn't a name or a number
  const FRAGMENT = /(^|\s)(its|the|a|an|to|of|for|and|or|you|your|their|whether|with|is|are|was|be)$|^(its|the|to|of|for|and|or|you|your|their|whether|with|is|are|was)\s|(\S+\s+){6,}/;
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'label'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'NOSCRIPT']);

  const base = c => String(c || '').split('-')[0];
  const has = c => UI_LANGS.includes(base(c));
  let code = 'en-US';
  try { code = localStorage.getItem('mss_lang') || 'en-US'; } catch {}
  const lang = has(code) ? base(code) : 'en';
  const dir = RTL.has(lang) ? 'rtl' : 'ltr';
  const locale = lang === 'en' ? 'en-US' : (/-/.test(code) ? code : lang) + '-u-nu-latn';

  const root = document.documentElement;
  root.lang = lang === 'en' ? 'en' : code;
  root.dir = dir;

  let exact = new Map(), upper = new Map(), patterns = [];

  function compile(dict) {
    exact = new Map(); upper = new Map(); patterns = [];
    for (const [k, v] of Object.entries(dict || {})) {
      if (typeof v !== 'string' || !v) continue;
      if (!/\{\d+\}/.test(k)) { exact.set(k, v); upper.set(k.toUpperCase(), v); continue; }
      const parts = k.split(/(\{\d+\})/), order = [];
      const re = parts.map(p => {
        const m = p.match(/^\{(\d+)\}$/);
        if (m) { order.push(+m[1]); return '(.+?)'; }
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      const lits = parts.filter(p => !/^\{\d+\}$/.test(p));
      const anchor = lits.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), '');
      if (anchor.length < 2) continue;                      // "{0}" alone would match anything
      // a placeholder in quotes or after @ is a name / title: what it captured is never translated
      const quoted = order.map(i => new RegExp(`[“"‘'@]\\{${i}\\}`).test(k));
      patterns.push({ re: new RegExp('^' + re + '$'), order, v, anchor, quoted, weight: lits.join('').length });
    }
    patterns.sort((a, b) => b.weight - a.weight);
  }
  const fill = (str, args) => str.replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : m));

  // English text (whitespace collapsed) → translation, or null
  function lookup(s) {
    if (!s || s.length > 600) return null;
    const hit = exact.get(s);
    if (hit != null) return hit;
    for (const p of patterns) {
      if (!s.includes(p.anchor)) continue;
      const m = s.match(p.re);
      if (!m) continue;
      const args = [];
      let ok = true;
      p.order.forEach((idx, g) => {
        const val = m[g + 1];
        if (!p.quoted[g] && !exact.has(val) && FRAGMENT.test(val)) ok = false;
        args[idx] = (!p.quoted[g] && exact.get(val)) || val;
      });
      if (!ok) continue;
      return fill(p.v, args);
    }
    return null;
  }

  // For text built in JS (canvas, labels): mssT('Season {0}', 3)
  function t(str, ...args) {
    const s = String(str);
    const out = (lang !== 'en' && exact.get(s)) || s;
    return fill(out, args);
  }

  // ── DOM ──
  const done = new WeakMap();   // text node → the value we last wrote (skip our own writes)
  function textNode(n) {
    const raw = n.data;
    if (done.get(n) === raw || !/[A-Za-z]/.test(raw)) return;
    const s = raw.replace(/\s+/g, ' ').trim();
    const v = lookup(s);
    if (v == null) return;
    const out = raw.match(/^\s*/)[0] + v + raw.match(/\s*$/)[0];
    done.set(n, out);
    if (out !== raw) n.data = out;
  }
  function attrs(el) {
    for (const a of ATTRS) {
      const raw = el.getAttribute(a);
      if (!raw || !/[A-Za-z]/.test(raw)) continue;
      const v = lookup(raw.replace(/\s+/g, ' ').trim());
      if (v != null && v !== raw) el.setAttribute(a, v);
    }
  }
  const skipped = (el, self) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (e === self && e.tagName === 'TEXTAREA') continue;   // a textarea's placeholder is still ours
      if (SKIP.has(e.tagName) || e.getAttribute('translate') === 'no' || e.isContentEditable) return true;
    }
    return false;
  };
  function walk(node) {
    if (node.nodeType === 3) { if (!skipped(node.parentNode)) textNode(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1 && skipped(node, node)) return;
    if (node.nodeType === 1) attrs(node);
    if (node.nodeType === 1 && node.tagName === 'TEXTAREA') return;
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: x => {
        if (x.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (x.tagName === 'TEXTAREA') { if (x.getAttribute('translate') !== 'no') attrs(x); return NodeFilter.FILTER_REJECT; }
        return (SKIP.has(x.tagName) || x.getAttribute('translate') === 'no' || x.isContentEditable) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let x = tw.nextNode(); x; x = tw.nextNode()) x.nodeType === 3 ? textNode(x) : attrs(x);
  }
  function title() {
    const v = lookup(document.title.trim());
    if (v) document.title = v;
  }

  function start() {
    if (lang === 'en' || !exact.size) return;
    new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === 'childList') r.addedNodes.forEach(walk);
        else if (r.type === 'characterData') { if (!skipped(r.target.parentNode)) textNode(r.target); }
        else if (r.type === 'attributes' && !skipped(r.target, r.target)) attrs(r.target);
      }
    }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(root);
    title();
    document.addEventListener('DOMContentLoaded', title);
    // Canvas (create cards, exports): same dictionary; uppercase labels stay uppercase
    const C = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (C) {
      const tr = s => {
        if (typeof s !== 'string' || !/[A-Za-z]/.test(s)) return s;
        const k = s.replace(/\s+/g, ' ').trim();
        let v = lookup(k);
        if (v == null && k === k.toUpperCase()) {
          const u = upper.get(k);
          if (u != null) v = u.toLocaleUpperCase(lang);
          else {
            const titled = k.charAt(0) + k.slice(1).toLowerCase();
            const w = lookup(titled);
            if (w != null) v = w.toLocaleUpperCase(lang);
          }
        }
        return v == null ? s : v;
      };
      for (const fn of ['fillText', 'strokeText', 'measureText']) {
        const orig = C[fn];
        C[fn] = function (s, ...rest) { return orig.call(this, tr(s), ...rest); };
      }
    }
  }

  function read(l) {
    try { return JSON.parse(localStorage.getItem(STORE + l) || 'null'); } catch { return null; }
  }
  function keep(l, d) {
    try {
      UI_LANGS.forEach(x => { if (x !== l) localStorage.removeItem(STORE + x); });   // only one language on the device
      localStorage.setItem(STORE + l, JSON.stringify(d));
    } catch {}
  }
  async function download(l) {
    const res = await fetch(`js/lang/${l}.json?v=${VERSION}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('lang ' + l + ' ' + res.status);
    const d = { v: VERSION, strings: await res.json() };
    keep(l, d);
    return d;
  }
  // Before switching (Settings / another device's choice): have the words ready
  async function prepare(c) {
    const l = base(c);
    if (!has(c)) return;
    const d = read(l);
    if (!d || d.v !== VERSION) await download(l);
  }

  if (lang !== 'en') {
    const d = read(lang);
    if (d) { compile(d.strings); start(); }
    if (!d || d.v !== VERSION) {
      // No words on this device yet (storage cleared): hide the page — 3s at most — rather than flash English
      const reveal = () => root.removeAttribute('data-i18n-wait');
      if (!d) {
        root.setAttribute('data-i18n-wait', '');
        document.head.insertAdjacentHTML('beforeend', '<style>html[data-i18n-wait] body{visibility:hidden}</style>');
        setTimeout(reveal, 3000);
      }
      download(lang).then(fresh => { if (!d) { compile(fresh.strings); start(); } }).catch(() => {}).finally(reveal);
    }
  } else {
    try { UI_LANGS.forEach(x => localStorage.removeItem(STORE + x)); } catch {}
  }

  return { t, has, prepare, lang, dir, locale, UI_LANGS, get isRTL() { return dir === 'rtl'; } };
})();
const mssT = MSSI18n.t;
