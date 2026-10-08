/* ═══════════════════════════════════════════════════════════════
   rating-popup.js — THE ratings popup, used on every page (v629)

   One popup for a rated entry anywhere on the site: poster, title/years,
   type + genre tags, Watched On / Left off, description, Overall Score
   box, TV Show Breakdown / Movie Runtime, Core + Bonus ratings,
   Highlights and Notes. Only the buttons change, depending on whose
   entry it is:

     Your own entry   → Edit · Rewatch · Create Card · Discover Card · Delete
                        (Rewatch hides while you're watching it; Discover
                        Card shows for titles that aren't finished)
     Someone else's   → Add to Watchlist · Discover
                        (+ "<Name>'s rating" line when you pass their profile)

   Usage:
     MSSRate.forOwnEntry(entry, {
       onDelete(entry),          // drop it from the page's arrays + re-render
       onChange(entry),          // re-render (e.g. new seasons found on TMDB)
       onComments(entry),        // optional: shows the Comments strip
       from: 'library.html',     // where Edit returns to (defaults to this page)
     })
     MSSRate.forFriend(entry, profile?, { hideNotes })
     (hideNotes: true leaves out the Notes block — used when the switcher has a Note tab)
     MSSRate.close()

   Requires config.js (icon, escHTML, posterHTML, liveScore, getRatings,
   CAT_META, showConfirm, mssIsSpoiler, mssSpoilerHTML), db.js
   (deleteEntry), info-popup.js (MSSInfo — Add to Watchlist / Discover),
   rewatch.js + create-card.js for those buttons (hidden if not loaded).
═══════════════════════════════════════════════════════════════ */

const RATING_POPUP_CONFIG = {
  ownerActions:  ['edit', 'rewatch', 'card', 'discoverCard', 'delete'],
  friendActions: ['queue', 'discover'],
};

