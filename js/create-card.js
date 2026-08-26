function _injectCreateCardOverlay() {
  if (document.getElementById('createCardOverlay')) return;
  const el = document.createElement('div');
  el.id = 'createCardOverlay';
  el.innerHTML = `
    <div id="createCardModal">
      <div id="createCardHeader">
        <div id="createCardHeaderTitle">Create Card</div>
        <button onclick="closeCreateCard()" id="createCardClose">&#x2715;</button>
      </div>
      <div id="createCardBody">
        <div id="createCardPageRow">
          <button class="card-page-btn active" data-page="1" onclick="setCardPage(1,this)">Card</button>
          <button class="card-page-btn" data-page="3" onclick="setCardPage(3,this)">Discover Card</button>
        </div>
        <div id="createCardThemeRow">
          <button class="card-theme-btn" data-theme="dark" onclick="setCardTheme('dark',this)">
            <span class="card-theme-swatch dark"></span> Dark
          </button>
          <button class="card-theme-btn active" data-theme="light" onclick="setCardTheme('light',this)">
            <span class="card-theme-swatch light"></span> Light
          </button>
        </div>
        <div id="createCardPreviewWrap">
          <canvas id="createCardCanvas"></canvas>
        </div>
        <div id="discoverLinkPrompt" style="display:none;text-align:center;padding:14px 10px 4px;">
          <button id="discoverLinkBtn" onclick="_linkCardEntryToTMDB()" class="popup-action-btn" style="display:inline-flex;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Search &amp; Link to TMDB
          </button>
        </div>
      </div>
      <div id="createCardFooter">
        <button onclick="closeCreateCard()" class="create-card-cancel">Cancel</button>
        <button onclick="downloadCard()" class="create-card-download">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Save Image
        </button>
      </div>
    </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) closeCreateCard(); });
  document.body.appendChild(el);
}

let _cardEntry = null;
let _cardTheme = 'light';
let _cardPage = 1;
let _cardDiscoverData = null;
let _cardDiscoverEntryKey = null;

async function createShareCard(id, startPage, restrictToStartPage) {
  _injectCreateCardOverlay();
  const e = _resolveEntryForCard(id);
  if (!e) { showToast('Entry not found.', 'err'); return; }
  _cardEntry = e;
  _cardTheme = 'light';
  _cardPage = startPage || 1;
  document.querySelectorAll('.card-theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === 'light');
  });
  const pageRow = document.getElementById('createCardPageRow');
  document.querySelectorAll('.card-page-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === String(_cardPage));
    b.style.display = restrictToStartPage && b.dataset.page !== String(_cardPage) ? 'none' : '';
  });
  if (pageRow) pageRow.style.display = restrictToStartPage ? 'none' : '';
  const ov = document.getElementById('createCardOverlay');
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
  _resetCanvas();
  await _drawCard();
}

function _resetCanvas() {
  const wrap = document.getElementById('createCardPreviewWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const c = document.createElement('canvas');
  c.id = 'createCardCanvas';
  wrap.appendChild(c);
}

function closeCreateCard() {
  const ov = document.getElementById('createCardOverlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
  _cardEntry = null;
}

function setCardTheme(theme, btn) {
  _cardTheme = theme;
  document.querySelectorAll('.card-theme-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (!document.getElementById('createCardCanvas')) _resetCanvas();
  _drawCard();
}

function setCardPage(page, btn) {
  _cardPage = page;
  document.querySelectorAll('.card-page-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (!document.getElementById('createCardCanvas')) _resetCanvas();
  _drawCard();
}

let _cardRenderToken = 0;

async function _drawCard() {
  const myToken = ++_cardRenderToken;
  try {
    if (_cardPage === 3) await _drawDiscoverCard(myToken);
    else await _drawCardPage1(myToken);
  } catch (err) {
    console.error('Card render error:', err);
  }
}

function _cardUsername() {
  const un =
    (typeof _pProfile   !== 'undefined' && _pProfile?.username)   ? _pProfile.username   :
    (typeof _sProfile   !== 'undefined' && _sProfile?.username)   ? _sProfile.username   :
    (typeof _favProfile !== 'undefined' && _favProfile?.username)  ? _favProfile.username :
    (window._navUserProfile?.username)                              ? window._navUserProfile.username :
    (typeof _catUser !== 'undefined' && _catUser?.email)           ? _catUser.email.split('@')[0] :
    (typeof _detUser !== 'undefined' && _detUser?.email)           ? _detUser.email.split('@')[0] :
    (window._navUser?.email)                                        ? window._navUser.email.split('@')[0] :
    '';
  return un ? '@' + un : '';
}

function _cardPalette(D) {
  return {
    BG:      D ? '#1e2219' : '#f4efe5',
    BG_POST: D ? '#2a2f24' : '#e6e0d4',
    BG_DARK: D ? '#12140f' : '#232920',
    TEXT_ON_DARK:  '#eae6de',
    TEXT2_ON_DARK: D ? '#9aa392' : '#a8ad9f',
    TEXT:    D ? '#eae6de' : '#18180f',
    TEXT2:   D ? '#9a9488' : '#5a5248',
    OLIVE:   D ? '#7a9262' : '#3e5c35',
    OLIVEL:  D ? '#aac48c' : '#3e5c35',
    DIVIDER: D ? 'rgba(170,196,140,0.18)' : 'rgba(62,92,53,0.14)',
    PILL_BG: D ? 'rgba(122,146,98,0.14)' : 'rgba(62,92,53,0.08)',
    LOW:     D ? '#e08585' : '#a33333',
    LOW_BG:  D ? 'rgba(224,133,133,0.14)' : 'rgba(153,27,27,0.08)',
    BOX_BORDER: D ? 'rgba(170,196,140,0.35)' : 'rgba(62,92,53,0.3)',
  };
}

function _loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => {
      const img2 = new Image();
      img2.crossOrigin = 'anonymous';
      img2.onload  = () => res(img2);
      img2.onerror = () => rej(new Error('Image load failed'));
      img2.src = src + (src.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    };
    img.src = src;
  });
}

function _wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function _rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ══════════════════════════════════════════════════════════════
   PAGE 1 — Card
   Plain canvas drawing — poster (with a diagonal year badge) /
   info / score box header, a bottom-anchored favorites+lowlights
   block, a dark percentage-breakdown bar (Core/Enjoyment/Bonus =
   Final Score), a three-column ratings section, and a personal
   note. All colors and fonts come from the site's own palette.
══════════════════════════════════════════════════════════════ */
async function _drawCardPage1(myToken) {
  const canvas = document.getElementById('createCardCanvas');
  if (!canvas || !_cardEntry) return;
  const e = _cardEntry;

  const wrap = document.getElementById('createCardPreviewWrap');
  const needsFetch = e.tmdb_id && e.tmdb_type && _cardDiscoverEntryKey !== (e.tmdb_type + ':' + e.tmdb_id);
  if (needsFetch && wrap && !document.getElementById('discoverCardLoading')) {
    canvas.style.display = 'none';
    const loadEl = document.createElement('div');
    loadEl.id = 'discoverCardLoading';
    loadEl.style.cssText = 'padding:3rem 1rem;text-align:center;color:var(--text-3);font-size:13px;';
    loadEl.textContent = 'Fetching details from TMDB…';
    wrap.appendChild(loadEl);
  }
  const discoverData = await _fetchDiscoverData(e);
  const loadEl = document.getElementById('discoverCardLoading');
  if (loadEl) loadEl.remove();
  canvas.style.display = '';
  if (myToken !== _cardRenderToken || _cardPage !== 1 || _cardEntry !== e) return;

  const promptEl = document.getElementById('discoverLinkPrompt');
  if (promptEl) promptEl.style.display = discoverData ? 'none' : '';

  const D = _cardTheme === 'dark';
  // Site color palette (matching style.css exactly), applied to the
  // reference layout's structure. INK-toned panels (breakdown bar,
  // ratings background, corner badge) are the opposite brightness of
  // the main card background in each theme — dark panel on the light
  // card, light panel on the dark card — so they always read as a
  // distinct, contrasting section rather than blending into whichever
  // background surrounds them.
  const ACCENT = D ? '#aac48c' : '#3e5c35';
  const INK = D ? '#e6e0d4' : '#232920';
  // Text/accent colors for content sitting on the INK panel — these
  // invert opposite to ACCENT/TEXT, since the panel itself is already
  // inverted relative to the main card background.
  const PANEL_ACCENT = D ? '#3e5c35' : '#aac48c';
  const PANEL_TEXT = D ? '#18180f' : '#eae6de';
  const PANEL_TEXT2 = D ? '#5a5248' : '#9aa392';
  const BG = D ? '#1e2219' : '#f4efe5';
  const BG_POST = D ? '#2a2f24' : '#e6e0d4';
  const BG_BORDER = D ? 'rgba(170,196,140,0.35)' : 'rgba(62,92,53,0.3)';
  const MUTED = D ? '#9a9488' : '#5a5248';
  const TEXT = D ? '#eae6de' : '#18180f';
  const TEXT2 = D ? '#c7c1ac' : '#3a3428';
  const LOW = D ? '#e08585' : '#a33333';
  const TRACK_BG = 'rgba(255,255,255,0.12)';
  // Fixed (non-theme-adaptive) pair for the footer and genre pills —
  // these are branding/badge elements meant to look consistent
  // regardless of theme, not panels that should invert with it.
  const FIXED_ACCENT = '#aac48c';
  const FIXED_INK = '#232920';

  const W = 1000, PAD = 28;

  let posterImg = null;
  if (e.poster_url) { try { posterImg = await _loadImage(e.poster_url); } catch { posterImg = null; } }
  let logoImg = null;
  try { logoImg = await _loadImage('icons/logo-nav.png'); } catch { logoImg = null; }

  if (myToken !== _cardRenderToken || _cardPage !== 1 || _cardEntry !== e) return;

  const score = (typeof liveScore === 'function' && liveScore(e) != null)
    ? Number(liveScore(e)).toFixed(2) : null;

  const POSTER_W = 290, GAP = 28, SCORE_W = 220;
  const INFO_X = PAD + POSTER_W + GAP;
  const SCORE_X = W - PAD - SCORE_W;
  const INFO_W = SCORE_X - GAP - INFO_X;

  function layout(ctx, draw) {
    const pillRow = (items, xx, yy, maxW, textColor, bgColor, borderColor) => {
      ctx.save();
      ctx.font = '700 12px "Inter", Arial, sans-serif';
      const pPX = 12, pPY = 5, pGap = 8, pR = 6;
      const pillH = 12 + pPY * 2;
      let gx = xx, rows = 1;
      items.forEach(it => {
        const label = it.toUpperCase();
        const gw = ctx.measureText(label).width + pPX * 2;
        if (gx + gw > xx + maxW && gx > xx) { gx = xx; rows++; }
        if (draw) {
          const ry = yy + (rows - 1) * (pillH + 8);
          ctx.fillStyle = bgColor;
          _rrect(ctx, gx, ry, gw, pillH, pR); ctx.fill();
          ctx.strokeStyle = borderColor; ctx.lineWidth = 1;
          _rrect(ctx, gx, ry, gw, pillH, pR); ctx.stroke();
          ctx.fillStyle = textColor;
          ctx.textBaseline = 'middle';
          ctx.fillText(label, gx + pPX, ry + pillH / 2);
        }
        gx += gw + pGap;
      });
      ctx.restore();
      return rows * pillH + (rows - 1) * 8;
    };
    const ratingRow = (label, value, xx, yy, colW) => {
      const nameW = 150, numW = 34, gap = 12;
      const barX = xx + nameW + gap, barW = colW - nameW - numW - gap * 2;
      if (draw) {
        ctx.save();
        let nameFS = 12.5;
        ctx.font = `400 ${nameFS}px "Inter", Arial, sans-serif`;
        while (ctx.measureText(label).width > nameW && nameFS > 9) {
          nameFS -= 0.5;
          ctx.font = `400 ${nameFS}px "Inter", Arial, sans-serif`;
        }
        ctx.fillStyle = PANEL_TEXT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, xx, yy + 7);
        ctx.restore();
        ctx.fillStyle = TRACK_BG;
        _rrect(ctx, barX, yy + 4, Math.max(barW, 10), 5, 3); ctx.fill();
        const pct = Math.max(0, Math.min(1, Number(value) / 10));
        ctx.fillStyle = PANEL_ACCENT;
        _rrect(ctx, barX, yy + 4, Math.max(barW * pct, 4), 5, 3); ctx.fill();
        ctx.save();
        ctx.font = '700 14px "Inter", Arial, sans-serif';
        ctx.fillStyle = PANEL_ACCENT;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(Number(value).toFixed(1), xx + colW, yy + 7);
        ctx.restore();
      }
      return 14 + 14;
    };

    if (draw) { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, workCanvas.height); }

    // ── Info column content, measured first so the header row's overall
    // height (and therefore the poster/score column heights) is known ──
    let iy = 4;
    const title = e.title || '';
    const tFS = title.length > 22 ? 32 : title.length > 14 ? 38 : 42;
    ctx.save();
    ctx.font = `600 ${tFS}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const titleLines = _wrap(ctx, title, INFO_W).slice(0, 2);
    if (draw) { ctx.fillStyle = TEXT; titleLines.forEach((ln, i) => ctx.fillText(ln, INFO_X, iy + i * (tFS + 2))); }
    ctx.restore();
    iy += titleLines.length * (tFS + 2) + 14;

    const genres = (e.genres || []).slice(0, 4);
    if (genres.length) {
      const gh = pillRow(genres, INFO_X, iy, INFO_W, FIXED_INK, FIXED_ACCENT, FIXED_INK);
      iy += gh + 14;
    }

    const desc = (e.description || '').trim();
    let descLines = [];
    if (desc) {
      ctx.save();
      ctx.font = '400 15px "Inter", Arial, sans-serif';
      ctx.textBaseline = 'top';
      const dwords = desc.split(/\s+/);
      const dshort = dwords.length > 55 ? dwords.slice(0, 55).join(' ') + '…' : desc;
      descLines = _wrap(ctx, dshort, INFO_W).slice(0, 5);
      if (draw) { ctx.fillStyle = TEXT; descLines.forEach((ln, i) => ctx.fillText(ln, INFO_X, iy + i * 21)); }
      ctx.restore();
      iy += descLines.length * 21;
    }

    // Favorites/Lowlights block — measured, then anchored to the bottom
    // of the header row once the overall header height is known.
    const favs = e.ratings?._favorites || {};
    const lows = e.ratings?._lowlights || e.ratings?._favorites?._lowlights || {};
    const favVals = [
      favs.character ? { label: 'Favorite Character', value: favs.character } : null,
      favs.episode   ? { label: 'Favorite Episode', value: favs.episode } : null,
      favs.season    ? { label: 'Favorite Season', value: favs.season } : null,
    ].filter(Boolean);
    const lowVals = [
      lows.character ? { label: 'Lowlight Character', value: lows.character } : null,
      lows.episode   ? { label: 'Lowlight Episode', value: lows.episode } : null,
      lows.season    ? { label: 'Lowlight Season', value: lows.season } : null,
    ].filter(Boolean);
    const hasLow = lowVals.length > 0;
    const favRowH = hasLow ? 60 : 72;
    const favBlockH = (favVals.length ? favRowH : 0) + (hasLow ? favRowH : 0);
    const favBlockGap = (favVals.length || hasLow) ? 20 : 0;

    const infoContentH = iy + favBlockGap + favBlockH;

    // ── Poster + badge + score column minimums ──
    const POSTER_H = POSTER_W * 1.5;
    const SCORE_MIN_H = 168;
    const headerH = Math.max(POSTER_H, infoContentH, SCORE_MIN_H);

    // Poster column — fixed 2:3 aspect ratio, top-aligned (doesn't
    // stretch to match the header row's full height, which was forcing
    // aggressive cover-fit cropping whenever the info column made
    // headerH much taller than a normal poster's proportions).
    if (draw) {
      ctx.save();
      _rrect(ctx, PAD, PAD, POSTER_W, POSTER_H, 16); ctx.clip();
      if (posterImg) {
        const imgRatio = posterImg.width / posterImg.height;
        const areaRatio = POSTER_W / POSTER_H;
        let dw, dh, dx, dy;
        if (imgRatio > areaRatio) { dh = POSTER_H; dw = POSTER_H * imgRatio; dx = PAD - (dw - POSTER_W) / 2; dy = PAD; }
        else { dw = POSTER_W; dh = POSTER_W / imgRatio; dx = PAD; dy = PAD - (dh - POSTER_H) / 2; }
        ctx.drawImage(posterImg, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = BG_POST;
        ctx.fillRect(PAD, PAD, POSTER_W, POSTER_H);
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '300 60px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = ACCENT;
        ctx.fillText((e.title || '?')[0].toUpperCase(), PAD + POSTER_W / 2, PAD + POSTER_H / 2);
        ctx.restore();
      }
      // Diagonal corner badge with the year, top-left of the poster
      if (e.year) {
        const bs = 90;
        ctx.beginPath();
        ctx.moveTo(PAD, PAD);
        ctx.lineTo(PAD + bs, PAD);
        ctx.lineTo(PAD, PAD + bs);
        ctx.closePath();
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.save();
        ctx.font = '700 14px "Inter", Arial, sans-serif';
        ctx.fillStyle = PANEL_ACCENT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(String(e.year), PAD + 10, PAD + 14);
        ctx.restore();
      }
      ctx.restore();
    }

    // Score column — height reaches down to just above the
    // favorites/lowlights box (small gap between), text centered.
    const SCORE_BOX_H = (favVals.length || hasLow)
      ? Math.max(140, headerH - favBlockH - 20)
      : 168;
    if (draw) {
      ctx.strokeStyle = BG_BORDER; ctx.lineWidth = 1;
      _rrect(ctx, SCORE_X, PAD, SCORE_W, SCORE_BOX_H, 14); ctx.stroke();
      const cx = SCORE_X + SCORE_W / 2;
      const midY = PAD + SCORE_BOX_H / 2;
      ctx.save();
      ctx.font = '700 12px "Inter", Arial, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('OVERALL SCORE', cx, midY - 48);
      ctx.restore();
      ctx.save();
      let scoreFS = 66;
      ctx.font = `600 ${scoreFS}px "Cormorant Garamond", Georgia, serif`;
      while (ctx.measureText(score || '—').width > SCORE_W - 24 && scoreFS > 40) {
        scoreFS -= 4;
        ctx.font = `600 ${scoreFS}px "Cormorant Garamond", Georgia, serif`;
      }
      ctx.fillStyle = TEXT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(score || '—', cx, midY);
      ctx.restore();
      ctx.save();
      ctx.font = '700 11px "Inter", Arial, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('OUT OF 10', cx, midY + 48);
      ctx.restore();
    }

    // Favorites/Lowlights block — bottom-anchored within the header
    // row, spanning the info column + score box only (width capped so
    // it never runs under the poster).
    if (favVals.length || hasLow) {
      const blockY = PAD + headerH - favBlockH;
      const blockX = INFO_X;
      const fullW = W - PAD - blockX;
      if (draw) {
        ctx.strokeStyle = BG_BORDER; ctx.lineWidth = 1;
        _rrect(ctx, blockX, blockY, fullW, favBlockH, 10); ctx.stroke();
      }
      const drawFavRow = (items, rowY, rowH, isLow) => {
        const colW = fullW / items.length;
        items.forEach((it, i) => {
          const cx = blockX + colW * i;
          if (draw) {
            const barColor = isLow ? LOW : ACCENT;
            ctx.fillStyle = barColor;
            ctx.fillRect(cx + 14, rowY + 9, 3, rowH - 18);
            ctx.save();
            ctx.font = `700 ${hasLow ? 8.5 : 9.5}px "Inter", Arial, sans-serif`;
            ctx.fillStyle = MUTED;
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(it.label.toUpperCase(), cx + 24, rowY + 9);
            ctx.restore();
            ctx.save();
            const valFS = hasLow ? 11 : 12.5;
            ctx.font = `700 ${valFS}px "Inter", Arial, sans-serif`;
            ctx.fillStyle = TEXT;
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            const maxW = colW - 34;
            let vLines = _wrap(ctx, it.value, maxW).slice(0, 2);
            if (vLines.length === 2) {
              let lastLine = vLines[1];
              while (ctx.measureText(lastLine + '…').width > maxW && lastLine.length > 1) {
                lastLine = lastLine.slice(0, -1);
              }
              vLines[1] = lastLine.replace(/\s+$/, '') + '…';
            }
            vLines.forEach((ln, li) => ctx.fillText(ln, cx + 24, rowY + 22 + li * (valFS + 3)));
            ctx.restore();
          }
        });
      };
      if (favVals.length) drawFavRow(favVals, blockY, favRowH, false);
      if (hasLow) {
        if (draw && favVals.length) {
          ctx.strokeStyle = BG_BORDER; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(blockX, blockY + favRowH); ctx.lineTo(blockX + fullW, blockY + favRowH); ctx.stroke();
        }
        drawFavRow(lowVals, blockY + (favVals.length ? favRowH : 0), favRowH, true);
      }
    }

    let y = PAD + headerH + 30;

    // ── Breakdown bar (dark ink background) ──
    const ratings = e.ratings || {};
    const cat = e.cat;
    const isAnimated = cat === 'anime' || cat === 'cartoons';
    const { core: coreArr, bonus: bonusArr } = (typeof getRatings === 'function') ? getRatings(cat) : { core: [], bonus: [] };
    const hasVal = v => v !== undefined && v !== null && v !== '';
    const coreItems = coreArr.filter(r => r.key !== 'enjoyment')
      .map(r => ({ label: r.label, value: ratings[r.key] }))
      .filter(r => hasVal(r.value));
    if (!isAnimated && hasVal(ratings.animation)) coreItems.push({ label: 'Animation Quality', value: ratings.animation });
    const enjoyVal = hasVal(ratings.enjoyment) ? ratings.enjoyment : null;
    const bonusItems = bonusArr.map(r => ({ label: r.label, value: ratings[r.key] })).filter(r => hasVal(r.value));

    const breakdownParts = [];
    if (coreItems.length) breakdownParts.push({ label: 'CORE', pct: 70, desc: 'Story, plot, acting, writing, world building and more.' });
    if (enjoyVal != null) breakdownParts.push({ label: 'ENJOYMENT', pct: 20, desc: 'How engaging, fun, and impactful the experience is.' });
    if (bonusItems.length) breakdownParts.push({ label: 'BONUS', pct: 10, desc: 'Extra points for the little things that elevate it.' });

    if (score && breakdownParts.length) {
      const bdPadY = 26, bdPadX = 30;
      const opW = 40, finalW = 200;
      const boxW = W - PAD * 2;
      const partsW = boxW - opW * breakdownParts.length - finalW;
      const partW = partsW / breakdownParts.length;
      const bdH = bdPadY * 2 + 96;
      if (draw) {
        ctx.fillStyle = INK;
        _rrect(ctx, PAD, y, boxW, bdH, 14); ctx.fill();
      }
      let bx = PAD + bdPadX;
      breakdownParts.forEach((p, pi) => {
        const colCenter = bx + partW / 2;
        if (draw) {
          ctx.save();
          ctx.font = '700 12px "Inter", Arial, sans-serif';
          ctx.fillStyle = PANEL_TEXT2;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(p.label, colCenter, y + bdPadY);
          ctx.restore();
          ctx.save();
          ctx.font = '600 40px "Cormorant Garamond", Georgia, serif';
          ctx.fillStyle = PANEL_ACCENT;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(p.pct + '%', colCenter, y + bdPadY + 20);
          ctx.restore();
          ctx.save();
          ctx.font = '400 11.5px "Inter", Arial, sans-serif';
          ctx.fillStyle = PANEL_TEXT2;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          const dl = _wrap(ctx, p.desc, partW - 6).slice(0, 3);
          dl.forEach((ln, li) => ctx.fillText(ln, colCenter, y + bdPadY + 78 + li * 15));
          ctx.restore();
        }
        bx += partW;
        // Only draw a "+" between parts — not after the last one, which
        // is where the "=" belongs instead (drawing both in the same
        // slot was the overlap bug).
        if (pi < breakdownParts.length - 1) {
          if (draw) {
            ctx.save();
            ctx.font = '700 26px "Inter", Arial, sans-serif';
            ctx.fillStyle = PANEL_TEXT2;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('+', bx + opW / 2, y + bdH / 2);
            ctx.restore();
          }
          bx += opW;
        }
      });
      if (draw) {
        ctx.save();
        ctx.font = '700 26px "Inter", Arial, sans-serif';
        ctx.fillStyle = PANEL_TEXT2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('=', bx + opW / 2, y + bdH / 2);
        ctx.restore();
        bx += opW;
        const finalColW = finalW - bdPadX;
        const finalCenter = bx + finalColW / 2;
        const fbY = y + 8, fbH = bdH - 16;
        ctx.strokeStyle = BG_BORDER; ctx.lineWidth = 1;
        _rrect(ctx, bx, fbY, finalColW, fbH, 12); ctx.stroke();
        ctx.save();
        ctx.font = '700 12px "Inter", Arial, sans-serif';
        ctx.fillStyle = PANEL_TEXT2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('FINAL SCORE', finalCenter, y + bdPadY);
        ctx.restore();
        ctx.save();
        ctx.font = '700 66px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = PANEL_ACCENT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(score, finalCenter, y + bdH / 2);
        ctx.restore();
      }
      y += bdH + 24;
    }

    // ── Ratings — three columns (Core | Enjoyment | Bonus), its own box ──
    if (coreItems.length || enjoyVal != null || bonusItems.length) {
      const ratPadX = 30, colGap = 28;
      const boxW = W - PAD * 2;
      const cols = [];
      if (coreItems.length) cols.push({ title: 'CORE RATINGS', pct: 70, items: coreItems });
      if (enjoyVal != null) cols.push({ title: 'ENJOYMENT', pct: 20, items: [{ label: 'Enjoyment', value: enjoyVal }] });
      if (bonusItems.length) cols.push({ title: 'BONUS', pct: 10, items: bonusItems });
      const colW = (boxW - ratPadX * 2 - colGap * (cols.length - 1)) / cols.length;

      let maxColH = 0;
      cols.forEach(col => {
        let ch = 20;
        ch += col.items.length * 28;
        maxColH = Math.max(maxColH, ch);
      });
      const secH = maxColH + 24;
      if (draw) {
        ctx.fillStyle = INK;
        _rrect(ctx, PAD, y, boxW, secH, 14); ctx.fill();
      }

      cols.forEach((col, ci) => {
        const cx = PAD + ratPadX + ci * (colW + colGap);
        let cy = y + 20;
        if (draw) {
          ctx.save();
          ctx.font = '700 14px "Inter", Arial, sans-serif';
          ctx.fillStyle = PANEL_TEXT;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(col.title + '  ', cx, cy);
          const w1 = ctx.measureText(col.title + '  ').width;
          ctx.font = '600 13px "Inter", Arial, sans-serif';
          ctx.fillStyle = PANEL_TEXT2;
          ctx.fillText('(' + col.pct + '%)', cx + w1, cy);
          ctx.restore();
        }
        cy += 30;
        col.items.forEach(it => { cy += ratingRow(it.label, it.value, cx, cy, colW); });
      });
      y += secH + 24;

      // Small caption line under the ratings box
      const capParts = [];
      if (coreItems.length) capParts.push('70% CORE');
      if (enjoyVal != null) capParts.push('20% ENJOYMENT');
      if (bonusItems.length) capParts.push('10% BONUS');
      if (draw) {
        ctx.save();
        ctx.font = '600 11px "Inter", Arial, sans-serif';
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('SCORE BREAKDOWN: ' + capParts.join(' + '), W / 2, y);
        ctx.restore();
      }
      y += 11 + 20;
    }

    // ── Personal note ──
    const note = (e.notes || '').trim();
    if (note) {
      const boxPadTop = 30, boxPadBottom = 26, boxPadX = 30;
      const noteWords = note.split(/\s+/);
      const noteExcerpt = noteWords.length > 150 ? noteWords.slice(0, 150).join(' ') + '…' : note;
      ctx.save();
      ctx.font = 'italic 300 15px "Cormorant Garamond", Georgia, serif';
      const nlines = _wrap(ctx, noteExcerpt, W - PAD * 2 - boxPadX * 2);
      ctx.restore();
      const LINE_H = 25;
      const boxH = boxPadTop + nlines.length * LINE_H + boxPadBottom;
      const boxY = y;
      if (draw) {
        ctx.strokeStyle = BG_BORDER; ctx.lineWidth = 1;
        _rrect(ctx, PAD, boxY, W - PAD * 2, boxH, 10); ctx.stroke();
        ctx.fillStyle = ACCENT;
        ctx.fillRect(PAD, boxY, 4, boxH);
        ctx.save();
        ctx.font = '700 12.5px "Inter", Arial, sans-serif';
        ctx.fillStyle = TEXT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('PERSONAL NOTE', PAD + boxPadX, boxY + 8);
        ctx.restore();
        ctx.save();
        ctx.font = 'italic 400 15px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = TEXT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        nlines.forEach((ln, i) => ctx.fillText(ln, PAD + boxPadX, boxY + boxPadTop + i * LINE_H));
        ctx.restore();
      }
      y = boxY + boxH + 24;
    }

    return y;
  }

  const FOOTER_H = 56;
  let workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = 2600;
  const measureCtx = workCanvas.getContext('2d');
  const contentBottom = layout(measureCtx, false);
  const totalH = Math.round(contentBottom + FOOTER_H);

  if (myToken !== _cardRenderToken || _cardPage !== 1 || _cardEntry !== e) return;

  // Render the full card at its natural height onto an off-screen buffer
  workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = totalH;
  const ctx = workCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  layout(ctx, true);

  // ── Footer ──
  ctx.fillStyle = BG;
  ctx.fillRect(-1, totalH - FOOTER_H, W + 2, FOOTER_H);
  const username = _cardUsername();
  const footerMidY = totalH - FOOTER_H / 2;
  if (username) {
    const avatarR = 14;
    const avatarCX = PAD + avatarR, avatarCY = footerMidY;
    ctx.save();
    ctx.fillStyle = FIXED_ACCENT;
    ctx.beginPath(); ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 13px "Inter", Arial, sans-serif';
    ctx.fillStyle = FIXED_INK;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((username.replace('@', '')[0] || '?').toUpperCase(), avatarCX, avatarCY + 1);
    ctx.restore();
    ctx.save();
    ctx.font = '700 13.5px "Inter", Arial, sans-serif';
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(username, PAD + avatarR * 2 + 10, footerMidY);
    ctx.restore();
  }
  ctx.save();
  ctx.font = '700 14px "Inter", Arial, sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const msLabel = 'MyScreenScore';
  const msW = ctx.measureText(msLabel).width;
  ctx.fillText(msLabel, W - PAD, footerMidY);
  if (logoImg) {
    const logoH = 20, logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, W - PAD - msW - 8 - logoW, footerMidY - logoH / 2, logoW, logoH);
  }
  ctx.restore();

  // Copy the naturally-rendered content straight across at its own
  // height — no forced paper-size padding or scaling.
  canvas.width = W;
  canvas.height = totalH;
  const maxW = Math.min(340, window.innerWidth - 64);
  canvas.style.width = maxW + 'px';
  canvas.style.height = (maxW * totalH / W) + 'px';
  const finalCtx = canvas.getContext('2d');
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(workCanvas, 0, 0);
}

