/* ═══════════════════════════════════════════════════════════════
   sort-filter.js — Shared Sort & Filter system (v640)

   One implementation of the Sort / Filter panels for every page (side panel S on
   wide screens, a full page on phones — js/panel.js, loaded on first open).
   Each page registers a "scope" describing what's different about it
   (which sorts, which filters, where its entries come from, how to
   re-render), and gets the exact same popups, behavior and fixes.

   Requires (from config.js / nav.js): icon, escHTML, attrJSON,
   liveScore, tmdbFetch, TMDB_BASE.

   ── Registering a scope ──────────────────────────────────────────
   SF.register('cat', {
     // REQUIRED
     base:   section => entries[],          // unfiltered entries for a section
     render: (section, list) => {},         // redraw a section with the result

     // OPTIONAL — omit any of these to get the default
     sorts:   section => ['alpha','added','release','episode','ratings','runtime','seasons','episodes'],
              // length sorts: movies by 'runtime', shows by 'seasons' / 'episodes'
              // (on a mixed page the other kind goes last)
     filters: section => ['genre','year','score','length','person'],
     watched: section => true,              // adds "Year Watched" (From / To) for sections of
                                            // watched titles; reads watchedDate (default completed_date)
     watchedDate: e => e.completed_date,
     choiceFilters: section => [       // e.g. Status. A list starting with an "All" option ('') takes several
                                       // picks: an entry passes if any picked one passes test(entry, value),
                                       // and the choice is stored comma-joined ('tv,anime'). single: true → one only.
                                       // multi: true (no "All" row) → test(entry, 'a,b') gets them all at once.
       { key: 'status', label: 'Status', options: [['', 'All'], ['completed', 'Watched']],
         test: (entry, value) => entry.status === value },   // test optional
       SF.typeChoice(),                // the shared Type section (below)
     ],
     defaultSort: 'newest',
     sortState: {},                         // pass the page's own object to share it
     lengthKind: section => 'mixed',        // Length filter: 'movie' → Runtime (minutes);
                                            // 'show' → Seasons + Episodes; 'mixed' (default) → all three
     ratingSort: {                          // "Specific Rating" dropdown
       show: section => true,
       options: () => [{ key, label, group }],
       label: key => 'Story',
       value: (entry, key) => number|null,
     },
     addedDate: e => e.completed_date || e.created_at,
     postSort: (section, sortedList) => sortedList,   // e.g. paused-to-bottom
     beforeSort: async (section, value) => {},        // e.g. fetch data a sort needs
     beforeFilter: async (section, filter) => {},     // same, before a filter applies
     scoreOf: e => number|null,     // what "Ratings" / Score use (default: liveScore)
     scoreLabel: 'TMDB Score',      // Score filter heading (default: MyScreenFolio)
     presets: { rank: { header: 'Order', opts: [['rank', 'Your Order'], ['rankRev', 'Reversed']] } },
     compare: { popular: (a, b) => b.likes - a.likes },   // page-specific sort values
                                    // rename a sort's labels for this page
     saveRatings: (entry, newRatings) => {},          // omit on read-only pages
   });

   ── Using it ─────────────────────────────────────────────────────
   SF.bar('cat', section)        → Sort / Filter trigger buttons HTML
   SF.list('cat', section)       → filtered + sorted entries
   SF.refresh('cat', section)    → recompute + call render()
   SF.setSort('cat', section, v) → set sort and refresh
   SF.invalidate('cat')          → drop cached actor names (after reload)
   SF.searchHTML('cat', 'Search your TV Shows…')
                                 → the search box for a page (put it somewhere the
                                   page never redraws). Typing narrows every section
                                   of the scope by title / year (+ cfg.searchText(e)); cfg.onSearch(query)
                                   redraws the page (default: each section).
   SF.query('cat')               → what's typed ('' when not searching)
   SF.rank(entry, i)             → its #place in the full sorted list (true while searching)
   SF.picks('tv,anime_show')     → ['tv', 'anime_show']   (a stored choice; '' → [])
   SF.only(v, 'movies')          → true when something is picked and every pick is one of those

   ── Type: one list for every page ──
   TV Shows · Movies · Anime Shows · Anime Movies · Cartoon Shows · Cartoon Movies
   SF.TYPES                      → those as options, after "All Types"
   SF.typeChoice({ cat, movie }) → the Filter section; cat(e) / movie(e) read a page's own items
                                   (default e.cat and SF.isMovie). 'anime' / 'cartoons' (older saved picks) mean both
   SF.typeIs(v, cat, movie)      → does one pick match
   SF.typeMovies(v) / typeShows(v) → only movies / only shows picked
   SF.typeCat(v)                 → the one category picked ('anime_show' → 'anime'), else ''
   SF.typeLabel(v)               → "TV Shows" · "TV Shows + Anime Movies" · "3 Types"
═══════════════════════════════════════════════════════════════ */

