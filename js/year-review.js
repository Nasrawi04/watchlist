/* ══════════════════════════════════════════════════════════════
   year-review.js — your year in review (MSSYear), for the Export Studio
   ("Year in Review" as a PDF, story images or text for an AI).

   MSSYear.years(entries, diary) → years you finished something in, newest first
   MSSYear.compute(entries, year, extra) → null if nothing was finished that year, else {
     (extra.diary — your Diary's watches: every finish counts on its own day, rewatches too,
      and episodes are the ones you logged that year; without it, each title's "Watched on")
     year, titles, movies, shows, hours, episodes, avg,
     months:  [12 counts]  · busiest: { m, n }   (m = 0–11)
     genres:  [{ name, n }] most watched first
     top:     the 5 best of the year [{ e, s }]
     first, last: the first / last title finished that year
     rewatch: the most rewatched one (finished 2+ times that year, else 2+ watches) or null
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
  // From the Diary (110): every finish on its own day, rewatches included. A finish of a title that
  // has since left your library is drawn from what the watch kept (title, poster, category).
  function finishes(entries, diary) {
    const byId = new Map((entries || []).map(e => [e.id, e]));
    return (diary || []).filter(w => w.completes_title && w.watched_date).map(w => {
      const e = byId.get(w.entry_id) || { id: w.entry_id, title: w.title, cat: w.cat, poster_url: w.poster_url, tmdb_id: w.tmdb_id, tmdb_type: w.tmdb_type,
        ratings: { _media_type: w.tmdb_type === 'movie' ? 'movie' : undefined }, status: 'completed' };
      return { ...e, completed_date: w.watched_date, _watch: w };
    });
  }

  function years(entries, diary) {
    const list = diary ? finishes(entries, diary) : watched(entries);
    return [...new Set(list.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
  }

  function compute(entries, year, extra = {}) {
    const fromDiary = Array.isArray(extra.diary);
    const all = fromDiary ? finishes(entries, extra.diary) : watched(entries), list = all.filter(e => yearOf(e) === year)
      .sort((a, b) => String(a.completed_date).localeCompare(String(b.completed_date)) || String(a._watch?.watched_at || '').localeCompare(String(b._watch?.watched_at || '')));
    if (!list.length) return null;
    // a title finished twice counts twice; its score is the one you gave that time when there is one
    const scoreOf = e => e._watch?.rating_at_watch != null ? Number(e._watch.rating_at_watch) : MSSPdf.score(e);
    const scored = list.map(e => ({ e, s: scoreOf(e) })).filter(x => x.s != null);
    const months = Array(12).fill(0);
    list.forEach(e => { const m = Number(String(e.completed_date).slice(5, 7)) - 1; if (m >= 0 && m < 12) months[m]++; });
    const bm = months.indexOf(Math.max(...months));
    const gm = {};
    list.forEach(e => (e.genres || []).forEach(g => { gm[g] = (gm[g] || 0) + 1; }));
    // episodes: the Diary's episode watches that year (each one you logged); without it, the finished shows' counts
    const epRows = fromDiary ? extra.diary.filter(w => w.season != null && String(w.watched_date || '').startsWith(String(year))) : null;
    const eps = epRows ? epRows.length : list.filter(e => !isMovie(e)).reduce((t, e) => t + (Number(e.watched) || Number(e.total_eps) || 0), 0);
    const mins = list.filter(isMovie).reduce((t, e) => t + (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0), 0)
      + (epRows ? epRows.reduce((t, w) => t + (EP_MIN[w.cat] || 42), 0)
        : list.filter(e => !isMovie(e)).reduce((t, e) => t + (Number(e.watched) || Number(e.total_eps) || 0) * (EP_MIN[e.cat] || 42), 0));
    // most rewatched: finished most often that year, else the most watched over time
    const times = {};
    list.forEach(e => { times[e.id] = (times[e.id] || 0) + 1; });
    const twice = Object.entries(times).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0];
    const rw = twice ? { e: list.find(e => e.id === twice[0]), n: twice[1] }
      : list.map(e => ({ e, n: Number(e.ratings?._rewatch_count) || 1 })).filter(x => x.n > 1).sort((a, b) => b.n - a.n)[0] || null;
    const prevList = all.filter(e => yearOf(e) === year - 1), prevSc = prevList.map(scoreOf).filter(v => v != null);
    const byId = Object.fromEntries((entries || []).map(e => [e.id, e]));
    const ep = (extra.episodes || []).filter(r => Number(r.episode_number) > 0 && r.score != null && String(r.updated_at || r.created_at || '').startsWith(String(year)))
      .sort((a, b) => b.score - a.score)[0];
    const distinct = [...new Map(list.map(e => [e.id, e])).values()];
    return {
      year, titles: list.length, movies: list.filter(isMovie).length, shows: list.filter(e => !isMovie(e)).length,
      hours: Math.round(mins / 60), episodes: eps,
      avg: scored.length ? scored.reduce((t, x) => t + x.s, 0) / scored.length : null,
      months, busiest: { m: bm, n: months[bm] },
      genres: Object.entries(gm).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      // the year's best: each title once, at its best score that year
      top: scored.sort((a, b) => b.s - a.s).filter((x, i, a) => a.findIndex(y => y.e.id === x.e.id) === i).slice(0, 5),
      first: list[0], last: list[list.length - 1],
      rewatch: rw, notes: distinct.filter(e => e.notes && e.notes.trim()).length,
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
