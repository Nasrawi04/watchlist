/* ═══════════════════════════════════════════════════════════════
   browse.js — Browse on Discover (MSSBrowse)

   Letterboxd-style "browse by": pick a Type, Year, Genre, Country,
   Watch in, Service and Sort, press Browse, and the matching titles (TMDB
   discover) replace the Discover rows until you go back.
     • up to 100 titles, 20 at a time ("Show more")
     • "All types" mixes movies and shows in the chosen order
     • Type follows the site's split: Movies / TV Shows leave out
       animation, Anime = Japanese animation, Cartoons = the rest
     • Service = in cinemas now / coming soon (movies), or any streaming
       service JustWatch lists (via TMDB) for the "Watch in" country —
       left on "Choose a country", it's your own (first in its list)
     • the choice is kept in the address (?type=…&year=…), so Back and
       shared links open the same results; what was loaded and the
       scroll position come back from this session

     MSSBrowse.init(panelEl, resultsEl)   draws the panel; restores a browse
   Requires config.js, nav.js, discover-categories.js (_discNormalize,
   _discClickAttr, _discFloorScore, _discIsAnimeOrigin, _discFetchJSON).
═══════════════════════════════════════════════════════════════ */

const MSSBrowse = (() => {
  const PAGE = 20, CAP = 100, STATE = 'mss_browse_state';
  const PROV_STORE = 'mss_browse_prov_v2', PROV_TTL = 7 * 864e5;
  const KEYS = ['type', 'year', 'genre', 'country', 'region', 'service', 'sort'];
  const esc = s => escHTML(s == null ? '' : String(s));
  const NOW = new Date().getFullYear();
  const today = () => new Date().toISOString().slice(0, 10);

  // Site genre → [movie genre id, TV genre id] (TMDB keeps two lists)
  const GENRES = {
    Action: [28, 10759], Adventure: [12, 10759], Comedy: [35, 35], Crime: [80, 80], Documentary: [99, 99],
    Drama: [18, 18], Family: [10751, 10751], Fantasy: [14, 10765], History: [36, null], Horror: [27, null],
    Music: [10402, null], Mystery: [9648, 9648], Romance: [10749, null], 'Science Fiction': [878, 10765],
    Thriller: [53, null], War: [10752, 10768], Western: [37, 37],
  };
  const COUNTRIES = ['US', 'GB', 'CA', 'AU', 'IE', 'FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'BE', 'SE', 'DK', 'NO', 'FI', 'PL', 'HR',
    'TR', 'RU', 'JP', 'KR', 'CN', 'HK', 'TW', 'TH', 'IN', 'IR', 'EG', 'AE', 'SA', 'NG', 'ZA', 'MX', 'BR', 'AR', 'CO'];
  const TYPES = [['', 'All types'], ['movie', 'Movies'], ['tv', 'TV Shows'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const SORTS = [['', 'Most popular'], ['rating', 'Highest rated'], ['newest', 'Newest first'], ['oldest', 'Oldest first']];
  // Where you watch (services + cinemas): the "Watch in" pick, else your own country.
  // Your own = what the device says (time zone / language) — not a country picked
  // on a title's Where to watch, which may be somewhere you were just checking.
  const HOME = (() => {
    const g = MSSRegion.guess(); let picked = null;
    try { picked = localStorage.getItem(MSSRegion.KEY); } catch {}
    return picked && g[0] === picked && g.length > 1 ? g[1] : g[0];
  })();
  const region = () => P.region?.value || q.region || HOME;
  const placeName = c => { try { return new Intl.DisplayNames([MSSI18n.locale.split('-u-')[0], 'en'], { type: 'region' }).of(c) || c; } catch { return c; } };

  function yearOptions() {
    const o = [['', 'Any year'], ['upcoming', 'Upcoming']];
    for (let y = NOW; y >= 2015; y--) o.push([String(y), String(y)]);
    for (let d = 2010; d >= 1930; d -= 10) o.push([d + 's', d + 's', Array.from({ length: 10 }, (_, i) => String(d + i))]);   // typing 2005 finds the 2000s
    o.push(['older', 'Before 1930']);
    return o;
  }
  function yearRange(v) {
    if (!v) return null;
    if (v === 'upcoming') { const t = new Date(Date.now() + 864e5).toISOString().slice(0, 10); return [t, null]; }
    if (v === 'older') return [null, '1929-12-31'];
    const m = v.match(/^(\d{4})(s?)$/); if (!m) return null;
    const a = +m[1], b = m[2] ? a + 9 : a;
    return [`${a}-01-01`, `${b}-12-31`];
  }

  let panel = null, out = null, providers = null, S = null, seq = 0;
  const q = {};          // the current choice (what the dropdowns show)

  /* ── Panel ── each choice is the site's type-to-search dropdown (MSSPicker) */
  const P = {};          // the dropdowns, by key
  const SEARCH = { type: 'Type to search…', year: 'Type a year…', genre: 'Type a genre…', country: 'Type a country…', region: 'Type a country…', service: 'Type a service…', sort: 'Type to search…' };
  function fieldHTML(key, label) {
    return `<div class="brw-field"><div class="field-label" id="brw-${key}-l" aria-hidden="true">${esc(label)}</div><div id="brw-${key}-w"></div></div>`;
  }
  // options: [value, label, extra search words?] — or groups: [{ label, options }]
  function mountField(key, label, options, onChange, placeholder) {
    const groups = options[0]?.options ? options : [{ options }];
    P[key] = MSSPicker.mount(document.getElementById(`brw-${key}-w`), { id: 'brw-' + key, label, value: P[key]?.value ?? q[key] ?? '',
      groups: groups.map(g => ({ label: g.label, items: g.options.map(([value, l, keys]) => ({ value, label: l, keys })) })), search: SEARCH[key], onChange, placeholder });
  }
  // Cinemas (movies only), then every streaming service JustWatch lists for that country
  const CINEMA = { cinema: 'Now in cinemas', cinema_soon: 'Coming to cinemas' };
  function serviceOptions() {
    const stream = (providers || []).map(p => [String(p.id), p.name, /\bmax\b/i.test(p.name) ? ['HBO', 'Max'] : []]);
    return [{ options: [['', 'Any service']] },
      { label: 'Cinemas', options: Object.entries(CINEMA).map(([v, l]) => [v, l, ['cinema', 'theater', 'theatre']]) },
      { label: `Streaming in ${placeName(region())}`, options: stream.length ? stream : [] }].filter(g => g.options.length);
  }
  function regionOptions() {
    const rest = COUNTRIES.filter(c => c !== HOME).map(c => [c, placeName(c), [c]]).sort((a, b) => a[1].localeCompare(b[1]));
    return [{ label: 'Your country', options: [[HOME, placeName(HOME), [HOME]]] }, { label: 'All countries', options: rest }];
  }
  // Another country: load its services
  function onRegion() {
    providers = null;
    loadProviders().then(() => {
      const v = P.service?.value;
      if (v && !CINEMA[v] && !providers.some(x => String(x.id) === v)) P.service.value = '';   // not offered there
      mountField('service', 'Service', serviceOptions());
    });
  }
  const LABELS = { type: 'Type', year: 'Year', genre: 'Genre', country: 'Country', region: 'Watch in', service: 'Service', sort: 'Sort by' };
  function drawPanel() {
    KEYS.forEach(k => { delete P[k]; });
    const countries = COUNTRIES.map(c => [c, placeName(c), [c]]).sort((a, b) => a[1].localeCompare(b[1]));
    panel.innerHTML = `
      <div class="brw-head"><div class="section-eyebrow">Browse</div><div class="section-title">Find something to watch</div></div>
      <div class="brw-fields">
        ${KEYS.map(k => fieldHTML(k, LABELS[k])).join('')}
        <div class="brw-actions">
          <span class="brw-filter" id="brwFilterBtn">${filterBtn()}</span>
          <button type="button" class="sf-clear-btn" onclick="MSSBrowse.reset()">Reset</button>
          <button type="button" class="sf-apply-btn" onclick="MSSBrowse.go()">${icon('search', 14)} Browse</button>
        </div>
      </div>`;
    mountField('type', 'Type', TYPES);
    mountField('year', 'Year', yearOptions());
    mountField('genre', 'Genre', [['', 'Any genre'], ...Object.keys(GENRES).map(g => [g, g, g === 'Science Fiction' ? ['Sci-Fi', 'SciFi'] : []])]);
    mountField('country', 'Country', [['', 'Any country'], ...countries]);
    mountField('region', 'Watch in', regionOptions(), onRegion, 'Choose a country');
    mountField('service', 'Service', serviceOptions());
    mountField('sort', 'Sort by', SORTS);
  }
  function readPanel() { KEYS.forEach(k => { q[k] = P[k]?.value || ''; }); }

  // Streaming services in that country, most-used first — all of them, the
  // search box finds the one you want (kept a week on the device, per country)
  async function loadProviders() {
    const r = region();
    let all = {};
    try { all = JSON.parse(localStorage.getItem(PROV_STORE) || '{}'); } catch {}
    if (all[r] && Date.now() - all[r].t < PROV_TTL) { providers = all[r].p; return; }
    try {
      const url = t => `${TMDB_BASE}/watch/providers/${t}?language=en-US&watch_region=${r}`;
      const [m, t] = await Promise.all([_discFetchJSON(url('movie')), _discFetchJSON(url('tv'))]);
      const seen = new Map();
      [...(m.results || []), ...(t.results || [])].forEach(p => {
        const prio = p.display_priorities?.[r] ?? p.display_priority ?? 99;
        const had = seen.get(p.provider_id);
        if (!had || prio < had.prio) seen.set(p.provider_id, { id: p.provider_id, name: p.provider_name, prio });
      });
      providers = [...seen.values()].sort((a, b) => a.prio - b.prio || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name }));
      all[r] = { t: Date.now(), p: providers };
      try { localStorage.setItem(PROV_STORE, JSON.stringify(all)); } catch {}
    } catch (e) { console.warn('Browse services:', e); providers = []; }
  }

  /* ── Filters: the site's Filter popup (sort-filter.js, scope 'brw') ──
     TMDB Score and a movie's Runtime are asked of TMDB; a show's Seasons /
     Episodes aren't something TMDB can search by, so each show's details are
     looked up (once) and checked here, like "Hide what's in my library".
     Set only movie or only show lengths and the other kind is left out.
     Apply re-runs the results when they're showing. */
  SF.register('brw', {
    base: () => [],
    render: () => { document.getElementById('brwFilterBtn').innerHTML = filterBtn(); if (S) go(); },
    filters: () => ['score', 'length'],
    choiceFilters: () => [{ key: 'hide', label: 'Your Library', options: [['', 'Show everything'], ['watched', 'Hide what’s in my library']] }],
    scoreLabel: 'TMDB Score',
    lengthKind: () => ({ movie: 'movie', tv: 'show' })[P.type?.value] || 'mixed',
  });
  const F = () => SF.filterState('brw', 'all');
  const FKEYS = { smin: 'scoreMin', smax: 'scoreMax', lmin: 'lengthMin', lmax: 'lengthMax', snmin: 'seasonsMin', snmax: 'seasonsMax',
    emin: 'epsMin', emax: 'epsMax', hide: 'hide' };   // address ↔ filter
  const lengths = f => ({ movies: !!(f.lengthMin || f.lengthMax), shows: !!(f.seasonsMin || f.seasonsMax || f.epsMin || f.epsMax) });
  // A show's seasons + episodes (TMDB details, kept for this visit)
  const showSize = new Map();
  async function sizeOf(id) {
    if (!showSize.has(id)) showSize.set(id, _discFetchJSON(`${TMDB_BASE}/tv/${id}?language=en-US`)
      .then(d => ({ s: d.number_of_seasons || 0, e: d.number_of_episodes || 0 })).catch(() => null));
    return showSize.get(id);
  }
  function filterBtn() {
    const n = SF.filterCount('brw', 'all');
    return SF.typeFilterButton("SF.openFilter('brw','all')", n ? `Filter (${n})` : 'Filter', n > 0);
  }
  // What's in your library (tmdb type:id), loaded once when "Hide" is on
  let lib = null;
  async function libraryKeys() {
    if (lib) return lib;
    const user = await getCurrentUser();
    lib = new Set(user ? (await getEntries(user.id)).filter(e => e.tmdb_id).map(e => `${e.tmdb_type}:${e.tmdb_id}`) : []);
    return lib;
  }

  /* ── Results ── */
  function sources() {
    const g = q.genre ? GENRES[q.genre] : null, yr = yearRange(q.year), r = region();
    const kinds = { '': [['movie'], ['tv']], movie: [['movie', 'no-anim']], tv: [['tv', 'no-anim']],
      anime: [['movie', 'anime'], ['tv', 'anime']], cartoons: [['movie', 'cartoon'], ['tv', 'cartoon']] }[q.type || ''];
    const cinema = q.service === 'cinema' || q.service === 'cinema_soon', len = lengths(F());
    return kinds.map(([t, kind]) => {
      if (cinema && t !== 'movie') return null;                      // cinemas show movies
      if (t === 'movie' ? len.shows && !len.movies : len.movies && !len.shows) return null;   // only one kind's length set
      const gid = g ? g[t === 'movie' ? 0 : 1] : null;
      if (g && !gid) return null;                                   // e.g. Horror has no TV genre on TMDB
      const p = new URLSearchParams({ language: 'en-US', include_adult: 'false' });
      const genres = [gid, kind === 'anime' || kind === 'cartoon' ? 16 : null].filter(Boolean);
      if (genres.length) p.set('with_genres', genres.join(','));
      if (kind === 'no-anim') p.set('without_genres', '16');
      if (kind === 'anime') p.set('with_original_language', 'ja');
      if (q.country) p.set('with_origin_country', q.country);
      if (cinema) {                                                   // cinema release dates in that country (TMDB: 2 = limited, 3 = wide)
        const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
        p.set('region', r); p.set('with_release_type', '2|3');
        p.set('release_date.gte', q.service === 'cinema' ? day(-42) : day(1));
        p.set('release_date.lte', q.service === 'cinema' ? day(0) : day(90));
      } else if (q.service) { p.set('with_watch_providers', q.service); p.set('watch_region', r); p.set('with_watch_monetization_types', 'flatrate|free|ads'); }
      const d = t === 'movie' ? 'primary_release_date' : 'first_air_date';
      if (yr?.[0]) p.set(`${d}.gte`, yr[0]);
      if (yr?.[1]) p.set(`${d}.lte`, yr[1]);
      if ((q.sort === 'newest' || q.sort === 'oldest') && q.year !== 'upcoming' && !(yr?.[1] && yr[1] < today())) p.set(`${d}.lte`, today());
      p.set('sort_by', q.sort === 'rating' ? 'vote_average.desc' : q.sort === 'newest' ? `${d}.desc` : q.sort === 'oldest' ? `${d}.asc` : 'popularity.desc');
      if (q.sort === 'rating') p.set('vote_count.gte', t === 'movie' ? '100' : '50');
      if (q.sort === 'oldest') p.set('vote_count.gte', '5');                // skips empty placeholder entries
      const f = F();
      if (f.scoreMin) { p.set('vote_average.gte', f.scoreMin); if (!p.has('vote_count.gte')) p.set('vote_count.gte', '20'); }   // a real score, not 3 votes
      if (f.scoreMax) p.set('vote_average.lte', f.scoreMax);
      if (t === 'movie' && f.lengthMin) p.set('with_runtime.gte', f.lengthMin);
      if (t === 'movie' && f.lengthMax) p.set('with_runtime.lte', f.lengthMax);
      return { t, kind, url: `${TMDB_BASE}/discover/${t}?${p}`, page: 0, pages: 1, total: 0, buf: [], done: false };
    }).filter(Boolean);
  }
  const better = {
    '': (a, b) => b.pop - a.pop,
    rating: (a, b) => (b.score ?? 0) - (a.score ?? 0),
    newest: (a, b) => (b.date || '').localeCompare(a.date || ''),
    oldest: (a, b) => (a.date || '9999').localeCompare(b.date || '9999'),
  };
  async function fetchPage(src) {
    src.page++;
    const d = await _discFetchJSON(`${src.url}&page=${src.page}`);
    src.pages = Math.min(d.total_pages || 0, 500); src.total = d.total_results || 0;
    if (src.page >= src.pages) src.done = true;
    src.buf = (d.results || []).map(r => Object.assign(_discNormalize(r, src.t), {
      pop: r.popularity || 0, date: (src.t === 'movie' ? r.release_date : r.first_air_date) || '' }))
      .filter(it => src.kind !== 'cartoon' || !_discIsAnimeOrigin(it))
      .filter(it => !S.hide || !lib?.has(`${it.media_type}:${it.id}`));
    const f = F();
    if (src.t === 'tv' && lengths(f).shows) {                        // seasons / episodes: checked one show at a time
      const inR = (v, lo, hi) => (!lo || v >= Number(lo)) && (!hi || v <= Number(hi));
      const sizes = await Promise.all(src.buf.map(it => sizeOf(it.id)));
      src.buf = src.buf.filter((it, i) => sizes[i] && inR(sizes[i].s, f.seasonsMin, f.seasonsMax) && inR(sizes[i].e, f.epsMin, f.epsMax));
    }
  }
  // Takes the next 20 in order, pulling pages from each source as needed
  async function more() {
    const target = Math.min(S.items.length + PAGE, CAP);
    while (S.items.length < target) {
      for (const s of S.src) { let n = 0; while (!s.buf.length && !s.done && n++ < 5) await fetchPage(s); }
      const ready = S.src.filter(s => s.buf.length);
      if (!ready.length) break;
      const cmp = better[q.sort || ''];
      const best = ready.reduce((a, b) => cmp(a.buf[0], b.buf[0]) <= 0 ? a : b);
      const it = best.buf.shift();
      if (!S.items.some(x => x.id === it.id && x.media_type === it.media_type)) S.items.push(it);
    }
    S.end = S.items.length >= CAP || S.src.every(s => s.done && !s.buf.length);
  }
  // TMDB's total is exact unless titles are dropped here (library / seasons / episodes) — then it's "N+"
  const fuzzy = () => !S.end && (S.hide || lengths(F()).shows);
  const totalOf = () => S.end || fuzzy() ? S.items.length : Math.min(CAP, Math.max(S.items.length, S.src.reduce((a, s) => a + s.total, 0)));

  function summary() {
    const parts = [];
    parts.push(TYPES.find(t => t[0] === (q.type || ''))[1].replace('All types', 'Everything'));
    if (q.genre) parts.push(q.genre);
    if (q.year) parts.push(yearOptions().find(y => y[0] === q.year)?.[1] || q.year);
    if (q.country) parts.push(`from ${placeName(q.country)}`);
    if (CINEMA[q.service]) parts.push(`${CINEMA[q.service].toLowerCase().replace('now in', 'in')} in ${placeName(region())}`);
    else if (q.service) parts.push(`on ${providers?.find(p => String(p.id) === q.service)?.name || 'your service'} in ${placeName(region())}`);
    const f = F(), rng = (a, b, u) => a && b ? `${a}–${b}${u}` : a ? `${a}+${u}` : `up to ${b}${u}`;
    if (f.scoreMin || f.scoreMax) parts.push(`★ ${rng(f.scoreMin, f.scoreMax, '')}`);
    if (f.lengthMin || f.lengthMax) parts.push(rng(f.lengthMin, f.lengthMax, ' min'));
    if (f.seasonsMin || f.seasonsMax) parts.push(rng(f.seasonsMin, f.seasonsMax, ' seasons'));
    if (f.epsMin || f.epsMax) parts.push(rng(f.epsMin, f.epsMax, ' episodes'));
    if (f.choice?.hide) parts.push('not in your library');
    return parts.join(' · ');
  }
  function card(it) {
    return MSSCard.poster({ attrs: _discClickAttr(it), title: it.title, year: it.year, poster: it.poster_url,
      type: q.type === 'movie' || q.type === 'tv' ? null : it.media_type, score: _discFloorScore(it.score) });
  }
  function headHTML(loading) {
    const n = S.items.length ? totalOf() : 0;
    return `<div class="inline-search-head"><div class="section-eyebrow">Browse</div>
        <div class="section-title" style="margin-bottom:0">${esc(summary())}</div>
        ${loading ? '' : `<div class="inline-search-count"><b>${n}${fuzzy() ? '+' : ''}</b> ${n === 1 ? 'title' : 'titles'}</div>`}
        <button type="button" class="brw-back" onclick="MSSBrowse.close()">${icon('back', 14)} Back to Discover</button></div>`;
  }
  function moreHTML() {
    if (S.end) return '';
    const left = Math.max(0, totalOf() - S.items.length);
    return `<div class="eg-more"><button type="button" class="dp-more" id="brwMore" onclick="MSSBrowse.more()">Show more${left ? ` <span>(${left} left)</span>` : ''}</button></div>`;
  }
  function drawResults() {
    out.innerHTML = headHTML() + (S.items.length
      ? `<div class="inline-search-grid" id="brwGrid">${S.items.map(card).join('')}</div>${moreHTML()}`
      : `<div class="mss-empty">Nothing matches all of these. Try fewer choices.</div>`);
  }
  function show(on) {
    document.body.classList.toggle('disc-browsing', on);
    out.hidden = !on;
  }
  function save() {
    try { sessionStorage.setItem(STATE, JSON.stringify({ t: Date.now(), key: location.search, S })); } catch {}
  }
  function syncURL() {
    const p = new URLSearchParams();
    KEYS.forEach(k => { if (q[k] && (k !== 'region' || q.service)) p.set(k, q[k]); });   // the country only matters with a service
    const f = F();
    Object.entries(FKEYS).forEach(([u, k]) => { const v = k === 'hide' ? f.choice?.hide : f[k]; if (v) p.set(u, v); });
    const s = [...p].length ? '?browse=1&' + p : '';
    history.replaceState(history.state, '', location.pathname + s);
  }

  async function go() {
    readPanel(); syncURL();
    const my = ++seq;
    S = { src: sources(), items: [], end: false };
    show(true);
    out.innerHTML = headHTML(true) + `<div class="page-loading" style="padding:2rem"><div class="spinner"></div></div>`;
    out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    try {
      S.hide = !!F().choice?.hide;
      if (S.hide) await libraryKeys();
      await more();
    }
    catch (e) {
      if (my !== seq) return;
      console.error('Browse:', e);
      out.innerHTML = headHTML() + `<div class="mss-empty">${isRateLimitError(e) ? 'TMDB is busy right now — try again in a moment.' : "Couldn't load these right now — try again shortly."}</div>`;
      return;
    }
    if (my !== seq) return;
    drawResults(); save();
  }
  async function loadMore() {
    if (S.hide) await libraryKeys().catch(() => {});
    const btn = document.getElementById('brwMore'), from = S.items.length, my = seq;
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try { await more(); } catch (e) { console.error('Browse:', e); if (isRateLimitError(e)) showToast('TMDB is busy right now — try again in a moment.', 'err'); }
    if (my !== seq) return;
    const grid = document.getElementById('brwGrid');
    grid.insertAdjacentHTML('beforeend', S.items.slice(from).map(card).join(''));
    out.querySelector('.inline-search-head').outerHTML = headHTML();
    out.querySelector('.eg-more')?.remove();
    grid.insertAdjacentHTML('afterend', moreHTML());
    grid.children[from]?.focus({ preventScroll: true });           // keyboard users carry on from the first new title
    save();
  }
  function close() {
    ++seq; S = null; show(false); out.innerHTML = '';
    history.replaceState(history.state, '', location.pathname);
    try { sessionStorage.removeItem(STATE); } catch {}
    panel.scrollIntoView({ block: 'start' });
  }
  function reset() {
    KEYS.forEach(k => { q[k] = ''; });
    SF.clearFilters('brw', 'all');
    drawPanel();
    if (S) close();
  }

  function init(panelEl, resultsEl) {
    panel = panelEl; out = resultsEl;
    const p = new URLSearchParams(location.search);
    if (p.get('browse')) {
      KEYS.forEach(k => { q[k] = p.get(k) || ''; });
      const f = { genres: [], choice: { hide: p.get('hide') || '' } };
      Object.entries(FKEYS).forEach(([u, k]) => { if (k !== 'hide') f[k] = p.get(u) || ''; });
      SF.restoreState('brw', 'all', { filter: f });
    }
    drawPanel();
    loadProviders().then(() => {
      if (P.service && !P.service.el.classList.contains('open')) mountField('service', 'Service', serviceOptions());
      if (S && q.service) out.querySelector('.inline-search-head .section-title').textContent = summary();
    });
    if (!p.get('browse')) return;
    // Coming back: what was loaded is drawn straight away (so the scroll can return)
    try {
      const st = JSON.parse(sessionStorage.getItem(STATE) || 'null');
      if (st && st.key === location.search && Date.now() - st.t < 30 * 60 * 1000 && st.S?.items?.length) {
        S = st.S; show(true); drawResults(); return;
      }
    } catch {}
    go();
  }

  return { init, go, more: loadMore, close, reset };
})();