const SF = (() => {
  const scopes = {};
  let cur = null;          // { scope, section } for the open popup
  let stagedSort = null;
  let stagedFilter = null;

  const CHECK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const CHEV_SVG  = '<svg class="td-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // The filter always offers every genre, not just the ones a section happens to contain (with anime ones: config.js)
  const GENRES = [...Object.keys(MSS_GENRES), ...MSS_EXTRA_GENRES].sort((a, b) => a.localeCompare(b));

  const SORT_PRESETS = {
    alpha:   { header: 'Alphabetical', opts: [['alpha', 'A → Z'], ['zalpha', 'Z → A']] },
    added:   { header: 'Added',        opts: [['newest', 'Latest'], ['oldest', 'Earliest']] },
    release: { header: 'Release Date', opts: [['releaseNewest', 'Latest'], ['releaseOldest', 'Earliest']] },
    episode: { header: 'Episode',      opts: [['episodeNewest', 'Latest'], ['episodeOldest', 'Earliest']] },
    ratings: { header: 'Ratings',      opts: [['highest', 'Highest'], ['lowest', 'Lowest']] },
    runtime: { header: 'Runtime',      opts: [['runtime_longest', 'Longest'], ['runtime_shortest', 'Shortest']] },
    seasons: { header: 'Season Count', opts: [['seasons_most', 'Most'], ['seasons_least', 'Fewest']] },
    episodes:{ header: 'Episode Count',opts: [['eps_most', 'Most'], ['eps_least', 'Fewest']] },
    // Original list position (items carry _rank) — for ranked lists like Top 250
    rank:    { header: 'Rank',         opts: [['rank', 'Top First'], ['rankRev', 'Bottom First']] },
  };
  const DEFAULT_SORTS   = ['alpha', 'added', 'release', 'ratings', 'runtime', 'seasons', 'episodes'];
  const DEFAULT_FILTERS = ['genre', 'year', 'score', 'length', 'person'];
  const EMPTY_FILTER = () => ({ genres: [], yearMin: '', yearMax: '', watchedMin: '', watchedMax: '', scoreMin: '', scoreMax: '', lengthMin: '', lengthMax: '', seasonsMin: '', seasonsMax: '', epsMin: '', epsMax: '', person: '', choice: {} });

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
  // Length: a movie's runtime (minutes); a show's season / episode counts
  const runtimeOf = e => (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0);
  const seasonsOf = e => Number(e.total_seasons) || 0;
  const epsOf = e => Number(e.total_eps) || 0;
  function releaseValue(e) {
    if (typeof getReleaseDateValue === 'function') return getReleaseDateValue(e) || 0;
    return Number(e.year) || 0;
  }
  const picks = v => (v || '').split(',').filter(Boolean);
  const only = (v, ...keys) => picks(v).length > 0 && picks(v).every(k => keys.includes(k));
  // several picks: a list whose first option is "All" (''), unless single; multi: the older all-at-once kind
  const pickMany = c => !c.multi && !c.single && c.options[0]?.[0] === '';
  const TYPES = [['tv', 'TV Shows'], ['movies', 'Movies'], ['anime_show', 'Anime Shows'], ['anime_movie', 'Anime Movies'], ['cartoons_show', 'Cartoon Shows'], ['cartoons_movie', 'Cartoon Movies']];
  const TYPE_LABEL = Object.fromEntries([...TYPES, ['anime', 'Anime'], ['cartoons', 'Cartoons']]);
  function typeIs(v, cat, movie) {
    const [c, f] = v.split('_');
    return c === cat && (!f || (f === 'movie') === !!movie);
  }
  const typeChoice = (o = {}) => ({ key: 'cat', label: 'Type', options: [['', 'All Types'], ...TYPES],
    test: (e, v) => typeIs(v, o.cat ? o.cat(e) : e.cat, o.movie ? o.movie(e) : isMovie(e)) });
  const typeMovies = v => picks(v).length > 0 && picks(v).every(k => k === 'movies' || k.endsWith('_movie'));
  const typeShows = v => picks(v).length > 0 && picks(v).every(k => k === 'tv' || k.endsWith('_show'));
  const typeCat = v => { const c = [...new Set(picks(v).map(k => k.split('_')[0]))]; return c.length === 1 ? c[0] : ''; };
  const typeLabel = v => { const p = picks(v); return p.length > 2 ? `${p.length} Types` : p.map(k => TYPE_LABEL[k] || k).join(' + '); };
  function choicesFor(s, section) {
    return s.cfg.choiceFilters ? (s.cfg.choiceFilters(section) || []) : [];
  }
  function sortsFor(s, section) {
    const keys = (s.cfg.sorts ? s.cfg.sorts(section) : DEFAULT_SORTS).filter(Boolean);
    return keys.map(k => (s.cfg.presets && s.cfg.presets[k]) || SORT_PRESETS[k]).filter(Boolean);
  }
  function filtersFor(s, section) {
    const list = (s.cfg.filters ? s.cfg.filters(section) : DEFAULT_FILTERS).filter(Boolean);
    return s.cfg.watched && s.cfg.watched(section) ? [...list, 'watched'] : list;
  }
  function showRating(s, section) {
    return !!(s.cfg.ratingSort && (!s.cfg.ratingSort.show || s.cfg.ratingSort.show(section)));
  }
  function getSort(scope, section) {
    const s = S(scope);
    return s.sort[section] || savedSort(s, section) || s.cfg.defaultSort || 'newest';
  }
  // A saved default for this section (cfg.savedSort — the Library pages' "Make this my default"), if it's one of its sorts
  function savedSort(s, section) {
    const v = s.cfg.savedSort?.get(section);
    return v && (v.startsWith('rating:') ? showRating(s, section) : sortsFor(s, section).some(g => g.opts.some(([x]) => x === v))) ? v : '';
  }
  // "Added: Latest", "Story" (a specific rating) — a sort's full name, for the defaults list and the toolbar
  function sortName(s, section, value) {
    if (value.startsWith('rating:') && s.cfg.ratingSort) return s.cfg.ratingSort.label(value.slice(7));
    for (const g of sortsFor(s, section)) for (const [v, l] of g.opts) if (v === value) return g.header === 'Added' ? `${l} added` : g.opts.length > 1 ? `${g.header}: ${l}` : l;
    return value;
  }
  function getFilter(scope, section) {
    return S(scope).filter[section] || EMPTY_FILTER();
  }
  function filterCount(f) {
    return Object.values(f.choice || {}).filter(Boolean).length + (f.genres || []).length + (f.yearMin || f.yearMax ? 1 : 0) + (f.watchedMin || f.watchedMax ? 1 : 0) + (f.scoreMin || f.scoreMax ? 1 : 0)
         + (f.lengthMin || f.lengthMax ? 1 : 0) + (f.seasonsMin || f.seasonsMax ? 1 : 0) + (f.epsMin || f.epsMax ? 1 : 0) + (f.person ? 1 : 0);
  }
  function sortLabel(s, value) {
    if (value.startsWith('rating:') && s.cfg.ratingSort) {
      const l = s.cfg.ratingSort.label(value.slice(7));
      return l.length > 14 ? l.slice(0, 13) + '…' : l;
    }
    const groups = [...Object.values(s.cfg.presets || {}), ...Object.values(SORT_PRESETS)];
    for (const g of groups) for (const [v, l] of g.opts) if (v === value) return g.opts.length > 1 ? g.header : l;
    return 'Sort';
  }

  /* ── sorting engine ── */
  function scoreFn(s) { return s.cfg.scoreOf || (e => liveScore(e)); }
  function sortEntries(s, section, base, value) {
    const a = [...base];
    const added = s.cfg.addedDate || (e => e.completed_date || e.created_at);
    const d = e => new Date(added(e) || 0);
    // Same day? Then the exact moment it was marked watched decides
    // (completed_at, set by the database), falling back to when it was added.
    const t = e => new Date(e.completed_at || e.created_at || 0);
    const sc = e => scoreFn(s)(e) || 0;
    const byCreated = (x, y) => new Date(y.created_at) - new Date(x.created_at);
    let out;
    switch (value) {
      case 'newest':        out = a.sort((x, y) => (d(y) - d(x)) || (t(y) - t(x))); break;
      case 'oldest':        out = a.sort((x, y) => (d(x) - d(y)) || (t(x) - t(y))); break;
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
        const m = a.filter(isMovie).sort((x, y) => dir * (runtimeOf(x) - runtimeOf(y)));
        out = m.concat(a.filter(e => !isMovie(e)).sort((x, y) => d(y) - d(x)));
        break;
      }
      case 'eps_most': case 'eps_least': case 'seasons_most': case 'seasons_least': {
        const dir = value.endsWith('_most') ? -1 : 1, by = value.startsWith('eps') ? epsOf : seasonsOf;
        const sh = a.filter(e => !isMovie(e)).sort((x, y) => dir * (by(x) - by(y)));
        out = sh.concat(a.filter(isMovie).sort((x, y) => d(y) - d(x)));
        break;
      }
      case 'episodeNewest': out = a.sort((x, y) => new Date(y.ratings?._last_episode_date || 0) - new Date(x.ratings?._last_episode_date || 0)); break;
      case 'episodeOldest': out = a.sort((x, y) => new Date(x.ratings?._last_episode_date || 0) - new Date(y.ratings?._last_episode_date || 0)); break;
      case 'rank':          out = a.sort((x, y) => (x._rank ?? 1e9) - (y._rank ?? 1e9)); break;
      case 'rankRev':       out = a.sort((x, y) => (y._rank ?? -1) - (x._rank ?? -1)); break;
      default:
        if (s.cfg.compare && s.cfg.compare[value]) {
          out = a.sort(s.cfg.compare[value]);
        } else if (value && value.startsWith('rating:') && s.cfg.ratingSort?.value) {
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
      const v = f.choice?.[c.key], one = x => e => c.test ? c.test(e, x) : e[c.key] === x;
      if (!v) return;
      if (pickMany(c)) { const tests = picks(v).map(one); out = out.filter(e => tests.some(t => t(e))); }
      else out = out.filter(one(v));
    });
    if (f.genres?.length) out = out.filter(e => (e.genres || []).some(g => f.genres.includes(g)));
    if (f.yearMin)   out = out.filter(e => e.year && Number(e.year) >= Number(f.yearMin));
    if (f.yearMax)   out = out.filter(e => e.year && Number(e.year) <= Number(f.yearMax));
    if (f.watchedMin || f.watchedMax) {
      const wd = s.cfg.watchedDate || (e => e.completed_date);
      const wy = e => { const d = wd(e); return d ? Number(String(d).slice(0, 4)) || 0 : 0; };
      if (f.watchedMin) out = out.filter(e => wy(e) && wy(e) >= Number(f.watchedMin));
      if (f.watchedMax) out = out.filter(e => wy(e) && wy(e) <= Number(f.watchedMax));
    }
    const sc = scoreFn(s);
    if (f.scoreMin)  out = out.filter(e => sc(e) != null && sc(e) >= Number(f.scoreMin));
    if (f.scoreMax)  out = out.filter(e => sc(e) != null && sc(e) <= Number(f.scoreMax));
    // Length: movies by runtime, shows by seasons / episodes. Set only one kind
    // and the other kind is left out (runtime 90–120 → just those movies).
    const inR = (v, lo, hi) => (!lo || v >= Number(lo)) && (!hi || v <= Number(hi));
    const forMovies = f.lengthMin || f.lengthMax, forShows = f.seasonsMin || f.seasonsMax || f.epsMin || f.epsMax;
    if (forMovies || forShows) out = out.filter(e => isMovie(e)
      ? (forMovies ? inR(runtimeOf(e), f.lengthMin, f.lengthMax) : false)
      : (forShows ? inR(seasonsOf(e), f.seasonsMin, f.seasonsMax) && inR(epsOf(e), f.epsMin, f.epsMax) : false));
    if (f._personMatchIds) out = out.filter(e => f._personMatchIds.includes(e.id));
    return out;
  }

  /* ── Search: every word typed must appear in the title (accents, case and
     punctuation ignored, so "spiderman" finds "Spider-Man") or be the year ── */
  const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // cfg.searchText(e) → more text to search as well (the Notes page: the note itself)
  function matches(e, words, more) {
    const hay = norm(`${e.title || ''} ${e.ratings?._original_title || ''} ${more ? more(e) || '' : ''}`), flat = hay.replace(/ /g, ''), year = String(e.year || '').slice(0, 4);
    return words.every(w => hay.includes(w) || flat.includes(w) || w === year);
  }
  function searchFilter(s, list) {
    const words = norm(s.query).split(' ').filter(Boolean);
    return words.length ? list.filter(e => matches(e, words, s.cfg.searchText)) : list;
  }

  function list(scope, section) {
    const s = S(scope);
    s.sections.add(section);
    const base = applyFilter(s, section, s.cfg.base(section) || [], getFilter(scope, section));
    const sorted = sortEntries(s, section, base, getSort(scope, section));
    // ranks come from the whole sorted list, so a search keeps #1, #2… true (SF.rank)
    sorted.forEach((e, x) => { e._sfRank = x + 1; });
    return searchFilter(s, sorted);
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
      const res = await tmdbFetch(`${TMDB_BASE}/${entry.tmdb_type}/${entry.tmdb_id}?language=en-US&append_to_response=credits`);
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
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${entry.tmdb_id}?language=en-US`);
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
      ${buttonHTML('sort', !isDefault ? sortLabel(s, value) : 'Sort', !isDefault, `SF.openSort('${scope}','${sec}')`, 'Sort')}
      ${hasFilters ? buttonHTML('filter', count ? `Filter (${count})` : 'Filter', count > 0, `SF.openFilter('${scope}','${sec}')`, 'Filter') : ''}
    </div>`;
  }

  /* A pick list (Status, Type, Format…): check rows; curV is the value, or the picked values (several-picks lists) */
  function choiceHTML(label, hint, options, curV, onchange) {
    return `<div class="lyr-sec"><h3 class="lyr-sec-h">${escHTML(label)}${hint ? ` <small>${escHTML(hint)}</small>` : ''}</h3><div class="sf-check-list" role="group" aria-label="${escHTML(label)}">` +
      options.map(([v, l]) => `
        <label class="sf-check-row">
          <input type="checkbox" ${(Array.isArray(curV) ? curV.includes(v) : curV === v) ? 'checked' : ''} onchange="${onchange(v)}">
          <span class="sf-check-mark">${CHECK_SVG}</span>
          <span>${escHTML(l)}</span>
        </label>`).join('') + `</div></div>`;
  }
  // The Sort / Filter trigger button (also used for the page-wide Type filter)
  function buttonHTML(ico, label, active, onclick, aria) {
    return `<button type="button" class="sf-icon-btn${active ? ' active' : ''}" onclick="${onclick}" aria-label="${aria}">
        ${icon(ico, 15)}<span class="sf-icon-btn-label">${escHTML(label)}</span>
      </button>`;
  }
  /* ── Page-wide Type filter — Library (the shared Type list, several picks) and the Anime / Cartoons
     pages (Movies vs TV Shows). The same Filter panel.
       SF.typeFilter({ groups: [{ key, label, options: [[value, label]] }],
                       value: { key: value }, onApply(value), count(value) → how many titles it shows })
       SF.typeFilterButton(onclick, label, active) → its trigger button ── */
  let tf = null;
  async function typeFilter(o) {
    await mssLoadScript('js/panel.js');
    tf = { o, staged: { ...o.value }, open: new Set() };
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: o.title || 'Filter', body: typeBody(),
      footer: { secondary: [{ label: 'Clear', onClick: typeClear }], primary: { label: o.count ? countLabel(o.count(tf.staged)) : 'Apply', onClick: typeApply } },
      onClose: () => { if (tf?.h === h) tf = null; } });
    tf.h = h;
  }
  function typeBody() {
    const st = tf.staged;
    return tf.o.groups.map(g => g.tree ? treeHTML(g) : choiceHTML(g.label, '', g.options, pickMany(g) ? (st[g.key] || '').split(',') : st[g.key], v => `SF._typeStage(${attrJSON(g.key)}, ${attrJSON(v)})`)).join('')
      + '<p class="sr-only" aria-live="polite" id="sfTypeLive"></p>';
  }
  /* A Type list where a row can open into its parts (Anime → TV Shows · Movies), several picks.
     group.tree = true; options [[value, label, [[childValue, childLabel], …]?]] — 'anime' means both parts,
     'anime_show' one of them (typeIs). The parent's box is ticked for both, half-ticked for one. */
  function treeHTML(g) {
    const on = new Set(picks(tf.staged[g.key]));
    tf.open = tf.open || new Set();
    const row = (v, label, checked, mixed, cls = '', extra = '') => `<label class="sf-check-row${cls}">
        <input type="checkbox" ${checked ? 'checked' : ''} ${mixed ? 'data-mixed="1"' : ''} aria-checked="${mixed ? 'mixed' : checked}" onchange="SF._treeStage(${attrJSON(g.key)}, ${attrJSON(v)})">
        <span class="sf-check-mark${mixed ? ' is-mixed' : ''}">${mixed ? '<i></i>' : CHECK_SVG}</span><span>${escHTML(label)}</span>${extra}</label>`;
    return `<div class="lyr-sec"><h3 class="lyr-sec-h">${escHTML(g.label)}</h3><div class="sf-check-list sf-tree" role="group" aria-label="${escHTML(g.label)}">` + g.options.map(([v, label, kids]) => {
      if (!v) return row('', label, !on.size);
      if (!kids) return row(v, label, on.has(v));
      const picked = kids.filter(([k]) => on.has(v) || on.has(k)), open = tf.open.has(v) || (picked.length === 1);
      const toggle = `<button type="button" class="sf-tree-x" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} ${escHTML(label)} TV shows and movies" onclick="event.preventDefault();event.stopPropagation();SF._treeOpen(${attrJSON(v)})">${icon(open ? 'chevup' : 'chevdown', 15)}</button>`;
      return row(v, label, picked.length === kids.length, picked.length === 1, ' is-parent', toggle)
        + (open ? `<div class="sf-tree-kids">${kids.map(([k, kl]) => row(k, kl, on.has(v) || on.has(k), false, ' is-kid')).join('')}</div>` : '');
    }).join('') + '</div></div>';
  }
  function treeStage(key, v) {
    const g = tf.o.groups.find(x => x.key === key), on = new Set(picks(tf.staged[key]));
    if (!v) on.clear();
    else {
      const parent = g.options.find(([p, , kids]) => kids && (p === v || kids.some(([k]) => k === v)));
      if (!parent) { if (!on.delete(v)) on.add(v); }
      else {
        const [p, , kids] = parent, ks = kids.map(([k]) => k);
        let sel = new Set(ks.filter(k => on.has(p) || on.has(k)));
        if (v === p) sel = sel.size === ks.length ? new Set() : new Set(ks);           // the whole group on / off
        else if (!sel.delete(v)) sel.add(v);
        on.delete(p); ks.forEach(k => on.delete(k));
        if (sel.size === ks.length) on.add(p); else sel.forEach(k => on.add(k));
      }
    }
    tf.staged[key] = [...on].join(',');
    typeRedraw();
    tf.h.body.querySelector(`.sf-check-row input[onchange*='"${v}"']`)?.focus();
  }
  function treeOpen(v) {
    tf.open = tf.open || new Set();
    if (!tf.open.delete(v)) tf.open.add(v);
    typeRedraw();
    tf.h.body.querySelector(`.sf-tree-x[onclick*='"${v}"']`)?.focus();
  }
  function typeRedraw() {
    const sc = tf.h.body.closest('.lyr-body').scrollTop;
    tf.h.setBody(typeBody());
    tf.h.body.closest('.lyr-body').scrollTop = sc;
    if (tf.o.count) recountLater(() => tf.o.count(tf.staged), tf.h, 'sfTypeLive');
  }
  const typeStage = (k, v) => {
    const g = tf.o.groups.find(x => x.key === k);
    tf.staged[k] = pickMany(g) ? toggled(tf.staged[k], v) : v;
    typeRedraw();
    tf.h.body.querySelectorAll('.sf-check-row input')[g.options.findIndex(o => o[0] === v)]?.focus();
  };
  // a pick on a several-picks list: "All" clears, anything else is ticked or unticked
  function toggled(cur, v) {
    if (!v) return '';
    const on = new Set(picks(cur));
    if (!on.delete(v)) on.add(v);
    return [...on].join(',');
  }
  const typeClear = () => { tf.o.groups.forEach(g => { tf.staged[g.key] = g.options[0][0]; }); typeRedraw(); };
  function typeApply(h) { const v = { ...tf.staged }, o = tf.o; h.closeNow(); o.onApply(v); }

  /* ── The live count on a Filter panel's button: "Show 311 titles", 200ms after a change ── */
  let countTimer = null;
  const countLabel = n => n == null ? 'Show titles' : `Show ${n} ${n === 1 ? 'title' : 'titles'}`;
  function recountLater(fn, h, liveId, wait = 200) {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      if (!h.body.isConnected) return;
      const n = fn();
      h.setPrimary({ label: countLabel(n) });
      const live = document.getElementById(liveId);
      if (live) live.textContent = n == null ? '' : `${n} ${n === 1 ? 'title matches' : 'titles match'}`;
    }, wait);
  }
  // Type to narrow a dropdown: the first thing in its menu
  const ddSearch = ph => `<div class="sf-dd-search"><input type="search" placeholder="${escHTML(ph)}" aria-label="${escHTML(ph)}" autocomplete="off" onclick="event.stopPropagation()" oninput="SF._ddFilter(this)"></div>`;
  function _ddFilter(inp) {
    const q = inp.value.trim().toLowerCase(), menu = inp.closest('.td-dd-menu');
    menu.querySelectorAll('.sf-check-row, .td-dd-opt').forEach(o => { o.hidden = !!q && !o.textContent.toLowerCase().includes(q); });
  }
  function ddHTML(id, label, active, menu, extraMenuCls = '') {
    return `<div class="td-dd sf-dd sf-dd-wide" id="${id}">
      <button type="button" class="td-dd-trigger sf-dd-trigger${active ? ' active' : ''}" onclick="event.stopPropagation();SF._toggleDD('${id}')">
        <span class="td-dd-label">${label}</span>${CHEV_SVG}
      </button>
      <div class="td-dd-menu${extraMenuCls}">${menu}</div>
    </div>`;
  }

  /* ── Sort panel: one row per sort; the chosen row shows its direction (A → Z | Z → A …) ── */
  let ph = null;      // the open Sort / Filter panel
  let stagedDefault = false;   // "Make this my default for …" ticked (cfg.savedSort)
  async function openSort(scope, section) {
    await mssLoadScript('js/panel.js');
    cur = { scope, section };
    stagedSort = getSort(scope, section);
    stagedDefault = false;
    const sv = S(scope).cfg.savedSort;
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Sort', subtitle: sv?.subtitle ? sv.subtitle(section) : undefined, body: sortBodyHTML(),
      footer: { secondary: [{ label: 'Reset', onClick: _resetSort }], primary: { label: 'Apply', onClick: applySort } },
      onClose: () => { if (ph === h) { ph = null; stagedSort = null; } } });
    ph = h;
    h.body.addEventListener('click', sortClick);
  }
  function closeSort() { ph?.closeNow(); }
  // [header, options] rows: the page's sorts, then "Specific rating" where the page has one
  function sortRows() {
    const s = S(cur.scope), rows = sortsFor(s, cur.section).map(g => ({ header: g.header, opts: g.opts }));
    if (showRating(s, cur.section)) rows.push({ header: 'Specific Rating', rating: true });
    return rows;
  }
  const rowOn = (r, v) => r.rating ? v.startsWith('rating:') : r.opts.some(([x]) => x === v);
  // each sort's icon on its tile
  const SORT_ICON = { Alphabetical: 'list', Added: 'bookmark', 'Release Date': 'calendar', Episode: 'tv', Ratings: 'ratingStar', Runtime: 'clock',
    'Season Count': 'layers', 'Episode Count': 'episodes', Rank: 'trophy', 'Specific Rating': 'star' };
  function sortBodyHTML() {
    const s = S(cur.scope), staged = stagedSort;
    return `<div class="lyr-sec"><h3 class="lyr-sec-h" id="sfSortH">Sort by</h3><div class="lyr-choices is-tiles" role="radiogroup" aria-labelledby="sfSortH">${sortRows().map((r, i) => {
      const on = rowOn(r, staged);
      let extra = '';
      if (on && r.rating) {
        const rs = s.cfg.ratingSort; let menu = '', lastGroup = null;
        rs.options().forEach(o => {
          if (o.group !== lastGroup) { menu += `<div class="sf-dd-subgroup-label">${escHTML(o.group)}</div>`; lastGroup = o.group; }
          menu += `<div class="td-dd-opt${staged.slice(7) === o.key ? ' active' : ''}" onclick="event.stopPropagation();SF._stageSort(${attrJSON('rating:' + o.key)})">${escHTML(o.label)}</div>`;
        });
        extra = ddHTML('sfSortDD-rating', escHTML(rs.label(staged.slice(7))), true, menu, ' is-inline');   // opens inline under the field, inside the card (not over the rows below)
      } else if (on && r.opts.length > 1) extra = mssSegHTML({ label: `${r.header} order`, strong: true, value: staged, options: r.opts });
      const hint = on ? 'Sorted by' : r.rating ? 'Pick a category' : r.opts.map(o => o[1]).join(' · ');
      return `<div class="lyr-choice${on ? ' is-on' : ''}" data-row="${i}">
          <button type="button" class="lyr-choice-main" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}"><span class="lyr-tile-ic" aria-hidden="true">${icon(SORT_ICON[r.header] || 'sort', 18)}</span><span class="lyr-tile-txt">${on ? `<small>${escHTML(hint)}</small><b>${escHTML(r.header)}</b>` : `<b>${escHTML(r.header)}</b><small>${escHTML(hint)}</small>`}</span></button>${extra}</div>`;
    }).join('')}</div></div>${savedSortHTML()}`;
  }
  /* "Make this my default for Watched" + a read-only list of every status's default (cfg.savedSort) */
  function savedSortHTML() {
    const s = S(cur.scope), sv = s.cfg.savedSort;
    if (!sv) return '';
    const name = sv.label(cur.section), base = s.cfg.defaultSort || 'newest';
    return `<div class="lyr-sec sf-def">
        <label class="sf-check-row sf-def-row"><input type="checkbox" ${stagedDefault ? 'checked' : ''} onchange="SF._stageDefault(this.checked)">
          <span class="sf-check-mark">${CHECK_SVG}</span>
          <span class="sf-def-txt"><b>Make this my default for ${escHTML(name)}</b><small>Used every time you open ${escHTML(name)}. Each status keeps its own default.</small></span></label>
        <h3 class="lyr-sec-h" id="sfDefH">Your defaults</h3>
        <ul class="sf-def-list" aria-labelledby="sfDefH">${sv.sections.map(([k, l]) => `<li${k === cur.section ? ' class="is-cur" aria-current="true"' : ''}><span>${escHTML(l)}</span><span>${escHTML(sortName(s, k, savedSort(s, k) || base))}</span></li>`).join('')}</ul>
      </div>`;
  }
  function _stageDefault(on) { stagedDefault = !!on; }
  function sortRedraw(focusRow) {
    ph.setBody(sortBodyHTML());
    if (focusRow != null) ph.body.querySelector(`[data-row="${focusRow}"] .lyr-choice-main`)?.focus();
  }
  function sortClick(ev) {
    const seg = ev.target.closest('.lyr-seg-opt');
    if (seg) { stagedSort = mssSegPick(seg); return; }
    const row = ev.target.closest('.lyr-choice'); if (!row || ev.target.closest('.sf-dd')) return;
    const i = Number(row.dataset.row), r = sortRows()[i];
    if (rowOn(r, stagedSort)) return;
    stagedSort = r.rating ? 'rating:' + S(cur.scope).cfg.ratingSort.options()[0].key : r.opts[0][0];
    sortRedraw(i);
  }
  function _stageSort(v) { stagedSort = v; closeAllDD(); sortRedraw(sortRows().findIndex(r => rowOn(r, v))); }
  // Reset stages the default (still needs Apply); closing the panel discards it
  function _resetSort() { stagedSort = S(cur.scope).cfg.defaultSort || 'newest'; sortRedraw(); }
  async function applySort(h) {
    const { scope, section } = cur, value = stagedSort, s = S(scope);
    // Episode sort needs each show's latest-aired-episode date — fetched on
    // demand (and saved) the first time, so the sort works immediately.
    if (value === 'episodeNewest' || value === 'episodeOldest') await Promise.all((s.cfg.base(section) || []).map(e => fetchLastEpisodeDate(s, e)));
    if (s.cfg.beforeSort) await s.cfg.beforeSort(section, value);
    if (stagedDefault && s.cfg.savedSort) {
      try { await s.cfg.savedSort.set(section, value); } catch (err) { console.warn('Saving the default sort:', err); }
    }
    setSort(scope, section, value);
    h.closeNow();
  }

  /* ── Filter panel ── */
  async function openFilter(scope, section) {
    await mssLoadScript('js/panel.js');
    cur = { scope, section };
    const f = getFilter(scope, section);
    stagedFilter = { ...EMPTY_FILTER(), ...f, genres: [...(f.genres || [])], choice: { ...(f.choice || {}) } };
    delete stagedFilter._personMatchIds;
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Filter', body: filterBodyHTML(),
      footer: { secondary: [{ label: 'Reset', onClick: _clearFilter }], primary: { label: countLabel(liveCount()), onClick: applyFilter_ } },
      onClose: () => { if (ph === h) { ph = null; stagedFilter = null; closeAllDD(); } } });
    ph = h;
  }
  function closeFilter() { ph?.closeNow(); }
  function rangeRow(label, idMin, idMax, vMin, vMax, phMin, phMax, attrs = '') {
    return `<div class="lyr-range" role="group" aria-label="${escHTML(label)}">
      <input type="number" ${attrs} class="lyr-field" id="${idMin}" placeholder="${phMin}" aria-label="${escHTML(label)}: ${phMin}" value="${escHTML(vMin)}" oninput="SF._stageRanges()">
      <span class="lyr-range-to" aria-hidden="true">to</span>
      <input type="number" ${attrs} class="lyr-field" id="${idMax}" placeholder="${phMax}" aria-label="${escHTML(label)}: ${phMax}" value="${escHTML(vMax)}" oninput="SF._stageRanges()">
    </div>`;
  }
  const sec = (label, hint, inner) => `<div class="lyr-sec"><h3 class="lyr-sec-h">${escHTML(label)}${hint ? ` <small>${escHTML(hint)}</small>` : ''}</h3>${inner}</div>`;
  function filterBodyHTML() {
    const s = S(cur.scope), section = cur.section, f = stagedFilter;
    const on = new Set(filtersFor(s, section));
    let html = '';
    choicesFor(s, section).forEach(c => {
      html += c.multi || pickMany(c)
        ? choiceHTML(c.label, c.hint || '', c.options, (f.choice[c.key] || '').split(','), v => `SF._stageChoiceToggle(${attrJSON(c.key)}, ${attrJSON(v)})`)
        : choiceHTML(c.label, '', c.options, f.choice[c.key] || '', v => `SF._stageChoice(${attrJSON(c.key)}, ${attrJSON(v)})`);
    });
    if (on.has('genre')) {
      const menu = GENRES.map(g => `
        <label class="sf-check-row" onclick="event.stopPropagation();">
          <input type="checkbox" ${f.genres.includes(g) ? 'checked' : ''} onchange="SF._stageGenre(${attrJSON(g)})">
          <span class="sf-check-mark">${CHECK_SVG}</span>
          <span>${escHTML(g)}</span>
        </label>`).join('');
      html += sec('Genre', '', ddHTML('sfGenreDD', f.genres.length ? escHTML(f.genres.join(', ')) : 'Any Genre', f.genres.length > 0, ddSearch('Search genres…') + menu, ' sf-check-menu'));
    }
    if (on.has('year')) html += sec('Release Year', '', rangeRow('Release year', 'sfYearMin', 'sfYearMax', f.yearMin, f.yearMax, 'From', 'To', 'inputmode="numeric"'));
    if (on.has('watched')) html += sec('Year Watched', '', rangeRow('Year watched', 'sfWatchedMin', 'sfWatchedMax', f.watchedMin, f.watchedMax, 'From', 'To', 'inputmode="numeric"'));
    if (on.has('score')) html += sec(s.cfg.scoreLabel || 'MyScreenFolio', '(rated items only)', rangeRow(`${s.cfg.scoreLabel || 'MyScreenFolio'} score`, 'sfScoreMin', 'sfScoreMax', f.scoreMin, f.scoreMax, 'Min', 'Max', 'step="0.1" min="0" max="10" inputmode="decimal"'));
    if (on.has('length')) {
      const kind = s.cfg.lengthKind ? s.cfg.lengthKind(section) : 'mixed', mixed = kind === 'mixed';
      if (kind !== 'show') html += sec('Runtime', `(minutes${mixed ? ' · movies' : ''})`, rangeRow('Runtime in minutes', 'sfLengthMin', 'sfLengthMax', f.lengthMin, f.lengthMax, 'Min', 'Max', 'min="0" inputmode="numeric"'));
      if (kind !== 'movie') html += sec('Seasons', mixed ? '(shows)' : '', rangeRow('Seasons', 'sfSeasonsMin', 'sfSeasonsMax', f.seasonsMin, f.seasonsMax, 'Min', 'Max', 'min="0" inputmode="numeric"'))
        + sec('Episodes', mixed ? '(shows)' : '', rangeRow('Episodes', 'sfEpsMin', 'sfEpsMax', f.epsMin, f.epsMax, 'Min', 'Max', 'min="0" inputmode="numeric"'));
    }
    if (on.has('person')) {
      html += sec('Actor / Director', '', `<div class="td-dd sf-dd sf-dd-wide" id="sfPersonDD">
        <input type="text" class="lyr-field sf-dd-trigger" id="sfPerson" placeholder="Search by name, e.g. Tom Hanks…" autocomplete="off" aria-label="Actor or director"
          value="${escHTML(f.person || '')}" oninput="SF._personInput(event.target.value)" onfocus="event.stopPropagation();SF._openPersonDD()" onclick="event.stopPropagation();">
        <div class="td-dd-menu" id="sfPersonMenu"></div>
      </div>
      <p class="lyr-hint">Names are pulled from each title's cast &amp; crew the first time you search a section — may take a moment to load initially, then it's instant.</p>`);
    }
    return html + '<p class="sr-only" aria-live="polite" id="sfFilterLive"></p>';
  }
  function filterRedraw() {
    const box = ph.body.closest('.lyr-body'), sc = box.scrollTop, focusId = document.activeElement?.id;
    ph.setBody(filterBodyHTML());
    box.scrollTop = sc;
    if (focusId) document.getElementById(focusId)?.focus();
    recount();
  }
  // How many titles the staged filter shows (with the page's search). null while an actor / director
  // filter is waiting on cast lists that haven't loaded yet.
  function liveCount() {
    const s = S(cur.scope), section = cur.section, f = { ...stagedFilter };
    const bad = v => v && !(/^\d{4}$/.test(v) && +v >= 1880 && +v <= new Date().getFullYear() + 10);
    ['yearMin', 'yearMax', 'watchedMin', 'watchedMax'].forEach(k => { if (bad(f[k])) f[k] = ''; });
    const base = s.cfg.base(section) || [];
    if (f.person && f.person.trim()) {
      const q = f.person.trim().toLowerCase(), ids = [];
      for (const e of base) {
        const c = creditsNow(e);
        if (c === undefined) return null;
        if (c && (c.director.toLowerCase().includes(q) || c.cast.some(n => n.toLowerCase().includes(q)))) ids.push(e.id);
      }
      f._personMatchIds = ids;
    }
    return searchFilter(s, applyFilter(s, section, base, f)).length;
  }
  // an entry's cast list if it's already known: { director, cast } · null (not on TMDB) · undefined (not loaded yet)
  function creditsNow(e) {
    if (e.ratings?._director != null || e.ratings?._cast_names) return { director: e.ratings._director || '', cast: e.ratings._cast_names || [] };
    if (!e.tmdb_id || !e.tmdb_type) return null;
    return creditsCache[`${e.tmdb_type}:${e.tmdb_id}`];
  }
  const recount = () => { if (ph && stagedFilter) recountLater(liveCount, ph, 'sfFilterLive'); };
  function _stageGenre(genre) {
    const g = stagedFilter.genres;
    stagedFilter.genres = g.includes(genre) ? g.filter(x => x !== genre) : [...g, genre];
    // Update only the trigger label — re-rendering the menu would jump its scroll to the top.
    const trigger = document.querySelector('#sfGenreDD .sf-dd-trigger');
    trigger.querySelector('.td-dd-label').textContent = stagedFilter.genres.length ? stagedFilter.genres.join(', ') : 'Any Genre';
    trigger.classList.toggle('active', stagedFilter.genres.length > 0);
    recount();
  }
  function _stageChoice(key, value) { stagedFilter.choice[key] = value; filterRedraw(); }
  // multi: true → several can be ticked; test(item, 'a,b') gets them comma-joined
  function _stageChoiceToggle(key, value) { stagedFilter.choice[key] = toggled(stagedFilter.choice[key], value); filterRedraw(); }
  function _stageRanges() {
    const v = id => document.getElementById(id)?.value ?? '';
    Object.assign(stagedFilter, {
      yearMin: v('sfYearMin'), yearMax: v('sfYearMax'),
      watchedMin: v('sfWatchedMin'), watchedMax: v('sfWatchedMax'),
      scoreMin: v('sfScoreMin'), scoreMax: v('sfScoreMax'),
      lengthMin: v('sfLengthMin'), lengthMax: v('sfLengthMax'),
      seasonsMin: v('sfSeasonsMin'), seasonsMax: v('sfSeasonsMax'),
      epsMin: v('sfEpsMin'), epsMax: v('sfEpsMax'),
    });
    ['sfYearMin', 'sfWatchedMin'].forEach(id => { const el = document.getElementById(id); if (el?.classList.contains('is-invalid')) ph.fieldError(el.closest('.lyr-range'), ''); });
    recount();
  }
  function _clearFilter() { stagedFilter = EMPTY_FILTER(); filterRedraw(); }
  // Years typed into the filter: 4 digits that make sense, and From before To
  function checkYears(f) {
    const bad = v => v && !(/^\d{4}$/.test(v) && +v >= 1880 && +v <= new Date().getFullYear() + 10);
    const pairs = [['yearMin', 'yearMax'], ['watchedMin', 'watchedMax']];
    if (pairs.flat().some(k => bad(f[k]))) return false;
    pairs.forEach(([a, b]) => { if (f[a] && f[b] && +f[a] > +f[b]) [f[a], f[b]] = [f[b], f[a]]; });
    return true;
  }
  async function applyFilter_(h) {
    const { scope, section } = cur, s = S(scope);
    const staged = { ...stagedFilter };
    if (!checkYears(staged)) {
      const range = (document.getElementById('sfYearMin') || document.getElementById('sfWatchedMin')).closest('.lyr-range');
      h.fieldError(range, 'Use a 4-digit year, like 2004.');
      range.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (s.cfg.beforeFilter) await s.cfg.beforeFilter(section, staged);
    // Actor/director needs each entry's credits (fetched once, then cached).
    if (staged.person && staged.person.trim()) {
      const q = staged.person.trim().toLowerCase();
      const matches = new Set();
      await Promise.all((s.cfg.base(section) || []).map(async e => {
        const c = await fetchCredits(s, e);
        if (c && (c.director.toLowerCase().includes(q) || c.cast.some(n => n.toLowerCase().includes(q)))) matches.add(e.id);
      }));
      staged._personMatchIds = [...matches];
    } else {
      staged._personMatchIds = null;
    }
    s.filter[section] = staged;
    refresh(scope, section);
    h.closeNow();
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
    if (cur && cur.scope === scope && cur.section === section && stagedFilter) { renderPersonMenu(); recount(); }
  }
  function _personInput(v) { stagedFilter.person = v; renderPersonMenu(); recount(); }
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
    recount();
  }

  /* ── dropdown positioning ──
     in a panel: inline; elsewhere position:fixed so menus escape .sf-body's overflow clipping. */
  function positionDD(target) {
    const trigger = target.querySelector('.sf-dd-trigger');
    const menu = target.querySelector('.td-dd-menu');
    // inside a panel (Sort / Filter): the list opens in place, under its field, and scrolls with the panel
    if (target.closest('.lyr')) { menu.style.cssText = ''; menu.classList.add('is-inline'); return; }
    const r = trigger.getBoundingClientRect();
    const margin = 12;
    const below = window.innerHeight - r.bottom - margin, above = r.top - margin;
    const up = below < 140 && above > below;
    const h = Math.max(110, Math.min(up ? above : below, 150));
    menu.style.cssText = `position:fixed; left:${r.left}px; width:${r.width}px; z-index:${target.closest('.lyr') ? 2060 : 1400}; display:block; max-height:${h}px; overflow-y:auto; ` +
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
    scopes[scope] = { cfg, sort: cfg.sortState || {}, filter: {}, personNames: {}, query: '', sections: new Set() };
  }
  // The search box. data-scope ties it to its scope; it's drawn once and left alone,
  // so typing never loses focus while the sections redraw underneath.
  function searchHTML(scope, placeholder) {
    const q = S(scope).query;
    return `<div class="sf-search${q ? ' has-q' : ''}" role="search" data-scope="${escHTML(scope)}">
        <span class="sf-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input type="search" class="sf-search-input" placeholder="${escHTML(placeholder || 'Search…')}" aria-label="${escHTML(placeholder || 'Search')}" value="${escHTML(q)}"
          autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"
          oninput="SF._search('${escHTML(scope)}', this.value)" onkeydown="if(event.key==='Escape'&&this.value){event.stopPropagation();SF._search('${escHTML(scope)}','',true)}">
        <span class="sf-search-count" aria-live="polite"></span>
        <button type="button" class="sf-search-clear" onclick="SF._search('${escHTML(scope)}','',true)" aria-label="Clear search">${icon('x', 14)}</button>
        <button type="button" class="sf-search-go" tabindex="-1" aria-hidden="true" onclick="this.parentElement.querySelector('input').focus()">${icon('search', 16)}<span>Search</span></button>
      </div>`;
  }
  let searchTimer = null;
  function search(scope, value, now) {
    const s = S(scope);
    s.query = value || '';
    document.querySelectorAll(`.sf-search[data-scope="${scope}"]`).forEach(box => {
      box.classList.toggle('has-q', !!s.query);
      const inp = box.querySelector('input');
      if (inp.value !== s.query) inp.value = s.query;
      if (now && !s.query) inp.focus();
    });
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (s.cfg.onSearch) s.cfg.onSearch(s.query); else s.sections.forEach(sec => refresh(scope, sec));
      // how many titles match, across every section on the page
      const n = s.query ? [...s.sections].reduce((a, sec) => a + list(scope, sec).length, 0) : 0;
      document.querySelectorAll(`.sf-search[data-scope="${scope}"] .sf-search-count`).forEach(c => {
        c.innerHTML = s.query ? (n ? `<b>${n}</b> found` : 'No matches') : '';
      });
    }, now ? 0 : 140);
  }
  function invalidate(scope) { if (scopes[scope]) scopes[scope].personNames = {}; }
  // Put back a saved sort/filter (e.g. when returning to a page)
  function restoreState(scope, section, state) {
    const s = S(scope);
    if (!state) return;
    if (state.sort) s.sort[section] = state.sort;
    if (state.filter) s.filter[section] = state.filter;
  }
  function clearFilters(scope, section) {
    const s = S(scope);
    if (section) delete s.filter[section]; else s.filter = {};
  }

  return {
    register, list, refresh, bar, setSort, getSort, sortName: (scope, section, v) => sortName(S(scope), section, v), invalidate, clearFilters, restoreState, searchHTML,
    query: scope => S(scope).query, _search: search,
    rank: (e, i) => e._sfRank || i + 1,           // a title's place in its ranked list (search or not)
    openSort, closeSort, openFilter, closeFilter, typeFilter,
    picks, only, TYPES, typeChoice, typeIs, typeMovies, typeShows, typeCat, typeLabel,
    typeFilterButton: (onclick, label, active) => buttonHTML('filter', label, active, onclick, 'Filter'),
    filterCount: (scope, section) => filterCount(getFilter(scope, section)),
    filterState: (scope, section) => getFilter(scope, section),
    isMovie, GENRES,
    dd: ddHTML, ddSearch, _ddFilter, closeDD: closeAllDD,              // the filter dropdown, for other popups (Challenges genre)
    // internal — used by the popup markup's inline handlers
    _stageSort, _stageDefault, _stageGenre, _stageChoice, _stageChoiceToggle, _stageRanges,
    _openPersonDD, _personInput, _pickPerson, _toggleDD,
    _typeStage: typeStage, _typeClear: typeClear, _typeApply: typeApply, _treeStage: treeStage, _treeOpen: treeOpen,
  };
})();