/* ═══════════════════════════════════════════════════════════════
   library-view.js — THE Library (v667)

   The Library section — stats, Type filter, Currently Watching · Watchlist ·
   Watched with list / grid views, Sort & Filter, rank / rating badges —
   shared by library.html, the Library tab on profile.html and on
   profile-view.html (read-only), so all three look and work the same.

   Set before this file loads (defaults = your own Library page):
     window.LIB_SCOPE    = 'lib' | 'prof' | 'pv'   Sort & Filter scope
     window.LIB_READONLY = true                    someone else's library
     window.LIB_ENTRIES  = () => entries           (default: _pEntries)
     window.LIB_PROFILE  = () => profile           whose library (read-only)
   The page provides #libraryContent / #libraryLoading.
   _libOpen(id) opens a title in Info · Ratings · Note (MSSViews) — the
   pages use it too (favorites, Notes / Lists tabs). Comments open in the
   shared MSSComments popup (comments.js).
═══════════════════════════════════════════════════════════════ */

var LIB_SCOPE    = window.LIB_SCOPE || 'lib';
var LIB_READONLY = !!window.LIB_READONLY;
var LIB_ENTRIES  = window.LIB_ENTRIES || function(){ return _pEntries; };

// A title → Info · Ratings · Note (opens on Ratings once it's rated)
function _libOpen(id, start) {
  var e = LIB_ENTRIES().filter(function(x){ return x.id === id; })[0];
  if (!e) return;
  var rated = e.status === 'completed' || e.status === 'ongoing' || e.status === 'dropped' || liveScore(e) != null;
  start = start || (rated ? 'rate' : 'info');
  if (LIB_READONLY) { MSSViews.open(e, { start: start, profile: (window.LIB_PROFILE && window.LIB_PROFILE()) || {} }); return; }
  MSSViews.open(e, {
    start: start, own: true, from: location.pathname.split('/').pop() || 'library.html',
    onChange: function(){ renderLibrary(); }, onNoteSaved: function(){ renderLibrary(); },
    onDelete: _libRemove
  });
}
// Back from a page you opened inside a title's popup (a director, an actor…)
// → reopen that title on the same view. Pages call this once their titles are in.
function _libResume() {
  var r = MSSViews.resume();
  if (r) _libOpen(r.id, r.view);
}
/* To Be Continued shows with new episodes out (mssNewEpisodes, config.js) — your own Library only:
   the "New Season" poster cover + badge, first in Watched (default sort) and an Up Next button.
   Nothing moves until you tap it. */
var _libNewEps = {}, _libNewKey = null;
var _libFixedUnaired = false;
function _libCheckNewEps(){
  if (LIB_READONLY || typeof mssNewEpisodes !== 'function') return;
  // once per visit: shows saved with seasons that aren't out yet → aired counts (mssFixUnaired, config.js)
  if (!_libFixedUnaired && typeof _pUser !== 'undefined' && _pUser) { _libFixedUnaired = true; mssFixUnaired(LIB_ENTRIES(), _pUser.id, renderLibrary); }
  var key = LIB_ENTRIES().filter(function(e){ return e.status === 'ongoing'; }).map(function(e){ return e.id; }).join(',');
  if (key === _libNewKey) return;
  _libNewKey = key;
  mssNewEpisodes(LIB_ENTRIES()).then(function(found){
    if (JSON.stringify(found) === JSON.stringify(_libNewEps)) return;
    _libNewEps = found; renderLibrary();
  });
}
function _libNewEp(e){ return !LIB_READONLY && e.status === 'ongoing' ? _libNewEps[e.id] || null : null; }
async function _libUpNext(id){
  var e = LIB_ENTRIES().filter(function(x){ return x.id === id; })[0];
  if (!e) return;
  try {
    await updateProgress(id, _pUser.id, { status: 'up_next' });
    e.status = 'up_next';
    showToast('Added to Up Next!');
    renderLibrary();
  } catch (err) { console.error(err); showToast('Error updating. Please try again.', 'err'); }
}
function _libUpNextBtn(e, grid){
  return grid
    ? '<button type="button" class="continue-btn" onclick="event.stopPropagation();_libUpNext(\''+e.id+'\')">'+icon('skipForward',15)+' Up Next</button>'
    : '<button type="button" class="w-list-action-btn up-next-btn" onclick="event.stopPropagation();_libUpNext(\''+e.id+'\')" title="Watch this next (Up Next)" aria-label="Up Next">'+icon('skipForward',15)+'</button>';
}
// Your own title was deleted → drop it and redraw
function _libRemove(x) {
  _pEntries = _pEntries.filter(function(en){ return en.id !== x.id; });
  renderLibrary();
}
var LIB_KEY      = LIB_SCOPE === 'pv' ? 'pv_' : 'prof_';    // remembered list / grid choice
var _LIB_ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
var _LIB_ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

var _libSort = {watching:'newest',queue:'newest',completed:'newest',dropped:'newest'};
// Dropped starts closed every time you come to the page — opening it lasts only while you're here
var _libCollapsed = {watching:false,queue:false,completed:false,dropped:true};
window.addEventListener('pageshow', function(ev){ if (ev.persisted && !_libCollapsed.dropped) _libToggleSec('dropped'); });   // Back / Forward restore → closed again
var _libWatchView = localStorage.getItem(LIB_KEY+'libWatchView')||'list';
var _libQueueView = localStorage.getItem(LIB_KEY+'libQueueView')||'grid';
var _libCompView  = localStorage.getItem(LIB_KEY+'libCompView')||'list';
var _libDropView  = localStorage.getItem(LIB_KEY+'libDropView')||'list';
var _libCatFilter = '';
var _libEntries = [];

