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
             year (MSSYear.compute — the year in review instead of title cards) }
     'mixed' (hand-picked titles, lists): each card follows its own title — score for
     watched ones, progress for ones you're watching, the basics for the rest.
   MSSPdf.kindOf(e) → 'watched' | 'watchlist' | 'watching' | 'title' (not in a library)
     onProgress(fraction 0–1, label)
   MSSPdf.stats / posters / text / bars / chips / meta / progress / score — shared with the studio's preview

   Requires config.js (liveScore, getRatings, CAT_META, MSSRich,
   mssIsSpoiler, safeURL), rewatch.js (getRewatchCount), jsPDF.
══════════════════════════════════════════════════════════════ */
const MSSPdf = (() => {
  const POSTER_MAX = 10;
  // the site's colour tokens (style.css), as RGB; "edge" = --border-olive over the card
  const PALETTE = {
    dark:  { page: [10, 10, 14], card: [24, 24, 29], track: [33, 33, 38], text: [237, 237, 237], text2: [168, 168, 168], text3: [128, 128, 128],
             accent: [126, 184, 108], low: [248, 113, 113], edge: [46, 59, 45], line: [42, 42, 48] },
    light: { page: [226, 218, 208], card: [243, 237, 228], track: [216, 208, 197], text: [26, 26, 26], text2: [74, 74, 74], text3: [106, 106, 106],
             accent: [30, 92, 38], low: [192, 57, 43], edge: [145, 161, 140], line: [206, 197, 184] },
  };
  const FONTS = [['Oswald-500.ttf', 'Oswald', 'normal'], ['Oswald-600.ttf', 'Oswald', 'bold'], ['Manrope-400.ttf', 'Manrope', 'normal'],
    ['Manrope-600.ttf', 'Manrope', 'bold'], ['BebasNeue-400.ttf', 'Bebas', 'normal']];
  const EP_MIN = { tv: 42, anime: 24, cartoons: 22 };
  let fontData = null;   // file → base64, fetched once

  // keep what the fonts can draw (Latin + common punctuation); other scripts are dropped
  const safe = s => String(s == null ? '' : s).replace(/[^\x00-ɏ -⁯€™]/g, '').replace(/\s+/g, ' ').trim();
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
  // the taste profile's own tiles
  function tasteStats(t) {
    return [{ value: t.rated, label: 'Titles rated' }, { value: t.avg.toFixed(2), label: 'Average score' },
      { value: t.genres[0]?.name || '—', label: 'Top genre', word: true }, { value: t.favDecade?.name || '—', label: 'Favourite decade', word: true }];
  }
  function text(e) {
    const raw = e.notes && e.notes.trim() ? MSSRich.plain(e.notes) : '';
    return { note: raw.replace(/\n{3,}/g, '\n\n').trim(), spoiler: mssIsSpoiler(e) };
  }
  function bars(e) {
    const r = e.ratings || {}, { core, bonus } = getRatings(e.cat, isMovie(e));
    const extra = !['anime', 'cartoons'].includes(e.cat) && r.animation != null && r.animation !== '' ? [{ key: 'animation', label: 'Animation Quality' }] : [];
    return [...core, ...extra, ...bonus].filter(x => r[x.key] != null && r[x.key] !== '').map(x => ({ label: x.label, v: Number(r[x.key]) }));
  }
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
      img.onerror = () => { clearTimeout(t); res(null); };
      img.src = round ? url : String(url).replace(/\/(w\d+|original)\//, '/w185/');
    });
  }
  const tick = () => new Promise(r => setTimeout(r, 0));

  async function build(job, onProgress = () => {}) {
    const P = PALETTE[job.theme === 'light' ? 'light' : 'dark'], inc = job.include || {}, priv = job.privacy || {};
    const list = job.entries || [], withPosters = posters(list.length);
    onProgress(0.02, 'Getting the fonts…');
    const fonts = await loadFonts();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    FONTS.forEach(([file, fam, style]) => { pdf.addFileToVFS(file, fonts[file]); pdf.addFont(file, fam, style); });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14, CW = W - M * 2, BOTTOM = H - 17;
    const fill = c => pdf.setFillColor(...c), ink = c => pdf.setTextColor(...c), stroke = (c, w) => { pdf.setDrawColor(...c); pdf.setLineWidth(w); };
    const font = (fam, size, style = 'normal') => { pdf.setFont(fam, style); pdf.setFontSize(size); };
    const lh = size => size * 0.3528 * 1.32;
    const spaced = (s, x, yy, sp, opt) => { pdf.setCharSpace(sp); pdf.text(s, x, yy, opt); pdf.setCharSpace(0); };
    const clip = (s, w) => { s = safe(s); if (pdf.getTextWidth(s) <= w) return s; while (s.length > 1 && pdf.getTextWidth(s + '…') > w) s = s.slice(0, -1); return s.trimEnd() + '…'; };
    const page = () => { fill(P.page); pdf.rect(0, 0, W, H, 'F'); };
    let y;

    const img = {};
    if (withPosters) {
      for (let i = 0; i < list.length; i++) {
        onProgress(0.05 + i / list.length * 0.35, 'Getting posters…');
        img[list[i].id] = await loadImage(list[i].poster_url);
      }
    }
    const avatar = !priv.anon && job.who?.avatar_url ? await loadImage(safeURL(job.who.avatar_url), true) : null;

    /* ── cover block ── */
    page();
    font('Oswald', 10.5, 'bold');
    let x = M;
    [['MY', P.text], ['SCREEN', P.accent], ['FOLIO', P.text]].forEach(([t, c]) => {
      ink(c); spaced(t, x, 16, 0.5); const w = pdf.getTextWidth(t) + 0.5 * t.length;
      if (t === 'SCREEN') { stroke(c, 0.5); pdf.line(x, 17.6, x + w - 0.5, 17.6); }
      x += w;
    });
    font('Manrope', 8); ink(P.text3); pdf.text(fmtDate(new Date().toISOString()), W - M, 16, { align: 'right' });
    font('Oswald', 8.5, 'bold'); ink(P.accent); spaced(safe(job.kicker).toUpperCase(), M, 32, 0.8);
    font('Oswald', 26, 'bold'); ink(P.text);
    const tl = pdf.splitTextToSize(safe(job.title) || 'My export', CW).slice(0, 2);
    pdf.text(tl, M, 43); y = 43 + (tl.length - 1) * lh(26);
    const by = job.byline || (!priv.anon && job.who && (job.who.name || job.who.username)
      ? `by ${job.who.name || job.who.username}${job.who.username && job.who.name && job.who.name !== job.who.username ? ` (@${job.who.username})` : ''}` : '');
    if (by) { font('Manrope', 10); ink(P.text2); pdf.text(safe(by), M, y + 8); y += 8; }
    if (job.desc) {
      font('Manrope', 9.5); ink(P.text2);
      const dl = pdf.splitTextToSize(safe(job.desc), CW).slice(0, 3);
      pdf.text(dl, M, y + 7); y += 7 + (dl.length - 1) * lh(9.5);
    }
    y += 8;
    const epN = (job.episodes || []).filter(r => Number(r.episode_number) > 0 && r.score != null).length;
    const st = job.year ? yearStats(job.year) : job.taste ? tasteStats(job.taste) : job.detail && list[0] ? detailStats(list[0], epN) : stats(job.kind, list), tw = (CW - 3 * 4) / 4;
    st.forEach((s, i) => {
      const tx = M + i * (tw + 4);
      fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx, y, tw, 21, 2.5, 2.5, 'FD');
      if (s.word) { font('Oswald', 13, 'bold'); ink(P.accent); pdf.text(clip(s.value, tw - 8), tx + 4, y + 10.4); }
      else { font('Bebas', 22); ink(P.accent); pdf.text(clip(s.value, tw - 8), tx + 4, y + 11.2); }
      font('Oswald', 6.8, 'bold'); ink(P.text3); spaced(s.label.toUpperCase(), tx + 4, y + 17, 0.45);
    });
    y += 29;

    /* ── one card per title: measure (draw = null), then draw at the measured height ── */
    const PAD = 5, RANK = job.ranked ? 10 : 0, PW = withPosters ? 17 : 0, PH = 25.5, BOXH = 19;
    function card(e, rank, draw) {
      const ek = job.kind === 'mixed' ? kindOf(e) : job.kind, BOX = ek === 'watched' ? 20 : 0;
      const x0 = M, tx = x0 + PAD + RANK + (PW ? PW + 4 : 0), right = x0 + CW - PAD - (BOX ? BOX + 4 : 0), w = right - tx;
      let cy = y + PAD;
      font('Oswald', 13, 'bold');
      const tLines = pdf.splitTextToSize(safe(e.title) || 'Untitled', w).slice(0, 2);
      if (draw) {
        const mid = y + draw.h / 2;
        fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(x0, y, CW, draw.h, 3, 3, 'FD');
        if (RANK) { font('Bebas', rank < 3 ? 20 : 16); ink(rank < 3 ? P.accent : P.text3); pdf.text(String(rank + 1), x0 + PAD + (RANK - 2) / 2, mid + (rank < 3 ? 2.6 : 2.1), { align: 'center' }); }
        if (PW) {   // the poster sits in the middle of the card, on the left
          const px = x0 + PAD + RANK, py = mid - PH / 2;
          if (img[e.id]) pdf.addImage(img[e.id], 'JPEG', px, py, PW, PH);
          else { fill(P.track); pdf.roundedRect(px, py, PW, PH, 1.5, 1.5, 'F'); font('Oswald', 14, 'bold'); ink(P.text3); pdf.text(safe(e.title || '?')[0] || '?', px + PW / 2, py + PH / 2 + 2.4, { align: 'center' }); }
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
      // the score: an outlined box, like Create Card's
      if (BOX && draw) {
        const s = score(e), bx = x0 + CW - PAD - BOX, by = y + PAD;
        stroke(P.edge, 0.35); pdf.roundedRect(bx, by, BOX, BOXH, 2.2, 2.2, 'S');
        font('Oswald', 5.6, 'bold'); ink(P.text3); spaced('SCORE', bx + BOX / 2, by + 4.6, 0.4, { align: 'center' });
        if (s == null) { font('Manrope', 7.5, 'bold'); ink(P.text3); pdf.text('Unrated', bx + BOX / 2, by + 11.4, { align: 'center' }); }
        else { font('Bebas', 21); ink(P.accent); pdf.text(s.toFixed(2), bx + BOX / 2, by + 12.6, { align: 'center' }); }
        font('Oswald', 5.2, 'bold'); ink(P.text3); spaced('OUT OF 10', bx + BOX / 2, by + 16.6, 0.3, { align: 'center' });
      }
      // rating bars, highlights and the note: in the text column, under the score box
      const bx0 = tx, bw = x0 + CW - PAD - bx0, n0 = inc.notes ? text(e) : { note: '' };
      if (BOX && ((inc.breakdown && bars(e).length) || (inc.highlights && chips(e).length) || n0.note)) cy = Math.max(cy, y + PAD + BOXH + 1.5);
      if (inc.breakdown && ek === 'watched') {
        const b = bars(e);
        if (b.length) {
          const cols = 3, gap = 5, colW = (bw - gap * (cols - 1)) / cols, rowH = 5.8;
          cy += 1;
          if (draw) b.forEach((r, k) => {
            const cx = bx0 + (k % cols) * (colW + gap), ry = cy + Math.floor(k / cols) * rowH;
            font('Manrope', 6.4); ink(P.text2); pdf.text(clip(r.label, colW - 8), cx, ry + 2.3);
            font('Bebas', 9); ink(P.text); pdf.text(num(r.v), cx + colW, ry + 2.5, { align: 'right' });
            fill(P.track); pdf.roundedRect(cx, ry + 3.5, colW, 1.2, 0.6, 0.6, 'F');
            fill(P.accent); pdf.roundedRect(cx, ry + 3.5, Math.max(1.2, colW * Math.min(1, r.v / 10)), 1.2, 0.6, 0.6, 'F');
          });
          cy += Math.ceil(b.length / cols) * rowH + 1;
        }
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
    const pageBreak = h => { if (y + h > BOTTOM) { pdf.addPage(); page(); y = M; } };
    let lastCat = null, rank = 0;   // grouped: each category ranks from 1
    for (let i = 0; i < (job.taste || job.year ? 0 : list.length); i++) {
      const e = list[i];
      if (job.group && e.cat !== lastCat) {
        lastCat = e.cat; rank = 0;
        pageBreak(12 + 30);
        const label = (CAT_META?.[e.cat]?.label || 'Other').toUpperCase();
        font('Oswald', 9, 'bold'); ink(P.accent); spaced(label, M, y + 5, 0.8);
        const lw = pdf.getTextWidth(label) + 0.8 * label.length;
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
      font('Oswald', 9, 'bold'); ink(P.accent); spaced(label, M, y + 5, 0.8);
      if (sub) { const lw = pdf.getTextWidth(label) + 0.8 * label.length; font('Manrope', 7.6); ink(P.text3); pdf.text(sub, M + lw + 3, y + 5); }
      stroke(P.line, 0.25); pdf.line(M, y + 8, M + CW, y + 8);
      y += 12;
    };
    // one bar per row: label · bar (avg out of 10, or n out of the most) · value · how many titles · an optional tag
    const barRows = (rows, tag, counts) => { const mx = Math.max(1, ...rows.map(x => x.n)); rows.forEach((r2, k) => {
      pageBreak(8);
      const lx = M, bx = M + 46, bw = CW - 46 - 58, f = counts ? r2.n / mx : r2.avg / 10;
      font('Manrope', 8.4, 'bold'); ink(P.text); pdf.text(clip(r2.label || r2.name, 44), lx, y + 4.2);
      fill(P.track); pdf.roundedRect(bx, y + 1.6, bw, 3.2, 1.6, 1.6, 'F');
      fill(P.accent); pdf.roundedRect(bx, y + 1.6, Math.max(3.2, bw * Math.min(1, f)), 3.2, 1.6, 1.6, 'F');
      font('Bebas', 12); ink(P.accent); pdf.text(counts ? String(r2.n) : r2.avg.toFixed(2), bx + bw + 3, y + 4.6);
      if (!counts) { font('Manrope', 7); ink(P.text3); pdf.text(`${r2.n} ${r2.n === 1 ? 'title' : 'titles'}`, bx + bw + 16, y + 4.4); }
      const tg = tag && tag(r2, k);
      if (tg) { font('Oswald', 5.8, 'bold'); const tw2 = pdf.getTextWidth(tg) + 0.3 * tg.length + 4;
        stroke(P.edge, 0.3); pdf.roundedRect(M + CW - tw2, y + 0.6, tw2, 5, 1.2, 1.2, 'S'); ink(P.accent); spaced(tg, M + CW - tw2 + 2, y + 4, 0.3); }
      y += 7.2;
    }); };
    // a numbered top 5: rank · title + details · score
    const top5 = list5 => list5.forEach((x, k) => {
      pageBreak(11);
      font('Bebas', 14); ink(k < 3 ? P.accent : P.text3); pdf.text(String(k + 1), M + 2, y + 5.4);
      font('Oswald', 10.5, 'bold'); ink(P.text); pdf.text(clip(x.e.title || 'Untitled', CW - 40), M + 10, y + 5);
      font('Manrope', 7.4); ink(P.text3); pdf.text(safe([CAT_META?.[x.e.cat]?.singular, x.e.year ? String(x.e.year).slice(0, 4) : ''].filter(Boolean).join(' · ')), M + 10, y + 9.2);
      font('Bebas', 14); ink(P.accent); pdf.text(x.s.toFixed(2), M + CW, y + 5.4, { align: 'right' });
      y += 11;
    });
    // 12 / 10 columns: a little bar chart with labels under it
    const columns = (vals, labels, chH = 26) => {
      const mx = Math.max(...vals, 1), n = vals.length, colW = (CW - (n - 1) * 3) / n;
      vals.forEach((c, k) => {
        const cx = M + k * (colW + 3), h = c ? Math.max(3, chH * c / mx) : 0;   // never thinner than its rounded corners
        fill(P.track); pdf.roundedRect(cx, y, colW, chH, 1.5, 1.5, 'F');
        if (h) { fill(P.accent); pdf.roundedRect(cx, y + chH - h, colW, h, 1.5, 1.5, 'F'); }
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
        head('HOW YOU RATE', 'your average in each rating category', 28);
        barRows(t.categories, (c, k) => k === 0 ? 'KINDEST' : k === t.categories.length - 1 && t.categories.length > 1 ? 'TOUGHEST' : '');
        y += 4;
      }
      // the score spread: one column per score, 1 → 10
      head('SCORE SPREAD', `${t.rated} titles · you’re a ${t.generous} scorer`, 58);
      columns(t.spread, t.spread.map((_, k) => String(k + 1)));
      if (t.decades.length) { head('DECADES', 'your average by release decade', 28); barRows(t.decades, d => t.favDecade && d.name === t.favDecade.name ? 'FAVOURITE' : ''); y += 4; }
      // movies vs shows, then the top 5
      if (t.movies.n && t.shows.n) {
        head('MOVIES VS SHOWS', '', 38);
        [['Movies', t.movies], ['Shows', t.shows]].forEach(([l, v], k) => {
          const tx2 = M + k * (CW / 2 + 2), tw2 = CW / 2 - 2;
          fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx2, y, tw2, 18, 2.5, 2.5, 'FD');
          font('Bebas', 22); ink(P.accent); pdf.text(v.avg.toFixed(2), tx2 + 5, y + 11.5);
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
        font('Bebas', 16); ink(P.accent); pdf.text(num(yr.topEp.score), M + CW, y + 5.4, { align: 'right' });
        y += 12;
      }
    }

    /* ── one title: its episode ratings, season by season ── */
    const eps = (job.episodes || []).filter(r => Number(r.episode_number) > 0 && r.score != null);
    if (job.detail && eps.length) {
      const bySeason = {};
      eps.forEach(r => { (bySeason[r.season_number] ||= []).push(r); });
      pageBreak(24);
      font('Oswald', 9, 'bold'); ink(P.accent); spaced('EPISODE RATINGS', M, y + 5, 0.8);
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
        font('Bebas', 11); ink(P.accent); pdf.text(avg.toFixed(1), M + 26 + lw2 + 1.6, y + 3.8);
        y += 6;
        rows.forEach((r, k) => {
          if (k && k % per === 0) { y += ch + gap; pageBreak(ch + 4); }
          const cx = M + (k % per) * (cw + gap);
          stroke(P.edge, 0.3); pdf.roundedRect(cx, y, cw, ch, 1.6, 1.6, 'S');
          font('Oswald', 5.6, 'bold'); ink(P.text3); pdf.text(`E${r.episode_number}`, cx + cw / 2, y + 3.6, { align: 'center' });
          font('Bebas', 11); ink(P.accent); pdf.text(num(Number(r.score)), cx + cw / 2, y + 9, { align: 'center' });
        });
        y += ch + 6;
      });
    }

    /* ── footer on every page: avatar @username · MYSCREENFOLIO — Page x / y ── */
    const pages = pdf.getNumberOfPages(), user = !priv.anon && job.who?.username ? safe(job.who.username) : '';
    for (let p = 1; p <= pages; p++) {
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
      font('Oswald', 7.4, 'bold'); ink(P.text3); spaced('MYSCREENFOLIO', fx, H - 5.9, 0.35);
      font('Bebas', 9.5); ink(P.text2); pdf.text(`${p} / ${pages}`, W - M, H - 5.75, { align: 'right' });
      const nw = pdf.getTextWidth(`${p} / ${pages}`);
      font('Oswald', 7, 'bold'); ink(P.text3); pdf.text('PAGE', W - M - nw - 1.8, H - 5.9, { align: 'right' });
    }
    onProgress(1, 'Saving…');
    await tick();
    return pdf.output('blob');
  }

  return { build, stats, detailStats, tasteStats, yearStats, posters, text, bars, chips, meta, progress, score, kindOf, POSTER_MAX };
})();
