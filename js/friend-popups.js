/* ═══════════════════════════════════════════════════════════════
   friend-popups.js — popups for a FRIEND's entry (read-only) (v629)

   (Their ratings popup is the shared MSSRate.forFriend — rating-popup.js.)
   MSSFriendPop.note(entry, profile)     — the Notes-page popup (backdrop header,
                                            poster, badges, full note, spoilers)
   MSSFriendPop.noteCardHTML(entry, profile, onclick)
                                         — the Notes-page community card

   Styles: the note card and note popup use the nc- / np- classes in
   style.css (shared with Notes).
═══════════════════════════════════════════════════════════════ */
const MSSFriendPop = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie' || e.tmdb_type === 'movie';
  const fmtDate = d => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const words = t => (t || '').trim().split(/\s+/).filter(Boolean).length;

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
        <button class="popup-action-btn np-grow" onclick="MSSFriendPop.closeNote();MSSRate.forFriend(window._frEntryMap?.[${attrJSON(e.id)}], ${attrJSON(p || {})})">${icon('sparkles', 14)} See their rating</button>
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
    if (document.getElementById('snPopupOverlay')?.style.display === 'flex') closeNote();
  });

  return { note, closeNote, noteCardHTML };
})();
