/* ══════════════════════════════════════════════════════════════
   ep-chart.js — a show's episode chart picture (MSSEpChart): seasons across,
   episodes down, every box in its score's colour band, an AVG row, the
   legend and your name. One drawing for everywhere, so it always looks the
   same: the Episodes page's Export and the Export Studio ("Episode ratings"
   — the image, and the first page of its PDF).

   MSSEpChart.load(tmdbId, userId, meId) → state { show, seasons, eps, mine, comm, entry,
                                           source, readOnly, … } (null if TMDB has no show)
   MSSEpChart.draw(canvas, state, {
     size: 'square' | 'story' | 'wide' | 'a4',   theme: 'dark' | 'light',
       (Square / Story start at 1080 × 1080 / 1920 and get taller for long seasons;
        Wide starts at 1600 × 900, shows seasons down and episodes across, and gets
        wider for long seasons; A4 stays one page. The canvas is sized by draw.)
     source: 'tmdb' | 'mine' | 'community' | 'diff',
     seasons: [numbers] (default every season), label: 'All seasons' (under the title),
     userId: whose name / avatar goes in the footer })
   MSSEpChart.scoreOf(state, source, season, ep) · key(season, ep) · blank()
   Requires config.js (mssFontsReady, safeURL), nav.js (tmdbFetch), episode-ratings.js (MSSEp).
══════════════════════════════════════════════════════════════ */
const MSSEpChart = (() => {
  const SIZES = { square: [1080, 1080], story: [1080, 1920], wide: [1600, 900], a4: [1240, 1754] };
  const blank = () => ({ show: null, seasons: [], eps: {}, mine: {}, comm: {}, entry: null, source: 'tmdb', view: 'grid', readOnly: false, whoName: '' });
  const key = (s, n) => `${s}:${n}`;
  const avg = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  function scoreOf(st, src, s, ep) {
    const k = key(s, ep.n);
    if (src === 'tmdb') return ep.vote ? Math.round(ep.vote * 10) / 10 : null;
    if (src === 'mine') return st.mine[k] ? Number(st.mine[k].score) : null;
    if (src === 'community') return st.comm[k] ? Number(st.comm[k].avg_score) : null;
    return st.mine[k] && ep.vote ? Math.round((Number(st.mine[k].score) - ep.vote) * 10) / 10 : null;   // mine vs tmdb
  }

  // A show + its TMDB episodes, someone's ratings of it and the community's
  async function load(tmdbId, userId, meId) {
    const X = blank();
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}&language=en-US&append_to_response=images&include_image_language=en,null`);
    if (!res.ok) return null;
    X.show = await res.json();
    X.seasons = (X.show.seasons || []).filter(x => x.season_number > 0 && x.episode_count > 0).map(x => x.season_number);
    for (let i = 0; i < X.seasons.length; i += 4) {                 // TMDB episodes, 4 seasons at a time (cached)
      const chunk = X.seasons.slice(i, i + 4);
      const lists = await Promise.all(chunk.map(sn => MSSEp.seasonEpisodes(tmdbId, sn)));
      chunk.forEach((sn, j) => { X.eps[sn] = lists[j]; });
    }
    const { data: entry } = await sb.from('entries').select('*').eq('user_id', userId).eq('tmdb_id', tmdbId).eq('tmdb_type', 'tv').limit(1).maybeSingle();
    X.entry = entry || null;
    X.readOnly = userId !== meId;
    if (X.entry) {
      const { data } = await sb.from('episode_ratings').select('*').eq('entry_id', X.entry.id);
      (data || []).forEach(r => { X.mine[key(r.season_number, r.episode_number)] = r; });
    }
    try {
      const { data: comm } = await sb.rpc('get_episode_community', { p_tmdb_id: tmdbId });
      (comm || []).forEach(r => { X.comm[key(r.season_number, r.episode_number)] = r; });
    } catch {}
    return X;
  }

  // The pictures (backdrop, poster, logo, avatar) load once per show + person, then every redraw reuses them
  const imgCache = {};
  async function images(show, userId) {
    const id = `${show.id}:${userId || ''}`;
    if (imgCache[id]) return imgCache[id];
    // A poster already on the page is cached without CORS headers, so ask with a
    // cache-busting query first (same approach as the share cards).
    // Load an image the canvas is allowed to export. A picture without CORS
    // headers would "taint" the canvas (no download), so each one is checked
    // and, if needed, fetched through wsrv.nl — a free image proxy that adds them.
    const usable = im => { try { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 1, 1); x.getImageData(0, 0, 1, 1); return true; } catch { return false; } };
    const tryLoad = (src, cors) => new Promise(ok => {
      const im = new Image(); if (cors) im.crossOrigin = 'anonymous';
      const t = setTimeout(() => ok(null), 8000);
      im.onload = () => { clearTimeout(t); ok(usable(im) ? im : null); };
      im.onerror = () => { clearTimeout(t); ok(null); };
      im.src = src;
    });
    const load = async (src, cors = true) => {
      if (!src) return null;
      if (!cors) return tryLoad(src, false);
      return (await tryLoad(src + (src.includes('?') ? '&' : '?') + '_cb=' + Date.now(), true))
          || tryLoad('https://wsrv.nl/?url=' + encodeURIComponent(src.replace(/^https?:\/\//, '')), true);
    };
    const { data: who } = userId ? await sb.from('profiles').select('username,avatar_url').eq('id', userId).maybeSingle() : { data: null };
    const [backdrop, poster, logo, avatar] = await Promise.all([
      load(show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : null),
      load(show.poster_path ? `https://image.tmdb.org/t/p/w342${show.poster_path}` : null),
      load('icons/logo-nav.png', false),   // same site — no CORS needed (artwork: 467×198 at 20,61)
      load(safeURL(who?.avatar_url)),
    ]);
    return (imgCache[id] = { who, backdrop, poster, logo, avatar });
  }

  /* ── The picture ──
     A rounded card on a frame. Square: header · the chart on the left · stats on
     the right · legend · footer. Story: header · "Episode ratings by season" ·
     the chart full width · legend · footer (no stats).
     Wide:   the chart sideways (seasons down, episodes across) · stats on the right.
     A4:     like Story, on a fixed page (the Export Studio's PDF).
     The chart keeps to the left and the picture grows with the show: longer seasons
     make Square / Story taller, more episodes make Wide wider (up to a limit, then
     the boxes shrink — numbers hide once they're too small to read). */
  const BAND_MIN = { perfect: '10', masterpiece: '9.5+', great: '8.5+', good: '7.5+', decent: '6.5+', meh: '5.0+', bad: '< 5' };
  const iconCache = {};
  function iconImg(name, color) {
    const id = name + color;
    if (iconCache[id]) return iconCache[id];
    const svg = (ICONS[name] || '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" ').replace(/currentColor/g, color);
    return (iconCache[id] = new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }));
  }
  function stats(st, src, seasons, scored) {
    if (!scored.length || src === 'diff') return null;
    const vs = scored.map(x => x.v), a = avg(vs);
    const best = scored.reduce((b, x) => x.v > b.v ? x : b), worst = scored.reduce((b, x) => x.v < b.v ? x : b);
    const bySeason = seasons.map(sn => ({ sn, a: avg(scored.filter(x => x.s === sn).map(x => x.v)) })).filter(x => x.a != null);
    const bestS = bySeason.length > 1 ? bySeason.reduce((b, x) => x.a > b.a ? x : b) : null;
    const today = new Date().toISOString().slice(0, 10);
    const aired = seasons.reduce((t, sn) => t + (st.eps[sn] || []).filter(ep => !ep.air || ep.air <= today).length, 0);
    const great = scored.filter(x => x.v >= 8.5).length;
    const sd = Math.sqrt(vs.reduce((t, v) => t + (v - a) ** 2, 0) / vs.length);
    const f = v => v >= 10 ? '10' : v.toFixed(1);
    return [
      ['ratingStar', 'Series average', a.toFixed(2), MSSEp.band(a).name, MSSEp.band(a).key],
      ['trophy', 'Best episode', f(best.v), `S${best.s} · E${best.ep.n}`, MSSEp.band(best.v).key],
      ['thumbsDown', 'Lowest episode', f(worst.v), `S${worst.s} · E${worst.ep.n}`, MSSEp.band(worst.v).key],
      ...(bestS ? [['crown', 'Best season', `S${bestS.sn} · ${bestS.a.toFixed(1)}`, '', MSSEp.band(bestS.a).key]] : []),
      ['sparkles', 'Great or better', Math.round(100 * great / vs.length) + '%', `${great} / ${vs.length}`, null],
      ['activity', 'Consistency', vs.length > 1 ? sd.toFixed(2) : '—', '± spread', null],
      ['episodes', 'Episodes scored', String(vs.length), `of ${Math.max(aired, vs.length)}`, null],
    ];
  }

  async function draw(cv, st, o = {}) {
    await mssFontsReady();   // the site's fonts, every weight the picture uses (config.js)
    const size = SIZES[o.size] ? o.size : 'square', src = o.source || st.source, seasons = o.seasons || st.seasons;
    const wide = size === 'wide', story = size === 'story', a4 = size === 'a4', tall = story || a4;
    const sco = (sn, ep) => scoreOf(st, src, sn, ep);
    const scored = [];
    seasons.forEach(sn => (st.eps[sn] || []).forEach(ep => { const v = sco(sn, ep); if (v != null) scored.push({ s: sn, ep, v }); }));
    const { who, backdrop, poster, logo, avatar } = await images(st.show, o.userId);
    const dark = o.theme === 'dark';
    const C = dark
      ? { frame: '#080a09', page: '#141a16', panel: '#1a221d', card: '#202a23', text: '#eeebe5', sub: '#9aa39c', line: '#29332c', empty: '#1f2822', dash: '#58615a', olive: '#8cc276', icon: '#c9cfc8' }
      : { frame: '#e6dfd3', page: '#f6f2ea', panel: '#fdfbf7', card: '#ece6db', text: '#1b1f1c', sub: '#6a706a', line: '#e2dacd', empty: '#ece6dc', dash: '#a8a196', olive: '#2f6a2c', icon: '#3a3f3b' };
    // the picture's own colour scale — softer than the site's, dark text on the light ones
    const PAL = { masterpiece: '#1f4527', great: '#4a7f3f', good: '#b7d39d', decent: '#f0cd60', meh: '#ea9a4b', bad: '#cf5148' };
    const u = a4 ? 1.15 : 1, px = v => Math.round(v * u);
    const maxEp = Math.max(1, ...seasons.map(sn => (st.eps[sn] || []).length));
    const SS = stats(st, src, seasons, scored), showStats = !!SS && !tall;
    const [W0, H0] = SIZES[size];
    const M = px(26), P = px(44);                        // frame margin · padding inside the card
    const headH = px(wide ? 300 : tall ? 360 : 330), lap = px(26), bodyTop = M + headH - lap;
    const statsW = showStats ? px(wide ? 370 : 330) : 0, statsGap = showStats ? px(34) : 0;
    const legendRowH = tall ? px(54) : px(34), footH = px(100), secH = tall ? px(70) : 0;
    const labW = px(wide ? 70 : maxEp >= 100 ? 96 : 84), headRow = px(48);
    const legendItems = src === 'diff' ? [['#2f6e3a', 'Higher than TMDB', ''], [C.empty, 'Same', ''], ['#a8433b', 'Lower than TMDB', '']]
      : [...MSSEp.BANDS.map(b => [b.key === 'perfect' ? 'gold' : PAL[b.key], b.name, BAND_MIN[b.key]]), [null, 'Not rated', '']];
    const g = cv.getContext('2d');
    const chip = px(20), itemGap = px(28);
    const itemW = ([, name, min]) => { g.font = `500 ${px(17)}px Manrope, sans-serif`; let w = chip + px(10) + g.measureText(name).width;
      if (min && !tall) { g.font = `500 ${px(15)}px Manrope, sans-serif`; w += px(8) + g.measureText(min).width; } return w; };
    const tallPer = width => { const fit = Math.max(1, Math.floor(width / (Math.max(...legendItems.map(itemW)) + px(18)))); return Math.ceil(legendItems.length / Math.ceil(legendItems.length / fit)); };
    const legendRows = width => { if (tall) return Math.ceil(legendItems.length / tallPer(width)); let rows = 1, x = 0; legendItems.forEach(it => { const w = itemW(it); if (x && x + w > width) { rows++; x = 0; } x += w + itemGap; }); return rows; };

    // ── How big each box is, and how big the picture has to be ──
    let W = W0, H = H0, step, colStep;
    const bottomFixed = px(36) + footH + M;              // legend gap + footer + frame
    if (!wide) {
      const gridW = W - 2 * (M + P) - statsW - statsGap;
      colStep = Math.min(px(tall ? 270 : 200), (gridW - labW) / seasons.length);
      const rows = maxEp + 1.6;                          // + the AVG row and the gap above it
      const fixed = bodyTop + px(40) + secH + headRow + legendRows(gridW) * legendRowH + bottomFixed;
      const statsNeed = showStats ? bodyTop + px(40) + px(70) + SS.length * px(96) + px(30) + footH + M : 0;
      const maxStep = px(story ? 96 : a4 ? 76 : 54), pref = px(46), minStep = px(9), cap = H0 * (story ? 2.6 : 3);
      step = (H0 - fixed) / rows;
      if (step > maxStep) step = maxStep;
      else if (step < pref) {
        if (a4) step = Math.max(minStep, step);
        else { step = pref; H = Math.ceil(fixed + rows * step); if (H > cap) { H = cap; step = Math.max(minStep, (cap - fixed) / rows); } }
      }
      H = Math.max(H, statsNeed);
    } else {
      const nCols = maxEp + 1.4;                         // + AVG and the gap before it
      const gridW = () => W - 2 * (M + P) - statsW - statsGap - labW;
      colStep = gridW() / nCols;
      if (colStep > px(96)) colStep = px(96);
      else if (colStep < px(56)) { W = Math.ceil(2 * (M + P) + statsW + statsGap + labW + nCols * px(56)); colStep = px(56); if (W > 4200) { W = 4200; colStep = Math.max(px(10), gridW() / nCols); } }
      const fixed = bodyTop + px(40) + headRow + legendRows(W - 2 * (M + P) - statsW - statsGap) * legendRowH + bottomFixed;
      const statsNeed = bodyTop + px(40) + px(70) + (SS ? SS.length : 0) * px(80) + px(30) + footH + M;
      step = Math.min(px(62), (H0 - fixed) / seasons.length);
      if (step < px(48)) { step = px(48); H = Math.ceil(fixed + seasons.length * step); if (H > 2800) { H = 2800; step = Math.max(px(9), (H - fixed) / seasons.length); } }
      if (showStats) H = Math.max(H, statsNeed);
    }
    const cellW = colStep - Math.max(2, Math.min(px(12), colStep * 0.08)), cellH = Math.max(4, step - Math.max(2, Math.min(px(12), step * 0.22)));
    W = Math.round(W); H = Math.round(H);
    cv.width = W; cv.height = H;
    const gold = (x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); [[0, '#b9820f'], [0.28, '#e9b73a'], [0.44, '#fff0b3'], [0.58, '#efc24a'], [1, '#a8740c']].forEach(([p, c]) => gr.addColorStop(p, c)); return gr; };
    const fill = (v, x, y, w, h) => src === 'diff' ? (Math.abs(v) < 0.3 ? C.empty : v > 0 ? '#2f6e3a' : '#a8433b')
      : MSSEp.band(v).key === 'perfect' ? gold(x, y, w, h) : PAL[MSSEp.band(v).key];
    const ink = v => src === 'diff' ? (Math.abs(v) < 0.3 ? C.text : '#fff') : (MSSEp.band(v).ink ? (MSSEp.band(v).key === 'perfect' ? '#2b1e02' : '#1d2619') : '#fff');
    const fitText = (t, max) => { let s = t; while (g.measureText(s).width > max && s.length > 2) s = s.slice(0, -2) + '…'; return s; };
    const spaced = t => t.split('').join(String.fromCharCode(8202));   // a little letter-spacing

    // ── The card on its frame ──
    const cx = M, cw = W - 2 * M, ch = H - 2 * M, R = px(30);
    g.fillStyle = C.frame; g.fillRect(0, 0, W, H);
    g.save(); g.shadowColor = dark ? 'rgba(0,0,0,.6)' : 'rgba(60,45,25,.18)'; g.shadowBlur = px(30); g.shadowOffsetY = px(8);
    g.fillStyle = C.page; g.beginPath(); g.roundRect(cx, M, cw, ch, R); g.fill(); g.restore();

    // ── Header: dark, the backdrop on the right fading in, poster, title, average ──
    g.save(); g.beginPath(); g.roundRect(cx, M, cw, headH + R, [R, R, 0, 0]); g.clip();
    const hg = g.createLinearGradient(cx, 0, cx + cw, headH); hg.addColorStop(0, '#0a0e0c'); hg.addColorStop(1, '#13241a');
    g.fillStyle = hg; g.fillRect(cx, M, cw, headH + R);
    if (backdrop) {
      const bw = cw * 0.74, bh = headH, r = Math.max(bw / backdrop.width, bh / backdrop.height), dw = backdrop.width * r, dh = backdrop.height * r;
      g.drawImage(backdrop, cx + cw - dw + (dw - bw) * 0.25, M + (bh - dh) * 0.35, dw, dh);
      const fade = g.createLinearGradient(cx + cw - bw, 0, cx + cw - bw * 0.42, 0);
      fade.addColorStop(0, 'rgba(10,14,12,1)'); fade.addColorStop(1, 'rgba(10,14,12,0)');
      g.fillStyle = fade; g.fillRect(cx, M, cw - bw * 0.42, headH + R);
      const shade = g.createLinearGradient(0, M, 0, M + headH); shade.addColorStop(0, 'rgba(10,14,12,.15)'); shade.addColorStop(1, 'rgba(10,14,12,.5)');
      g.fillStyle = shade; g.fillRect(cx, M, cw, headH + R);
    }
    g.restore();
    const hIn = headH - lap, pH = hIn - px(68), pW = Math.round(pH * 2 / 3), pX = cx + P, pY = M + (hIn - pH) / 2;
    if (poster) {
      g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = px(26); g.shadowOffsetY = px(10);
      g.beginPath(); g.roundRect(pX, pY, pW, pH, px(14)); g.fillStyle = '#1a1f1c'; g.fill(); g.restore();
      g.save(); g.beginPath(); g.roundRect(pX, pY, pW, pH, px(14)); g.clip(); g.drawImage(poster, pX, pY, pW, pH); g.restore();
    }
    const sa = scored.length ? avg(scored.map(x => x.v)) : null, showBadge = sa != null && src !== 'diff';
    const bW = px(144), bH = px(120), bX = cx + cw - P - bW, bY = M + hIn - px(32) - bH;
    const tx = poster ? pX + pW + px(40) : pX, tMax = cx + cw - P - tx - (showBadge ? bW + px(30) : 0), mid = M + hIn / 2;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#8cc276'; g.font = `600 ${px(20)}px Manrope, sans-serif`;
    g.fillText(spaced(({ tmdb: 'EPISODE RATINGS · TMDB', mine: 'EPISODE RATINGS', community: 'EPISODE RATINGS · COMMUNITY', diff: 'MY RATINGS VS TMDB' })[src]), tx, mid - px(50));
    let tSize = px(76);
    g.font = `600 ${tSize}px Oswald, sans-serif`;
    while (g.measureText(st.show.name).width > tMax && tSize > px(42)) { tSize -= 2; g.font = `600 ${tSize}px Oswald, sans-serif`; }
    g.fillStyle = '#ffffff'; g.fillText(fitText(st.show.name, tMax), tx, mid + px(28));
    const years = [(st.show.first_air_date || '').slice(0, 4), st.show.status === 'Ended' ? (st.show.last_air_date || '').slice(0, 4) : 'Present'].filter(Boolean).join('–');
    const sub = [years, o.label || `${seasons.length} season${seasons.length === 1 ? '' : 's'}`,
      src === 'mine' ? `${scored.length} rated by you` : src === 'tmdb' ? 'TMDB scores' : src === 'community' ? 'MSF community scores' : ''].filter(Boolean).join('  •  ');
    g.fillStyle = 'rgba(255,255,255,.72)'; g.font = `500 ${px(22)}px Manrope, sans-serif`;
    g.fillText(fitText(sub, tMax), tx, mid + px(72));
    if (showBadge) {
      const b = MSSEp.band(sa);
      g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = px(20);
      g.fillStyle = b.key === 'perfect' ? gold(bX, bY, bW, bH) : PAL[b.key]; g.beginPath(); g.roundRect(bX, bY, bW, bH, px(16)); g.fill(); g.restore();
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(bX + .75, bY + .75, bW - 1.5, bH - 1.5, px(16)); g.stroke();
      g.fillStyle = b.ink ? '#1d2619' : '#fff'; g.textAlign = 'center';
      g.font = `600 ${px(62)}px Oswald, sans-serif`; g.fillText(sa >= 10 ? '10' : sa.toFixed(1), bX + bW / 2, bY + bH * 0.6);
      g.font = `600 ${px(17)}px Oswald, sans-serif`; g.fillText(spaced(b.name.toUpperCase()), bX + bW / 2, bY + bH * 0.85);
    }

    // ── Body: the light panel, its rounded top over the header ──
    g.fillStyle = C.page; g.beginPath(); g.roundRect(cx, bodyTop, cw, H - M - bodyTop, [lap, lap, R, R]); g.fill();
    const gridX = cx + P, gridRight = cx + cw - P - statsW - statsGap;
    const chartH = secH + headRow + (maxEp + 1.6) * step + px(36) + legendRows(gridRight - gridX) * legendRowH;
    const spare = tall ? Math.max(0, (H - M - footH - bodyTop - px(40)) - chartH - px(10)) : 0;
    let y = bodyTop + px(40) + spare / 2;
    if (secH) {                                          // "EPISODE RATINGS BY SEASON" between two lines
      g.font = `600 ${px(18)}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const t = spaced(spaced('EPISODE RATINGS BY SEASON')), tw = g.measureText(t).width + px(44), lineW = (cw - 2 * P - tw) / 2;
      g.fillStyle = C.line; g.fillRect(gridX, y + px(16), lineW, 1.5); g.fillRect(cx + cw - P - lineW, y + px(16), lineW, 1.5);
      g.fillStyle = C.olive; g.fillText(t, cx + cw / 2, y + px(17));
      y += secH;
    }
    const gridTop = y;
    const showNums = cellW >= px(22) && cellH >= px(15);
    const numPx = Math.max(px(10), Math.min(px(tall ? 24 : 21), cellH * 0.5, cellW * 0.34));
    const rad = Math.max(2, Math.min(px(9), cellH * 0.22));
    const box = (x, yy, v) => {
      g.fillStyle = v == null ? C.empty : fill(v, x, yy, cellW, cellH);
      g.beginPath(); g.roundRect(x, yy, cellW, cellH, rad); g.fill();
      if (!showNums) return;
      g.font = `600 ${numPx}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (v == null) { g.fillStyle = C.dash; g.fillText('–', x + cellW / 2, yy + cellH / 2 + 1); return; }
      g.fillStyle = ink(v); g.fillText(src === 'diff' ? (v > 0 ? '+' : '') + v.toFixed(1) : v >= 10 ? '10' : v.toFixed(1), x + cellW / 2, yy + cellH / 2 + 1);
    };
    const labFont = h => `600 ${Math.max(px(10), Math.min(px(20), h * 0.5))}px Manrope, sans-serif`;
    let gridBottom;
    if (!wide) {
      // seasons across, episodes down
      const every = Math.max(1, Math.ceil(px(34) / colStep));
      g.fillStyle = C.text; g.font = `600 ${px(20)}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      seasons.forEach((sn, i) => { if (i % every === 0) g.fillText('S' + sn, gridX + labW + i * colStep + cellW / 2, gridTop + headRow / 2); });
      const top = gridTop + headRow, rowsH = maxEp * step - (step - cellH), ay = top + (maxEp + 0.6) * step;
      const lEvery = step >= px(22) ? 1 : Math.ceil(px(22) / step) * 5;
      if (!tall && step >= px(22)) {                     // Square: the episode names on one soft column with lines between
        g.fillStyle = C.panel; g.beginPath(); g.roundRect(gridX, top - px(6), labW - px(14), rowsH + px(12), px(12)); g.fill();
        g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.roundRect(gridX + .5, top - px(6) + .5, labW - px(15), rowsH + px(11), px(12)); g.stroke();
        g.fillStyle = C.line; for (let e = 1; e < maxEp; e++) g.fillRect(gridX + px(10), top + e * step - (step - cellH) / 2, labW - px(34), 1);
      }
      for (let e = 1; e <= maxEp; e++) {
        const yy = top + (e - 1) * step;
        if (step >= px(22) || e === 1 || e % lEvery === 0) { g.fillStyle = C.text; g.font = step >= px(22) ? labFont(cellH) : `600 ${px(12)}px Manrope, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('E' + e, gridX + (step >= px(22) ? px(16) : 0), yy + cellH / 2 + 1); }
        seasons.forEach((sn, i) => { const ep = (st.eps[sn] || []).find(x => x.n === e); if (ep) box(gridX + labW + i * colStep, yy, sco(sn, ep)); });
      }
      const avgW = labW + seasons.length * colStep - (colStep - cellW);
      if (tall) { g.fillStyle = C.line; g.fillRect(gridX, ay - (0.6 * step) / 2 - px(1), avgW, 1.5); }
      else { g.fillStyle = C.card; g.beginPath(); g.roundRect(gridX - px(6), ay - px(7), avgW + px(12), cellH + px(14), px(12)); g.fill(); }
      g.fillStyle = C.text; g.font = labFont(cellH); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('AVG', gridX + px(16), ay + cellH / 2 + 1);
      seasons.forEach((sn, i) => box(gridX + labW + i * colStep, ay, avg((st.eps[sn] || []).map(ep => sco(sn, ep)))));
      gridBottom = ay + cellH + px(8);
    } else {
      // sideways: seasons down, episodes across
      const every = colStep >= px(36) ? 1 : Math.ceil(px(36) / colStep) * 5;
      g.fillStyle = C.text; g.font = `600 ${px(colStep >= px(46) ? 19 : 14)}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let e = 1; e <= maxEp; e++) if (e === 1 || e % every === 0) g.fillText('E' + e, gridX + labW + (e - 1) * colStep + cellW / 2, gridTop + headRow / 2);
      const avX = gridX + labW + (maxEp + 0.4) * colStep, top = gridTop + headRow, colH = seasons.length * step - (step - cellH);
      g.fillText('AVG', avX + cellW / 2, gridTop + headRow / 2);
      g.fillStyle = C.panel; g.beginPath(); g.roundRect(gridX, top - px(6), labW - px(12), colH + px(12), px(12)); g.fill();
      g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.roundRect(gridX + .5, top - px(6) + .5, labW - px(13), colH + px(11), px(12)); g.stroke();
      g.fillStyle = C.card; g.beginPath(); g.roundRect(avX - px(7), top - px(7), cellW + px(14), colH + px(14), px(12)); g.fill();
      seasons.forEach((sn, i) => {
        const yy = top + i * step;
        if (i) { g.fillStyle = C.line; g.fillRect(gridX + px(10), yy - (step - cellH) / 2, labW - px(32), 1); }
        g.fillStyle = C.text; g.font = labFont(cellH); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('S' + sn, gridX + px(15), yy + cellH / 2 + 1);
        (st.eps[sn] || []).forEach(ep => box(gridX + labW + (ep.n - 1) * colStep, yy, sco(sn, ep)));
        box(avX, yy, avg((st.eps[sn] || []).map(ep => sco(sn, ep))));
      });
      gridBottom = top + colH + px(8);
    }

    // ── Legend ──
    const ly0 = gridBottom + px(30), lw = gridRight - gridX;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const swatch = (c, x, yy) => {
      g.fillStyle = c === 'gold' ? gold(x, yy, chip, chip) : c || C.empty; g.beginPath(); g.roundRect(x, yy, chip, chip, px(5)); g.fill();
      if (!c) { g.strokeStyle = C.dash; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.beginPath(); g.roundRect(x + .75, yy + .75, chip - 1.5, chip - 1.5, px(5)); g.stroke(); g.setLineDash([]); }
    };
    if (tall) {                                          // Story / A4: evenly across, the range under each name
      const per = tallPer(lw), colW = lw / per;
      legendItems.forEach(([c, name, min], i) => {
        const x = gridX + (i % per) * colW, yy = ly0 + Math.floor(i / per) * legendRowH;
        swatch(c, x, yy);
        g.fillStyle = C.text; g.font = `500 ${px(17)}px Manrope, sans-serif`; g.fillText(name, x + chip + px(10), yy + chip / 2 + 1);
        if (min) { g.fillStyle = C.sub; g.font = `500 ${px(15)}px Manrope, sans-serif`; g.fillText(min, x + chip + px(10), yy + chip / 2 + px(24)); }
      });
    } else {                                             // Square / Wide: one line after another
      let lx = gridX, ly = ly0;
      legendItems.forEach(it => {
        const [c, name, min] = it, w = itemW(it);
        if (lx > gridX && lx + w > gridRight) { lx = gridX; ly += legendRowH; }
        swatch(c, lx, ly);
        g.fillStyle = C.text; g.font = `500 ${px(17)}px Manrope, sans-serif`; g.fillText(name, lx + chip + px(10), ly + chip / 2 + 1);
        if (min) { const nw = g.measureText(name).width; g.fillStyle = C.sub; g.font = `500 ${px(15)}px Manrope, sans-serif`; g.fillText(min, lx + chip + px(18) + nw, ly + chip / 2 + 1); }
        lx += w + itemGap;
      });
    }

    // ── Stats, on the right (Square / Wide) ──
    if (showStats) {
      const sx = cx + cw - P - statsW, sy = bodyTop + px(40);
      const rowH = Math.min(px(wide ? 82 : 96), (H - M - footH - px(30) - sy - px(70)) / SS.length), sh = px(70) + rowH * SS.length + px(6);
      g.save(); g.shadowColor = dark ? 'rgba(0,0,0,.35)' : 'rgba(60,45,25,.07)'; g.shadowBlur = px(18); g.shadowOffsetY = px(4);
      g.fillStyle = C.panel; g.beginPath(); g.roundRect(sx, sy, statsW, sh, px(20)); g.fill(); g.restore();
      g.strokeStyle = C.line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(sx + .75, sy + .75, statsW - 1.5, sh - 1.5, px(20)); g.stroke();
      g.fillStyle = C.olive; g.font = `600 ${px(18)}px Manrope, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(spaced({ mine: 'YOUR STATS', tmdb: 'TMDB STATS', community: 'COMMUNITY STATS' }[src] || 'STATS'), sx + px(26), sy + px(40));
      const icons = await Promise.all(SS.map(r => iconImg(r[0], C.icon)));
      // a value takes its band's colour where that reads well, the site green otherwise
      const tone = bk => ({ bad: dark ? '#e0675f' : '#b23a33', meh: dark ? '#eba25c' : '#ad5f1c', decent: dark ? '#e6cb63' : '#9a7708', perfect: dark ? '#e9b73a' : '#9a6a08' })[bk] || C.olive;
      SS.forEach(([, name, val, small, bk], i) => {
        const ry = sy + px(70) + i * rowH, cy = ry + rowH / 2;
        if (i) { g.fillStyle = C.line; g.fillRect(sx + px(26), ry, statsW - px(52), 1); }
        if (icons[i]) g.drawImage(icons[i], sx + px(26), cy - px(12), px(24), px(24));
        g.fillStyle = C.text; g.font = `500 ${px(19)}px Manrope, sans-serif`; g.textAlign = 'left'; g.fillText(name, sx + px(64), cy);
        g.textAlign = 'right'; g.fillStyle = tone(bk); g.font = `600 ${px(34)}px Oswald, sans-serif`;
        g.fillText(val, sx + statsW - px(26), small ? cy - px(9) : cy);
        if (small) { const band1 = i === 0; g.fillStyle = band1 ? tone(bk) : C.sub; g.font = `${band1 ? 600 : 500} ${px(14)}px Manrope, sans-serif`; g.fillText(band1 ? spaced(small.toUpperCase()) : small, sx + statsW - px(26), cy + px(21)); }
      });
    }

    // ── Footer: you · data credit · MyScreenFolio ──
    const fy = H - M - footH / 2;
    g.fillStyle = C.line; g.fillRect(cx + P, H - M - footH, cw - 2 * P, 1.5);
    const av = px(44), ax = cx + P;
    g.save(); g.beginPath(); g.arc(ax + av / 2, fy, av / 2, 0, Math.PI * 2); g.closePath();
    if (avatar) { g.clip(); g.drawImage(avatar, ax, fy - av / 2, av, av); }
    else { g.fillStyle = PAL.great; g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${px(20)}px Oswald, sans-serif`; g.fillText((who?.username || 'M')[0].toUpperCase(), ax + av / 2, fy + 1); }
    g.restore();
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = C.text; g.font = `500 ${px(19)}px Manrope, sans-serif`;
    g.fillText('@' + (who?.username || 'myscreenfolio'), ax + av + px(14), fy);
    g.textAlign = 'center'; g.fillStyle = C.sub; g.font = `500 ${px(16)}px Manrope, sans-serif`; g.fillText('Episode data: TMDB', cx + cw / 2, fy);
    g.textAlign = 'right'; g.fillStyle = C.olive; g.font = `600 ${px(26)}px Oswald, sans-serif`;
    const brand = spaced('MYSCREENFOLIO'), bw = g.measureText(brand).width;
    g.fillText(brand, cx + cw - P, fy + 1);
    if (logo) { const lh = px(34), lw2 = lh * 467 / 198; g.drawImage(logo, 20, 61, 467, 198, cx + cw - P - bw - px(14) - lw2, fy - lh / 2, lw2, lh); }
  }

  return { load, draw, scoreOf, key, blank, SIZES };
})();
