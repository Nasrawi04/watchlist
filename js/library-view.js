/* ═══════════════════════════════════════════════════════════════
   library-view.js — THE Library (Library redesign, Nov 2026)

   One renderer for library.html, the four category pages (movies, tv-shows, anime,
   cartoons .html) and the Library tab on profile.html / profile-view.html (read-only).

     Header ─ search (the page's own) · Pick for me (green) · + Add (category pages)
     At a glance ─ the page's stats (Library = everything, a category page = that category)
     Status tabs ─ Watching · Watched · Watchlist · Dropped, one at a time (tablist)
     Toolbar ─ "Watching · 5 titles · sorted by …" · Sort · Filter · Grid / List
     The open status ─ cards, 20 at a time with "Load 20 more"

   Status groups (each title once): Watching = watching + up_next + paused + To Be Continued shows with
   a new episode out · Watched = completed + To Be Continued (waiting) · Watchlist = queue · Dropped = dropped.
   To Be Continued (owner, 13 Nov 2026): a show you're caught up on sits in Watched with its TBC tag; once an
   episode past your progress has aired (mssNewEpisodes / MSSSchedule.newOut) it moves to Watching as Up next
   with Start. Nothing is written for that move — Start does it (MSSProgress). Caught up again → back to Watched.
   Inside Watching: the title you progressed last (updated_at) is the main card, then Watching, Up next, Taking a break.

   Set before this file loads (defaults = your own Library page):
     window.LIB_SCOPE    = 'lib' | 'cat' | 'prof' | 'pv'   Sort & Filter scope ('cat' = a category page)
     window.LIB_CAT      = 'tv' | 'movies' | 'anime' | 'cartoons'   the category page's category
     window.LIB_READONLY = true                    someone else's library
     window.LIB_ENTRIES  = () => entries           (default: _pEntries)
     window.LIB_PROFILE  = () => profile           whose library (read-only)
   The page provides #libraryContent / #libraryLoading; library.html and the category pages also
   #libHeadTools, #libKicker and #libPageSub in their header, and call _libInitPage().
   _libOpen(id) opens a title in its panel / page (MSSViews) — the pages use it too.
═══════════════════════════════════════════════════════════════ */

var LIB_SCOPE    = window.LIB_SCOPE || 'lib';
var LIB_READONLY = !!window.LIB_READONLY;
var LIB_ENTRIES  = window.LIB_ENTRIES || function(){ return _pEntries; };
var LIB_CAT      = window.LIB_CAT || '';
var LIB_OWN_PAGE = LIB_SCOPE === 'lib' || LIB_SCOPE === 'cat';     // the five pages: header tools, At a glance, Pick for me
var LIB_CTRL     = LIB_OWN_PAGE && !LIB_READONLY;                    // card buttons (progress, Start, Resume, ⋯)
var LIB_TYPES    = !LIB_CAT;                                         // the Type filter: the Library and both profile tabs (not a category page)
var LIB_FULL     = LIB_OWN_PAGE;                                     // + permanent buttons on Watchlist / Dropped cards (Library and category pages)
var LIB_GUEST    = false;                                           // a guest: the example library (js/home-guest.js), read-only
var LIB_CAT_META = { tv:{ label:'TV Shows', one:'TV show', add:'+ Add TV Show' }, movies:{ label:'Movies', one:'movie', add:'+ Add Movie' },
  anime:{ label:'Anime', one:'anime', add:'+ Add Anime' }, cartoons:{ label:'Cartoons', one:'cartoon', add:'+ Add Cartoon' } };
var _LIB_DOTS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>';
var _libEsc = function(s){ return escHTML(s == null ? '' : String(s)); };

/* ── The tabs ── */
var LIB_TABS = [
  { key:'watching',  slug:'watching',  name:'Watching',  icon:'play' },
  { key:'completed', slug:'watched',   name:'Watched',   icon:'check' },
  { key:'queue',     slug:'watchlist', name:'Watchlist', icon:'bookmark' },
  { key:'dropped',   slug:'dropped',   name:'Dropped',   icon:'drop' }
];
var LIB_SLUG = { watching:'watching', watched:'completed', watchlist:'queue', dropped:'dropped', tbc:'watching' };   // ?sec= (old "tbc" links → Watching)
function _libTabOf(key){ return LIB_TABS.filter(function(t){ return t.key === key; })[0]; }
var _libTab = '';        // the open status; '' until the entries are in (then the first with titles)
(function(){
  var q = new URLSearchParams(location.search).get('sec');
  if (q && LIB_SLUG[q]) { _libTab = LIB_SLUG[q]; return; }
  // Back to this page (from a title, its Edit page…): the status you were on
  try {
    var r = JSON.parse(sessionStorage.getItem('msf_lib_tab') || 'null');
    if (r && r.page === location.pathname + ':' + LIB_SCOPE && typeof _mssReturning !== 'undefined' && _mssReturning && LIB_SLUG[r.slug]) _libTab = LIB_SLUG[r.slug];
  } catch (_) {}
})();
function _libRememberTab(){
  if (!LIB_OWN_PAGE) return;
  var t = _libTabOf(_libTab); if (!t) return;
  try { sessionStorage.setItem('msf_lib_tab', JSON.stringify({ page: location.pathname + ':' + LIB_SCOPE, slug: t.slug })); } catch (_) {}
  try { var u = new URL(location.href); if (u.searchParams.get('sec') !== t.slug) { u.searchParams.set('sec', t.slug); history.replaceState(history.state, '', u.pathname.split('/').pop() + u.search + u.hash); } } catch (_) {}
}

// A title → its panel / page (MSSViews, title-view.js; opens on My Ratings once it's rated)
function _libOpen(id, start) {
  var e = LIB_ENTRIES().filter(function(x){ return x.id === id; })[0];
  if (!e) return;
  var rated = e.status === 'completed' || e.status === 'ongoing' || e.status === 'dropped' || liveScore(e) != null;
  start = start || (rated ? 'rate' : 'info');
  if (LIB_GUEST) { MSSInfo.fromDiscover({ id: Number(e.tmdb_id), media_type: e.tmdb_type, title: e.title, poster_url: e.poster_url }); return; }
  if (LIB_READONLY) { MSSViews.open(e, { start: start, profile: (window.LIB_PROFILE && window.LIB_PROFILE()) || {} }); return; }
  MSSViews.open(e, {
    start: start, own: true, from: (location.pathname.split('/').pop() || 'library.html') + location.search,
    onChange: function(x){ _libChanged(x); }, onNoteSaved: function(){ renderLibrary(); },
    onDelete: _libRemove
  });
}
// Back from a page you opened inside a title's popup (a director, an actor…) → reopen that title
function _libResume() {
  var r = MSSViews.resume();
  if (r) _libOpen(r.id, r.view);
}
// Your own title was deleted → drop it and redraw
function _libRemove(x) {
  _pEntries = _pEntries.filter(function(en){ return en.id !== x.id; });
  renderLibrary();
}
// Something changed on a title (a +, Start, Pause, a status from its panel…). The database stamps
// updated_at on every change; the copy here does too, so the main Watching card follows straight away.
function _libChanged(e){
  if (e && e.id) e.updated_at = new Date().toISOString();
  renderLibrary();
}

/* ── New episodes: To Be Continued shows with an episode out past your progress (mssNewEpisodes,
   MSSSchedule — tv-schedule.js; TMDB details kept 12 h on the device, asked again once the episode
   it said was next has aired). They show in Watching's Up next with Start. Also the next date for
   the ones still waiting. Re-checked when you come back to the page after 3 hours. ── */
var _libNewEps = {}, _libSched = {}, _libNewKey = null, _libFixedUnaired = false, _libCheckedAt = 0;
function _libCheckNewEps(force){
  if (LIB_READONLY || typeof mssNewEpisodes !== 'function') return;
  if (!_libFixedUnaired && typeof _pUser !== 'undefined' && _pUser) { _libFixedUnaired = true; mssFixUnaired(LIB_ENTRIES(), _pUser.id, function(){ renderLibrary(); }); }
  var tbc = LIB_ENTRIES().filter(function(e){ return e.status === 'ongoing'; });
  var key = tbc.map(function(e){ return e.id + ':' + e.season + ':' + e.episode; }).join(',');
  if (key === _libNewKey && !force) return;
  _libNewKey = key; _libCheckedAt = Date.now();
  mssNewEpisodes(LIB_ENTRIES()).then(async function(found){
    var sched = {};
    if (typeof MSSSchedule !== 'undefined') {
      var shows = tbc.filter(function(e){ return e.tmdb_id && e.tmdb_type === 'tv' && !mssIsMovieEntry(e); });
      var ds = await Promise.all(shows.map(function(e){ return MSSSchedule.details(e.tmdb_id).catch(function(){ return null; }); }));
      shows.forEach(function(e, i){ var d = ds[i]; if (d) sched[e.id] = { next: d.next || null, status: d.status || '' }; });
    }
    if (JSON.stringify(found) === JSON.stringify(_libNewEps) && JSON.stringify(sched) === JSON.stringify(_libSched)) return;
    _libNewEps = found; _libSched = sched; renderLibrary();
  });
}
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'visible' && _libCheckedAt && Date.now() - _libCheckedAt > 3 * 36e5) _libCheckNewEps(true);
});
function _libNewEp(e){ return !LIB_READONLY && e.status === 'ongoing' ? _libNewEps[e.id] || null : null; }
// Watching's groups, in this order: 0 watching · 1 up next (incl. To Be Continued shows with a new episode out) · 2 taking a break
function _libGroup(e){
  if (e.status === 'watching') return 0;
  if (e.status === 'up_next' || _libNewEp(e)) return 1;
  return 2;
}
// To Be Continued, still waiting (nothing new aired yet) → Watched; with a new episode out → Watching (Up next)
function _libWaiting(e){ return e.status === 'ongoing' && !_libNewEp(e); }
// The main Watching card: the "watching" title you changed last
function _libMainId(list){
  var best = null;
  list.forEach(function(e){ if (e.status === 'watching' && (!best || String(e.updated_at || e.created_at || '') > String(best.updated_at || best.created_at || ''))) best = e; });
  return best ? best.id : '';
}

/* ── list / grid, per status ── */
// Defaults (owner): Watching as a list; Watched, Watchlist and Dropped as grids. Change one and it's saved for your
// account (with your default sorts — _libSavePrefs: profiles.sort_defaults.views, this device until sql/121 has run),
// one choice per status for the Library, the category pages and your profile's tab. A friend's profile: this device only.
// On phones every status starts as a list (owner). A choice you make wins on any screen.
var _LIB_VIEW = { watching:'list', queue:'grid', completed:'grid', dropped:'grid' };
function _libViewDefault(key){ return matchMedia('(max-width:700px)').matches ? 'list' : _LIB_VIEW[key]; }
function _libView(key){
  if (LIB_READONLY) { try { return localStorage.getItem('pv_view_' + key) || _libViewDefault(key); } catch (_) { return _libViewDefault(key); } }
  return (_libDefaults().views || {})[key] || _libViewDefault(key);
}
function _libSetView(key, view){
  if (LIB_READONLY) { try { localStorage.setItem('pv_view_' + key, view); } catch (_) {} }
  else { var d = _libDefaults(); d.views = Object.assign({}, d.views, { [key]: view }); _libSavePrefs(d); }
  renderLibrary();
}

