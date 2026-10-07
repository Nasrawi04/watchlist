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
   The page provides: #libraryContent / #libraryLoading, openProfInfoPopup(id),
   profOpenPopup(id), _libCcBtn(prefix, id), _trimNotes(text).
═══════════════════════════════════════════════════════════════ */

var LIB_SCOPE    = window.LIB_SCOPE || 'lib';
var LIB_READONLY = !!window.LIB_READONLY;
var LIB_ENTRIES  = window.LIB_ENTRIES || function(){ return _pEntries; };
var LIB_CC       = LIB_SCOPE === 'pv' ? 'pv' : 'prof';      // comments popup prefix
var LIB_KEY      = LIB_SCOPE === 'pv' ? 'pv_' : 'prof_';    // remembered list / grid choice
var _LIB_ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
var _LIB_ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

var _libSort = {watching:'newest',queue:'newest',completed:'newest'};
var _libCollapsed = {watching:false,queue:false,completed:false};
var _libWatchView = localStorage.getItem(LIB_KEY+'libWatchView')||'list';
var _libQueueView = localStorage.getItem(LIB_KEY+'libQueueView')||'grid';
var _libCompView  = localStorage.getItem(LIB_KEY+'libCompView')||'list';
var _libCatFilter = '';
var _libEntries = [];


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
  return '<div class="sf-trigger-row" style="margin-bottom:10px;justify-content:flex-start;">'
    + '<button class="sf-icon-btn' + (_libCatFilter ? ' active' : '') + '" id="libTypeTriggerBtn" onclick="openLibTypeFilterPopup()" aria-label="Filter">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>'
    + '<span class="sf-icon-btn-label">' + (_libCatFilter ? _libCatLabels[_libCatFilter] + (_libFormat ? ' · ' + _libFormatLabels[_libFormat] : '') : 'Filter') + '</span>'
    + '</button></div>';
}

var _libCatLabels = { '':'All Types', tv:'TV Shows', movies:'Movies', anime:'Anime', cartoons:'Cartoons' };
var _libStagedCat = '';
// Anime & Cartoons mix series and films — a second "Format" choice
// (Shows / Movies) appears under Type when one of them is picked.
var _libFormat = '', _libStagedFormat = '';
var _libFormatLabels = { '':'All Formats', show:'Shows', movie:'Movies' };
function _libHasFormats(cat) { return cat === 'anime' || cat === 'cartoons'; }

function _libInjectTypeFilterOverlay() {
  if (document.getElementById('sfTypeFilterOverlay')) return;
  var el = document.createElement('div');
  el.id = 'sfTypeFilterOverlay';
  el.innerHTML = '<div id="sfTypeFilterCard" role="dialog" aria-modal="true" aria-labelledby="sfTypeFilterTitle">'
    + '<div class="sf-header"><div class="sf-title" id="sfTypeFilterTitle">Filter</div>'
    + '<button type="button" class="sf-close" onclick="closeLibTypeFilterPopup()" aria-label="Close">' + icon('x',18) + '</button></div>'
    + '<div class="sf-body" id="libTypeFilterBody"></div>'
    + '<div class="sf-footer"><button class="sf-clear-btn" onclick="_libClearStagedType()">Clear</button><button class="sf-apply-btn" onclick="_libApplyTypeFilter()">Apply</button></div>'
    + '</div>';
  MSSDialog.bind(el, closeLibTypeFilterPopup);
  document.body.appendChild(el);
}

function openLibTypeFilterPopup() {
  _libInjectTypeFilterOverlay();
  _libStagedCat = _libCatFilter;
  _libStagedFormat = _libFormat;
  document.getElementById('libTypeFilterBody').innerHTML = _libTypeFilterBodyHTML();
  MSSDialog.open(document.getElementById('sfTypeFilterOverlay'));
}

function closeLibTypeFilterPopup() {
  MSSDialog.close(document.getElementById('sfTypeFilterOverlay'));
}

