/* ═══════════════════════════════════════════════════════════════
   sort-filter.js — Shared Sort & Filter system (v563)

   One implementation of the Sort / Filter popups for every page.
   Each page registers a "scope" describing what's different about it
   (which sorts, which filters, where its entries come from, how to
   re-render), and gets the exact same popups, behavior and fixes.

   Requires (from config.js / nav.js): icon, escHTML, attrJSON,
   liveScore, tmdbFetch, TMDB_BASE, TMDB_KEY.

   ── Registering a scope ──────────────────────────────────────────
   SF.register('cat', {
     // REQUIRED
     base:   section => entries[],          // unfiltered entries for a section
     render: (section, list) => {},         // redraw a section with the result

     // OPTIONAL — omit any of these to get the default
     sorts:   section => ['alpha','added','release','episode','ratings','length'],
              // mixed movie+show pages can use 'runtime' / 'episodes' instead
              // of 'length' (movies-only / shows-only, the rest go last)
     filters: section => ['genre','year','score','length','person'],
     choiceFilters: section => [       // single-pick filters, e.g. Status
       { key: 'status', label: 'Status', options: [['', 'All'], ['completed', 'Watched']],
         test: (entry, value) => entry.status === value },   // test optional
     ],
     defaultSort: 'newest',
     sortState: {},                         // pass the page's own object to share it
     lengthLabel: section => 'Runtime (minutes)',
     ratingSort: {                          // "Specific Rating" dropdown
       show: section => true,
       options: () => [{ key, label, group }],
       label: key => 'Story',
       value: (entry, key) => number|null,
     },
     addedDate: e => e.completed_date || e.created_at,
     postSort: (section, sortedList) => sortedList,   // e.g. paused-to-bottom
     beforeSort: async (section, value) => {},        // e.g. fetch data a sort needs
     saveRatings: (entry, newRatings) => {},          // omit on read-only pages
   });

   ── Using it ─────────────────────────────────────────────────────
   SF.bar('cat', section)        → Sort / Filter trigger buttons HTML
   SF.list('cat', section)       → filtered + sorted entries
   SF.refresh('cat', section)    → recompute + call render()
   SF.setSort('cat', section, v) → set sort and refresh
   SF.invalidate('cat')          → drop cached actor names (after reload)
═══════════════════════════════════════════════════════════════ */

