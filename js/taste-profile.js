/* ══════════════════════════════════════════════════════════════
   taste-profile.js — your taste, worked out from your scores (MSSTaste).
   Used by the Export Studio ("My taste profile" as a PDF page, an
   image or text for an AI) and added to the "For an AI" export.

   MSSTaste.compute(entries) → null when nothing is rated, else {
     rated, avg, median, hours, movies: { n, avg }, shows: { n, avg },
     genres:     [{ name, n, avg }]   genres with 2+ rated titles, best first
     categories: [{ label, n, avg, subs }]  each core rating group (Narrative & Storytelling…), kindest first:
                                       a title counts with its group's average; subs = the ratings inside, the same way
     kindest, harshest                 the group you score highest / lowest
     values:     [{ label, n, avg }]   "What you value most": bonus groups, counting only titles where one was rated
     decades:    [{ name, n, avg }]   oldest first; favDecade (best average, 2+ titles), mostDecade (most titles)
     spread:     [count of scores 1–10]   (8.25 counts as 8)
     top:        the 5 best titles
     generous:   'generous' | 'balanced' | 'tough' — compared with the middle of the scale
   }
   MSSTaste.lines(t) → plain sentences (the AI export, alt text)
   Requires config.js (liveScore, mssRatedGroups), export.js (MSSPdf.kindOf).
══════════════════════════════════════════════════════════════ */
const MSSTaste = (() => {
  const EP_MIN = { tv: 42, anime: 24, cartoons: 22 };
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const avgOf = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const group = (items, key, val) => {
    const m = {};
    items.forEach(it => { const k = key(it); if (k == null || k === '') return; (m[k] ||= []).push(val(it)); });
    return Object.entries(m).map(([name, vs]) => ({ name, n: vs.length, avg: avgOf(vs) }));
  };

  function compute(entries) {
    const watched = (entries || []).filter(e => MSSPdf.kindOf(e) === 'watched');
    const rated = watched.map(e => ({ e, s: MSSPdf.score(e) })).filter(x => x.s != null);
    if (!rated.length) return null;
    const scores = rated.map(x => x.s).sort((a, b) => a - b);
    const mid = scores.length >> 1, median = scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
    const avg = avgOf(scores);
    const genres = group(rated.flatMap(x => (x.e.genres || []).map(g => ({ g, s: x.s }))), r => r.g, r => r.s)
      .filter(g => g.n >= 2).sort((a, b) => b.avg - a.avg || b.n - a.n);
    // live action's optional Animation Quality stays out, as it always has
    const coreOf = e => { const r = { ...(e.ratings || {}) }; if (!['anime', 'cartoons'].includes(e.cat)) delete r.animation; return r; };
    const rg = rated.map(x => mssRatedGroups(coreOf(x.e), x.e.cat, isMovie(x.e)));
    const byGroup = kind => group(rg.flatMap(gs => gs.filter(g => g.kind === kind)), g => g.name, g => g.avg)
      .filter(c => c.n >= 2).map(c => ({ label: c.name, n: c.n, avg: c.avg })).sort((a, b) => b.avg - a.avg);
    const categories = byGroup('core').map(c => ({ ...c,
      subs: group(rg.flatMap(gs => gs.filter(g => g.name === c.label).flatMap(g => g.items)), i => i.label, i => i.v)
        .filter(s => s.n >= 2).map(s => ({ label: s.name, n: s.n, avg: s.avg })) }));
    const values = byGroup('bonus');
    const decades = group(rated, x => { const y = Number(String(x.e.year || '').slice(0, 4)); return y > 1880 ? `${Math.floor(y / 10) * 10}s` : null; }, x => x.s)
      .sort((a, b) => a.name.localeCompare(b.name));
    const spread = Array(10).fill(0);
    scores.forEach(s => { spread[Math.min(9, Math.max(0, Math.floor(s) - 1))]++; });
    const mv = rated.filter(x => isMovie(x.e)).map(x => x.s), sh = rated.filter(x => !isMovie(x.e)).map(x => x.s);
    const mins = watched.reduce((t, e) => t + (isMovie(e) ? (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0)
      : (Number(e.watched) || Number(e.total_eps) || 0) * (EP_MIN[e.cat] || 42)), 0);
    const fav = decades.filter(d => d.n >= 2).sort((a, b) => b.avg - a.avg)[0] || null;
    return {
      rated: rated.length, avg, median, hours: Math.round(mins / 60),
      movies: { n: mv.length, avg: avgOf(mv) }, shows: { n: sh.length, avg: avgOf(sh) },
      genres, categories, values, kindest: categories[0] || null, harshest: categories.length > 1 ? categories[categories.length - 1] : null,
      decades, favDecade: fav, mostDecade: [...decades].sort((a, b) => b.n - a.n)[0] || null,
      spread, top: rated.sort((a, b) => b.s - a.s).slice(0, 5).map(x => ({ e: x.e, s: x.s })),
      generous: avg >= 7.5 ? 'generous' : avg <= 5.5 ? 'tough' : 'balanced',
    };
  }

  const f = v => v == null ? '—' : v.toFixed(2);
  function lines(t) {
    if (!t) return [];
    const out = [`I’ve rated ${t.rated} titles — my average score is ${f(t.avg)} out of 10 (median ${f(t.median)}), so I’m a ${t.generous} scorer.`];
    if (t.genres.length) out.push(`Genres I score highest: ${t.genres.slice(0, 3).map(g => `${g.name} (${f(g.avg)})`).join(', ')}.`);
    if (t.genres.length > 3) out.push(`Genres I score lowest: ${t.genres.slice(-2).reverse().map(g => `${g.name} (${f(g.avg)})`).join(', ')}.`);
    if (t.kindest && t.harshest) out.push(`What I rate highest: ${t.kindest.label} (${f(t.kindest.avg)}). What I’m toughest on: ${t.harshest.label} (${f(t.harshest.avg)}).`);
    if (t.values.length) out.push(`What I value most, among the optional bonus ratings: ${t.values.slice(0, 3).map(v => `${v.label} (${f(v.avg)})`).join(', ')}.`);
    if (t.favDecade) out.push(`My favourite decade: the ${t.favDecade.name} (${f(t.favDecade.avg)} average over ${t.favDecade.n} titles).`);
    if (t.movies.n && t.shows.n) out.push(`Movies average ${f(t.movies.avg)}, shows average ${f(t.shows.avg)}.`);
    return out;
  }

  return { compute, lines };
})();
