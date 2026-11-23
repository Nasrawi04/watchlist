/* ══════════════════════════════════════════════════════════════════════
   shell-search.js — MSSSearch: the header search on every page
     Desktop: the field in the header; results drop under it (560px).
     Phones / tablets: a full-page search screen (back · field · results).
   Filters: All · Titles · People · Users. Results, grouped:
     1. In your library  — your titles: status and where you are ("Watching · S4 E12")
     2. Titles           — TMDB: poster, year, a quick "+ Watchlist" (Shift+Enter)
     3. People           — TMDB: photo, name, known for
     1b. Users           — MyScreenFolio members (under your library, above Titles) (searchUsers, sql/135): photo, display name, @username → their profile
   Footer: "See all results" → Discover with the query (discover.html?q=…) · key hints.
   ARIA: the field is a combobox driving a listbox (↑ ↓ move, Enter opens, Esc clears / closes).

     MSSSearch.mount(input, opts?)   nav.js, once — the header field (or Home's / Discover's own field, in a .shs-host)
                              opts.onAll(q): "See all results" / Enter with nothing picked, instead of going to discover.html?q=…
     MSSSearch.open(q?)       "/" and the phone search button (mssOpenSearch, nav.js)
     MSSSearch.close()

   Requires config.js (icon, escHTML, safeURL, MSSDialog, MSSAge, showToast, MSS_SEARCH_MS),
   nav.js (_tmdbSearch, _shellPage, _navCloseAll), db.js (getEntries — your library from this device's copy, msf-store.js — searchUsers).
══════════════════════════════════════════════════════════════════════ */
const MSSSearch = (() => {
  const IMG = 'https://image.tmdb.org/t/p/w92';
  const FILTERS = [['all', 'All'], ['titles', 'Titles'], ['people', 'People'], ['users', 'Users']];
  const STATUS = { watching: 'Watching', up_next: 'Up Next', paused: 'Taking a Break', queue: 'Watchlist', completed: 'Watched', ongoing: 'To Be Continued', dropped: 'Dropped' };
  const added = new Set();              // titles put on the Watchlist from here (the button shows ✓ Added)
  const views = {};                     // 'desk' | 'page' → { input, panel, list, filter, q, rows, active, seq, timer }

  function mount(input, opts = {}) {
    if (!input || views.desk) return;
    const wrap = input.closest('.shs-wrap, .shs-host');
    const panel = document.createElement('div');
    panel.className = 'shs-panel'; panel.id = 'shsDrop'; panel.hidden = true;
    wrap.appendChild(panel);
    views.desk = setup('desk', input, panel);
    if (opts.onAll) {
      views.desk.onAll = opts.onAll;
      panel.querySelector('.shs-all').addEventListener('click', ev => { const q = views.desk.input.value.trim(); if (!q) return; ev.preventDefault(); hide('desk'); opts.onAll(q); });
    }
    input.addEventListener('focus', () => { if (input.value.trim()) show('desk'); });
    // a click anywhere in the list keeps the field focused (otherwise it closes the list before the click lands —
    // Safari never focuses a clicked link or button, so "See all results" and the filters lost their clicks)
    panel.addEventListener('mousedown', ev => ev.preventDefault());
    wrap.addEventListener('focusout', ev => { if (!wrap.contains(ev.relatedTarget)) hide('desk'); });
    document.addEventListener('pointerdown', ev => { if (!wrap.contains(ev.target)) hide('desk'); });
  }

  // One results view: filters, the listbox, the footer — and the field that drives it
  function setup(k, input, panel) {
    const v = { k, input, panel, filter: 'all', q: '', rows: [], active: -1, seq: 0, timer: null };
    panel.innerHTML = `<div class="shs-filters" role="radiogroup" aria-label="Show">${FILTERS.map(([f, l]) =>
        `<button type="button" role="radio" class="shs-f${f === 'all' ? ' on' : ''}" aria-checked="${f === 'all'}" tabindex="${f === 'all' ? 0 : -1}" data-f="${f}">${l}</button>`).join('')}</div>
      <div class="shs-list" id="shs-${k}-list" role="listbox" aria-label="Search results"></div>
      <div class="shs-foot"><a class="shs-all" href="discover.html">See all results ${icon('arrowRight', 13)}</a>
        <span class="shs-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> open · <kbd>⇧↵</kbd> watchlist · <kbd>esc</kbd> close</span></div>`;
    v.list = panel.querySelector('.shs-list');
    Object.assign(input, { autocomplete: 'off' });
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', v.list.id);
    input.addEventListener('input', () => { clearTimeout(v.timer); v.timer = setTimeout(() => run(v), MSS_SEARCH_MS); });
    input.addEventListener('focus', () => { mine(); }, { once: true });   // your library's copy ready before the first letter
    input.addEventListener('keydown', ev => keys(v, ev));
    const fbox = panel.querySelector('.shs-filters');
    fbox.addEventListener('click', ev => { const b = ev.target.closest('.shs-f'); if (b) setFilter(v, b.dataset.f, true); });
    fbox.addEventListener('keydown', ev => {
      if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
      ev.preventDefault();
      const i = FILTERS.findIndex(([f]) => f === v.filter), n = FILTERS[(i + (ev.key === 'ArrowRight' ? 1 : FILTERS.length - 1)) % FILTERS.length][0];
      setFilter(v, n); fbox.querySelector(`[data-f="${n}"]`).focus();
    });
    v.list.addEventListener('click', ev => {
      const add = ev.target.closest('.shs-add'), opt = ev.target.closest('[role="option"]');
      if (add) { ev.preventDefault(); ev.stopPropagation(); watchlist(v, Number(add.closest('[role="option"]').dataset.i)); return; }
      if (opt) go(v, Number(opt.dataset.i));
    });
    v.list.addEventListener('pointermove', ev => { const o = ev.target.closest('[role="option"]'); if (o) setActive(v, Number(o.dataset.i), false); });
    return v;
  }
  function setFilter(v, f, focusInput) {
    v.filter = f;
    v.panel.querySelectorAll('.shs-f').forEach(b => { const on = b.dataset.f === f; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    draw(v);
    if (focusInput) v.input.focus();
  }

  function show(k) {
    const v = views[k];
    if (!v || (k === 'desk' && !v.input.value.trim())) return;
    if (k === 'desk' && v.panel.hidden) _navCloseAll('search');
    v.panel.hidden = false;
    v.input.setAttribute('aria-expanded', 'true');
    if (k === 'desk' && v.panel.parentElement.classList.contains('shs-host')) {   // Home's field sits mid-page: stop the list above the phone tab bar
      const nav = document.getElementById('bnav'), floor = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
      v.panel.style.maxHeight = Math.max(240, Math.min(640, floor - v.panel.getBoundingClientRect().top - 8)) + 'px';
    }
  }
  function hide(k) {
    const v = views[k];
    if (!v || v.panel.hidden || k === 'page') return;
    v.panel.hidden = true;
    v.input.setAttribute('aria-expanded', 'false');
    v.input.removeAttribute('aria-activedescendant');
  }

  // Each part is drawn the moment it arrives (perf audit §2.3): your library first (this device's copy, msf-store.js),
  // then TMDB and members — nothing waits for the slowest. A newer search makes the older answers count for nothing.
  const mine = () => window._navUser?.id ? getEntries(window._navUser.id).catch(() => []) : Promise.resolve([]);
  async function run(v) {
    const q = v.input.value.trim(), seq = ++v.seq;
    v.q = q;
    if (q.length < 2) { v.rows = []; v.res = null; v.list.innerHTML = ''; v.panel.classList.remove('has-q'); if (v.k === 'desk') hide('desk'); else draw(v); return; }
    v.panel.classList.add('has-q');
    show(v.k);
    if (window._navUser && typeof MSSInfo === 'undefined') mssLoadScript('js/info-popup.js');   // ready before a + Watchlist tap
    const ql = q.toLowerCase(), R = v.res = { lib: [], titles: [], people: [], users: [] };
    let tmdb = null, ownIds = new Set();
    v.pending = 3;
    v.list.innerHTML = `<div class="shs-state" role="presentation">${icon('search', 15)} Searching…</div>`;
    const part = (p, use) => p.then(x => { if (seq !== v.seq) return; use(x || []); }).catch(() => {}).finally(() => {
      if (seq !== v.seq) return;
      v.pending--;
      draw(v);
      if (!v.pending) mssPerfMark(`Search “${q}” complete`);
    });
    const titles = () => {   // TMDB titles you don't already have (they show under In your library)
      if (!tmdb) return;
      R.titles = tmdb.filter(r => r.media_type !== 'person' && !ownIds.has(r.media_type + ':' + r.id)).map(r => ({ kind: 'title', r }));
      R.people = tmdb.filter(r => r.media_type === 'person').map(r => ({ kind: 'person', r }));
    };
    part(mine(), lib => {
      const own = lib.filter(e => (e.title || '').toLowerCase().includes(ql))
        .sort((a, b) => ((b.title || '').toLowerCase().startsWith(ql) - (a.title || '').toLowerCase().startsWith(ql)) || (a.title || '').localeCompare(b.title || ''));
      ownIds = new Set(own.map(e => e.tmdb_type + ':' + e.tmdb_id));
      R.lib = own.map(e => ({ kind: 'lib', e }));
      titles();
    });
    part(_tmdbSearch(q, 20, true), r => { tmdb = r; titles(); });
    part(typeof searchUsers === 'function' ? searchUsers(q, 10) : Promise.resolve([]), u => { R.users = u.map(x => ({ kind: 'user', u: x })); });
  }

  function draw(v) {
    const all = v.panel.querySelector('.shs-all');
    all.href = v.q ? `discover.html?q=${encodeURIComponent(v.q)}` : 'discover.html';
    all.innerHTML = v.q ? `See all results for “${escHTML(v.q)}” ${icon('arrowRight', 13)}` : `Search on Discover ${icon('arrowRight', 13)}`;
    if (!v.res || !v.q) {
      v.rows = []; v.active = -1;
      if (v.k === 'page') v.list.innerHTML = `<div class="shs-state" role="presentation">Search movies, shows, anime and people.</div>`;
      return;
    }
    const f = v.filter, R = v.res;
    const groups = [
      (f === 'all' || f === 'titles') && R.lib.length && ['In your library', R.lib.slice(0, f === 'all' ? 3 : 6)],
      (f === 'all' || f === 'users') && R.users.length && ['Users', R.users.slice(0, f === 'all' ? 3 : 10)],
      (f === 'all' || f === 'titles') && R.titles.length && ['Titles', R.titles.slice(0, f === 'all' ? 5 : 10)],
      (f === 'all' || f === 'people') && R.people.length && ['People', R.people.slice(0, f === 'all' ? 3 : 10)],
    ].filter(Boolean);
    const was = v.rows[v.active];
    v.rows = groups.flatMap(([, rows]) => rows);
    v.active = was ? v.rows.indexOf(was) : -1;
    if (v.active < 0) v.input.removeAttribute('aria-activedescendant');
    if (!v.rows.length) {
      v.list.innerHTML = v.pending ? `<div class="shs-state" role="presentation">${icon('search', 15)} Searching…</div>`
        : `<div class="shs-state" role="presentation">No matches for “${escHTML(v.q)}”. Try See all for more.</div>`;
      return;
    }
    let i = 0;
    v.list.innerHTML = groups.map(([h, rows], g) => `<div role="group" aria-labelledby="shs-${v.k}-g${g}">
        <div class="shs-gh" id="shs-${v.k}-g${g}" role="presentation">${h}</div>
        ${rows.map(x => row(v, x, i++)).join('')}</div>`).join('');
    if (v.active >= 0) setActive(v, v.active, false);
  }

  function row(v, x, i) {
    const id = `shs-${v.k}-o${i}`;
    if (x.kind === 'lib') {
      const e = x.e, movie = e.cat === 'movies' || e.tmdb_type === 'movie' || e.ratings?._media_type === 'movie';
      const at = !movie && ['watching', 'paused', 'dropped'].includes(e.status) && +e.episode > 0 ? ` · S${Number(e.season) || 1} E${Number(e.episode)}` : '';
      const sc = (e.status === 'completed' || e.status === 'ongoing') ? liveScore(e) : null;
      return `<div role="option" id="${id}" class="shs-opt" data-i="${i}" aria-selected="false">${pic(safeURL(e.poster_url), e.title)}
        <span class="shs-tx"><b translate="no">${escHTML(e.title)}</b><small>${escHTML((CAT_META[e.cat]?.label || (movie ? 'Movie' : 'TV Show')))}${e.year ? ' · ' + escHTML(String(e.year).slice(0, 4)) : ''}</small></span>
        <span class="shs-status">${escHTML(STATUS[e.status] || 'In your library')}${at}${sc != null ? ` · ${Number(sc).toFixed(2)}` : ''}</span></div>`;
    }
    if (x.kind === 'user') {
      const u = x.u;
      return `<div role="option" id="${id}" class="shs-opt" data-i="${i}" aria-selected="false">${pic(safeURL(u.avatar_url), u.username, true)}
        <span class="shs-tx"><b translate="no">${escHTML(u.display_name || u.username)}</b><small translate="no">@${escHTML(u.username)}</small></span></div>`;
    }
    const r = x.r;
    if (x.kind === 'person') {
      const known = (r.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0, 2).join(', ');
      return `<div role="option" id="${id}" class="shs-opt" data-i="${i}" aria-selected="false">${pic(r.profile_path ? IMG + r.profile_path : '', r.name, true)}
        <span class="shs-tx"><b translate="no">${escHTML(r.name)}</b><small>${escHTML([r.known_for_department, known].filter(Boolean).join(' · '))}</small></span></div>`;
    }
    const movie = r.media_type === 'movie', year = (r.release_date || r.first_air_date || '').slice(0, 4);
    return `<div role="option" id="${id}" class="shs-opt" data-i="${i}" aria-selected="false"${MSSAge.attr(r.media_type, r.id, 'soft')}>${pic(r.poster_path ? IMG + r.poster_path : '', r.title || r.name)}
      <span class="shs-tx"><b translate="no">${escHTML(r.title || r.name)}</b><small>${movie ? 'Movie' : 'TV Show'}${year ? ' · ' + year : ''}</small></span>
      <span class="shs-add${added.has(r.media_type + ':' + r.id) ? ' is-added' : ''}" aria-hidden="true" title="Add to your Watchlist">${added.has(r.media_type + ':' + r.id) ? icon('check', 13) : icon('plus', 13)}<span class="shs-add-l">${added.has(r.media_type + ':' + r.id) ? 'Added' : 'Watchlist'}</span></span></div>`;
  }
  const pic = (u, name, round) => `<span class="shs-pic${round ? ' is-round' : ''}" aria-hidden="true">${u ? `<img src="${escHTML(u)}" alt="" loading="lazy">` : escHTML((name || '?')[0].toUpperCase())}</span>`;

  function setActive(v, i, scroll = true) {
    v.active = i;
    v.list.querySelectorAll('[role="option"]').forEach(o => { const on = Number(o.dataset.i) === i; o.classList.toggle('on', on); o.setAttribute('aria-selected', on); if (on && scroll) o.scrollIntoView({ block: 'nearest' }); });
    if (i >= 0) v.input.setAttribute('aria-activedescendant', `shs-${v.k}-o${i}`); else v.input.removeAttribute('aria-activedescendant');
  }
  function keys(v, ev) {
    const n = v.rows.length;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!n) return;
      ev.preventDefault(); show(v.k);
      setActive(v, ev.key === 'ArrowDown' ? (v.active + 1) % n : (v.active <= 0 ? n - 1 : v.active - 1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (v.active >= 0 && ev.shiftKey) watchlist(v, v.active);
      else if (v.active >= 0) go(v, v.active);
      else if (v.input.value.trim() && v.onAll) { hide(v.k); v.onAll(v.input.value.trim()); }
      else if (v.input.value.trim()) location.href = `discover.html?q=${encodeURIComponent(v.input.value.trim())}`;
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      if (v.input.value) { v.input.value = ''; run(v); }
      else if (v.k === 'desk') { hide('desk'); v.input.blur(); }
      else closePage();
    }
  }
  function go(v, i) {
    const x = v.rows[i]; if (!x) return;
    if (x.kind === 'user') { location.href = `profile-view.html?id=${encodeURIComponent(x.u.id)}&u=${encodeURIComponent(x.u.username || '')}`; return; }
    if (x.kind === 'lib') { const e = x.e; location.href = e.tmdb_id && e.tmdb_type ? `title.html?type=${encodeURIComponent(e.tmdb_type)}&id=${encodeURIComponent(e.tmdb_id)}` : 'library.html'; return; }
    location.href = x.kind === 'person' ? `person.html?id=${encodeURIComponent(x.r.id)}` : `title.html?type=${encodeURIComponent(x.r.media_type)}&id=${encodeURIComponent(x.r.id)}`;
  }
  // "+ Watchlist": straight onto your Watchlist (MSSInfo.quickAdd), with Undo. The button says
  // "Added" at once (the save looks the title up on TMDB first) and goes back if the save fails.
  const paintAdd = (v, i, on) => {
    const btn = v.list.querySelector(`[data-i="${i}"] .shs-add`);
    if (!btn) return;
    btn.classList.toggle('is-added', on);
    btn.innerHTML = `${icon(on ? 'check' : 'plus', 13)}<span class="shs-add-l">${on ? 'Added' : 'Watchlist'}</span>`;
  };
  async function watchlist(v, i) {
    const x = v.rows[i];
    if (!x || x.kind !== 'title') return;
    const r = x.r, key = r.media_type + ':' + r.id, title = r.title || r.name;
    if (added.has(key)) return;
    if (mssGuestGate('add titles to your Watchlist')) return;
    added.add(key); paintAdd(v, i, true);
    try {
      if (typeof MSSInfo === 'undefined') await mssLoadScript('js/info-popup.js');
      const entry = await MSSInfo.quickAdd({ tmdb_id: r.id, media_type: r.media_type, title, year: (r.release_date || r.first_air_date || '').slice(0, 4),
        poster_url: r.poster_path ? 'https://image.tmdb.org/t/p/w500' + r.poster_path : null });
      if (!entry) { added.delete(key); paintAdd(v, i, false); return; }
      document.dispatchEvent(new CustomEvent('mss:library-changed', { detail: { entry } }));
      showUndoToast(`Added “${title}” to your Watchlist`, async () => { await deleteEntry(entry.id, window._navUser.id); added.delete(key); paintAdd(v, i, false); });
    } catch (err) {
      const dup = String(err?.message || '').startsWith('DUPLICATE:');
      if (!dup) { added.delete(key); paintAdd(v, i, false); }
      showToast(dup ? 'Already in your library.' : 'Couldn’t add — try again.', dup ? undefined : 'err');
    }
  }

  // Phones: the full-page search screen
  function openPage(q) {
    let ov = document.getElementById('shellSearchPage');
    if (!ov) {
      ov = _shellPage('shellSearchPage', 'Search', () => { if (history.state?.mssSearch) history.back(); });
      ov.classList.add('is-search');
      const head = ov.querySelector('.shell-page-head');
      head.querySelector('.shell-page-t').classList.add('sr-only');
      head.insertAdjacentHTML('beforeend', `<div class="shs-page-field">${icon('search', 16)}<input type="search" id="shsPageInput" placeholder="Search titles, people…" aria-label="Search titles and people" enterkeyhint="search" spellcheck="false"></div>`);
      const body = ov.querySelector('.shell-page-body');
      views.page = setup('page', document.getElementById('shsPageInput'), body);
      body.classList.add('shs-panel', 'is-page');
      views.page.input.setAttribute('aria-expanded', 'true');
      draw(views.page);
      addEventListener('popstate', () => { if (MSSDialog.isOpen(ov)) MSSDialog.close(ov); });
    }
    const v = views.page;
    if (q != null) { v.input.value = q; run(v); }
    if (!MSSDialog.isOpen(ov)) { try { history.pushState({ mssSearch: 1 }, ''); } catch {} }
    _navCloseAll('search');
    MSSDialog.open(ov, { focus: v.input });
  }
  function closePage() { const ov = document.getElementById('shellSearchPage'); if (ov && MSSDialog.isOpen(ov)) ov.querySelector('.shell-page-back').click(); }

  function open(q) {
    const d = views.desk;
    if (d && d.input.offsetParent) { d.input.focus(); if (q != null) { d.input.value = q; run(d); } return; }
    openPage(q);
  }
  function close() { hide('desk'); }

  return { mount, open, close };
})();
