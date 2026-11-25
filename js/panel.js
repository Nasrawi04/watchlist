/* ══════════════════════════════════════════
   PANELS, FULL PAGES AND ⋯ MENUS — the popups redesign's shared layers (styles: "Layers" in style.css)
   Loaded when first needed: mssLoadScript('js/panel.js').

   MSSPanel.open(o) → a handle
     o.size      'S' (440px) | 'L' (600px) — a side panel from the right, full height, while it leaves
                 at least 320px of the page beside it; otherwise (phones, small tablets, short
                 landscape screens) a full page with a back arrow and a bottom bar — except an 'S'
                 panel, which is a bottom sheet there (owner, 25 Nov 2026: small things don't need a
                 whole page): a grab handle, as tall as what's in it (up to ~64% of the screen); drag
                 it up for the full height (its content scrolls then), down to make it smaller or close
                 it; tap outside or ✕ to close; it sits on top of the keyboard. o.sheet: false → a full
                 page instead (kind 'title' and o.head panels are always full pages)
     o.kind      'title'   → the header shows the title's backdrop behind the title (o.backdrop = an entry → its
                               owner's backdrop, or { type: 'tv' | 'movie', id } → yours — MSSBackdrop; o.tallHero → a taller picture; o.heroImg = an image URL to use instead (an episode's still); o.poster = an image URL → the poster beside the title); no backdrop → a plain title row
                 'generic' → no header bar on a side panel: the title sits at the top of the body
                               (it scrolls with it) with ✕ on its right; a full page keeps its
                               back arrow + title row
     o.title, o.subtitle, o.label (accessible name when the title is a show name, optional)
     o.media     an image URL shown full width (16:9) at the top of the body, no shade over it, so the
                 title row stays above it and the details go under it (an episode's still)
     o.body      Node | HTML string
     o.footer    { secondary: [{ label, onClick, icon, lead, end, only, disabled }], primary: { label, onClick, disabled, lead } }
                 — secondary on the left (end: true → on the right, next to the primary; icon → a 40px
                 icon button with label as its name; lead → an icon (svg HTML) before the label;
                 only: 'side' | 'page' → shown in that mode only; stack: true → on a full page the
                 primary gets its own row above the others),
                 primary on the right; a full page shows them as equal 48px buttons. An async
                 primary shows a spinner in the button and keeps the panel until it finishes;
                 if it throws, a banner at the top of the body offers Try again.
                 { dock: Node | HTML } instead → that content pinned at the bottom (a reply box with its button)
     o.route, o.id   the address shows ?panel=route&pid=id (pid, so the page's own ?id= stays), so links and Back work (see route())
     o.dirty     () => true while there are unsaved changes → closing asks "Discard changes?"
     o.create    true → as a full page it slides up (a new thing, like + Add) instead of in from the right
     o.as        'page' → always a full page (the ⋯ menu's action page)
     o.onClose   called once it has closed
     o.head      Node | HTML — a header of the panel's own instead of the title row (its ✕ / Back are
                 buttons with class lyr-x / lyr-back); o.label names the panel then
   Opening a panel while one is open replaces it; Back (header, system Back, Esc on the new one)
   returns to the one before, as it was. At most one panel + one confirm above it.

   handle.body   the scrolling content element      handle.setTitle(title, subtitle)
   handle.setBody(nodeOrHtml, morph)   handle.setHead(nodeOrHtml, morph)  (morph: update in place — mssMorph — instead of rebuilding)   handle.setRoute(id) (a new ?id=, same history entry)   handle.setFooter(footer)   handle.busy(on)   handle.setMedia(url | null)
   handle.setPrimary({ label, disabled })   handle.setHero(url | null)   handle.setPoster(url | null)   handle.isPage (a full page right now)
   handle.fieldError(input, message | '')   handle.banner(message | '', retryFn)
   handle.close()  (asks first when dirty)   handle.closeNow()

   MSSPanel.route(name, fn(id))  — what opens ?panel=name&id=… (from a link, or Forward)
   MSSPanel.current()            — the open handle, or null

   MSSPopover.open(button, { title, subtitle, label, create, sheet, align, items: [{ label, sub, icon, onSelect, danger, divider, on }] })
     align: 'start' → the menu lines up with the button's left edge (default: its right edge). on: the current choice (highlighted, ✓).
     A 240px menu under the button (flips up near the bottom of the screen; ↑ ↓ Home End Enter Esc),
     or on narrow screens a bottom sheet of 64px rows (a small panel — MSSPanel's sheet). sheet: true → a
     sheet that slides up from the bottom instead (one row per action; drag it down, tap outside or
     Esc to close). sub: a one-line
     description under the label. Choosing closes it first, then runs onSelect.
   MSSPopover.close()   MSSPopover.closeOpen() → closes an open desktop menu (true) or does nothing (false)

   mssRowHTML({ img, title, sub, attrs, href, round, tag }) — one result row for a picker panel (inside <ul class="lyr-rows">)

   mssSegHTML({ label, labelledby, options: [[value, text, disabled]], value, cols, strong, data })
     A segmented choice (role radiogroup; ← → / ↑ ↓ move and choose, like radio buttons). cols → a grid
     of that many columns; strong → 40px options, the chosen one filled green (a main choice). Each option is a button with data-v="value" (+ data-<data> attributes), so the
     page listens for clicks on [data-v] itself; mssSegPick(button) marks one chosen and returns its value.
══════════════════════════════════════════ */
const MSS_LAYER_ROOM = 320;                                     // page that must stay visible beside a side panel
const mssLayerFits = w => innerWidth >= w + MSS_LAYER_ROOM && innerHeight >= 480;
const mssReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const MSSPanel = (() => {
  const WIDTH = { S: 440, L: 600 };
  const stack = [];          // open panels, last = shown; the ones under it are kept (hidden) for Back
  const routes = {};
  let n = 0, hist = 0;       // history entries this page pushed for panels
  let closing = false;

  const sideFor = o => o.as !== 'page' && mssLayerFits(WIDTH[o.size] || WIDTH.S);
  // not beside the page: a small panel is a bottom sheet, anything else a full page
  const sheetFor = o => o.as !== 'page' && o.sheet !== false && (o.size || 'S') === 'S' && o.kind !== 'title' && o.head == null;
  const html = x => typeof x === 'string' ? x : '';

  function header(P) {
    if (P.o.head != null) return '<header class="lyr-head"></header>';
    const o = P.o, back = `<button type="button" class="lyr-back" aria-label="Back">${icon('back', 20)}</button>`;
    const x = `<button type="button" class="lyr-x" aria-label="Close">${icon('x', 18)}</button>`;
    const t = `<h2 class="lyr-title" id="${P.id}-t"></h2><p class="lyr-sub" id="${P.id}-s" hidden></p>`;
    if (o.kind === 'title') return `<header class="lyr-hero"><span class="lyr-hero-img" aria-hidden="true"></span><span class="lyr-hero-shade" aria-hidden="true"></span>
        ${back}${o.poster ? `<span class="lyr-hero-poster" aria-hidden="true"><img src="${escHTML(safeURL(o.poster))}" alt=""></span>` : ''}<div class="lyr-hero-txt">${t}</div>${x}</header>`;
    return `<header class="lyr-bar">${back}<div class="lyr-bar-txt"><h2 class="lyr-title" aria-hidden="true"></h2><p class="lyr-sub" aria-hidden="true" hidden></p></div></header>`;
  }
  function build(P) {
    const o = P.o, ov = document.createElement('div');
    ov.className = 'lyr' + (o.kind === 'title' ? ' is-title' : ' is-generic') + (o.create ? ' is-create' : '') + (o.tallHero ? ' is-tall-hero' : '');
    ov.style.setProperty('--lyr-w', (WIDTH[o.size] || WIDTH.S) + 'px');
    ov.innerHTML = `<section class="lyr-card" role="dialog" aria-modal="true" aria-labelledby="${P.id}-t" tabindex="-1">
        <span class="lyr-grab" aria-hidden="true"></span>
        ${header(P)}
        <div class="lyr-body">
          ${o.kind === 'title' || o.head != null ? '' : `<div class="lyr-top"><button type="button" class="lyr-back" aria-label="Back">${icon('back', 20)}</button><div class="lyr-top-txt"><h2 class="lyr-title" id="${P.id}-t"></h2><p class="lyr-sub" id="${P.id}-s" hidden></p></div>
            <button type="button" class="lyr-x" aria-label="Close">${icon('x', 18)}</button></div>`}
          <figure class="lyr-media" hidden><img alt=""></figure>
          <div class="lyr-banner cf-banner" role="alert" hidden></div>
          <div class="lyr-content"></div>
        </div>
        <footer class="lyr-foot" hidden></footer>
      </section>`;
    if (o.label) ov.firstElementChild.setAttribute('aria-label', o.label);
    if (o.head != null) { ov.firstElementChild.removeAttribute('aria-labelledby'); setHead({ ov }, o.head); }
    ov.addEventListener('click', ev => {
      // ✕ / the page around it: every panel. Only this handler runs — MSSDialog.bind's own outside-click close would
      // step back in history a second time and leave the page.
      if (ev.target === ov || ev.target.closest('.lyr-x')) { ev.stopImmediatePropagation(); return closeAll(); }
      if (ev.target.closest('.lyr-back')) requestClose(P);                        // Back: the one before
    });
    edgeSwipe(P, ov);
    sheetDrag(P, ov);
    return ov;
  }
  function paintMode(P) {
    const side = sideFor(P.o), sheet = !side && sheetFor(P.o), was = P.ov.classList.contains('is-sheet');
    P.ov.classList.toggle('is-side', side);
    // a sheet is "a phone layout" too (is-page: the phone sizes, no field focused on open), drawn as a sheet (is-sheet)
    P.ov.classList.toggle('is-page', !side);
    P.ov.classList.toggle('is-sheet', sheet);
    // Back instead of ✕ when this panel replaced another one (side panels, sheets); full pages always have Back
    P.ov.classList.toggle('has-back', (side || sheet) ? stack.indexOf(P) > 0 : true);
    if (sheet !== was) { sheetKeyboard(P, sheet); if (!sheet) sheetOff(P); else if (P.ov.classList.contains('open')) sheetOn(P); }
  }
  function setTitle(P, title, sub) {
    P.ov.querySelectorAll('.lyr-title').forEach(el => { el.textContent = title || ''; });
    P.ov.querySelectorAll('.lyr-sub').forEach(el => { el.textContent = sub || ''; el.hidden = !sub; });
    if (sub) P.ov.firstElementChild.setAttribute('aria-describedby', `${P.id}-s`); else P.ov.firstElementChild.removeAttribute('aria-describedby');
  }
  function setBody(P, b, morph) {
    const c = P.ov.querySelector('.lyr-content');
    if (b instanceof Node) c.replaceChildren(b); else if (morph && typeof mssMorph === 'function') mssMorph(c, html(b)); else c.innerHTML = html(b);
  }
  function setHead(P, h, morph) {
    const el = P.ov.querySelector('.lyr-head'); if (!el) return;
    if (h instanceof Node) el.replaceChildren(h); else if (morph && typeof mssMorph === 'function') mssMorph(el, html(h)); else el.innerHTML = html(h);
  }
  function setRoute(P, id) {
    P.o.id = id;
    if (P.hist) try { history.replaceState(history.state, '', url(P.o)); } catch {}
  }
  function setMedia(P, src) {
    const fig = P.ov.querySelector('.lyr-media'), im = fig.firstElementChild;
    fig.hidden = !src;
    if (!src) { im.removeAttribute('src'); return; }
    fig.classList.remove('is-loaded');
    im.onload = () => fig.classList.add('is-loaded');
    im.src = src;
  }
  function setFooter(P, f, morph) {
    const foot = P.ov.querySelector('.lyr-foot');
    P.o.footer = f;
    foot.hidden = !f;
    foot.classList.toggle('is-dock', !!f?.dock);
    if (!f) { foot.innerHTML = ''; return; }
    if (f.dock) { foot.onclick = null; if (f.dock instanceof Node) foot.replaceChildren(f.dock); else if (morph && typeof mssMorph === 'function') mssMorph(foot, f.dock); else foot.innerHTML = f.dock; return; }
    const sec = f.secondary || [];
    const btn = (b, i) => `<button type="button" class="lyr-btn${b.icon ? ' is-icon' : ''}${b.only ? ' only-' + b.only : ''}" data-i="${i}"${b.disabled ? ' disabled' : ''}${b.icon ? ` aria-label="${escHTML(b.label)}" title="${escHTML(b.label)}"` : ''}>${b.icon ? icon(b.icon, 18) : `${b.lead || ''}<span>${escHTML(b.label)}</span>`}</button>`;
    foot.innerHTML = `<div class="lyr-foot-sec">${sec.map((b, i) => b.end ? '' : btn(b, i)).join('')}</div>`
      + sec.map((b, i) => b.end ? btn(b, i) : '').join('')
      + (f.primary ? `<button type="button" class="lyr-btn is-primary${f.primary.danger ? ' is-danger' : ''}" data-p="1"${f.primary.disabled ? ' disabled' : ''}>${f.primary.lead || ''}<span>${escHTML(f.primary.label)}</span></button>` : '');
    foot.classList.toggle('is-single', !sec.length || !f.primary);
    foot.classList.toggle('is-stack', !!f.stack);
    foot.onclick = ev => {
      const b = ev.target.closest('.lyr-btn'); if (!b || b.disabled) return;
      if (b.dataset.p) return runPrimary(P, b);
      sec[Number(b.dataset.i)]?.onClick?.(P.handle, b);
    };
  }
  function setPrimary(P, { label, disabled } = {}) {
    const b = P.ov.querySelector('.lyr-foot [data-p]'), f = P.o.footer?.primary; if (!b || !f) return;
    if (label != null) { f.label = label; b.lastElementChild.textContent = label; }
    if (disabled != null) { f.disabled = disabled; b.disabled = disabled; }
  }
  async function runPrimary(P, btn) {
    const fn = P.o.footer?.primary?.onClick; if (!fn) return;
    banner(P, '');
    busy(P, true);
    try { await fn(P.handle); }
    catch (err) {
      console.error('Panel save:', err);
      btn.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 150, iterations: 2 });
      banner(P, 'Couldn’t save that — check your connection and try again.', () => runPrimary(P, btn));
    } finally { if (P.ov.isConnected) busy(P, false); }
  }
  function busy(P, on) {
    P.ov.querySelectorAll('.lyr-foot .lyr-btn').forEach(b => {
      if (b.dataset.p) { b.classList.toggle('btn-busy', on); on ? b.setAttribute('aria-busy', 'true') : b.removeAttribute('aria-busy'); if (!on) b.disabled = !!P.o.footer?.primary?.disabled; }
      else b.disabled = on;
    });
  }
  function banner(P, msg, retry) {
    const el = P.ov.querySelector('.lyr-banner');
    el.hidden = !msg;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = `${icon('info', 16)}<span></span>${retry ? '<button type="button" class="lyr-retry">Try again</button>' : ''}`;
    el.querySelector('span').textContent = msg;
    if (retry) el.querySelector('.lyr-retry').onclick = () => { banner(P, ''); retry(); };
    P.ov.querySelector('.lyr-body').scrollTop = 0;
  }
  function fieldError(input, msg) {
    if (!input) return;
    const id = (input.id || (input.id = 'lyr-f' + (++n))) + '-err';
    let m = document.getElementById(id);
    input.classList.toggle('is-invalid', !!msg);
    if (!msg) { m?.remove(); input.removeAttribute('aria-invalid'); input.removeAttribute('aria-errormessage'); return; }
    if (!m) { m = document.createElement('p'); m.className = 'lyr-field-err'; m.id = id; input.insertAdjacentElement('afterend', m); }
    m.textContent = msg;
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-errormessage', id);
  }
  async function hero(P) {
    const b = P.o.backdrop, box = P.ov.querySelector('.lyr-hero');
    if (!box) return;
    if (P.o.heroImg) return setHero(P, P.o.heroImg);
    if (!b) return;
    const u = await MSSBackdrop.url(b);               // an entry (its owner's backdrop) or { type, id } (yours)
    if (u && P.ov.isConnected) setHero(P, u);
  }
  // the poster beside the title in a title header (added when it arrives later)
  function setPoster(P, src) {
    const box = P.ov.querySelector('.lyr-hero'); src = safeURL(src); if (!box) return;
    let el = box.querySelector('.lyr-hero-poster');
    if (!src) { el?.remove(); return; }
    if (!el) { el = document.createElement('span'); el.className = 'lyr-hero-poster'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<img alt="">'; box.querySelector('.lyr-hero-txt').before(el); }
    el.firstElementChild.src = src;
  }
  // the picture behind a title header (it shows once loaded; null → the plain title row)
  function setHero(P, src) {
    const box = P.ov.querySelector('.lyr-hero'); if (!box) return;
    P.heroSrc = src = safeURL(src);
    if (!src) { box.classList.remove('has-img'); box.querySelector('.lyr-hero-img').style.backgroundImage = ''; return; }
    const im = new Image();
    im.onload = () => { if (P.heroSrc !== src || !P.ov.isConnected) return; box.querySelector('.lyr-hero-img').style.backgroundImage = `url('${src}')`; box.classList.add('has-img'); };
    im.src = src;
  }

  /* ── history: every panel is one history entry, so Back closes the top one ── */
  function url(o) {
    const u = new URL(location.href);
    // the panel's own id is ?pid= — a page's ?id= (a friend's profile, a person, a title) is never touched (owner, 14 Nov 2026)
    u.searchParams.delete('panel'); u.searchParams.delete('pid');
    if (o?.route) { u.searchParams.set('panel', o.route); if (o.id != null) u.searchParams.set('pid', o.id); }
    return u.pathname + u.search + u.hash;
  }
  let backing = false;   // a Back we asked for hasn't landed yet: never ask twice (it would leave the page)
  // When this loads no panel is open, so the entry we're on is the page itself — even if it still says
  // "a panel was open" (a reload after one was, or coming Back onto it). Left as it was, closing the next
  // panel stepped back onto that entry and the panel stayed open (Movie Night's Create, 16 Nov 2026).
  if (history.state?.mssPanel) try { history.replaceState({ ...history.state, mssPanel: 0 }, ''); } catch {}
  const goBack = n => { backing = true; history.go(-n); setTimeout(() => { backing = false; }, 1500); };
  addEventListener('popstate', ev => {
    backing = false;
    if (!stack.length) return;
    const depth = ev.state?.mssPanel || 0;
    if (depth >= stack.length) return;
    // a confirm on top closes first; the panel stays (and gets its history entry back)
    const top = MSSDialog.top();
    if (top && !stack.some(P => P.ov === top)) { top._mssClose?.(); history.pushState({ mssPanel: stack.length }, '', url(stack[stack.length - 1].o)); return; }
    const P = stack[stack.length - 1];
    if (P.o.dirty?.() && !P.asking) {
      history.pushState({ mssPanel: stack.length }, '', url(P.o));
      askDiscard(P).then(ok => { if (ok) { P.o.dirty = null; history.back(); } });
      return;
    }
    hist = depth;
    while (stack.length > depth) pop(stack[stack.length - 1]);
  });
  function askDiscard(P) {
    P.asking = true;
    return showConfirm({ title: 'Discard changes?', message: 'Your changes won’t be saved.', confirmText: 'Discard', cancelText: 'Keep editing', iconName: 'x', danger: false })
      .finally(() => { P.asking = false; });
  }
  // Esc / back arrow / edge swipe / system Back close the top panel: unsaved changes ask first
  async function requestClose(P) {
    if (P !== stack[stack.length - 1] || closing || backing) return;
    if (P.o.dirty?.()) { if (!(await askDiscard(P))) return; P.o.dirty = null; }
    if (P.hist && hist === stack.length) goBack(1);
    else pop(P);
  }
  // ✕ and the dimmed page close them all (asking once if any has unsaved changes)
  async function closeAll() {
    if (closing || backing || !stack.length) return;
    if (stack.some(P => P.o.dirty?.())) { if (!(await askDiscard(stack[stack.length - 1]))) return; stack.forEach(P => { P.o.dirty = null; }); }
    const k = stack.filter(P => P.hist).length;
    if (k && hist === stack.length) goBack(k);
    else [...stack].reverse().forEach(pop);
  }

  function show(P, how) {
    const ov = P.ov;
    paintMode(P);
    ov.classList.remove('is-leaving', 'is-under');
    ov.classList.add('open');
    if (ov.classList.contains('is-sheet')) { if (!P.sh) sheetOn(P); else { sheetMeasure(P); sheetPlace(P, P.sh.stops[P.sh.at], false); } }
    if (how) { ov.classList.add(how); setTimeout(() => ov.classList.remove(how), 300); }
  }
  let forward = false;
  function open(o = {}) {
    const P = { o: { size: 'S', kind: 'generic', ...o, _entry: forward }, id: 'lyr' + (++n) };
    P.handle = {
      get body() { return P.ov.querySelector('.lyr-content'); },
      setTitle: (t, s) => setTitle(P, t, s), setBody: (b, m) => setBody(P, b, m), setFooter: (f, m) => setFooter(P, f, m),
      setMedia: src => setMedia(P, src), setHead: (h, m) => setHead(P, h, m), setRoute: id => setRoute(P, id), setHero: src => setHero(P, src), setPoster: src => setPoster(P, src), setPrimary: o => setPrimary(P, o), get isPage() { return P.ov.classList.contains('is-page'); },   // full pages and sheets (phones)
      busy: on => busy(P, on), banner: (m, r) => banner(P, m, r), fieldError,
      close: () => requestClose(P), closeNow: () => { P.o.dirty = null; requestClose(P); },
    };
    P.ov = build(P);
    setTitle(P, P.o.title, P.o.subtitle);
    setBody(P, P.o.body);
    setFooter(P, P.o.footer || null);
    setMedia(P, P.o.media || null);
    const under = stack[stack.length - 1];
    if (under) { under.ov.classList.add('is-under'); under.ov.classList.remove('open'); }
    stack.push(P);
    document.body.appendChild(P.ov);
    MSSDialog.bind(P.ov, () => requestClose(P));
    show(P, under ? 'is-swap' : 'is-entering');
    MSSDialog.open(P.ov, { focus: P.ov.firstElementChild });          // read out by its title
    // one history entry per panel (an address that names it when it has a route); Forward onto one
    // already has its entry
    if (P.o._entry) { hist = stack.length; P.hist = true; }
    else try { history.pushState({ mssPanel: stack.length }, '', url(P.o)); hist = stack.length; P.hist = true; } catch {}
    if (P.o.kind === 'title') hero(P);
    return P.handle;
  }
  function pop(P) {
    const i = stack.indexOf(P); if (i === -1) return;
    stack.splice(i, 1);
    const under = stack[stack.length - 1];
    const ov = P.ov;
    ov.classList.add('is-leaving');
    const done = () => {
      sheetKeyboard(P, false);
      P.sh?.ro?.disconnect();
      MSSDialog.close(ov);
      ov.remove();
      P.o.onClose?.();
    };
    if (under) { show(under, 'is-swap'); done(); return; }
    closing = true;
    setTimeout(() => { closing = false; done(); }, mssReducedMotion() ? 120 : ov.classList.contains('is-sheet') ? 220 : ov.classList.contains('is-page') ? 240 : 180);
  }

  /* phones: swipe from the left edge to go back — the page follows your finger */
  function edgeSwipe(P, ov) {
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, id = null, card = null;
    ov.addEventListener('pointerdown', ev => {
      if (ev.pointerType !== 'touch' || !ov.classList.contains('is-page') || ov.classList.contains('is-sheet') || ev.clientX > 24) return;
      id = ev.pointerId; x0 = ev.clientX; y0 = ev.clientY; t0 = Date.now(); dx = 0; card = ov.firstElementChild;
    });
    ov.addEventListener('pointermove', ev => {
      if (ev.pointerId !== id) return;
      dx = Math.max(0, ev.clientX - x0);
      if (Math.abs(ev.clientY - y0) > dx && dx < 12) { id = null; return; }   // a scroll, not a swipe
      ov.classList.add('is-dragging'); card.style.transform = `translateX(${dx}px)`;
    });
    const end = ev => {
      if (ev.pointerId !== id) return;
      id = null; ov.classList.remove('is-dragging');
      if (dx > innerWidth * .35 || dx / Math.max(1, Date.now() - t0) > .5) { card.style.transform = ''; requestClose(P); return; }
      card.style.transition = 'transform .2s var(--layer-in)'; card.style.transform = '';
      setTimeout(() => { card.style.transition = ''; }, 220);
    };
    ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
  }
  addEventListener('resize', () => stack.forEach(paintMode));

  /* ── Bottom sheets (small panels on phones) — they follow the finger and settle on the nearest stop ──
     Stops: "open" (as tall as its content) — or, when the content is taller than about half the screen, "half" (where it
     opens) and "full" (all but a strip at the top, so the handle is always on screen) — and "closed". The card is always its final height and slides (translateY), so a drag is
     1:1 and smooth; letting go picks the stop nearest to where it's heading (a flick carries it on, owner 25 Nov 2026).
     The bottom bar (Apply…) stays on the screen's bottom edge while the sheet is above half. Full: the content scrolls,
     and pulling down from its very top moves the sheet. */
  const vh = P => Number(P.ov.style.getPropertyValue('--lyr-vh').replace('px', '')) || innerHeight;
  const SHEET_GAP = 56;                // full height still leaves this much of the screen above it: the handle never leaves the screen
  const SHEET_HALF = .52;              // a long sheet opens at about half the screen
  const SETTLE = 'transform .38s cubic-bezier(.2,.9,.25,1), height .38s cubic-bezier(.2,.9,.25,1)';
  function sheetMeasure(P) {
    const card = P.ov.firstElementChild, S = P.sh;
    const room = vh(P) - SHEET_GAP, cap = Math.round(vh(P) * SHEET_HALF);
    card.style.height = 'auto';
    const nat = card.offsetHeight;                                  // everything in it, at its natural height
    const tall = nat > cap;
    S.H = tall ? room : Math.min(nat, room);
    S.stops = tall ? { full: 0, half: S.H - cap, closed: S.H } : { open: 0, closed: S.H };
    if (!(S.at in S.stops) || S.at === 'closed') S.at = tall ? 'half' : 'open';
    card.style.height = S.H + 'px';
  }
  function sheetPlace(P, off, animate) {
    const card = P.ov.firstElementChild, foot = card.querySelector('.lyr-foot'), S = P.sh;
    S.off = off;
    const t = animate && !mssReducedMotion() ? SETTLE : 'none';
    card.style.transition = t;
    // pulled past its top: it grows taller from the bottom edge (stays on it), so nothing behind it ever shows below
    card.style.transform = `translateY(${Math.max(0, off)}px)`;
    card.style.height = (S.H + Math.max(0, -off)) + 'px';
    // the bar stays on the screen's edge down to half; below that it goes with the sheet
    const keep = Math.max(0, Math.min(off, S.stops.half ?? 0));
    foot.style.transition = t; foot.style.transform = keep ? `translateY(${-keep}px)` : '';
  }
  function settle(P, at) {
    const S = P.sh; if (!S) return;
    if (at === 'closed') {
      if (P.o.dirty?.()) { settle(P, S.at); requestClose(P); return; }   // unsaved: it asks first, the sheet stays
      S.closing = true;
      sheetPlace(P, S.stops.closed, true);
      setTimeout(() => requestClose(P), mssReducedMotion() ? 0 : 200);
      return;
    }
    S.at = at;
    P.ov.classList.toggle('is-full', at === 'full');
    sheetPlace(P, S.stops[at], true);
  }
  // it turns into a sheet (opening, or the screen got narrow): measured, then it rises to its first stop
  function sheetOn(P) {
    const card = P.ov.firstElementChild;
    P.sh = { at: '', off: 0 };
    sheetMeasure(P);
    P.ov.classList.toggle('is-full', P.sh.at === 'full');
    sheetPlace(P, P.sh.stops.closed, false);
    card.getBoundingClientRect();                                   // start from below the screen
    sheetPlace(P, P.sh.stops[P.sh.at], true);
    // its content changes (results arrive, a section opens): the stops follow
    P.sh.ro = new ResizeObserver(() => {
      const S = P.sh; if (!S || S.closing || S.dragging || !P.ov.classList.contains('open')) return;
      sheetMeasure(P); sheetPlace(P, S.stops[S.at], true);
    });
    P.sh.ro.observe(card.querySelector('.lyr-content'));
    P.sh.ro.observe(card.querySelector('.lyr-foot'));
  }
  function sheetOff(P) {
    const card = P.ov.firstElementChild, foot = card.querySelector('.lyr-foot');
    P.sh?.ro?.disconnect(); P.sh = null;
    P.ov.classList.remove('is-full');
    ['height', 'transform', 'transition'].forEach(k => { card.style[k] = ''; foot.style[k] = ''; });
  }
  function sheetDrag(P, ov) {
    const card = ov.firstElementChild, body = card.querySelector('.lyr-body');
    let g = null, dragged = false;
    const begin = (x, y, target) => {
      if (!ov.classList.contains('is-sheet') || !P.sh || P.sh.closing) return;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;   // fields keep their touches
      g = { x0: x, y0: y, off0: P.sh.off, own: null, inBody: !target.closest('.lyr-top, .lyr-grab, .lyr-foot'), pts: [] };
    };
    const move = (x, y, ev) => {
      if (!g) return;
      const dy = y - g.y0, dx = x - g.x0;
      if (g.own === null) {
        if (Math.abs(dy) < 5 && Math.abs(dx) < 5) return;
        if (Math.abs(dx) > Math.abs(dy)) { g = null; return; }                 // sideways: a row of chips scrolls
        // full: the content scrolls — the sheet only takes a pull down from the content's very top
        const scrolls = P.sh.at === 'full' && g.inBody && body.scrollHeight > body.clientHeight + 1;
        if (scrolls && !(dy > 0 && body.scrollTop <= 0)) { g = null; return; }
        g.own = true; g.y0 = y; g.off0 = P.sh.off;                             // from here, so it doesn't jump
        P.sh.dragging = true; dragged = true;
        ov.classList.add('is-dragging');
      }
      if (ev?.cancelable) ev.preventDefault();
      let off = g.off0 + (y - g.y0);
      if (off < 0) off = -Math.pow(-off, .72);                                 // past the top it gives a little
      sheetPlace(P, off, false);
      g.pts.push([y, performance.now()]); if (g.pts.length > 6) g.pts.shift();
    };
    const end = () => {
      const G = g; g = null;
      if (!G?.own || !P.sh) return;
      P.sh.dragging = false;
      ov.classList.remove('is-dragging');
      const a = G.pts[0], b = G.pts[G.pts.length - 1];
      const v = a && b && b[1] - a[1] > 0 ? (b[0] - a[0]) / (b[1] - a[1]) : 0;   // px per ms, + is down
      const aim = P.sh.off + Math.max(-1.6, Math.min(1.6, v)) * 220;           // where a flick carries it
      const [at] = Object.entries(P.sh.stops).reduce((best, s) => Math.abs(s[1] - aim) < Math.abs(best[1] - aim) ? s : best);
      settle(P, at);
    };
    // touch: its own events, so a drag can be taken from the content's scrolling only when it should
    card.addEventListener('touchstart', ev => { const t = ev.touches[0]; if (ev.touches.length === 1) begin(t.clientX, t.clientY, ev.target); else g = null; }, { passive: true });
    card.addEventListener('touchmove', ev => { const t = ev.touches[0]; move(t.clientX, t.clientY, ev); }, { passive: false });
    card.addEventListener('touchend', end); card.addEventListener('touchcancel', end);
    // a mouse (a narrow desktop window): the same, from the handle or anywhere
    card.addEventListener('pointerdown', ev => {
      if (ev.pointerType !== 'mouse' || ev.button > 0) return;
      begin(ev.clientX, ev.clientY, ev.target);
      const mv = e => move(e.clientX, e.clientY, e), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); end(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    // a drag isn't a tap on whatever it started on
    card.addEventListener('click', ev => { if (dragged) { ev.preventDefault(); ev.stopPropagation(); } dragged = false; }, true);
    // typing needs the room: a field taking focus opens the sheet to its full height
    card.addEventListener('focusin', ev => {
      if (P.sh?.stops.full != null && P.sh.at !== 'full' && ev.target.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]')) settle(P, 'full');
    });
  }
  // the keyboard (phones): the sheet sits on top of it — the page doesn't shrink for it on iPhone, so it follows the
  // visual viewport: --lyr-kb = how far the keyboard reaches up, --lyr-vh = the height left above it
  function sheetKeyboard(P, on) {
    const vv = window.visualViewport; if (!vv) return;
    if (!P.kb) P.kb = () => {
      const raw = document.documentElement.clientHeight - (vv.offsetTop + vv.height);
      const kb = raw > 150 ? raw : 0;                               // a keyboard — not Safari's toolbar coming and going
      P.ov.style.setProperty('--lyr-kb', Math.round(kb) + 'px');
      P.ov.style.setProperty('--lyr-vh', Math.round(kb ? vv.height : Math.min(vv.height, innerHeight)) + 'px');
      if (P.sh && !P.sh.dragging && !P.sh.closing) { sheetMeasure(P); sheetPlace(P, P.sh.stops[P.sh.at], true); }
    };
    const fn = on ? 'addEventListener' : 'removeEventListener';
    vv[fn]('resize', P.kb); vv[fn]('scroll', P.kb);
    if (on) P.kb(); else { P.ov.style.removeProperty('--lyr-kb'); P.ov.style.removeProperty('--lyr-vh'); }
  }

  // ?panel=name&id=… — open it once its page says how (here, or when the route is registered)
  function route(name, fn) {
    routes[name] = fn;
    const q = new URLSearchParams(location.search);
    if (q.get('panel') === name && !stack.length) {
      try { history.replaceState(history.state, '', url(null)); } catch {}   // Back from it stays on this page
      fn(q.get('pid'));
    }
  }
  addEventListener('popstate', ev => {          // Forward onto a panel's address: open it on that entry
    if (stack.length || !ev.state?.mssPanel) return;
    const q = new URLSearchParams(location.search), name = q.get('panel');
    if (ev.state.mssPanel === 1 && name && routes[name]) { forward = true; routes[name](q.get('pid')); forward = false; }
    else history.back();
  });

  return { open, route, current: () => stack[stack.length - 1]?.handle || null };
})();

const MSSPopover = (() => {
  let cur = null;           // { menu, btn } (desktop) · { page } (phone) · { sheet } (bottom sheet)
  const rowHTML = (it, i) => it.divider ? '<li class="lyr-menu-sep" role="separator"></li>'
    : `<li role="none"><button type="button" role="menuitem" class="lyr-menu-item${it.danger ? ' is-danger' : ''}${it.sub ? ' has-sub' : ''}${it.on ? ' is-on' : ''}" data-i="${i}" tabindex="-1"${it.on ? ' aria-current="true"' : ''}>${it.icon ? `<span class="lyr-menu-ic">${icon(it.icon, 18)}</span>` : ''}<span class="lyr-menu-txt"><span>${escHTML(it.label)}</span>${it.sub ? `<small>${escHTML(it.sub)}</small>` : ''}</span>${it.on ? `<span class="lyr-menu-on" aria-hidden="true">${icon('check', 16)}</span>` : ''}</button></li>`;

  function close(refocus = false) {
    if (!cur) return;
    const c = cur; cur = null;
    if (c.page) { c.page.closeNow(); return; }
    if (c.sheet) {
      c.sheet.classList.add('is-leaving');
      setTimeout(() => { MSSDialog.close(c.sheet); c.sheet.remove(); }, mssReducedMotion() ? 120 : 200);
      return;
    }
    c.btn.setAttribute('aria-expanded', 'false');
    c.menu.classList.add('is-leaving');
    setTimeout(() => c.menu.remove(), mssReducedMotion() ? 0 : 100);
    document.removeEventListener('pointerdown', c.out, true);
    document.removeEventListener('scroll', c.scroll, true);
    removeEventListener('resize', c.place);
    if (refocus) c.btn.focus({ preventScroll: true });
  }
  function choose(it) {
    const away = cur?.page || cur?.sheet;
    close(!away);
    // a phone page / sheet goes away first, so what it opens (a confirm, a panel) lands on the screen underneath
    setTimeout(() => it.onSelect?.(), away ? 220 : 0);
  }
  function openSheet(btn, o, items) {
    const ov = document.createElement('div');
    ov.className = 'lyr-sheet-ov';
    ov.innerHTML = `<section class="lyr-sheet" role="dialog" aria-modal="true" aria-labelledby="lyrSheetT" tabindex="-1">
        <span class="lyr-sheet-grab" aria-hidden="true"></span>
        <h2 class="lyr-title" id="lyrSheetT"></h2>${o.subtitle ? '<p class="lyr-sub"></p>' : ''}
        <ul class="lyr-menu is-sheet" role="menu" aria-labelledby="lyrSheetT">${items.map(rowHTML).join('')}</ul></section>`;
    ov.querySelector('.lyr-title').textContent = o.title || 'Actions';
    if (o.subtitle) ov.querySelector('.lyr-sub').textContent = o.subtitle;
    const list = ov.querySelector('ul');
    list.querySelectorAll('[role="menuitem"]').forEach(b => b.tabIndex = 0);
    list.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)]); });
    list.addEventListener('keydown', ev => keys(ev, list));
    MSSDialog.bind(ov, () => close(true));
    mssSheetDrag(ov.firstElementChild, () => close(true));
    document.body.appendChild(ov);
    MSSDialog.open(ov, { focus: '[role="menuitem"]' });
    cur = { sheet: ov, btn };
  }
  function open(btn, o) {
    if (cur) { const same = cur.btn === btn; close(); if (same) return; }
    const items = o.items || [];
    if (o.sheet) return openSheet(btn, o, items);
    if (innerWidth < 560) {                                   // narrow screen → a bottom sheet of rows (a small panel)
      const list = document.createElement('ul');
      list.className = 'lyr-menu is-sheet'; list.setAttribute('role', 'menu'); list.setAttribute('aria-label', o.label || o.title || 'Actions');
      list.innerHTML = items.map(rowHTML).join('');
      list.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)]); });
      list.addEventListener('keydown', ev => keys(ev, list));
      list.querySelectorAll('[role="menuitem"]').forEach(b => b.tabIndex = 0);
      const page = MSSPanel.open({ size: 'S', kind: 'generic', title: o.title || 'Actions', subtitle: o.subtitle, body: list, onClose: () => { if (cur?.page === page) cur = null; } });
      cur = { page, btn };
      return;
    }
    mssCloseMenus();
    const menu = document.createElement('ul');
    menu.className = 'lyr-menu'; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', o.label || o.title || 'Actions');
    menu.innerHTML = items.map(rowHTML).join('');
    document.body.appendChild(menu);
    const place = () => {
      const r = btn.getBoundingClientRect(), h = menu.offsetHeight, w = menu.offsetWidth, gap = 6;
      const up = r.bottom + gap + h > innerHeight - 8 && r.top - gap - h > 8;
      menu.style.left = Math.max(8, Math.min(o.align === 'start' ? r.left : r.right - w, innerWidth - w - 8)) + 'px';
      if (o.align === 'start') menu.style.minWidth = Math.round(r.width) + 'px';
      menu.style.top = (up ? r.top - gap - h : r.bottom + gap) + 'px';
      menu.classList.toggle('is-up', up);
    };
    place();
    const out = ev => { if (!menu.contains(ev.target) && !btn.contains(ev.target)) close(); };
    const scroll = ev => { if (!menu.contains(ev.target)) close(); };      // the page scrolls: the menu goes (it would float away from its button)
    cur = { menu, btn, out, place, scroll };
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', out, true);
    document.addEventListener('scroll', scroll, true);
    addEventListener('resize', place);
    menu.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)]); });
    menu.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(true); return; }
      if (ev.key === 'Tab') { close(); return; }
      keys(ev, menu);
    });
    // keyboard: the first item takes focus (with its ring); a click or tap: the menu itself, so no item looks picked (owner) —
    // ↓ / ↑ still move into the items
    const byKey = btn.matches(':focus-visible');
    if (byKey) menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    else { menu.tabIndex = -1; menu.focus({ preventScroll: true }); }
  }
  // ↑ ↓ Home End move through the items (Enter / Space choose, as buttons do)
  function keys(ev, box) {
    const all = [...box.querySelectorAll('[role="menuitem"]')], i = all.indexOf(document.activeElement);
    const k = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[ev.key];
    if (k === undefined) return;
    ev.preventDefault();
    all[(k + all.length) % all.length]?.focus();
  }
  // Esc while the desktop menu is open is handled by the menu itself (it has focus)
  // Esc (MSSDialog): a desktop menu that's open closes first, focus back on its button → true
  const closeOpen = () => { if (!cur?.menu) return false; close(true); return true; };
  return { open, close: () => close(), closeOpen };
})();