/* ── Sort & Filter: the shared js/sort-filter.js module (the same panels everywhere) ── */
/* ── Type (the Library page only): Movies · TV Shows · Anime (TV shows / movies) · Cartoons (TV shows / movies),
   several picks, from the Type button beside the status tabs (the shared Type panel, SF.typeFilter). It narrows the
   whole page: the tabs, their counts, the cards and At a glance. Kept while you're on the page; a new visit starts on All
   types (only Back / Forward brings your pick back: _mssBackForward, nav.js). ── */
var _libTypes = '';
var LIB_TYPES_KEY = 'msf_lib_types' + (LIB_SCOPE === 'lib' ? '' : '_' + LIB_SCOPE);
if (LIB_TYPES) { try { _libTypes = (typeof _mssBackForward !== 'undefined' && _mssBackForward && sessionStorage.getItem(LIB_TYPES_KEY)) || ''; } catch (_) {} }
function _libInTypes(e){ return !_libTypes || SF.picks(_libTypes).some(function(t){ return SF.typeIs(t, e.cat, SF.isMovie(e)); }); }
function _libAll(){ return _libTypes ? LIB_ENTRIES().filter(_libInTypes) : LIB_ENTRIES(); }
var LIB_TYPE_TREE = [['','All types'],['movies','Movies'],['tv','TV Shows'],['anime','Anime',[['anime_show','TV Shows'],['anime_movie','Movies']]],['cartoons','Cartoons',[['cartoons_show','TV Shows'],['cartoons_movie','Movies']]]];
function _libTypeLabel(){ return _libTypes ? SF.typeLabel(_libTypes) : 'All types'; }
function _libTypePanel(){
  SF.typeFilter({ title:'Type', groups:[{ key:'cat', label:'Show in your Library', tree:true, options:LIB_TYPE_TREE }], value:{ cat:_libTypes },
    count:function(v){ return LIB_ENTRIES().filter(function(e){ return !v.cat || SF.picks(v.cat).some(function(t){ return SF.typeIs(t, e.cat, SF.isMovie(e)); }); }).length; },
    onApply:function(v){ _libSetTypes(v.cat || ''); } });
}
function _libSetTypes(v){
  _libTypes = v;
  try { v ? sessionStorage.setItem(LIB_TYPES_KEY, v) : sessionStorage.removeItem(LIB_TYPES_KEY); } catch (_) {}
  SF.invalidate(LIB_SCOPE);                          // actor names depend on which types are shown
  renderLibrary();
}
function _libTypeBtnHTML(cls){
  if (!LIB_TYPES) return '';
  var n = SF.picks(_libTypes).length;
  return '<button type="button" class="lib-type-btn'+(cls?' '+cls:'')+(n?' is-on':'')+'" onclick="_libTypePanel()" aria-label="Type: '+_libEsc(_libTypeLabel())+'" aria-haspopup="dialog">'
    + icon('layers',15)+'<span class="lib-type-l">'+_libEsc(_libTypeLabel())+'</span>'+(n?'<span class="lib-tool-n" aria-hidden="true">'+n+'</span>':'')+'</button>';
}
function _libBaseEntries(sec, src){
  var all = src || _libAll();
  if (sec === 'watching') return all.filter(function(e){ return e.status === 'watching' || e.status === 'up_next' || e.status === 'paused' || (e.status === 'ongoing' && !_libWaiting(e)); });
  if (sec === 'queue')    return all.filter(function(e){ return e.status === 'queue'; });
  if (sec === 'dropped')  return all.filter(function(e){ return e.status === 'dropped'; });
  return all.filter(function(e){ return e.status === 'completed' || _libWaiting(e); });
}
function _libBand(e,v){ var s=liveScore(e); if(s==null) return false; s=Number(Number(s).toFixed(2)); return v==='9'?s>=9:s>=8&&s<9; }
var _libSort = {};                                   // the sort you picked while here (else your saved default, else Latest added)
var _libMovieCat = LIB_CAT === 'movies', _libMixedCat = LIB_CAT === 'anime' || LIB_CAT === 'cartoons';
SF.register(LIB_SCOPE, {
  watched: function(sec){ return sec === 'completed'; },   // Year Watched filter
  base: _libBaseEntries,
  render: function(){ renderLibrary(); },
  onSearch: function(){ renderLibrary(); },
  sortState: _libSort,
  sorts: function(sec){
    if (!LIB_CAT) return ['alpha','added','release','ratings','runtime','seasons','episodes'];
    return ['alpha','added','release', !_libMovieCat && 'episode', sec !== 'queue' && 'ratings'].concat(_libMovieCat ? ['runtime'] : LIB_CAT === 'tv' ? ['seasons','episodes'] : ['runtime','seasons','episodes']);
  },
  lengthKind: function(){ return _libMovieCat ? 'movie' : LIB_CAT === 'tv' ? 'show' : 'mixed'; },
  choiceFilters: function(sec){
    var out = [];
    // Type — the Library's types live here now (no type toggle); Anime / Cartoons: movies or shows
    if (_libMixedCat) out.push({ key:'mt', label:'Type', single:true, options:[['','All Types'],['movie','Movies'],['tv','TV Shows']], test:function(e,v){ return mssIsMovieEntry(e) === (v === 'movie'); } });
    if (sec === 'watching') out.push({ key:'st', label:'Status', options:[['','All'],['watching','Watching'],['up_next','Up next'],['paused','Taking a break']],
      test:function(e,v){ var g = _libGroup(e); return v === 'watching' ? g === 0 : v === 'up_next' ? g === 1 : g === 2; } });
    if (sec === 'completed') out.push(
      { key:'tbc', label:'Waiting for new episodes', single:true, options:[['','All'],['yes','To Be Continued']], test:function(e){ return _libWaiting(e); } },
      { key:'band', label:'Your score', single:true, options:[['','All'],['9','9+'],['8','8–9']], test:_libBand },
      { key:'rw', label:'Rewatched', single:true, options:[['','All'],['yes','Rewatched']], test:function(e){ return mssRewatchCount(e) > 1; } },
      { key:'rv', label:'Has a review', single:true, options:[['','All'],['yes','Has a review']], test:function(e){ return !!(e.notes && String(e.notes).trim()); } });
    return out;
  },
  ratingSort: {
    show: function(sec){ return sec === 'completed'; },
    options: function(){ return mssRatingSortOptions(LIB_CAT || undefined); },
    label: mssRatingSortLabel,
    value: mssRatingValue,
  },
  // Watching: the main card first, then Watching · Up next · Taking a break · To Be Continued (each in the sort's order)
  postSort: function(sec, list){
    if (sec !== 'watching') return list;
    var main = _libMainId(list), out = [];
    list.forEach(function(e){ if (e.id === main) out.push(e); });
    [0,1,2].forEach(function(g){ list.forEach(function(e){ if (e.id !== main && _libGroup(e) === g) out.push(e); }); });
    return out;
  },
  saveRatings: LIB_READONLY ? undefined : function(e,r){ return updateProgress(e.id,_pUser.id,{ratings:r}).catch(function(){}); },
  savedSort: LIB_OWN_PAGE && !LIB_READONLY ? {
    sections: LIB_TABS.map(function(t){ return [t.key, t.name]; }),
    label: function(sec){ return (_libTabOf(sec) || {}).name || sec; },
    subtitle: function(sec){ var n = SF.list(LIB_SCOPE, sec).length; return (_libTabOf(sec) || {}).name + ' · ' + n + ' title' + (n === 1 ? '' : 's'); },
    get: function(sec){ return _libDefaults()[sec] || ''; },
    set: _libSaveDefault,
  } : undefined,
});
function _sfScope(){ return LIB_SCOPE; }

/* Saved default sort per status (121_library_sort_defaults.sql: profiles.sort_defaults), shared by the
   Library and the category pages. Until that SQL has run, the choice is kept on this device. */
function _libDefKey(){ return 'msf_sort_defaults_' + ((typeof _pUser !== 'undefined' && _pUser && _pUser.id) || ''); }
function _libDefaults(){
  var p = window._navUserProfile, local = null;
  try { local = JSON.parse(localStorage.getItem(_libDefKey()) || 'null'); } catch (_) {}
  return Object.assign({}, local || {}, (p && p.sort_defaults) || {});
}
// Saves your Library preferences (default sorts + list / grid views): on this device, and on your account once 121 has run
async function _libSavePrefs(d){
  try { localStorage.setItem(_libDefKey(), JSON.stringify(d)); } catch (_) {}
  var p = window._navUserProfile;
  if (p && 'sort_defaults' in p && typeof _pUser !== 'undefined' && _pUser) {
    p.sort_defaults = d;                                   // so this page reads the new choice straight away
    try { await sb.from('profiles').update({ sort_defaults: d }).eq('id', _pUser.id); } catch (err) { console.warn('Saving Library preferences:', err); }
  }
}
async function _libSaveDefault(sec, value){
  var d = _libDefaults(); d[sec] = value;
  await _libSavePrefs(d);
  showToast('Saved as your default for ' + ((_libTabOf(sec) || {}).name || sec) + '.');
}

/* ── The cards ── */
var LIB_LIST_PX='(max-width:640px) 60px, 96px';
function _trimNotes(text) {
  if (!text) return '';
  var words = text.trim().split(/\s+/);
  return words.length > 150 ? words.slice(0, 150).join(' ') + '…' : text;
}
function _libRatingBadge(e,key){
  var val=mssRatingValue(e,key);
  if(val==null)return '<div class="cg-score-badge cg-score-none">-</div>';
  var cls='ep-band-'+mssScoreTier(val).key;   // the rating scale's tier: its fill + text
  return '<div class="cg-score-badge '+cls+'">★ '+val.toFixed(2)+'</div>';
}
// the type tag is left off where the whole page is one type (Movies, TV Shows)
function _libCardOpts(e, o){
  var c = mssEntryCard(e, Object.assign({ attrs:'onclick="_libOpen(this.closest(\'[data-id]\').dataset.id)" data-id="'+e.id+'"' }, o || {}));
  if (LIB_CAT === 'movies' || LIB_CAT === 'tv') c.type = null;
  return c;
}
function _libTagHTML(e){
  var ne = _libNewEp(e);
  if (ne) return mssNewSeasonBadgeHTML(e, ne);
  if (e.status === 'ongoing') return '<span class="lib-tag is-tbc">'+icon('refresh-cw',10)+'<span class="lib-tag-t">To be continued</span></span>';
  return '';
}
function _libCard(e, o){
  o = o || {};
  var c = _libCardOpts(e, o), tag = _libTagHTML(e).replace('w-ep-badge mss-new-badge', 'lib-tag is-new');
  // To Be Continued / New episodes: on the poster, bottom-right (the type tag stays bottom-left)
  if (tag) c.over = (c.over || '') + '<div class="msf-card__br lib-pbr" aria-hidden="true">' + tag + '</div>';
  if (o.controls) {
    c.attrs = null; c.onclick = "_libOpen('" + e.id + "')";
    if (c.progress && e.status === 'watching') c.progress = Object.assign({}, c.progress, { badge:'' });   // the S·E button says it
  }
  var html = MSSCard.poster(c);
  // the card with buttons is a wrapper: give it the id too (focus, ?focus=)
  return o.controls ? html.replace(/^<div class="(msf-card[^"]*)"/, '<div class="$1" data-id="' + e.id + '"') : html;
}
// Favourites as plain text, like the top 3 — no badge boxes; an icon each (character · episode · season); least favourites are muted.
// cls: the row's class ('lp-favs' on the cards, 'lp-favs lib-pod-favs' on the top 3). An episode shows as its number
// ("S4 E7"), its name in the tooltip, so the row stays one line.
// favourite character / episode / season (and least favourites) — the shared helper is mssFavChipsHTML (config.js)
function _libFavChips(e, cls){ return mssFavChipsHTML(e, cls); }

