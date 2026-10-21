/* ══════════════════════════════════════════════════════════════
   export-formats.js — the Export Studio's text formats (MSSFormats):
     ai(list, o)          → Markdown for pasting into an AI chat: an editable
                            starter prompt, then your titles with scores,
                            ratings, highlights and notes (short or full),
                            and optionally your watchlist ("don't suggest these")
     csv(list, o)         → a spreadsheet: one row per title, a column for
                            every rating category used (Excel-friendly UTF-8)
     letterboxd(list, o)  → Letterboxd's import CSV: your watched movies with
                            tmdbID, Title, Year, Rating10, WatchedDate, Rewatch, Review
                            (letterboxd.com/about/importing-data)
     backup(data)         → everything as JSON: entries, lists, episode ratings
     save(name, text, type) / copy(text)
   o = { include, privacy: { hideSpoilers }, length: 'short' | 'full',
         prompt (text or ''), watchlist (entries to list as "already planned"), heading,
         taste (MSSTaste.compute — "My taste" on top; with no titles, the whole profile),
         year (MSSYear.compute — the year in review) }
   Requires config.js (liveScore, CAT_META), export.js (MSSPdf helpers), taste-profile.js (MSSTaste), year-review.js (MSSYear).
══════════════════════════════════════════════════════════════ */
const MSSFormats = (() => {
  const STATUS = { completed: 'Watched', ongoing: 'To be continued', queue: 'Watchlist', watching: 'Watching', up_next: 'Up next', paused: 'Paused' };
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie' || e.tmdb_type === 'movie';
  const yr = e => e.year ? String(e.year).slice(0, 4) : '';
  const sc = e => { const v = MSSPdf.score(e); return v == null ? null : v; };
  const day = d => d ? String(d).slice(0, 10) : '';
  const note = (e, o) => {
    if (!o.include?.notes) return '';
    const n = MSSPdf.text(e);
    return !n.note || (n.spoiler && o.privacy?.hideSpoilers) ? '' : n.note;
  };
  const rewatches = e => typeof getRewatchCount === 'function' ? getRewatchCount(e) : 1;

  /* ── For an AI ── */
  const DEFAULT_PROMPT = {
    watched: 'Here are movies and shows I’ve watched, with my scores out of 10 and what I thought of them. Based on my taste, recommend 10 titles I haven’t seen yet — a mix of movies and shows — and for each one, tell me in a sentence why it fits me. Don’t suggest anything listed below.',
    watchlist: 'This is my watchlist. Based on what’s on it, pick the 5 I should watch first and tell me why, then suggest 5 more I’d probably like that aren’t on it.',
    watching: 'These are the shows and movies I’m in the middle of. Help me decide which to finish first, and suggest what I could watch after each one.',
    year: 'Here’s my year in movies and shows. Give me a fun, short review of my year — what my taste says about me — then recommend 10 titles to start next year with, and say why each fits.',
    taste: 'Here’s a summary of my taste in movies and shows, worked out from how I score them. Recommend 10 titles that fit it — a mix of movies and shows — and for each one, tell me in a sentence why it fits me.',
    episodes: 'Here are my ratings for every episode I’ve rated of this show, season by season. Tell me what my ratings say about which parts of the show I loved and which I didn’t, then recommend 5 other shows I’d probably enjoy and say why each fits.',
    mixed: 'Here are some titles I picked from my library, with my scores out of 10 and what I thought. Based on these, recommend 10 titles I haven’t seen yet and tell me why each one fits me. Don’t suggest anything listed below.',
  };
  function aiLine(e, o) {
    const k = MSSPdf.kindOf(e), s = sc(e), bits = [CAT_META?.[e.cat]?.singular || (isMovie(e) ? 'Movie' : 'Show'), yr(e)].filter(Boolean).join(', ');
    const genres = (e.genres || []).slice(0, 3).join(', ');
    if (o.length === 'short') {
      const extra = [k === 'watched' ? (s != null ? `${s.toFixed(2)}/10` : 'not rated') : k === 'watching' ? MSSPdf.progress(e)?.label || 'watching' : 'on my watchlist',
        o.include?.highlights && k === 'watched' ? MSSPdf.chips(e).filter(c => !c.low).map(c => `${c.lbl}: ${c.v}`)[0] : ''].filter(Boolean).join(' · ');
      const n = note(e, o);
      return `- ${e.title} (${bits}${genres ? ` · ${genres}` : ''}) — ${extra}${n ? ` — “${n.replace(/\s+/g, ' ').slice(0, 140)}${n.length > 140 ? '…' : ''}”` : ''}`;
    }
    const out = [`### ${e.title} (${bits})`];
    if (genres) out.push(`Genres: ${genres}`);
    if (k === 'watched') out.push(`My score: ${s != null ? `${s.toFixed(2)}/10` : 'not rated'}${rewatches(e) > 1 ? ` · watched ${rewatches(e)} times` : ''}`);
    if (k === 'watching') { const p = MSSPdf.progress(e); out.push(`Status: watching${p?.label ? ` — ${p.label}` : ''}`); }
    if (k === 'watchlist') out.push('Status: on my watchlist');
    if (o.include?.breakdown && k === 'watched') { const b = MSSPdf.bars(e); if (b.length) out.push('Ratings: ' + b.map(r => `${r.label} ${r.v}`).join(' · ')); }
    if (o.include?.highlights && k === 'watched') { const c = MSSPdf.chips(e); if (c.length) out.push(c.map(x => `${x.lbl}: ${x.v}`).join(' · ')); }
    const n = note(e, o);
    if (n) out.push(`My note: “${n.replace(/\n{2,}/g, '\n').trim()}”`);
    return out.join('\n');
  }
  function ai(list, o) {
    const groups = [['watched', 'Watched'], ['watching', 'In the middle of'], ['watchlist', 'On my watchlist'], ['title', 'Other titles']];
    const parts = [];
    if (o.prompt && o.prompt.trim()) parts.push(o.prompt.trim(), '');
    const t = o.taste, yv = o.year;
    parts.push(`# ${o.heading || 'My titles'}`, yv ? `From MyScreenFolio · ${yv.titles} titles finished in ${yv.year} · scores are out of 10` : t && !list.length ? `From MyScreenFolio · based on ${t.rated} rated titles · scores are out of 10` : `From MyScreenFolio · ${list.length} ${list.length === 1 ? 'title' : 'titles'} · scores are out of 10`, '');
    if (yv) {   // the year in review
      parts.push(`## My ${yv.year}`, '', ...MSSYear.lines(yv).map(l => `- ${l}`), '');
      if (yv.top.length) parts.push(`### My top ${yv.top.length} of ${yv.year}`, '', ...yv.top.map((x, i) => `${i + 1}. ${x.e.title}${yr(x.e) ? ` (${yr(x.e)})` : ''} — ${x.s.toFixed(2)}/10`), '');
      parts.push('### Month by month', '', yv.months.map((n, i) => `${MSSYear.MONTHS[i]} ${n}`).join(' · '), '');
      parts.push(`First of the year: ${yv.first.title} · last: ${yv.last.title}`, '');
    }
    if (t) {   // the taste profile: a short summary on top of a list, or the whole thing on its own
      parts.push('## My taste', '', ...MSSTaste.lines(t).map(l => `- ${l}`), '');
      if (!list.length) {
        if (t.genres.length) parts.push('### Genres — my average score', '', ...t.genres.map(g => `- ${g.name}: ${g.avg.toFixed(2)} (${g.n} titles)`), '');
        if (t.categories.length) parts.push('### How I rate — my average in each category', '', ...t.categories.map(c => `- ${c.label}: ${c.avg.toFixed(2)}`), '');
        if (t.decades.length) parts.push('### Decades — my average score', '', ...t.decades.map(d => `- ${d.name}: ${d.avg.toFixed(2)} (${d.n} titles)`), '');
        if (t.top.length) parts.push('### My top 5', '', ...t.top.map((x, i) => `${i + 1}. ${x.e.title}${yr(x.e) ? ` (${yr(x.e)})` : ''} — ${x.s.toFixed(2)}/10`), '');
      }
    }
    const kinds = new Set(list.map(MSSPdf.kindOf));
    groups.forEach(([k, label]) => {
      const ls = list.filter(e => MSSPdf.kindOf(e) === k); if (!ls.length) return;
      if (kinds.size > 1) parts.push(`## ${label}`, '');
      ls.forEach(e => { parts.push(aiLine(e, o)); if (o.length !== 'short') parts.push(''); });
      if (o.length === 'short') parts.push('');
    });
    const wl = (o.watchlist || []).filter(e => !list.includes(e));
    if (wl.length) {
      parts.push('## Already on my watchlist — don’t suggest these', '');
      wl.forEach(e => parts.push(`- ${e.title}${yr(e) ? ` (${yr(e)})` : ''}`));
      parts.push('');
    }
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ── CSV ── */
  const cell = v => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;   // so a spreadsheet never runs it as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function csv(list, o) {
    const cats = [];
    list.forEach(e => MSSPdf.bars(e).forEach(r => { if (!cats.includes(r.label)) cats.push(r.label); }));
    const H = ['Title', 'Year', 'Type', 'Status', 'Score', ...cats, 'Fav character', 'Fav episode', 'Fav season', 'Least fav character', 'Least fav episode', 'Least fav season',
      'Genres', 'Watched on', 'Added on', 'Times watched', 'Season', 'Episode', 'Episodes watched', 'Total episodes', 'Note', 'TMDB ID', 'TMDB type'];
    const rows = list.map(e => {
      const s = sc(e), b = Object.fromEntries(MSSPdf.bars(e).map(r => [r.label, r.v]));
      const f = e.ratings?._favorites || {}, l = e.ratings?._lowlights || f._lowlights || {};
      return [e.title, yr(e), CAT_META?.[e.cat]?.singular || '', STATUS[e.status] || '', s != null ? s.toFixed(2) : '', ...cats.map(c => b[c] ?? ''),
        f.character, f.episode, f.season, l.character, l.episode, l.season, (e.genres || []).join(', '), day(e.completed_date), day(e.created_at),
        e.status ? rewatches(e) : '', e.season || '', e.episode || '', e.watched ?? '', e.total_eps ?? '', note(e, o), e.tmdb_id || '', e.tmdb_type || ''];
    });
    return '﻿' + [H, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  /* ── Letterboxd: watched movies only, in their import format ── */
  const lbCell = v => { if (v == null || v === '') return ''; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s; };
  const lbMovies = list => list.filter(e => isMovie(e) && MSSPdf.kindOf(e) === 'watched');
  function letterboxd(list, o) {
    const H = ['tmdbID', 'Title', 'Year', 'Rating10', 'WatchedDate', 'Rewatch', 'Review'];
    const rows = lbMovies(list).map(e => {
      const s = sc(e), r10 = s == null ? '' : Math.min(10, Math.max(1, Math.round(s)));
      const date = day(e.completed_date);
      const n = note(e, o);
      return [e.tmdb_type === 'movie' ? e.tmdb_id : '', e.title, yr(e), r10, date, date && rewatches(e) > 1 ? 'true' : '', n ? n.replace(/\r?\n/g, '<br>') : ''];
    });
    return [H, ...rows].map(r => r.map(lbCell).join(',')).join('\n') + '\n';
  }

  /* ── Full backup ── */
  function backup(d) {
    return JSON.stringify({ app: 'MyScreenFolio', kind: 'backup', version: 1, exported_at: new Date().toISOString(),
      profile: d.profile, entries: d.entries, lists: d.lists, episode_ratings: d.episodes }, null, 2);
  }

  function save(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); return ok;
  }

  return { ai, csv, letterboxd, lbMovies, backup, save, copy, DEFAULT_PROMPT };
})();
