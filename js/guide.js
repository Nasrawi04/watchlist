/* ══════════════════════════════════════════
   guide.js — Help & Guides ("Discover MSF"): how every feature works
   Opened from the footer's Help column and Settings › Help (mssHelp('guide'), nav.js). A side panel L on a
   computer (MSSPanel), a full page on phones. Search first; popular questions; the 16 sections; one article
   per feature (What is it? · Why use it? · How does it work? · Where is it? · a real screenshot on a laptop and
   a phone). The articles are data: js/guide-content.js — every new feature is added there (CLAUDE.md).
   Styles: css/guide.css (loaded here); device frames: §73 in css/style.css.
     MSSGuide.open(articleId?)
══════════════════════════════════════════ */
const MSSGuide = (() => {
  const A = 'assets/onboarding/';
  const esc = s => escHTML(s == null ? '' : String(s));
  const POPULAR = ['final-score', 'tbc', 'episode-ratings', 'movie-night', 'import', 'privacy-overview'];
  const STOP = new Set(['how', 'do', 'i', 'the', 'a', 'an', 'to', 'my', 'what', 'does', 'is', 'can', 'of', 'on', 'in', 'and', 'or', 'it', 'me', 'where', 'mean', 'work', 'works']);
  let h = null, view = null, stack = [];
  const sec = id => MSS_GUIDE_SECTIONS.find(s => s[0] === id);
  const art = id => MSS_GUIDE.find(a => a.id === id);
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const shot = (n, d) => `${A}${n}-${d}-${dark() ? 'dark' : 'light'}.jpg`;
  const page = () => h ? h.isPage : !mssLayerFits(600);   // a full page (phones): Back closes it — no ✕

  async function open(id) {
    await Promise.all([mssLoadScript('js/panel.js'), mssLoadScript('js/guide-content.js'), mssLoadStyle('css/guide.css')]);
    stack = [];
    if (!h || !document.body.contains(h.body)) {
      h = MSSPanel.open({ size: 'L', kind: 'generic', label: 'Help & Guides', head: headHTML(), body: '', onClose: () => { h = null; } });
      wire();
    }
    go(id ? { v: 'article', id } : { v: 'home' }, true);
  }

  /* ── The header: Back (inside the guide) or the title, ✕, and the search ── */
  function headHTML(back) {
    return `<div class="gd-head">
      <div class="gd-top">${back ? `<button type="button" class="gd-back" data-g="back">${icon('chevleft', 16)} ${esc(back)}</button>`
        : `<div class="gd-home-t">${page() ? `<button type="button" class="lyr-back gd-back gd-close" aria-label="Close Help & Guides">${icon('chevleft', 18)}</button>` : ''}<div><span class="gd-eyebrow">Discover MSF</span><h2 class="gd-title">Help &amp; Guides</h2></div></div>`}
        <button type="button" class="lyr-x gd-x" aria-label="Close Help & Guides">${icon('x', 16)}</button></div>
      <div class="sf-search gd-search" role="search"><span class="sf-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input type="search" class="sf-search-input" id="gdQ" placeholder="Search any feature…" aria-label="Search Help & Guides" autocomplete="off" spellcheck="false" enterkeyhint="search">
        <button type="button" class="sf-search-clear" data-g="clear" aria-label="Clear search">${icon('x', 14)}</button>
        <button type="button" class="sf-search-go" tabindex="-1" aria-hidden="true">${icon('search', 16)}<span>Search</span></button></div></div>`;
  }

  function go(next, fresh) {
    if (!fresh && view) stack.push(view);
    view = next;
    draw();
  }
  function draw() {
    const v = view, q = v.v === 'search' ? v.q : '';
    const back = v.v === 'home' ? '' : v.v === 'search' ? 'Help & Guides' : v.v === 'section' ? 'All guides' : (stack.length ? (stack[stack.length - 1].v === 'section' ? sec(stack[stack.length - 1].id)[1] : stack[stack.length - 1].v === 'search' ? 'Results' : 'Help & Guides') : 'Help & Guides');
    if (v.v !== 'search' || !document.getElementById('gdQ')) h.setHead(headHTML(back));
    const qi = document.getElementById('gdQ');
    if (qi && qi.value !== q && v.v !== 'search') qi.value = '';
    qi?.closest('.sf-search').classList.toggle('has-q', !!(qi && qi.value));
    const body = v.v === 'home' ? homeHTML() : v.v === 'section' ? sectionHTML(v.id) : v.v === 'search' ? searchHTML(v.q) : articleHTML(v.id);
    h.setBody(`<div class="gd gd-${v.v} gd-enter">${body}</div>`);
    h.body.scrollTop = 0;
    // a screenshot that isn't there yet (docs/help-guide/capture-signed-in.js makes the signed-in ones): its frame goes, and the figure with the last one
    if (v.v === 'article') h.body.querySelectorAll('.gd-fig img').forEach(img => img.addEventListener('error', () => { const f = img.closest('.gd-fig'); img.closest('.dvf')?.remove(); if (f && !f.querySelector('.dvf')) f.remove(); }, { once: true }));
  }

  /* ── Home: popular questions, then every section ── */
  function homeHTML() {
    return `<div class="gd-lbl">Popular</div><div class="gd-pop">${POPULAR.map(art).filter(Boolean).map(a => `<button type="button" class="gd-chip" data-a="${a.id}">${esc(a.t)}</button>`).join('')}</div>
      <div class="gd-lbl">All guides <span>${MSS_GUIDE_SECTIONS.length} sections · ${MSS_GUIDE.length} articles</span></div>
      <div class="gd-secs">${MSS_GUIDE_SECTIONS.map(([id, name, line, ic], i) => `<button type="button" class="gd-sec" data-s="${id}" style="--i:${i}">
        <span class="gd-oi" aria-hidden="true">${icon(ic, 18)}</span><span><b>${esc(name)}</b><small>${esc(line)}</small></span></button>`).join('')}</div>`;
  }
  function sectionHTML(id) {
    const s = sec(id), list = MSS_GUIDE.filter(a => a.s === id);
    return `<div class="gd-sechead"><span class="gd-oi is-big" aria-hidden="true">${icon(s[3], 22)}</span><div><h3>${esc(s[1])}</h3><p>${esc(s[2])}</p></div></div>
      <div class="gd-list">${list.map((a, i) => `<button type="button" class="gd-row" data-a="${a.id}" style="--i:${i}"><span><b>${esc(a.t)}</b><small>${esc(a.what)}</small></span>${icon('chevright', 16)}</button>`).join('')}</div>`;
  }

  /* ── An article: the five parts, a laptop + a phone, related ── */
  const PARTS = [['what', 'info', 'What is it?'], ['why', 'star', 'Why use it?'], ['how', 'edit', 'How does it work?'], ['where', 'compass', 'Where is it?']];
  function part(a, k) {
    if (k === 'how') return `<ol class="gd-steps">${a.how.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
    if (k === 'where') return `<p class="gd-where">${a.where.map(([l, href]) => href ? `<a class="gd-at" href="${esc(href)}">${esc(l)} ${icon('chevright', 13)}</a>` : `<span class="gd-at">${esc(l)}</span>`).join('')}</p>`;
    return `<p>${esc(a[k])}</p>`;
  }
  function articleHTML(id) {
    const a = art(id); if (!a) return homeHTML();
    const s = sec(a.s), phoneView = page();
    const fig = a.shot ? `<figure class="gd-fig" aria-label="${esc(a.t)} on a laptop and a phone">
        <div class="dvf dvf-lap"><div class="dvf-scr"><div><img src="${shot(a.shot, 'desktop')}" alt="" loading="lazy" decoding="async"></div></div><div class="dvf-base"></div></div>
        <div class="dvf dvf-ph"><div>${mssPhoneBar()}<img src="${shot(a.shot, 'phone')}" alt="" loading="lazy" decoding="async"></div></div></figure>` : '';
    const rel = (a.rel || []).map(art).filter(Boolean);
    const relHTML = rel.length ? `<div class="gd-lbl">Related</div><div class="gd-pop">${rel.map(r => `<button type="button" class="gd-chip" data-a="${r.id}">${icon('link', 13)} ${esc(r.t)}</button>`).join('')}</div>` : '';
    if (phoneView) return `<article class="gd-art is-phone"><div class="gd-hero"><span class="gd-eyebrow">${esc(s[1])}</span><h3>${esc(a.t)}</h3>${fig}</div>
        <nav class="gd-tabs" aria-label="Parts of this guide">${PARTS.map(([k, , l]) => `<a href="#gd-${k}" data-jump="gd-${k}">${l.replace(/\?$/, '').replace(/^(What is it|Why use it|How does it work|Where is it)$/, m => ({ 'What is it': 'What', 'Why use it': 'Why', 'How does it work': 'How', 'Where is it': 'Where' })[m])}</a>`).join('')}</nav>
        <div class="gd-cards">${PARTS.map(([k, ic, l]) => `<section class="gd-card" id="gd-${k}"><span class="gd-k" aria-hidden="true">${icon(ic, 16)}</span><div><h4>${l}</h4>${part(a, k)}</div></section>`).join('')}</div>${relHTML}</article>`;
    return `<article class="gd-art"><span class="gd-eyebrow">${esc(s[1])}</span><h3 class="gd-art-t">${esc(a.t)}</h3>${fig}
      ${PARTS.map(([k, ic, l]) => `<section class="gd-qa"><span class="gd-k" aria-hidden="true">${icon(ic, 15)}</span><div><h4>${l}</h4>${part(a, k)}</div></section>`).join('')}${relHTML}</article>`;
  }

  /* ── Search: every word must match somewhere; titles and keywords count most ── */
  const words = q => q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
  function search(q) {
    const ws = words(q); if (!ws.length) return [];
    return MSS_GUIDE.map(a => {
      const t = a.t.toLowerCase(), k = (a.k || '').toLowerCase(), body = [a.what, a.why, ...a.how].join(' ').toLowerCase(), sn = sec(a.s)[1].toLowerCase();
      let sc = 0;
      for (const w of ws) {
        const st = w.length > 3 ? w.replace(/(ing|ed|es|s)$/, '') : w;           // "ratings" finds "rating", "rated"
        const hit = x => x.includes(st);
        const p = (hit(t) ? 6 : 0) + (hit(k) ? 4 : 0) + (hit(sn) ? 2 : 0) + (hit(body) ? 1 : 0);
        if (!p) return null;
        sc += p;
      }
      return { a, sc };
    }).filter(Boolean).sort((x, y) => y.sc - x.sc).slice(0, 20).map(x => x.a);
  }
  const mark = (text, ws) => { let out = esc(text);
    ws.forEach(w => { const st = w.length > 3 ? w.replace(/(ing|ed|es|s)$/, '') : w; if (st.length < 2) return;
      out = out.replace(new RegExp(`(${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}]*)`, 'giu'), '<mark>$1</mark>'); });
    return out; };
  function searchHTML(q) {
    const hits = search(q), ws = words(q);
    if (!hits.length) return `<div class="gd-none"><b>No guides match “${esc(q.trim())}”.</b><span>Try another word — or browse the sections.</span>
      <button type="button" class="gd-chip" data-g="home">All guides</button></div>`;
    return `<div class="gd-lbl" aria-live="polite">${hits.length} result${hits.length === 1 ? '' : 's'}</div><div class="gd-list">${hits.map((a, i) => `<button type="button" class="gd-row is-hit" data-a="${a.id}" style="--i:${i}">
      <span><span class="gd-cat">${esc(sec(a.s)[1])}</span><b>${mark(a.t, ws)}</b><small>${mark(a.what, ws)}</small></span>${icon('chevright', 16)}</button>`).join('')}</div>`;
  }

  function wire() {
    let T = null;
    const panel = h.body.closest('.lyr') || document;
    panel.addEventListener('input', ev => {
      if (ev.target.id !== 'gdQ') return;
      const q = ev.target.value;
      ev.target.closest('.sf-search').classList.toggle('has-q', !!q);
      clearTimeout(T);
      T = setTimeout(() => {
        if (q.trim()) { if (view.v === 'search') { view.q = q; draw(); } else go({ v: 'search', q }); }
        else if (view.v === 'search') { view = stack.pop() || { v: 'home' }; draw(); }
      }, 160);
    });
    panel.addEventListener('click', ev => {
      const t = ev.target.closest('[data-a],[data-s],[data-g],[data-jump],.gd-at[href]');
      if (!t) return;
      if (t.dataset.jump) { ev.preventDefault(); h.body.querySelector('#' + t.dataset.jump)?.scrollIntoView({ behavior: mssReducedMotion() ? 'auto' : 'smooth', block: 'start' }); return; }
      if (t.matches('.gd-at[href]')) { h.closeNow(); return; }          // leave for that page
      if (t.dataset.a) return go({ v: 'article', id: t.dataset.a });
      if (t.dataset.s) return go({ v: 'section', id: t.dataset.s });
      if (t.dataset.g === 'home') { stack = []; view = { v: 'home' }; return draw(); }
      if (t.dataset.g === 'clear') { const qi = document.getElementById('gdQ'); qi.value = ''; qi.dispatchEvent(new Event('input', { bubbles: true })); qi.focus(); return; }
      if (t.dataset.g === 'back') { view = stack.pop() || { v: 'home' }; draw(); }
    });
  }
  return { open };
})();
