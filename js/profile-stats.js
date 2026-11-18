/* ══════════════════════════════════════════
   profile-stats.js — the stats a profile can show (MSSProfileStats), chosen in Edit profile › Profile stats
   (profiles.profile_layout.stats: 3–6, in order; profile_layout.time: 'hours' | 'span').
   Every one counts the way the rest of MSF does (computeStats, db.js; the Library's rules).
   Used by profile-v2.js (the header's tiles, the stats editor) and the people cards on the Social pages
   (friends.html: each person's first 3).
     keys(profile) → their chosen keys (or the defaults) · values(entries, { lists, diary, time }) → key → shown value
     label(key) → its short name · timeOf(profile) · span(minutes)
══════════════════════════════════════════ */
const MSSProfileStats = (() => {
  const layoutOf = p => (p && p.profile_layout && typeof p.profile_layout === 'object') ? p.profile_layout : {};
  const fmt = n => Number(n || 0).toLocaleString(typeof MSSI18n !== 'undefined' ? MSSI18n.locale : undefined);
  const done = e => e.status === 'completed' || e.status === 'ongoing';
  const STATS = [
    ['watched',   'Watched',            'Titles you’ve watched (Watched + To Be Continued)'],
    ['watchlist', 'Watchlist',          'Watchlist and Up Next'],
    ['watching',  'Currently watching', 'Watching and Taking a Break'],
    ['episodes',  'Episodes',           'Episodes watched'],
    ['avg',       'Average score',      'Across your watched, rated titles'],
    ['lists',     'Lists',              'Lists you made'],
    ['notes',     'Notes',              'Titles with a note or review'],
    ['movietime', 'Movie time',         'Time spent on watched movies'],
    ['eptime',    'Episode time',       'Time spent on episodes (each show’s usual episode length)'],
    ['totaltime', 'Total time',         'Movies and episodes together'],
    ['rated9',    'Rated 9+',           'Watched titles you scored 9 or more'],
    ['rewatched', 'Rewatched',          'Titles watched more than once'],
    ['diary',     'Diary watches',      'Watches logged in your Diary'],
    ['titles',    'Titles',             'Everything in your library'],
    ['movies',    'Movies watched',     'Watched movies'],
    ['tv',        'TV shows watched',   'Watched TV shows'],
    ['anime',     'Anime watched',      'Watched anime'],
    ['cartoons',  'Cartoons watched',   'Watched cartoons'],
    ['dropped',   'Dropped',            'Titles you stopped watching'],
  ];
  const SHORT = { avg: 'Avg score', watching: 'Watching', movietime: 'Movie time', eptime: 'Episode time', totaltime: 'Total time', diary: 'Diary', movies: 'Movies', tv: 'TV shows', anime: 'Anime', cartoons: 'Cartoons' };
  const DEF_STATS = ['watched', 'watchlist', 'episodes', 'avg', 'lists', 'notes'];
  const statKeys = p => {
    const s = layoutOf(p).stats;
    const ok = Array.isArray(s) ? s.filter(k => STATS.some(x => x[0] === k)) : [];
    return ok.length >= 3 ? ok.slice(0, 6) : DEF_STATS.slice();
  };
  // Movie time / Episode time / Total time: hours (2,259h) or, chosen in Profile stats (profile_layout.time = 'span'),
  // the two biggest of years · months · days · hours (3mo 4d) — a month is 30 days, a year 365
  const timeOf = p => layoutOf(p).time === 'span' ? 'span' : 'hours';
  function span(mins) {
    let h = Math.round(mins / 60);
    if (!h) return '0h';
    const parts = [['y', 8760], ['mo', 720], ['d', 24], ['h', 1]].map(([u, n]) => { const v = Math.floor(h / n); h -= v * n; return v ? `${v}${u}` : ''; }).filter(Boolean);
    return parts.slice(0, 2).join(' ');
  }
  // every stat's value for these entries ('—' when there's nothing to count, e.g. no scores); o.time: 'hours' | 'span'
  function statValues(entries, o = {}) {
    entries = entries || [];
    const st = computeStats(entries), w = entries.filter(done);
    const cat = c => w.filter(e => e.cat === c).length;
    const hrs = Math.round((st.movieMins || 0) / 60);
    const h = m => o.time === 'span' ? span(m) : fmt(Math.round(m / 60)) + 'h';
    return {
      watched: fmt(st.completed), watchlist: fmt(st.queue),
      watching: fmt(entries.filter(e => e.status === 'watching' || e.status === 'paused').length),
      episodes: fmt(st.totalEps), avg: st.avgScore != null ? Number(st.avgScore).toFixed(2) : '—',
      lists: o.lists == null ? '—' : fmt(o.lists),
      notes: fmt(entries.filter(e => e.notes && String(e.notes).trim()).length),
      movietime: h(st.movieMins || 0),
      eptime: h(st.epMins || 0), totaltime: h((st.movieMins || 0) + (st.epMins || 0)),
      rated9: fmt(w.filter(e => liveScore(e) != null && Number(liveScore(e)) >= 9).length),
      rewatched: fmt(entries.filter(e => mssRewatchCount(e) > 1).length),
      diary: o.diary == null ? '—' : fmt(o.diary),
      titles: fmt(entries.length),
      movies: fmt(cat('movies')),
      tv: fmt(cat('tv')), anime: fmt(cat('anime')), cartoons: fmt(cat('cartoons')),
      dropped: fmt(st.dropped),
    };
  }
  const label = k => SHORT[k] || (STATS.find(x => x[0] === k) || [k, k])[1];
  return { STATS, DEF_STATS, keys: statKeys, timeOf, span, values: statValues, label };
})();
