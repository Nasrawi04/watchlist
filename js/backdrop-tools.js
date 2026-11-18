/* ═══════════════════════════════════════════════════════════════
   backdrop-tools.js — choosing and framing a TMDB picture (one implementation, two places)
   Moved out of the Details Page (Edit page: Choose a poster / backdrop, Adjust framing) so the
   profile banner uses exactly the same picker and framing tool. Styles: style.css .pp-* and .fr-*.

   Picker (the grid of a title's pictures, grouped by language, the language box, the chosen one's details)
     MSSBdTools.load(type, id, kind)    → { items, groups, closed } — kind 'poster' | 'backdrop'; best voted first,
                                          groups: "No language / Textless" first, then by language name;
                                          closed: every group but the first starts collapsed (owner, 17 Nov 2026)
     MSSBdTools.toTop(h)                a panel's Back to top button (MSSPanel handle): shows once its body is scrolled down
     MSSBdTools.langName(key)           'en' → 'English', 'none' → 'No language / Textless'
     MSSBdTools.gridHTML(st)            st = { kind, items, groups, lang, closed:Set, sel } → the groups (buttons data-pp="i", data-ppg="lang")
     MSSBdTools.selHTML(st)             the "Selected backdrop" box for st.sel ('' when none)
     MSSBdTools.mountLang(el, st, onChange)   the language box (MSSPicker): '' = all languages

   Adjust framing (a side panel L / a full page): drag the picture or a crop box, zoom, each place framed on its own
     MSSBdTools.frame({ url, title, targets, order, ps, target, onLive, onApply, onClose })
       targets  { key: { label, short, aspect, preview: () => HTML } } — preview = the real piece at its real size
                (scaled to fit); its [data-frimg] element is the picture that gets framed
       ps       { key: { x, y, z } } where each place starts (missing → the default: centred, 25% from the top)
       target   the place edited first
       onLive(ps, target)   while editing (the page behind follows) · onApply(ps, handle) Apply · onClose(applied)
     MSSBdTools.paint(el, p)            draw a framing { x, y, z } on a background element (background-position + scale)
     MSSBdTools.DEF                     { x: 50, y: 25, z: 1 }
   Framing is stored as { x: % from the left, y: % from the top, z: zoom 1–2.5 }, the same everywhere (MSSBackdrop.style).
═══════════════════════════════════════════════════════════════ */
const MSSBdTools = (() => {
  const DEF = { x: 50, y: 25, z: 1 }, ZMAX = 2.5, IMG = 'https://image.tmdb.org/t/p/';
  const esc = s => escHTML(s == null ? '' : String(s));

  /* ── The picker ── */
  let namer = null;
  function langName(key) {
    if (key === 'none') return 'No language / Textless';
    try { namer = namer || new Intl.DisplayNames(['en'], { type: 'language' }); return namer.of(key) || key.toUpperCase(); } catch { return key.toUpperCase(); }
  }
  async function load(type, id, kind = 'backdrop') {
    const res = await tmdbFetch(`${TMDB_BASE}/${type === 'movie' ? 'movie' : 'tv'}/${Number(id)}/images`);
    if (!res.ok) throw new Error('TMDB images fetch failed');
    const data = await res.json();
    const items = ((kind === 'backdrop' ? data.backdrops : data.posters) || []).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    const g = new Map();
    items.forEach((p, i) => { const k = p.iso_639_1 || 'none'; if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
    const groups = [...g.keys()].sort((a, b) => a === 'none' ? -1 : b === 'none' ? 1 : langName(a).localeCompare(langName(b))).map(key => ({ key, items: g.get(key) }));
    return { items, groups, closed: new Set(groups.slice(1).map(g => g.key)) };
  }
  // Back to top inside a panel: the site's round olive button (.back-to-top), just above the panel's footer
  function toTop(h) {
    const body = h.body.closest('.lyr-body'), card = body?.closest('.lyr-card');
    if (!card || card.querySelector('.pp-top')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'back-to-top pp-top'; btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Back to top'); btn.title = 'Back to top';
    btn.innerHTML = icon('chevup', 22);
    btn.addEventListener('click', () => {
      body.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      btn.blur();
    });
    card.appendChild(btn);
    let shown = false;
    body.addEventListener('scroll', () => {
      const on = body.scrollTop > 500;
      if (on === shown) return;
      shown = on;
      const foot = card.querySelector('.lyr-foot');
      btn.style.bottom = `${(foot && !foot.hidden ? foot.offsetHeight : 0) + 16}px`;
      btn.classList.toggle('show', on); btn.tabIndex = on ? 0 : -1;
    }, { passive: true });
  }
  function gridHTML(st) {
    const bd = st.kind === 'backdrop', Name = bd ? 'Backdrop' : 'Poster';
    return st.groups.filter(g => !st.lang || g.key === st.lang).map(g => {
      const open = !st.closed.has(g.key);
      return `<section class="pp-group">
        <h3 class="pp-group-h"><button type="button" class="pp-group-btn" data-ppg="${esc(g.key)}" aria-expanded="${open}" aria-controls="ppG-${esc(g.key)}">
          <span>${esc(langName(g.key))}</span><span class="pp-count">${g.items.length}</span>${icon('chevdown', 16)}</button></h3>
        <div class="pp-grid${bd ? ' is-wide' : ''}" id="ppG-${esc(g.key)}"${open ? '' : ' hidden'}>${g.items.map(i => {
          const p = st.items[i], on = i === st.sel;
          return `<button type="button" class="pp-opt${on ? ' selected' : ''}" data-pp="${i}" aria-pressed="${on}" aria-label="${Name} ${g.items.indexOf(i) + 1} of ${g.items.length}, ${esc(langName(g.key))}"><img src="${IMG}${bd ? 'w780' : 'w342'}${p.file_path}" alt="" loading="lazy"></button>`;
        }).join('')}</div></section>`;
    }).join('');
  }
  function selHTML(st) {
    const p = st.items[st.sel]; if (!p) return '';
    const bd = st.kind === 'backdrop';
    const bits = [langName(p.iso_639_1 || 'none'), p.width && p.height ? `${p.width} × ${p.height}` : '', p.vote_count ? `★ ${mssR1(Number(p.vote_average))} · ${p.vote_count} ${p.vote_count === 1 ? 'vote' : 'votes'} on TMDB` : ''].filter(Boolean);
    return `<img src="${IMG}${bd ? 'w300' : 'w92'}${p.file_path}" alt=""${bd ? ' class="is-wide"' : ''}><div><h3 class="lyr-sec-h">Selected ${bd ? 'backdrop' : 'poster'}</h3><p>${bits.map(esc).join(' · ')}</p></div>`;
  }
  function mountLang(el, st, onChange) {
    if (!el || typeof MSSPicker === 'undefined') return;
    MSSPicker.mount(el, { id: 'ppLangPick', label: 'Language', value: '', placeholder: 'All languages', search: 'Search languages…',
      groups: [{ items: [{ value: '', label: 'All languages' }, ...st.groups.map(g => ({ value: g.key, label: `${langName(g.key)} · ${g.items.length}`, keys: [g.key] }))] }],
      onChange: v => { st.lang = v || ''; st.closed.delete(st.lang); onChange && onChange(v || ''); } });
  }

  /* ── Adjust framing ── */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function paint(el, p) {
    el.style.backgroundPosition = p ? `${p.x}% ${p.y}%` : '';
    el.style.transform = p && p.z > 1 ? `scale(${p.z})` : '';
    el.style.transformOrigin = p ? `${p.x}% ${p.y}%` : '';
  }
  let F = null;   // { o, ps, target, mode, iw, ih, ptrs, h, applied }
  async function frame(o) {
    if (!o?.url) return;
    await mssLoadScript('js/panel.js');
    // places can belong to a device (target.device: 'desk' | 'phone'): grouped by device, in that order (the strip and ‹ › agree)
    const devOf = t => o.targets[t].device || 'desk', given = o.order || Object.keys(o.targets), devs = [...new Set(given.map(devOf))];
    const order = devs.flatMap(d => given.filter(t => devOf(t) === d));
    const ps = {}; order.forEach(t => { ps[t] = { ...DEF, ...(o.ps?.[t] || {}) }; });
    F = { o, order, ps, iw: 16, ih: 9, ptrs: new Map(), target: order.includes(o.target) ? o.target : order[0], mode: 'drag' };
    F.devOf = devOf; F.device = devOf(F.target); F.split = devs.length > 1;
    Object.defineProperty(F, 'p', { get() { return this.ps[this.target]; }, set(v) { this.ps[this.target] = v; } });
    const at = F;
    const im = new Image(); im.onload = () => { if (F !== at) return; F.iw = im.naturalWidth || 16; F.ih = im.naturalHeight || 9; stage(); }; im.src = o.url;
    const T = o.targets;
    const pv = t => `<figure class="fr-fig is-${t}" data-dev="${devOf(t)}"${t !== F.target ? ' hidden' : ''}><button type="button" class="fr-pv is-${t}" data-frt="${t}" aria-pressed="false" aria-label="Frame for the ${esc(T[t].label.toLowerCase())}"><span class="fr-pv-in" aria-hidden="true">${T[t].preview()}</span></button><figcaption><span>${esc(T[t].label)}</span><em class="fr-on">Editing</em></figcaption></figure>`;
    /* Where you're framing (owner, 17 Nov 2026: "so the user exactly knows where they are adjusting"): every place as a
       small live thumbnail in its own shape, grouped by device, with Adjusted / Default; ‹ › step through them.
       Then "Now framing <place>" right above the picture you drag. */
    const DEV = { desk: 'Computer', phone: 'Phone', cc: 'Create Card' };
    const chip = t => {
      const a = Number(T[t].aspect) || 16 / 9, w = a >= 84 / 48 ? 84 : Math.round(48 * a), hh = Math.round(w / a);
      return `<button type="button" class="fr-nav-it" data-frgo="${t}" aria-pressed="false" aria-label="${esc(T[t].label)}">
        <span class="fr-nav-th" aria-hidden="true"><span class="fr-nav-box" style="width:${w}px;height:${hh}px"><span class="fr-nav-img" style="background-image:url('${esc(o.url)}')"></span></span></span>
        <span class="fr-nav-l">${esc(T[t].short || T[t].label)}</span><span class="fr-nav-s" data-frs="${t}" aria-hidden="true"></span></button>`;
    };
    const navHTML = order.length < 2 ? '' : `<div class="fr-nav" role="navigation" aria-label="Places to frame">
        <div class="fr-nav-h"><h3 class="lyr-sec-h">Where you're framing</h3>
          <span class="fr-nav-step"><button type="button" class="fr-nav-arw" data-frstep="-1" aria-label="Previous place">${icon('chevleft', 16)}</button>
          <span id="frStep" aria-live="polite"></span><button type="button" class="fr-nav-arw" data-frstep="1" aria-label="Next place">${icon('chevright', 16)}</button></span></div>
        <div class="fr-nav-list">${F.split
          ? devs.map(d => `<div class="fr-nav-grp" role="group" aria-label="${DEV[d] || d}"><span class="fr-nav-dev">${DEV[d] || d}</span><div class="fr-nav-row">${order.filter(t => devOf(t) === d).map(chip).join('')}</div></div>`).join('')
          : `<div class="fr-nav-grp"><div class="fr-nav-row">${order.map(chip).join('')}</div></div>`}</div>
      </div>`;
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: 'Adjust framing', subtitle: o.title || '', label: 'Adjust the backdrop framing',
      body: `${navHTML}
        <div class="fr-now">
          <div class="fr-now-t"><span class="fr-now-k">Now framing</span><b id="frNowL"></b><small id="frNowD"></small></div>
          <div class="fr-now-mode"><span class="sr-only" id="frModeL">Edit by</span>${mssSegHTML({ labelledby: 'frModeL', value: F.mode, data: { frset: 'mode' }, options: [['drag', 'Drag'], ['crop', 'Crop box']] })}</div>
        </div>
        <div class="fr-stage-wrap" id="frWrap"></div>
        <div class="fr-ctl"><div class="fr-zoom"><button type="button" class="fr-zbtn" data-fr="out" aria-label="Zoom out">${icon('minus', 16)}</button>
          <input type="range" id="frZoom" min="100" max="250" step="1" aria-label="Zoom"><button type="button" class="fr-zbtn" data-fr="in" aria-label="Zoom in">${icon('plus', 16)}</button>
          <output class="fr-zoom-v" id="frZoomV" for="frZoom"></output></div>
        <p class="fr-help" id="frHelp"></p></div>
        <div class="fr-pv-h"><h3 class="lyr-sec-h">Where it shows</h3><small>${order.length > 1 ? 'Exactly as it will look — each place is framed on its own' : 'Exactly as it will look'}</small></div>
        <div class="fr-previews">${order.map(pv).join('')}</div>
        <p class="sr-only" id="frLive" aria-live="polite"></p>`,
      footer: { secondary: [{ label: 'Reset', onClick: () => { F.p = { ...DEF }; draw(true); } }, { label: 'Cancel', onClick: x => x.close() }],
        primary: { label: 'Apply', onClick: hh => { F.applied = true; const out = F.ps; hh.closeNow(); o.onApply && o.onApply(out); } } },
      onClose: () => { const f = F; if (!f || f.h !== h) return; f.ro?.disconnect(); F = null; o.onClose && o.onClose(!!f.applied); } });
    F.h = h;
    h.body.querySelector('#frZoom').addEventListener('input', ev => zoomTo(Number(ev.target.value) / 100));
    h.body.addEventListener('click', ev => {
      const z = ev.target.closest('[data-fr]'); if (z) return zoomTo(F.p.z + (z.dataset.fr === 'in' ? 0.1 : -0.1));
      const s = ev.target.closest('[data-frset]');
      if (s) { const v = mssSegPick(s); F[s.dataset.frset] = v; return stage(); }
      const go = ev.target.closest('[data-frgo]'); if (go) return goTo(go.dataset.frgo);
      const stp = ev.target.closest('[data-frstep]');
      if (stp) { const n = order.length; return goTo(order[(order.indexOf(F.target) + Number(stp.dataset.frstep) + n) % n]); }
      const t = ev.target.closest('[data-frt]'); if (t) return goTo(t.dataset.frt);
    });
    scale();
    F.ro = new ResizeObserver(() => scale()); F.ro.observe(h.body);
    stage();
    h.body.querySelector('#frStage')?.focus({ preventScroll: true });
  }
  // another place: its own framing, its preview, its shape for the frame
  function goTo(t) {
    if (!F || !F.o.targets[t]) return;
    F.target = t; F.device = F.devOf(t);
    stage();
    const it = F.h.body.querySelector(`[data-frgo="${t}"]`), list = it?.closest('.fr-nav-list');
    if (list && list.scrollWidth > list.clientWidth) list.scrollLeft = it.offsetLeft - (list.clientWidth - it.offsetWidth) / 2;
  }
  // the previews are the real pieces at their real size, scaled to the panel's width
  function scale() {
    if (!F?.h) return;
    F.h.body.querySelectorAll('.fr-pv').forEach(pv => {
      const inn = pv.querySelector('.fr-pv-in'), first = inn.firstElementChild; if (!first) return;
      const w = first.offsetWidth, hh = first.offsetHeight, k = pv.clientWidth / (w || 1);
      inn.style.transform = `scale(${k})`; pv.style.height = Math.round(hh * k) + 'px';
    });
  }
  // the shape of a place's picture box (from its preview), so the frame matches it
  function aspect(t = F.target) {
    const el = F?.h?.body.querySelector(`[data-frt="${t}"] [data-frimg]`), r = el && el.getBoundingClientRect();
    return r && r.width > 4 && r.height > 4 ? r.width / r.height : F.o.targets[t].aspect;
  }
  // what the frame shows at zoom 1 (cover), as fractions of the picture
  function base() { const a = aspect(), i = F.iw / F.ih; return i > a ? { w: a / i, h: 1 } : { w: 1, h: i / a }; }
  // the crop box: the part that shows, in fractions of the picture
  function box() { const b = base(), w = b.w / F.p.z, h = b.h / F.p.z; return { w, h, l: F.p.x / 100 * (1 - w), t: F.p.y / 100 * (1 - h) }; }
  function setBox(l, t, w) {
    const b = base(), z = clamp(b.w / w, 1, ZMAX), cw = b.w / z, ch = b.h / z;
    F.p.z = Math.round(z * 100) / 100;
    if (1 - cw > 0.001) F.p.x = clamp(l / (1 - cw) * 100, 0, 100);
    if (1 - ch > 0.001) F.p.y = clamp(t / (1 - ch) * 100, 0, 100);
  }
  function stage() {
    if (!F?.h) return;
    // "Where it shows": only the place being framed (pick another with Frame for) — shown first, so the frame takes its shape
    F.h.body.querySelectorAll('.fr-fig').forEach(f => { f.hidden = !f.classList.contains('is-' + F.target); });
    scale();
    const b = F.h.body, wrap = b.querySelector('#frWrap'), crop = F.mode === 'crop', a = aspect(), lbl = esc(F.o.targets[F.target].label.toLowerCase()), u = esc(F.o.url);
    wrap.innerHTML = crop
      ? `<div class="fr-stage is-crop" id="frStage" tabindex="0" role="group" aria-roledescription="crop area" aria-label="Crop box for the ${lbl}" aria-describedby="frHelp"
            style="aspect-ratio:${F.iw} / ${F.ih}"><span class="fr-full" style="background-image:url('${u}')"></span>
          <span class="fr-box" id="frBox"><span class="fr-thirds" aria-hidden="true"></span>${['nw', 'ne', 'sw', 'se'].map(k => `<span class="fr-h is-${k}" data-h="${k}" aria-hidden="true"></span>`).join('')}</span></div>`
      : `<div class="fr-stage" id="frStage" tabindex="0" role="group" aria-roledescription="framing area" aria-label="Framing for the ${lbl}" aria-describedby="frHelp"
            style="aspect-ratio:${a}"><span class="fr-img" data-frimg style="background-image:url('${u}')"></span><span class="fr-thirds" aria-hidden="true"></span></div>`;
    wrap.classList.toggle('is-narrow', !crop && a < 1.6);
    const touch = matchMedia('(pointer:coarse)').matches;
    b.querySelector('#frHelp').textContent = crop
      ? (touch ? 'Drag the box to move it · drag a corner to zoom' : 'Drag the box to move it · drag a corner to zoom · arrow keys move the box')
      : (touch ? 'Drag to move · pinch to zoom' : 'Drag to move · scroll to zoom · arrow keys to nudge, + / − to zoom');
    b.querySelectorAll('[data-frt], [data-frgo]').forEach(x => { const on = (x.dataset.frt || x.dataset.frgo) === F.target; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
    const T = F.o.targets[F.target], i = F.order.indexOf(F.target), n = F.order.length;
    b.querySelector('#frNowL').textContent = T.label;
    // where on the site this place is (target.where), else just the device
    b.querySelector('#frNowD').textContent = T.where || [F.split ? (F.device === 'phone' ? 'On phones' : 'On computers') : '', n > 1 ? `Place ${i + 1} of ${n}` : ''].filter(Boolean).join(' · ');
    const stp = b.querySelector('#frStep'); if (stp) stp.textContent = `${i + 1} of ${n}`;
    const st = b.querySelector('#frStage');
    st.addEventListener('pointerdown', down); st.addEventListener('pointermove', move);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => st.addEventListener(t, up));
    st.addEventListener('wheel', ev => { ev.preventDefault(); zoomTo(F.p.z * Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });
    st.addEventListener('keydown', key);
    draw();
  }
  // drag the picture: 1px of drag = 1px of picture, never past an edge
  function shift(dx, dy) {
    const r = F.h.body.querySelector('#frStage').getBoundingClientRect(), s = Math.max(r.width / F.iw, r.height / F.ih);
    const dw = r.width - F.p.z * F.iw * s, dh = r.height - F.p.z * F.ih * s;
    if (dw < -0.5) F.p.x = clamp(F.p.x + dx * 100 / dw, 0, 100);
    if (dh < -0.5) F.p.y = clamp(F.p.y + dy * 100 / dh, 0, 100);
    draw();
  }
  function moveBox(dx, dy) {
    const r = F.h.body.querySelector('#frStage').getBoundingClientRect(), bx = box();
    setBox(clamp(bx.l + dx / r.width, 0, 1 - bx.w), clamp(bx.t + dy / r.height, 0, 1 - bx.h), bx.w);
    draw();
  }
  // a corner handle at the pointer, the opposite corner stays put; the box keeps the frame's shape
  function resize(handle, cx, cy) {
    const r = F.h.body.querySelector('#frStage').getBoundingClientRect(), bx = box(), b = base(), k = b.h / b.w;
    const east = handle.includes('e'), south = handle.includes('s');
    const ax = east ? bx.l : bx.l + bx.w, ay = south ? bx.t : bx.t + bx.h;
    const px = (cx - r.left) / r.width, py = (cy - r.top) / r.height;
    let w = Math.max(Math.abs(px - ax), Math.abs(py - ay) / k);
    const roomW = east ? 1 - ax : ax, roomH = south ? 1 - ay : ay;
    w = clamp(w, b.w / ZMAX, Math.min(b.w, roomW, roomH / k));
    setBox(east ? ax : ax - w, south ? ay : ay - w * k, w);
    draw();
  }
  function zoomTo(z) { F.p.z = clamp(Math.round(z * 100) / 100, 1, ZMAX); draw(); }
  function down(ev) {
    const st = ev.currentTarget, crop = F.mode === 'crop';
    if (crop) {
      const hd = ev.target.closest('[data-h]');
      if (!hd && !ev.target.closest('#frBox')) return;
      F.grab = hd ? hd.dataset.h : 'move';
    }
    st.setPointerCapture(ev.pointerId);
    F.ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!crop && F.ptrs.size === 2) { const [a, b] = [...F.ptrs.values()]; F.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: F.p.z }; }
    st.classList.add('is-dragging');
  }
  function move(ev) {
    const last = F?.ptrs.get(ev.pointerId); if (!last) return;
    const now = { x: ev.clientX, y: ev.clientY }; F.ptrs.set(ev.pointerId, now);
    if (F.mode === 'crop') return F.grab === 'move' ? moveBox(now.x - last.x, now.y - last.y) : resize(F.grab, now.x, now.y);
    if (F.ptrs.size === 2 && F.pinch) { const [a, b] = [...F.ptrs.values()]; return zoomTo(F.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / (F.pinch.d || 1)); }
    shift(now.x - last.x, now.y - last.y);
  }
  function up(ev) {
    if (!F) return;
    F.ptrs.delete(ev.pointerId);
    if (F.ptrs.size < 2) F.pinch = null;
    if (!F.ptrs.size) { F.grab = null; ev.currentTarget.classList.remove('is-dragging'); }
  }
  function key(ev) {
    const step = ev.shiftKey ? 40 : 8, k = ev.key, crop = F.mode === 'crop';
    const go = (dx, dy) => crop ? moveBox(dx, dy) : shift(dx, dy);
    if (k === 'ArrowLeft') go(-step, 0); else if (k === 'ArrowRight') go(step, 0);
    else if (k === 'ArrowUp') go(0, -step); else if (k === 'ArrowDown') go(0, step);
    else if (k === '+' || k === '=') zoomTo(F.p.z + 0.05); else if (k === '-' || k === '_') zoomTo(F.p.z - 0.05);
    else if (k === '0') { F.p = { ...DEF }; draw(true); }
    else return;
    ev.preventDefault();
  }
  function draw(said) {
    if (!F?.h) return;
    const p = F.p, b = F.h.body;
    b.querySelectorAll('[data-frimg]').forEach(el => { const t = el.closest('[data-frt]')?.dataset.frt; paint(el, t ? F.ps[t] : p); });
    // the place thumbnails follow, and say which places you've changed
    b.querySelectorAll('[data-frgo]').forEach(it => {
      const t = it.dataset.frgo, def = isDef(F.ps[t]);
      paint(it.querySelector('.fr-nav-img'), F.ps[t]);
      const s = it.querySelector('.fr-nav-s'); s.textContent = def ? 'Default' : 'Adjusted'; s.classList.toggle('is-set', !def);
      it.setAttribute('aria-label', `${F.o.targets[t].label}, ${def ? 'default framing' : 'adjusted'}`);
    });
    const bxEl = b.querySelector('#frBox');
    if (bxEl) { const bx = box(); Object.assign(bxEl.style, { left: bx.l * 100 + '%', top: bx.t * 100 + '%', width: bx.w * 100 + '%', height: bx.h * 100 + '%' }); }
    F.o.onLive && F.o.onLive(F.ps, F.target);
    const z = Math.round(p.z * 100), r = b.querySelector('#frZoom');
    r.value = z; r.setAttribute('aria-valuetext', z + '%'); b.querySelector('#frZoomV').textContent = z + '%';
    b.querySelector('[data-fr="out"]').disabled = p.z <= 1; b.querySelector('[data-fr="in"]').disabled = p.z >= ZMAX;
    clearTimeout(F.sayT);
    F.sayT = setTimeout(() => { const l = b.querySelector('#frLive'); if (l) l.textContent = said ? 'Back to the default framing' : `Zoom ${z}%, ${Math.round(p.x)}% across, ${Math.round(p.y)}% down`; }, 400);
  }
  // { x, y, z } → is it the default (nothing worth keeping)?
  const isDef = p => !p || (p.z === 1 && Math.abs(p.x - 50) < 0.5 && Math.abs(p.y - 25) < 0.5);
  const round = p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 100) / 100 });

  return { load, toTop, langName, gridHTML, selHTML, mountLang, frame, paint, isDef, round, DEF, ZMAX };
})();
