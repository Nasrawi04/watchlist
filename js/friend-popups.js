/* ═══════════════════════════════════════════════════════════════
   friend-popups.js — a friend's note card (Friends page)

   MSSFriendPop.noteCardHTML(entry, profile, onclick)
                                         — the Notes-page community card
   Their note itself opens in the shared note popup (MSSNote, through
   MSSViews) with their avatar, 👍 / 👎 and See Ratings.

   Styles: nc-* in style.css (shared with Notes).
═══════════════════════════════════════════════════════════════ */
const MSSFriendPop = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const isMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie' || e.tmdb_type === 'movie';
  const fmtDate = d => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const words = t => (t || '').trim().split(/\s+/).filter(Boolean).length;

  /* ══ Note card (Notes-page design) ══ */
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
        ${mssIsSpoiler(e) ? mssSpoilerHTML(quote, { compact: true, id: e.id }) : quote}
        <div class="nc-foot"><span></span><span class="nc-words"><b>${n}</b> ${n === 1 ? 'word' : 'words'}</span></div>
      </div>
    </article>`;
  }

  return { noteCardHTML };
})();
