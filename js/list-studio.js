/* ══════════════════════════════════════════════════════════════
   list-studio.js — the List Studio (MSSListStudio): make or edit a list in
   one popup, laid out like the Export Studio.

   Left  · Details (name, description, Ranked / Unranked, Who can view +
           its private link, Collaborate)
         · Add titles (My Library / Discover, search, Sort, Status, Type,
           Genre, Selected only, Select all shown) — tap to add / remove
   Right · Your list, live: Order by (score, date watched, release date,
           title, a rating, shuffle) + "Keep sorted automatically" (saved as
           sort_mode, so titles added later slot into place), and moving by
           hand — drag, ↑ ↓, or type a position (ranked lists).
   Phones: two tabs — Options · My list (n).

   MSSListStudio.init({
     lists: () => all your lists (incl. shared with you: _collab, _owner),
     entries: () => your library, resolve: id → title (entry or tmdb:…),
     save: list → saved row (insert when no id), afterSave(list, isNew),
     collab: (listId, then) → opens Collaborate,
   })
   MSSListStudio.open({ id })   no id = new list
   Requires config.js, nav.js (tmdbFetch), list-popup.js (MSSList.ORDERS / sortBy /
   orderHint / reorder / cache), MSSDialog, showConfirm, showToast.
══════════════════════════════════════════════════════════════ */
const MSSListStudio = (() => {
  let C = null, S = null;
  const $ = id => document.getElementById(id);
  const esc = s => escHTML(s == null ? '' : String(s));
  const STATUS = { watched: ['completed', 'ongoing'], watching: ['watching', 'paused'], watchlist: ['queue', 'up_next'] };
  const STATUS_TAG = { watching: 'Watching', paused: 'Taking a Break', queue: 'Watchlist', up_next: 'Up Next', ongoing: 'Caught Up' };
  const PICK_SORTS = [['score', 'Highest score'], ['watched_new', 'Recently watched'], ['added', 'Recently added'], ['release_new', 'Newest release'], ['release_old', 'Oldest release'], ['az', 'Title A → Z']];
  const MAX_WORDS = 50, SHOW_STEP = 60;
  const GRIP = '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/><circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/></svg>';
  const words = s => (s || '').trim() ? s.trim().split(/\s+/).length : 0;
  const phone = () => window.matchMedia('(max-width:860px)').matches;
  const item = id => C.resolve(id) || MSSList.cache[id] || null;

  function init(cfg) { C = cfg; }

  /* ── open / close ── */
  function open(o = {}) {
    const list = o.id ? C.lists().find(l => l.id === o.id) : null;
    if (o.id && !list) return;
    const mode = list?.sort_mode && list.sort_mode !== 'picked' ? list.sort_mode : 'picked';
    S = {
      list, isNew: !list, shared: !!list?._collab, official: !!(list ? list.official : window._navUserProfile?.is_official),
      title: list?.title || '', desc: list?.description || '', ranked: list ? list.ranked ?? null : null, collab: false, vis: list?.visibility || 'anyone',
      ids: (list?.items || []).slice(), mode, auto: mode !== 'picked',
      src: 'library', q: '', f: { sort: 'score', status: 'watched', type: '', genre: '', onlySel: false }, shown: SHOW_STEP,
      disc: null, tab: 'opts', busy: false,
    };
    S.start = JSON.stringify(snap());
    S.locked = S.shared && mode !== 'picked';   // the owner keeps a shared list sorted
    const ov = overlay();
    $('lsTitleH').textContent = S.isNew ? 'New List' : S.shared ? 'Edit Shared List' : 'Edit List';
    drawOpts(); drawSide(); drawTabs(); drawFoot();
    // laptops: straight into the name / search box (phones would pop the keyboard up over everything)
    MSSDialog.open(ov, { focus: phone() ? null : S.shared ? '#lsSearch' : '#lsName' });
  }
  const snap = () => ({ t: S.title.trim(), d: S.desc.trim(), r: S.ranked, v: S.vis, i: S.ids, m: S.auto ? S.mode : 'picked', c: S.collab });
  const dirty = () => S && JSON.stringify(snap()) !== S.start;
  async function close(force) {
    if (!S || S.busy) return;
    if (!force && dirty() && !(await showConfirm({ title: 'Discard changes?', message: 'Your changes to this list won’t be saved.', confirmText: 'Discard', iconName: 'x' }))) return;
    MSSDialog.close($('lsOverlay'));
    S = null;
  }

  function overlay() {
    let ov = $('lsOverlay');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'lsOverlay'; ov.className = 'soc-overlay xs-overlay';
    ov.innerHTML = `<div class="soc-card xs-card ls-card" role="dialog" aria-modal="true" aria-labelledby="lsTitleH">
        <div class="sf-header xs-head"><div><div class="sf-title" id="lsTitleH">New List</div><div class="xs-head-sub"><span class="ls-sub-wide">Add titles on the left — your list fills in on the right.</span><span class="ls-sub-phone">Add titles in Options — they fill in under My list.</span></div></div>
          <button type="button" class="sf-close" aria-label="Close" onclick="MSSListStudio.close()">${icon('x', 18)}</button></div>
        <div class="pn-toggle ls-tabs" id="lsTabs" role="tablist" aria-label="List Studio"></div>
        <div class="xs-grid ls-grid" id="lsGrid">
          <div class="xs-opts" id="lsOpts"></div>
          <div class="xs-side ls-side" id="lsSide"></div>
        </div>
        <div class="sf-footer xs-foot">
          <button type="button" class="sf-clear-btn" onclick="MSSListStudio.close()">Cancel</button>
          <button type="button" class="sf-apply-btn" id="lsSave" onclick="MSSListStudio._save()">${icon('check', 15)} Save List</button>
        </div>
      </div>`;
    MSSDialog.bind(ov, () => close());
    document.body.appendChild(ov);
    return ov;
  }

  /* ── phone tabs ── */
  function drawTabs() {
    $('lsTabs').innerHTML = [['opts', 'Options'], ['list', `My list (${S.ids.length})`]].map(([k, l]) =>
      `<button type="button" role="tab" class="pn-toggle-btn${S.tab === k ? ' active' : ''}" aria-selected="${S.tab === k}" onclick="MSSListStudio._tab('${k}')">${l}</button>`).join('');
    $('lsGrid').dataset.tab = S.tab;
  }
  function tab(k) { S.tab = k; drawTabs(); $('lsGrid').scrollTop = 0; }

  function drawFoot() {
    const b = $('lsSave');
    b.disabled = S.busy || !S.title.trim();
    b.innerHTML = S.busy ? 'Saving…' : `${icon('check', 15)} ${S.isNew ? 'Create List' : 'Save List'}`;
  }

  /* ── left: details + add titles ── */
  const sec = (id, label, body, sub) => `<div class="xs-sec" id="${id}"><div class="xs-sec-label">${label}${sub ? `<span>${sub}</span>` : ''}</div>${body}</div>`;
  const sw = (on, act, label, sub) => `<button type="button" class="xs-switch" role="switch" aria-checked="${on}" onclick="${act}"><span class="xs-switch-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
  function rankedHTML() {
    if (S.shared || S.official) return '';
    const r = S.ranked;
    return `<div class="la-seg" role="radiogroup" aria-label="Ranked or unranked">
        <button type="button" role="radio" aria-checked="${r === true}" class="${r === true ? 'on' : ''}" onclick="MSSListStudio._ranked(true)">${icon('trophy', 13)} Ranked<small>Numbered — #1 is your top pick</small></button>
        <button type="button" role="radio" aria-checked="${r === false}" class="${r === false ? 'on' : ''}" onclick="MSSListStudio._ranked(false)">${icon('list', 13)} Unranked<small>A collection, in the order you choose</small></button>
      </div>`;
  }
  // Who can view (068) — enforced by the database; official lists are always public
  const VIS = [['anyone', 'globe', 'Anyone', 'Community, your profile, search'], ['friends', 'users', 'Friends', 'Only your friends'], ['link', 'lock', 'Private link', 'Only people with the link, or you send it to']];
  function visHTML() {
    if (S.shared || S.official) return '';
    const cur = VIS.find(v => v[0] === S.vis);
    return `<div class="ls-field"><span class="ls-field-l" id="lsVisL">Who can view</span>
        <div class="ls-vis" role="radiogroup" aria-labelledby="lsVisL">${VIS.map(([k, ic, l, sub]) =>
          `<button type="button" role="radio" aria-checked="${S.vis === k}" class="ls-vis-opt${S.vis === k ? ' on' : ''}" onclick="MSSListStudio._vis('${k}')">${icon(ic, 15)}<b>${l}</b><small>${sub}</small></button>`).join('')}</div>
        ${S.vis === 'anyone' ? '' : S.isNew
          ? `<div class="la-help" style="margin-top:8px">${icon('link', 13)}<span>${S.vis === 'link' ? 'Once it’s created, copy its private link from here or send it in Inbox.' : 'Friends see it on your profile; you can also share a private link once it’s created.'}</span></div>`
          : `<div class="ls-link">
              <button type="button" class="fp-chip" onclick="MSSListStudio._link()">${icon('link', 12)} Copy private link</button>
              <button type="button" class="fp-chip" onclick="MSSListStudio._link(true)">${icon('refresh', 12)} New link</button>
              <small>${cur && S.vis === 'link' ? 'Anyone with it can open the list.' : 'Anyone with it can open the list, even if you’re not friends.'} A new link stops the old one working.</small>
            </div>`}
      </div>`;
  }
  function drawOpts() {
    const details = S.shared
      ? `<div class="la-note">${icon('users', 14)}<span><b>${esc(S.title)}</b> is shared with you${S.list._owner?.username ? ` by @${esc(S.list._owner.username)}` : ''} — you can add, remove and move titles.</span></div>`
      : `<label class="ls-field"><span class="ls-field-l">Name</span>
          <input class="xs-input" id="lsName" maxlength="60" placeholder="e.g. Comfort Shows" value="${esc(S.title)}" oninput="MSSListStudio._title(this.value)" onkeydown="if(event.key==='Enter')MSSListStudio._save()"></label>
        <label class="ls-field"><span class="ls-field-l">Description <small>(optional, up to ${MAX_WORDS} words)</small></span>
          <textarea class="list-desc-field" id="lsDesc" maxlength="500" placeholder="What’s this list about?" oninput="MSSListStudio._desc(this)">${esc(S.desc)}</textarea>
          <span class="list-desc-count" id="lsDescCount"></span></label>
        <div id="lsRanked">${rankedHTML()}</div>
        <div id="lsVis">${visHTML()}</div>
        ${S.isNew ? `<div class="xs-switches" id="lsCollab" style="margin-top:10px">${sw(S.collab, 'MSSListStudio._collab()', 'Invite friends to this list', 'They can add and remove titles with you — only you can rename or delete it')}</div>` : ''}`;
    $('lsOpts').innerHTML = sec('lsSecDetails', 'Details', details)
      + sec('lsSecAdd', 'Add titles', `
        <div class="pn-toggle ls-src" role="tablist" aria-label="Where from">
          <button type="button" role="tab" class="pn-toggle-btn${S.src === 'library' ? ' active' : ''}" aria-selected="${S.src === 'library'}" onclick="MSSListStudio._src('library')">My Library</button>
          <button type="button" role="tab" class="pn-toggle-btn${S.src === 'discover' ? ' active' : ''}" aria-selected="${S.src === 'discover'}" onclick="MSSListStudio._src('discover')">Discover</button>
        </div>
        <div class="fav-picker-search-wrap ls-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="search" id="lsSearch" class="fav-picker-search-input" autocomplete="off" aria-label="Search titles" value="${esc(S.q)}"
            placeholder="${S.src === 'discover' ? 'Search movies & shows on TMDB…' : 'Search your titles…'}" oninput="MSSListStudio._q(this.value)">
        </div>
        <div id="lsTools"></div>
        <div class="ls-results" id="lsResults" aria-live="polite"></div>`);
    if (!S.shared) descCount();
    drawTools(); drawResults();
  }
  function descCount() {
    const n = words(S.desc), el = $('lsDescCount');
    if (el) { el.textContent = n >= MAX_WORDS ? `Reached the limit (${MAX_WORDS}/${MAX_WORDS} words)` : `${n} / ${MAX_WORDS} words`; el.classList.toggle('over', n >= MAX_WORDS); }
  }
  function drawTools() {
    if (S.src === 'discover') { $('lsTools').innerHTML = ''; return; }
    const pool = C.entries();
    const genres = [...new Set(pool.flatMap(e => e.genres || []))].sort();
    const f = S.f;
    const sel = (key, label, opts) => `<label class="fp-sel"><span>${label}</span><select aria-label="${label}" onchange="MSSListStudio._f('${key}', this.value)">${opts.map(([v, l]) => `<option value="${esc(v)}"${f[key] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    $('lsTools').innerHTML = `<div class="fp-tools ls-tools">
        ${sel('sort', 'Sort', PICK_SORTS)}
        ${sel('status', 'Status', [['watched', 'Watched'], ['watching', 'Watching'], ['watchlist', 'Watchlist'], ['all', 'All titles']])}
        ${sel('type', 'Type', [['', 'All types'], ['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']])}
        ${sel('genre', 'Genre', [['', 'All genres'], ...genres.map(g => [g, g])])}
      </div>
      <div class="fp-bar ls-bar"><span id="lsShown"></span>
        <button type="button" class="fp-chip${f.onlySel ? ' on' : ''}" aria-pressed="${f.onlySel}" onclick="MSSListStudio._f('onlySel', ${!f.onlySel})">${icon('check', 12)} In the list only</button>
        <button type="button" class="fp-chip" onclick="MSSListStudio._addShown()">${icon('plus', 12)} Add all shown</button>
      </div>`;
  }
  function libraryRows() {
    const f = S.f;
    let rows = f.onlySel ? S.ids.map(item).filter(Boolean)
      : C.entries().filter(e => f.status === 'all' || (STATUS[f.status] || []).includes(e.status));
    if (f.type) rows = rows.filter(e => e.cat === f.type);
    if (f.genre) rows = rows.filter(e => (e.genres || []).includes(f.genre));
    if (S.q) rows = rows.filter(e => [e.title, ...(e.genres || []), CAT_META[e.cat]?.label].filter(Boolean).join(' ').toLowerCase().includes(S.q));
    const mode = f.sort === 'score' ? 'highest' : f.sort === 'added' ? null : f.sort;
    const wrapped = rows.map(e => ({ id: e.id, item: e }));
    return (mode ? MSSList.sortBy(wrapped, mode) : wrapped.sort((a, b) => String(b.item.created_at || '').localeCompare(String(a.item.created_at || '')))).map(r => r.item);
  }
  function rowHTML(e, id, sub, score) {
    const on = S.ids.includes(id), img = safeURL(e.thumb || e.poster_url);
    return `<button type="button" class="fav-picker-item ls-pick${on ? ' selected' : ''}" role="checkbox" aria-checked="${on}" data-id="${esc(id)}" onclick="MSSListStudio._toggle(this.dataset.id)">
        <span class="fav-picker-poster">${img ? `<img src="${img}" alt="" loading="lazy">` : esc(((e.title || '?')[0]).toUpperCase())}</span>
        <span class="fav-picker-info"><span class="fav-picker-name" translate="no">${esc(e.title)}${e.year ? ` <span class="fp-year">${esc(String(e.year).slice(0, 4))}</span>` : ''}</span><span class="fav-picker-sub">${esc(sub)}</span></span>
        ${score ? `<span class="ls-score"><span aria-hidden="true">★</span> ${score}</span>` : ''}
        <span class="fav-picker-check" aria-hidden="true">${on ? '✓' : icon('plus', 12)}</span>
      </button>`;
  }
  function drawResults() {
    const box = $('lsResults');
    if (S.src === 'discover') {
      if (!S.q) { box.innerHTML = `<div class="fav-picker-empty">Search for any movie or show to add it — you don’t need to have watched it.</div>`; return; }
      if (!S.disc) { box.innerHTML = `<div class="fav-picker-empty">Searching…</div>`; return; }
      box.innerHTML = S.disc.length ? S.disc.map(m => rowHTML(m, m.id, `${m.tmdb_type === 'movie' ? 'Movie' : 'TV Show'}`, null)).join('')
        : `<div class="fav-picker-empty">No results for “${esc(S.q)}”.</div>`;
      return;
    }
    const rows = libraryRows();
    if ($('lsShown')) $('lsShown').textContent = `${rows.length} ${rows.length === 1 ? 'title' : 'titles'}`;
    const hintMode = ['watched_new', 'release_new', 'release_old'].includes(S.f.sort) ? S.f.sort : '';
    box.innerHTML = rows.length ? rows.slice(0, S.shown).map(e => {
      const sc = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
      return rowHTML(e, e.id, [CAT_META[e.cat]?.label, STATUS_TAG[e.status], hintMode && MSSList.orderHint(e, hintMode)].filter(Boolean).join(' · '), sc);
    }).join('') + (rows.length > S.shown ? `<button type="button" class="fp-chip ls-more" onclick="MSSListStudio._more()">Show more (${rows.length - S.shown})</button>` : '')
      : `<div class="fav-picker-empty">${S.q ? `No matches for “${esc(S.q)}”.` : S.f.onlySel ? 'Nothing in the list yet.' : 'Nothing here — try another filter.'}</div>`;
  }
  let discTimer = null, discSeq = 0;
  async function runDiscover() {
    const q = S.q, seq = ++discSeq;
    try {
      const [mv, tv] = await Promise.all(['movie', 'tv'].map(t => tmdbFetch(`${TMDB_BASE}/search/${t}?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(q)}`).then(r => r.json())));
      if (!S || seq !== discSeq) return;
      const map = (r, t) => ({ id: `tmdb:${t}:${r.id}`, title: t === 'movie' ? r.title : r.name, poster_url: r.poster_path ? TMDB_FULL + r.poster_path : null, thumb: r.poster_path ? TMDB_IMG + r.poster_path : null,
        year: ((t === 'movie' ? r.release_date : r.first_air_date) || '').split('-')[0], released: (t === 'movie' ? r.release_date : r.first_air_date) || '', tmdb_id: r.id, tmdb_type: t });
      const a = (mv.results || []).slice(0, 8).map(r => map(r, 'movie')), b = (tv.results || []).slice(0, 8).map(r => map(r, 'tv'));
      S.disc = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) S.disc.push(a[i]); if (b[i]) S.disc.push(b[i]); }
      // cache them so a pick shows everywhere (list page, preview) straight away — never over a fuller lookup
      S.disc.forEach(m => { if (!MSSList.cache[m.id]) MSSList.cache[m.id] = { id: m.id, title: m.title, poster_url: m.poster_url, tmdb_id: m.tmdb_id, tmdb_type: m.tmdb_type, year: m.year, released: m.released, cat: m.tmdb_type === 'movie' ? 'movies' : 'tv' }; });
    } catch (e) { console.error('List Studio search:', e); if (S) S.disc = []; }
    if (S && S.src === 'discover') drawResults();
  }

  /* ── right: your list ── */
  function drawSide() {
    const n = S.ids.length, ranked = S.ranked === true, locked = S.locked;
    const label = (MSSList.ORDERS.find(o => o[0] === S.mode) || [])[1] || 'My order';
    const hintMode = ['watched_new', 'watched_old', 'release_new', 'release_old'].includes(S.mode) ? S.mode : '';
    const chips = MSSList.ORDERS.map(([k, l]) => `<button type="button" class="xs-chip${S.mode === k ? ' on' : ''}" aria-pressed="${S.mode === k}" ${locked ? 'disabled' : ''} onclick="MSSListStudio._mode('${k}')">${l}</button>`).join('')
      + `<button type="button" class="xs-chip" ${locked || n < 2 ? 'disabled' : ''} onclick="MSSListStudio._shuffle()">${icon('shuffle', 13)} Shuffle</button>`;
    $('lsSide').innerHTML = `
      <div class="xs-sec" id="lsSecOrder"><div class="xs-sec-label">Order by</div>
        <div class="xs-chips ls-chips">${chips}</div>
        ${locked ? `<div class="la-note" style="margin-top:10px">${icon('info', 14)}<span>The owner keeps this list sorted by <b>${esc(label)}</b> — titles you add slot into place.</span></div>`
          : S.shared ? '' : `<div class="xs-switches" style="margin-top:10px">${sw(S.auto && S.mode !== 'picked', S.mode === 'picked' ? "MSSListStudio._mode('highest')" : 'MSSListStudio._auto()', 'Keep sorted automatically',
            S.mode === 'picked' ? 'Pick an order above — for now it’s your own order, new titles go at the end.'
            : S.auto ? `Titles added later slot into place by ${esc(label.toLowerCase())}.` : 'Sorted once — after this it’s your own order, new titles go at the end.')}</div>`}
      </div>
      <div class="xs-sec"><div class="xs-sec-label">Your list<span>${n} ${n === 1 ? 'title' : 'titles'}${S.ranked === true ? ' · ranked' : S.ranked === false ? ' · unranked' : ''}</span></div>
        ${n > 1 && !locked ? `<div class="la-help"><span>Move a title by hand: drag it by <span class="la-help-grip">${GRIP}</span>, use the arrows${ranked ? ' or type its position' : ''}.</span></div>` : ''}
        <div class="ls-list" id="lsList">${n ? S.ids.map((id, i) => {
          const e = item(id) || { title: 'Loading…' };
          const sc = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
          const sub = [CAT_META[e.cat]?.label || (e.tmdb_type === 'movie' ? 'Movie' : e.tmdb_type ? 'TV Show' : ''), hintMode ? MSSList.orderHint(e, hintMode) : (e.year ? String(e.year).slice(0, 4) : '')].filter(Boolean).join(' · ');
          return `<div class="la-row" data-i="${i}">
            ${locked ? '' : `<div class="fav-drag-handle la-grip" title="Drag to move">${GRIP}</div>`}
            ${ranked ? (locked ? `<span class="la-num">${i + 1}</span>` : `<input class="la-pos la-num" type="number" inputmode="numeric" min="1" max="${n}" value="${i + 1}" aria-label="Position of ${esc(e.title)}" onchange="MSSListStudio._pos(${i}, this.value)" onfocus="this.select()">`) : ''}
            <div class="fav-picker-poster la-poster">${safeURL(e.poster_url) ? `<img src="${safeURL(e.poster_url)}" alt="" loading="lazy">` : esc(((e.title || '?')[0]).toUpperCase())}</div>
            <div class="fav-picker-info"><div class="fav-picker-name" translate="no">${esc(e.title)}</div><div class="fav-picker-sub">${esc(sub)}</div></div>
            ${sc ? `<div class="ls-score"><span aria-hidden="true">★</span> ${sc}</div>` : ''}
            ${locked ? '' : `<div class="la-moves">
              <button type="button" class="la-mv la-up" ${i === 0 ? 'disabled' : ''} onclick="MSSListStudio._move(${i}, ${i - 1}, '.la-up')" aria-label="Move ${esc(e.title)} up">${icon('chevup', 14)}</button>
              <button type="button" class="la-mv la-down" ${i === n - 1 ? 'disabled' : ''} onclick="MSSListStudio._move(${i}, ${i + 1}, '.la-down')" aria-label="Move ${esc(e.title)} down">${icon('chevdown', 14)}</button>
            </div>`}
            <button type="button" class="la-mv la-x" onclick="MSSListStudio._remove(${i})" aria-label="Remove ${esc(e.title)}">${icon('x', 13)}</button>
          </div>`;
        }).join('') : `<div class="ls-empty">${icon('layers', 30)}<b>Your list is empty</b><span>Add titles from the left${phone() ? ' (Options tab)' : ''} — they show up here.</span></div>`}</div>
      </div>`;  if (phone()) document.querySelector('#lsSide .ls-chips .xs-chip.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ── changes ── */
  function changed(side = true) { if (side) drawSide(); drawTabs(); drawFoot(); }
  function sortNow() { S.ids = MSSList.sortBy(S.ids.map(id => ({ id, item: item(id) || {} })), S.mode).map(r => r.id); }
  function toggle(id) {
    const i = S.ids.indexOf(id);
    if (i >= 0) S.ids.splice(i, 1);
    else { S.ids.push(id); if (S.auto && S.mode !== 'picked' || S.locked) sortNow(); }   // a sorted list: it slots into place
    const btn = [...document.querySelectorAll('#lsResults .ls-pick')].find(b => b.dataset.id === id);
    if (btn) {
      const on = i < 0;
      btn.classList.toggle('selected', on); btn.setAttribute('aria-checked', on);
      btn.querySelector('.fav-picker-check').innerHTML = on ? '✓' : icon('plus', 12);
    }
    if (S.f.onlySel && S.src === 'library') drawResults();
    changed();
  }
  function addShown() {
    libraryRows().forEach(e => { if (!S.ids.includes(e.id)) S.ids.push(e.id); });
    if (S.auto && S.mode !== 'picked' || S.locked) sortNow();
    drawResults(); changed();
  }
  function setMode(k) {
    if (S.locked) return;
    S.mode = k;
    if (k === 'picked') S.auto = false;
    else { sortNow(); if (!S.autoTouched) S.auto = true; }
    changed();
  }
  function shuffle() {
    for (let i = S.ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [S.ids[i], S.ids[j]] = [S.ids[j], S.ids[i]]; }
    S.mode = 'picked'; S.auto = false; changed();
  }
  // Moving by hand = your own order
  function move(from, to, focusSel) {
    to = Math.max(0, Math.min(S.ids.length - 1, to));
    if (from === to) return;
    const [id] = S.ids.splice(from, 1);
    S.ids.splice(to, 0, id);
    S.mode = 'picked'; S.auto = false;
    changed();
    if (focusSel) document.querySelector(`#lsList .la-row[data-i="${to}"] ${focusSel}`)?.focus();
  }
  function remove(i) {
    const [id] = S.ids.splice(i, 1);
    const btn = [...document.querySelectorAll('#lsResults .ls-pick')].find(b => b.dataset.id === id);
    if (btn) { btn.classList.remove('selected'); btn.setAttribute('aria-checked', 'false'); btn.querySelector('.fav-picker-check').innerHTML = icon('plus', 12); }
    changed();
  }

  /* ── drag a row by its handle (mouse or finger); the panel scrolls near its edges ── */
  let drag = null;
  document.addEventListener('pointerdown', ev => {
    const h = ev.target.closest('#lsList .la-grip');
    if (!h || !S) return;
    ev.preventDefault();
    const row = h.closest('.la-row'), rows = [...document.querySelectorAll('#lsList .la-row')];
    const box = phone() ? $('lsGrid') : $('lsSide');
    drag = { row, rows, box, from: rows.indexOf(row), to: rows.indexOf(row), y0: ev.clientY, s0: box.scrollTop, h: row.getBoundingClientRect().height };
    row.classList.add('dragging');
    document.addEventListener('pointermove', dragMove);
    document.addEventListener('pointerup', dragEnd);
    document.addEventListener('pointercancel', dragEnd);
  });
  function dragMove(ev) {
    const d = drag; if (!d) return;
    const r = d.box.getBoundingClientRect();
    if (ev.clientY < r.top + 50) d.box.scrollTop -= 10; else if (ev.clientY > r.bottom - 50) d.box.scrollTop += 10;
    const dy = ev.clientY - d.y0 + (d.box.scrollTop - d.s0);
    d.row.style.transform = `translateY(${dy}px)`;
    const to = Math.max(0, Math.min(d.rows.length - 1, d.from + Math.round(dy / d.h)));
    if (to === d.to) return;
    d.to = to;
    d.rows.forEach((el, i) => {
      if (el === d.row) return;
      el.style.transition = 'transform .15s ease';
      el.style.transform = i > d.from && i <= to ? `translateY(-${d.h}px)` : i < d.from && i >= to ? `translateY(${d.h}px)` : '';
    });
  }
  function dragEnd() {
    const d = drag; if (!d) return;
    drag = null;
    document.removeEventListener('pointermove', dragMove);
    document.removeEventListener('pointerup', dragEnd);
    document.removeEventListener('pointercancel', dragEnd);
    d.rows.forEach(el => { el.style.transform = ''; el.style.transition = ''; el.classList.remove('dragging'); });
    if (d.to !== d.from) move(d.from, d.to);
  }

  /* ── save ── */
  async function save() {
    if (!S || S.busy) return;
    const title = S.title.trim();
    if (!title) { tab('opts'); $('lsName')?.focus(); showToast('Give your list a name first.', 'err'); return; }
    S.busy = true; drawFoot();
    const sortMode = S.auto && S.mode !== 'picked' ? S.mode : 'picked';
    try {
      let saved, isNew = S.isNew;
      if (isNew) {
        saved = await C.save({ cat: 'custom', genre: '', title, description: S.desc.trim(), items: S.ids.slice(), ranked: S.official ? null : S.ranked, sort_mode: sortMode, visibility: S.official ? 'anyone' : S.vis });
      } else if (S.shared) {
        const l = S.list;
        l.items = S.ids.slice();
        if (S.locked) MSSList.reorder(l, l.sort_mode, C.resolve);   // the owner's order
        const { error } = await sb.rpc('update_list_items', { p_list_id: l.id, p_items: l.items });
        if (error) throw error;
        saved = l;
      } else {
        const l = S.list, prev = { title: l.title, description: l.description, items: l.items, ranked: l.ranked, sort_mode: l.sort_mode, visibility: l.visibility };
        Object.assign(l, { title, description: S.desc.trim(), items: S.ids.slice(), sort_mode: sortMode });
        if (!S.official) l.visibility = S.vis;
        if (!S.official && S.ranked != null) l.ranked = S.ranked;
        try { await C.save(l); } catch (e) { Object.assign(l, prev); throw e; }
        saved = l;
      }
      const collab = S.collab;
      S.busy = false;
      close(true);
      C.afterSave(saved, isNew);
      showToast(isNew ? `“${title}” created!` : 'Saved!');
      if (isNew && collab) setTimeout(() => C.collab(saved.id), 300);
    } catch (e) {
      console.error('List Studio save:', e);
      if (S) { S.busy = false; drawFoot(); }
      showToast(isRateLimitError?.(e) ? RATE_LIMIT_MESSAGE : 'Couldn’t save the list — try again.', 'err');
    }
  }

  return {
    init, open, close,
    _save: save, _tab: tab, _toggle: toggle, _addShown: addShown, _mode: setMode, _shuffle: shuffle, _remove: remove,
    _move: (a, b, f) => move(a, b, f),
    _pos: (i, v) => { const n = parseInt(v, 10); if (n >= 1) move(i, n - 1, '.la-pos'); else drawSide(); },
    _auto: () => { S.auto = !S.auto; S.autoTouched = true; changed(); },
    _ranked: v => { S.ranked = S.ranked === v ? null : v; $('lsRanked').innerHTML = rankedHTML(); changed(); },
    _collab: () => { S.collab = !S.collab; $('lsCollab').innerHTML = sw(S.collab, 'MSSListStudio._collab()', 'Invite friends to this list', 'They can add and remove titles with you — only you can rename or delete it'); drawFoot(); },
    _title: v => { S.title = v; drawFoot(); },
    _vis: k => { S.vis = k; $('lsVis').innerHTML = visHTML(); drawFoot(); },
    _link: fresh => S?.list && mssCopyShareLink('list', S.list.id, fresh),
    _desc: el => {
      if (words(el.value) > MAX_WORDS) el.value = el.value.trim().split(/\s+/).slice(0, MAX_WORDS).join(' ');
      S.desc = el.value; descCount(); drawFoot();
    },
    _src: k => { S.src = k; S.q = ''; S.disc = null; drawOpts(); $('lsSearch')?.focus(); },
    _q: v => {
      S.q = v.trim().toLowerCase(); S.shown = SHOW_STEP;
      if (S.src === 'discover') { S.disc = null; clearTimeout(discTimer); drawResults(); if (S.q) discTimer = setTimeout(runDiscover, 350); }
      else drawResults();
    },
    _f: (k, v) => { S.f[k] = v; S.shown = SHOW_STEP; drawTools(); drawResults(); },
    _more: () => { S.shown += SHOW_STEP; drawResults(); },
  };
})();
