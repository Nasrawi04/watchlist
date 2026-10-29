/* ═══════════════════════════════════════════════════════════════
   dashboard.js — Profile "Overview" dashboard (v613)

   Sections (each up to 5 titles, all optional):
     Top Favorites     (any type)      → profiles.top_picks
     Would Recommend   (any type)      → profiles.recommended
     Top TV Shows / Movies / Anime / Cartoons → profiles.fav_tv / fav_movies / fav_anime / fav_cartoons

   Your own profile (editable):
     • empty slots are "+" cards — tap one to pick a title for it
     • Edit → cards get a red outline: drag to re-rank, tap a card to
       replace it, ✕ to remove, Done to finish. Changes save instantly.
   A friend's profile (read-only): only filled sections are shown.

   MSSDash.render(el, { entries, profile, editable, openEntry(id), save(key, ids) })
═══════════════════════════════════════════════════════════════ */

const DASH_SECTIONS = [
  { key: 'top_picks',    eyebrow: 'Handpicked',      title: 'Top Favorites', cat: null },
  { key: 'recommended',  eyebrow: 'Would Recommend', title: 'Top Picks',     cat: null },
  { key: 'fav_tv',       eyebrow: 'Top 5',           title: 'TV Shows',      cat: 'tv' },
  { key: 'fav_movies',   eyebrow: 'Top 5',           title: 'Movies',        cat: 'movies' },
  { key: 'fav_anime',    eyebrow: 'Top 5',           title: 'Anime',         cat: 'anime' },
  { key: 'fav_cartoons', eyebrow: 'Top 5',           title: 'Cartoons',      cat: 'cartoons' },
];
const DASH_MAX = 5;
const DASH_PICK_PAGE = 60;   // picker shows this many at a time, then "View more"