// Comments strip → the shared comments popup
function _libCcBtn(id) { return MSSComments.buttonHTML("event.stopPropagation();_libComments('" + id + "')"); }
function _libComments(id) {
  var e = _libEntries.filter(function(x){ return x.id === id; })[0];
  if (e) MSSComments.open(e);
}
function _trimNotes(text) {
  if (!text) return '';
  var words = text.trim().split(/\s+/);
  return words.length > 150 ? words.slice(0, 150).join(' ') + '…' : text;
}


// Always shows Movie/TV Show regardless of category — unlike getTypeBadge()
// (which only shows for anime/cartoons), library.html mixes all categories
// in one section, so every entry needs the tag, matching what the grid
// views here already do.
function _libTypeBadge(isMovie) {
  return '<span class="'+(isMovie?'type-label':'type-label type-label-tv')+'">'+(isMovie?'Movie':'TV Show')+'</span>';
}
function _libQueueScope(e) {
  if (e.cat==='movies'||e.ratings?._media_type==='movie') {
    var rtH=Number(e.runtime_h)||0,rtM=Number(e.runtime_m)||0;
    if (rtH||rtM) return rtH?rtH+'h '+rtM+'m':rtM+'m';
    return '';
  }
  var bd=Array.isArray(e.ratings?._season_breakdown)?e.ratings._season_breakdown.filter(function(n){return parseInt(n)>0;}).map(Number):[];
  if (bd.length){var tot=bd.reduce(function(a,b){return a+b;},0);return 'S'+bd.length+' · E'+tot;}
  if (e.total_seasons&&e.total_eps) return 'S'+e.total_seasons+' · E'+e.total_eps;
  if (e.total_seasons) return 'S'+e.total_seasons;
  if (e.total_eps) return e.total_eps+' eps';
  return '';
}
function _ratingVal(e,key){
  var v=e.ratings&&e.ratings[key];
  return (v!==undefined&&v!==null&&v!=='')?Number(v):null;
}
function _libRatingBadge(e,key){
  var val=_ratingVal(e,key);
  if(val==null)return '<div class="cg-score-badge cg-score-none">-</div>';
  var cls=val>=10?'cg-score-10':val>=9?'cg-score-9':val>=8?'cg-score-8':val>=7?'cg-score-7':val>=6?'cg-score-6':val>=3?'cg-score-3-5':'cg-score-0-2';
  return '<div class="cg-score-badge '+cls+'">★ '+val.toFixed(2)+'</div>';
}

/* This page mixes every category, so the rating list is the full union
   across TV/Movies and Anime/Cartoons (e.g. "Acting" and "Voice Acting"
   both appear as separate options, since they're different keys on
   different entries), deduplicated where a key is genuinely shared. */
function _ratingFilterOptionsAll(){
  var seen={}; var opts=[];
  CORE_RATINGS.concat(ANIME_CORE_RATINGS).forEach(function(r){
    if(seen[r.key])return; seen[r.key]=1;
    opts.push({key:r.key,label:r.label,group:'Core'});
  });
  if(!seen.animation){seen.animation=1;opts.push({key:'animation',label:'Animation Quality',group:'Core'});}
  var seenB={};
  BONUS_RATINGS.concat(ANIME_BONUS_RATINGS).forEach(function(r){
    if(seenB[r.key])return; seenB[r.key]=1;
    opts.push({key:r.key,label:r.label,group:'Bonus'});
  });
  return opts;
}
function _ratingFilterLabelAll(key){
  var opt=_ratingFilterOptionsAll().filter(function(o){return o.key===key;})[0];
  return opt?opt.label:key;
}

function _libCatFilterBar() {
  return '<div class="sf-trigger-row" style="justify-content:flex-start;">'
    + SF.typeFilterButton('openLibTypeFilterPopup()', _libCatFilter ? _libCatLabels[_libCatFilter] + (_libFormat ? ' · ' + _libFormatLabels[_libFormat] : '') : 'Filter', !!_libCatFilter)
    + '</div>';
}

var _libCatLabels = { '':'All Types', tv:'TV Shows', movies:'Movies', anime:'Anime', cartoons:'Cartoons' };
// Anime & Cartoons mix series and films — a second "Format" choice
// (Shows / Movies) appears under Type when one of them is picked.
var _libFormat = '';
var _libFormatLabels = { '':'All Formats', show:'Shows', movie:'Movies' };
function _libHasFormats(cat) { return cat === 'anime' || cat === 'cartoons'; }
// Type (+ Format for Anime / Cartoons) — the shared Type filter popup (SF.typeFilter)
function openLibTypeFilterPopup() {
  var opts = function(o){ return Object.keys(o).map(function(k){ return [k, o[k]]; }); };
  SF.typeFilter({
    groups: [
      { key:'cat', label:'Type', options: opts(_libCatLabels) },
      { key:'format', label:'Format', options: opts(_libFormatLabels), when: function(st){ return _libHasFormats(st.cat); },
        hint: function(st){ return '(' + _libCatLabels[st.cat] + ' has both)'; } },
    ],
    value: { cat:_libCatFilter, format:_libFormat },
    onApply: function(v) {
      _libCatFilter = v.cat;
      _libFormat = _libHasFormats(v.cat) ? v.format : '';
      SF.invalidate(_sfScope()); // actor names depend on which types are shown
      renderLibrary();
    }
  });
}

/* ══ Sort & Filter — shared js/sort-filter.js module ══
   Only what's specific to this page lives here; the popups, sorting and
   filtering logic are the same code every page uses. */
