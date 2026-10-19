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
     job = { kind: 'watched' | 'watchlist' | 'watching', title, kicker,
             entries (already filtered + sorted), ranked, group, theme,
             include: { breakdown, highlights, notes, dates },
             privacy: { hideSpoilers, anon }, who: { name, username, avatar_url } }
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
  function stats(kind, entries) {
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
    if (!priv.anon && job.who && (job.who.name || job.who.username)) {
      font('Manrope', 10); ink(P.text2);
      pdf.text(safe(`by ${job.who.name || job.who.username}${job.who.username && job.who.name && job.who.name !== job.who.username ? ` (@${job.who.username})` : ''}`), M, y + 8);
      y += 8;
    }
    y += 8;
    const st = stats(job.kind, list), tw = (CW - 3 * 4) / 4;
    st.forEach((s, i) => {
      const tx = M + i * (tw + 4);
      fill(P.card); stroke(P.edge, 0.3); pdf.roundedRect(tx, y, tw, 21, 2.5, 2.5, 'FD');
      if (s.word) { font('Oswald', 13, 'bold'); ink(P.accent); pdf.text(clip(s.value, tw - 8), tx + 4, y + 10.4); }
      else { font('Bebas', 22); ink(P.accent); pdf.text(clip(s.value, tw - 8), tx + 4, y + 11.2); }
      font('Oswald', 6.8, 'bold'); ink(P.text3); spaced(s.label.toUpperCase(), tx + 4, y + 17, 0.45);
    });
    y += 29;

    /* ── one card per title: measure (draw = null), then draw at the measured height ── */
    const PAD = 5, RANK = job.ranked ? 10 : 0, PW = withPosters ? 17 : 0, PH = 25.5, BOX = job.kind === 'watched' ? 20 : 0, BOXH = 19;
    function card(e, rank, draw) {
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
      font('Manrope', 7.6); const m = clip(meta(job.kind, e, inc), w);
      if (draw) { ink(P.text2); pdf.text(m, tx, cy + 3); }
      cy += 5;
      if (job.kind === 'watching') {
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
      if (inc.breakdown && job.kind === 'watched') {
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
      if (inc.highlights && job.kind === 'watched') {
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
          if (lines.length > 6) { lines = lines.slice(0, 6); lines[5] = lines[5].replace(/\s*\S*$/, '') + '…'; }
          const nh = lines.length * lh(8);
          if (draw) { fill(P.accent); pdf.rect(bx0, cy, 0.8, nh + 0.6, 'F'); ink(P.text2); pdf.text(lines, bx0 + 3, cy + 2.9); }
          cy += nh + 1;
        }
      }
      return Math.max(cy + PAD - y, BOX ? BOXH + PAD * 2 : 0, PW ? PH + PAD * 2 : 0);
    }
    const pageBreak = h => { if (y + h > BOTTOM) { pdf.addPage(); page(); y = M; } };
    let lastCat = null, rank = 0;   // grouped: each category ranks from 1
    for (let i = 0; i < list.length; i++) {
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

  return { build, stats, posters, text, bars, chips, meta, progress, score, POSTER_MAX };
})();
