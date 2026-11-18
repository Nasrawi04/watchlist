/* ══════════════════════════════════════════════════════════════
   export.js — the PDF engine (jsPDF) behind the Export Studio
   (export-studio.js). Same fonts and colours as the site: Oswald
   (titles, labels), Manrope (text), Bebas Neue (every number), the
   site's --bg / --card / --olive palette, dark or light. The fonts are
   the site's own, kept in fonts/ as TTF (jsPDF can't use web fonts) and
   fetched the first time something is exported.

   A cover block (wordmark, title, who, 4 stat tiles), then one card per
   title — rank and poster (10 titles or fewer) centred on the left,
   title + details, the score in an outlined box (like Create Card),
   rating bars, highlights, the note — category sections when grouped,
   and "avatar @username · MYSCREENFOLIO — Page x / y" on every page.

   MSSPdf.build(job, onProgress) → Promise<Blob>
     job = { kind: 'watched' | 'watchlist' | 'watching' | 'mixed', title, kicker,
             entries (already filtered + sorted), ranked, group, theme,
             include: { breakdown, highlights, notes, dates },
             privacy: { hideSpoilers, anon }, who: { name, username, avatar_url },
             byline (optional, replaces "by …" — a list's owner), desc (optional, under the title),
             detail (one title: the whole note + episodes), episodes ([{ season_number, episode_number, score }]),
             taste (MSSTaste.compute — the taste profile instead of title cards),
             year (MSSYear.compute — the year in review instead of title cards),
             ep (one show's episode ratings instead of title cards: { count, avg, best, bestSeason,
                 seasons: [{ n, avg, rows: [{ e, name, score, band, tags, note }] }] }),
             epChart (with ep: the chart picture as a JPEG data URL — page 1, full page) }
     'mixed' (hand-picked titles, lists): each card follows its own title — score for
     watched ones, progress for ones you're watching, the basics for the rest.
   MSSPdf.kindOf(e) → 'watched' | 'watchlist' | 'watching' | 'title' (not in a library)
     onProgress(fraction 0–1, label)
   MSSPdf.stats / posters / text / bars / chips / meta / progress / score — shared with the studio's preview

   Requires config.js (liveScore, getRatings, CAT_META, MSSRich,
   mssIsSpoiler, safeURL), rewatch.js (getRewatchCount), jsPDF.
══════════════════════════════════════════════════════════════ */
const MSSPdf = (() => {
  const POSTER_MAX = 100;   // ~15–25 KB a poster → a 100-title PDF stays around 2–3 MB, fine on phones
  // the site's colour tokens (css/theme.css), as RGB: page = --bg-app, card = --surface-card, track = --fill-subtle, text = --text-body /
  // --text-supporting / --text-muted, accent = --text-link (Forest), brass = --action-primary-bg (the wordmark's line), edge = --border-brand,
  // line = --border-default. Scores take their tier's colour (MSS_TIERS), never these.
  const PALETTE = {
    dark:  { dark: true, page: [4, 19, 10], card: [26, 46, 32], track: [38, 54, 43], text: [233, 228, 210], text2: [199, 196, 183], text3: [174, 171, 159],
             accent: [166, 204, 177], brass: [197, 161, 91], low: [230, 133, 126], edge: [72, 105, 82], line: [54, 71, 56] },
    light: { dark: false, page: [243, 238, 220], card: [254, 252, 243], track: [230, 224, 202], text: [30, 42, 34], text2: [58, 69, 62], text3: [82, 94, 86],
             accent: [36, 88, 58], brass: [122, 90, 34], low: [162, 52, 42], edge: [165, 182, 166], line: [224, 223, 211] },
  };
  const rgbOf = h => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  // gold / silver / bronze for 1–3 (the site's rank badges, .cg-rank-*), then the muted text
  const RANK_RGB = [[201, 162, 39], [125, 137, 147], [168, 98, 47]];
  const FONTS = [['Oswald-500.ttf', 'Oswald', 'normal'], ['Oswald-600.ttf', 'Oswald', 'bold'], ['Manrope-400.ttf', 'Manrope', 'normal'],
    ['Manrope-600.ttf', 'Manrope', 'bold'], ['BebasNeue-400.ttf', 'Bebas', 'normal']];
  const EP_MIN = { tv: 42, anime: 24, cartoons: 22 };
  let fontData = null;   // file → base64, fetched once

  // keep what the fonts can draw (Latin + common punctuation); other scripts are dropped
  const safe = s => String(s == null ? '' : s).replace(/[^\x00-ɏ -⁯€™]/g, '').replace(/\s+/g, ' ').trim();
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const score = e => { const s = typeof liveScore === 'function' ? liveScore(e) : null; return s == null ? null : Number(s); };
  const fmtDate = d => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const minutes = e => isMovie(e) ? (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0)
    : (Number(e.watched) || Number(e.total_eps) || 0) * (EP_MIN[e.cat] || 42);
  const posters = n => n > 0 && n <= POSTER_MAX;
  const num = v => v % 1 ? Number(v).toFixed(1) : String(v);

  function topGenre(entries) {
    const m = {};
    entries.forEach(e => (e.genres || []).forEach(g => { m[g] = (m[g] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  }
  function kindOf(e) {
    if (e.status === 'completed' || e.status === 'ongoing') return 'watched';
    if (e.status === 'queue') return 'watchlist';
    return ['watching', 'up_next', 'paused'].includes(e.status) ? 'watching' : 'title';
  }
  function stats(kind, entries) {
    if (kind === 'mixed') {
      const sc = entries.map(score).filter(v => v != null), mv = entries.filter(isMovie).length;
      return [{ value: entries.length, label: 'Titles' }, { value: sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2) : '—', label: 'Average score' },
        { value: mv, label: 'Movies' }, { value: entries.length - mv, label: 'Shows' }];
    }
    if (kind === 'watchlist') {
      const mv = entries.filter(isMovie).length;
      return [{ value: entries.length, label: 'Titles' }, { value: mv, label: 'Movies' }, { value: entries.length - mv, label: 'Shows' }, { value: topGenre(entries), label: 'Top genre', word: true }];
    }
    if (kind === 'watching') {
      const left = entries.reduce((s, e) => s + Math.max(0, (Number(e.total_eps) || 0) - (Number(e.watched) || 0)), 0);
      const pcts = entries.filter(e => Number(e.total_eps) > 0).map(e => Math.min(1, (Number(e.watched) || 0) / Number(e.total_eps)));
      return [{ value: entries.length, label: 'Titles' }, { value: left.toLocaleString('en-GB'), label: 'Episodes to go' },
        { value: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 100) + '%' : '—', label: 'Average progress' }, { value: topGenre(entries), label: 'Top genre', word: true }];
    }
    const sc = entries.map(score).filter(v => v != null);
    const hrs = Math.round(entries.reduce((s, e) => s + minutes(e), 0) / 60);
    return [{ value: entries.length, label: 'Titles' }, { value: sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2) : '—', label: 'Average score' },
      { value: hrs.toLocaleString('en-GB'), label: 'Hours watched' }, { value: topGenre(entries), label: 'Top genre', word: true }];
  }
  // one title: its own numbers instead of totals (epN: episodes rated, null = not known yet)
  function detailStats(one, epN) {
    return [{ value: score(one) != null ? score(one).toFixed(2) : '—', label: 'Score' },
      { value: bars(one).length, label: 'Categories rated' },
      isMovie(one) ? { value: one.runtime_h || one.runtime_m ? `${Number(one.runtime_h) || 0}h ${Number(one.runtime_m) || 0}m` : '—', label: 'Runtime' } : { value: epN == null ? '—' : epN, label: 'Episodes rated' },
      { value: one.completed_date ? new Date(one.completed_date + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—', label: 'Watched', word: true }];
  }
  // the year in review's tiles
  function yearStats(yv) {
    return [{ value: yv.titles, label: 'Titles finished' }, { value: yv.hours.toLocaleString('en-GB'), label: 'Hours watched' },
      { value: yv.avg != null ? yv.avg.toFixed(2) : '—', label: 'Average score' }, { value: yv.genres[0]?.name || '—', label: 'Top genre', word: true }];
  }
  // a show's episode ratings (ep: { count, avg, best: { s, e, score }, bestSeason: { n, avg } })
  function epStats(ep) {
    return [{ value: ep.count, label: 'Episodes rated' }, { value: ep.avg != null ? ep.avg.toFixed(2) : '—', label: 'Average score' },
      { value: ep.best ? `S${ep.best.s} · E${ep.best.e}` : '—', label: ep.best ? `Best episode · ${mssR1(ep.best.score)}` : 'Best episode', word: true },
      { value: ep.bestSeason ? `Season ${ep.bestSeason.n}` : '—', label: ep.bestSeason ? `Best season · ${ep.bestSeason.avg.toFixed(2)}` : 'Best season', word: true }];
  }
  // the taste profile's own tiles
  function tasteStats(t) {
    return [{ value: t.rated, label: 'Titles rated' }, { value: t.avg.toFixed(2), label: 'Average score' },
      { value: t.genres[0]?.name || '—', label: 'Top genre', word: true }, { value: t.favDecade?.name || '—', label: 'Favourite decade', word: true }];
  }
  function text(e) {
    const raw = e.notes && e.notes.trim() ? MSSRich.plain(e.notes) : '';
    return { note: raw.replace(/\n{3,}/g, '\n\n').trim(), spoiler: mssIsSpoiler(e) };
  }
  // a title's rated groups (config.js mssRatedGroups), and the same ratings as one flat list
  const groups = e => mssRatedGroups(e.ratings, e.cat, isMovie(e));
  const bars = e => groups(e).flatMap(g => g.items.map(x => ({ key: x.key, label: x.label, v: x.v })));
  const avgTxt = v => v.toFixed(2).replace(/0$/, '');
  function chips(e) {
    const f = e.ratings?._favorites || {}, l = e.ratings?._lowlights || f._lowlights || {}, mv = isMovie(e), out = [];
    const add = (lbl, v, low) => { if (v && String(v).trim()) out.push({ lbl, v: String(v).trim(), low }); };
    add('Fav character', f.character); if (!mv) { add('Fav episode', f.episode); add('Fav season', f.season); }
    add('Least fav character', l.character, 1); if (!mv) { add('Least fav episode', l.episode, 1); add('Least fav season', l.season, 1); }
    return out;
  }
  function meta(kind, e, inc) {
    const parts = [CAT_META?.[e.cat]?.singular || '', e.year ? String(e.year).slice(0, 4) : '', (e.genres || []).slice(0, 3).join(', ')];
    if (inc.dates) {
      if (kind === 'watched' && e.completed_date) parts.push('Watched ' + fmtDate(e.completed_date));
      if (kind === 'watchlist' && e.created_at) parts.push('Added ' + fmtDate(e.created_at));
    }
    const rw = typeof getRewatchCount === 'function' ? getRewatchCount(e) : 1;
    if (rw > 1) parts.push(`Watched ${rw} times`);
    return parts.filter(Boolean).join('  ·  ');
  }
  function progress(e) {
    const t = Number(e.total_eps) || 0, w = Number(e.watched) || 0;
    if (isMovie(e)) return null;
    const at = e.season && e.episode ? `Up to S${e.season} · E${e.episode}` : '';
    return { label: [at, t ? `${w} of ${t} episodes` : ''].filter(Boolean).join('  ·  '), pct: t ? Math.min(1, w / t) : 0 };
  }

  async function loadFonts() {
    if (fontData) return fontData;
    const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
    const out = {};
    await Promise.all(FONTS.map(async ([file]) => { const r = await fetch('fonts/' + file); if (!r.ok) throw new Error('font ' + file); out[file] = b64(await r.arrayBuffer()); }));
    return (fontData = out);
  }
  // an image → a small JPEG (posters) or a round PNG (the avatar); null if it can't be fetched
  function loadImage(url, round) {
    return new Promise(res => {
      if (!url) return res(null);
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 8000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const c = document.createElement('canvas'), g = c.getContext('2d');
          if (round) {
            c.width = c.height = 96; g.beginPath(); g.arc(48, 48, 48, 0, Math.PI * 2); g.clip();
            const s = Math.min(img.naturalWidth, img.naturalHeight);
            g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 96, 96);
            res(c.toDataURL('image/png'));
          } else { c.width = 200; c.height = 300; g.drawImage(img, 0, 0, 200, 300); res(c.toDataURL('image/jpeg', .82)); }
        } catch { res(null); }
      };
      // a copy the browser cached without CORS fails at once: ask once more past the cache (as Create Card does)
      img.onerror = () => { if (img.dataset.retry) { clearTimeout(t); return res(null); } img.dataset.retry = '1'; img.src = img.src + (img.src.includes('?') ? '&' : '?') + '_cb=' + Date.now(); };
      img.src = round ? url : String(url).replace(/\/(w\d+|original)\//, '/w185/');
    });
  }
  const tick = () => new Promise(r => setTimeout(r, 0));
  // an <img> for the canvas (CORS, once more past the cache when a cached copy fails)
  function loadEl(url) {
    return new Promise(res => {
      if (!url) return res(null);
      const im = new Image(); im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 9000);
      im.onload = () => { clearTimeout(t); res(im); };
      im.onerror = () => { if (im.dataset.retry) { clearTimeout(t); return res(null); } im.dataset.retry = '1'; im.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now(); };
      im.src = url;
    });
  }
  /* The cover band: the hero title's backdrop (its owner's choice and framing — MSSBackdrop, like the profile's Top Favorites #1),
     under the dark shade of .pf-fav, as one JPEG. No backdrop → its poster, blurred; nothing → the Forest gradient of the Studio's desk. */
  async function heroBand(e, wMM, hMM) {
    const cw = 1654, ch = Math.round(cw * hMM / wMM), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const bg = g.createRadialGradient(cw * 0.8, 0, 0, cw * 0.8, 0, cw);
    bg.addColorStop(0, '#2E6B45'); bg.addColorStop(0.45, '#1F4D33'); bg.addColorStop(1, '#0A2615');
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    let im = null, blur = false;
    if (e) {
      const bd = typeof MSSBackdrop !== 'undefined' ? await MSSBackdrop.url(e, 'w1280').catch(() => null) : null;
      im = await loadEl(bd);
      if (!im && e.poster_url) { im = await loadEl(String(safeURL(e.poster_url) || '').replace(/\/(w\d+|original)\//, '/w500/')); blur = !!im; }
    }
    if (im) {
      const p = (!blur && typeof MSSBackdrop !== 'undefined' && MSSBackdrop.pos(e, 'desk')) || { x: 50, y: 25, z: 1 };
      const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight) * (blur ? 1.25 : p.z || 1), iw = im.naturalWidth * s, ih = im.naturalHeight * s;
      g.save(); if (blur) g.filter = 'blur(28px) saturate(1.1)';
      g.drawImage(im, (cw - iw) * (blur ? 0.5 : p.x / 100), (ch - ih) * (blur ? 0.3 : p.y / 100), iw, ih); g.restore();
    }
    const v = g.createLinearGradient(0, ch, 0, 0);
    v.addColorStop(0, 'rgba(4,19,10,.96)'); v.addColorStop(0.42, 'rgba(4,19,10,.62)'); v.addColorStop(0.78, 'rgba(4,19,10,.28)'); v.addColorStop(1, 'rgba(4,19,10,.5)');
    g.fillStyle = v; g.fillRect(0, 0, cw, ch);
    const h = g.createLinearGradient(0, 0, cw * 0.75, 0); h.addColorStop(0, 'rgba(4,19,10,.7)'); h.addColorStop(1, 'rgba(4,19,10,0)');
    g.fillStyle = h; g.fillRect(0, 0, cw, ch);
    return cv.toDataURL('image/jpeg', 0.86);
  }
  // the site's rank badges (.cg-rank-1 / -2 / -3 / -other): fill, number
  const RANK_TAB = [[[214, 171, 74], [58, 40, 0]], [[214, 218, 220], [29, 40, 48]], [[196, 128, 74], [255, 248, 240]]];
  const RANK_OTHER = [[46, 107, 69], [255, 255, 255]];

  async function build(job, onProgress = () => {}) {
    const P = PALETTE[job.theme === 'light' ? 'light' : 'dark'], inc = job.include || {}, priv = job.privacy || {};
    // the 9-tier scale (config.js mssScoreTier): a score's number (tInk) and its bar / fill (tFill); the dark page gets the dark values
    const tier = v => v == null || isNaN(v) || typeof mssScoreTier !== 'function' ? null : mssScoreTier(Number(v), { dark: P.dark });
    const tInk = (v, fb = P.accent) => { const t = tier(v); if (!t) return fb; const c = rgbOf(t.ink); return P.dark && (t.key === 'garbage' || t.key === 'bad') ? c.map(x => Math.round(x + (255 - x) * 0.4)) : c; };
    const tFill = (v, fb = P.accent) => { const t = tier(v); return t ? rgbOf(t.gold ? '#C9A227' : t.bg) : fb; };
    const rankInk = k => RANK_RGB[k] || P.text3;
    const list = job.entries || [], withPosters = posters(list.length);
    onProgress(0.02, 'Getting the fonts…');
    const fonts = await loadFonts();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    FONTS.forEach(([file, fam, style]) => { pdf.addFileToVFS(file, fonts[file]); pdf.addFont(file, fam, style); });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14, CW = W - M * 2, BOTTOM = H - 17;
    const fill = c => pdf.setFillColor(...c), ink = c => pdf.setTextColor(...c), stroke = (c, w) => { pdf.setDrawColor(...c); pdf.setLineWidth(w); };
    // the site's score ring (MSSViews.ring): a track, the arc to score / 10 in its tier's colour, the number in Bebas
    const ringAt = (cx, cy, r, v, fs) => {
      const f = Math.max(0, Math.min(1, v / 10)), lw = r * 0.2;
      stroke(P.track, lw); pdf.circle(cx, cy, r, 'S');
      if (f > 0) {
        const n = Math.max(6, Math.round(64 * f)), a0 = -Math.PI / 2, pts = [];
        for (let k = 0; k <= n; k++) { const a = a0 + Math.PI * 2 * f * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        stroke(tFill(v), lw); pdf.setLineCap('round');
        pdf.lines(pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]]), pts[0][0], pts[0][1], [1, 1], 'S', false);
        pdf.setLineCap('butt');
      }
      font('Bebas', fs); ink(tInk(v)); pdf.text(Number(v).toFixed(2), cx, cy + fs * 0.125, { align: 'center' });
    };
    const font = (fam, size, style = 'normal') => { pdf.setFont(fam, style); pdf.setFontSize(size); };
    const lh = size => size * 0.3528 * 1.32;
    const spaced = (s, x, yy, sp, opt) => { pdf.setCharSpace(sp); pdf.text(s, x, yy, opt); pdf.setCharSpace(0); };
    const clip = (s, w) => { s = safe(s); if (pdf.getTextWidth(s) <= w) return s; while (s.length > 1 && pdf.getTextWidth(s + '…') > w) s = s.slice(0, -1); return s.trimEnd() + '…'; };
    // the wordmark: MY SCREEN FOLIO, SCREEN in Forest with the Brass line under it
    const wordmark = (x, yy, size, c1, c2) => {
      font('Oswald', size, 'bold');
      [['MY', c1], ['SCREEN', c2], ['FOLIO', c1]].forEach(([t, c]) => {
        ink(c); spaced(t, x, yy, size * 0.048); const w = pdf.getTextWidth(t) + size * 0.048 * t.length;
        if (t === 'SCREEN') { stroke(P.brass, size * 0.055); pdf.line(x, yy + size * 0.15, x + w - size * 0.048, yy + size * 0.15); }
        x += w;
      });
      return x;
    };
    // every page: the page colour; from page 2 a running header (the wordmark · the title)
    const TOP = 22;
    const page = (first) => {
      fill(P.page); pdf.rect(0, 0, W, H, 'F');
      if (first) return;
      wordmark(M, 11, 7.6, P.text2, P.accent);
      font('Oswald', 7.6, 'bold'); ink(P.text3); spaced(clip(safe(job.title).toUpperCase(), CW - 50), W - M, 11, 0.4, { align: 'right' });
      stroke(P.line, 0.25); pdf.line(M, 14.2, W - M, 14.2);
    };
    // a section's heading: the Brass dot, the label in Oswald caps
    const dotLabel = (label, x, yy, size = 9) => { fill(P.brass); pdf.circle(x + 1, yy - size * 0.13, 0.95, 'F'); font('Oswald', size, 'bold'); ink(P.accent); spaced(label, x + 3.6, yy, 0.8); return 3.6 + pdf.getTextWidth(label) + 0.8 * label.length; };
    // the rank badge on a poster's top-left corner (only its bottom-right corner rounded, like the site's)
    const rankTab = (px, py, n, s) => {
      const [bgc, fg] = RANK_TAB[n - 1] || RANK_OTHER;
      font('Bebas', s * 2.6); const w = Math.max(s, pdf.getTextWidth(String(n)) + s * 0.55);
      fill(bgc); pdf.roundedRect(px, py, w, s, s * 0.32, s * 0.32, 'F'); pdf.rect(px, py, w, s / 2, 'F'); pdf.rect(px, py, w / 2, s, 'F');
      ink(fg); pdf.text(String(n), px + w / 2, py + s * 0.78, { align: 'center' });
    };
    let y;

    const img = {};
    if (withPosters) {   // 6 at a time
      let done = 0;
      for (let i = 0; i < list.length; i += 6) {
        await Promise.all(list.slice(i, i + 6).map(async e => { img[e.id] = await loadImage(e.poster_url); done++; }));
        onProgress(0.05 + done / list.length * 0.35, `Getting posters… ${done} of ${list.length}`);
      }
    }
    const avatar = !priv.anon && job.who?.avatar_url ? await loadImage(safeURL(job.who.avatar_url), true) : null;

    /* ── cover block ── (a show's episode ratings: page 1 is its chart, the same picture as the
       Episodes page's export, then the episodes start on a fresh page under a small heading) */
    if (job.epChart) {
      page(true);
      pdf.addImage(job.epChart, 'JPEG', 0, 0, W, H);
      pdf.addPage(); page();
      y = TOP + 6;
      dotLabel(safe(job.kicker).toUpperCase(), M, y, 8.5);
      font('Oswald', 20, 'bold'); ink(P.text); pdf.text(clip(safe(job.title), CW), M, y + 10);
      font('Manrope', 8.5); ink(P.text3); pdf.text(`Every episode you rated · ${job.ep.count} in all`, M, y + 16.5);
      y += 24;
    } else {
      /* the cover: a full-bleed band with the hero title's backdrop (your #1, the title itself, your taste's / year's best, the show),
         the wordmark and date on it, the kicker, title and byline along its bottom; the stat tiles sit across its lower edge */
      page(true);
      const heroE = job.ep ? job.ep.show : job.taste ? job.taste.top?.[0]?.e : job.year ? job.year.top?.[0]?.e
        : job.ranked || job.detail ? list[0] : list.slice().sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1))[0];
      const by = job.byline || (!priv.anon && job.who && (job.who.name || job.who.username)
        ? `by ${job.who.name || job.who.username}${job.who.username && job.who.name && job.who.name !== job.who.username ? ` (@${job.who.username})` : ''}` : '');
      font('Oswald', 30, 'bold');
      const tl = pdf.splitTextToSize(safe(job.title) || 'My export', CW).slice(0, 2);
      const HB = 92 + (tl.length - 1) * lh(30);
      onProgress(0.03, 'Setting the cover…');
      try { pdf.addImage(await heroBand(heroE, W, HB), 'JPEG', 0, 0, W, HB); } catch (err) { fill([10, 38, 21]); pdf.rect(0, 0, W, HB, 'F'); }
      const IV = [243, 238, 220], IV2 = [214, 210, 196], MINT = [199, 227, 207];
      wordmark(M, 15, 10.5, IV, MINT);
      font('Manrope', 8); ink(IV2); pdf.text(fmtDate(new Date().toISOString()), W - M, 15, { align: 'right' });
      if (heroE && !job.detail && !job.ep) { font('Manrope', 7, 'bold'); ink(IV2); pdf.text(clip(`Cover: ${safe(heroE.title)}`, 70), W - M, 20, { align: 'right' }); }
      let ty = HB - 23 - (by ? 6 : 0) - (tl.length - 1) * lh(30);
      fill(P.brass); pdf.circle(M + 1, ty - 9.4, 0.95, 'F');
      font('Oswald', 8.5, 'bold'); ink(MINT); spaced(safe(job.kicker).toUpperCase(), M + 3.6, ty - 8.3, 0.9);
      font('Oswald', 30, 'bold'); ink(IV); pdf.text(tl, M, ty + 2);
      ty += 2 + (tl.length - 1) * lh(30);
      if (by) { font('Manrope', 10, 'bold'); ink(IV2); pdf.text(safe(by), M, ty + 7); }
      y = HB - 11;
      const epN = (job.episodes || []).filter(r => Number(r.episode_number) > 0 && r.score != null).length;
      const st = job.ep ? epStats(job.ep) : job.year ? yearStats(job.year) : job.taste ? tasteStats(job.taste) : job.detail && list[0] ? detailStats(list[0], epN) : stats(job.kind, list), tw = (CW - 3 * 4) / 4;
      st.forEach((s, i) => {
        const tx = M + i * (tw + 4);
        fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx, y, tw, 21, 2.5, 2.5, 'FD');
        fill(i ? P.track : P.brass); pdf.rect(tx + 4, y + 2.6, 6, 0.7, 'F');   // a short rule on top: Brass on the first, then quiet
        if (s.word) { font('Oswald', 13, 'bold'); ink(P.accent); pdf.text(clip(s.value, tw - 8), tx + 4, y + 10.4); }
        else { font('Bebas', 22); ink(/score/i.test(s.label) && !isNaN(parseFloat(s.value)) ? tInk(parseFloat(s.value)) : P.accent); pdf.text(clip(s.value, tw - 8), tx + 4, y + 11.2); }
        font('Oswald', 6.8, 'bold'); ink(P.text3); spaced(s.label.toUpperCase(), tx + 4, y + 17, 0.45);
      });
      y += 29;
      if (job.desc) {   // a list's description, the year's comparison: under the tiles
        font('Manrope', 9.5); ink(P.text2);
        const dl = pdf.splitTextToSize(safe(job.desc), CW).slice(0, 3);
        pdf.text(dl, M, y - 1); y += (dl.length) * lh(9.5) + 3;
      }
    }

    /* ── one card per title: measure (draw = null), then draw at the measured height ── */
    const PAD = 5, RANK = job.ranked && !withPosters ? 10 : 0, PW = withPosters ? (inc.breakdown || inc.highlights ? 22 : 17) : 0, PH = PW * 1.5, BOXH = 19;   // with posters the rank is a badge on the poster
    function card(e, rank, draw) {
      const ek = job.kind === 'mixed' ? kindOf(e) : job.kind, BOX = ek === 'watched' ? 20 : 0;
      const x0 = M, tx = x0 + PAD + RANK + (PW ? PW + 6 : 0), right = x0 + CW - PAD - (BOX ? BOX + 4 : 0), w = right - tx;
      let cy = y + PAD;
      font('Oswald', 13, 'bold');
      const tLines = pdf.splitTextToSize(safe(e.title) || 'Untitled', w).slice(0, 2);
      if (draw) {
        const mid = y + draw.h / 2;
        fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(x0, y, CW, draw.h, 3, 3, 'FD');
        const sv = ek === 'watched' ? score(e) : null;
        if (sv != null) { fill(tFill(sv)); pdf.roundedRect(x0 + 0.15, y + 4, 1.3, draw.h - 8, 0.65, 0.65, 'F'); }   // the tier's colour along the card's edge
        if (RANK) { font('Bebas', rank < 3 ? 20 : 16); ink(rankInk(rank)); pdf.text(String(rank + 1), x0 + PAD + (RANK - 2) / 2, mid + (rank < 3 ? 2.6 : 2.1), { align: 'center' }); }
        if (PW) {   // the poster sits in the middle of the card, on the left
          const px = x0 + PAD + RANK + 1, py = draw.h > PH + PAD * 2 + 3 ? y + PAD : mid - PH / 2;   // a tall card: the poster at the top, beside the title
          if (img[e.id]) { pdf.addImage(img[e.id], 'JPEG', px, py, PW, PH); stroke(P.edge, 0.2); pdf.rect(px, py, PW, PH, 'S'); }
          else { fill(P.track); pdf.roundedRect(px, py, PW, PH, 1.5, 1.5, 'F'); font('Oswald', 14, 'bold'); ink(P.text3); pdf.text(safe(e.title || '?')[0] || '?', px + PW / 2, py + PH / 2 + 2.4, { align: 'center' }); }
          if (job.ranked) rankTab(px, py, rank + 1, 5.6);
        }
        font('Oswald', 13, 'bold'); ink(P.text); pdf.text(tLines, tx, cy + 4.6);
      }
      cy += 4.6 + (tLines.length - 1) * lh(13) + 1.6;
      font('Manrope', 7.6); const m = clip(meta(ek, e, inc), w);
      if (draw) { ink(P.text2); pdf.text(m, tx, cy + 3); }
      cy += 5;
      if (ek === 'watching') {
        const pr = progress(e);
        if (pr) {
          if (draw) {
            font('Manrope', 7.6, 'bold'); ink(P.accent); pdf.text(safe(pr.label), tx, cy + 3);
            fill(P.track); pdf.roundedRect(tx, cy + 5, w, 2, 1, 1, 'F');
            if (pr.pct > 0) { fill(P.accent); pdf.roundedRect(tx, cy + 5, Math.max(2, w * pr.pct), 2, 1, 1, 'F'); }
          }
          cy += 9;
        }
      }
      // the score: the site's ring, in its tier's colour
      if (BOX && draw) {
        const s = score(e), bx = x0 + CW - PAD - BOX, by = y + PAD;
        if (s == null) { stroke(P.track, 1.7); pdf.circle(bx + BOX / 2, by + BOXH / 2, 8, 'S'); font('Manrope', 6.8, 'bold'); ink(P.text3); pdf.text('Unrated', bx + BOX / 2, by + BOXH / 2 + 1.1, { align: 'center' }); }
        else ringAt(bx + BOX / 2, by + BOXH / 2, 8, s, 17);
      }
      // rating bars, highlights and the note: in the text column, under the score box
      const bx0 = tx, bw = x0 + CW - PAD - bx0, n0 = inc.notes ? text(e) : { note: '' };
      if (BOX && ((inc.breakdown && bars(e).length) || (inc.highlights && chips(e).length) || n0.note)) cy = Math.max(cy, y + PAD + BOXH + 1.5);
      // each rated group: its name and average, then its ratings as bars, 3 to a row
      if (inc.breakdown && ek === 'watched') {
        const gs = groups(e);
        if (gs.length) cy += 1;
        gs.forEach((g, gi) => {
          const cols = 3, gap = 5, colW = (bw - gap * (cols - 1)) / cols, rowH = 5.8;
          if (gi && g.kind === 'bonus' && gs[gi - 1].kind === 'core') {
            if (draw) { font('Oswald', 5.6, 'bold'); ink(P.text3); spaced('BONUS', bx0, cy + 3, 0.4); }
            cy += 4.4;
          }
          if (draw) {
            const gn = safe(g.name).toUpperCase();
            font('Oswald', 6.2, 'bold'); ink(P.text); spaced(gn, bx0, cy + 3, 0.3);
            const gw = pdf.getTextWidth(gn) + 0.3 * gn.length;
            font('Bebas', 10); ink(tInk(g.avg)); pdf.text(avgTxt(g.avg), bx0 + gw + 2.2, cy + 3.3);
          }
          cy += 4.4;
          if (draw) g.items.forEach((r, k) => {
            const cx = bx0 + (k % cols) * (colW + gap), ry = cy + Math.floor(k / cols) * rowH;
            font('Manrope', 6.4); ink(P.text2); pdf.text(clip(r.label, colW - 8), cx, ry + 2.3);
            font('Bebas', 9); ink(P.text); pdf.text(num(r.v), cx + colW, ry + 2.5, { align: 'right' });
            fill(P.track); pdf.roundedRect(cx, ry + 3.5, colW, 1.2, 0.6, 0.6, 'F');
            fill(tFill(r.v)); pdf.roundedRect(cx, ry + 3.5, Math.max(1.2, colW * Math.min(1, r.v / 10)), 1.2, 0.6, 0.6, 'F');
          });
          cy += Math.ceil(g.items.length / cols) * rowH + 1.2;
        });
      }
      // highlights: outlined, with a coloured bar at the start (Create Card's favourites box)
      if (inc.highlights && ek === 'watched') {
        const c = chips(e);
        if (c.length) {
          cy += 2; let cx = bx0; const ch = 6;
          c.forEach(k => {
            font('Oswald', 6.2, 'bold'); const lt = safe(k.lbl).toUpperCase(), lw = pdf.getTextWidth(lt) + 0.3 * lt.length + 2;
            font('Manrope', 7.4, 'bold'); const vt = clip(k.v, 60), cw = 4 + lw + pdf.getTextWidth(vt) + 3;
            if (cx + cw > bx0 + bw) { cx = bx0; cy += ch + 1.8; }
            if (draw) {
              stroke(P.edge, 0.3); pdf.roundedRect(cx, cy, cw, ch, 1.4, 1.4, 'S');
              fill(k.low ? P.low : P.accent); pdf.rect(cx + 1.6, cy + 1.3, 0.7, ch - 2.6, 'F');
              font('Oswald', 6.2, 'bold'); ink(P.text3); spaced(lt, cx + 4, cy + 4, 0.3);
              font('Manrope', 7.4, 'bold'); ink(P.text); pdf.text(vt, cx + 4 + lw, cy + 4.1);
            }
            cx += cw + 2;
          });
          cy += ch + 1;
        }
      }
      if (n0.note) {
        cy += 2.5;
        if (n0.spoiler && priv.hideSpoilers) {
          font('Manrope', 7.6); if (draw) { ink(P.text3); pdf.text('Note hidden — it has spoilers.', bx0 + 3, cy + 3); } cy += 4.5;
        } else {
          font('Manrope', 8);
          let lines = pdf.splitTextToSize(safe(n0.note.replace(/\n+/g, ' ')), bw - 4);
          const cap = job.detail ? 40 : 6;   // one title: the whole note (within reason)
          if (lines.length > cap) { lines = lines.slice(0, cap); lines[cap - 1] = lines[cap - 1].replace(/\s*\S*$/, '') + '…'; }
          const nh = lines.length * lh(8);
          if (draw) { fill(P.accent); pdf.rect(bx0, cy, 0.8, nh + 0.6, 'F'); ink(P.text2); pdf.text(lines, bx0 + 3, cy + 2.9); }
          cy += nh + 1;
        }
      }
      return Math.max(cy + PAD - y, BOX ? BOXH + PAD * 2 : 0, PW ? PH + PAD * 2 : 0);
    }
    const pageBreak = h => { if (y + h > BOTTOM) { pdf.addPage(); page(); y = TOP; } };
    let lastCat = null, rank = 0;   // grouped: each category ranks from 1
    for (let i = 0; i < (job.taste || job.year ? 0 : list.length); i++) {
      const e = list[i];
      if (job.group && e.cat !== lastCat) {
        lastCat = e.cat; rank = 0;
        pageBreak(12 + 30);
        const label = (CAT_META?.[e.cat]?.label || 'Other').toUpperCase();
        const lw = dotLabel(label, M, y + 5);
        font('Bebas', 11); ink(P.text3); pdf.text(String(list.filter(x => x.cat === e.cat).length), M + lw + 3, y + 5.3);
        stroke(P.line, 0.25); pdf.line(M, y + 8, M + CW, y + 8);
        y += 12;
      }
      const h = card(e, rank, null);
      pageBreak(h);
      card(e, rank++, { h });
      y += h + 3.5;
      if (i % 6 === 5) { onProgress((withPosters ? 0.4 : 0.05) + (i + 1) / list.length * (withPosters ? 0.55 : 0.9), `Building your PDF… ${i + 1} of ${list.length}`); await tick(); }
    }

    /* ── taste profile (taste-profile.js): bars, the score spread, decades, top 5 ── */
    // section heading + bar rows — shared by the taste profile and the year in review
    const head = (label, sub, need = 20) => {   // need: room for the heading and what follows it, so it never sits alone
      pageBreak(need);
      const lw = dotLabel(label, M, y + 5);
      if (sub) { font('Manrope', 7.6); ink(P.text3); pdf.text(sub, M + lw + 3, y + 5); }
      stroke(P.line, 0.25); pdf.line(M, y + 8, M + CW, y + 8);
      y += 12;
    };
    // one bar per row: label · bar (avg out of 10, or n out of the most) · value · how many titles · an optional tag
    const barRows = (rows, tag, counts, unit = 'title') => {
      const mx = Math.max(1, ...rows.map(x => x.n));
      font('Manrope', 8.4, 'bold');   // the label column fits the longest label (rating group names run long), up to 80mm
      const lw = Math.min(80, Math.max(46, ...rows.map(x => pdf.getTextWidth(safe(x.label || x.name)) + 4)));
      rows.forEach((r2, k) => {
      pageBreak(8);
      const lx = M, bx = M + lw, bw = CW - lw - 58, f = counts ? r2.n / mx : r2.avg / 10;
      font('Manrope', 8.4, 'bold'); ink(P.text); pdf.text(clip(r2.label || r2.name, lw - 2), lx, y + 4.2);
      fill(P.track); pdf.roundedRect(bx, y + 1.6, bw, 3.2, 1.6, 1.6, 'F');
      fill(counts ? P.accent : tFill(r2.avg)); pdf.roundedRect(bx, y + 1.6, Math.max(3.2, bw * Math.min(1, f)), 3.2, 1.6, 1.6, 'F');
      font('Bebas', 12); ink(counts ? P.accent : tInk(r2.avg)); pdf.text(counts ? String(r2.n) : r2.avg.toFixed(2), bx + bw + 3, y + 4.6);
      if (!counts) { font('Manrope', 7); ink(P.text3); pdf.text(`${r2.n} ${r2.n === 1 ? unit : unit + 's'}`, bx + bw + 16, y + 4.4); }
      const tg = tag && tag(r2, k);
      if (tg) { font('Oswald', 5.8, 'bold'); const tw2 = pdf.getTextWidth(tg) + 0.3 * tg.length + 4;
        stroke(P.edge, 0.3); pdf.roundedRect(M + CW - tw2, y + 0.6, tw2, 5, 1.2, 1.2, 'S'); ink(P.accent); spaced(tg, M + CW - tw2 + 2, y + 4, 0.3); }
      y += 7.2;
    }); };
    // a numbered top 5: rank · title + details · score
    const top5 = list5 => list5.forEach((x, k) => {
      pageBreak(13);
      font('Bebas', 14); ink(rankInk(k)); pdf.text(String(k + 1), M + 2, y + 5.4);
      font('Oswald', 10.5, 'bold'); ink(P.text); pdf.text(clip(x.e.title || 'Untitled', CW - 40), M + 10, y + 5);
      font('Manrope', 7.4); ink(P.text3); pdf.text(safe([CAT_META?.[x.e.cat]?.singular, x.e.year ? String(x.e.year).slice(0, 4) : ''].filter(Boolean).join(' · ')), M + 10, y + 9.2);
      ringAt(M + CW - 5.2, y + 5, 4.4, x.s, 9.5);
      if (k < list5.length - 1) { stroke(P.line, 0.2); pdf.line(M + 10, y + 11.6, M + CW - 14, y + 11.6); }
      y += 13;
    });
    // 12 / 10 columns: a little bar chart with labels under it
    const columns = (vals, labels, chH = 26, scored = false) => {   // scored: column k is the score k + 1, in its tier's colour
      const mx = Math.max(...vals, 1), n = vals.length, colW = (CW - (n - 1) * 3) / n;
      vals.forEach((c, k) => {
        const cx = M + k * (colW + 3), h = c ? Math.max(3, chH * c / mx) : 0;   // never thinner than its rounded corners
        fill(P.track); pdf.roundedRect(cx, y, colW, chH, 1.5, 1.5, 'F');
        if (h) { fill(scored ? tFill(k + 1) : P.accent); pdf.roundedRect(cx, y + chH - h, colW, h, 1.5, 1.5, 'F'); }
        const above = y + chH - h - 1.5 > y + 3;   // no room above a full bar → the count goes inside it, in the page colour
        font('Bebas', 10); ink(!c ? P.text3 : above ? P.text : P.page); pdf.text(String(c), cx + colW / 2, above ? y + chH - h - 1.5 : y + 4.5, { align: 'center' });
        if (labels[k].length > 2) font('Oswald', 7, 'bold'); else font('Bebas', 12); ink(P.text2); pdf.text(labels[k], cx + colW / 2, y + chH + 5.5, { align: 'center' });
      });
      y += chH + 12;
    };
    if (job.taste) {
      const t = job.taste;
      if (t.genres.length) { head('GENRES', 'your average score in each (2+ titles)', 28); barRows(t.genres.slice(0, 10)); y += 4; }
      if (t.categories.length) {
        head('HOW YOU RATE', 'your average in each rating group', 28);
        barRows(t.categories, (c, k) => k === 0 ? 'KINDEST' : k === t.categories.length - 1 && t.categories.length > 1 ? 'TOUGHEST' : '');
        y += 4;
      }
      if (t.values.length) { head('WHAT YOU VALUE MOST', 'bonus ratings, from the titles where you rated them', 28); barRows(t.values); y += 4; }
      // the score spread: one column per score, 1 → 10
      head('SCORE SPREAD', `${t.rated} titles · you’re a ${t.generous} scorer`, 58);
      columns(t.spread, t.spread.map((_, k) => String(k + 1)), 26, true);
      if (t.decades.length) { head('DECADES', 'your average by release decade', 28); barRows(t.decades, d => t.favDecade && d.name === t.favDecade.name ? 'FAVOURITE' : ''); y += 4; }
      // movies vs shows, then the top 5
      if (t.movies.n && t.shows.n) {
        head('MOVIES VS SHOWS', '', 38);
        [['Movies', t.movies], ['Shows', t.shows]].forEach(([l, v], k) => {
          const tx2 = M + k * (CW / 2 + 2), tw2 = CW / 2 - 2;
          fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx2, y, tw2, 18, 2.5, 2.5, 'FD');
          font('Bebas', 22); ink(tInk(v.avg)); pdf.text(v.avg.toFixed(2), tx2 + 5, y + 11.5);
          font('Oswald', 6.8, 'bold'); ink(P.text3); spaced(`${l.toUpperCase()} · ${v.n} RATED`, tx2 + 5, y + 15.4, 0.45);
        });
        y += 24;
      }
      if (t.top.length) { head('YOUR TOP 5', '', 30); top5(t.top); }
    }

    /* ── year in review (year-review.js): month by month, top 5, first & last, genres, highlights ── */
    if (job.year) {
      const yr = job.year;
      head('MONTH BY MONTH', `busiest: ${MSSYear.MONTHS[yr.busiest.m]} · ${yr.busiest.n} titles`, 58);
      columns(yr.months, MSSYear.MONTHS.map(m => m.toUpperCase()));
      if (yr.top.length) { head(`YOUR TOP ${yr.top.length} OF ${yr.year}`, '', 30); top5(yr.top); y += 3; }
      head('FIRST & LAST', `of ${yr.year}`, 34);
      [['FIRST', yr.first], ['LAST', yr.last]].forEach(([l, e], k) => {
        const tx2 = M + k * (CW / 2 + 2), tw2 = CW / 2 - 2;
        fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx2, y, tw2, 20, 2.5, 2.5, 'FD');
        font('Oswald', 6.8, 'bold'); ink(P.text3); spaced(`${l} · ${fmtDate(e.completed_date).toUpperCase()}`, tx2 + 5, y + 6.5, 0.45);
        font('Oswald', 12, 'bold'); ink(P.text); pdf.text(clip(e.title || 'Untitled', tw2 - 10), tx2 + 5, y + 14.5);
      });
      y += 27;
      if (yr.genres.length) { head('MOST WATCHED GENRES', 'titles finished', 28); barRows(yr.genres.slice(0, 8), null, true); y += 4; }
      const hl = [[yr.episodes, 'Episodes'], [yr.notes, 'Notes written'], [yr.medals.length, 'Medals earned'], [yr.rewatch ? yr.rewatch.n : 0, yr.rewatch ? `Rewatches · ${safe(yr.rewatch.e.title).slice(0, 18)}` : 'Rewatches']];
      head('HIGHLIGHTS', '', 34);
      const tw3 = (CW - 3 * 4) / 4;
      hl.forEach(([v, l], k) => {
        const tx2 = M + k * (tw3 + 4);
        fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx2, y, tw3, 21, 2.5, 2.5, 'FD');
        font('Bebas', 22); ink(P.accent); pdf.text(String(v), tx2 + 4, y + 11.2);
        font('Oswald', 6.4, 'bold'); ink(P.text3); spaced(clip(l, tw3 - 8).toUpperCase(), tx2 + 4, y + 17, 0.4);
      });
      y += 28;
      if (yr.topEp) {
        head('BEST EPISODE YOU RATED', '', 24);
        font('Oswald', 12, 'bold'); ink(P.text); pdf.text(clip(`${yr.topEp.title}  ·  S${yr.topEp.season} E${yr.topEp.episode}`, CW - 20), M, y + 5);
        font('Bebas', 16); ink(tInk(yr.topEp.score)); pdf.text(num(yr.topEp.score), M + CW, y + 5.4, { align: 'right' });
        y += 12;
      }
    }

    /* ── a show's episode ratings (the studio's "Episode ratings"): seasons at a glance,
       then every rated episode — number, name, tags, the band and score, the note ── */
    if (job.ep) {
      const ep = job.ep;
      if (ep.seasons.length > 1) { head('SEASONS', 'your average in each season', 26); barRows(ep.seasons.map(sn => ({ name: `Season ${sn.n}`, avg: sn.avg, n: sn.rows.length })), null, false, 'episode'); y += 4; }
      ep.seasons.forEach((sn, si) => {
        head(`SEASON ${sn.n}`, `${sn.rows.length} rated · average ${sn.avg.toFixed(2)}`, 26);
        sn.rows.forEach(r => {
          const note = inc.notes !== false && r.note ? safe(r.note) : '';
          font('Manrope', 7.6); const nl = note ? pdf.splitTextToSize(note, CW - 34) : [];
          const tags = (r.tags || []).join('  ·  ');
          const h = 9 + (tags ? 3.6 : 0) + (nl.length ? nl.length * 3.4 + 1.5 : 0);
          pageBreak(h + 2);
          font('Bebas', 13); ink(P.text3); pdf.text(`E${r.e}`, M, y + 5.6);
          font('Oswald', 9.6, 'bold'); ink(P.text); pdf.text(clip(safe(r.name) || `Episode ${r.e}`, CW - 46), M + 13, y + 5.2);
          let ty = y + 5.2;
          if (tags) { ty += 3.6; font('Manrope', 6.8); ink(P.accent); pdf.text(clip(safe(tags), CW - 46), M + 13, ty); }
          if (nl.length) { ty += 3.6; font('Manrope', 7.6); ink(P.text2); pdf.text(nl, M + 13, ty); }
          font('Bebas', 15); ink(tInk(r.score)); pdf.text(r.score >= 10 ? '10' : mssR1(r.score), M + CW, y + 5.8, { align: 'right' });
          if (r.band) { font('Oswald', 5.6, 'bold'); ink(P.text3); spaced(r.band.toUpperCase(), M + CW - 22 - 0.3 * r.band.length - pdf.getTextWidth(r.band.toUpperCase()), y + 5.4, 0.3); }
          y += h;
          stroke(P.line, 0.2); pdf.line(M + 13, y, M + CW, y);
          y += 2;
        });
        y += 4;
        if (si % 2 === 1) onProgress(0.2 + (si + 1) / ep.seasons.length * 0.75, `Building your PDF… season ${si + 1} of ${ep.seasons.length}`);
      });
    }

    /* ── one title: its episode ratings, season by season ── */
    const eps = (job.episodes || []).filter(r => Number(r.episode_number) > 0 && r.score != null);
    if (job.detail && eps.length) {
      const bySeason = {};
      eps.forEach(r => { (bySeason[r.season_number] ||= []).push(r); });
      pageBreak(24);
      dotLabel('EPISODE RATINGS', M, y + 5);
      stroke(P.line, 0.25); pdf.line(M, y + 8, M + CW, y + 8);
      y += 13;
      const cw = 15, ch = 11, gap = 2, per = Math.floor((CW + gap) / (cw + gap));
      Object.keys(bySeason).map(Number).sort((a, b) => a - b).forEach(sn => {
        const rows = bySeason[sn].sort((a, b) => a.episode_number - b.episode_number);
        const avg = rows.reduce((t, r) => t + Number(r.score), 0) / rows.length;
        pageBreak(8 + ch + 4);
        font('Oswald', 8, 'bold'); ink(P.text); spaced(`SEASON ${sn}`, M, y + 3.5, 0.5);
        font('Manrope', 7.4); ink(P.text3); const lbl = `${rows.length} rated  ·  average`; pdf.text(lbl, M + 26, y + 3.5);
        const lw2 = pdf.getTextWidth(lbl);
        font('Bebas', 11); ink(tInk(avg)); pdf.text(mssR1(avg), M + 26 + lw2 + 1.6, y + 3.8);
        y += 6;
        rows.forEach((r, k) => {
          if (k && k % per === 0) { y += ch + gap; pageBreak(ch + 4); }
          const cx = M + (k % per) * (cw + gap);
          stroke(P.edge, 0.3); pdf.roundedRect(cx, y, cw, ch, 1.6, 1.6, 'S');
          font('Oswald', 5.6, 'bold'); ink(P.text3); pdf.text(`E${r.episode_number}`, cx + cw / 2, y + 3.6, { align: 'center' });
          font('Bebas', 11); ink(tInk(r.score)); pdf.text(num(Number(r.score)), cx + cw / 2, y + 9, { align: 'center' });
          fill(tFill(r.score)); pdf.roundedRect(cx + 3, y + ch - 1.4, cw - 6, 0.7, 0.35, 0.35, 'F');
        });
        y += ch + 6;
      });
    }

    /* ── footer on every page: avatar @username · MYSCREENFOLIO — Page x / y ── */
    const pages = pdf.getNumberOfPages(), user = !priv.anon && job.who?.username ? safe(job.who.username) : '';
    for (let p = job.epChart ? 2 : 1; p <= pages; p++) {   // the chart page has its own footer
      pdf.setPage(p);
      stroke(P.line, 0.25); pdf.line(M, H - 12.5, W - M, H - 12.5);
      let fx = M;
      if (user) {
        if (avatar) pdf.addImage(avatar, 'PNG', fx, H - 9.4, 5, 5);
        else { fill(P.accent); pdf.circle(fx + 2.5, H - 6.9, 2.5, 'F'); font('Oswald', 6.5, 'bold'); ink(P.page); pdf.text(user[0].toUpperCase(), fx + 2.5, H - 5.9, { align: 'center' }); }
        fx += 7;
        font('Manrope', 7.4, 'bold'); ink(P.text2); pdf.text('@' + user, fx, H - 5.9); fx += pdf.getTextWidth('@' + user) + 2.2;
        font('Manrope', 7.4); ink(P.text3); pdf.text('·', fx, H - 5.9); fx += 2.6;
      }
      wordmark(fx, H - 5.9, 7.4, P.text3, P.accent);
      const pn = `${String(p).padStart(2, '0')} / ${String(pages).padStart(2, '0')}`;
      font('Bebas', 11); ink(P.text2); pdf.text(pn, W - M, H - 5.6, { align: 'right' });
      const nw = pdf.getTextWidth(pn);
      font('Oswald', 6.6, 'bold'); ink(P.text3); spaced('PAGE', W - M - nw - 2, H - 5.9, 0.4, { align: 'right' });
    }
    onProgress(1, 'Saving…');
    await tick();
    return pdf.output('blob');
  }

  return { build, stats, detailStats, tasteStats, yearStats, epStats, posters, text, groups, chips, meta, progress, score, kindOf, POSTER_MAX };
})();