const SF = (() => {
  const scopes = {};
  let cur = null;          // { scope, section } for the open popup
  let stagedSort = null;
  let stagedFilter = null;

  const CHECK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const CHEV_SVG  = '<svg class="td-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Fixed master genre list (standard TMDB set) — the filter always offers
  // every genre, not just the ones a section happens to contain.
  const GENRES = [
    'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
    'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery',
    'Romance', 'Science Fiction', 'Thriller', 'TV Movie', 'War', 'Western',
  ];

  const SORT_PRESETS = {
    alpha:   { header: 'Alphabetical', opts: [['alpha', 'A → Z'], ['zalpha', 'Z → A']] },
    added:   { header: 'Added',        opts: [['newest', 'Latest'], ['oldest', 'Earliest']] },
    release: { header: 'Release Date', opts: [['releaseNewest', 'Latest'], ['releaseOldest', 'Earliest']] },
    episode: { header: 'Episode',      opts: [['episodeNewest', 'Latest'], ['episodeOldest', 'Earliest']] },
    ratings: { header: 'Ratings',      opts: [['highest', 'Highest'], ['lowest', 'Lowest']] },
    length:  { header: 'Length',       opts: [['longest', 'Longest'], ['shortest', 'Shortest']] },
    runtime: { header: 'Runtime',      opts: [['runtime_longest', 'Longest'], ['runtime_shortest', 'Shortest']] },
    episodes:{ header: 'Episode Count',opts: [['eps_most', 'Most'], ['eps_least', 'Fewest']] },
  };
  const DEFAULT_SORTS   = ['alpha', 'added', 'release', 'ratings', 'length'];
  const DEFAULT_FILTERS = ['genre', 'year', 'score', 'length', 'person'];
  const EMPTY_FILTER = () => ({ genres: [], yearMin: '', yearMax: '', scoreMin: '', scoreMax: '', lengthMin: '', lengthMax: '', person: '', choice: {} });

  // Session caches shared by every scope (keyed by TMDB id)
  const creditsCache = {};
  const episodeDateCache = {};

  /* ── helpers ── */
  function S(scope) {
    const s = scopes[scope];
    if (!s) throw new Error(`SF: scope "${scope}" is not registered`);
    return s;
  }
  function isMovie(e) {
    return e.cat === 'movies' || e.tmdb_type === 'movie' || e.ratings?._media_type === 'movie';
  }
  // Movies: runtime in minutes. Shows: total episode count (closest
  // available "length" — there's no single per-show runtime).
  function lengthOf(e) {
    if (isMovie(e)) return (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0);
    return Number(e.total_eps) || 0;
  }
  function releaseValue(e) {
    if (typeof getReleaseDateValue === 'function') return getReleaseDateValue(e) || 0;
    return Number(e.year) || 0;
  }
  function choicesFor(s, section) {
    return s.cfg.choiceFilters ? (s.cfg.choiceFilters(section) || []) : [];
  }
  function sortsFor(s, section) {
    const keys = (s.cfg.sorts ? s.cfg.sorts(section) : DEFAULT_SORTS).filter(Boolean);
    return keys.map(k => SORT_PRESETS[k]).filter(Boolean);
  }
  function filtersFor(s, section) {
    return (s.cfg.filters ? s.cfg.filters(section) : DEFAULT_FILTERS).filter(Boolean);
  }
  function showRating(s, section) {
    return !!(s.cfg.ratingSort && (!s.cfg.ratingSort.show || s.cfg.ratingSort.show(section)));
  }
  function getSort(scope, section) {
    const s = S(scope);
    return s.sort[section] || s.cfg.defaultSort || 'newest';
  }
  function getFilter(scope, section) {
    return S(scope).filter[section] || EMPTY_FILTER();
  }
  function filterCount(f) {
    return Object.values(f.choice || {}).filter(Boolean).length + (f.genres || []).length + (f.yearMin || f.yearMax ? 1 : 0) + (f.scoreMin || f.scoreMax ? 1 : 0)
         + (f.lengthMin || f.lengthMax ? 1 : 0) + (f.person ? 1 : 0);
  }
  function sortLabel(s, value) {
    if (value.startsWith('rating:') && s.cfg.ratingSort) {
      const l = s.cfg.ratingSort.label(value.slice(7));
      return l.length > 14 ? l.slice(0, 13) + '…' : l;
    }
    for (const g of Object.values(SORT_PRESETS)) for (const [v, l] of g.opts) if (v === value) return g.opts.length > 1 ? g.header : l;
    return 'Sort';
  }

  /* ── sorting engine ── */
  function sortEntries(s, section, base, value) {
    const a = [...base];
    const added = s.cfg.addedDate || (e => e.completed_date || e.created_at);
    const d = e => new Date(added(e) || 0);
    const sc = e => liveScore(e) || 0;
    const byCreated = (x, y) => new Date(y.created_at) - new Date(x.created_at);
    let out;
    switch (value) {
      case 'newest':        out = a.sort((x, y) => d(y) - d(x)); break;
      case 'oldest':        out = a.sort((x, y) => d(x) - d(y)); break;
      case 'alpha':         out = a.sort((x, y) => (x.title || '').localeCompare(y.title || '')); break;
      case 'zalpha':        out = a.sort((x, y) => (y.title || '').localeCompare(x.title || '')); break;
      case 'highest':       out = a.sort((x, y) => (sc(y) - sc(x)) || byCreated(x, y)); break;
      case 'lowest':        out = a.sort((x, y) => (sc(x) - sc(y)) || byCreated(x, y)); break;
      case 'releaseNewest': out = a.sort((x, y) => releaseValue(y) - releaseValue(x)); break;
      case 'releaseOldest': out = a.sort((x, y) => releaseValue(x) - releaseValue(y)); break;
      // Mixed pages: movies sorted by runtime (shows after, newest first),
      // or shows sorted by episode count (movies after).
      case 'runtime_longest': case 'runtime_shortest': {
        const dir = value === 'runtime_longest' ? -1 : 1;
        const m = a.filter(isMovie).sort((x, y) => dir * (lengthOf(x) - lengthOf(y)));
        out = m.concat(a.filter(e => !isMovie(e)).sort((x, y) => d(y) - d(x)));
        break;
      }
      case 'eps_most': case 'eps_least': {
        const dir = value === 'eps_most' ? -1 : 1;
        const sh = a.filter(e => !isMovie(e)).sort((x, y) => dir * (lengthOf(x) - lengthOf(y)));
        out = sh.concat(a.filter(isMovie).sort((x, y) => d(y) - d(x)));
        break;
      }
      case 'episodeNewest': out = a.sort((x, y) => new Date(y.ratings?._last_episode_date || 0) - new Date(x.ratings?._last_episode_date || 0)); break;
      case 'episodeOldest': out = a.sort((x, y) => new Date(x.ratings?._last_episode_date || 0) - new Date(y.ratings?._last_episode_date || 0)); break;
      case 'longest':       out = a.sort((x, y) => lengthOf(y) - lengthOf(x)); break;
      case 'shortest':      out = a.sort((x, y) => lengthOf(x) - lengthOf(y)); break;
      default:
        if (value && value.startsWith('rating:') && s.cfg.ratingSort?.value) {
          // Specific rating, falling back to overall score for entries
          // that don't have that rating filled in.
          const key = value.slice(7), rv = s.cfg.ratingSort.value;
          out = a.sort((x, y) => {
            const ex = rv(x, key), ey = rv(y, key);
            return ((ey != null ? ey : sc(y)) - (ex != null ? ex : sc(x))) || (sc(y) - sc(x));
          });
        } else out = a;
    }
    return s.cfg.postSort ? s.cfg.postSort(section, out) : out;
  }

  function applyFilter(s, section, base, f) {
    let out = base;
    choicesFor(s, section).forEach(c => {
      const v = f.choice?.[c.key];
      if (v) out = out.filter(e => c.test ? c.test(e, v) : e[c.key] === v);
    });
    if (f.genres?.length) out = out.filter(e => (e.genres || []).some(g => f.genres.includes(g)));
    if (f.yearMin)   out = out.filter(e => e.year && Number(e.year) >= Number(f.yearMin));
    if (f.yearMax)   out = out.filter(e => e.year && Number(e.year) <= Number(f.yearMax));
    if (f.scoreMin)  out = out.filter(e => liveScore(e) != null && liveScore(e) >= Number(f.scoreMin));
    if (f.scoreMax)  out = out.filter(e => liveScore(e) != null && liveScore(e) <= Number(f.scoreMax));
    if (f.lengthMin) out = out.filter(e => lengthOf(e) >= Number(f.lengthMin));
    if (f.lengthMax) out = out.filter(e => lengthOf(e) <= Number(f.lengthMax));
    if (f._personMatchIds) out = out.filter(e => f._personMatchIds.includes(e.id));
    return out;
  }

  function list(scope, section) {
    const s = S(scope);
    const base = applyFilter(s, section, s.cfg.base(section) || [], getFilter(scope, section));
    return sortEntries(s, section, base, getSort(scope, section));
  }

  function refresh(scope, section) {
    S(scope).cfg.render(section, list(scope, section));
  }

  function setSort(scope, section, value) {
    S(scope).sort[section] = value;
    refresh(scope, section);
  }

  /* ── TMDB lookups (cached; persisted when the page allows writes) ── */
  async function fetchCredits(s, entry) {
    if (entry.ratings?._director != null || entry.ratings?._cast_names) {
      return { director: entry.ratings._director || '', cast: entry.ratings._cast_names || [] };
    }
    if (!entry.tmdb_id || !entry.tmdb_type) return null;
    const ck = `${entry.tmdb_type}:${entry.tmdb_id}`;
    if (creditsCache[ck]) return creditsCache[ck];
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/${entry.tmdb_type}/${entry.tmdb_id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=credits`);
      if (!res.ok) return null;
      const data = await res.json();
      const director = (data.credits?.crew || []).find(c => c.job === 'Director')?.name || '';
      const cast = (data.credits?.cast || []).slice(0, 12).map(c => c.name);
      const result = { director, cast };
      creditsCache[ck] = result;
      if (s.cfg.saveRatings) {
        const newRatings = { ...(entry.ratings || {}), _director: director, _cast_names: cast };
        try { s.cfg.saveRatings(entry, newRatings); } catch {}
        entry.ratings = newRatings;
      }
      return result;
    } catch { return null; }
  }

  async function fetchLastEpisodeDate(s, entry) {
    if (entry.ratings?._last_episode_date) return entry.ratings._last_episode_date;
    if (!entry.tmdb_id || entry.tmdb_type !== 'tv') return null;
    if (episodeDateCache[entry.tmdb_id] !== undefined) return episodeDateCache[entry.tmdb_id];
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${entry.tmdb_id}?api_key=${TMDB_KEY}&language=en-US`);
      const date = res.ok ? (await res.json()).last_episode_to_air?.air_date || null : null;
      episodeDateCache[entry.tmdb_id] = date;
      if (date) {
        const newRatings = { ...(entry.ratings || {}), _last_episode_date: date };
        if (s.cfg.saveRatings) { try { s.cfg.saveRatings(entry, newRatings); } catch {} }
        entry.ratings = newRatings;
      }
      return date;
    } catch { episodeDateCache[entry.tmdb_id] = null; return null; }
  }

  /* ── trigger bar ── */
  function bar(scope, section) {
    const s = S(scope);
    const value = getSort(scope, section);
    const isDefault = value === (s.cfg.defaultSort || 'newest');
    const count = filterCount(getFilter(scope, section));
    const hasFilters = filtersFor(s, section).length > 0 || choicesFor(s, section).length > 0;
    const sec = escHTML(section);
    return `<div class="sort-bar sf-trigger-row">
      <button class="sf-icon-btn${!isDefault ? ' active' : ''}" onclick="SF.openSort('${scope}','${sec}')" aria-label="Sort">
        ${icon('sort', 15)}<span class="sf-icon-btn-label">${!isDefault ? escHTML(sortLabel(s, value)) : 'Sort'}</span>
      </button>
      ${hasFilters ? `<button class="sf-icon-btn${count ? ' active' : ''}" onclick="SF.openFilter('${scope}','${sec}')" aria-label="Filter">
        ${icon('filter', 15)}<span class="sf-icon-btn-label">${count ? `Filter (${count})` : 'Filter'}</span>
      </button>` : ''}
    </div>`;
  }

  /* ── overlays (one shared pair for every scope) ── */
  function inject(id, cardId, title, bodyId, clearLabel, clearFn, applyFn, closeFn) {
    if (document.getElementById(id)) return;
    const el = document.createElement('div');
    el.id = id;
    el.innerHTML = `<div id="${cardId}">
      <div class="sf-header">
        <div class="sf-title">${title}</div>
        <button class="sf-close" onclick="${closeFn}">${icon('x', 18)}</button>
      </div>
      <div class="sf-body" id="${bodyId}"></div>
      <div class="sf-footer">
        <button class="sf-clear-btn" onclick="${clearFn}">${clearLabel}</button>
        <button class="sf-apply-btn" onclick="${applyFn}">Apply</button>
      </div>
    </div>`;
    el.addEventListener('click', ev => { if (ev.target === el) (closeFn === 'SF.closeSort()' ? closeSort : closeFilter)(); });
    document.body.appendChild(el);
  }

  function ddHTML(id, label, active, menu, extraMenuCls = '') {
    return `<div class="td-dd sf-dd sf-dd-wide" id="${id}">
      <button type="button" class="td-dd-trigger sf-dd-trigger${active ? ' active' : ''}" onclick="event.stopPropagation();SF._toggleDD('${id}')">
        <span class="td-dd-label">${label}</span>${CHEV_SVG}
      </button>
      <div class="td-dd-menu${extraMenuCls}">${menu}</div>
    </div>`;
  }

  /* ── Sort popup ── */
  function openSort(scope, section) {
    inject('sfSortOverlay', 'sfSortCard', 'Sort', 'sfSortBody', 'Reset', 'SF._resetSort()', 'SF._applySort()', 'SF.closeSort()');
    cur = { scope, section };
    stagedSort = getSort(scope, section);
    document.getElementById('sfSortBody').innerHTML = sortBodyHTML();
    document.getElementById('sfSortOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSort() {
    const ov = document.getElementById('sfSortOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.body.style.overflow = '';
    stagedSort = null;
  }
  function sortBodyHTML() {
    const s = S(cur.scope), section = cur.section, staged = stagedSort;
    let html = `<div class="sf-section-label">Sort By</div><div class="sf-dd-stack">`;
    sortsFor(s, section).forEach((g, i) => {
      const active = g.opts.find(([v]) => v === staged);
      const label = active ? `${g.header}: ${active[1]}` : g.header;
      const menu = g.opts.map(([v, l]) => `<div class="td-dd-opt${staged === v ? ' active' : ''}" onclick="event.stopPropagation();SF._stageSort('${v}')">${l}</div>`).join('');
      html += ddHTML(`sfSortDD-${i}`, label, !!active, menu);
    });
    html += `</div>`;
    if (showRating(s, section)) {
      const rs = s.cfg.ratingSort;
      const isRating = staged.startsWith('rating:');
      let menu = '', lastGroup = null;
      rs.options().forEach(o => {
        if (o.group !== lastGroup) { menu += `<div class="sf-dd-subgroup-label">${escHTML(o.group)}</div>`; lastGroup = o.group; }
        menu += `<div class="td-dd-opt${isRating && staged.slice(7) === o.key ? ' active' : ''}" onclick="event.stopPropagation();SF._stageSort(${attrJSON('rating:' + o.key)})">${escHTML(o.label)}</div>`;
      });
      html += `<div class="sf-section-label">Rating</div>` +
        ddHTML('sfSortDD-rating', `Specific Rating${isRating ? `: ${escHTML(rs.label(staged.slice(7)))}` : ''}`, isRating, menu);
    }
    return html;
  }
  function _stageSort(v) { stagedSort = v; document.getElementById('sfSortBody').innerHTML = sortBodyHTML(); }
  // Reset stages the default (still needs Apply) — Cancel/X/backdrop discard.
  function _resetSort() { stagedSort = S(cur.scope).cfg.defaultSort || 'newest'; document.getElementById('sfSortBody').innerHTML = sortBodyHTML(); }
  async function _applySort() {
    if (!cur || !stagedSort) { closeSort(); return; }
    const { scope, section } = cur, value = stagedSort, s = S(scope);
    // Episode sort needs each show's latest-aired-episode date — fetched on
    // demand (and saved) the first time, so the sort works immediately.
    const needsEpisodes = value === 'episodeNewest' || value === 'episodeOldest';
    if (needsEpisodes || s.cfg.beforeSort) {
      const btn = document.querySelector('#sfSortCard .sf-apply-btn');
      if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }
      try {
        if (needsEpisodes) await Promise.all((s.cfg.base(section) || []).map(e => fetchLastEpisodeDate(s, e)));
        if (s.cfg.beforeSort) await s.cfg.beforeSort(section, value);
      } finally {
        if (btn) { btn.textContent = 'Apply'; btn.disabled = false; }
      }
    }
    setSort(scope, section, value);
    closeSort();
  }

  /* ── Filter popup ── */
  function openFilter(scope, section) {
    inject('sfFilterOverlay', 'sfFilterCard', 'Filter', 'sfFilterBody', 'Clear', 'SF._clearFilter()', 'SF._applyFilter()', 'SF.closeFilter()');
    cur = { scope, section };
    const f = getFilter(scope, section);
    stagedFilter = { ...EMPTY_FILTER(), ...f, genres: [...(f.genres || [])], choice: { ...(f.choice || {}) } };
    delete stagedFilter._personMatchIds;
    document.getElementById('sfFilterBody').innerHTML = filterBodyHTML();
    document.getElementById('sfFilterOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeFilter() {
    const ov = document.getElementById('sfFilterOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.body.style.overflow = '';
    stagedFilter = null;
  }
  function rangeRow(idMin, idMax, vMin, vMax, phMin, phMax, attrs = '') {
    return `<div class="sf-range-row">
      <input type="number" ${attrs} class="sf-range-input" id="${idMin}" placeholder="${phMin}" value="${escHTML(vMin)}" oninput="SF._stageRanges()">
      <span class="sf-range-to">to</span>
      <input type="number" ${attrs} class="sf-range-input" id="${idMax}" placeholder="${phMax}" value="${escHTML(vMax)}" oninput="SF._stageRanges()">
    </div>`;
  }
  function filterBodyHTML() {
    const s = S(cur.scope), section = cur.section, f = stagedFilter;
    const on = new Set(filtersFor(s, section));
    let html = '';
    choicesFor(s, section).forEach(c => {
      const curV = f.choice[c.key] || '';
      html += `<div class="sf-section-label">${escHTML(c.label)}</div><div class="sf-check-list">` +
        c.options.map(([v, l]) => `
        <label class="sf-check-row">
          <input type="checkbox" ${curV === v ? 'checked' : ''} onchange="SF._stageChoice(${attrJSON(c.key)}, ${attrJSON(v)})">
          <span class="sf-check-mark">${CHECK_SVG}</span>
          <span>${escHTML(l)}</span>
        </label>`).join('') + `</div>`;
    });
    if (on.has('genre')) {
      const menu = GENRES.map(g => `
        <label class="sf-check-row" onclick="event.stopPropagation();">
          <input type="checkbox" ${f.genres.includes(g) ? 'checked' : ''} onchange="SF._stageGenre(${attrJSON(g)})">
          <span class="sf-check-mark">${CHECK_SVG}</span>
          <span>${escHTML(g)}</span>
        </label>`).join('');
      html += `<div class="sf-section-label">Genre</div>` +
        ddHTML('sfGenreDD', f.genres.length ? escHTML(f.genres.join(', ')) : 'Any Genre', f.genres.length > 0, menu, ' sf-check-menu');
    }
    if (on.has('year')) {
      html += `<div class="sf-section-label">Release Year</div>` + rangeRow('sfYearMin', 'sfYearMax', f.yearMin, f.yearMax, 'From', 'To');
    }
    if (on.has('score')) {
      html += `<div class="sf-section-label">MyScreenScore <span class="sf-section-hint">(rated items only)</span></div>` +
        rangeRow('sfScoreMin', 'sfScoreMax', f.scoreMin, f.scoreMax, 'Min', 'Max', 'step="0.1" min="0" max="10"');
    }
    if (on.has('length')) {
      const label = s.cfg.lengthLabel ? s.cfg.lengthLabel(section) : 'Length <span class="sf-section-hint">(movies: minutes · shows: episodes)</span>';
      html += `<div class="sf-section-label">${label}</div>` + rangeRow('sfLengthMin', 'sfLengthMax', f.lengthMin, f.lengthMax, 'Min', 'Max', 'min="0"');
    }
    if (on.has('person')) {
      html += `<div class="sf-section-label">Actor / Director</div>
      <div class="td-dd sf-dd sf-dd-wide" id="sfPersonDD">
        <input type="text" class="sf-range-input sf-text-input sf-dd-trigger" id="sfPerson" placeholder="Search by name…" autocomplete="off"
          value="${escHTML(f.person || '')}" oninput="SF._personInput(event.target.value)" onfocus="event.stopPropagation();SF._openPersonDD()" onclick="event.stopPropagation();">
        <div class="td-dd-menu" id="sfPersonMenu"></div>
      </div>
      <div class="sf-section-hint sf-person-hint">Names are pulled from each title's cast &amp; crew the first time you search a section — may take a moment to load initially, then it's instant.</div>`;
    }
    return html;
  }
  function _stageGenre(genre) {
    const g = stagedFilter.genres;
    stagedFilter.genres = g.includes(genre) ? g.filter(x => x !== genre) : [...g, genre];
    // Update only the trigger label — re-rendering the menu would jump its scroll to the top.
    const trigger = document.querySelector('#sfGenreDD .sf-dd-trigger');
    trigger.querySelector('.td-dd-label').textContent = stagedFilter.genres.length ? stagedFilter.genres.join(', ') : 'Any Genre';
    trigger.classList.toggle('active', stagedFilter.genres.length > 0);
  }
  function _stageChoice(key, value) {
    stagedFilter.choice[key] = value;
    document.getElementById('sfFilterBody').innerHTML = filterBodyHTML();
  }
  function _stageRanges() {
    const v = id => document.getElementById(id)?.value ?? '';
    Object.assign(stagedFilter, {
      yearMin: v('sfYearMin'), yearMax: v('sfYearMax'),
      scoreMin: v('sfScoreMin'), scoreMax: v('sfScoreMax'),
      lengthMin: v('sfLengthMin'), lengthMax: v('sfLengthMax'),
    });
  }
  function _clearFilter() {
    stagedFilter = EMPTY_FILTER();
    document.getElementById('sfFilterBody').innerHTML = filterBodyHTML();
  }
  async function _applyFilter() {
    if (!cur || !stagedFilter) { closeFilter(); return; }
    const { scope, section } = cur, s = S(scope);
    const staged = { ...stagedFilter };
    // Actor/director needs each entry's credits (fetched once, then cached).
    if (staged.person && staged.person.trim()) {
      const q = staged.person.trim().toLowerCase();
      const btn = document.querySelector('#sfFilterCard .sf-apply-btn');
      if (btn) { btn.textContent = 'Searching…'; btn.disabled = true; }
      const matches = new Set();
      await Promise.all((s.cfg.base(section) || []).map(async e => {
        const c = await fetchCredits(s, e);
        if (c && (c.director.toLowerCase().includes(q) || c.cast.some(n => n.toLowerCase().includes(q)))) matches.add(e.id);
      }));
      staged._personMatchIds = [...matches];
      if (btn) { btn.textContent = 'Apply'; btn.disabled = false; }
    } else {
      staged._personMatchIds = null;
    }
    s.filter[section] = staged;
    refresh(scope, section);
    closeFilter();
  }

  /* ── Actor / Director suggestions ── */
  async function _openPersonDD() {
    const { scope, section } = cur, s = S(scope);
    if (s.personNames[section]) return;
    const names = new Set();
    await Promise.all((s.cfg.base(section) || []).map(async e => {
      const c = await fetchCredits(s, e);
      if (!c) return;
      if (c.director) names.add(c.director);
      c.cast.forEach(n => names.add(n));
    }));
    s.personNames[section] = [...names].sort((a, b) => a.localeCompare(b));
    if (cur && cur.scope === scope && cur.section === section) renderPersonMenu();
  }
  function _personInput(v) { stagedFilter.person = v; renderPersonMenu(); }
  function renderPersonMenu() {
    const dd = document.getElementById('sfPersonDD');
    const menu = document.getElementById('sfPersonMenu');
    if (!dd || !menu || !stagedFilter) return;
    const q = (stagedFilter.person || '').trim().toLowerCase();
    if (q.length < 2) { dd.classList.remove('open'); menu.style.cssText = ''; return; }
    const all = S(cur.scope).personNames[cur.section];
    if (!all) {
      menu.innerHTML = `<div class="sf-empty">Loading actors &amp; directors…</div>`;
    } else {
      const m = all.filter(n => n.toLowerCase().includes(q)).slice(0, 50);
      menu.innerHTML = m.length
        ? m.map(n => `<div class="td-dd-opt" onclick="event.stopPropagation();SF._pickPerson(${attrJSON(n)})">${escHTML(n)}</div>`).join('')
        : `<div class="sf-empty">No matching names.</div>`;
    }
    dd.classList.add('open');
    positionDD(dd);
  }
  function _pickPerson(name) {
    stagedFilter.person = name;
    document.getElementById('sfPerson').value = name;
    document.getElementById('sfPersonDD').classList.remove('open');
    document.getElementById('sfPersonMenu').style.cssText = '';
  }

  /* ── dropdown positioning ──
     position:fixed so menus escape .sf-body's overflow clipping. */
  function positionDD(target) {
    const trigger = target.querySelector('.sf-dd-trigger');
    const menu = target.querySelector('.td-dd-menu');
    const r = trigger.getBoundingClientRect();
    const margin = 12;
    const below = window.innerHeight - r.bottom - margin, above = r.top - margin;
    const up = below < 140 && above > below;
    const h = Math.max(110, Math.min(up ? above : below, 150));
    menu.style.cssText = `position:fixed; left:${r.left}px; width:${r.width}px; z-index:1400; display:block; max-height:${h}px; overflow-y:auto; ` +
      (up ? `bottom:${window.innerHeight - r.top}px; top:auto; border-radius:var(--radius-sm) var(--radius-sm) 0 0; border-top:0.5px solid var(--olive-light); border-bottom:none;`
          : `top:${r.bottom}px; bottom:auto;`);
  }
  function closeAllDD() {
    document.querySelectorAll('.sf-dd.open').forEach(el => {
      el.classList.remove('open');
      const m = el.querySelector('.td-dd-menu'); if (m) m.style.cssText = '';
    });
  }
  function _toggleDD(id) {
    const t = document.getElementById(id);
    const wasOpen = t.classList.contains('open');
    closeAllDD();
    if (wasOpen) return;
    t.classList.add('open');
    positionDD(t);
  }
  document.addEventListener('click', closeAllDD);
  // Only close on a real width change — a phone keyboard opening also fires resize.
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; closeAllDD(); } });
  document.addEventListener('scroll', ev => {
    if (ev.target.classList?.contains('sf-body') || ev.target === document) closeAllDD();
  }, true);

  /* ── public API ── */
  function register(scope, cfg) {
    if (!cfg || typeof cfg.base !== 'function' || typeof cfg.render !== 'function') {
      throw new Error(`SF.register("${scope}"): base() and render() are required`);
    }
    scopes[scope] = { cfg, sort: cfg.sortState || {}, filter: {}, personNames: {} };
  }
  function invalidate(scope) { if (scopes[scope]) scopes[scope].personNames = {}; }
  function clearFilters(scope, section) {
    const s = S(scope);
    if (section) delete s.filter[section]; else s.filter = {};
  }

  return {
    register, list, refresh, bar, setSort, getSort, invalidate, clearFilters,
    openSort, closeSort, openFilter, closeFilter,
    filterCount: (scope, section) => filterCount(getFilter(scope, section)),
    filterState: (scope, section) => getFilter(scope, section),
    isMovie, lengthOf, GENRES,
    // internal — used by the popup markup's inline handlers
    _stageSort, _resetSort, _applySort, _stageGenre, _stageChoice, _stageRanges, _clearFilter, _applyFilter,
    _openPersonDD, _personInput, _pickPerson, _toggleDD,
  };
})();
