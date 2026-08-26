/* ══════════════════════════════════════════
   db.js — Async Supabase data layer
   All functions require `sb` from config.js
══════════════════════════════════════════ */

/* ── Fetch entries ── */
async function getEntries(userId, filters = {}) {
  let q = sb.from('entries').select('*').eq('user_id', userId);
  if (filters.cat)    q = q.eq('cat', filters.cat);
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('getEntries:', error); return []; }
  return data || [];
}

async function getPublicEntries(userId) {
  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', userId)
    .order('final_score', { ascending: false });
  if (error) { console.error('getPublicEntries:', error); return []; }
  return data || [];
}

async function getEntry(id) {
  const { data, error } = await sb.from('entries').select('*').eq('id', id).single();
  if (error) return null;
  return data;
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
    notes:          payload.notes || null,
    ratings:        payload.ratings || {},
    final_score:    score,
    runtime_h:      payload.runtime_h || null,
    runtime_m:      payload.runtime_m || null,
    tmdb_id:        payload.tmdb_id || null,
    tmdb_type:      payload.tmdb_type || null,
  };

  if (existingId) {
    const { data, error } = await sb.from('entries')
      .update(record)
      .eq('id', existingId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await sb.from('entries')
      .insert({ ...record, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
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
  return data;
}

/* ── Quick create (from modal) ── */
async function quickCreate(payload, userId) {
  // Check for duplicates two ways: by tmdb_id+type when we have one (more
  // reliable — catches remakes/retitles), AND by title as a fallback.
  // The title fallback used to only run when there was no tmdb_id at all,
  // which missed a real case: an existing entry added without a TMDB link
  // (tmdb_id is null) never matches a new tmdb-linked attempt on tmdb_id,
  // so it slipped through as "not a duplicate" and created a second copy.
  // Now the title check always runs if the tmdb_id check didn't find one.
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
    const { data } = await sb.from('entries')
      .select('id,title,cat')
      .eq('user_id', userId)
      .eq('title', payload.title)
      .limit(1);
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
    ratings:       {},
    watched:       0,
  };
  const { data, error } = await sb.from('entries').insert(record).select().single();
  if (error) throw error;
  return data;
}

/* ── Poster upload to Supabase Storage ── */
async function uploadPoster(file, userId, entryId) {
  // Compress image before upload — converts PNG/large files to JPEG
  const compressed = await compressImage(file, 800, 0.85);

  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('upload_preset', 'MyScreenScore');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://api.cloudinary.com/v1_1/dorhmpv3j/image/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url.replace('/upload/', '/upload/w_500,q_auto,f_auto/');
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
  const { data: profiles } = await sb.from('profiles').select('id,username,display_name,avatar_url').in('id', friendIds);

  return rows.map(f => ({
    ...f,
    friendId:      f.requester_id === userId ? f.addressee_id : f.requester_id,
    iRequested:    f.requester_id === userId,
    friendProfile: profiles?.find(p => p.id === (f.requester_id === userId ? f.addressee_id : f.requester_id)) || null,
  }));
}

async function getPendingIncoming(userId) {
  const all = await getFriendships(userId);
  return all.filter(f => f.status === 'pending' && !f.iRequested);
}

async function sendFriendRequest(myUserId, targetUsername) {
  const clean = targetUsername.toLowerCase().trim();
  if (!clean || clean.length < 3) throw new Error('Please enter a valid username.');

  // Resolve username → user id (uses maybeSingle to avoid error on 0 rows)
  const { data: profile, error: pe } = await sb.from('profiles').select('id').eq('username', clean).maybeSingle();
  if (pe || !profile) throw new Error(`@${clean} not found — check the username and try again`);
  if (profile.id === myUserId) throw new Error("You can't add yourself");

  // Check both directions separately (more reliable than complex .or() syntax)
  const [{ data: f1 }, { data: f2 }] = await Promise.all([
    sb.from('friendships').select('id,status').eq('requester_id', myUserId).eq('addressee_id', profile.id).maybeSingle(),
    sb.from('friendships').select('id,status').eq('requester_id', profile.id).eq('addressee_id', myUserId).maybeSingle(),
  ]);
  const existing = f1 || f2;

  if (existing) {
    if (existing.status === 'accepted') throw new Error('You are already friends');
    if (existing.status === 'pending')  throw new Error('A request is already pending');
    // 'declined' — clean up old record so a fresh request can be sent
    await sb.from('friendships').delete().eq('id', existing.id);
  }

  const { error } = await sb.from('friendships').insert({ requester_id: myUserId, addressee_id: profile.id });
  if (error) throw error;
}

async function respondFriendRequest(friendshipId, accept) {
  const { error } = await sb.from('friendships')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', friendshipId);
  if (error) throw error;
}

async function removeFriendship(friendshipId) {
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

async function countPendingRequests(userId) {
  const { count } = await sb.from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('addressee_id', userId)
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
    queue:     count('queue'),
    watching:  count('watching') + count('paused'),
    completed: count('completed') + count('ongoing'),
  };
}

/* Site-wide average final_score for this TMDB title (the "MyScreenScore rating") —
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
  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('tmdb_type', tmdbType)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) { console.error('getOwnEntryByTmdb:', error); return null; }
  if (data && data[0]) return data[0];

  // Fall back to a title match — catches entries that were added without
  // a TMDB link (tmdb_id/tmdb_type are null there), which the check above
  // can never match against a real numeric tmdb_id. Without this, a title
  // already in the library under a manually-created entry would still show
  // "Add to Library" instead of "In your library".
  if (title) {
    const { data: byTitle, error: err2 } = await sb.from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('title', title)
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
  const queue     = entries.filter(e => e.status === 'queue');
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
  return { total: entries.length, completed: completed.length, watching: watching.length, queue: queue.length, avgScore, totalEps: totalEps || 0, watchTime, movieMins };
}