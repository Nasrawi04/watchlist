/* ═══════════════════════════════════════════════════════════════
   rewatch.js — Shared Rewatch System
   Requires: sb, getCurrentUser, showToast, showConfirm
═══════════════════════════════════════════════════════════════ */

/* ── Helpers ── */
function getRewatchCount(e) {
  return mssRewatchCount(e);   // config.js
}
function isRewatching(e) {
  return !!(e?.ratings?._is_rewatching);
}

/* ── Rewatch badge HTML ── */
function rewatchBadgeHTML(e) {
  return mssRewatchBadgeHTML(getRewatchCount(e));   // the shared pill (config.js)
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
    iconName: 'refresh',
    danger: false
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
    // An open title panel / page shows the rewatch
    if (typeof MSSViews !== 'undefined') MSSViews.refresh(e);
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
  if (typeof MSSViews         !== 'undefined') return MSSViews.entry(id);   // the title panel / item.html
  return null;
}