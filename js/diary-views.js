/* ══════════════════════════════════════════
   diary-views.js — the Diary page (diary.html): every watch, on the day you watched it
   Private: only your own watches (diary_watches, 110). Logged by the database (112).
   Diary redesign (14 Nov 2026): five views of the same watches, one control row.

   Header: "Library · Diary", the period in big type (tap it to jump anywhere), one stats line;
   Timeline · Day · Week · Month · Year (remembered), ‹ Today ›, search, Filter (+ Log a watch on
   Timeline). A gold strip when watches have no day → the Set dates page (?dates=1).
     Timeline  every watch, newest first, under its date; each episode its own row (show poster,
               title, S · E · episode name, time, its own score on the right); older ones load as
               you scroll; the title jumps to a date
     Day       the picked day in full (desktop: beside a small month and the month in numbers)
     Week      all 7 days, big posters, "Nothing logged · + Add" on empty days (phones: a row a day)
     Month     posters fill the day (1–4 titles share it; more → the best-rated one + a count, 9+);
               a show's episodes that day are one poster with "N ep"; the picked day and the month in
               numbers beside it (phones: under it). Arrow keys, Home / End, Page Up / Down
     Year      a card per month: 4 posters, the count, a bar against the busiest month, "Mostly …"
   Calendar views group a show's episodes per day; the Timeline never does.
   Filters (the site's Filter popup): Type · First watch / Rewatch · Rated / Unrated · Genre ·
   "Only dates with watches" (‹ › jump between watch days). Search lists every watch of a title.
   Times show only when one was saved (an exact midnight is a day without a time).

   The profile's Diary tab (26 Nov 2026, owner: Timeline only): MSSDiaryPage.mount(el, { userId, own, name })
   draws the Timeline inside a tab, view-only — no other views, logging, ⋯, search, filters, No date
   strip or On This Day; just ‹ Today › and jump-to-date (At a glance beside it on desktop). Your own
   profile reads your rows; someone else's reads 146 (get_profile_diary_page / _years / get_profile_diary:
   only titles you may see, as their Library). Until 146 runs their tab says so.
══════════════════════════════════════════ */
const MSSDiaryPage = (() => {
  const VIEWS = ['timeline', 'day', 'week', 'month', 'year'];
  const COLS = 'id,entry_id,tmdb_id,tmdb_type,cat,title,poster_url,season,episode,watched_at,watched_date,has_time,is_rewatch,rewatch_no,completes_title,rating_at_watch,batch_id,source,created_at';
  const CAT_LABEL = { movies: 'Movie', tv: 'TV Show', anime: 'Anime', cartoons: 'Cartoon' };
  const TL_PAGE = 60;
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
  const shortDate = s => fmt(s, { month: 'short', day: 'numeric', year: 'numeric' });     // Oct 25, 2026
  const dayMonth = s => fmt(s, { month: 'short', day: 'numeric' });                         // Oct 25
  const longDate = s => fmt(s, { month: 'long', day: 'numeric', year: 'numeric' });         // October 25, 2026
  const weekday = s => fmt(s, { weekday: 'long' });
  // a saved time; an exact midnight is a day that was saved without one (imports, the backfill)
  const hasTime = r => { if (!r.watched_at) return false; const d = new Date(r.watched_at); return !!(d.getHours() || d.getMinutes() || d.getSeconds() || d.getMilliseconds()); };
  const timeOf = r => new Date(r.watched_at).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' });
  const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const today = () => iso(new Date());
  const esc = s => escHTML(s == null ? '' : String(s));
  const small = url => url ? String(url).replace('/w500/', '/w185/').replace('/original/', '/w185/') : '';
  const isMovie = r => r.tmdb_type === 'movie' || r.cat === 'movies';
  const get = k => { try { return localStorage.getItem(LS(k)); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(LS(k), v); } catch {} };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const se = r => `S${r.season} · E${pad(r.episode)}`;

  // The Timeline is the Diary's front page: everyone starts there once, then the view you left it on
  const st = {
    user: null, view: VIEWS.includes(get('view2')) ? get('view2') : 'timeline', day: today(), weekStart: 1,
    byDay: new Map(), loaded: new Set(), entries: new Map(), years: null,
    prevRatings: new Map(), eps: new Map(), open: new Set(), search: null, dates: false, monthN: new Map(),
    nodate: { n: 0, rows: [], waiting: [] },
    tl: { rows: [], off: 0, done: false, busy: false, from: null },
    tab: null,   // the profile's Diary tab: { el, userId, own, name } — view-only
  };
  const $ = id => document.getElementById(id);
  const ro = () => !!st.tab;                       // view-only (a profile's Diary tab)
  const other = () => !!st.tab && !st.tab.own;     // someone else's diary (get_profile_diary, 146)
  const scoreWho = () => other() ? 'Their score' : 'Your score';
  const whose = () => other() ? 'their' : 'your';

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
  const weekDays = () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((jsDow(st.weekStart) + i) % 7), 12));   // 7 Jan 2024 was a Sunday

  /* ── Loading (only what's on screen) ── */
  async function fetchRows(from, to) {
    const out = [];
    if (other()) {
      // someone else's: a month per call (146 takes at most 62 days), only titles you may see
      const calls = [];
      for (let a = from; a <= to; a = addMonths(monthStart(a), 1)) {
        const b = monthEnd(a) < to ? monthEnd(a) : to;
        calls.push(sb.rpc('get_profile_diary', { p_user: st.tab.userId, p_from: a, p_to: b }));
      }
      for (const { data, error } of await Promise.all(calls)) { if (error) throw error; out.push(...(data || [])); }
      return out;
    }
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
    if (other()) return;   // someone else's earlier scores aren't read (their diary table is private)
    const ids = [...new Set(rows.filter(r => r.completes_title && r.is_rewatch && r.entry_id && !st.prevRatings.has(r.entry_id)).map(r => r.entry_id))];
    if (!ids.length) return;
    const { data } = await sb.from('diary_watches').select('entry_id,rewatch_no,rating_at_watch,watched_date').eq('completes_title', true).in('entry_id', ids.slice(0, 200));
    ids.forEach(id => st.prevRatings.set(id, (data || []).filter(x => x.entry_id === id)));
  }
  function forget() { st.byDay.clear(); st.loaded.clear(); st.prevRatings.clear(); st.years = null; st.monthN.clear(); }

  // Watches per year (the Year chips, the Timeline's count): just the days, a page at a time
  async function loadYears() {
    if (st.years) return;
    const years = new Map();
    if (other()) {
      const { data, error } = await sb.rpc('get_profile_diary_years', { p_user: st.tab.userId });
      if (error) throw error;
      (data || []).forEach(r => years.set(String(r.yr), Number(r.n)));
      st.years = years;
      return;
    }
    for (let off = 0; off < 100000; off += 1000) {
      const { data, error } = await sb.from('diary_watches').select('watched_date').not('watched_date', 'is', null).order('watched_date').range(off, off + 999);
      if (error) throw error;
      (data || []).forEach(r => { const y = r.watched_date.slice(0, 4); years.set(y, (years.get(y) || 0) + 1); });
      if (!data || data.length < 1000) break;
    }
    st.years = years;
  }
  // Watches without a day; "I don't remember" ones (date_unknown, 125 — this device until it runs) don't ask
  async function loadNoDate() {
    const rows = [];
    let cols = COLS + ',date_unknown';
    for (let off = 0; off < 20000; off += 1000) {
      let { data, error } = await sb.from('diary_watches').select(cols).is('watched_date', null).order('title').order('season', { nullsFirst: true }).order('episode', { nullsFirst: true }).range(off, off + 999);
      if (error && cols !== COLS && /date_unknown/.test(error.message || '')) { cols = COLS; off -= 1000; continue; }
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const kept = MSSDiary.unknownIds();
    rows.forEach(r => { enrich(r); if (cols === COLS) r.date_unknown = kept.has(r.id); });
    st.nodate.rows = rows;
    st.nodate.n = rows.length;
    st.nodate.waiting = rows.filter(r => !r.date_unknown);
  }

  /* ── The Timeline: newest first, a page at a time ── */
  function tlQuery() {
    let q = sb.from('diary_watches').select(COLS).not('watched_date', 'is', null);
    if (st.tl.from) q = q.lte('watched_date', st.tl.from);
    return q.order('watched_date', { ascending: false }).order('watched_at', { ascending: false, nullsFirst: false })
      .order('season', { ascending: false, nullsFirst: false }).order('episode', { ascending: false, nullsFirst: false }).order('id');
  }
  // a page of the Timeline, newest first: your rows, or someone else's through 146
  function tlPage(off, n) {
    if (other()) return sb.rpc('get_profile_diary_page', { p_user: st.tab.userId, p_before: st.tl.from, p_offset: off, p_limit: n });
    return tlQuery().range(off, off + n - 1);
  }
  function tlReset(from = null) { st.tl = { rows: [], off: 0, done: false, busy: false, from }; }
  async function tlMore() {
    const tl = st.tl;
    if (tl.busy || tl.done || st.search || st.view !== 'timeline') return;
    tl.busy = true; tlFoot();
    try {
      const { data, error } = await tlPage(tl.off, TL_PAGE);
      if (error) throw error;
      if (tl !== st.tl) return;
      const rows = (data || []).map(enrich);
      await prevRatingsFor(rows);
      tl.rows.push(...rows); tl.off += rows.length; tl.done = rows.length < TL_PAGE;
      refreshPassing();
      tlAppend(rows.filter(passes));
    } catch (err) { console.error(err); tl.failed = true; }
    finally { tl.busy = false; }
    if (tl !== st.tl) return;
    tlFoot();
    // still near the end (a short page, or filters hid most of it): keep going
    const s = $('dyTlMore');
    if (s && !tl.done && !tl.failed && s.getBoundingClientRect().top < innerHeight + 900) tlMore();
  }
  // After a change: the same number of rows again, so the page stays where it was
  async function tlReload() {
    const want = Math.max(st.tl.off, TL_PAGE), from = st.tl.from;
    tlReset(from);
    const rows = [];
    for (let off = 0; off < want; off += 1000) {
      const { data, error } = await tlQuery().range(off, Math.min(off + 999, want - 1));
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < Math.min(1000, want - off)) { st.tl.done = true; break; }
    }
    rows.forEach(enrich);
    await prevRatingsFor(rows);
    st.tl.rows = rows; st.tl.off = rows.length;
  }

  /* ── Filters: the site's Filter popup (sort-filter.js) ── */
  SF.register('diary', {
    base: () => st.search ? st.search.rows : [...st.byDay.values()].flat().concat(st.tl.rows),
    render: () => draw(),
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
    if (st.tab) { passing = null; return; }   // no filters on the profile tab
    const any = SF.filterCount('diary', 'all') - (choice().only === 'all' ? 1 : 0) > 0;
    passing = any ? new Set(SF.list('diary', 'all').map(r => r.id)) : null;
  }
  const rowsOn = s => (st.byDay.get(s) || []).filter(passes);
  const rowsIn = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(...rowsOn(d)); return out; };

  /* ── Search: every watch of a title ── */
  let searchSeq = 0;
  async function search(q) {
    q = (q || '').trim();
    const seq = ++searchSeq;
    if (!q) { st.search = null; return draw(); }
    const { data } = await sb.from('diary_watches').select(COLS).ilike('title', `%${q.replace(/[%_\\]/g, '\\$&')}%`)
      .order('watched_date', { ascending: false, nullsFirst: false }).order('watched_at', { ascending: false, nullsFirst: false })
      .order('season', { ascending: false, nullsFirst: false }).order('episode', { ascending: false, nullsFirst: false }).limit(500);
    if (seq !== searchSeq) return;
    st.search = { q, rows: (data || []).map(enrich) };
    await prevRatingsFor(st.search.rows);
    draw();
  }

  /* ── Episode names (TMDB, cached by episode-ratings.js) ── */
  async function fillEpisodes(root) {
    const want = new Map();
    root.querySelectorAll('[data-ep]').forEach(el => { const [t, s] = el.dataset.ep.split(':'); want.set(`${t}:${s}`, [t, s]); });
    await Promise.all([...want.values()].map(async ([t, s]) => {
      const k = `${t}:${s}`;
      if (!st.eps.has(k)) st.eps.set(k, MSSEp.seasonEpisodes(Number(t), Number(s)).catch(() => []));
      const eps = await st.eps.get(k);
      root.querySelectorAll(`[data-ep^="${k}:"]`).forEach(el => {
        const n = Number(el.dataset.ep.split(':')[2]), ep = eps.find(x => x.n === n);
        const name = el.querySelector('.dy-ep-name');
        if (name && ep?.name && !/^Episode \d+$/i.test(ep.name) && !name.textContent) name.textContent = ep.name;
      });
    }));
  }

  /* ── Pieces ── */
  function hrefOf(r) {
    if (!r.tmdb_id) return null;
    if (r.season != null && !isMovie(r)) return `episode.html?show=${r.tmdb_id}&s=${r.season}&e=${r.episode}`;
    return `title.html?type=${isMovie(r) ? 'movie' : 'tv'}&id=${r.tmdb_id}`;
  }
  const num = v => v == null ? null : Number(v);
  const scoreChip = (v, cls = '') => v == null ? '' : `<span class="dy-sc ep-band-${mssScoreTier(v).key}${mssIsGold(v) ? ' is-gold' : ''}${cls ? ' ' + cls : ''}" aria-label="Your score ${mssR1(v)}">${icon('star', 11)}${mssR1(v)}</span>`;
  const typeTag = r => `<span class="dy-type${isMovie(r) ? ' is-movie' : ''}">${esc(CAT_LABEL[r.cat] || (isMovie(r) ? 'Movie' : 'TV Show'))}</span>`;
  const rewatchTag = r => r.is_rewatch && r.rewatch_no > 1 ? `<span class="dy-tag is-re">${icon('refresh', 11)}${ord(r.rewatch_no)} watch</span>` : '';
  const art = (r, cls = 'dy-art') => `<span class="${cls}">${r.poster_url ? `<img src="${esc(small(r.poster_url))}" alt="" loading="lazy">` : `<span class="dy-art-ph" aria-hidden="true">${esc((r.title || '?')[0])}</span>`}</span>`;
  const moreBtn = (ids, label) => ro() ? '' : `<button type="button" class="dy-more" data-act="more" data-ids="${esc(ids.join(','))}" aria-label="Options for ${esc(label)}">${icon('moreV', 17)}</button>`;
  const byEp = (a, b) => (a.season ?? -1) - (b.season ?? -1) || (a.episode ?? -1) - (b.episode ?? -1);
  // "S1 E1–E8" · "S1–S4" for several episodes
  function rangeText(rows) {
    const eps = rows.filter(r => r.season != null).sort(byEp);
    if (!eps.length) return '';
    const a = eps[0], b = eps[eps.length - 1];
    if (eps.length === 1) return `S${a.season} E${a.episode}`;
    if (a.season === b.season) return `S${a.season} E${a.episode}–E${b.episode}`;
    return `S${a.season}–S${b.season}`;
  }
  function ratingLine(r) {
    if (!r.completes_title || !r.is_rewatch) return '';
    const before = (st.prevRatings.get(r.entry_id) || []).filter(x => x.rewatch_no < r.rewatch_no && x.rating_at_watch != null)
      .sort((a, b) => b.rewatch_no - a.rewatch_no)[0];
    if (!before) return '';
    const was = mssR1(Number(before.rating_at_watch));
    return r.rating_at_watch != null && Number(r.rating_at_watch) !== Number(before.rating_at_watch)
      ? `<span class="dy-it-rate">Rated ${was} → ${mssR1(Number(r.rating_at_watch))} on rewatch</span>`
      : `<span class="dy-it-rate">Previously ${was}</span>`;
  }

  // A day's watches per title: a show's episodes that day are one item (a rewatch run on its own)
  function titleItems(rows) {
    const m = new Map();
    rows.forEach(r => {
      const k = r.season != null ? `${r.entry_id || r.title}|${r.rewatch_no}` : r.id;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()].map(([k, list]) => {
      list.sort(byEp);
      const lead = list.find(x => x.completes_title) || list[list.length - 1];
      // one watch: its score; several episodes: the show's, only when this day finished it
      const score = list.length === 1 ? num(list[0].rating_at_watch) : num(list.find(x => x.completes_title && x.rating_at_watch != null)?.rating_at_watch);
      const timed = list.filter(hasTime).sort((a, b) => Date.parse(a.watched_at) - Date.parse(b.watched_at));
      return { key: k, rows: list, lead, score, eps: list.filter(x => x.season != null).length,
        bulk: list.length > 1 && list.some(x => x.batch_id || x.source === 'bulk'), first: timed[0] || null };
    });
  }
  const byTime = (a, b) => (a.first ? Date.parse(a.first.watched_at) : Infinity) - (b.first ? Date.parse(b.first.watched_at) : Infinity);
  const bestFirst = items => [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  /* ── The picked day ── */
  function itemHTML(it) {
    const r = it.lead, many = it.rows.length > 1, ids = it.rows.map(x => x.id);
    const finished = it.rows.some(x => x.completes_title);
    const label = many ? `${r.title} · ${rangeText(it.rows)}` : `${r.title}${r.season != null ? ` · S${r.season} E${r.episode}` : ''}`;
    const meta = [
      many ? `<span>${esc(rangeText(it.rows))} · ${plural(it.eps, 'episode')}</span>` : r.season != null ? `<span data-ep-wrap>S${r.season} E${r.episode}<span class="dy-ep-name"></span></span>` : '',
      finished ? `<span class="dy-done">${icon('check', 12)}Finished</span>` : '',
      it.first ? `<span class="dy-time">${icon('clock', 12)}${esc(timeOf(it.first))}</span>` : '',
    ].filter(Boolean).join('');
    const tags = typeTag(r) + (it.bulk ? '<span class="dy-tag">Logged in bulk</span>' : '') + rewatchTag(r);
    const artHTML = `<span class="dy-it-art">${art(r)}${many ? `<b class="dy-it-n" aria-hidden="true">${it.rows.length}</b>` : ''}</span>`;
    const text = `<span class="dy-it-text"><span class="dy-it-tags">${tags}</span><span class="dy-it-title" translate="no">${esc(r.title)}</span><span class="dy-it-meta">${meta}</span>${many ? '' : ratingLine(r)}</span>`;
    if (!many) {
      const href = hrefOf(r);
      return `<article class="dy-it"${r.season != null && r.tmdb_id ? ` data-ep="${r.tmdb_id}:${r.season}:${r.episode}"` : ''}>
          ${href ? `<a class="dy-it-main" href="${esc(href)}">${artHTML}${text}</a>` : `<div class="dy-it-main">${artHTML}${text}</div>`}
          ${scoreChip(it.score)}${moreBtn(ids, label)}
        </article>`;
    }
    const open = st.open.has(it.key), id = 'dyG' + String(it.key).replace(/[^a-z0-9]/gi, '').slice(-14);
    return `<article class="dy-it is-group${open ? ' is-open' : ''}">
        <button type="button" class="dy-it-main" data-act="group" data-key="${esc(it.key)}" aria-expanded="${open}" aria-controls="${id}">${artHTML}${text}<span class="dy-chev" aria-hidden="true">${icon('chevdown', 16)}</span></button>
        ${scoreChip(it.score)}${moreBtn(ids, label)}
        <div class="dy-it-eps" id="${id}"${open ? '' : ' hidden'}>${open ? epRowsHTML(it.rows) : ''}</div>
      </article>`;
  }
  // a group opened: its episodes, each with its own score and ⋯
  const epRowsHTML = rows => rows.map(r => `<div class="dy-ep"${r.tmdb_id ? ` data-ep="${r.tmdb_id}:${r.season}:${r.episode}"` : ''}>
      <a class="dy-ep-main"${hrefOf(r) ? ` href="${esc(hrefOf(r))}"` : ''}><b>S${r.season} E${r.episode}</b><span class="dy-ep-name"></span>${hasTime(r) ? `<span class="dy-time">${esc(timeOf(r))}</span>` : ''}${r.completes_title ? `<span class="dy-done">${icon('check', 12)}Finished</span>` : ''}</a>
      ${scoreChip(num(r.rating_at_watch), 'is-sm')}${moreBtn([r.id], `${r.title} · S${r.season} E${r.episode}`)}
    </div>`).join('');

  function selHTML(s) {
    const rows = rowsOn(s), items = titleItems(rows).sort(byTime);
    return `<section class="dy-card dy-sel" aria-labelledby="dySelT">
        <div class="dy-sel-head">
          <div><div class="dy-eyebrow">${esc(weekday(s))}</div><h2 class="dy-sel-t" id="dySelT">${esc(shortDate(s))}</h2></div>
          ${rows.length ? `<span class="dy-pill">${plural(rows.length, 'watch', 'watches')}</span>` : ''}
        </div>
        ${items.length ? `<div class="dy-sel-list">${items.map(itemHTML).join('')}</div>` : `<p class="dy-sel-empty">Nothing logged on ${esc(dayMonth(s))}.</p>`}
        <button type="button" class="dy-log" data-add="${s}">${icon('plus', 14)}Log something on ${esc(dayMonth(s))}</button>
      </section>`;
  }

  /* ── The month in numbers ── */
  function numbersHTML(anchor) {
    const first = monthStart(anchor), last = monthEnd(anchor), rows = rowsIn(first, last);
    const films = rows.filter(isMovie).length, eps = rows.filter(r => r.season != null).length;
    const rewatches = new Set(rows.filter(r => r.is_rewatch && r.rewatch_no > 1).map(r => `${r.entry_id || r.title}|${r.rewatch_no}`)).size;
    const days = Number(last.slice(8)), counts = Array.from({ length: days }, (_, i) => rowsOn(`${first.slice(0, 8)}${pad(i + 1)}`).length);
    const max = Math.max(1, ...counts), busiest = counts.indexOf(Math.max(...counts));
    // titles finished this month with a score: the best, the lowest and their average
    const done = rows.filter(r => r.completes_title && r.rating_at_watch != null).map(r => ({ r, v: Number(r.rating_at_watch) })).sort((a, b) => b.v - a.v);
    const avg = done.length ? done.reduce((a, x) => a + x.v, 0) / done.length : null;
    const tile = (n, l) => `<div class="dy-stat"><b>${n.toLocaleString()}</b><span>${l}</span></div>`;
    const pickRow = (x, label, cls) => `<a class="dy-best${cls}"${hrefOf(x.r) ? ` href="${esc(hrefOf(x.r))}"` : ''}>${art(x.r)}<span class="dy-best-t"><small>${label}</small><b translate="no">${esc(x.r.title)}</b></span>${scoreChip(x.v)}</a>`;
    const name = fmt(first, { month: 'long' });
    return `<section class="dy-card dy-nums" aria-labelledby="dyNumsT">
        <h2 class="dy-eyebrow" id="dyNumsT">${esc(name)} in numbers</h2>
        <div class="dy-stats">${tile(rows.length, 'Watches')}${tile(films, 'Films')}${tile(eps, 'Episodes')}${tile(rewatches, 'Rewatches')}</div>
        ${rows.length ? `<div class="dy-bars" aria-hidden="true">${counts.map((n, i) => `<i class="${`${first.slice(0, 8)}${pad(i + 1)}` === st.day ? 'is-on' : ''}" style="height:${n ? Math.max(8, Math.round(n / max * 100)) : 0}%"></i>`).join('')}</div>
          <div class="dy-bars-axis" aria-hidden="true"><span>1</span><span>${days}</span></div>
          <p class="sr-only">Busiest day: ${esc(dayMonth(`${first.slice(0, 8)}${pad(busiest + 1)}`))}, ${plural(counts[busiest], 'watch', 'watches')}.</p>` : ''}
        ${done.length ? pickRow(done[0], 'Best of the month', ' is-top') : ''}
        ${done.length > 1 ? pickRow(done[done.length - 1], 'Lowest score', '') : ''}
        ${avg != null ? `<div class="dy-avg"><span>Average score of finished titles</span>${scoreChip(avg)}</div>` : ''}
      </section>`;
  }

  /* ── Month ── */
  // the day square: 1–4 titles share it, more → the best-rated one and a count (9+)
  function cellArt(items) {
    if (!items.length) return '';
    const shown = items.length > 4 ? [bestFirst(items)[0]] : bestFirst(items);
    const img = it => it.lead.poster_url ? `<img src="${esc(small(it.lead.poster_url))}" alt="" loading="lazy">` : `<i>${esc((it.lead.title || '?')[0])}</i>`;
    let badge = '';
    if (items.length > 1) badge = `<b class="dy-m-badge">${items.length > 9 ? '9+' : items.length}</b>`;
    else if (items[0].rows.length > 1) badge = `<b class="dy-m-badge is-ep">${items[0].rows.length} ep</b>`;
    else if (items[0].score != null) badge = scoreChip(items[0].score, 'dy-m-sc');
    return `<span class="dy-m-art n${shown.length}">${shown.map(img).join('')}</span>${badge}`;
  }
  function monthHTML(anchor, compact) {
    const first = monthStart(anchor), last = monthEnd(anchor), start = weekOf(first);
    const t = today(), wd = weekDays(), weeks = [];
    let s = start;
    while (s <= last) {
      const row = [];
      for (let i = 0; i < 7; i++, s = addDays(s, 1)) row.push(s);
      weeks.push(row);
    }
    const cells = weeks.map(row => `<div class="dy-m-row" role="row">${row.map(d => {
      const out = d.slice(0, 7) !== first.slice(0, 7), rs = out ? [] : rowsOn(d), items = titleItems(rs);
      const label = `${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}, ${rs.length ? `${plural(rs.length, 'watch', 'watches')}: ${items.slice(0, 4).map(x => x.lead.title).join(', ')}${items.length > 4 ? ` and ${items.length - 4} more` : ''}` : 'nothing logged'}`;
      return `<div class="dy-m-cell" role="gridcell" aria-selected="${d === st.day}">${out ? '' : `<button type="button" class="dy-m-day${rs.length ? ' has' : ''}${d === t ? ' is-today' : ''}${d === st.day ? ' is-picked' : ''}" data-d="${d}" tabindex="${d === st.day ? 0 : -1}" aria-label="${esc(label)}"${d === t ? ' aria-current="date"' : ''}>
          ${compact ? (rs.length ? `<b class="dy-m-dot" aria-hidden="true">${rs.length > 9 ? '9+' : rs.length}</b>` : '') : cellArt(items)}
          <span class="dy-m-num">${Number(d.slice(8))}</span>
        </button>`}</div>`;
    }).join('')}</div>`).join('');
    return `<div class="dy-month${compact ? ' is-compact' : ''}" role="grid" aria-label="${esc(fmt(first, { month: 'long', year: 'numeric' }))}" aria-readonly="true">
        <div class="dy-m-row dy-m-head" role="row">${wd.map(d => `<div class="dy-m-wd" role="columnheader"><abbr title="${esc(d.toLocaleDateString(lang(), { weekday: 'long' }))}"><span class="dy-wd-s">${esc(d.toLocaleDateString(lang(), { weekday: 'short' }))}</span><span class="dy-wd-n" aria-hidden="true">${esc(d.toLocaleDateString(lang(), { weekday: 'narrow' }))}</span></abbr></div>`).join('')}</div>
        ${cells}
      </div>`;
  }
  const legendHTML = () => `<div class="dy-legend" aria-hidden="true"><span><i class="is-poster"></i>Poster = what you watched</span><span><i class="is-badge"></i>Badge = watches that day</span><span>${icon('star', 11)} = your score</span><span><i class="is-today"></i>Today</span></div>`;

  /* ── Week: all seven days ── */
  function weekHTML() {
    const start = weekOf(st.day), t = today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return `<div class="dy-week">${days.map(d => {
      const rs = rowsOn(d), items = titleItems(rs).sort(byTime), shown = items.length > 4 ? bestFirst(items).slice(0, 4) : items;
      const head = `<button type="button" class="dy-wk-head" data-d="${d}" data-open="1"${d === t ? ' aria-current="date"' : ''} aria-label="${esc(`${weekday(d)}, ${dayMonth(d)} — ${rs.length ? plural(rs.length, 'watch', 'watches') : 'nothing logged'}. Open the day`)}">
          <span class="dy-wk-wd">${esc(fmt(d, { weekday: 'short' }))}</span><span class="dy-wk-date">${esc(dayMonth(d))}</span>${rs.length ? `<b class="dy-wk-n">${rs.length > 9 ? '9+' : rs.length}</b>` : ''}</button>`;
      const body = items.length ? `<div class="dy-wk-list">${shown.map(it => {
          const r = it.lead, many = it.rows.length > 1;
          const sub = many ? `${rangeText(it.rows)} · ${plural(it.eps, 'episode')}` : [r.season != null ? `S${r.season} E${r.episode}` : CAT_LABEL[r.cat] || 'Movie', it.first ? timeOf(it.first) : ''].filter(Boolean).join(' · ');
          return `<button type="button" class="dy-wk-item" data-d="${d}" data-open="1" aria-label="${esc(`${r.title}, ${sub}${it.score != null ? `, your score ${mssR1(it.score)}` : ''}`)}">
              <span class="dy-wk-art">${art(r, 'dy-art')}${many ? `<b class="dy-m-badge is-ep">${it.rows.length} ep</b>` : scoreChip(it.score, 'dy-m-sc')}${rewatchTag(r)}</span>
              <span class="dy-wk-t" translate="no">${esc(r.title)}</span><span class="dy-wk-s">${esc(sub)}</span>
            </button>`;
        }).join('')}${items.length > 4 ? `<button type="button" class="dy-wk-more" data-d="${d}" data-open="1">+${items.length - 4} more</button>` : ''}</div>`
        : `<button type="button" class="dy-wk-empty" data-add="${d}" aria-label="${esc(`Nothing logged on ${weekday(d)}, ${dayMonth(d)} — add a watch`)}"><span>Nothing logged</span><b>${icon('plus', 12)}Add</b></button>`;
      return `<section class="dy-wk-day${rs.length ? ' has' : ''}${d === t ? ' is-today' : ''}${d === st.day ? ' is-picked' : ''}" aria-label="${esc(`${weekday(d)}, ${longDate(d)}`)}">${head}${body}</section>`;
    }).join('')}</div>`;
  }

  /* ── Year: a card per month ── */
  function yearHTML(y) {
    const t = today(), nowM = t.slice(0, 7);
    const months = Array.from({ length: 12 }, (_, m) => {
      const first = `${y}-${pad(m + 1)}-01`, rows = rowsIn(first, monthEnd(first));
      const per = new Map();
      rows.forEach(r => { const k = r.entry_id || r.title; if (!per.has(k)) per.set(k, { r, n: 0 }); per.get(k).n++; });
      const top = [...per.values()].sort((a, b) => b.n - a.n);
      return { first, rows, top, future: first.slice(0, 7) > nowM, now: first.slice(0, 7) === nowM };
    });
    const busiest = Math.max(1, ...months.map(x => x.rows.length));
    const chips = st.years ? [...st.years.entries()].sort((a, b) => split() ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])) : [];
    return `${chips.length ? `<div class="dy-ychips" role="group" aria-label="Years">${chips.map(([yy, n]) => `<button type="button" class="dy-ychip" data-y="${yy}" aria-pressed="${yy === y}">${yy}<b>${n.toLocaleString()}</b></button>`).join('')}</div>` : ''}
      <div class="dy-yr">${months.map(x => {
        const name = fmt(x.first, { month: 'long' });
        if (x.future) return `<div class="dy-ym is-future"><span class="dy-ym-h"><b>${esc(name)}</b></span><span class="dy-ym-soon">Still to come</span></div>`;
        const posters = x.top.slice(0, 4);
        return `<button type="button" class="dy-ym${x.now ? ' is-now' : ''}" data-m="${x.first}" aria-label="${esc(`${name} ${y}: ${plural(x.rows.length, 'watch', 'watches')}${x.top.length ? `, mostly ${x.top[0].r.title}` : ''}. Open the month`)}">
            <span class="dy-ym-h"><b>${esc(name)}</b>${x.now ? '<i>Now</i>' : ''}</span>
            <span class="dy-ym-art">${Array.from({ length: 4 }, (_, i) => posters[i]?.r.poster_url ? `<img src="${esc(small(posters[i].r.poster_url))}" alt="" loading="lazy">` : '<i></i>').join('')}</span>
            <span class="dy-ym-n"><b>${x.rows.length.toLocaleString()}</b>${x.rows.length === 1 ? 'watch' : 'watches'}</span>
            <span class="dy-ym-bar" aria-hidden="true"><i style="width:${Math.round(x.rows.length / busiest * 100)}%"></i></span>
            <span class="dy-ym-most">${x.top.length ? `Mostly <b translate="no">${esc(x.top[0].r.title)}</b>${x.top.length > 1 ? ` + ${x.top.length - 1} more` : ''}` : 'Nothing logged'}</span>
          </button>`;
      }).join('')}</div>`;
  }

  /* ── Timeline ── */
  function tlRowHTML(r) {
    const href = hrefOf(r), ep = r.season != null && !isMovie(r), sc = num(r.rating_at_watch), time = hasTime(r) ? timeOf(r) : '';
    const label = `${r.title}${ep ? ` · S${r.season} E${r.episode}` : ''}`;
    const sub = ep ? `<span class="tl-ep"><b>${se(r)}</b><span class="dy-ep-name"></span></span>`
      : `<span class="tl-ep">${esc([CAT_LABEL[r.cat] || 'Movie', r.year].filter(Boolean).join(' · '))}</span>`;
    const tags = `${time ? `<span class="tl-mtime">${icon('clock', 11)}${esc(time)}</span>` : ''}${rewatchTag(r)}${r.completes_title ? `<span class="dy-done">${icon('check', 11)}Finished</span>` : ''}`;
    const inner = `<span class="tl-time" aria-hidden="true">${esc(time)}</span>${art(r, 'tl-art')}
        <span class="tl-main"><span class="tl-title" translate="no">${esc(r.title)}</span>${sub}${tags ? `<span class="tl-meta">${tags}</span>` : ''}</span>`;
    return `<li class="tl-row"${ep && r.tmdb_id ? ` data-ep="${r.tmdb_id}:${r.season}:${r.episode}"` : ''}>
        ${href ? `<a class="tl-link" href="${esc(href)}">${inner}</a>` : `<div class="tl-link">${inner}</div>`}
        <span class="tl-end">${sc != null ? `<span class="tl-sc${mssTierCls(sc)}${mssIsGold(sc) ? ' is-gold' : ''}" aria-label="${scoreWho()} ${mssR1(sc)}">${mssR1(sc)}</span>` : ''}${moreBtn([r.id], label)}</span>
      </li>`;
  }
  const tlDayHead = (d, n) => `<header class="tl-date"><span class="tl-wd">${esc(weekday(d))}</span><span class="tl-dn">${esc(longDate(d))}</span><span class="tl-n">${plural(n, 'watch', 'watches')}</span></header>`;
  function tlDaysHTML(rows) {
    const days = [];
    rows.forEach(r => { const last = days[days.length - 1]; if (last && last.d === r.watched_date) last.rows.push(r); else days.push({ d: r.watched_date, rows: [r] }); });
    return days.map(x => `<section class="tl-day" data-day="${x.d}">${tlDayHead(x.d, x.rows.length)}<ol class="tl-list">${x.rows.map(tlRowHTML).join('')}</ol></section>`).join('');
  }
  // new rows under the ones already shown: the first ones may join the last day
  function tlAppend(rows) {
    const box = $('dyTl');
    if (!box || !rows.length) return;
    const lastDay = box.querySelector('.tl-day:last-of-type');
    let i = 0;
    if (lastDay && lastDay.dataset.day === rows[0].watched_date) {
      while (i < rows.length && rows[i].watched_date === lastDay.dataset.day) i++;
      lastDay.querySelector('.tl-list').insertAdjacentHTML('beforeend', rows.slice(0, i).map(tlRowHTML).join(''));
      const n = lastDay.querySelectorAll('.tl-row').length;
      lastDay.querySelector('.tl-n').textContent = plural(n, 'watch', 'watches');
    }
    box.insertAdjacentHTML('beforeend', tlDaysHTML(rows.slice(i)));
    fillEpisodes(box);
  }
  function tlFoot() {
    const f = $('dyTlMore'); if (!f) return;
    const tl = st.tl, shown = $('dyTl')?.querySelector('.tl-row');
    f.innerHTML = tl.failed ? `<span>Couldn’t load older watches.</span><button type="button" class="dy-btn" onclick="MSSDiaryPage.more()">Try again</button>`
      : tl.busy ? `<span class="tl-busy">Loading older watches…</span>`
      : tl.done ? (shown ? `<span class="tl-end-t">${tl.from ? `The start of ${whose()} Diary` : `That’s everything — the start of ${whose()} Diary`}</span>` : '') : '';
  }
  function timelineHTML() {
    const rows = st.tl.rows.filter(passes);
    if (!rows.length && st.tl.done) {
      if (other()) return mssEmpty({ art: 'episodes', title: 'Nothing to show yet', text: 'Watches they log show up here — only titles they share with you.' });
      if (ro()) return mssEmpty({ art: 'episodes', title: 'Nothing in your Diary yet', text: 'Watch something, or log a past watch, and it shows up here.', actions: [{ label: 'Open your Diary', icon: 'calendar', href: 'diary.html' }] });
      return mssEmpty({ art: 'episodes', title: passing ? 'Nothing matches your filters' : 'Nothing in your Diary yet', text: passing ? 'Try a different filter.' : 'Watch something, or log a past watch, and it shows up here.',
        actions: passing ? [] : [{ label: 'Log a watch', icon: 'plus', primary: true, onclick: 'MSSDiaryPage.add()' }] });
    }
    return `<div class="tl" id="dyTl">${tlDaysHTML(rows)}</div><div class="tl-more" id="dyTlMore" aria-live="polite"></div>`;
  }
  // Desktop only (≥ 1200px, beside the Timeline): At a glance for this year, the Library's tiles and rows.
  // Its top line opens and closes it (remembered on the device). Phones don't get it.
  function streaks(y) {
    const on = d => rowsOn(d).length > 0, t = today();
    let cur = 0, d = on(t) ? t : addDays(t, -1);
    while (d.startsWith(y) && on(d)) { cur++; d = addDays(d, -1); }
    let best = 0, run = 0;
    for (let x = `${y}-01-01`; x <= t && x.startsWith(y); x = addDays(x, 1)) { run = on(x) ? run + 1 : 0; best = Math.max(best, run); }
    return { cur, best };
  }
  function glanceHTML() {
    const y = today().slice(0, 4), rows = rowsIn(`${y}-01-01`, today());
    const films = rows.filter(isMovie).length, eps = rows.filter(r => r.season != null).length, done = rows.filter(r => r.completes_title);
    const days = new Set(rows.map(r => r.watched_date)).size, sk = streaks(y);
    const per = new Map();
    rows.forEach(r => { const k = r.entry_id || r.title; if (!per.has(k)) per.set(k, { r, n: 0, eps: 0 }); const x = per.get(k); x.n++; if (r.season != null) x.eps++; });
    const top = [...per.values()].sort((a, b) => b.n - a.n).slice(0, 3);
    const rated = done.filter(r => r.rating_at_watch != null).map(r => Number(r.rating_at_watch));
    const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
    const years = st.years ? [...st.years.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6) : [];
    const maxY = Math.max(1, ...years.map(x => x[1]));
    const open = get('glance') !== '0';
    const kpi = (l, v, sub) => `<div class="lg-kpi"><dt>${l}</dt><dd><b>${esc(v)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;
    return `<section class="lib-glance dy-gl${open ? ' is-open' : ''}" aria-labelledby="dyGlH">
        <button type="button" class="dy-gl-head" aria-expanded="${open}" aria-controls="dyGlBody" data-act="glance">
          <span class="dy-gl-l"><h2 class="lg-kicker" id="dyGlH">At a glance · ${y}</h2><span class="dy-gl-line">${plural(rows.length, 'watch', 'watches')} · ${sk.cur ? `${plural(sk.cur, 'day')} streak` : `${plural(days, 'day')} watched`}</span></span>
          <span class="dy-chev" aria-hidden="true">${icon('chevdown', 16)}</span>
        </button>
        <div class="dy-gl-body" id="dyGlBody"${open ? '' : ' hidden'}>
          <dl class="lg-kpis dy-gl-kpis">${kpi('Watches', rows.length.toLocaleString(), `on ${plural(days, 'day')}`)}${kpi('Films', films.toLocaleString(), '')}${kpi('Episodes', eps.toLocaleString(), '')}${kpi('Finished', done.length.toLocaleString(), avg != null ? `avg ${avg.toFixed(2)}` : 'titles')}</dl>
          <div class="dy-gl-streak"><div><b>${sk.cur}</b><small>day streak now</small></div><div><b>${sk.best}</b><small>longest in ${y}</small></div></div>
          ${top.length ? `<h3 class="lg-h">Most watched in ${y}</h3><ul class="lg-rec">${top.map(x => `<li><a class="lg-rec-row"${hrefOf(x.r) && !x.eps ? ` href="${esc(hrefOf(x.r))}"` : x.r.tmdb_id ? ` href="title.html?type=${isMovie(x.r) ? 'movie' : 'tv'}&id=${x.r.tmdb_id}"` : ''}>
              <span class="lg-rec-poster" aria-hidden="true">${x.r.poster_url ? `<img src="${esc(small(x.r.poster_url))}" alt="" loading="lazy">` : ''}</span>
              <span class="lg-rec-t"><b translate="no">${esc(x.r.title)}</b><small>${x.eps ? plural(x.eps, 'episode') : plural(x.n, 'watch', 'watches')}</small></span></a></li>`).join('')}</ul>` : ''}
          ${years.length > 1 ? `<h3 class="lg-h">By year</h3><ul class="lg-bands dy-gl-years">${years.map(([yy, n]) => `<li><span>${yy}</span><span class="lg-band-bar" aria-hidden="true"><i style="width:${Math.round(n / maxY * 100)}%"></i></span><b>${n.toLocaleString()}</b></li>`).join('')}</ul>` : ''}
        </div>
      </section>`;
  }
  let tlObs = null;
  function tlWatch() {
    tlObs?.disconnect();
    const s = $('dyTlMore'); if (!s) return;
    tlObs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) tlMore(); }, { rootMargin: '900px 0px' });
    tlObs.observe(s);
  }

  /* ── The page ── */
  const split = () => matchMedia('(min-width: 1024px)').matches;
  function titleText() {
    if (st.dates) return 'Set dates';
    if (st.search) return 'Search';
    if (st.view === 'timeline') return 'Timeline';
    if (st.view === 'day') return shortDate(st.day);
    if (st.view === 'week') {
      const a = weekOf(st.day), b = addDays(a, 6), o = { day: 'numeric', month: 'short', year: 'numeric' };
      // "Oct 4 – 10, 2026" (the language's own way of writing a range)
      try { return new Intl.DateTimeFormat(lang(), o).formatRange(day(a), day(b)); }
      catch { return `${dayMonth(a)} – ${shortDate(b)}`; }
    }
    if (st.view === 'month') return fmt(st.day, { month: 'long', year: 'numeric' });
    return st.day.slice(0, 4);
  }
  const statLine = rows => {
    const films = rows.filter(isMovie).length, eps = rows.filter(r => r.season != null).length;
    const re = new Set(rows.filter(r => r.is_rewatch && r.rewatch_no > 1).map(r => `${r.entry_id || r.title}|${r.rewatch_no}`)).size;
    return [plural(rows.length, 'watch', 'watches'), plural(films, 'film'), plural(eps, 'episode'), plural(re, 'rewatch', 'rewatches')];
  };
  function countText() {
    if (st.view === 'timeline') {
      const total = st.years ? [...st.years.values()].reduce((a, b) => a + b, 0) : null;
      return st.tl.from ? `From ${shortDate(st.tl.from)} back` : total != null ? `${plural(total, 'watch', 'watches')} · newest first` : '';
    }
    if (st.view === 'day') return plural(rowsOn(st.day).length, 'watch', 'watches');
    if (st.view === 'week') {
      const a = weekOf(st.day), rows = rowsIn(a, addDays(a, 6));
      const on = Array.from({ length: 7 }, (_, i) => addDays(a, i)).filter(d => rowsOn(d).length).length;
      return `${plural(rows.length, 'watch', 'watches')} · ${on} of 7 days`;
    }
    if (st.view === 'month') return statLine(rowsIn(monthStart(st.day), monthEnd(st.day))).join(' · ');
    const y = st.day.slice(0, 4), rows = rowsIn(`${y}-01-01`, `${y}-12-31`);
    const s = statLine(rows);
    return [s[0], s[1], s[2], plural(rows.filter(r => r.completes_title).length, 'title') + ' finished'].join(' · ');
  }
  const unitName = () => ({ day: 'day', week: 'week', month: 'month', year: 'year' })[st.view];

  // The profile's Diary tab: the Timeline's head without views, logging, search or filters (an h2 — the profile has the h1)
  function tabShell() {
    const t = st.tab, who = t.own ? 'Your Diary' : `${t.name ? `${t.name}’s` : 'Their'} Diary`;
    t.el.innerHTML = `<div id="dyRoot" class="dy-tab">
      <div class="dy-head">
        <div class="dy-head-l">
          <div class="lib-kicker">${esc(who)}</div>
          <h2 class="dy-h1"><button type="button" class="dy-title" id="dyTitle" aria-label="Jump to a date"></button></h2>
          <div class="dy-sub" id="dyCount" aria-live="polite"></div>
        </div>
        <div class="dy-nav" id="dyNav">
          <button type="button" class="dy-ic" id="dyPrev">${icon('chevleft', 16)}</button>
          <button type="button" class="dy-today" id="dyToday">Today</button>
          <button type="button" class="dy-ic" id="dyNext">${icon('chevright', 16)}</button>
        </div>
      </div>
      <div id="dyMain"></div></div>`;
    wire();
  }
  function shell() {
    $('dyRoot').innerHTML = `
      <div class="dy-head fade-up">
        <div class="dy-head-l">
          <div class="lib-kicker">Library · Diary</div>
          <h1 class="dy-h1"><button type="button" class="dy-title" id="dyTitle" aria-label="Jump to a date"></button></h1>
          <div class="dy-sub" id="dyCount" aria-live="polite"></div>
        </div>
        <div class="dy-nav" id="dyNav">
          <button type="button" class="dy-ic" id="dyPrev">${icon('chevleft', 16)}</button>
          <button type="button" class="dy-today" id="dyToday">Today</button>
          <button type="button" class="dy-ic" id="dyNext">${icon('chevright', 16)}</button>
          <button type="button" class="dy-logbtn" id="dyLogBtn" aria-label="Log a watch">${icon('plus', 15)}<span>Log a watch</span></button>
        </div>
        <div class="dy-tools">
          <div class="dy-views" role="group" aria-label="View">${VIEWS.map(v => `<button type="button" class="dy-view" data-view="${v}" aria-pressed="false">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
          <button type="button" class="dy-ic" id="dySearchBtn" aria-label="Search your diary" aria-expanded="false" aria-controls="dySearchRow">${icon('search', 16)}</button>
          <span id="dyFilter"></span>
        </div>
        <a class="dy-back" id="dyBack" href="diary.html" hidden>${icon('chevleft', 14)}Back to diary</a>
      </div>
      <div class="dy-searchrow" id="dySearchRow" hidden>${SF.searchHTML('diary', 'Search your diary…')}</div>
      <div id="dyOtd"></div>
      <div id="dyStrip"></div>
      <div id="dyMain" class="fade-up fade-up-2"></div>`;
    wire();
  }
  function filterBtn() {
    if (!$('dyFilter')) return;
    const n = SF.filterCount('diary', 'all');
    $('dyFilter').innerHTML = `<button type="button" class="dy-ic${n ? ' is-on' : ''}" onclick="SF.openFilter('diary','all')" aria-label="${n ? `Filter, ${n} on` : 'Filter'}">${icon('filter', 15)}${n ? `<b class="dy-ic-n">${n}</b>` : ''}</button>`;
  }

  let drawing = 0;
  async function draw() {
    const seq = ++drawing;
    filterBtn();
    const root = $('dyRoot');
    root.classList.toggle('is-dates', st.dates);
    root.dataset.view = st.view;
    document.querySelectorAll('.dy-views [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === st.view)));
    $('dyPrev').setAttribute('aria-label', st.view === 'timeline' ? 'Newer day' : `Previous ${unitName()}`); $('dyNext').setAttribute('aria-label', st.view === 'timeline' ? 'Older day' : `Next ${unitName()}`);
    if ($('dyBack')) $('dyBack').hidden = !st.dates;
    if (st.dates) return drawDates();
    if (!ro()) drawStrip();
    if (st.search) return drawSearch();
    const y = st.day.slice(0, 4);
    try {
      if (st.view === 'timeline') {
        await loadYears();
        if (split()) await ensure(`${today().slice(0, 4)}-01-01`, today());   // At a glance beside it (desktop)
        if (!st.tl.rows.length && !st.tl.done) {
          const { data, error } = await tlPage(0, TL_PAGE);
          if (error) throw error;
          const rows = (data || []).map(enrich);
          await prevRatingsFor(rows);
          if (!st.tl.rows.length) { st.tl.rows = rows; st.tl.off = rows.length; st.tl.done = rows.length < TL_PAGE; }
        }
      } else if (st.view === 'year') await Promise.all([ensure(`${y}-01-01`, `${y}-12-31`), loadYears()]);
      else if (st.view === 'week') await ensure(weekOf(st.day), addDays(weekOf(st.day), 6));
      else await ensure(monthStart(st.day), monthEnd(st.day));
    } catch (err) {
      if (seq !== drawing) return;
      // someone else's diary before 146 runs: say so, quietly (the rest of their profile works)
      const missing = other() && (err?.code === 'PGRST202' || err?.code === '42883' || /get_profile_diary/.test(err?.message || ''));
      if (missing) console.warn('Profile diary: sql/146 not run yet'); else console.error(err);
      $('dyTitle').textContent = titleText(); $('dyCount').textContent = '';
      $('dyMain').innerHTML = missing ? mssEmpty({ compact: true, art: 'episodes', title: 'Their Diary isn’t available yet', text: 'Diaries on profiles are on their way. Check back soon.' })
        : mssEmpty({ compact: true, art: 'episodes', title: ro() && !st.tab.own ? 'Couldn’t load this Diary' : 'Couldn’t load your Diary', text: 'Check your connection and try again.', actions: [{ label: 'Try again', icon: 'refresh', onclick: 'MSSDiaryPage.reload()' }] });
      return;
    }
    if (seq !== drawing) return;
    refreshPassing();
    $('dyTitle').textContent = titleText();
    $('dyCount').textContent = countText();
    // the middle button names where it goes (owner, 14 Nov 2026): Today · This week · This month · This year
    const here = { timeline: 'Today', day: 'Today', week: 'This week', month: 'This month', year: 'This year' }[st.view];
    $('dyToday').textContent = here;
    $('dyToday').setAttribute('aria-label', st.view === 'timeline' ? 'Back to your newest watches' : `Go to ${here.toLowerCase()}`);
    let html;
    if (st.view === 'timeline') html = `<div class="dy-tlw"><div class="dy-tlw-main">${timelineHTML()}</div>${split() ? `<aside class="dy-tlw-side">${glanceHTML()}</aside>` : ''}</div>`;
    else if (st.view === 'year') html = yearHTML(y);
    else if (st.view === 'week') html = `<div class="dy-cal" id="dyCal">${weekHTML()}</div>`;
    else if (st.view === 'month') html = `<div class="dy-body"><div class="dy-card dy-cal" id="dyCal">${monthHTML(st.day, false)}${legendHTML()}</div><div class="dy-side">${selHTML(st.day)}${numbersHTML(st.day)}</div></div>`;
    else html = `<div class="dy-body is-day"><div class="dy-side">${split() ? `<div class="dy-card dy-cal" id="dyCal">${monthHTML(st.day, true)}</div>` : ''}${numbersHTML(st.day)}</div>${selHTML(st.day)}</div>`;
    $('dyMain').innerHTML = html;
    fillEpisodes($('dyMain'));
    if (st.view === 'timeline') { tlFoot(); tlWatch(); }
  }
  function drawSearch() {
    refreshPassing();
    const shown = st.search.rows.filter(passes);
    $('dyTitle').textContent = titleText();
    $('dyCount').textContent = `${plural(shown.length, 'watch', 'watches')} of “${st.search.q}”`;
    const dated = shown.filter(r => r.watched_date), undated = shown.filter(r => !r.watched_date);
    $('dyMain').innerHTML = shown.length
      ? `<div class="tl" id="dyTl">${tlDaysHTML(dated)}${undated.length ? `<section class="tl-day"><header class="tl-date"><span class="tl-wd">No date</span><span class="tl-dn">Watched, day not saved</span><span class="tl-n">${plural(undated.length, 'watch', 'watches')}</span></header><ol class="tl-list">${undated.map(tlRowHTML).join('')}</ol></section>` : ''}</div>`
      : mssEmpty({ art: 'search', title: `No watches of “${st.search.q}”`, text: st.search.rows.length ? 'Your filters hide them.' : 'Nothing in your Diary matches. Try another title.', actions: [{ label: 'Clear search', icon: 'x', onclick: "SF._search('diary', '', true)" }] });
    fillEpisodes($('dyMain'));
  }

  /* ── No date: the gold strip and the Set dates page ── */
  const ndKey = r => `${r.entry_id || r.title}|${r.rewatch_no}`;
  function ndGroups(rows) {
    const by = new Map();
    rows.forEach(r => { const k = ndKey(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    return [...by.entries()].map(([k, list]) => ({ k, rows: list.sort(byEp) }));
  }
  function drawStrip() {
    const w = st.nodate.waiting, box = $('dyStrip');
    if (!w.length || st.search) { box.innerHTML = ''; return; }
    const groups = ndGroups(w), one = groups.length === 1, r = groups[0].rows[0];
    const seasons = one ? new Set(w.filter(x => x.season != null).map(x => x.season)).size : 0;
    const what = one ? (w.some(x => x.season != null) ? `${plural(w.length, 'episode')} of ${r.title} ${w.length === 1 ? 'has' : 'have'} no date` : `${r.title} has no date`)
      : `${plural(w.length, 'watch', 'watches')} ${w.length === 1 ? 'has' : 'have'} no date`;
    const sub = `${one ? (seasons > 1 ? `${seasons} seasons waiting` : 'Waiting for a day') : `${groups.length} titles waiting`} · they don’t count in any month until they get a day`;
    box.innerHTML = `<div class="dy-strip">${art(r)}<span class="dy-strip-t"><b translate="no">${esc(what)}</b><small>${esc(sub)}</small></span>
        <button type="button" class="dy-strip-go" onclick="MSSDiaryPage.openDates()">Set dates${icon('arrowRight', 14)}</button></div>`;
  }
  async function openDates(push = true) {
    if (push) history.pushState({ dyDates: 1 }, '', '?dates=1');
    st.dates = true; st.active = null;
    await draw();
    scrollTo({ top: 0, behavior: 'auto' });
  }
  function closeDates(push = true) {
    if (push) history.pushState({}, '', location.pathname);
    st.dates = false; draw();
  }
  // Month and year totals before a save (the "What changes" box)
  async function monthCount(m) {
    if (!st.monthN.has(m)) st.monthN.set(m, sb.from('diary_watches').select('id', { count: 'exact', head: true }).gte('watched_date', `${m}-01`).lte('watched_date', monthEnd(`${m}-01`)).then(x => x.count || 0));
    return st.monthN.get(m);
  }
  let dateCtl = new Map();
  async function drawDates() {
    $('dyTitle').textContent = titleText();
    $('dyStrip').innerHTML = '';
    const rows = st.nodate.rows, groups = ndGroups(rows);
    if (!groups.length) {
      $('dyCount').textContent = 'Every watch has a day';
      $('dyMain').innerHTML = mssEmpty({ art: 'episodes', title: 'Nothing left to date', text: 'Every watch in your Diary has a day.', actions: [{ label: 'Back to diary', icon: 'chevleft', primary: true, onclick: 'MSSDiaryPage.closeDates()' }] });
      return;
    }
    const one = groups.length === 1, r0 = groups[0].rows[0];
    $('dyCount').textContent = one ? (rows.some(x => x.season != null) ? `${plural(rows.length, 'episode')} of ${r0.title}` : r0.title) : `${plural(rows.length, 'watch', 'watches')} · ${plural(groups.length, 'title')}`;
    // the ones still asking first, "I don't remember" ones after
    groups.sort((a, b) => (a.rows.every(r => r.date_unknown) ? 1 : 0) - (b.rows.every(r => r.date_unknown) ? 1 : 0));
    $('dyMain').innerHTML = `<div class="dy-dates">
        <div class="dy-dates-l">${groups.map((g, i) => {
          const r = g.rows[0], eps = g.rows.some(x => x.season != null);
          return `<section class="dy-card dy-dc" data-k="${esc(g.k)}" aria-labelledby="dyDc${i}">
              <div class="dy-dc-top">${art(r, 'dy-dc-art')}
                <div class="dy-dc-txt">${typeTag(r)}${rewatchTag(r)}<h2 class="dy-dc-t" id="dyDc${i}" translate="no">${esc(r.title)}</h2>
                  <p>${eps ? `You watched ${g.rows.length === 1 ? 'this episode' : 'these'} but the day wasn’t saved. Give each season a day, or one day for all.` : 'You watched this but the day wasn’t saved.'} Until then ${g.rows.length === 1 ? 'it sits' : 'they sit'} outside the calendar and out of month totals.</p></div>
              </div>
              <div class="dy-sd"></div>
              <div class="dy-dc-foot"><span class="dy-dc-left" aria-live="polite"></span><button type="button" class="dy-btn is-primary dy-dc-save">Save dates</button></div>
            </section>`;
        }).join('')}</div>
        <aside class="dy-dates-r"><section class="dy-card dy-sum" aria-labelledby="dySumT" aria-live="polite"><h2 class="dy-eyebrow" id="dySumT">What changes when you save</h2><div id="dySumBody"></div>
          <p class="dy-sum-note">Dates are only used for your diary and stats. Your scores and finished status stay the same.</p></section></aside>
      </div>`;
    dateCtl = new Map();
    await Promise.all(groups.map(async g => {
      const card = $('dyMain').querySelector(`.dy-dc[data-k="${CSS.escape(g.k)}"]`);
      const ctl = await MSSDiary.seasons(card.querySelector('.dy-sd'), g.rows, { mode: g.rows.every(r => r.date_unknown) ? 'unknown' : 'season', onChange: () => { st.active = g.k; dcFoot(card, ctl); summary(); } });
      dateCtl.set(g.k, { ctl, card, rows: g.rows });
      dcFoot(card, ctl);
      card.querySelector('.dy-dc-save').onclick = () => saveDates(g.k);
      card.addEventListener('focusin', () => { if (st.active !== g.k) { st.active = g.k; summary(); } });
    }));
    st.active = st.active && dateCtl.has(st.active) ? st.active : groups[0].k;
    summary();
  }
  function dcFoot(card, ctl) {
    const left = ctl.seasonsLeft(), plan = ctl.plan();
    card.querySelector('.dy-dc-left').textContent = plan[0]?.unknown ? 'They stay in No date' : left ? `${plural(left, 'season')} still need${left === 1 ? 's' : ''} a day` : 'Ready to save';
    card.querySelector('.dy-dc-save').disabled = !plan.length;
  }
  let sumSeq = 0;
  async function summary() {
    const seq = ++sumSeq, x = dateCtl.get(st.active), body = $('dySumBody');
    if (!x || !body) return;
    const plan = x.ctl.plan().filter(p => !p.unknown), placed = plan.reduce((n, p) => n + p.rows.length, 0);
    const byMonth = new Map(), byYear = new Map();
    plan.forEach(p => { const m = p.date.slice(0, 7), y = p.date.slice(0, 4); byMonth.set(m, (byMonth.get(m) || 0) + p.rows.length); byYear.set(y, (byYear.get(y) || 0) + p.rows.length); });
    await loadYears().catch(() => {});
    const months = await Promise.all([...byMonth.entries()].sort().map(async ([m, n]) => [m, await monthCount(m).catch(() => 0), n]));
    if (seq !== sumSeq) return;
    const line = (label, a, b) => `<div class="dy-sum-row"><span>${esc(label)}</span><span class="dy-sum-v"><s>${a.toLocaleString()}</s>${icon('arrowRight', 12)}<b>${b.toLocaleString()}</b></span></div>`;
    const r0 = x.rows[0];
    body.innerHTML = `<p class="dy-sum-for" translate="no">${esc(r0.title)}</p>`
      + (placed ? months.map(([m, a, n]) => line(fmt(`${m}-01`, { month: 'long', year: 'numeric' }), a, a + n)).join('')
        + [...byYear.entries()].sort().map(([y, n]) => line(`${y} total`, st.years?.get(y) || 0, (st.years?.get(y) || 0) + n)).join('')
        : `<p class="dy-sum-empty">Pick a day and you’ll see where ${x.rows.length === 1 ? 'it lands' : 'they land'}.</p>`)
      + line('Still without a day', st.nodate.n, st.nodate.n - placed);
  }
  async function saveDates(k) {
    const x = dateCtl.get(k); if (!x) return;
    const plan = x.ctl.plan(), btn = x.card.querySelector('.dy-dc-save');
    if (!plan.length) return;
    if (x.ctl.left() && !await showConfirm({ title: 'Save the seasons you picked?', message: 'The ones without a day stay in No date for now.', confirmText: 'Save', danger: false, iconName: 'calendar' })) return;
    btn.disabled = true; btn.classList.add('btn-busy');
    try {
      await MSSDiary.savePlan(plan);
      const dated = plan.filter(p => !p.unknown);
      showToast(dated.length ? `Saved · ${plural(dated.reduce((n, p) => n + p.rows.length, 0), 'watch', 'watches')} on the calendar` : 'Saved · they stay in No date');
      forget(); tlReset();
      await loadNoDate();
      if (dated[0]) st.day = dated[0].date;
      if (!st.nodate.rows.length) return closeDates();
      st.active = null; draw();
    } catch (err) { console.error(err); showToast('Couldn’t save those dates — try again.', 'err'); btn.disabled = false; btn.classList.remove('btn-busy'); }
  }

  /* ── ⋯ on a watch: change its day, or remove it ── */
  function allRows() { return [...st.byDay.values()].flat().concat(st.search?.rows || [], st.tl.rows); }
  async function changed(d) {
    forget();
    await loadNoDate().catch(() => {});
    if (d && st.view !== 'timeline') st.day = d;
    if (st.view === 'timeline') await tlReload().catch(console.error);
    if (st.search) await search(st.search.q); else await draw();
  }
  async function more(ids, btn) {
    const rows = allRows().filter(r => ids.includes(r.id)).filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
    if (!rows.length) return;
    const r = rows[0], label = rows.length > 1 ? `${r.title} · ${rangeText(rows)}` : `${r.title}${r.season != null ? ` · S${r.season} E${r.episode}` : ''}`;
    const hhmm = hasTime(r) ? `${pad(new Date(r.watched_at).getHours())}:${pad(new Date(r.watched_at).getMinutes())}` : null;
    await mssLoadScript('js/panel.js');
    MSSPopover.open(btn, { title: label, label: `Options for ${label}`, items: [
      { label: 'Change date or time', icon: 'calendar', onSelect: () => {
        MSSDiary.pick({ label, row: r, date: r.watched_date, time: hhmm, noDate: true,
          onSave: async (d, t) => { await saveDay(rows, d, t); await changed(d); } });
      } },
      { divider: true },
      { label: 'Remove from Diary', icon: 'trash', danger: true, onSelect: async () => {
        const ok = await showConfirm({ title: 'Remove from your Diary?', message: `${label} — ${rows.length > 1 ? plural(rows.length, 'watch', 'watches') : 'this watch'}. Your library, ratings and notes stay as they are.`, confirmText: 'Remove' });
        if (!ok) return;
        const { error } = await sb.from('diary_watches').delete().in('id', rows.map(x => x.id));
        if (error) { showToast('Couldn’t remove that — try again.', 'err'); return; }
        showToast('Removed from your Diary');
        await changed(null);
      } },
    ] });
  }
  async function saveDay(rows, d, t) {
    const at = d && t ? new Date(`${d}T${t}:00`).toISOString() : null;
    const ids = rows.map(r => r.id);
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await sb.from('diary_watches').update({ watched_date: d, watched_at: at }).in('id', ids.slice(i, i + 150));
      if (error) throw error;
    }
    showToast(d ? `Logged · ${shortDate(d)}` : 'Saved to No date');
  }

  /* ── Log a watch (on a day, or any day from the Timeline) ── */
  // a side panel S (full page on phones) in two steps: find the title, then what you watched and when
  async function add(s) {
    let when = s || today();
    await mssLoadScript('js/panel.js');
    const sub = () => fmt(when, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: s ? `Log something on ${dayMonth(s)}` : 'Log a watch', subtitle: sub(), body: '' });
    const close = () => h.closeNow();
    const body = h.body;
    let seq = 0;
    function searchStep() {
      h.setFooter(null);
      h.setBody(`<div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span><label class="sr-only" for="dyAddQ">Search for a movie or show</label>
        <input class="lyr-field" id="dyAddQ" type="search" placeholder="Search for a movie or show…" autocomplete="off" enterkeyhint="search"></div>
        <div id="dyAddRes" aria-live="polite"></div>`);
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
          res.innerHTML = list.length ? `<ul class="lyr-rows">${list.map((x, i) => mssRowHTML({ img: x.poster_path ? TMDB_IMG + x.poster_path : null, title: x.title || x.name,
            sub: (x.media_type === 'movie' ? 'Movie' : 'TV Show') + ((x.release_date || x.first_air_date) ? ' · ' + (x.release_date || x.first_air_date).slice(0, 4) : ''), attrs: `data-i="${i}"` })).join('')}</ul>`
            : `<p class="lyr-rows-msg">Nothing found. Try another title.</p>`;
          res.querySelectorAll('.lyr-row').forEach(b => b.onclick = () => whatStep(list[Number(b.dataset.i)]));
        } catch { res.innerHTML = `<p class="lyr-rows-msg">Couldn’t search — try again.</p>`; }
      }, 300); });
      if (!h.isPage) q.focus();
    }
    const mine = x => [...st.entries.values()].find(e => e.tmdb_id === x.id && (e.tmdb_type || (e.cat === 'movies' ? 'movie' : 'tv')) === x.media_type);
    async function whatStep(x) {
      const movie = x.media_type === 'movie', name = x.title || x.name;
      h.setBody(`<div class="dy-add-pick"><span class="dy-art">${x.poster_path ? `<img src="${TMDB_IMG + x.poster_path}" alt="">` : ''}</span><div><div class="dy-it-title" translate="no">${esc(name)}</div><div class="dy-add-sub">${movie ? 'Movie' : 'TV Show'}</div></div></div>
        ${movie ? '' : `<div class="dy-days" role="group" aria-label="What did you watch?">
            <button type="button" class="dy-chip" data-what="ep" aria-pressed="true">An episode</button>
            <button type="button" class="dy-chip" data-what="all" aria-pressed="false">Finished the show</button></div>
          <div class="dy-add-ep" id="dyAddEp"><label class="lyr-sec-h" for="dyAddS">Season</label><select class="lyr-field" id="dyAddS"></select>
            <label class="lyr-sec-h" for="dyAddE">Episode</label><select class="lyr-field" id="dyAddE"></select></div>`}
        <div class="lyr-sec"><h3 class="lyr-sec-h" id="dyAddDayH">Day</h3><button type="button" class="dy-chip dy-add-day" id="dyAddDay" aria-describedby="dyAddDayH">${icon('calendar', 14)}<span>${esc(shortDate(when))}</span></button></div>
        <div class="lyr-sec"><label class="lyr-sec-h" for="dyAddTime">Time <small>optional</small></label><div class="dy-time"><input class="lyr-field dy-time-in" id="dyAddTime" type="time"></div></div>`);
      h.setFooter({ secondary: [{ label: 'Back', onClick: () => searchStep() }], primary: { label: 'Add to Diary', onClick: () => go() } });
      body.querySelector('#dyAddDay').onclick = ev => mssLoadScript('js/date-range.js').then(() => MSSDateRange.pickDate({ value: when, label: 'When did you watch it?', anchor: ev.currentTarget,
        onPick: v => { when = v; body.querySelector('#dyAddDay span').textContent = shortDate(v); h.setTitle(s ? `Log something on ${dayMonth(v)}` : 'Log a watch', sub()); body.querySelector('#dyAddDay').focus(); } }));
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
      async function go() {
        const time = body.querySelector('#dyAddTime').value || null;
        const season = !movie && what === 'ep' ? Number(body.querySelector('#dyAddS').value) : null, episode = season ? Number(body.querySelector('#dyAddE').value) : null;
        try {
          const own = mine(x);
          if (own) { await addWatch(own, when, time, season, episode, movie || what === 'all'); close(); }
          else {
            close();
            MSSInfo.addToLibrary({ tmdb_id: x.id, media_type: x.media_type, title: name, poster_url: x.poster_path ? TMDB_FULL + x.poster_path : null, overview: x.overview },
              { status: movie || what === 'all' ? 'completed' : 'watching', details: x._det || undefined,
                extra: { completed_date: when, season, episode },
                onAdded: entry => entry && afterAdded(entry, when, time, season, episode) });
          }
        } catch (err) { console.error(err); showToast('Couldn’t add that — try again.', 'err'); }
      }
    }
    searchStep();
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
    showToast(`Logged · ${shortDate(s)}`);
    await landed(s);
  }
  // Added to your library through the normal Add to Library: the Diary logged it on that day (112);
  // put it at the time you gave, then offer to rate it
  async function afterAdded(entry, s, time, season, episode) {
    st.entries.set(entry.id, entry);
    const { data } = await sb.from('diary_watches').select('id,season,episode,watched_date').eq('entry_id', entry.id);
    const mineNow = (data || []).filter(r => season ? r.season === season && r.episode === episode : r.watched_date === s);
    if (mineNow.length) await sb.from('diary_watches').update({ watched_date: s, watched_at: time ? new Date(`${s}T${time}:00`).toISOString() : null }).in('id', mineNow.map(r => r.id));
    await landed(s);
    showActionToast(`Added “${entry.title}” · ${shortDate(s)}`, 'Rate it', () => goToDetail(entry.id, 'diary.html', 'ratings'), 8000);
  }
  // A new watch shows up in its place: the calendar on its day; the Timeline where it falls
  // (reloaded as far as you'd scrolled; an older day than that → the Timeline from that day)
  async function landed(s) {
    forget();
    if (st.view !== 'timeline') { st.day = s; return draw(); }
    const oldest = st.tl.rows[st.tl.rows.length - 1]?.watched_date;
    if (!st.tl.done && oldest && s < oldest) tlReset(s); else await tlReload().catch(console.error);
    await draw();
    const el = document.querySelector(`.tl-day[data-day="${s}"]`);
    if (el && st.tl.from !== s) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
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
  // Timeline ‹ ›: the newer / older day with watches, from the one at the top of the screen
  async function tlStep(dir) {
    const off = Math.round(Math.max(document.getElementById('mainNav')?.getBoundingClientRect().bottom || 72, tabBar())) + 12;
    const days = () => [...document.querySelectorAll('#dyTl .tl-day')];
    let list = days();
    // the day at the top of the screen: the last one whose start has reached it
    let cur = -1;
    list.forEach((el, k) => { if (el.getBoundingClientRect().top <= off + 8) cur = k; });
    let k = dir > 0 ? cur + 1 : (cur >= 0 && list[cur].getBoundingClientRect().top < off - 8 ? cur : cur - 1);
    if (k >= list.length && !st.tl.done) { await tlMore(); list = days(); }
    if (k < 0 && cur <= 0 && scrollY > 0 && list[0]) k = 0;
    const to = list[k];
    if (!to) { showToast(dir > 0 ? `That’s the start of ${whose()} Diary.` : other() ? 'These are their newest watches.' : 'You’re at your newest watches.'); return; }
    scrollTo({ top: Math.max(0, scrollY + to.getBoundingClientRect().top - off), behavior: reduced() ? 'auto' : 'smooth' });
    // on a profile the tab bar moves into place as the page scrolls: line the day up again after
    if (st.tab) setTimeout(() => {
      const d = to.getBoundingClientRect().top - Math.round(Math.max(document.getElementById('mainNav')?.getBoundingClientRect().bottom || 72, tabBar())) - 12;
      if (Math.abs(d) > 4) scrollBy({ top: d, behavior: 'auto' });
    }, reduced() ? 260 : 700);
  }
  function setView(v) { st.view = v; put('view2', v); }
  // on a profile: where the sticky tab bar ends once it's stuck (0 where it doesn't stick)
  function tabBar() {
    const bar = st.tab && document.querySelector('.tv-tabs'); if (!bar) return 0;
    const cs = getComputedStyle(bar);
    return cs.position === 'sticky' ? (parseFloat(cs.top) || 0) + bar.offsetHeight : 0;
  }
  // back to the top of the Timeline: the page's top, or the tab's (under the bars) on a profile
  function toTop(behavior = 'auto') {
    if (!st.tab) return scrollTo({ top: 0, behavior });
    const under = Math.max(document.getElementById('mainNav')?.getBoundingClientRect().bottom || 64, tabBar());
    const top = $('dyRoot').getBoundingClientRect().top + scrollY - under - 8;
    if (top < scrollY) scrollTo({ top: Math.max(0, top), behavior });
  }
  function pickDay(d, open) {
    st.day = d;
    if (open) setView('day');
    draw().then(() => {
      const b = document.querySelector(`.dy-m-day[data-d="${d}"]`);
      if (b && !open) b.focus({ preventScroll: true });
      if (!split() && st.view === 'month') document.querySelector('.dy-sel')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      if (open) scrollTo({ top: 0, behavior: 'auto' });
    });
  }
  function wire() {
    $('dyPrev').onclick = () => st.view === 'timeline' ? tlStep(-1) : step(-1);
    $('dyNext').onclick = () => st.view === 'timeline' ? tlStep(1) : step(1);
    $('dyToday').onclick = () => {
      if (st.view === 'timeline') { const back = !!st.tl.from; if (back) tlReset(); toTop(reduced() ? 'auto' : 'smooth'); if (back) draw(); return; }
      st.day = today(); draw();
    };
    $('dyTitle').onclick = () => {
      if (st.dates) return;
      MSSDateRange.pickDate({ value: st.view === 'timeline' ? (st.tl.from || today()) : st.day, label: 'Jump to', view: st.view === 'year' ? 'years' : undefined, anchor: $('dyTitle'),
        onPick: v => { if (st.view === 'timeline') { tlReset(v >= today() ? null : v); toTop(); } else st.day = v; draw(); } });
    };
    wireMain();
    if (st.tab) return;   // the profile tab is the Timeline, view-only: no views, logging, search or Set dates
    document.querySelector('.dy-views').addEventListener('click', ev => {
      const b = ev.target.closest('[data-view]'); if (!b) return;
      setView(b.dataset.view); draw();
    });
    $('dyLogBtn').onclick = () => add(st.view === 'timeline' ? null : st.day);
    $('dySearchBtn').onclick = () => {
      const row = $('dySearchRow'), open = row.hidden;
      row.hidden = !open; $('dySearchBtn').setAttribute('aria-expanded', String(open)); $('dySearchBtn').classList.toggle('is-on', open);
      if (open) row.querySelector('input')?.focus();
      else if (st.search) SF._search('diary', '', true);
    };
    $('dyBack').onclick = ev => { ev.preventDefault(); closeDates(); };
    addEventListener('popstate', () => { const want = new URLSearchParams(location.search).has('dates'); if (want !== st.dates) { st.dates = want; draw(); } });
  }
  // the views' own taps, keys and swipes (the Diary page; the profile tab uses the Timeline's)
  function wireMain() {
    const main = $('dyMain');
    main.addEventListener('click', ev => {
      const t = ev.target.closest('[data-act], [data-d], [data-m], [data-y], [data-add]');
      if (!t) return;
      if (t.dataset.act === 'more') return more(t.dataset.ids.split(','), t);
      if (t.dataset.act === 'glance') {
        const open = t.getAttribute('aria-expanded') !== 'true';
        put('glance', open ? '1' : '0');
        t.setAttribute('aria-expanded', String(open)); t.closest('.dy-gl').classList.toggle('is-open', open); $('dyGlBody').hidden = !open;
        return;
      }
      if (t.dataset.add) return add(t.dataset.add);
      if (t.dataset.act === 'group') {
        const k = t.dataset.key;
        if (st.open.has(k)) st.open.delete(k); else st.open.add(k);
        const g = t.closest('.dy-it'), body = g.querySelector('.dy-it-eps'), open = st.open.has(k);
        const rows = allRows().filter(r => r.season != null && `${r.entry_id || r.title}|${r.rewatch_no}` === k && r.watched_date === st.day)
          .filter((r, i, a) => a.findIndex(x => x.id === r.id) === i).sort(byEp);
        body.innerHTML = open ? epRowsHTML(rows) : '';
        body.hidden = !open; g.classList.toggle('is-open', open); t.setAttribute('aria-expanded', String(open));
        if (open) fillEpisodes(body);
        return;
      }
      if (t.dataset.y) { st.day = `${t.dataset.y}-${st.day.slice(5, 7)}-01`; return draw(); }
      if (t.dataset.m) { st.day = t.dataset.m; setView('month'); return draw().then(() => scrollTo({ top: 0, behavior: 'auto' })); }
      if (t.dataset.d) pickDay(t.dataset.d, !!t.dataset.open);
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
    if (!wiredResize) {
      wiredResize = true;
      let wasSplit = split();
      addEventListener('resize', () => { if (split() !== wasSplit) { wasSplit = split(); if (st.view !== 'timeline' && $('dyMain')) draw(); } });
    }
  }
  let wiredResize = false;

  /* ── Start ── */
  async function start(user) {
    st.user = user;
    const profile = window._navUserProfile || await getProfile(user.id);
    st.weekStart = profile?.week_start || regionWeekStart();
    const all = await getEntries(user.id).catch(() => []);
    all.forEach(e => st.entries.set(e.id, e));
    const p = new URLSearchParams(location.search);
    // a day from elsewhere (diary.html?d=2026-11-25 — On This Day's View in Diary): that day
    const d = p.get('d');
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(day(d))) { st.day = d; if (st.view === 'timeline') st.view = 'day'; }
    st.dates = p.has('dates');
    document.body.dataset.ownActions = '';   // phones: the Diary logs from its own buttons — no Create button floating over it
    shell();
    // from a title's details page (diary.html?q=Title): every time you watched it
    const q = p.get('q');
    if (q) { $('dySearchRow').hidden = false; $('dySearchBtn').setAttribute('aria-expanded', 'true'); SF._search('diary', q.slice(0, 120), true); }
    await loadNoDate().catch(err => console.warn('No date:', err));
    await Promise.all([draw(), onThisDay()]);
  }
  function reload() { forget(); tlReset(st.tl.from); draw(); }

  /* ── The profile's Diary tab (profile.html, profile-view.html) ── */
  // Opened again (back to the tab): kept as it was. Needs date-range.js (jump to a date) and
  // episode-ratings.js (episode names), loaded here if the page hasn't.
  async function mount(el, o) {
    if (!el || !o?.userId) return;
    if (st.tab && st.tab.el === el && st.tab.userId === o.userId && $('dyRoot')) return;
    st.tab = { el, userId: o.userId, own: !!o.own, name: o.name || '' };
    st.user = { id: o.userId };
    st.view = 'timeline';
    forget(); tlReset();
    el.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
    await Promise.all([mssLoadScript('js/date-range.js'), typeof MSSEp === 'undefined' ? mssLoadScript('js/episode-ratings.js') : null]);
    tabShell();
    await draw();
  }
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

  // Loading skeleton: the view you'll land on, from the real markup
  mssSkeleton.define('diary', () => {
    const t = today(), sample = { id: 's', title: 'Sample title', cat: 'tv', tmdb_type: 'tv', season: 1, episode: 1, watched_date: t, watched_at: null, poster_url: null };
    const head = `<div class="dy-head"><div class="dy-head-l"><div class="lib-kicker" data-skel-keep>Library · Diary</div><h1 class="dy-h1"><span class="dy-title">${st.view === 'timeline' ? 'Timeline' : 'November 2026'}</span></h1><div class="dy-sub">1,234 watches · newest first</div></div></div>`;
    if (st.view === 'timeline') return head + `<div class="tl">${tlDaysHTML([sample, sample, sample, { ...sample, watched_date: addDays(t, -1) }, { ...sample, watched_date: addDays(t, -1) }])}</div>`;
    return head + `<div class="dy-body"><div class="dy-card dy-cal">${monthHTML(t, false)}</div><div class="dy-side"><section class="dy-card dy-sel"><div class="dy-sel-head"><h2 class="dy-sel-t">Nov 25, 2026</h2></div><div class="dy-sel-list">${itemHTML(titleItems([sample])[0])}${itemHTML(titleItems([{ ...sample, id: 't' }])[0])}</div></section></div></div>`;
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.dy-page')) return;   // a profile's Diary tab starts itself (mount)
    initPage(user => {
      if (!user) { $('dyRoot').innerHTML = mssGuestEmpty('diary'); return; }
      start(user).catch(err => { console.error(err); $('dyRoot').innerHTML = mssEmpty({ art: 'episodes', title: 'Couldn’t open your Diary', text: 'Check your connection and try again.', actions: [{ label: 'Try again', icon: 'refresh', onclick: 'location.reload()' }] }); });
    });
  });

  return { add, reload, openDates, closeDates, mount, more: () => { st.tl.failed = false; tlMore(); } };
})();