const MSSRate = (() => {
  let current = null, opts = {};
  const esc = s => escHTML(s == null ? '' : String(s));
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie' || e.tmdb_type === 'movie';
  const fmtDate = d => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const thisFile = () => location.pathname.split('/').pop() || 'index.html';

  /* ── Markup (styles: #mssRate* / .mr-* in style.css) ── */
  function inject() {
    if (document.getElementById('mssRateOverlay')) return;
    const el = document.createElement('div');
    el.id = 'mssRateOverlay';
    el.innerHTML = `<div id="mssRateCard" role="dialog" aria-modal="true" aria-labelledby="mssRateTitle">
        <div class="mss-views" id="mssRateViews"></div>
        <div class="mr-head">
          <div class="mr-poster" id="mssRatePoster"></div>
          <div class="mr-meta">
            <div class="mr-by" id="mssRateBy"></div>
            <div class="mr-title" id="mssRateTitle"></div>
            <div class="mr-row" id="mssRateTags"></div>
            <div class="mr-row" id="mssRatePopupDateRow"></div>
          </div>
          <div class="fd-description cg-desc-block mr-desc" id="mssRateDesc"></div>
          <div class="cg-score-box mr-score-box" id="mssRateScoreBox">
            <div class="mr-score-inner">
              <div class="mr-score-lbl">Overall Score</div>
              <div class="mr-score-val" id="mssRateScoreVal"></div>
            </div>
          </div>
          <button type="button" class="mr-close" onclick="MSSRate.close()" aria-label="Close">✕</button>
        </div>
        <div class="mr-body" id="mssRateBody"></div>
        <div class="mr-cc" id="mssRateCc"></div>
        <div id="mssRatePopupActions"></div>
      </div>`;
    MSSDialog.bind(el, close);
    document.body.appendChild(el);
    // Score box moves under the description once the card itself gets narrow
    const card = document.getElementById('mssRateCard');
    const apply = () => card.classList.toggle('cg-narrow', card.getBoundingClientRect().width <= 600);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(card); else window.addEventListener('resize', apply);
  }

  /* ── Body: breakdown, ratings, highlights, notes ── */
  function breakdownHTML(e) {
    if (isMovie(e)) {
      const h = Number(e.runtime_h) || 0, m = Number(e.runtime_m) || 0;
      return (h || m) ? `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${h ? `${h}h ${m}m` : `${m}m`}</div><div class="pvi-runtime-lbl">Movie Runtime</div></div></div>` : '';
    }
    const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number) : [];
    const n = bd.length || Number(e.total_seasons) || 0;
    if (!n) return e.total_eps ? `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${Number(e.total_eps)}</div><div class="pvi-runtime-lbl">Total Episodes</div></div></div>` : '';
    let chips = '';
    for (let i = 0; i < n; i++) chips += `<div class="pvi-season-chip"><div class="pvi-season-num">S${i + 1}</div><div class="pvi-season-eps">${bd[i] ? bd[i] + ' eps' : 'S' + (i + 1)}</div></div>`;
    return `<div class="fd-section-hd">TV Show Breakdown</div><div class="pvi-seasons">${chips}</div>`;
  }

  // hideNotes: the Info · Ratings · Note switcher already has a Note tab
  function bodyHTML(e, blurSpoilers, hideNotes) {
    const { core = [], bonus = [] } = getRatings(e.cat, isMovie(e)) || {};
    const row = (label, v) => v == null || v === '' ? '' : `<div class="fd-rating-row"><span class="fd-rating-label">${esc(label)}</span><span class="fd-rating-val">${Number(v).toFixed(2)}</span></div>`;
    const animated = e.cat === 'anime' || e.cat === 'cartoons';
    const coreRows = core.map(r => row(r.label, e.ratings?.[r.key])).join('') + (animated ? '' : row('Animation Quality', e.ratings?.animation));
    const bonusRows = bonus.map(r => row(r.label, e.ratings?.[r.key])).join('');
    const movies = e.cat === 'movies';
    const favs = e.ratings?._favorites || {}, lows = e.ratings?._lowlights || favs._lowlights || {};
    const chip = (lbl, val, low) => val ? `<span class="fav-chip${low ? ' low-chip' : ''}"><span class="fav-chip-label">${lbl}</span><span class="fav-chip-val">${esc(val)}</span></span>` : '';
    const favChips = chip('Fav Character', favs.character) + (movies ? '' : chip('Fav Episode', favs.episode) + chip('Fav Season', favs.season));
    const lowChips = chip('Least Fav Character', lows.character, 1) + (movies ? '' : chip('Least Fav Episode', lows.episode, 1) + chip('Least Fav Season', lows.season, 1));
    let html = breakdownHTML(e) + '<div class="fd-cols">';
    if (coreRows) html += `<div class="fd-col"><div class="fd-section-hd">Core Ratings</div>${coreRows}</div>`;
    if (bonusRows) html += `<div class="fd-col"><div class="fd-section-hd">Bonus Ratings</div>${bonusRows}</div>`;
    html += '</div>';
    if (favChips || lowChips) html += '<div class="fd-section-hd mr-gap">Highlights</div>';
    if (favChips) html += `<div class="fav-chips mr-chips">${favChips}</div>`;
    if (lowChips) html += `<div class="fav-chips mr-chips">${lowChips}</div>`;
    if (!hideNotes && e.notes && e.notes.trim()) {
      const nt = `<div class="fd-notes mr-notes">&ldquo;${esc(e.notes.trim())}&rdquo;</div>`;
      html += '<div class="fd-section-hd mr-gap">Notes</div>' + (blurSpoilers && mssIsSpoiler(e) ? mssSpoilerHTML(nt, { compact: true, id: e.id }) : nt);
    }
    return html;
  }

  /* ── Buttons ── */
  const btn = (key, ico, label, extra = '') =>
    `<button type="button" class="popup-action-btn${extra}" onclick="MSSRate._act('${key}', this)">${icon(ico, 14)} ${label}</button>`;

  function actionsHTML(e) {
    const watchingNow = e.status === 'watching' || e.status === 'up_next' || e.status === 'paused';
    const finished = e.status === 'completed' || e.status === 'ongoing';
    const B = {
      edit:         () => btn('edit', 'edit', 'Edit'),
      rewatch:      () => !watchingNow && typeof rewatchEntry === 'function' ? btn('rewatch', 'refresh', 'Rewatch') : '',
      card:         () => typeof createShareCard === 'function' ? btn('card', 'image', 'Create Card') : '',
      discoverCard: () => !finished && typeof createShareCard === 'function' ? btn('discoverCard', 'idCard', 'Discover Card') : '',
      delete:       () => btn('delete', 'trash', 'Delete', ' popup-action-danger'),
      queue:        () => btn('queue', 'plus', 'Add to Watchlist'),
      discover:     () => btn('discover', 'search', 'Discover'),
    };
    const keys = opts.owner ? RATING_POPUP_CONFIG.ownerActions : RATING_POPUP_CONFIG.friendActions;
    return keys.map(k => B[k] ? B[k]() : '').join('');
  }

  async function act(key, b) {
    const e = current;
    if (!e) return;
    if (key === 'edit')         { goToDetail(e.id, opts.from || thisFile()); return; }
    if (key === 'rewatch')      { rewatchEntry(e.id); return; }        // closes this popup itself
    if (key === 'card')         { createShareCard(e.id); return; }
    if (key === 'discoverCard') { createShareCard(e.id, 3, true); return; }
    if (key === 'queue')        { close(); MSSInfo.fromEntry(e); return; }
    if (key === 'discover')     { close(); MSSInfo.discover(e, b); return; }
    if (key === 'delete') {
      const ok = await showConfirm({ title: 'Delete entry?', message: `"${e.title || 'This entry'}" will be permanently removed.`, confirmText: 'Delete', iconName: 'trash' });
      if (!ok) return;
      try {
        close();
        await mssDeleteWithUndo(e, window._navUser?.id || (await getCurrentUser()).id);
        opts.onDelete?.(e);
      } catch (err) { console.error(err); showToast('Error deleting entry.', 'err'); }
    }
  }

  /* ── Open / close ── */
  function open(e, o) {
    if (!e) return;
    inject();
    current = e; opts = o;
    const $ = id => document.getElementById(id);
    $('mssRateViews').innerHTML = '';   // MSSViews fills it when switching views
    $('mssRatePoster').innerHTML = posterHTML(e);
    const p = o.profile && (o.profile.username || o.profile.display_name) ? o.profile : null;
    $('mssRateBy').innerHTML = p ? mssProfileLinkHTML(p, `<span class="mr-by-av">${safeURL(p.avatar_url) ? `<img src="${safeURL(p.avatar_url)}" alt="">` : esc((p.username || '?')[0].toUpperCase())}</span><span translate="no">${esc(p.display_name || p.username || 'Friend')}’s rating</span>`) : '';
    $('mssRateBy').style.display = p ? '' : 'none';
    const start = e.year, end = e.ratings?._completion_year;
    const yr = start ? (isMovie(e) || String(end) === String(start) ? start : `${start}–${end || 'Present'}`) : '';
    $('mssRateTitle').innerHTML = mssTitleLinkHTML(e, esc(e.title)) + (yr ? ` <span class="mr-title-year">${esc(yr)}</span>` : '');
    const label = CAT_META[e.cat]?.label || '';
    $('mssRateTags').innerHTML =
      (label ? `<span class="${isMovie(e) ? 'type-label' : 'type-label type-label-tv'}">${esc(label)}</span>` : '') +
      (e.genres || []).map(g => `<span class="w-ep-badge">${esc(g)}</span>`).join('') +
      (typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : '');
    const dateRow = (e.completed_date ? `<span class="w-ep-badge">${MSS_WATCHED_ON} ${fmtDate(e.completed_date)}</span>` : '') +
      (e.status === 'ongoing' && e.season != null && e.episode != null && !isMovie(e) ? `<span class="w-ep-badge">Left off: S${e.season} · E${e.episode}</span>` : '');
    $('mssRatePopupDateRow').innerHTML = dateRow;
    $('mssRatePopupDateRow').style.display = dateRow ? '' : 'none';
    $('mssRateDesc').textContent = e.description || '';
    $('mssRateDesc').style.display = e.description ? '' : 'none';
    const sc = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
    $('mssRateScoreBox').style.display = sc != null ? '' : 'none';
    $('mssRateScoreVal').textContent = sc != null ? '★ ' + sc : '';
    $('mssRateBody').innerHTML = bodyHTML(e, !o.owner, !!o.hideNotes);
    $('mssRateCc').innerHTML = o.onComments
      ? `<button type="button" class="cc-strip" onclick="MSSRate._comments()">${icon('comment', 11)}<span>Comments</span></button>` : '';
    $('mssRatePopupActions').innerHTML = actionsHTML(e);
    MSSDialog.open($('mssRateOverlay'));
    $('mssRateCard').scrollTop = 0;
  }

  function close() {
    const ov = document.getElementById('mssRateOverlay');
    if (!MSSDialog.isOpen(ov)) return;
    MSSDialog.close(ov);
    current = null;
  }

  function forOwnEntry(e, o = {}) {
    open(e, { ...o, owner: true });
    // Quietly pick up any new seasons TMDB has for it (once — not on every view switch)
    const uid = window._navUser?.id;
    if (e && !o.noRefresh && uid && typeof _refreshTmdbSeasonData === 'function') _refreshTmdbSeasonData(e, uid, () => o.onChange?.(e));
  }
  function forFriend(e, profile, o = {}) { open(e, { ...o, owner: false, profile }); }

  return {
    forOwnEntry, forFriend, close, config: RATING_POPUP_CONFIG,
    isOpen: () => !!document.getElementById('mssRateOverlay')?.classList.contains('open'),
    _act: act, _comments: () => { const e = current; if (e) opts.onComments(e); },
  };
})();