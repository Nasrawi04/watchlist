/* ══════════════════════════════════════════════════════════════
   export-studio.js — the Export Studio (MSSStudio): a full-screen workspace for every export.
   Left: three steps — 1 What · 2 Format · 3 Options — a chosen step folds to one line (its value +
   Change). Centre: the preview desk — the real PDF (built by export.js, shown page by page with
   pdf.js, rendered on demand), the real image (export-image.js / ep-chart.js) at its real size, or
   the real text — zoom and light / dark right on it. Bottom: the file bar (type, count, pages, size,
   Copy settings link, Export), which turns into the progress bar (with Cancel) while it builds, then
   a done screen. Phones: the preview pinned on top (tap → full screen), the steps as three tabs,
   the file line + Export pinned at the bottom.

   What:   Watched · Watchlist · Currently watching (whole, or by category, order, top N) · Pick titles
           (one title = a full page: the whole note + episode ratings) · A list (yours or shared with you) ·
           My taste profile (taste-profile.js) · Year in Review (year-review.js) · Episode ratings (one show:
           ep-chart.js) · A title (a card — Create Card) · Everything (a full backup)
           (+ "as filtered here" when a page passes its own list)
   Format: PDF · Image (story / square, top 10) · For an AI (copy / .md) · Spreadsheet (.csv) · Letterboxd (.csv) ·
           Full backup (.json) — the ones that don't fit "What" are greyed with the reason.

   MSSStudio.open({
     load: () => Promise<entries>,        // all of your library entries
     who: { name, username, avatar_url }, // the cover ("by …") and the footer
     preset: { what, cat, sort, limit, group, format, step, …          // optional starting point (a setup, see setup())
               list: { id, title, description, items, ranked, owner, mine } },   // what: 'list' — that list
     custom: { label, entries },          // optional: "As filtered here" (Watched page)
     autoGo: true,                        // export straight away once it's ready ("Export again")
   })
   MSSStudio.recent() → the last 5 setups made on this device [{ setup, name, fmt, opts, at, thumb }]
   MSSStudio.link(setup) → a link that opens the Studio with that setup (export.html#studio=…)
   MSSStudio.fromHash() → the setup in this page's #studio=… (or null)
   MSSStudio.thumb(preset, { all, who }) → Promise<data URL | null> — a small picture of that export, drawn by
     the export code itself (the export page's Ready-made cards)

   Look, include, privacy, grouping and the format are remembered on this device.
   Requires config.js (icon, escHTML, MSSDialog, showToast, CAT_META, liveScore, safeURL, mssSaveImage, mssArt,
   mssLoadScript), export.js (MSSPdf), export-formats.js (MSSFormats), export-image.js (MSSImage), taste-profile.js,
   year-review.js, jsPDF; nav.js (tmdbFetch, attachClearButton, _selDDHTML); pdf.js (js/vendor, loaded here when needed).
══════════════════════════════════════════════════════════════ */
// the Which show Sort dropdown (nav.js _selDDHTML) calls a global by name
function _xsEpSort(v) { MSSStudio._epSort(v); }
const MSSStudio = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => escHTML(s == null ? '' : String(s));
  const PREFS = 'msf_export_prefs', RECENT = 'msf_export_recent', THUMBS = 'msf_export_thumbs';
  const PDFJS = 'js/vendor/pdfjs-3.11.174/';
  const phoneMQ = matchMedia('(max-width: 767px)');
  const WHAT = {
    watched:   { label: 'Watched', ic: 'check', test: e => e.status === 'completed' || e.status === 'ongoing' },
    watchlist: { label: 'Watchlist', ic: 'bookmark', test: e => e.status === 'queue' },
    watching:  { label: 'Currently watching', ic: 'play', test: e => ['watching', 'up_next', 'paused'].includes(e.status) },
  };
  const SORTS = {
    watched:   [['score', 'Score'], ['recent', 'Recent'], ['title', 'A–Z'], ['year', 'Year']],
    watchlist: [['recent', 'Recently added'], ['title', 'A–Z'], ['year', 'Year']],
    watching:  [['recent', 'Recent'], ['title', 'A–Z']],
    mixed:     [['manual', 'As picked'], ['score', 'Score'], ['title', 'A–Z'], ['year', 'Year']],
  };
  const FORMATS = [['pdf', 'PDF', 'download', 'To read, print or send'], ['image', 'Image', 'image', 'Story or square — your top 10'],
    ['ai', 'For an AI', 'sparkles', 'Paste it into any AI chat'], ['csv', 'Spreadsheet', 'list', 'A .csv for Excel or Google Sheets'],
    ['letterboxd', 'Letterboxd', 'film', 'Your watched movies, to import there'], ['backup', 'Full backup', 'layers', 'Everything, as one .json file']];
  const FMT_NAME = Object.fromEntries(FORMATS.map(f => [f[0], f[1]]));
  const TITLE_WHATS = ['custom', 'watched', 'watchlist', 'watching', 'picked', 'list'];
  const CATS = [['', 'All'], ['tv', 'TV'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const CAT_WORD = { tv: 'TV shows', movies: 'movies', anime: 'anime', cartoons: 'cartoons' };
  const LIMITS = [[0, 'All'], [10, '10'], [25, '25'], [50, '50']];
  const CAT_ORDER = ['tv', 'movies', 'anime', 'cartoons'];
  const STEPS = [['what', 'What'], ['format', 'Format'], ['options', 'Options']];
  const PICK_SHOW = 150;    // rows drawn in the picker at once (search narrows it)
  const t = d => d ? new Date(d).getTime() || 0 : 0;
  const thumbUrl = u => u && /^https?:/.test(u) ? String(u).replace(/\/(w\d+|original)\//, '/w92/') : '';
  const nTitles = n => `${n} ${n === 1 ? 'title' : 'titles'}`;
  const kb = b => b >= 1e6 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  const ZOOM_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>';
  const FIT_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/></svg>';
  const FULL_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

  let S = null;     // the open Studio's state (initState)

  /* the site's score ring (MSSViews.ring — title-view.js; .tv-ring in style.css), in its tier's colour. Pages without title-view.js
     (export.html) get the same markup from here. size: '' | 's' | 'xs' | 'l' */
  function ring(v, size = 's', dropped = false) {
    if (v == null || isNaN(v)) return '';
    if (typeof MSSViews !== 'undefined' && MSSViews.ring) return MSSViews.ring(Number(v), size, dropped);
    const n = Number(v), r = 44, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, n / 10)), gold = !dropped && mssIsGold(n);
    return `<div class="tv-ring${mssTierCls(n, { dropped })}${gold ? ' is-gold' : ''}${size ? ' is-' + size : ''}" role="img" aria-label="Score ${n.toFixed(2)} out of 10">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="tv-ring-track" cx="50" cy="50" r="${r}"/><circle class="tv-ring-fill" cx="50" cy="50" r="${r}" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}"/></svg>
      <b aria-hidden="true">${n.toFixed(2)}</b></div>`;
  }
  // a title's backdrop into a tile's .es-fav-bg (its owner's choice and Top Favorites framing; no backdrop → the poster, blurred)
  function paintBackdrop(el, e) {
    if (!el || !e) return;
    const poster = () => { const pu = safeURL(e.poster_url); if (pu) { el.style.backgroundImage = `url('${pu}')`; el.classList.add('in', 'is-poster'); } };
    if (typeof MSSBackdrop === 'undefined') return poster();
    MSSBackdrop.url(e, 'w1280').then(u => {
      if (!el.isConnected) return;
      if (!u) return poster();
      const st = MSSBackdrop.style(e, false, 'fav'); if (st) el.setAttribute('style', st);
      const im = new Image(); im.onload = () => { el.style.backgroundImage = `url('${u}')`; el.classList.add('in'); }; im.onerror = poster; im.src = u;
    }).catch(poster);
  }

  function prefs() { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { return {}; } }
  function keep() { try { localStorage.setItem(PREFS, JSON.stringify({ theme: S.theme, epLook: S.epLook || null, include: S.include, privacy: S.privacy, group: S.group, format: S.format, img: S.img, ai: { length: S.ai.length, promptOn: S.ai.promptOn, watchlist: S.ai.watchlist, taste: S.ai.taste } })); } catch {} }
  const fmt = f => S.format === f;
  const defaultPrompt = () => { const k = isEps() ? 'episodes' : isYear() ? 'year' : isTaste() ? 'taste' : kindOf(); return MSSFormats.DEFAULT_PROMPT[k] ?? MSSFormats.DEFAULT_PROMPT.watched; };
  function aiText(list) {
    if (isEps()) return epText();
    const k = kindOf(), wl = S.ai.watchlist && S.what !== 'watchlist' ? S.all.filter(WHAT.watchlist.test) : [];
    return MSSFormats.ai(list, { include: S.include, privacy: S.privacy, length: S.ai.length, watchlist: wl, heading: title(),
      prompt: S.ai.promptOn ? (S.ai.prompt ?? defaultPrompt()) : '', taste: isTaste() || (S.ai.taste && !isYear()) ? taste() : null, year: isYear() ? yearData() : null });
  }
  const lbList = () => MSSFormats.lbMovies(pool());
  const has = list => isTaste() ? !!taste() : isYear() ? !!yearData() : isEps() ? !!epData() : isCard() ? !!cardEntry() : isAll() ? S.all.length > 0 : list.length > 0;   // anything to export?
  const isTaste = () => S.what === 'taste';
  const taste = () => (S.tasteData ??= MSSTaste.compute(S.all));   // worked out once per opening
  const isYear = () => S.what === 'year';
  const isEps = () => S.what === 'episodes';
  const isCard = () => S.what === 'title';
  const isAll = () => S.what === 'all';
  const special = () => isTaste() || isYear() || isEps();     // not a list of titles
  const cardEntry = () => S.all.find(x => x.id === S.card) || null;

  /* ── what fits with what (the design's matrix) — '' = fits, otherwise the reason it doesn't ── */
  function why(w, f) {
    if (f === 'backup') return w === 'all' ? '' : 'A full backup is always everything — choose Everything';
    if (w === 'all') return 'Everything only goes in a full backup';
    if (w === 'title') return f === 'image' ? '' : 'One title is made as a card — an image';
    if (w === 'taste' || w === 'year') return ['pdf', 'image', 'ai'].includes(f) ? '' : `${w === 'taste' ? 'Your taste profile' : 'Year in Review'} is a summary, not rows of titles`;
    if (w === 'episodes') return f === 'letterboxd' ? 'Letterboxd takes movies, not episodes' : '';
    if (f === 'letterboxd' && w === S.what && S.all.length && !lbList().length) return 'No watched movies in it';
    return '';
  }
  const fitFormat = () => { if (why(S.what, S.format)) S.format = FORMATS.map(f => f[0]).find(f => !why(S.what, f)) || 'pdf'; };

  /* ── Episode ratings: one show — your ratings, episode names from TMDB ── */
  async function loadEpisodes() {
    const me = window._navUser?.id;
    if (!me || S.epAll) return;
    const rows = await sb.from('episode_ratings').select('user_id, entry_id, season_number, episode_number, score, tags, note, note_visibility, note_spoiler, updated_at').eq('user_id', me)
      .then(r => mssWithEpNotes(r.data || []), () => []);   // your Friends / Only me notes too (108)
    if (!S) return;
    S.epAll = rows.filter(r => Number(r.episode_number) > 0 && r.score != null);
    const n = {};
    S.epAll.forEach(r => { n[r.entry_id] = (n[r.entry_id] || 0) + 1; });
    const sum = {}, last = {};
    S.epAll.forEach(r => { sum[r.entry_id] = (sum[r.entry_id] || 0) + Number(r.score); if (String(r.updated_at || '') > (last[r.entry_id] || '')) last[r.entry_id] = String(r.updated_at || ''); });
    S.epShows = Object.entries(n).map(([id, count]) => ({ id, count, avg: sum[id] / count, last: last[id] || '', e: S.all.find(x => x.id === id) })).filter(x => x.e).sort((a, b) => b.count - a.count);
    if (!S.epShows.some(x => x.id === S.epShow)) S.epShow = S.epShows[0]?.id || null;
    draw();
  }
  const epEntry = () => S.epShows?.find(x => x.id === S.epShow)?.e || null;
  // the chosen show, as the Episodes page sees it (ep-chart.js: TMDB episodes + names, your ratings)
  async function epLoad() {
    const e = epEntry(), me = window._navUser?.id;
    if (!e || !me || S.epSt?.id === e.id || S.epLoading === e.id) return;
    if (!e.tmdb_id) { S.epSt = { id: e.id, st: null }; return; }   // not linked to TMDB: no chart (the PDF lists the episodes)
    S.epLoading = e.id;
    const me2 = S;
    try {
      await loadChart();
      const st = await MSSEpChart.load(e.tmdb_id, me, me);
      if (S !== me2) return;
      S.epSt = st ? { id: e.id, st } : { id: e.id, st: null };
    } catch (err) { console.warn('Episode chart:', err); if (S === me2) S.epSt = { id: e.id, st: null }; }
    if (S !== me2) return;
    S.epLoading = null; S.epKey = null;
    if (isEps()) drawSide();
  }
  async function loadChart() {
    if (typeof MSSEp === 'undefined') await mssLoadScript('js/episode-ratings.js');
    if (typeof MSSEpChart === 'undefined') await mssLoadScript('js/ep-chart.js');
  }
  const epSt = () => S.epSt?.id === S.epShow ? S.epSt.st : null;
  // the chart (ep-chart.js) into a canvas: the image sizes, or 'a4' for the PDF's first page
  // the episode chart's style: Dark / Light (the Studio's look) or Backdrop (S.epLook — the chart only; every other file stays dark)
  const epChart = (cv, size) => MSSEpChart.draw(cv, epSt(), { size, theme: S.epLook || S.theme, source: S.epSrc, label: 'All seasons', userId: S.privacy.anon ? null : window._navUser?.id });
  function epData() {
    const e = epEntry();
    if (!e) return null;
    const key = `${e.id}:${!!epSt()}`;
    if (S.epKey === key) return S.epD;
    const st = epSt(), names = {}, by = {};
    Object.entries(st?.eps || {}).forEach(([sn, eps]) => { names[sn] = Object.fromEntries(eps.map(x => [x.n, x.name])); });
    S.epAll.filter(r => r.entry_id === e.id).forEach(r => {
      (by[r.season_number] ||= []).push({ e: r.episode_number, name: names[r.season_number]?.[r.episode_number] || '', score: Number(r.score),
        band: typeof MSSEp !== 'undefined' ? MSSEp.band(r.score).name : '', tags: r.tags || [], note: (r.note || '').trim(), s: r.season_number, at: r.updated_at });
    });
    const avgOf = a => a.reduce((tt, x) => tt + x.score, 0) / a.length;
    const seasons = Object.keys(by).map(Number).sort((a, b) => a - b).map(n => { const rows = by[n].sort((a, b) => a.e - b.e); return { n, rows, avg: avgOf(rows) }; });
    const all = seasons.flatMap(x => x.rows);
    const best = all.reduce((b, x) => !b || x.score > b.score ? x : b, null);
    S.epKey = key;
    S.epD = !all.length ? null : { show: e, count: all.length, avg: avgOf(all), seasons,
      best: best && { s: best.s, e: best.e, score: best.score, name: best.name },
      bestSeason: seasons.length > 1 ? seasons.reduce((b, x) => !b || x.avg > b.avg ? x : b, null) : null };
    return S.epD;
  }
  function epText() {
    const d = epData();
    if (!d) return '';
    const out = [];
    if (S.ai.promptOn) out.push((S.ai.prompt ?? defaultPrompt()).trim(), '');
    out.push(`## ${d.show.title} — my episode ratings`, `${d.count} episodes rated · average ${d.avg.toFixed(2)} out of 10${d.best ? ` · best: S${d.best.s} E${d.best.e}${d.best.name ? ` “${d.best.name}”` : ''} (${mssR1(d.best.score)})` : ''}`);
    d.seasons.forEach(sn => {
      out.push('', `### Season ${sn.n} — average ${sn.avg.toFixed(2)}`);
      sn.rows.forEach(r => out.push(`- E${r.e}${r.name ? ` · ${r.name}` : ''} — ${mssR1(r.score)}${r.tags.length ? ` (${r.tags.join(', ')})` : ''}${S.include.notes && r.note ? ` — ${r.note.replace(/\s+/g, ' ')}` : ''}`));
    });
    return out.join('\n');
  }
  function epCSV() {
    const d = epData(), q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const rows = [['Show', 'Season', 'Episode', 'Title', 'Score', 'Band', 'Tags', ...(S.include.notes ? ['Note'] : []), 'Rated']];
    d?.seasons.forEach(sn => sn.rows.forEach(r => rows.push([d.show.title, sn.n, r.e, r.name, mssR1(r.score), r.band, r.tags.join('; '), ...(S.include.notes ? [r.note] : []), (r.at || '').slice(0, 10)])));
    return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
  }

  const yearData = () => {   // worked out per year (again once the medals / episode ratings have loaded)
    const key = `${S.year}:${!!S.yExtra}`;
    if (S.yKey !== key) { S.yKey = key; S.yData = S.year ? MSSYear.compute(S.all, S.year, { ...(S.yExtra || {}), diary: S.diary }) : null; }
    return S.yData;
  };
  // Your Diary (110): every watch, paged (a long one has thousands). Without it (not signed in, or it
  // couldn't load), everything uses each title's "Watched on" as before.
  async function loadDiary() {
    const me = window._navUser?.id;
    if (!me) return null;
    const rows = [];
    try {
      for (let off = 0; off < 50000; off += 1000) {
        const { data, error } = await sb.from('diary_watches').select('*').eq('user_id', me).order('watched_date', { nullsFirst: true }).order('created_at').range(off, off + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    } catch (err) { console.warn('Export Studio diary:', err); return null; }
  }
  async function loadYearExtra() {
    if (S.yExtra || S.yLoading) return;
    S.yLoading = true;
    const me = window._navUser?.id, me2 = S;
    const [b, ep] = await Promise.all([
      me ? sb.rpc('my_badges', { p_user: me }).then(r => r.data || [], () => []) : [],
      me ? sb.from('episode_ratings').select('entry_id, season_number, episode_number, score, created_at, updated_at').eq('user_id', me).then(r => r.data || [], () => []) : []]);
    if (S !== me2) return;
    S.yExtra = { badges: Array.isArray(b) ? b : [], episodes: ep }; S.yLoading = false;
    if (isYear()) draw();
  }

  const mixed = () => S.what === 'picked' || S.what === 'list';
  const kindOf = () => S.what === 'custom' || special() ? 'watched' : mixed() ? 'mixed' : WHAT[S.what] ? S.what : 'watched';
  const single = () => S.what === 'picked' && S.pick.length === 1;
  function pool() {
    if (S.what === 'picked') return S.pick.map(id => S.all.find(e => e.id === id)).filter(Boolean);
    if (S.what === 'list') return S.listItems || [];
    if (!TITLE_WHATS.includes(S.what)) return [];
    const base = S.what === 'custom' ? S.o.custom.entries : S.all.filter(WHAT[S.what].test);
    return S.cat ? base.filter(e => e.cat === S.cat) : base;
  }
  function picked() {
    let l = [...pool()];
    const sc = e => { const v = liveScore(e); return v == null ? -1 : Number(v); };
    const cmp = {
      manual: null,
      score: (a, b) => sc(b) - sc(a) || t(b.completed_date) - t(a.completed_date),
      recent: kindOf() === 'watched' ? (a, b) => t(b.completed_date || b.updated_at) - t(a.completed_date || a.updated_at)
        : kindOf() === 'watchlist' ? (a, b) => t(b.created_at) - t(a.created_at)
        : (a, b) => t(b.progress_at || b.updated_at) - t(a.progress_at || a.updated_at),
      title: (a, b) => String(a.title || '').localeCompare(String(b.title || '')),
      year: (a, b) => (Number(String(b.year).slice(0, 4)) || 0) - (Number(String(a.year).slice(0, 4)) || 0),
    }[S.sort];
    if (cmp) l.sort(cmp);
    if (S.limit && !mixed() && !fmt('image')) l = l.slice(0, S.limit);
    if (fmt('image')) return l.slice(0, MSSImage.MAX);   // images: the first 10, never more
    if (S.group && !single() && fmt('pdf')) l = CAT_ORDER.flatMap(c => l.filter(e => e.cat === c)).concat(l.filter(e => !CAT_ORDER.includes(e.cat)));
    return l;
  }
  const ranked = () => !single() && (S.sort === 'score' && kindOf() !== 'watchlist' && kindOf() !== 'watching' || mixed() && S.sort === 'manual' && S.numbered);
  function title() {
    if (S.title.trim()) return S.title.trim();
    const cat = S.cat ? ' ' + CAT_WORD[S.cat] : '';
    if (S.what === 'custom') return S.o.custom.label;
    if (S.what === 'picked') return single() ? pool()[0]?.title || 'My pick' : 'My picks';
    if (S.what === 'list') return S.list?.title || 'A list';
    if (isTaste()) return 'My taste';
    if (isYear()) return `My ${S.year || 'year'}`;
    if (isEps()) return epEntry()?.title || 'Episode ratings';
    if (isCard()) return cardEntry()?.title || 'A title';
    if (isAll()) return 'My library';
    if (S.what === 'watched') return (S.limit || fmt('image')) && S.sort === 'score' ? `My top ${fmt('image') ? MSSImage.MAX : S.limit}${cat}` : `Everything I’ve watched${S.cat ? ` ·${cat}` : ''}`;
    if (S.what === 'watchlist') return `My watchlist${S.cat ? ` ·${cat}` : ''}`;
    return `Currently watching${S.cat ? ` ·${cat}` : ''}`;
  }
  function kicker() {
    if (S.what === 'picked') {
      const e = single() ? pool()[0] : null;
      return e ? [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : ''].filter(Boolean).join(' · ') : `Hand-picked · ${S.pick.length} titles`;
    }
    if (S.what === 'list') return `List${S.list?.ranked ? ' · Ranked' : ''}`;
    if (isTaste()) return 'Taste profile';
    if (isYear()) return 'Year in review';
    if (isEps()) return 'Episode ratings';
    const sortL = (SORTS[kindOf()].find(s => s[0] === S.sort) || [])[1];
    return [S.what === 'custom' ? 'Watched' : WHAT[S.what]?.label || 'Watched', S.cat ? CAT_META?.[S.cat]?.label || S.cat : 'All categories', sortL ? (S.sort === 'score' ? 'By score' : sortL) : ''].filter(Boolean).join(' · ');
  }
  // a list that isn't yours says whose it is
  const byline = () => S.what === 'list' && S.list && !S.list.mine ? `A list by @${S.list.owner || 'someone'}` : '';
  // "Up from 12 titles in 2025" — under the year in review's title
  function yearCompare() {
    const yv = yearData(); if (!yv?.prev) return '';
    const d = yv.titles - yv.prev.titles;
    return d > 0 ? `Up from ${yv.prev.titles} titles in ${yv.year - 1}.` : d < 0 ? `Down from ${yv.prev.titles} titles in ${yv.year - 1}.` : `The same as ${yv.year - 1}: ${yv.titles} titles.`;
  }

  /* ── the sources, with counts ── */
  function whats() {
    const cnt = w => S.all.filter(WHAT[w].test).length;
    return [...(S.o.custom ? [['custom', S.o.custom.label, 'filter', nTitles(S.o.custom.entries.length)]] : []),
      ...Object.keys(WHAT).map(w => [w, WHAT[w].label, WHAT[w].ic, nTitles(cnt(w))]),
      ['picked', 'Pick titles', 'plus', S.pick.length ? `${S.pick.length} picked` : 'Choose exactly which'],
      ['list', 'A list', 'layers', S.list ? S.list.title : 'Yours or shared with you'],
      ['taste', 'Taste profile', 'activity', taste() ? `From ${taste().rated} rated titles` : 'Rate some titles first'],
      ['year', 'Year in Review', 'clock', S.years.length ? `${S.years[S.years.length - 1]}–${S.years[0]}`.replace(/^(\d+)–\1$/, '$1') : 'Finish something first'],
      ['episodes', 'Episode ratings', 'episodes', !S.epAll ? 'Counting…' : S.epShows.length ? `${S.epShows.length} ${S.epShows.length === 1 ? 'show' : 'shows'} rated` : 'Rate episodes first'],
      ['title', 'A title', 'idCard', cardEntry() ? cardEntry().title : 'One title, as a card'],
      ['all', 'Everything', 'shield', 'Your whole library — for a backup']];
  }
  // the What step's one-line value: "Watched · 218"
  function whatValue() {
    const w = whats().find(x => x[0] === S.what);
    if (!w) return '';
    if (TITLE_WHATS.includes(S.what) && S.what !== 'list' && S.what !== 'picked') return `${w[1]} · ${pool().length}`;
    if (S.what === 'picked') return `Pick titles · ${S.pick.length}`;
    if (S.what === 'list') return S.list ? `A list · ${S.list.title}` : 'A list';
    if (isYear()) return `Year in Review · ${S.year || '—'}`;
    if (isEps()) return epEntry() ? `Episodes · ${epEntry().title}` : 'Episode ratings';
    if (isCard()) return cardEntry() ? `A title · ${cardEntry().title}` : 'A title';
    return w[1];
  }
  // the Options step's one-line value and the Recent list's details: "by score · with notes"
  function optsValue() {
    const out = [];
    if (fmt('image') && !isEps() && !isCard()) out.push(isYear() ? ['Overview', 'Top 5', 'Months'][['overview', 'top', 'months'].indexOf(S.ySlide)] : S.img.size === 'square' ? 'Square' : 'Story');
    if (fmt('image') && isEps()) out.push({ square: 'Square', story: 'Story', wide: 'Wide' }[S.epSize]);
    if (TITLE_WHATS.includes(S.what) && !single() && ['pdf', 'image', 'ai', 'csv'].includes(S.format)) {
      if (S.cat) out.push(CAT_WORD[S.cat]);
      const s = (SORTS[kindOf()].find(x => x[0] === S.sort) || [])[1];
      if (s) out.push(S.sort === 'manual' ? (S.what === 'list' ? 'list order' : 'as picked') : `by ${s.toLowerCase()}`);
      if (S.limit && !mixed() && !fmt('image')) out.push(`${S.sort === 'score' ? 'top' : 'first'} ${S.limit}`);
      if (fmt('pdf') && S.include.notes) out.push('with notes');
    }
    if (fmt('ai')) out.push(S.ai.length === 'short' ? 'short' : 'full');
    if ((fmt('pdf') || fmt('image')) && !isCard()) out.push(isEps() && S.epLook ? S.epLook : S.theme);
    if (S.privacy.anon && (fmt('pdf') || fmt('image'))) out.push('no name');
    return out.join(' · ');
  }

  /* ── UI bits ── */
  const chip = (on, act, label, extra = '') => `<button type="button" class="es-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="${act}"${extra}>${label}</button>`;
  const sw = (on, act, label, sub) => `<button type="button" class="xs-switch" role="switch" aria-checked="${on}" onclick="${act}"><span class="xs-switch-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
  const sec = (label, body, hint) => `<div class="es-sec"><h4 class="lyr-sec-h">${label}${hint ? `<small>${hint}</small>` : ''}</h4>${body}</div>`;
  const seg = (label, opts, cur, act) => `<div class="lyr-seg is-strong es-seg" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, l]) =>
    `<button type="button" class="lyr-seg-opt" role="radio" aria-checked="${cur === v}" onclick="${act(v)}">${l}</button>`).join('')}</div>`;
  const info = (ic, html) => `<div class="es-info">${icon(ic, 16)}<span>${html}</span></div>`;
  const switches = rows => { const r = rows.filter(Boolean); return r.length ? `<div class="xs-switches">${r.join('')}</div>` : ''; };
  const tile = (role, on, act, ic, label, sub, dis) => `<button type="button" role="${role}" class="es-tile${on ? ' on' : ''}" aria-checked="${on}"${dis ? ' aria-disabled="true"' : ''} onclick="${act}">
      <span class="es-tile-ic" aria-hidden="true">${icon(on ? 'check' : ic, 17)}</span><span class="es-tile-t"><b>${esc(label)}</b><small translate="no">${esc(sub)}</small></span></button>`;

  /* ── Step 1 · What ── */
  function whatHTML() {
    const sub = S.what === 'picked' ? sec('Choose titles', `${searchBox('xsPickQ', 'Search your library…', S.pq, 'MSSStudio._pq(this.value)')}<div id="xsPickBody">${pickHTML()}</div>`)
      : S.what === 'list' ? sec('Choose a list', `<div id="xsListBody">${listsHTML()}</div>`)
      : isYear() ? sec('Which year', `<div class="es-chips">${S.years.map(yy => chip(S.year === yy, `MSSStudio._year(${yy})`, String(yy))).join('') || '<span class="es-hint">Nothing finished yet.</span>'}</div>
          <p class="es-hint">${yearData() ? `${yearData().titles} titles finished in ${S.year}${yearData().prev ? ` · ${yearData().prev.titles} the year before` : ''}` : ''}</p>`)
      : isEps() ? sec('Which show', S.epShows?.length ? `${searchBox('xsEpQ', 'Search your shows…', S.epQ, 'MSSStudio._epQ(this.value)')}
          <div class="es-sort"><span class="lyr-sec-h" aria-hidden="true">Sort</span>${_selDDHTML('xsEpSortDD', EP_SORTS.map(([value, label]) => ({ value, label })), S.epSort, '_xsEpSort')}</div>
          <div id="xsEpBody">${epShowsHTML()}</div>`
          : `<p class="es-hint">${S.epAll ? 'Rate episodes on a show’s Episodes page and they show up here.' : 'Loading your episode ratings…'}</p>`)
      : isCard() ? sec('Which title', `${searchBox('xsCardQ', 'Search your library…', S.cq, 'MSSStudio._cardQ(this.value)')}<div id="xsCardBody">${cardRowsHTML()}</div>`)
      : '';
    return `<div class="es-tiles" role="radiogroup" aria-label="What to export">${whats().map(([w, l, ic, s]) => tile('radio', S.what === w, `MSSStudio._set('what','${w}')`, ic, l, s)).join('')}</div>
      ${sub ? `${sub}<button type="button" class="es-next" onclick="MSSStudio._step('format')">Next: Format ${icon('arrowRight', 15)}</button>` : ''}`;
  }
  /* ── Step 2 · Format ── */
  function formatHTML() {
    return `<div class="es-tiles" role="radiogroup" aria-label="Format">${FORMATS.map(([f, l, ic, s]) => {
      const no = why(S.what, f);
      return tile('radio', S.format === f, no ? `MSSStudio._nofit(${attrJSON(no)})` : `MSSStudio._set('format','${f}')`, ic, l, no || s, !!no);
    }).join('')}</div>`;
  }
  /* ── Step 3 · Options: the common ones, the rest under "More" ── */
  function optionsParts() {
    const k = kindOf(), watchedish = k === 'watched' || k === 'mixed', titles = TITLE_WHATS.includes(S.what);
    const base = S.what === 'custom' ? S.o.custom.entries : WHAT[S.what] ? S.all.filter(WHAT[S.what].test) : [];
    const cats = () => sec('Category', `<div class="es-chips">${CATS.map(([c, l]) => { const n = c ? base.filter(e => e.cat === c).length : base.length;
      return chip(S.cat === c, `MSSStudio._set('cat','${c}')`, `${l}<span>${n}</span>`, n || !c ? '' : ' disabled'); }).join('')}</div>`);
    const order = () => single() ? '' : sec('Order', seg('Order', SORTS[k].map(([s, l]) => [s, s === 'manual' && S.what === 'list' ? 'List order' : l]), S.sort, v => `MSSStudio._set('sort','${v}')`));
    const many = () => mixed() ? '' : sec('How many', seg('How many', LIMITS.map(([n, l]) => [n, n ? (S.sort === 'score' ? `Top ${l}` : `First ${l}`) : l]), S.limit, v => `MSSStudio._set('limit',${v})`));
    // Episode ratings: Create Card's three styles (ep-chart.js), Backdrop included; everything else Dark / Light
    const look = () => sec('Look', seg('Look', [['dark', 'Dark'], ['light', 'Light'], ...(isEps() ? [['backdrop', 'Cinematic']] : [])], isEps() && S.epLook ? S.epLook : S.theme, v => `MSSStudio._set('theme','${v}')`));
    const anon = () => sw(S.privacy.anon, "MSSStudio._tog('privacy','anon')", 'Leave my name off', 'No name or @username anywhere in the file');
    const spoil = () => sw(S.privacy.hideSpoilers, "MSSStudio._tog('privacy','hideSpoilers')", 'Hide spoiler notes', 'Notes you marked as spoilers say “hidden” instead');
    const cover = l => sec(l, `<input class="xs-input" id="xsTitle" maxlength="60" placeholder="${esc(title())}" value="${esc(S.title)}" aria-label="${l}" oninput="MSSStudio._title(this.value)">`, 'optional');
    const include = (pdf) => switches([watchedish && sw(S.include.breakdown, "MSSStudio._tog('include','breakdown')", 'Rating breakdown', 'Every category you rated, as bars'),
      watchedish && sw(S.include.highlights, "MSSStudio._tog('include','highlights')", 'Highlights', 'Favourite and least favourite character, episode, season'),
      sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Notes', single() ? 'The whole note' : 'Your note on each title'),
      pdf && k !== 'watching' && sw(S.include.dates, "MSSStudio._tog('include','dates')", 'Dates', k === 'watchlist' ? 'When you added it' : 'When you watched it')]);
    const scores = () => sec('Data source', seg('Data source', [['mine', 'My Ratings'], ['tmdb', 'TMDB'], ['community', 'MSF Community']], S.epSrc, v => `MSSStudio._epSet('epSrc','${v}')`));
    const epNotes = () => sec('Include', switches([sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Episode notes', 'What you wrote about each episode')]));
    const M = [], X = [];   // main, more

    if (isAll()) M.push(sec('What’s in it', info('shield', `Every title in your library with all its ratings, highlights and notes, your lists, your episode ratings and your Diary (every watch and its day) — one file to keep somewhere safe.`)));
    else if (isCard()) M.push(sec('Next', info('idCard', `Create Card opens with ${cardEntry() ? `<b translate="no">${esc(cardEntry().title)}</b>` : 'the title you pick'}: ${!cardEntry() || liveScore(cardEntry()) != null ? 'your poster, scores and note on a card — then choose Card or Discover Card, light or dark.' : 'it isn’t rated yet, so it’s a Discover Card — poster, synopsis, cast. Rate it for the full card.'}`)));
    else if (fmt('letterboxd')) {
      const n = lbList().length;
      M.push(sec('What’s in it', info('film', `<b>${n} watched ${n === 1 ? 'movie' : 'movies'}</b> with your score as a rating (rounded to a whole number out of 10), each day you watched it from your Diary and whether it was a rewatch. Shows aren’t on Letterboxd, so they’re left out. Import it at letterboxd.com → Settings → Import &amp; Export.`)),
        sec('Include', switches([sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Notes as reviews', 'Each note becomes that movie’s review'), sw(S.privacy.hideSpoilers, "MSSStudio._tog('privacy','hideSpoilers')", 'Leave out spoiler notes', 'Notes you marked as spoilers aren’t sent')])));
    } else if (fmt('pdf')) {
      if (isTaste()) M.push(sec('What’s in it', info('activity', 'Worked out from your scores: your average and how generous you are, the genres and decades you score highest, the rating categories you’re kindest and toughest on, how your scores spread from 1 to 10, movies vs shows and your top 5.')));
      else if (isYear()) M.push(sec('What’s in it', info('clock', `Your ${S.year || 'year'}: month by month, your top titles, the first and the last, your genres and highlights.${yearCompare() ? ' ' + esc(yearCompare()) : ''}`)));
      else if (isEps()) { M.push(scores(), epNotes(), `<p class="es-hint">The same chart as the Episodes page’s export — the PDF’s first page, then every episode you rated.</p>`); }
      else {
        if (!mixed()) M.push(cats());
        M.push(order());
        if (!mixed()) M.push(many());
        M.push(sec('Include', include(false)));
        if (k !== 'watching') X.push(sec('Dates', switches([sw(S.include.dates, "MSSStudio._tog('include','dates')", 'Dates', k === 'watchlist' ? 'When you added it' : 'When you watched it')])));
        if (mixed() && !single() && S.sort === 'manual') X.push(sec('Numbers', switches([sw(S.numbered, "MSSStudio._tog('numbered')", 'Number them', S.what === 'list' ? '1, 2, 3… in the list’s order' : '1, 2, 3… in the order you picked')])));
        if (!single()) X.push(sec('Grouping', switches([sw(S.group, "MSSStudio._tog('group')", 'Group by category', 'TV Shows, Movies, Anime and Cartoons in their own sections')])));
      }
      X.push(look(), sec('Privacy', switches([special() ? '' : spoil(), anon()])), cover('Cover title'));
    } else if (fmt('image')) {
      if (isEps()) { M.push(scores(), sec('Format', seg('Format', [['square', 'Square · 1:1'], ['story', 'Portrait · 9:16'], ['wide', 'Landscape · 16:9']], S.epSize, v => `MSSStudio._epSet('epSize','${v}')`)), look()); }
      else if (isYear()) { M.push(sec('Slide', seg('Slide', [['overview', 'Overview'], ['top', 'Top 5'], ['months', 'Months']], S.ySlide, v => `MSSStudio._slide('${v}')`)),
        `<p class="es-hint">Three story slides (9:16) — save each one, then post them in order.</p>`, look(), sec('Privacy', switches([anon()]))); X.push(cover('Heading')); }
      else {
        M.push(sec('Size', seg('Size', [['story', 'Story 9:16'], ['square', 'Square']], S.img.size, v => `MSSStudio._img('${v}')`)));
        if (!isTaste()) { M.push(order()); if (!mixed()) M.push(cats()); }
        M.push(look());
        if (!isTaste()) M.push(info('info', `Images are always your top 10${S.what === 'picked' ? ' (or the ones you picked)' : ''} in this order.`));
        M.push(sec('Privacy', switches([anon()])));
        X.push(cover('Heading'));
      }
    } else if (fmt('ai')) {
      if (!special()) M.push(sec('Length', seg('Length', [['short', 'Short'], ['full', 'Full']], S.ai.length, v => `MSSStudio._ai('length','${v}')`),
        S.ai.length === 'short' ? 'one line per title — fits any chat' : 'every rating, highlight and note'));
      M.push(sec('For the AI', `${switches([sw(S.ai.promptOn, "MSSStudio._ai('promptOn')", 'Start with a request', 'What you want the AI to do — edit it below')])}
        ${S.ai.promptOn ? `<textarea class="xs-input es-prompt" id="xsPrompt" rows="4" maxlength="1500" aria-label="Your request to the AI" oninput="MSSStudio._prompt(this.value)">${esc(S.ai.prompt ?? defaultPrompt())}</textarea>` : ''}`));
      if (titles) { if (!mixed()) M.push(cats()); M.push(order()); if (!mixed()) M.push(many()); }
      if (isEps()) X.push(epNotes());
      if (!special() || (S.what !== 'watchlist' && !isEps())) X.push(sec('Add', switches([!special() && sw(S.ai.taste, "MSSStudio._ai('taste')", 'Add my taste profile', 'A short summary of how you score, on top'),
        S.what !== 'watchlist' && !isEps() && sw(S.ai.watchlist, "MSSStudio._ai('watchlist')", 'Add my watchlist', 'So it doesn’t suggest what you already plan to watch')])));
      if (titles) X.push(sec('Include', include(false)), sec('Privacy', switches([spoil()])));
      X.push(cover('Heading'));
    } else if (fmt('csv')) {
      if (isEps()) M.push(epNotes());
      else { if (!mixed()) M.push(cats()); M.push(order()); if (!mixed()) M.push(many()); M.push(sec('Include', include(false))); X.push(sec('Privacy', switches([spoil()]))); }
    }
    return { main: M.filter(Boolean).join(''), more: X.filter(Boolean).join('') };
  }
  // "More: dates, grouping, privacy, cover title" — named from what's in it
  const moreLabel = html => { const n = [...html.matchAll(/class="lyr-sec-h">([^<]+)/g)].map(m => m[1].toLowerCase()); return n.length ? 'More: ' + n.join(', ') : ''; };

  /* ── A search box like List Studio's: magnifier, clear ✕ (attachClearButton after drawing) ── */
  const searchBox = (id, ph, v, on) => `<div class="fav-picker-search-wrap ls-search xs-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="search" id="${id}" class="fav-picker-search-input" autocomplete="off" aria-label="${esc(ph.replace('…', ''))}" placeholder="${esc(ph)}" value="${esc(v || '')}" oninput="${on}"></div>`;

  /* ── Which show (episode ratings): search, sort, one to pick ── */
  const EP_SORTS = [['count', 'Most episodes rated'], ['recent', 'Recently rated'], ['avg', 'Highest average'], ['az', 'A → Z']];
  function epShowsHTML() {
    const q = (S.epQ || '').trim().toLowerCase();
    const by = { count: (a, b) => b.count - a.count, recent: (a, b) => b.last.localeCompare(a.last), avg: (a, b) => b.avg - a.avg,
      az: (a, b) => String(a.e.title || '').localeCompare(String(b.e.title || '')) }[S.epSort];
    const rows = S.epShows.filter(x => !q || String(x.e.title || '').toLowerCase().includes(q)).sort(by);
    const row = x => {
      const on = S.epShow === x.id, th = thumbUrl(x.e.poster_url), yr = x.e.year ? String(x.e.year).slice(0, 4) : '';
      return `<button type="button" role="radio" class="xs-ls-row xs-ep-row${on ? ' on' : ''}" aria-checked="${on}" onclick="MSSStudio._epShow(${attrJSON(x.id)})">
        <span class="xs-pk-th">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : esc((x.e.title || '?')[0])}</span>
        <span class="xs-pk-text"><b translate="no">${esc(x.e.title || 'Untitled')}</b><small>${[yr, `${x.count} ${x.count === 1 ? 'episode' : 'episodes'} rated`].filter(Boolean).join(' · ')}</small></span>
        <span class="es-sc">${mssScoreHTML(x.avg)}<span class="sr-only"> average</span></span>
        <span class="xs-pk-box" aria-hidden="true">${on ? icon('check', 13) : ''}</span></button>`;
    };
    return `<div class="xs-pk-bar"><span>${rows.length} of ${S.epShows.length} ${S.epShows.length === 1 ? 'show' : 'shows'}</span></div>
      <div class="xs-pk-list" role="radiogroup" aria-label="Which show">${rows.map(row).join('') || '<div class="xs-pk-none">No shows match.</div>'}</div>`;
  }
  function drawEpShows() { const b = $('xsEpBody'); if (b) { const st = b.querySelector('.xs-pk-list')?.scrollTop || 0; b.innerHTML = epShowsHTML(); const l = b.querySelector('.xs-pk-list'); if (l) l.scrollTop = st; } }

  /* ── Pick titles: search + tick, then your picks in order ── */
  const STATUS = [['', 'All'], ['watched', 'Watched'], ['watchlist', 'Watchlist'], ['watching', 'Watching']];
  // A title: your titles, watched first and best-rated first, then the rest A–Z — tap one
  function cardRowsHTML() {
    const q = S.cq.trim().toLowerCase(), done = e => WHAT.watched.test(e) ? 0 : 1;
    const rows = S.all.filter(e => !q || String(e.title || '').toLowerCase().includes(q))
      .sort((a, b) => done(a) - done(b) || (liveScore(b) || 0) - (liveScore(a) || 0) || String(a.title || '').localeCompare(String(b.title || '')));
    const row = e => {
      const sc = liveScore(e), on = S.card === e.id, th = thumbUrl(e.poster_url);
      const meta = [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : '', sc != null ? '' : 'Discover Card'].filter(Boolean).join(' · ');
      return `<button type="button" role="radio" class="xs-pk-row${on ? ' on' : ''}" aria-checked="${on}" onclick="MSSStudio._card('${e.id}')">
        <span class="xs-pk-th">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : esc((e.title || '?')[0])}</span>
        <span class="xs-pk-text"><b translate="no">${esc(e.title || 'Untitled')}</b><small>${esc(meta)}${sc != null ? ` · ${mssScoreHTML(sc)}` : ''}</small></span>
        <span class="xs-pk-box" aria-hidden="true">${on ? icon('check', 13) : ''}</span></button>`;
    };
    return `<div class="xs-pk-list" role="radiogroup" aria-label="Your titles">${rows.slice(0, PICK_SHOW).map(row).join('') || '<div class="xs-pk-none">No titles match.</div>'}</div>`;
  }
  function pickRows() {
    const q = S.pq.trim().toLowerCase();
    return S.all.filter(e => (!S.pst || WHAT[S.pst].test(e)) && (!q || String(e.title || '').toLowerCase().includes(q)))
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }
  function pickHTML() {
    const rows = pickRows(), shown = rows.slice(0, PICK_SHOW), on = new Set(S.pick);
    const allOn = shown.length && shown.every(e => on.has(e.id));
    const row = e => {
      const s = liveScore(e), sel = on.has(e.id), th = thumbUrl(e.poster_url);
      const metaBits = [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : ''].filter(Boolean).join(' · ');
      return `<button type="button" role="checkbox" class="xs-pk-row${sel ? ' on' : ''}" aria-checked="${sel}" onclick="MSSStudio._pick('${e.id}')">
        <span class="xs-pk-th">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : esc((e.title || '?')[0])}</span>
        <span class="xs-pk-text"><b translate="no">${esc(e.title || 'Untitled')}</b><small>${esc(metaBits)}${s != null ? `${metaBits ? ' · ' : ''}${mssScoreHTML(s)}` : ''}</small></span>
        <span class="xs-pk-box" aria-hidden="true">${sel ? icon('check', 13) : ''}</span></button>`;
    };
    const mine = pool();
    return `<div class="es-chips xs-pk-filter">${STATUS.map(([k, l]) => chip(S.pst === k, `MSSStudio._pst('${k}')`, l)).join('')}</div>
      <div class="xs-pk-bar"><span>${nTitles(rows.length)}${rows.length > PICK_SHOW ? ` · showing ${PICK_SHOW}, search to find more` : ''}</span>
        <span>${shown.length ? `<button type="button" class="poll-link" onclick="MSSStudio._pickAll(${!allOn})">${allOn ? 'Untick these' : 'Tick all these'}</button>` : ''}
        ${S.pick.length ? `<button type="button" class="poll-link poll-danger" onclick="MSSStudio._pickClear()">Clear picks</button>` : ''}</span></div>
      <div class="xs-pk-list" role="group" aria-label="Your library">${shown.map(row).join('') || '<div class="xs-pk-none">No titles match.</div>'}</div>
      ${mine.length ? `<h4 class="lyr-sec-h xs-pk-label">Your picks<small>${mine.length} · ${S.sort === 'manual' ? 'move them into the order you want' : 'sorted by the Order in Options'}</small></h4>
        <ol class="xs-pk-picks">${mine.map((e, i) => `<li><span class="xs-pk-n">${i + 1}</span><span class="xs-pk-pt" translate="no">${esc(e.title || 'Untitled')}</span>
          ${S.sort === 'manual' ? `<button type="button" class="xs-pk-mv" aria-label="Move ${esc(e.title || '')} up" onclick="MSSStudio._move(${i},-1)"${i ? '' : ' disabled'}>${icon('chevup', 14)}</button>
          <button type="button" class="xs-pk-mv" aria-label="Move ${esc(e.title || '')} down" onclick="MSSStudio._move(${i},1)"${i < mine.length - 1 ? '' : ' disabled'}>${icon('chevdown', 14)}</button>` : ''}
          <button type="button" class="xs-pk-mv" aria-label="Remove ${esc(e.title || '')}" onclick="MSSStudio._pick('${e.id}')">${icon('x', 14)}</button></li>`).join('')}</ol>` : ''}`;
  }
  function drawPick() { const b = $('xsPickBody'); if (b) { const st = b.querySelector('.xs-pk-list')?.scrollTop || 0; b.innerHTML = pickHTML(); const l = b.querySelector('.xs-pk-list'); if (l) l.scrollTop = st; } drawSide(); }

  /* ── A list: yours or shared with you — anyone else's is exported from its own page (list-view.html) ── */
  async function loadLists() {
    const me = window._navUser?.id, who = S.o.who || {};
    if (!me) { S.lists = []; return; }
    const [own, collab] = await Promise.all([
      sb.from('favorite_lists').select('id, user_id, title, description, items, ranked').eq('user_id', me).order('created_at', { ascending: true }).then(r => r.data || [], () => []),
      sb.from('list_collaborators').select('list_id').eq('user_id', me).eq('status', 'accepted').then(r => r.data || [], () => []),
    ]);
    const sharedIds = collab.map(r => r.list_id);
    const shared = sharedIds.length ? ((await sb.from('favorite_lists').select('id, user_id, title, description, items, ranked, profiles(username)').in('id', sharedIds)).data || []) : [];
    const norm = (l, group, owner) => ({ id: l.id, title: l.title || 'Untitled list', description: l.description || '', items: l.items || [], ranked: !!l.ranked, owner, mine: group === 'mine', group });
    S.lists = [...own.map(l => norm(l, 'mine', who.username)), ...shared.map(l => norm(l, 'shared', l.profiles?.username))];
    // a settings link to someone else's list: that list too (if you can read it)
    const want = S.o.preset?.listId;
    if (want && !S.lists.some(l => l.id === want)) {
      const { data } = await sb.from('favorite_lists').select('id, user_id, title, description, items, ranked, profiles(username)').eq('id', want).maybeSingle().then(r => r, () => ({}));
      if (data) S.lists.unshift(norm(data, 'page', data.profiles?.username));
    }
  }
  function listsHTML() {
    if (!S.lists) return '<div class="es-loading">Loading lists…</div>';
    const q = (S.listQ || '').trim().toLowerCase();
    const show = S.lists.filter(l => !q || l.title.toLowerCase().includes(q) || String(l.owner || '').toLowerCase().includes(q));
    const grp = (g, label) => { const ls = show.filter(l => l.group === g); return ls.length ? `<div class="xs-ls-h">${label}</div>${ls.map(l =>
      `<button type="button" role="radio" class="xs-ls-row${S.list?.id === l.id ? ' on' : ''}" aria-checked="${S.list?.id === l.id}" onclick="MSSStudio._list('${l.id}')">
        <span class="es-tile-ic" aria-hidden="true">${icon('layers', 16)}</span><span class="xs-pk-text"><b translate="no">${esc(l.title)}</b><small translate="no">${nTitles(l.items.length)}${l.mine ? '' : ` · @${esc(l.owner || '')}`}${l.ranked ? ' · ranked' : ''}</small></span>
        <span class="xs-pk-box" aria-hidden="true">${S.list?.id === l.id ? icon('check', 13) : ''}</span></button>`).join('')}` : ''; };
    return `${S.lists.length > 6 ? `<input class="xs-input xs-ls-q" type="search" placeholder="Search your lists…" aria-label="Search your lists" value="${esc(S.listQ || '')}" oninput="MSSStudio._lq(this.value)">` : ''}
      <div class="xs-ls-list" role="radiogroup" aria-label="Lists">${grp('page', 'This list') + grp('mine', 'Your lists') + grp('shared', 'Shared with you') || '<div class="xs-pk-none">No lists yet — make one on the Lists page.</div>'}</div>
      ${S.list && S.listItems && S.listItems.length < S.list.items.length ? `<p class="es-hint">${S.list.items.length - S.listItems.length} of its titles can’t be read and are left out.</p>` : ''}`;
  }
  async function chooseList(id) {
    const l = S.lists?.find(x => x.id === id); if (!l || S.busy) return;
    const me2 = S;
    S.list = l; S.listItems = null; S.numbered = S.o.preset?.numbered ?? l.ranked; if (!SORTS.mixed.some(x => x[0] === S.sort)) S.sort = 'manual';
    draw();
    const ids = l.items.filter(x => !(typeof x === 'string' && x.startsWith('tmdb:')));
    const known = Object.fromEntries(S.all.map(e => [e.id, e]));
    const need = ids.filter(x => !known[x]);
    if (need.length) { const { data } = await sb.from('entries').select('*').in('id', need); (data || []).forEach(e => { known[e.id] = e; }); }
    const tm = {};
    await Promise.all(l.items.filter(x => typeof x === 'string' && x.startsWith('tmdb:')).map(async pid => {
      if (typeof tmdbFetch !== 'function') return;
      const [, type, tid] = pid.split(':');
      try {
        const r = await tmdbFetch(`${TMDB_BASE}/${type}/${tid}?language=en-US`); if (!r.ok) return;
        const d = await r.json();
        tm[pid] = { id: pid, title: type === 'movie' ? d.title : d.name, year: ((type === 'movie' ? d.release_date : d.first_air_date) || '').slice(0, 4),
          cat: type === 'movie' ? 'movies' : 'tv', genres: tmdbGenreNames(d.genres), poster_url: d.poster_path ? TMDB_FULL + d.poster_path : null, tmdb_id: Number(tid), tmdb_type: type };
      } catch {}
    }));
    if (S !== me2 || S.list !== l) return;
    S.listItems = l.items.map(x => known[x] || tm[x]).filter(Boolean);
    draw();
  }

  /* ══ The steps (left; phones: three tabs) ══ */
  function stepsHTML() {
    const vals = { what: whatValue(), format: FMT_NAME[S.format] || '', options: optsValue() || 'Set up' };
    return STEPS.map(([k, l], i) => {
      const open = S.step === k;
      if (!open) return `<section class="es-step is-folded" aria-labelledby="esS_${k}">
          <span class="es-num is-done" aria-hidden="true">${icon('check', 13)}</span><h3 class="es-step-t" id="esS_${k}">${l}</h3>
          <span class="es-step-v" translate="no">${esc(vals[k])}</span>
          <button type="button" class="es-change" onclick="MSSStudio._step('${k}')" aria-label="Change ${l.toLowerCase()} (now ${esc(vals[k])})">Change</button></section>`;
      let body;
      if (k === 'what') body = whatHTML();
      else if (k === 'format') body = formatHTML();
      else { const o = optionsParts(), ml = moreLabel(o.more);
        body = (o.main || `<p class="es-hint">Nothing to set for this one.</p>`) + (o.more ? `<details class="es-more"${S.more ? ' open' : ''} ontoggle="MSSStudio._more(this.open)"><summary>${esc(ml)}${icon('chevdown', 15)}</summary>${o.more}</details>` : ''); }
      return `<section class="es-step is-open" aria-labelledby="esS_${k}" aria-current="step" id="esP_${k}">
        <div class="es-step-h"><span class="es-num" aria-hidden="true">${i + 1}</span><h3 class="es-step-t" id="esS_${k}">${l}</h3><span class="es-step-of" aria-hidden="true">Step ${i + 1} of 3</span></div>
        <div class="es-step-b">${body}</div></section>`;
    }).join('');
  }
  function tabsHTML() {
    return STEPS.map(([k, l], i) => `<button type="button" role="tab" class="es-tab${S.step === k ? ' on' : ''}" id="esT_${k}" aria-selected="${S.step === k}"${S.step === k ? ` aria-controls="esP_${k}"` : ''} tabindex="${S.step === k ? 0 : -1}" onclick="MSSStudio._step('${k}')"><i aria-hidden="true">${i + 1}</i>${l}</button>`).join('');
  }
  function draw() {
    if (!S || !$('esSteps')) return;
    const box = $('esSteps'), scroll = box.scrollTop;
    $('esTabs').innerHTML = tabsHTML();
    box.innerHTML = stepsHTML();
    box.scrollTop = scroll;
    ['xsPickQ', 'xsEpQ', 'xsCardQ'].forEach(id => { if ($(id)) attachClearButton(id); });
    drawSide();
  }

  /* ══ The preview desk ══ */
  const deskMsg = (art, ttl, text) => `<div class="es-msg">${art ? mssArt(art) : ''}<b>${esc(ttl)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  function emptyMsg() {
    if (S.what === 'picked') return deskMsg('lists', 'Nothing picked yet', 'Tick the titles you want in step 1 and they show up here.');
    if (S.what === 'list') return S.list ? deskMsg('', 'Loading the list…') : deskMsg('lists', 'Choose a list', 'Pick one of your lists (or one shared with you) in step 1.');
    if (isTaste()) return deskMsg('person', 'Your taste is a mystery (for now)', 'Rate a few titles and we’ll work out what you love from your scores.');
    if (isYear()) return deskMsg('watched', 'Nothing finished that year', 'Pick another year — or go finish something.');
    if (isEps()) return !S.epAll ? deskMsg('', 'Loading your episode ratings…') : deskMsg('episodes', 'No episodes rated yet', 'Rate a few episodes of a show — on its Episodes page — and its chart lands here.');
    if (isCard()) return deskMsg('watched', 'Pick a title', 'Choose one of your titles in step 1.');
    if (S.cat && pool().length === 0 && S.all.some(WHAT[S.what]?.test || (() => false))) return deskMsg('filter', `No ${CAT_WORD[S.cat]} here`, 'Try another category, or All.');
    return deskMsg({ watched: 'watched', watchlist: 'watchlist', watching: 'watching' }[S.what] || 'watchlist',
      { watched: 'Nothing watched yet', watchlist: 'Your watchlist is empty', watching: 'Nothing on screen right now' }[S.what] || 'Nothing here yet',
      { watched: 'Finish something and it’s ready to export — ranked, rated and looking good.', watchlist: 'Add a few titles and you can share everything you want to see.', watching: 'Start something and you can export what you’re in the middle of.' }[S.what] || 'Pick something else to export.');
  }
  // the desk's top line and tools: ‹ › (PDF), zoom, light / dark
  function deskBar(label, sub, o = {}) {
    $('esDeskL').innerHTML = `${esc(label)}${sub ? `<span>${esc(sub)}</span>` : ''}`;
    const tools = $('esTools'), pg = o.pages;
    tools.querySelector('[data-es="prev"]').hidden = !pg; tools.querySelector('[data-es="next"]').hidden = !pg;
    if (pg) { tools.querySelector('[data-es="prev"]').disabled = S.page <= 1; tools.querySelector('[data-es="next"]').disabled = S.page >= pg; }
    const z = tools.querySelector('[data-es="zoom"]'); z.hidden = !o.zoom;
    z.innerHTML = S.zoom > 1 ? FIT_SVG : ZOOM_SVG; z.setAttribute('aria-label', S.zoom > 1 ? 'Fit the preview' : (fmt('image') ? 'Show at real size' : 'Zoom in')); z.setAttribute('aria-pressed', S.zoom > 1);
    const th = tools.querySelector('[data-es="theme"]'); th.hidden = !o.theme;
    th.innerHTML = icon(S.theme === 'dark' ? 'sun' : 'moon', 17); th.setAttribute('aria-label', S.theme === 'dark' ? 'Make it light' : 'Make it dark');
    $('esFullBtn').hidden = !o.zoom;
  }
  function drawSide() {
    if (!S || !$('esStage')) return;
    if (S.loading) return;
    const st = $('esStage');
    st.classList.toggle('is-zoom', S.zoom > 1);
    st.dataset.kind = '';
    if (isCard()) return deskCard();
    const list = picked();
    if (isEps()) epLoad();
    if (!has(list)) { deskBar('Live preview', ''); st.innerHTML = emptyMsg(); fileBar(list); return; }
    if (fmt('pdf')) return deskPdf(list);
    if (fmt('image')) return deskImage(list);
    if (isAll()) { deskBar('What’s inside', ''); st.innerHTML = backupHTML(); return fileBar(list); }
    deskText(list);
  }
  // A title: the profile's Top Favorites tile (.pf-fav / .mh-fav) — its backdrop full bleed, details and title along the bottom, the score ring
  function deskCard() {
    const e = cardEntry(), st = $('esStage');
    deskBar('Title card', e ? (liveScore(e) != null ? 'next: Card or Discover Card · light or dark' : 'not rated yet — a Discover Card') : '');
    if (!e) { st.innerHTML = emptyMsg(); fileBar([]); return; }
    const sv = liveScore(e), t = mssTypeOf(e.cat, mssIsMovieEntry(e));
    const bits = [t.label, e.year ? String(e.year).slice(0, 4) : '', ...(Array.isArray(e.genres) ? e.genres.slice(0, 2) : [])].filter(Boolean);
    st.innerHTML = `<div class="es-fav" role="img" aria-label="${esc(`${e.title}${sv != null ? ', ' + Number(sv).toFixed(2) : ''}`)}">
        <span class="es-fav-bg" aria-hidden="true"></span><span class="es-fav-shade" aria-hidden="true"></span>
        <span class="es-fav-tx"><span class="es-fav-meta">${esc(bits.join(' · '))}</span><span class="es-fav-title" translate="no">${esc(e.title || 'Untitled')}</span>
          <span class="es-fav-next">${icon('idCard', 14)} ${sv != null ? 'Card · Discover Card' : 'Discover Card'}</span></span>
        ${sv != null ? `<span class="es-fav-ring" aria-hidden="true">${ring(sv, '', e.status === 'dropped')}</span>` : ''}</div>`;
    paintBackdrop(st.querySelector('.es-fav-bg'), e);
    fileBar([]);
  }
  function backupHTML() {
    return `<div class="es-paper"><div class="es-bk">${[['Titles', S.all.length], ['Watched', S.all.filter(WHAT.watched.test).length], ['Watchlist', S.all.filter(WHAT.watchlist.test).length],
      ['With notes', S.all.filter(e => e.notes && e.notes.trim()).length], ...(S.diary ? [['Diary watches', S.diary.length]] : [])].map(([l, v]) => `<span><b>${v}</b><small>${l}</small></span>`).join('')}</div>
      <p class="es-hint">Your lists and episode ratings are added when you download.</p></div>`;
  }
  // the text formats: the real text (the first part) — so you see exactly what you get
  function textOf(list) {
    if (fmt('ai')) return aiText(list);
    if (fmt('csv')) return isEps() ? epCSV() : MSSFormats.csv(list, { include: S.include, privacy: S.privacy, diary: S.diary });
    return MSSFormats.letterboxd(lbList(), { include: S.include, privacy: S.privacy, diary: S.diary });
  }
  function deskText(list) {
    const txt = textOf(list).replace(/^﻿/, ''), lines = txt.split('\n'), cap = fmt('ai') ? 80 : 20;
    S.textBytes = new Blob([txt]).size;
    deskBar('Live preview', fmt('ai') ? 'the text' : 'first rows');
    $('esStage').innerHTML = `<div class="es-paper"><pre class="es-text" tabindex="0" aria-label="Preview of the text">${esc(lines.slice(0, cap).join('\n'))}${lines.length > cap ? '\n…' : ''}</pre></div>`;
    fileBar(list);
  }

  /* ── Image: drawn at its real size, shown to fit (zoom → real size) ── */
  const imgJob = list => ({ size: S.img.size, theme: S.theme, title: title(), kicker: kicker(), entries: isYear() ? (yearData()?.top || []).map(x => x.e) : list, who: S.o.who, anon: S.privacy.anon,
    taste: isTaste() ? taste() : null, year: isYear() ? yearData() : null, slide: S.ySlide });
  const imgSig = list => JSON.stringify([S.what, isEps() ? [S.epShow, S.epSize, S.epSrc, S.epLook, !!epSt()] : [S.img.size, S.ySlide, S.year, list.map(e => e.id)], S.theme, S.privacy.anon, title(), kicker()]);
  function imgDims() { return isEps() ? null : isYear() || S.img.size === 'story' ? [1080, 1920] : [1080, 1080]; }
  function deskImage(list) {
    const st = $('esStage'), d = imgDims();
    st.dataset.kind = 'image';
    deskBar('Live preview', d ? `${d[0]} × ${d[1]}` : '', { zoom: true, theme: true });
    if (isEps() && !epSt()) { st.innerHTML = deskMsg('', S.epSt?.id === S.epShow ? 'This show isn’t linked to TMDB, so there’s no chart — link it from its page.' : 'Getting the episodes…'); fileBar(list); return; }
    let cv = $('esImg');
    if (!cv) { st.innerHTML = '<div class="es-imgwrap"><canvas id="esImg" class="es-img" role="img" aria-label="Preview of the image"></canvas></div>'; cv = $('esImg'); }
    const sig = imgSig(list);
    fileBar(list);
    if (S.imgSig === sig && cv.width > 1) return fitImage();
    S.imgSig = sig; S.imgBytes = null;
    clearTimeout(S.imgT);
    S.imgT = setTimeout(async () => {
      if (!S || !fmt('image') || S.imgSig !== sig) return;
      try {
        if (isEps()) await epChart(cv, S.epSize); else if ((await MSSImage.draw(cv, imgJob(list))) === false) return;
      } catch (err) { console.warn('Image preview:', err); return; }
      if (!S || S.imgSig !== sig) return;
      fitImage();
      if (isEps()) deskBar('Live preview', `${cv.width} × ${cv.height}`, { zoom: true, theme: true });
      cv.toBlob(b => { if (S && S.imgSig === sig && b) { S.imgBytes = b.size; fileBar(picked()); } }, 'image/png');
    }, 120);
  }
  // the stage's inside (without its padding), for fitting a page or an image
  function room(st) { const cs = getComputedStyle(st); return { w: st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2, h: st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2 }; }
  function fitImage() {
    const cv = $('esImg'), st = $('esStage'); if (!cv || cv.width < 2) return;
    if (S.zoom > 1) { cv.style.width = (cv.width / (window.devicePixelRatio || 1)) + 'px'; cv.style.height = 'auto'; return; }
    const r = room(st), s = Math.min(r.w / cv.width, r.h / cv.height, 1);
    cv.style.width = Math.max(40, Math.floor(cv.width * s)) + 'px'; cv.style.height = 'auto';
  }

  /* ── PDF: built for real (export.js), shown with pdf.js — a page is rendered when you go to it ── */
  async function pdfjs() {
    if (!window.pdfjsLib) await mssLoadScript(PDFJS + 'pdf.min.js');
    if (!window.pdfjsLib) throw new Error('The PDF viewer couldn’t load');
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    return pdfjsLib;
  }
  function pdfSig(list) {
    return JSON.stringify([S.what, title(), kicker(), list.map(e => `${e.id}:${e.updated_at || ''}`), ranked(), S.group && !single(), S.theme, S.include, S.privacy, byline(),
      S.what === 'list' ? S.list?.description : '', isYear() ? [S.year, !!S.yExtra] : 0, isEps() ? [S.epShow, S.epSrc, !!epSt()] : 0, S.o.who?.username || '']);
  }
  function baseJob(list, episodes = null) {
    return { kind: kindOf(), title: title(), kicker: kicker(), entries: list, ranked: ranked(), group: S.group && !single(), theme: S.theme,
      include: { ...S.include }, privacy: { ...S.privacy }, who: S.o.who, byline: byline(), desc: S.what === 'list' ? S.list?.description : isYear() ? yearCompare() : '',
      detail: single(), episodes, taste: isTaste() ? taste() : null, year: isYear() ? yearData() : null };
  }
  async function pdfJob(list) {
    if (isEps()) {   // page 1 = the chart (as the image), then every rated episode
      let chart = null;
      if (epSt()) { const cv = document.createElement('canvas'); await epChart(cv, 'a4'); chart = cv.toDataURL('image/jpeg', 0.92); }
      return { kind: 'watched', title: title(), kicker: kicker(), entries: [], theme: S.theme, include: { ...S.include }, privacy: { ...S.privacy }, who: S.o.who, ep: epData(), epChart: chart };
    }
    let episodes = null;
    if (single() && list[0].cat !== 'movies' && MSSPdf.kindOf(list[0]) !== 'title') {   // one title: its episode ratings too
      const id = list[0].id, me2 = S;
      if (!S.epCache[id]) { const { data } = await sb.from('episode_ratings').select('season_number, episode_number, score').eq('entry_id', id); me2.epCache[id] = data || []; }
      episodes = me2.epCache[id];
    }
    return baseJob(list, episodes);
  }
  function deskPdf(list) {
    const st = $('esStage');
    st.dataset.kind = 'pdf';
    const sig = pdfSig(list), p = S.pdf;
    if (p?.sig === sig && p.doc) { pdfShow(); fileBar(list); return; }
    deskBar('Live preview', p?.doc ? 'updating…' : 'building the pages…', { theme: true });
    if (!p?.doc && !st.querySelector('.es-pages')) st.innerHTML = '<div class="es-pages"><div class="es-sheet is-skel" aria-hidden="true"></div></div>';
    st.classList.add('is-updating');
    fileBar(list);
    clearTimeout(S.pdfT);
    S.pdfT = setTimeout(() => pdfBuild(), S.pdf ? 450 : 60);
  }
  // one build at a time; options changed meanwhile → build again once it's done
  async function pdfBuild() {
    if (!S || !fmt('pdf')) return;
    if (S.pdfBusy) { S.pdfAgain = true; return; }
    const me2 = S, list = picked();
    if (!has(list)) return;
    const sig = pdfSig(list);
    if (S.pdf?.sig === sig && S.pdf.doc) { pdfShow(); fileBar(list); if (S.autoGo) autoGo(); return; }
    S.pdfBusy = true;
    try {
      const job = await pdfJob(list);
      const [blob, lib] = await Promise.all([MSSPdf.build(job), pdfjs()]);
      if (S !== me2) return;
      const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      if (S !== me2) { doc.destroy(); return; }
      if (S.pdf?.doc) S.pdf.doc.destroy();
      S.pdf = { sig, blob, doc, n: doc.numPages };
      S.page = Math.min(Math.max(1, S.page), doc.numPages);
    } catch (err) {
      console.error('PDF preview:', err);
      if (S === me2) { S.pdf = { sig, err: true }; $('esStage').innerHTML = deskMsg('', 'Couldn’t draw the preview', 'You can still export — or change an option to try again.'); }
    }
    if (S !== me2) return;
    S.pdfBusy = false;
    $('esStage')?.classList.remove('is-updating');
    if (S.pdfAgain) { S.pdfAgain = false; return pdfBuild(); }
    if (fmt('pdf')) { if (S.pdf.doc) pdfShow(); fileBar(picked()); if (S.autoGo) autoGo(); }
  }
  // the page you're on (and the next one beside it, faded, when there's room), rendered on demand
  async function pdfShow() {
    try { await pdfPaint(); } catch (err) { if (err?.name !== 'RenderingCancelledException') console.warn('PDF page:', err); }   // a page cancelled by a newer build is fine
  }
  async function pdfPaint() {
    const p = S?.pdf, st = $('esStage');
    if (!p?.doc || !st) return;
    st.classList.remove('is-updating');
    deskBar('Live preview', `Page ${S.page} of ${p.n}`, { pages: p.n, zoom: true, theme: true });
    const r = room(st);
    const two = S.zoom === 1 && !phoneMQ.matches && r.w > 2 * r.h * 210 / 297 + 60 && S.page < p.n;
    const w = Math.floor(Math.max(120, S.zoom > 1 ? Math.min(r.w, 1100) : Math.min(r.w / (two ? 2.12 : 1), r.h * 210 / 297)));
    const want = two ? [S.page, S.page + 1] : [S.page];
    const tok = (S.renderTok = (S.renderTok || 0) + 1);
    const box = document.createElement('div'); box.className = 'es-pages';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const n of want) {
      const page = await p.doc.getPage(n);
      if (!S || S.renderTok !== tok) return;
      const vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: w * dpr / vp1.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      cv.style.width = w + 'px'; cv.className = 'es-sheet' + (n !== S.page ? ' is-next' : '');
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `Page ${n} of ${p.n}`);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      if (!S || S.renderTok !== tok) return;
      if (n !== S.page) { const b = document.createElement('button'); b.type = 'button'; b.className = 'es-nextpg'; b.setAttribute('aria-label', `Go to page ${n}`); b.onclick = () => MSSStudio._page(1); b.appendChild(cv); box.appendChild(b); }
      else box.appendChild(cv);
    }
    if (S.renderTok !== tok) return;
    st.innerHTML = ''; st.appendChild(box);
  }
  // a small picture of page 1 (the done screen, Recent, Ready-made)
  async function pdfThumb(blobOrDoc, w = 240) {
    const doc = blobOrDoc.getPage ? blobOrDoc : await (await pdfjs()).getDocument({ data: new Uint8Array(await blobOrDoc.arrayBuffer()) }).promise;
    const page = await doc.getPage(1), vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: w / vp1.width });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    if (!blobOrDoc.getPage) doc.destroy();
    return cv.toDataURL('image/jpeg', 0.8);
  }
  const canvasThumb = (src, w = 240) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(src.height * w / src.width); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.8); };

  /* ══ The file bar: what you'll get, Copy settings link, Export ══ */
  function goLabel() {
    if (isCard()) return ['idCard', 'Make the card'];
    return { pdf: ['download', 'Export PDF'], image: ['download', 'Save image'], ai: ['copy', 'Copy for an AI'], csv: ['download', 'Download .csv'], letterboxd: ['download', 'Download for Letterboxd'], backup: ['download', 'Download backup'] }[S.format];
  }
  function fileBar(list) {
    if (!S || S.busy || !$('esFileT')) return;
    const n = list.length, ok = has(list);
    let main = '', sub = '';
    if (isCard()) { const e = cardEntry(); main = e ? `Image · <span translate="no">${esc(e.title)}</span>` : 'Pick a title'; sub = 'Made in Create Card'; }
    else if (!ok) { main = `${FMT_NAME[S.format]} · nothing to export yet`; sub = 'Change what goes in, on the left'; }
    else if (fmt('pdf')) {
      const p = S.pdf?.sig === pdfSig(list) && S.pdf.doc ? S.pdf : null;
      const what = isTaste() ? 'your taste profile' : isYear() ? `your ${S.year}` : isEps() ? `${epData().count} episodes` : single() ? '1 title, a full page' : nTitles(n);
      main = `PDF · ${what}${p ? ` · ${p.n} ${p.n === 1 ? 'page' : 'pages'}` : ''}`;
      sub = [p ? `~${kb(p.blob.size)}` : 'working out the size…', special() || single() ? '' : MSSPdf.posters(n) ? 'with posters' : `posters only for ${MSSPdf.POSTER_MAX} titles or fewer`].filter(Boolean).join(' · ');
    } else if (fmt('image')) {
      const d = imgDims(), cv = $('esImg');
      main = `Image · ${isTaste() ? 'your taste' : isYear() ? `your ${S.year} · slide ${['overview', 'top', 'months'].indexOf(S.ySlide) + 1} of 3` : isEps() ? esc(epData().show.title) : `top ${n}`} · ${isEps() ? { square: 'Square', story: 'Story', wide: 'Wide' }[S.epSize] : isYear() || S.img.size === 'story' ? 'Story' : 'Square'}`;
      sub = [`PNG${S.imgBytes ? `, ~${kb(S.imgBytes)}` : ''}`, d ? `${d[0]} × ${d[1]}` : cv?.width > 1 ? `${cv.width} × ${cv.height}` : '', special() ? '' : kicker().replace(/^.*? · /, '').toLowerCase()].filter(Boolean).join(' · ');
    } else if (fmt('ai')) { main = `For an AI · ${isTaste() ? 'your taste' : isYear() ? `your ${S.year}` : isEps() ? `${epData().count} episodes` : nTitles(n)}`; sub = `About ${Math.max(1, Math.round((S.textBytes || 0) / 1000))}k characters · copied, or as a .md file`; }
    else if (fmt('csv')) { main = `Spreadsheet · ${isEps() ? `${epData().count} episodes` : nTitles(n)}`; sub = `.csv, ~${kb(S.textBytes || 0)} · one row each`; }
    else if (fmt('letterboxd')) { const m = lbList().length; main = `Letterboxd · ${m} ${m === 1 ? 'movie' : 'movies'}`; sub = `.csv, ~${kb(S.textBytes || 0)}${(S.textBytes || 0) > 1e6 ? ' · over Letterboxd’s 1 MB limit — turn off notes' : ''}`; }
    else if (fmt('backup')) { main = `Full backup · ${nTitles(S.all.length)}`; sub = `.json · ~${kb(new Blob([JSON.stringify(S.all)]).size)} + your lists, episode ratings and Diary`; }
    $('esFileT').innerHTML = `<b>${main}</b><small>${sub}</small>`;
    const L = goLabel();
    $('esGo').innerHTML = `${icon(ICONS[L[0]] ? L[0] : 'download', 16)}<span>${L[1]}</span>`;
    $('esGo').disabled = !ok;
    $('esAlt').hidden = !fmt('ai'); $('esAlt').disabled = !ok;
    $('esCopy').hidden = false;
  }

  /* ══ Settings link + Recent (this device) ══ */
  function setup() {
    const o = { what: S.what === 'custom' ? 'watched' : S.what, format: S.format, cat: S.cat, sort: S.sort, limit: S.limit, group: S.group, theme: S.theme,
      include: S.include, privacy: S.privacy, title: S.title, img: S.img, ySlide: S.ySlide, epSize: S.epSize, epSrc: S.epSrc, ai: { length: S.ai.length, promptOn: S.ai.promptOn, taste: S.ai.taste, watchlist: S.ai.watchlist }, numbered: S.numbered };
    if (S.what === 'picked') o.pick = S.pick.slice(0, 300);
    if (S.what === 'list' && S.list) o.listId = S.list.id;
    if (isYear()) o.year = S.year;
    if (isEps()) o.show = S.epShow;
    if (isCard()) o.card = S.card;
    if (S.ai.prompt != null && S.ai.prompt !== defaultPrompt()) o.ai.prompt = S.ai.prompt;
    return o;
  }
  const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => { try { const o = JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))); return o && typeof o === 'object' ? o : null; } catch { return null; } };
  const link = o => new URL('export.html', location.href).href.split('#')[0] + '#studio=' + enc(o);
  const fromHash = () => { const m = /[#&]studio=([^&]+)/.exec(location.hash); return m ? dec(m[1]) : null; };
  function recent() { try { const r = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(r) ? r.filter(x => x && x.setup) : []; } catch { return []; } }
  function saveRecent(thumb) {
    const s = setup(), key = JSON.stringify(s);
    const item = { setup: s, name: title(), fmt: isCard() ? 'Title card' : FMT_NAME[S.format], ext: fileExt(), opts: optsValue(), at: new Date().toISOString(), thumb: thumb || null };
    const list = [item, ...recent().filter(x => JSON.stringify(x.setup) !== key)].slice(0, 5);
    for (let n = list.length; n > 0; n--) {   // never fail over a full storage: drop the pictures, then the oldest
      try { localStorage.setItem(RECENT, JSON.stringify(list.slice(0, n))); break; }
      catch { list.forEach((x, i) => { if (i) x.thumb = null; }); }
    }
    try { window.dispatchEvent(new CustomEvent('msf-export-recent')); } catch {}
  }
  const fileExt = () => ({ pdf: '.pdf', image: '.png', ai: '.md', csv: '.csv', letterboxd: '.csv', backup: '.json' })[S.format];

  /* ══ Export ══ */
  const slug = () => title().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
  const today = () => new Date().toISOString().slice(0, 10);
  // the file bar becomes the progress bar while it builds (with Cancel)
  function progress(f, label) {
    const on = f != null, bar = $('esFile');
    bar.classList.toggle('is-busy', on);
    $('esProg').hidden = !on; $('esFileIdle').hidden = on;
    $('esOv').classList.toggle('is-busy', on);
    if (!on) return;
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    $('esProgFill').style.width = pct + '%'; $('esProgPct').textContent = pct + '%';
    $('esProgBar').setAttribute('aria-valuenow', pct);
    if (label) $('esProgLabel').textContent = label;
  }
  function stopBusy() { if (!S) return; S.busy = false; progress(null); fileBar(picked()); }
  function cancel() { if (!S?.busy) return; S.run++; stopBusy(); showToast('Export cancelled.'); }
  const saveBlob = (blob, name) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
  async function go(mode) {
    if (!S || S.busy) return;
    if (isCard()) {   // hands over to Create Card: rated → the Card; not rated yet → the Discover Card
      const e = cardEntry(); if (!e) return;
      saveRecent(null);
      close();
      if (typeof createShareCard !== 'function') await mssLoadScript('js/create-card.js');
      (liveScore(e) != null ? createShareCard(e) : createShareCard(e, 3, true)).catch(err => { console.error('Create Card:', err); showToast('Couldn’t open the card — try again.', 'err'); });
      return;
    }
    const list = picked();
    if (!has(list)) { showToast('Nothing to export with these options.', 'err'); return; }
    S.busy = true; S.autoGo = false;
    const run = ++S.run, me2 = S, live = () => S === me2 && S.run === run;
    progress(0, 'Starting…');
    try {
      if (fmt('pdf')) {
        let blob = S.pdf?.sig === pdfSig(list) ? S.pdf.blob : null;
        if (!blob) blob = await MSSPdf.build(await pdfJob(list), (f, l) => { if (live()) progress(f * 0.97, l.replace(/Building your PDF… (\d+) of (\d+)/, 'Building your PDF… $1 / $2 titles')); });
        if (!live()) return;
        progress(0.98, 'Saving…');
        const name = `myscreenfolio-${slug()}${isEps() ? '-episodes' : ''}.pdf`;
        saveBlob(blob, name);
        const th = await pdfThumb(S.pdf?.blob === blob ? S.pdf.doc : blob).catch(() => null);
        if (!live()) return;
        return done({ head: 'Saved', name, size: blob.size, blob, thumb: th, type: 'application/pdf' });
      }
      if (fmt('image')) {
        progress(0.15, 'Getting posters…');
        const cv = document.createElement('canvas');
        if (isEps()) await epChart(cv, S.epSize); else await MSSImage.draw(cv, imgJob(list));
        if (!live()) return;
        progress(0.85, 'Saving…');
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const name = `myscreenfolio-${slug()}-${isEps() ? 'episodes-' + S.epSize : isYear() ? `${['overview', 'top', 'months'].indexOf(S.ySlide) + 1}-${S.ySlide}` : S.img.size}.png`;
        const th = canvasThumb(cv);
        done({ head: 'Saved', name, size: blob?.size || 0, blob, thumb: th, type: 'image/png', square: !isEps() && !isYear() && S.img.size === 'story' });
        await mssSaveImage(cv, name, $('esDoneTh'));
        return;
      }
      progress(0.2, 'Putting it together…');
      await new Promise(r => setTimeout(r, 30));
      if (!live()) return;
      if (fmt('ai')) {
        const txt = aiText(list), name = `myscreenfolio-${slug()}.md`, blob = new Blob([txt], { type: 'text/markdown;charset=utf-8' });
        if (mode !== 'file' && await MSSFormats.copy(txt)) return done({ head: 'Copied', name: 'Paste it into any AI chat', size: blob.size, copied: true });
        saveBlob(blob, name);
        return done({ head: mode === 'file' ? 'Saved' : 'Couldn’t copy here, so it was saved', name, size: blob.size, blob, type: 'text/markdown' });
      }
      if (fmt('csv') || fmt('letterboxd')) {
        const txt = textOf(list), name = fmt('letterboxd') ? `myscreenfolio-letterboxd-${today()}.csv` : `myscreenfolio-${slug()}${isEps() ? '-episodes' : ''}.csv`;
        const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
        saveBlob(blob, name);
        return done({ head: 'Saved', name, size: blob.size, blob, type: 'text/csv', note: fmt('letterboxd') ? (txt.length > 1e6 ? 'It’s over Letterboxd’s 1 MB limit — turn off notes and try again.' : 'Import it on Letterboxd: Settings → Import & Export.') : '' });
      }
      // the full backup: your lists and episode ratings are fetched first
      const me = window._navUser?.id;
      progress(0.3, 'Getting your lists…');
      const lists = me ? ((await sb.from('favorite_lists').select('*').eq('user_id', me)).data || []) : [];
      if (!live()) return;
      progress(0.6, 'Getting your episode ratings…');
      const episodes = me ? await mssWithEpNotes((await sb.from('episode_ratings').select('*').eq('user_id', me)).data || []) : [];
      if (!live()) return;
      const pr = window._navUserProfile || {};
      progress(0.9, 'Saving…');
      const blob = new Blob([MSSFormats.backup({ profile: { username: pr.username, display_name: pr.display_name }, entries: S.all, lists, episodes, diary: S.diary || [] })], { type: 'application/json' });
      const name = `myscreenfolio-backup-${today()}.json`;
      saveBlob(blob, name);
      return done({ head: 'Saved', name, size: blob.size, blob, type: 'application/json', note: 'Keep it somewhere safe.' });
    } catch (err) {
      console.error('Export failed:', err);
      if (live()) { showToast(fmt('pdf') ? 'Couldn’t make the PDF — try again.' : fmt('image') ? 'Couldn’t make the image — try again.' : 'Couldn’t export — try again.', 'err'); stopBusy(); }
    }
  }
  function autoGo() { if (S?.autoGo && !S.busy && has(picked()) && (!fmt('pdf') || S.pdf?.sig === pdfSig(picked()))) go(); }

  /* ── After: the done screen ── */
  function done(d) {
    if (!S) return;
    progress(1, 'Done!');
    saveRecent(d.thumb);
    S.busy = false; progress(null);
    S.last = d;
    const file = d.blob && typeof File === 'function' ? new File([d.blob], d.name, { type: d.type }) : null;
    const share = !!(file && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch { return false; } })());
    const ic = { pdf: 'download', image: 'image', ai: 'sparkles', csv: 'list', letterboxd: 'film', backup: 'shield' }[S.format];
    $('esDone').innerHTML = `<div class="es-done-card" role="status">
      <div class="es-done-top"><div class="es-done-th${d.thumb ? '' : ' is-icon'}" id="esDoneTh">${d.thumb ? `<img src="${d.thumb}" alt="">` : icon(ic, 34)}</div>
        <div class="es-done-txt"><span class="es-done-ok" aria-hidden="true">${icon('check', 22)}</span><h3 id="esDoneH" tabindex="-1">${esc(d.head)}</h3><p translate="no">${esc(d.name)} · ${kb(d.size)}</p>${d.note ? `<p class="es-hint">${esc(d.note)}</p>` : ''}</div></div>
      ${share ? `<button type="button" class="es-btn is-primary" onclick="MSSStudio._share()">${icon('share', 16)} Share</button>` : ''}
      ${d.square ? `<button type="button" class="es-btn" onclick="MSSStudio._square()">${icon('image', 16)} Make the Square one too</button>` : ''}
      <button type="button" class="es-btn${share ? '' : ' is-primary'}" onclick="MSSStudio._back()">Back to Studio</button></div>`;
    $('esDone').hidden = false;
    S.lastFile = file;
    $('esDoneH').focus();
  }
  function back() { if (!S) return; $('esDone').hidden = true; $('esDone').innerHTML = ''; fileBar(picked()); $('esGo').focus(); }

  /* ══ The Studio itself (full screen) ══ */
  function shell() {
    let ov = $('esOv');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'esOv'; ov.className = 'es-ov';
    ov.innerHTML = `<div class="es" role="dialog" aria-modal="true" aria-labelledby="esH">
      <header class="es-head"><button type="button" class="es-x" aria-label="Close Export Studio" onclick="MSSStudio.close()">${icon('x', 18)}</button>
        <div class="es-brand"><span class="es-mark" aria-hidden="true">My<b>Screen</b>Folio</span><h2 id="esH">Export Studio</h2></div>
        <span class="es-mem">${icon('check', 14)} Remembers your last setup</span></header>
      <div class="es-main">
        <aside class="es-side" aria-label="Set up your export"><div class="es-tabs" id="esTabs" role="tablist" aria-label="Steps"></div><div class="es-steps" id="esSteps"></div></aside>
        <section class="es-desk" id="esDesk" aria-label="Preview">
          <div class="es-desk-bar"><span class="es-desk-l" id="esDeskL">Live preview</span>
            <div class="es-tools" id="esTools">
              <button type="button" class="es-tool" data-es="prev" aria-label="Previous page" hidden>${icon('chevleft', 17)}</button>
              <button type="button" class="es-tool" data-es="next" aria-label="Next page" hidden>${icon('chevright', 17)}</button>
              <button type="button" class="es-tool" data-es="zoom" aria-label="Zoom in" hidden>${ZOOM_SVG}</button>
              <button type="button" class="es-tool" data-es="theme" aria-label="Make it light" hidden>${icon('sun', 17)}</button>
              <button type="button" class="es-tool es-unfull" data-es="unfull" aria-label="Close full screen">${icon('x', 17)}</button></div></div>
          <div class="es-stage" id="esStage"></div>
          <button type="button" class="es-tool es-fullbtn" id="esFullBtn" data-es="full" aria-label="Show the preview full screen" hidden>${FULL_SVG}</button>
        </section>
        <div class="es-file" id="esFile">
          <div class="es-file-idle" id="esFileIdle"><div class="es-file-t" id="esFileT" aria-live="polite"></div>
            <button type="button" class="es-btn es-copy" id="esCopy" aria-label="Copy settings link" onclick="MSSStudio._copyLink()">${icon('copy', 15)}<span>Copy settings link</span></button>
            <button type="button" class="es-btn" id="esAlt" hidden onclick="MSSStudio._go('file')">${icon('download', 15)}<span>Download .md</span></button>
            <button type="button" class="es-btn is-primary es-go" id="esGo" onclick="MSSStudio._go()"></button></div>
          <div class="es-prog" id="esProg" hidden><div class="es-prog-top"><span id="esProgLabel">Starting…</span><b id="esProgPct">0%</b></div>
            <div class="es-prog-bar" id="esProgBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="esProgLabel"><i id="esProgFill"></i></div>
            <button type="button" class="es-btn" onclick="MSSStudio._cancel()">Cancel</button></div>
        </div>
        <div class="es-done" id="esDone" hidden></div>
      </div></div>`;
    MSSDialog.bind(ov, () => close());
    ov.querySelector('#esTools').addEventListener('click', ev => { const b = ev.target.closest('[data-es]'); if (b) tool(b.dataset.es); });
    ov.querySelector('#esFullBtn').addEventListener('click', () => tool('full'));
    const st = ov.querySelector('#esStage');
    st.addEventListener('click', ev => { if (phoneMQ.matches && S && !S.full && !ev.target.closest('button')) tool('full'); });
    // swipe between pages (phones, full screen)
    let x0 = null;
    st.addEventListener('pointerdown', ev => { x0 = S?.zoom === 1 ? ev.clientX : null; });
    st.addEventListener('pointerup', ev => { if (x0 == null || !S?.pdf?.doc || !fmt('pdf')) return; const dx = ev.clientX - x0; x0 = null; if (Math.abs(dx) > 50) MSSStudio._page(dx < 0 ? 1 : -1); });
    ov.querySelector('#esTabs').addEventListener('keydown', ev => {   // ← → between the tabs
      if (!S || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
      const i = STEPS.findIndex(s => s[0] === S.step), j = (i + (ev.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
      ev.preventDefault(); step(STEPS[j][0]); $('esT_' + STEPS[j][0])?.focus();
    });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S && !S.loading) { if (fmt('pdf')) pdfShow(); else if (fmt('image')) fitImage(); } }, 150); });
    document.body.appendChild(ov);
    return ov;
  }
  function tool(k) {
    if (!S) return;
    if (k === 'prev' || k === 'next') return MSSStudio._page(k === 'next' ? 1 : -1);
    if (k === 'zoom') { S.zoom = S.zoom > 1 ? 1 : 2; return drawSide(); }
    if (k === 'theme') return set('theme', S.theme === 'dark' ? 'light' : 'dark');
    if (k === 'full' || k === 'unfull') {
      S.full = k === 'full';
      $('esDesk').classList.toggle('is-full', S.full);
      if (!S.full) S.zoom = 1;
      drawSide();
      (S.full ? $('esDesk').querySelector('[data-es="unfull"]') : $('esFullBtn'))?.focus();
    }
  }

  function initState(o, all) {
    const p = prefs(), pre = o.preset || {};
    const s = { o, all: all || [], what: o.custom ? 'custom' : pre.what || 'watched', cat: pre.cat || '', sort: pre.sort || null, limit: pre.limit || 0,
      group: pre.group != null ? !!pre.group : !!p.group, epLook: p.epLook === 'backdrop' ? 'backdrop' : null,
      theme: ['dark', 'light'].includes(pre.theme) ? pre.theme : p.theme === 'light' ? 'light' : p.theme === 'dark' ? 'dark' : (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
      include: { breakdown: true, highlights: true, notes: true, dates: true, ...(p.include || {}), ...(pre.include || {}) },
      privacy: { hideSpoilers: true, anon: false, ...(p.privacy || {}), ...(pre.privacy || {}) }, title: String(pre.title || '').slice(0, 60), busy: false, run: 0,
      years: [], year: pre.year || null, ySlide: pre.ySlide || 'overview', yExtra: null, epAll: null, epShows: [], epShow: pre.show || null, epQ: '', epSort: 'count', epSize: pre.epSize || 'square', epSrc: pre.epSrc || 'mine', epCache: {},
      pick: Array.isArray(pre.pick) ? pre.pick.slice() : [], pq: '', pst: '', numbered: pre.numbered ?? true, card: pre.card || null, cq: '', lists: null, listQ: '', list: null, listItems: null,
      format: pre.format || (['pdf', 'image', 'ai', 'csv'].includes(p.format) ? p.format : 'pdf'),
      img: { size: (pre.img?.size || p.img?.size) === 'square' ? 'square' : 'story' },
      ai: { length: 'full', promptOn: true, watchlist: true, taste: true, ...(p.ai || {}), ...(pre.ai || {}), prompt: pre.ai?.prompt ?? null },
      step: pre.step || (o.preset ? 'options' : 'what'), page: 1, zoom: 1, full: false, more: false, autoGo: !!o.autoGo, loading: true };
    if (pre.format === 'card') { s.what = 'title'; s.format = 'image'; }   // older links / presets
    return s;
  }
  // after the library has loaded: years, sort, a format that fits
  function settle() {
    S.years = MSSYear.years(S.all, S.diary); if (!S.years.includes(S.year)) S.year = S.years[0] || null;
    if (!S.sort || !SORTS[kindOf()].some(x => x[0] === S.sort)) S.sort = SORTS[kindOf()][0][0];
    fitFormat();
  }

  async function open(o = {}) {
    if (S?.busy) return;
    S = initState(o, []);
    const ov = shell();
    $('esDone').hidden = true; $('esDesk').classList.remove('is-full');
    $('esTabs').innerHTML = tabsHTML();
    $('esSteps').innerHTML = '<div class="es-loading">Loading your library…</div>'; $('esStage').innerHTML = '<div class="es-pages"><div class="es-sheet is-skel" aria-hidden="true"></div></div>';
    $('esFileT').innerHTML = '<b>Getting ready…</b><small>&nbsp;</small>'; $('esGo').disabled = true; $('esGo').innerHTML = `${icon('download', 16)}<span>Export</span>`; $('esAlt').hidden = true;
    progress(null);
    requestAnimationFrame(() => ov.classList.add('is-open'));
    MSSDialog.open(ov, { focus: '.es-x' });
    document.documentElement.classList.add('es-lock');
    const me = S;
    try {
      // never wait forever: after 30 s say so (a slow or dropped connection)
      const all = o.load ? await Promise.race([o.load(), new Promise((_, no) => setTimeout(() => no(new Error('Your library took too long to load')), 30000))]) : [];
      if (S !== me) return;                 // closed (or reopened) while it loaded
      S.all = Array.isArray(all) ? all : [];
      S.diary = await loadDiary();          // every watch, for Year in Review and the exports (110)
      if (S !== me) return;
      settle();
      S.loading = false;
      if (isYear()) loadYearExtra();
      loadEpisodes().catch(err => console.warn('Export Studio episodes:', err));   // the "Episode ratings" tile needs the count
      draw();
      if (S.what === 'list') pickWhat('list');
      if (S.autoGo && !fmt('pdf')) setTimeout(autoGo, 300);
    } catch (err) {
      // something went wrong — say what, instead of "Loading…" forever
      console.error('Export Studio:', err);
      if (S !== me) return;
      $('esSteps').innerHTML = `<div class="es-loading es-failed" role="alert">${icon('info', 20)}<b>Couldn’t open the Studio</b><span>${escHTML(String(err?.message || err))}</span>
        <button type="button" class="es-btn is-primary" onclick="MSSStudio._retry()">Try again</button></div>`;
      $('esStage').innerHTML = '';
    }
  }
  function close() {
    if (!S) return;
    if (S.busy) S.run++;    // closing while it builds = cancel
    S.pdf?.doc?.destroy();
    S = null;
    const ov = $('esOv');
    MSSDialog.close(ov);
    ov.classList.remove('is-open', 'is-busy');
    document.documentElement.classList.remove('es-lock');
  }
  async function pickWhat(w) {
    if (w === 'list' && !S.lists) { draw(); const me2 = S; await loadLists().catch(() => { me2.lists = []; }); if (S === me2) draw(); else return; }
    // opened from a list's page (or a settings link): that list, chosen already
    const pl = S?.o.preset?.list, want = pl?.id || S?.o.preset?.listId;
    if (w === 'list' && want && !S.list && S.lists) {
      if (pl && !S.lists.some(l => l.id === pl.id)) S.lists.unshift({ id: pl.id, title: pl.title || 'Untitled list', description: pl.description || '', items: pl.items || [], ranked: !!pl.ranked, owner: pl.owner, mine: !!pl.mine, group: pl.mine ? 'mine' : 'page' });
      if (S.lists.some(l => l.id === want)) chooseList(want);
    }
  }
  function step(k) { if (!S || S.loading) return; S.step = k; draw(); }
  function set(key, v) {
    if (!S || S.busy || S.loading) return;
    if (key === 'what' && S.what === v) { if (!['picked', 'list', 'year', 'episodes', 'title'].includes(v)) step('format'); return; }
    // Backdrop is the episode chart's own style: kept in S.epLook, the Studio's look stays Dark underneath (PDF pages, other files)
    if (key === 'theme') { S.epLook = v === 'backdrop' ? 'backdrop' : null; if (v === 'backdrop') v = 'dark'; }
    S[key] = v;
    if (key === 'what') { S.cat = ''; S.sort = SORTS[kindOf()][0][0]; S.numbered = v === 'list' ? !!S.list?.ranked : true; S.page = 1; fitFormat(); }
    if (key === 'format' && !SORTS[kindOf()].some(x => x[0] === S.sort)) S.sort = SORTS[kindOf()][0][0];
    if (key === 'theme' || key === 'group' || key === 'format') keep();
    if (key === 'what') S.step = ['picked', 'list', 'year', 'episodes', 'title'].includes(v) ? 'what' : 'format';   // a chosen step folds (one with a choice inside stays open)
    else if (key === 'format') S.step = 'options';
    if (['cat', 'sort', 'limit', 'what'].includes(key)) S.page = 1;
    draw();
    if (key === 'what') pickWhat(v);
    if (key === 'what' && v === 'year') loadYearExtra();
    if (key === 'what' && v === 'episodes') loadEpisodes();
  }
  function tog(group, key) {
    if (!S || S.busy) return;
    if (key) S[group][key] = !S[group][key]; else S[group] = !S[group];
    if (group === 'include' || group === 'privacy' || group === 'group') keep();
    draw();
  }
  function togglePick(id) {
    if (!S || S.busy) return;
    const i = S.pick.indexOf(id);
    if (i >= 0) S.pick.splice(i, 1); else S.pick.push(id);
    refreshPicked();
  }
  // picking changes the What tile's count — redraw, keep the search box and the list's scroll
  function refreshPicked() {
    const q = $('xsPickQ'), had = document.activeElement === q, pos = q?.selectionStart;
    const keepScroll = $('xsPickBody')?.querySelector('.xs-pk-list')?.scrollTop || 0;
    draw();
    const q2 = $('xsPickQ'); if (had && q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch {} }
    const l = $('xsPickBody')?.querySelector('.xs-pk-list'); if (l) l.scrollTop = keepScroll;
  }

  /* ══ Ready-made thumbnails: the same code as the export, drawn small ══ */
  async function thumb(preset, { all, who } = {}) {
    if (!all?.length) return null;
    const prev = S, T = initState({ preset, who, load: null }, all);
    let job, kind;
    S = T;   // the job is worked out synchronously with the Studio's own rules, then the Studio's state is put back
    try {
      settle();
      kind = isEps() ? 'eps' : isCard() ? 'card' : fmt('image') ? 'image' : fmt('ai') ? 'ai' : 'pdf';
      const list = picked();
      if (!has(list) && kind !== 'eps') return null;
      job = kind === 'pdf' ? baseJob(list) : kind === 'image' ? imgJob(list) : kind === 'ai' ? aiText(list) : kind === 'card' ? cardEntry() : null;
    } finally { S = prev; }
    if (kind === 'pdf') return pdfThumb(await MSSPdf.build(job), 240);
    if (kind === 'image') { const cv = document.createElement('canvas'); await MSSImage.draw(cv, job); return canvasThumb(cv, 200); }
    if (kind === 'ai') {   // the message itself, set on a sheet
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), dark = T.theme === 'dark';
      cv.width = 240; cv.height = 300; g.fillStyle = dark ? '#1A2E20' : '#FEFCF3'; g.fillRect(0, 0, 240, 300);
      g.fillStyle = dark ? '#C7C4B7' : '#3A453E'; g.font = '9px Manrope, sans-serif';
      String(job).split('\n').slice(0, 30).forEach((l, i) => { g.fillStyle = /^#/.test(l) ? (dark ? '#A6CCB1' : '#24583A') : (dark ? '#C7C4B7' : '#3A453E'); g.fillText(l.slice(0, 48), 12, 18 + i * 9.4); });
      return cv.toDataURL('image/jpeg', 0.8);
    }
    if (kind === 'card') {   // the title's poster, as Create Card starts from
      const u = job && safeURL(job.poster_url);
      return u ? String(u).replace(/\/(w\d+|original)\//, '/w185/') : null;
    }
    // episode ratings: your most-rated show's chart (ep-chart.js)
    const me = window._navUser?.id; if (!me) return null;
    const { data } = await sb.from('episode_ratings').select('entry_id').eq('user_id', me).gt('episode_number', 0);
    const n = {}; (data || []).forEach(r => { n[r.entry_id] = (n[r.entry_id] || 0) + 1; });
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]).map(([id]) => all.find(e => e.id === id)).find(e => e?.tmdb_id);
    if (!top) return null;
    await loadChart();
    const st = await MSSEpChart.load(top.tmdb_id, me, me); if (!st) return null;
    const cv = document.createElement('canvas');
    await MSSEpChart.draw(cv, st, { size: 'square', theme: T.theme, source: 'mine', label: 'All seasons', userId: T.privacy.anon ? null : me });
    return canvasThumb(cv, 220);
  }
  const thumbCache = { get(key) { try { const c = JSON.parse(localStorage.getItem(THUMBS) || '{}'); return c.key === key ? c.v || {} : {}; } catch { return {}; } },
    put(key, id, url) { try { const c = JSON.parse(localStorage.getItem(THUMBS) || '{}'); const v = c.key === key ? c.v || {} : {}; v[id] = url; localStorage.setItem(THUMBS, JSON.stringify({ key, v })); } catch {} } };

  return { open, close, recent, link, fromHash, thumb, thumbCache, prefs, ring, paintBackdrop,
    _set: set, _tog: tog, _go: go, _step: step, _cancel: cancel, _back: back, _retry: () => { const o = S?.o; if (o) open(o); },
    _nofit: msg => showToast(msg),
    _more: on => { if (S) S.more = on; },
    _page: d => { if (!S?.pdf?.doc) return; const n = Math.min(S.pdf.n, Math.max(1, S.page + d)); if (n !== S.page) { S.page = n; pdfShow(); } },
    _copyLink: async () => { if (!S || S.loading) return; const ok = await MSSFormats.copy(link(setup())); showToast(ok ? 'Settings link copied — it opens the Studio set up like this.' : 'Couldn’t copy the link here.', ok ? undefined : 'err'); },
    _share: async () => { const f = S?.lastFile; if (!f) return; try { await navigator.share({ files: [f], title: 'MyScreenFolio' }); } catch (err) { if (err?.name !== 'AbortError') showToast('Couldn’t share it here.', 'err'); } },
    _square: () => { if (!S) return; S.img.size = 'square'; keep(); back(); draw(); go(); },
    _card: id => { if (!S || S.busy) return; S.card = id; const b = $('xsCardBody'), st = b?.querySelector('.xs-pk-list')?.scrollTop || 0; if (b) { b.innerHTML = cardRowsHTML(); b.querySelector('.xs-pk-list').scrollTop = st; } drawSide(); },
    _cardQ: v => { if (!S) return; S.cq = v; const b = $('xsCardBody'); if (b) b.innerHTML = cardRowsHTML(); },
    _year: yy => { if (!S || S.busy) return; S.year = yy; S.page = 1; draw(); },
    _epShow: id => {   // just the list + preview, so the search keeps what you typed and focus stays on the row
      if (!S || S.busy) return; S.epShow = id; S.page = 1; drawEpShows(); drawSide();
      $('xsEpBody')?.querySelector('.xs-ep-row.on')?.focus();
    },
    _epQ: v => { if (S) { S.epQ = v; drawEpShows(); } },
    _epSort: v => { if (S) { S.epSort = v; draw(); } },
    _epSet: (k, v) => { if (!S || S.busy) return; S[k] = v; draw(); },
    _slide: k => { if (!S || S.busy) return; S.ySlide = k; draw(); },
    _img: size => { if (!S || S.busy) return; S.img.size = size; keep(); draw(); },
    _ai: (k, v) => { if (!S || S.busy) return; S.ai[k] = v === undefined ? !S.ai[k] : v; keep(); draw(); },
    _prompt: v => { if (S) { S.ai.prompt = v; drawSide(); } },
    _title: v => { if (S) { S.title = v; drawSide(); } },
    _pick: togglePick, _pq: v => { if (S) { S.pq = v; drawPick(); } }, _pst: k => { if (S) { S.pst = k; drawPick(); } },
    _pickAll: on => { if (!S) return; const ids = pickRows().slice(0, PICK_SHOW).map(e => e.id); S.pick = on ? [...S.pick, ...ids.filter(id => !S.pick.includes(id))] : S.pick.filter(id => !ids.includes(id)); refreshPicked(); },
    _pickClear: () => { if (S) { S.pick = []; refreshPicked(); } },
    _move: (i, d) => { if (!S) return; const j = i + d; if (j < 0 || j >= S.pick.length) return; const ids = pool().map(e => e.id); [ids[i], ids[j]] = [ids[j], ids[i]]; S.pick = ids; refreshPicked(); },
    _list: id => chooseList(id), _lq: v => { if (S) { S.listQ = v; const b = $('xsListBody'); const q = b?.querySelector('.xs-ls-q'), pos = q?.selectionStart; if (b) { b.innerHTML = listsHTML(); const q2 = b.querySelector('.xs-ls-q'); if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch {} } } } } };
})();
