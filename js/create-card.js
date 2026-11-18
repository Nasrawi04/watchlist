/* ══════════════════════════════════════════════════════════════
   CREATE CARD — redesigned Nov 2026 (MSF-create-card-redesign.pdf, in git history, + the owner's written feedback,
   which wins wherever the two differ).

   Three cards, each a phone Wallpaper (1080 × 1920) or an A4 page (2480 × 3508), in Dark,
   Light or Backdrop:
     · Ratings  — every rating you gave, grouped and ordered like the Rate panel, with each group's average
                  (empty groups left out; Overall Enjoyment on its own line, only when rated), then your
                  favourites / least favourites.
     · Notes    — your note exactly as the site shows it (MSSRich + .tv-article: Manrope 500, line-height 1.8,
                  only what you styled is styled). Always one card: sized to fit, and shortened at a sentence only when even
                  the smallest size won't fit. Spoiler cover; Friends-only / Private notes off unless turned on.
     · Discover — the title from TMDB: synopsis, director / creator and cast with their photos, credits.
   Shared rules:
     · Colours — the site's tokens (css/theme.css); CC_STYLES mirrors them, keep the two in step.
     · Score  — the Edit page's ring (title-view.js ringOf / MSSViews.ring), on the right; the watch
                details (watched on, rewatched, episodes) on the left. Scores in their tier's colour (mssScoreTier) —
                Masterpiece gold from 9.90, never for a dropped title.
     · Backdrop — always the one picked on the title's Edit page, framed the way it was framed there
                (MSSBackdrop.url; framed with MSSBackdrop.pos ccwall / cca4 — Adjust framing has a place for each size) — never another image. The top picture and the Backdrop
                style's blurred background use that same picture.
   Panel: MSSPanel L (a full page with a bottom bar on phones) — preview, then
   Card · Size · Style, then the card's own switches; only Copy image · Save image (every size).
   Opened from My Entry (title-view.js → Create card / Discover card) and the Export Studio:
     createShareCard(id | entry, page, onlyThatPage)   page: 1 Ratings · 2 Notes · 3 Discover
══════════════════════════════════════════════════════════════ */

const CC_SIZES = {
  wall: { key: 'wall', label: 'Portrait · 9:16', W: 1080, H: 1920, px: 1, T: 1,    M: 72, top: 116, bottom: 64, file: 'wallpaper' },
  a4:   { key: 'a4',   label: 'Print · A4', W: 1240, H: 1754, px: 2, T: 1.08, M: 96, top: 96,  bottom: 72, file: 'a4' },
};
// css/theme.css values (dark = :root, light = [data-theme="light"]); Backdrop = the dark set on the photo
const _CC_DARK = {
  key: 'dark', name: 'Dark', bg: '#04130A', bg2: '#06190D', card: '#1A2E20',
  line: '#364738', head: '#F3EEDC', text: '#E9E4D2', text2: '#C7C4B7', muted: '#AEAB9F',
  link: '#A6CCB1', green: '#A6CCB1', gold: '#D8B872', track: '#26362B', ring: 'rgba(243,238,220,.16)',
  brand: '#1F4D33', onBrand: '#F3EEDC', warn: '#F2A359', warnBg: '#323B26', warnLine: '#7B633A', low: '#778171',
  shadow: 'rgba(0,0,0,.5)', alert: '#B5463A',
};
const CC_STYLES = {
  dark: _CC_DARK,
  light: {
    key: 'light', name: 'Light', bg: '#F3EEDC', bg2: '#F6F1E1', card: '#FEFCF3',
    line: '#C7C8BD', head: '#1F4D33', text: '#1E2A22', text2: '#3A453E', muted: '#525E56',
    link: '#24583A', green: '#1F4D33', gold: '#6E5020', track: '#E6E0CA', ring: 'rgba(30,42,34,.12)',
    brand: '#1F4D33', onBrand: '#F3EEDC', warn: '#824103', warnBg: '#F1E8D7', warnLine: '#CCB090', low: '#7C827A',
    shadow: 'rgba(30,42,34,.28)', alert: '#A2342A',
  },
  backdrop: { ..._CC_DARK, key: 'backdrop', name: 'Cinematic', card: 'rgba(10,30,18,.72)', line: 'rgba(243,238,220,.16)', track: 'rgba(243,238,220,.16)', ring: 'rgba(243,238,220,.2)' },
};
const CC_MAN = '"Manrope", Arial, sans-serif', CC_OSW = '"Oswald", Georgia, serif', CC_BEB = '"Bebas Neue", Arial, sans-serif';

/* ── state ── */
let _cardPanel = null;
let _cardEntry = null;
let _cardRenderToken = 0;
// Remembered on this device: the spoiler cover (kept from before — mss_card_priv) and the panel's choices
let _cardPriv = (() => { try { return { hideSpoiler: true, ...JSON.parse(localStorage.getItem('mss_card_priv') || '{}') }; } catch { return { hideSpoiler: true }; } })();
let _ccPrefs = (() => {
  const d = { size: 'wall', style: 'backdrop', fav: true, low: true, name: true };
  try { const p = { ...d, ...JSON.parse(localStorage.getItem('mss_card_prefs') || '{}') }; if (!CC_SIZES[p.size]) p.size = 'wall'; if (!CC_STYLES[p.style]) p.style = 'backdrop'; return p; } catch { return d; }
})();
const _ccSavePrefs = () => { try { localStorage.setItem('mss_card_prefs', JSON.stringify(_ccPrefs)); localStorage.setItem('mss_card_priv', JSON.stringify(_cardPriv)); } catch {} };
let _cc = { card: 'ratings', only: false, showPrivate: false, cards: [], idx: 0, assets: null };

let _cardDiscoverData = null;
let _cardDiscoverEntryKey = null;
let _cardDiscoverFailed = false;   // linked to TMDB, but it didn't answer → "Try TMDB again"
let _cardTmdbReload = false;
// Never wait forever on the network: a slow TMDB / poster / cast lookup gives up after a while
// and the card is drawn with what's there (and offers to try again)
const _cardTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Timed out')), ms))]);

const _ccHasNote = e => !!(e?.notes && String(e.notes).trim());
const _ccRated = e => typeof liveScore === 'function' && liveScore(e) != null;
const _ccPrivate = e => !!e?.note_visibility && e.note_visibility !== 'anyone';
const _ccIsMovie = e => e?.cat === 'movies' || e?.ratings?._media_type === 'movie' || e?.tmdb_type === 'movie';
const _ccPage = () => ({ ratings: 1, notes: 2, discover: 3 }[_cc.card]);
// the open Create card panel's own elements (a panel kept underneath for Back has the same ids)
const _ccEl = id => _cardPanel?.body?.querySelector('#' + id) || null;

/* ══════════════════════════════════════════════════════════════
   PANEL
══════════════════════════════════════════════════════════════ */
// id: an entry's id on this page — or the entry itself (export.html picks from your whole library)
async function createShareCard(id, startPage, restrictToStartPage) {
  const e = typeof id === 'object' ? id : _resolveEntryForCard(id);
  if (!e) { showToast('Entry not found.', 'err'); return; }
  await mssLoadScript('js/panel.js');
  _cardEntry = e;
  const want = startPage === 3 ? 'discover' : startPage === 2 ? 'notes' : startPage === 1 ? 'ratings' : null;
  const first = _ccRated(e) ? 'ratings' : _ccHasNote(e) ? 'notes' : 'discover';
  _cc = { card: want === 'ratings' && !_ccRated(e) ? first : want === 'notes' && !_ccHasNote(e) ? first : want || first,
    only: !!restrictToStartPage, showPrivate: false, cards: [], idx: 0, assets: null };
  const h = MSSPanel.open({ size: 'L', kind: 'title', title: 'Create card', subtitle: e.title, label: `Create card, ${e.title}`,
    backdrop: e.tmdb_id || MSSBackdrop.chosen(e) ? e : null,
    body: _ccBodyHTML(),
    footer: _ccFooter(),
    onClose: () => { if (_cardPanel === h) { _cardPanel = null; _cardEntry = null; _cardRenderToken++; } } });
  _cardPanel = h;
  h.body.addEventListener('click', _ccClick);
  _ccOptsHTML();
  await _drawCard();
}

function _ccBodyHTML() {
  const e = _cardEntry, seg = (id, label, options, value, key) =>
    `<div class="lyr-sec cc-sec"><h3 class="lyr-sec-h" id="${id}">${label}</h3>${mssSegHTML({ labelledby: id, options, value, data: { cc: key } })}</div>`;
  return `<div class="cc-stage">
      <div class="cc-pv" id="createCardPreviewWrap" aria-live="polite"><div class="cc-pv-load">Making your card…</div></div>
      <div class="cc-thumbs" id="ccThumbs" hidden></div>
    </div>
    <p class="cc-size" id="ccSize"></p>
    <div id="discoverLinkPrompt" class="cc-prompt" style="display:none">
      <button id="discoverLinkBtn" type="button" onclick="_linkCardEntryToTMDB()" class="popup-action-btn" style="display:inline-flex;">${icon('search', 13)} Search &amp; Link to TMDB</button>
      <div id="discoverRetry" class="cc-retry" hidden>
        <span>Couldn’t get this title’s details from TMDB just now — the card is missing its cast, credits and synopsis.</span>
        <button type="button" onclick="_cardRetryTmdb()" class="popup-action-btn" style="display:inline-flex;">${icon('refresh', 13)} Try TMDB again</button>
      </div>
    </div>
    <div class="cc-opts">
      ${_cc.only ? '' : seg('ccCardH', 'Layout', [['ratings', 'Rating Breakdown', !_ccRated(e)], ['notes', 'Review', !_ccHasNote(e)], ['discover', 'Title Overview']], _cc.card, 'card')}
      ${seg('ccSizeH', 'Format', [['wall', 'Portrait · 9:16'], ['a4', 'Print · A4']], _ccPrefs.size, 'size')}
      ${seg('ccStyleH', 'Theme', [['dark', 'Dark'], ['light', 'Light'], ['backdrop', 'Cinematic']], _ccPrefs.style, 'style')}
      <div id="ccMore"></div>
    </div>`;
}

