/* ═══════════════════════════════════════════════════════════════
   fav-lists-popup.js — Shared "Add to Favorites" popup
   Works on any page that loads config.js + db.js.
   Requires: sb (supabase), CAT_META, getCurrentUser, showToast
═══════════════════════════════════════════════════════════════ */

/* ── Inject overlay HTML once ── */
function _injectFavListsOverlay() {
  if (document.getElementById('favListsOverlay')) return;
  const el = document.createElement('div');
  el.id = 'favListsOverlay';
  el.innerHTML = `
    <div id="favListsCard">
      <div id="favListsHeader">
        <div>
          <div id="favListsTitle">Add to Favorites</div>
          <div id="favListsSubtitle"></div>
        </div>
        <button onclick="closeFavListsPopup()" id="favListsClose">&#x2715;</button>
      </div>
      <div id="favListsBody"></div>
      <div id="favListsFooter">
        <button onclick="closeFavListsPopup()" class="fav-lists-cancel-btn">Cancel</button>
        <button onclick="closeFavListsPopup()" class="fav-lists-done-btn">Done</button>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeFavListsPopup(); });
  document.body.appendChild(el);
}

/* ── State ── */
let _favListsEntry   = null;
let _favListsUser    = null;
let _favListsProfile = null;
let _favListsLists   = [];

/* ── Open ── */
async function openFavListsPopup(entryId) {
  _injectFavListsOverlay();

  // Resolve the entry from whatever context we're in
  const e = _resolveEntry(entryId);
  if (!e) { showToast('Entry not found.', 'err'); return; }
  _favListsEntry = e;

  // Get current user - prefer page-level globals to avoid extra round-trip
  try {
    _favListsUser = (typeof _catUser !== 'undefined' && _catUser)
      ? _catUser
      : (typeof _pUser !== 'undefined' && _pUser)
      ? _pUser
      : await getCurrentUser();
    if (!_favListsUser) { showToast('Sign in to use favorites.', 'err'); return; }

    const [profileRes, listsRes] = await Promise.all([
      sb.from('profiles').select('top_picks,fav_tv,fav_movies,fav_anime,fav_cartoons').eq('id', _favListsUser.id).single(),
      sb.from('favorite_lists').select('*').eq('user_id', _favListsUser.id).order('created_at', { ascending: true })
    ]);

    _favListsProfile = profileRes.data || {};
    _favListsLists   = listsRes.data  || [];
  } catch(err) {
    showToast('Error loading favorites.', 'err');
    console.error(err);
    return;
  }

  // Render
  document.getElementById('favListsTitle').textContent    = 'Add to Favorites';
  document.getElementById('favListsSubtitle').textContent = e.title;
  _renderFavListsBody(e);

  // Show
  const ov = document.getElementById('favListsOverlay');
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* ── Close ── */
function closeFavListsPopup() {
  const ov = document.getElementById('favListsOverlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
  _favListsEntry = null;
}

/* ── Render body ── */
function _renderFavListsBody(e) {
  const body = document.getElementById('favListsBody');
  const esc  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const isMovie   = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
  const isTv      = e.cat === 'tv';
  const isAnime   = e.cat === 'anime';
  const isCartoon = e.cat === 'cartoons';
  const genres    = e.genres || [];

  // ── Section: Top Favorites ──
  let html = _favListsRow('top_picks', null, 'Top Favorites', '★ Handpicked', _favListsProfile.top_picks || []);

  // ── Section: Default category lists (only compatible) ──
  const catSections = [
    { key: 'fav_tv',       cat: 'tv',       label: 'Favorite TV Shows',  show: isTv || isAnime || isCartoon },
    { key: 'fav_movies',   cat: 'movies',   label: 'Favorite Movies',    show: isMovie },
    { key: 'fav_anime',    cat: 'anime',    label: 'Favorite Anime',     show: isAnime },
    { key: 'fav_cartoons', cat: 'cartoons', label: 'Favorite Cartoons',  show: isCartoon },
  ];

  catSections.forEach(({ key, cat, label, show }) => {
    if (!show) return;
    html += _favListsRow(key, null, label, _catBadge(cat), _favListsProfile[key] || []);
  });

  // ── Section: Custom genre lists (compatible) ──
  const customLists = _favListsLists.filter(l => {
    if (l.cat === 'custom') return true; // custom lists accept everything
    if (l.cat === 'movies' && !isMovie)   return false;
    if (l.cat === 'tv'     && !(isTv || isAnime || isCartoon)) return false;
    if (l.cat === 'anime'  && !isAnime)   return false;
    if (l.cat === 'cartoons' && !isCartoon) return false;
    // Genre filter: if list has a genre, entry must have it
    if (l.genre && !genres.includes(l.genre)) return false;
    return true;
  });

  if (customLists.length) {
    customLists.forEach(l => {
      html += _favListsRow('list:' + l.id, l, esc(l.title), l.genre || l.cat, l.items || []);
    });
  }

  if (!html) {
    html = '<div style="padding:24px 20px;text-align:center;color:var(--text-3);font-size:13px;">No compatible favorite lists found.<br>Create lists in the Favorites page.</div>';
  }

  body.innerHTML = html;
}

function _catBadge(cat) {
  return (CAT_META && CAT_META[cat] && CAT_META[cat].label) || cat;
}

function _favListsRow(key, list, title, sub, currentItems) {
  const esc   = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const e     = _favListsEntry;
  const isIn  = Array.isArray(currentItems) && currentItems.includes(e.id);
  const count = Array.isArray(currentItems) ? currentItems.length : 0;
  // Top Favorites is capped at 5; category profile columns have no cap
  const maxItems = key === 'top_picks' ? 5 : (list === null ? null : Infinity);
  const isFull   = maxItems !== null && !isIn && count >= maxItems;
  const clickFn  = isFull ? '' : `onclick="toggleFavListEntry('${esc(key)}')"`;
  const subText  = isFull
    ? `${esc(String(sub))} · Full (${count}/${maxItems})`
    : `${esc(String(sub))} · ${count} item${count!==1?'s':''}`;
  return `<div class="fav-lists-row ${isIn ? 'fav-lists-row-in' : ''} ${isFull ? 'fav-lists-row-full' : ''}" ${clickFn}>
    <div class="fav-lists-row-info">
      <div class="fav-lists-row-title">${title}</div>
      <div class="fav-lists-row-sub">${subText}</div>
    </div>
    <div class="fav-lists-row-check ${isIn ? 'active' : isFull ? 'full' : ''}">
      ${isIn
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : isFull
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
        : ''}
    </div>
  </div>`;
}

/* ── Toggle item in/out of a list ── */
async function toggleFavListEntry(key) {
  if (!_favListsEntry || !_favListsUser) return;
  const id = _favListsEntry.id;

  try {
    if (key.startsWith('list:')) {
      // Custom / genre list
      const listId = key.slice(5);
      const list   = _favListsLists.find(l => l.id === listId);
      if (!list) return;
      const items  = [...(list.items || [])];
      const idx    = items.indexOf(id);
      if (idx >= 0) items.splice(idx, 1); else items.push(id);
      const { error } = await sb.from('favorite_lists').update({ items }).eq('id', listId).eq('user_id', _favListsUser.id);
      if (error) throw error;
      list.items = items;
      showToast(idx >= 0 ? 'Removed from list.' : 'Added to list!');
    } else {
      // Profile column (top_picks / fav_tv / fav_movies / fav_anime / fav_cartoons)
      const col   = key;
      const items = [...(_favListsProfile[col] || [])];
      const idx   = items.indexOf(id);
      if (idx >= 0) items.splice(idx, 1); else items.push(id);
      const upd   = {};
      upd[col]    = items;
      const { error } = await sb.from('profiles').update(upd).eq('id', _favListsUser.id);
      if (error) throw error;
      _favListsProfile[col] = items;
      showToast(idx >= 0 ? 'Removed from list.' : 'Added to list!');
    }
    // Re-render body
    _renderFavListsBody(_favListsEntry);
  } catch(err) {
    showToast('Error updating list.', 'err');
    console.error(err);
  }
}

/* ── Resolve entry from any page context ── */
function _resolveEntry(id) {
  // detail.html — _detEntry holds the current entry
  if (typeof _detEntry !== 'undefined' && _detEntry) {
    if (_detEntry.id === id || _detEntry.id === String(id)) return _detEntry;
  }
  // category pages
  if (typeof _catAll !== 'undefined') { const e = _catAll.find(x => x.id === id || x.id === String(id)); if (e) return e; }
  // profile
  if (typeof _pEntries !== 'undefined') { const e = _pEntries.find(x => x.id === id || x.id === String(id)); if (e) return e; }
  // completed.html
  if (typeof _allCompleted !== 'undefined') { const e = _allCompleted.find(x => x.id === id || x.id === String(id)); if (e) return e; }
  return null;
}