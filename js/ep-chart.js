/* ══════════════════════════════════════════════════════════════
   ep-chart.js — a show's episode chart picture (MSSEpChart): seasons across,
   episodes down, every box in its score's colour band, an AVG row, the
   legend and your name. One drawing for everywhere, so it always looks the
   same: the Episodes page's Export and the Export Studio ("Episode ratings"
   — the image, and the first page of its PDF).

   MSSEpChart.load(tmdbId, userId, meId) → state { show, seasons, eps, mine, comm, entry,
                                           source, readOnly, … } (null if TMDB has no show)
   MSSEpChart.draw(canvas, state, {
     size: 'square' | 'story' | 'wide' | 'a4',   theme: 'dark' | 'light' | 'backdrop' (Create Card's three styles),
       (Square starts at 1080 × 1080 and gets taller for long seasons; Story is 1080 wide and exactly as tall as its content (up to 1920, taller for long seasons);
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
    if (src === 'tmdb') return ep.vote ? Number(mssR1(ep.vote)) : null;
    if (src === 'mine') return st.mine[k] ? Number(st.mine[k].score) : null;
    if (src === 'community') return st.comm[k] ? Number(st.comm[k].avg_score) : null;
    return st.mine[k] && ep.vote ? Math.round((Number(st.mine[k].score) - ep.vote) * 10) / 10 : null;   // mine vs tmdb
  }

  // A show + its TMDB episodes, someone's ratings of it and the community's
  async function load(tmdbId, userId, meId) {
    const X = blank();
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${tmdbId}?language=en-US&append_to_response=images&include_image_language=en,null`);
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
      (await mssWithEpNotes(data || [])).forEach(r => { X.mine[key(r.season_number, r.episode_number)] = r; });   // Friends / Only me notes too (108)
    }
    try {
      const { data: comm } = await sb.rpc('get_episode_community', { p_tmdb_id: tmdbId });
      (comm || []).forEach(r => { X.comm[key(r.season_number, r.episode_number)] = r; });
    } catch {}
    return X;
  }

  // The pictures (backdrop, poster, logo, avatar) load once per show + person, then every redraw reuses them
  const imgCache = {};
  // entry: the chart owner's copy of the show — its poster (a TMDB one or their own upload) and backdrop
  // (MSSBackdrop) are the ones they picked; TMDB's otherwise
  async function images(show, userId, entry) {
    const posterUrl = entry?.poster_url, bdUrl = await MSSBackdrop.url(entry?.tmdb_id ? entry : { type: 'tv', id: show.id }).catch(() => null);
    const id = `${show.id}:${userId || ''}:${posterUrl || ''}:${bdUrl || ''}`;
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
    const tl = typeof tmdbLogo === 'function' ? tmdbLogo(show) : null;   // the show's name artwork (nav.js), as on its title page / Create Card
    const [backdrop, poster, logo, avatar, tlogo] = await Promise.all([
      load(bdUrl),
      load(safeURL(posterUrl) || (show.poster_path ? `https://image.tmdb.org/t/p/w342${show.poster_path}` : null)),
      load('icons/logo-nav.png', false),   // same site — no CORS needed (artwork: 467×198 at 20,61)
      load(safeURL(who?.avatar_url)),
      load(tl?.src),
    ]);
    return (imgCache[id] = { who, backdrop, poster, logo, avatar, tlogo });
  }

  /* ── The picture ── in Create Card's look (owner, 17 Nov 2026): full bleed, the show's chosen backdrop across the top
     (framed with Create Card's Wallpaper / A4 framing) fading into the page, the poster, the show's logo, the average as the
     score ring, Create Card's footer. Square: header · the chart on the left · stats on
     the right · legend · footer. Story: header · "Episode ratings by season" ·
     the chart full width · legend · footer (no stats).
     Wide:   the chart sideways (seasons down, episodes across) · stats on the right.
     A4:     like Story, on a fixed page (the Export Studio's PDF).
     The chart keeps to the left and the picture grows with the show: longer seasons
     make Square / Story taller, more episodes make Wide wider (up to a limit, then
     the boxes shrink — numbers hide once they're too small to read). */
  // the rating scale's tiers (MSS_TIERS, config.js): their lower bounds for the legend, and a tier by key
  const BAND_MIN = Object.fromEntries(MSS_TIERS.map(t => [t.key, t.min ? t.min.toFixed(t.min === 9.9 ? 2 : 1) + '+' : '< 4']));
  const TIER = k => MSS_TIERS.find(t => t.key === k);
  /* Create Card's styles (create-card.js CC_STYLES — css/theme.css values; keep the three in step): Dark · Light ·
     Backdrop (the dark set over the show's picture, blurred). page: the background · panel: the stats / label boxes ·
     card: the AVG row · empty: a box with no score · olive: the eyebrow / headings green */
  const STYLES = {
    dark:  { page: '#04130A', panel: '#1A2E20', card: '#13261A', line: '#364738', head: '#F3EEDC', text: '#E9E4D2', sub: '#AEAB9F', olive: '#A6CCB1',
             empty: '#1E3325', dash: '#778171', icon: '#C7C4B7', ring: 'rgba(243,238,220,.16)', shadow: 'rgba(0,0,0,.5)', brand: '#1F4D33', onBrand: '#F3EEDC' },
    light: { page: '#F3EEDC', panel: '#FEFCF3', card: '#E9E2CB', line: '#C7C8BD', head: '#1F4D33', text: '#1E2A22', sub: '#525E56', olive: '#24583A',
             empty: '#E6E0CA', dash: '#7C827A', icon: '#3A453E', ring: 'rgba(30,42,34,.12)', shadow: 'rgba(30,42,34,.28)', brand: '#1F4D33', onBrand: '#F3EEDC' },
  };
  STYLES.backdrop = { ...STYLES.dark, panel: 'rgba(10,30,18,.72)', card: 'rgba(10,30,18,.55)', line: 'rgba(243,238,220,.16)', empty: 'rgba(243,238,220,.10)', ring: 'rgba(243,238,220,.2)' };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // an image filling a box, cropped like the site does: focal point x% y% (MSSBackdrop.pos; default centred, 25% down) and zoom
  function cover(ctx, img, x, y, w, h, pos) {
    const p = pos || { x: 50, y: 25, z: 1 };
    const s = Math.max(w / img.width, h / img.height) * (p.z || 1), dw = img.width * s, dh = img.height * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, x + (w - dw) * (p.x / 100), y + (h - dh) * (p.y / 100), dw, dh);
    ctx.restore();
  }
  // the Backdrop style's background: the picture blurred to fill it (made at a quarter size), kept per picture and size
  const blurCache = new Map();
  function blurred(img, W, H, pos) {
    if (!img) return null;
    const k = `${img.src}|${W}x${H}|${JSON.stringify(pos)}`;
    if (blurCache.has(k)) return blurCache.get(k);
    const w = Math.round(W / 4), h = Math.round(H / 4), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if ('filter' in x) { x.filter = 'blur(8px) saturate(1.4)'; cover(x, img, -24, -24, w + 48, h + 48, pos); }
    else { const s = document.createElement('canvas'); s.width = Math.max(1, Math.round(w / 10)); s.height = Math.max(1, Math.round(h / 10)); cover(s.getContext('2d'), img, 0, 0, s.width, s.height, pos); x.imageSmoothingQuality = 'high'; x.drawImage(s, 0, 0, w, h); }
    blurCache.set(k, c);
    return c;
  }
  // the show's logo for a style (as Create Card's _ccLogoFor): on Light, a mostly-light logo is filled with the heading colour
  const logoCache = new Map();
  function logoFor(lg, sty, head) {
    if (sty !== 'light') return lg;
    if (logoCache.has(lg)) return logoCache.get(lg) || lg;
    let out = null;
    try {
      const c = document.createElement('canvas'), k = Math.min(1, 64 / Math.max(lg.naturalWidth, lg.naturalHeight));
      c.width = Math.max(1, Math.round(lg.naturalWidth * k)); c.height = Math.max(1, Math.round(lg.naturalHeight * k));
      const x = c.getContext('2d'); x.drawImage(lg, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
      if (n && sum / n > 0.62) {
        const t = document.createElement('canvas'); t.width = lg.naturalWidth; t.height = lg.naturalHeight;
        const tx = t.getContext('2d'); tx.drawImage(lg, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = head; tx.fillRect(0, 0, t.width, t.height);
        out = t;
      }
    } catch { out = null; }
    logoCache.set(lg, out);
    return out || lg;
  }
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
    const top = MSSEp.extremes(scored, x => x.v), best = top.hi[0], worst = top.lo[0];
    const more = l => l.length > 1 ? ` +${l.length - 1}` : '';
    const bySeason = seasons.map(sn => ({ sn, a: avg(scored.filter(x => x.s === sn).map(x => x.v)) })).filter(x => x.a != null);
    const bestS = bySeason.length > 1 ? bySeason.reduce((b, x) => x.a > b.a ? x : b) : null;
    const today = new Date().toISOString().slice(0, 10);
    const aired = seasons.reduce((t, sn) => t + (st.eps[sn] || []).filter(ep => !ep.air || ep.air <= today).length, 0);
    const great = scored.filter(x => x.v >= 8.5).length;
    const sd = Math.sqrt(vs.reduce((t, v) => t + (v - a) ** 2, 0) / vs.length);
    const f = v => v >= 10 ? '10' : mssR1(v);
    return [
      ['ratingStar', 'Series average', a.toFixed(2), MSSEp.band(a).name, MSSEp.band(a).key],
      ['trophy', 'Best episode', f(best.v), `S${best.s} · E${best.ep.n}${more(top.hi)}`, MSSEp.band(best.v).key],
      ['thumbsDown', 'Lowest episode', f(worst.v), `S${worst.s} · E${worst.ep.n}${more(top.lo)}`, MSSEp.band(worst.v).key],
      ...(bestS ? [['crown', 'Best season', `S${bestS.sn} · ${mssR1(bestS.a)}`, '', MSSEp.band(bestS.a).key]] : []),
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
    const { who, backdrop, poster, logo, avatar, tlogo } = await images(st.show, o.userId, st.entry);
    const sty = STYLES[o.theme] ? o.theme : 'dark', dark = sty !== 'light', C = STYLES[sty];
    // the site's rating scale, in the picture's style: a tier's colour (PAL) and the text on it (INK); Masterpiece is gold
    const PAL = Object.fromEntries(MSS_TIERS.map(t => [t.key, dark ? t.dark : t.light]));
    const INK = Object.fromEntries(MSS_TIERS.map(t => [t.key, dark ? t.onD : t.onL]));
    const u = a4 ? 1.15 : 1, px = v => Math.round(v * u);
    const maxEp = Math.max(1, ...seasons.map(sn => (st.eps[sn] || []).length));
    const SS = stats(st, src, seasons, scored), showStats = !!SS && !tall;
    const [W0, H0] = SIZES[size];
    // full bleed (no frame) · the page's side padding · the header: poster height + padding above and below it
    const M = 0, P = px(tall ? 64 : 56);
    const pW = px(tall ? 200 : wide ? 150 : 170), pH = Math.round(pW * 1.5), ringD = px(tall ? 150 : wide ? 120 : 132);
    const topPad = px(tall ? 72 : 52), headH = topPad + pH + px(tall ? 48 : 36), lap = 0, bodyTop = headH;
    const statsW = showStats ? px(wide ? 370 : 330) : 0, statsGap = showStats ? px(34) : 0;
    const legendRowH = tall ? px(54) : px(34), footH = px(116), secH = tall ? px(70) : 0;
    const labW = px(wide ? 70 : maxEp >= 100 ? 96 : 84), headRow = px(48);
    const legendItems = src === 'diff' ? [['#2f6e3a', 'Higher than TMDB', ''], [C.empty, 'Same', ''], ['#a8433b', 'Lower than TMDB', '']]
      : [...MSSEp.BANDS.map(b => [b.gold ? 'gold' : PAL[b.key], b.name, BAND_MIN[b.key]]), [null, 'Not rated', '']];
    const g = cv.getContext('2d');
    const chip = px(20), itemGap = px(28);
    const itemW = ([, name, min]) => { g.font = `500 ${px(17)}px Manrope, sans-serif`; let w = chip + px(10) + g.measureText(name).width;
      if (min && !tall) { g.font = `500 ${px(15)}px Manrope, sans-serif`; w += px(8) + g.measureText(min).width; } return w; };
    const tallPer = width => { const fit = Math.max(1, Math.floor(width / (Math.max(...legendItems.map(itemW)) + px(18)))); return Math.ceil(legendItems.length / Math.ceil(legendItems.length / fit)); };
    const legendRows = width => { if (tall) return Math.ceil(legendItems.length / tallPer(width)); let rows = 1, x = 0; legendItems.forEach(it => { const w = itemW(it); if (x && x + w > width) { rows++; x = 0; } x += w + itemGap; }); return rows; };

    // ── How big each box is, and how big the picture has to be ──
    // Every size draws the same box as Square (owner, 17 Nov 2026): at most BOX_COL across (box + gap) and BOX_ROW down —
    // smaller only when the show doesn't fit; the same numbers, corners, episode column and AVG band everywhere.
    const BOX_COL = px(90), BOX_ROW = px(46);
    let W = W0, H = H0, step, colStep;
    const bottomFixed = px(36) + footH + M;              // legend gap + footer + frame
    if (!wide) {
      const gridW = W - 2 * (M + P) - statsW - statsGap;
      colStep = Math.min(BOX_COL, (gridW - labW) / seasons.length);
      const rows = maxEp + 1.6;                          // + the AVG row and the gap above it
      const fixed = bodyTop + px(40) + secH + headRow + legendRows(gridW) * legendRowH + bottomFixed;
      const statsNeed = showStats ? bodyTop + px(40) + px(70) + SS.length * px(96) + px(30) + footH + M : 0;
      const maxStep = BOX_ROW, pref = BOX_ROW, minStep = px(9), cap = H0 * (story ? 2.6 : 3);
      step = (H0 - fixed) / rows;
      if (step > maxStep) step = maxStep;
      else if (step < pref) {
        if (a4) step = Math.max(minStep, step);
        else { step = pref; H = Math.ceil(fixed + rows * step); if (H > cap) { H = cap; step = Math.max(minStep, (cap - fixed) / rows); } }
      }
      H = Math.max(H, statsNeed);
      // Story: as tall as what's on it — a short show leaves no empty band between the header and the chart, or under the legend (owner, 18 Nov 2026)
      if (story) H = Math.min(H, Math.ceil(fixed + rows * step + px(10)));
      if (step < BOX_ROW) colStep = Math.min(colStep, BOX_COL * step / BOX_ROW);   // a long show on a fixed page (A4): the same box, just smaller — never squashed
    } else {
      const nCols = maxEp + 1.4;                         // + AVG and the gap before it
      const gridW = () => W - 2 * (M + P) - statsW - statsGap - labW;
      colStep = gridW() / nCols;
      if (colStep > BOX_COL) colStep = BOX_COL;
      else if (colStep < BOX_COL) { W = Math.ceil(2 * (M + P) + statsW + statsGap + labW + nCols * BOX_COL); colStep = BOX_COL;   // wider, so the boxes stay Square's
        if (W > 4200) { W = 4200; colStep = Math.max(px(10), gridW() / nCols); } }
      const fixed = bodyTop + px(40) + headRow + legendRows(W - 2 * (M + P) - statsW - statsGap) * legendRowH + bottomFixed;
      const statsNeed = bodyTop + px(40) + px(70) + (SS ? SS.length : 0) * px(80) + px(30) + footH + M;
      step = Math.min(BOX_ROW, (H0 - fixed) / seasons.length);
      const keep = BOX_ROW * colStep / BOX_COL;   // a very long show at the 4200px cap: the boxes shrink, keeping their shape
      if (colStep < BOX_COL) { step = keep; H = Math.max(H, Math.ceil(fixed + seasons.length * step)); }
      else if (step < BOX_ROW) { step = BOX_ROW; H = Math.ceil(fixed + seasons.length * step); if (H > 2800) { H = 2800; step = Math.max(px(9), (H - fixed) / seasons.length); } }
      if (showStats) H = Math.max(H, statsNeed);
    }
    const cellW = colStep - Math.max(2, Math.min(px(12), colStep * 0.08)), cellH = Math.max(4, step - Math.max(2, Math.min(px(12), step * 0.22)));
    W = Math.round(W); H = Math.round(H);
    cv.width = W; cv.height = H;
    const gold = (x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); MSS_GOLD_STOPS.forEach(([p, c]) => gr.addColorStop(p, c)); return gr; };
    const fill = (v, x, y, w, h) => src === 'diff' ? (Math.abs(v) < 0.3 ? C.empty : v > 0 ? '#2f6e3a' : '#a8433b')
      : MSSEp.band(v).gold ? gold(x, y, w, h) : PAL[MSSEp.band(v).key];
    const ink = v => src === 'diff' ? (Math.abs(v) < 0.3 ? C.text : '#fff') : INK[MSSEp.band(v).key];
    const fitText = (t, max) => { let s = t; while (g.measureText(s).width > max && s.length > 2) s = s.slice(0, -2) + '…'; return s; };
    const spaced = t => t.split('').join(String.fromCharCode(8202));   // a little letter-spacing
    // words → lines no wider than max (in the current font)
    const wrap = (t, max) => { const out = []; let ln = ''; String(t || '').split(/\s+/).forEach(w => { const tryLn = ln ? ln + ' ' + w : w; if (ln && g.measureText(tryLn).width > max) { out.push(ln); ln = w; } else ln = tryLn; }); if (ln) out.push(ln); return out; };

    // ── The page, full bleed like Create Card: the style's background, the chosen backdrop across the top fading into it
    //    (Backdrop: the same picture blurred under the whole picture, a deep-forest shade over it) ──
    const cx = 0, cw = W;
    const pos = typeof MSSBackdrop !== 'undefined' && st.entry ? MSSBackdrop.pos(st.entry, a4 ? 'cca4' : 'ccwall') : null;
    const band = Math.min(H, headH + px(tall ? 220 : 150));
    g.fillStyle = C.page; g.fillRect(0, 0, W, H);
    if (sty === 'backdrop') {
      const b = blurred(backdrop || poster, W, H, backdrop ? pos : null);
      if (b) { g.save(); g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, W, H); g.restore(); }
      if (backdrop) {   // the sharp picture at the top, melting into the blurred one
        const m = document.createElement('canvas'); m.width = W; m.height = Math.ceil(band);
        const mx = m.getContext('2d'); cover(mx, backdrop, 0, 0, W, band, pos);
        const f = mx.createLinearGradient(0, 0, 0, band); f.addColorStop(0, '#000'); f.addColorStop(0.55, '#000'); f.addColorStop(1, 'rgba(0,0,0,0)');
        mx.globalCompositeOperation = 'destination-in'; mx.fillStyle = f; mx.fillRect(0, 0, W, band);
        g.drawImage(m, 0, 0);
      }
      const sh = g.createLinearGradient(0, 0, 0, H), t = Math.min(0.9, band / H);
      sh.addColorStop(0, 'rgba(4,14,8,.22)'); sh.addColorStop(t * 0.35, 'rgba(4,14,8,.52)'); sh.addColorStop(t, 'rgba(4,14,8,.66)'); sh.addColorStop(1, 'rgba(4,14,8,.74)');
      g.fillStyle = sh; g.fillRect(0, 0, W, H);
    } else if (backdrop) {
      cover(g, backdrop, 0, 0, W, band, pos);
      const f = g.createLinearGradient(0, 0, 0, band), c = C.page;
      if (sty === 'light') { f.addColorStop(0, rgba(c, .10)); f.addColorStop(0.28, rgba(c, .58)); f.addColorStop(0.6, rgba(c, .9)); f.addColorStop(1, c); }
      else { f.addColorStop(0, rgba(c, .15)); f.addColorStop(0.28, rgba(c, .55)); f.addColorStop(0.62, rgba(c, .9)); f.addColorStop(1, c); }
      g.fillStyle = f; g.fillRect(0, 0, W, band + 1);
    }

    // ── The header (Create Card's): poster on the left · eyebrow, the show's logo (or its name), the details line ·
    //    the average as the score ring on the right, in its tier's colour ──
    const pX = P, pY = topPad;
    g.save(); g.shadowColor = C.shadow; g.shadowBlur = px(44); g.shadowOffsetY = px(16);
    g.fillStyle = C.empty; g.beginPath(); g.roundRect(pX, pY, pW, pH, px(14)); g.fill(); g.restore();
    if (poster) { g.save(); g.beginPath(); g.roundRect(pX, pY, pW, pH, px(14)); g.clip(); cover(g, poster, pX, pY, pW, pH, { x: 50, y: 50, z: 1 }); g.restore(); }
    g.save(); g.strokeStyle = 'rgba(243,238,220,.10)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(pX, pY, pW, pH, px(14)); g.stroke(); g.restore();
    const sa = scored.length ? avg(scored.map(x => x.v)) : null, showRing = sa != null && src !== 'diff';
    const tx = pX + pW + px(40), tw = W - P - tx - (showRing ? ringD + px(44) : 0);
    // the title block, measured first so it sits on the poster's baseline
    const ebH = px(16) + px(22), metaH = px(22) + px(14);
    const lg = tlogo ? logoFor(tlogo, sty, C.head) : null;
    let titleH, tLines = [], tSize = px(tall ? 84 : 74);
    const logoMaxH = Math.max(px(60), Math.min(tSize * 1.9, pH - ebH - metaH - px(10)));
    let lgW = 0, lgH = 0;
    if (lg) { const nw = lg.naturalWidth || lg.width, nh = lg.naturalHeight || lg.height, k = Math.min(tw / nw, logoMaxH / nh); lgW = nw * k; lgH = nh * k; titleH = lgH + px(18); }
    else {
      for (;;) { g.font = `600 ${tSize}px Oswald, sans-serif`; tLines = wrap(st.show.name, tw); if (tLines.length <= 2 || tSize <= px(46)) break; tSize -= 2; }
      if (tLines.length > 2) tLines = [tLines[0], fitText(tLines.slice(1).join(' '), tw)];
      titleH = tSize * 1.08 * tLines.length + px(10);
    }
    const tbH = ebH + titleH + metaH, ty = pY + pH - tbH;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.olive; g.font = `700 ${px(16)}px Manrope, sans-serif`;
    g.fillText(spaced(spaced(({ tmdb: 'EPISODE RATINGS · TMDB', mine: 'MY EPISODE RATINGS', community: 'EPISODE RATINGS · COMMUNITY', diff: 'MY RATINGS VS TMDB' })[src])), tx, ty + px(16));
    let yy0 = ty + ebH;
    if (lg) {
      g.save();
      if (sty === 'light') { g.shadowColor = 'rgba(255,255,255,.6)'; g.shadowBlur = px(10); }
      else { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = px(18); g.shadowOffsetY = px(3); }
      g.drawImage(lg, tx, yy0 + px(4), lgW, lgH); g.restore();
    } else {
      g.fillStyle = C.head; g.font = `600 ${tSize}px Oswald, sans-serif`;
      tLines.forEach((ln, i) => g.fillText(ln, tx, yy0 + tSize * 1.08 * i + tSize * 0.86));
    }
    yy0 += titleH;
    const years = [(st.show.first_air_date || '').slice(0, 4), st.show.status === 'Ended' || st.show.status === 'Canceled' ? (st.show.last_air_date || '').slice(0, 4) : 'Present'].filter(Boolean);
    const sub = [years.length > 1 && years[0] !== years[1] ? years.join(' – ') : years[0], st.show.networks?.[0]?.name,
      o.label || `${seasons.length} season${seasons.length === 1 ? '' : 's'}`,
      src === 'mine' ? `${scored.length} rated` : src === 'tmdb' ? 'TMDB scores' : src === 'community' ? 'MSF community' : ''].filter(Boolean).join(' · ');
    g.fillStyle = C.text; g.font = `500 ${px(22)}px Manrope, sans-serif`;
    g.fillText(fitText(sub, tw), tx, yy0 + px(22));
    if (showRing) {   // centred on the title block, like Create Card's "My score"
      const t = mssScoreTier(sa, { dark }), r = ringD * 0.44, rcx = W - P - ringD / 2, rcy = Math.max(pY + ringD / 2, ty + tbH / 2 - px(17));
      g.save(); g.lineWidth = ringD * 0.07; g.strokeStyle = C.ring; g.beginPath(); g.arc(rcx, rcy, r, 0, Math.PI * 2); g.stroke();
      let stroke = t.ink;
      if (t.gold) { stroke = g.createLinearGradient(rcx - r, rcy - r, rcx + r, rcy + r); MSS_GOLD_STOPS.forEach(([p, c]) => stroke.addColorStop(p, c)); }
      g.strokeStyle = stroke; g.lineCap = 'round'; g.beginPath(); g.arc(rcx, rcy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, sa / 10))); g.stroke();
      const fs = ringD * 40 / 116; g.font = `400 ${fs}px "Bebas Neue", sans-serif`; g.fillStyle = t.ink; g.textAlign = 'center';
      g.fillText(sa.toFixed(2), rcx, rcy + fs * 0.36);
      g.font = `600 ${px(16)}px Manrope, sans-serif`; g.fillStyle = C.sub;
      g.fillText(src === 'mine' ? 'My average' : 'Average', rcx, rcy + ringD / 2 + px(30));
      g.restore();
    }

    const gridLeft = cx + P, gridRight = cx + cw - P - statsW - statsGap;
    // the grid's own width; Story / A4 (no stats beside it) centre it, Square / Wide keep it on the left like before
    const gridSpan = wide ? labW + (maxEp + 1.4) * colStep : labW + seasons.length * colStep;
    const gridX = tall ? gridLeft + Math.max(0, (gridRight - gridLeft - gridSpan) / 2) : gridLeft;
    const chartH = secH + headRow + (maxEp + 1.6) * step + px(36) + legendRows(gridRight - gridLeft) * legendRowH;
    const spare = tall ? Math.max(0, (H - M - footH - bodyTop - px(40)) - chartH - px(10)) : 0;
    let y = bodyTop + px(40) + spare / 2;
    if (secH) {                                          // "EPISODE RATINGS BY SEASON" between two lines
      g.font = `600 ${px(18)}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const t = spaced(spaced('EPISODE RATINGS BY SEASON')), tw = g.measureText(t).width + px(44), lineW = (cw - 2 * P - tw) / 2;
      g.fillStyle = C.line; g.fillRect(gridLeft, y + px(16), lineW, 1.5); g.fillRect(cx + cw - P - lineW, y + px(16), lineW, 1.5);
      g.fillStyle = C.olive; g.fillText(t, cx + cw / 2, y + px(17));
      y += secH;
    }
    const gridTop = y;
    const showNums = cellW >= px(22) && cellH >= px(15);
    const numPx = Math.max(px(10), Math.min(px(21), cellH * 0.5, cellW * 0.34));
    const rad = Math.max(2, Math.min(px(9), cellH * 0.22));
    const box = (x, yy, v) => {
      g.fillStyle = v == null ? C.empty : fill(v, x, yy, cellW, cellH);
      g.beginPath(); g.roundRect(x, yy, cellW, cellH, rad); g.fill();
      if (!showNums) return;
      g.font = `600 ${numPx}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (v == null) { g.fillStyle = C.dash; g.fillText('–', x + cellW / 2, yy + cellH / 2 + 1); return; }
      g.fillStyle = ink(v); g.fillText(src === 'diff' ? (v > 0 ? '+' : '') + mssR1(v) : v >= 10 ? '10' : mssR1(v), x + cellW / 2, yy + cellH / 2 + 1);
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
      if (step >= px(22)) {                              // the episode names on one soft column with lines between (every size)
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
      g.fillStyle = C.card; g.beginPath(); g.roundRect(gridX - px(6), ay - px(7), avgW + px(12), cellH + px(14), px(12)); g.fill();   // the AVG band (every size)
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
    const ly0 = gridBottom + px(30), lw = gridRight - gridLeft;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const swatch = (c, x, yy) => {
      g.fillStyle = c === 'gold' ? gold(x, yy, chip, chip) : c || C.empty; g.beginPath(); g.roundRect(x, yy, chip, chip, px(5)); g.fill();
      if (!c) { g.strokeStyle = C.dash; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.beginPath(); g.roundRect(x + .75, yy + .75, chip - 1.5, chip - 1.5, px(5)); g.stroke(); g.setLineDash([]); }
    };
    if (tall) {                                          // Story / A4: evenly across, the range under each name
      const per = tallPer(lw), colW = lw / per;
      legendItems.forEach(([c, name, min], i) => {
        const x = gridLeft + (i % per) * colW, yy = ly0 + Math.floor(i / per) * legendRowH;
        swatch(c, x, yy);
        g.fillStyle = C.text; g.font = `500 ${px(17)}px Manrope, sans-serif`; g.fillText(name, x + chip + px(10), yy + chip / 2 + 1);
        if (min) { g.fillStyle = C.sub; g.font = `500 ${px(15)}px Manrope, sans-serif`; g.fillText(min, x + chip + px(10), yy + chip / 2 + px(24)); }
      });
    } else {                                             // Square / Wide: one line after another
      let lx = gridLeft, ly = ly0;
      legendItems.forEach(it => {
        const [c, name, min] = it, w = itemW(it);
        if (lx > gridLeft && lx + w > gridRight) { lx = gridLeft; ly += legendRowH; }
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
      g.save(); if (sty !== 'backdrop') { g.shadowColor = dark ? 'rgba(0,0,0,.35)' : 'rgba(60,45,25,.07)'; g.shadowBlur = px(18); g.shadowOffsetY = px(4); }
      g.fillStyle = C.panel; g.beginPath(); g.roundRect(sx, sy, statsW, sh, px(20)); g.fill(); g.restore();
      g.strokeStyle = C.line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(sx + .75, sy + .75, statsW - 1.5, sh - 1.5, px(20)); g.stroke();
      g.fillStyle = C.olive; g.font = `600 ${px(18)}px Manrope, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(spaced({ mine: 'YOUR STATS', tmdb: 'TMDB STATS', community: 'COMMUNITY STATS' }[src] || 'STATS'), sx + px(26), sy + px(40));
      const icons = await Promise.all(SS.map(r => iconImg(r[0], C.icon)));
      // a value takes its tier's colour (Masterpiece: the gold that reads as text), the site green when it has none
      const tone = bk => { const t = TIER(bk); return !t ? C.olive : t.gold ? (dark ? t.inkD : t.inkL) : dark ? t.dark : t.light; };
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

    // ── Footer (Create Card's): a line, your photo and @username · the data credit · the MSF mark ──
    const fy = H - footH / 2 - px(6);
    g.fillStyle = C.line; g.fillRect(P, H - footH - px(4), W - 2 * P, 1);
    const av = px(50), ax = P;
    g.save(); g.beginPath(); g.arc(ax + av / 2, fy, av / 2, 0, Math.PI * 2); g.closePath();
    if (avatar) { g.clip(); cover(g, avatar, ax, fy - av / 2, av, av, { x: 50, y: 50, z: 1 }); }
    else { g.fillStyle = C.brand; g.fill(); g.fillStyle = C.onBrand; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${px(20)}px Manrope, sans-serif`; g.fillText((who?.username || 'M')[0].toUpperCase(), ax + av / 2, fy + 1); }
    g.restore();
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = C.text; g.font = `700 ${px(21)}px Manrope, sans-serif`;
    g.fillText('@' + (who?.username || 'myscreenfolio'), ax + av + px(16), fy + 1);
    g.textAlign = 'center'; g.fillStyle = C.sub; g.font = `500 ${px(15)}px Manrope, sans-serif`; g.fillText('Episode data: TMDB', W / 2, fy + 1);
    g.textAlign = 'right'; g.fillStyle = C.head; g.font = `600 ${px(26)}px Oswald, sans-serif`;
    const bw = g.measureText('MyScreenFolio').width;
    g.fillText('MyScreenFolio', W - P, fy + 1);
    if (logo) { const lh = px(38), lw2 = lh * 467 / 198; g.drawImage(logo, 20, 61, 467, 198, W - P - bw - px(12) - lw2, fy - lh / 2, lw2, lh); }   // the logo in its own colours, as in the nav
  }

  return { load, draw, scoreOf, key, blank, SIZES };
})();
