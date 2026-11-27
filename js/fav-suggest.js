/* ══════════════════════════════════════════════════════════════
   fav-suggest.js — suggestions for the profile's Top 5 pickers (MSSFavSuggest), loaded when one opens
   (profile-v2.js). Everything comes from your own library and TMDB; TMDB answers are kept by tmdbFetch like every
   other page's, and the people suggestions are saved on the device (Cookies › Faster pages › Suggestions).

   People   await people(kind, entries, skip)  kind 'actors' | 'actresses' | 'directors'
              → { mine: [TMDB person + why], popular: [TMDB person] }
              mine: ONE person from each of your best titles, one per film series (owner, 27 Nov 2026 — not four from
              Kung Fu Panda), up to 20, best title first: the main cast (top-billed in a film, the most-seen in a show),
              or the director of a film and the creator of a show (Vince Gilligan for Breaking Bad). Actors / Actresses
              follow TMDB's gender; people without one (or non-binary) are in both (mssGenderFits, nav.js).
              popular: a fixed list of 20 well-known names (not TMDB's trending), filling the list up to 20.
              Saved on the device after the first time (mss_fav_people_v1, two weeks) so it doesn't keep changing.
   Seasons / episodes (your scores first, then what you've watched; Top 250 only when you've watched no shows)
            await rated(userId, entries, 'season' | 'episode') → [{ e, s, n, score }]   your best one per show
            shows(entries)                → your shows you've watched something of, best-scored first
            await seasons(show)           → [{ s, name, path, year, eps, seen }]   show = { tv, e? }
            await episodes(show, s)       → [{ n, name, year, seen }]
            await top(kind)               → Top 250 seasons / episodes, one per show (Discover's shared list)
            await myScores(userId)        → { [entryId]: { 's:n': score } }   (n 0 = the whole season)
   Characters (TMDB has no characters: a name, with its title)
            favourites(entries)           → the favourite character you picked on each title, best-scored first
            await fromTop(entries)        → the main character of each of your 20 best titles, one per series (mssFetchCast)
            await cast(type, id)          → a title's characters, for search
            POPULAR_CHARACTERS            → when your library has nothing
   Requires config.js, nav.js (tmdbFetch, mssFetchCast, mssGenderFits), db.js (sb).
══════════════════════════════════════════════════════════════ */
const MSSFavSuggest = (() => {
  const TODAY = new Date().toISOString().slice(0, 10);
  const PROGRESS = ['watching', 'paused', 'ongoing', 'dropped'];
  const typeOf = e => e.tmdb_type === 'movie' || e.tmdb_type === 'tv' ? e.tmdb_type : (mssIsMovieEntry(e) ? 'movie' : 'tv');
  const score = e => { const v = liveScore(e); return v == null || e.status === 'dropped' ? null : Number(v); };
  const json = async url => { try { const r = await tmdbFetch(url); return r.ok ? await r.json() : null; } catch { return null; } };
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const SELF = /\b(himself|herself|themselves|self)\b/i;
  const byScore = (a, b) => (b.sc ?? -1) - (a.sc ?? -1);

  // your best titles: scored ones best first, then ones you've watched without a score
  function best(entries, n, keep = () => true) {
    return (entries || []).filter(e => e.tmdb_id && ['completed', 'ongoing', 'watching', 'paused'].includes(e.status) && keep(e))
      .map(e => ({ e, sc: score(e) })).sort(byScore).slice(0, n);
  }

  /* ── People ── */
  const POPULAR = {
    actors: ['Brad Pitt', 'Leonardo DiCaprio', 'Tom Hanks', 'Denzel Washington', 'Robert De Niro', 'Al Pacino', 'Morgan Freeman', 'Christian Bale', 'Joaquin Phoenix', 'Matt Damon',
      'Tom Hardy', 'Keanu Reeves', 'Cillian Murphy', 'Ryan Gosling', 'Heath Ledger', 'Daniel Day-Lewis', 'Anthony Hopkins', 'Jack Nicholson', 'Samuel L. Jackson', 'Bryan Cranston'],
    actresses: ['Meryl Streep', 'Natalie Portman', 'Scarlett Johansson', 'Cate Blanchett', 'Viola Davis', 'Emma Stone', 'Margot Robbie', 'Kate Winslet', 'Charlize Theron', 'Jennifer Lawrence',
      'Anne Hathaway', 'Zendaya', 'Florence Pugh', 'Nicole Kidman', 'Julia Roberts', 'Sigourney Weaver', 'Amy Adams', 'Saoirse Ronan', 'Frances McDormand', 'Emma Watson'],
    directors: ['Christopher Nolan', 'Martin Scorsese', 'Steven Spielberg', 'Quentin Tarantino', 'Stanley Kubrick', 'David Fincher', 'Denis Villeneuve', 'Alfred Hitchcock', 'Hayao Miyazaki', 'Francis Ford Coppola',
      'Ridley Scott', 'James Cameron', 'Peter Jackson', 'Greta Gerwig', 'Bong Joon Ho', 'Wes Anderson', 'Guillermo del Toro', 'Akira Kurosawa', 'Vince Gilligan', 'Paul Thomas Anderson'],
  };
  const GENDER = { actors: 2, actresses: 1 };
  // the fixed names → TMDB people (the same search the picker uses, so it's kept on the device the same way)
  async function popular(kind, skip) {
    const found = await Promise.all(POPULAR[kind].map(async n => {
      const d = await json(`${TMDB_BASE}/search/person?query=${encodeURIComponent(n)}&language=en-US&include_adult=false&page=1`);
      return (d?.results || []).filter(x => norm(x.name) === norm(n)).sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0] || null;
    }));
    return found.filter(x => x && !skip.has(Number(x.id)));
  }
  // one per film series: "Kung Fu Panda 2" and "Kung Fu Panda: The Kaboom of Doom" count as "Kung Fu Panda"
  const series = t => norm(String(t || '').split(/[:–—]/)[0]).replace(/\s+(\d+|ii|iii|iv|v|vi)$/, '').replace(/^the /, '');
  function bestSeries(entries, n) {
    const seen = new Set();
    return best(entries, 200).filter(({ e }) => { const k = series(e.title); return k && !seen.has(k) && seen.add(k); }).slice(0, n);
  }
  // Saved on this device after the first time (Cookies › Faster pages › Suggestions), so the list stays put while you
  // pick; worked out again after two weeks. Your picks are left out when it's shown, not when it's saved.
  const STORE = 'mss_fav_people_v1', KEEP = 14 * 864e5, MAX = 20;
  const saved = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const keyOf = kind => `${window._navUser?.id || 'me'}:${kind}`;
  function remember(kind, val) {
    try {
      const all = saved(); all[keyOf(kind)] = { t: Date.now(), ...val };
      Object.keys(all).filter(k => Date.now() - all[k].t > KEEP).forEach(k => delete all[k]);
      localStorage.setItem(STORE, JSON.stringify(all));
    } catch {}
  }
  const slim = (p, why) => ({ id: p.id, name: p.name, profile_path: p.profile_path || null, gender: p.gender || 0,
    known_for_department: p.known_for_department || null, known_for: why ? [{ title: why }] : (p.known_for || []).slice(0, 1).map(k => ({ title: k.title || k.name })), why: why ? `In ${why}` : null });
  // one person from each of your best titles (and one per film series): up to 20, best title first — on each title the
  // one who also comes up most across your other titles (Brad Pitt for Fight Club when you love Se7en too), else top-billed
  async function work(kind, entries) {
    const gender = GENDER[kind];
    const titles = await Promise.all(bestSeries(entries, 30).map(async ({ e }) => {
      const type = typeOf(e), id = Number(e.tmdb_id);
      if (kind === 'directors') {
        // a film's director; a show's creator (the title page shows the same)
        const d = await json(type === 'movie' ? `${TMDB_BASE}/movie/${id}/credits?language=en-US` : `${TMDB_BASE}/tv/${id}?language=en-US`);
        return { e, list: type === 'movie' ? (d?.crew || []).filter(c => c.job === 'Director') : (d?.created_by || []) };
      }
      // the same requests as a title's cast everywhere else (mssFetchCast)
      const d = await json(`${TMDB_BASE}/${type}/${id}/${type === 'movie' ? 'credits' : 'aggregate_credits'}?language=en-US`);
      const cast = (d?.cast || []).filter(c => !SELF.test(c.character || c.roles?.[0]?.character || ''))
        .sort(type === 'movie' ? (a, b) => (a.order ?? 99) - (b.order ?? 99) : (a, b) => (b.total_episode_count || 0) - (a.total_episode_count || 0));
      return { e, list: cast.slice(0, 8).filter(p => mssGenderFits(p.gender, gender)).slice(0, 3) };
    }));
    const times = {};
    titles.forEach(t => t.list.forEach(p => { times[p.id] = (times[p.id] || 0) + 1; }));
    const used = new Set(), out = [];
    titles.forEach(({ e, list }) => {
      const p = list.filter(x => x.id && x.name && !used.has(x.id)).sort((a, b) => (times[b.id] || 0) - (times[a.id] || 0))[0];
      if (p && out.length < MAX + 5) { used.add(p.id); out.push(slim(p, e.title)); }
    });
    return out;
  }
  async function people(kind, entries, skipIds) {
    const skip = new Set((skipIds || []).map(Number)), free = x => !skip.has(Number(x.id));
    let hit = saved()[keyOf(kind)];
    if (!hit || Date.now() - hit.t > KEEP || !Array.isArray(hit.mine)) {
      const mine = await work(kind, entries);
      // 20 well-known names fill what's left (all 20 with an empty library)
      hit = { mine, popular: mine.length < MAX ? (await popular(kind, new Set(mine.map(x => Number(x.id))))).map(p => slim(p)) : [] };
      if (mine.length || hit.popular.length) remember(kind, hit);
    }
    const mine = hit.mine.filter(free).slice(0, MAX);
    return { mine, popular: (hit.popular || []).filter(x => free(x) && !mine.some(m => m.id === x.id)).slice(0, Math.max(0, MAX - mine.length)) };
  }

  /* ── Seasons and episodes ── */
  const isShow = e => e.tmdb_id && typeOf(e) === 'tv';
  // how far you are: rated, finished, or your progress is past it (the Season / Episode pages' rule, show-pages.js)
  function seenSeason(e, s, mine) {
    if (!e) return true;
    if (Object.keys(mine || {}).some(k => k.startsWith(s + ':'))) return true;
    if (e.status === 'completed') return true;
    return PROGRESS.includes(e.status) && s <= (Number(e.season) || 0);
  }
  function seenEp(e, s, n, mine) {
    if (!e) return true;
    if ((mine || {})[`${s}:${n}`] != null) return true;
    if (e.status === 'completed') return true;
    const cs = Number(e.season) || 0, ce = Number(e.episode) || 0;
    return PROGRESS.includes(e.status) && (s < cs || (s === cs && n <= ce));
  }
  let SCORES = null;
  async function myScores(userId) {
    if (SCORES) return SCORES;
    const out = {};
    if (userId) {
      // your best first, so the 1,000 the database sends at once are the ones that matter
      const q = ep => sb.from('episode_ratings').select('entry_id,season_number,episode_number,score').eq('user_id', userId).gt('season_number', 0)
        [ep ? 'gt' : 'eq']('episode_number', 0).order('score', { ascending: false }).limit(1000);
      try {
        const [a, b] = await Promise.all([q(false), q(true)]);
        [...(a.data || []), ...(b.data || [])].forEach(r => { (out[r.entry_id] ||= {})[`${r.season_number}:${r.episode_number}`] = Number(r.score); });
      } catch {}
    }
    return (SCORES = out);
  }
  // your best-rated season / episode of each show
  async function rated(userId, entries, kind) {
    const all = await myScores(userId), out = [];
    (entries || []).filter(isShow).forEach(e => {
      let top = null;
      Object.entries(all[e.id] || {}).forEach(([k, v]) => {
        const [s, n] = k.split(':').map(Number);
        if ((kind === 'season') !== (n === 0)) return;
        if (!top || v > top.score) top = { e, s, n, score: v };
      });
      if (top) out.push(top);
    });
    return out.sort((a, b) => b.score - a.score);
  }
  const shows = entries => (entries || []).filter(e => isShow(e) && (e.status === 'completed' || e.status === 'ongoing'
    || (PROGRESS.includes(e.status) && (Number(e.season) > 1 || Number(e.episode) > 0)))).map(e => ({ e, sc: score(e) })).sort(byScore).map(x => x.e);
  // show = { tv, e? (your library copy) }; with e, only what you've seen (all of it when your progress says nothing)
  async function seasons(show, userId) {
    const d = await json(`${TMDB_BASE}/tv/${Number(show.tv)}?language=en-US`); if (!d) return null;
    const mine = show.e ? (await myScores(userId))[show.e.id] || {} : {};
    const list = (d.seasons || []).filter(x => x.season_number > 0 && x.air_date && x.air_date <= TODAY).map(x => ({
      s: x.season_number, name: x.name, path: x.poster_path || d.poster_path || null, year: (x.air_date || '').slice(0, 4), eps: x.episode_count || 0,
      score: mine[`${x.season_number}:0`] ?? null, seen: seenSeason(show.e, x.season_number, mine) }));
    const seen = list.filter(x => x.seen);
    return { show: d.name, path: d.poster_path || null, list: seen.length ? seen : list };
  }
  async function episodes(show, s, userId) {
    const d = await json(`${TMDB_BASE}/tv/${Number(show.tv)}/season/${Number(s)}?language=en-US`); if (!d) return null;
    const mine = show.e ? (await myScores(userId))[show.e.id] || {} : {};
    // numbered from 1 in each season, like the Episode page (some anime count on from the last season on TMDB)
    const list = (d.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number).map((x, i) => ({
      n: i + 1, name: x.name, year: (x.air_date || '').slice(0, 4), aired: !!x.air_date && x.air_date <= TODAY,
      score: mine[`${s}:${i + 1}`] ?? null, seen: seenEp(show.e, Number(s), i + 1, mine) })).filter(x => x.aired);
    const seen = list.filter(x => x.seen);
    return { path: d.poster_path || null, list: seen.length ? seen : list };
  }
  // Top 250 seasons / episodes (Discover's list, worked out once a week for everyone), one per show
  async function top(kind) {
    let body = null;
    try { body = JSON.parse(localStorage.getItem('mss_top_eps_v2') || 'null'); } catch {}
    if (!body?.seasons) { try { body = (await sb.from('tmdb_cache').select('body').eq('key', 'msf:top_eps').maybeSingle()).data?.body || null; } catch {} }
    const seenShow = new Set();
    return ((kind === 'season' ? body?.seasons : body?.episodes) || []).filter(x => !seenShow.has(x.show_id) && seenShow.add(x.show_id)).slice(0, 20);
  }

  /* ── Characters ── */
  const POPULAR_CHARACTERS = [
    ['Walter White', 'Breaking Bad', 'tv', 1396, 'Bryan Cranston'], ['Tony Soprano', 'The Sopranos', 'tv', 1398, 'James Gandolfini'],
    ['Tyler Durden', 'Fight Club', 'movie', 550, 'Brad Pitt'], ['The Joker', 'The Dark Knight', 'movie', 155, 'Heath Ledger'],
    ['Hannibal Lecter', 'The Silence of the Lambs', 'movie', 274, 'Anthony Hopkins'], ['Michael Corleone', 'The Godfather', 'movie', 238, 'Al Pacino'],
    ['Tyrion Lannister', 'Game of Thrones', 'tv', 1399, 'Peter Dinklage'], ['Forrest Gump', 'Forrest Gump', 'movie', 13, 'Tom Hanks'],
    ['Darth Vader', 'Star Wars', 'movie', 11, 'James Earl Jones'], ['Eleven', 'Stranger Things', 'tv', 66732, 'Millie Bobby Brown'],
    ['Saul Goodman', 'Better Call Saul', 'tv', 60059, 'Bob Odenkirk'], ['Thomas Shelby', 'Peaky Blinders', 'tv', 60574, 'Cillian Murphy'],
    ['Michael Scott', 'The Office', 'tv', 2316, 'Steve Carell'], ['Homer Simpson', 'The Simpsons', 'tv', 456, 'Dan Castellaneta'],
    ['Rick Sanchez', 'Rick and Morty', 'tv', 60625, 'Justin Roiland'], ['Monkey D. Luffy', 'One Piece', 'tv', 37854, 'Mayumi Tanaka'],
    ['Levi Ackerman', 'Attack on Titan', 'tv', 1429, 'Hiroshi Kamiya'], ['Tony Stark', 'Iron Man', 'movie', 1726, 'Robert Downey Jr.'],
    ['Jack Sparrow', 'Pirates of the Caribbean: The Curse of the Black Pearl', 'movie', 22, 'Johnny Depp'], ['Gandalf', 'The Lord of the Rings: The Fellowship of the Ring', 'movie', 120, 'Ian McKellen'],
  ].map(([name, title, type, tmdb, actor]) => ({ name, title, type, tmdb, actor }));
  // "Jinx (voice)", "Simba ()" → the name alone
  const cleanName = n => String(n || '').replace(/\s*\((voice|uncredited|archive footage)?\)/gi, '').replace(/\s+/g, ' ').trim();
  const charOf = (name, e, actor) => ({ name: cleanName(name), title: e.title, actor: actor || null, tmdb: Number(e.tmdb_id) || null, type: e.tmdb_id ? typeOf(e) : null });
  // the favourite character you picked when rating each title (Favorites & Lowlights)
  const favourites = entries => (entries || []).filter(e => cleanName(e.ratings?._favorites?.character))
    .map(e => ({ e, sc: score(e) })).sort(byScore).map(({ e }) => charOf(e.ratings._favorites.character, e));
  const usable = c => c.character && !SELF.test(c.character) && !/^(various|additional voices|uncredited)/i.test(c.character);
  async function fromTop(entries) {
    const lists = await Promise.all(bestSeries(entries, 20).map(async ({ e }) => {
      const cast = await mssFetchCast({ tmdb_id: e.tmdb_id, tmdb_type: typeOf(e), title: e.title, year: String(e.year || '').slice(0, 4), animated: e.cat === 'anime' || e.cat === 'cartoons' }).catch(() => []);
      return (cast || []).filter(usable).slice(0, 1).map(c => charOf(c.character, e, c.actor));   // one per title
    }));
    return lists.flat();
  }
  // a title's characters (top 15): for a show, the ones in the most episodes
  async function cast(type, id, title) {
    const d = await json(`${TMDB_BASE}/${type}/${Number(id)}/${type === 'movie' ? 'credits' : 'aggregate_credits'}?language=en-US`);
    const list = (d?.cast || []).map(c => ({ character: cleanName(c.character || c.roles?.[0]?.character), actor: c.name, n: c.total_episode_count || 0, order: c.order ?? 99 }))
      .filter(usable).sort(type === 'movie' ? (a, b) => a.order - b.order : (a, b) => b.n - a.n).slice(0, 15);
    return list.map(c => ({ name: c.character, title, actor: c.actor || null, tmdb: Number(id), type }));
  }
  const sameChar = (a, b) => norm(a.name) === norm(b.name) && norm(a.title) === norm(b.title);

  return { people, rated, shows, seasons, episodes, top, myScores, favourites, fromTop, cast, sameChar, norm, POPULAR_CHARACTERS };
})();
