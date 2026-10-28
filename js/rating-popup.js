/* ═══════════════════════════════════════════════════════════════
   rating-popup.js — THE ratings popup, used on every page (v629)

   The "Your Entry" tab (another person's: "Their Entry"): poster, title/years,
   type + genre tags, where it is in the library / Watched On / Left off,
   description, Overall Score box, TV Show Breakdown / Movie Runtime, Core +
   Bonus ratings, Highlights and Notes — or "Not rated yet" before there are any.
   Buttons — everything about YOUR entry (the title's own are on the Title tab):

     Your own entry → Start Watching · Up Next · Pick Back Up · Rewatch (when they apply) ·
                      Rate Episodes (shows) · Edit · Drop · Create Card (once rated) · Delete
                      + "Who can see this title"
     Someone else's → no buttons (+ "<Name>'s rating" line when you pass their profile)

   Usage (pages open it through MSSViews.open — info-popup.js):
     MSSRate.forOwnEntry(entry, {
       onDelete(entry),          // drop it from the page's arrays + re-render
       onChange(entry),          // re-render after a status change / new seasons found on TMDB
       onComments(entry),        // optional: shows the Comments strip
       handlers: { start, upnext },   // optional: the page's own status functions (id) => …
       from: 'library.html',     // where Edit returns to (defaults to this page)
     })
     MSSRate.forFriend(entry, profile?, { hideNotes })
     (hideNotes: true leaves out the Notes block — used when the switcher has a Note tab)
     MSSRate.close()

   Requires config.js (icon, escHTML, posterHTML, liveScore, getRatings,
   CAT_META, showConfirm, mssIsSpoiler, mssSpoilerHTML), db.js
   (updateProgress, MSSDrop, mssDeleteWithUndo), rewatch.js, create-card.js and
   episode-ratings.js for those buttons (hidden if not loaded).
═══════════════════════════════════════════════════════════════ */