const MSSDash = (() => {
  let opts = null, el = null;
  let editing = null;            // key of the section being edited
  const esc = s => escHTML(s == null ? '' : s);
  const byId = id => opts.entries.find(e => e.id === id);
  const idsOf = key => (Array.isArray(opts.profile?.[key]) ? opts.profile[key] : []).filter(id => byId(id)).slice(0, DASH_MAX);

  // Same card as the rest of the site: poster, then title + year, score underneath
  function cardHTML(e, sec, i) {
    const score = liveScore(e) != null ? Number(liveScore(e)) : null;
    const edit = editing === sec.key;
    return MSSCard.poster({
      cls: 'dash-card' + (edit ? ' dash-editing' : ''), infoCls: 'dash-info',
      attrs: `data-key="${sec.key}" data-idx="${i}" data-id="${esc(e.id)}" ${edit ? `onpointerdown="MSSDash._down(event, this)"` : ''} onclick="MSSDash._tap(event, ${attrJSON(sec.key)}, ${i})"`,
      title: e.title, year: e.year, posterHTML: posterHTML(e, 'big'), rank: i + 1,
      overPoster: edit ? `<button type="button" class="dash-remove" onclick="event.stopPropagation();MSSDash._remove(${attrJSON(sec.key)}, ${i})" onpointerdown="event.stopPropagation()" aria-label="Remove">${icon('x', 13)}</button>` : '',
      below: score != null ? `<div class="dash-score">★ ${score.toFixed(2)}</div>` : '',
    });
  }
  function emptyHTML(sec, i) {
    return `<button type="button" class="dash-empty" onclick="MSSDash._pickFor(${attrJSON(sec.key)}, ${i})" aria-label="Add a title to ${esc(sec.title)}">
      <span class="dash-empty-inner"><span class="dash-empty-plus">${icon('plus', 22)}</span><span class="dash-empty-lbl">Add</span></span>
    </button>`;
  }

  function sectionHTML(sec) {
    const ids = idsOf(sec.key);
    if (!opts.editable && !ids.length) return '';
    // your own, still empty: one slim "pick" row instead of five big blank cards
    // (and nothing at all for a type you have no titles of yet)
    if (!ids.length) {
      if (sec.cat && !opts.entries.some(e => e.cat === sec.cat)) return '';
      return `<div class="pv-section dash-section dash-section-empty" data-key="${sec.key}">
        <button type="button" class="dash-empty-row" onclick="MSSDash._pickFor(${attrJSON(sec.key)}, 0)">
          <span class="dash-empty-plus">${icon('plus', 16)}</span>
          <span><span class="pv-eyebrow">${esc(sec.eyebrow)}</span><b>${esc(sec.title)}</b><small>Pick up to ${DASH_MAX}</small></span>
        </button></div>`;
    }
    const edit = editing === sec.key;
    const slots = [];
    ids.forEach((id, i) => slots.push(cardHTML(byId(id), sec, i)));
    if (opts.editable) for (let i = ids.length; i < DASH_MAX; i++) slots.push(emptyHTML(sec, i));
    return `<div class="pv-section dash-section${edit ? ' is-editing' : ''}" data-key="${sec.key}">
      <div class="dash-head">
        <div><div class="pv-eyebrow">${esc(sec.eyebrow)}</div><div class="pv-title">${esc(sec.title)}</div></div>
        ${opts.editable && ids.length ? `<button class="fav-edit-btn${edit ? ' dash-done' : ''}" onclick="MSSDash._toggleEdit(${attrJSON(sec.key)})">${edit ? `${icon('check', 13)} Done` : `${icon('edit', 13)} Edit`}</button>` : ''}
      </div>
      ${edit ? `<div class="dash-hint">Drag to re-rank · tap a title to replace it · ✕ to remove</div>` : ''}
      <div class="prof-ov-grid dash-grid">${slots.join('')}</div>
    </div>`;
  }

  function draw() {
    const html = DASH_SECTIONS.map(sectionHTML).join('');
    el.innerHTML = html || mssEmpty({ compact: true, art: 'watched', title: 'Nothing picked yet', text: 'No favourites on show here. Yet.' });
    // what was drawn (sections, how many cards / "+" slots) — the next loading skeleton draws the same
    mssSkeleton.shape(opts.editable ? 'dash_own' : 'dash_other', [...el.querySelectorAll('.dash-section')].map(x => ({
      k: x.dataset.key, slim: x.classList.contains('dash-section-empty'), c: x.querySelectorAll('.dash-card').length, e: x.querySelectorAll('.dash-empty').length })));
  }

  async function persist(key, ids) {
    opts.profile[key] = ids;
    draw();
    try { await opts.save(key, ids); }
    catch (e) { console.error(e); showToast('Could not save — try again.', 'err'); }
  }

  /* ── Picker ── */
  function injectPicker() {
    if (document.getElementById('dashPickOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'dashPickOverlay';
    ov.innerHTML = `<div id="dashPickCard" role="dialog" aria-modal="true" aria-labelledby="dpTitle">
        <div class="dp-head"><div><div class="dp-eyebrow" id="dpEyebrow"></div><div class="dp-title" id="dpTitle"></div></div>
          <button class="dp-close" onclick="MSSDash._closePick()" aria-label="Close">${icon('x', 18)}</button></div>
        <div class="dp-search fused-search-wrap">
          <input id="dpSearch" type="text" class="add-friend-input" placeholder="Search your titles…" autocomplete="off" spellcheck="false" oninput="MSSDash._renderPick()">
          <button type="button" class="fused-search-btn" tabindex="-1" onclick="document.getElementById('dpSearch').focus()">${icon('search', 16)}<span>Search</span></button>
        </div>
        <div class="dp-grid" id="dpGrid"></div>
      </div>`;
    MSSDialog.bind(ov, closePick);
    document.body.appendChild(ov);
  }
  let pickState = null;
  function openPick(key, idx) {
    const sec = DASH_SECTIONS.find(s => s.key === key);
    injectPicker();
    pickState = { sec, idx, limit: DASH_PICK_PAGE };
    document.getElementById('dpEyebrow').textContent = sec.cat ? `Top ${sec.title}` : sec.title;
    document.getElementById('dpTitle').textContent = idx < idsOf(key).length ? `Replace #${idx + 1}` : `Pick #${idx + 1}`;
    document.getElementById('dpSearch').value = '';
    renderPick();
    document.getElementById('dpGrid').scrollTop = 0;
    MSSDialog.open(document.getElementById('dashPickOverlay'),
      { focus: window.matchMedia('(max-width:640px)').matches ? null : '#dpSearch' });
  }
  function closePick() {
    MSSDialog.close(document.getElementById('dashPickOverlay'));
    pickState = null;
  }
  function renderPick() {
    if (!pickState) return;
    const { sec } = pickState;
    const q = document.getElementById('dpSearch').value.trim().toLowerCase();
    const taken = new Set(idsOf(sec.key));
    // Only titles you've actually watched: Watched, To Be Continued, or
    // Currently Watching (incl. Taking a Break) — never Watchlist / Up Next.
    // Watched first, best-rated first.
    const PICKABLE = { completed: 0, ongoing: 0, watching: 1, paused: 1 };
    const rank = e => PICKABLE[e.status];
    const list = opts.entries
      .filter(e => e.status in PICKABLE && (!sec.cat || e.cat === sec.cat) && !taken.has(e.id) && (!q || (e.title || '').toLowerCase().includes(q)))
      .sort((a, b) => rank(a) - rank(b) || (liveScore(b) || 0) - (liveScore(a) || 0));
    const grid = document.getElementById('dpGrid');
    const shown = list.slice(0, pickState.limit);
    grid.innerHTML = list.length ? shown.map(e => `
      <button type="button" class="dp-item" onclick="MSSDash._choose(${attrJSON(e.id)})">
        <span class="dp-poster">${posterHTML(e, 'big')}</span>
        <span class="dp-name" translate="no">${esc(e.title)}</span>
        ${liveScore(e) != null ? `<span class="dp-score">★ ${Number(liveScore(e)).toFixed(2)}</span>` : ''}
      </button>`).join('')
        + (list.length > shown.length ? `<button type="button" class="dp-more" onclick="MSSDash._pickMore()">View more <span>(${list.length - shown.length} left)</span></button>` : '')
      : `<div class="dp-empty">${q ? `No titles match “${esc(q)}”.` : `No watched ${sec.cat ? esc(sec.title) : 'titles'} yet.`}</div>`;
  }
  function choose(id) {
    if (!pickState) return;
    const { sec, idx } = pickState;
    const ids = idsOf(sec.key);
    if (idx < ids.length) ids[idx] = id; else ids.push(id);
    closePick();
    persist(sec.key, ids.slice(0, DASH_MAX));
  }

  /* ── Edit mode: tap, remove, drag to re-rank ── */
  let drag = null, justDragged = false;
  function tap(ev, key, idx) {
    if (justDragged) { justDragged = false; return; }
    if (editing === key) openPick(key, idx);
    else opts.openEntry(idsOf(key)[idx]);
  }
  function remove(key, idx) {
    const ids = idsOf(key); ids.splice(idx, 1);
    if (!ids.length) editing = null;
    persist(key, ids);
  }
  function toggleEdit(key) { editing = editing === key ? null : key; draw(); }

  function down(ev, card) {
    if (ev.button !== undefined && ev.button !== 0) return;
    drag = { card, key: card.dataset.key, from: +card.dataset.idx, x: ev.clientX, y: ev.clientY, started: false };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  function move(ev) {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 6) return;
      drag.started = true;
      drag.card.classList.add('dash-dragging');
      document.body.classList.add('lr-no-select');
    }
    ev.preventDefault();
    drag.card.style.transform = `translate(${ev.clientX - drag.x}px, ${ev.clientY - drag.y}px) scale(1.04)`;
    drag.card.style.pointerEvents = 'none';
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(`.dash-card[data-key="${drag.key}"]`);
    el.querySelectorAll('.dash-card.dash-over').forEach(c => c.classList.remove('dash-over'));
    if (over && over !== drag.card) over.classList.add('dash-over');
    drag.to = over && over !== drag.card ? +over.dataset.idx : null;
  }
  function up() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (!drag) return;
    const { started, key, from, to } = drag;
    document.body.classList.remove('lr-no-select');
    drag = null;
    if (!started) return;
    justDragged = true; setTimeout(() => { justDragged = false; }, 60);
    if (to == null || to === from) { draw(); return; }
    const ids = idsOf(key);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    persist(key, ids);
  }

  function render(target, o) { el = target; opts = o; editing = null; draw(); }

  return {
    render,
    _tap: tap, _remove: remove, _toggleEdit: toggleEdit, _down: down,
    _pickFor: (key, idx) => openPick(key, idx), _choose: choose, _closePick: closePick,
    _renderPick: () => { if (pickState) pickState.limit = DASH_PICK_PAGE; renderPick(); },
    _pickMore: () => { if (pickState) { pickState.limit += DASH_PICK_PAGE; renderPick(); } },
  };
})();

