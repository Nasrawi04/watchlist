/* ═══════════════════════════════════════════════════════════════
   rewatch.js — Shared Rewatch System
   Requires: sb, getCurrentUser, showToast, showConfirm
═══════════════════════════════════════════════════════════════ */

/* ── Helpers ── */
function getRewatchCount(e) {
  return Number(e?.ratings?._rewatch_count) || 1;
}
function isRewatching(e) {
  return !!(e?.ratings?._is_rewatching);
}

/* ── Rewatch badge HTML ── */
function rewatchBadgeHTML(e) {
  const count = getRewatchCount(e);
  if (count <= 1) return '';
  return `<span class="rewatch-badge" title="Watched ${count} times">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
    ${count}
  </span>`;
}

/* ── Rewatch icon for grid/list cards ── */
function rewatchIconHTML(e) {
  if (!isRewatching(e)) return '';
  const count = getRewatchCount(e);
  return `<div class="rewatch-card-icon" title="Rewatching · Watch #${count}">
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
    ${count}
  </div>`;
}

/* ── Core rewatch action ── */
async function rewatchEntry(id) {
  const e = _resolveEntryForRewatch(id);
  if (!e) { showToast('Entry not found.', 'err'); return; }

  // Already watching - no need to rewatch
  if (e.status === 'watching' || e.status === 'paused') {
    showToast('Already in Currently Watching!');
    return;
  }

  const confirmed = await showConfirm({
    title: 'Start Rewatch?',
    message: `Move "${e.title}" back to Currently Watching?`,
    confirmText: 'Rewatch',
    iconName: 'refresh'
  });
  if (!confirmed) return;

  try {
    const ratings = Object.assign({}, e.ratings || {});
    const current = Number(ratings._rewatch_count) || 1;
    ratings._rewatch_count = current + 1;
    ratings._is_rewatching = true;

    // Build update - reset progress for TV, keep for movies
    const isMovie = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
    const update = { status: 'watching', ratings };
    if (!isMovie) {
      update.season  = e.season  || 1;
      update.episode = 0;
      update.watched = 0;
    }
    const { error } = await sb.from('entries').update(update).eq('id', id);
    if (error) throw error;

    // Update local cache
    e.status  = 'watching';
    e.ratings = ratings;
    if (!isMovie) { e.season = update.season; e.episode = 0; e.watched = 0; }

    showToast('Moved to Currently Watching!');
    // Close any open popup
    if (typeof closeGridPopup   === 'function') closeGridPopup();
    if (typeof cpClosePopup     === 'function') cpClosePopup();
    if (typeof profClosePopup   === 'function') profClosePopup();
    // Re-render
    if (typeof renderPage       === 'function') renderPage();
    if (typeof renderLibrary    === 'function') renderLibrary();
    if (typeof _renderAllSections === 'function') _renderAllSections();
  } catch(err) {
    showToast('Error starting rewatch.', 'err');
    console.error(err);
  }
}

/* ── Mark complete after rewatch (called when completing a rewatch) ── */
async function completeRewatch(id) {
  const e = _resolveEntryForRewatch(id);
  if (!e) return;
  try {
    const ratings = Object.assign({}, e.ratings || {});
    ratings._is_rewatching = false;
    // Keep _rewatch_count as-is
    await sb.from('entries').update({ ratings }).eq('id', id);
    e.ratings = ratings;
  } catch(err) {
    console.error('completeRewatch error:', err);
  }
}

/* ── Resolve entry from any page context ── */
function _resolveEntryForRewatch(id) {
  if (typeof _catAll          !== 'undefined') { const e = _catAll.find(x => x.id === id); if (e) return e; }
  if (typeof _allCompleted    !== 'undefined') { const e = _allCompleted.find(x => x.id === id); if (e) return e; }
  if (typeof _pEntries        !== 'undefined') { const e = _pEntries.find(x => x.id === id); if (e) return e; }
  return null;
}