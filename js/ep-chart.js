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
      load('icons/icon-192.png', false),   // same site — no CORS needed
      load(safeURL(who?.avatar_url)),
    ]);
    return (imgCache[id] = { who, backdrop, poster, logo, avatar });
  }

  async function draw(cv, st, o = {}) {
    await mssFontsReady();   // the site's fonts, every weight the picture uses (config.js)
    const src = o.source || st.source, seasons = o.seasons || st.seasons;
    const sco = (sn, ep) => scoreOf(st, src, sn, ep);
    const scored = [];
    seasons.forEach(sn => (st.eps[sn] || []).forEach(ep => { const v = sco(sn, ep); if (v != null) scored.push({ s: sn, ep, v }); }));
    const { who, backdrop, poster, logo, avatar } = await images(st.show, o.userId);
    const [W, H] = SIZES[o.size] || SIZES.square;
    const U = Math.min(W, H);   // type + spacing scale with the short side (Wide stays balanced)
    const g = cv.getContext('2d'), dark = o.theme === 'dark';
    const css = getComputedStyle(document.documentElement), band = k => css.getPropertyValue('--band-' + k).trim();
    const C = dark ? { bg: '#111613', card: '#1a211c', text: '#f0ede8', sub: '#9aa39c', line: '#2a312c', empty: '#26302a', olive: '#7fbf6a' }
                   : { bg: '#f3eee6', card: '#ebe4d8', text: '#1a1d1b', sub: '#5f665f', line: '#d6cebf', empty: '#e0d8ca', olive: '#1e5c26' };
    cv.width = W; cv.height = H;
    const pad = Math.round(U * 0.055);
    const gold = (x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); [[0, '#b9820f'], [0.28, '#e9b73a'], [0.44, '#fff0b3'], [0.58, '#efc24a'], [1, '#a8740c']].forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);

    // ── Header: backdrop band (sharp, darkened), poster overlapping, title ──
    const bandH = Math.round(H * (o.size === 'story' || o.size === 'a4' ? 0.17 : o.size === 'wide' ? 0.26 : 0.22));
    if (backdrop) {
      const r = Math.max(W / backdrop.width, bandH / backdrop.height), dw = backdrop.width * r, dh = backdrop.height * r;
      g.save(); g.beginPath(); g.rect(0, 0, W, bandH); g.clip();
      g.drawImage(backdrop, (W - dw) / 2, (bandH - dh) * 0.35, dw, dh); g.restore();
    } else { g.fillStyle = band('masterpiece'); g.fillRect(0, 0, W, bandH); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, W, bandH);
    const pH = Math.round(bandH * 0.88), pW = Math.round(pH * 2 / 3), pY = Math.round(bandH * 0.4);
    if (poster) {
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
      g.beginPath(); g.roundRect(pad, pY, pW, pH, 14); g.fillStyle = C.card; g.fill(); g.restore();
      g.save(); g.beginPath(); g.roundRect(pad, pY, pW, pH, 14); g.clip(); g.drawImage(poster, pad, pY, pW, pH); g.restore();
    }
    const tx = poster ? pad + pW + 30 : pad;
    const srcName = { tmdb: 'TMDB scores', mine: 'My ratings', community: 'MSF community', diff: 'vs TMDB' }[src];
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#ffffff'; g.font = `600 ${Math.round(U * 0.017)}px Oswald, sans-serif`;
    g.fillText(('EPISODE RATINGS · ' + srcName).toUpperCase(), tx, bandH - Math.round(U * 0.03));
    const badgeRoom = seasons.length > 1 ? Math.round(U * 0.12) + 24 : 0;   // keep the title clear of the average badge
    let tSize = Math.round(U * 0.052);                // long titles shrink (to 70%) before they're cut
    g.fillStyle = C.text; g.font = `600 ${tSize}px Oswald, sans-serif`;
    while (g.measureText(st.show.name).width > W - tx - pad - badgeRoom && tSize > U * 0.036) { tSize -= 2; g.font = `600 ${tSize}px Oswald, sans-serif`; }
    let title = st.show.name; while (g.measureText(title).width > W - tx - pad - badgeRoom && title.length > 3) title = title.slice(0, -2) + '…';
    const ty = bandH + Math.round(U * 0.06);
    g.fillText(title, tx, ty);
    const sc = scored, sa = sc.length ? avg(sc.map(x => x.v)) : null;
    const years = [(st.show.first_air_date || '').slice(0, 4), st.show.status === 'Ended' ? (st.show.last_air_date || '').slice(0, 4) : 'Present'].filter(Boolean).join('–');
    g.fillStyle = C.sub; g.font = `500 ${Math.round(U * 0.02)}px Manrope, sans-serif`;
    g.fillText(`${years} · ${o.label}`, tx, ty + Math.round(U * 0.035));
    if (sa != null && src !== 'diff' && seasons.length > 1) {   // average badge (one season → same as its AVG row)
      const b = MSSEp.band(sa), bw = Math.round(U * 0.12), bh = Math.round(U * 0.07), bx = W - pad - bw, by = bandH + Math.round(U * 0.012);
      g.fillStyle = b.key === 'perfect' ? gold(bx, by, bw, bh) : band(b.key); g.beginPath(); g.roundRect(bx, by, bw, bh, 12); g.fill();
      g.fillStyle = b.ink ? '#1a1a1a' : '#fff'; g.textAlign = 'center';
      g.font = `400 ${Math.round(bh * 0.55)}px "Bebas Neue", sans-serif`; g.fillText(sa.toFixed(1), bx + bw / 2, by + bh * 0.62);
      g.font = `600 ${Math.round(bh * 0.17)}px Oswald, sans-serif`; g.fillText(b.name.toUpperCase(), bx + bw / 2, by + bh * 0.88); g.textAlign = 'left';
    }

    // ── Grid: seasons across, episodes down (+ AVG row); numbers only when boxes are big enough ──
    const headBottom = Math.max(pY + pH, ty + Math.round(U * 0.05)) + Math.round(U * 0.025);
    g.fillStyle = C.line; g.fillRect(pad, headBottom, W - pad * 2, 2);                       // divider: header | grid
    const gridTop = headBottom + Math.round(U * 0.025);
    const legendH = Math.round(U * 0.045), footH = Math.round(U * 0.055);
    const maxEp = Math.max(1, ...seasons.map(sn => (st.eps[sn] || []).length));
    const labW = Math.round(W * (maxEp >= 100 ? 0.05 : 0.038));
    const availW = W - pad * 2 - labW, availH = H - gridTop - legendH - footH - pad;
    const cell = Math.max(4, Math.min(Math.floor(availW / Math.max(1, seasons.length)), Math.floor(availH / (maxEp + 2.6)), 92));
    const gap = Math.max(1, Math.round(cell * (cell >= 24 ? 0.09 : 0.07))), box = cell - gap;
    const gx = pad + labW + Math.max(0, (availW - cell * seasons.length) / 2);
    const colorFor = (v, x, y, w, h) => src === 'diff' ? (Math.abs(v) < 0.3 ? C.empty : v > 0 ? '#2f6e3a' : '#a8433b')
      : MSSEp.band(v).key === 'perfect' ? gold(x, y, w, h) : band(MSSEp.band(v).key);
    const textFor = v => src === 'diff' ? (Math.abs(v) < 0.3 ? C.text : '#fff') : (MSSEp.band(v).ink ? (MSSEp.band(v).key === 'perfect' ? '#2b1e02' : '#1a1a1a') : '#fff');
    // numbers stay readable: Bebas at ~50% of the box (min 11px); hidden only on tiny boxes
    const numPx = Math.max(11, Math.round(Math.min(box, 46) * 0.5)), showNums = box >= 17;
    const labelEvery = cell >= 15 ? 1 : Math.ceil(15 / cell) * 5;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `400 ${numPx}px "Bebas Neue", sans-serif`;
    seasons.forEach((sn, ci) => { if (cell >= 14 || ci % Math.ceil(14 / cell) === 0) { g.fillStyle = C.sub; g.fillText('S' + sn, gx + ci * cell + box / 2, gridTop + box / 2); } });
    const drawBox = (x, yy, v) => {
      g.fillStyle = v == null ? C.empty : colorFor(v, x, yy, box, box);
      g.beginPath(); g.roundRect(x, yy, box, box, Math.max(1, box * 0.16)); g.fill();
      if (v != null && showNums) { g.fillStyle = textFor(v); g.fillText(src === 'diff' ? (v > 0 ? '+' : '') + v.toFixed(1) : v >= 10 ? '10' : v.toFixed(1), x + box / 2, yy + box / 2 + 1); }
    };
    for (let n = 1; n <= maxEp; n++) {
      const yy = gridTop + n * cell;
      if (n === 1 || n % labelEvery === 0) { g.fillStyle = C.sub; g.textAlign = 'right'; g.fillText('E' + n, gx - 8, yy + box / 2); g.textAlign = 'center'; }
      seasons.forEach((sn, ci) => { const ep = (st.eps[sn] || []).find(x => x.n === n); if (ep) drawBox(gx + ci * cell, yy, sco(sn, ep)); });
    }
    const ay = gridTop + (maxEp + 1.6) * cell;
    g.fillStyle = C.line; g.fillRect(gx - labW * 0.6, ay - cell * 0.32, cell * seasons.length + labW * 0.6, 1.5);   // divider above AVG
    g.fillStyle = C.olive; g.textAlign = 'right'; g.fillText('AVG', gx - 8, ay + box / 2); g.textAlign = 'center';
    seasons.forEach((sn, ci) => drawBox(gx + ci * cell, ay, avg((st.eps[sn] || []).map(ep => sco(sn, ep)))));

    // ── Legend ──
    const ly = H - pad - footH - legendH / 2;
    g.fillStyle = C.line; g.fillRect(pad, ly - legendH / 2 - 4, W - pad * 2, 1.5);            // divider: grid | legend
    g.font = `600 ${Math.round(U * 0.0125)}px Manrope, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    const items = src === 'diff' ? [['#2f6e3a', 'Higher than TMDB'], [C.empty, 'Same'], ['#a8433b', 'Lower than TMDB']]
      : MSSEp.BANDS.map(b => [b.key === 'perfect' ? 'gold' : band(b.key), b.name]);
    const iw = (W - pad * 2) / items.length, sw = Math.round(U * 0.015);
    items.forEach(([c, l], i) => { const x = pad + i * iw; g.fillStyle = c === 'gold' ? gold(x, ly - sw / 2, sw, sw) : c; g.beginPath(); g.roundRect(x, ly - sw / 2, sw, sw, 4); g.fill(); g.fillStyle = C.text; g.fillText(l, x + sw + 6, ly + 1); });

    // ── Footer: user (left) · MyScreenFolio logo + name (right) ──
    const fy = H - pad - footH / 2 + 6;
    g.fillStyle = C.line; g.fillRect(pad, H - pad - footH + 6, W - pad * 2, 1.5);
    const av = Math.round(footH * 0.5);
    g.save(); g.beginPath(); g.arc(pad + av / 2, fy, av / 2, 0, Math.PI * 2); g.closePath();
    if (avatar) { g.clip(); g.drawImage(avatar, pad, fy - av / 2, av, av); }
    else { g.fillStyle = band('great'); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `600 ${Math.round(av * 0.48)}px Oswald, sans-serif`; g.fillText((who?.username || '?')[0].toUpperCase(), pad + av / 2, fy + 1); }
    g.restore();
    g.textAlign = 'left'; g.fillStyle = C.text; g.font = `600 ${Math.round(U * 0.014)}px Manrope, sans-serif`;
    g.fillText('@' + (who?.username || 'myscreenfolio'), pad + av + 14, fy);
    const lg = Math.round(footH * 0.5);
    g.textAlign = 'right'; g.fillStyle = C.olive; g.font = `600 ${Math.round(U * 0.016)}px Oswald, sans-serif`;
    const brand = 'MYSCREENFOLIO', bw = g.measureText(brand).width;
    g.fillText(brand, W - pad, fy);
    if (logo) { g.save(); g.beginPath(); g.roundRect(W - pad - bw - lg - 12, fy - lg / 2, lg, lg, lg * 0.22); g.clip(); g.drawImage(logo, W - pad - bw - lg - 12, fy - lg / 2, lg, lg); g.restore(); }
    g.fillStyle = C.sub; g.font = `500 ${Math.round(U * 0.012)}px Manrope, sans-serif`; g.textAlign = 'center';
    g.fillText('Episode data: TMDB', W / 2, H - Math.round(pad * 0.45));

  }

  return { load, draw, scoreOf, key, blank, SIZES };
})();
