/* ══════════════════════════════════════════
   db.js — Async Supabase data layer
   All functions require `sb` from config.js
══════════════════════════════════════════ */

/* ── Fetch entries ── */
/* Friends / Private notes (069) aren't in entries.notes — fetch their text for the
   ones you're allowed to read (the database decides) and put it back on the rows.
   Rows need id + note_visibility. Mutates and returns rows. */
async function mssWithPrivateNotes(rows) {
  const need = (rows || []).filter(e => e && e.note_visibility && e.note_visibility !== 'anyone' && !e.notes);
  if (!need.length) return rows;
  try {
    const { data } = await sb.from('entry_private_notes').select('entry_id, notes').in('entry_id', need.map(e => e.id).slice(0, 1000));
    const by = Object.fromEntries((data || []).map(r => [r.entry_id, r.notes]));
    need.forEach(e => { if (by[e.id]) e.notes = by[e.id]; });
  } catch (err) { console.warn('Private notes:', err); }
  return rows;
}

async function getEntries(userId, filters = {}) {
  let q = sb.from('entries').select('*').eq('user_id', userId);
  if (filters.cat)    q = q.eq('cat', filters.cat);
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('getEntries:', error); return []; }
  return mssWithPrivateNotes(data || []);
}

async function getPublicEntries(userId) {
  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', userId)
    .order('final_score', { ascending: false });
  if (error) { console.error('getPublicEntries:', error); return []; }
  return mssWithPrivateNotes(data || []);
}

async function searchEntries(userId, query) {
  const q = query.toLowerCase().trim();
  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', userId);
  if (error) { console.error('searchEntries:', error); return []; }
  if (!data) return [];
  return data.filter(e => (e.title || '').toLowerCase().includes(q));
}