/* ── Buttons on the cards (your own Library pages). The S·E label opens the episode panel (MSSEp.rate);
   ⋯ opens Actions (mssEntryActions, db.js) with everything else. ── */
function _libBtn(cls, label, aria, fn, ic){
  return '<button type="button" class="lc-btn'+(cls?' '+cls:'')+'" onclick="event.stopPropagation();'+fn+'" aria-label="'+_libEsc(aria)+'" title="'+_libEsc(aria)+'">'+(ic?icon(ic,15):'')+(label?'<span>'+_libEsc(label)+'</span>':'')+'</button>';
}
function _libSE(e){ return 'S' + (e.season || 1) + ' · E' + (e.episode || 0); }
function _libCtrls(e, where){
  if (!LIB_CTRL) return '';
  var id = e.id, t = e.title || 'this title', st = e.status, movie = mssIsMovieEntry(e), ne = _libNewEp(e), grid = where === 'grid', out = '', skip = [];
  var more = function(){ return _libBtn('lc-more', '', 'Actions for ' + t, "_libMore(this,'" + id + "','" + skip.join(',') + "')", '').replace('</button>', _LIB_DOTS + '</button>'); };
  if (st === 'watching' && !movie) {
    out = _libBtn('lc-ic', '', 'Remove one episode, ' + t, "_libStep('" + id + "',-1)", 'minus')
      + '<button type="button" class="lc-ep" onclick="event.stopPropagation();_libEp(\'' + id + '\')" aria-label="' + _libEsc(_libSE(e) + ', open the episode panel for ' + t) + '" title="Open the episode">' + _libEsc(_libSE(e)) + '</button>'
      + _libBtn('lc-ic is-primary', '', 'Add one episode, ' + t, "_libStep('" + id + "',1)", 'plus')
      + _libBtn('lc-ic lc-fit', '', 'Taking a break, ' + t, "_libPause('" + id + "')", 'pause');
    skip = ['minus', 'pause'];
    return '<div class="lc-row">' + out + (grid ? '' : more()) + '</div>';
  }
  if (st === 'watching') { skip = ['done']; return '<div class="lc-row">' + _libBtn('is-primary', 'Mark watched', 'Mark watched, ' + t, "_libDoneMovie('" + id + "')", 'check') + more() + '</div>'; }
  if (st === 'up_next' || ne) { skip = ['start']; return '<div class="lc-row">' + _libBtn('is-primary', 'Start', 'Start watching ' + t, "_libStart('" + id + "')", 'play') + more() + '</div>'; }
  if (st === 'paused') { skip = ['resume']; return '<div class="lc-row">' + _libBtn('is-primary', 'Resume', 'Resume ' + t, "_libResumeE('" + id + "')", 'play') + more() + '</div>'; }
  if (!LIB_FULL) return '';
  if (st === 'queue') { skip = ['start']; return '<div class="lc-row">' + _libBtn('is-primary', 'Start watching', 'Start watching ' + t, "_libStart('" + id + "')", 'play') + more() + '</div>'; }
  if (st === 'dropped') { skip = ['pickup']; return '<div class="lc-row">' + _libBtn('is-primary', 'Pick back up', 'Pick ' + t + ' back up', "_libPickUp('" + id + "')", 'play') + more() + '</div>'; }
  return '';
}
function _libEntry(id){ return LIB_ENTRIES().filter(function(x){ return x.id === id; })[0]; }
function _libStep(id, d){ var e = _libEntry(id); if (e) MSSProgress.step(e, d, _libChanged); }
function _libPause(id){ var e = _libEntry(id); if (e) MSSProgress.pause(e, _libChanged); }
function _libResumeE(id){ var e = _libEntry(id); if (e) MSSProgress.resume(e, _libChanged); }
function _libStart(id){ var e = _libEntry(id); if (!e) return; e.status === 'ongoing' ? MSSProgress.resume(e, _libChanged) : MSSProgress.start(e, _libChanged); }
function _libDoneMovie(id){ var e = _libEntry(id); if (e) MSSProgress.doneMovie(e, _libChanged); }
function _libPickUp(id){ var e = _libEntry(id); if (e) MSSDrop.pickUp(e, { onChange: _libChanged }); }
function _libEp(id){ var e = _libEntry(id); if (e && typeof MSSEp !== 'undefined') MSSEp.rate(e, e.season || 1, Math.max(1, e.episode || 1), { onSaved: function(){ renderLibrary(); } }); }
async function _libMore(btn, id, skip){
  var e = _libEntry(id); if (!e) return;
  await mssLoadScript('js/panel.js');
  MSSPopover.open(btn, { title: e.title, label: 'Actions for ' + e.title, items: mssEntryActions(e, {
    onChange: _libChanged, onDelete: _libRemove, newEp: !!_libNewEp(e), skip: (skip || '').split(',').filter(Boolean),
    open: function(x){ _libOpen(x.id); } }) });
}

/* The list cards' score: the site's score ring (as on the Edit page, MSSViews.ring), in its tier's colour; no score → "—" */
// Movie / TV Show / Anime / Cartoon, the coloured badge of Discover's list rows (.dx-type); left off where the whole page is one type
function _libTypeBadge(e, t){
  if (LIB_CAT === 'movies' || LIB_CAT === 'tv') return '';
  var k = e.cat === 'anime' ? 'anime' : e.cat === 'cartoons' ? 'cartoon' : t.tv ? 'tv' : 'movie';
  return '<span class="lp-type is-'+k+'">'+_libEsc(t.label)+'</span>';
}

/* ── The progress card (V2 D1/D2): poster, backdrop, what's next, progress, buttons.
   main → the big one (full width on desktop). Also the compact list rows of Watchlist and Dropped. ── */
