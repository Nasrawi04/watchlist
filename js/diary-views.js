/* ══════════════════════════════════════════
   diary-views.js — the Diary page (diary.html): every watch, on the day you watched it
   Private: only your own watches (diary_watches, 110). Logged by the database (112).

   Header: "Library", the month / week / day / year in big type (tap it to jump anywhere),
   how many watches, ‹ Today ›, Day · Week · Month · Year (remembered), search, Filter.
   ≥ 1024px: the calendar on the left and the picked day on the right; narrower: stacked.
   Swipe the calendar left / right for the next or previous one.
     Day    "Any time" first, then by time; back-to-back episodes of a show are linked;
            a bulk log is one row that opens into its episodes
     Week   7 columns of small poster rows (phones: the 7 days as a list)
     Month  up to 3 tiny posters a day, then "+2" (phones: one poster and a count); a grid
            with arrow keys, Home / End, Page Up / Down
     Year   12 small months, each day tinted by how many watches (diary_counts, 113)
   Filters (the site's Filter popup): Type · First watch / Rewatch · Rated / Unrated · Genre ·
   "Only dates with watches" (on unless you pick Every date: ‹ › jump between watch days).
   It always opens on today. Search lists every watch of a title.
   No date: watches without a day, grouped per show, Set date one by one or several at once.
   An empty day: "Add something for this day" (search TMDB; the normal Add to Library for a
   title that isn't in your library yet).
   Only what's on screen is loaded; month and day names come from the browser's language.
══════════════════════════════════════════ */
const MSSDiaryPage = (() => {
  const VIEWS = ['day', 'week', 'month', 'year'];
  const COLS = 'id,entry_id,tmdb_id,tmdb_type,cat,title,poster_url,season,episode,watched_at,watched_date,has_time,is_rewatch,rewatch_no,completes_title,rating_at_watch,batch_id,source,created_at';
  const CAT_LABEL = { movies: 'Movie', tv: 'TV Show', anime: 'Anime', cartoons: 'Cartoon' };
  const LS = k => 'msf_diary_' + k;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = s => new Date(s + 'T12:00:00');
  const addDays = (s, n) => { const d = day(s); d.setDate(d.getDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = day(s), want = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(want, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
  const monthStart = s => s.slice(0, 8) + '01';
  const monthEnd = s => { const d = day(s); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
  const lang = () => document.documentElement.lang || undefined;
  const fmt = (s, o) => day(s).toLocaleDateString(lang(), o);
  const timeOf = at => new Date(at).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' });
  const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const today = () => iso(new Date());
  const esc = s => escHTML(s == null ? '' : String(s));
  const small = url => url ? String(url).replace('/w500/', '/w185/').replace('/original/', '/w185/') : '';
  const isMovie = r => r.tmdb_type === 'movie' || r.cat === 'movies';
  const get = k => { try { return localStorage.getItem(LS(k)); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(LS(k), v); } catch {} };

  const st = {
    user: null, view: VIEWS.includes(get('view')) ? get('view') : 'month', day: today(), weekStart: 1,
    byDay: new Map(), loaded: new Set(), entries: new Map(), counts: new Map(), countsYear: null,
    prevRatings: new Map(), eps: new Map(), open: new Set(), search: null,
    nodate: { n: 0, rows: null, open: false, picked: new Set() },
  };
  const $ = id => document.getElementById(id);

  /* ── The week ── */
  function regionWeekStart() {
    try {
      const l = new Intl.Locale(navigator.language || 'en');
      const w = (l.getWeekInfo && l.getWeekInfo()) || l.weekInfo;
      if (w?.firstDay) return w.firstDay;
    } catch {}
    return 1;
  }
  const jsDow = ws => ws % 7;                         // 1 Mon … 6 Sat, 7 Sun → JS 1 … 6, 0
  function weekOf(s) {
    const d = day(s), back = (d.getDay() - jsDow(st.weekStart) + 7) % 7;
    return addDays(s, -back);
  }
  const weekDays = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(2024, 0, 7 + ((jsDow(st.weekStart) + i) % 7), 12); return d; });   // 7 Jan 2024 was a Sunday

  /* ── Loading (only what's on screen) ── */
  async function fetchRows(from, to) {
    const out = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await sb.from('diary_watches').select(COLS).gte('watched_date', from).lte('watched_date', to)
        .order('watched_date').order('watched_at', { nullsFirst: true }).order('season', { nullsFirst: true }).order('episode', { nullsFirst: true }).range(off, off + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function ensure(from, to) {
    const months = [];
    for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) if (!st.loaded.has(m.slice(0, 7))) months.push(m);
    if (!months.length) return;
    const rows = await fetchRows(months[0], monthEnd(months[months.length - 1]));
    months.forEach(m => st.loaded.add(m.slice(0, 7)));
    rows.forEach(r => { enrich(r); const a = st.byDay.get(r.watched_date) || []; if (!a.some(x => x.id === r.id)) a.push(r); st.byDay.set(r.watched_date, a); });
    await prevRatingsFor(rows);
  }
  function enrich(r) {
    const e = st.entries.get(r.entry_id);
    r.genres = e?.genres || [];
    r.year = e?.year || '';
    r.ratings = { _media_type: isMovie(r) ? 'movie' : 'tv' };
    return r;
  }
  // A rewatch shows what you rated before: the title's earlier completions
  async function prevRatingsFor(rows) {
    const ids = [...new Set(rows.filter(r => r.completes_title && r.is_rewatch && r.entry_id && !st.prevRatings.has(r.entry_id)).map(r => r.entry_id))];
    if (!ids.length) return;
    const { data } = await sb.from('diary_watches').select('entry_id,rewatch_no,rating_at_watch,watched_date').eq('completes_title', true).in('entry_id', ids.slice(0, 200));
    ids.forEach(id => st.prevRatings.set(id, (data || []).filter(x => x.entry_id === id)));
  }
  function forget() { st.byDay.clear(); st.loaded.clear(); st.counts.clear(); st.countsYear = null; st.prevRatings.clear(); }

  async function loadCounts(year) {
    if (st.countsYear === year) return;
    const f = filterArgs();
    const { data, error } = await sb.rpc('diary_counts', { p_from: `${year}-01-01`, p_to: `${year}-12-31`, ...f });
    if (error) throw error;
    st.counts = new Map((data || []).map(x => [x.day, x.n]));
    st.countsYear = year;
  }
  async function loadNoDate(full) {
    if (!full) {
      const { count } = await sb.from('diary_watches').select('id', { count: 'exact', head: true }).is('watched_date', null);
      st.nodate.n = count || 0;
      return;
    }
    const rows = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data } = await sb.from('diary_watches').select(COLS).is('watched_date', null).order('title').order('season', { nullsFirst: true }).order('episode', { nullsFirst: true }).range(off, off + 999);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    st.nodate.rows = rows.map(enrich);
    st.nodate.n = rows.length;
  }

  /* ── Filters: the site's Filter popup (sort-filter.js) ── */
  SF.register('diary', {
    base: () => st.search ? st.search.rows : [...st.byDay.values()].flat(),
    render: () => { st.countsYear = null; draw(); },
    filters: () => ['genre'],
    sorts: () => [],
    choiceFilters: () => [
      SF.typeChoice({ cat: r => r.cat, movie: isMovie }),
      { key: 'watch', label: 'Watch', options: [['', 'First watches and rewatches'], ['first', 'First watch'], ['rewatch', 'Rewatch']],
        test: (r, v) => v === 'rewatch' ? r.is_rewatch : !r.is_rewatch },
      { key: 'rated', label: 'Rating', options: [['', 'Rated and unrated'], ['rated', 'Rated'], ['unrated', 'Unrated']],
        test: (r, v) => v === 'rated' ? r.rating_at_watch != null : r.rating_at_watch == null },
      // on unless you turn it off: ‹ › go from one day you watched something to the next
      { key: 'only', label: 'Dates', single: true, options: [['', 'Only dates with watches'], ['all', 'Every date']], test: () => true },
    ],
    onSearch: q => search(q),
  });
  const choice = () => SF.filterState('diary', 'all').choice || {};
  const onlyWatchDays = () => choice().only !== 'all';
  let passing = null;
  const passes = r => !passing || passing.has(r.id);
  function refreshPassing() {
    const any = SF.filterCount('diary', 'all') - (choice().only === 'all' ? 1 : 0) > 0;
    passing = any ? new Set(SF.list('diary', 'all').map(r => r.id)) : null;
  }
  // The same filters for the Year view's counts (the database counts; Genre can't be counted there)
  function filterArgs() {
    const c = choice(), types = SF.picks(c.cat || '');
    const cats = [...new Set(types.map(v => SF.typeCat(v) || v).filter(v => CAT_LABEL[v]))];
    const one = v => (SF.picks(v || '').length === 1 ? SF.picks(v)[0] : null);
    return { p_cats: cats.length ? cats : null, p_watch: one(c.watch), p_rated: one(c.rated) };
  }
  const rowsOn = s => (st.byDay.get(s) || []).filter(passes);

  /* ── Search: every watch of a title ── */
  let searchSeq = 0;
  async function search(q) {
    q = (q || '').trim();
    const seq = ++searchSeq;
    if (!q) { st.search = null; return draw(); }
    const { data } = await sb.from('diary_watches').select(COLS).ilike('title', `%${q.replace(/[%_\\]/g, '\\$&')}%`)
      .order('watched_date', { ascending: false, nullsFirst: false }).order('watched_at', { ascending: false }).limit(500);
    if (seq !== searchSeq) return;
    st.search = { q, rows: (data || []).map(enrich) };
    await prevRatingsFor(st.search.rows);
    draw();
  }

  /* ── Episode names and stills (TMDB, cached by episode-ratings.js) ── */
  async function fillEpisodes(root) {
    const want = new Map();
    root.querySelectorAll('[data-ep]').forEach(el => { const [t, s] = el.dataset.ep.split(':'); want.set(`${t}:${s}`, [t, s]); });
    await Promise.all([...want.values()].map(async ([t, s]) => {
      const k = `${t}:${s}`;
      if (!st.eps.has(k)) st.eps.set(k, MSSEp.seasonEpisodes(Number(t), Number(s)).catch(() => []));
      const eps = await st.eps.get(k);
      root.querySelectorAll(`[data-ep^="${k}:"]`).forEach(el => {
        const n = Number(el.dataset.ep.split(':')[2]), ep = eps.find(x => x.n === n);
        if (!ep) return;
        const name = el.querySelector('.dy-ep-name');
        if (name && ep.name && !/^Episode \d+$/i.test(ep.name)) name.textContent = ` · ${ep.name}`;
        const img = el.querySelector('.dy-entry-art img');
        if (img && ep.still && !img.dataset.still) { img.dataset.still = '1'; img.src = TMDB_IMG.replace('w185', 'w300') + ep.still; el.querySelector('.dy-entry-art').classList.add('is-still'); }
      });
    }));
  }

  /* ── One watch ── */
  function hrefOf(r) {
    if (!r.tmdb_id) return null;
    if (r.season != null && !isMovie(r)) return `episode.html?show=${r.tmdb_id}&s=${r.season}&e=${r.episode}`;
    return `title.html?type=${isMovie(r) ? 'movie' : 'tv'}&id=${r.tmdb_id}`;
  }
  function ratingLine(r) {
    if (!r.completes_title || !r.is_rewatch) return '';
    const before = (st.prevRatings.get(r.entry_id) || []).filter(x => x.rewatch_no < r.rewatch_no && x.rating_at_watch != null)
      .sort((a, b) => b.rewatch_no - a.rewatch_no)[0];
    if (!before) return '';
    const was = Number(before.rating_at_watch).toFixed(1);
    return r.rating_at_watch != null && Number(r.rating_at_watch) !== Number(before.rating_at_watch)
      ? `<div class="dy-entry-rate">Rated ${was} → ${Number(r.rating_at_watch).toFixed(1)} on rewatch</div>`
      : `<div class="dy-entry-rate">Previously ${was}</div>`;
  }
  function entryHTML(r, o = {}) {
    const href = hrefOf(r), ep = r.season != null;
    const when = [o.withDate && r.watched_date ? fmt(r.watched_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '', r.watched_at ? timeOf(r.watched_at) : (o.withDate && r.watched_date ? 'Any time' : '')].filter(Boolean).join(' · ');
    const art = small(r.poster_url);
    const inner = `<span class="dy-entry-art">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : `<span class="dy-entry-ph" aria-hidden="true">${esc((r.title || '?')[0])}</span>`}</span>
      <span class="dy-entry-main">
        <span class="dy-entry-top"><span class="dy-entry-title" translate="no">${esc(r.title)}</span><span class="dy-badge">${CAT_LABEL[r.cat] || ''}</span></span>
        ${ep ? `<span class="dy-entry-sub">S${r.season} E${r.episode}<span class="dy-ep-name"></span></span>` : ''}
        <span class="dy-entry-meta">${when ? `<span>${esc(when)}</span>` : ''}${r.is_rewatch ? `<span class="dy-tag">${icon('refresh', 12)} Rewatch #${r.rewatch_no}</span>` : ''}${r.completes_title ? `<span class="dy-tag is-done">${icon('check', 12)} Finished</span>` : ''}</span>
        ${ratingLine(r)}
      </span>
      ${r.rating_at_watch != null ? `<span class="dy-score" aria-label="Rated ${Number(r.rating_at_watch).toFixed(1)}">★ ${Number(r.rating_at_watch).toFixed(1)}</span>` : ''}`;
    const label = `${r.title}${ep ? ` S${r.season} E${r.episode}` : ''}`;
    return `<article class="dy-entry${o.linked ? ' is-linked' : ''}"${ep && r.tmdb_id ? ` data-ep="${r.tmdb_id}:${r.season}:${r.episode}"` : ''}>
        ${href ? `<a class="dy-entry-link" href="${esc(href)}">${inner}</a>` : `<div class="dy-entry-link">${inner}</div>`}
        <button type="button" class="dy-more" data-act="more" data-ids="${esc(r.id)}" aria-label="Options for ${esc(label)}">${icon('moreV', 18)}</button>
      </article>`;
  }
  // "S1 E1–E8" · "S1–S5" for a bulk log
  function rangeText(rows) {
    const eps = rows.filter(r => r.season != null);
    if (!eps.length) return '';
    const a = eps[0], b = eps[eps.length - 1];
    if (a.season === b.season) return `S${a.season} E${a.episode}–E${b.episode}`;
    return `S${a.season}–S${b.season}`;
  }
  function groupHTML(rows, o = {}) {
    const r = rows.find(x => x.completes_title) || rows[rows.length - 1], key = rows[0].batch_id || rows[0].id, open = st.open.has(key);
    const art = small(r.poster_url), id = 'dyG' + key.replace(/[^a-z0-9]/gi, '').slice(0, 12);
    return `<div class="dy-group${open ? ' is-open' : ''}">
        <button type="button" class="dy-group-head" data-act="group" data-key="${esc(key)}" aria-expanded="${open}" aria-controls="${id}">
          <span class="dy-entry-art">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}</span>
          <span class="dy-entry-main">
            <span class="dy-entry-top"><span class="dy-entry-title" translate="no">${esc(r.title)}</span><span class="dy-badge">${CAT_LABEL[r.cat] || ''}</span></span>
            <span class="dy-entry-sub">${esc(rangeText(rows))} · ${plural(rows.length, 'episode')}</span>
            <span class="dy-entry-meta">${o.withDate && r.watched_date ? `<span>${esc(fmt(r.watched_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span>` : ''}${rows[0].watched_at ? `<span>${esc(timeOf(rows[0].watched_at))}</span>` : ''}${r.is_rewatch ? `<span class="dy-tag">${icon('refresh', 12)} Rewatch #${r.rewatch_no}</span>` : ''}${rows.some(x => x.completes_title) ? `<span class="dy-tag is-done">${icon('check', 12)} Finished</span>` : ''}</span>
          </span>
          <span class="dy-group-chev" aria-hidden="true">${icon('chevdown', 16)}</span>
        </button>
        <button type="button" class="dy-more" data-act="more" data-ids="${esc(rows.map(x => x.id).join(','))}" aria-label="Options for ${esc(r.title)} ${esc(rangeText(rows))}">${icon('moreV', 18)}</button>
        <div class="dy-group-body" id="${id}"${open ? '' : ' hidden'}>${open ? rows.map(x => entryHTML(x)).join('') : ''}</div>
      </div>`;
  }
  // A day's watches: bulk logs grouped, back-to-back episodes of one show linked
  function items(rows) {
    const out = [], seen = new Set();
    rows.forEach(r => {
      if (seen.has(r.id)) return;
      const batch = r.batch_id ? rows.filter(x => x.batch_id === r.batch_id) : [r];
      batch.forEach(x => seen.add(x.id));
      out.push(batch);
    });
    return out;
  }
  function listHTML(rows, o = {}) {
    const its = items(rows);
    return its.map((g, i) => {
      const prev = its[i - 1], linked = g.length === 1 && prev && prev.length === 1 && prev[0].entry_id && prev[0].entry_id === g[0].entry_id && g[0].season != null;
      return g.length > 1 ? groupHTML(g, o) : entryHTML(g[0], { ...o, linked });
    }).join('');
  }

  /* ── The picked day ── */
  function dayPanelHTML(s) {
    const rows = rowsOn(s);
    const head = `<div class="dy-day-head"><h2 class="dy-day-t">${esc(fmt(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</h2><span class="dy-day-n">${rows.length ? plural(rows.length, 'watch', 'watches') : ''}</span></div>`;
    if (!rows.length) return head + mssEmpty({ compact: true, art: 'episodes', title: 'You haven’t watched anything on this date.', text: 'Forgot to add something?',
      actions: [{ label: 'Add something for this day', icon: 'plus', primary: true, onclick: `MSSDiaryPage.add('${s}')` }] });
    const any = rows.filter(r => !r.watched_at), timed = rows.filter(r => r.watched_at).sort((a, b) => Date.parse(a.watched_at) - Date.parse(b.watched_at));
    return head + (any.length ? `<div class="dy-slot"><div class="dy-slot-t">Any time</div><div class="dy-list">${listHTML(any)}</div></div>` : '')
      + (timed.length ? `<div class="dy-slot"><div class="dy-list">${listHTML(timed)}</div></div>` : '')
      + `<button type="button" class="dy-add-more" onclick="MSSDiaryPage.add('${s}')">${icon('plus', 14)} Add something for this day</button>`;
  }

  /* ── Month ── */
  function monthHTML(anchor, compact) {
    const first = monthStart(anchor), last = monthEnd(anchor), start = weekOf(first);
    const t = today(), wd = weekDays();
    let cells = '', s = start;
    const weeks = [];
    while (s <= last || weeks.length < 4) {
      const row = [];
      for (let i = 0; i < 7; i++, s = addDays(s, 1)) row.push(s);
      weeks.push(row);
      if (s > last) break;
    }
    cells = weeks.map(row => `<div class="dy-m-row" role="row">${row.map(d => {
      const out = d.slice(0, 7) !== first.slice(0, 7), rs = out ? [] : rowsOn(d), n = rs.length;
      const titles = [...new Map(rs.map(r => [r.entry_id || r.title, r])).values()];
      const label = `${fmt(d, { month: 'long', day: 'numeric' })}, ${n ? plural(n, 'watch', 'watches') : 'no watches'}`;
      return `<div class="dy-m-cell" role="gridcell" aria-selected="${d === st.day}">${out ? '' : `<button type="button" class="dy-m-day${n ? ' has' : ''}${d === t ? ' is-today' : ''}${d === st.day ? ' is-picked' : ''}" data-d="${d}" tabindex="${d === st.day ? 0 : -1}" aria-label="${esc(label)}"${d === t ? ' aria-current="date"' : ''}>
          <span class="dy-m-num">${Number(d.slice(8))}</span>
          ${n && !compact ? `<span class="dy-m-posters">${titles.slice(0, 3).map(r => r.poster_url ? `<img src="${esc(small(r.poster_url))}" alt="" loading="lazy">` : `<i>${esc((r.title || '?')[0])}</i>`).join('')}${titles.length > 3 ? `<b>+${titles.length - 3}</b>` : ''}</span>` : ''}
          ${n ? `<span class="dy-m-count" aria-hidden="true">${n}</span>` : ''}
        </button>`}</div>`;
    }).join('')}</div>`).join('');
    return `<div class="dy-month${compact ? ' is-compact' : ''}" role="grid" aria-label="${esc(fmt(first, { month: 'long', year: 'numeric' }))}" aria-readonly="true">
        <div class="dy-m-row dy-m-head" role="row">${wd.map(d => `<div class="dy-m-wd" role="columnheader"><abbr title="${esc(d.toLocaleDateString(lang(), { weekday: 'long' }))}"><span class="dy-wd-s">${esc(d.toLocaleDateString(lang(), { weekday: 'short' }))}</span><span class="dy-wd-n" aria-hidden="true">${esc(d.toLocaleDateString(lang(), { weekday: 'narrow' }))}</span></abbr></div>`).join('')}</div>
        ${cells}
      </div>`;
  }

  /* ── Week ── */
  function weekHTML() {
    const start = weekOf(st.day), t = today(), only = onlyWatchDays();
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(d => !only || rowsOn(d).length);
    return `<div class="dy-week" style="--dy-cols:${Math.max(days.length, 1)}">${days.map(d => {
      const rs = rowsOn(d), groups = items(rs);
      return `<section class="dy-w-day${rs.length ? ' has' : ''}${d === t ? ' is-today' : ''}${d === st.day ? ' is-picked' : ''}" aria-label="${esc(fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }))}, ${rs.length ? plural(rs.length, 'watch', 'watches') : 'no watches'}">
          <button type="button" class="dy-w-head" data-d="${d}"${d === t ? ' aria-current="date"' : ''}>
            <span class="dy-w-wd">${esc(fmt(d, { weekday: 'short' }))}</span><span class="dy-w-num">${Number(d.slice(8))}</span>${rs.length ? `<span class="dy-w-n">${rs.length}</span>` : ''}
          </button>
          <div class="dy-w-list">${groups.slice(0, 6).map(g => {
            const r = g.find(x => x.completes_title) || g[0];
            const sub = g.length > 1 ? rangeText(g) : r.season != null ? `S${r.season} E${r.episode}` : (r.watched_at ? timeOf(r.watched_at) : CAT_LABEL[r.cat] || '');
            return `<button type="button" class="dy-w-item" data-d="${d}" aria-label="${esc(`${r.title}, ${sub}`)}">
                <span class="dy-w-art">${r.poster_url ? `<img src="${esc(small(r.poster_url))}" alt="" loading="lazy">` : ''}</span>
                <span class="dy-w-text"><span class="dy-w-title" translate="no">${esc(r.title)}</span><span class="dy-w-sub">${esc(sub)}</span></span>
              </button>`;
          }).join('')}${groups.length > 6 ? `<button type="button" class="dy-w-more" data-d="${d}">+${groups.length - 6} more</button>` : ''}</div>
        </section>`;
    }).join('') || mssEmpty({ compact: true, art: 'episodes', title: 'Nothing this week', text: 'No watches between these days.' })}</div>`;
  }

  /* ── Year ── */
  function yearHTML(y) {
    const t = today(), wd = weekDays();
    const lvl = n => !n ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
    const months = Array.from({ length: 12 }, (_, m) => {
      const first = `${y}-${pad(m + 1)}-01`, last = monthEnd(first), start = weekOf(first);
      let s = start, cells = '';
      while (s <= last) {
        cells += '<div class="dy-y-row" role="row">';
        for (let i = 0; i < 7; i++, s = addDays(s, 1)) {
          const out = s.slice(0, 7) !== first.slice(0, 7), n = out ? 0 : (st.counts.get(s) || 0);
          cells += `<div role="gridcell">${out ? '' : `<button type="button" class="dy-y-day l${lvl(n)}${s === t ? ' is-today' : ''}" data-d="${s}" tabindex="-1" aria-label="${esc(fmt(s, { month: 'long', day: 'numeric' }))}, ${n ? plural(n, 'watch', 'watches') : 'no watches'}"${s === t ? ' aria-current="date"' : ''}></button>`}</div>`;
        }
        cells += '</div>';
      }
      const total = [...st.counts.entries()].filter(([d]) => d.slice(0, 7) === first.slice(0, 7)).reduce((a, [, n]) => a + n, 0);
      return `<section class="dy-y-month">
          <button type="button" class="dy-y-t" data-m="${first}">${esc(fmt(first, { month: 'long' }))}${total ? `<span>${total}</span>` : ''}</button>
          <div class="dy-y-grid" role="grid" aria-label="${esc(fmt(first, { month: 'long', year: 'numeric' }))}" aria-readonly="true">
            <div class="dy-y-row" role="row">${wd.map(d => `<div role="columnheader" class="dy-y-wd"><abbr title="${esc(d.toLocaleDateString(lang(), { weekday: 'long' }))}">${esc(d.toLocaleDateString(lang(), { weekday: 'narrow' }))}</abbr></div>`).join('')}</div>
            ${cells}
          </div>
        </section>`;
    }).join('');
    return `<div class="dy-year">${months}</div>
      <div class="dy-legend" aria-hidden="true"><span>Fewer</span>${[0, 1, 2, 3, 4].map(l => `<i class="l${l}"></i>`).join('')}<span>More</span></div>`;
  }

  /* ── The page ── */
  const split = () => matchMedia('(min-width: 1024px)').matches;
  function rangeOf() {
    if (st.view === 'day') return [st.day, st.day];
    if (st.view === 'week') { const w = weekOf(st.day); return [w, addDays(w, 6)]; }
    if (st.view === 'month') return [weekOf(monthStart(st.day)), addDays(weekOf(monthEnd(st.day)), 6)];
    return [st.day, st.day];
  }
  function titleText() {
    if (st.view === 'day') return fmt(st.day, { day: 'numeric', month: 'long', year: 'numeric' });
    if (st.view === 'week') {
      const a = weekOf(st.day), b = addDays(a, 6), o = { day: 'numeric', month: 'short', year: 'numeric' };
      // "Nov 1 – 7, 2026" (the language's own way of writing a range)
      try { return new Intl.DateTimeFormat(lang(), o).formatRange(day(a), day(b)); }
      catch { return `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, o)}`; }
    }
    if (st.view === 'month') return fmt(st.day, { month: 'long', year: 'numeric' });
    return st.day.slice(0, 4);
  }
  function countText() {
    let n = 0;
    if (st.view === 'year') n = [...st.counts.values()].reduce((a, b) => a + b, 0);
    else if (st.view === 'month') for (let d = monthStart(st.day); d <= monthEnd(st.day); d = addDays(d, 1)) n += rowsOn(d).length;
    else { const [a, b] = rangeOf(); for (let d = a; d <= b; d = addDays(d, 1)) n += rowsOn(d).length; }
    return plural(n, 'watch', 'watches');
  }
  const unitName = () => ({ day: 'day', week: 'week', month: 'month', year: 'year' })[st.view];

  function shell() {
    $('dyRoot').innerHTML = `
      <div class="dy-head fade-up">
        <div class="dy-head-main">
          <div class="lp-eyebrow">Library · Diary</div>
          <h1 class="dy-title-wrap"><button type="button" class="dy-title" id="dyTitle" aria-label="Jump to a date"></button></h1>
          <div class="dy-count" id="dyCount" aria-live="polite"></div>
        </div>
        <div class="dy-nav">
          <button type="button" class="dy-nav-btn" id="dyPrev">${icon('chevleft', 18)}</button>
          <button type="button" class="dy-today" id="dyToday">Today</button>
          <button type="button" class="dy-nav-btn" id="dyNext">${icon('chevright', 18)}</button>
        </div>
      </div>
      <div class="dy-tools fade-up fade-up-1">
        <div class="pn-toggle dy-views" role="group" aria-label="View">${VIEWS.map(v => `<button type="button" class="pn-toggle-btn" data-view="${v}" aria-pressed="false">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
        <div class="dy-search sf-search-row" id="dySearch"></div>
        <div id="dyFilter"></div>
      </div>
      <div id="dyOtd"></div>
      <div id="dyBanner"></div>
      <div id="dyMain" class="fade-up fade-up-2"></div>
      <section class="dy-nodate" id="dyNoDate" aria-labelledby="dyNoDateT" hidden></section>`;
    $('dySearch').innerHTML = SF.searchHTML('diary', 'Search your diary…');
    wire();
  }
  function filterBtn() {
    const n = SF.filterCount('diary', 'all');
    $('dyFilter').innerHTML = `<button type="button" class="sf-icon-btn${n ? ' active' : ''}" onclick="SF.openFilter('diary','all')" aria-label="Filter">${icon('filter', 15)}<span class="sf-icon-btn-label">${n ? `Filter (${n})` : 'Filter'}</span></button>`;
  }

  let drawing = 0;
  async function draw() {
    const seq = ++drawing;
    filterBtn();
    document.querySelectorAll('.dy-views [data-view]').forEach(b => { const on = b.dataset.view === st.view; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    $('dyPrev').setAttribute('aria-label', `Previous ${unitName()}`); $('dyNext').setAttribute('aria-label', `Next ${unitName()}`);
    if (st.search) return drawSearch();
    const [a, b] = rangeOf();
    try {
      await ensure(a, b);
      if (split() || st.view === 'day') await ensure(st.day, st.day);
      if (st.view === 'year') await loadCounts(st.day.slice(0, 4));
    } catch (err) { console.error(err); if (seq === drawing) $('dyMain').innerHTML = mssEmpty({ compact: true, art: 'episodes', title: 'Couldn’t load your Diary', text: 'Check your connection and try again.', actions: [{ label: 'Try again', icon: 'refresh', onclick: 'MSSDiaryPage.reload()' }] }); return; }
    if (seq !== drawing) return;
    refreshPassing();
    $('dyTitle').textContent = titleText();
    $('dyCount').textContent = countText();
    const panel = `<div class="dy-panel" id="dyPanel">${dayPanelHTML(st.day)}</div>`;
    let cal;
    if (st.view === 'day') cal = split() ? monthHTML(st.day, true) : '';
    else if (st.view === 'week') cal = weekHTML();
    else if (st.view === 'month') cal = monthHTML(st.day, false);
    else cal = yearHTML(st.day.slice(0, 4));
    // the week list on phones opens a day itself, so it has no day underneath
    const showPanel = st.view !== 'year' || split();
    $('dyMain').innerHTML = `<div class="dy-body dy-v-${st.view}${cal ? '' : ' no-cal'}">${cal ? `<div class="dy-cal" id="dyCal">${cal}</div>` : ''}${showPanel ? panel : ''}</div>`;
    fillEpisodes($('dyMain'));
    drawNoDate();
  }
  function drawSearch() {
    refreshPassing();
    const shown = st.search.rows.filter(passes);
    $('dyTitle').textContent = titleText();
    $('dyCount').textContent = `${plural(shown.length, 'watch', 'watches')} of “${st.search.q}”`;
    $('dyMain').innerHTML = shown.length
      ? `<div class="dy-results"><div class="dy-list">${listHTML(shown, { withDate: true })}</div></div>`
      : mssEmpty({ art: 'search', title: `No watches of “${st.search.q}”`, text: st.search.rows.length ? 'Your filters hide them.' : 'Nothing in your Diary matches. Try another title.', actions: [{ label: 'Clear search', icon: 'x', onclick: "SF._search('diary', '', true)" }] });
    fillEpisodes($('dyMain'));
  }

  /* ── No date ── */
  function drawNoDate() {
    const n = st.nodate.n, box = $('dyNoDate');
    $('dyBanner').innerHTML = n ? `<button type="button" class="dy-banner" onclick="MSSDiaryPage.openNoDate()">${icon('calendar', 16)}<span><b>${plural(n, 'watch has', 'watches have')} no date</b> · Sort them out</span>${icon('chevright', 14)}</button>` : '';
    box.hidden = !n;
    if (!n) return;
    const groups = [];
    if (st.nodate.open && st.nodate.rows) {
      const by = new Map();
      st.nodate.rows.forEach(r => { const k = `${r.entry_id || r.title}|${r.rewatch_no}`; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
      by.forEach((rows, k) => groups.push({ k, rows }));
    }
    const picked = st.nodate.picked, titles = groups.length;
    box.innerHTML = `<button type="button" class="dy-nodate-head" aria-expanded="${st.nodate.open}" aria-controls="dyNoDateBody" onclick="MSSDiaryPage.openNoDate(true)">
        <span class="dy-nodate-ic" aria-hidden="true">${icon('calendar', 18)}</span>
        <span class="dy-nodate-text"><span class="lp-eyebrow" id="dyNoDateT">No date</span><span class="dy-nodate-sub">${plural(n, 'watch', 'watches')}${titles ? ` · ${plural(titles, 'title')}` : ''} without a day</span></span>
        <span class="dy-group-chev" aria-hidden="true">${icon('chevdown', 18)}</span></button>
      <div class="dy-nodate-body" id="dyNoDateBody"${st.nodate.open ? '' : ' hidden'}>
        ${st.nodate.open && !st.nodate.rows ? '<div class="page-loading" data-skel="rows"></div>' : ''}
        ${titles ? `<div class="dy-nodate-tools">
            <p class="dy-nodate-hint">Watched, but the day isn’t known. Pick a day and they move onto the calendar.</p>
            <button type="button" class="dy-btn" data-nd="all">${picked.size === titles ? 'Clear all' : 'Pick all'}</button>
          </div>
          <ul class="dy-nodate-list">${groups.map(g => {
            const r = g.rows[0], eps = g.rows.some(x => x.season != null), on = picked.has(g.k);
            const label = `${r.title}${eps ? ' · ' + rangeText(g.rows) : ''}`;
            return `<li class="dy-nodate-row${on ? ' is-picked' : ''}">
                <label class="dy-tick"><input type="checkbox" data-k="${esc(g.k)}" ${on ? 'checked' : ''} aria-label="Pick ${esc(label)}"><span class="dy-tick-box" aria-hidden="true">${icon('check', 14)}</span></label>
                <span class="dy-entry-art">${r.poster_url ? `<img src="${esc(small(r.poster_url))}" alt="" loading="lazy">` : `<span class="dy-entry-ph" aria-hidden="true">${esc((r.title || '?')[0])}</span>`}</span>
                <span class="dy-entry-main">
                  <span class="dy-entry-title" translate="no">${esc(r.title)}</span>
                  <span class="dy-entry-sub">${esc([CAT_LABEL[r.cat], eps ? `${rangeText(g.rows)} · ${plural(g.rows.length, 'episode')}` : ''].filter(Boolean).join(' · '))}</span>
                  ${r.is_rewatch ? `<span class="dy-entry-meta"><span class="dy-tag">${icon('refresh', 12)} Rewatch #${r.rewatch_no}</span></span>` : ''}
                </span>
                <button type="button" class="dy-btn dy-nodate-set" data-k="${esc(g.k)}" aria-label="Set date for ${esc(label)}">${icon('calendar', 15)}<span>Set date</span></button>
              </li>`;
          }).join('')}</ul>
          <div class="dy-pickbar" ${picked.size ? '' : 'hidden'} role="region" aria-label="Picked titles">
            <span class="dy-pickbar-n" aria-live="polite">${plural(picked.size, 'title')} picked</span>
            <button type="button" class="dy-btn" data-nd="clear">Clear</button>
            <button type="button" class="dy-btn is-primary" data-nd="set">${icon('calendar', 15)}<span>Set one date</span></button>
          </div>` : ''}
      </div>`;
    box.querySelectorAll('input[data-k]').forEach(c => c.addEventListener('change', () => { if (c.checked) picked.add(c.dataset.k); else picked.delete(c.dataset.k); drawNoDate(); box.querySelector(`input[data-k="${CSS.escape(c.dataset.k)}"]`)?.focus(); }));
    box.querySelectorAll('.dy-nodate-set').forEach(b => b.addEventListener('click', () => setDate(groupRows([b.dataset.k]))));
    box.querySelectorAll('[data-nd]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.nd;
      if (k === 'set') return setDate(groupRows([...picked]));
      if (k === 'clear' || (k === 'all' && picked.size === titles)) picked.clear(); else groups.forEach(g => picked.add(g.k));
      drawNoDate(); box.querySelector(`[data-nd="${k === 'set' ? 'set' : 'all'}"]`)?.focus();
    }));
  }
  const groupRows = keys => (st.nodate.rows || []).filter(r => keys.includes(`${r.entry_id || r.title}|${r.rewatch_no}`));
  async function openNoDate(toggle) {
    st.nodate.open = toggle ? !st.nodate.open : true;
    drawNoDate();
    if (!toggle) $('dyNoDate').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (st.nodate.open && !st.nodate.rows) { await loadNoDate(true); drawNoDate(); }
  }
  function setDate(rows) {
    if (!rows.length) return;
    MSSDiary.pick({ title: 'When did you watch it?', label: rows.length > 1 && rows[0].title === rows[rows.length - 1].title ? `${rows[0].title} · ${rangeText(rows) || plural(rows.length, 'watch', 'watches')}` : rows.length > 1 ? plural(rows.length, 'watch', 'watches') : rows[0].title,
      row: rows[0], date: today(), time: null,
      onSave: async (d, t) => { await saveDay(rows, d, t); st.nodate.picked.clear(); st.nodate.rows = null; await loadNoDate(true); forget(); if (d) st.day = d; draw(); } });
  }
  async function saveDay(rows, d, t) {
    const at = d && t ? new Date(`${d}T${t}:00`).toISOString() : null;
    const ids = rows.map(r => r.id);
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await sb.from('diary_watches').update({ watched_date: d, watched_at: at }).in('id', ids.slice(i, i + 150));
      if (error) throw error;
    }
    showToast(d ? `Logged · ${fmt(d, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Saved to No date');
  }

  /* ── ⋯ on a watch: change its day, or remove it ── */
  function allRows() { return [...st.byDay.values()].flat().concat(st.search?.rows || []); }
  function more(ids) {
    const rows = allRows().filter(r => ids.includes(r.id)).filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
    if (!rows.length) return;
    const r = rows[0], label = rows.length > 1 ? `${r.title} · ${rangeText(rows)}` : `${r.title}${r.season != null ? ` · S${r.season} E${r.episode}` : ''}`;
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `<div class="confirm-card dy-menu" role="dialog" aria-modal="true" aria-labelledby="dyMenuT">
        <div class="confirm-title" id="dyMenuT">${esc(label)}</div>
        <button type="button" class="dy-menu-btn" data-m="change">${icon('calendar', 16)} Change date or time</button>
        <button type="button" class="dy-menu-btn is-danger" data-m="remove">${icon('trash', 16)} Remove from Diary</button>
        <div class="confirm-actions"><button type="button" class="confirm-cancel" data-m="close">Cancel</button></div>
      </div>`;
    const close = () => { MSSDialog.close(ov); setTimeout(() => ov.remove(), 220); };
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
    ov.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-m]'); if (!b && ev.target !== ov) return;
      if (!b || b.dataset.m === 'close') return close();
      close();
      if (b.dataset.m === 'change') {
        MSSDiary.pick({ label, row: r, date: r.watched_date, time: r.watched_at ? `${pad(new Date(r.watched_at).getHours())}:${pad(new Date(r.watched_at).getMinutes())}` : null, noDate: true,
          onSave: async (d, t) => { await saveDay(rows, d, t); forget(); if (d) st.day = d; await loadNoDate(false); if (st.nodate.rows) await loadNoDate(true); st.search && await search(st.search.q); draw(); } });
      } else {
        const ok = await showConfirm({ title: 'Remove from your Diary?', message: `${label} — ${rows.length > 1 ? plural(rows.length, 'watch', 'watches') : 'this watch'}. Your library, ratings and notes stay as they are.`, confirmText: 'Remove' });
        if (!ok) return;
        const { error } = await sb.from('diary_watches').delete().in('id', rows.map(x => x.id));
        if (error) { showToast('Couldn’t remove that — try again.', 'err'); return; }
        showToast('Removed from your Diary');
        forget(); st.search && await search(st.search.q); draw();
      }
    });
    MSSDialog.open(ov, { focus: '.dy-menu-btn' });
  }

  /* ── Add something for this day ── */
  function add(s) {
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `<div class="confirm-card dy-add" role="dialog" aria-modal="true" aria-labelledby="dyAddT">
        <div class="dy-add-top"><div><div class="lp-eyebrow">${esc(fmt(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="confirm-title" id="dyAddT">Add something for this day</div></div>
          <button type="button" class="dr-nav" data-x aria-label="Close">${icon('x', 16)}</button></div>
        <div class="dy-add-body" id="dyAddBody"></div>
      </div>`;
    const close = () => { MSSDialog.close(ov); setTimeout(() => ov.remove(), 220); };
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
    ov.querySelector('[data-x]').onclick = close;
    const body = ov.querySelector('#dyAddBody');
    let seq = 0;
    function searchStep() {
      body.innerHTML = `<label class="sr-only" for="dyAddQ">Search for a movie or show</label>
        <input class="field-input" id="dyAddQ" type="search" placeholder="Search for a movie or show…" autocomplete="off">
        <ul class="dy-add-results" id="dyAddRes" aria-live="polite"></ul>`;
      const q = body.querySelector('#dyAddQ'), res = body.querySelector('#dyAddRes');
      let timer;
      q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => {
        const text = q.value.trim(), me = ++seq;
        if (text.length < 2) { res.innerHTML = ''; return; }
        try {
          const r = await tmdbFetch(`${TMDB_BASE}/search/multi?language=en-US&include_adult=false&query=${encodeURIComponent(text)}`);
          const d = r.ok ? await r.json() : { results: [] };
          if (me !== seq) return;
          const list = (d.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 12);
          res.innerHTML = list.length ? list.map((x, i) => `<li><button type="button" class="dy-add-item" data-i="${i}">
              <span class="dy-entry-art">${x.poster_path ? `<img src="${TMDB_IMG + x.poster_path}" alt="" loading="lazy">` : ''}</span>
              <span class="dy-entry-main"><span class="dy-entry-title" translate="no">${esc(x.title || x.name)}</span><span class="dy-entry-sub">${x.media_type === 'movie' ? 'Movie' : 'TV Show'}${(x.release_date || x.first_air_date) ? ' · ' + (x.release_date || x.first_air_date).slice(0, 4) : ''}${mine(x) ? ' · In your library' : ''}</span></span>
            </button></li>`).join('') : `<li class="dy-add-none">Nothing found. Try another title.</li>`;
          res.querySelectorAll('.dy-add-item').forEach(b => b.onclick = () => whatStep(list[Number(b.dataset.i)]));
        } catch { res.innerHTML = `<li class="dy-add-none">Couldn’t search — try again.</li>`; }
      }, 300); });
      q.focus();
    }
    const mine = x => [...st.entries.values()].find(e => e.tmdb_id === x.id && (e.tmdb_type || (e.cat === 'movies' ? 'movie' : 'tv')) === x.media_type);
    async function whatStep(x) {
      const movie = x.media_type === 'movie', name = x.title || x.name;
      body.innerHTML = `<div class="dy-add-pick"><span class="dy-entry-art">${x.poster_path ? `<img src="${TMDB_IMG + x.poster_path}" alt="">` : ''}</span><div><div class="dy-entry-title" translate="no">${esc(name)}</div><div class="dy-entry-sub">${movie ? 'Movie' : 'TV Show'}</div></div></div>
        ${movie ? '' : `<div class="dy-days" role="group" aria-label="What did you watch?">
            <button type="button" class="dy-chip" data-what="ep" aria-pressed="true">An episode</button>
            <button type="button" class="dy-chip" data-what="all" aria-pressed="false">Finished the show</button></div>
          <div class="dy-add-ep" id="dyAddEp"><label class="field-label" for="dyAddS">Season</label><select class="field-input" id="dyAddS"></select>
            <label class="field-label" for="dyAddE">Episode</label><select class="field-input" id="dyAddE"></select></div>`}
        <div class="dy-time"><label class="dy-time-l" for="dyAddTime">Time</label><input class="field-input dy-time-in" id="dyAddTime" type="time">
          <span class="dy-add-opt">optional</span></div>
        <div class="confirm-actions"><button type="button" class="confirm-cancel" data-back>Back</button><button type="button" class="confirm-ok is-safe" data-go>Add to Diary</button></div>`;
      body.querySelector('[data-back]').onclick = searchStep;
      let what = movie ? 'movie' : 'ep';
      if (!movie) {
        body.querySelectorAll('[data-what]').forEach(b => b.onclick = () => {
          what = b.dataset.what;
          body.querySelectorAll('[data-what]').forEach(y => y.setAttribute('aria-pressed', String(y === b)));
          body.querySelector('#dyAddEp').hidden = what === 'all';
        });
        const sSel = body.querySelector('#dyAddS'), eSel = body.querySelector('#dyAddE');
        let det = null;
        try { const r = await tmdbFetch(`${TMDB_BASE}/tv/${x.id}?language=en-US`); det = r.ok ? await r.json() : null; } catch {}
        const seasons = (det?.seasons || []).filter(z => z.season_number > 0 && z.episode_count > 0);
        sSel.innerHTML = seasons.map(z => `<option value="${z.season_number}">${esc(mssSeasonLabel(z.season_number, z.name))}</option>`).join('') || '<option value="1">Season 1</option>';
        const fillEps = async () => {
          const eps = await MSSEp.seasonEpisodes(x.id, Number(sSel.value));
          const n = eps.length || seasons.find(z => z.season_number === Number(sSel.value))?.episode_count || 1;
          eSel.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">E${i + 1}${eps[i]?.name ? ' · ' + esc(eps[i].name) : ''}</option>`).join('');
        };
        sSel.onchange = fillEps; await fillEps();
        x._det = det;
      }
      body.querySelector('[data-go]').onclick = async ev => {
        const btn = ev.currentTarget, time = body.querySelector('#dyAddTime').value || null;
        const season = !movie && what === 'ep' ? Number(body.querySelector('#dyAddS').value) : null, episode = season ? Number(body.querySelector('#dyAddE').value) : null;
        btn.disabled = true;
        try {
          const own = mine(x);
          if (own) { await addWatch(own, s, time, season, episode, movie || what === 'all'); close(); }
          else {
            close();
            MSSInfo.addToLibrary({ tmdb_id: x.id, media_type: x.media_type, title: name, poster_url: x.poster_path ? TMDB_FULL + x.poster_path : null, overview: x.overview },
              { status: movie || what === 'all' ? 'completed' : 'watching', details: x._det || undefined,
                extra: { completed_date: s, season, episode },
                onAdded: entry => entry && afterAdded(entry, s, time, season, episode) });
          }
        } catch (err) { console.error(err); btn.disabled = false; showToast('Couldn’t add that — try again.', 'err'); }
      };
    }
    searchStep();
    MSSDialog.open(ov, { focus: '#dyAddQ' });
  }
  // A title already in your library: just the watch (its info never changes)
  async function addWatch(e, s, time, season, episode, done) {
    const { data: prev } = await sb.from('diary_watches').select('rewatch_no,completes_title').eq('entry_id', e.id);
    const rc = Number(e.ratings?._rewatch_count) || 1;
    const no = done ? Math.max(0, ...(prev || []).filter(x => x.completes_title).map(x => x.rewatch_no)) + 1 : (e.ratings?._is_rewatching ? rc : 1);
    const { error } = await sb.from('diary_watches').insert({
      user_id: st.user.id, entry_id: e.id, tmdb_id: e.tmdb_id, tmdb_type: e.tmdb_type, cat: e.cat, title: e.title, poster_url: e.poster_url,
      season, episode, watched_date: s, watched_at: time ? new Date(`${s}T${time}:00`).toISOString() : null,
      is_rewatch: no > 1, rewatch_no: no, completes_title: !!done, source: 'past',
    });
    if (error) throw error;
    showToast(`Logged · ${fmt(s, { day: 'numeric', month: 'short', year: 'numeric' })}`);
    forget(); st.day = s; draw();
  }
  // Added to your library through the normal Add to Library: the Diary logged it on that day (112);
  // put it at the time you gave, then offer to rate it
  async function afterAdded(entry, s, time, season, episode) {
    st.entries.set(entry.id, entry);
    const { data } = await sb.from('diary_watches').select('id,season,episode,watched_date').eq('entry_id', entry.id);
    const mineNow = (data || []).filter(r => season ? r.season === season && r.episode === episode : r.watched_date === s);
    if (mineNow.length) await sb.from('diary_watches').update({ watched_date: s, watched_at: time ? new Date(`${s}T${time}:00`).toISOString() : null }).in('id', mineNow.map(r => r.id));
    forget(); st.day = s; await draw();
    showActionToast(`Added “${entry.title}” · ${fmt(s, { day: 'numeric', month: 'short', year: 'numeric' })}`, 'Rate it', () => goToDetail(entry.id, 'diary.html'), 8000);
  }

  /* ── Moving around ── */
  async function step(dir) {
    if (onlyWatchDays() && st.view !== 'year') {
      const d = await nextWatchDay(dir);
      if (d) { st.day = d; return draw(); }
      showToast(dir > 0 ? 'No later watches.' : 'No earlier watches.');
      return;
    }
    st.day = st.view === 'day' ? addDays(st.day, dir) : st.view === 'week' ? addDays(st.day, 7 * dir)
      : st.view === 'month' ? addMonths(st.day, dir) : addMonths(st.day, 12 * dir);
    draw();
  }
  // "Only dates with watches": the next (or previous) day, week or month that has one
  async function nextWatchDay(dir) {
    const [a, b] = st.view === 'day' ? [st.day, st.day] : st.view === 'week' ? [weekOf(st.day), addDays(weekOf(st.day), 6)] : [monthStart(st.day), monthEnd(st.day)];
    let from = dir > 0 ? b : a;
    for (let tries = 0; tries < 10; tries++) {
      let q = sb.from('diary_watches').select(COLS);
      q = dir > 0 ? q.gt('watched_date', from).order('watched_date') : q.lt('watched_date', from).order('watched_date', { ascending: false });
      const { data } = await q.limit(300);
      if (!data?.length) return null;
      data.forEach(enrich);
      // the filters run over the rows on hand: put these in, ask, then take the first that passes
      const extra = data.filter(r => !st.byDay.get(r.watched_date)?.some(x => x.id === r.id));
      extra.forEach(r => { const arr = st.byDay.get(r.watched_date) || []; arr.push(r); st.byDay.set(r.watched_date, arr); });
      const ok = passing ? new Set(SF.list('diary', 'all').map(r => r.id)) : null;
      const hit = data.find(r => !ok || ok.has(r.id));
      if (hit) return hit.watched_date;
      from = data[data.length - 1].watched_date;
    }
    return null;
  }
  function pickDay(d, open) {
    st.day = d;
    if (open || (!split() && (st.view === 'week' || st.view === 'year'))) { st.view = 'day'; put('view', 'day'); }
    draw().then(() => {
      const b = document.querySelector(`.dy-m-day[data-d="${d}"]`);
      if (b && !open) b.focus({ preventScroll: true });
      if (!split() && st.view === 'month') $('dyPanel')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    });
  }
  function wire() {
    $('dyPrev').onclick = () => step(-1);
    $('dyNext').onclick = () => step(1);
    $('dyToday').onclick = () => { st.day = today(); draw(); };
    $('dyTitle').onclick = () => MSSDateRange.pickDate({ value: st.day, label: 'Jump to', view: st.view === 'year' ? 'years' : undefined, onPick: v => { st.day = v; draw(); } });
    document.querySelector('.dy-views').addEventListener('click', ev => {
      const b = ev.target.closest('[data-view]'); if (!b) return;
      st.view = b.dataset.view; put('view', st.view); draw();
    });
    const main = $('dyMain');
    main.addEventListener('click', ev => {
      const t = ev.target.closest('[data-act], [data-d], [data-m]');
      if (!t) return;
      if (t.dataset.act === 'more') return more(t.dataset.ids.split(','));
      if (t.dataset.act === 'group') {
        const k = t.dataset.key;
        if (st.open.has(k)) st.open.delete(k); else st.open.add(k);
        const g = t.closest('.dy-group'), body = g.querySelector('.dy-group-body'), open = st.open.has(k);
        const rows = allRows().filter(r => (r.batch_id || r.id) === k).filter((r, i, a) => a.findIndex(x => x.id === r.id) === i).sort((a, b) => a.season - b.season || a.episode - b.episode);
        body.innerHTML = open ? rows.map(r => entryHTML(r)).join('') : '';
        body.hidden = !open; g.classList.toggle('is-open', open); t.setAttribute('aria-expanded', String(open));
        if (open) fillEpisodes(body);
        return;
      }
      if (t.dataset.m) { st.day = t.dataset.m; st.view = 'month'; put('view', 'month'); return draw(); }
      if (t.dataset.d) pickDay(t.dataset.d, st.view === 'year' || (st.view === 'week' && !split() && t.classList.contains('dy-w-head')));
    });
    // the month grid: arrow keys between days, Home / End for the week, Page Up / Down for months
    main.addEventListener('keydown', ev => {
      const b = ev.target.closest('.dy-m-day'); if (!b) return;
      const rtl = getComputedStyle(b).direction === 'rtl';
      const k = ev.key, d = b.dataset.d;
      let to = null;
      if (k === 'ArrowLeft') to = addDays(d, rtl ? 1 : -1);
      else if (k === 'ArrowRight') to = addDays(d, rtl ? -1 : 1);
      else if (k === 'ArrowUp') to = addDays(d, -7);
      else if (k === 'ArrowDown') to = addDays(d, 7);
      else if (k === 'Home') to = weekOf(d);
      else if (k === 'End') to = addDays(weekOf(d), 6);
      else if (k === 'PageUp') to = addMonths(d, -1);
      else if (k === 'PageDown') to = addMonths(d, 1);
      if (!to) return;
      ev.preventDefault();
      st.day = to;
      draw().then(() => document.querySelector(`.dy-m-day[data-d="${to}"]`)?.focus());
    });
    // swipe the calendar for the next / previous one
    let sx = null, sy = null;
    main.addEventListener('touchstart', ev => { if (!ev.target.closest('.dy-cal')) return; sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });
    main.addEventListener('touchend', ev => {
      if (sx == null) return;
      const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 40) step((dx < 0) !== (document.documentElement.dir === 'rtl') ? 1 : -1);
    }, { passive: true });
    let wasSplit = split();
    window.addEventListener('resize', () => { if (split() !== wasSplit) { wasSplit = split(); draw(); } });
  }

  /* ── Start ── */
  async function start(user) {
    st.user = user;
    const profile = window._navUserProfile || await getProfile(user.id);
    st.weekStart = profile?.week_start || regionWeekStart();
    const all = await getEntries(user.id).catch(() => []);
    all.forEach(e => st.entries.set(e.id, e));
    // a day from elsewhere (diary.html?d=2026-11-25 — On This Day's View in Diary): that day
    const d = new URLSearchParams(location.search).get('d');
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(day(d))) st.day = d;
    shell();
    // from a title's details page (diary.html?q=Title): every time you watched it
    const q = new URLSearchParams(location.search).get('q');
    if (q) SF._search('diary', q.slice(0, 120), true);
    await Promise.all([draw(), loadNoDate(false).then(drawNoDate), onThisDay()]);
  }
  function reload() { forget(); draw(); }
  // On This Day (115): a slim strip when today has anniversaries; from the notification
  // (diary.html?otd=2026-11-06) the cards open straight away
  async function onThisDay() {
    if (typeof MSSOtd === 'undefined') return;
    const want = new URLSearchParams(location.search).get('otd');
    try {
      const rows = await MSSOtd.list(today());
      MSSOtd.strip($('dyOtd'), rows);
      if (want) { const list = want === today() ? rows : await MSSOtd.list(want); if (list.length) MSSOtd.open(list); }
    } catch (err) { console.warn('On This Day:', err); }
  }

  // Loading skeleton: the month and the day, from the real markup
  mssSkeleton.define('diary', () => {
    const sample = { id: 's', title: 'Sample title', cat: 'tv', season: 1, episode: 1, watched_date: today(), watched_at: null, poster_url: null };
    return `<div class="dy-head"><div class="dy-head-main"><div class="lp-eyebrow" data-skel-keep>Library · Diary</div><h1 class="dy-title-wrap"><span class="dy-title">November 2026</span></h1><div class="dy-count">23 watches</div></div></div>
      <div class="dy-body dy-v-month"><div class="dy-cal">${monthHTML(today(), false)}</div><div class="dy-panel"><div class="dy-day-head"><h2 class="dy-day-t">Tuesday 25 November 2026</h2></div><div class="dy-list">${entryHTML(sample)}${entryHTML(sample)}</div></div></div>`;
  });

  document.addEventListener('DOMContentLoaded', () => {
    initPage(user => {
      if (!user) { $('dyRoot').innerHTML = mssGuestEmpty('diary'); return; }
      start(user).catch(err => { console.error(err); $('dyRoot').innerHTML = mssEmpty({ art: 'episodes', title: 'Couldn’t open your Diary', text: 'Check your connection and try again.', actions: [{ label: 'Try again', icon: 'refresh', onclick: 'location.reload()' }] }); });
    });
  });

  return { add, reload, openNoDate };
})();