function _libStageCat(v) {
  _libStagedCat = v;
  if (!_libHasFormats(v)) _libStagedFormat = '';
  document.getElementById('libTypeFilterBody').innerHTML = _libTypeFilterBodyHTML();
}
function _libStageFormat(v) {
  _libStagedFormat = v;
  document.getElementById('libTypeFilterBody').innerHTML = _libTypeFilterBodyHTML();
}
function _libTypeFilterBodyHTML() {
  var row = function(checked, fn, v, label) {
    return '<label class="sf-check-row"><input type="checkbox" ' + (checked?'checked':'') + ' onchange="' + fn + '(\'' + v + '\')">'
      + '<span class="sf-check-mark"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' + '<span>' + label + '</span></label>';
  };
  var html = '<div class="sf-section-label">Type</div><div class="sf-check-list">'
    + Object.keys(_libCatLabels).map(function(v){ return row(_libStagedCat===v, '_libStageCat', v, _libCatLabels[v]); }).join('') + '</div>';
  if (_libHasFormats(_libStagedCat)) {
    html += '<div class="sf-section-label">Format <span class="sf-section-hint">(' + _libCatLabels[_libStagedCat] + ' has both)</span></div><div class="sf-check-list">'
      + Object.keys(_libFormatLabels).map(function(v){ return row(_libStagedFormat===v, '_libStageFormat', v, _libFormatLabels[v]); }).join('') + '</div>';
  }
  return html;
}

function _libClearStagedType() {
  _libStagedCat = ''; _libStagedFormat = '';
  document.getElementById('libTypeFilterBody').innerHTML = _libTypeFilterBodyHTML();
}

function _libApplyTypeFilter() {
  _libCatFilter = _libStagedCat;
  _libFormat = _libHasFormats(_libStagedCat) ? _libStagedFormat : '';
  SF.invalidate(_sfScope()); // actor names depend on which types are shown
  closeLibTypeFilterPopup();
  renderLibrary();
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
  return _libEntries.filter(function(e){return (e.status==='completed'||e.status==='ongoing')&&inCat(e);});
}
SF.register(LIB_SCOPE, {
  watched: function(sec){ return sec==='completed'; },   // Year Watched filter
  base: _libBaseEntries,
  render: function(){ renderLibrary(); },
  sortState: _libSort,
  // Runtime only once movies can be present, Episode Count only once shows can
  sorts: function(){ return ['alpha','added','release','ratings', _libCatFilter!=='tv'&&_libFormat!=='show'&&'runtime', _libCatFilter!=='movies'&&_libFormat!=='movie'&&'episodes']; },
  lengthLabel: function(){ return _libCatFilter==='movies'?'Runtime (minutes)':_libCatFilter==='tv'?'Episode Count':'Runtime / Episode Count'; },
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
    return sec==='watching' ? list.filter(function(e){return e.status==='watching';}).concat(list.filter(function(e){return e.status==='up_next';}), list.filter(function(e){return e.status==='paused';})) : list;
  },
  // quick rating edits from the Sort popup — your own library only
  saveRatings: LIB_READONLY ? undefined : function(e,r){ return updateProgress(e.id,_pUser.id,{ratings:r}).catch(function(){}); },
});
function _sfScope(){ return LIB_SCOPE; }
function _libSortBar(sec){ return SF.bar(LIB_SCOPE, sec); }
function setLibSort(sec,val){ SF.setSort(LIB_SCOPE, sec, val); }
function setLibCat(c){_libCatFilter=c;_libFormat='';SF.invalidate(_sfScope());renderLibrary();}