function _libDate(d){ try { return new Date(String(d).slice(0,10) + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { day:'numeric', month:'short' }); } catch (_) { return d; } }
function _libProg(e, main, opts){
  var movie = mssIsMovieEntry(e), t = mssTypeOf(e.cat, movie), st = e.status, ne = _libNewEp(e), id = e.id;
  var year = e.year ? String(e.year).slice(0,4) : '', m = mssMetaOf(e);
  var tag = st === 'up_next' ? '<span class="lib-tag is-up">'+icon('skipForward',10)+' Up next</span>'
    : ne ? mssNewSeasonBadgeHTML(e, ne).replace('w-ep-badge mss-new-badge', 'lib-tag is-new')
    : st === 'paused' ? '<span class="lib-tag is-brk">'+icon('pause',10)+' Taking a break</span>'
    : st === 'ongoing' ? '<span class="lib-tag is-tbc">'+icon('refresh-cw',10)+' To be continued</span>'
    : st === 'dropped' ? '<span class="lib-tag is-drop">'+icon('drop',10)+' '+_libEsc(mssDroppedLabel(e))+'</span>' : '';
  var lines = '', ring = '', metaT = '', total = Number(e.total_eps) || 0, w = Number(e.watched) || 0, pct = total ? Math.min(100, Math.round(w / total * 100)) : null;
  var bar = function(muted){ return pct == null ? '' : '<div class="lp-bar'+(muted?' is-muted':'')+'" aria-hidden="true"><i style="width:'+pct+'%"></i></div><div class="lp-count">'+w+' of '+total+' episodes · '+pct+'%'+(total > w ? ' · '+(total - w)+' left' : '')+'</div>'; };
  if (!movie && (st === 'watching' || st === 'paused')) {
    var s = e.season || 1, n = (e.episode || 0) + 1, bd = Array.isArray(e.ratings && e.ratings._season_breakdown) ? e.ratings._season_breakdown.map(Number) : [];
    if (bd[s-1] && n > bd[s-1] && bd[s]) { s++; n = 1; }
    lines = '<div class="lp-next">'+(st === 'paused' ? 'Paused on <b>'+_libEsc(_libSE(e))+'</b>' : 'Next: <b>S'+s+' E'+n+'</b>')
      + (st === 'watching' && e.tmdb_id ? '<span class="lp-epname" data-ep="'+_libEsc(e.tmdb_id+':'+s+':'+n)+'"></span>' : '') + '</div>' + bar(st === 'paused');
  } else if (st === 'ongoing' && ne) {
    lines = '<div class="lp-next">New: <b>S'+ne.s+' E'+ne.n+'</b> · out '+_libEsc(_libDate(ne.air))+' · you’re on '+_libEsc(_libSE(e))+'</div>';
  } else if (st === 'watching' || st === 'up_next') {
    lines = '<div class="lp-next">'+_libEsc([m.long, st === 'up_next' ? (movie || !e.episode ? 'Not started' : 'On '+_libSE(e)) : 'Started'].filter(Boolean).join(' · '))+'</div>';
  } else if (st === 'completed' || st === 'ongoing') {
    // Watched: your score (or the sorted rating), rank, details · your review · favourites · Comments
    // (To Be Continued: + when the next episode airs, if TMDB has a date)
    var o = opts || {}, sv = o.value !== undefined ? o.value : liveScore(e), nx = st === 'ongoing' && _libSched[id] && _libSched[id].next;
    var note = e.notes && !mssIsSpoiler(e) ? '<p class="lp-note">&ldquo;'+_libEsc(_trimNotes(MSSRich.plain(e.notes)))+'&rdquo;</p>' : '';
    // the score: a ring on the right of the card (ring, below), so the details here are runtime / seasons only
    ring = '<div class="lp-ringbox">'+mssScoreRing(sv)+'</div>';
    metaT = m.long;   // runtime / seasons: in the badge row, as Discover's genres
    lines = (st === 'ongoing' ? '<div class="lp-count">'+(nx && nx.air ? 'Next: S'+nx.s+' E'+nx.n+' · '+_libEsc(_libDate(nx.air)) : 'Waiting for new episodes')+'</div>' : '')
      // your review, favourites and Comments sit at the bottom, so the title and score stay in the same place on every card
      + '<div class="lp-tail">' + note + _libFavChips(e)
      + '<div class="lp-foot">'+mssCommentsStripHTML("event.stopPropagation();_libOpen('" + id + "', 'comments')")+'</div></div>';
  } else {
    lines = '<div class="lp-next">'+_libEsc(m.long || '')+'</div>';
  }
  var ctrls = _libCtrls(e, 'prog'), bdKey = e.tmdb_id || (e.ratings && e.ratings._backdrop) ? MSSBackdrop.key(e) : '', art = safeURL(e.poster_url) ? safeURL(e.poster_url).replace(/\/(w\d+|original)\//, '/w342/') : '';
  var label = [e.title, year, t.label, st === 'ongoing' ? (ne ? 'new episode out' : 'To Be Continued') : (MSS_STATUS[st] || [])[0], opts && opts.rank ? 'rank ' + opts.rank : ''].filter(Boolean).join(', ');
  return '<article class="lp-card'+(main?' is-main':'')+(st==='dropped'?' is-dropped':'')+(st==='completed'||st==='ongoing'?' is-done':'')+'" data-id="'+id+'" onclick="if(!event.target.closest(\'button,a\'))_libOpen(\''+id+'\')">'
    + (bdKey || art ? '<span class="msf-row__art lp-art'+(bdKey?' is-bd':'')+'"'+(bdKey?' data-bd="'+_libEsc(bdKey)+'"':'')+(art?' data-poster="'+_libEsc(art)+'"':'')+(!bdKey&&art?' style="background-image:url(\''+art+'\')"':bdKey&&MSSBackdrop.style(e,false,main?'big':'card')?' style="'+_libEsc(MSSBackdrop.style(e,false,main?'big':'card'))+'"':'')+' aria-hidden="true"></span>' : '')
    + '<span class="lp-shade" aria-hidden="true"></span>'
    + '<button type="button" class="lp-poster" onclick="event.stopPropagation();_libOpen(\''+id+'\')" aria-label="'+_libEsc(label)+'" tabindex="-1">'+posterHTML(e,'',main?'(max-width:640px) 94px, 140px':'(max-width:640px) 110px, 150px')+(opts && opts.rank ? '<span class="cg-rank-badge '+(opts.rank===1?'cg-rank-1':opts.rank===2?'cg-rank-2':opts.rank===3?'cg-rank-3':'cg-rank-other')+'" aria-hidden="true">'+opts.rank+'</span>' : '')+'</button>'
    + '<div class="lp-body">'
    // as Discover's list rows: the title with its year beside it, then the type badge · tags · details
    +   '<div class="lp-head"><h3 class="lp-title"><button type="button" onclick="event.stopPropagation();_libOpen(\''+id+'\')" aria-label="'+_libEsc(label)+'" translate="no">'+_libEsc(e.title)+'</button></h3>'+(year?'<span class="lp-year" aria-hidden="true">'+year+'</span>':'')+'</div>'
    +   '<div class="lp-tags">'+_libTypeBadge(e, t)+tag+(mssRewatchCount(e) > 1 ? mssRewatchBadgeHTML(mssRewatchCount(e)) : '')+(metaT ? '<span class="lp-tags-t">'+_libEsc(metaT)+'</span>' : '')+'</div>'
    +   lines + (ctrls ? '<div class="lp-ctrls">'+ctrls+'</div>' : '')
    + '</div>' + ring + '</article>';
}
// "Next: S5 E5 · <episode name>" — names from TMDB (MSSEp.seasonEpisodes, kept 7 days), for the cards on screen
function _libEpNames(root){
  if (typeof MSSEp === 'undefined' || !root) return;
  root.querySelectorAll('.lp-epname[data-ep]:not([data-done])').forEach(function(el){
    el.dataset.done = '1';
    var p = el.dataset.ep.split(':');
    MSSEp.seasonEpisodes(p[0], Number(p[1])).then(function(eps){
      var x = (eps || []).filter(function(z){ return z.n === Number(p[2]); })[0];
      if (x && x.name) el.textContent = ' · ' + x.name;
    }).catch(function(){});
  });
}

/* ── At a glance: one summary of the page's titles (Library: everything; a category page: that category) ── */
function _libFmtMins(m){ var h = Math.floor(m / 60); return m ? (h ? h + 'h ' + (m % 60) + 'm' : m + 'm') : '0m'; }
function _libGlance(list){
  var done = list.filter(function(e){ return e.status === 'completed' || e.status === 'ongoing'; });
  var scores = done.map(function(e){ return liveScore(e); }).filter(function(s){ return s != null; }).map(function(s){ return Number(Number(s).toFixed(2)); });
  var eps = list.filter(function(e){ return !mssIsMovieEntry(e) && e.status !== 'queue'; }).reduce(function(a, e){
    return a + ((e.status === 'completed' || e.status === 'ongoing') ? (Number(e.total_eps) || Number(e.watched) || 0) : (Number(e.watched) || 0)); }, 0);
  var mins = list.filter(function(e){ return e.status === 'completed' && mssIsMovieEntry(e); }).reduce(function(a, e){ return a + (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0); }, 0);
  var bands = [['9–10', function(s){ return s >= 9; }, 9], ['8–9', function(s){ return s >= 8 && s < 9; }, 8], ['7–8', function(s){ return s >= 7 && s < 8; }, 7], ['Under 7', function(s){ return s < 7; }, 6]]
    .map(function(b){ return [b[0], scores.filter(b[1]).length, mssTierCls(b[2]).trim()]; });
  var types = !LIB_CAT ? [['Movies','movies'],['TV Shows','tv'],['Anime','anime'],['Cartoons','cartoons']].map(function(t){ return [t[0], list.filter(function(e){ return e.cat === t[1]; }).length, t[1]]; })
    : _libMixedCat ? [['Shows', list.filter(function(e){ return !mssIsMovieEntry(e); }).length, 'tv'], ['Movies', list.filter(mssIsMovieEntry).length, 'movies']] : null;
  var recent = done.slice().sort(function(a, b){ return String(b.completed_at || b.completed_date || '') > String(a.completed_at || a.completed_date || '') ? 1 : -1; })
    .filter(function(e){ return e.completed_at || e.completed_date; }).slice(0, 4);
  return { avg: scores.length ? scores.reduce(function(a, b){ return a + b; }, 0) / scores.length : null, rated: scores.length, nine: bands[0][1], eps: eps, mins: mins,
    titles: list.length, done: done.length, bands: bands, types: types, recent: recent, finger: _libFinger(done) };
}

/* ── Rating fingerprint: your average in each rating group (Narrative, Visual…) across the titles you rated,
   drawn as a radar, with the group you score highest ("You reward") and lowest ("Toughest on").
   A group shows once 2+ titles have it rated; the radar needs 3+ groups. Overall Experience (one rating) is left out. ── */
var _LIB_FP = { narrative:['Narrative','Narrative'], characters:['Characters','Characters'], visual:['Visual','Visual craft'], intrigue:['Intrigue','Intrigue'],
  emotion:['Emotional','Emotional impact'], atmosphere:['Atmosphere','Atmosphere'], creative:['Creative','Creativity & sound'], spectacle:['Spectacle','Spectacle'] };
function _libFinger(done){
  var acc = {};
  done.forEach(function(e){
    mssRatedGroups(e.ratings, e.cat, mssIsMovieEntry(e)).forEach(function(g){
      if (!_LIB_FP[g.id]) return;
      (acc[g.id] = acc[g.id] || []).push(g.avg);
    });
  });
  var axes = Object.keys(_LIB_FP).filter(function(id){ return acc[id] && acc[id].length >= 2; }).map(function(id){
    var v = acc[id]; return { id:id, short:_LIB_FP[id][0], name:_LIB_FP[id][1], avg: v.reduce(function(a, b){ return a + b; }, 0) / v.length, n: v.length };
  });
  if (axes.length < 3) return null;
  var by = axes.slice().sort(function(a, b){ return b.avg - a.avg; });
  return { axes:axes, best:by[0], worst:by[by.length - 1] };
}
function _libRadar(axes){
  var W = 340, H = 300, cx = 170, cy = 152, R = 90, n = axes.length, min = Math.min.apply(null, axes.map(function(a){ return a.avg; }));
  var lo = Math.max(0, Math.min(6, Math.floor(min) - 2));                       // the centre: a little under your lowest group, so the shape shows
  var pt = function(i, f){ var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
  var poly = function(f){ return axes.map(function(_, i){ return pt(i, typeof f === 'function' ? f(i) : f).map(function(x){ return x.toFixed(1); }).join(','); }).join(' '); };
  var val = function(i){ return Math.max(0.04, Math.min(1, (axes[i].avg - lo) / (10 - lo))); };
  var out = '<svg class="lf-radar" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+_libEsc('Rating fingerprint: ' + axes.map(function(a){ return a.name + ' ' + a.avg.toFixed(2); }).join(', '))+'">';
  [1, .75, .5, .25].forEach(function(f, k){ out += '<polygon class="lf-ring'+(k === 0 ? ' is-outer' : '')+'" points="'+poly(f)+'"/>'; });
  axes.forEach(function(_, i){ var p = pt(i, 1); out += '<line class="lf-spoke" x1="'+cx+'" y1="'+cy+'" x2="'+p[0].toFixed(1)+'" y2="'+p[1].toFixed(1)+'"/>'; });
  out += '<polygon class="lf-shape" points="'+poly(val)+'"/>';
  axes.forEach(function(_, i){ var p = pt(i, val(i)); out += '<circle class="lf-dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.6"/>'; });
  axes.forEach(function(a, i){
    var ang = -Math.PI / 2 + i * 2 * Math.PI / n, c = Math.cos(ang), s = Math.sin(ang), p = pt(i, 1.2);
    var anchor = Math.abs(c) < .3 ? 'middle' : c > 0 ? 'start' : 'end', y = s < -.5 ? p[1] - 20 : s > .5 ? p[1] + 2 : p[1] - 9;
    out += '<text class="lf-lab" x="'+p[0].toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="'+anchor+'" aria-hidden="true">'+_libEsc(a.short.toUpperCase())+'</text>'
      + '<text class="lf-val" x="'+p[0].toFixed(1)+'" y="'+(y + 19).toFixed(1)+'" text-anchor="'+anchor+'" aria-hidden="true">'+a.avg.toFixed(2)+'</text>';
  });
  return out + '</svg>';
}
function _libFingerHTML(f){
  var head = '<header class="lf-head"><h2 class="lg-kicker" id="libFingerH">Rating fingerprint</h2><span class="lf-sub">avg by category group</span></header>';
  if (!f) return '<section class="lib-finger is-empty" aria-labelledby="libFingerH">'+head
    + '<div class="lf-empty"><svg viewBox="0 0 120 110" aria-hidden="true"><polygon class="lf-ring is-outer" points="60,8 112,46 92,104 28,104 8,46"/><polygon class="lf-ring" points="60,34 87,54 77,84 43,84 33,54"/></svg>'
    + '<p>'+((LIB_READONLY && !LIB_GUEST) ? 'Not enough ratings yet to show where their scores lean.' : 'Rate a few more titles to see where your scores lean — which parts of a story you reward, and where you’re toughest.')+'</p></div></section>';
  var tile = function(k, a){ return '<div class="lf-tile"><small>'+k+'</small><b>'+_libEsc(a.name)+'</b><span>'+a.avg.toFixed(2)+' average · '+a.n+' titles</span></div>'; };
  return '<section class="lib-finger" aria-labelledby="libFingerH">'+head
    + '<div class="lf-body"><div class="lf-chart">'+_libRadar(f.axes)+'</div>'
    + '<div class="lf-tiles">'+(f.best.avg - f.worst.avg < 0.01
        ? '<div class="lf-tile"><small>Your spread</small><b>Even</b><span>every group at '+f.best.avg.toFixed(2)+'</span></div><div class="lf-tile"><small>Groups</small><b>'+f.axes.length+'</b><span>rated on 2+ titles</span></div>'
        : tile((LIB_READONLY && !LIB_GUEST) ? 'They reward' : 'You reward', f.best)+tile('Toughest on', f.worst))+'</div></div></section>';
}

function _libRing(avg, size){
  var r = size / 2 - 5, c = 2 * Math.PI * r, f = avg == null ? 0 : Math.max(0, Math.min(1, avg / 10));
  return '<svg class="lg-ring-svg'+mssTierCls(avg)+'" viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" aria-hidden="true"><circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" class="lg-ring-bg"/>'
    + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" class="lg-ring-fg" stroke-dasharray="'+(c*f).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 '+size/2+' '+size/2+')"/></svg>';
}
function _libScoreCls(s){ return mssTierCls(s); }
/* At a glance: the key numbers as tiles (average score with its ring, episodes, watch time, 9+), then how your scores
   spread and the types side by side, and what you finished last */
function _libGlanceBody(g){
  var loc = MSSI18n.locale, timeLabel = _libMixedCat ? 'Watch time' : 'Movie time';
  var days = g.mins >= 1440 ? '≈ ' + (g.mins / 1440).toFixed(1) + ' days' : 'of movies';
  var kpi = function(l, v, sub){ return '<div class="lg-kpi"><dt>'+l+'</dt><dd><b>'+_libEsc(v)+'</b>'+(sub ? '<small>'+_libEsc(sub)+'</small>' : '')+'</dd></div>'; };
  var tiles = [[LIB_CAT !== 'movies', kpi('Episodes', g.eps.toLocaleString(loc), 'watched')], [LIB_CAT !== 'tv', kpi(timeLabel, _libFmtMins(g.mins), days)],
    [true, kpi('Rated 9+', g.nine, g.rated ? Math.round(g.nine / g.rated * 100) + '% of rated' : 'none rated yet')], [true, kpi('Titles', g.titles.toLocaleString(loc), (g.done || 0) + ' watched')]]
    .filter(function(t){ return t[0]; }).slice(0, 3).map(function(t){ return t[1]; }).join('');
  var avgTile = '<div class="lg-kpi is-avg"><span class="lg-ring">'+_libRing(g.avg, 60)+'</span><span class="lg-kpi-t"><dt>Avg score</dt><dd><b class="'+mssTierCls(g.avg).trim()+'">'+(g.avg == null ? '—' : g.avg.toFixed(2))+'</b><small>'+g.rated+' rated</small></dd></span></div>';
  var maxB = Math.max.apply(null, g.bands.map(function(b){ return b[1]; }).concat([1]));
  var typeTotal = g.types ? g.types.reduce(function(a, t){ return a + t[1]; }, 0) : 0;
  return '<dl class="lg-kpis">'+avgTile+tiles+'</dl>'
    + '<div class="lg-cols">'
    + '<div class="lg-col">'
      + '<h3 class="lg-h">'+((LIB_READONLY && !LIB_GUEST) ? 'Their scores' : 'Your scores')+' <span>'+g.rated+' rated</span></h3>'
      + '<ul class="lg-bands">'+g.bands.map(function(b){ var pct = g.rated ? Math.round(b[1] / g.rated * 100) : 0;
          return '<li><span>'+b[0]+'</span><span class="lg-band-bar" aria-hidden="true"><i class="'+b[2]+'" style="width:'+Math.round(b[1]/maxB*100)+'%"></i></span><b>'+b[1]+'</b><small>'+pct+'%</small></li>'; }).join('')+'</ul>'
      + (g.types && typeTotal ? '<h3 class="lg-h">By type <span>'+typeTotal+' titles</span></h3><div class="lg-type-bar" aria-hidden="true">'+g.types.map(function(t){ return t[1] ? '<i class="is-'+t[2]+'" style="flex:'+t[1]+'"></i>' : ''; }).join('')+'</div>'
        + '<ul class="lg-type-legend">'+g.types.map(function(t){ return '<li><i class="is-'+t[2]+'" aria-hidden="true"></i><span>'+t[0]+'</span><b>'+t[1]+'</b></li>'; }).join('')+'</ul>' : '')
    + '</div>'
    + '<div class="lg-col lg-recent"><h3 class="lg-h">Recently finished '+(LIB_READONLY ? '' : '<a class="lg-link" href="diary.html">Diary <span aria-hidden="true">→</span></a>')+'</h3>'
      + (g.recent.length ? '<ul class="lg-rec">'+g.recent.map(function(e){ var s = liveScore(e);
          return '<li><button type="button" class="lg-rec-row" onclick="_libGlanceOpen(\''+e.id+'\')"><span class="lg-rec-poster" aria-hidden="true">'+posterHTML(e,'','36px')+'</span>'
            + '<span class="lg-rec-t"><b translate="no">'+_libEsc(e.title)+'</b><small>'+_libEsc(_libDate(e.completed_at || e.completed_date))+'</small></span>'
            + '<span class="lg-rec-s'+(s != null ? _libScoreCls(s) : '')+'">'+(s != null ? Number(s).toFixed(2) : '—')+'</span></button></li>'; }).join('')+'</ul>'
        : '<p class="lg-none">Nothing finished yet.</p>')
    + '</div></div>';
}
function _libGlanceHTML(g){
  var n = g.titles;
  return '<div class="lib-top"><section class="lib-glance" aria-labelledby="libGlanceH"><header class="lf-head"><h2 class="lg-kicker" id="libGlanceH">At a glance</h2>'
    + '<span class="lf-sub">'+n.toLocaleString(MSSI18n.locale)+' title'+(n === 1 ? '' : 's')+'</span></header>'+_libGlanceBody(g)+'</section>'+_libFingerHTML(g.finger)+'</div>'
    + '<button type="button" class="lib-glance-mini" onclick="_libGlancePage()" aria-label="At a glance: open the full summary">'
    + '<span class="lgm-ring">'+_libRing(g.avg, 30)+'</span><span class="lgm-txt"><b>'+(g.avg == null ? '—' : g.avg.toFixed(2))+'</b> avg'
    + (LIB_CAT !== 'movies' ? ' · '+g.eps.toLocaleString(MSSI18n.locale)+' eps' : '') + (LIB_CAT !== 'tv' ? ' · '+_libFmtMins(g.mins).split(' ')[0] : '')
    + ' · '+n+' title'+(n === 1 ? '' : 's')+'</span>'+icon('chevright',16)+'</button>';
}
var _libGlanceH = null;
function _libGlanceOpen(id){ if (_libGlanceH) { _libGlanceH.closeNow(); _libGlanceH = null; } _libOpen(id); }
async function _libGlancePage(){
  await mssLoadScript('js/panel.js');
  var g = _libGlance(_libAll());
  _libGlanceH = MSSPanel.open({ as:'page', kind:'generic', size:'S', title:'At a glance', subtitle: g.titles + ' title' + (g.titles === 1 ? '' : 's'), label:'At a glance',
    body: '<div class="lg-page">'+_libGlanceBody(g)+_libFingerHTML(g.finger)+'</div>', onClose: function(){ _libGlanceH = null; } });
}

/* ── Tabs ── */
function _libTabSummary(key, list){
  if (!list.length) return { watching:'Nothing in progress', completed:'Nothing finished yet', queue:'Nothing queued', dropped:'None' }[key];
  if (key === 'watching') {
    var c = [0,0,0]; list.forEach(function(e){ c[_libGroup(e)]++; });
    return [[c[0],'watching'],[c[1],'up next'],[c[2],'on a break']].filter(function(x){ return x[0]; }).map(function(x){ return x[0]+' '+x[1]; }).join(' · ');
  }
  if (key === 'completed') { var w = list.filter(_libWaiting).length, r = list.filter(function(e){ return liveScore(e) != null; }).length;
    return (r === list.length ? 'All rated' : r + ' rated') + (w ? ' · ' + w + ' waiting for new eps' : ''); }
  if (key === 'queue') {
    if (!LIB_CAT) return [['movies','movies'],['tv','TV'],['anime','anime'],['cartoons','cartoons']].map(function(t){ var n = list.filter(function(e){ return e.cat === t[0]; }).length; return n ? n+' '+t[1] : ''; }).filter(Boolean).join(' · ');
    if (_libMovieCat) return _libFmtMins(list.reduce(function(a, e){ return a + (Number(e.runtime_h)||0)*60 + (Number(e.runtime_m)||0); }, 0)) + ' to watch';
    var mv = list.filter(mssIsMovieEntry).length, sh = list.length - mv;
    return [sh ? sh+' show'+(sh===1?'':'s') : '', mv ? mv+' movie'+(mv===1?'':'s') : ''].filter(Boolean).join(' · ');
  }
  return list[0] ? list[0].title : '';
}
function _libTabsHTML(counts, lists){
  return '<div class="lib-tabrow"><div class="lib-tabs" role="tablist" aria-label="Status">'+LIB_TABS.map(function(t){
    var on = t.key === _libTab, n = counts[t.key];
    return '<button type="button" role="tab" class="lib-tab'+(on?' is-on':'')+(n?'':' is-empty')+'" id="libtab-'+t.slug+'" aria-controls="libPanel" aria-selected="'+on+'" tabindex="'+(on?0:-1)+'" data-tab="'+t.key+'">'
      + '<span class="lib-tab-ic" aria-hidden="true">'+icon(t.icon,16)+'</span><span class="lib-tab-txt"><span class="lib-tab-l">'+t.name+' <b>'+n+'</b></span>'
      + '<small>'+_libEsc(_libTabSummary(t.key, lists[t.key]))+'</small></span></button>';
  }).join('')+'</div>'+_libTypeBtnHTML('is-wide')+'</div>';
}
function _libGo(key, focus){
  if (!_libTabOf(key) || key === _libTab) return;
  _libTab = key; _libRememberTab(); renderLibrary();
  var b = document.getElementById('libtab-' + _libTabOf(key).slug); if (b && focus) b.focus();
  var p = document.getElementById('libPanel'); if (p) { p.classList.remove('is-in'); void p.offsetWidth; p.classList.add('is-in'); }
}
document.addEventListener('click', function(ev){
  var b = ev.target.closest && ev.target.closest('.lib-tab[data-tab]');
  if (b) _libGo(b.dataset.tab, false);
});
document.addEventListener('keydown', function(ev){
  var b = ev.target.closest && ev.target.closest('.lib-tab[data-tab]');
  if (!b) return;
  var i = LIB_TABS.findIndex(function(t){ return t.key === b.dataset.tab; }), j = null, rtl = document.documentElement.dir === 'rtl';
  if (ev.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) j = (i + 1) % LIB_TABS.length;
  else if (ev.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) j = (i + LIB_TABS.length - 1) % LIB_TABS.length;
  else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = LIB_TABS.length - 1;
  if (j == null) return;
  ev.preventDefault(); _libGo(LIB_TABS[j].key, true);
});

/* ── Toolbar: "Watching · 5 titles · sorted by Latest added", Sort, Filter, Grid / List ── */
var _libSearchOpen = false;
// phones (profile tabs): the search icon opens / closes the search row; closing it with words in it clears them
function _libToggleSearch(btn){
  var bar = btn.closest('.lib-bar'), open = !bar.classList.contains('is-search'), inp = bar.querySelector('.lib-bar-search input');
  _libSearchOpen = open;
  bar.classList.toggle('is-search', open); btn.classList.toggle('is-on', open); btn.setAttribute('aria-expanded', open);
  if (open) { if (inp) inp.focus(); return; }
  if (SF.query(LIB_SCOPE)) SF._search(LIB_SCOPE, '');
}
function _libToolbarHTML(key, n){
  var t = _libTabOf(key), sort = SF.getSort(LIB_SCOPE, key), sortName = SF.sortName(LIB_SCOPE, key, sort), fc = SF.filterCount(LIB_SCOPE, key), v = _libView(key);
  // profile tabs on phones: the search is an icon here, and opens as its own row under the tools (owner, 18 Nov 2026)
  var sOpen = !LIB_OWN_PAGE && (_libSearchOpen || !!SF.query(LIB_SCOPE));
  return '<div class="lib-bar'+(sOpen ? ' is-search' : '')+'"><div class="lib-bar-l"><h2 class="lib-bar-t">'+t.name+'</h2><span class="lib-bar-sub">'+n+' title'+(n===1?'':'s')+' · sorted by '+_libEsc(sortName)+'</span></div>'
    + '<div class="lib-bar-r">' + _libTypeBtnHTML('is-mini')
    + (LIB_OWN_PAGE ? '' : '<button type="button" class="lib-tool lib-search-tog'+(sOpen ? ' is-on' : '')+'" onclick="_libToggleSearch(this)" aria-label="Search this library" aria-expanded="'+sOpen+'">'+icon('search',15)+'</button>')
    + (key === 'completed' && LIB_SCOPE === 'lib' && n ? '<button type="button" class="lib-tool" onclick="_libExport()" aria-label="Export Watched">'+icon('download',15)+'<span class="lib-tool-l">Export</span></button>' : '')
    + '<button type="button" class="lib-tool'+(sort !== 'newest' ? ' is-on' : '')+'" onclick="SF.openSort(\''+LIB_SCOPE+'\',\''+key+'\')" aria-label="Sort, now '+_libEsc(sortName)+'">'+icon('sort',15)+'<span class="lib-tool-l">Sort: '+_libEsc(sortName)+'</span></button>'
    + '<button type="button" class="lib-tool'+(fc ? ' is-on' : '')+'" onclick="SF.openFilter(\''+LIB_SCOPE+'\',\''+key+'\')" aria-label="Filter'+(fc ? ', '+fc+' on' : '')+'">'+icon('filter',15)+'<span class="lib-tool-l">Filter'+(fc ? ' ('+fc+')' : '')+'</span>'+(fc ? '<span class="lib-tool-n" aria-hidden="true">'+fc+'</span>' : '')+'</button>'
    + '<div class="lib-vt" role="group" aria-label="View">'
    +   '<button type="button" class="lib-vt-b'+(v==='grid'?' is-on':'')+'" onclick="_libSetView(\''+key+'\',\'grid\')" aria-label="Grid view" aria-pressed="'+(v==='grid')+'">'+icon('grid',14)+'</button>'
    +   '<button type="button" class="lib-vt-b'+(v==='list'?' is-on':'')+'" onclick="_libSetView(\''+key+'\',\'list\')" aria-label="List view" aria-pressed="'+(v==='list')+'">'+icon('list',14)+'</button>'
    + '</div></div></div>';
}

/* ── Empty states (mssEmpty, config.js): the existing messages, popular picks and Browse ── */
function mssStarterSkip(){ return LIB_ENTRIES(); }
document.addEventListener('mss:library-changed', async function(){
  if (LIB_READONLY || typeof _pUser === 'undefined' || !_pUser) return;
  _pEntries = await getEntries(_pUser.id, LIB_CAT ? { cat: LIB_CAT } : {}); renderLibrary();
});
function _libClearFilters(sec){ SF.clearFilters(LIB_SCOPE, sec); renderLibrary(); }
function _libEmptyHTML(key){
  var cat = LIB_CAT, add = { label:'Add a title', icon:'plus', onclick:"openAddModal("+(cat?"'"+cat+"'":'')+")", primary:true };
  var browse = { label:'Browse Discover', icon:'compass', href:'discover.html' };
  if (_libBaseEntries(key).length) {
    if (SF.query(LIB_SCOPE) && !SF.filterCount(LIB_SCOPE, key)) return mssEmpty({ compact:true, art:'search', title:'No luck with “'+SF.query(LIB_SCOPE)+'”', text:'Nothing in '+_libTabOf(key).name+' matches. Try another title, a year, or check the spelling.',
      actions:[{ label:'Clear search', icon:'x', onclick:"SF._search('"+LIB_SCOPE+"', '', true)" }] });
    return mssEmpty({ compact:true, art:'filter', title:'Nothing matches these filters', text:'Your filters are a little too picky here. Loosen one and try again.',
      actions:[{ label:'Clear filters', icon:'x', onclick:"_libClearFilters('"+key+"')", primary:true }] });
  }
  // the Type picked hides everything here
  if (_libTypes && _libBaseEntries(key, LIB_ENTRIES()).length) return mssEmpty({ compact:true, art:'filter', title:'No ' + _libTypeLabel() + ' in ' + _libTabOf(key).name,
    text:'Your other types are still here. Show them all, or pick another type.', actions:[{ label:'All types', icon:'x', onclick:"_libSetTypes('')", primary:true }, { label:'Change type', icon:'layers', onclick:'_libTypePanel()' }] });
  if (LIB_READONLY) return mssEmpty({ compact:true, art:{ watching:'watching', queue:'watchlist', completed:'watched', dropped:'dropped' }[key],
    title:{ watching:'Not watching anything right now', queue:'Nothing on their watchlist', completed:'Nothing watched yet', dropped:'Nothing dropped' }[key] });
  var starter = LIB_OWN_PAGE ? (cat || 'all') : '';
  var o = {
    watching: { art:'watching', title:'Nothing on screen right now', text: _libBaseEntries('queue').length ? 'The couch is warm and the remote is ready. Start something from your watchlist.' : 'The couch is warm and the remote is ready.', actions:[add, browse] },
    queue: { art:'watchlist', title:'Your watchlist is empty', text:'Nothing queued up yet. Future you is going to be so bored.', actions:[add, browse] },
    completed: { art:'watched', title:'No finished titles yet', text:'Your trophy shelf is waiting. Finish something and it lands here, ready to rate.', actions:[browse] },
    dropped: { art:'dropped', title:'Nothing dropped', text:'You finish what you start. Respect.' }
  }[key];
  return mssEmpty(Object.assign({ compact:true, cls:'lib-empty', starter: key === 'dropped' ? '' : starter }, o));
}
function _libPick(){
  MSSPick.open({ pool:function(){ return _libBaseEntries('queue'); }, all:function(){ return LIB_ENTRIES(); }, user:_pUser,
    onStarted:function(){ document.dispatchEvent(new CustomEvent('mss:library-changed')); } });
}

/* ── Show more, in whole rows (owner, 14 Nov 2026): grid view starts with 5 full rows and Show more adds 3;
   list view starts with 10 rows and adds 5. A row is as many cards as fit (measured from the real grid, so phones,
   the Watching grid's 2 per row and the list's 1–2 per row all count right). Sort, filters and search work on the
   WHOLE list (SF.list); only the drawing stops, so ranks stay true. Changing the sort, a filter, the search or the
   view starts again from the first rows. ── */
var LIB_ROWS={ grid:[5,3], list:[10,5] }, _libRows={}, _libSig={}, _libColsAt={};
// how many cards one row holds, for this tab and view: a hidden copy of the grid at the panel's width
function _libCols(key){
  var grid=_libView(key)==='grid';
  var cls=grid ? 'msf-grid lib-grid'+(key==='watching'?' is-watch':'') : 'lp-grid'+(key==='queue'||key==='dropped'?' is-small':'');
  // a hidden block in the page beside the Library (it takes the same width, even while the Library is still hidden)
  var host=document.getElementById('libraryContent'), par=host&&host.parentElement;
  if(!par) return grid?6:2;
  var probe=document.createElement('div');
  probe.setAttribute('aria-hidden','true');
  probe.style.cssText='height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  probe.innerHTML='<div class="'+cls+'"><div></div></div>';
  par.appendChild(probe);
  var n=getComputedStyle(probe.firstChild).gridTemplateColumns.split(' ').filter(Boolean).length;
  probe.remove();
  return _libColsAt[key]=Math.max(1,n||(grid?6:2));
}
// how many cards to draw: extra (the big Watching card, the top 3) + whole rows
function _libCount(key,len,extra){
  extra=extra||0;
  var view=_libView(key)==='grid'?'grid':'list', f=SF.filterState(LIB_SCOPE,key), sig=[SF.query(LIB_SCOPE),SF.getSort(LIB_SCOPE,key),JSON.stringify(f),view].join('|');
  if(_libSig[key]!==sig){ _libSig[key]=sig; _libRows[key]=LIB_ROWS[view][0]; }
  var cols=_libCols(key);
  if(_libBackN) _libRows[key]=Math.max(_libRows[key],Math.ceil((_libBackN-extra)/cols));
  return Math.min(len,extra+(_libRows[key]||LIB_ROWS[view][0])*cols);
}
function _libMoreHTML(key,shown,total){
  if(shown>=total) return '';
  var view=_libView(key)==='grid'?'grid':'list', n=Math.min(LIB_ROWS[view][1]*(_libColsAt[key]||1), total-shown);
  return '<div class="msf-more"><button type="button" class="msf-more-btn" onclick="_libMoreGo(\''+key+'\')">Show '+n+' more <small>· '+(total-shown)+' left</small></button></div>';
}
function _libMoreGo(key){
  var body=document.getElementById('libPanel'), from=body?body.querySelectorAll('.lib-item').length:0;
  var view=_libView(key)==='grid'?'grid':'list';
  _libRows[key]=(_libRows[key]||LIB_ROWS[view][0])+LIB_ROWS[view][1];
  renderLibrary();
  body=document.getElementById('libPanel');
  var items=body?body.querySelectorAll('.lib-item'):[];
  var total=SF.list(LIB_SCOPE,key).length, now=items.length;
  var first=items[from];
  var target=first&&(first.querySelector('[role="button"], button.lp-title, .lp-title button')||first);
  if(target){ if(!target.hasAttribute('tabindex')&&!target.matches('a,button')) target.setAttribute('tabindex','-1'); target.focus({preventScroll:false}); }
  var live=document.getElementById('libLive'); if(live) live.textContent='Showing '+now+' of '+total;
}
// a wider or narrower window changes how many fit in a row: draw whole rows again
var _libResizeT=0;
addEventListener('resize',function(){ clearTimeout(_libResizeT); _libResizeT=setTimeout(function(){
  if(!_libTab||!document.getElementById('libPanel')) return;
  var was=_libColsAt[_libTab]; if(was&&_libCols(_libTab)!==was) renderLibrary();
},200); },{passive:true});
// Someone else's library: a title above your age limit shows blurred with a lock (088)
function _libAge(e,html){
  if(!LIB_READONLY||!e||!e.tmdb_id) return html;
  return html.replace(/^(\s*<[a-z]+)/i, '$1'+MSSAge.attr(e.tmdb_type||(e.cat==='movies'?'movie':'tv'), e.tmdb_id));
}
/* coming back from a title to a spot deep in a list: draw enough cards to reach it first */
var _libBackN=0;
try{ var _lb=JSON.parse(sessionStorage.getItem('mssScrollBack')||'null'); if(_lb&&_lb.boxes&&Object.keys(_lb.boxes).length) _libBackN=Math.min(400,Math.max.apply(null,Object.keys(_lb.boxes).map(function(k){var b=_lb.boxes[k];return Math.ceil(Math.max(b[0]/150,b[1]/70))+12;}))); }catch(_){}

/* ── Watched: the podium (your top 3) — only on Highest rated with no filter or search ── */
function _libPodiumOn(){
  return SF.getSort(LIB_SCOPE,'completed')==='highest' && !SF.filterCount(LIB_SCOPE,'completed') && !SF.query(LIB_SCOPE);
}
function _libPodiumHTML(top){
  return '<div class="lib-podium" role="list" aria-label="Your top 3">'+top.map(function(e,i){
    var t=mssTypeOf(e.cat,mssIsMovieEntry(e)), s=liveScore(e), m=mssMetaOf(e);
    var note=e.notes&&!mssIsSpoiler(e)?_trimNotes(MSSRich.plain(e.notes)):'';
    return '<div class="lib-pod lib-pod-'+(i+1)+'" role="listitem"><div class="lib-pod-in" role="button" tabindex="0" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'"'
      +' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}"'
      +' aria-label="'+escHTML(e.title+', '+(e.year||'')+', '+t.label+', your score '+Number(s).toFixed(2)+(mssRewatchCount(e)>1?', watched '+mssRewatchCount(e)+' times':'')+', rank '+(i+1))+'">'
      +(e.tmdb_id?'<img class="lib-pod-bg is-bd" data-bd="'+escHTML(MSSBackdrop.key(e))+'"'+(MSSBackdrop.style(e,true,'top')?' style="'+escHTML(MSSBackdrop.style(e,true,'top'))+'"':'')+' alt="">':'')
      +(safeURL(e.poster_url)?'<img class="lib-pod-bg is-blur" src="'+safeURL(e.poster_url)+'" alt="" loading="lazy">':'')
      +'<span class="cg-rank-badge cg-rank-'+(i+1)+'" aria-hidden="true">'+(i+1)+'</span>'
      +(mssRewatchCount(e)>1?'<div class="msf-card__tr lib-pod-tr" aria-hidden="true">'+mssRewatchBadgeHTML(mssRewatchCount(e))+'</div>':'')
      +'<div class="lib-pod-body"><div class="lib-pod-main"><span class="lib-pod-poster" aria-hidden="true">'+posterHTML(e,'',LIB_LIST_PX)+'</span>'
      +'<div class="lib-pod-txt"><div class="lib-pod-title" translate="no">'+escHTML(e.title)+'</div>'
      +mssPhotoTagsHTML(e, { genres: i ? 0 : 2, cls: 'lib-pod-tags' })
      // favourites and your review: under the title, beside the poster (owner, 17 Nov 2026)
      +_libFavChips(e, 'lp-favs lib-pod-favs')+(note?'<p class="lib-pod-note">'+escHTML(note)+'</p>':'')+'</div>'
      +'<div class="lib-pod-score" aria-hidden="true">'+mssScoreRing(s, 'lib-pod-ring')+'</div></div>'
      +'</div></div></div>';
  }).join('')+'</div>';
}
// Export (Watched): the export studio loads only when it's asked for
var LIB_EXPORT_JS=['js/vendor/jspdf-2.5.1.umd.min.js','js/export.js','js/taste-profile.js','js/year-review.js','js/export-formats.js','js/export-image.js','js/export-studio.js'];
function _libExportLoad(){
  return LIB_EXPORT_JS.reduce(function(p,src){ return p.then(function(){ return new Promise(function(ok,no){
    if(document.querySelector('script[src="'+src+'"]')) return ok();
    var s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=no; document.body.appendChild(s); }); }); }, Promise.resolve());
}
function _libExport(){
  var p=window._navUserProfile||{}, all=_libBaseEntries('completed'), shown=SF.list(LIB_SCOPE,'completed');
  _libExportLoad().then(function(){
    MSSStudio.open({ who:{ name:p.display_name||p.username||'', username:p.username||'', avatar_url:p.avatar_url||'' },
      preset:{ what:'watched', sort:SF.getSort(LIB_SCOPE,'completed')==='highest'?'score':'recent' },
      custom: shown.length && shown.length!==all.length ? { label:'Watched · as filtered here', entries:shown } : null,
      load:function(){ return getEntries(_pUser.id); } });
  }).catch(function(){ showToast('Couldn’t open Export — check your connection.','err'); });
}

/* ── One status's cards ── */
function _libSectionHTML(key, list){
  if (!list.length) return _libEmptyHTML(key);
  var grid = _libView(key) === 'grid', n, html = '', i, e;
  var sort = SF.getSort(LIB_SCOPE, key), ranked = key === 'completed' && (sort === 'highest' || sort === 'lowest'), rk = sort.indexOf('rating:') === 0 ? sort.slice(7) : null;
  var wrap = function(e, h){ return _libAge(e, h.replace(/^(\s*<[a-z]+)( class=")/i, '$1$2lib-item ')); };
  if (key === 'watching') {
    // the main card (the one you progressed last) stays the big list card on top, in grid view too
    var main = _libMainId(list), top = '', start = 0;
    // only one title in Watching (Up next and Taking a break too): always the big card
    if ((main && list[0] && list[0].id === main) || list.length === 1) { top =wrap(list[0], _libProg(list[0], true)); start = 1; }
    n = _libCount(key, list.length, start);
    for (i = start; i < n; i++) { e = list[i];
      html += wrap(e, grid ? _libCard(e, { controls: _libCtrls(e, 'grid') }) : _libProg(e, false)); }
    if (grid) return (top ? '<div class="lp-grid lp-top">' + top + '</div>' : '') + (html ? '<div class="msf-grid lib-grid is-watch">' + html + '</div>' : '') + _libMoreHTML(key, n, list.length);
    return '<div class="lp-grid">' + top + html + '</div>' + _libMoreHTML(key, n, list.length);
  }
  if (key === 'completed') {
    var pod = _libPodiumOn() && list.length >= 3, from = pod ? 3 : 0; n = _libCount(key, list.length, from);
    var o = function(e, i){ return rk ? { rankHTML:_libRatingBadge(e, rk) } : ranked ? { rank:SF.rank(e, i) } : {}; };
    // list: the Watching card's design, with the sorted rating (a specific rating) or the rank (highest / lowest)
    var lo = function(e, i){ return rk ? { value: mssRatingValue(e, rk) } : ranked ? { rank: SF.rank(e, i) } : {}; };
    for (i = from; i < n; i++) { e = list[i]; html += wrap(e, grid ? _libCard(e, o(e, i)) : _libProg(e, false, lo(e, i))); }
    return (pod ? _libPodiumHTML(list.slice(0,3)) + (list.length > 3 ? '<div class="lib-rest-head"><span>Everything else</span><span class="section-pill">#4 – #'+list.length+'</span></div>' : '') : '')
      + (grid ? '<div class="msf-grid lib-grid">' : '<div class="lp-grid">') + html + '</div>' + _libMoreHTML(key, n, list.length);
  }
  n = _libCount(key, list.length, 0);
  for (i = 0; i < n; i++) { e = list[i];
    var ctl = _libCtrls(e, 'grid');
    html += wrap(e, grid ? _libCard(e, ctl ? { controls: ctl } : {}) : _libProg(e, false)); }
  return (grid ? '<div class="msf-grid lib-grid">' : '<div class="lp-grid is-small">') + html + '</div>' + _libMoreHTML(key, n, list.length);
}

/* ── Header (library.html and the category pages): kicker, count line, search, Pick for me, + Add ── */
function _libHeader(lists){
  var tools = document.getElementById('libHeadTools');
  if (tools && !tools.dataset.ready) {
    tools.dataset.ready = '1';
    var label = LIB_CAT ? LIB_CAT_META[LIB_CAT].label : 'library';
    tools.innerHTML = '<div class="lib-search">' + SF.searchHTML(LIB_SCOPE, 'Search your ' + (LIB_CAT ? label : 'library') + '… title, year') + '</div>'
      + (typeof MSSPick !== 'undefined' ? '<span class="lib-pick">' + MSSPick.buttonHTML('_libPick()', true) + '</span>' : '')
      + (LIB_CAT ? '<button type="button" class="btn-add-entry" onclick="openAddModal(\''+LIB_CAT+'\')" aria-label="Add ' + (/^[aeiou]/.test(LIB_CAT_META[LIB_CAT].one) ? 'an ' : 'a ') + LIB_CAT_META[LIB_CAT].one + '">'
        + '<span aria-hidden="true">+</span><span class="lib-add-l" aria-hidden="true">' + LIB_CAT_META[LIB_CAT].add.slice(2) + '</span></button>' : '');
  }
  var pick = tools && tools.querySelector('.qp-trigger');
  if (pick) pick.disabled = !lists.queue.length;
  var all = LIB_ENTRIES().length, k = document.getElementById('libKicker'), sub = document.getElementById('libPageSub');
  if (k) k.textContent = (LIB_GUEST ? 'Example library · ' : 'Your collection · ') + all.toLocaleString(MSSI18n.locale) + ' title' + (all === 1 ? '' : 's');
  if (sub) sub.textContent = lists.watching.length + ' in progress · ' + lists.queue.length + ' queued · ' + lists.completed.length + ' watched';
}

function renderLibrary(){
  try { _libRender(); }
  catch (err) {
    console.error('Library render failed:', err);
    var el = document.getElementById('libraryContent'), loading = document.getElementById('libraryLoading');
    if (loading) loading.style.display = 'none';
    if (el) { el.style.display = 'block'; el.innerHTML = '<div class="fv-empty">Couldn’t show this library — ' + escHTML(String(err && err.message || err)) + '</div>'; }
  }
}
function _libRender(){
  var el=document.getElementById('libraryContent'), loading=document.getElementById('libraryLoading');
  if(!el) return;
  var base = {}, counts = {}, q = SF.query(LIB_SCOPE);
  LIB_TABS.forEach(function(t){ base[t.key] = _libBaseEntries(t.key); });
  // searching: each tab counts its matches
  LIB_TABS.forEach(function(t){ counts[t.key] = q ? SF.list(LIB_SCOPE, t.key).length : base[t.key].length; });
  if (!_libTab) { var first = LIB_TABS.filter(function(t){ return base[t.key].length; })[0]; _libTab = first ? first.key : 'watching'; }
  if (LIB_OWN_PAGE) _libHeader(base);
  _libCheckNewEps();

  var list = SF.list(LIB_SCOPE, _libTab), tabName = _libTabOf(_libTab).slug;
  var top = _libGlanceHTML(_libGlance(_libAll()));               // every Library, a friend's too (their titles)
  var body;
  // A brand-new library: one welcome (with a few popular titles) instead of four empty tabs
  if (!q && !LIB_ENTRIES().length) {
    top = '';
    body = LIB_READONLY ? mssEmpty({ art:'watchlist', title:'Nothing here yet', text:'Their folio is still a blank page.' })
      : mssEmpty({ art:'watchlist', title: LIB_CAT ? 'No ' + { tv:'TV shows', movies:'movies', anime:'anime', cartoons:'cartoons' }[LIB_CAT] + ' yet' : 'Your folio starts here',
          text:'Every great collection starts with one title. No pressure — but it does look a little lonely in here.',
          actions:[{ label:'Add a title', icon:'plus', onclick:"openAddModal("+(LIB_CAT?"'"+LIB_CAT+"'":'')+")", primary:true }, { label:'Browse Discover', icon:'compass', href:'discover.html' }],
          starter: LIB_OWN_PAGE ? (LIB_CAT || 'all') : '' });
  } else {
    body = _libTabsHTML(counts, base)
      + '<div class="lib-panel is-in" id="libPanel" role="tabpanel" aria-labelledby="libtab-'+tabName+'" data-sec="'+_libTab+'">'
      + _libToolbarHTML(_libTab, list.length) + _libSectionHTML(_libTab, list) + '</div>';
  }
  // the search box (your own pages: in the header; profile tabs: in the toolbar, before Sort — the Library's look,
  // owner 14 Nov 2026) is made once and moved into each new toolbar, so typing keeps its focus
  if(!el.querySelector('#libSecs')){
    el.innerHTML=(LIB_OWN_PAGE ? '' : '<div id="libSearchHold" hidden><div class="lib-search lib-bar-search">'+SF.searchHTML(LIB_SCOPE, LIB_READONLY ? 'Search this library…' : 'Search your library…')+'</div></div>')
      +'<div id="libTop"></div><div id="libSecs"></div><div class="sr-only" id="libLive" aria-live="polite"></div>';
  }
  if(!q&&!F_any()) mssSkeleton.shape('lib_'+LIB_SCOPE+(LIB_CAT||''), { tab:_libTab, view:_libView(_libTab), n:Math.min(list.length, 10) });
  mssKeepScroll(el, function(){
    if(loading){loading.style.display='none';loading.innerHTML='';}
    el.style.display='block';
    el.querySelector('#libTop').innerHTML = top;
    var sbox = el.querySelector('.lib-bar-search'), sinp = sbox && sbox.querySelector('input'), had = sinp && document.activeElement === sinp, caret = had ? sinp.selectionStart : 0;
    if (sbox) el.querySelector('#libSearchHold').appendChild(sbox);   // out of the old toolbar before it's replaced
    el.querySelector('#libSecs').innerHTML = body;
    var bar = sbox && el.querySelector('#libSecs .lib-bar-r');
    if (bar) { bar.insertBefore(sbox, bar.querySelector('.lib-tool') || bar.firstChild); if (had) { sinp.focus({ preventScroll:true }); sinp.setSelectionRange(caret, caret); } }
    if (typeof _dmBackdrops === 'function') { var pd=el.querySelector('.lib-podium'); if(pd) _dmBackdrops(pd); }
    // the podium's titles: their name artwork (nav.js mssPaintLogo)
    if (typeof mssPaintLogo === 'function') el.querySelectorAll('.lib-pod-in[data-id]').forEach(function(p){ mssPaintLogo(p.querySelector('.lib-pod-title'), LIB_ENTRIES().find(function(x){ return x.id === p.dataset.id; })); });
  });
  _libEpNames(el);
  mssScrollReturn(el);
  _libBackN=0;
  _libRememberTab();
}
function F_any(){ return SF.filterCount(LIB_SCOPE, _libTab) > 0; }

/* ── Loading skeleton: At a glance, the tabs and the open status in the view you chose, masked ── */
mssSkeleton.define('library', function(){
  var sh = mssSkeleton.shape('lib_'+LIB_SCOPE+(LIB_CAT||'')) || { tab:'watching', view:'list', n:4 };
  var fake = function(st){ return { id:'', title:'Sample title', year:'2024', cat:LIB_CAT||'tv', status:st, season:1, episode:4, total_eps:10, watched:4, ratings:{} }; };
  var st = { watching:'watching', completed:'completed', queue:'queue', dropped:'dropped' }[sh.tab] || 'watching', n = Math.max(2, Math.min(sh.n || 4, 8)), cards = '';
  for (var i = 0; i < n; i++) cards += sh.view === 'grid' ? MSSCard.poster(_libCardOpts(fake(st))) : _libProg(fake(st), false).replace(/ onclick="[^"]*"/g, '');
  var keep = function(h){ return h.replace(/class="(lib-tab-l|lg-kicker|lg-h|lib-bar-t)"/g, 'class="$1" data-skel-keep'); };
  var g = { avg:7.5, rated:10, nine:1, eps:100, mins:600, titles:20, bands:[['9–10',1],['8–9',3],['7–8',4],['Under 7',2]], types:null, recent:[], done:10, finger:{ axes:['narrative','visual','creative','emotion','atmosphere'].map(function(id, k){ return { id:id, short:_LIB_FP[id][0], name:_LIB_FP[id][1], avg:7 + k * .2, n:2 }; }) } };
  g.finger.best = g.finger.axes[4]; g.finger.worst = g.finger.axes[0];
  return keep(_libGlanceHTML(g) + '<div class="lib-tabs">'+LIB_TABS.map(function(t){ return '<span class="lib-tab'+(t.key===sh.tab?' is-on':'')+'"><span class="lib-tab-ic">'+icon(t.icon,16)+'</span><span class="lib-tab-txt"><span class="lib-tab-l">'+t.name+'</span><small>Sample summary</small></span></span>'; }).join('')+'</div>'
    + (sh.view === 'grid' ? '<div class="msf-grid lib-grid">'+cards+'</div>' : '<div class="lp-grid">'+cards+'</div>'));
});

/* ── library.html and the category pages: sign-in, load, ?focus=, the + Add hand-off from a profile ── */
function _libInitPage(){
  // Back / Forward can restore this page from the bfcache with old data: reload if something changed meanwhile
  window.addEventListener('pageshow', function(ev){ if (ev.persisted && mssDataChangedSince(window._mssPageAt)) location.reload(); });
  document.addEventListener('DOMContentLoaded', function(){
    initPage(async function(user, profile){
      // A guest (owner, 19 Nov 2026): the page as it will look, with the example library (the Home preview's titles), read-only
      if (!user) {
        await mssLoadScript('js/home-guest.js');
        LIB_GUEST = LIB_READONLY = true; LIB_CTRL = false;
        _pEntries = mssGuestLibrary().filter(function(e){ return !LIB_CAT || e.cat === LIB_CAT; });
        var g = MSS_GUEST[LIB_CAT || 'library'], head = document.querySelector('.lib-head');
        if (head) head.insertAdjacentHTML('afterend', '<section class="lib-guest" aria-label="About this example">'
          + '<span class="lib-guest-ic" aria-hidden="true">' + icon('sparkles', 18) + '</span>'
          + '<div class="lib-guest-t"><b>' + escHTML(g.title) + '</b><span>This is an example ' + (LIB_CAT ? LIB_CAT_META[LIB_CAT].label.toLowerCase() : 'library') + '. Yours fills up as you track what you watch.</span></div>'
          + '<div class="lib-guest-acts"><a class="lc-btn is-primary" href="login.html#signup">' + icon('sparkles', 15) + '<span>Create a free account</span></a><a class="lc-btn" href="login.html"><span>Sign in</span></a></div></section>');
        renderLibrary();
        return;
      }
      _pUser = user; _pProfile = profile;
      _pEntries = await getEntries(user.id, LIB_CAT ? { cat: LIB_CAT } : {});
      renderLibrary();
      _libResume();
      _libFocusEntry();
      _libAddHandOff();
    });
  });
}
// ?focus=<entry id> (title page → "In your library"): open its status, bring the card into view, spotlight it
function _libFocusEntry(){
  var url = new URL(location.href), id = url.searchParams.get('focus');
  if (!id) return;
  url.searchParams.delete('focus');
  history.replaceState(history.state, '', url.pathname.split('/').pop() + url.search + url.hash);
  var e = _libEntry(id); if (!e) return;
  var key = { watching:'watching', up_next:'watching', paused:'watching', ongoing:_libWaiting(e) ? 'completed' : 'watching', queue:'queue', completed:'completed', dropped:'dropped' }[e.status];
  if (key && key !== _libTab) { _libTab = key; renderLibrary(); }
  var find = function(){ return document.querySelector('#libPanel [data-id="'+CSS.escape(id)+'"]'); };
  var inList = function(){ return SF.list(LIB_SCOPE, _libTab).some(function(x){ return String(x.id) === String(id); }); };
  // hidden by the search, a filter or the Type filter → clear just those so it shows (and say so)
  var cleared = [];
  if (!find() && !inList()) {
    if (SF.query(LIB_SCOPE)) { SF._search(LIB_SCOPE, ''); cleared.push('search'); renderLibrary(); }
    if (!inList() && SF.filterCount(LIB_SCOPE, _libTab)) { SF.clearFilters(LIB_SCOPE, _libTab); cleared.push('filters'); renderLibrary(); }
    if (!inList() && _libTypes && !_libInTypes(e)) { _libSetTypes(''); cleared.push('type'); }
  }
  // further down the list → Show more until its card is drawn (owner, 14 Nov 2026)
  var view = _libView(_libTab) === 'grid' ? 'grid' : 'list';
  for (var i = 0; i < 200 && !find() && inList(); i++) {
    _libRows[_libTab] = (_libRows[_libTab] || LIB_ROWS[view][0]) + LIB_ROWS[view][1];
    renderLibrary();
  }
  var card = find();
  if (!card) { showToast('It’s in your library, but this page can’t show it right now.'); return; }
  if (cleared.length) showToast('Cleared your ' + cleared.join(' and ').replace('type', 'Type filter') + ' to show it.');
  setTimeout(function(){
    // the page may have redrawn since (the new-episode check): use the card on the page now, drawn far enough
    var tries = 0;
    while (!(card = find()) && inList() && tries++ < 200) { _libRows[_libTab] = (_libRows[_libTab] || LIB_ROWS[view][0]) + LIB_ROWS[view][1]; renderLibrary(); }
    if (!card) return;
    var behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    var r = card.getBoundingClientRect(), top = (document.getElementById('mainNav') || { getBoundingClientRect:function(){ return { bottom:0 }; } }).getBoundingClientRect().bottom;
    window.scrollTo({ top: scrollY + r.top - top - Math.max(16, (innerHeight - top - r.height) / 2), behavior: behavior });
    card.classList.remove('mss-spotlight'); void card.offsetWidth; card.classList.add('mss-spotlight');
    setTimeout(function(){ card.classList.remove('mss-spotlight'); }, 3600);
  }, 250);
}
// "Add to Watchlist" on someone's profile → this page opens + Add with the title filled in
function _libAddHandOff(){
  var t = sessionStorage.getItem('addModalTitle'), c = sessionStorage.getItem('addModalCat');
  if (!t || !LIB_CAT) return;
  sessionStorage.removeItem('addModalTitle'); sessionStorage.removeItem('addModalCat');
  if (c && c !== LIB_CAT) return;
  setTimeout(function(){
    openAddModal(LIB_CAT).then(function(){ var el = document.getElementById('mTitle'); if (el) { el.value = t; el.dispatchEvent(new Event('input')); } });
  }, 400);
}