async function _fetchDiscoverData(e) {
  const key = (e.tmdb_type || '') + ':' + (e.tmdb_id || '');
  if (_cardDiscoverEntryKey === key && _cardDiscoverData) return _cardDiscoverData;
  if (!e.tmdb_id || !e.tmdb_type) { _cardDiscoverData = null; _cardDiscoverEntryKey = key; return null; }
  try {
    const url = `${TMDB_BASE}/${e.tmdb_type}/${e.tmdb_id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=credits`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB fetch failed: ' + res.status);
    const data = await res.json();

    let director = '';
    if (e.tmdb_type === 'movie') {
      const d = (data.credits?.crew || []).find(c => c.job === 'Director');
      director = d ? d.name : '';
    } else {
      director = (data.created_by || []).map(c => c.name).join(', ');
    }
    const cast = (data.credits?.cast || []).slice(0, 5).map(c => c.name).filter(Boolean);
    const production = (data.production_companies || []).map(c => c.name).slice(0, 3).filter(Boolean);

    const result = { director, cast, production };
    _cardDiscoverData = result;
    _cardDiscoverEntryKey = key;
    return result;
  } catch (err) {
    console.error('Discover card fetch error:', err);
    _cardDiscoverData = null;
    _cardDiscoverEntryKey = key;
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   Search & Link to TMDB — shown when an entry has no tmdb_id/type
   yet, letting the person search and link one so Director/Genres/
   Discover Card data can be fetched for it.
══════════════════════════════════════════════════════════════ */
let _cardLinkResults = [];
let _cardLinkSearchTimer = null;

function _injectCardLinkPicker() {
  if (document.getElementById('cardLinkOverlay')) return;
  const el = document.createElement('div');
  el.id = 'cardLinkOverlay';
  el.innerHTML = `<div id="cardLinkCard">
    <div class="rf-header">
      <div class="rf-title">Link to TMDB</div>
      <button class="rf-close" onclick="_closeCardLinkPicker()">${typeof icon === 'function' ? icon('x', 18) : '✕'}</button>
    </div>
    <div class="card-link-input-wrap">
      <input class="card-link-input" id="cardLinkSearchInput" placeholder="Search movies & TV shows…" oninput="_onCardLinkSearchInput(this.value)">
    </div>
    <div class="rf-list" id="cardLinkResultsList"></div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) _closeCardLinkPicker(); });
  document.body.appendChild(el);
}

function _linkCardEntryToTMDB() {
  _injectCardLinkPicker();
  const input = document.getElementById('cardLinkSearchInput');
  input.value = '';
  document.getElementById('cardLinkResultsList').innerHTML = '';
  _cardLinkResults = [];
  document.getElementById('cardLinkOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) setTimeout(() => input.focus(), 150);
}

function _closeCardLinkPicker() {
  const ov = document.getElementById('cardLinkOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
}

function _onCardLinkSearchInput(query) {
  clearTimeout(_cardLinkSearchTimer);
  const q = query.trim();
  const listEl = document.getElementById('cardLinkResultsList');
  if (!q) { listEl.innerHTML = ''; _cardLinkResults = []; return; }
  _cardLinkSearchTimer = setTimeout(async () => {
    const results = await _tmdbSearch(q, 8);
    _cardLinkResults = results;
    if (!results.length) {
      listEl.innerHTML = `<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--text-3);">No matches found.</div>`;
      return;
    }
    listEl.innerHTML = results.map((r, i) => {
      const title = r.title || r.name || 'Untitled';
      const date = r.release_date || r.first_air_date || '';
      const year = date ? date.slice(0, 4) : '';
      const typeLabel = r.media_type === 'movie' ? 'Movie' : 'TV Show';
      const posterEl = r.poster_path
        ? `<img src="${TMDB_FULL}${r.poster_path}" loading="lazy">`
        : (title[0] || '?').toUpperCase();
      return `<div class="card-link-result" onclick="_pickCardLinkMatch(${i})">
        <div class="card-link-result-poster">${posterEl}</div>
        <div>
          <div class="card-link-result-title">${title}</div>
          <div class="card-link-result-meta">${typeLabel}${year ? ' · ' + year : ''}</div>
        </div>
      </div>`;
    }).join('');
  }, 350);
}