const RATING_POPUP_CONFIG = {
  // Your Entry tab: everything about YOUR entry — the title's own buttons are on the Title tab (MSSInfo)
  ownerActions:  ['start', 'upnext', 'pickup', 'rewatch', 'rateEps', 'edit', 'drop', 'card', 'delete'],
  friendActions: [],
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
              <div class="mr-score-note" id="mssRateScoreNote" hidden>Dropped · doesn’t count toward averages</div>
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
      const nt = `<div class="fd-notes mr-notes mss-rich" translate="no">${MSSRich.html(e.notes)}</div>`;
      html += '<div class="fd-section-hd mr-gap">Notes</div>' + (blurSpoilers && mssIsSpoiler(e) ? mssSpoilerHTML(nt, { compact: true, id: e.id, e }) : nt);
    }
    return html;
  }

  /* ── Buttons — your entry's own (also used by the Title tab for Watchlist / Up Next
     titles, which have no Your Entry tab yet: MSSInfo passes ns 'MSSInfo') ── */
  function entryButtonsHTML(e, keys, ns = 'MSSRate') {
    const btn = (key, ico, label, extra = '') =>
      `<button type="button" class="popup-action-btn${extra}" data-act="${key}" onclick="${ns}._act('${key}', this)">${icon(ico, 14)} ${label}</button>`;
    const finished = e.status === 'completed' || e.status === 'ongoing';
    const B = {
      start:   () => e.status === 'queue' || e.status === 'up_next' ? btn('start', 'play', 'Start Watching') : '',
      upnext:  () => e.status === 'queue' ? btn('upnext', 'skipForward', 'Up Next') : '',
      pickup:  () => e.status === 'dropped' ? btn('pickup', 'play', 'Pick Back Up') : '',                     // Dropped (071)
      rewatch: () => finished && typeof rewatchEntry === 'function' ? btn('rewatch', 'refresh', 'Rewatch') : '',
      rateEps: () => typeof MSSEp !== 'undefined' && MSSEp.isShow(e) ? btn('rateEps', 'ratingStar', 'Rate Episodes') : '',
      edit:    () => btn('edit', 'edit', 'Edit'),
      drop:    () => ['watching', 'up_next', 'paused'].includes(e.status) ? btn('drop', 'drop', 'Drop') : '',
      // your score card — once there's something to put on it (the Title tab has the Discover Card)
      card:    () => typeof createShareCard === 'function' && (finished || liveScore(e) != null) ? btn('card', 'image', 'Create Card') : '',
      delete:  () => btn('delete', 'trash', 'Delete', ' popup-action-danger'),
    };
    return keys.map(k => B[k] ? B[k]() : '').join('');
  }
  const actionsHTML = e => entryButtonsHTML(e, opts.owner ? RATING_POPUP_CONFIG.ownerActions : RATING_POPUP_CONFIG.friendActions);
  const act = key => entryAct(key, current, opts, close);

  // One of your entry's buttons — opts: the popup's options (from, onChange, onDelete, handlers), close: closes that popup
  async function entryAct(key, e, opts, close) {
    if (!e) return;
    const uid = async () => window._navUser?.id || (await getCurrentUser()).id;
    if (key === 'edit')    { goToDetail(e.id, opts.from || thisFile()); return; }
    if (key === 'rewatch') { rewatchEntry(e.id); return; }        // closes this popup itself
    if (key === 'card')    { createShareCard(e.id); return; }
    if (key === 'rateEps') { close(); MSSEp.rate(e, e.season || 1, Math.max(1, e.episode || 1)); return; }
    if (key === 'drop' || key === 'pickup') {
      const onChange = opts.onChange;
      close();
      return key === 'drop' ? MSSDrop.drop(e, { onChange }) : MSSDrop.pickUp(e, { onChange });
    }
    if (key === 'start' || key === 'upnext') {
      const handler = opts.handlers?.[key];
      close();
      if (handler) return handler(e.id);
      // Default: just change the status
      try {
        const status = key === 'start' ? 'watching' : 'up_next', prev = e.status, id = await uid();
        await updateProgress(e.id, id, { status });
        e.status = status;
        opts.onChange?.(e);
        showUndoToast(key === 'start' ? `Started watching “${e.title}”` : `“${e.title}” is Up Next`, async () => {
          await updateProgress(e.id, id, { status: prev });
          e.status = prev;
          opts.onChange?.(e);
        });
      } catch (err) { console.error(err); showToast('Error updating. Please try again.', 'err'); }
      return;
    }
    if (key === 'delete') {
      const ok = await showConfirm({ title: 'Delete entry?', message: `"${e.title || 'This entry'}" will be permanently removed.`, confirmText: 'Delete', iconName: 'trash' });
      if (!ok) return;
      try {
        close();
        await mssDeleteWithUndo(e, await uid());
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
    const where = { queue: 'On your Watchlist', up_next: 'Up Next', watching: 'Watching', paused: 'Taking a Break' }[e.status];
    const dateRow = (where ? `<span class="w-ep-badge">${where}${e.status === 'watching' && !isMovie(e) && (e.season || e.episode) ? ` · S${Number(e.season) || 1} · E${Number(e.episode) || 0}` : ''}</span>` : '') +
      (e.completed_date ? `<span class="w-ep-badge">${MSS_WATCHED_ON} ${fmtDate(e.completed_date)}</span>` : '') +
      (e.status === 'ongoing' && e.season != null && e.episode != null && !isMovie(e) ? `<span class="w-ep-badge">Left off: S${e.season} · E${e.episode}</span>` : '') +
      (e.status === 'dropped' ? mssDroppedTagHTML(e) : '');
    $('mssRatePopupDateRow').innerHTML = dateRow;
    $('mssRatePopupDateRow').style.display = dateRow ? '' : 'none';
    $('mssRateDesc').textContent = e.description || '';
    $('mssRateDesc').style.display = e.description ? '' : 'none';
    const sc = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
    $('mssRateScoreBox').style.display = sc != null ? '' : 'none';
    $('mssRateScoreVal').textContent = sc != null ? '★ ' + sc : '';
    $('mssRateScoreBox').classList.toggle('is-dropped', e.status === 'dropped');   // a dropped title's score never counts (071)
    $('mssRateScoreNote').hidden = e.status !== 'dropped';
    const unrated = sc == null && !Object.keys(e.ratings || {}).some(k => !k.startsWith('_') && e.ratings[k] != null && e.ratings[k] !== '');
    $('mssRateBody').innerHTML = (unrated ? `<div class="mr-unrated">${icon('ratingStar', 20)}<div><b>Not rated yet</b><span>${o.owner
        ? (e.status === 'completed' || e.status === 'ongoing' ? 'Tap Edit to rate it.' : 'Rate it once you’ve watched it — Edit has every rating.')
        : 'They haven’t rated it yet.'}</span></div></div>` : '')
      + bodyHTML(e, !o.owner, !!o.hideNotes)
      + (o.owner ? `<div class="mr-vis">${mssTitleVisHTML('mssRateVis', e.visibility, '_mssRateVisPick')}</div>` : '');   // yours: who can see it (073)
    $('mssRateCc').innerHTML = o.onComments
      ? `<button type="button" class="cc-strip" onclick="MSSRate._comments()">${icon('comment', 11)}<span>Comments</span></button>` : '';
    $('mssRatePopupActions').innerHTML = actionsHTML(e);
    MSSDialog.open($('mssRateOverlay'));
    $('mssRateCard').scrollTop = 0;
  }

  // Who can see this title (073) — saved straight away
  async function saveVis(v) {
    const e = current;
    if (!e || e.visibility === v) return;
    const prev = e.visibility || 'anyone';
    try {
      await updateProgress(e.id, window._navUser?.id || (await getCurrentUser()).id, { visibility: v });
      e.visibility = v;
      document.getElementById('mssRatePoster').innerHTML = posterHTML(e);
      opts.onChange?.(e);
      showToast(v === 'private' ? 'Only you can see this title now.' : v === 'friends' ? 'Only your friends can see this title now.' : 'Anyone can see this title now.');
    } catch (err) {
      console.error('MSSRate vis:', err);
      showToast('Couldn’t save that — try again.', 'err');
      mssVisSet('mssRateVis', prev);
    }
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
    entryButtonsHTML, entryAct,
    _act: act, _comments: () => { const e = current; if (e) opts.onComments(e); }, _vis: saveVis,
  };
})();
// the title-visibility control calls this by name (mssTitleVisHTML onPick)
function _mssRateVisPick(v) { MSSRate._vis(v); }