function _libBaseEntries(sec){
  var inCat=function(e){
    if(_libCatFilter && e.cat!==_libCatFilter) return false;
    if(_libFormat && (_libFormat==='movie') !== SF.isMovie(e)) return false;   // Anime/Cartoons: Shows vs Movies
    return true;
  };
  if(sec==='watching') return _libEntries.filter(function(e){return (e.status==='watching'||e.status==='up_next'||e.status==='paused')&&inCat(e);});
  if(sec==='queue') return _libEntries.filter(function(e){return e.status==='queue'&&inCat(e);});
  if(sec==='dropped') return _libEntries.filter(function(e){return e.status==='dropped'&&inCat(e);});
  return _libEntries.filter(function(e){return (e.status==='completed'||e.status==='ongoing')&&inCat(e);});
}
SF.register(LIB_SCOPE, {
  watched: function(sec){ return sec==='completed'; },   // Year Watched filter
  base: _libBaseEntries,
  render: function(){ renderLibrary(); },
  onSearch: function(){ renderLibrary(); },     // search narrows all three sections at once
  sortState: _libSort,
  // Runtime only once movies can be present, Episode Count only once shows can
  sorts: function(){ return ['alpha','added','release','ratings', _libCatFilter!=='tv'&&_libFormat!=='show'&&'runtime', _libCatFilter!=='movies'&&_libFormat!=='movie'&&'seasons', _libCatFilter!=='movies'&&_libFormat!=='movie'&&'episodes']; },
  lengthKind: function(){ return _libCatFilter==='movies'||_libFormat==='movie'?'movie':_libCatFilter==='tv'||_libFormat==='show'?'show':'mixed'; },
  choiceFilters: function(sec){
    return sec==='completed' ? [{ key:'status', label:'Status', options:[['','All'],['completed','Watched'],['ongoing','To Be Continued']] }] : [];
  },
  ratingSort: {
    show: function(sec){ return sec==='completed'; },
    options: _ratingFilterOptionsAll,
    label: _ratingFilterLabelAll,
    value: _ratingVal,
  },
  // Paused entries always sink to the bottom of Currently Watching
  postSort: function(sec,list){
    if (sec==='completed' && SF.getSort(LIB_SCOPE,'completed')==='newest') return list.filter(function(e){return _libNewEp(e);}).concat(list.filter(function(e){return !_libNewEp(e);}));
    return sec==='watching' ? list.filter(function(e){return e.status==='watching';}).concat(list.filter(function(e){return e.status==='up_next';}), list.filter(function(e){return e.status==='paused';})) : list;
  },
  // quick rating edits from the Sort popup — your own library only
  saveRatings: LIB_READONLY ? undefined : function(e,r){ return updateProgress(e.id,_pUser.id,{ratings:r}).catch(function(){}); },
});
function _sfScope(){ return LIB_SCOPE; }
function _libSortBar(sec){ return SF.bar(LIB_SCOPE, sec); }
function setLibSort(sec,val){ SF.setSort(LIB_SCOPE, sec, val); }

