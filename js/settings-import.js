/* ══════════════════════════════════════════
   settings-import.js — Import your history (Settings → Data → Import)
   A file or a pasted list → matched to TMDB with a progress bar → a preview you check and edit
   → saved only when you confirm, through import_rows (105), which checks everything again.
   Sources: Letterboxd (ZIP or CSV), IMDb (CSV), MyAnimeList (XML, also gzipped), AniList (a username,
   read from its public API), text, Word (.docx), pasted lists, any CSV with titles.
   The file stays on this device: only title searches reach TMDB.

   Ratings are never assigned silently. One rule for every source: stars out of 5 × 2, out of 10
   stays. It's shown beside the original, and each one can be changed, or scored in detail with
   MyScreenFolio's own criteria. Imported reviews start private. Undo removes a whole import.
══════════════════════════════════════════ */
const MSSImport = (() => {
  const FFLATE = 'js/vendor/fflate-0.8.2.min.js';
  const MAX_ROWS = 5000, PAGE = 50, SAVE_SIZE = 100, MAX_BYTES = 30 * 1024 * 1024, WORKERS = 6;
  const SOURCE = { letterboxd: 'Letterboxd', imdb: 'IMDb', text: 'Text file', word: 'Word document', paste: 'Pasted list', csv: 'Spreadsheet', myanimelist: 'MyAnimeList', anilist: 'AniList' };
  const STATUS = { completed: 'Watched', queue: 'Watchlist', watching: 'Watching', paused: 'Paused', dropped: 'Dropped' };
  const CATS = [['movies', 'Movies'], ['tv', 'TV Shows'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
  const $ = id => document.getElementById(id);
  const box = () => $('importBox');

  let S = fresh(), history = [], me = null;
  function fresh() { return { step: 'start', source: '', rows: [], filter: 'all', shown: PAGE, done: 0, total: 0, cancel: false, withWatchlist: true, withReviews: true, watchlist: 0, reviews: 0, result: null, error: '' }; }

  /* ── Reading files ── */
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x !== '')) rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }

  const newRow = o => ({ name: '', alts: [], kind: null, anime: false, episodes: 0, year: '', stars: null, scale: null, date: '', dates: [], rewatches: 1, review: '', status: 'completed', imdb: '', hint: '', ...o });

  /* Letterboxd: ratings, diary and reviews joined to each film by its name and year. Only the files needed are ever opened (not profile.csv). */
  function fromLetterboxd(f) {
    const map = new Map(), key = r => `${r.Name}|${r.Year}`;
    const get = r => { if (!map.has(key(r))) map.set(key(r), newRow({ name: r.Name, year: r.Year, kind: 'movie' })); return map.get(key(r)); };
    (f.watched || []).forEach(get);
    (f.ratings || []).forEach(r => { const x = get(r); if (r.Rating) { x.stars = Number(r.Rating); x.scale = 5; } });
    const diaryByKey = {};
    [...(f.diary || []), ...(f.reviews || [])].forEach(r => { if (r.Name && r['Watched Date']) (diaryByKey[key(r)] ||= new Map()).set(`${r['Watched Date']}|${r.Rewatch}`, r); });
    Object.entries(diaryByKey).forEach(([k, m]) => {
      const list = [...m.values()].sort((a, b) => a['Watched Date'].localeCompare(b['Watched Date']));
      const x = get(list[0]);
      x.dates = [...new Set(list.map(r => r['Watched Date']))];
      x.date = x.dates[x.dates.length - 1];
      x.rewatches = Math.max(x.dates.length, list.some(r => r.Rewatch === 'Yes') ? 2 : 1);
      const last = list[list.length - 1];
      if (x.stars == null && last.Rating) { x.stars = Number(last.Rating); x.scale = 5; }
    });
    (f.reviews || []).forEach(r => { if (r.Review) { const x = get(r), t = r.Review.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(); x.review = x.review ? `${x.review}\n\n${t}` : t; } });
    const rows = [...map.values()];
    (f.watchlist || []).forEach(r => { if (!map.has(key(r))) rows.push(newRow({ name: r.Name, year: r.Year, kind: 'movie', status: 'queue' })); });
    return rows;
  }

  // IMDb's export: Const, Your Rating, Date Rated, Title, Title Type, Year…  (a watchlist has no Your Rating)
  function fromImdb(rows) {
    return rows.map(r => {
      const rated = r['Your Rating'], type = String(r['Title Type'] || '').toLowerCase();
      const skip = /episode|game|podcast/.test(type) ? `IMDb lists this as “${r['Title Type']}”. Only movies and shows can be imported.` : '';
      return newRow({ name: r.Title || r['Original Title'] || r.Const, year: r.Year, imdb: /^tt\d+$/.test(r.Const) ? r.Const : '', skip,
        stars: rated ? Number(rated) : null, scale: rated ? 10 : null, date: rated ? (r['Date Rated'] || '') : '', status: rated ? 'completed' : (r['Date Rated'] ? 'completed' : 'queue') });
    });
  }

  /* MyAnimeList's export. my_status can be text or the older number. Dates of 0000-00-00 mean none, a score of 0 means none. */
  const MAL_STATUS = { 'completed': 'completed', 'plan to watch': 'queue', 'watching': 'watching', 'on-hold': 'paused', 'dropped': 'dropped', 1: 'watching', 2: 'completed', 3: 'paused', 4: 'dropped', 6: 'queue' };
  const realDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !s.startsWith('0000') && !s.endsWith('-00') ? s : '';
  function fromMAL(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName !== 'myanimelist') throw new Error('That XML doesn’t look like a MyAnimeList export.');
    const items = [...doc.querySelectorAll('myanimelist > anime')];
    if (!items.length) throw new Error(doc.querySelector('myanimelist > manga') ? 'That’s a manga list. Only anime can be imported.' : 'That MyAnimeList file has no anime in it.');
    return items.map(a => {
      const v = t => a.querySelector(t)?.textContent.trim() || '', score = Number(v('my_score')) || 0, type = v('series_type').toLowerCase();
      const status = MAL_STATUS[v('my_status').toLowerCase()] || 'completed', done = realDate(v('my_finish_date')) || realDate(v('my_start_date'));
      return newRow({ name: v('series_title'), anime: true, kind: type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : null, status,
        stars: score || null, scale: score ? 10 : null, date: status === 'completed' ? done : '', dates: done ? [done] : [],
        rewatches: 1 + (Number(v('my_times_watched')) || 0), review: v('my_comments'), episodes: Number(v('my_watched_episodes')) || 0 });
    }).filter(r => r.name);
  }

  /* AniList has no export file: its public API gives a list by username. Only that request goes to AniList. */
  const AL_STATUS = { COMPLETED: 'completed', REPEATING: 'completed', PLANNING: 'queue', CURRENT: 'watching', PAUSED: 'paused', DROPPED: 'dropped' };
  const AL_QUERY = `query($name:String){MediaListCollection(userName:$name,type:ANIME,forceSingleCompletedList:true){lists{isCustomList entries{status score(format:POINT_10_DECIMAL) progress repeat notes completedAt{year month day} media{id format seasonYear startDate{year} title{romaji english}}}}}}`;
  async function fromAniList(name) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: AL_QUERY, variables: { name } }) });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error(`AniList doesn’t have a user called “${name}”.`);
    if (res.status === 429) throw new Error('AniList is busy. Try again in a minute.');
    if (out.errors?.length || !res.ok) throw new Error(/private/i.test(out.errors?.[0]?.message || '') ? 'That AniList list is private. Make it public in AniList’s settings, import, then change it back.' : 'AniList didn’t answer. Check the username and try again.');
    const seen = new Set(), rows = [];
    (out.data?.MediaListCollection?.lists || []).filter(l => !l.isCustomList).flatMap(l => l.entries || []).forEach(e => {
      if (seen.has(e.media.id)) return;
      seen.add(e.media.id);
      const t = e.media.title || {}, c = e.completedAt || {}, status = AL_STATUS[e.status] || 'completed', fmt = String(e.media.format || '').toUpperCase();
      const date = status === 'completed' && c.year && c.month && c.day ? `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}` : '';
      rows.push(newRow({ name: t.english || t.romaji, alts: t.english && t.romaji ? [t.romaji] : [], year: String(e.media.seasonYear || e.media.startDate?.year || ''), anime: true,
        kind: fmt === 'MOVIE' ? 'movie' : fmt === 'TV' || fmt === 'TV_SHORT' ? 'tv' : null, status, stars: e.score || null, scale: e.score ? 10 : null, date, dates: date ? [date] : [],
        rewatches: 1 + (Number(e.repeat) || 0), review: e.notes || '', episodes: Number(e.progress) || 0 }));
    });
    return rows;
  }

  function fromAnyCSV(rows) {
    const pick = (r, ...names) => { for (const n of Object.keys(r)) if (names.includes(n.toLowerCase().trim())) return r[n]; return ''; };
    const out = rows.map(r => newRow({ name: pick(r, 'title', 'name', 'movie', 'show', 'film'), year: pick(r, 'year', 'release year'), stars: parseFloat(pick(r, 'rating', 'score', 'my rating', 'your rating')) || null, date: isoDate(pick(r, 'date', 'watched', 'watched date', 'date watched')) })).filter(r => r.name);
    const top = Math.max(0, ...out.map(r => r.stars || 0));
    out.forEach(r => { if (r.stars != null) r.scale = top > 5 ? 10 : 5; });
    return out;
  }

  function isoDate(s) {
    s = String(s || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }

  /* A list, one title per line: "1. Inception (2010) - 9/10", "Dune 2021 ★★★★½", "Heat | 4.5 stars | 2024-05-01" */
  function fromLines(text) {
    return text.split(/\r?\n/).map(raw => {
      let line = raw.replace(/\t/g, ' | ').trim().replace(/^(?:\d{1,4}[.)]|[-*•·–—])\s+/, '');
      if (!line || line.length > 300) return null;
      const out = newRow({});
      const date = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})\b/.exec(line);
      if (date) { out.date = isoDate(date[1]); line = line.replace(date[0], ' '); }
      const blacks = /(★+)(½?)/.exec(line);
      let m;
      if (blacks) { out.stars = blacks[1].length + (blacks[2] ? .5 : 0); out.scale = 5; line = line.replace(blacks[0], ' '); }
      else if ((m = /(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(5|10)\b/i.exec(line))) { out.stars = Number(m[1]); out.scale = Number(m[2]); line = line.replace(m[0], ' '); }
      else if ((m = /(\d+(?:\.\d+)?)\s*stars?\b/i.exec(line))) { out.stars = Number(m[1]); out.scale = 5; line = line.replace(m[0], ' '); }
      else if ((m = /[-–—|:]\s*(\d+(?:\.\d+)?)\s*(?:$|[|])/.exec(line)) && Number(m[1]) <= 10) { out.stars = Number(m[1]); out.scale = 10; line = line.replace(m[0], ' '); }
      const y = /[([]\s*((?:19|20)\d{2})\s*[)\]]/.exec(line) || /\s((?:19|20)\d{2})\s*(?:[-–—|:]|$)/.exec(line);
      if (y) { out.year = y[1]; line = line.replace(y[0], ' '); }
      out.name = line.replace(/\s*[|]\s*/g, ' ').replace(/[\s\-–—|:,]+$/, '').replace(/\s+/g, ' ').trim();
      return out.name ? out : null;
    }).filter(Boolean);
  }

  async function unzip(file, want) {
    await mssLoadScript(FFLATE);
    const buf = new Uint8Array(await file.arrayBuffer());
    const files = window.fflate.unzipSync(buf, { filter: f => want(f.name) });
    return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, window.fflate.strFromU8(v)]));
  }

  async function read(file) {
    if (file.size > MAX_BYTES) throw new Error('That file is too big. The limit is 30 MB.');
    const n = file.name.toLowerCase();
    if (n.endsWith('.zip')) {
      const WANT = ['watched', 'ratings', 'diary', 'reviews', 'watchlist'];
      const got = await unzip(file, name => WANT.some(w => name === `${w}.csv`));
      if (!got['watched.csv'] && !got['ratings.csv'] && !got['watchlist.csv']) throw new Error('That ZIP doesn’t look like a Letterboxd export.');
      return { source: 'letterboxd', rows: fromLetterboxd(Object.fromEntries(WANT.map(w => [w, got[`${w}.csv`] ? parseCSV(got[`${w}.csv`]) : []]))) };
    }
    if (n.endsWith('.docx')) {
      const got = await unzip(file, name => name === 'word/document.xml');
      const xml = got['word/document.xml'];
      if (!xml) throw new Error('That Word file couldn’t be opened.');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const text = [...doc.getElementsByTagNameNS(W, 'p')].map(p => [...p.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('')).join('\n');
      return { source: 'word', rows: fromLines(text) };
    }
    if (n.endsWith('.doc')) throw new Error('Old .doc files can’t be read. Save it as .docx in Word, or paste the list instead.');
    if (n.endsWith('.csv')) {
      const rows = parseCSV(await file.text()), h = Object.keys(rows[0] || {});
      if (h.includes('Const')) return { source: 'imdb', rows: fromImdb(rows) };
      if (h.includes('Letterboxd URI')) return { source: 'letterboxd', rows: fromLetterboxd(/Rating/.test(h.join()) ? { ratings: rows, diary: h.includes('Watched Date') ? rows : [], reviews: h.includes('Review') ? rows : [] } : /watchlist/.test(n) ? { watchlist: rows } : { watched: rows }) };
      return { source: 'csv', rows: fromAnyCSV(rows) };
    }
    if (n.endsWith('.xml.gz') || n.endsWith('.gz')) {
      await mssLoadScript(FFLATE);
      return { source: 'myanimelist', rows: fromMAL(window.fflate.strFromU8(window.fflate.gunzipSync(new Uint8Array(await file.arrayBuffer())))) };
    }
    if (n.endsWith('.xml')) return { source: 'myanimelist', rows: fromMAL(await file.text()) };
    if (n.endsWith('.txt') || n.endsWith('.md') || !n.includes('.')) return { source: 'text', rows: fromLines(await file.text()) };
    throw new Error('That file type isn’t supported. Use .zip, .csv, .xml, .gz, .txt, .md or .docx.');
  }

  /* ── Matching to TMDB ── */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|a|an) /, '').trim();
  const toMatch = (r, type) => ({ id: r.id, type: type || r.media_type, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4), poster: POSTER_PATH.test(r.poster_path || '') ? r.poster_path : '', genres: r.genre_ids || (r.genres || []).map(g => g.id), lang: r.original_language || '', orig: r.original_title || r.original_name || '' });
  const guessCat = m => m.genres.includes(16) ? (m.lang === 'ja' ? 'anime' : 'cartoons') : (m.type === 'movie' ? 'movies' : 'tv');

  async function tmdbJSON(path, tries = 3) {
    const res = await tmdbFetch(`${TMDB_BASE}${path}`);
    if (res.status === 429 && tries > 0) { await new Promise(z => setTimeout(z, 3000)); return tmdbJSON(path, tries - 1); }
    if (!res.ok) throw new Error('TMDB ' + res.status);
    return res.json();
  }

  async function search(name, year, kind) {
    const q = encodeURIComponent(name);
    const go = async y => {
      const yp = y ? (kind === 'tv' ? `&first_air_date_year=${y}` : `&year=${y}`) : '';
      const d = await tmdbJSON(kind ? `/search/${kind}?query=${q}&language=en-US${yp}` : `/search/multi?query=${q}&language=en-US`);
      return (d.results || []).filter(r => kind || r.media_type === 'movie' || r.media_type === 'tv').map(r => toMatch(r, kind || r.media_type));
    };
    let list = await go(year);
    if (!list.length && year && kind) list = await go('');
    return list;
  }

  // Anime lists give each season its own entry: "Show Season 2" is the show, on TMDB
  const baseTitle = s => String(s || '').replace(/\s*[:\-–—]?\s*(?:(?:the\s+)?final\s+season|season\s*\d+|\d+(?:st|nd|rd|th)\s+season|part\s*\d+|cour\s*\d+|\b(?:II|III|IV|V|VI)\b)\s*.*$/i, '').trim();

  function decide(row, list, name = row.name) {
    if (!list.length) return { state: 'none', why: 'TMDB doesn’t have anything with this name.' };
    if (row.anime) {
      const drawn = list.filter(m => m.genres.includes(16));
      if (drawn.length) list = drawn;
      const jp = list.filter(m => m.lang === 'ja');
      if (jp.length) list = jp;
    }
    const want = norm(name), same = m => norm(m.title) === want || norm(m.orig) === want;
    const exact = list.filter(same);
    if (row.year) {
      const y = Number(row.year);
      const hit = exact.find(m => Number(m.year) === y);
      if (hit) return { state: 'ok', match: hit };
      const near = exact.find(m => Math.abs(Number(m.year) - y) <= 1);
      if (near) return { state: 'check', match: near, why: `The year is different: ${near.year || 'unknown'}, not ${row.year}.` };
      if (exact[0]) return { state: 'check', match: exact[0], why: `Same name, but from ${exact[0].year || 'an unknown year'}, not ${row.year}.` };
      const close = list.find(m => Number(m.year) === y) || list[0];
      return { state: 'check', match: close, why: 'The name isn’t an exact match. Please check it’s the right title.' };
    }
    if (exact.length === 1 || (row.anime && list.length === 1)) return { state: 'ok', match: exact[0] || list[0] };
    if (exact.length > 1) return { state: 'check', match: exact[0], why: `${exact.length} titles have this name, and your list didn’t give a year.` };
    return { state: 'check', match: list[0], why: 'The name isn’t an exact match. Please check it’s the right title.' };
  }

  async function matchRow(row) {
    if (row.skip) { row.state = 'none'; row.why = row.skip; return; }
    try {
      let d;
      if (row.imdb) {
        const f = await tmdbJSON(`/find/${row.imdb}?external_source=imdb_id&language=en-US`);
        const hit = f.movie_results?.[0] ? toMatch(f.movie_results[0], 'movie') : f.tv_results?.[0] ? toMatch(f.tv_results[0], 'tv') : null;
        d = hit ? { state: 'ok', match: hit } : { state: 'none', why: 'TMDB doesn’t know this IMDb title.' };
      } else {
        // Each spelling in turn, stopping at a sure match: the name, its other title, then without its season
        const names = [...new Set([row.name, ...row.alts, ...(row.anime ? [row.name, ...row.alts].map(baseTitle) : [])].filter(Boolean))];
        for (const name of names) {
          const seasonless = row.anime && name !== row.name && !row.alts.includes(name);
          const next = decide(seasonless ? { ...row, year: '' } : row, await search(name, seasonless ? '' : row.year, row.kind), name);
          if (!d || d.state === 'none' || next.state === 'ok') d = next;
          if (next.state === 'ok') break;
        }
      }
      Object.assign(row, d);
    } catch (err) { console.warn('Import match:', err); row.state = 'none'; row.why = 'Couldn’t reach TMDB for this one. Change it to try again.'; }
    afterMatch(row);
  }

  function afterMatch(row) {
    if (row.match) {
      row.cat = guessCat(row.match);
      const k = `${row.match.type}:${row.match.id}`;
      if (S.have?.has(k)) { row.state = 'dup'; row.why = 'Already in your library. It won’t be changed.'; }
    }
    row.score = convert(row);
    row.on = row.state === 'ok';
  }

  /* ── Ratings: stars × 2, out of 10 stays. Never below 1. ── */
  const convert = r => r.stars == null || isNaN(r.stars) ? null : Math.min(10, Math.max(1, Math.round((r.scale === 5 ? r.stars * 2 : r.stars) * 2) / 2));
  const original = r => r.stars == null || isNaN(r.stars) ? '' : r.scale === 5 ? `${r.stars} ★` : `${r.stars}/10`;

  async function run(source, rows) {
    rows = rows.filter(r => r.name);
    if (!rows.length) { S.error = 'No titles found in that. Check it has one title per line.'; S.step = 'start'; return draw(); }
    if (rows.length > MAX_ROWS) { S.error = `That has ${rows.length.toLocaleString()} titles. The limit is ${MAX_ROWS.toLocaleString()} at a time.`; S.step = 'start'; return draw(); }
    const keep = { source, rows, step: 'match', done: 0, total: rows.length };
    S = { ...fresh(), ...keep };
    S.watchlist = rows.filter(r => r.status === 'queue').length;
    S.reviews = rows.filter(r => r.review).length;
    draw();
    const { data } = await sb.from('entries').select('tmdb_id, tmdb_type').eq('user_id', me).not('tmdb_id', 'is', null);
    S.have = new Set((Array.isArray(data) ? data : []).map(e => `${e.tmdb_type}:${e.tmdb_id}`));
    let i = 0;
    const started = S;
    const worker = async () => {
      while (i < rows.length && !started.cancel) {
        await matchRow(rows[i++]);
        started.done++;
        paintProgress(started.done, started.total, 'Matching');
        await new Promise(z => setTimeout(z, 500));   // about 10 a second across the workers: TMDB's limit through our proxy
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    if (started !== S || started.cancel) return;
    // Two records, one title (anime seasons, usually): the first goes in, the rest wait for a decision
    const first = new Map();
    rows.forEach(r => {
      if (!r.match || r.state === 'dup') return;
      const k = `${r.match.type}:${r.match.id}`;
      if (first.has(k)) { r.state = 'check'; r.on = false; r.why = `“${first.get(k).name}” is also this title on TMDB, which keeps a show’s seasons together. Only one can be imported.`; }
      else first.set(k, r);
    });
    S.step = 'preview';
    S.filter = counts().check ? 'check' : 'all';
    draw();
    MSSSettingsNav.refresh();
  }

  /* ── Drawing ── */
  const counts = () => {
    const c = { all: 0, ok: 0, check: 0, none: 0, dup: 0, on: 0 };
    visibleRows().forEach(r => { c.all++; c[r.state]++; if (r.on && r.match) c.on++; });
    return c;
  };
  const visibleRows = () => S.rows.filter(r => S.withWatchlist || r.status !== 'queue');
  const FILTERS = [['all', 'All'], ['ok', 'Ready'], ['check', 'Please check'], ['none', 'Not found'], ['dup', 'In your library']];

  function paintProgress(n, total, label) {
    const bar = $('importBar');
    if (!bar) return;
    bar.style.width = `${Math.round(n / total * 100)}%`;
    $('importProg').setAttribute('aria-valuenow', String(n));
    $('importProgT').textContent = `${label} ${n.toLocaleString()} of ${total.toLocaleString()}…`;
  }

  function historyHTML() {
    if (!history.length) return '';
    return `<div class="imp-sub">Past imports</div><ul class="sess-list">${history.map(h => {
      const when = new Date(h.created_at).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: 'numeric' });
      return `<li class="sess-row"><span class="sess-info"><span class="sess-name">${escHTML(SOURCE[h.source] || h.source)}</span><span class="sess-when">${when} · ${h.undone_at ? 'Undone' : `${h.saved} ${h.saved === 1 ? 'title' : 'titles'}`}</span></span>${h.undone_at ? '' : `<button type="button" class="sess-out" data-undo="${escHTML(h.id)}">Undo</button>`}</li>`;
    }).join('')}</ul>`;
  }

  function startHTML() {
    return `${S.error ? `<p class="imp-error" role="alert">${escHTML(S.error)}</p>` : ''}
      <p class="settings-desc">Bring your watch history here. You’ll check everything before anything is saved, and nothing is sent to your friends. Your file stays on this device.</p>
      <label class="imp-drop"><input type="file" id="importFile" class="sr-only" accept=".zip,.csv,.xml,.gz,.txt,.md,.docx">${icon('download', 22)}<b>Choose a file</b><span>Letterboxd, IMDb, MyAnimeList, CSV, text or Word</span></label>
      <details class="imp-how"><summary>Where do I get my file?</summary>
        <p><b>Letterboxd:</b> Settings → Data → Export Your Data. Upload the ZIP as it is.</p>
        <p><b>IMDb:</b> Your Ratings or Watchlist → Export. Upload the CSV.</p>
        <p><b>MyAnimeList:</b> use the Export page in your list settings, and upload the file it gives you.</p>
        <p><b>Text or Word:</b> one title per line. Add a year or rating if you like: “Inception (2010) 9/10”, “Dune 2021 4.5 stars”.</p>
      </details>
      <label class="field-label imp-label" for="importAniList">Or import from AniList</label>
      <div class="imp-q"><input class="field-input" id="importAniList" type="text" value="${escHTML(S.anilist || '')}" placeholder="Your AniList username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="40"><button type="button" class="set-btn" data-act="anilist">Import</button></div>
      <p class="imp-hint">Your list needs to be public on AniList. Only your username is sent to them.</p>
      <label class="field-label imp-label" for="importPaste">Or paste a list</label>
      <textarea class="field-input imp-paste" id="importPaste" rows="5" placeholder="Inception (2010) 9/10&#10;Dune 2021 4.5 stars&#10;Breaking Bad"></textarea>
      <button type="button" class="set-btn imp-go" data-act="paste">Use This List</button>
      ${historyHTML()}`;
  }

  function matchHTML(label) {
    return `<div class="imp-progress"><p class="imp-prog-t" id="importProgT">${label} ${S.done} of ${S.total}…</p>
      <div class="imp-track" id="importProg" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${S.total}" aria-valuenow="${S.done}"><i id="importBar" style="width:${Math.round(S.done / S.total * 100)}%"></i></div>
      <p class="settings-desc set-note">A big library can take a few minutes. Keep this page open.</p>
      ${S.step === 'match' ? '<button type="button" class="set-btn" data-act="cancel">Cancel</button>' : ''}</div>`;
  }

  function rowHTML(r, i) {
    const m = r.match, img = m?.poster ? `<img class="upl-thumb" src="https://image.tmdb.org/t/p/w92${m.poster}" alt="" loading="lazy">` : `<span class="upl-thumb imp-noimg" aria-hidden="true">${escHTML((r.name || '?')[0].toUpperCase())}</span>`;
    const title = m ? m.title : r.name, year = m ? m.year : r.year;
    const bits = [];
    if (m) bits.push(CATS.find(c => c[0] === r.cat)?.[1] || '');
    bits.push(r.status === 'completed' && r.date ? `Watched ${escHTML(r.date)}` : STATUS[r.status]);
    if (r.status !== 'completed' && r.status !== 'queue' && r.episodes) bits.push(`${r.episodes} ${r.episodes === 1 ? 'episode' : 'episodes'}`);
    if (r.rewatches > 1) bits.push(`${r.rewatches} times`);
    if (r.review && S.withReviews) bits.push('Review');
    const canOn = m && r.state !== 'dup';
    return `<li class="imp-row is-${r.state}">
      <input type="checkbox" class="imp-check" data-on="${i}" aria-label="Import ${escHTML(title)}"${r.on && canOn ? ' checked' : ''}${canOn ? '' : ' disabled'}>
      ${img}
      <div class="imp-main">
        <div class="imp-name" translate="no">${escHTML(title)}${year ? ` <span>(${escHTML(year)})</span>` : ''}</div>
        ${m && norm(m.title) !== norm(r.name) ? `<div class="imp-was" translate="no">Your file said: ${escHTML(r.name)}${r.year ? ` (${escHTML(r.year)})` : ''}</div>` : ''}
        <div class="imp-meta">${bits.join(' · ')}</div>
        ${r.why ? `<div class="imp-why">${escHTML(r.why)}</div>` : ''}
      </div>
      <div class="imp-rate">
        ${r.status === 'queue' || !m ? '' : `<span class="imp-orig">${r.stars != null ? `${escHTML(original(r))} →` : 'No rating'}</span><div class="imp-rate-in"><input type="range" class="ep-slider imp-slide${r.score != null ? '' : ' is-empty'}" min="0" max="10" step="0.5" data-slide="${i}" value="${r.score ?? 0}" aria-label="Rating for ${escHTML(title)}" aria-valuetext="${r.score != null ? Number(r.score).toFixed(1) : 'Not rated'}"${r.criteria ? ' disabled' : ''}><input class="rf-val imp-score" type="text" inputmode="decimal" data-mask="rating" maxlength="4" data-score="${i}" value="${r.score != null ? Number(r.score).toFixed(1) : ''}" placeholder="—" aria-label="MyScreenFolio rating for ${escHTML(title)}"${r.criteria ? ' disabled' : ''}></div>`}
        <button type="button" class="sess-out" data-edit="${i}">${m ? 'Edit' : 'Find'}</button>
      </div>
    </li>`;
  }

  function previewHTML() {
    const c = counts(), list = visibleRows().filter(r => S.filter === 'all' || r.state === S.filter);
    const converted = visibleRows().filter(r => r.on && r.match && r.stars != null && r.status !== 'queue').length;
    return `<p class="settings-desc">Check the list, change anything you like, and tick what to import. <b>Nothing is saved until you confirm.</b></p>
      <p class="imp-rule">${icon('info', 14)}<span>Suggested ratings: stars × 2, so 3.5 ★ becomes 7.0. Scores out of 10 stay the same. Change any of them, or tap Edit to score one with the full criteria.</span></p>
      ${S.watchlist ? `<label class="imp-opt"><input type="checkbox" data-opt="withWatchlist"${S.withWatchlist ? ' checked' : ''}> Include my watchlist (${S.watchlist})</label>` : ''}
      ${S.reviews ? `<label class="imp-opt"><input type="checkbox" data-opt="withReviews"${S.withReviews ? ' checked' : ''}> Include my reviews as private notes (${S.reviews})</label>` : ''}
      <div class="imp-filters" role="group" aria-label="Show">${FILTERS.filter(([k]) => k === 'all' || c[k]).map(([k, label]) => `<button type="button" class="imp-filter${S.filter === k ? ' on' : ''}" aria-pressed="${S.filter === k}" data-filter="${k}">${label} <b>${c[k]}</b></button>`).join('')}</div>
      <div class="imp-bulk"><button type="button" class="imp-link" data-act="all">Tick all shown</button><button type="button" class="imp-link" data-act="none">Untick all shown</button></div>
      <ul class="imp-list">${list.slice(0, S.shown).map(r => rowHTML(r, S.rows.indexOf(r))).join('')}</ul>
      ${list.length > S.shown ? `<button type="button" class="set-btn imp-more" data-act="more">Show More (${list.length - S.shown})</button>` : ''}
      <div class="imp-foot"><span><b id="importCount">${c.on}</b> to import${converted ? `, ${converted} with suggested ratings` : ''}</span>
        <button type="button" class="set-btn imp-cancel" data-act="reset">Start Over</button>
        <button type="button" class="btn-save" data-act="save"${c.on ? '' : ' disabled'}>Import ${c.on} ${c.on === 1 ? 'Title' : 'Titles'}</button></div>`;
  }

  function doneHTML() {
    const r = S.result, why = { duplicate: ['was already in your library', 'were already in your library'], invalid: ['had details that couldn’t be saved', 'had details that couldn’t be saved'], AGE_RESTRICTED: ['isn’t available for your age', 'aren’t available for your age'], AGE_CHECK: ['couldn’t be age-checked', 'couldn’t be age-checked'], failed: ['couldn’t be saved', 'couldn’t be saved'] };
    return `<p class="imp-done">${icon('check', 18)} <b>${r.saved} ${r.saved === 1 ? 'title' : 'titles'} imported.</b></p>
      ${Object.entries(r.skipped).map(([k, n]) => `<p class="settings-desc set-note">${n} ${n === 1 ? 'title' : 'titles'} ${(why[k] || why.failed)[n === 1 ? 0 : 1]}.</p>`).join('')}
      <p class="settings-desc">Changed your mind? Undo removes everything from this import.</p>
      <div class="imp-actions"><a class="btn-save imp-open" href="library.html">Open My Library</a><button type="button" class="set-btn" data-undo="${escHTML(r.batch)}">Undo This Import</button><button type="button" class="set-btn" data-act="reset">Import Something Else</button></div>`;
  }

  function draw() {
    const el = box();
    if (!el) return;
    el.innerHTML = S.step === 'start' ? startHTML() : S.step === 'match' ? matchHTML('Matching') : S.step === 'save' ? matchHTML('Saving') : S.step === 'preview' ? previewHTML() : doneHTML();
  }

  /* ── Editing one record ── */
  function edit(i) {
    const r = S.rows[i];
    let ov = $('impEdit');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'impEdit'; ov.className = 'confirm-overlay';
      document.body.appendChild(ov);
      MSSDialog.bind(ov, () => MSSDialog.close(ov));
    }
    ov.innerHTML = `<div class="confirm-card imp-edit" role="dialog" aria-modal="true" aria-labelledby="impEditT">
      <div class="confirm-title" id="impEditT">Check this title</div>
      <p class="imp-was" translate="no">Your file said: ${escHTML(r.name)}${r.year ? ` (${escHTML(r.year)})` : ''}${original(r) ? ` · ${escHTML(original(r))}` : ''}</p>
      <label class="field-label" for="impQ">Title</label>
      <div class="imp-q"><input class="field-input" id="impQ" type="search" value="${escHTML(r.match?.title || r.name)}" autocomplete="off" spellcheck="false"><button type="button" class="set-btn" id="impQGo">Search</button></div>
      <ul class="imp-hits" id="impHits"></ul>
      <div class="imp-cur" id="impCur"></div>
      <div id="impFields"></div>
      <div class="confirm-actions"><button type="button" class="confirm-cancel" id="impCancel">Cancel</button><button type="button" class="confirm-ok is-safe" id="impSave">Save</button></div>
    </div>`;
    const D = { match: r.match || null, cat: r.cat, status: r.status, date: r.date, overall: r.criteria ? null : r.score, ratings: { ...(r.criteria || {}) }, detail: !!r.criteria };
    if (D.ratings.animation != null) D.ratings._animEnabled = true;
    const isMovie = () => D.match?.type === 'movie';
    const liveFinal = () => calcFinal({ ...D.ratings, _media_type: isMovie() ? 'movie' : undefined }, D.cat);
    const paint = () => {
      $('impCur').innerHTML = D.match ? `<b translate="no">${escHTML(D.match.title)}</b>${D.match.year ? ` (${escHTML(D.match.year)})` : ''} · ${D.match.type === 'movie' ? 'Movie' : 'Show'}` : 'Pick the right title above. Without one, this can’t be imported.';
      if (!D.match) { $('impFields').innerHTML = ''; return; }
      $('impFields').innerHTML = `
        <div class="imp-two"><div><label class="field-label" for="impCat">Category</label><select class="field-input" id="impCat">${CATS.map(([k, l]) => `<option value="${k}"${D.cat === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-label" for="impStatus">In my library as</label><select class="field-input" id="impStatus">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${D.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
        ${D.status === 'queue' ? '' : `${D.status !== 'completed' ? '' : `<label class="field-label" for="impDate">Watched on</label><input class="field-input" id="impDate" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${escHTML(D.date || '')}">`}
        <div class="ratings-section-label">Rate This</div>
        <div id="impRate"></div>
        <button type="button" class="anim-toggle-btn" id="impDetail">${D.detail ? 'Use one overall rating instead' : '+ Score it in detail with the full ratings'}</button>`}`;
      const box = $('impRate');
      if (!box) return;
      // The same rating form as the title page (rate-form.js)
      if (D.detail) { MSSRateForm.mount(box, { cat: D.cat || 'movies', isMovie: isMovie(), genres: [], ratings: D.ratings }); return; }
      box.onclick = null;
      box.innerHTML = `<div class="rf-grid">${MSSRateForm.row('overall', 'Overall Rating', D.overall, { hint: 'One score out of 10 for the whole thing.' })}</div>`;
      MSSRateForm.wire(box, (k, v) => { D.overall = v; });
    };
    paint();
    const hits = async () => {
      const q = $('impQ').value.trim();
      if (!q) return;
      $('impHits').innerHTML = '<li class="sess-note">Searching…</li>';
      try {
        const list = await search(q, '', false);
        $('impHits').innerHTML = list.length ? list.slice(0, 8).map((m, n) => `<li><button type="button" data-hit="${n}"><b translate="no">${escHTML(m.title)}</b> <span>${escHTML(m.year || 'Unknown year')} · ${m.type === 'movie' ? 'Movie' : 'Show'}</span></button></li>`).join('') : '<li class="sess-note">Nothing found. Try another spelling.</li>';
        $('impHits')._list = list;
      } catch { $('impHits').innerHTML = '<li class="sess-note">Couldn’t reach TMDB. Try again.</li>'; }
    };
    const gather = () => {
      if ($('impCat')) D.cat = $('impCat').value;
      if ($('impStatus')) D.status = $('impStatus').value;
      if ($('impDate')) D.date = $('impDate').value;
    };
    ov.onclick = ev => {
      const t = ev.target, hit = t.closest('[data-hit]');
      if (hit) { gather(); D.match = $('impHits')._list[Number(hit.dataset.hit)]; D.cat = guessCat(D.match); $('impHits').innerHTML = ''; paint(); return; }
      if (t.id === 'impDetail') {
        gather();
        D.detail = !D.detail;
        paint();
        return;
      }
      if (t.id === 'impQGo') hits();
      if (t.id === 'impCancel') MSSDialog.close(ov);
      if (t.id === 'impSave') {
        gather();
        if (D.match && S.have?.has(`${D.match.type}:${D.match.id}`)) { showToast('That title is already in your library.', 'err'); return; }
        const final = D.detail ? liveFinal() : null;
        const detailed = D.detail && final != null;
        const watched = D.status !== 'queue';
        Object.assign(r, { match: D.match, cat: D.cat, status: D.status, date: D.status === 'completed' ? D.date : '', score: !watched ? null : detailed ? final : D.overall ?? null, criteria: watched && detailed ? { ...D.ratings } : null });
        if (D.match) { r.state = 'ok'; r.why = ''; r.on = true; }
        MSSDialog.close(ov);
        draw();
      }
    };
    ov.onchange = ev => {
      const t = ev.target;
      if (t.id === 'impStatus' || t.id === 'impCat') { gather(); paint(); }
    };
    $('impQ').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); hits(); } };
    MSSDialog.open(ov, { focus: '#impQ' });
  }

  /* ── Saving: nothing happens until here ── */
  async function details(r) {
    const m = r.match;
    const d = await tmdbJSON(`/${m.type}/${m.id}?language=en-US`).catch(() => null);
    const ratings = {
      _imported: { source: S.source, original: original(r) || null, score: r.criteria || r.status === 'queue' ? null : r.score, dates: r.dates.slice(-20) },
      ...(r.criteria || {}),
    };
    if (r.rewatches > 1) ratings._rewatch_count = r.rewatches;
    if (r.cat === 'anime' || r.cat === 'cartoons') ratings._media_type = m.type;
    const rec = {
      title: m.title, cat: r.cat, status: r.status, year: /^\d{4}$/.test(m.year) ? m.year : null,
      description: d?.overview || null, genres: d ? tmdbGenreNames(d.genres) : [], poster_url: m.poster ? TMDB_FULL + m.poster : null,
      tmdb_id: m.id, tmdb_type: m.type, final_score: r.status === 'queue' ? null : r.score,
      completed_date: r.status === 'completed' && r.date ? r.date : null,
      notes: S.withReviews && r.review ? r.review.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : null,
    };
    if (m.type === 'movie') { rec.runtime_h = d?.runtime ? Math.floor(d.runtime / 60) : null; rec.runtime_m = d?.runtime ? d.runtime % 60 : null; }
    else if (d) {
      const aired = mssAired(d);
      rec.total_seasons = aired.seasons; rec.total_eps = aired.eps;
      ratings._season_breakdown = aired.breakdown;
      if ((d.status === 'Ended' || d.status === 'Canceled') && d.last_air_date) ratings._completion_year = d.last_air_date.slice(0, 4);
      // How far you got, for a show you're partway through: N episodes in, walking the seasons
      if (r.episodes && r.status !== 'completed' && r.status !== 'queue') {
        let left = r.episodes, season = 1;
        for (const eps of aired.breakdown) { if (left <= eps) break; left -= eps; season++; }
        rec.season = Math.min(season, Math.max(1, aired.seasons || 1)); rec.episode = left; rec.watched = r.episodes;
      }
    }
    rec.ratings = ratings;
    return rec;
  }

  async function save() {
    const rows = visibleRows().filter(r => r.on && r.match);
    if (!rows.length) return;
    const rated = rows.filter(r => r.status !== 'queue' && r.score != null).length;
    const ok = await showConfirm({
      title: `Import ${rows.length} ${rows.length === 1 ? 'title' : 'titles'}?`,
      message: `${rated ? `${rated} will be saved with the ratings shown. ` : ''}They’re added to your library without telling your friends, and you can undo the whole import afterwards.`,
      confirmText: 'Import', cancelText: 'Keep Checking', iconName: 'download', danger: false,
    });
    if (!ok) return;
    S.step = 'save'; S.done = 0; S.total = rows.length; draw();
    try {
      const { data: batch, error } = await sb.rpc('import_start', { p_source: S.source, p_total: rows.length });
      if (error) throw error;
      const skipped = {}; let saved = 0;
      for (let n = 0; n < rows.length; n += SAVE_SIZE) {
        const part = rows.slice(n, n + SAVE_SIZE);
        const recs = [];
        for (let w = 0; w < part.length; w += WORKERS) {
          (await Promise.all(part.slice(w, w + WORKERS).map(details))).forEach(x => recs.push(x));
          paintProgress(n + recs.length, rows.length, 'Saving');
          await new Promise(z => setTimeout(z, 500));
        }
        let { data: ans, error: e2 } = await sb.rpc('import_rows', { p_batch: batch, p_rows: recs });
        if (e2) throw e2;
        // A restricted account: titles the database hasn't age-checked yet get checked, then one more try
        const retry = (ans || []).filter(a => a.reason === 'AGE_CHECK').map(a => a.i);
        if (retry.length) {
          await Promise.all(retry.map(i => _mssAgeCheck(recs[i]).catch(() => {})));
          const again = await sb.rpc('import_rows', { p_batch: batch, p_rows: retry.map(i => recs[i]) });
          if (!again.error) ans = ans.filter(a => a.reason !== 'AGE_CHECK').concat(again.data || []);
        }
        (ans || []).forEach(a => { if (a.ok) saved++; else skipped[a.reason] = (skipped[a.reason] || 0) + 1; });
      }
      S.result = { saved, skipped, batch };
      S.step = 'done';
      S.rows = [];
      draw();
      loadHistory();
    } catch (err) {
      console.error(err);
      const m = err?.message || '';
      S.step = 'preview';
      draw();
      showToast(/TOO_MANY/.test(m) ? 'That’s 10 imports today. Try again tomorrow.' : /TOO_BIG/.test(m) ? 'That’s too many titles for one import.' : 'The import stopped. Anything already saved is in Past Imports, where you can undo it.', 'err');
      loadHistory();
    }
  }

  async function undo(id) {
    const ok = await showConfirm({ title: 'Undo this import?', message: 'Every title from this import leaves your library, including any changes you’ve made to them since. This can’t be undone.', confirmText: 'Undo Import', iconName: 'trash' });
    if (!ok) return;
    const { data, error } = await sb.rpc('import_undo', { p_batch: id });
    if (error) { console.error(error); showToast('Couldn’t undo that. Try again.', 'err'); return; }
    showToast(`Removed ${data} ${data === 1 ? 'title' : 'titles'}.`);
    if (S.step === 'done') S = fresh();
    await loadHistory();
    draw();
  }

  async function loadHistory() {
    const { data } = await sb.from('import_batches').select('id, source, saved, created_at, undone_at').eq('user_id', me).order('created_at', { ascending: false }).limit(20).then(r => r, () => ({}));
    history = Array.isArray(data) ? data.filter(h => h.id) : [];
    if (S.step === 'start') draw();
  }

  // A preview row's rating: the typed number and its slider kept together
  const paintScore = (el, v) => {
    const wrap = el.closest('.imp-rate-in'), txt = wrap.querySelector('.imp-score'), sl = wrap.querySelector('.imp-slide');
    if (txt !== document.activeElement) txt.value = v != null ? Number(v).toFixed(1) : '';
    sl.value = v ?? 0; sl.classList.toggle('is-empty', v == null); sl.setAttribute('aria-valuetext', v != null ? Number(v).toFixed(1) : 'Not rated');
  };

  /* ── Tapping things ── */
  function wire() {
    const el = box();
    el.addEventListener('change', async ev => {
      const t = ev.target;
      if (t.id === 'importFile') {
        const file = t.files?.[0];
        if (!file) return;
        try { const { source, rows } = await read(file); S.error = ''; await run(source, rows); }
        catch (err) { console.warn(err); S.error = err?.message && !/fflate|undefined/.test(err.message) ? err.message : 'That file couldn’t be read.'; S.step = 'start'; draw(); }
      }
      if (t.dataset.on != null) { S.rows[Number(t.dataset.on)].on = t.checked; const f = document.querySelector('.imp-foot'); if (f) draw(); }
      if (t.dataset.opt) { S[t.dataset.opt] = t.checked; draw(); }
      if (t.dataset.score != null) {
        const v = parseFloat(t.value), r = S.rows[Number(t.dataset.score)];
        r.score = isNaN(v) ? null : Math.max(0, Math.min(10, Math.round(v * 2) / 2));
        paintScore(t, r.score);
        t.value = r.score != null ? r.score.toFixed(1) : '';
      }
    });
    el.addEventListener('input', ev => {
      if (ev.target.dataset.slide == null) return;
      const r = S.rows[Number(ev.target.dataset.slide)];
      r.score = Math.max(0, Math.min(10, Math.round(Number(ev.target.value) * 2) / 2));
      paintScore(ev.target, r.score);
    });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (b.dataset.filter) { S.filter = b.dataset.filter; S.shown = PAGE; draw(); return; }
      if (b.dataset.edit != null) { edit(Number(b.dataset.edit)); return; }
      if (b.dataset.undo) { undo(b.dataset.undo); return; }
      if (a === 'anilist') {
        const name = $('importAniList').value.trim();
        if (!/^[A-Za-z0-9_-]{2,40}$/.test(name)) { S.error = 'Enter your AniList username.'; draw(); return; }
        S.error = ''; S.anilist = name; draw();
        const go = box().querySelector('[data-act="anilist"]');
        go.disabled = true; go.textContent = 'Reading…';
        fromAniList(name).then(rows => run('anilist', rows)).catch(err => { console.warn(err); S.error = err?.message || 'AniList didn’t answer. Try again.'; S.step = 'start'; draw(); });
      }
      if (a === 'paste') { const text = $('importPaste').value; run('paste', fromLines(text)); }
      if (a === 'cancel') { S.cancel = true; S = fresh(); draw(); }
      if (a === 'more') { S.shown += PAGE; draw(); }
      if (a === 'all' || a === 'none') { visibleRows().filter(r => (S.filter === 'all' || r.state === S.filter) && r.match && r.state !== 'dup').forEach(r => { r.on = a === 'all'; }); draw(); }
      if (a === 'reset') { S = fresh(); draw(); }
      if (a === 'save') save();
    });
  }

  function init(userId) {
    me = userId;
    if (!box()) return;
    wire();
    draw();
    loadHistory();
  }
  const dirty = () => S.step === 'preview' || S.step === 'match' || S.step === 'save' || !!$('importPaste')?.value.trim() || !!$('importAniList')?.value.trim();
  const reset = () => { S.cancel = true; S = fresh(); draw(); };

  return { init, dirty, reset, _parseCSV: parseCSV, _fromLetterboxd: fromLetterboxd, _fromLines: fromLines, _fromImdb: fromImdb, _fromMAL: fromMAL, _baseTitle: baseTitle, _decide: decide, _convert: convert };
})();