/* ── Upsert entry ── */
async function saveEntry(payload, userId, existingId) {
  const score = calcFinal(payload.ratings, payload.cat);
  const record = {
    title:          payload.title,
    cat:            payload.cat,
    status:         payload.status,
    year:           payload.year || null,
    description:    payload.description || null,
    genres:         payload.genres || [],
    poster_url:     payload.poster_url || null,
    season:         payload.season || null,
    episode:        payload.episode || null,
    total_seasons:  payload.total_seasons || null,
    total_eps:      payload.total_eps || null,
    watched:        payload.watched || 0,
    completed_date: payload.completed_date || null,
    notes:          payload.notes != null ? payload.notes : null,   // '' deletes a note; NULL leaves a Friends / Private one as it is (069)
    ratings:        payload.ratings || {},
    final_score:    score,
    runtime_h:      payload.runtime_h || null,
    runtime_m:      payload.runtime_m || null,
    tmdb_id:        payload.tmdb_id || null,
    tmdb_type:      payload.tmdb_type || null,
  };
  if (payload.note_visibility) record.note_visibility = payload.note_visibility;
  if (payload.visibility) record.visibility = payload.visibility;               // who can see this title (073)

  if (existingId) {
    const { data, error } = await sb.from('entries')
      .update(record)
      .eq('id', existingId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    mssResortLists(userId, existingId);   // its scores / dates may have moved it in a sorted list
    return _mssWatched(data);
  } else {
    const { data, error } = await sb.from('entries')
      .insert({ ...record, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return _mssWatched(data);
  }
}

// A title just saved as Watched → 'mss:watched' (nav.js asks "Does this count?" for
// "Let me choose" challenges — 061). Returns the entry so callers stay unchanged.
function _mssWatched(entry) {
  if (entry && entry.status === 'completed') document.dispatchEvent(new CustomEvent('mss:watched', { detail: entry }));
  return entry;
}

/* ── Delete entry ── */
async function deleteEntry(id, userId) {
  const { error } = await sb.from('entries').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

/* ── Update episode progress ── */
async function updateProgress(id, userId, updates) {
  const { data, error } = await sb.from('entries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  if (_MSS_ORDER_KEYS.some(k => k in updates)) mssResortLists(userId, id);
  return _mssWatched(data);
}

/* ── Lists that keep an order stay in it ──
   A list set to an order (sort_mode: Ratings Highest / Lowest, a specific rating, Date
   Watched, Release Date, A–Z) used to sort itself only when a title was added — change a
   score afterwards and it stayed where it was. Now, whenever one of your titles changes
   in a way an order can use, every list of yours holding it is put back in its order
   (MSSOrder, config.js) and saved, so it's right everywhere: the list page, popups,
   exports, other people looking at it. Titles added straight from Discover keep their
   places if this page can't look them up. Runs in the background; never blocks a save. */
const _MSS_ORDER_KEYS = ['ratings', 'final_score', 'completed_date', 'completed_at', 'status', 'title', 'year'];
async function mssResortLists(userId, entryId) {
  try {
    const { data: lists, error } = await sb.from('favorite_lists').select('id, items, sort_mode')
      .eq('user_id', userId).contains('items', [entryId]);
    if (error) throw error;
    const sorted = (lists || []).filter(l => l.sort_mode && l.sort_mode !== 'picked' && (l.items || []).length > 1);
    if (!sorted.length) return;
    const ids = [...new Set(sorted.flatMap(l => l.items).filter(id => !String(id).startsWith('tmdb:')))];
    const { data: ents } = await sb.from('entries').select('*').eq('user_id', userId).in('id', ids);
    const map = Object.fromEntries((ents || []).map(e => [e.id, e]));
    const discover = id => typeof MSSList !== 'undefined' && MSSList.isTmdbId(id) ? MSSList.tmdb(id) : null;
    for (const l of sorted) {
      if (!MSSOrder.reorder(l, l.sort_mode, id => map[id] || discover(id))) continue;
      const { error: e2 } = await sb.from('favorite_lists').update({ items: l.items }).eq('id', l.id).eq('user_id', userId);
      if (e2) throw e2;
      document.dispatchEvent(new CustomEvent('mss:list-resorted', { detail: { id: l.id, items: l.items } }));
    }
  } catch (err) { console.warn('Keeping lists in order:', err); }
}

/* ── Dropped (071): drop a title / pick it back up ──
   MSSDrop.drop(e, { onChange })   asks first ("Drop it?"; a movie can note where you
                                    stopped, optional), saves, Undo in the toast
   MSSDrop.pickUp(e, { onChange }) back to Watching, right where you stopped */
const MSSDrop = (() => {
  let ov = null;
  function dialog() {
    if (ov) return ov;
    ov = document.createElement('div');
    ov.className = 'confirm-overlay'; ov.id = 'mssDropOverlay';
    ov.innerHTML = `<div class="confirm-card drop-card" role="dialog" aria-modal="true" aria-labelledby="mssDropTitle" aria-describedby="mssDropMsg">
        <div class="confirm-icon" aria-hidden="true">${icon('drop', 36)}</div>
        <div class="confirm-title" id="mssDropTitle"></div>
        <div class="confirm-msg" id="mssDropMsg"></div>
        <fieldset class="drop-at" id="mssDropAt" hidden>
          <legend>Where did you stop? <small>optional</small></legend>
          <label><input type="number" id="mssDropH" min="0" max="9" inputmode="numeric" placeholder="0"><span>h</span></label>
          <label><input type="number" id="mssDropM" min="0" max="59" inputmode="numeric" placeholder="0"><span>m</span></label>
        </fieldset>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel" id="mssDropNo">Keep watching</button>
          <button type="button" class="confirm-ok is-safe" id="mssDropYes">Drop it</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    return ov;
  }
  // → { at: minutes | null } or null when you change your mind
  function ask(e) {
    return new Promise(resolve => {
      const el = dialog(), $ = id => el.querySelector('#' + id), movie = mssIsMovieEntry(e);
      const at = mssDroppedAt(e);
      $('mssDropTitle').textContent = `Drop “${e.title || 'this'}”?`;
      $('mssDropMsg').textContent = movie
        ? 'It moves to Dropped. You can still rate it — that score won’t count toward your averages.'
        : `It moves to Dropped${at ? `, at ${at}` : ''}. You can pick it back up any time — a score you give it won’t count toward your averages.`;
      $('mssDropAt').hidden = !movie;
      const m0 = Number(e.ratings?._dropped_at) || 0;
      $('mssDropH').value = m0 ? Math.floor(m0 / 60) : ''; $('mssDropM').value = m0 ? m0 % 60 : '';
      const done = v => { MSSDialog.close(el); el._mssClose = null; resolve(v); };
      $('mssDropNo').onclick = () => done(null);
      $('mssDropYes').onclick = () => {
        const h = Math.max(0, Math.min(9, parseInt($('mssDropH').value) || 0)), m = Math.max(0, Math.min(59, parseInt($('mssDropM').value) || 0));
        done({ at: movie && (h || m) ? h * 60 + m : null });
      };
      el._mssClose = () => done(null);
      if (!el._mssBound) { el._mssBound = true; el.addEventListener('click', ev => { if (ev.target === el) el._mssClose?.(); }); }
      MSSDialog.open(el, { focus: movie ? '#mssDropH' : '#mssDropNo' });
    });
  }
  async function save(e, status, ratings, o) {
    const uid = window._navUser?.id || (await getCurrentUser()).id;
    const prev = { status: e.status, ratings: e.ratings };
    await updateProgress(e.id, uid, { status, ratings });
    Object.assign(e, { status, ratings });
    o.onChange?.(e);
    return { uid, prev };
  }
  async function drop(e, o = {}) {
    const a = await ask(e);
    if (!a) return false;
    const ratings = { ...(e.ratings || {}) };
    if (a.at) ratings._dropped_at = a.at; else delete ratings._dropped_at;
    try {
      const { uid, prev } = await save(e, 'dropped', ratings, o);
      showUndoToast(`Dropped “${e.title}”`, async () => {
        await updateProgress(e.id, uid, prev);
        Object.assign(e, prev);
        o.onChange?.(e);
      });
      return true;
    } catch (err) { console.error('MSSDrop.drop:', err); showToast('Couldn’t drop it — try again.', 'err'); return false; }
  }
  async function pickUp(e, o = {}) {
    const ratings = { ...(e.ratings || {}) };
    delete ratings._dropped_at;
    try {
      await save(e, 'watching', ratings, o);
      showToast(`Picked “${e.title}” back up`);
      return true;
    } catch (err) { console.error('MSSDrop.pickUp:', err); showToast('Couldn’t update it — try again.', 'err'); return false; }
  }
  return { drop, pickUp };
})();

/* ── Lists (073): a title you can't see still shows — name + poster only ──
   For the list item ids missing from map after the normal entries read, ask
   get_hidden_list_items (only ids in a list you can see) and add stand-ins:
   no score, note or status, so the popups show just its Info. Returns how many. */
async function mssFillHiddenListItems(ids, map) {
  const missing = [...new Set(ids || [])].filter(id => id && !String(id).startsWith('tmdb:') && !map[id]);
  if (!missing.length) return 0;
  const { data } = await sb.rpc('get_hidden_list_items', { p_ids: missing }).then(r => r, () => ({ data: [] }));
  (data || []).forEach(r => {
    map[r.id] = { id: r.id, user_id: r.user_id, title: r.title, year: r.year, cat: r.cat, poster_url: r.poster_url,
      tmdb_id: r.tmdb_id, tmdb_type: r.tmdb_type, ratings: r.media_type ? { _media_type: r.media_type } : {},
      final_score: null, notes: null, status: null, genres: [], _hidden: true };
  });
  return (data || []).length;
}

/* ── Quick create (from modal) ── */
async function quickCreate(payload, userId) {
  // Check for duplicates two ways: by tmdb_id+type when we have one (more
  // reliable — catches remakes/retitles), AND by title as a fallback.
  // The title fallback used to only run when there was no tmdb_id at all,
  // which missed a real case: an existing entry added without a TMDB link
  // (tmdb_id is null) never matches a new tmdb-linked attempt on tmdb_id,
  // so it slipped through as "not a duplicate" and created a second copy.
  // Now the title check always runs if the tmdb_id check didn't find one —
  // but for a TMDB-linked title it only matches entries WITHOUT a TMDB link:
  // two different shows can share a name (Accused 2010 vs Accused 2023).
  let dupe = null;

  if (payload.tmdb_id && payload.tmdb_type) {
    const { data } = await sb.from('entries')
      .select('id,title,cat')
      .eq('user_id', userId)
      .eq('tmdb_id', payload.tmdb_id)
      .eq('tmdb_type', payload.tmdb_type)
      .limit(1);
    if (data && data.length) dupe = data[0];
  }

  if (!dupe && payload.title) {
    let qy = sb.from('entries')
      .select('id,title,cat')
      .eq('user_id', userId)
      .eq('title', payload.title);
    if (payload.tmdb_id) qy = qy.is('tmdb_id', null);
    const { data } = await qy.limit(1);
    if (data && data.length) dupe = data[0];
  }

  if (dupe) {
    const err = new Error('DUPLICATE:' + JSON.stringify(dupe));
    throw err;
  }

  const record = {
    user_id: userId,
    title:   payload.title,
    cat:     payload.cat,
    status:  payload.status,
    year:          payload.year          || null,
    description:   payload.description   || null,
    genres:        payload.genres        || [],
    poster_url:    payload.poster_url    || null,
    total_seasons: payload.total_seasons || null,
    total_eps:     payload.total_eps     || null,
    runtime_h:     payload.runtime_h     || null,
    runtime_m:     payload.runtime_m     || null,
    tmdb_id:       payload.tmdb_id       || null,
    tmdb_type:     payload.tmdb_type     || null,
    visibility:    payload.visibility    || 'anyone',   // who can see this title (073) — the Add to Library popup
    // Was hardcoded to {} — silently discarding anything the caller
    // passed here (completion year for ended shows, the detailed
    // per-season episode breakdown, the anime/cartoons Movie/TV
    // sub-type marker) regardless of whether TMDB actually had that
    // data. Every quick-created entry lost these fields permanently
    // unless the person happened to also edit it via the full detail
    // page afterward.
    ratings:       payload.ratings || {},
    watched:       0,
  };
  const { data, error } = await sb.from('entries').insert(record).select().single();
  if (error) throw error;
  _notifyQueuedFrom(data);
  return _mssWatched(data);
}

// If this title was added via "Add to Queue" on a friend's profile, tell
// that friend (see notify_friend_queued in 022 SQL). Fire-and-forget.
function _notifyQueuedFrom(entry) {
  try {
    const src = JSON.parse(sessionStorage.getItem('mssQueuedFrom') || 'null');
    if (!src || !entry) return;
    sessionStorage.removeItem('mssQueuedFrom');
    const fresh = Date.now() - src.t < 30 * 60 * 1000;
    const same = (src.title || '').trim().toLowerCase() === (entry.title || '').trim().toLowerCase();
    if (fresh && same) sb.rpc('notify_friend_queued', { p_owner: src.owner, p_entry: src.entry }).then(() => {}, () => {});
  } catch (_) {}
}

/* ── Poster upload (Cloudinary, signed by our Edge Function) ── */
async function uploadPoster(file, userId, entryId) {
  // Compress image before upload — converts PNG/large files to JPEG
  const compressed = await compressImage(file, 800, 0.85);
  // Picture check (config.js): refused pictures never upload, borderline ones go to the admins' review
  const verdict = await MSSImageCheck.allowed(compressed, 'poster');
  if (!verdict) throw Object.assign(new Error('PICTURE_REFUSED'), { refused: true });

  // Signed upload: our Edge Function (supabase/functions/cloudinary-sign) checks you're
  // signed in and signs this one upload with the Cloudinary secret, which never leaves
  // the server — so nobody can upload to the account without being a signed-in user.
  const { data: sig, error: sigErr } = await sb.functions.invoke('cloudinary-sign', { body: {} });
  if (sigErr || !sig?.signature) throw new Error('Couldn’t start the upload — try again.');
  const formData = new FormData();
  formData.append('file', compressed);
  ['api_key', 'timestamp', 'signature', 'folder', 'allowed_formats'].forEach(k => formData.append(k, sig[k]));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloud_name)}/image/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
    const url = data.secure_url.replace('/upload/', '/upload/w_500,q_auto,f_auto/');
    MSSImageCheck.review(verdict, 'poster', url);
    return url;
  } catch(e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Upload timed out. Check your connection.');
    throw e;
  }
}

// Compress any image to JPEG before upload — fixes large PNGs
function compressImage(file, maxWidth = 800, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

/* ── Profile helpers ── */
async function getProfileByUsername(username) {
  const { data, error } = await sb.from('profiles')
    .select('*')
    .eq('username', username)
    .single();
  if (error) return null;
  return data;
}

async function getProfile(userId) {
  const { data, error } = await sb.from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

async function updateProfile(userId, updates) {
  const { data, error } = await sb.from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function checkUsernameAvailable(username, currentUserId) {
  // maybeSingle() returns null (not an error) when 0 rows found
  const { data } = await sb.from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', currentUserId || '00000000-0000-0000-0000-000000000000')
    .maybeSingle();
  return !data; // true = available
}

async function isUsernameTaken(username) {
  const { data } = await sb.from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  return !!data;
}

/* ══════════════════════════════════════════
   FRIENDS
══════════════════════════════════════════ */

async function getFriendships(userId) {
  const { data: rows, error } = await sb.from('friendships')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) { console.error('getFriendships:', error); return []; }
  if (!rows?.length) return [];

  // Collect all friend user IDs
  const friendIds = rows.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
  const { data: profiles } = await sb.from('profiles').select('id,username,display_name,avatar_url,top_picks').in('id', friendIds);

  return rows.map(f => ({
    ...f,
    friendId:      f.requester_id === userId ? f.addressee_id : f.requester_id,
    iRequested:    f.requester_id === userId,
    friendProfile: profiles?.find(p => p.id === (f.requester_id === userId ? f.addressee_id : f.requester_id)) || null,
  }));
}

/* ── Following (083): you follow people; following each other = friends.
   A private account's followers are let in one by one (follow requests).
   Friendships (above) are kept in step by the database — read-only here. ── */
const _rpcOr = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
// → 'following' | 'requested'
function followUser(userId)               { return _rpcOr('follow_user', { p_user: userId }); }
function unfollowUser(userId)             { return _rpcOr('unfollow_user', { p_user: userId }); }
function respondFollowRequest(userId, ok) { return _rpcOr('respond_follow_request', { p_user: userId, p_accept: !!ok }); }
function removeFollower(userId)           { return _rpcOr('remove_follower', { p_user: userId }); }
function setAccountPrivate(on)            { return _rpcOr('set_account_private', { p_on: !!on }); }
// { i_follow, follows_me ('none'|'pending'|'accepted'), is_private, can_see, followers, following, friends, requests (yours) }
function getFollowState(userId)           { return _rpcOr('get_follow_state', { p_user: userId }); }
// kind: 'followers' | 'following' | 'friends' | 'requests' (yours) | 'sent' (yours)
async function getFollowList(userId, kind, offset = 0) { return (await _rpcOr('get_follow_list', { p_user: userId, p_kind: kind, p_offset: offset })) || []; }
// How you and someone stand, as one word — for buttons
function followRelation(st) {
  if (!st) return 'none';
  if (st.i_follow === 'accepted' && st.follows_me === 'accepted') return 'friends';
  if (st.i_follow === 'accepted') return 'following';
  if (st.i_follow === 'pending') return 'requested';
  if (st.follows_me === 'accepted') return 'follows_you';
  return 'none';
}

// Follow requests waiting for you (a private account) — the nav's badge
async function countPendingRequests(userId) {
  const { count } = await sb.from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('followee_id', userId)
    .eq('status', 'pending');
  return count || 0;
}

async function getFriendEntries(friendUserId) {
  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', friendUserId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getFriendEntries:', error); return []; }
  return data || [];
}

/* ── Comments ── */
async function getInboxComments(userId, limit = 10) {
  const { data: entries } = await sb
    .from('entries').select('id, title, cat, poster_url').eq('user_id', userId);
  if (!entries?.length) return [];
  const entryMap = Object.fromEntries(entries.map(e => [e.id, e]));
  const { data, error } = await sb
    .from('comments')
    .select('id, content, created_at, author_id, entry_id, profiles(username, avatar_url)')
    .in('entry_id', entries.map(e => e.id))
    .neq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getInboxComments:', error); return []; }
  return (data || []).map(c => ({ ...c, entry: entryMap[c.entry_id] }));
}

async function getComments(entryId) {
  const { data, error } = await sb
    .from('comments')
    .select('id, content, created_at, author_id, reply_to, profiles(username, avatar_url)')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getComments:', error); return []; }
  return data || [];
}

async function addComment(entryId, content, replyTo = null) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const record = { entry_id: entryId, author_id: user.id, content: content.trim() };
  if (replyTo) record.reply_to = replyTo;
  const { data, error } = await sb
    .from('comments')
    .insert(record)
    .select('id, content, created_at, author_id, reply_to, profiles(username, avatar_url)')
    .single();
  if (error) throw error;
  return data;
}

async function deleteComment(commentId) {
  const { error } = await sb.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

/* ══════════════════════════════════════════
   TMDB TITLE DETAIL PAGE — social stats + own-entry lookup
══════════════════════════════════════════ */

/* Site-wide counts of how many users have this exact TMDB title in their
   library, broken down by status. No user identity is fetched — just status
   values — since this is only ever shown as an aggregate count. */
async function getTmdbLibraryStats(tmdbId, tmdbType) {
  const { data, error } = await sb.from('entries')
    .select('status')
    .eq('tmdb_id', tmdbId)
    .eq('tmdb_type', tmdbType);
  if (error) { console.error('getTmdbLibraryStats:', error); return { total: 0, queue: 0, watching: 0, completed: 0 }; }
  const rows = data || [];
  const count = s => rows.filter(r => r.status === s).length;
  return {
    total:     rows.length,
    queue:     count('queue') + count('up_next'),
    watching:  count('watching') + count('paused'),
    completed: count('completed') + count('ongoing'),
  };
}

/* Site-wide average final_score for this TMDB title (the "MyScreenFolio rating") —
   only pulls the score column, no user identity. */
async function getTmdbAvgScore(tmdbId, tmdbType, title, year) {
  const { data, error } = await sb.rpc('get_tmdb_avg_score', { p_tmdb_id: tmdbId, p_tmdb_type: tmdbType, p_title: title || null, p_year: year ? Number(year) : null });
  if (error) { console.error('getTmdbAvgScore:', error); return { avg: null, count: 0 }; }
  const row = Array.isArray(data) ? data[0] : data;
  const count = row ? Number(row.rating_count) || 0 : 0;
  if (!count) return { avg: null, count: 0 };
  return { avg: Number(row.avg_score), count };
}

/* The signed-in user's own entry for this TMDB title, if they've already added it */
async function getOwnEntryByTmdb(userId, tmdbId, tmdbType, title) {
  // Uses limit(1) + take-the-first-row instead of .maybeSingle() —
  // maybeSingle() throws if more than one row matches, which silently
  // broke this check (returning null, i.e. "not owned") for any title
  // that already had duplicate entries from a past race-condition bug —
  // which then let the page think it was safe to add yet another one.
  // No TMDB id (an unlinked title) → go straight to the title match below
  if (tmdbId) {
    const { data, error } = await sb.from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('tmdb_id', tmdbId)
      .eq('tmdb_type', tmdbType)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) { console.error('getOwnEntryByTmdb:', error); return null; }
    if (data && data[0]) return data[0];
  }

  // Fall back to a title match — catches entries that were added without
  // a TMDB link (tmdb_id/tmdb_type are null there), which the check above
  // can never match against a real numeric tmdb_id. Without this, a title
  // already in the library under a manually-created entry would still show
  // "Add to Library" instead of "In your library".
  // With a TMDB id, only UNLINKED entries count: a linked entry with the same
  // name is a different title (Accused 2010 vs Accused 2023).
  if (title) {
    let qy = sb.from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('title', title);
    if (tmdbId) qy = qy.is('tmdb_id', null);
    const { data: byTitle, error: err2 } = await qy
      .order('created_at', { ascending: true })
      .limit(1);
    if (err2) { console.error('getOwnEntryByTmdb (title fallback):', err2); return null; }
    if (byTitle && byTitle[0]) return byTitle[0];
  }
  return null;
}

/* ── Recently Viewed (home page section) ──
   Capped to the 20 most recent per user — each row is tiny (id/title/
   poster URL/timestamp), so even at the cap this is a few KB total,
   not a real storage concern. Re-viewing a title removes its old row
   first so it moves to the top instead of appearing twice. ── */
async function recordRecentlyViewed(userId, tmdbId, tmdbType, title, posterUrl) {
  if (!userId || !tmdbId || !tmdbType) return;
  try {
    await sb.from('recently_viewed').delete()
      .eq('user_id', userId).eq('tmdb_id', tmdbId).eq('tmdb_type', tmdbType);
    await sb.from('recently_viewed').insert({
      user_id: userId, tmdb_id: tmdbId, tmdb_type: tmdbType,
      title: title || '', poster_url: posterUrl || null,
    });
    const { data: all } = await sb.from('recently_viewed')
      .select('id').eq('user_id', userId).order('viewed_at', { ascending: false });
    if (all && all.length > 20) {
      const staleIds = all.slice(20).map(r => r.id);
      await sb.from('recently_viewed').delete().in('id', staleIds);
    }
  } catch (e) { console.error('recordRecentlyViewed:', e); }
}

async function getRecentlyViewed(userId, limit = 12) {
  const { data, error } = await sb.from('recently_viewed')
    .select('*').eq('user_id', userId).order('viewed_at', { ascending: false }).limit(limit);
  if (error) { console.error('getRecentlyViewed:', error); return []; }
  return data || [];
}

/* ── Pinned friend (one at a time — setting a new pin naturally replaces
   any previous one, since it's a single column, not a list) ── */
async function setPinnedFriend(userId, friendId) {
  const { error } = await sb.from('profiles').update({ pinned_friend_id: friendId }).eq('id', userId);
  if (error) { console.error('setPinnedFriend:', error); throw error; }
}

/* ── Stats helper ── */
function computeStats(entries) {
  const completed = entries.filter(e => e.status === 'completed' || e.status === 'ongoing');
  const watching  = entries.filter(e => e.status === 'watching');
  const queue     = entries.filter(e => e.status === 'queue' || e.status === 'up_next');   // Up Next = planned, part of the watchlist
  const rated     = completed.filter(e => liveScore(e) != null);
  const avgScore  = rated.length
    ? (rated.reduce((s, e) => s + Number(liveScore(e)), 0) / rated.length).toFixed(2)
    : null;
  const totalEps  = entries
    .filter(e => e.cat !== 'movies' && e.status !== 'queue' && (e.ratings?._type || 'show') !== 'movie')
    .reduce((sum, e) => {
      if (e.status === 'completed' || e.status === 'ongoing') return sum + (Number(e.total_eps) || Number(e.watched) || 0);
      return sum + (Number(e.watched) || 0);
    }, 0);
  const movieMins = entries
    .filter(e => (e.status === 'completed' || e.status === 'ongoing') && (e.cat === 'movies' || (e.ratings?._type === 'movie')))
    .reduce((sum, e) => sum + (Number(e.runtime_h)||0)*60 + (Number(e.runtime_m)||0), 0);
  const wtH = Math.floor(movieMins / 60);
  const wtM = movieMins % 60;
  const watchTime = movieMins ? (wtH ? `${wtH}h ${wtM}m` : `${wtM}m`) : null;
  const dropped = entries.filter(e => e.status === 'dropped').length;
  return { total: entries.length, completed: completed.length, watching: watching.length, queue: queue.length, dropped, avgScore, totalEps: totalEps || 0, watchTime, movieMins };
}
