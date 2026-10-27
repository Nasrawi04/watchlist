/* ══════════════════════════════════════════════════════════════
   year-review.js — your year in review (MSSYear), for the Export Studio
   ("Year in Review" as a PDF, story images or text for an AI).

   MSSYear.years(entries) → years you finished something in, newest first
   MSSYear.compute(entries, year, extra) → null if nothing was finished that year, else {
     year, titles, movies, shows, hours, episodes, avg,
     months:  [12 counts]  · busiest: { m, n }   (m = 0–11)
     genres:  [{ name, n }] most watched first
     top:     the 5 best of the year [{ e, s }]
     first, last: the first / last title finished that year
     rewatch: the most rewatched one (2+ watches) or null
     notes:   how many of them got a note
     medals:  [badge] earned that year      (extra.badges — my_badges)
     topEp:   { title, season, episode, score } or null   (extra.episodes — your episode ratings)
     prev:    { titles, avg } the year before (to compare), or null
   }
   MSSYear.lines(y) → plain sentences (AI export, alt text)
   MSSYear.MONTHS — short month names
   Requires config.js (CAT_META), export.js (MSSPdf.kindOf / score).
══════════════════════════════════════════════════════════════ */
const MSSYear = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const EP_MIN = { tv: 42, anime: 24, cartoons: 22 };
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const yearOf = e => Number(String(e.completed_date || '').slice(0, 4)) || null;
  const watched = entries => (entries || []).filter(e => MSSPdf.kindOf(e) === 'watched' && yearOf(e));

  function years(entries) { return [...new Set(watched(entries).map(yearOf))].sort((a, b) => b - a); }

  function compute(entries, year, extra = {}) {
    const all = watched(entries), list = all.filter(e => yearOf(e) === year)
      .sort((a, b) => String(a.completed_date).localeCompare(String(b.completed_date)));
    if (!list.length) return null;
    const scored = list.map(e => ({ e, s: MSSPdf.score(e) })).filter(x => x.s != null);
    const months = Array(12).fill(0);
    list.forEach(e => { const m = Number(String(e.completed_date).slice(5, 7)) - 1; if (m >= 0 && m < 12) months[m]++; });
    const bm = months.indexOf(Math.max(...months));
    const gm = {};
    list.forEach(e => (e.genres || []).forEach(g => { gm[g] = (gm[g] || 0) + 1; }));
    const eps = list.filter(e => !isMovie(e)).reduce((t, e) => t + (Number(e.watched) || Number(e.total_eps) || 0), 0);
    const mins = list.reduce((t, e) => t + (isMovie(e) ? (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0)
      : (Number(e.watched) || Number(e.total_eps) || 0) * (EP_MIN[e.cat] || 42)), 0);
    const rw = list.map(e => ({ e, n: Number(e.ratings?._rewatch_count) || 1 })).filter(x => x.n > 1).sort((a, b) => b.n - a.n)[0] || null;
    const prevList = all.filter(e => yearOf(e) === year - 1), prevSc = prevList.map(MSSPdf.score).filter(v => v != null);
    const byId = Object.fromEntries((entries || []).map(e => [e.id, e]));
    const ep = (extra.episodes || []).filter(r => Number(r.episode_number) > 0 && r.score != null && String(r.updated_at || r.created_at || '').startsWith(String(year)))
      .sort((a, b) => b.score - a.score)[0];
    return {
      year, titles: list.length, movies: list.filter(isMovie).length, shows: list.filter(e => !isMovie(e)).length,
      hours: Math.round(mins / 60), episodes: eps,
      avg: scored.length ? scored.reduce((t, x) => t + x.s, 0) / scored.length : null,
      months, busiest: { m: bm, n: months[bm] },
      genres: Object.entries(gm).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      top: scored.sort((a, b) => b.s - a.s).slice(0, 5),
      first: list[0], last: list[list.length - 1],
      rewatch: rw, notes: list.filter(e => e.notes && e.notes.trim()).length,
      medals: (extra.badges || []).filter(b => String(b.earned_at || '').startsWith(String(year))),
      topEp: ep && byId[ep.entry_id] ? { title: byId[ep.entry_id].title, season: ep.season_number, episode: ep.episode_number, score: Number(ep.score) } : null,
      prev: prevList.length ? { titles: prevList.length, avg: prevSc.length ? prevSc.reduce((a, b) => a + b, 0) / prevSc.length : null } : null,
    };
  }

  function lines(y) {
    if (!y) return [];
    const out = [`In ${y.year} I finished ${y.titles} titles — ${y.movies} ${y.movies === 1 ? 'movie' : 'movies'} and ${y.shows} ${y.shows === 1 ? 'show' : 'shows'} — about ${y.hours} hours${y.episodes ? ` and ${y.episodes} episodes` : ''}.`];
    if (y.avg != null) out.push(`My average score that year: ${y.avg.toFixed(2)} out of 10${y.prev?.avg != null ? ` (${y.year - 1}: ${y.prev.avg.toFixed(2)})` : ''}.`);
    if (y.genres.length) out.push(`Most watched genres: ${y.genres.slice(0, 3).map(g => `${g.name} (${g.n})`).join(', ')}.`);
    if (y.busiest.n) out.push(`Busiest month: ${MONTHS[y.busiest.m]} (${y.busiest.n} titles).`);
    if (y.topEp) out.push(`Best episode I rated: ${y.topEp.title} S${y.topEp.season} E${y.topEp.episode} (${y.topEp.score}).`);
    if (y.medals.length) out.push(`Medals earned: ${y.medals.length}.`);
    return out;
  }

  return { years, compute, lines, MONTHS };
})();