function _libToggleSec(key){
  _libCollapsed[key]=!_libCollapsed[key];
  var el=document.getElementById('libbody-'+key);
  if(el)el.classList.toggle('open',!_libCollapsed[key]);
}
function _libViewToggle(vk){
  if(vk==='watch'){_libWatchView=_libWatchView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libWatchView',_libWatchView);}
  else if(vk==='queue'){_libQueueView=_libQueueView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libQueueView',_libQueueView);}
  else{_libCompView=_libCompView==='list'?'grid':'list';localStorage.setItem(LIB_KEY+'libCompView',_libCompView);}
  renderLibrary();
}
function _libSection(key,title,count,vk,sk,content){
  var isOpen=!_libCollapsed[key];
  var cv=vk==='watch'?_libWatchView:vk==='queue'?_libQueueView:_libCompView;
  var chevRot=isOpen?'':'transform:rotate(-90deg);';
  return '<div class="section-block" id="libsec-'+key+'" style="margin-bottom:16px;">'
    +'<div class="section-block-header" onclick="_libToggleSec(\''+key+'\')" style="cursor:pointer;">'
    +'<div class="sec-left" style="pointer-events:none;"><div class="section-block-title">'+title+'</div><span class="section-pill">'+count+'</span></div>'
    +'<div class="sec-right" onclick="event.stopPropagation();">'
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
// Never leave the Library stuck on its spinner: if drawing fails, say so
// (with the reason) so it can be reported/fixed.
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
  var esc=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
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
    + (_fSt.watchTime ? '<div class="page-stat"><div class="page-stat-num">'+_fSt.watchTime+'</div><div class="page-stat-label">Movie Watch Time</div></div>' : '')
    + '</div>';

  // Watching
  var wc;
  if(!watching.length){wc='<div class="fv-empty">Not watching anything right now.</div>';}
  else if(_libWatchView==='grid'){
    var wg='libwg';
    var wcs=watching.map(function(e){
      var ipUN=e.status==='up_next', ip=e.status==='paused'||ipUN;
      var pct=e.total_eps?Math.round(((e.watched||0)/e.total_eps)*100):0;
      var isM=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      var rtH=Number(e.runtime_h)||0,rtM=Number(e.runtime_m)||0;
      var rt=isM&&(rtH||rtM)?(rtH?rtH+'h '+rtM+'m':rtM+'m'):'';
      var ep=isM?rt:(e.season!=null?'S'+e.season+' · E'+(e.episode||0):(e.episode?'Ep '+e.episode:''));
      var _typeCls=(isM?'type-label':'type-label type-label-tv')+' type-label-overlay-bottom';
      return '<div class="wg-card" style="cursor:pointer;" onclick="openProfInfoPopup(this.dataset.id)" data-id="'+e.id+'"><div class="wg-poster" style="position:relative;">'+posterHTML(e,'big')+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?'<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>':'')
        +(ip?mssHoldHTML(e):'')
        +'<span class="'+_typeCls+'">'+(isM?'Movie':'TV Show')+'</span>'
        +'</div><div class="wg-info"><div class="title-year-row"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'
        +(ep?'<div class="wg-genre"><span class="w-ep-badge">'+ep+'</span></div>':'')
        +(e.total_eps?'<div class="fv-w-prog-track" style="margin-top:6px;"><div class="fv-w-prog-fill" style="width:'+pct+'%'+(ip?';background:var(--text-3)':'')+';"></div></div>'
          +'<div style="font-size:10px;color:var(--text-3);margin-top:3px;">'+(e.watched||0)+' / '+e.total_eps+' eps · '+pct+'%</div>'
          :'')
        +'</div></div>';
    }).join('');
    wc=_libGridWrap(wg,'<div class="watching-grid" id="'+wg+'">'+wcs+'</div>');
  } else {
    wc='<div class="fv-watch-list">'+watching.map(function(e){
      var ipUN=e.status==='up_next', ip=e.status==='paused'||ipUN;
      var isM=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      var pct=e.total_eps?Math.round(((e.watched||0)/e.total_eps)*100):0;
      var ep=isM?'':(e.season!=null?'S'+e.season+' · E'+(e.episode||0):(e.episode?'Ep '+e.episode:''));
      var lbl=isM?'':(e.total_eps?(e.watched||0)+' / '+e.total_eps+' eps · '+pct+'%':'');
      var rtH=Number(e.runtime_h)||0,rtM=Number(e.runtime_m)||0;
      var rt=isM&&(rtH||rtM)?(rtH?rtH+'h '+rtM+'m':rtM+'m'):'';
      var cs=ip?'background:var(--olive-faint);border-color:var(--border-olive);':'';
      return '<div class="fv-w-card" style="cursor:pointer;'+cs+'" onclick="openProfInfoPopup(this.dataset.id)" data-id="'+e.id+'">'
        +'<div class="fv-w-poster">'+posterHTML(e)+(ip?mssHoldHTML(e):'')+'</div>'
        +'<div class="fv-w-body"><div class="fv-w-title" style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">'+esc(e.title)+(e.year?'<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);flex-shrink:0;">'+escHTML(e.year)+'</span>':'')+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?rewatchBadgeHTML(e):'')+'</div>'
        +(ep?'<div class="fv-w-ep">'+_libTypeBadge(isM)+'<span class="fv-w-ep-badge">'+ep+'</span></div>':'')
        +(rt?'<div class="fv-w-ep">'+_libTypeBadge(isM)+'<span class="fv-w-ep-badge">'+rt+'</span></div>':'')
        +(!ep&&!rt?'<div class="fv-w-ep">'+_libTypeBadge(isM)+'</div>':'')
        +((!isM&&e.total_eps)?'<div class="fv-w-prog-track" style="margin-top:6px;"><div class="fv-w-prog-fill" style="width:'+pct+'%'+(ip?';background:var(--text-3)':'')+';"></div></div><div class="fv-w-prog-label">'+(e.watched||0)+' / '+e.total_eps+' eps \u00b7 '+pct+'%</div>':(!isM&&e.watched?'<div class="fv-w-prog-label">'+e.watched+' watched</div>':''))
        +'</div></div>';
    }).join('')+'</div>';
  }

  // Queue
  var qc;
  if(!queue.length){qc='<div class="fv-empty">Nothing on '+(LIB_READONLY?'their':'your')+' watchlist.</div>';}
  else if(_libQueueView==='grid'){
    var qg='libqg';
    var qcs=queue.map(function(e){var scope=_libQueueScope(e);var isMq=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');var typeClsQ=(isMq?'type-label':'type-label type-label-tv')+' type-label-overlay-bottom';return '<div class="wg-card" style="cursor:pointer;" onclick="openProfInfoPopup(this.dataset.id)" data-id="'+e.id+'"><div class="wg-poster" style="position:relative;">'+posterHTML(e,'big')+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?'<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>':'')+'<span class="'+typeClsQ+'">'+(isMq?'Movie':'TV Show')+'</span>'+'</div><div class="wg-info"><div class="title-year-row" style="margin-bottom:6px;"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'+(scope?'<div class="wg-genre"><span class="w-ep-badge">'+scope+'</span></div>':'')+'</div></div>';}).join('');
    qc=_libGridWrap(qg,'<div class="watching-grid" id="'+qg+'">'+qcs+'</div>');
  } else {
    qc='<div class="watch-list">'+queue.map(function(e){var scope=_libQueueScope(e);var isMq=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');var typeBadgeQ='<span class="'+(isMq?'type-label':'type-label type-label-tv')+'">'+(isMq?'Movie':'TV Show')+'</span>';return '<div class="w-card" style="cursor:pointer;" onclick="openProfInfoPopup(this.dataset.id)" data-id="'+e.id+'"><div class="w-poster">'+posterHTML(e)+'</div><div class="w-body"><div class="w-top"><div class="w-title">'+esc(e.title)+(e.year?'<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);margin-left:8px;">'+escHTML(e.year)+'</span>':'')+'</div></div><div class="w-ep-row">'+typeBadgeQ+(scope?'<span class="w-ep-badge">'+scope+'</span>':'')+'</div></div></div>';}).join('')+'</div>';
  }

  // Completed
  var isRanked=_libSort.completed==='highest'||_libSort.completed==='lowest';
  var ratingKey=(_libSort.completed||'').indexOf('rating:')===0?_libSort.completed.slice(7):null;
  var cc;
  if(!completed.length){cc='<div class="fv-empty">Nothing here yet.</div>';}
  else if(_libCompView==='grid'){
    var cg='libcg';
    var ccs=completed.map(function(e,i){
      var sc=liveScore(e)!=null?Number(liveScore(e)).toFixed(2):null;
      var cls=i===0?'cg-rank-1':i===1?'cg-rank-2':i===2?'cg-rank-3':'cg-rank-other';
      var date=e.completed_date?new Date(e.completed_date+'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}):'';
      var dateSpan=date?'<span class="genre-dot" style="color:var(--text-3)">'+date+'</span>':'';
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
        +'<div class="wg-poster" onclick="profOpenPopup(this.dataset.id)" data-id="'+e.id+'" style="position:relative;">'+posterHTML(e,'big')+(ratingKey?_libRatingBadge(e,ratingKey):(isRanked?'<div class="cg-rank-badge '+cls+'">'+(i+1)+'</div>':''))+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?'<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>':'')+'<span class="'+typeClsG+'">'+(isMovieG?'Movie':'TV Show')+'</span>'+' </div>'
        +'<div class="cg-grid-info" onclick="profOpenPopup(this.dataset.id)" data-id="'+e.id+'">'
        +'<div class="title-year-row"><div class="wg-title">'+esc(e.title)+'</div>'+(e.year?'<span class="title-year-inline">'+escHTML(e.year)+'</span>':'')+'</div>'
        +metaHtml
        +'<div class="cg-score-row"><span class="cg-score">'+(sc!=null?'★ '+sc:'—')+'</span></div>'
        +'</div>'
        +'<div onclick="event.stopPropagation()" style="padding:0 10px 10px;display:flex;flex-direction:column;gap:4px;">'
        +_libCcBtn(LIB_CC,e.id)
        +'</div></div>';
    }).join('');
    cc=_libGridWrap(cg,'<div class="watching-grid" id="'+cg+'">'+ccs+'</div>');
  } else {
    cc='<div class="fv-ranked-list">'+completed.map(function(e,i){
      var sc=liveScore(e)!=null?Number(liveScore(e)).toFixed(2):null;
      var date=e.completed_date?new Date(e.completed_date+'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}):'';
      var isMc=e.cat==='movies'||(e.ratings&&e.ratings._media_type==='movie');
      return '<div class="fv-entry-block">'
        +'<div class="fv-rank-row" onclick="profOpenPopup(this.dataset.id)" data-id="'+e.id+'">'
        +'<div class="fv-rank-poster" style="position:relative;">'+posterHTML(e)+(ratingKey?_libRatingBadge(e,ratingKey):(isRanked?'<div class="cg-rank-badge '+(i===0?'cg-rank-1':i===1?'cg-rank-2':i===2?'cg-rank-3':'cg-rank-other')+'">'+(i+1)+'</div>':''))+'</div>'
        +'<div class="fv-rank-info"><div class="fv-rank-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">'+esc(e.title)+(e.year?'<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);">'+escHTML(e.year)+'</span>':'')+(typeof rewatchBadgeHTML==='function'&&getRewatchCount(e)>1?rewatchBadgeHTML(e):'')+' </div>'
        +'<div class="fv-rank-meta">'+_libTypeBadge(isMc)+'</div>'
        +(e.notes?'<div style="font-size:12px;color:var(--text-3);margin-top:8px;font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">&ldquo;'+esc(_trimNotes(e.notes))+'&rdquo;</div>':'')
        +renderFavChips(e.ratings,e.cat)
        +'</div><div class="fv-rank-score">'+(sc!=null?'★ '+sc:'—')+'</div></div>'
        +_libCcBtn(LIB_CC,e.id)
        +'</div>';
    }).join('')+'</div>';
  }

  el.innerHTML = statsHTML + _libCatFilterBar()
    +_libSection('watching',icon('play',14)+' Currently Watching',watching.length,'watch','watching',wc)
    +_libSection('queue',icon('bookmark',14)+' Watchlist',queue.length,'queue','queue',qc)
    +_libSection('completed',icon('check',14)+' Watched',completed.length,'comp','completed',cc);
  if (typeof fitTitleYear === 'function') fitTitleYear(el);
  if(loading)loading.style.display='none';
  el.style.display='block';
}
