/* ═══════════════════════════════════════════════════════════════
   friend-popups.js — popups for a FRIEND's entry (read-only) (v621)

   MSSFriendPop.rating(entry)            — the ratings popup, exactly as on a
                                            friend's profile (score box, core /
                                            bonus ratings, highlights, notes)
   MSSFriendPop.note(entry, profile)     — the Notes-page popup (backdrop header,
                                            poster, badges, full note, spoilers)
   MSSFriendPop.noteCardHTML(entry, profile, onclick)
                                         — the Notes-page community card

   Styles: the ratings popup uses the shared cg-/fd- classes; the note card
   and note popup use the nc- / np- classes in style.css (shared with Notes).
═══════════════════════════════════════════════════════════════ */
const MSSFriendPop = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie' || e.tmdb_type === 'movie';
  const fmtDate = d => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const words = t => (t || '').trim().split(/\s+/).filter(Boolean).length;
  let current = null;

  /* ══ Ratings popup ══ */
  function injectRating() {
    if (document.getElementById('frRatePopupOverlay')) return;
    const el = document.createElement('div');
    el.id = 'frRatePopupOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;opacity:0;transition:opacity 220ms var(--ease);pointer-events:none;';
    el.innerHTML = `<div id="frRatePopupCard" style="background:var(--bg-2);border:1.5px solid var(--olive-light);box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);width:100%;max-width:min(97vw, 920px);max-height:90dvh;overflow-y:auto;overscroll-behavior-y:contain;position:relative;box-sizing:border-box;transform:translateY(18px);transition:transform 260ms var(--ease);">
      <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;padding:24px 24px 0;">
        <div id="frRatePoster" style="width:150px;height:225px;flex-shrink:0;border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-3);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);"></div>
        <div style="flex:1;min-width:0;padding-top:4px;">
          <div id="frRateBy" class="fr-rate-by"></div>
          <div id="frRateTitle" class="cg-popup-title" style="font-family:'Oswald',var(--sans);font-weight:600;line-height:1.15;color:var(--text);"></div>
          <div id="frRateTags" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>
          <div id="frRateDateRow" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>
        </div>
        <div id="frRateDesc" class="fd-description cg-desc-block" style="margin:16px 0 0;"></div>
        <div id="frRateScoreBox" class="cg-score-box" style="flex-shrink:0;flex-grow:0;text-align:center;align-self:stretch;position:relative;padding:18px 20px;border-radius:var(--radius-sm);background:transparent;border:2px solid var(--olive);">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:100%;">
            <div style="font-family:'Oswald',var(--sans);font-weight:600;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;">Overall Score</div>
            <div id="frRatePopupScoreVal" style="font-family:var(--bebas);font-size:48px;color:var(--olive);line-height:1;display:flex;align-items:center;justify-content:center;gap:6px;"></div>
          </div>
        </div>
        <button class="cg-close-btn" onclick="MSSFriendPop.closeRating()" aria-label="Close" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:22px;line-height:1;position:absolute;z-index:1;">\u2715</button>
      </div>
      <div id="frRateBody" style="padding:20px 24px 6px;"></div>
      <div id="frRatePopupActions" style="display:flex;gap:8px;padding:4px 24px 24px;flex-wrap:wrap;">
        <button class="popup-action-btn" onclick="MSSFriendPop._addToWatchlist()">${icon('plus', 13)} Add to Watchlist</button>
        <button class="popup-action-btn" onclick="MSSFriendPop._discover()">${icon('search', 13)} Discover</button>
      </div>
    </div>`;
    el.addEventListener('click', ev => { if (ev.target === el) closeRating(); });
    document.body.appendChild(el);
    const card = document.getElementById('frRatePopupCard');
    const apply = () => card.classList.toggle('cg-narrow', card.getBoundingClientRect().width <= 600);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(card); else window.addEventListener('resize', apply);
  }

  function breakdownHTML(e) {
    if (isMovie(e)) {
      const h = Number(e.runtime_h) || 0, m = Number(e.runtime_m) || 0;
      return (h || m) ? `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${h ? `${h}h ${m}m` : `${m}m`}</div><div class="pvi-runtime-lbl">Movie Runtime</div></div></div>` : '';
    }
    const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number) : [];
    const n = bd.length || Number(e.total_seasons) || 0;
    if (!n) return '';
    let chips = '';
    for (let i = 0; i < n; i++) chips += `<div class="pvi-season-chip"><div class="pvi-season-num">S${i + 1}</div><div class="pvi-season-eps">${bd[i] ? bd[i] + ' eps' : 'S' + (i + 1)}</div></div>`;
    return `<div class="fd-section-hd">Season Breakdown</div><div class="pvi-seasons">${chips}</div>`;
  }
  function expansionHTML(e) {
    const { core = [], bonus = [] } = typeof getRatings === 'function' ? getRatings(e.cat) : {};
    const row = r => { const v = e.ratings?.[r.key]; return v == null || v === '' ? '' : `<div class="fd-rating-row"><span class="fd-rating-label">${esc(r.label)}</span><span class="fd-rating-val">${Number(v).toFixed(2)}</span></div>`; };
    const coreRows = core.map(row).join(''), bonusRows = bonus.map(row).join('');
    const movies = e.cat === 'movies';
    const favs = e.ratings?._favorites || {}, lows = e.ratings?._lowlights || favs._lowlights || {};
    const chip = (lbl, val, low) => val ? `<span class="fav-chip${low ? ' low-chip' : ''}"><span class="fav-chip-label">${lbl}</span><span class="fav-chip-val">${esc(val)}</span></span>` : '';
    const favChips = chip('Fav Character', favs.character) + (movies ? '' : chip('Fav Episode', favs.episode) + chip('Fav Season', favs.season));
    const lowChips = chip('Least Fav Character', lows.character, 1) + (movies ? '' : chip('Least Fav Episode', lows.episode, 1) + chip('Least Fav Season', lows.season, 1));
    let html = breakdownHTML(e) + '<div class="fd-cols">';
    if (coreRows) html += `<div class="fd-col"><div class="fd-section-hd">Core Ratings</div>${coreRows}</div>`;
    if (bonusRows) html += `<div class="fd-col"><div class="fd-section-hd">Bonus Ratings</div>${bonusRows}</div>`;
    html += '</div>';
    if (favChips || lowChips) html += '<div class="fd-section-hd" style="margin-top:16px;">Highlights</div>';
    if (favChips) html += `<div class="fav-chips" style="margin-top:6px;">${favChips}</div>`;
    if (lowChips) html += `<div class="fav-chips" style="margin-top:6px;">${lowChips}</div>`;
    if (e.notes && e.notes.trim()) {
      const nt = `<div class="fd-notes" style="margin-top:0;padding-top:0;border-top:none;">&ldquo;${esc(e.notes.trim())}&rdquo;</div>`;
      html += '<div class="fd-section-hd" style="margin-top:16px;">Notes</div>' + (mssIsSpoiler(e) ? mssSpoilerHTML(nt, { compact: true }) : nt);
    }
    return html;
  }

  function rating(e, profile) {
    if (!e) return;
    injectRating();
    current = e;
    document.getElementById('frRatePoster').innerHTML = posterHTML(e);
    document.getElementById('frRateBy').innerHTML = profile ? `${profileAv(profile, 22)}<span>${esc(profile.display_name || profile.username || 'Friend')}’s rating</span>` : '';
    const start = e.year, end = e.ratings?._completion_year;
    const yr = start ? ` <span style="font-family:var(--bebas);font-size:0.65em;font-weight:400;color:var(--text-2);vertical-align:middle;">${esc(isMovie(e) || String(end) === String(start) ? start : `${start}–${end || 'Present'}`)}</span>` : '';
    document.getElementById('frRateTitle').innerHTML = esc(e.title) + yr;
    const label = CAT_META[e.cat]?.label || '';
    document.getElementById('frRateTags').innerHTML =
      (label ? `<span class="${isMovie(e) ? 'type-label' : 'type-label type-label-tv'}" style="font-family:'Manrope',var(--sans);font-weight:500;">${esc(label)}</span>` : '') +
      (e.genres || []).map(g => `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">${esc(g)}</span>`).join('');
    document.getElementById('frRateDateRow').innerHTML =
      (e.completed_date ? `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">Completed On: ${fmtDate(e.completed_date)}</span>` : '') +
      (e.status === 'ongoing' && e.season != null && e.episode != null && !isMovie(e) ? `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">Left off: S${e.season} · E${e.episode}</span>` : '');
    const d = document.getElementById('frRateDesc');
    if (e.description) { d.textContent = e.description; d.style.display = ''; } else d.style.display = 'none';
    const sc = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
    document.getElementById('frRateScoreBox').style.display = sc != null ? '' : 'none';
    document.getElementById('frRatePopupScoreVal').textContent = sc != null ? '★ ' + sc : '';
    document.getElementById('frRateBody').innerHTML = expansionHTML(e);
    const ov = document.getElementById('frRatePopupOverlay');
    ov.style.pointerEvents = 'auto'; ov.style.opacity = '1';
    document.getElementById('frRatePopupCard').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
  }
  function closeRating() {
    const ov = document.getElementById('frRatePopupOverlay');
    if (!ov) return;
    ov.style.opacity = '0'; ov.style.pointerEvents = 'none';
    document.getElementById('frRatePopupCard').style.transform = 'translateY(18px)';
    document.body.style.overflow = '';
  }
  function _addToWatchlist() { const e = current; closeRating(); if (e) MSSInfo.fromEntry(e); }
  function _discover() { const e = current; if (!e) return; closeRating(); MSSInfo.discover(e); }

  /* ══ Note card + note popup (Notes-page design) ══ */
  function profileAv(p, size) {
    const u = safeURL(p?.avatar_url);
    return `<div class="snote-avatar" style="width:${size}px;height:${size}px">${u ? `<img src="${u}" alt="">` : esc((p?.username || '?')[0].toUpperCase())}</div>`;
  }
  function typeBadge(e) {
    const label = CAT_META[e.cat]?.label || (isMovie(e) ? 'Movie' : 'TV Show');
    return `<span class="${isMovie(e) ? 'type-label' : 'type-label type-label-tv'}" style="font-family:'Manrope',var(--sans);font-weight:500;">${esc(label)}</span>`;
  }
  function poster(e, cls) {
    const u = safeURL(e.poster_url);
    return `<div class="${cls}">${u ? `<img src="${u}" loading="lazy" alt="" data-letter="${esc((e.title || '?')[0])}" onerror="mssImgError(this)">` : esc((e.title || '?')[0].toUpperCase())}</div>`;
  }
  const scorePill = e => liveScore(e) != null ? `<span class="nc-score">★ ${Number(liveScore(e)).toFixed(2)}</span>` : '';
  const trim = t => { const w = (t || '').trim().split(/\s+/); return w.length > 60 ? w.slice(0, 60).join(' ') + '…' : (t || '').trim(); };

  function noteCardHTML(e, p, onclick) {
    const quote = `<blockquote class="nc-quote">&ldquo;${esc(trim(e.notes))}&rdquo;</blockquote>`;
    const n = words(e.notes);
    return `<article class="nc-card" onclick="${onclick}">
      ${poster(e, 'nc-poster')}
      <div class="nc-main">
        <div class="nc-top"><div class="nc-author">${profileAv(p, 22)}<span>@${esc(p?.username || 'friend')}</span></div></div>
        <div class="nc-top"><div class="nc-title">${esc(e.title)}</div>${scorePill(e)}</div>
        <div class="nc-tags">${typeBadge(e)}${(e.completed_date || e.updated_at) ? `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">${fmtDate(e.completed_date || e.updated_at)}</span>` : ''}</div>
        ${mssIsSpoiler(e) ? mssSpoilerHTML(quote, { compact: true }) : quote}
        <div class="nc-foot"><span></span><span class="nc-words"><b>${n}</b> ${n === 1 ? 'word' : 'words'}</span></div>
      </div>
    </article>`;
  }

  function injectNote() {
    if (document.getElementById('snPopupOverlay')) return;
    const el = document.createElement('div');
    el.id = 'snPopupOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:900;display:none;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = `<div id="snPopupCard" class="np-card"></div>`;
    el.addEventListener('click', ev => { if (ev.target === el) closeNote(); });
    document.body.appendChild(el);
  }
  const backdropCache = {};
  async function loadHero(elHero, e) {
    if (!elHero) return;
    if (safeURL(e.poster_url)) elHero.style.backgroundImage = cssURL(e.poster_url);
    if (!e.tmdb_id || !e.tmdb_type || typeof tmdbFetch !== 'function') return;
    const key = e.tmdb_type + ':' + e.tmdb_id;
    let path = backdropCache[key];
    if (path === undefined) {
      try { const r = await tmdbFetch(`${TMDB_BASE}/${e.tmdb_type}/${e.tmdb_id}?api_key=${TMDB_KEY}&language=en-US`); path = r.ok ? ((await r.json()).backdrop_path || null) : null; }
      catch { path = null; }
      backdropCache[key] = path;
    }
    if (!path || !elHero.isConnected) return;
    const url = `https://image.tmdb.org/t/p/w1280${path}`, img = new Image();
    img.onload = () => { elHero.style.backgroundImage = cssURL(url); elHero.classList.add('is-backdrop'); };
    img.src = url;
  }
  function note(e, p) {
    if (!e) return;
    injectNote();
    const n = words(e.notes);
    const body = `<blockquote class="np-quote">&ldquo;${esc(e.notes.trim())}&rdquo;</blockquote>`;
    const card = document.getElementById('snPopupCard');
    card.innerHTML = `
      <div class="np-hero"><div class="np-hero-blur" id="frNoteHero"></div><div class="np-hero-fade"></div>
        <button class="np-close" onclick="MSSFriendPop.closeNote()" aria-label="Close">&#x2715;</button></div>
      <div class="np-head">
        ${poster(e, 'np-poster')}
        <div class="np-head-info">
          <div class="np-eyebrow">${profileAv(p, 20)}<span class="np-user">@${esc(p?.username || 'friend')}</span></div>
          <div class="np-title">${esc(e.title)}</div>
          <div class="np-meta-row"><div class="np-meta">${typeBadge(e)}${e.completed_date ? `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">Watched On: ${fmtDate(e.completed_date)}</span>` : ''}</div><span class="np-score-slot">${scorePill(e)}</span></div>
        </div>
      </div>
      <div class="np-stats"><span><b>${n}</b> ${n === 1 ? 'word' : 'words'}</span></div>
      <div class="np-body">${mssIsSpoiler(e) ? mssSpoilerHTML(body) : body}</div>
      <div class="np-footer"><div class="np-actions" id="frNotePopupActions">
        <button class="popup-action-btn np-grow" onclick="MSSFriendPop.closeNote();MSSFriendPop.rating(window._frEntryMap?.[${attrJSON(e.id)}], ${attrJSON(p || {})})">${icon('sparkles', 14)} See their rating</button>
        <button class="popup-action-btn np-ghost" onclick="MSSFriendPop.closeNote()">Close</button>
      </div></div>`;
    card.classList.toggle('np-long', n > 120);
    const ov = document.getElementById('snPopupOverlay');
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    loadHero(document.getElementById('frNoteHero'), e);
    requestAnimationFrame(() => card.querySelectorAll('.np-body').forEach(b => { const u = () => b.classList.toggle('np-more', b.scrollHeight - b.scrollTop - b.clientHeight > 8); b.onscroll = u; u(); }));
  }
  function closeNote() {
    const ov = document.getElementById('snPopupOverlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (document.getElementById('confirmOverlay')?.classList.contains('open')) return;
    if (document.getElementById('snPopupOverlay')?.style.display === 'flex') { closeNote(); return; }
    if (document.getElementById('frRatePopupOverlay')?.style.opacity === '1') closeRating();
  });

  return { rating, closeRating, note, closeNote, noteCardHTML, _addToWatchlist, _discover };
})();
