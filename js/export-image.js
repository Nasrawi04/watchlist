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
    dark:  { dark: true, bg: '#04130A', card: '#1A2E20', track: '#26362B', edge: 'rgba(129,178,144,0.55)', text: '#E9E4D2', text2: '#C7C4B7', text3: '#AEAB9F', accent: '#A6CCB1', brass: '#C5A15B', glow: 'rgba(129,178,144,0.28)' },
    light: { dark: false, bg: '#F3EEDC', card: '#FEFCF3', track: '#E6E0CA', edge: 'rgba(31,77,51,0.4)', text: '#1E2A22', text2: '#3A453E', text3: '#525E56', accent: '#24583A', brass: '#7A5A22', glow: 'rgba(31,77,51,0.12)' },
  };
  const imgs = new Map();   // url → Promise<HTMLImageElement | null>, kept for the session
  function load(url) {
    if (!url) return Promise.resolve(null);
    if (!imgs.has(url)) imgs.set(url, new Promise(res => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 8000);
      im.onload = () => { clearTimeout(t); res(im); };
      // a copy the browser cached without CORS fails at once: ask again past the cache (as Create Card does)
      im.onerror = () => { const im2 = new Image(); im2.crossOrigin = 'anonymous'; im2.onload = () => { clearTimeout(t); res(im2); }; im2.onerror = () => { clearTimeout(t); res(null); };
        im2.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now(); };
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
  /* ── the 9-tier rating scale (config.js MSS_TIERS / mssScoreTier) — every score drawn here takes its tier's colour.
     dark = the dark values: a dark image, and anything on a photo (the hero, the tiles) whatever the theme. ── */
  const tierOf = (v, dark) => v == null || typeof mssScoreTier !== 'function' ? null : mssScoreTier(v, { dark });
  const goldGrad = (g, x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); (typeof MSS_GOLD_STOPS !== 'undefined' ? MSS_GOLD_STOPS : [[0, '#F3DC8A'], [0.5, '#C9A227'], [1, '#8A6300']]).forEach(([s, c]) => gr.addColorStop(s, c)); return gr; };
  const lift = (hex, a) => { const n = parseInt(hex.slice(1), 16), m = c => Math.round(c + (255 - c) * a); return `rgb(${m(n >> 16 & 255)},${m(n >> 8 & 255)},${m(n & 255)})`; };
  // a score's number colour (the deep purple / red lifted on dark, as the site's ring does)
  function numInk(v, dark, fb) { const t = tierOf(v, dark); if (!t) return fb; return dark && (t.key === 'garbage' || t.key === 'bad') ? lift(t.ink, 0.45) : t.ink; }
  // a bar / column / fill in its tier's colour (Masterpiece: the gold gradient across that box)
  function fillOf(g, v, dark, fb, x, y, w, h) { const t = tierOf(v, dark); return !t ? fb : t.gold ? goldGrad(g, x, y, w, h) : t.bg; }
  // the site's score ring (MSSViews.ring — .tv-ring): a track, the arc to score / 10 in the tier's colour, the number in Bebas
  function ring(g, cx, cy, R, v, o = {}) {
    const t = tierOf(v, o.dark); if (!t) return;
    const lw = o.lw || Math.max(3, R * 0.15), f = Math.max(0, Math.min(1, v / 10));
    g.save();
    if (o.disc) { g.fillStyle = o.disc; g.beginPath(); g.arc(cx, cy, R + lw * 1.4, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = lw; g.lineCap = 'round';
    g.strokeStyle = o.track || (o.dark ? 'rgba(255,255,255,.18)' : 'rgba(30,42,34,.14)'); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = t.gold ? goldGrad(g, cx - R, cy - R, R * 2, R * 2) : t.bg;
    g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); g.stroke();
    g.fillStyle = numInk(v, o.dark); g.font = `400 ${Math.round(R * 0.8)}px "Bebas Neue", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(Number(v).toFixed(2), cx, cy + R * 0.07);
    g.restore(); g.textBaseline = 'alphabetic';
  }
  // a photo cropped to fill, in its owner's framing (MSSBackdrop.pos: { x, y, z } — default centred, 25% from the top)
  function coverAt(g, im, x, y, w, h, r, p) {
    p = p || { x: 50, y: 25, z: 1 };
    g.save(); rr(g, x, y, w, h, r); g.clip();
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight) * (p.z || 1), iw = im.naturalWidth * s, ih = im.naturalHeight * s;
    g.drawImage(im, x + (w - iw) * p.x / 100, y + (h - ih) * p.y / 100, iw, ih);
    g.restore();
  }
  // the dark shade over a photo (as .pf-fav-shade / .mh-fav-shade), so the title and the ring read
  function shade(g, x, y, w, h, r, side) {
    g.save(); rr(g, x, y, w, h, r); g.clip();
    const v = g.createLinearGradient(0, y + h, 0, y);
    v.addColorStop(0, 'rgba(4,19,10,.94)'); v.addColorStop(.42, 'rgba(4,19,10,.5)'); v.addColorStop(.75, 'rgba(4,19,10,.08)'); v.addColorStop(1, 'rgba(4,19,10,0)');
    g.fillStyle = v; g.fillRect(x, y, w, h);
    if (side) { const s = g.createLinearGradient(x, 0, x + w * 0.6, 0); s.addColorStop(0, 'rgba(4,19,10,.45)'); s.addColorStop(1, 'rgba(4,19,10,0)'); g.fillStyle = s; g.fillRect(x, y, w, h); }
    g.restore();
  }
  // text wrapped to at most `max` lines (the last one shortened with …) → the lines
  function wrap(g, s, w, max) {
    const words = String(s || '').split(/\s+/), out = [];
    let cur = '';
    for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width <= w || !cur) cur = t; else { out.push(cur); cur = wd; } }
    if (cur) out.push(cur);
    if (out.length > max) { const keep = out.slice(0, max); keep[max - 1] = fit(g, out.slice(max - 1).join(' '), w); return keep; }
    return out.map(l => fit(g, l, w));
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
    const tiles = [[t.rated, 'TITLES RATED'], [t.avg.toFixed(2), 'AVERAGE SCORE', 0, t.avg], [t.genres[0]?.name || '—', 'TOP GENRE', 1], [t.favDecade?.name || '—', 'FAVOURITE DECADE', 1]];
    const cols = story ? 2 : 4, gap = story ? 18 : 14, tw = (W - P * 2 - gap * (cols - 1)) / cols, th = story ? 170 : 112;
    y += story ? 26 : 12;
    tiles.forEach(([v, l, word, sc], i) => {
      const x = P + (i % cols) * (tw + gap), yy = y + Math.floor(i / cols) * (th + gap);
      card(x, yy, tw, th);
      g.textAlign = 'left'; g.fillStyle = sc != null ? numInk(sc, C.dark, C.accent) : C.accent;
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
        const fw = Math.max(16, bw * x.avg / 10);
        g.fillStyle = fillOf(g, x.avg, C.dark, C.accent, P + lw, yy, fw, 16); rr(g, P + lw, yy + rowH * 0.36, fw, story ? 16 : 12, story ? 8 : 6); g.fill();
        g.fillStyle = numInk(x.avg, C.dark, C.accent); g.font = `400 ${story ? 44 : 36}px "Bebas Neue", sans-serif`; g.textAlign = 'right'; g.fillText(x.avg.toFixed(2), W - P, yy + rowH * 0.7);
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
          g.fillStyle = numInk(c.avg, C.dark, C.accent); g.font = `400 ${story ? 58 : 40}px "Bebas Neue", sans-serif`; g.fillText(c.avg.toFixed(2), x + 24, y + ch - (story ? 26 : 18));
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
        if (h) { g.fillStyle = fillOf(g, k + 1, C.dark, C.accent, x, y + chH - h, cw, h); rr(g, x, y + chH - h, cw, h, 10); g.fill(); }
        g.textAlign = 'center'; g.fillStyle = numInk(k + 1, C.dark, C.text2); g.font = '400 34px "Bebas Neue", sans-serif'; g.fillText(String(k + 1), x + cw / 2, y + chH + 38);
      });
    }
  }

  // The year in review (year-review.js), story only, three slides:
  //   overview — the year huge, 4 tiles, highlights · top — your best 5 with posters · months — month by month, genres, first & last
  function yearBody(g, C, yv, slide, W, H, P, y, pics) {
    const card = (x, yy, w, h) => { g.fillStyle = C.card; rr(g, x, yy, w, h, 20); g.fill(); g.strokeStyle = C.edge; g.lineWidth = 2; g.stroke(); };
    const label = (s, yy) => { g.fillStyle = C.accent; g.font = '600 24px Oswald, sans-serif'; g.textAlign = 'left'; spaced(g, s, P, yy, 3.5); };
    const tile = (x, yy, w, h, v, l, word, sc) => {
      card(x, yy, w, h); g.textAlign = 'left'; g.fillStyle = sc != null ? numInk(sc, C.dark, C.accent) : C.accent;
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
        const px = P + 28, py = ry + 18;
        if (pics[i]) cover(g, pics[i], px, py, pw, ph, 12); else noPoster(g, C, x.e, px, py, pw, ph, 12);
        rankTab(g, px, py, 12, i + 1, Math.round(pw * 0.3));
        const tx = px + pw + 30, tw = W - P - 200 - tx;
        g.textAlign = 'left'; g.fillStyle = C.text; g.font = '600 46px Oswald, sans-serif'; g.fillText(fit(g, x.e.title || 'Untitled', tw), tx, ry + rowH / 2 - 4);
        g.fillStyle = C.text2; g.font = '500 26px Manrope, sans-serif';
        g.fillText(fit(g, [CAT_META?.[x.e.cat]?.singular, x.e.year ? String(x.e.year).slice(0, 4) : ''].filter(Boolean).join('  ·  '), tw), tx, ry + rowH / 2 + 40);
        const R = Math.min(64, rowH / 2 - 26);
        ring(g, W - P - 34 - R, ry + rowH / 2, R, x.s, { dark: C.dark, track: C.track });
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
    [[yv.titles, 'TITLES FINISHED'], [yv.hours.toLocaleString('en-GB'), 'HOURS WATCHED'], [yv.avg != null ? yv.avg.toFixed(2) : '—', 'AVERAGE SCORE', 0, yv.avg], [yv.genres[0]?.name || '—', 'TOP GENRE', 1]]
      .forEach(([v, l, w, sc], i) => tile(P + (i % 2) * (half + gap), y + Math.floor(i / 2) * (th + gap), half, th, v, l, w, sc));
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
    const story = job.year ? true : job.size !== 'square';
    // the top-10 story uses each title's backdrop (its owner's choice — MSSBackdrop), like the profile's Top Favorites
    const bdOf = e => typeof MSSBackdrop === 'undefined' ? Promise.resolve(null) : MSSBackdrop.url(e, 'w780').then(load, () => null);
    const [pics, av, bds] = await Promise.all([Promise.all(list.map(e => load(poster(e.poster_url)))), job.anon || !job.who?.avatar_url ? null : load(safeURL(job.who.avatar_url)),
      story && !job.year && !job.taste ? Promise.all(list.map(bdOf)) : []]);
    if (my !== token) return false;
    const W = 1080, H = story ? 1920 : 1080, P = story ? 72 : 60;
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
      if (t === 'SCREEN') { g.fillStyle = C.brass; g.fillRect(x, wy + 8, w, 3); }
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
      // the profile's Top Favorites look (.pf-fav): #1 a full-bleed backdrop hero, then #2–#10 as tiles — rank badge in the corner,
      // title along the bottom, the score ring on the right (dark tier colours: they sit on photos)
      const top = y + 18, bottom = H - 150, gap = 18, n = list.length;
      const rest = n - 1, cols = rest > 4 ? 3 : rest > 1 ? 2 : 1, rows = Math.ceil(rest / cols);
      const heroH = rest ? Math.min(520, Math.round((bottom - top) * (rows > 2 ? 0.34 : 0.46))) : bottom - top;
      const tileH = rows ? Math.min(420, (bottom - top - heroH - gap * rows) / rows) : 0, tw = (W - P * 2 - gap * (cols - 1)) / cols;
      const photo = (e, i, x, yy, w, h) => {
        const bd = bds[i], im = bd || pics[i];
        g.fillStyle = '#122619'; rr(g, x, yy, w, h, 24); g.fill();
        if (im) {
          if (!bd) { g.save(); rr(g, x, yy, w, h, 24); g.clip(); g.filter = 'blur(14px) saturate(1.1)'; coverAt(g, im, x - 30, yy - 30, w + 60, h + 60, 0); g.restore(); }
          else coverAt(g, im, x, yy, w, h, 24, typeof MSSBackdrop !== 'undefined' ? MSSBackdrop.pos(e, i ? 'fav' : 'desk') : null);
        }
        shade(g, x, yy, w, h, 24, !i);
        g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2; rr(g, x + 1, yy + 1, w - 2, h - 2, 23); g.stroke();
        rankTab(g, x, yy, 24, i + 1, Math.round(i ? Math.min(54, w * 0.17) : 76));
      };
      const tileText = (e, i, x, yy, w, h, big) => {
        const s = MSSPdf.score(e), kind = MSSPdf.kindOf(e), pad = big ? 34 : 22;
        const R = s != null && kind === 'watched' ? (big ? 70 : Math.round(Math.min(46, w * 0.15))) : 0;
        if (R) ring(g, x + w - pad - R, yy + h - pad - R, R, s, { dark: true, lw: big ? 10 : 7 });
        const textW = w - pad * 2 - (R ? R * 2 + 18 : 0);
        g.textAlign = 'left';
        g.font = `600 ${big ? 66 : Math.round(Math.min(34, w * 0.11))}px Oswald, sans-serif`;
        const lh = big ? 70 : Math.round(Math.min(34, w * 0.11) * 1.1), lines = wrap(g, e.title || 'Untitled', textW, 2);
        let ty = yy + h - pad - (big ? 6 : 2) - lh * (lines.length - 1);
        g.fillStyle = '#FFFFFF'; lines.forEach((l, k) => g.fillText(l, x + pad, ty + k * lh));
        const meta = [CAT_META?.[e.cat]?.singular, e.year ? String(e.year).slice(0, 4) : '', ...(big ? (e.genres || []).slice(0, 2) : [])].filter(Boolean).join('  ·  ');
        g.fillStyle = 'rgba(255,255,255,.74)'; g.font = `600 ${big ? 25 : 19}px Manrope, sans-serif`;
        if (meta) g.fillText(fit(g, meta, textW), x + pad, ty - (big ? 78 : lh + 2));
        if (!R) { const st = statusText(e); if (st) { g.font = `700 ${big ? 22 : 17}px Manrope, sans-serif`; const sw = g.measureText(st).width + 28, sh = big ? 42 : 34;
          g.fillStyle = 'rgba(4,19,10,.72)'; rr(g, x + w - pad - sw, yy + pad, sw, sh, sh / 2); g.fill(); g.fillStyle = '#E9E4D2'; g.textAlign = 'center'; g.fillText(st, x + w - pad - sw / 2, yy + pad + sh / 2 + 6); } }
      };
      if (n) { photo(list[0], 0, P, top, W - P * 2, heroH); tileText(list[0], 0, P, top, W - P * 2, heroH, true); }
      list.slice(1).forEach((e, k) => {
        const i = k + 1, c = k % cols, r = Math.floor(k / cols), x = P + c * (tw + gap), yy = top + heroH + gap + r * (tileH + gap);
        const last = k === rest - 1 && rest % cols ? (cols - c) * (tw + gap) - gap : tw;   // a lone tile at the end takes the row
        photo(e, i, x, yy, last, tileH); tileText(e, i, x, yy, last, tileH, false);
      });
    } else {
      // a poster grid: 5 across — the site's rank badge on the poster, the score ring over its corner, the title under it
      const n = list.length, cols = Math.min(5, Math.max(n, 1)), rows = Math.ceil(n / 5) || 1, gap = 22;
      const top = y + 14, bottom = H - 96, cw = (W - P * 2 - gap * (cols - 1)) / cols;
      const cellH = (bottom - top - 26 * (rows - 1)) / rows, under = 52;
      const ph = Math.min(cellH - under, cw * 1.5), pw = ph * 2 / 3;
      list.forEach((e, i) => {
        const c = i % 5, r = Math.floor(i / 5), cx = P + c * (cw + gap), cy = top + r * (cellH + 26), px = cx + (cw - pw) / 2;
        if (pics[i]) cover(g, pics[i], px, cy, pw, ph, 14); else noPoster(g, C, e, px, cy, pw, ph, 14);
        g.strokeStyle = C.edge; g.lineWidth = 2; rr(g, px, cy, pw, ph, 14); g.stroke();
        rankTab(g, px, cy, 14, i + 1, Math.round(pw * 0.22));
        const s = scoreText(e), R = Math.round(pw * 0.19);
        if (s) ring(g, px + pw - R - 12, cy + ph - R - 12, R, Number(s), { dark: true, lw: Math.max(4, R * 0.17), disc: 'rgba(4,19,10,.82)' });
        g.textAlign = 'center';
        if (!s) { const st = statusText(e); if (st) { g.fillStyle = C.text3; g.font = '600 16px Manrope, sans-serif'; g.fillText(fit(g, st, cw), cx + cw / 2, cy + ph + 48); } }
        g.fillStyle = C.text; g.font = '600 21px Oswald, sans-serif';
        g.fillText(fit(g, e.title || 'Untitled', cw - 4), cx + cw / 2, cy + ph + 30);
      });
    }

    // footer: avatar @username · MYSCREENFOLIO
    const fy = H - (story ? 64 : 44);
    g.fillStyle = C.edge; g.fillRect(P, fy - (story ? 46 : 36), W - P * 2, 1.5);
    let fx = P;
    if (user) {
      const a = story ? 40 : 32;
      if (av) { g.save(); g.beginPath(); g.arc(fx + a / 2, fy - a / 2 + 8, a / 2, 0, Math.PI * 2); g.clip(); cover(g, av, fx, fy - a + 8, a, a, 0); g.restore(); }   // portraits too: cropped to fill
      else { g.fillStyle = C.accent; g.beginPath(); g.arc(fx + a / 2, fy - a / 2 + 8, a / 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = job.theme === 'light' ? '#fff' : '#04130A'; g.font = `600 ${a * 0.5}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillText(user[0].toUpperCase(), fx + a / 2, fy - a / 2 + 8 + a * 0.18); }
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
