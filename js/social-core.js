/* ══════════════════════════════════════════
   social-core.js — what the Social pages share: who your friends are, their
   titles and lists (loadFriends), taste match (_cmpLoad / _cmpMatch), and the
   Blend (_blendFor), which Movie Night uses too.
   Each page defines its own _frRender(), which loadFriends() calls when ready.
══════════════════════════════════════════ */
let _fUser = null;
let _fProfile = null;
let _friendships = [];

let _frTab = 'friends';
let _frAccepted = [], _frIncoming = [], _frOutgoing = [], _frBack = [], _frFollowState = null;   // requests to you · your sent requests · followers to follow back · your counts (083)
let _frEntries = [], _frLists = [], _frEpRatings = [], _frProfiles = {}, _frStats = {}, _frLoaded = false;
let _frAuthKnown = false;          // until sign-in is checked, show a spinner (never the signed-out view)
window._frEntryMap = {};


/* ── Small helpers ── */
const _frName = uid => { const p = _frProfiles[uid] || {}; return p.display_name || p.username || 'Friend'; };
function _frAvHTML(p, size = 36) {
  const u = safeURL(p?.avatar_url);
  return `<span class="fr-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : escHTML((p?.username || '?')[0].toUpperCase())}</span>`;
}
function _frPosterHTML(e, cls = 'fr-poster') {
  const u = safeURL(e?.poster_url);
  return `<div class="${cls}">${u ? `<img src="${u}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${escHTML((e.title || '?')[0])}">` : `<span class="fr-poster-letter">${escHTML((e?.title || '?')[0].toUpperCase())}</span>`}</div>`;
}
function _frTypeBadge(e) {
  const movie = e.cat === 'movies' || e.ratings?._media_type === 'movie' || e.tmdb_type === 'movie';
  const label = CAT_META[e.cat]?.singular || (movie ? 'Movie' : 'TV Show');
  return `<span class="${movie ? 'type-label' : 'type-label type-label-tv'}">${escHTML(label)}</span>`;
}
const _frScore = e => mssCountedScore(e) != null ? Number(mssCountedScore(e)) : null;   // a dropped title's score doesn't count (071)
const _frDate = x => x ? new Date(String(x).length <= 10 ? x + 'T12:00:00' : x) : null;
// A friend's title: Info, Ratings and Note in one popup (MSSViews, info-popup.js).
// Activity opens on Info (a "wrote a note" item opens on their note);
// the Notes tab opens on the note.
function _frViews(e, start) {
  const p = _frProfiles[e.user_id] || {};
  MSSViews.open(e, { start, profile: p });
}
function _frOpenEvent(id, type) {
  const e = window._frEntryMap[id]; if (!e) return;
  _frViews(e, type === 'note' ? 'note' : 'info');
}
const _frListItem = id => window._frEntryMap[id] || MSSList.tmdb(id);
function _frOpenList(id) {
  const l = _frLists.find(x => x.id === id);
  if (l) MSSList.open(l, { resolve: _frListItem, owner: _frProfiles[l.user_id] || {}, social: true });
}
// Loading skeletons: these stay readable while the rest is masked
const _frSkelKeep = h => h.replace(/class="(fr-toolbar-title|sort-bar[^"]*|fm-btn[^"]*|pn-toggle-btn[^"]*|fr-people-title|ns-back)"/g, 'class="$1" data-skel-keep');
function _frFriendOptions() { return [['', 'Everyone'], ..._frAccepted.map(f => [f.friendId, _frName(f.friendId)])]; }
const _FR_CAT_OPTS = [['', 'All Types'], ['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];

/* ── Loading ── */
async function loadFriends() {
  // Friends = people you follow who follow you back (083) — the friendships table keeps them;
  // follow requests (yours waiting / sent), people who follow you that you could follow back, your counts
  let followers;
  [_friendships, _fProfile, _frIncoming, _frOutgoing, followers, _frFollowState] = await Promise.all([getFriendships(_fUser.id), getProfile(_fUser.id),
    getFollowList(_fUser.id, 'requests').catch(() => []), getFollowList(_fUser.id, 'sent').catch(() => []),
    getFollowList(_fUser.id, 'followers').catch(() => []), getFollowState(_fUser.id).catch(() => null)]);
  _frAccepted = _friendships.filter(f => f.status === 'accepted');
  _frBack = followers.filter(p => p.i_follow === 'none').slice(0, 6);
  _frProfiles = Object.fromEntries(_frAccepted.map(f => [f.friendId, f.friendProfile || {}]));
  const ids = _frAccepted.map(f => f.friendId);
  if (ids.length) {
    const [ents, lists, eps] = await Promise.all([
      sb.from('entries').select('*').in('user_id', ids).order('updated_at', { ascending: false }).limit(3000).then(r => mssWithPrivateNotes(r.data || []), () => []),
      sb.from('favorite_lists').select('*').in('user_id', ids).eq('cat', 'custom').order('created_at', { ascending: false }).then(r => r.data || [], () => []),
      sb.from('episode_ratings').select('id,user_id,entry_id,season_number,episode_number,score,updated_at').in('user_id', ids).order('updated_at', { ascending: false }).limit(150).then(r => r.data || [], () => []),
    ]);
    _frEntries = ents; _frLists = lists; _frEpRatings = eps;
  } else { _frEntries = []; _frLists = []; _frEpRatings = []; }
  _frEntries.forEach(e => { window._frEntryMap[e.id] = e; });
  // Top Favorites older than the recent entries loaded above — fetch those too
  const favIds = _frAccepted.flatMap(f => Array.isArray(f.friendProfile?.top_picks) ? f.friendProfile.top_picks.slice(0, 5) : []);
  const missing = [...new Set(favIds)].filter(id => !window._frEntryMap[id]);
  const extraFavs = missing.length ? await sb.from('entries').select('*').in('id', missing).then(r => r.data || [], () => []) : [];
  const favMap = Object.fromEntries(extraFavs.map(e => [e.id, e]));
  _frStats = {};
  _frAccepted.forEach(f => {
    const mine = _frEntries.filter(e => e.user_id === f.friendId);
    _frStats[f.friendId] = { ...computeStats(mine), recent: mine[0]?.updated_at || null,
      watchingNow: mine.find(e => e.status === 'watching') || null,
      posters: _frCoverPosters(f.friendProfile || {}, mine, favMap),
      latest: null };
  });
  // Each friend's most recent activity (shown when they aren't watching anything)
  // (what they watched counts first; a note only if that's all they've done)
  const events = _frEvents().sort((a, b) => (a._ev === 'note') - (b._ev === 'note') || b._at - a._at);
  // (title events only — a new list or an episode rating has no single title to show here)
  events.forEach(x => {
    const st = _frStats[x.user_id], e = window._frEntryMap[x.id.split(':')[0]];
    if (st && !st.latest && e) st.latest = { e, type: x._ev };
  });
  _frLoaded = true;
  const sub = document.getElementById('friendsPageSub');
  if (sub) sub.textContent = `${_frAccepted.length} friend${_frAccepted.length === 1 ? '' : 's'}${_frIncoming.length ? ` · ${_frIncoming.length} follow request${_frIncoming.length === 1 ? '' : 's'}` : ''}`;
  ['frFriends', 'frActivity', 'frShared'].forEach(k => SF.invalidate && SF.invalidate(k));
  Object.keys(_frMatchMemo).forEach(k => delete _frMatchMemo[k]);
  _frRender();
  // Your own titles, quietly — taste match % on the friend cards (and ready for Compare)
  if (_frAccepted.length) _cmpLoad().then(() => { SF.invalidate && SF.invalidate('frFriends'); if (_frTab === 'friends') _frRender(); }).catch(() => {});
  if (_frTab === 'night') MSSNight.redraw();       // watchlist suggestions need your friends' titles
}

function _frToolbar(label, count, scope, noun = 'items') {
  const el = document.getElementById('frToolbar');
  el.innerHTML = _frToolbarHTML(label, count, scope, noun);
  el.style.display = '';
}
const _frToolbarHTML = (label, count, scope, noun = 'items') =>
  `<div class="fr-toolbar-label"><div class="fr-toolbar-title">${escHTML(label)}</div>${count != null ? `<div class="fr-toolbar-count"><b>${count}</b> ${noun}</div>` : ''}</div>${scope ? SF.bar(scope, 'all') : ''}`;

// Before a page draws: not signed in yet, a guest, still loading, no friends → draws that instead (true)
function _frGateAuth() {
  const c = document.getElementById('frContent'), tb = document.getElementById('frToolbar');
  if (!_frAuthKnown) { tb.style.display = 'none'; c.innerHTML = `<div class="page-loading" data-skel="fr-page"></div>`; return true; }
  if (!_fUser) { tb.style.display = 'none'; c.innerHTML = _frGuestHTML(); return true; }
  return false;
}
function _frGateData() {
  const c = document.getElementById('frContent'), tb = document.getElementById('frToolbar');
  if (!_frLoaded) { tb.style.display = 'none'; c.innerHTML = `<div class="page-loading" data-skel="fr-page"></div>`; return true; }
  if (_frTab !== 'friends' && !_frAccepted.length) {
    tb.style.display = 'none';
    c.innerHTML = _frEmptyHTML('users', 'Watching solo for now', 'Everything’s better with someone to argue about the ending with. Find people on the Friends page and follow them — once you follow each other, their activity shows up here.');
    return true;
  }
  return false;
}
function _frEmptyHTML(ic, title, text) {
  const ART = { users: 'friends', activity: 'friends', layers: 'lists', edit: 'notes', compare: 'compare', search: 'search', shuffle: 'blend' };
  return mssEmpty({ art: ART[ic] || 'friends', title, text });
}
function _frGuestHTML() {
  return mssGuestEmpty(location.pathname.split('/').pop().replace('.html', '') || 'friends');
}

// Friend card cover: their Top Favorites (profile dashboard), then — if they
// haven't picked 5 — their most recent titles to fill the rest
function _frCoverPosters(p, mine, extra = {}) {
  const withPoster = e => e && safeURL(e.poster_url);
  const favs = (Array.isArray(p.top_picks) ? p.top_picks : []).map(id => mine.find(e => e.id === id) || extra[id]).filter(withPoster);
  const recent = mine.filter(e => withPoster(e) && !favs.includes(e));   // mine is newest-first
  return favs.concat(recent).slice(0, 5);
}

const _FR_ACT = {
  finished:  { verb: 'watched',                  color: '#1e5c26', ic: 'check',   label: 'Watched' },
  logged:    { verb: 'logged',                   color: '#55705a', ic: 'notebook', label: 'Logged' },
  caught_up: { verb: 'is caught up on',          color: '#8a5a1c', ic: 'clock',   label: 'Caught Up' },
  started:   { verb: 'started watching',         color: '#2f7a3a', ic: 'play',    label: 'Started' },
  episode:   { verb: 'watched',                  color: '#2a6f6a', ic: 'tv',      label: 'Episode' },
  up_next:   { verb: 'lined up',                 color: '#264e78', ic: 'skipForward', label: 'Up Next' },
  watchlist: { verb: 'added to their watchlist', color: '#6b6b6b', ic: 'bookmark', label: 'Watchlist' },
  note:      { verb: 'wrote a note on',          color: '#7a3e78', ic: 'notebook', label: 'Note' },
  list:      { verb: 'made a list',              color: '#3d5a80', ic: 'layers',  label: 'New List' },
  rated_ep:  { verb: 'rated',                    color: '#1f4d2b', ic: 'ratingStar', label: 'Episode Rating' },
  dropped:   { verb: 'dropped',                  color: '#6e5a55', ic: 'drop',    label: 'Dropped' },   // 071
};
// A show they're part-way through → its last watched episode, else null
function _frEpOf(e) {
  const movie = e.cat === 'movies' || e.tmdb_type === 'movie' || e.ratings?._media_type === 'movie';
  return !movie && Number(e.episode) > 0 ? { s: Number(e.season) || 1, e: Number(e.episode) } : null;
}
function _frEvents() {
  const ev = [];
  _frEntries.forEach(e => {
    // An import isn't news (105): only what they do with those titles afterwards shows here
    const imported = e.ratings?._imported ? _frDate(e.created_at) : null;
    const push = (type, at) => { const d = _frDate(at); if (imported && d - imported < 300000) return; if (d && !isNaN(d)) ev.push({ ...e, _ev: type, _at: d, id: e.id + ':' + type }); };
    // Watched recently → "watched"; added with a finish date a month+ before
    // they logged it → "logged" (catching up their history)
    if (e.status === 'completed' && e.completed_date) {
      const done = _frDate(e.completed_date), added = _frDate(e.created_at);
      const old = done && added && (added - done) >= 30 * 86400000;
      push(old ? 'logged' : 'finished', old ? e.created_at : (e.completed_at || e.completed_date));   // completed_at: exact time it was marked watched
    }
    // progress_at (047): when they last actually moved on it — rating edits and
    // TMDB refreshes don't count. Mid-show → "watched S2 · E5"; else "started watching"
    else if (e.status === 'ongoing') push('caught_up', e.progress_at || e.updated_at);
    else if (e.status === 'watching') push(_frEpOf(e) ? 'episode' : 'started', e.progress_at || e.updated_at);
    else if (e.status === 'up_next') push('up_next', e.progress_at || e.updated_at);
    else if (e.status === 'queue') push('watchlist', e.created_at);
    else if (e.status === 'dropped') push('dropped', e.progress_at || e.updated_at);   // "@sam dropped Lost at S3 · E2"
    if (e.notes && e.notes.trim()) push('note', e.updated_at);
  });
  // "made a list"
  _frLists.forEach(l => { const d = _frDate(l.created_at); if (d && !isNaN(d)) ev.push({ id: 'list:' + l.id, user_id: l.user_id, title: l.title, _list: l, _ev: 'list', _at: d }); });
  // "rated S2 · E5" / "rated Season 2" (episode ratings)
  _frEpRatings.forEach(r => {
    const e = window._frEntryMap[r.entry_id], d = new Date(r.updated_at);
    if (e && !isNaN(d)) ev.push({ ...e, id: 'ep:' + r.id, user_id: r.user_id, _epr: r, _ev: 'rated_ep', _at: d });
  });
  return ev;
}

let _cmpMine = null, _cmpMyLists = [], _cmpProfiles = {}, _cmpWith = [], _cmpKey = null, _cmpQuery = '';
const _cmpKeyOf = e => e.tmdb_id && e.tmdb_type ? `t:${e.tmdb_type}:${e.tmdb_id}` : `n:${e.cat}:${(e.title || '').trim().toLowerCase()}`;

async function _cmpLoad() {
  if (_cmpMine) return;
  const [mine, myLists, profs] = await Promise.all([
    getEntries(_fUser.id).catch(() => []),
    sb.from('favorite_lists').select('id, title, items').eq('user_id', _fUser.id).eq('cat', 'custom').then(r => r.data || [], () => []),
    sb.from('profiles').select('id, username, display_name, avatar_url, top_picks, recommended, fav_tv, fav_movies, fav_anime, fav_cartoons')
      .in('id', [_fUser.id, ..._frAccepted.map(f => f.friendId)]).then(r => r.data || [], () => []),
  ]);
  _cmpMine = mine || []; _cmpMyLists = myLists;
  _cmpProfiles = Object.fromEntries(profs.map(p => [p.id, p]));
}

const _frMatchMemo = {};
function _cmpMatch(uid) {
  if (_frMatchMemo[uid]) return _frMatchMemo[uid];
  const t = mssTasteMatch(_cmpMine, _frEntries.filter(e => e.user_id === uid));
  const rated = t.rated, avgDiff = t.avgDiff, pct = t.pct, pairs = t.pairs;
  const loved = rated.slice().sort((x, y) => (y.a + y.b) - (x.a + x.b))[0];
  const split = rated.slice().sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
  return (_frMatchMemo[uid] = { shared: pairs.length, rated: rated.length, pct, avgDiff, loved, split: split && Math.abs(split.a - split.b) >= 1 ? split : null });
}
// A friend's match % once your own titles are in (null: not enough rated by both yet)
const _frMatchPct = uid => _cmpMine ? _cmpMatch(uid).pct : null;

/* ══ BLEND ══
   Pick one friend — or a group (up to 8) — and get one list made for all of you:
     • You all want to watch it (on 2+ of your watchlists)
     • Loved by a friend, new to you   • You loved it, new to them
     • Picked for all of you — TMDB recommendations from titles 2+ of you rated highly
   Each title says why it's there. Then: Save as a list / send it, "Surprise us"
   (a random pick → straight into a Movie Night), or "Start a Movie Night" with the
   top titles up for a vote. Movie Night uses _blendFor() for its suggestions too. */
let _blendGroup = [];
const _blendTmdb = {};   // group key → TMDB picks (or a promise while loading)
const _blKey = e => e.tmdb_id && e.tmdb_type ? `t:${e.tmdb_type}:${e.tmdb_id}` : `n:${e.cat}:${(e.title || '').trim().toLowerCase()}`;
const _blWant = e => e.status === 'queue' || e.status === 'up_next';
const _blDone = e => e.status === 'completed' || e.status === 'ongoing';
const _blNames = uids => { const n = uids.map(u => _frName(u)); return n.length <= 2 ? n.join(' & ') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`; };
// The Blend for you + these friends (friend ids): sections + seeds for TMDB picks
function _blendFor(uids) {
  uids = uids.filter(u => _frProfiles[u]);
  const me = _fUser.id, mine = _cmpMine || [];
  const libs = { [me]: mine };
  uids.forEach(u => { libs[u] = _frEntries.filter(e => e.user_id === u); });
  const idx = {};   // key → { e, by: {uid: entry} }
  Object.entries(libs).forEach(([u, list]) => list.forEach(e => { const k = _blKey(e); (idx[k] ||= { e, by: {} }).by[u] = e; if (u === me) idx[k].e = e; }));
  const people = [me, ...uids], all = Object.values(idx);
  const friendsWith = (x, test) => uids.filter(u => x.by[u] && test(x.by[u]));
  // on 2+ watchlists (you and at least one friend, or 2+ friends)
  const want = all.map(x => ({ x, who: people.filter(u => x.by[u] && _blWant(x.by[u])) })).filter(y => y.who.length >= 2)
    .sort((a, b) => b.who.length - a.who.length).slice(0, 24)
    .map(({ x, who }) => ({ e: x.e, why: who.length === people.length ? (people.length === 2 ? 'On both your watchlists' : 'On everyone’s watchlist') : `On ${who.length} of your watchlists` }));
  // loved by a friend (8+), not in your library
  const theyLoved = all.filter(x => !x.by[me]).map(x => ({ x, who: friendsWith(x, e => _blDone(e) && _frScore(e) >= 8) })).filter(y => y.who.length)
    .sort((a, b) => b.who.length - a.who.length || Math.max(...b.who.map(u => _frScore(b.x.by[u]))) - Math.max(...a.who.map(u => _frScore(a.x.by[u]))))
    .slice(0, 24).map(({ x, who }) => ({ e: x.by[who[0]], why: who.length === 1 ? `${escHTML(_frName(who[0]))} rated it <b>${_frScore(x.by[who[0]]).toFixed(1)}</b>` : `Loved by ${escHTML(_blNames(who))}` }));
  // you loved it (8+), and it's new to every friend in the group
  const youLoved = all.filter(x => x.by[me] && _blDone(x.by[me]) && _frScore(x.by[me]) >= 8 && uids.every(u => !x.by[u]))
    .sort((a, b) => _frScore(b.by[me]) - _frScore(a.by[me])).slice(0, 24)
    .map(x => ({ e: x.by[me], why: `You rated it <b>${_frScore(x.by[me]).toFixed(1)}</b>` }));
  // seeds: rated 7.5+ by 2+ of you (best first), else each person's favourite
  const shared = all.filter(x => x.e.tmdb_id).map(x => ({ x, r: people.filter(u => x.by[u] && _frScore(x.by[u]) >= 7.5) })).filter(y => y.r.length >= 2)
    .sort((a, b) => b.r.length - a.r.length).map(y => y.x.e);
  const top = list => list.filter(e => e.tmdb_id && _blDone(e)).sort((a, b) => (_frScore(b) ?? 0) - (_frScore(a) ?? 0))[0];
  return { uids, want, theyLoved, youLoved, have: new Set(Object.keys(idx)),
    seeds: shared.length ? shared.slice(0, 4) : people.map(u => top(libs[u])).filter(Boolean).slice(0, 4) };
}
async function _blendLoadPicks(d) {
  const key = d.uids.slice().sort().join(',');
  if (_blendTmdb[key]) return _blendTmdb[key];
  _blendTmdb[key] = (async () => {
    const tally = {};
    await Promise.all(d.seeds.map(async e => {
      try {
        const res = await tmdbFetch(`${TMDB_BASE}/${e.tmdb_type}/${e.tmdb_id}/recommendations?language=en-US`);
        const j = res.ok ? await res.json() : null;
        (j?.results || []).slice(0, 20).forEach((r, i) => {
          const t = r.media_type === 'tv' || (!r.media_type && e.tmdb_type === 'tv') ? 'tv' : 'movie';
          const k = `t:${t}:${r.id}`;
          if (d.have.has(k) || (r.genre_ids || []).includes(16) && !(e.cat === 'anime' || e.cat === 'cartoons')) return;
          const x = (tally[k] ||= { r, t, n: 0, rank: 0, from: e.title });
          x.n += 1; x.rank += 20 - i;
        });
      } catch {}
    }));
    return Object.values(tally).sort((a, b) => b.n - a.n || b.rank - a.rank || (b.r.vote_average || 0) - (a.r.vote_average || 0)).slice(0, 18)
      .map(x => ({ ..._discLite(x.r, x.t), _why: x.n > 1 ? `Fits ${x.n} titles you love` : `Because you liked ${x.from}` }));
  })().then(v => (_blendTmdb[key] = v), () => (_blendTmdb[key] = []));
  return _blendTmdb[key];
}
// a TMDB result → what MSSInfo / MSSCard need
const _discLite = (r, t) => ({ id: r.id, tmdb_id: r.id, media_type: t, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4),
  poster_url: r.poster_path ? TMDB_FULL + r.poster_path : null, score: r.vote_average });
// any Blend item → a Movie Night option (TMDB id, type, title, poster path, year)
const _blOption = e => e && e.tmdb_id ? { tmdb_id: Number(e.tmdb_id), tmdb_type: e.media_type || e.tmdb_type, title: e.title,
  poster_path: (e.poster_url || '').match(/\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/)?.[0] || null, year: String(e.year || '').slice(0, 4) } : null;

function viewFriend(userId, username) {
  sessionStorage.setItem('viewProfileId', userId);
  sessionStorage.setItem('viewProfileUsername', username);
  window.location.href = 'profile-view.html';
}