/* ── Overview loading skeleton (profile.html, profile-view.html): the side stats with their
   real labels, the Ratings curve, and the same picks sections as last time on this device —
   sample cards masked into placeholders (mssSkeleton, config.js) ── */
mssSkeleton.define('overview', () => {
  const own = /(^|\/)profile\.html$/.test(location.pathname);
  const shape = mssSkeleton.shape(own ? 'dash_own' : 'dash_other') || [{ k: 'top_picks', c: 5, e: 0 }, { k: 'recommended', c: 5, e: 0 }];
  const keep = t => `<span data-skel-keep>${escHTML(t)}</span>`;
  const labels = ['All Items', 'TV Shows', 'TV Shows Watched', 'Movies', 'Movies Watched', 'Animes', 'Animes Watched', 'Cartoons', 'Cartoons Watched', 'Watchlist', 'Lists', 'Reviews'];
  const side = `<div class="stats-box">${labels.map((l, i) => `<div class="stats-row"><span class="stats-label" data-skel-keep>${l}</span><span class="stats-value">${i ? '12' : '120'}</span></div>`).join('')}</div>`
    + `<div class="rc-box"><div class="rc-head"><span class="rc-title" data-skel-keep>Ratings</span><span class="rc-total">120 titles</span></div>
       <div class="rc-plot">${[0, 0, 0, 0, 0, 0, 0, .05, .08, .12, .2, .3, .45, .6, .8, 1, .85, .6, .35, .15].map(k => `<span class="rc-col" style="--k:${k}"><span class="rc-bar skel"></span></span>`).join('')}</div>
       <div class="rc-axis" data-skel-keep><span>0</span><span>5</span><span>10</span></div></div>`;
  const card = i => MSSCard.poster({ cls: 'dash-card', infoCls: 'dash-info', title: 'Sample title', year: '2024', posterHTML: '', rank: i + 1, below: '<div class="dash-score">★ 8.50</div>' });
  const main = shape.map(x => {
    const sec = DASH_SECTIONS.find(d => d.key === x.k);
    if (!sec) return '';
    if (x.slim) return `<div class="pv-section dash-section dash-section-empty"><div class="dash-empty-row"><span class="dash-empty-plus">${icon('plus', 16)}</span>
      <span><span class="pv-eyebrow">${keep(sec.eyebrow)}</span><b>${keep(sec.title)}</b><small>${keep('Pick up to ' + DASH_MAX)}</small></span></div></div>`;
    return `<div class="pv-section dash-section"><div class="dash-head"><div><div class="pv-eyebrow" data-skel-keep>${escHTML(sec.eyebrow)}</div><div class="pv-title" data-skel-keep>${escHTML(sec.title)}</div></div></div>
      <div class="prof-ov-grid dash-grid">${Array.from({ length: x.c }, (_, i) => card(i)).join('')}${'<div class="dash-empty"><span class="dash-empty-inner"></span></div>'.repeat(x.e)}</div></div>`;
  }).join('');
  return `<div class="overview-layout"><div class="overview-side">${side}</div><div class="overview-main">${main}</div></div>`;
});
