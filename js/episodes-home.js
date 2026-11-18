/* ═══════════════════════════════════════════════════════════════
   episodes-home.js — the Episodes overview (MSSEpHome)

   One design for every place that lists someone's episode ratings:
     • episodes.html               your Episodes page (plus search, in the page's header)
     • episodes.html?left=1        every show still waiting for a score ("See all")
     • profile.html / profile-view.html   the Episodes tab (yours, or someone else's — read-only; no Shows to rate)

   MSSEpHome.mount(el, { userId, owner, name, page })   the summary, rated shows, best episodes,
       how you score, what's left to rate. page: the Episodes page itself (its own header + search).
   MSSEpHome.mountLeft(el, { userId })                   the See all list (20 + Read more)
   MSSEpHome.search(el, query)                           search results: shows you've watched / haven't
   Rows open the show's page (episodes.html?show=…, &user=… for someone else) — no popup.
   Requires config.js, db.js, nav.js, sort-filter.js, episode-ratings.js.
═══════════════════════════════════════════════════════════════ */
const MSSEpHome = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const PAGE = 20;
  const LEFT_STATUSES = ['watching', 'paused', 'ongoing', 'completed'];          // shows to rate: started or finished
  const STARTED = ['watching', 'paused', 'ongoing', 'completed', 'dropped'];      // search: "Shows you've watched"
  const band = v => MSSEp.band(v).key;
  const sc = v => Number(v) >= 10 ? '10' : mssR1(Number(v));                // 10, 9.8
  const se = r => `S${r.season_number} E${r.episode_number}`;
  const H = { o: null, rated: [], left: [], eps: [], byTmdb: {}, shown: { rated: PAGE, left: PAGE }, names: {} };

  /* ── data ── */
  // Episodes per season: the entry's saved breakdown (filled from TMDB when the show was added / refreshed)
  const sizesOf = e => Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number).filter(n => n > 0) : [];
  const totalOf = e => sizesOf(e).reduce((a, b) => a + b, 0) || Number(e.total_eps) || 0;
  // a show's own numbers, kept on the entry for sorting and filtering (SF)
  function stats(e, rows) {
    const eps = rows.filter(r => r.episode_number > 0).sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
    const total = totalOf(e), n = eps.length;
    const avg = n ? eps.reduce((x, r) => x + Number(r.score), 0) / n : null;
    const best = n ? MSSEp.extremes(eps, r => r.score).hi[0] : null;
    const latest = rows.length ? Math.max(...rows.map(r => +new Date(r.updated_at))) : 0;
    return { eps, n, total, left: Math.max(0, total - n), avg, best, latest };
  }
  async function load(o) {
    const own = o.owner;
    const { data: rs, error } = await sb.from('episode_ratings').select('entry_id,season_number,episode_number,score,updated_at').eq('user_id', o.userId);
    if (error) throw error;
    const by = {};
    (rs || []).forEach(r => (by[r.entry_id] = by[r.entry_id] || []).push(r));
    let es;
    if (own) ({ data: es } = await sb.from('entries').select('*').eq('user_id', o.userId).eq('tmdb_type', 'tv').not('tmdb_id', 'is', null));
    else {
      const ids = Object.keys(by);
      ({ data: es } = ids.length ? await sb.from('entries').select('*').in('id', ids.slice(0, 1000)) : { data: [] });
    }
    const shows = (es || []).filter(e => e.tmdb_id && MSSEp.isShow(e));
    shows.forEach(e => { e._ep = stats(e, by[e.id] || []); });
    H.rated = shows.filter(e => by[e.id]);
    // Shows to rate: the Episodes page and its See all only (not the profile tabs — owner)
    H.left = own && (o.page || o.leftOnly) ? shows.filter(e => !by[e.id] && LEFT_STATUSES.includes(e.status)) : [];
    H.byTmdb = Object.fromEntries(shows.map(e => [e.tmdb_id, e]));
    H.eps = H.rated.flatMap(e => e._ep.eps.map(r => ({ ...r, e })));
  }

  /* ── Sort & Filter (the shared SF panels): the rated shows, and the shows left to rate ── */
  // two scopes, so each list keeps its own default order: 'eph' (rated shows), 'ephL' (shows to rate)
  const scopeOf = section => section === 'left' ? 'ephL' : 'eph';
  function register() {
    const own = H.o.owner, st = [['', 'All'], ['watching', 'Watching'], ['paused', 'Taking a Break'], ['ongoing', 'To Be Continued'], ['completed', 'Watched'], ['dropped', 'Dropped'], ['up_next', 'Up Next'], ['queue', 'Watchlist']];
    const common = list => ({
      base: () => list,
      render: (section, rows) => drawList(section, rows),
      choiceFilters: () => {
        const have = new Set(list.map(e => e.status));
        return [{ key: 'status', label: 'Status', options: st.filter(([k]) => !k || have.has(k)) },
          { key: 'cat', label: 'Type', options: [['', 'All Types'], ['tv', 'TV Shows'], ['anime', 'Anime'], ['cartoons', 'Cartoons']] }];
      },
      addedDate: e => e.created_at,
    });
    SF.register('eph', { ...common(H.rated),
      sorts: () => ['recent', 'avg', 'toRate', 'alpha', 'release'],
      presets: {
        recent: { header: 'Recently rated', opts: [['epRecent', 'Newest'], ['epOldest', 'Oldest']] },
        avg:    { header: own ? 'Your average' : 'Their average', opts: [['epHigh', 'Highest'], ['epLow', 'Lowest']] },
        toRate: { header: 'Episodes to go', opts: [['epMost', 'Most'], ['epFewest', 'Fewest']] },
      },
      compare: {
        epRecent: (a, b) => b._ep.latest - a._ep.latest, epOldest: (a, b) => a._ep.latest - b._ep.latest,
        epHigh: (a, b) => (b._ep.avg ?? -1) - (a._ep.avg ?? -1) || b._ep.n - a._ep.n, epLow: (a, b) => (a._ep.avg ?? 99) - (b._ep.avg ?? 99) || b._ep.n - a._ep.n,
        epMost: (a, b) => b._ep.left - a._ep.left, epFewest: (a, b) => a._ep.left - b._ep.left,
      },
      defaultSort: 'epRecent', sortState: sortRated,
      filters: () => ['genre', 'year', 'score'],
      scoreOf: e => e._ep?.avg ?? null, scoreLabel: own ? 'Your episode average' : 'Their episode average',
    });
    SF.register('ephL', { ...common(H.left), sorts: () => ['alpha', 'added', 'release'], defaultSort: 'newest', sortState: sortLeft, filters: () => ['genre', 'year'] });
  }
  const sortRated = {}, sortLeft = {};

  /* ── pieces ── */
  const showHref = e => `episodes.html?show=${encodeURIComponent(e.tmdb_id)}${H.o.owner ? '' : '&user=' + encodeURIComponent(H.o.userId)}`;
  const posterOf = e => safeURL(mssSharpPoster(e.poster_url));
  function pillHTML(status) {
    if (!status) return '';
    const k = status === 'watching' ? ' is-on' : status === 'ongoing' ? ' is-wait' : '';
    return `<span class="egh-pill${k}">${esc(MSSEp.statusLabel(status))}</span>`;
  }
  // one square per episode, in order, in your score's band colour (grey = not rated yet)
  function stripHTML(e) {
    const x = e._ep, sizes = sizesOf(e), at = {};
    x.eps.forEach(r => { at[`${r.season_number}:${r.episode_number}`] = r; });
    let cells = [];
    if (sizes.length) sizes.forEach((size, i) => { for (let n = 1; n <= size; n++) { const r = at[`${i + 1}:${n}`]; cells.push(r ? Number(r.score) : null); } });
    // episodes rated beyond the saved breakdown (a newer season), then — no breakdown — the rest as grey
    const inGrid = new Set(cells.length ? x.eps.filter(r => r.season_number <= sizes.length && r.episode_number <= sizes[r.season_number - 1]).map(r => `${r.season_number}:${r.episode_number}`) : []);
    x.eps.forEach(r => { if (!inGrid.has(`${r.season_number}:${r.episode_number}`)) cells.push(Number(r.score)); });
    if (!sizes.length && x.total > cells.length) cells = cells.concat(Array(x.total - cells.length).fill(null));
    cells = cells.slice(0, 400);
    return `<span class="egh-strip" role="img" aria-label="${x.n} of ${x.total || x.n} episodes rated">${cells.map(v => v == null ? '<i></i>' : `<i class="ep-band-${band(v)}"></i>`).join('')}</span>`;
  }
  function rowHTML(e) {
    const x = e._ep, p = posterOf(e);
    const done = x.total && x.n >= x.total;
    const sub = [x.total ? `${x.n} of ${x.total} rated` : `${x.n} rated`, x.total ? (done ? 'complete' : `${x.left} to go`) : '',
      x.best ? `best ${esc(se(x.best).replace(' ', ''))} (${sc(x.best.score)})` : ''].filter(Boolean).join(' · ');
    return `<a class="egh-row" href="${showHref(e)}">
      <span class="egh-poster">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : ''}</span>
      <span class="egh-main">
        <span class="egh-line"><b class="egh-title" translate="no">${esc(e.title)}</b>${pillHTML(e.status)}</span>
        <span class="egh-sub">${sub}</span>
        ${x.total || x.n ? stripHTML(e) : ''}
      </span>
      ${x.avg != null ? `<span class="egh-avg ep-band-${band(x.avg)}" title="${H.o.owner ? 'Your' : 'Their'} average">${mssR1(x.avg)}</span>` : ''}
      <span class="egh-go" aria-hidden="true">${icon('chevright', 18)}</span>
    </a>`;
  }
  const moreHTML = (section, left) => left > 0 ? `<div class="egh-more"><button type="button" class="dp-more" onclick="MSSEpHome._more('${section}')">Read more <span>(${left} left)</span></button></div>` : '';
  function drawList(section, list) {
    const box = document.getElementById(section === 'left' ? 'ephLeftList' : 'ephRated');
    if (!box) return;
    if (section === 'rated' && H.o.leftOnly) return;
    const shown = H.shown[section];
    box.innerHTML = list.length
      ? `<div class="egh-rows">${list.slice(0, shown).map(rowHTML).join('')}</div>${moreHTML(section, list.length - shown)}`
      : mssEmpty({ compact: true, art: 'search', title: 'Nothing matches', text: 'Try another filter, or clear them.' });
    const n = document.getElementById(section === 'left' ? 'ephLeftN' : 'ephRatedN');
    if (n) n.textContent = list.length === (section === 'left' ? H.left : H.rated).length ? list.length : `${list.length} of ${(section === 'left' ? H.left : H.rated).length}`;
  }
  function more(section) { H.shown[section] += PAGE; SF.refresh(scopeOf(section), section); }

  // The five numbers (episodes rated · shows · average · perfect 10s · last rated)
  function summaryHTML() {
    const eps = H.eps, avg = eps.length ? eps.reduce((x, r) => x + Number(r.score), 0) / eps.length : null;
    const tens = eps.filter(r => Number(r.score) >= 10).length;
    const last = eps.length ? eps.reduce((a, b) => (new Date(b.updated_at) > new Date(a.updated_at) ? b : a)) : null;
    const cell = (v, l, cls = '') => `<div class="egh-sum-c${cls}"><b>${v}</b><span>${l}</span></div>`;
    return `<section class="egh-sum" aria-label="Summary">
      ${cell(eps.length, 'Episodes rated')}${cell(H.rated.length, 'Shows')}
      ${cell(avg != null ? avg.toFixed(2) : '—', H.o.owner ? 'Your average' : 'Their average', avg != null ? ' is-avg' + mssTierCls(avg) : '')}
      ${cell(tens, 'Perfect 10s')}
      ${last ? `<a class="egh-sum-c is-last" href="${showHref(last.e)}&s=${last.season_number}&e=${last.episode_number}">
          <b class="egh-name" data-ep="${last.e.tmdb_id}:${last.season_number}:${last.episode_number}" translate="no">${esc(last.e.title)} ${se(last)}</b>
          <span>Last rated · <span translate="no">${esc(last.e.title)}</span> · ${se(last)}</span></a>` : cell('—', 'Last rated')}
    </section>`;
  }
  // the best rated episodes, best first (ties: the most recently rated first)
  const bestList = () => H.eps.slice().sort((a, b) => Number(b.score) - Number(a.score) || new Date(b.updated_at) - new Date(a.updated_at));
  function epRowHTML(r, i) {
    const href = `${showHref(r.e)}&s=${r.season_number}&e=${r.episode_number}`, k = `${r.e.tmdb_id}:${r.season_number}:${r.episode_number}`;
    return `<li><a class="egh-ep" href="${href}">
      <span class="egh-ep-n">${i + 1}</span>
      <span class="egh-ep-still" data-still="${k}"></span>
      <span class="egh-ep-txt"><b class="egh-name" data-ep="${k}" translate="no">Episode ${r.episode_number}</b><small><span translate="no">${esc(r.e.title)}</span> · ${se(r)}</small></span>
      <span class="egh-chip ep-band-${band(r.score)}">${sc(r.score)}</span></a></li>`;
  }
  function bestHTML() {
    const list = bestList().slice(0, 6);
    return `<section class="egh-card egh-best" aria-labelledby="ephBestH">
      <header class="egh-head"><h2 class="lg-kicker" id="ephBestH">${H.o.owner ? 'Your' : 'Their'} best episodes</h2>
        ${H.eps.length > 6 ? `<button type="button" class="egh-link" onclick="MSSEpHome._all()" aria-haspopup="dialog">All</button>` : ''}</header>
      <ol class="egh-eps">${list.map(epRowHTML).join('')}</ol></section>`;
  }
  // How you score: five ranges, the bars against the biggest, and one line of insight the data supports
  function scoreHTML() {
    const eps = H.eps, v = r => Number(r.score);
    const B = [['10', r => v(r) >= 10, 'masterpiece'], ['9 – 9.9', r => v(r) >= 9 && v(r) < 10, 'excellent'], ['8 – 8.9', r => v(r) >= 8 && v(r) < 9, 'great'],
      ['7 – 7.9', r => v(r) >= 7 && v(r) < 8, 'decent'], ['Under 7', r => v(r) < 7, 'mixed']].map(([l, t, k]) => ({ l, k, rows: eps.filter(t) }));
    const max = Math.max(1, ...B.map(b => b.rows.length));
    const top = B.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
    const where = { '10': 'are perfect 10s', '9 – 9.9': 'land between 9 and 10', '8 – 8.9': 'land between 8 and 9', '7 – 7.9': 'land between 7 and 8', 'Under 7': 'land under 7' }[top.l];
    const low = B[4].rows, shows = [...new Set(low.map(r => r.e.id))], seasons = [...new Set(low.map(r => r.e.id + ':' + r.season_number))];
    const from = !low.length ? '' : seasons.length === 1 ? `, all from <span translate="no">${esc(low[0].e.title)}</span> season ${low[0].season_number}` : shows.length === 1 ? `, all from <span translate="no">${esc(low[0].e.title)}</span>` : '';
    const lowTxt = top.l === 'Under 7' ? '' : !low.length ? ' None are under 7.' : ` ${low.length <= eps.length / 10 ? 'Only ' : ''}${low.length} ${low.length === 1 ? 'is' : 'are'} under 7${from}.`;
    const who = H.o.owner ? 'your' : 'their';
    const insight = eps.length >= 5 && top.rows.length > eps.length / 3 ? `Most of ${who} episodes ${where}.${lowTxt}` : eps.length >= 5 ? lowTxt.trim() : '';
    return `<section class="egh-card egh-score" aria-labelledby="ephScoreH">
      <header class="egh-head"><h2 class="lg-kicker" id="ephScoreH">How ${H.o.owner ? 'you score' : 'they score'} episodes</h2></header>
      <ul class="egh-bars">${B.map(b => `<li><span class="egh-bar-l">${b.l}</span><span class="egh-bar" role="img" aria-label="${b.l}: ${b.rows.length} episode${b.rows.length === 1 ? '' : 's'}"><i class="ep-band-${b.k}" style="width:${b.rows.length ? Math.max(2, Math.round(100 * b.rows.length / max)) : 0}%"></i></span><b>${b.rows.length}</b></li>`).join('')}</ul>
      ${insight ? `<p class="egh-insight">${insight}</p>` : ''}</section>`;
  }
  function leftHTML() {
    if (!H.left.length) return '';
    const list = SF.list('ephL', 'left').slice(0, 8);
    return `<section class="egh-card egh-left" aria-labelledby="ephLeftH">
      <header class="egh-head"><div><h2 class="lg-kicker" id="ephLeftH">Shows to rate</h2>
        <p class="egh-head-sub">${H.left.length} show${H.left.length === 1 ? '' : 's'} · rate a few favourite episodes to see their charts</p></div>
        <a class="egh-link" href="episodes.html?left=1">See all ${H.left.length}</a></header>
      <div class="egh-posters">${list.map(e => { const p = posterOf(e); return `<a class="egh-pos" href="${showHref(e)}">
        <span class="egh-pos-img">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : ''}</span>
        <b translate="no">${esc(e.title)}</b><small>Rate episodes <span aria-hidden="true">→</span></small></a>`; }).join('')}</div></section>`;
  }
  function ratedHTML() {
    return `<section class="egh-card egh-rated" aria-labelledby="ephRatedH">
      <header class="egh-head"><h2 class="lg-kicker" id="ephRatedH">${H.o.owner ? 'Your rated shows' : 'Rated shows'} · <span id="ephRatedN">${H.rated.length}</span></h2>${SF.bar('eph', 'rated')}</header>
      <div id="ephRated"></div></section>`;
  }

  /* ── Episode names + stills (TMDB, cached per season): filled in after the page is drawn ── */
  async function fillNames(root) {
    const need = [...new Set([...root.querySelectorAll('[data-ep], [data-still]')].map(el => (el.dataset.ep || el.dataset.still).split(':').slice(0, 2).join(':')))];
    await Promise.all(need.map(async k => {
      if (H.names[k]?.length) return;
      const [id, s] = k.split(':');
      H.names[k] = await MSSEp.seasonEpisodes(Number(id), Number(s));   // [] when TMDB didn't answer: asked again next time
    }));
    const ep = k => { const [id, s, n] = k.split(':'); return (H.names[`${id}:${s}`] || []).find(x => x.n === Number(n)); };
    root.querySelectorAll('[data-ep]').forEach(el => { const x = ep(el.dataset.ep); if (x?.name) el.textContent = x.name; });
    root.querySelectorAll('[data-still]').forEach(el => { const x = ep(el.dataset.still); if (x?.still && !el.firstChild) el.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${x.still}" alt="" loading="lazy">`; });
  }

  /* ── All rated episodes, best first: a side panel L (full page on phones), 20 + Read more ── */
  let allPanel = null, allShown = PAGE;
  const allBody = () => {
    const list = bestList();
    return `<ol class="egh-eps is-all">${list.slice(0, allShown).map(epRowHTML).join('')}</ol>${list.length > allShown ? `<div class="egh-more"><button type="button" class="dp-more" onclick="MSSEpHome._allMore()">Read more <span>(${list.length - allShown} left)</span></button></div>` : ''}`;
  };
  async function openAll() {
    await mssLoadScript('js/panel.js');
    allShown = PAGE;
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: `${H.o.owner ? 'Your' : H.o.name ? H.o.name + '’s' : 'Their'} best episodes`, subtitle: `${H.eps.length} episodes rated, best first`, body: allBody(),
      onClose: () => { if (allPanel === h) allPanel = null; } });
    allPanel = h;
    fillNames(h.body);
  }
  function allMore() {
    if (!allPanel) return;
    allShown += PAGE; allPanel.setBody(allBody()); fillNames(allPanel.body);
  }

  /* ── mount ── */
  function bodyHTML() {
    return `${summaryHTML()}
      <div class="egh-cols">
        <div class="egh-col-main">${ratedHTML()}${leftHTML()}</div>
        <div class="egh-col-side">${bestHTML()}${scoreHTML()}</div>
      </div>`;
  }
  async function mount(el, o) {
    H.o = o; H.shown = { rated: PAGE, left: PAGE };
    await load(o);
    register();
    mssSkeleton.shape('eph', { rated: Math.min(H.rated.length, PAGE) });
    if (!H.rated.length) {
      el.innerHTML = (H.left.length ? `<div class="egh-cols is-one"><div class="egh-col-main">${leftHTML()}</div></div>` : '')
        + mssEmpty({ art: 'episodes', title: 'No episodes rated yet', text: o.owner ? 'Rate episodes as you watch and the best ones rise to the top here.' : 'Not a single episode rated. Yet.',
          actions: o.owner && !o.page ? [{ label: 'Go to Episodes', href: 'episodes.html', primary: true }] : [],
          starter: o.page && !H.left.length ? { cat: 'tv', open: 'episodes', label: 'Popular shows · see their episode ratings' } : null });
      return;
    }
    el.innerHTML = bodyHTML();
    SF.refresh('eph', 'rated');
    fillNames(el);
  }
  async function mountLeft(el, o) {
    H.o = { ...o, owner: true, leftOnly: true }; H.shown = { rated: PAGE, left: PAGE };
    await load(H.o);
    register();
    const list = H.left.length ? `<section class="egh-card egh-rated" aria-labelledby="ephLeftAllH">
        <header class="egh-head"><h2 class="lg-kicker" id="ephLeftAllH">Shows to rate · <span id="ephLeftN">${H.left.length}</span></h2>${SF.bar('ephL', 'left')}</header>
        <div id="ephLeftList"></div></section>`
      : mssEmpty({ art: 'episodes', title: 'Nothing left to rate', text: 'Every show you’ve started has at least one episode rated. Nice.', actions: [{ label: 'Back to Episodes', href: 'episodes.html', primary: true }] });
    // the Episodes page's right column stays beside the list (best episodes, how you score)
    el.innerHTML = H.eps.length ? `<div class="egh-cols"><div class="egh-col-main">${list}</div><div class="egh-col-side">${bestHTML()}${scoreHTML()}</div></div>` : list;
    if (H.left.length) SF.refresh('ephL', 'left');
    fillNames(el);
  }

  /* ── Search: all of TMDB, split into shows you've watched (started, in your library) and the rest ── */
  async function search(el, q) {
    const res = await tmdbFetch(`${TMDB_BASE}/search/tv?language=en-US&query=${encodeURIComponent(q)}`);
    const results = res.ok ? ((await res.json()).results || []).filter(r => r.poster_path).slice(0, 20) : [];
    const mine = r => H.byTmdb[r.id];
    const seen = results.filter(r => STARTED.includes(mine(r)?.status)), rest = results.filter(r => !seen.includes(r));
    const tmdbRow = r => {
      const e = mine(r), v = r.vote_average ? Number(mssR1(r.vote_average)) : null;
      if (e && e._ep.n) return rowHTML(e);
      return `<a class="egh-row" href="episodes.html?show=${r.id}">
        <span class="egh-poster"><img src="https://image.tmdb.org/t/p/w185${r.poster_path}" alt="" loading="lazy"></span>
        <span class="egh-main"><span class="egh-line"><b class="egh-title" translate="no">${esc(r.name)}</b>${pillHTML(e?.status)}</span>
          <span class="egh-sub">${esc([(r.first_air_date || '').slice(0, 4), e ? 'No episodes rated yet' : ''].filter(Boolean).join(' · '))}</span>
          ${r.overview ? `<span class="egh-desc" translate="no">${esc(r.overview)}</span>` : ''}</span>
        ${v ? `<span class="egh-avg ep-band-${band(v)}" title="TMDB score">${mssR1(v)}<small>TMDB</small></span>` : ''}
        <span class="egh-go" aria-hidden="true">${icon('chevright', 18)}</span></a>`;
    };
    const group = (id, t, list) => list.length ? `<section class="egh-card egh-rated" aria-labelledby="${id}"><header class="egh-head"><h2 class="lg-kicker" id="${id}">${t} · ${list.length}</h2></header>
      <div class="egh-rows">${list.map(tmdbRow).join('')}</div></section>` : '';
    el.innerHTML = results.length ? group('ephSeenH', 'Shows you’ve watched', seen) + group('ephRestH', 'Shows you haven’t watched', rest)
      : mssEmpty({ compact: true, art: 'search', title: `No luck with “${q}”`, text: 'Check the spelling, or try the original title. TMDB knows a lot, but not everything.' });
  }

  /* ── Loading skeleton: the same markup with sample data, masked (mssSkeleton) — also inside the Episodes page's ── */
  function skel() {
    const n = Math.max(3, Math.min(mssSkeleton.shape('eph')?.rated || 5, 8));
    const was = { ...H }, e = i => ({ id: 'x' + i, tmdb_id: 1, title: 'Sample show name', status: 'completed', poster_url: '', ratings: {}, _ep: { eps: [], n: 12, total: 24, left: 12, avg: 8.4, best: null, latest: 0 } });
    try {
      Object.assign(H, { o: { owner: true }, rated: Array.from({ length: n }, (_, i) => e(i)), left: [], eps: [] });
      const rows = H.rated.map(rowHTML).join('').replace(/ ep-band-[a-z]+/g, '');
      return `<section class="egh-sum">${['Episodes rated', 'Shows', 'Average', 'Perfect 10s', 'Last rated'].map(l => `<div class="egh-sum-c"><b>000</b><span data-skel-keep>${l}</span></div>`).join('')}</section>
        <div class="egh-cols"><div class="egh-col-main"><section class="egh-card egh-rated"><header class="egh-head"><h2 class="lg-kicker" data-skel-keep>Rated shows</h2></header><div class="egh-rows">${rows}</div></section></div>
        <div class="egh-col-side"><section class="egh-card"><header class="egh-head"><h2 class="lg-kicker" data-skel-keep>Best episodes</h2></header><span class="egh-skel-box skel-media-box"></span></section></div></div>`;
    } finally { Object.assign(H, was); }
  }
  mssSkeleton.define('eph', skel);

  return { mount, mountLeft, search, skel, _more: more, _all: openAll, _allMore: allMore };
})();