// The card's own options: what to show, and the note's (privacy, spoiler cover, long notes)
function _ccOptsHTML() {
  const el = _ccEl('ccMore'), e = _cardEntry;
  if (!el || !e) return;
  const sw = (on, key, label, sub) => `<button type="button" class="xs-switch" role="switch" aria-checked="${!!on}" data-ccsw="${key}"><span class="xs-switch-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
  const r = e.ratings || {}, f = r._favorites || {}, lo = r._lowlights || f._lowlights || {};
  const has = o => ['character', 'episode', 'season'].some(k => String(o?.[k] || '').trim());
  let html = '';
  if (_cc.card === 'notes') {
    const priv = _ccPrivate(e), shown = !priv || _cc.showPrivate, spoil = mssIsSpoiler(e);
    const rows = [];
    if (priv) rows.push(sw(_cc.showPrivate, 'showPrivate', 'Show my note', `Your note is ${e.note_visibility === 'friends' ? 'Friends-only' : 'Private'} — it stays off the card unless you turn this on`));
    if (shown && spoil) rows.push(sw(_cardPriv.hideSpoiler, 'hideSpoiler', 'Cover spoilers', `Your note is marked as a spoiler — ${typeof MSSEgg !== 'undefined' && MSSEgg.spoiler(e) ? 'covered by the first rule' : 'blurred on the card'}`));
    if (rows.length) html += `<div class="lyr-sec cc-sec"><h3 class="lyr-sec-h">Your note</h3><div class="xs-switches">${rows.join('')}</div></div>`;
  }
  const show = [];
  if (_cc.card === 'ratings' && has(f)) show.push(sw(_ccPrefs.fav, 'fav', 'Favourites', 'Your favourite character, episode and season'));
  if (_cc.card === 'ratings' && has(lo)) show.push(sw(_ccPrefs.low, 'low', 'Least favourites', ''));
  show.push(sw(_ccPrefs.name, 'name', 'Profile credit', 'Your photo and @username in the footer'));
  html += `<div class="lyr-sec cc-sec"><h3 class="lyr-sec-h">Details</h3><div class="xs-switches">${show.join('')}</div></div>`;
  el.innerHTML = html;
}

function _ccClick(ev) {
  const t = ev.target.closest('.lyr-seg-opt[data-cc], [data-ccsw], [data-ccpick], [data-ccstep]');
  if (!t) return;
  if (t.dataset.ccpick != null) { _cc.idx = Number(t.dataset.ccpick); _ccShow(); return; }
  if (t.dataset.ccstep) { const n = _cc.cards.length; _cc.idx = (_cc.idx + Number(t.dataset.ccstep) + n) % n; _ccShow(); return; }
  if (t.dataset.ccsw) {
    const k = t.dataset.ccsw;
    if (k === 'showPrivate') _cc.showPrivate = !_cc.showPrivate;
    else if (k === 'hideSpoiler') _cardPriv.hideSpoiler = !_cardPriv.hideSpoiler;
    else _ccPrefs[k] = !_ccPrefs[k];
    t.setAttribute('aria-checked', t.getAttribute('aria-checked') !== 'true');
  } else {
    const v = mssSegPick(t), k = t.dataset.cc;
    if (k === 'card') { _cc.card = v; _cc.idx = 0; _ccOptsHTML(); }
    else _ccPrefs[k] = v;
  }
  _ccSavePrefs();
  _drawCard();
}

// (not offered any more — the footer is Copy image · Save image only; kept for the Export Studio / older callers)
const _ccCanCopy = () => !!(navigator.clipboard?.write && typeof ClipboardItem !== 'undefined');
const _ccCanShare = () => { try { return !!navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] }); } catch { return false; } };
function _ccFooter() {
  // Only two buttons, every size (owner, 17 Nov 2026): Copy image · Save image — no Share, no PDF, no Cancel (the panel's ✕ closes it)
  const n = _cc.cards.length || 1, off = _ccBlocked();
  const saveLabel = n > 1 ? `Save ${n} images` : 'Save image';
  return { secondary: [{ label: n > 1 ? 'Copy this card' : 'Copy image', lead: icon('copy', 15), disabled: off, onClick: () => _ccCopy() }],
    primary: { label: saveLabel, lead: icon('download', 15), disabled: off, onClick: () => downloadCard() } };
}
// a Friends-only / Private note that hasn't been turned on: nothing to save yet
const _ccBlocked = () => _cc.card === 'notes' && _ccPrivate(_cardEntry) && !_cc.showPrivate;

/* ── drawing, then the preview ── */
async function _drawCard() {
  const my = ++_cardRenderToken, e = _cardEntry;
  if (!e || !_cardPanel) return;
  try {
    await _ccFontsReady();
    const A = await _ccAssets(e);
    if (_cc.card === 'discover') await _ccFaces(A);
    if (my !== _cardRenderToken || _cardEntry !== e) return;
    _cardPrompt(A.data);
    _cc.cards = _ccBuild(e, A);
    if (_cc.idx >= _cc.cards.length) _cc.idx = 0;
    _ccShow();
    _cardPanel?.setFooter(_ccFooter());
  } catch (err) {
    console.error('Card render error:', err);
    const wrap = _ccEl('createCardPreviewWrap');
    if (wrap && my === _cardRenderToken) wrap.innerHTML = '<div class="cc-pv-load">Couldn’t draw the card — try again.</div>';
  }
}

function _ccShow() {
  const wrap = _ccEl('createCardPreviewWrap'), th = _ccEl('ccThumbs'), sz = _ccEl('ccSize');
  const c = _cc.cards[_cc.idx];
  if (!wrap || !c) return;
  const n = _cc.cards.length, Z = CC_SIZES[_ccPrefs.size], S = CC_STYLES[_ccPrefs.style];
  c.canvas.className = 'cc-canvas' + (Z.key === 'a4' ? ' is-a4' : '');
  c.canvas.setAttribute('role', 'img');
  c.canvas.setAttribute('aria-label', `${{ ratings: 'Rating Breakdown', notes: 'Review', discover: 'Title Overview' }[_cc.card]} card for ${_cardEntry.title}${n > 1 ? `, card ${_cc.idx + 1} of ${n}` : ''}`);
  wrap.replaceChildren(c.canvas);
  if (n > 1) wrap.insertAdjacentHTML('beforeend', `<button type="button" class="cc-step is-prev" data-ccstep="-1" aria-label="Previous card">${icon('chevleft', 18)}</button><button type="button" class="cc-step is-next" data-ccstep="1" aria-label="Next card">${icon('chevright', 18)}</button>`);
  th.hidden = n < 2;
  if (n > 1) {
    th.innerHTML = _cc.cards.map((x, i) => `<button type="button" class="cc-thumb${i === _cc.idx ? ' is-on' : ''}" data-ccpick="${i}" aria-label="Card ${i + 1} of ${n}"${i === _cc.idx ? ' aria-current="true"' : ''}><span>${i + 1}</span></button>`).join('');
    th.querySelectorAll('.cc-thumb').forEach((b, i) => {
      const src = _cc.cards[i].canvas, t = document.createElement('canvas'), w = 120;
      t.width = w; t.height = Math.round(w * src.height / src.width);
      const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, t.width, t.height);
      b.prepend(t);
    });
  }
  sz.textContent = `${Z.label} · ${Z.W * Z.px} × ${Z.H * Z.px} px · ${S.name}${n > 1 ? ` · Card ${_cc.idx + 1} of ${n}` : ''}`;
}

/* ══════════════════════════════════════════════════════════════
   ASSETS — fonts, poster, the chosen backdrop, your photo, TMDB details (kept while the panel is open)
══════════════════════════════════════════════════════════════ */
function _ccFontsReady() {
  const base = typeof mssFontsReady === 'function' ? mssFontsReady() : Promise.resolve();
  if (!document.fonts?.load) return base;
  return Promise.all([base, ...['700 20px Manrope', 'italic 500 20px Manrope', 'italic 700 20px Manrope'].map(f => document.fonts.load(f))]).catch(() => {});
}

async function _ccAssets(e) {
  const key = [e.id, e.tmdb_type, e.tmdb_id, e.poster_url, e.ratings?._backdrop, JSON.stringify(e.ratings?._backdrop_pos || null)].join('|');
  if (_cc.assets?.key === key) return _cc.assets;
  const wrap = _ccEl('createCardPreviewWrap');
  if (wrap && !wrap.querySelector('canvas')) wrap.innerHTML = '<div class="cc-pv-load">Getting the poster and backdrop…</div>';
  const img = u => u ? _loadImage(u).catch(() => null) : Promise.resolve(null);
  // the backdrop picked on the Edit page — or TMDB's own when none was picked (MSSBackdrop, the same everywhere)
  const bdUrl = (typeof MSSBackdrop !== 'undefined' && (e.tmdb_id || MSSBackdrop.chosen(e))) ? MSSBackdrop.url(e, 'w1280').catch(() => null) : Promise.resolve(null);
  const dataP = _fetchDiscoverData(e);
  const [data, poster, avatar, logo, bd, tlogo] = await Promise.all([dataP, img(e.poster_url), img(_cardAvatarUrl()), img('icons/logo-nav.png'), bdUrl.then(img),
    dataP.then(d => img(d?.titleLogo?.src))]);   // the title's own name artwork (TMDB logo); none → the written title
  // its own framing per size (Edit page → Adjust framing → Create Card: Wallpaper / A4); unframed → the title page header's
  const pos = typeof MSSBackdrop !== 'undefined' ? { wall: MSSBackdrop.pos(e, 'ccwall'), a4: MSSBackdrop.pos(e, 'cca4') } : {};
  return (_cc.assets = { key, data, poster, avatar, logo, bd, pos, tlogo });
}
// the Discover card's photos (directors / creators, then the cast) — loaded the first time that card is drawn
function _ccFaces(A) {
  if (A.faces) return A.faces;
  const d = A.data, urls = [...(d?.people || []), ...(d?.castRaw || []).slice(0, 8)].map(p => p.photo).filter(Boolean);
  return (A.faces = Promise.all(urls.map(u => _loadImage(u).then(im => [u, im]).catch(() => [u, null]))).then(l => (A.faceImg = Object.fromEntries(l))));
}

function _loadImage(src) {
  return _cardTimeout(new Promise((res, rej) => {
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
  }), 12000);
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

function _cardAvatarUrl() {
  return (typeof _pProfile   !== 'undefined' && _pProfile?.avatar_url)   ? _pProfile.avatar_url   :
    (typeof _sProfile   !== 'undefined' && _sProfile?.avatar_url)   ? _sProfile.avatar_url   :
    (typeof _favProfile !== 'undefined' && _favProfile?.avatar_url) ? _favProfile.avatar_url :
    (window._navUserProfile?.avatar_url)                            ? window._navUserProfile.avatar_url :
    null;
}

/* ══════════════════════════════════════════════════════════════
   DRAWING HELPERS
══════════════════════════════════════════════════════════════ */
function _rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function _ccLs(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = (px || 0) + 'px'; }
function _ccW(ctx, t, font, ls) { ctx.save(); ctx.font = font; _ccLs(ctx, ls); const w = ctx.measureText(t).width; ctx.restore(); return w; }
function _ccTxt(ctx, t, x, y, font, color, align = 'left', ls = 0, base = 'alphabetic') {
  ctx.save(); ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; _ccLs(ctx, ls); ctx.fillText(t, x, y); ctx.restore();
}
function _ccFitText(ctx, t, font, maxW, ls) {
  let s = String(t);
  if (_ccW(ctx, s, font, ls) <= maxW) return s;
  while (s.length > 1 && _ccW(ctx, s + '…', font, ls) > maxW) s = s.slice(0, -1);
  return s.replace(/\s+$/, '') + '…';
}
function _ccWrapWords(ctx, text, font, maxW, ls) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (line && _ccW(ctx, t, font, ls) > maxW) { lines.push(line); line = w; } else line = t; });
  if (line) lines.push(line);
  return lines;
}
// an image filling a box, cropped like the site does: focal point x% y% (MSSBackdrop.pos; default centred, 25% down) and zoom
function _ccCover(ctx, img, x, y, w, h, pos) {
  const p = pos || { x: 50, y: 25, z: 1 };
  const s = Math.max(w / img.width, h / img.height) * (p.z || 1), dw = img.width * s, dh = img.height * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) * (p.x / 100), y + (h - dh) * (p.y / 100), dw, dh);
  ctx.restore();
}
const _ccRGBA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const _ccMix = (a, b, t) => { const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16), c = s => Math.round(((p >> s) & 255) * t + ((q >> s) & 255) * (1 - t));
  return `rgb(${c(16)},${c(8)},${c(0)})`; };
const _ccTwo = v => Number(v).toFixed(2);
function _ccDate(d) {
  try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(typeof MSSI18n !== 'undefined' ? MSSI18n.locale : undefined, { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return String(d); }
}

// The Edit page's score ring (title-view.js ringOf): a track, the fill to score / 10 from the top with round ends,
// a score's colour on this card: its tier (the rating scale), the light or dark values to match the card style
function _ccTier(v, S, dropped) { return mssScoreTier(v, { dark: S.key !== 'light', dropped }); }
// the score in Bebas Neue in the middle — in its tier's colour; Masterpiece's ring is the gold gradient (never for a dropped title)
function _ccRing(ctx, cx, cy, d, v, S, dropped) {
  const t = _ccTier(v, S, dropped), r = d * 0.44, f = Math.max(0, Math.min(1, v / 10)), col = t.ink;
  let stroke = col;
  if (t.gold) { stroke = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); MSS_GOLD_STOPS.forEach(([p, c]) => stroke.addColorStop(p, c)); }
  ctx.save();
  ctx.lineWidth = d * 0.07; ctx.strokeStyle = S.ring;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (f > 0) { ctx.strokeStyle = stroke; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke(); }
  const fs = d * 40 / 116;
  ctx.font = `400 ${fs}px ${CC_BEB}`; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(_ccTwo(v), cx, cy + fs * 0.36);
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════
   BUILD — the card(s) for the current choices → [{ canvas }]
══════════════════════════════════════════════════════════════ */
function _ccBuild(e, A) {
  const Z = CC_SIZES[_ccPrefs.size], S = CC_STYLES[_ccPrefs.style];
  if (_cc.card === 'notes') return _ccBuildNotes(e, A, Z, S);
  const { canvas, ctx } = _ccCanvas(Z);
  if (_cc.card === 'discover') _ccDiscover(ctx, e, A, Z, S); else _ccRatings(ctx, e, A, Z, S);
  return [{ canvas }];
}
function _ccCanvas(Z) {
  const canvas = document.createElement('canvas');
  canvas.width = Z.W * Z.px; canvas.height = Z.H * Z.px;
  const ctx = canvas.getContext('2d');
  ctx.scale(Z.px, Z.px); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/* ── the frame every card shares: background, the backdrop, poster + title, then the footer ──
   Every style (like the owner's reference picture): the chosen backdrop across the top, behind the poster, title and score, fading into the card.
   Backdrop style: the same picture, blurred, also fills the whole card under a deep-forest shade. */
// the backdrop (or the poster when there's none) blurred to fill the card — made at a quarter size, kept per size
function _ccBlurred(A, Z) {
  A.blur ||= {};
  if (A.blur[Z.key] !== undefined) return A.blur[Z.key];
  const img = A.bd || A.poster;
  if (!img) return (A.blur[Z.key] = null);
  const w = Math.round(Z.W / 4), h = Math.round(Z.H / 4), c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  if ('filter' in x) { x.filter = 'blur(8px) saturate(1.4)'; _ccCover(x, img, -24, -24, w + 48, h + 48, A.bd ? A.pos[Z.key] : null); }
  else {   // no canvas filters (older Safari): shrink hard, then stretch back — the same soft blur
    const s = document.createElement('canvas'); s.width = Math.round(w / 10); s.height = Math.round(h / 10);
    _ccCover(s.getContext('2d'), img, 0, 0, s.width, s.height, A.bd ? A.pos[Z.key] : null);
    x.imageSmoothingQuality = 'high'; x.drawImage(s, 0, 0, w, h);
  }
  return (A.blur[Z.key] = c);
}
function _ccBackground(ctx, A, Z, S, bandH) {
  const { W, H } = Z;
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
  if (S.key === 'backdrop') {
    const b = _ccBlurred(A, Z);
    if (b) { ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(b, 0, 0, W, H); ctx.restore(); }
    if (A.bd && bandH) {   // the sharp picture at the top, melting into the blurred one
      const m = document.createElement('canvas'); m.width = W * Z.px; m.height = Math.ceil(bandH * Z.px);
      const mx = m.getContext('2d'); mx.scale(Z.px, Z.px); mx.imageSmoothingQuality = 'high';
      _ccCover(mx, A.bd, 0, 0, W, bandH, A.pos[Z.key]);
      const f = mx.createLinearGradient(0, 0, 0, bandH); f.addColorStop(0, '#000'); f.addColorStop(0.55, '#000'); f.addColorStop(1, 'rgba(0,0,0,0)');
      mx.globalCompositeOperation = 'destination-in'; mx.fillStyle = f; mx.fillRect(0, 0, W, bandH);
      ctx.drawImage(m, 0, 0, W, bandH);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H), top = Math.min(0.9, (bandH || 0) / H);
    g.addColorStop(0, 'rgba(4,14,8,.22)'); g.addColorStop(top * 0.35, 'rgba(4,14,8,.52)'); g.addColorStop(top, 'rgba(4,14,8,.60)'); g.addColorStop(1, 'rgba(4,14,8,.66)');   // darker behind the title so it reads
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return;
  }
  if (!A.bd || !bandH) return;
  // Dark / Light: the backdrop as a band at the top, fading into the card
  _ccCover(ctx, A.bd, 0, 0, W, bandH, A.pos[Z.key]);
  const g = ctx.createLinearGradient(0, 0, 0, bandH), c = S.bg;
  if (S.key === 'light') { g.addColorStop(0, _ccRGBA(c, .10)); g.addColorStop(0.28, _ccRGBA(c, .58)); g.addColorStop(0.6, _ccRGBA(c, .9)); g.addColorStop(1, c); }
  else { g.addColorStop(0, _ccRGBA(c, .15)); g.addColorStop(0.28, _ccRGBA(c, .55)); g.addColorStop(0.62, _ccRGBA(c, .9)); g.addColorStop(1, c); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, bandH + 1);
}

function _ccPoster(ctx, A, e, x, y, w, S, T) {
  const h = w * 1.5, r = 14 * T;
  ctx.save();
  ctx.shadowColor = S.shadow; ctx.shadowBlur = 44 * T; ctx.shadowOffsetY = 16 * T;
  ctx.fillStyle = S.track; _rrect(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.save(); _rrect(ctx, x, y, w, h, r); ctx.clip();
  if (A.poster) _ccCover(ctx, A.poster, x, y, w, h, { x: 50, y: 50, z: 1 });
  else _ccTxt(ctx, (e.title || '?')[0].toUpperCase(), x + w / 2, y + h / 2 + 30 * T, `600 ${90 * T}px ${CC_OSW}`, S.link, 'center');
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(243,238,220,.10)'; ctx.lineWidth = 1.5; _rrect(ctx, x, y, w, h, r); ctx.stroke(); ctx.restore();
  return h;
}

// The title logo to draw for a style. Light: if the logo is mostly light (its visible pixels' average brightness), a copy
// filled with the style's heading colour — kept per style; otherwise (or if the pixels can't be read) the logo itself.
function _ccLogoFor(A, S) {
  const lg = A.tlogo;
  if (S.key !== 'light') return lg;
  A.tlogoTint ||= {};
  if (A.tlogoTint[S.key] !== undefined) return A.tlogoTint[S.key] || lg;
  let out = null;
  try {
    const s = 64, c = document.createElement('canvas'), k = Math.min(1, s / Math.max(lg.naturalWidth, lg.naturalHeight));
    c.width = Math.max(1, Math.round(lg.naturalWidth * k)); c.height = Math.max(1, Math.round(lg.naturalHeight * k));
    const x = c.getContext('2d'); x.drawImage(lg, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
    if (n && sum / n > 0.62) {   // light logo → the heading colour, full size
      const t = document.createElement('canvas'); t.width = lg.naturalWidth; t.height = lg.naturalHeight;
      const tx = t.getContext('2d'); tx.drawImage(lg, 0, 0);
      tx.globalCompositeOperation = 'source-in'; tx.fillStyle = S.head; tx.fillRect(0, 0, t.width, t.height);
      out = t;
    }
  } catch { out = null; }
  A.tlogoTint[S.key] = out;
  return out || lg;
}
// the title block beside the poster: eyebrow, title, meta line, genre tags → its height (measure: draw = false)
function _ccTitleBlock(ctx, e, A, x, y, w, S, T, o, draw) {
  let cy = y;
  const ebF = `700 ${16 * T}px ${CC_MAN}`;
  if (draw) _ccTxt(ctx, o.eyebrow, x, cy + 16 * T, ebF, S.link, 'left', 3.2 * T);
  cy += 16 * T + 20 * T;
  // The title's own name artwork (TMDB's logo, as on its title page — owner, 17 Nov 2026), in every style and card: as wide as
  // the column, at most about two title lines tall. Dark / Backdrop: as it is, with a soft shadow so it reads on any backdrop.
  // Light: a light logo (most are white) is recoloured to the card's heading colour so it doesn't vanish on the cream;
  // a dark or colourful one stays as it is (_ccLogoFor). No logo: the written title.
  const lg = A.tlogo && A.tlogo.naturalWidth ? _ccLogoFor(A, S) : null;
  if (lg) {
    const nw = lg.naturalWidth || lg.width, nh = lg.naturalHeight || lg.height;
    const maxH = o.titleMax * T * 1.9, k = Math.min(w / nw, maxH / nh), lw = nw * k, lh2 = nh * k;
    if (draw) {
      ctx.save();
      if (S.key === 'light') { ctx.shadowColor = 'rgba(255,255,255,.6)'; ctx.shadowBlur = 10 * T; }
      else { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18 * T; ctx.shadowOffsetY = 3 * T; }
      ctx.drawImage(lg, x, cy + 4 * T, lw, lh2); ctx.restore();
    }
    cy += lh2 + 8 * T + 18 * T;
  } else {
    let fs = o.titleMax * T, lines;
    for (;;) {
      lines = _ccWrapWords(ctx, e.title || '', `600 ${fs}px ${CC_OSW}`, w);
      if (lines.length <= 2 || fs <= 50 * T) break;
      fs -= 2;
    }
    if (lines.length > 2) lines = [lines[0], _ccFitText(ctx, lines.slice(1).join(' '), `600 ${fs}px ${CC_OSW}`, w)];
    const lh = fs * 1.08;
    lines.forEach((ln, i) => { if (draw) _ccTxt(ctx, ln, x, cy + lh * i + fs * 0.86, `600 ${fs}px ${CC_OSW}`, S.head); });
    cy += lh * lines.length + 14 * T;
  }
  const meta = _ccMeta(e, A.data);
  if (meta) {
    const mf = `500 ${22 * T}px ${CC_MAN}`;
    if (draw) _ccTxt(ctx, _ccFitText(ctx, meta, mf, w), x, cy + 22 * T, mf, S.text2);
    cy += 22 * T + 18 * T;
  }
  const genres = typeof mssGenreList === 'function' ? mssGenreList(e.genres || []).slice(0, 3) : [];
  if (genres.length) {
    const gf = `700 ${14 * T}px ${CC_MAN}`, ph = 32 * T, px = 12 * T;
    let gx = x;
    genres.forEach(g => {
      const label = g.toUpperCase(), gw = _ccW(ctx, label, gf, 1.4 * T) + px * 2;
      if (gx + gw > x + w) return;
      if (draw) { ctx.fillStyle = S.brand; _rrect(ctx, gx, cy, gw, ph, 6 * T); ctx.fill(); _ccTxt(ctx, label, gx + px, cy + ph / 2 + 1, gf, S.onBrand, 'left', 1.4 * T, 'middle'); }
      gx += gw + 8 * T;
    });
    cy += ph;
  } else cy -= 18 * T;
  return cy - y;
}
// "2008 – 2013 · AMC · 5 seasons · 62 episodes" · "2019 · 2h 3m · R"
function _ccMeta(e, d) {
  const bits = [], y1 = (d?.releaseDate || '').slice(0, 4) || String(e.year || '');
  if (_ccIsMovie(e)) {
    if (y1) bits.push(y1);
    const mins = d?.runtime || (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0);
    if (mins) bits.push(`${Math.floor(mins / 60) ? Math.floor(mins / 60) + 'h ' : ''}${mins % 60 ? mins % 60 + 'm' : ''}`.trim());
    if (d?.certification) bits.push(d.certification);
  } else {
    const y2 = (d?.lastDate || '').slice(0, 4);
    if (y1) bits.push(y2 && y2 !== y1 && /Ended|Canceled/i.test(d?.status || '') ? `${y1} – ${y2}` : y1);
    if (d?.network) bits.push(d.network);
    const seasons = d?.seasons || Number(e.total_seasons) || 0, eps = d?.episodes || Number(e.total_eps) || 0;
    if (seasons) bits.push(`${seasons} ${seasons === 1 ? 'season' : 'seasons'}`);
    if (eps) bits.push(`${eps} ${eps === 1 ? 'episode' : 'episodes'}`);
  }
  return bits.join(' · ');
}

// The header, the same in every style: poster on the left, eyebrow / title / meta / genres beside it, all over the
// backdrop, which runs on behind the score row (o.band: how far below the header it reaches) → the y under the header
// o.ring: your score's ring (its diameter) on the right, level with the title (owner, 17 Nov 2026), "My score" under it
function _ccHeader(ctx, e, A, Z, S, o) {
  const { W, M, T } = Z, pw = o.poster * T, ph = pw * 1.5, gap = 36 * T;
  const v = o.ring && typeof liveScore === 'function' ? liveScore(e) : null, d = v != null ? o.ring * T : 0, ringH = d ? d + 34 * T : 0;
  const tx = M + pw + gap, tw = W - M - tx - (d ? d + 32 * T : 0);
  const th = _ccTitleBlock(ctx, e, A, tx, 0, tw, S, T, o, false), hb = Math.max(ph, th, ringH);
  const top = Z.top + (A.bd ? o.lead * T : 0), bottom = top + hb;
  _ccBackground(ctx, A, Z, S, A.bd ? bottom + o.band * T : 0);
  _ccPoster(ctx, A, e, M, top + hb - ph, pw, S, T);
  _ccTitleBlock(ctx, e, A, tx, top + hb - th, tw, S, T, o, true);
  if (d) {   // centred on the title block (eyebrow to genres), kept inside the header
    const ry = Math.min(Math.max(top + hb - th / 2 - ringH / 2, top), bottom - ringH), cx = W - M - d / 2, cy = ry + d / 2;
    _ccRing(ctx, cx, cy, d, v, S, e.status === 'dropped');
    _ccTxt(ctx, 'My score', cx, cy + d / 2 + 30 * T, `600 ${16 * T}px ${CC_MAN}`, S.muted, 'center');
  }
  return bottom;
}

// The score row: the watch details on the left, the ring on the right (d = 0: the ring is in the header) → its height (0 when there's nothing)
function _ccScoreRow(ctx, e, Z, S, y, d) {
  const { W, M, T } = Z, v = d && typeof liveScore === 'function' ? liveScore(e) : null, info = _ccWatchInfo(e);
  if (v == null && !info.length) return 0;
  const lf = `700 ${14 * T}px ${CC_MAN}`, vf = `600 ${26 * T}px ${CC_MAN}`, itemH = 14 * T + 12 * T + 26 * T, gap = 24 * T;
  const infoH = info.length ? info.length * itemH + (info.length - 1) * gap : 0;
  const ringH = v != null ? d + 34 * T : 0, h = Math.max(infoH, ringH);
  let iy = y + (h - infoH) / 2;
  const iw = W - M * 2 - (v != null ? d + 48 * T : 0);
  info.forEach(([label, value]) => {
    _ccTxt(ctx, label.toUpperCase(), M, iy + 14 * T, lf, S.muted, 'left', 2.4 * T);
    _ccTxt(ctx, _ccFitText(ctx, value, vf, iw), M, iy + 14 * T + 12 * T + 24 * T, vf, S.text);
    iy += itemH + gap;
  });
  if (v != null) {
    const cx = W - M - d / 2, cy = y + (h - ringH) / 2 + d / 2;
    _ccRing(ctx, cx, cy, d, v, S, e.status === 'dropped');
    _ccTxt(ctx, 'My score', cx, cy + d / 2 + 30 * T, `600 ${16 * T}px ${CC_MAN}`, S.muted, 'center');
  }
  return h;
}
// [label, value] — when you watched it, rewatches, episodes (shows) or runtime (movies)
function _ccWatchInfo(e) {
  const out = [], STATUS = { queue: 'On my watchlist', up_next: 'Up next', watching: 'Watching', paused: 'Taking a break', ongoing: 'To be continued', dropped: 'Dropped' };
  if (e.completed_date) out.push(['Watched on', _ccDate(e.completed_date)]);
  else if (STATUS[e.status]) out.push(['Status', STATUS[e.status]]);
  const n = typeof mssRewatchCount === 'function' ? mssRewatchCount(e) : 1;
  if (n > 1) out.push(['Rewatched', n === 2 ? 'Once' : n === 3 ? 'Twice' : `${n - 1} times`]);
  const total = Number(e.total_eps) || 0;
  if (!_ccIsMovie(e) && total) {
    const seen = e.status === 'completed' ? Math.max(Number(e.watched) || 0, total) : Math.min(Number(e.watched) || 0, total);
    out.push(['Episodes watched', `${seen} of ${total}`]);
  }   // a film's runtime: already in the header's details line ("2026 · 1h 36m · R"), not repeated here
  return out.slice(0, 3);
}

// The footer: your photo and @username (My name) on the left, the MSF mark on the right → the y above it
function _ccFooter_draw(ctx, A, Z, S) {
  const { W, H, M, T } = Z, d = 54 * T, cy = H - Z.bottom - d / 2, lineY = cy - d / 2 - 30 * T;
  ctx.save(); ctx.strokeStyle = S.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(M, lineY); ctx.lineTo(W - M, lineY); ctx.stroke(); ctx.restore();
  const user = _cardUsername();
  if (_ccPrefs.name && user) {
    ctx.save(); ctx.beginPath(); ctx.arc(M + d / 2, cy, d / 2, 0, Math.PI * 2); ctx.clip();
    if (A.avatar) _ccCover(ctx, A.avatar, M, cy - d / 2, d, d, { x: 50, y: 50, z: 1 });
    else { ctx.fillStyle = S.brand; ctx.fillRect(M, cy - d / 2, d, d); _ccTxt(ctx, (user.replace('@', '')[0] || '?').toUpperCase(), M + d / 2, cy + 1, `700 ${22 * T}px ${CC_MAN}`, S.onBrand, 'center', 0, 'middle'); }
    ctx.restore();
    _ccTxt(ctx, user, M + d + 18 * T, cy + 1, `700 ${22 * T}px ${CC_MAN}`, S.text, 'left', 0, 'middle');
  }
  const bf = `600 ${26 * T}px ${CC_OSW}`, bw = _ccW(ctx, 'MyScreenFolio', bf);
  _ccTxt(ctx, 'MyScreenFolio', W - M, cy + 1, bf, S.head, 'right', 0, 'middle');
  if (A.logo) { const lh = 40 * T, lw = A.logo.width * lh / A.logo.height; ctx.drawImage(A.logo, W - M - bw - 12 * T - lw, cy - lh / 2, lw, lh); }   // the logo in its own colours, as in the nav
  return lineY;
}

const _ccTypeLabel = e => (typeof mssTypeOf === 'function' ? mssTypeOf(e.cat, _ccIsMovie(e)).label : _ccIsMovie(e) ? 'Movie' : 'TV Show').toUpperCase();

/* ══════════════════════════════════════════════════════════════
   RATINGS CARD
══════════════════════════════════════════════════════════════ */
function _ccRatings(ctx, e, A, Z, S) {
  const { W, M, T } = Z;
  const groups = mssRatedGroups(e.ratings, e.cat, e.cat === 'movies' || e.ratings?._media_type === 'movie');
  // A4 is a shorter page for its width than a wallpaper: a smaller header and ring leave the ratings their room
  const count = groups.reduce((n, g) => n + g.items.length, 0), dense = count > 16, a4 = Z.key === 'a4';
  const ring = a4 ? (dense ? 130 : 150) : dense ? 170 : 200;
  const hb = _ccHeader(ctx, e, A, Z, S, { poster: dense || a4 ? 180 : 220, eyebrow: `MY RATINGS · ${_ccTypeLabel(e)}`, titleMax: dense || a4 ? 70 : 80,
    lead: a4 ? 10 : dense ? 30 : 60, band: 200, ring: ring * 0.85 });
  let y = hb + (a4 ? 34 : 44) * T;
  const rowH = _ccScoreRow(ctx, e, Z, S, y, 0);
  y += rowH + (rowH ? (a4 ? 36 : 48) * T : 0);
  const footY = _ccFooter_draw(ctx, A, Z, S);
  // favourites, anchored above the footer
  const favH = _ccFavs(ctx, e, Z, S, 0, false);
  const favTop = footY - 40 * T - favH;
  if (favH) _ccFavs(ctx, e, Z, S, favTop, true);
  const room = (favH ? favTop - 40 * T : footY - 40 * T) - y;
  // the biggest type that fits (×1.18 down to ×0.56 — every field filled on A4), then any spare room spread between the sections
  let s = 1.18, lay;
  for (; s >= 0.56; s -= 0.02) { lay = _ccRatingsLayout(ctx, groups, Z, S, s, W - M * 2, 0); if (lay.h <= room) break; }
  s = Math.max(s, 0.56);
  const spare = Math.max(0, room - lay.h);
  lay = _ccRatingsLayout(ctx, groups, Z, S, s, W - M * 2, Math.min(spare / Math.max(1, lay.sections + 1), 70 * T));
  const top = y + Math.max(0, room - lay.h) * 0.3;
  lay.draw(M, top);
}

// Groups in two balanced columns (a group is never split), Overall Enjoyment on its own line between
// Core and Bonus; one line per rating: name · short bar · score → { h, sections, draw(x, y) }
function _ccRatingsLayout(ctx, groups, Z, S, s, w, extra) {
  const T = Z.T, k = T * s;
  const m = { sec: 15 * k, secAfter: 32 * k, name: 15 * k, avg: 36 * k, row: 19 * k, val: 30 * k, rowH: 42 * k, gGap: 30 * k, secGap: 50 * k + extra, colGap: 56 * T, bar: 6 * k };
  const colW = (w - m.colGap) / 2;
  const nameF = `700 ${m.name}px ${CC_MAN}`, avgF = `400 ${m.avg}px ${CC_BEB}`, rowF = `600 ${m.row}px ${CC_MAN}`, valF = `400 ${m.val}px ${CC_BEB}`;
  const avgW = _ccW(ctx, '10.00', avgF), valW = _ccW(ctx, '10.0', valF);
  // one bar width for every row, so the bars line up: 20% of the column, 17% when a name would otherwise be cut short
  const longest = Math.max(0, ...groups.flatMap(g => g.items.map(it => _ccW(ctx, it.label, rowF))));
  const barW = longest > colW * 0.8 - valW - 34 * k ? colW * 0.17 : colW * 0.2;
  const enjoy = groups.find(g => g.id === 'overall');
  const core = groups.filter(g => g.kind === 'core' && g.id !== 'overall'), bonus = groups.filter(g => g.kind === 'bonus');
  const nameLines = g => _ccWrapWords(ctx, g.name.toUpperCase(), nameF, colW - avgW - 16 * k, 1.5 * k).slice(0, 2);
  const gH = g => (nameLines(g).length > 1 ? m.name * 1.35 : 0) + 40 * k + g.items.length * m.rowH;
  // split the groups in order so both columns end at about the same height
  const split = list => {
    const hs = list.map(gH);
    let best = [list, []], bestH = Infinity;
    for (let i = 1; i <= list.length; i++) {
      const a = hs.slice(0, i).reduce((x, y) => x + y, 0) + (i - 1) * m.gGap, b = hs.slice(i).reduce((x, y) => x + y, 0) + Math.max(0, list.length - i - 1) * m.gGap;
      if (Math.max(a, b) < bestH) { bestH = Math.max(a, b); best = [list.slice(0, i), list.slice(i)]; }
    }
    return { cols: best, h: bestH };
  };
  const secs = [];
  if (core.length) secs.push({ label: 'Core ratings', count: `${core.reduce((n, g) => n + g.items.length, 0)} rated`, ...split(core) });
  if (enjoy) secs.push({ enjoy: enjoy.items[0] });
  if (bonus.length) secs.push({ label: 'Bonus ratings', count: `${bonus.reduce((n, g) => n + g.items.length, 0)} picked`, ...split(bonus) });
  const secH = sc => sc.enjoy ? 46 * k : m.sec + m.secAfter + sc.h;
  const h = secs.reduce((a, sc) => a + secH(sc), 0) + Math.max(0, secs.length - 1) * m.secGap;
  const colour = v => _ccTier(v, S).ink;
  function bar(x, cy, bw, v) {
    ctx.fillStyle = S.track; _rrect(ctx, x, cy - m.bar / 2, bw, m.bar, m.bar / 2); ctx.fill();
    ctx.fillStyle = _ccTier(v, S).ink; _rrect(ctx, x, cy - m.bar / 2, Math.max(m.bar, bw * Math.min(1, v / 10)), m.bar, m.bar / 2); ctx.fill();
  }
  function group(g, x, y) {
    const lines = nameLines(g);
    lines.forEach((ln, i) => _ccTxt(ctx, ln, x, y + m.name + i * m.name * 1.35 + 6 * k, nameF, S.text2, 'left', 1.5 * k));
    _ccTxt(ctx, _ccTwo(g.avg), x + colW, y + m.avg * 0.86, avgF, colour(g.avg), 'right');
    let ry = y + (lines.length > 1 ? m.name * 1.35 : 0) + 40 * k;
    g.items.forEach(it => {
      const bw = barW, lmax = colW - valW - 16 * k - bw - 18 * k, mid = ry + m.rowH / 2;
      _ccTxt(ctx, _ccFitText(ctx, it.label, rowF, lmax), x, mid + m.row * 0.36, rowF, S.text);
      bar(x + colW - valW - 16 * k - bw, mid, bw, it.v);
      _ccTxt(ctx, mssR1(it.v), x + colW, mid + m.val * 0.36, valF, colour(it.v), 'right');
      ry += m.rowH;
    });
    return gH(g);
  }
  function draw(x, y) {
    secs.forEach((sc, i) => {
      if (i) y += m.secGap;
      if (sc.enjoy) {
        const mid = y + 23 * k, label = 'OVERALL ENJOYMENT', lw = _ccW(ctx, label, nameF, 1.5 * k), vw = _ccW(ctx, _ccTwo(sc.enjoy.v), avgF);
        _ccTxt(ctx, label, x, mid + m.name * 0.36, nameF, S.text2, 'left', 1.5 * k);
        bar(x + lw + 26 * k, mid, w - lw - 26 * k - vw - 20 * k, sc.enjoy.v);
        _ccTxt(ctx, _ccTwo(sc.enjoy.v), x + w, mid + m.avg * 0.34, avgF, colour(sc.enjoy.v), 'right');
        y += 46 * k;
        return;
      }
      const lf = `700 ${m.sec}px ${CC_MAN}`, cf = `600 ${m.sec}px ${CC_MAN}`, label = sc.label.toUpperCase();
      const lw = _ccW(ctx, label, lf, 3 * k), cw = _ccW(ctx, sc.count, cf);
      _ccTxt(ctx, label, x, y + m.sec, lf, S.link, 'left', 3 * k);
      _ccTxt(ctx, sc.count, x + w, y + m.sec, cf, S.muted, 'right');
      ctx.save(); ctx.strokeStyle = S.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + lw + 18 * k, y + m.sec * 0.62); ctx.lineTo(x + w - cw - 18 * k, y + m.sec * 0.62); ctx.stroke(); ctx.restore();
      const gy = y + m.sec + m.secAfter;
      sc.cols.forEach((col, ci) => { let cy = gy; col.forEach(g => { cy += group(g, x + ci * (colW + m.colGap), cy) + m.gGap; }); });
      y = gy + sc.h;
    });
  }
  return { h, sections: secs.length, draw };
}

// Favourites (green rule) and least favourites (grey rule) → height
function _ccFavs(ctx, e, Z, S, y, draw) {
  const { W, M, T } = Z, r = e.ratings || {}, f = r._favorites || {}, lo = r._lowlights || f._lowlights || {};
  const pick = (o, pre) => ['character', 'episode', 'season'].filter(k => String(o?.[k] || '').trim()).map(k => [`${pre} ${k}`, String(o[k]).trim()]);
  const rows = [];
  if (_ccPrefs.fav) { const a = pick(f, 'Favourite'); if (a.length) rows.push({ items: a, rule: S.green }); }
  if (_ccPrefs.low) { const a = pick(lo, 'Least favourite'); if (a.length) rows.push({ items: a, rule: S.low }); }
  if (!rows.length) return 0;
  const colW = (W - M * 2 - 28 * T * 2) / 3, lf = `700 ${13 * T}px ${CC_MAN}`, vf = `700 ${22 * T}px ${CC_MAN}`, vlh = 29 * T;
  let h = 0;
  rows.forEach((row, ri) => {
    const vals = row.items.map(([, v]) => { const ls = _ccWrapWords(ctx, v, vf, colW - 20 * T); return ls.length > 2 ? [ls[0], _ccFitText(ctx, ls.slice(1).join(' '), vf, colW - 20 * T)] : ls; });
    const rh = 13 * T + 14 * T + Math.max(...vals.map(v => v.length)) * vlh;
    if (draw) row.items.forEach(([label], i) => {
      const x = M + i * (colW + 28 * T), ry = y + h;
      ctx.fillStyle = row.rule; ctx.fillRect(x, ry, 3 * T, rh);
      _ccTxt(ctx, _ccFitText(ctx, label.toUpperCase(), lf, colW - 20 * T, 1.8 * T), x + 18 * T, ry + 13 * T, lf, S.muted, 'left', 1.8 * T);
      vals[i].forEach((ln, li) => _ccTxt(ctx, ln, x + 18 * T, ry + 13 * T + 14 * T + li * vlh + 21 * T, vf, ri === 0 && row.rule === S.green ? S.text : S.text2));
    });
    h += rh + (ri < rows.length - 1 ? 26 * T : 0);
  });
  return h;
}

/* ══════════════════════════════════════════════════════════════
   NOTES CARD — the note as the site shows it (MSSRich.html + .tv-article)
══════════════════════════════════════════════════════════════ */
// MSSRich's HTML → blocks: { quote, runs: [{ t, b, i, u, s } | { br }] }
function _ccNoteBlocks(text) {
  const box = document.createElement('div');
  box.innerHTML = MSSRich.html(text, { paras: true });
  return [...box.children].map(el => {
    const runs = [];
    const walk = (n, st) => {
      if (n.nodeType === 3) { if (n.nodeValue) runs.push({ t: n.nodeValue, ...st }); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { runs.push({ br: true }); return; }
      const s2 = { ...st }, t = n.tagName;
      if (t === 'STRONG' || t === 'B') s2.b = true;
      if (t === 'EM' || t === 'I') s2.i = true;
      if (t === 'U') s2.u = true;
      if (t === 'S') s2.s = true;
      n.childNodes.forEach(c => walk(c, s2));
    };
    walk(el, {});
    return { quote: el.tagName === 'BLOCKQUOTE', runs };
  }).filter(b => b.runs.some(r => r.br || r.t.trim()));
}
// one block → lines of styled pieces, wrapped at spaces (a word longer than the line breaks anywhere, like overflow-wrap:anywhere)
function _ccWrapBlock(ctx, blk, size, width) {
  // a quote is italic, and italic inside it reads upright (.mss-rq em)
  const fontOf = st => `${(blk.quote ? !st.i : st.i) ? 'italic ' : ''}${st.b ? 700 : 500} ${size}px ${CC_MAN}`;
  const meas = (t, st) => { ctx.font = fontOf(st); return ctx.measureText(t).width; };
  const words = [];
  let cur = null;
  blk.runs.forEach(r => {
    if (r.br) { if (cur) words.push(cur); cur = null; words.push({ br: true }); return; }
    r.t.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) { if (cur) words.push(cur); cur = null; words.push({ space: r }); return; }
      (cur ||= { pieces: [] }).pieces.push({ t: part, st: r });
    });
  });
  if (cur) words.push(cur);
  const lines = [];
  let line = [], lw = 0, sp = null;
  const flush = () => { lines.push({ segs: line, w: lw }); line = []; lw = 0; sp = null; };
  words.forEach(wd => {
    if (wd.br) { flush(); return; }
    if (wd.space) { if (line.length) sp = wd.space; return; }
    const ww = wd.pieces.reduce((a, p) => a + meas(p.t, p.st), 0), sw = sp ? meas(' ', sp) : 0;
    if (line.length && lw + sw + ww > width) flush();
    else if (line.length && sp) { line.push({ t: ' ', st: sp }); lw += sw; }
    sp = null;
    if (ww > width) wd.pieces.forEach(p => { for (const ch of p.t) { const cw = meas(ch, p.st); if (lw + cw > width && line.length) flush(); line.push({ t: ch, st: p.st }); lw += cw; } });
    else { wd.pieces.forEach(p => line.push(p)); lw += ww; }
  });
  if (line.length) flush();
  return lines.map(l => ({ ...l, fontOf }));
}
// blocks → rows (lines and the gaps between paragraphs / around quotes, with collapsing margins like the page)
function _ccNoteRows(ctx, blocks, fs, width) {
  const rows = [];
  let prev = 0;
  blocks.forEach((b, bi) => {
    const size = b.quote ? fs * 17 / 16 : fs, lh = size * 1.8, mt = b.quote ? fs * 22 / 16 : 0, mb = b.quote ? fs * 22 / 16 : fs;
    const pad = b.quote ? fs * 4 / 16 : 0, indent = b.quote ? fs * 21 / 16 : 0;
    if (bi) rows.push({ gap: Math.max(prev, mt) });
    const ls = _ccWrapBlock(ctx, b, size, width - indent);
    ls.forEach((l, li) => rows.push({ line: l, size, lh, indent, padTop: li === 0 ? pad : 0, h: lh + (li === 0 ? pad : 0) + (li === ls.length - 1 ? pad : 0),
      quote: b.quote ? bi + 1 : 0, colour: b.quote || bi === 0 ? 'text' : 'article', end: li === ls.length - 1 }));
    prev = mb;
  });
  return rows;
}
// rows → pages that fit caps[0] (the first card) and caps[1] (each card after)
function _ccPaginate(rows, caps) {
  const pages = [];
  let cur = [], h = 0, gap = 0, cap = caps[0];
  rows.forEach(r => {
    if (r.gap != null) { if (cur.length) gap = r.gap; return; }
    if (cur.length && h + gap + r.h > cap) { pages.push(cur); cur = []; h = 0; gap = 0; cap = caps[1]; }
    if (gap) { cur.push({ gap }); h += gap; gap = 0; }
    cur.push(r); h += r.h;
  });
  if (cur.length) pages.push(cur);
  return pages;
}
const _ccRowsH = rows => rows.reduce((a, r) => a + (r.gap != null ? r.gap : r.h), 0);
// where a note can be cut: after each sentence, and at the end of each paragraph
function _ccCuts(blocks) {
  const cuts = [];
  blocks.forEach((b, bi) => {
    b.runs.forEach((r, ri) => { if (r.br) return; const re = /[.!?…]+["”’)\]]*(?=\s|$)/g; let mt; while ((mt = re.exec(r.t))) cuts.push({ bi, ri, ci: mt.index + mt[0].length }); });
    cuts.push({ bi, ri: b.runs.length, ci: 0 });
  });
  return cuts;
}
function _ccCutBlocks(blocks, c) {
  const out = blocks.slice(0, c.bi), b = blocks[c.bi], runs = b.runs.slice(0, c.ri);
  if (c.ri < b.runs.length && c.ci > 0) runs.push({ ...b.runs[c.ri], t: b.runs[c.ri].t.slice(0, c.ci) });
  if (runs.length) out.push({ ...b, runs });
  return out;
}

function _ccDrawRows(ctx, rows, x, y, S, o = {}) {
  const article = _ccMix(S.text, S.text2, 0.86), quotes = {};
  let cy = y;
  rows.forEach((r, i) => {
    if (r.gap != null) { cy += r.gap; return; }
    const mid = cy + r.padTop + r.lh / 2, col = r.colour === 'text' ? S.text : article;
    if (r.quote) { const q = quotes[r.quote] ||= { top: cy, bottom: 0 }; q.bottom = cy + r.h; }
    let sx = x + r.indent;
    if (i === 0 && o.lead) _ccTxt(ctx, '…', sx - 6, mid, r.line.fontOf({}), col, 'right', 0, 'middle');   // hangs in the margin
    r.line.segs.forEach(seg => {
      ctx.font = r.line.fontOf(seg.st); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; _ccLs(ctx, 0);
      ctx.fillText(seg.t, sx, mid);
      const w = ctx.measureText(seg.t).width, th = Math.max(1, r.size * 0.07);
      if (seg.st.u) ctx.fillRect(sx, mid + r.size * 0.46, w, th);
      if (seg.st.s) ctx.fillRect(sx, mid + r.size * 0.04, w, th);
      sx += w;
    });
    if (i === rows.length - 1 && o.trail) _ccTxt(ctx, '…', sx + 2, mid, r.line.fontOf({}), col, 'left', 0, 'middle');
    cy += r.h;
  });
  // a quote's olive line down its side (.tv-article .mss-rq: 3px)
  Object.values(quotes).forEach(q => { ctx.fillStyle = S.link; ctx.fillRect(x, q.top, Math.max(2, rows.find(r => r.size)?.size * 3 / 17 || 3), q.bottom - q.top); });
  return cy;
}

function _ccBuildNotes(e, A, Z, S) {
  const { W, M, T } = Z, priv = _ccPrivate(e) && !_cc.showPrivate, spoil = mssIsSpoiler(e), covered = !priv && spoil && _cardPriv.hideSpoiler;
  const blocks = _ccNoteBlocks(e.notes || '');
  // one card, always: the note gets smaller (down to min) to fit, and is only shortened when even that isn't enough
  const sizes = Z.key === 'a4' ? { max: 30, min: 16 } : { max: 32, min: 18 };
  const first = _ccCanvas(Z);
  const hb = _ccHeader(first.ctx, e, A, Z, S, { poster: 180, eyebrow: `MY NOTE · ${_ccTypeLabel(e)}`, titleMax: 72, lead: Z.key === 'a4' ? 10 : 40, band: 200, ring: 130 });
  let y = hb + 40 * T;
  const rowH = _ccScoreRow(first.ctx, e, Z, S, y, 0);
  y += rowH + (rowH ? 46 * T : 0);
  const footY = _ccFooter_draw(first.ctx, A, Z, S);
  const headY = y, textTop = y + 15 * T + 34 * T, bottom = footY - 44 * T;
  const textX = M + 30 * T, textW = W - M - textX, capFirst = bottom - textTop;

  const ctx = first.ctx;
  const noteHead = (c, num) => {
    const lf = `700 ${15 * T}px ${CC_MAN}`, lw = _ccW(c, 'MY NOTE', lf, 3 * T);
    _ccTxt(c, 'MY NOTE', M, headY + 15 * T, lf, S.link, 'left', 3 * T);
    if (spoil && !covered && !priv) {   // shown: the SPOILERS tag (warning colours, like the site's spoiler tag)
      const egg = typeof MSSEgg !== 'undefined' ? MSSEgg.spoiler(e) : null, tf = `700 ${12 * T}px ${CC_MAN}`, tag = (egg ? egg.tag : 'Spoilers').toUpperCase();
      const tw = _ccW(c, tag, tf, 1.6 * T) + 20 * T, tx = M + lw + 16 * T, th = 26 * T, ty = headY + 15 * T / 2 - th / 2 + 1;
      c.fillStyle = S.warnBg; _rrect(c, tx, ty, tw, th, 6 * T); c.fill();
      c.strokeStyle = S.warnLine; c.lineWidth = 1; _rrect(c, tx, ty, tw, th, 6 * T); c.stroke();
      _ccTxt(c, tag, tx + 10 * T, ty + th / 2 + 1, tf, S.warn, 'left', 1.6 * T, 'middle');
    }
    if (num) _ccTxt(c, num, W - M, headY + 15 * T, `600 ${15 * T}px ${CC_MAN}`, S.muted, 'right');
  };
  // the note's olive line down its side (.tv-read)
  const sideLine = (c, top, bot) => {
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, S.link); g.addColorStop(1, _ccRGBA(S.link.length === 7 ? S.link : '#A6CCB1', .15));
    c.fillStyle = g; _rrect(c, M, top, 4 * T, Math.max(8, bot - top), 2 * T); c.fill();
  };

  if (priv) {   // Friends-only / Private: off the card until it's turned on
    noteHead(ctx, '');
    const mf = `500 ${24 * T}px ${CC_MAN}`;
    _ccWrapWords(ctx, `Your note is ${e.note_visibility === 'friends' ? 'Friends-only' : 'Private'}. Turn on “Show my note” to put it on this card.`, mf, textW)
      .forEach((ln, i) => _ccTxt(ctx, ln, textX, textTop + 30 * T + i * 40 * T, mf, S.muted));
    return [{ canvas: first.canvas }];
  }
  if (covered) {   // the spoiler cover: the note blurred past reading, with the cover on top — always one card
    noteHead(ctx, '');
    const boxH = Math.min(capFirst, 560 * T), fs = sizes.min + 4, k = 10;
    const small = document.createElement('canvas'); small.width = Math.ceil(textW / k); small.height = Math.ceil(boxH / k);
    const sc = small.getContext('2d'); sc.scale(1 / k, 1 / k);
    let rows = _ccNoteRows(sc, blocks, fs, textW);
    while (_ccRowsH(rows) < boxH && rows.length < 400) rows = rows.concat([{ gap: fs }], _ccNoteRows(sc, blocks, fs, textW));   // a short note still fills the box
    _ccDrawRows(sc, _ccPaginate(rows, [boxH, boxH])[0], 0, 0, S);
    ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(small, textX, textTop, textW, boxH); ctx.restore();
    const egg = typeof MSSEgg !== 'undefined' ? MSSEgg.spoiler(e) : null;
    const t1 = egg ? egg.title : 'Contains spoilers', t2 = egg ? egg.cardSub : 'Read it on MyScreenFolio';
    const f1 = `700 ${26 * T}px ${CC_MAN}`, f2 = `500 ${19 * T}px ${CC_MAN}`, ic = 60 * T;
    const pw = 22 * T + ic + 20 * T + Math.max(_ccW(ctx, t1, f1), _ccW(ctx, t2, f2)) + 34 * T, ph = 96 * T;
    const px = W / 2 - pw / 2, py = textTop + boxH / 2 - ph / 2;
    ctx.save(); ctx.shadowColor = S.shadow; ctx.shadowBlur = 40 * T; ctx.shadowOffsetY = 14 * T;
    ctx.fillStyle = S.key === 'light' ? S.card : '#1D3124'; _rrect(ctx, px, py, pw, ph, ph / 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = S.warnLine; ctx.lineWidth = 1.5; _rrect(ctx, px, py, pw, ph, ph / 2); ctx.stroke();
    const cx = px + 22 * T + ic / 2, cy = py + ph / 2;
    ctx.fillStyle = egg ? S.alert : S.brand; ctx.beginPath(); ctx.arc(cx, cy, ic / 2, 0, Math.PI * 2); ctx.fill();
    if (egg) _ccTxt(ctx, egg.tag.replace(/^Rule /, ''), cx, cy + 11 * T, `400 ${32 * T}px ${CC_BEB}`, '#F3EEDC', 'center');
    else {   // an eye with a slash
      ctx.save(); ctx.strokeStyle = '#F3EEDC'; ctx.lineWidth = 3 * T; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(cx, cy, 15 * T, 10 * T, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 4 * T, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 17 * T, cy - 15 * T); ctx.lineTo(cx + 17 * T, cy + 15 * T); ctx.stroke(); ctx.restore();
    }
    _ccTxt(ctx, t1, cx + ic / 2 + 20 * T, cy - 4 * T, f1, S.head);
    _ccTxt(ctx, t2, cx + ic / 2 + 20 * T, cy + 26 * T, f2, S.muted);
    return [{ canvas: first.canvas }];
  }

  // the biggest size that fits on one card
  let fs = sizes.max, rows;
  for (; fs >= sizes.min; fs--) { rows = _ccNoteRows(ctx, blocks, fs, textW); if (_ccRowsH(rows) <= capFirst) break; }
  if (fs >= sizes.min) {
    noteHead(ctx, '');
    const end = _ccDrawRows(ctx, rows, textX, textTop, S);
    sideLine(ctx, textTop + 4 * T, end - 6 * T);
    return [{ canvas: first.canvas }];
  }
  // Still too long at the smallest size: cut at the end of a sentence, then "Read the full note on MyScreenFolio · @you"
  const user = _cardUsername();
  fs = sizes.min;
  const more = `Read the full note on MyScreenFolio${user ? ' · ' + user : ''}`, mf = `600 ${fs * 0.9}px ${CC_MAN}`, moreH = fs * 0.9 + fs * 1.4;
  const cuts = _ccCuts(blocks);
  let lo = 0, hi = cuts.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (_ccRowsH(_ccNoteRows(ctx, _ccCutBlocks(blocks, cuts[mid]), fs, textW)) + moreH <= capFirst) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  let trail = false;
  if (best >= 0) rows = _ccNoteRows(ctx, _ccCutBlocks(blocks, cuts[best]), fs, textW);
  else { rows = _ccPaginate(_ccNoteRows(ctx, blocks, fs, textW), [capFirst - moreH, capFirst])[0]; trail = true; }   // one very long sentence: cut at a word
  noteHead(ctx);
  const end = _ccDrawRows(ctx, rows, textX, textTop, S, { trail });
  sideLine(ctx, textTop + 4 * T, end - 6 * T);
  _ccTxt(ctx, _ccFitText(ctx, more, mf, textW), textX, end + fs * 0.9 + fs * 0.9, mf, S.link);
  return [{ canvas: first.canvas }];
}

/* ══════════════════════════════════════════════════════════════
   DISCOVER CARD — the title from TMDB
══════════════════════════════════════════════════════════════ */
function _ccDiscover(ctx, e, A, Z, S) {
  const { W, M, T } = Z, d = A.data;
  // about the title, not you: no score ring or watch details on this one (owner, 17 Nov 2026)
  const hb = _ccHeader(ctx, e, A, Z, S, { poster: 220, eyebrow: `DISCOVER · ${_ccTypeLabel(e)}`, titleMax: 80, lead: Z.key === 'a4' ? 30 : 140, band: 120 });
  let y = hb + 60 * T;
  const footY = _ccFooter_draw(ctx, A, Z, S), bottom = footY - 44 * T, w = W - M * 2;
  const label = (t, yy) => _ccTxt(ctx, t.toUpperCase(), M, yy + 15 * T, `700 ${15 * T}px ${CC_MAN}`, S.link, 'left', 3 * T);
  // the director(s) / creator(s) with their photos, the other credits, then the cast as photos — measured first,
  // so the synopsis gets the room that's left
  const movie = _ccIsMovie(e), faces = A.faceImg || {};
  const people = (d?.people || []).length ? d.people : (d?.director ? [{ name: d.director, photo: '' }] : []);
  const credits = [
    ['Written by', d?.writers],
    [movie ? 'Production' : 'Network', movie ? (d?.production || []).slice(0, 2).join(', ') : d?.network || (d?.production || [])[0]],
    [movie ? 'Released' : 'First aired', d?.releaseDate ? _ccDate(d.releaseDate) : ''],
  ].filter(([, v]) => v);
  const cast = (d?.castRaw || []).filter(c => c.actor).slice(0, 8);
  const cf = `700 ${13 * T}px ${CC_MAN}`, vf = `600 ${22 * T}px ${CC_MAN}`, gapX = 28 * T;
  const pd = 96 * T, peopleH = people.length ? 13 * T + 16 * T + pd : 0;
  const credH = credits.length ? 13 * T + 12 * T + 30 * T : 0;
  const per = Math.max(1, Math.min(5, cast.length)), cellW = (w - gapX * (per - 1)) / per, cd = Math.min(cellW * 0.8, 150 * T), castRows = Math.ceil(cast.length / per);
  const cellH = cd + 18 * T + 24 * T + 22 * T, castH = cast.length ? 15 * T + 34 * T + castRows * cellH + (castRows - 1) * 26 * T : 0;
  const tagline = (d?.tagline || '').trim(), synopsis = (d?.overview || e.description || '').trim();
  const tf = `italic 600 ${28 * T}px ${CC_MAN}`, sf = `500 ${24 * T}px ${CC_MAN}`, slh = 24 * T * 1.7;
  let room = bottom - y - peopleH - credH - castH - [peopleH, credH, castH].filter(Boolean).length * 46 * T;
  // a round photo (or the initial on a quiet circle when TMDB has none)
  const face = (cx, cy, dd, url, name) => {
    const im = url ? faces[url] : null;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, dd / 2, 0, Math.PI * 2); ctx.closePath();
    if (im) { ctx.clip(); _ccCover(ctx, im, cx - dd / 2, cy - dd / 2, dd, dd, { x: 50, y: 22, z: 1 }); }
    else { ctx.fillStyle = S.track; ctx.fill(); _ccTxt(ctx, (name || '?').trim()[0].toUpperCase(), cx, cy + dd * 0.13, `600 ${dd * 0.36}px ${CC_OSW}`, S.link, 'center'); }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = S.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, dd / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  if (tagline) { const tl = _ccWrapWords(ctx, `“${tagline}”`, tf, w).slice(0, 2); tl.forEach((ln, i) => _ccTxt(ctx, ln, M, y + 28 * T + i * 40 * T, tf, S.head)); y += tl.length * 40 * T + 26 * T; room -= tl.length * 40 * T + 26 * T; }
  if (synopsis && room > slh) {
    let ls = _ccWrapWords(ctx, synopsis, sf, w);
    const max = Math.max(1, Math.floor(room / slh));
    if (ls.length > max) ls = [...ls.slice(0, max - 1), _ccFitText(ctx, ls.slice(max - 1).join(' '), sf, w)];
    ls.forEach((ln, i) => _ccTxt(ctx, ln, M, y + i * slh + 24 * T, sf, S.text2));
    y += ls.length * slh + 44 * T;
  }
  if (people.length) {   // Directed by / Created by: photo + name, up to two side by side
    _ccTxt(ctx, (movie ? 'Directed by' : 'Created by').toUpperCase(), M, y + 13 * T, cf, S.muted, 'left', 2 * T);
    const py = y + 13 * T + 16 * T, colW = (w - gapX) / 2, nf = `700 ${24 * T}px ${CC_MAN}`;
    people.forEach((p, i) => {
      const x = M + i * (colW + gapX);
      face(x + pd / 2, py + pd / 2, pd, p.photo, p.name);
      _ccTxt(ctx, _ccFitText(ctx, p.name, nf, colW - pd - 22 * T), x + pd + 22 * T, py + pd / 2 + 8 * T, nf, S.text);
    });
    y += peopleH + 46 * T;
  }
  if (credits.length) {   // the other credits, one row of columns
    const colW = (w - gapX * (credits.length - 1)) / credits.length;
    credits.forEach(([l, v], i) => {
      const x = M + i * (colW + gapX);
      _ccTxt(ctx, l.toUpperCase(), x, y + 13 * T, cf, S.muted, 'left', 2 * T);
      _ccTxt(ctx, _ccFitText(ctx, v, vf, colW), x, y + 13 * T + 12 * T + 22 * T, vf, S.text);
    });
    y += credH + 46 * T;
  }
  if (cast.length) {   // Starring: round photos, up to five to a row, name and character under each
    label('Starring', y);
    ctx.save(); ctx.strokeStyle = S.line; ctx.lineWidth = 1; const lw = _ccW(ctx, 'STARRING', `700 ${15 * T}px ${CC_MAN}`, 3 * T);
    ctx.beginPath(); ctx.moveTo(M + lw + 18 * T, y + 9 * T); ctx.lineTo(W - M, y + 9 * T); ctx.stroke(); ctx.restore();
    y += 15 * T + 34 * T;
    const nf = `700 ${19 * T}px ${CC_MAN}`, rf = `500 ${16 * T}px ${CC_MAN}`;
    cast.forEach((c, i) => {
      const cx = M + (i % per) * (cellW + gapX) + cellW / 2, top = y + Math.floor(i / per) * (cellH + 26 * T);
      face(cx, top + cd / 2, cd, c.photo, c.actor);
      _ccTxt(ctx, _ccFitText(ctx, c.actor, nf, cellW), cx, top + cd + 18 * T + 19 * T, nf, S.text, 'center');
      if (c.character) _ccTxt(ctx, _ccFitText(ctx, c.character, rf, cellW), cx, top + cd + 18 * T + 24 * T + 18 * T, rf, S.muted, 'center');
    });
  }
  if (!d) _ccTxt(ctx, e.tmdb_id ? 'TMDB didn’t answer — showing what’s saved.' : 'Not linked to TMDB — showing what’s saved.', W / 2, bottom - 10 * T, `500 ${18 * T}px ${CC_MAN}`, S.muted, 'center');
}

/* ══════════════════════════════════════════════════════════════
   EXPORT — Save image(s), Save PDF (A4), Copy, Share
══════════════════════════════════════════════════════════════ */
const _ccName = (i, n) => {
  const t = (_cardEntry?.title || 'card').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();
  return `msf_${t}_${_cc.card}_${CC_SIZES[_ccPrefs.size].file}${n > 1 ? `_${i + 1}of${n}` : ''}`;
};
const _ccBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), type, q));

async function downloadCard() {
  const cards = _cc.cards, n = cards.length;
  if (!n || _ccBlocked()) return;
  try {
    if (n === 1) { await mssSaveImage(cards[0].canvas, _ccName(0, 1) + '.png', cards[0].canvas.parentElement); return; }
    // more than one card: one share sheet with every image where there is one; otherwise one download each
    const files = await Promise.all(cards.map(async (c, i) => new File([await _ccBlob(c.canvas)], _ccName(i, n) + '.png', { type: 'image/png' })));
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: 'MyScreenFolio' }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    for (const f of files) {
      const url = URL.createObjectURL(f), a = document.createElement('a');
      a.download = f.name; a.href = url; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
      await new Promise(r => setTimeout(r, 350));
    }
    showToast(`Saved ${n} images.`);
  } catch (err) {
    console.error('Save card:', err);
    showToast('Save blocked by browser. Try a different browser.', 'err');
  }
}

async function _ccSavePDF() {
  if (!_cc.cards.length || _ccBlocked()) return;
  if (!window.jspdf) await mssLoadScript('js/vendor/jspdf-2.5.1.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  _cc.cards.forEach((c, i) => { if (i) doc.addPage('a4', 'portrait'); doc.addImage(c.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST'); });
  doc.save(_ccName(0, 1) + '.pdf');
  showToast(_cc.cards.length > 1 ? `Saved a ${_cc.cards.length}-page PDF.` : 'Saved the PDF.');
}

async function _ccCopy() {
  const c = _cc.cards[_cc.idx];
  if (!c || _ccBlocked()) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': _ccBlob(c.canvas) })]);
    showToast(_cc.cards.length > 1 ? `Card ${_cc.idx + 1} copied.` : 'Card copied — paste it anywhere.');
  } catch (err) { console.error('Copy card:', err); showToast('Couldn’t copy the image here — use Save image instead.', 'err'); }
}

async function _ccShare() {
  if (!_cc.cards.length || _ccBlocked()) return;
  try {
    const n = _cc.cards.length, files = await Promise.all(_cc.cards.map(async (c, i) => new File([await _ccBlob(c.canvas)], _ccName(i, n) + '.png', { type: 'image/png' })));
    await navigator.share({ files, title: _cardEntry?.title || 'MyScreenFolio' });
  } catch (err) { if (err?.name !== 'AbortError') { console.error('Share card:', err); showToast('Couldn’t share it here.', 'err'); } }
}

/* ══════════════════════════════════════════════════════════════
   TMDB — details for the header line, the Discover card and the retry / link prompts
══════════════════════════════════════════════════════════════ */
// Under the preview: not linked to TMDB → "Search & Link to TMDB"; linked but TMDB didn't
// answer (busy, offline, timed out) → "Try TMDB again"; everything there → nothing
function _cardPrompt(data) {
  const el = _ccEl('discoverLinkPrompt');
  if (!el) return;
  const linked = !!(_cardEntry?.tmdb_id && _cardEntry?.tmdb_type);
  el.style.display = data ? 'none' : '';
  _ccEl('discoverLinkBtn').style.display = linked ? 'none' : 'inline-flex';
  _ccEl('discoverRetry').hidden = !(linked && _cardDiscoverFailed);
}
function _cardRetryTmdb() {
  _cardDiscoverEntryKey = null; _cardDiscoverData = null; _cardDiscoverFailed = false; _cardTmdbReload = true; _cc.assets = null;
  _ccEl('discoverRetry').hidden = true;
  _drawCard();
}

async function _fetchDiscoverData(e) {
  const key = (e.tmdb_type || '') + ':' + (e.tmdb_id || '');
  if (_cardDiscoverEntryKey === key && _cardDiscoverData) return _cardDiscoverData;
  if (!e.tmdb_id || !e.tmdb_type) { _cardDiscoverData = null; _cardDiscoverEntryKey = key; _cardDiscoverFailed = false; return null; }
  try {
    const extra = e.tmdb_type === 'movie' ? 'credits,release_dates' : 'credits,aggregate_credits,content_ratings';
    // + images: the title's name artwork (logos, as on its title page — tmdbLogo, nav.js)
    const url = `${TMDB_BASE}/${e.tmdb_type}/${e.tmdb_id}?language=en-US&append_to_response=${extra},images&include_image_language=en,null`;
    // Try again: straight to TMDB, not the request that didn't answer (nor a saved copy)
    const res = await _cardTimeout(tmdbFetch(url, _cardTmdbReload ? { cache: 'reload' } : {}), 12000);
    _cardTmdbReload = false;
    if (!res.ok) throw new Error('TMDB fetch failed: ' + res.status);
    const data = await res.json();

    // directors (movies) / creators (shows), with their TMDB photos for the Discover card
    const people = (e.tmdb_type === 'movie' ? (data.credits?.crew || []).filter(c => c.job === 'Director') : (data.created_by || []))
      .filter((c, i, a) => a.findIndex(x => x.id === c.id) === i).slice(0, 2)
      .map(c => ({ name: c.name, photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '' }));
    const director = people.map(p => p.name).join(', ');
    const writers = [...new Set((data.credits?.crew || []).filter(c => ['Writer', 'Screenplay', 'Story'].includes(c.job)).map(c => c.name))].slice(0, 3).join(', ');
    // Character-first cast (shared with the info popup, nav.js) — with their photos (character art for animated titles, like the site)
    const animated = (data.genres || []).some(g => g.id === 16) || e.cat === 'anime' || e.cat === 'cartoons';
    const castRaw = (await _cardTimeout(mssFetchCast({
      tmdb_id: e.tmdb_id, tmdb_type: e.tmdb_type, title: e.title || data.title || data.name,
      year: e.year || (data.release_date || data.first_air_date || '').slice(0, 4), animated,
      origin_country: data.origin_country, original_language: data.original_language,
    }), 10000).catch(() => [])).map(c => ({ actor: c.actor || '', character: c.character || '', photo: c.photo || '' }));
    let certification = '';
    if (e.tmdb_type === 'movie') {
      const usRel = (data.release_dates?.results || []).find(r => r.iso_3166_1 === 'US');
      certification = (usRel?.release_dates || []).find(rd => rd.certification)?.certification || '';
    } else certification = (data.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US')?.rating || '';

    const result = {
      director, people, writers, castRaw, certification,
      production: (data.production_companies || []).map(c => c.name).slice(0, 3).filter(Boolean),
      overview: (data.overview || '').trim(), tagline: (data.tagline || '').trim(),
      releaseDate: e.tmdb_type === 'movie' ? (data.release_date || '') : (data.first_air_date || ''),
      lastDate: data.last_air_date || '', status: data.status || '', network: (data.networks || [])[0]?.name || '',
      seasons: data.number_of_seasons || 0, episodes: data.number_of_episodes || 0, runtime: data.runtime || 0,
      titleLogo: typeof tmdbLogo === 'function' ? tmdbLogo(data) : null,
    };
    _cardDiscoverData = result; _cardDiscoverEntryKey = key; _cardDiscoverFailed = false;
    return result;
  } catch (err) {
    console.error('Card TMDB fetch error:', err);
    _cardDiscoverData = null; _cardDiscoverEntryKey = key; _cardDiscoverFailed = true;
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   Search & Link to TMDB — shown when an entry has no tmdb_id/type yet, so its details can be fetched
══════════════════════════════════════════════════════════════ */
let _cardLinkResults = [];
let _cardLinkSearchTimer = null;

// a side panel S (full page on phones); opened from Create card it replaces it, and Back returns to it
let _cardLinkPanel = null;
async function _linkCardEntryToTMDB() {
  _cardLinkResults = [];
  await mssLoadScript('js/panel.js');
  const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Link to TMDB',
    body: `<div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input class="lyr-field" id="cardLinkSearchInput" placeholder="Search movies and shows…" aria-label="Search movies and shows" autocomplete="off" enterkeyhint="search" oninput="_onCardLinkSearchInput(this.value)"></div>
      <div id="cardLinkResultsList" aria-live="polite"></div>`,
    onClose: () => { if (_cardLinkPanel === h) _cardLinkPanel = null; } });
  _cardLinkPanel = h;
  if (!h.isPage) document.getElementById('cardLinkSearchInput').focus();
}

function _closeCardLinkPicker() { _cardLinkPanel?.closeNow(); }

function _onCardLinkSearchInput(query) {
  clearTimeout(_cardLinkSearchTimer);
  const q = query.trim();
  const listEl = document.getElementById('cardLinkResultsList');
  if (!q) { listEl.innerHTML = ''; _cardLinkResults = []; return; }
  _cardLinkSearchTimer = setTimeout(async () => {
    const results = await _tmdbSearch(q, 8);
    _cardLinkResults = results;
    if (!results.length) { listEl.innerHTML = `<p class="lyr-rows-msg">No matches found.</p>`; return; }
    listEl.innerHTML = `<ul class="lyr-rows">${results.map((r, i) => { const date = r.release_date || r.first_air_date || '';
      return mssRowHTML({ img: r.poster_path ? TMDB_FULL + r.poster_path : null, title: r.title || r.name || 'Untitled',
        sub: (r.media_type === 'movie' ? 'Movie' : 'TV Show') + (date ? ' · ' + date.slice(0, 4) : ''), attrs: `onclick="_pickCardLinkMatch(${i})"${MSSAge.attr(r.media_type, r.id)}` }); }).join('')}</ul>`;
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
    _cc.assets = null;
    showToast('Linked to TMDB!');
    await _drawCard();
  } catch (err) {
    showToast('Error linking to TMDB.', 'err');
    console.error(err);
  }
}

function _resolveEntryForCard(id) {
  if (typeof _catAll       !== 'undefined') { const e = _catAll.find(x => x.id === id);       if (e) return e; }
  if (typeof _allCompleted !== 'undefined') { const e = _allCompleted.find(x => x.id === id); if (e) return e; }
  if (typeof _pEntries     !== 'undefined') { const e = _pEntries.find(x => x.id === id);     if (e) return e; }
  return null;
}
