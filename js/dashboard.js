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
    const rankCls = i === 0 ? 'cg-rank-1' : i === 1 ? 'cg-rank-2' : i === 2 ? 'cg-rank-3' : 'cg-rank-other';
    return `<div class="q-card dash-card${edit ? ' dash-editing' : ''}" data-key="${sec.key}" data-idx="${i}" data-id="${esc(e.id)}"
        ${edit ? `onpointerdown="MSSDash._down(event, this)"` : ''}
        onclick="MSSDash._tap(event, ${attrJSON(sec.key)}, ${i})">
      <div class="q-poster" style="position:relative">${posterHTML(e, 'big')}<div class="q-poster-overlay"></div>
        <div class="cg-rank-badge ${rankCls}">${i + 1}</div>
        ${edit ? `<button class="dash-remove" onclick="event.stopPropagation();MSSDash._remove(${attrJSON(sec.key)}, ${i})" onpointerdown="event.stopPropagation()" aria-label="Remove">${icon('x', 13)}</button>` : ''}
      </div>
      <div class="q-info dash-info">
        <div class="title-year-row"><div class="q-title">${esc(e.title)}</div>${e.year ? `<span class="title-year-inline">${esc(String(e.year).slice(0, 4))}</span>` : ''}</div>
        ${score != null ? `<div class="dash-score">★ ${score.toFixed(2)}</div>` : ''}
      </div>
    </div>`;
  }
  function emptyHTML(sec, i) {
    return `<button type="button" class="dash-empty" onclick="MSSDash._pickFor(${attrJSON(sec.key)}, ${i})" aria-label="Add a title to ${esc(sec.title)}">
      <span class="dash-empty-inner"><span class="dash-empty-plus">${icon('plus', 22)}</span><span class="dash-empty-lbl">Add</span></span>
    </button>`;
  }

  function sectionHTML(sec) {
    const ids = idsOf(sec.key);
    if (!opts.editable && !ids.length) return '';
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
    el.innerHTML = html || `<div class="pv-empty" style="text-align:center;padding:2rem 1rem;color:var(--text-3);font-size:14px;">Nothing picked yet.</div>`;
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
    ov.innerHTML = `<div id="dashPickCard" role="dialog" aria-modal="true">
        <div class="dp-head"><div><div class="dp-eyebrow" id="dpEyebrow"></div><div class="dp-title" id="dpTitle"></div></div>
          <button class="dp-close" onclick="MSSDash._closePick()" aria-label="Close">${icon('x', 18)}</button></div>
        <div class="dp-search fused-search-wrap">
          <input id="dpSearch" type="text" class="add-friend-input" placeholder="Search your titles…" autocomplete="off" spellcheck="false" oninput="MSSDash._renderPick()">
          <button type="button" class="fused-search-btn" tabindex="-1" onclick="document.getElementById('dpSearch').focus()">${icon('search', 16)}<span>Search</span></button>
        </div>
        <div class="dp-grid" id="dpGrid"></div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closePick(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) closePick(); });
  }
  let pickState = null;
  function openPick(key, idx) {
    const sec = DASH_SECTIONS.find(s => s.key === key);
    injectPicker();
    pickState = { sec, idx };
    document.getElementById('dpEyebrow').textContent = sec.cat ? `Top ${sec.title}` : sec.title;
    document.getElementById('dpTitle').textContent = idx < idsOf(key).length ? `Replace #${idx + 1}` : `Pick #${idx + 1}`;
    document.getElementById('dpSearch').value = '';
    renderPick();
    document.getElementById('dashPickOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!window.matchMedia('(max-width:640px)').matches) setTimeout(() => document.getElementById('dpSearch').focus(), 80);
  }
  function closePick() {
    document.getElementById('dashPickOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
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
    grid.innerHTML = list.length ? list.slice(0, 120).map(e => `
      <button type="button" class="dp-item" onclick="MSSDash._choose(${attrJSON(e.id)})">
        <span class="dp-poster">${posterHTML(e, 'big')}</span>
        <span class="dp-name">${esc(e.title)}</span>
        ${liveScore(e) != null ? `<span class="dp-score">★ ${Number(liveScore(e)).toFixed(2)}</span>` : ''}
      </button>`).join('')
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
    _pickFor: (key, idx) => openPick(key, idx), _choose: choose, _closePick: closePick, _renderPick: renderPick,
  };
})();
