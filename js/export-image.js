/* ══════════════════════════════════════════════════════════════
   export-image.js — the Export Studio's shareable image (MSSImage):
   your top 10 (or fewer) as a picture for Instagram / TikTok / chats.
     story  1080 × 1920 — a ranked list: rank, poster, title, details, score
     square 1080 × 1080 — a poster grid (5 × 2) with rank, score and title
   The square's posters carry the site's rank tab (gold / silver / bronze, then green); the story
   numbers its rows. Same look as the PDF: the site's fonts (Oswald, Manrope, Bebas Neue —
   loaded first via mssFontsReady) and palette, dark or light, outlined
   cards, the score in an outlined box, a footer with your avatar.

   MSSImage.draw(canvas, job) → Promise<boolean (false if a newer draw started)>
     job = { size: 'story' | 'square', theme, title, kicker, entries (≤ 10),
             who: { username, avatar_url }, anon, taste (MSSTaste.compute — the taste profile instead of titles),
             year (MSSYear.compute) + slide ('overview' | 'top' | 'months') — story only }
   MSSImage.MAX = 10
   Requires config.js (mssFontsReady, safeURL, CAT_META), export.js (MSSPdf helpers).
══════════════════════════════════════════════════════════════ */
const MSSImage = (() => {
  const MAX = 10;
  const PAL = {
    dark:  { bg: '#0A0A0E', card: '#18181D', track: '#212126', edge: 'rgba(74,103,65,0.55)', text: '#EDEDED', text2: '#A8A8A8', text3: '#808080', accent: '#7EB86C', glow: 'rgba(74,103,65,0.28)' },
    light: { bg: '#E2DAD0', card: '#F3EDE4', track: '#D8D0C5', edge: 'rgba(26,69,32,0.4)', text: '#1A1A1A', text2: '#4A4A4A', text3: '#6A6A6A', accent: '#1E5C26', glow: 'rgba(26,69,32,0.12)' },
  };
  const imgs = new Map();   // url → Promise<HTMLImageElement | null>, kept for the session
  function load(url) {
    if (!url) return Promise.resolve(null);
    if (!imgs.has(url)) imgs.set(url, new Promise(res => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 8000);
      im.onload = () => { clearTimeout(t); res(im); };
      im.onerror = () => { clearTimeout(t); res(null); };
      im.src = url;
    }));
    return imgs.get(url);
  }
  const poster = u => u && /^https?:/.test(u) ? String(u).replace(/\/(w\d+|original)\//, '/w342/') : '';
  let token = 0;

  function rr(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fit(g, s, w) { s = String(s || ''); if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s.trimEnd() + '…'; }
  function spaced(g, s, x, y, sp, align) {   // letter-spaced caps (canvas letterSpacing isn't everywhere)
    const w = [...s].reduce((t, c) => t + g.measureText(c).width + sp, -sp);
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    g.textAlign = 'left';
    [...s].forEach(c => { g.fillText(c, cx, y); cx += g.measureText(c).width + sp; });
    return w;
  }
  function cover(g, im, x, y, w, h, r) {   // a poster, cropped to fill, with rounded corners
    g.save(); rr(g, x, y, w, h, r); g.clip();
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight), iw = im.naturalWidth * s, ih = im.naturalHeight * s;
    g.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    g.restore();
  }
  function noPoster(g, C, e, x, y, w, h, r) {
    g.fillStyle = C.track; rr(g, x, y, w, h, r); g.fill();
    g.fillStyle = C.text3; g.font = `600 ${Math.round(w * 0.36)}px Oswald, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(e.title || '?')[0].toUpperCase(), x + w / 2, y + h / 2); g.textBaseline = 'alphabetic';
  }
  // The site's rank tab (.cg-rank-badge): flush in the poster's top-left corner, gold / silver / bronze
  // for 1–3, green after; a thin foil line along the bottom. Drawn inside the poster's rounded clip.
  const RANK = [['#fbe7a1', '#e0b44a', '#b8861d', '#8f6612', '#3a2800'], ['#ffffff', '#d5dde3', '#a3afb8', '#7d8993', '#1d2830'],
    ['#f6c39a', '#d08a55', '#a8622f', '#7c4420', '#fff8f0']];
  function rankTab(g, px, py, pr, n, h) {
    const c = RANK[n - 1], fs = Math.round(h * 0.6);
    g.font = `400 ${fs}px "Bebas Neue", sans-serif`;
    const w = Math.max(h, g.measureText(String(n)).width + h * 0.56);
    g.save();
    rr(g, px, py, 9999, 9999, pr); g.clip();   // follow the poster's corner
    g.shadowColor = 'rgba(0,0,0,.32)'; g.shadowBlur = h * 0.4; g.shadowOffsetY = h * 0.12;
    const gr = g.createLinearGradient(px, py, px + w * 0.45, py + h);
    if (c) { gr.addColorStop(0, c[0]); gr.addColorStop(.4, c[1]); gr.addColorStop(.75, c[2]); gr.addColorStop(1, c[3]); }
    else { gr.addColorStop(0, '#2f7a3a'); gr.addColorStop(.6, '#1b4d22'); gr.addColorStop(1, '#133a18'); }
    g.fillStyle = gr;
    const br = h * 0.375;   // only the bottom-right corner is rounded
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + w, py); g.lineTo(px + w, py + h - br); g.arcTo(px + w, py + h, px + w - br, py + h, br); g.lineTo(px, py + h); g.closePath(); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = c ? c[4] : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), px + w / 2 - h * 0.02, py + h / 2 + fs * 0.06);
    g.textBaseline = 'alphabetic';
    g.globalAlpha = .28; g.fillRect(px + h * 0.25, py + h - h * 0.16, w - h * 0.56, Math.max(1, h * 0.03)); g.globalAlpha = 1;
    g.restore();
  }
  function scoreText(e) { const k = MSSPdf.kindOf(e), s = MSSPdf.score(e);
    return k === 'watched' ? (s == null ? null : s.toFixed(2)) : null; }
  function statusText(e) { const k = MSSPdf.kindOf(e);
    if (k === 'watching') { const p = MSSPdf.progress(e); return p && p.pct ? `${Math.round(p.pct * 100)}% watched` : 'Watching'; }
    return k === 'watchlist' ? 'On the watchlist' : k === 'watched' ? 'Not rated' : ''; }

  // The taste profile (taste-profile.js): 4 tiles, top genres as bars, kindest / toughest, the score spread (story)
  function tasteBody(g, C, t, W, H, P, story, y) {
    const label = (s, yy) => { g.fillStyle = C.accent; g.font = `600 ${story ? 24 : 19}px Oswald, sans-serif`; spaced(g, s, P, yy, 3.5); };
    const card = (x, yy, w, h) => { g.fillStyle = C.card; rr(g, x, yy, w, h, story ? 20 : 16); g.fill(); g.strokeStyle = C.edge; g.lineWidth = 2; g.stroke(); };
    // tiles
    const tiles = [[t.rated, 'TITLES RATED'], [t.avg.toFixed(2), 'AVERAGE SCORE'], [t.genres[0]?.name || '—', 'TOP GENRE', 1], [t.favDecade?.name || '—', 'FAVOURITE DECADE', 1]];
    const cols = story ? 2 : 4, gap = story ? 18 : 14, tw = (W - P * 2 - gap * (cols - 1)) / cols, th = story ? 170 : 112;
    y += story ? 26 : 12;
    tiles.forEach(([v, l, word], i) => {
      const x = P + (i % cols) * (tw + gap), yy = y + Math.floor(i / cols) * (th + gap);
      card(x, yy, tw, th);
      g.textAlign = 'left'; g.fillStyle = C.accent;
      g.font = word ? `600 ${story ? 46 : 32}px Oswald, sans-serif` : `400 ${story ? 82 : 58}px "Bebas Neue", sans-serif`;
      g.fillText(fit(g, String(v), tw - 48), x + 24, yy + th * (word ? 0.52 : 0.6));
      g.fillStyle = C.text3; g.font = `600 ${story ? 19 : 15}px Oswald, sans-serif`; spaced(g, l, x + 24, yy + th - (story ? 26 : 20), 2.5);
    });
    y += Math.ceil(tiles.length / cols) * (th + gap) + (story ? 44 : 16);
    // top genres
    const gs = t.genres.slice(0, story ? 6 : 4);
    if (gs.length) {
      label('TOP GENRES', y + (story ? 10 : 6)); y += story ? 36 : 26;
      const rowH = story ? 64 : 44, lw = story ? 250 : 220, bw = W - P * 2 - lw - (story ? 150 : 120);
      gs.forEach((x, i) => {
        const yy = y + i * rowH;
        g.textAlign = 'left'; g.fillStyle = C.text; g.font = `600 ${story ? 32 : 26}px Oswald, sans-serif`; g.fillText(fit(g, x.name, lw - 20), P, yy + rowH * 0.62);
        g.fillStyle = C.track; rr(g, P + lw, yy + rowH * 0.36, bw, story ? 16 : 12, story ? 8 : 6); g.fill();
        g.fillStyle = C.accent; rr(g, P + lw, yy + rowH * 0.36, Math.max(16, bw * x.avg / 10), story ? 16 : 12, story ? 8 : 6); g.fill();
        g.fillStyle = C.accent; g.font = `400 ${story ? 44 : 36}px "Bebas Neue", sans-serif`; g.textAlign = 'right'; g.fillText(x.avg.toFixed(2), W - P, yy + rowH * 0.7);
      });
      y += gs.length * rowH + (story ? 40 : 12);
    }
    // kindest · toughest
    if (t.kindest && t.harshest) {
      const cw = (W - P * 2 - gap) / 2, ch = story ? 196 : 130;
      if (y + ch < H - (story ? 160 : 70)) {
        [['KINDEST ON', t.kindest], ['TOUGHEST ON', t.harshest]].forEach(([l, c], i) => {
          const x = P + i * (cw + gap); card(x, y, cw, ch);
          g.textAlign = 'left'; g.fillStyle = C.text3; g.font = `600 ${story ? 19 : 15}px Oswald, sans-serif`; spaced(g, l, x + 24, y + (story ? 40 : 30), 2.5);
          g.fillStyle = C.text; g.font = `600 ${story ? 34 : 26}px Oswald, sans-serif`; g.fillText(fit(g, c.label, cw - 48), x + 24, y + (story ? 86 : 64));
          g.fillStyle = C.accent; g.font = `400 ${story ? 58 : 40}px "Bebas Neue", sans-serif`; g.fillText(c.avg.toFixed(2), x + 24, y + ch - (story ? 26 : 18));
        });
        y += ch + (story ? 48 : 0);
      }
    }
    // the score spread (story only — the square has no room)
    if (story && y + 260 < H - 150) {
      label('SCORE SPREAD', y + 10); y += 30;
      const mx = Math.max(...t.spread, 1), cw = (W - P * 2 - 9 * 12) / 10, chH = Math.min(380, H - 210 - y - 40);   // fills what's left
      t.spread.forEach((c, k) => {
        const x = P + k * (cw + 12), h = c ? Math.max(20, chH * c / mx) : 0;   // never thinner than its rounded corners
        g.fillStyle = C.track; rr(g, x, y, cw, chH, 10); g.fill();
        if (h) { g.fillStyle = C.accent; rr(g, x, y + chH - h, cw, h, 10); g.fill(); }
        g.textAlign = 'center'; g.fillStyle = C.text2; g.font = '400 34px "Bebas Neue", sans-serif'; g.fillText(String(k + 1), x + cw / 2, y + chH + 38);
      });
    }
  }

  // The year in review (year-review.js), story only, three slides:
  //   overview — the year huge, 4 tiles, highlights · top — your best 5 with posters · months — month by month, genres, first & last
  function yearBody(g, C, yv, slide, W, H, P, y, pics) {
    const card = (x, yy, w, h) => { g.fillStyle = C.card; rr(g, x, yy, w, h, 20); g.fill(); g.strokeStyle = C.edge; g.lineWidth = 2; g.stroke(); };
    const label = (s, yy) => { g.fillStyle = C.accent; g.font = '600 24px Oswald, sans-serif'; g.textAlign = 'left'; spaced(g, s, P, yy, 3.5); };
    const tile = (x, yy, w, h, v, l, word) => {
      card(x, yy, w, h); g.textAlign = 'left'; g.fillStyle = C.accent;
      g.font = word ? '600 46px Oswald, sans-serif' : '400 84px "Bebas Neue", sans-serif';
      g.fillText(fit(g, String(v), w - 48), x + 26, yy + h * (word ? 0.52 : 0.6));
      g.fillStyle = C.text3; g.font = '600 19px Oswald, sans-serif'; spaced(g, l, x + 26, yy + h - 28, 2.5);
    };
    const gap = 18, half = (W - P * 2 - gap) / 2;
    if (slide === 'top') {
      label(`MY TOP ${yv.top.length} OF ${yv.year}`, y + 30);
      const top = y + 60, rowH = Math.min(250, (H - 170 - top - gap * 4) / 5), ph = rowH - 36, pw = Math.round(ph * 2 / 3);
      yv.top.forEach((x, i) => {
        const ry = top + i * (rowH + gap); card(P, ry, W - P * 2, rowH);
        g.fillStyle = i < 3 ? C.accent : C.text3; g.font = `400 ${i < 3 ? 76 : 64}px "Bebas Neue", sans-serif`; g.textAlign = 'center';
        g.fillText(String(i + 1), P + 58, ry + rowH / 2 + 26);
        const px = P + 112, py = ry + 18;
        if (pics[i]) cover(g, pics[i], px, py, pw, ph, 12); else noPoster(g, C, x.e, px, py, pw, ph, 12);
        const tx = px + pw + 30, tw = W - P - 200 - tx;
        g.textAlign = 'left'; g.fillStyle = C.text; g.font = '600 46px Oswald, sans-serif'; g.fillText(fit(g, x.e.title || 'Untitled', tw), tx, ry + rowH / 2 - 4);
        g.fillStyle = C.text2; g.font = '500 26px Manrope, sans-serif';
        g.fillText(fit(g, [CAT_META?.[x.e.cat]?.singular, x.e.year ? String(x.e.year).slice(0, 4) : ''].filter(Boolean).join('  ·  '), tw), tx, ry + rowH / 2 + 40);
        const bw = 160, bh = 110, bx = W - P - 26 - bw, by = ry + (rowH - bh) / 2;
        g.strokeStyle = C.edge; g.lineWidth = 2; rr(g, bx, by, bw, bh, 16); g.stroke();
        g.fillStyle = C.text3; g.font = '600 16px Oswald, sans-serif'; spaced(g, 'SCORE', bx + bw / 2, by + 30, 2.5, 'center');
        g.fillStyle = C.accent; g.font = '400 64px "Bebas Neue", sans-serif'; g.textAlign = 'center'; g.fillText(x.s.toFixed(2), bx + bw / 2, by + bh - 18);
      });
      return;
    }
    if (slide === 'months') {
      label('MONTH BY MONTH', y + 30);
      const mx = Math.max(...yv.months, 1), cw = (W - P * 2 - 11 * 10) / 12, chH = 360, top = y + 60;
      yv.months.forEach((c, k) => {
        const x = P + k * (cw + 10), h = c ? Math.max(20, chH * c / mx) : 0;
        g.fillStyle = C.track; rr(g, x, top, cw, chH, 10); g.fill();
        if (h) { g.fillStyle = C.accent; rr(g, x, top + chH - h, cw, h, 10); g.fill(); }
        g.textAlign = 'center';
        if (c) { g.fillStyle = h > 50 ? (C.bg) : C.text; g.font = '400 32px "Bebas Neue", sans-serif'; g.fillText(String(c), x + cw / 2, h > 50 ? top + chH - h + 38 : top + chH - h - 10); }
        g.fillStyle = k === yv.busiest.m ? C.accent : C.text2; g.font = '600 20px Oswald, sans-serif'; g.fillText(MSSYear.MONTHS[k][0], x + cw / 2, top + chH + 34);
      });
      y = top + chH + 90;
      const gs = yv.genres.slice(0, 5);
      if (gs.length) {
        label('MOST WATCHED GENRES', y); y += 30;
        const gmx = gs[0].n, lw = 260, bw = W - P * 2 - lw - 90;
        gs.forEach((x, i) => {
          const yy = y + i * 62;
          g.textAlign = 'left'; g.fillStyle = C.text; g.font = '600 34px Oswald, sans-serif'; g.fillText(fit(g, x.name, lw - 20), P, yy + 40);
          g.fillStyle = C.track; rr(g, P + lw, yy + 24, bw, 16, 8); g.fill();
          g.fillStyle = C.accent; rr(g, P + lw, yy + 24, Math.max(16, bw * x.n / gmx), 16, 8); g.fill();
          g.fillStyle = C.accent; g.font = '400 46px "Bebas Neue", sans-serif'; g.textAlign = 'right'; g.fillText(String(x.n), W - P, yy + 44);
        });
        y += gs.length * 62 + 40;
      }
      if (y + 190 < H - 150) {
        [['FIRST OF THE YEAR', yv.first], ['LAST OF THE YEAR', yv.last]].forEach(([l, e], i) => {
          const x = P + i * (half + gap); card(x, y, half, 170);
          g.textAlign = 'left'; g.fillStyle = C.text3; g.font = '600 19px Oswald, sans-serif'; spaced(g, l, x + 26, y + 44, 2.5);
          g.fillStyle = C.text; g.font = '600 36px Oswald, sans-serif'; g.fillText(fit(g, e.title || 'Untitled', half - 52), x + 26, y + 98);
          g.fillStyle = C.text2; g.font = '500 24px Manrope, sans-serif'; g.fillText(new Date(e.completed_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }), x + 26, y + 140);
        });
      }
      return;
    }
    // overview
    g.fillStyle = C.accent; g.font = '400 360px "Bebas Neue", sans-serif'; g.textAlign = 'left';
    g.fillText(String(yv.year), P - 8, y + 330);
    y += 380;
    const th = 180;
    [[yv.titles, 'TITLES FINISHED'], [yv.hours.toLocaleString('en-GB'), 'HOURS WATCHED'], [yv.avg != null ? yv.avg.toFixed(2) : '—', 'AVERAGE SCORE'], [yv.genres[0]?.name || '—', 'TOP GENRE', 1]]
      .forEach(([v, l, w], i) => tile(P + (i % 2) * (half + gap), y + Math.floor(i / 2) * (th + gap), half, th, v, l, w));
    y += 2 * (th + gap) + 30;
    const hl = [[yv.movies, 'MOVIES'], [yv.shows, 'SHOWS'], [yv.episodes, 'EPISODES'], [yv.medals.length, 'MEDALS']];
    const qw = (W - P * 2 - gap * 3) / 4;
    hl.forEach(([v, l], i) => {
      const x = P + i * (qw + gap); card(x, y, qw, 150);
      g.textAlign = 'left'; g.fillStyle = C.accent; g.font = '400 66px "Bebas Neue", sans-serif'; g.fillText(fit(g, String(v), qw - 40), x + 22, y + 88);
      g.fillStyle = C.text3; g.font = '600 17px Oswald, sans-serif'; spaced(g, l, x + 22, y + 124, 2.2);
    });
    y += 150 + 30;
    if (yv.busiest.n && y + 120 < H - 150) {
      card(P, y, W - P * 2, 120);
      g.textAlign = 'left'; g.fillStyle = C.text3; g.font = '600 19px Oswald, sans-serif'; spaced(g, 'BUSIEST MONTH', P + 26, y + 46, 2.5);
      g.fillStyle = C.text; g.font = '600 40px Oswald, sans-serif'; g.fillText(new Date(2000, yv.busiest.m, 1).toLocaleDateString('en-GB', { month: 'long' }), P + 26, y + 96);
      g.fillStyle = C.accent; g.font = '400 64px "Bebas Neue", sans-serif'; g.textAlign = 'right'; g.fillText(`${yv.busiest.n} TITLES`, W - P - 26, y + 84);
    }
  }

  async function draw(cv, job) {
    const my = ++token;
    await mssFontsReady();
    const list = (job.entries || []).slice(0, MAX), C = PAL[job.theme === 'light' ? 'light' : 'dark'];
    const [pics, av] = await Promise.all([Promise.all(list.map(e => load(poster(e.poster_url)))), job.anon || !job.who?.avatar_url ? null : load(safeURL(job.who.avatar_url))]);
    if (my !== token) return false;
    const story = job.year ? true : job.size !== 'square', W = 1080, H = story ? 1920 : 1080, P = story ? 72 : 60;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.textBaseline = 'alphabetic';
    // background + a soft olive glow
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const gl = g.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, W * 0.9); gl.addColorStop(0, C.glow); gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);

    // header: wordmark · date, kicker, title, who
    g.font = `600 ${story ? 30 : 26}px Oswald, sans-serif`;
    let x = P; const wy = story ? 104 : 84;
    [['MY', C.text], ['SCREEN', C.accent], ['FOLIO', C.text]].forEach(([t, c]) => {
      g.fillStyle = c; const w = spaced(g, t, x, wy, 3);
      if (t === 'SCREEN') { g.fillRect(x, wy + 8, w, 3); }
      x += w + 3;
    });
    g.fillStyle = C.text3; g.font = `500 ${story ? 24 : 22}px Manrope, sans-serif`; g.textAlign = 'right';
    g.fillText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), W - P, wy);
    g.fillStyle = C.accent; g.font = `600 ${story ? 26 : 22}px Oswald, sans-serif`;
    spaced(g, String(job.kicker || '').toUpperCase(), P, story ? 214 : 158, 4);
    g.fillStyle = C.text; let fs = story ? 88 : 64;
    g.font = `600 ${fs}px Oswald, sans-serif`;
    while (g.measureText(job.title || '').width > W - P * 2 && fs > (story ? 60 : 44)) { fs -= 4; g.font = `600 ${fs}px Oswald, sans-serif`; }
    g.textAlign = 'left'; const ty = story ? 214 + fs + 14 : 158 + fs + 8;
    g.fillText(fit(g, job.title, W - P * 2), P, ty);
    let y = ty + (story ? 40 : 28);
    const user = !job.anon && job.who?.username ? job.who.username : '';

    if (job.year) yearBody(g, C, job.year, job.slide, W, H, P, y, pics);
    else if (job.taste) tasteBody(g, C, job.taste, W, H, P, story, y);
    else if (story) {
      // ten rows: rank · poster · title + details · score box
      const top = y + 24, bottom = H - 150, gap = 14, n = Math.max(list.length, 1);
      const rowH = Math.min(150, Math.floor((bottom - top - gap * (n - 1)) / n)), ph = rowH - 28, pw = Math.round(ph * 2 / 3);
      list.forEach((e, i) => {
        const ry = top + i * (rowH + gap);
        g.fillStyle = C.card; rr(g, P, ry, W - P * 2, rowH, 22); g.fill();
        g.strokeStyle = C.edge; g.lineWidth = 2; g.stroke();
        g.fillStyle = i < 3 ? C.accent : C.text3; g.font = `400 ${i < 3 ? 64 : 54}px "Bebas Neue", sans-serif`; g.textAlign = 'center';
        g.fillText(String(i + 1), P + 52, ry + rowH / 2 + (i < 3 ? 22 : 19));
        const px = P + 100, py = ry + (rowH - ph) / 2;
        if (pics[i]) cover(g, pics[i], px, py, pw, ph, 10); else noPoster(g, C, e, px, py, pw, ph, 10);
        const tx = px + pw + 26, boxW = 150, tw = W - P - 24 - boxW - 20 - tx;
        g.textAlign = 'left'; g.fillStyle = C.text; g.font = '600 38px Oswald, sans-serif';
        g.fillText(fit(g, e.title || 'Untitled', tw), tx, ry + rowH / 2 - 4);
        g.fillStyle = C.text2; g.font = '500 23px Manrope, sans-serif';
        g.fillText(fit(g, [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : '', (e.genres || [])[0]].filter(Boolean).join('  ·  '), tw), tx, ry + rowH / 2 + 34);
        const bx = W - P - 24 - boxW, bh = rowH - 40, by = ry + 20, s = scoreText(e);
        g.strokeStyle = C.edge; g.lineWidth = 2; rr(g, bx, by, boxW, bh, 14); g.stroke();
        g.textAlign = 'center';
        if (s) {
          g.fillStyle = C.text3; g.font = '600 15px Oswald, sans-serif'; spaced(g, 'SCORE', bx + boxW / 2, by + 26, 2.5, 'center');
          g.fillStyle = C.accent; g.font = `400 ${Math.min(62, bh - 30)}px "Bebas Neue", sans-serif`; g.textAlign = 'center';
          g.fillText(s, bx + boxW / 2, by + bh - 14);
        } else { g.fillStyle = C.text3; g.font = '600 19px Manrope, sans-serif'; g.fillText(fit(g, statusText(e), boxW - 16), bx + boxW / 2, by + bh / 2 + 7); }
      });
    } else {
      // a poster grid: 5 across, rank on the poster, score + title under it
      const n = list.length, cols = Math.min(5, Math.max(n, 1)), rows = Math.ceil(n / 5) || 1, gap = 22;
      const top = y + 14, bottom = H - 96, cw = (W - P * 2 - gap * (cols - 1)) / cols;
      const cellH = (bottom - top - 26 * (rows - 1)) / rows, under = 76;
      const ph = Math.min(cellH - under, cw * 1.5), pw = ph * 2 / 3;
      list.forEach((e, i) => {
        const c = i % 5, r = Math.floor(i / 5), cx = P + c * (cw + gap), cy = top + r * (cellH + 26), px = cx + (cw - pw) / 2;
        if (pics[i]) cover(g, pics[i], px, cy, pw, ph, 12); else noPoster(g, C, e, px, cy, pw, ph, 12);
        g.strokeStyle = C.edge; g.lineWidth = 2; rr(g, px, cy, pw, ph, 12); g.stroke();
        rankTab(g, px, cy, 12, i + 1, Math.round(pw * 0.22));
        g.textAlign = 'center';
        const s = scoreText(e);
        if (s) { g.fillStyle = C.accent; g.font = '400 42px "Bebas Neue", sans-serif'; g.fillText(s, cx + cw / 2, cy + ph + 44); }
        else { g.fillStyle = C.text3; g.font = '600 18px Manrope, sans-serif'; g.fillText(fit(g, statusText(e), cw), cx + cw / 2, cy + ph + 38); }
        g.fillStyle = C.text; g.font = '600 19px Manrope, sans-serif';
        g.fillText(fit(g, e.title || 'Untitled', cw - 4), cx + cw / 2, cy + ph + 70);
      });
    }

    // footer: avatar @username · MYSCREENFOLIO
    const fy = H - (story ? 64 : 44);
    g.fillStyle = C.edge; g.fillRect(P, fy - (story ? 46 : 36), W - P * 2, 1.5);
    let fx = P;
    if (user) {
      const a = story ? 40 : 32;
      if (av) { g.save(); g.beginPath(); g.arc(fx + a / 2, fy - a / 2 + 8, a / 2, 0, Math.PI * 2); g.clip(); g.drawImage(av, fx, fy - a + 8, a, a); g.restore(); }
      else { g.fillStyle = C.accent; g.beginPath(); g.arc(fx + a / 2, fy - a / 2 + 8, a / 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = job.theme === 'light' ? '#fff' : '#0A0A0E'; g.font = `600 ${a * 0.5}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillText(user[0].toUpperCase(), fx + a / 2, fy - a / 2 + 8 + a * 0.18); }
      fx += a + 14;
      g.textAlign = 'left'; g.fillStyle = C.text2; g.font = `600 ${story ? 26 : 22}px Manrope, sans-serif`; g.fillText('@' + user, fx, fy);
      fx += g.measureText('@' + user).width + 14; g.fillStyle = C.text3; g.fillText('·', fx, fy); fx += 22;
    }
    g.fillStyle = C.text3; g.font = `600 ${story ? 24 : 20}px Oswald, sans-serif`; spaced(g, 'MYSCREENFOLIO', fx, fy, 3);
    if (job.taste || job.year || list.some(e => scoreText(e))) { g.font = `500 ${story ? 22 : 19}px Manrope, sans-serif`; g.textAlign = 'right'; g.fillText('Scores out of 10', W - P, fy); }
    return true;
  }

  return { draw, MAX };
})();
