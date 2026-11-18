/* ═══════════════════════════════════════════════════════════════
   showcase-studio.js — Showcase Studio (MSSShowcaseStudio): the editor for your Showcase, a full-screen sheet.
   Left (phones: pinned on top): the live stage — the real layout, finish and picture — with spot numbers.
   Right (phones: the sheet below): Medals · Layout · Look. Nothing is saved until Save; ✕ / Esc / Cancel ask
   "Discard changes?" only when something changed.

   Medals: search, type chips with counts, sort (Best first · Newest · Rarest · A–Z), tiles (picked ones green
   with their spot). Tap a medal → the next free spot; tap a spot first → the next medal replaces it; tap a picked
   tile → off. Drag on the stage to reorder; keyboard: Space lifts, arrows move, Space drops, Esc puts it back
   (announced). Long-press a tile → its Medal card. Lower levels of the same achievement hide behind
   "Hidden: N lower levels". Auto-fill my best (highest levels, then rarest) · Clear all.
   Layout: Spotlight · Shelves · Medal rail, each with a live thumbnail. Look: Picture (Change → the site's
   backdrop picker, on top of the Studio; or "Use my profile backdrop"), blur, lighting, finish.

   MSSShowcaseStudio.open({ picks, look, all, name, total, autofill, profileBg() → Promise<url | null>, save(picks, look) })
   Requires showcase.js, medal-card.js, config.js (MSSDialog, showConfirm, showToast). Styles: css/showcase.css.
═══════════════════════════════════════════════════════════════ */
const MSSShowcaseStudio = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const SC = () => MSSShowcase;
  const phoneMQ = matchMedia('(max-width: 640px)');
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TYPES = [['all', 'All'], ['achievement', 'Achievements'], ['official', 'Official'], ['challenge', 'Challenges'], ['member', 'Member'], ['secret', 'Secrets']];
  const SORTS = [['best', 'Best first'], ['new', 'Newest'], ['rare', 'Rarest'], ['az', 'A–Z']];
  let T = null;   // { o, picks, look, start, sel, tab, q, type, sort, lower, lift, rar, bg, ov }

  const sig = () => JSON.stringify([T.picks.map(b => b.id), SC().cleanLook(T.look)]);
  const dirty = () => !!T && sig() !== T.start;
  const tier = b => b.kind === 'achievement' ? b.ach_level : b.kind === 'official' || b.kind === 'secret' ? 4 : b.kind === 'challenge' ? 4 - Math.min(b.place || 3, 3) : 2;
  const rareOf = b => { const v = T.rar?.[MSSMedalCard.rarityKey(b)]; return v == null ? 101 : v; };
  const SORT = {
    best: (a, b) => tier(b) - tier(a) || rareOf(a) - rareOf(b) || new Date(b.earned_at) - new Date(a.earned_at),
    new: (a, b) => new Date(b.earned_at) - new Date(a.earned_at),
    rare: (a, b) => rareOf(a) - rareOf(b) || tier(b) - tier(a),
    az: (a, b) => SC().name(a).localeCompare(SC().name(b)),
  };
  // an achievement's lower levels when a higher one of it is yours too
  const topOf = () => { const t = {}; T.o.all.forEach(b => { if (b.kind === 'achievement') t[b.ach_key] = Math.max(t[b.ach_key] || 0, b.ach_level); }); return t; };
  const isLower = (b, top) => b.kind === 'achievement' && b.ach_level < top[b.ach_key];

  /* ── open / close ── */
  async function open(o) {
    if (T) return;
    T = { o, picks: o.picks.slice(0, SC().MAX), look: SC().cleanLook(o.look), sel: null, tab: 'medals', q: '', type: 'all', sort: 'best', lower: false, lift: null, rar: {} };
    T.start = sig();
    const ov = document.createElement('div');
    ov.className = 'st-ov';
    ov.innerHTML = `<div class="st" role="dialog" aria-modal="true" aria-labelledby="stT">
      <header class="st-head"><button type="button" class="st-x" data-st="close" aria-label="Close the Studio">${icon('x', 18)}</button>
        <div class="st-ht"><h2 id="stT">Showcase Studio</h2><small>Everything previews live · nothing changes until you save</small></div>
        <button type="button" class="tv-btn st-cancel" data-st="close">Cancel</button><button type="button" class="tv-btn is-main" data-st="save">Save</button></header>
      <div class="st-main">
        <section class="st-pv" aria-label="Preview"><div class="st-stage" id="stStage"></div>
          <div class="st-pv-foot"><span>${icon('grip', 13)} Drag medals to reorder</span><span>${icon('plus', 13)} Tap a spot, then a medal to replace</span>
            <span class="st-gap"></span><b id="stCount"></b><button type="button" class="tv-btn st-sm" data-st="clear">Clear all</button></div>
          <p class="sr-only" id="stLive" aria-live="assertive"></p></section>
        <section class="st-side"><div class="st-tabs" role="tablist" aria-label="Studio">${[['medals', 'Medals'], ['layout', 'Layout'], ['look', 'Look']].map(([k, l]) =>
          `<button type="button" role="tab" class="st-tab" id="stTab-${k}" data-tab="${k}" aria-controls="stPanel">${l}${k === 'medals' ? ` <i>${o.all.length}</i>` : ''}</button>`).join('')}</div>
          <div class="st-panel" id="stPanel" role="tabpanel" tabindex="-1"></div><div class="st-side-foot" id="stFoot"></div></section>
      </div></div>`;
    document.body.appendChild(ov);
    T.ov = ov;
    MSSDialog.bind(ov, requestClose);
    wire(ov);
    requestAnimationFrame(() => ov.classList.add('is-open'));
    MSSDialog.open(ov, { focus: '.st-x' });
    document.documentElement.classList.add('st-lock');
    await bg();
    if (o.autofill) autofill(true);
    drawAll();
    MSSMedalCard.rarity().then(r => { if (!T) return; T.rar = r || {}; if (T.tab === 'medals') drawPanel(); });
  }
  async function requestClose() {
    if (!T) return;
    if (dirty() && !(await showConfirm({ title: 'Discard changes?', message: 'Your showcase changes aren’t saved yet.', confirmText: 'Discard', danger: false }))) return;
    closeNow();
  }
  function closeNow() {
    if (!T) return;
    const ov = T.ov; T = null;
    MSSDialog.close(ov);
    document.documentElement.classList.remove('st-lock');
    ov.classList.remove('is-open');
    setTimeout(() => ov.remove(), reduce() ? 0 : 200);
  }
  async function save() {
    const btn = T.ov.querySelector('[data-st="save"]'); btn.disabled = true;
    try { await T.o.save(T.picks, SC().cleanLook(T.look)); closeNow(); }
    catch { if (T) btn.disabled = false; }
  }
  async function bg() {
    const L = T.look;
    T.bg = L.use_profile_backdrop ? await T.o.profileBg() : L.bg ? `${SC().IMG}w780${L.bg}` : null;
  }

  /* ── drawing ── */
  function drawAll() { drawStage(); drawTabs(); drawPanel(); }
  function drawStage() {
    if (!T) return;
    const box = T.ov.querySelector('#stStage'), n = T.picks.length;
    box.innerHTML = n ? SC().stageHTML(T.picks, T.look, { studio: true, sel: T.sel, name: T.o.name, total: T.o.total, bg: T.bg, phone: phoneMQ.matches })
      : `<div class="sc3 is-spotlight is-empty is-studio f-${T.look.finish} b-${T.look.blur} l-${T.look.lighting}${T.bg ? ' has-bg' : ''}">${T.bg ? `<span class="sc3-bg" style="background-image:url('${esc(T.bg)}')"></span>` : ''}<span class="sc3-wash"></span><span class="sc3-vig"></span>
          <div class="sc3-empty-t"><h3>Your stage is empty</h3><p>Tap medals to put them on show — the first one goes centre stage.</p></div></div>`;
    if (T.sel != null) box.querySelector('.sc3-top')?.insertAdjacentHTML('beforeend', `<span class="sc3-chip is-sel">Spot ${T.sel + 1} selected</span>`);
    T.ov.querySelector('#stCount').textContent = `${n} / ${SC().MAX}`;
    T.ov.querySelector('[data-st="clear"]').disabled = !n;
  }
  function drawTabs() {
    T.ov.querySelectorAll('.st-tab').forEach(b => { const on = b.dataset.tab === T.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    T.ov.querySelector('#stPanel').setAttribute('aria-labelledby', `stTab-${T.tab}`);
  }
  function drawPanel() {
    if (!T) return;
    const p = T.ov.querySelector('#stPanel'), foot = T.ov.querySelector('#stFoot');
    if (T.tab === 'layout') { p.innerHTML = layoutHTML(); foot.innerHTML = ''; return; }
    if (T.tab === 'look') { p.innerHTML = lookHTML(); foot.innerHTML = ''; return; }
    const keep = p.querySelector('#stQ') === document.activeElement;
    p.innerHTML = medalsHTML();
    const top = topOf(), hidden = T.o.all.filter(b => isLower(b, top) && !T.picks.some(x => x.id === b.id)).length;
    foot.innerHTML = `<button type="button" class="tv-btn" data-st="autofill"${T.picks.length >= SC().MAX ? ' disabled' : ''}>${icon('sparkles', 15)} Auto-fill my best</button>
      ${hidden || T.lower ? `<button type="button" class="tv-btn" data-st="lower" aria-pressed="${T.lower}">${T.lower ? `Hide ${hidden} lower levels` : `Hidden: ${hidden} lower level${hidden === 1 ? '' : 's'}`}</button>` : ''}`;
    if (keep) { const q = p.querySelector('#stQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  function medalsHTML() {
    const all = T.o.all, top = topOf(), q = T.q.trim().toLowerCase();
    const count = k => k === 'all' ? all.length : all.filter(b => b.kind === k).length;
    const list = all.filter(b => (T.type === 'all' || b.kind === T.type) && (!q || SC().name(b).toLowerCase().includes(q))
        && (T.lower || !isLower(b, top) || T.picks.some(x => x.id === b.id))).sort(SORT[T.sort]);
    if (!all.length) return `<div class="st-none">${icon('trophy', 22)}<b>No medals yet</b><span>Finish a challenge or reach an achievement level and it shows up here.</span></div>`;
    return `<div class="lyr-search st-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input class="lyr-field" type="search" id="stQ" value="${esc(T.q)}" placeholder="Search your medals" aria-label="Search your medals" autocomplete="off"></div>
      <div class="st-chips" role="radiogroup" aria-label="Kind">${TYPES.filter(([k]) => k === 'all' || count(k)).map(([k, l]) =>
        `<button type="button" role="radio" class="st-chip${T.type === k ? ' is-on' : ''}" aria-checked="${T.type === k}" data-type="${k}">${l} <i>${count(k)}</i></button>`).join('')}</div>
      <div class="st-row"><span class="st-lbl">${T.sel != null ? `Replace spot ${T.sel + 1} with…` : 'Your medals'}</span>
        <label class="st-sort">${icon('sort', 14)}<span class="sr-only">Sort</span><select id="stSort">${SORTS.map(([k, l]) => `<option value="${k}"${T.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${list.length ? `<ul class="st-grid" role="list">${list.map(b => { const at = T.picks.findIndex(x => x.id === b.id);
        return `<li><button type="button" class="st-tile${at >= 0 ? ' is-on' : ''}" data-id="${esc(b.id)}" aria-pressed="${at >= 0}"
            aria-label="${esc(SC().name(b))}, ${esc(SC().sub(b))}${at >= 0 ? `, on show in spot ${at + 1} — tap to take it off` : ''}">
          ${at >= 0 ? `<span class="st-n" aria-hidden="true">${at + 1}</span>` : ''}<span class="st-art" aria-hidden="true">${SC().medal(b, 56)}</span>
          <b translate="no">${esc(SC().name(b))}</b><small>${esc(SC().sub(b))}</small></button></li>`; }).join('')}</ul>`
        : `<p class="st-empty">No medals match${q ? ` “${esc(T.q.trim())}”` : ''}.</p>`}`;
  }
  function layoutHTML() {
    return `<div class="st-opts" role="radiogroup" aria-label="Layout">${SC().LAYOUTS.map(([k, l, d]) => `<button type="button" role="radio" class="st-opt${T.look.layout === k ? ' is-on' : ''}" aria-checked="${T.look.layout === k}" data-layout="${k}">
        <span class="st-thumb" aria-hidden="true">${SC().stageHTML(T.picks.length ? T.picks : [], { ...T.look, layout: k }, { thumb: true, bg: T.bg })}</span>
        <span class="st-opt-t"><b>${l}</b><small>${d}</small></span><span class="st-radio" aria-hidden="true"></span></button>`).join('')}</div>`;
  }
  const seg = (key, opts, label) => `<div class="st-seg" role="radiogroup" aria-label="${label}">${opts.map(([k, l]) =>
    `<button type="button" role="radio" class="st-seg-b${T.look[key] === k ? ' is-on' : ''}" aria-checked="${T.look[key] === k}" data-look="${key}" data-v="${k}">${l}</button>`).join('')}</div>`;
  function lookHTML() {
    const L = T.look;
    const pic = L.use_profile_backdrop ? ['Your profile backdrop', 'Follows it when you change it'] : L.bg ? [L.bg_title ? `Scene from ${L.bg_title}` : 'Scene from a title', '“Change” opens the profile backdrop picker'] : ['No picture', 'The finish’s own gradient'];
    return `<div class="st-look">
      <div class="st-look-h"><h3>Picture</h3><button type="button" class="st-link" data-st="picture">Change</button></div>
      <div class="st-pic"><span class="st-pic-img"${T.bg ? ` style="background-image:url('${esc(T.bg)}')"` : ''}>${T.bg ? '' : icon('image', 18)}</span>
        <span class="st-pic-t"><b translate="no">${esc(pic[0])}</b><small>${esc(pic[1])}</small></span>${L.bg && !L.use_profile_backdrop ? `<button type="button" class="st-link is-quiet" data-st="nopicture">Remove</button>` : ''}</div>
      <label class="st-switch"><span>Use my profile backdrop</span><input type="checkbox" data-st="link"${L.use_profile_backdrop ? ' checked' : ''}><i aria-hidden="true"></i></label>
      <h3>Blur</h3>${seg('blur', SC().BLURS, 'Blur')}
      <h3>Lighting</h3>${seg('lighting', SC().LIGHTS, 'Lighting')}
      <h3>Finish</h3><div class="st-fins" role="radiogroup" aria-label="Finish">${SC().FINISHES.map(([k, l]) =>
        `<button type="button" role="radio" class="st-fin${L.finish === k ? ' is-on' : ''}" aria-checked="${L.finish === k}" data-look="finish" data-v="${k}"><span class="st-sw f-${k}" aria-hidden="true"></span><span>${l}</span></button>`).join('')}</div>
      <p class="st-note">Auto follows light and dark. Oak and Marble use dark writing. No picture → the finish’s own gradient.</p></div>`;
  }

  /* ── picking ── */
  const say = t => { const l = T?.ov.querySelector('#stLive'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); } };
  function tap(id) {
    const b = T.o.all.find(x => x.id === id); if (!b) return;
    const at = T.picks.findIndex(x => x.id === id);
    let to = null;
    if (at >= 0) { T.picks.splice(at, 1); if (T.sel != null && T.sel >= T.picks.length) T.sel = null; say(`${SC().name(b)} taken off`); }
    else if (T.sel != null && T.sel < T.picks.length) { const old = T.picks[T.sel]; T.picks[T.sel] = b; to = T.sel; T.sel = null; say(`${SC().name(b)} in spot ${to + 1}, replacing ${SC().name(old)}`); }
    else if (T.picks.length < SC().MAX) { T.picks.push(b); to = T.picks.length - 1; say(`${SC().name(b)} in spot ${to + 1}`); }
    else { showToast('All 9 spots are full — tap a spot to replace it, or take one off.'); return; }
    const from = T.ov.querySelector(`.st-tile[data-id="${CSS.escape(id)}"] .st-art`)?.getBoundingClientRect();
    drawStage(); drawPanel();
    if (to != null && from) glide(from, to);
  }
  // the picked medal glides from its tile to its spot (250 ms)
  function glide(from, i) {
    if (reduce()) return;
    const el = T.ov.querySelector(`#stStage .sc3-post[data-spot="${i}"] .sc3-art`); if (!el) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    el.animate([{ transform: `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${from.width / r.width})`, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }],
      { duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function autofill(quiet) {
    const top = topOf(), have = new Set(T.picks.map(b => b.id));
    const cand = T.o.all.filter(b => !have.has(b.id) && !isLower(b, top)).sort(SORT.best);
    const before = T.picks.length;
    for (const b of cand) { if (T.picks.length >= SC().MAX) break; T.picks.push(b); }
    if (!quiet) { drawStage(); drawPanel(); }
    say(`${T.picks.length - before} medals added`);
  }
  function move(from, to) {
    if (to < 0 || to >= T.picks.length || from === to) return false;
    const [b] = T.picks.splice(from, 1); T.picks.splice(to, 0, b);
    return true;
  }

  /* ── events ── */
  function wire(ov) {
    let lp = null, lpFired = false, drag = null;
    ov.addEventListener('click', async ev => {
      if (lpFired) { lpFired = false; ev.preventDefault(); return; }
      const a = ev.target.closest('[data-st]');
      if (a) {
        const k = a.dataset.st;
        if (k === 'close') return requestClose();
        if (k === 'save') return save();
        if (k === 'clear') { T.picks = []; T.sel = null; drawStage(); drawPanel(); return say('Showcase cleared'); }
        if (k === 'autofill') return autofill();
        if (k === 'lower') { T.lower = !T.lower; return drawPanel(); }
        if (k === 'picture') return picture();
        if (k === 'nopicture') { T.look.bg = null; T.look.bg_title = null; await bg(); drawStage(); return drawPanel(); }
        return;
      }
      const tab = ev.target.closest('.st-tab'); if (tab) { T.tab = tab.dataset.tab; drawTabs(); return drawPanel(); }
      const ty = ev.target.closest('[data-type]'); if (ty) { T.type = ty.dataset.type; return drawPanel(); }
      const tile = ev.target.closest('.st-tile'); if (tile) return tap(tile.dataset.id);
      const lay = ev.target.closest('[data-layout]'); if (lay) { T.look.layout = lay.dataset.layout; drawStage(); return drawPanel(); }
      const lk = ev.target.closest('[data-look]'); if (lk) { T.look[lk.dataset.look] = lk.dataset.v; drawStage(); return drawPanel(); }
      const m = ev.target.closest('#stStage .sc3-m');
      if (m) { const i = +m.dataset.i; T.sel = T.sel === i ? null : i; drawStage(); drawPanel(); say(T.sel != null ? `Spot ${i + 1} selected — tap a medal to replace it` : 'Spot unselected'); }
    });
    ov.addEventListener('change', async ev => {
      if (ev.target.id === 'stSort') { T.sort = ev.target.value; return drawPanel(); }
      if (ev.target.dataset.st === 'link') { T.look.use_profile_backdrop = ev.target.checked; await bg(); drawStage(); drawPanel(); }
    });
    ov.addEventListener('input', ev => { if (ev.target.id === 'stQ') { T.q = ev.target.value; drawPanel(); } });
    // tabs: arrow keys
    ov.addEventListener('keydown', ev => {
      const tab = ev.target.closest('.st-tab');
      if (tab && ['ArrowLeft', 'ArrowRight'].includes(ev.key)) {
        const ks = ['medals', 'layout', 'look'], i = ks.indexOf(T.tab), j = (i + (ev.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
        T.tab = ks[j]; drawTabs(); drawPanel(); ov.querySelector(`#stTab-${ks[j]}`).focus(); ev.preventDefault(); return;
      }
      const m = ev.target.closest('#stStage .sc3-m'); if (!m) return;
      const i = +m.dataset.i, b = T.picks[i];
      const refocus = j => { drawStage(); ov.querySelector(`#stStage .sc3-m[data-i="${j}"]`)?.focus(); };
      if (ev.key === ' ') {
        ev.preventDefault();
        if (T.lift == null) { T.lift = { i, order: T.picks.slice() }; m.closest('.sc3-post').classList.add('is-lift'); say(`${SC().name(b)} lifted, spot ${i + 1}. Arrow keys move it, Space drops it, Escape puts it back.`); }
        else { T.lift = null; refocus(i); drawPanel(); say(`${SC().name(b)} dropped in spot ${i + 1}`); }
        return;
      }
      if (T.lift != null && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
        ev.preventDefault();
        const j = i + (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1);
        if (move(i, j)) { T.lift.i = j; refocus(j); ov.querySelector(`#stStage .sc3-post[data-spot="${j}"]`)?.classList.add('is-lift'); say(`Spot ${j + 1}`); }
        return;
      }
      if (T.lift != null && ev.key === 'Escape') {
        ev.preventDefault(); ev.stopPropagation();
        T.picks = T.lift.order; const j = T.picks.findIndex(x => x.id === b.id); T.lift = null; refocus(j); say('Put back');
      }
    }, true);
    ov.addEventListener('keyup', ev => { if (ev.key === ' ' && ev.target.closest('#stStage .sc3-m')) ev.preventDefault(); });   // Space lifts / drops, it doesn't select
    // long-press a tile → its Medal card · drag a medal on the stage → reorder
    ov.addEventListener('pointerdown', ev => {
      const tile = ev.target.closest('.st-tile');
      if (tile) {
        clearTimeout(lp);
        lp = setTimeout(() => { lpFired = true; card(tile.dataset.id); }, 500);
        return;
      }
      const m = ev.target.closest('#stStage .sc3-m'); if (!m || ev.button > 0) return;
      drag = { i: +m.dataset.i, x: ev.clientX, y: ev.clientY, el: m.closest('.sc3-post'), on: false, id: ev.pointerId };
    });
    const endLp = () => clearTimeout(lp);
    ov.addEventListener('pointerup', endLp); ov.addEventListener('pointercancel', endLp); ov.addEventListener('pointerleave', endLp, true);
    ov.addEventListener('pointermove', ev => {
      if (lp && ev.target.closest('.st-tile') == null) clearTimeout(lp);
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.on && Math.hypot(dx, dy) < 6) return;
      if (!drag.on) { drag.on = true; drag.el.classList.add('is-drag'); try { drag.el.setPointerCapture(drag.id); } catch {} }
      drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).map(e => e.closest?.('#stStage .sc3-post')).find(e => e && e !== drag.el);
      ov.querySelectorAll('#stStage .sc3-post.is-over').forEach(e => e.classList.remove('is-over'));
      if (under) under.classList.add('is-over');
      drag.to = under ? +under.dataset.spot : null;
    });
    const drop = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.on) return;
      lpFired = true; setTimeout(() => { lpFired = false; }, 0);   // the click after a drag does nothing
      if (d.to != null && move(d.i, d.to)) { const b = T.picks[d.to]; say(`${SC().name(b)} moved to spot ${d.to + 1}`); }
      drawStage(); drawPanel();
    };
    ov.addEventListener('pointerup', drop); ov.addEventListener('pointercancel', drop);
    phoneMQ.addEventListener('change', () => { if (T) drawStage(); });
  }
  async function card(id) {
    const b = T.o.all.find(x => x.id === id); if (!b) return;
    MSSMedalCard.open(b, { own: true, where: 'studio', look: T.look, bg: T.bg,
      showcase: { at: x => T ? T.picks.findIndex(p => p.id === x) : -1, toggle: async bb => { tap(bb.id); return T.picks.findIndex(p => p.id === bb.id); } } });
  }
  // Look → Picture → Change: the site's backdrop picker, on top of the Studio; the picture goes to the showcase
  async function picture() {
    await mssLoadScript('js/backdrop-picker.js');
    MSSBackdropPicker.open({ title: 'Showcase picture', subtitle: 'Showcase Studio · any movie or show’s backdrop', current: null,
      saveLabel: 'Use this picture', emptyText: 'Search for any title and pick one of its scenes — it sits behind your stage, blurred.',
      preview: (box, sel) => {
        const url = sel ? `${SC().IMG}w780${sel.path}` : T?.bg;
        box.innerHTML = `<div class="st-bgpv">${SC().stageHTML(T.picks.slice(0, 5), T.look, { thumb: true, bg: url })}</div>`;
        box.style.height = '';
      },
      framing: null,
      onSave: async sel => { if (!T) return; T.look.bg = sel.path; T.look.bg_title = sel.title || null; T.look.use_profile_backdrop = false; await bg(); drawStage(); drawPanel(); } });
  }

  return { open, close: requestClose };
})();
