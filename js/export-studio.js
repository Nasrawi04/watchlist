/* ══════════════════════════════════════════════════════════════
   export-studio.js — the Export Studio (MSSStudio): one popup for every
   export. Options on one side, a live preview of the first page on the
   other (under the options on phones), and a progress bar in the site's
   style while it builds. The PDF itself is drawn by export.js (MSSPdf).

   What you can export:
     Watched · Watchlist · Currently watching — whole, or by category, order, top N
     Pick titles — search your library and tick exactly the ones you want
                   (one title = a full page: the whole note + episode ratings)
     A list      — yours or one shared with you (someone else's list: its Export button on list-view.html)
     My taste profile (taste-profile.js) · Year in Review (year-review.js) — PDF / image / AI
     Episode ratings — one show: the same chart as the Episodes page's export (ep-chart.js) as
                       an image, or as the PDF's first page + every rated episode · AI · CSV
     (+ "as filtered here" when a page passes its own list)
   As: PDF · Image (story / square, top 10 — export-image.js) · For an AI (copy / .md) · Spreadsheet (.csv) · Letterboxd (.csv) · Full backup (.json)

   MSSStudio.open({
     load: () => Promise<entries>,        // all of your library entries
     who: { name, username, avatar_url }, // the cover ("by …") and the footer
     preset: { what, cat, sort, limit, group, format,   // optional starting point
               list: { id, title, description, items, ranked, owner, mine } },   // what: 'list' — that list
     custom: { label, entries },          // optional: "As filtered here" (Watched page)
   })

   Look, include, privacy and grouping are remembered on this device.
   Requires config.js (icon, escHTML, MSSDialog, showToast, CAT_META,
   liveScore, safeURL, mssSaveImage), export.js (MSSPdf), export-formats.js (MSSFormats), export-image.js (MSSImage), jsPDF; nav.js (tmdbFetch)
   for list titles that aren't in anyone's library.
══════════════════════════════════════════════════════════════ */
const MSSStudio = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => escHTML(s == null ? '' : String(s));
  const PREFS = 'msf_export_prefs';
  const WHAT = {
    watched:   { label: 'Watched', ic: 'check', test: e => e.status === 'completed' || e.status === 'ongoing' },
    watchlist: { label: 'Watchlist', ic: 'bookmark', test: e => e.status === 'queue' },
    watching:  { label: 'Currently watching', ic: 'play', test: e => ['watching', 'up_next', 'paused'].includes(e.status) },
  };
  const SORTS = {
    watched:   [['score', 'Score'], ['recent', 'Recently watched'], ['title', 'A–Z'], ['year', 'Year']],
    watchlist: [['recent', 'Recently added'], ['title', 'A–Z'], ['year', 'Year']],
    watching:  [['recent', 'Recently watched'], ['title', 'A–Z']],
    mixed:     [['manual', 'As picked'], ['score', 'Score'], ['title', 'A–Z'], ['year', 'Year']],
  };
  const FORMATS = [['pdf', 'PDF', 'download', 'To read, print or send'], ['image', 'Image', 'image', 'Story or square · top 10'], ['ai', 'For an AI', 'sparkles', 'Paste into any AI chat'],
    ['csv', 'Spreadsheet', 'list', '.csv for Excel / Sheets'], ['letterboxd', 'Letterboxd', 'film', 'Import your movies there'], ['backup', 'Full backup', 'layers', 'Everything, as .json'],
    ['card', 'Title card', 'idCard', 'One title, as a card']];
  // Title card = Create Card (create-card.js) — offered where the page has it
  const formats = () => FORMATS.filter(f => f[0] !== 'card' || typeof createShareCard === 'function');
  const CATS = [['', 'All'], ['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const LIMITS = [[0, 'All'], [10, '10'], [25, '25'], [50, '50']];
  const CAT_ORDER = ['tv', 'movies', 'anime', 'cartoons'];
  const PICK_SHOW = 150;    // rows drawn in the picker at once (search narrows it)
  const t = d => d ? new Date(d).getTime() || 0 : 0;
  const thumb = u => u && /^https?:/.test(u) ? String(u).replace(/\/(w\d+|original)\//, '/w92/') : '';

  let S = null;     // { o, all, what, cat, sort, limit, group, theme, include, privacy, title, busy,
                    //   pick: [ids], pq, pst, numbered, lists, listQ, list, listItems }

  function prefs() { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { return {}; } }
  function keep() { try { localStorage.setItem(PREFS, JSON.stringify({ theme: S.theme, include: S.include, privacy: S.privacy, group: S.group, format: S.format, img: S.img, ai: { length: S.ai.length, promptOn: S.ai.promptOn, watchlist: S.ai.watchlist, taste: S.ai.taste } })); } catch {} }
  const fmt = f => S.format === f;
  const usesWhat = () => ['pdf', 'image', 'ai', 'csv'].includes(S.format);
  const defaultPrompt = () => { const k = isEps() ? 'episodes' : isYear() ? 'year' : isTaste() ? 'taste' : kindOf(); return MSSFormats.DEFAULT_PROMPT[k] ?? MSSFormats.DEFAULT_PROMPT.watched; };
  function aiText(list) {
    if (isEps()) return epText();
    const k = kindOf(), wl = S.ai.watchlist && S.what !== 'watchlist' ? S.all.filter(WHAT.watchlist.test) : [];
    return MSSFormats.ai(list, { include: S.include, privacy: S.privacy, length: S.ai.length, watchlist: wl, heading: title(),
      prompt: S.ai.promptOn ? (S.ai.prompt ?? defaultPrompt()) : '', taste: isTaste() || (S.ai.taste && !isYear()) ? taste() : null, year: isYear() ? yearData() : null });
  }
  const lbSource = () => S.all.filter(WHAT.watched.test);
  const has = list => S.what === 'taste' ? !!taste() : S.what === 'year' ? !!yearData() : isEps() ? !!epData() : list.length > 0;   // anything to export?
  const isTaste = () => S.what === 'taste';
  const taste = () => (S.tasteData ??= MSSTaste.compute(S.all));   // worked out once per opening
  const TASTE_FORMATS = ['pdf', 'image', 'ai'];   // the taste profile and the year in review
  const isYear = () => S.what === 'year';
  const isEps = () => S.what === 'episodes';
  const special = () => isTaste() || isYear() || isEps();     // not a list of titles
  const EP_FORMATS = ['pdf', 'image', 'ai', 'csv'];   // episode ratings
  const formatsFor = () => isEps() ? EP_FORMATS : TASTE_FORMATS;

  /* ── Episode ratings: one show — your ratings, episode names from TMDB ── */
  async function loadEpisodes() {
    const me = window._navUser?.id;
    if (!me || S.epAll) return;
    const rows = await sb.from('episode_ratings').select('entry_id, season_number, episode_number, score, tags, note, updated_at').eq('user_id', me).then(r => r.data || [], () => []);
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
    try {
      if (typeof MSSEp === 'undefined') await _navLoadScript('js/episode-ratings.js');
      if (typeof MSSEpChart === 'undefined') await _navLoadScript('js/ep-chart.js');
      const st = await MSSEpChart.load(e.tmdb_id, me, me);
      if (!S) return;
      S.epSt = st ? { id: e.id, st } : { id: e.id, st: null };
    } catch (err) { console.warn('Episode chart:', err); if (S) S.epSt = { id: e.id, st: null }; }
    if (!S) return;
    S.epLoading = null; S.epKey = null;
    if (isEps()) drawSide();
  }
  const epSt = () => S.epSt?.id === S.epShow ? S.epSt.st : null;
  // the chart (ep-chart.js) into a canvas: the image sizes, or 'a4' for the PDF's first page
  const epChart = (cv, size) => MSSEpChart.draw(cv, epSt(), { size, theme: S.theme, source: S.epSrc, label: 'All seasons', userId: S.privacy.anon ? null : window._navUser?.id });
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
    const avgOf = a => a.reduce((t, x) => t + x.score, 0) / a.length;
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
    out.push(`## ${d.show.title} — my episode ratings`, `${d.count} episodes rated · average ${d.avg.toFixed(2)} out of 10${d.best ? ` · best: S${d.best.s} E${d.best.e}${d.best.name ? ` “${d.best.name}”` : ''} (${d.best.score.toFixed(1)})` : ''}`);
    d.seasons.forEach(sn => {
      out.push('', `### Season ${sn.n} — average ${sn.avg.toFixed(2)}`);
      sn.rows.forEach(r => out.push(`- E${r.e}${r.name ? ` · ${r.name}` : ''} — ${r.score.toFixed(1)}${r.tags.length ? ` (${r.tags.join(', ')})` : ''}${S.include.notes && r.note ? ` — ${r.note.replace(/\s+/g, ' ')}` : ''}`));
    });
    return out.join('\n');
  }
  function epCSV() {
    const d = epData(), q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const rows = [['Show', 'Season', 'Episode', 'Title', 'Score', 'Band', 'Tags', ...(S.include.notes ? ['Note'] : []), 'Rated']];
    d?.seasons.forEach(sn => sn.rows.forEach(r => rows.push([d.show.title, sn.n, r.e, r.name, r.score.toFixed(1), r.band, r.tags.join('; '), ...(S.include.notes ? [r.note] : []), (r.at || '').slice(0, 10)])));
    return '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n');
  }
  // PDF preview: its first page, the chart (drawn by drawSide into #xsEpPv)
  function epPreviewHTML() {
    if (!epData()) return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in"><div class="xs-pv-empty">${S.epAll ? 'Rate some episodes of a show first — on its Episodes page.' : 'Loading your episode ratings…'}</div></div></div>`;
    return epSt() ? '<canvas id="xsEpPv" class="xs-img xs-ep-a4" role="img" aria-label="Preview of the first page"></canvas>'
      : `<div class="xs-loading">${S.epSt?.id === S.epShow ? 'Not linked to TMDB — the PDF lists your rated episodes without the chart.' : 'Getting the episodes…'}</div>`;
  }

  const yearData = () => {   // worked out per year (again once the medals / episode ratings have loaded)
    const key = `${S.year}:${!!S.yExtra}`;
    if (S.yKey !== key) { S.yKey = key; S.yData = S.year ? MSSYear.compute(S.all, S.year, S.yExtra || {}) : null; }
    return S.yData;
  };
  async function loadYearExtra() {
    if (S.yExtra || S.yLoading) return;
    S.yLoading = true;
    const me = window._navUser?.id;
    const [b, ep] = await Promise.all([
      me ? sb.rpc('my_badges', { p_user: me }).then(r => r.data || [], () => []) : [],
      me ? sb.from('episode_ratings').select('entry_id, season_number, episode_number, score, created_at, updated_at').eq('user_id', me).then(r => r.data || [], () => []) : []]);
    if (!S) return;
    S.yExtra = { badges: Array.isArray(b) ? b : [], episodes: ep }; S.yLoading = false;
    if (isYear()) draw();
  }

  const mixed = () => S.what === 'picked' || S.what === 'list';
  const kindOf = () => S.what === 'custom' || special() ? 'watched' : mixed() ? 'mixed' : S.what;
  const single = () => S.what === 'picked' && S.pick.length === 1;
  function pool() {
    if (S.what === 'picked') return S.pick.map(id => S.all.find(e => e.id === id)).filter(Boolean);
    if (S.what === 'list') return S.listItems || [];
    if (special()) return [];
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
    if (S.group && !single()) l = CAT_ORDER.flatMap(c => l.filter(e => e.cat === c)).concat(l.filter(e => !CAT_ORDER.includes(e.cat)));
    return l;
  }
  const ranked = () => !single() && (S.sort === 'score' && kindOf() !== 'watchlist' && kindOf() !== 'watching' || mixed() && S.sort === 'manual' && S.numbered);
  function title() {
    if (S.title.trim()) return S.title.trim();
    const cat = S.cat ? ' ' + (CATS.find(c => c[0] === S.cat)[1]).toLowerCase() : '';
    if (S.what === 'custom') return S.o.custom.label;
    if (S.what === 'picked') return single() ? pool()[0]?.title || 'My pick' : 'My picks';
    if (S.what === 'list') return S.list?.title || 'A list';
    if (isTaste()) return 'My taste';
    if (isYear()) return `My ${S.year || 'year'}`;
    if (isEps()) return epEntry()?.title || 'Episode ratings';
    if (S.what === 'watched') return S.limit && S.sort === 'score' ? `My top ${S.limit}${cat}` : `Everything I’ve watched${S.cat ? ` ·${cat}` : ''}`;
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
    return [S.what === 'custom' ? 'Watched' : WHAT[S.what].label, S.cat ? CATS.find(c => c[0] === S.cat)[1] : 'All categories', sortL ? (S.sort === 'score' ? 'By score' : sortL) : ''].filter(Boolean).join(' · ');
  }
  // a list that isn't yours says whose it is
  const byline = () => S.what === 'list' && S.list && !S.list.mine ? `A list by @${S.list.owner || 'someone'}` : '';

  /* ── UI bits ── */
  const chip = (on, act, label, extra = '') => `<button type="button" class="xs-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="${act}"${extra}>${label}</button>`;
  const sw = (on, act, label, sub) => `<button type="button" class="xs-switch" role="switch" aria-checked="${on}" onclick="${act}"><span class="xs-switch-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
  const sec = (label, body, hint) => `<div class="xs-sec"><div class="xs-sec-label">${label}${hint ? `<span>${hint}</span>` : ''}</div>${body}</div>`;

  function optsHTML() {
    const k = kindOf(), counts = w => S.all.filter(WHAT[w].test).length;
    const whats = [...(S.o.custom ? [['custom', S.o.custom.label, 'filter', `${S.o.custom.entries.length} titles`]] : []),
      ...Object.keys(WHAT).map(w => { const n = counts(w); return [w, WHAT[w].label, WHAT[w].ic, `${n} ${n === 1 ? 'title' : 'titles'}`]; }),
      ['picked', 'Pick titles', 'plus', S.pick.length ? `${S.pick.length} picked` : 'Choose exactly which'],
      ['list', 'A list', 'layers', S.list ? S.list.title : 'Yours or shared with you'],
      ...(TASTE_FORMATS.includes(S.format) ? [['taste', 'My taste profile', 'activity', taste() ? `From ${taste().rated} rated titles` : 'Rate some titles first'],
        ['year', 'Year in Review', 'clock', S.years.length ? `${S.years[S.years.length - 1]}–${S.years[0]}`.replace(/^(\d+)–\1$/, '$1') : 'Finish something first']] : []),
      ...(EP_FORMATS.includes(S.format) ? [['episodes', 'Episode ratings', 'episodes', !S.epAll ? 'Loading…' : S.epShows.length ? `${S.epShows.length} ${S.epShows.length === 1 ? 'show' : 'shows'} rated` : 'Rate episodes first']] : [])];
    const base = S.what === 'custom' ? S.o.custom.entries : WHAT[S.what] ? S.all.filter(WHAT[S.what].test) : [];
    const watchedish = k === 'watched' || k === 'mixed';
    const fmts = sec('Export as', `<div class="xs-fmts" role="radiogroup" aria-label="Export as">${formats().map(([f, l, ic, sub]) =>
        `<button type="button" role="radio" class="xs-fmt${S.format === f ? ' on' : ''}" aria-checked="${S.format === f}" onclick="MSSStudio._set('format','${f}')">
          <span class="xs-what-ic">${icon(ic, 16)}</span><span class="xs-pk-text"><b>${l}</b><small>${sub}</small></span></button>`).join('')}</div>`);
    if (fmt('card')) return fmts + sec('Which title', `<input class="xs-input" id="xsCardQ" type="search" placeholder="Search your titles…" value="${esc(S.cq)}" aria-label="Search your titles" oninput="MSSStudio._cardQ(this.value)" autocomplete="off">
        <div id="xsCardBody">${cardRowsHTML()}</div>`, 'pick one');
    if (fmt('backup')) return fmts + sec('What’s in it', `<div class="xs-info">${icon('info', 16)}<span>Every title in your library with all its ratings, highlights and notes, your lists and your episode ratings — one file to keep somewhere safe.</span></div>`);
    if (fmt('letterboxd')) { const n = MSSFormats.lbMovies(lbSource()).length;
      return fmts + sec('What’s in it', `<div class="xs-info">${icon('film', 16)}<span><b>${n} watched ${n === 1 ? 'movie' : 'movies'}</b> with your score as a rating (rounded to a whole number out of 10), the date you watched it and whether it was a rewatch. Shows aren’t on Letterboxd, so they’re left out. Import it at letterboxd.com → Settings → Import &amp; Export.</span></div>`)
        + sec('Include', `<div class="xs-switches">${sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Notes as reviews', 'Each note becomes that movie’s review')}${sw(S.privacy.hideSpoilers, "MSSStudio._tog('privacy','hideSpoilers')", 'Leave out spoiler notes', 'Notes you marked as spoilers aren’t sent')}</div>`); }
    return fmts + sec('What to export', `<div class="xs-whats" role="radiogroup" aria-label="What to export">${whats.map(([w, l, ic, sub]) =>
        `<button type="button" role="radio" class="xs-what${S.what === w ? ' on' : ''}" aria-checked="${S.what === w}" onclick="MSSStudio._set('what','${w}')">
          <span class="xs-what-ic">${icon(ic, 18)}</span><b>${esc(l)}</b><small translate="no">${esc(sub)}</small></button>`).join('')}</div>`)
      + (S.what === 'picked' ? sec('Choose titles', `${searchBox('xsPickQ', 'Search your library…', S.pq, 'MSSStudio._pq(this.value)')}<div id="xsPickBody">${pickHTML()}</div>`) : '')
      + (S.what === 'list' ? sec('Choose a list', `<div id="xsListBody">${listsHTML()}</div>`) : '')
      + (isYear() ? sec('Which year', `<div class="xs-chips">${S.years.map(yy => chip(S.year === yy, `MSSStudio._year(${yy})`, String(yy))).join('') || '<span class="xs-hint">Nothing finished yet.</span>'}</div>
          <div class="xs-hint">${yearData() ? `${yearData().titles} titles finished in ${S.year}${yearData().prev ? ` · ${yearData().prev.titles} the year before` : ''}` : ''}</div>`) : '')
      + (isEps() ? sec('Which show', S.epShows?.length ? `${searchBox('xsEpQ', 'Search your shows…', S.epQ, 'MSSStudio._epQ(this.value)')}
          <div class="ls-tools xs-ep-tools"><div class="ls-dd"><span class="ls-dd-l">Sort</span>${SF.dd('xsEpSortDD', esc(EP_SORTS.find(o => o[0] === S.epSort)[1]), false,
            EP_SORTS.map(([v, l]) => `<div class="td-dd-opt${S.epSort === v ? ' active' : ''}" role="option" aria-selected="${S.epSort === v}" onclick="event.stopPropagation();SF.closeDD();MSSStudio._epSort('${v}')">${esc(l)}</div>`).join(''))}</div></div>
          <div id="xsEpBody">${epShowsHTML()}</div>`
          : `<div class="xs-hint">${S.epAll ? 'Rate episodes on a show’s Episodes page and they show up here.' : 'Loading your episode ratings…'}</div>`)
        + (fmt('image') || fmt('pdf') ? sec('Scores', `<div class="xs-chips">${[['mine', 'Mine'], ['tmdb', 'TMDB'], ['community', 'Community']].map(([k2, l]) => chip(S.epSrc === k2, `MSSStudio._epSet('epSrc','${k2}')`, l)).join('')}</div>
            <div class="xs-hint">The same chart as the Episodes page’s export${fmt('pdf') ? ' — the PDF’s first page, then every episode you rated' : ''}.</div>`) : '')
        + (fmt('image') ? sec('Size', `<div class="xs-chips">${[['square', 'Square'], ['story', 'Story'], ['wide', 'Wide']].map(([k2, l]) => chip(S.epSize === k2, `MSSStudio._epSet('epSize','${k2}')`, l)).join('')}</div>`)
          : sec('Include', `<div class="xs-switches">${sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Episode notes', 'What you wrote about each episode')}</div>`)) : '')
      + (isTaste() ? sec('What’s in it', `<div class="xs-info">${icon('activity', 16)}<span>Worked out from your scores: your average and how generous you are, the genres and decades you score highest, the rating categories you’re kindest and toughest on${fmt('pdf') ? ', how your scores spread from 1 to 10, movies vs shows and your top 5' : ''}.</span></div>`) : '')
      + (!mixed() && !special() ? sec('Category', `<div class="xs-chips">${CATS.map(([c, l]) => { const n = c ? base.filter(e => e.cat === c).length : base.length;
          return chip(S.cat === c, `MSSStudio._set('cat','${c}')`, `${l}<span>${n}</span>`, n || !c ? '' : ' disabled'); }).join('')}</div>`) : '')
      + (single() || special() ? '' : sec('Order', `<div class="xs-chips">${SORTS[k].map(([s, l]) => chip(S.sort === s, `MSSStudio._set('sort','${s}')`, s === 'manual' && S.what === 'list' ? 'List order' : l)).join('')}</div>`))
      + (fmt('image') && isYear() ? sec('Slide', `<div class="xs-chips">${[['overview', 'Overview'], ['top', 'Top 5'], ['months', 'Months']].map(([k2, l]) => chip(S.ySlide === k2, `MSSStudio._slide('${k2}')`, l)).join('')}</div>
          <div class="xs-hint">Three story slides (9:16) — save each one, then post them in order.</div>`) : '')
      + (fmt('image') && !isYear() ? sec('Size', `<div class="xs-chips">${chip(S.img.size === 'story', "MSSStudio._img('story')", 'Story · 9:16')}${chip(S.img.size === 'square', "MSSStudio._img('square')", 'Square · 1:1')}</div>
          ${special() ? '' : `<div class="xs-hint">Images hold your top 10 — the first 10 in the order above${S.what === 'picked' ? ' (or the ones you picked)' : ''}.</div>`}`) : '')
      + (!mixed() && !fmt('image') && !special() ? sec('How many', `<div class="xs-chips">${LIMITS.map(([n, l]) => chip(S.limit === n, `MSSStudio._set('limit',${n})`, n ? (S.sort === 'score' ? `Top ${l}` : `First ${l}`) : l)).join('')}</div>`) : '')
      + (fmt('ai') ? sec('For the AI', `${special() ? '' : `<div class="xs-chips">${chip(S.ai.length === 'short', "MSSStudio._ai('length','short')", 'Short')}${chip(S.ai.length === 'full', "MSSStudio._ai('length','full')", 'Full')}</div>
          <div class="xs-hint">${S.ai.length === 'short' ? 'One line per title — fits in any chat, even long libraries.' : 'Every rating, highlight and note — best for a detailed answer.'}</div>`}
          <div class="xs-switches${special() ? '' : ' xs-gap'}">${sw(S.ai.promptOn, "MSSStudio._ai('promptOn')", 'Start with a request', 'What you want the AI to do — edit it below')}
            ${special() ? '' : sw(S.ai.taste, "MSSStudio._ai('taste')", 'Add my taste profile', 'A short summary of how you score, on top')}
            ${S.what !== 'watchlist' && !isEps() ? sw(S.ai.watchlist, "MSSStudio._ai('watchlist')", 'Add my watchlist', 'So it doesn’t suggest what you already plan to watch') : ''}</div>
          ${S.ai.promptOn ? `<textarea class="xs-input xs-prompt" id="xsPrompt" rows="4" maxlength="1500" aria-label="Your request to the AI" oninput="MSSStudio._prompt(this.value)">${esc(S.ai.prompt ?? defaultPrompt())}</textarea>` : ''}`) : '')
      + (fmt('pdf') || fmt('image') ? sec('Look', `<div class="xs-looks">${[['dark', 'Dark'], ['light', 'Light']].map(([th, l]) =>
          `<button type="button" class="xs-look xs-look-${th}${S.theme === th ? ' on' : ''}" aria-pressed="${S.theme === th}" onclick="MSSStudio._set('theme','${th}')"><i aria-hidden="true"></i>${l}</button>`).join('')}</div>`) : '')
      + (fmt('image') || special() ? '' : sec('Include', `<div class="xs-switches">
          ${watchedish ? sw(S.include.breakdown, "MSSStudio._tog('include','breakdown')", 'Rating breakdown', 'Every category you rated, as bars') : ''}
          ${watchedish ? sw(S.include.highlights, "MSSStudio._tog('include','highlights')", 'Highlights', 'Favourite and least favourite character, episode, season') : ''}
          ${sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Notes', single() ? 'The whole note' : 'Your note on each title')}
          ${k !== 'watching' && fmt('pdf') ? sw(S.include.dates, "MSSStudio._tog('include','dates')", 'Dates', k === 'watchlist' ? 'When you added it' : 'When you watched it') : ''}
          ${fmt('pdf') && mixed() && !single() && S.sort === 'manual' ? sw(S.numbered, "MSSStudio._tog('numbered')", 'Number them', S.what === 'list' ? '1, 2, 3… in the list’s order' : '1, 2, 3… in the order you picked') : ''}
          ${single() || !fmt('pdf') ? '' : sw(S.group, "MSSStudio._tog('group')", 'Group by category', 'TV Shows, Movies, Anime and Cartoons in their own sections')}</div>`))
      + (special() && fmt('ai') || isEps() && !fmt('pdf') ? '' : sec('Privacy', `<div class="xs-switches">
          ${fmt('image') || special() ? '' : sw(S.privacy.hideSpoilers, "MSSStudio._tog('privacy','hideSpoilers')", 'Hide spoiler notes', 'Notes you marked as spoilers say “hidden” instead')}
          ${fmt('pdf') || fmt('image') ? sw(S.privacy.anon, "MSSStudio._tog('privacy','anon')", 'Leave my name off', 'No name or @username anywhere in the file') : ''}</div>`))
      + (fmt('csv') ? '' : sec(fmt('pdf') ? 'Cover title' : 'Heading', `<input class="xs-input" id="xsTitle" maxlength="60" placeholder="${esc(title())}" value="${esc(S.title)}" aria-label="Cover title" oninput="MSSStudio._title(this.value)">`, 'optional'));
  }

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
      const on = S.epShow === x.id, th = thumb(x.e.poster_url), yr = x.e.year ? String(x.e.year).slice(0, 4) : '';
      return `<button type="button" role="radio" class="xs-ls-row xs-ep-row${on ? ' on' : ''}" aria-checked="${on}" onclick="MSSStudio._epShow(${attrJSON(x.id)})">
        <span class="xs-pk-th">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : esc((x.e.title || '?')[0])}</span>
        <span class="xs-pk-text"><b translate="no">${esc(x.e.title || 'Untitled')}</b><small>${[yr, `${x.count} ${x.count === 1 ? 'episode' : 'episodes'} rated`].filter(Boolean).join(' · ')}</small></span>
        <span class="ls-score"><span aria-hidden="true">★</span> ${x.avg.toFixed(1)}<span class="sr-only"> average</span></span>
        <span class="xs-pk-box" aria-hidden="true">${on ? icon('check', 13) : ''}</span></button>`;
    };
    return `<div class="xs-pk-bar"><span>${rows.length} of ${S.epShows.length} ${S.epShows.length === 1 ? 'show' : 'shows'}</span></div>
      <div class="xs-pk-list" role="radiogroup" aria-label="Which show">${rows.map(row).join('') || '<div class="xs-pk-none">No shows match.</div>'}</div>`;
  }
  function drawEpShows() { const b = $('xsEpBody'); if (b) { const st = b.querySelector('.xs-pk-list')?.scrollTop || 0; b.innerHTML = epShowsHTML(); const l = b.querySelector('.xs-pk-list'); if (l) l.scrollTop = st; } }

  /* ── Pick titles: search + tick, then your picks in order ── */
  const STATUS = [['', 'All'], ['watched', 'Watched'], ['watchlist', 'Watchlist'], ['watching', 'Watching']];
  // Title card: your titles, watched first and best-rated first, then the rest A–Z — tap one
  function cardRowsHTML() {
    const q = S.cq.trim().toLowerCase(), done = e => WHAT.watched.test(e) ? 0 : 1;
    const rows = S.all.filter(e => !q || String(e.title || '').toLowerCase().includes(q))
      .sort((a, b) => done(a) - done(b) || (liveScore(b) || 0) - (liveScore(a) || 0) || String(a.title || '').localeCompare(String(b.title || '')));
    const row = e => {
      const sc = liveScore(e), on = S.card === e.id, th = thumb(e.poster_url);
      const meta = [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : '', sc != null ? `★ ${Number(sc).toFixed(2)}` : ''].filter(Boolean).join(' · ');
      return `<button type="button" role="radio" class="xs-pk-row${on ? ' on' : ''}" aria-checked="${on}" onclick="MSSStudio._card('${e.id}')">
        <span class="xs-pk-th">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : esc((e.title || '?')[0])}</span>
        <span class="xs-pk-text"><b translate="no">${esc(e.title || 'Untitled')}</b><small>${esc(meta)}</small></span>
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
      const s = liveScore(e), sel = on.has(e.id), th = thumb(e.poster_url);
      const metaBits = [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : '', s != null ? `★ ${Number(s).toFixed(2)}` : ''].filter(Boolean).join(' · ');
      return `<button type="button" role="checkbox" class="xs-pk-row${sel ? ' on' : ''}" aria-checked="${sel}" onclick="MSSStudio._pick('${e.id}')">
        <span class="xs-pk-th">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : esc((e.title || '?')[0])}</span>
        <span class="xs-pk-text"><b translate="no">${esc(e.title || 'Untitled')}</b><small>${esc(metaBits)}</small></span>
        <span class="xs-pk-box" aria-hidden="true">${sel ? icon('check', 13) : ''}</span></button>`;
    };
    const mine = pool();
    return `<div class="xs-chips xs-pk-filter">${STATUS.map(([k, l]) => chip(S.pst === k, `MSSStudio._pst('${k}')`, l)).join('')}</div>
      <div class="xs-pk-bar"><span>${rows.length} ${rows.length === 1 ? 'title' : 'titles'}${rows.length > PICK_SHOW ? ` · showing ${PICK_SHOW}, search to find more` : ''}</span>
        <span>${shown.length ? `<button type="button" class="poll-link" onclick="MSSStudio._pickAll(${!allOn})">${allOn ? 'Untick these' : 'Tick all these'}</button>` : ''}
        ${S.pick.length ? `<button type="button" class="poll-link poll-danger" onclick="MSSStudio._pickClear()">Clear picks</button>` : ''}</span></div>
      <div class="xs-pk-list" role="group" aria-label="Your library">${shown.map(row).join('') || '<div class="xs-pk-none">No titles match.</div>'}</div>
      ${mine.length ? `<div class="xs-sec-label xs-pk-label">Your picks<span>${mine.length} · ${S.sort === 'manual' ? 'move them into the order you want' : 'sorted by the Order below'}</span></div>
        <ol class="xs-pk-picks">${mine.map((e, i) => `<li><span class="xs-pk-n">${i + 1}</span><span class="xs-pk-pt" translate="no">${esc(e.title || 'Untitled')}</span>
          ${S.sort === 'manual' ? `<button type="button" class="xs-pk-mv" aria-label="Move up" onclick="MSSStudio._move(${i},-1)"${i ? '' : ' disabled'}>${icon('chevup', 14)}</button>
          <button type="button" class="xs-pk-mv" aria-label="Move down" onclick="MSSStudio._move(${i},1)"${i < mine.length - 1 ? '' : ' disabled'}>${icon('chevdown', 14)}</button>` : ''}
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
  }
  function listsHTML() {
    if (!S.lists) return '<div class="xs-loading">Loading lists…</div>';
    const q = (S.listQ || '').trim().toLowerCase();
    const show = S.lists.filter(l => !q || l.title.toLowerCase().includes(q) || String(l.owner || '').toLowerCase().includes(q));
    const grp = (g, label) => { const ls = show.filter(l => l.group === g); return ls.length ? `<div class="xs-ls-h">${label}</div>${ls.map(l =>
      `<button type="button" role="radio" class="xs-ls-row${S.list?.id === l.id ? ' on' : ''}" aria-checked="${S.list?.id === l.id}" onclick="MSSStudio._list('${l.id}')">
        <span class="xs-what-ic">${icon('layers', 16)}</span><span class="xs-pk-text"><b translate="no">${esc(l.title)}</b><small translate="no">${l.items.length} ${l.items.length === 1 ? 'title' : 'titles'}${l.mine ? '' : ` · @${esc(l.owner || '')}`}${l.ranked ? ' · ranked' : ''}</small></span>
        <span class="xs-pk-box" aria-hidden="true">${S.list?.id === l.id ? icon('check', 13) : ''}</span></button>`).join('')}` : ''; };
    return `${S.lists.length > 6 ? `<input class="xs-input xs-ls-q" type="search" placeholder="Search lists…" aria-label="Search lists" value="${esc(S.listQ || '')}" oninput="MSSStudio._lq(this.value)">` : ''}
      <div class="xs-ls-list" role="radiogroup" aria-label="Lists">${grp('page', 'This list') + grp('mine', 'Your lists') + grp('shared', 'Shared with you') || '<div class="xs-pk-none">No lists yet — make one on the Lists page.</div>'}</div>
      ${S.list && S.listItems && S.listItems.length < S.list.items.length ? `<div class="xs-ls-note">${S.list.items.length - S.listItems.length} of its titles can’t be read and are left out.</div>` : ''}`;
  }
  async function chooseList(id) {
    const l = S.lists?.find(x => x.id === id); if (!l || S.busy) return;
    S.list = l; S.listItems = null; S.numbered = l.ranked; S.sort = 'manual';
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
          cat: type === 'movie' ? 'movies' : 'tv', genres: (d.genres || []).map(g => g.name), poster_url: d.poster_path ? TMDB_FULL + d.poster_path : null, tmdb_id: Number(tid), tmdb_type: type };
      } catch {}
    }));
    if (S?.list !== l) return;
    S.listItems = l.items.map(x => known[x] || tm[x]).filter(Boolean);
    draw();
  }

  // The first page, drawn in HTML with the PDF's palette (sizes in page-widths, so it scales)
  function previewHTML(list) {
    const k = kindOf(), st = single() && list[0] ? MSSPdf.detailStats(list[0], null) : MSSPdf.stats(k, list), posters = MSSPdf.posters(list.length), rnk = ranked();
    const who = S.o.who || {}, by = byline() || (S.privacy.anon || !(who.name || who.username) ? '' : `by ${who.name || who.username}${who.username && who.name && who.name !== who.username ? ` (@${who.username})` : ''}`);
    const rk = (e, i) => S.group ? list.slice(0, i + 1).filter(x => x.cat === e.cat).length : i + 1;   // grouped: ranks per category
    const card = (e, i) => {
      const ek = k === 'mixed' ? MSSPdf.kindOf(e) : k;
      const s = MSSPdf.score(e), b = S.include.breakdown && ek === 'watched' ? MSSPdf.bars(e).slice(0, single() ? 30 : 6) : [];
      const c = S.include.highlights && ek === 'watched' ? MSSPdf.chips(e).slice(0, single() ? 6 : 3) : [];
      const n = S.include.notes ? MSSPdf.text(e) : { note: '' }, pr = ek === 'watching' ? MSSPdf.progress(e) : null;
      const poster = e.poster_url && /^https?:/.test(e.poster_url) ? `<img src="${esc(e.poster_url)}" alt="" loading="lazy">` : esc((e.title || '?')[0]);
      return `<div class="xs-pv-card">
        ${rnk ? `<span class="xs-pv-rank${rk(e, i) <= 3 ? ' top' : ''}">${rk(e, i)}</span>` : ''}
        ${posters ? `<span class="xs-pv-poster">${poster}</span>` : ''}
        <div class="xs-pv-main">
          <div class="xs-pv-title" translate="no">${esc(e.title || 'Untitled')}</div>
          <div class="xs-pv-meta">${esc(MSSPdf.meta(ek, e, S.include))}</div>
          ${pr ? `<div class="xs-pv-prog"><b>${esc(pr.label)}</b><i><u style="width:${Math.round(pr.pct * 100)}%"></u></i></div>` : ''}
          ${b.length ? `<div class="xs-pv-bars">${b.map(r => `<span><em>${esc(r.label)}</em><b>${r.v % 1 ? r.v.toFixed(1) : r.v}</b><i><u style="width:${r.v * 10}%"></u></i></span>`).join('')}</div>` : ''}
          ${c.length ? `<div class="xs-pv-chips">${c.map(x => `<span class="${x.low ? 'low' : ''}"><em>${esc(x.lbl)}</em> ${esc(x.v)}</span>`).join('')}</div>` : ''}
          ${n.note ? `<div class="xs-pv-note${single() ? ' full' : ''}">${n.spoiler && S.privacy.hideSpoilers ? '<i>Note hidden — it has spoilers.</i>' : esc(n.note.slice(0, single() ? 900 : 160))}</div>` : ''}
        </div>
        ${ek === 'watched' ? `<span class="xs-pv-badge${s == null ? ' none' : ''}"><small>Score</small><b>${s == null ? 'Unrated' : s.toFixed(2)}</b><small>Out of 10</small></span>` : ''}
      </div>`;
    };
    return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in">
      <div class="xs-pv-top"><span class="xs-pv-wm">MY<u>SCREEN</u>FOLIO</span><span>${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      <div class="xs-pv-kicker">${esc(kicker())}</div>
      <div class="xs-pv-h1">${esc(title())}</div>
      ${by ? `<div class="xs-pv-by">${esc(by)}</div>` : ''}
      ${S.what === 'list' && S.list?.description ? `<div class="xs-pv-desc">${esc(S.list.description)}</div>` : ''}
      <div class="xs-pv-stats">${st.map(x => `<span><b${x.word ? ' class="word"' : ''}>${esc(x.value)}</b><small>${esc(x.label)}</small></span>`).join('')}</div>
      ${S.group && !single() && list[0] ? `<div class="xs-pv-group">${esc(CAT_META?.[list[0].cat]?.label || '')}</div>` : ''}
      ${list.slice(0, 3).map(card).join('') || `<div class="xs-pv-empty">${S.what === 'picked' ? 'Tick some titles to see them here.' : S.what === 'list' ? (S.list ? 'Loading the list…' : 'Choose a list to see it here.') : 'Nothing here yet — pick something else to export.'}</div>`}
      ${list.length > 3 ? `<div class="xs-pv-more">+ ${list.length - 3} more ${list.length - 3 === 1 ? 'title' : 'titles'}</div>` : ''}
    </div></div>`;
  }
  // "Up from 12 titles in 2025" — under the year in review's title
  function yearCompare() {
    const yv = yearData(); if (!yv?.prev) return '';
    const d = yv.titles - yv.prev.titles;
    return d > 0 ? `Up from ${yv.prev.titles} titles in ${yv.year - 1}.` : d < 0 ? `Down from ${yv.prev.titles} titles in ${yv.year - 1}.` : `The same as ${yv.year - 1}: ${yv.titles} titles.`;
  }
  // The year in review's first page, in the PDF's look
  function yearPreviewHTML() {
    const yv = yearData(), who = S.o.who || {};
    if (!yv) return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in"><div class="xs-pv-empty">Nothing finished in that year.</div></div></div>`;
    const mx = Math.max(...yv.months, 1);
    return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in">
      <div class="xs-pv-top"><span class="xs-pv-wm">MY<u>SCREEN</u>FOLIO</span><span>${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      <div class="xs-pv-kicker">${esc(kicker())}</div><div class="xs-pv-h1">${esc(title())}</div>
      ${S.privacy.anon || !(who.name || who.username) ? '' : `<div class="xs-pv-by">by ${esc(who.name || who.username)}</div>`}
      ${yearCompare() ? `<div class="xs-pv-desc">${esc(yearCompare())}</div>` : ''}
      <div class="xs-pv-stats">${MSSPdf.yearStats(yv).map(x => `<span><b${x.word ? ' class="word"' : ''}>${esc(x.value)}</b><small>${esc(x.label)}</small></span>`).join('')}</div>
      <div class="xs-pv-group">Month by month</div>
      <div class="xs-yr-cols">${yv.months.map((n, i) => `<span><i><u style="height:${n / mx * 100}%"></u></i><b>${MSSYear.MONTHS[i]}</b></span>`).join('')}</div>
      ${yv.top.length ? `<div class="xs-pv-group xs-tp-gap">Your top ${yv.top.length} of ${yv.year}</div>${yv.top.map((x, i) => `<div class="xs-yr-top"><em>${i + 1}</em><b translate="no">${esc(x.e.title)}</b><span>${x.s.toFixed(2)}</span></div>`).join('')}` : ''}
    </div></div>`;
  }
  // The taste profile's first page, in the PDF's look
  function tastePreviewHTML() {
    const t = taste(), who = S.o.who || {};
    if (!t) return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in"><div class="xs-pv-empty">Rate a few titles first — your taste is worked out from your scores.</div></div></div>`;
    const bar = (l, v, n, tag) => `<div class="xs-tp-row"><b>${esc(l)}</b><i><u style="width:${v * 10}%"></u></i><em>${v.toFixed(2)}</em><small>${n} ${n === 1 ? 'title' : 'titles'}</small>${tag ? `<span>${tag}</span>` : ''}</div>`;
    return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in">
      <div class="xs-pv-top"><span class="xs-pv-wm">MY<u>SCREEN</u>FOLIO</span><span>${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      <div class="xs-pv-kicker">${esc(kicker())}</div><div class="xs-pv-h1">${esc(title())}</div>
      ${S.privacy.anon || !(who.name || who.username) ? '' : `<div class="xs-pv-by">by ${esc(who.name || who.username)}</div>`}
      <div class="xs-pv-stats">${MSSPdf.tasteStats(t).map(x => `<span><b${x.word ? ' class="word"' : ''}>${esc(x.value)}</b><small>${esc(x.label)}</small></span>`).join('')}</div>
      ${t.genres.length ? `<div class="xs-pv-group">Genres</div>${t.genres.slice(0, 6).map(g => bar(g.name, g.avg, g.n)).join('')}` : ''}
      ${t.categories.length ? `<div class="xs-pv-group xs-tp-gap">How you rate</div>${t.categories.slice(0, 6).map((c, k) => bar(c.label, c.avg, c.n, k === 0 ? 'Kindest' : '')).join('')}` : ''}
    </div></div>`;
  }
  // Rough page count: the cover block, then each card's height (as the PDF measures it, give or take)
  function pages(list) {
    const k = kindOf(), posters = MSSPdf.posters(list.length);
    let used = 95, n = 1;
    list.forEach(e => {
      const ek = k === 'mixed' ? MSSPdf.kindOf(e) : k;
      let h = 22;
      if (S.include.breakdown && ek === 'watched') h += Math.ceil(MSSPdf.bars(e).length / 3) * 5.8 + 3;
      if (S.include.highlights && ek === 'watched' && MSSPdf.chips(e).length) h += 9;
      if (S.include.notes && MSSPdf.text(e).note) h += Math.min(single() ? 40 : 6, Math.ceil(MSSPdf.text(e).note.length / 110)) * 3.6 + 4;
      if (posters) h = Math.max(h, 36);
      h += 3.5;
      if (used + h > 281) { n++; used = 14; }
      used += h;
    });
    return n;
  }

  // text formats: the actual text (first part), so you see exactly what you get
  function textPreview(list) {
    if (fmt('backup')) return `<div class="xs-bk">${[['Titles', S.all.length], ['Watched', S.all.filter(WHAT.watched.test).length], ['Watchlist', S.all.filter(WHAT.watchlist.test).length],
      ['With notes', S.all.filter(e => e.notes && e.notes.trim()).length]].map(([l, v]) => `<span><b>${v}</b><small>${l}</small></span>`).join('')}</div><div class="xs-hint xs-center">Lists and episode ratings are added when you download.</div>`;
    const txt = fmt('ai') ? aiText(list) : fmt('csv') && isEps() ? epCSV().replace(/^\uFEFF/, '') : fmt('csv') ? MSSFormats.csv(list.slice(0, 12), { include: S.include, privacy: S.privacy }).replace(/^\uFEFF/, '')
      : MSSFormats.letterboxd(lbSource().slice(0, 12), { include: S.include, privacy: S.privacy });
    const lines = txt.split('\n'), cut = lines.slice(0, fmt('ai') ? 60 : 14).join('\n');
    return `<pre class="xs-text" tabindex="0" aria-label="Preview">${esc(cut)}${lines.length > (fmt('ai') ? 60 : 14) ? '\n…' : ''}</pre>`;
  }
  function drawSide() {
    if (!S) return;
    if (fmt('card')) {   // the card itself is made in Create Card — here: which title
      const e = S.all.find(x => x.id === S.card), th = e && safeURL(e.poster_url);
      $('xsPvLabel').innerHTML = 'Title card<span>next: Card or Discover Card · light or dark</span>';
      $('xsPreview').innerHTML = e ? `<div class="xs-card-pv">${th ? `<img src="${esc(th)}" alt="">` : `<span>${esc((e.title || '?')[0])}</span>`}<b translate="no">${esc(e.title || 'Untitled')}</b>
          ${liveScore(e) != null ? `<em>★ ${Number(liveScore(e)).toFixed(2)}</em>` : ''}<small>Your poster, scores and note on a card to share — you can hide the note.</small></div>`
        : `<div class="xs-loading">Pick a title on the left.</div>`;
      $('xsSummary').innerHTML = e ? `<b translate="no">${esc(e.title || 'Untitled')}</b> · an image to share` : 'Pick one of your titles.';
      goLabel(); $('xsAlt').hidden = true; if (!S.busy) $('xsGo').disabled = !e;
      return;
    }
    const list = picked(), n = list.length;
    if (isEps()) epLoad();
    if (fmt('image') && isEps()) {   // the Episodes page's chart, drawn here
      const d = epData();
      $('xsPvLabel').innerHTML = 'Preview';     // the size follows the show (ep-chart.js) — shown once it's drawn
      if (!epSt()) $('xsPreview').innerHTML = `<div class="xs-loading">${!d ? '' : S.epSt?.id === S.epShow ? 'This show isn’t linked to TMDB, so there’s no chart — link it from its page.' : 'Getting the episodes…'}</div>`;
      else {
        let cv = $('xsImg');
        if (!cv) { $('xsPreview').innerHTML = '<canvas id="xsImg" class="xs-img" role="img" aria-label="Preview of the image"></canvas>'; cv = $('xsImg'); }
        cv.classList.toggle('square', S.epSize === 'square'); cv.classList.toggle('wide', S.epSize === 'wide');
        clearTimeout(S.imgT); S.imgT = setTimeout(() => { if (S && fmt('image') && isEps() && epSt()) epChart(cv, S.epSize).then(() => { if (S && $('xsImg') === cv) $('xsPvLabel').innerHTML = `Preview<span>${cv.width} × ${cv.height}</span>`; }).catch(err => console.warn(err)); }, 120);
      }
      $('xsSummary').innerHTML = d ? `<b>${esc(d.show.title)}</b> · ${d.count} episodes rated · ${{ square: 'square, for posts', story: 'story, for Instagram / TikTok', wide: 'wide' }[S.epSize]}` : 'Pick a show you’ve rated episodes of.';
      goLabel(); $('xsAlt').hidden = true; if (!S.busy) $('xsGo').disabled = !epSt();
      return;
    }
    if (fmt('image')) {
      $('xsPvLabel').innerHTML = `Preview<span>${S.img.size === 'square' ? '1080 × 1080' : '1080 × 1920'}</span>`;
      let cv = $('xsImg');
      if (!cv) { $('xsPreview').innerHTML = '<canvas id="xsImg" class="xs-img" role="img" aria-label="Preview of the image"></canvas>'; cv = $('xsImg'); }
      cv.classList.toggle('square', S.img.size === 'square' && !isYear());
      clearTimeout(S.imgT); S.imgT = setTimeout(() => { if (S && fmt('image')) MSSImage.draw(cv, imgJob(list)); }, 120);
      goLabel(); $('xsAlt').hidden = true;
      if (isTaste()) { $('xsSummary').innerHTML = taste() ? `<b>Your taste</b> · from ${taste().rated} rated titles` : 'Rate a few titles first.'; if (!S.busy) $('xsGo').disabled = !taste(); return; }
      if (isYear()) { $('xsPvLabel').innerHTML = 'Preview<span>1080 × 1920</span>'; $('xsSummary').innerHTML = yearData() ? `<b>Your ${S.year}</b> · slide ${['overview', 'top', 'months'].indexOf(S.ySlide) + 1} of 3` : 'Nothing finished that year.'; if (!S.busy) $('xsGo').disabled = !yearData(); return; }
      $('xsSummary').innerHTML = n ? `<b>${n} ${n === 1 ? 'title' : 'titles'}</b>${pool().length > n ? ` · the first ${n} of ${pool().length}` : ''} · ${S.img.size === 'square' ? 'square, for posts' : 'story, for Instagram / TikTok'}` : 'Nothing to export with these options.';
      if (!S.busy) $('xsGo').disabled = !n;
      return;
    }
    $('xsPvLabel').innerHTML = fmt('pdf') ? 'Preview<span>first page</span>' : fmt('backup') ? 'What’s inside' : `Preview<span>${fmt('ai') ? 'the text' : 'first rows'}</span>`;
    $('xsPreview').innerHTML = fmt('pdf') ? (isTaste() ? tastePreviewHTML() : isYear() ? yearPreviewHTML() : isEps() ? epPreviewHTML() : previewHTML(list)) : textPreview(list);
    if (fmt('pdf') && isEps() && $('xsEpPv')) { const cv = $('xsEpPv'); clearTimeout(S.imgT); S.imgT = setTimeout(() => { if (S && isEps() && epSt()) epChart(cv, 'a4').catch(err => console.warn(err)); }, 120); }
    goLabel();
    if (!fmt('pdf')) {
      const lb = fmt('letterboxd') ? MSSFormats.lbMovies(lbSource()).length : 0;
      $('xsSummary').innerHTML = fmt('backup') ? `<b>${S.all.length} titles</b> · your lists · your episode ratings`
        : fmt('letterboxd') ? (lb ? `<b>${lb} ${lb === 1 ? 'movie' : 'movies'}</b> · Letterboxd import file` : 'No watched movies yet.')
        : isEps() ? (epData() ? `<b>${esc(epData().show.title)}</b> · ${epData().count} episodes${fmt('ai') ? ` · about ${Math.max(1, Math.round(aiText(list).length / 1000))}k characters` : ' · one row each'}` : 'Pick a show you’ve rated episodes of.')
        : isYear() ? (yearData() ? `<b>Your ${S.year}</b> · ${yearData().titles} titles · about ${Math.max(1, Math.round(aiText(list).length / 1000))}k characters` : 'Nothing finished that year.')
        : isTaste() ? (taste() ? `<b>Your taste</b> · from ${taste().rated} rated titles · about ${Math.max(1, Math.round(aiText(list).length / 1000))}k characters` : 'Rate a few titles first.')
        : n ? `<b>${n} ${n === 1 ? 'title' : 'titles'}</b>${fmt('ai') ? ` · about ${Math.max(1, Math.round(aiText(list).length / 1000))}k characters` : ' · one row each'}` : 'Nothing to export with these options.';
      if (!S.busy) $('xsGo').disabled = fmt('backup') ? !S.all.length : fmt('letterboxd') ? !lb : !has(list);
      $('xsAlt').hidden = !fmt('ai'); $('xsAlt').disabled = !has(list);
      return;
    }
    $('xsAlt').hidden = true;
    if (isYear()) { $('xsSummary').innerHTML = yearData() ? `<b>Your ${S.year}</b> · ${yearData().titles} titles · about 2 pages` : 'Nothing finished that year.'; if (!S.busy) $('xsGo').disabled = !yearData(); return; }
    if (isEps()) { const d = epData(), n2 = 1 + Math.max(1, Math.ceil((d?.count || 0) / 22)); $('xsSummary').innerHTML = d ? `<b>${esc(d.show.title)}</b> · the chart, then all ${d.count} episodes · about ${n2} pages` : 'Pick a show you’ve rated episodes of.'; if (!S.busy) $('xsGo').disabled = !d || S.epSt?.id !== S.epShow; return; }
    if (isTaste()) { $('xsSummary').innerHTML = taste() ? `<b>Your taste</b> · from ${taste().rated} rated titles · about 2 pages` : 'Rate a few titles first — it’s worked out from your scores.'; if (!S.busy) $('xsGo').disabled = !taste(); return; }
    $('xsSummary').innerHTML = !n ? (S.what === 'picked' ? 'Tick the titles you want in it.' : S.what === 'list' && !S.list ? 'Choose a list.' : 'Nothing to export with these options.')
      : single() ? `<b>1 title</b> · a full page — every rating, the whole note${MSSPdf.kindOf(list[0]) === 'watched' && list[0].cat !== 'movies' ? ' and your episode ratings' : ''}`
      : `<b>${n} ${n === 1 ? 'title' : 'titles'}</b> · about ${pages(list)} ${pages(list) === 1 ? 'page' : 'pages'} · ${MSSPdf.posters(n) ? 'with posters' : `no posters <span>(only for ${MSSPdf.POSTER_MAX} titles or fewer)</span>`}`;
    if (!S.busy) $('xsGo').disabled = !n;
  }
  function draw() {
    if (!S) return;
    const scroll = $('xsOpts').scrollTop;
    $('xsOpts').innerHTML = optsHTML();
    $('xsOpts').scrollTop = scroll;
    ['xsPickQ', 'xsEpQ', 'xsCardQ'].forEach(id => attachClearButton(id));
    drawSide();
  }

  function overlay() {
    let ov = $('xsOverlay');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'xsOverlay'; ov.className = 'soc-overlay xs-overlay';
    ov.innerHTML = `<div class="soc-card xs-card" role="dialog" aria-modal="true" aria-labelledby="xsTitleH">
        <div class="sf-header xs-head"><div><div class="sf-title" id="xsTitleH">Export Studio</div><div class="xs-head-sub">Pick what goes in and how it looks — the preview updates as you go.</div></div>
          <button type="button" class="sf-close" aria-label="Close" onclick="MSSStudio.close()">${icon('x', 18)}</button></div>
        <div class="xs-grid">
          <div class="xs-opts" id="xsOpts"></div>
          <div class="xs-side"><div class="xs-sec-label xs-pv-label" id="xsPvLabel">Preview<span>first page</span></div><div id="xsPreview"></div><div class="xs-summary" id="xsSummary" aria-live="polite"></div></div>
        </div>
        <div class="sf-footer xs-foot" id="xsFoot">
          <button type="button" class="sf-clear-btn" id="xsCancel" onclick="MSSStudio.close()">Cancel</button>
          <button type="button" class="sf-clear-btn xs-alt" id="xsAlt" hidden onclick="MSSStudio._go('file')">${icon('download', 15)} Download .md</button>
          <button type="button" class="sf-apply-btn" id="xsGo" onclick="MSSStudio._go()">${icon('download', 15)} Export PDF</button>
        </div>
        <div class="xs-progress" id="xsProg" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="xsProgLabel">
          <div class="xs-progress-top"><span id="xsProgLabel">Starting…</span><b id="xsProgPct">0%</b></div>
          <div class="xs-progress-bar"><i id="xsProgFill"></i></div>
        </div>
      </div>`;
    MSSDialog.bind(ov, () => close());
    // the Sort dropdown floats over the popup — keep it on its button while the options
    // scroll, and close it once the button scrolls out of view
    ov.querySelector('#xsOpts').addEventListener('scroll', ev => {
      const dd = ov.querySelector('.sf-dd.open');
      if (!dd) return;
      const r = dd.querySelector('.sf-dd-trigger').getBoundingClientRect(), box = ev.currentTarget.getBoundingClientRect(), m = dd.querySelector('.td-dd-menu');
      if (r.bottom < box.top || r.top > box.bottom) { SF.closeDD(); return; }
      if (m.style.top && m.style.top !== 'auto') m.style.top = r.bottom + 'px'; else m.style.bottom = (window.innerHeight - r.top) + 'px';
    }, { passive: true });
    document.body.appendChild(ov);
    return ov;
  }

  async function open(o = {}) {
    const p = prefs(), pre = o.preset || {};   // the format is remembered — but not Letterboxd / backup, which are one-offs
    S = { o, all: [], what: o.custom ? 'custom' : pre.what || 'watched', cat: pre.cat || '', sort: pre.sort || null, limit: pre.limit || 0,
      group: pre.group != null ? pre.group : !!p.group, theme: p.theme === 'light' ? 'light' : p.theme === 'dark' ? 'dark' : (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
      include: { breakdown: true, highlights: true, notes: true, dates: true, ...(p.include || {}) },
      privacy: { hideSpoilers: true, anon: false, ...(p.privacy || {}) }, title: '', busy: false,
      years: [], year: null, ySlide: 'overview', yExtra: null, epAll: null, epShows: [], epShow: pre.show || null, epQ: '', epSort: 'count', epSize: 'square', epSrc: 'mine',
      pick: [], pq: '', pst: '', numbered: true, card: pre.card || null, cq: '', lists: null, listQ: '', list: null, listItems: null,
      format: pre.format || (['pdf', 'image', 'ai', 'csv'].includes(p.format) ? p.format : 'pdf'), img: { size: p.img?.size === 'square' ? 'square' : 'story' }, ai: { length: 'full', promptOn: true, watchlist: true, taste: true, ...(p.ai || {}), prompt: null } };
    if (!S.sort) S.sort = SORTS[kindOf()][0][0];
    if (special() && !formatsFor().includes(S.format)) S.format = 'pdf';
    const ov = overlay();
    $('xsOpts').innerHTML = '<div class="xs-loading">Loading your library…</div>'; $('xsPreview').innerHTML = ''; $('xsSummary').textContent = '';
    progress(null);
    MSSDialog.open(ov, { focus: '#xsGo' });
    const me = S;
    try {
      // never wait forever: after 30 s say so (a slow or dropped connection)
      const all = o.load ? await Promise.race([o.load(), new Promise((_, no) => setTimeout(() => no(new Error('Your library took too long to load')), 30000))]) : [];
      if (S !== me) return;                 // closed (or reopened) while it loaded
      S.all = Array.isArray(all) ? all : [];
      S.years = MSSYear.years(S.all); S.year = S.years[0] || null;
      if (isYear()) loadYearExtra();
      loadEpisodes().catch(err => console.warn('Export Studio episodes:', err));   // the "Episode ratings" card needs the count
      draw();
      if (S.what === 'list') pickWhat('list');
    } catch (err) {
      // something went wrong — say what, instead of "Loading…" forever
      console.error('Export Studio:', err);
      if (S !== me) return;
      $('xsOpts').innerHTML = `<div class="xs-loading xs-failed" role="alert">${icon('info', 20)}<b>Couldn’t open the Studio</b><span>${escHTML(String(err?.message || err))}</span>
        <button type="button" class="sf-apply-btn" onclick="MSSStudio._retry()">Try again</button></div>`;
    }
  }
  function close() {
    if (S?.busy) return;    // let it finish
    S = null;
    MSSDialog.close($('xsOverlay'));
  }
  async function pickWhat(w) {
    if (w === 'list' && !S.lists) { draw(); await loadLists().catch(() => { S.lists = []; }); if (S) draw(); }
    // opened from a list's page: that list, chosen already (added if it isn't among the ones loaded)
    const pl = S?.o.preset?.list;
    if (w === 'list' && pl && !S.list && S.lists) {
      if (!S.lists.some(l => l.id === pl.id)) S.lists.unshift({ id: pl.id, title: pl.title || 'Untitled list', description: pl.description || '', items: pl.items || [], ranked: !!pl.ranked, owner: pl.owner, mine: !!pl.mine, group: pl.mine ? 'mine' : 'page' });
      chooseList(pl.id);
    }
  }
  function set(key, v) {
    if (!S || S.busy) return;
    if (key === 'what' && S.what === v) return;
    S[key] = v;
    if (key === 'format' && special() && !formatsFor().includes(v)) S.what = 'watched';   // the taste profile is PDF / image / AI only, episodes + CSV
    if (key === 'what' || key === 'format' && S.what === 'watched' && !SORTS.watched.some(x => x[0] === S.sort)) { S.cat = ''; S.sort = SORTS[kindOf()][0][0]; S.numbered = v === 'list' ? !!S.list?.ranked : true; }
    if (key === 'theme' || key === 'group' || key === 'format') keep();
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
  // picking changes the "What" card's count and (one ↔ several) which options apply — redraw those, keep the search box
  function refreshPicked() {
    const q = $('xsPickQ'), had = document.activeElement === q, pos = q?.selectionStart;
    const keepScroll = $('xsPickBody')?.querySelector('.xs-pk-list')?.scrollTop || 0;
    draw();
    const q2 = $('xsPickQ'); if (had && q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch {} }
    const l = $('xsPickBody')?.querySelector('.xs-pk-list'); if (l) l.scrollTop = keepScroll;
  }

  // The progress bar takes the footer's place while it builds
  function progress(f, label) {
    const on = f != null;
    $('xsProg').hidden = !on; $('xsFoot').hidden = on;
    if (!on) return;
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    $('xsProgFill').style.width = pct + '%'; $('xsProgPct').textContent = pct + '%';
    $('xsProg').setAttribute('aria-valuenow', pct);
    if (label) $('xsProgLabel').textContent = label;
  }
  const imgJob = list => ({ size: S.img.size, theme: S.theme, title: title(), kicker: kicker(), entries: isYear() ? (yearData()?.top || []).map(x => x.e) : list, who: S.o.who, anon: S.privacy.anon,
    taste: isTaste() ? taste() : null, year: isYear() ? yearData() : null, slide: S.ySlide });
  function goLabel() {
    const L = { pdf: ['download', 'Export PDF'], image: ['image', 'Save image'], ai: ['copy', 'Copy for an AI'], csv: ['download', 'Download .csv'], letterboxd: ['download', 'Download for Letterboxd'], backup: ['download', 'Download backup'], card: ['idCard', 'Make the card'] }[S.format];
    $('xsGo').innerHTML = `${icon(ICONS[L[0]] ? L[0] : 'download', 15)} ${L[1]}`;
  }
  const slug = () => title().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
  const today = () => new Date().toISOString().slice(0, 10);
  async function finish(msg) {
    progress(1, 'Done!');
    showToast(msg);
    setTimeout(() => { if (S) { S.busy = false; $('xsOverlay').classList.remove('is-busy'); close(); } }, 500);
  }
  // .md / .csv / .json — quick, but still shows the bar (the backup fetches lists + episode ratings first)
  async function goText(mode) {
    const list = picked();
    progress(0.1, 'Putting it together…');
    await new Promise(r => setTimeout(r, 30));
    if (fmt('ai')) {
      const txt = aiText(list);
      if (mode === 'file') { MSSFormats.save(`myscreenfolio-${slug()}.md`, txt, 'text/markdown;charset=utf-8'); return finish('Saved — attach it or paste it into any AI chat.'); }
      progress(0.8, 'Copying…');
      if (await MSSFormats.copy(txt)) return finish('Copied — paste it into any AI chat.');
      MSSFormats.save(`myscreenfolio-${slug()}.md`, txt, 'text/markdown;charset=utf-8');
      return finish('Couldn’t copy here, so it was downloaded instead.');
    }
    if (fmt('csv') && isEps()) { MSSFormats.save(`myscreenfolio-${slug()}-episodes.csv`, epCSV(), 'text/csv;charset=utf-8'); return finish('Your spreadsheet is ready.'); }
    if (fmt('csv')) { MSSFormats.save(`myscreenfolio-${slug()}.csv`, MSSFormats.csv(list, { include: S.include, privacy: S.privacy }), 'text/csv;charset=utf-8'); return finish('Your spreadsheet is ready.'); }
    if (fmt('letterboxd')) {
      const txt = MSSFormats.letterboxd(lbSource(), { include: S.include, privacy: S.privacy });
      MSSFormats.save(`myscreenfolio-letterboxd-${today()}.csv`, txt, 'text/csv;charset=utf-8');
      return finish(txt.length > 1e6 ? 'Saved — but it’s over Letterboxd’s 1 MB limit; turn off notes and try again.' : 'Saved — import it on Letterboxd: Settings → Import & Export.');
    }
    const me = window._navUser?.id;
    progress(0.3, 'Getting your lists…');
    const lists = me ? ((await sb.from('favorite_lists').select('*').eq('user_id', me)).data || []) : [];
    progress(0.6, 'Getting your episode ratings…');
    const episodes = me ? ((await sb.from('episode_ratings').select('*').eq('user_id', me)).data || []) : [];
    const pr = window._navUserProfile || {};
    progress(0.9, 'Saving…');
    MSSFormats.save(`myscreenfolio-backup-${today()}.json`, MSSFormats.backup({ profile: { username: pr.username, display_name: pr.display_name }, entries: S.all, lists, episodes }), 'application/json');
    return finish('Your backup is saved — keep it somewhere safe.');
  }
  async function go(mode) {
    if (!S || S.busy) return;
    if (fmt('card')) {   // hands over to Create Card
      const e = S.all.find(x => x.id === S.card);
      if (!e) return;
      close();
      createShareCard(e);
      return;
    }
    const list = picked();
    if (fmt('image')) {   // the studio stays open — make the other size too if you like
      if (!has(list)) { showToast('Nothing to export with these options.', 'err'); return; }
      S.busy = true; $('xsOverlay').classList.add('is-busy'); progress(0.15, 'Getting posters…');
      try {
        const cv = document.createElement('canvas');
        if (isEps()) await epChart(cv, S.epSize); else await MSSImage.draw(cv, imgJob(list));
        progress(0.9, 'Saving…');
        await mssSaveImage(cv, `myscreenfolio-${slug()}-${isEps() ? 'episodes-' + S.epSize : isYear() ? `${['overview', 'top', 'months'].indexOf(S.ySlide) + 1}-${S.ySlide}` : S.img.size}.png`, $('xsPreview'));
        progress(1, 'Done!');
      } catch (err) { console.error('Image export failed:', err); showToast('Couldn’t make the image — try again.', 'err'); }
      setTimeout(() => { if (S) { S.busy = false; $('xsOverlay').classList.remove('is-busy'); progress(null); } }, 400);
      return;
    }
    if (!fmt('pdf')) {
      if (usesWhat() && !has(list)) { showToast('Nothing to export with these options.', 'err'); return; }
      S.busy = true; $('xsOverlay').classList.add('is-busy'); progress(0, 'Starting…');
      try { await goText(mode); }
      catch (err) { console.error('Export failed:', err); showToast('Couldn’t export — try again.', 'err'); S.busy = false; $('xsOverlay').classList.remove('is-busy'); progress(null); }
      return;
    }
    if (!has(list)) { showToast('Nothing to export with these options.', 'err'); return; }
    S.busy = true;
    $('xsOverlay').classList.add('is-busy');
    progress(0, 'Starting…');
    try {
      if (isEps()) {   // page 1 = the chart (as the image), then every rated episode
        progress(0.05, 'Drawing the chart…');
        let chart = null;
        if (epSt()) { const cv = document.createElement('canvas'); await epChart(cv, 'a4'); chart = cv.toDataURL('image/jpeg', 0.92); }
        const blob = await MSSPdf.build({ kind: 'watched', title: title(), kicker: kicker(), entries: [], theme: S.theme, include: S.include, privacy: S.privacy, who: S.o.who, ep: epData(), epChart: chart }, (f, l) => progress(0.1 + f * 0.9, l));
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `myscreenfolio-${slug()}-episodes.pdf`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return finish('Your PDF is ready.');
      }
      let episodes = null;
      if (single() && list[0].cat !== 'movies' && MSSPdf.kindOf(list[0]) !== 'title') {
        progress(0.01, 'Getting your episode ratings…');
        const { data } = await sb.from('episode_ratings').select('season_number, episode_number, score').eq('entry_id', list[0].id);
        episodes = data || [];
      }
      const blob = await MSSPdf.build({ kind: kindOf(), title: title(), kicker: kicker(), entries: list, ranked: ranked(),
        group: S.group && !single(), theme: S.theme, include: S.include, privacy: S.privacy, who: S.o.who,
        byline: byline(), desc: S.what === 'list' ? S.list?.description : isYear() ? yearCompare() : '', detail: single(), episodes, taste: isTaste() ? taste() : null, year: isYear() ? yearData() : null }, (f, l) => progress(f, l));
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `myscreenfolio-${slug()}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      finish('Your PDF is ready.');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Couldn’t make the PDF — try again.', 'err');
      S.busy = false; $('xsOverlay').classList.remove('is-busy'); progress(null);
    }
  }

  return { open, close, _set: set, _tog: tog, _go: go, _retry: () => { const o = S?.o; if (o) open(o); },
    _card: id => { if (!S || S.busy) return; S.card = id; const b = $('xsCardBody'), st = b?.querySelector('.xs-pk-list')?.scrollTop || 0; if (b) { b.innerHTML = cardRowsHTML(); b.querySelector('.xs-pk-list').scrollTop = st; } drawSide(); },
    _cardQ: v => { if (!S) return; S.cq = v; const b = $('xsCardBody'); if (b) b.innerHTML = cardRowsHTML(); },
    _year: yy => { if (!S || S.busy) return; S.year = yy; draw(); },
    _epShow: id => {   // just the list + preview, so the search keeps what you typed and focus stays on the row
      if (!S || S.busy) return; S.epShow = id; drawEpShows(); drawSide();
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