// a result row in a picker panel: <li><button class="lyr-row"> with a picture (img URL or a letter), a name and a line under it.
// o.attrs → extra attributes on the button (onclick, data-*); o.href → a link instead; o.round → a round picture (people); o.tag → a small label on the right
function mssRowHTML(o) {
  const img = safeURL(o.img);
  const tag = o.href ? 'a' : 'button', open = o.href ? `<a class="lyr-row" href="${escHTML(o.href)}"` : '<button type="button" class="lyr-row"';
  return `<li>${open}${o.attrs ? ' ' + o.attrs : ''}><span class="lyr-row-img${o.round ? ' is-round' : ''}" aria-hidden="true">${img ? `<img src="${img}" alt="" loading="lazy">` : escHTML(((o.title || '?')[0] || '?').toUpperCase())}</span>
    <span class="lyr-row-txt"><b translate="no">${escHTML(o.title || '')}</b>${o.sub ? `<small>${escHTML(o.sub)}</small>` : ''}</span>${o.tag ? `<span class="lyr-row-tag">${escHTML(o.tag)}</span>` : ''}</${tag}></li>`;
}
function mssSegHTML(o) {
  const name = o.labelledby ? `aria-labelledby="${o.labelledby}"` : `aria-label="${escHTML(o.label || '')}"`;
  const extra = Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${escHTML(v)}"`).join('');
  return `<div class="lyr-seg${o.cols ? ' is-grid' : ''}${o.strong ? ' is-strong' : ''}" role="radiogroup" ${name}${o.cols ? ` style="--seg-cols:${o.cols}"` : ''}>${o.options.map(([v, t, off]) => {
    const on = String(v) === String(o.value);
    return `<button type="button" role="radio" class="lyr-seg-opt" data-v="${escHTML(v)}"${extra} aria-checked="${on}" tabindex="${on || (o.value == null || o.value === '') && v === o.options[0][0] ? 0 : -1}"${off ? ' disabled' : ''}>${escHTML(t)}</button>`;
  }).join('')}</div>`;
}
// mark a segmented option chosen (in place, so focus stays on it); returns its value
function mssSegPick(btn) {
  btn.parentElement.querySelectorAll('[role="radio"]').forEach(x => { const on = x === btn; x.setAttribute('aria-checked', on); x.tabIndex = on ? 0 : -1; });
  return btn.dataset.v;
}
// arrow keys inside a segmented choice (or a list of choice rows): move to the next option and choose it
document.addEventListener('keydown', ev => {
  const b = ev.target.closest?.('.lyr-seg [role="radio"], .lyr-choices > .lyr-choice > [role="radio"]'); if (!b) return;
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key]; if (!step) return;
  ev.preventDefault();
  const group = b.closest('[role="radiogroup"]');
  const all = [...group.querySelectorAll('[role="radio"]:not(:disabled)')].filter(x => x.closest('[role="radiogroup"]') === group);
  const rtl = getComputedStyle(b).direction === 'rtl' && /Left|Right/.test(ev.key) ? -1 : 1;
  const next = all[(all.indexOf(b) + step * rtl + all.length) % all.length];
  next.focus(); next.click();
});