function _libToggleSec(key){
  _libCollapsed[key]=!_libCollapsed[key];
  var el=document.getElementById('libbody-'+key);
  if(el)el.classList.toggle('open',!_libCollapsed[key]);
  var ch=document.querySelector('#libsec-'+key+' .chevron-btn svg');   // the arrow follows open / closed
  if(ch)ch.style.transform=_libCollapsed[key]?'rotate(-90deg)':'';
  if(!_libCollapsed[key]) setTimeout(_libCheckMore,420);    // once it has opened
}
function _libViewToggle(vk){
  if(vk==='watch'){_libWatchView=_libWatchView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libWatchView',_libWatchView);}
  else if(vk==='queue'){_libQueueView=_libQueueView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libQueueView',_libQueueView);}
  else if(vk==='drop'){_libDropView=_libDropView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libDropView',_libDropView);}
  else{_libCompView=_libCompView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libCompView',_libCompView);}
  renderLibrary();
}
function _libSection(key,title,count,vk,sk,content){
  var searching=!!SF.query(LIB_SCOPE);
  if(searching&&!count)return '';                 // no matches in this section
  var isOpen=searching||!_libCollapsed[key];
  var cv=vk==='watch'?_libWatchView:vk==='queue'?_libQueueView:vk==='drop'?_libDropView:_libCompView;
  var chevRot=isOpen?'':'transform:rotate(-90deg);';
  return '<div class="section-block" id="libsec-'+key+'" style="margin-bottom:16px;">'
    +'<div class="section-block-header" onclick="_libToggleSec(\''+key+'\')" style="cursor:pointer;">'
    +'<div class="sec-left" style="pointer-events:none;"><div class="section-block-title">'+title+'</div><span class="section-pill">'+count+'</span></div>'
    +'<div class="sec-right" onclick="event.stopPropagation();">'
    // "Pick for me" on your own Library's Watchlist (MSSPick, js/pick.js)
    +(key==='queue' && LIB_SCOPE==='lib' && typeof MSSPick!=='undefined' ? MSSPick.buttonHTML('_libPick()', !count) : '')
    +'<div class="view-toggle">'
    +'<button class="vt-btn '+(cv==='list'?'active':'')+'" onclick="_libViewToggle(\''+vk+'\')" title="List">'+icon('list',13)+'</button>'
    +'<button class="vt-btn '+(cv==='grid'?'active':'')+'" onclick="_libViewToggle(\''+vk+'\')" title="Grid">'+icon('grid',13)+'</button>'
    +'</div>'
    +'<button class="chevron-btn" onclick="_libToggleSec(\''+key+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;transition:transform 220ms;'+chevRot+'"><polyline points="6 9 12 15 18 9"/></svg></button>'
    +'</div></div>'
    +'<div class="accordion-body '+(isOpen?'open':'')+'" id="libbody-'+key+'">'
    +'<div class="accordion-inner">'+_libSortBar(sk)+content+'</div></div></div>';
}
function _libGridWrap(gid,html){
  return '<div class="grid-nav-wrap">'
    +'<button class="grid-nav-btn arr-left" onclick="event.stopPropagation();var el=document.getElementById(\''+gid+'\');if(el)el.scrollBy({left:-220,behavior:\'smooth\'})">'+_LIB_ARROW_L+'</button>'
    +'<button class="grid-nav-btn arr-right" onclick="event.stopPropagation();var el=document.getElementById(\''+gid+'\');if(el)el.scrollBy({left:220,behavior:\'smooth\'})">'+_LIB_ARROW_R+'</button>'
    +html+'</div>';
}
/* ── The cards in each section (list or grid) — also drawn by the loading skeleton ── */
/* how wide the posters show (posterHTML fetches TMDB images only that big) */
var LIB_GRID_PX='(max-width:640px) 160px, (max-width:1100px) 200px, 280px', LIB_LIST_PX='(max-width:640px) 60px, 96px';
var _libEsc=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
function _libWatchCard(e,grid){
  var esc=_libEsc;
  if(grid){
      var ipUN=e.status==='up_next', ip=e.status==='paused'||ipUN;
      var pct=e.total_eps?Math.round(((e.watched||0)/e.total_eps)*100):0;
      var isM=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      var rtH=Number(e.runtime_h)||0,rtM=Number(e.runtime_m)||0;
      var rt=isM&&(rtH||rtM)?(rtH?rtH+'h '+rtM+'m':rtM+'m'):'';
      var ep=isM?rt:(e.season!=null?'S'+e.season+' · E'+(e.episode||0):(e.episode?'Ep '+e.episode:''));
      var _typeCls=(isM?'type-label':'type-label type-label-tv')+' type-label-overlay-bottom';
      return '<div class="wg-card" style="cursor:pointer;" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'"><div class="wg-poster" style="position:relative;">'+posterHTML(e,'big',LIB_GRID_PX)+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?'<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>':'')
        +(ip?mssHoldHTML(e):'')
        +'<span class="'+_typeCls+'">'+(isM?'Movie':'TV Show')+'</span>'
        +'</div><div class="wg-info"><div class="title-year-row"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'
        +(ep?'<div class="wg-genre"><span class="w-ep-badge">'+ep+'</span></div>':'')
        +(e.total_eps?'<div class="fv-w-prog-track" style="margin-top:6px;"><div class="fv-w-prog-fill" style="width:'+pct+'%'+(ip?';background:var(--text-3)':'')+';"></div></div>'
          +'<div style="font-size:10px;color:var(--text-3);margin-top:3px;">'+(e.watched||0)+' / '+e.total_eps+' eps · '+pct+'%</div>'
          :'')
        +'</div></div>';
  }

      var ipUN=e.status==='up_next', ip=e.status==='paused'||ipUN;
      var isM=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      var pct=e.total_eps?Math.round(((e.watched||0)/e.total_eps)*100):0;
      var ep=isM?'':(e.season!=null?'S'+e.season+' · E'+(e.episode||0):(e.episode?'Ep '+e.episode:''));
      var rtH=Number(e.runtime_h)||0,rtM=Number(e.runtime_m)||0;
      var rt=isM&&(rtH||rtM)?(rtH?rtH+'h '+rtM+'m':rtM+'m'):'';
      var cs=ip?'background:var(--olive-faint);border-color:var(--border-olive);':'';
      return '<div class="fv-w-card" style="cursor:pointer;'+cs+'" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'">'
        +'<div class="fv-w-poster">'+posterHTML(e,'',LIB_LIST_PX)+(ip?mssHoldHTML(e):'')+'</div>'
        +'<div class="fv-w-body"><div class="fv-w-title" style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">'+esc(e.title)+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?rewatchBadgeHTML(e):'')+'</div>'
        +(ep?'<div class="fv-w-ep">'+_libTypeBadge(isM)+'<span class="fv-w-ep-badge">'+ep+'</span></div>':'')
        +(rt?'<div class="fv-w-ep">'+_libTypeBadge(isM)+'<span class="fv-w-ep-badge">'+rt+'</span></div>':'')
        +(!ep&&!rt?'<div class="fv-w-ep">'+_libTypeBadge(isM)+'</div>':'')
        +((!isM&&e.total_eps)?'<div class="fv-w-prog-track" style="margin-top:6px;"><div class="fv-w-prog-fill" style="width:'+pct+'%'+(ip?';background:var(--text-3)':'')+';"></div></div><div class="fv-w-prog-label">'+(e.watched||0)+' / '+e.total_eps+' eps \u00b7 '+pct+'%</div>':(!isM&&e.watched?'<div class="fv-w-prog-label">'+e.watched+' watched</div>':''))
        +'</div></div>';
}
function _libQueueCard(e,grid){
  var esc=_libEsc;
  if(grid){var scope=_libQueueScope(e);var isMq=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');var typeClsQ=(isMq?'type-label':'type-label type-label-tv')+' type-label-overlay-bottom';return '<div class="wg-card" style="cursor:pointer;" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'"><div class="wg-poster" style="position:relative;">'+posterHTML(e,'big',LIB_GRID_PX)+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?'<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>':'')+'<span class="'+typeClsQ+'">'+(isMq?'Movie':'TV Show')+'</span>'+'</div><div class="wg-info"><div class="title-year-row"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'+(scope?'<div class="wg-genre"><span class="w-ep-badge">'+scope+'</span></div>':'')+'</div></div>';}
var scope=_libQueueScope(e);var isMq=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');var typeBadgeQ='<span class="'+(isMq?'type-label':'type-label type-label-tv')+'">'+(isMq?'Movie':'TV Show')+'</span>';return '<div class="w-card" style="cursor:pointer;" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'"><div class="w-poster">'+posterHTML(e,'',LIB_LIST_PX)+'</div><div class="w-body"><div class="w-top"><div class="w-title">'+esc(e.title)+(e.year?'<span class="title-year-inline" style="margin-left:8px;">'+escHTML(e.year)+'</span>':'')+'</div></div><div class="w-ep-row">'+typeBadgeQ+(scope?'<span class="w-ep-badge">'+scope+'</span>':'')+'</div></div></div>';}
// o = { isRanked, ratingKey } from the Watched section's sort
function _libCompCard(e,i,grid,o){
  var esc=_libEsc, isRanked=o.isRanked, ratingKey=o.ratingKey, newEp=_libNewEp(e);
  if(grid){
      var sc=liveScore(e)!=null?Number(liveScore(e)).toFixed(2):null;
      var rk=SF.rank(e,i), cls=rk===1?'cg-rank-1':rk===2?'cg-rank-2':rk===3?'cg-rank-3':'cg-rank-other';
      var isMovie=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      var metaHtml='';
      if(isMovie){
        var rtH=Number(e.runtime_h)||0,rtM=Number(e.runtime_m)||0;
        if(rtH||rtM)metaHtml='<div class="w-ep-row"><span class="w-ep-badge">'+(rtH?rtH+'h '+rtM+'m':rtM+'m')+'</span></div>';
      } else if(e.status==='ongoing'&&e.season!=null&&e.episode!=null){
        metaHtml='<div class="w-ep-row"><span class="w-ep-badge">S'+e.season+' · E'+e.episode+'</span></div>';
      } else {
        var bd=Array.isArray(e.ratings&&e.ratings._season_breakdown)?e.ratings._season_breakdown.filter(function(n){return parseInt(n)>0;}).map(Number):[];
        var bdTot=bd.reduce(function(a,b){return a+b;},0);
        var scope=bd.length?'S'+bd.length+' · E'+bdTot:(e.total_seasons&&e.total_eps?'S'+e.total_seasons+' · E'+e.total_eps:e.total_seasons?'S'+e.total_seasons:e.total_eps?e.total_eps+' eps':'');
        if(scope)metaHtml='<div class="w-ep-row"><span class="w-ep-badge">'+scope+'</span></div>';
      }
      var isMovieG=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      var typeClsG=(isMovieG?'type-label':'type-label type-label-tv')+' type-label-overlay-bottom';
      return '<div class="wg-card cg-card-wrap" style="cursor:pointer;">'
        +'<div class="wg-poster" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'" style="position:relative;">'+posterHTML(e,'big',LIB_GRID_PX)+(ratingKey?_libRatingBadge(e,ratingKey):(isRanked?'<div class="cg-rank-badge '+cls+'">'+SF.rank(e,i)+'</div>':''))+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?'<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>':'')+mssNewSeasonHoldHTML(e,newEp)+'<span class="'+typeClsG+'">'+(isMovieG?'Movie':'TV Show')+'</span>'+' </div>'
        +'<div class="cg-grid-info" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'">'
        +'<div class="title-year-row"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'
        +metaHtml
        +(newEp?'<div class="w-ep-row">'+mssNewSeasonBadgeHTML(e,newEp)+'</div>':'')
        +'<div class="cg-score-row"><span class="cg-score">'+(sc!=null?'★ '+sc:'—')+'</span></div>'
        +'</div>'
        +'<div onclick="event.stopPropagation()" style="padding:0 10px 10px;display:flex;flex-direction:column;gap:4px;">'
        +(newEp?_libUpNextBtn(e,true):'')
        +_libCcBtn(e.id)
        +'</div></div>';
  }

      var sc=liveScore(e)!=null?Number(liveScore(e)).toFixed(2):null;
      var isMc=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      return '<div class="fv-entry-block">'
        +'<div class="fv-rank-row" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'">'
        +'<div class="fv-rank-poster" style="position:relative;">'+posterHTML(e,'',LIB_LIST_PX)+mssNewSeasonHoldHTML(e,newEp)+(ratingKey?_libRatingBadge(e,ratingKey):(isRanked?'<div class="cg-rank-badge '+(SF.rank(e,i)===1?'cg-rank-1':SF.rank(e,i)===2?'cg-rank-2':SF.rank(e,i)===3?'cg-rank-3':'cg-rank-other')+'">'+SF.rank(e,i)+'</div>':''))+'</div>'
        +'<div class="fv-rank-info"><div class="fv-rank-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">'+esc(e.title)+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?rewatchBadgeHTML(e):'')+' </div>'
        +'<div class="fv-rank-meta">'+_libTypeBadge(isMc)+(newEp?mssNewSeasonBadgeHTML(e,newEp):'')+'</div>'
        +(e.notes?'<div style="font-size:12px;color:var(--text-3);margin-top:8px;font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2; line-clamp:2;-webkit-box-orient:vertical;">&ldquo;'+esc(_trimNotes(MSSRich.plain(e.notes)))+'&rdquo;</div>':'')
        +renderFavChips(e.ratings,e.cat)
        +'</div><div class="fv-rank-score'+(newEp?' fv-rank-side':'')+'">'+(sc!=null?'★ '+sc:'—')+(newEp?_libUpNextBtn(e,false):'')+'</div></div>'
        +_libCcBtn(e.id)
        +'</div>';
}
function _libDropProg(e,cls){
  if(mssIsMovieEntry(e)||!e.total_eps)return '';
  var pct=Math.min(100,Math.round(((e.watched||0)/e.total_eps)*100));
  return '<div class="'+cls+'-track dropped-track"><div class="'+cls+'-fill" style="width:'+pct+'%"></div></div><div class="dropped-prog-label">'+(e.watched||0)+' / '+e.total_eps+' eps · '+pct+'%</div>';
}
function _libDropScore(e){ var s=liveScore(e); return s!=null?'<div class="dropped-score"><span>★ '+Number(s).toFixed(2)+'</span><small>doesn’t count</small></div>':''; }
function _libDropCard(e,grid){
  var esc=_libEsc, dprog=_libDropProg, dscore=_libDropScore;
  if(grid){
      var isM=mssIsMovieEntry(e);
      return '<div class="wg-card is-dropped" style="cursor:pointer;" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'"><div class="wg-poster" style="position:relative;">'+posterHTML(e,'big',LIB_GRID_PX)
        +'<span class="'+(isM?'type-label':'type-label type-label-tv')+' type-label-overlay-bottom">'+(isM?'Movie':'TV Show')+'</span></div>'
        +'<div class="wg-info"><div class="title-year-row"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'
        +'<div class="wg-genre">'+mssDroppedTagHTML(e)+'</div>'+dprog(e,'wg-prog')+dscore(e)
        +'</div></div>';
  }
  return '<div class="fv-w-card is-dropped" style="cursor:pointer;" onclick="_libOpen(this.dataset.id)" data-id="'+e.id+'">'
    +'<div class="fv-w-poster">'+posterHTML(e,'',LIB_LIST_PX)+'</div>'
    +'<div class="fv-w-body"><div class="fv-w-title" style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">'+esc(e.title)+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'
    +'<div class="fv-w-ep">'+_libTypeBadge(mssIsMovieEntry(e))+mssDroppedTagHTML(e)+'</div>'
    +dprog(e,'fv-w-prog')+dscore(e)+'</div>'
    +'</div>';
}
// Never leave the Library stuck on its spinner: if drawing fails, say so
// (with the reason) so it can be reported/fixed.
/* ── Empty states (mssEmpty in config.js). Someone else's library just says it plainly; yours suggests what
   to do next — and an empty Watchlist offers a few popular titles (this category, or one from each). ── */
function mssStarterSkip(){ return LIB_ENTRIES(); }
document.addEventListener('mss:library-changed', async function(){
  if (LIB_READONLY || typeof _pUser === 'undefined' || !_pUser) return;
  _pEntries = await getEntries(_pUser.id); renderLibrary();
});
function _libClearFilters(sec){ SF.clearFilters(LIB_SCOPE, sec); renderLibrary(); }
function _libEmpty(sec, mine, theirs){
  if (_libBaseEntries(sec).length) return mssEmpty({ compact:true, art:'filter', title:'Nothing matches these filters',
    text:'Your filters are a little too picky here. Loosen one and try again.',
    actions:[{ label:'Clear filters', icon:'x', onclick:"_libClearFilters('"+sec+"')", primary:true }] });
  if (LIB_READONLY) return mssEmpty({ compact:true, art:mine.art, title:theirs });
  return mssEmpty(Object.assign({ compact:true }, mine));
}
function _libPick(){
  MSSPick.open({ pool:function(){ return _libBaseEntries('queue'); }, all:function(){ return LIB_ENTRIES(); }, user:_pUser, cats:!_libCatFilter,
    onStarted:function(){ document.dispatchEvent(new CustomEvent('mss:library-changed')); } });
}
/* ── Big libraries: each section draws its first cards, then more as you scroll near its end
   (hundreds of cards and posters at once were too much for phones — Safari ran out of memory
   and reloaded the page). A redraw keeps however many were already showing. ── */
var LIB_CHUNK=40, _libMore={};
function _libCards(key,list,fn){
  var prev=_libMore[key], q=SF.query(LIB_SCOPE)+'|'+_libCatFilter;
  var n=Math.min(list.length, Math.max(LIB_CHUNK, prev&&prev.q===q ? prev.n : 0, _libBackN));
  _libMore[key]={list:list,fn:fn,n:n,q:q};
  var html='';
  for(var i=0;i<n;i++) html+=fn(list[i],i);
  return html+(n<list.length?'<div class="lib-more" data-sec="'+key+'" aria-hidden="true"></div>':'');
}
function _libGrow(key){
  var m=_libMore[key], s=document.querySelector('.lib-more[data-sec="'+key+'"]');
  if(!m||!s) return false;
  var end=Math.min(m.list.length, m.n+LIB_CHUNK), html='';
  for(var i=m.n;i<end;i++) html+=m.fn(m.list[i],i);
  m.n=end;
  var box=s.parentElement;
  s.insertAdjacentHTML('beforebegin',html);
  if(m.n>=m.list.length) s.remove();
  if(typeof fitTitleYear==='function') fitTitleYear(box);
  return true;
}
/* is this section's "more" marker close to coming into view (inside its own scroll box)? */
function _libNear(s){
  if(!s.offsetParent && !s.getClientRects().length) return false;      // a closed section
  var r=s.getBoundingClientRect(), row=s.closest('.watching-grid');
  if(row){ var b=row.getBoundingClientRect(); return r.left-b.right<700 && b.top<innerHeight+600 && b.bottom>-600; }
  var box=s.closest('.accordion-body'), bb=box?box.getBoundingClientRect():{top:0,bottom:innerHeight};
  return r.top-Math.min(bb.bottom,innerHeight)<1000 && bb.top<innerHeight+600;
}
function _libCheckMore(){
  document.querySelectorAll('.lib-more').forEach(function(s){
    for(var k=0;k<6 && s.isConnected && _libNear(s);k++) _libGrow(s.dataset.sec);
  });
}
var _libMoreTick=0;
document.addEventListener('scroll',function(){
  if(_libMoreTick) return;
  _libMoreTick=requestAnimationFrame(function(){ _libMoreTick=0; _libCheckMore(); });
},{capture:true,passive:true});
addEventListener('resize',function(){ _libCheckMore(); });
/* coming back from a title to a spot deep in a list: draw enough cards to reach it first */
var _libBackN=0;
try{ var _lb=JSON.parse(sessionStorage.getItem('mssScrollBack')||'null'); if(_lb&&_lb.boxes&&Object.keys(_lb.boxes).length) _libBackN=Math.min(400,Math.max.apply(null,Object.keys(_lb.boxes).map(function(k){var b=_lb.boxes[k];return Math.ceil(Math.max(b[0]/150,b[1]/70))+12;}))); }catch(_){}
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
  var el=document.getElementById('libraryContent');
  var loading=document.getElementById('libraryLoading');
  if(!el)return;
  _libEntries=LIB_ENTRIES().slice();
  var watching=SF.list(LIB_SCOPE,'watching');
  var queue=SF.list(LIB_SCOPE,'queue');

  // Dynamic stats based on current filter
  var _filteredAll = LIB_ENTRIES().filter(function(e){return !_libCatFilter||e.cat===_libCatFilter;});
  var _fSt = computeStats(_filteredAll);
  var _fHours = Math.round((_fSt.movieMins||0)/60);
  var completed=SF.list(LIB_SCOPE,'completed');
  var st=computeStats(_libEntries);

  // Stats bar
  var statsHTML = '<div class="page-stats" style="margin-bottom:2rem;">'
    + '<div class="page-stat"><div class="page-stat-num">'+_fSt.watching+'</div><div class="page-stat-label">Watching</div></div>'
    + '<div class="page-stat"><div class="page-stat-num">'+_fSt.queue+'</div><div class="page-stat-label">Watchlist</div></div>'
    + '<div class="page-stat"><div class="page-stat-num">'+_fSt.completed+'</div><div class="page-stat-label">Watched</div></div>'
    + (_fSt.avgScore ? '<div class="page-stat"><div class="page-stat-num">'+_fSt.avgScore+'</div><div class="page-stat-label">Avg Score</div></div>' : '')
    + (_fSt.totalEps ? '<div class="page-stat"><div class="page-stat-num">'+_fSt.totalEps.toLocaleString()+'</div><div class="page-stat-label">Episodes</div></div>' : '')
    + (_fSt.dropped ? '<div class="page-stat"><div class="page-stat-num">'+_fSt.dropped+'</div><div class="page-stat-label">Dropped</div></div>' : '')
    + (_fSt.watchTime ? '<div class="page-stat"><div class="page-stat-num">'+_fSt.watchTime+'</div><div class="page-stat-label">Movie Watch Time</div></div>' : '')
    + '</div>';

  // Watching
  var wc;
  if(!watching.length){wc=_libEmpty('watching',{ art:'watching', title:'Nothing on screen right now', text:'The couch is warm and the remote is ready.',
    actions:[{ label:'Add a title', icon:'plus', onclick:"openAddModal("+(_libCatFilter?"'"+_libCatFilter+"'":'')+")", primary:true }] },'Not watching anything right now');}
  else if(_libWatchView==='grid'){wc=_libGridWrap('libwg','<div class="watching-grid" id="libwg">'+_libCards('watching',watching,function(e){return _libWatchCard(e,true);})+'</div>');}
  else {wc='<div class="fv-watch-list">'+_libCards('watching',watching,function(e){return _libWatchCard(e,false);})+'</div>';}

  // Queue
  var qc;
  if(!queue.length){qc=_libEmpty('queue',{ art:'watchlist', title:'Your watchlist is empty', text:'Nothing queued up yet. Future you is going to be so bored.',
    actions:[{ label:'Add a title', icon:'plus', onclick:"openAddModal("+(_libCatFilter?"'"+_libCatFilter+"'":'')+")", primary:true }, { label:'Browse Discover', icon:'compass', href:'discover.html' }],
    starter:LIB_SCOPE==='lib' ? (_libCatFilter||'all') : '' },'Nothing on their watchlist');}
  else if(_libQueueView==='grid'){qc=_libGridWrap('libqg','<div class="watching-grid" id="libqg">'+_libCards('queue',queue,function(e){return _libQueueCard(e,true);})+'</div>');}
  else {qc='<div class="watch-list">'+_libCards('queue',queue,function(e){return _libQueueCard(e,false);})+'</div>';}

  // Completed
  var cOpts={isRanked:_libSort.completed==='highest'||_libSort.completed==='lowest', ratingKey:(_libSort.completed||'').indexOf('rating:')===0?_libSort.completed.slice(7):null};
  var cc;
  if(!completed.length){cc=_libEmpty('completed',{ art:'watched', title:'No finished titles yet', text:'Your trophy shelf is waiting. Finish something and it lands here, ready to rate.' },'Nothing watched yet');}
  else if(_libCompView==='grid'){cc=_libGridWrap('libcg','<div class="watching-grid" id="libcg">'+_libCards('completed',completed,function(e,i){return _libCompCard(e,i,true,cOpts);})+'</div>');}
  else {cc='<div class="fv-ranked-list">'+_libCards('completed',completed,function(e,i){return _libCompCard(e,i,false,cOpts);})+'</div>';}

  // Dropped (071) — where they stopped, the score greyed ("doesn't count"); Pick Back Up is in the title's popup
  var dropped=SF.list(LIB_SCOPE,'dropped');
  var dc;
  if(!dropped.length){dc=_libEmpty('dropped',{ art:'dropped', title:'Nothing dropped', text:'You finish what you start. Respect.' },'Nothing dropped');}
  else if(_libDropView==='grid'){dc=_libGridWrap('libdg','<div class="watching-grid" id="libdg">'+_libCards('dropped',dropped,function(e){return _libDropCard(e,true);})+'</div>');}
  else {dc='<div class="fv-watch-list">'+_libCards('dropped',dropped,function(e){return _libDropCard(e,false);})+'</div>';}

  // Stats + type filter on top, then the search box (drawn once, so typing keeps
  // its focus), then the sections — only the top and the sections redraw
  if(!el.querySelector('#libSecs')){
    el.innerHTML='<div id="libTop"></div><div class="sf-search-row sf-search-row-split">'+SF.searchHTML(LIB_SCOPE, LIB_READONLY ? 'Search this library…' : 'Search your library…')+'<div id="libTypeSlot"></div></div><div id="libSecs"></div>';
  }
  var q=SF.query(LIB_SCOPE);
  var secs=_libSection('watching',icon('play',14)+' Currently Watching',watching.length,'watch','watching',wc)
    +_libSection('queue',icon('bookmark',14)+' Watchlist',queue.length,'queue','queue',qc)
    +_libSection('completed',icon('check',14)+' Watched',completed.length,'comp','completed',cc)
    +(dropped.length?_libSection('dropped',icon('drop',14)+' Dropped',dropped.length,'drop','dropped',dc):'');   // only once something's dropped
  if(q&&!secs) secs=mssEmpty({ art:'search', title:'No luck with “'+q+'”', text:'Nothing in this library matches. Try another title, a year, or check the spelling.',
    actions:[{ label:'Clear search', icon:'x', onclick:"SF._search('"+LIB_SCOPE+"', '', true)" }] });
  // A brand-new library: one welcome (with a few popular titles) instead of four empty sections
  if(!q && !LIB_ENTRIES().length) secs = LIB_READONLY ? mssEmpty({ art:'watchlist', title:'Nothing here yet', text:'Their folio is still a blank page.' })
    : mssEmpty({ art:'watchlist', title:'Your folio starts here', text:'Every great collection starts with one title. No pressure — but it does look a little lonely in here.',
        actions:[{ label:'Add a title', icon:'plus', onclick:'openAddModal()', primary:true }, { label:'Browse Discover', icon:'compass', href:'discover.html' }],
        starter: LIB_SCOPE==='lib' ? 'all' : '' });
  if(loading){loading.style.display='none';loading.innerHTML='';}
  el.style.display='block';
  _libCheckNewEps();
  // Remember this library's shape — which stats, how many cards per section — so the next loading skeleton matches it
  if(!q&&!_libCatFilter) mssSkeleton.shape('lib_'+LIB_KEY, { stats:(statsHTML.match(/page-stat-label">[^<]*/g)||[]).map(function(x){return x.slice(17);}),
    n:{watching:watching.length,queue:queue.length,completed:completed.length,dropped:dropped.length} });
  mssKeepScroll(el, function(){            // a redraw keeps your place (rows scrolled sideways too)
    el.querySelector('#libTop').innerHTML = statsHTML;
    el.querySelector('#libTypeSlot').innerHTML = _libCatFilterBar();      // the Type filter sits beside the search
    el.querySelector('#libSecs').innerHTML = secs;
    if (typeof fitTitleYear === 'function') fitTitleYear(el);
  });
  mssScrollReturn(el);                     // back from a title's Edit page → where you were
  _libBackN=0;
  requestAnimationFrame(_libCheckMore);    // a short screen or an open grid may already need the next cards
}

/* ── Loading skeleton: this page's own stats, search, sections and cards (in the views you
   chose), with sample titles masked into placeholders — as many as you had last time ── */
mssSkeleton.define('library', function(){
  var sh=mssSkeleton.shape('lib_'+LIB_KEY)||{stats:['Watching','Watchlist','Watched','Avg Score','Episodes'],n:{watching:3,queue:6,completed:5,dropped:0}};
  var e=function(cat){return {id:'',title:'Sample title',year:'2024',cat:cat,status:'watching',season:1,episode:4,total_eps:10,watched:4,ratings:{}};};
  var cards=function(key,f){var n=Math.min(sh.n[key]||0,key==='queue'?8:5),out='';for(var i=0;i<n;i++)out+=f(i);return out;};
  var body=function(key,grid,gid,f){
    if(!sh.n[key])return '<div class="fv-empty">Nothing here yet.</div>';
    var c=cards(key,f);
    return grid?_libGridWrap(gid,'<div class="watching-grid">'+c+'</div>'):c;
  };
  var keep=function(html){return html.replace(/class="(section-block-title|sec-right|sort-bar[^"]*|sf-trigger-row[^"]*)"/g,'class="$1" data-skel-keep');};
  var wc=_libWatchView==='grid'?body('watching',true,'',function(){return _libWatchCard(e('tv'),true);}):'<div class="fv-watch-list">'+body('watching',false,'',function(){return _libWatchCard(e('tv'),false);})+'</div>';
  var qc=_libQueueView==='grid'?body('queue',true,'',function(){return _libQueueCard(e('tv'),true);}):'<div class="watch-list">'+body('queue',false,'',function(){return _libQueueCard(e('tv'),false);})+'</div>';
  var co={isRanked:false,ratingKey:null}, done=function(){var x=e('tv');x.status='completed';x.ratings={story:8};return x;};
  var cc=_libCompView==='grid'?body('completed',true,'',function(i){return _libCompCard(done(),i,true,co);}):'<div class="fv-ranked-list">'+body('completed',false,'',function(i){return _libCompCard(done(),i,false,co);})+'</div>';
  return '<div class="page-stats" style="margin-bottom:2rem;">'+sh.stats.map(function(l){return '<div class="page-stat"><div class="page-stat-num">12</div><div class="page-stat-label" data-skel-keep>'+escHTML(l)+'</div></div>';}).join('')+'</div>'
    +'<div class="sf-search-row sf-search-row-split" data-skel-keep>'+SF.searchHTML(LIB_SCOPE,LIB_READONLY?'Search this library…':'Search your library…')+'<div>'+_libCatFilterBar()+'</div></div>'
    +keep(_libSection('watching',icon('play',14)+' Currently Watching','0','watch','watching',wc)
      +_libSection('queue',icon('bookmark',14)+' Watchlist','0','queue','queue',qc)
      +_libSection('completed',icon('check',14)+' Watched','0','comp','completed',cc)
      +(sh.n.dropped?_libSection('dropped',icon('drop',14)+' Dropped','0','drop','dropped',''):''));
});