async function _pickCardLinkMatch(i) {
  const r = _cardLinkResults[i];
  const e = _cardEntry;
  _closeCardLinkPicker();
  if (!r || !e) return;
  const tmdbType = r.media_type === 'movie' ? 'movie' : 'tv';
  try {
    const { error } = await sb.from('entries').update({ tmdb_id: r.id, tmdb_type: tmdbType }).eq('id', e.id);
    if (error) throw error;
    e.tmdb_id = r.id;
    e.tmdb_type = tmdbType;
    showToast('Linked to TMDB!');
    await _drawCard();
  } catch (err) {
    showToast('Error linking to TMDB.', 'err');
    console.error(err);
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('cardLinkOverlay')?.classList.contains('open')) {
    _closeCardLinkPicker();
  }
});

/* ══════════════════════════════════════════════════════════════
   PAGE 3 — Discover Card
   TMDB-sourced info card: poster, title/year, genres, director/
   creator, starring cast, and production (when available).
══════════════════════════════════════════════════════════════ */
async function _drawDiscoverCard(myToken) {
  const canvas = document.getElementById('createCardCanvas');
  if (!canvas || !_cardEntry) return;
  const e = _cardEntry;

  const wrap = document.getElementById('createCardPreviewWrap');
  if (wrap && !document.getElementById('discoverCardLoading')) {
    canvas.style.display = 'none';
    const loadEl = document.createElement('div');
    loadEl.id = 'discoverCardLoading';
    loadEl.style.cssText = 'padding:3rem 1rem;text-align:center;color:var(--text-3);font-size:13px;';
    loadEl.textContent = 'Fetching details from TMDB…';
    wrap.appendChild(loadEl);
  }

  const data = await _fetchDiscoverData(e);

  const loadEl = document.getElementById('discoverCardLoading');
  if (loadEl) loadEl.remove();
  canvas.style.display = '';
  if (myToken !== _cardRenderToken || _cardPage !== 3 || _cardEntry !== e) return;

  const promptEl = document.getElementById('discoverLinkPrompt');
  if (promptEl) promptEl.style.display = data ? 'none' : '';

  const D = _cardTheme === 'dark';
  const P = _cardPalette(D);
  const W = 1000, PAD = 40;
  const POSTER_H = 750;
  const FOOTER_H = 60;

  let posterImg = null;
  if (e.poster_url) { try { posterImg = await _loadImage(e.poster_url); } catch { posterImg = null; } }
  let logoImg = null;
  try { logoImg = await _loadImage('icons/logo-nav.png'); } catch { logoImg = null; }

  if (myToken !== _cardRenderToken || _cardPage !== 3 || _cardEntry !== e) return;

  function layout(ctx, draw) {
    const pillRow = (items, xx, yy, maxW, textColor, bgColor) => {
      ctx.save();
      ctx.font = '500 14px "Inter", Arial, sans-serif';
      const pPX = 14, pPY = 7, pGap = 8, pR = 13;
      const pillH = 14 + pPY * 2;
      let gx = xx, rows = 1;
      items.forEach(it => {
        const gw = ctx.measureText(it).width + pPX * 2;
        if (gx + gw > xx + maxW && gx > xx) { gx = xx; rows++; }
        if (draw) {
          const ry = yy + (rows - 1) * (pillH + 8);
          ctx.fillStyle = bgColor;
          _rrect(ctx, gx, ry, gw, pillH, pR); ctx.fill();
          ctx.strokeStyle = P.DIVIDER; ctx.lineWidth = 0.7;
          _rrect(ctx, gx, ry, gw, pillH, pR); ctx.stroke();
          ctx.fillStyle = textColor;
          ctx.textBaseline = 'middle';
          ctx.fillText(it, gx + pPX, ry + pillH / 2);
        }
        gx += gw + pGap;
      });
      ctx.restore();
      return rows * pillH + (rows - 1) * 8;
    };
    const drawDiv = yy => {
      if (!draw) return;
      ctx.strokeStyle = P.DIVIDER; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(PAD, yy); ctx.lineTo(W - PAD, yy); ctx.stroke();
    };
    const drawHdr = (label, yy) => {
      if (draw) {
        ctx.save();
        ctx.font = '700 16px "Inter", Arial, sans-serif';
        ctx.fillStyle = P.OLIVEL;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(label.toUpperCase(), PAD, yy);
        ctx.restore();
      }
      return yy + 16 + 10;
    };

    if (draw) {
      ctx.fillStyle = P.BG;
      ctx.fillRect(0, 0, W, workCanvas.height);
      ctx.fillStyle = P.BG_POST;
      ctx.fillRect(0, 0, W, POSTER_H);
      if (posterImg) {
        const imgRatio = posterImg.width / posterImg.height;
        const areaRatio = W / POSTER_H;
        let dw, dh, dx, dy;
        if (imgRatio > areaRatio) { dw = W; dh = W / imgRatio; dx = 0; dy = (POSTER_H - dh) / 2; }
        else { dh = POSTER_H; dw = POSTER_H * imgRatio; dx = (W - dw) / 2; dy = 0; }
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, POSTER_H); ctx.clip();
        ctx.drawImage(posterImg, dx, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '300 90px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = P.OLIVEL;
        ctx.fillText((e.title || '?')[0].toUpperCase(), W / 2, POSTER_H / 2);
        ctx.restore();
      }
      ctx.strokeStyle = P.DIVIDER; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD, POSTER_H + 1); ctx.lineTo(W - PAD, POSTER_H + 1); ctx.stroke();
    }

    let y = POSTER_H + 30;

    const title = e.title || '';
    const titleFS = title.length > 30 ? 30 : title.length > 20 ? 36 : 42;
    ctx.save();
    ctx.font = `600 ${titleFS}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const titleLines = _wrap(ctx, title, W - PAD * 2).slice(0, 2);
    if (draw) { ctx.fillStyle = P.TEXT; titleLines.forEach((ln, i) => ctx.fillText(ln, PAD, y + i * (titleFS + 4))); }
    ctx.restore();
    y += titleLines.length * (titleFS + 4) + 8;

    if (e.year && draw) {
      ctx.save();
      ctx.font = '400 18px "Inter", Arial, sans-serif';
      ctx.fillStyle = P.TEXT2;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(e.year), PAD, y);
      ctx.restore();
    }
    if (e.year) y += 26;

    if (e.genres?.length) {
      drawDiv(y); y += 16;
      y = drawHdr('Genres', y);
      y += pillRow(e.genres.slice(0, 5), PAD, y, W - PAD * 2, P.OLIVE, P.PILL_BG) + 8;
    }

    if (data?.director) {
      drawDiv(y); y += 16;
      y = drawHdr(e.tmdb_type === 'tv' ? 'Created By' : 'Directed By', y);
      ctx.save();
      ctx.font = '400 20px "Inter", Arial, sans-serif';
      ctx.fillStyle = P.TEXT;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (draw) ctx.fillText(data.director, PAD, y);
      ctx.restore();
      y += 28;
    }

    if (data?.cast?.length) {
      drawDiv(y); y += 16;
      y = drawHdr('Starring', y);
      y += pillRow(data.cast, PAD, y, W - PAD * 2, P.TEXT, P.PILL_BG) + 8;
    }

    if (data?.production?.length) {
      drawDiv(y); y += 16;
      y = drawHdr('Production', y);
      y += pillRow(data.production, PAD, y, W - PAD * 2, P.TEXT2, P.PILL_BG) + 8;
    }

    if (!data) {
      drawDiv(y); y += 20;
      ctx.save();
      ctx.font = '400 15px "Inter", Arial, sans-serif';
      ctx.fillStyle = P.TEXT2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      if (draw) ctx.fillText("This title isn't linked to TMDB — showing available details only.", W / 2, y);
      ctx.restore();
      y += 24;
    }

    return y;
  }

  let workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = POSTER_H + 800;
  const measureCtx = workCanvas.getContext('2d');
  const contentBottom = layout(measureCtx, false);
  const totalH = Math.round(contentBottom + FOOTER_H);

  if (myToken !== _cardRenderToken || _cardPage !== 3 || _cardEntry !== e) return;

  workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = totalH;
  const ctx = workCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  layout(ctx, true);

  ctx.fillStyle = P.BG_DARK;
  ctx.fillRect(-1, totalH - FOOTER_H, W + 2, FOOTER_H);
  const username = _cardUsername();
  const footerMidY = totalH - FOOTER_H / 2;
  if (username) {
    ctx.save();
    ctx.font = '600 18px "Inter", Arial, sans-serif';
    ctx.fillStyle = P.TEXT_ON_DARK;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(username, PAD, footerMidY);
    ctx.restore();
  }
  ctx.save();
  ctx.font = '700 18px "Inter", Arial, sans-serif';
  ctx.fillStyle = P.TEXT2_ON_DARK;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const msLabel = 'MyScreenScore';
  const msW = ctx.measureText(msLabel).width;
  ctx.fillText(msLabel, W - PAD, footerMidY);
  if (logoImg) {
    const logoH = 22, logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, W - PAD - msW - 9 - logoW, footerMidY - logoH / 2, logoW, logoH);
  }
  ctx.restore();

  // Copy the naturally-rendered content straight across at its own
  // height — no forced paper-size padding or scaling.
  canvas.width = W;
  canvas.height = totalH;
  const maxW = Math.min(340, window.innerWidth - 64);
  canvas.style.width = maxW + 'px';
  canvas.style.height = (maxW * totalH / W) + 'px';
  const finalCtx = canvas.getContext('2d');
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(workCanvas, 0, 0);
}

async function downloadCard() {
  const canvas = document.getElementById('createCardCanvas');
  if (!canvas) return;
  const title = (_cardEntry?.title || 'card').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = _cardPage === 3 ? `mss_${title}_discover.png` : `mss_${title}.png`;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const attemptSave = async () => {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob returned null (likely a tainted canvas)');

    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'MyScreenScore' });
        return;
      } catch(shareErr) {
        if (shareErr && shareErr.name === 'AbortError') return;
      }
    }

    if (isMobile) {
      const url = URL.createObjectURL(blob);
      const wrap = document.getElementById('createCardPreviewWrap');
      if (wrap) {
        wrap.innerHTML = `
          <img src="${url}" alt="${filename}" style="width:100%;height:auto;border-radius:8px;display:block;">
          <a href="${url}" download="${filename}" target="_blank" rel="noopener"
             style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--olive-light);">
            Tap here to open the full image →
          </a>`;
      }
      showToast('Long-press the image above to save it.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 200);
  };

  try {
    await attemptSave();
  } catch(e) {
    const _saved = _cardEntry;
    const _savedUrl = _saved.poster_url;
    _saved.poster_url = null;
    await _drawCard();
    try {
      await attemptSave();
    } catch(e2) {
      showToast('Save blocked by browser. Try a different browser.', 'err');
      console.error(e2);
    } finally {
      _saved.poster_url = _savedUrl;
      await _drawCard();
    }
  }
}

function _resolveEntryForCard(id) {
  if (typeof _catAll       !== 'undefined') { const e = _catAll.find(x => x.id === id);       if (e) return e; }
  if (typeof _allCompleted !== 'undefined') { const e = _allCompleted.find(x => x.id === id); if (e) return e; }
  if (typeof _pEntries     !== 'undefined') { const e = _pEntries.find(x => x.id === id);     if (e) return e; }
  return null;
}