/* ══════════════════════════════════════════
   nav.js — Chrome injection + auth guard
══════════════════════════════════════════ */

async function _fillNavUser(user) {
  const profile  = await getProfile(user.id);
  window._navUserProfile = profile;  // store globally for create-card etc.
  window._navUser = user;
  const username = profile?.username || user.email?.split('@')[0] || 'You';
  const initial  = username[0].toUpperCase();

  const ini    = document.getElementById('navUserInitial');
  const iniMob = document.getElementById('navUserInitialMobile');
  const nm     = document.getElementById('navUserName');

  if (profile?.avatar_url) {
    const imgStyle = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    if (ini)    { ini.innerHTML    = `<img src="${profile.avatar_url}" style="${imgStyle}">`; ini.style.padding    = '0'; }
    if (iniMob) { iniMob.innerHTML = `<img src="${profile.avatar_url}" style="${imgStyle}">`; iniMob.style.padding = '0'; }
  } else {
    if (ini)    ini.textContent    = initial;
    if (iniMob) iniMob.textContent = initial;
  }
  if (nm) nm.textContent = username;

  const pending = await countPendingRequests(user.id);
  if (pending > 0) {
    document.querySelectorAll('[data-page="friends.html"]').forEach(el => {
      el.innerHTML += `<span class="nav-badge">${pending}</span>`;
    });
  }
  return profile;
}

function _updateMobileNavForGuest() {
  document.querySelectorAll('.mobile-auth-only').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.mobile-guest-only').forEach(el => el.style.display = '');
  document.querySelectorAll('.nav-auth-only').forEach(el => el.style.display = 'none');
  document.querySelector('.fab')?.setAttribute('style', 'display:none');
}

async function initPage(onReady) {
  injectChrome();
  const user = await getCurrentUser();
  if (!user) {
    // Guest nav: swap avatar → Sign In, hide Add/FAB
    const userWrap = document.querySelector('.nav-user-wrap');
    if (userWrap) userWrap.outerHTML =
      `<a href="login.html" class="btn-add" style="text-decoration:none">${icon('logout',14)} Sign In</a>`;
    const mobileUser = document.getElementById('navTopUser');
    if (mobileUser) mobileUser.outerHTML =
      `<a href="login.html" style="text-decoration:none;font-size:12px;font-weight:600;padding:0 10px;color:var(--olive-light);white-space:nowrap">Sign In</a>`;
    document.querySelector('.btn-add:not([href])')?.remove();
    document.querySelector('.fab')?.setAttribute('style', 'display:none');
    _updateMobileNavForGuest();
    // Still call callback with null so pages can render their own empty/guest state
    if (typeof onReady === 'function') await onReady(null, null);
    return;
  }
  const profile = await _fillNavUser(user);
  if (typeof onReady === 'function') await onReady(user, profile);
}

/* Guest-friendly init — no redirect; shows Sign In button in nav for unauthenticated visitors */
async function initPageGuest(onReady) {
  injectChrome();
  const user = await getCurrentUser();

  if (!user) {
    // Swap desktop user-wrap → Sign In link
    const userWrap = document.querySelector('.nav-user-wrap');
    if (userWrap) userWrap.outerHTML =
      `<a href="login.html" class="btn-add" style="text-decoration:none">${icon('logout',14)} Sign In</a>`;
    // Swap mobile top-user icon → Sign In link
    const mobileUser = document.getElementById('navTopUser');
    if (mobileUser) mobileUser.outerHTML =
      `<a href="login.html" style="text-decoration:none;font-size:12px;font-weight:600;padding:0 10px;color:var(--olive-light);white-space:nowrap">Sign In</a>`;
    // Hide Add button + FAB (no watchlist to add to)
    document.querySelector('.btn-add:not([href])')?.remove();
    document.querySelector('.fab')?.setAttribute('style', 'display:none');
    _updateMobileNavForGuest();
    if (typeof onReady === 'function') await onReady(null, null);
    return;
  }

  const profile = await _fillNavUser(user);
  if (typeof onReady === 'function') await onReady(user, profile);
}

/* ── Inject all chrome ── */
function injectChrome() {
  const page = window.location.pathname.split('/').pop() || 'index.html';

  /* ── TOP NAV ── */
  const navEl = document.createElement('nav');
  navEl.id = 'mainNav';
  navEl.innerHTML = `
    <!-- MOBILE ROW: hamburger | logo | icons -->
    <div class="nav-top" id="navTop">
      <button class="nav-hamburger" id="navHamburger" onclick="toggleMobileNav()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
      <a class="nav-logo" href="index.html"><img src="icons/logo-nav.png" alt="MyScreenScore" class="nav-logo-img"></a>
      <div class="nav-top-controls">
<button class="nav-icon-btn" onclick="toggleMobileSearch()" aria-label="Search">
          ${icon('search', 15)}
        </button>
        <div class="nav-top-user" id="navTopUser" onclick="toggleMobileUser(event)">
          <div class="nav-user-avatar" id="navUserInitialMobile">?</div>
          <div class="nav-user-dropdown" id="userMenuDropdownMobile">
            <a href="profile.html">${icon('user', 15)} Profile</a>
            <a href="settings.html">${icon('settings', 15)} Settings</a>
            <a href="#" class="nav-auth-only" onclick="handleLogout();return false">${icon('logout', 15)} Sign Out</a>
          </div>
        </div>
      </div>
    </div>
    <!-- MOBILE SEARCH BAR -->
    <div class="mobile-search-bar" id="mobileSearchBar">
      <div class="mobile-search-inner fused-search-wrap">
        <span class="mobile-search-icon-circle">${icon('search', 13)}</span>
        <input type="text" id="mobileSearchInput" placeholder="Search titles…" autocomplete="off">
        <button class="mobile-search-close" onclick="toggleMobileSearch()">${icon('x', 16)}</button>
      </div>
    </div>
    <!-- DESKTOP LINKS ROW -->
    <div class="nav-inner">
      <a class="nav-logo" href="index.html"><img src="icons/logo-nav.png" alt="MyScreenScore" class="nav-logo-img"></a>
      <div class="nav-links">
        ${navLink('index.html',     page, 'home',     'Home')}
        ${navLibraryDropdown(page)}
        ${navLink('favorites.html',  page, 'heart',    'Favorites')}
        ${navLink('lists.html',      page, 'layers',   'Lists')}
        ${navLink('notes.html',      page, 'list',     'Notes')}
        ${navLink('friends.html',   page, 'users',    'Friends')}
        ${navLink('profile.html',   page, 'user',     'Profile')}
      </div>
      <div class="nav-right">
        <div class="search-wrap fused-search-wrap">
          <span class="search-icon-wrap">${icon('search')}</span>
          <input type="text" id="globalSearch" placeholder="Search… (/)" autocomplete="off">
        </div>
        <button class="btn-add" onclick="openAddModal()">
          ${icon('plus', 14)} Add
        </button>
        <div class="nav-user-wrap" onclick="toggleUserMenu(event)">
          <div class="nav-user-avatar" id="navUserInitial">?</div>
          <span class="nav-user-name" id="navUserName">…</span>
          <span class="nav-chevron">${icon('chevdown', 12)}</span>
          <div class="nav-user-dropdown" id="userMenuDropdown">
            <a href="profile.html">${icon('user', 15)} Profile</a>
            <a href="settings.html">${icon('settings', 15)} Settings</a>
            <a href="#" class="nav-auth-only" onclick="handleLogout();return false">${icon('logout', 15)} Sign Out</a>
          </div>
        </div>
      </div>
    </div>`;

  /* ── MOBILE DRAWER ── */
  const mobileNavEl = document.createElement('div');
  mobileNavEl.className = 'mobile-nav';
  mobileNavEl.id = 'mobileNav';
  mobileNavEl.innerHTML = `
    ${mobileNavLink('index.html',     page, 'home',     'Home')}
    ${mobileLibraryGroup(page)}
    ${mobileNavLink('favorites.html', page, 'heart',    'Favorites')}
    ${mobileNavLink('lists.html',     page, 'layers',   'Lists')}
    ${mobileNavLink('notes.html',     page, 'list',     'Notes')}
    ${mobileNavLink('friends.html',   page, 'users',    'Friends')}
    ${mobileNavLink('profile.html',   page, 'user',     'Profile')}
    ${mobileNavLink('settings.html',  page, 'settings', 'Settings')}
    <hr>
    <a class="mobile-nav-link mobile-auth-only" href="#" onclick="openAddModal();return false">${icon('plus', 18)} Add Entry</a>
    <a class="mobile-nav-link mobile-auth-only" href="#" onclick="handleLogout();return false">${icon('logout', 18)} Sign Out</a>
    <a class="mobile-nav-link mobile-guest-only" href="login.html" style="display:none">${icon('logout', 18)} Sign In</a>`;

  /* ── BOTTOM NAV ── */
  const bottomNavEl = document.createElement('nav');
  bottomNavEl.className = 'bottom-nav';
  bottomNavEl.id = 'bottomNav';
  bottomNavEl.innerHTML = `
    ${bnItem('index.html',    page, 'home',     'Home')}
    ${bnItem('tv-shows.html', page, 'tv',       'TV')}
    ${bnItem('movies.html',   page, 'film',     'Movies')}
    ${bnItem('anime.html',    page, 'sparkles', 'Anime')}
    ${bnItem('cartoons.html', page, 'brush',    'Cartoons')}`;

  /* ── FAB ── */
  const fabEl = document.createElement('button');
  fabEl.className = 'fab';
  fabEl.setAttribute('aria-label', 'Add entry');
  fabEl.onclick = openAddModal;
  fabEl.innerHTML = icon('plus', 24);

  /* ── THEME TOGGLE ── */
  const curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const themeEl = document.createElement('div');
  themeEl.className = 'theme-toggle-pill';
  themeEl.id = 'themeTogglePill';
  themeEl.innerHTML = `
    <button class="ttp-btn ${curTheme==='dark'?'active':''}"  id="ttpDark"  onclick="setTheme('dark')"  title="Dark mode">${icon('moon',17)}</button>
    <button class="ttp-btn ${curTheme==='light'?'active':''}" id="ttpLight" onclick="setTheme('light')" title="Light mode">${icon('sun',17)}</button>`;

  /* ── MODAL ── */
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.id = 'addModal';
  modalEl.onclick = closeModalIfBg;
  modalEl.innerHTML = `
    <div class="modal">
      <div class="modal-title">Add New Entry</div>
      <div class="modal-row"><div class="modal-label">Title</div>
        <div style="position:relative">
          <input class="modal-input" id="mTitle" placeholder="Enter title…" autocomplete="off">
        </div></div>
      <div class="modal-row"><div class="modal-label">Category</div>
        ${_selDDHTML('mCat', [
          { value:'tv', label:'TV Show' },
          { value:'movies', label:'Movie' },
          { value:'anime', label:'Anime' },
          { value:'cartoons', label:'Cartoon' },
        ], null, '_updateModalStatus', 'Select category…')}</div>
      <div class="modal-row"><div class="modal-label">Status</div>
        <div id="mStatusWrap">${_selDDHTML('mStatus', [
          { value:'queue', label:'Watchlist' },
          { value:'watching', label:'Currently Watching' },
          { value:'paused', label:'Taking a Break' },
          { value:'completed', label:'Watched' },
          { value:'ongoing', label:'To Be Continued' },
        ], null, null, 'Select status…')}</div></div>
      <div class="modal-row"><div class="modal-label">Year</div>
        <input class="modal-input" id="mYear" type="number" min="1900" max="2030" placeholder="e.g. 2024"></div>
      <div id="mValidationMsg" style="display:none;font-size:12px;color:#e0a45c;background:rgba(224,164,92,0.1);border:0.5px solid rgba(224,164,92,0.3);border-radius:var(--radius-sm);padding:8px 12px;margin-top:4px;">Please select a category and status before adding.</div>
      <div class="modal-actions">
        <button class="btn-modal-cancel" onclick="closeModal()">Cancel</button>
        <button class="btn-modal-save" id="mSaveBtn" onclick="modalQuickCreate()" disabled>Add &amp; Edit →</button>
      </div>
    </div>`;

  /* ── CONFIRM DIALOG ── */
  const confirmEl = document.createElement('div');
  confirmEl.className = 'confirm-overlay';
  confirmEl.id = 'confirmOverlay';
  confirmEl.innerHTML = `
    <div class="confirm-card">
      <div class="confirm-icon"  id="confirmIcon"></div>
      <div class="confirm-title" id="confirmTitle">Are you sure?</div>
      <div class="confirm-msg"   id="confirmMsg"></div>
      <div class="confirm-actions">
        <button class="confirm-cancel" id="confirmCancel">Cancel</button>
        <button class="confirm-ok"     id="confirmOk">Confirm</button>
      </div>
    </div>`;

  /* ── TOAST ── */
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.id = 'toast';

  /* ── INSERT into DOM (direct elements, no wrapper div) ── */
  const first = document.body.firstChild;
  document.body.insertBefore(toastEl,    first);
  document.body.insertBefore(confirmEl,  first);
  document.body.insertBefore(modalEl,    first);

  // Init TMDB search now that #mTitle exists in DOM
  setTimeout(_initTMDBOnModal, 300);
  document.body.insertBefore(themeEl,    first);
  document.body.insertBefore(fabEl,      first);
  document.body.insertBefore(bottomNavEl,first);
  document.body.insertBefore(mobileNavEl,first);
  document.body.insertBefore(navEl,      first);

  /* ── FOOTER ── */
  const footerEl = document.createElement('footer');
  footerEl.className = 'site-footer';
  footerEl.innerHTML =
    '<div class="footer-row footer-row-main">'
      +'<span class="footer-created">Created by </span>'
      +'<span class="footer-name">Mohammad &amp; Narimaan</span>'
      +'<span class="footer-sep">&nbsp;&middot;&nbsp;</span>'
      +'<span class="footer-copy">&copy; 2026 MyScreenScore</span>'
    +'</div>'
    +'<div class="footer-row footer-row-tmdb">'
      +'<a href="https://www.themoviedb.org" target="_blank" rel="noopener" class="footer-tmdb-link">'
        +'Movie &amp; TV metadata provided by <span class="footer-tmdb-name">TMDB</span>'
      +'</a>'
    +'</div>';
  document.body.appendChild(footerEl);

  markActiveNav();

  // Discover dropdown on both nav search inputs (desktop + mobile)
  initDiscoverSearch('globalSearch', { max: 20, connected: true, includePersons: true });
  initDiscoverSearch('mobileSearchInput', { max: 20, connected: true, includePersons: true });
}

/* ── Link builders ── */
function navLink(href, currentPage, iconName, label) {
  const active = currentPage === href ? ' active' : '';
  return `<a class="nav-link${active}" href="${href}" data-page="${href}">${icon(iconName, 14)} ${label}</a>`;
}
function mobileNavLink(href, currentPage, iconName, label) {
  const active = currentPage === href ? ' active' : '';
  return `<a class="mobile-nav-link${active}" href="${href}" data-page="${href}">${icon(iconName, 18)} ${label}</a>`;
}
function bnItem(href, currentPage, iconName, label) {
  const active = currentPage === href ? ' active' : '';
  return `<a class="bn-item${active}" href="${href}" data-page="${href}">${icon(iconName, 22)} <span>${label}</span></a>`;
}

/* ── Library group (TV Shows / Movies / Anime / Cartoons combined) ── */
const LIBRARY_PAGES = [
  { href: 'library.html', iconName: 'list',     label: 'Library'  },
  { href: 'tv-shows.html', iconName: 'tv',       label: 'TV Shows' },
  { href: 'movies.html',   iconName: 'film',     label: 'Movies'   },
  { href: 'anime.html',    iconName: 'sparkles', label: 'Anime'    },
  { href: 'cartoons.html', iconName: 'brush',    label: 'Cartoons' },
  { href: 'completed.html',iconName: 'check',    label: 'Watched'},
];
function _isLibraryPage(page) {
  return LIBRARY_PAGES.some(p => p.href === page);
}

/* Desktop: single "Library" trigger that expands a dropdown panel */
function navLibraryDropdown(page) {
  const active = _isLibraryPage(page) ? ' active' : '';
  const items = LIBRARY_PAGES.map(p => {
    const itemActive = page === p.href ? ' active' : '';
    return `<a class="nav-lib-link${itemActive}" href="${p.href}" data-page="${p.href}">${icon(p.iconName, 14)} ${p.label}</a>`;
  }).join('');
  return `
    <div class="nav-link-group" id="navLibGroup">
      <button type="button" class="nav-link nav-link-trigger${active}" onclick="toggleLibraryMenu(event)" aria-haspopup="true">
        ${icon('grid', 14)} Library ${icon('chevdown', 11)}
      </button>
      <div class="nav-lib-dropdown" id="navLibDropdown">${items}</div>
    </div>`;
}

/* Mobile: collapsible "Library" accordion inside the hamburger drawer */
function mobileLibraryGroup(page) {
  const isActive = _isLibraryPage(page);
  const items = LIBRARY_PAGES.map(p => mobileNavLink(p.href, page, p.iconName, p.label)).join('');
  return `
    <div class="mobile-nav-group${isActive ? ' open' : ''}" id="mobileLibGroup">
      <button type="button" class="mobile-nav-link mobile-nav-group-trigger${isActive ? ' active' : ''}" onclick="toggleMobileLibrary(event)">
        ${icon('grid', 18)} Library
        <span class="mobile-nav-group-chev">${icon('chevdown', 14)}</span>
      </button>
      <div class="mobile-nav-submenu${isActive ? ' open' : ''}" id="mobileLibSubmenu">${items}</div>
    </div>`;
}


/* ── Toggle functions ── */
function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  if (nav) nav.classList.toggle('open');
}

function toggleMobileSearch() {
  const bar = document.getElementById('mobileSearchBar');
  if (bar) {
    bar.classList.toggle('open');
    if (bar.classList.contains('open')) {
      document.getElementById('mobileSearchInput')?.focus();
    }
  }
}

function toggleMobileUser(e) {
  e.stopPropagation();
  document.getElementById('mobileLibGroup')?.classList.remove('menu-open');
  const dd = document.getElementById('userMenuDropdownMobile');
  if (dd) dd.classList.toggle('open');
}

function toggleUserMenu(e) {
  e.stopPropagation();
  document.getElementById('navLibDropdown')?.classList.remove('open');
  document.getElementById('navLibGroup')?.classList.remove('menu-open');
  const dd = document.getElementById('userMenuDropdown');
  if (dd) dd.classList.toggle('open');
}

/* ── Library dropdown (desktop) ── */
function toggleLibraryMenu(e) {
  e.stopPropagation();
  document.getElementById('userMenuDropdown')?.classList.remove('open');
  const dd = document.getElementById('navLibDropdown');
  const grp = document.getElementById('navLibGroup');
  if (dd) dd.classList.toggle('open');
  if (grp) grp.classList.toggle('menu-open', dd?.classList.contains('open'));
}

/* ── Library accordion (mobile hamburger) ── */
function toggleMobileLibrary(e) {
  e.stopPropagation();
  const grp = document.getElementById('mobileLibGroup');
  const sub = document.getElementById('mobileLibSubmenu');
  if (!grp || !sub) return;
  const isOpen = grp.classList.toggle('open');
  sub.classList.toggle('open', isOpen);
}

/* Close dropdowns when clicking outside */
document.addEventListener('click', () => {
  document.getElementById('userMenuDropdown')?.classList.remove('open');
  document.getElementById('userMenuDropdownMobile')?.classList.remove('open');
  document.getElementById('navLibDropdown')?.classList.remove('open');
  document.getElementById('navLibGroup')?.classList.remove('menu-open');
});

function handleMobileSearch() {
  const q = document.getElementById('mobileSearchInput')?.value?.trim();
  if (q && q.length > 1) {
    sessionStorage.setItem('searchQuery', q);
    window.location.href = 'search.html';
  }
}

function handleGlobalSearch() {
  const q = document.getElementById('globalSearch')?.value?.trim();
  if (q && q.length > 1) {
    sessionStorage.setItem('searchQuery', q);
    window.location.href = 'search.html';
  }
}

function markActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

function _updateAddModalValidation() {
  const cat = document.getElementById('mCat')?.dataset.value;
  const status = document.getElementById('mStatus')?.dataset.value;
  const complete = !!cat && !!status;
  const msg = document.getElementById('mValidationMsg');
  const btn = document.getElementById('mSaveBtn');
  if (msg) msg.style.display = complete ? 'none' : '';
  if (btn) btn.disabled = !complete;
}

function _updateModalStatus() {
  const catEl = document.getElementById('mCat');
  const cat = catEl?.dataset.value;
  const isMovie = cat === 'movies';
  const wrap = document.getElementById('mStatusWrap');
  if (!wrap) return;
  const current = document.getElementById('mStatus')?.dataset.value || '';
  const keep = isMovie && (current === 'paused' || current === 'ongoing') ? 'watching' : current;
  const options = [
    { value:'queue', label:'Watchlist' },
    { value:'watching', label:'Currently Watching' },
    ...(!isMovie ? [{ value:'paused', label:'Taking a Break' }] : []),
    { value:'completed', label:'Watched' },
    ...(!isMovie ? [{ value:'ongoing', label:'To Be Continued' }] : []),
  ];
  wrap.innerHTML = _selDDHTML('mStatus', options, keep, '_updateAddModalValidation', 'Select status…');
  _updateAddModalValidation();
}

function _resetAddModalDropdowns() {
  const catEl = document.getElementById('mCat');
  if (catEl) {
    catEl.dataset.value = '';
    catEl.classList.add('sel-dd-placeholder');
    const label = catEl.querySelector('.sel-dd-label');
    if (label) label.textContent = 'Select category…';
    catEl.querySelectorAll('.sel-dd-opt').forEach(o => o.classList.remove('active'));
  }
  const wrap = document.getElementById('mStatusWrap');
  if (wrap) {
    wrap.innerHTML = _selDDHTML('mStatus', [
      { value:'queue', label:'Watchlist' },
      { value:'watching', label:'Currently Watching' },
      { value:'paused', label:'Taking a Break' },
      { value:'completed', label:'Watched' },
      { value:'ongoing', label:'To Be Continued' },
    ], null, '_updateAddModalValidation', 'Select status…');
  }
  _updateAddModalValidation();
}

let _scrollY = 0;
function openAddModal(cat) {
  getCurrentUser().then(user => {
    if (!user) { window.location.href = 'login.html'; return; }
    _resetAddModalDropdowns();
    const m = document.getElementById('mCat');
    if (cat && m) _selSelectDD('mCat', cat);
    document.getElementById('addModal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    _scrollY = window.scrollY;
    document.body.style.top = '-' + _scrollY + 'px';
    setTimeout(() => {
      document.getElementById('mTitle')?.focus();
    }, 150);
    document.getElementById('mobileNav')?.classList.remove('open');
  });
}

/* Init TMDB search once modal exists in DOM */
function _initTMDBOnModal() {
  if (typeof initTMDBSearch !== 'function') return;
  if (document.getElementById('mTitle-tmdb-drop')) return;
  initTMDBSearch('mTitle', () => document.getElementById('mCat')?.dataset.value || 'tv', entry => {
    if (entry.title) document.getElementById('mTitle').value = entry.title;
    if (entry.cat)  { _selSelectDD('mCat', entry.cat); }
    if (entry.year) { const y = document.getElementById('mYear'); if(y) y.value = entry.year; }
    _updateModalStatus();
    // Store the FULL entry object so detail.html can apply all fields
    window._tmdbPrefill = entry;
    console.log('[TMDB] prefill stored:', entry);
  }, { connected: true });
}

function closeModal() {
  document.getElementById('addModal')?.classList.remove('open');
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.top = '';
  window.scrollTo(0, _scrollY || 0);
}

function closeModalIfBg(e) {
  if (e.target === document.getElementById('addModal')) closeModal();
}

/* ── Quick create from modal ── */
async function modalQuickCreate() {
  const title = document.getElementById('mTitle')?.value?.trim();
  if (!title) { showToast('Please enter a title.', 'err'); return; }

  const prefillCatCheck = window._tmdbPrefill?.cat;
  const catVal = prefillCatCheck || document.getElementById('mCat')?.dataset.value;
  if (!catVal) { showToast('Please select a category.', 'err'); return; }
  const statusVal = document.getElementById('mStatus')?.dataset.value;
  if (!statusVal) { showToast('Please select a status.', 'err'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  const btn = document.querySelector('.btn-modal-save');

  // If a TMDB result was just clicked, its runtime/season detail fetch may still
  // be in flight — wait for it so we never save without that data.
  if (window._tmdbSelectionInFlight) {
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching details…'; }
    try { await window._tmdbSelectionInFlight; } catch(e) { /* ignore, fall back to manual fields */ }
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    // If a TMDB result was selected, merge its data into the quick create
    const prefill = window._tmdbPrefill || {};
    const entry = await quickCreate({
      title:         prefill.title         || title,
      cat:           prefill.cat           || document.getElementById('mCat').dataset.value,
      status:        document.getElementById('mStatus').dataset.value,
      year:          prefill.year          || document.getElementById('mYear')?.value || null,
      description:   prefill.description   || null,
      genres:        prefill.genres        || [],
      poster_url:    prefill.poster_url    || null,
      total_seasons: prefill.total_seasons || null,
      total_eps:     prefill.total_eps     || null,
      runtime_h:     prefill.runtime_h     || null,
      runtime_m:     prefill.runtime_m     || null,
      tmdb_id:       prefill.tmdb_id       || null,
      tmdb_type:     prefill.tmdb_type     || null,
    }, user.id);

    closeModal();
    // Pass remaining TMDB prefill data to detail page
    if (window._tmdbPrefill) {
      sessionStorage.setItem('tmdbPrefill', JSON.stringify(window._tmdbPrefill));
      window._tmdbPrefill = null;
    }
    goToDetail(entry.id, CAT_META[entry.cat]?.page || 'index.html');
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Add & Edit →'; }
    if (e.message && e.message.startsWith('DUPLICATE:')) {
      const dupe = JSON.parse(e.message.slice(10));
      const catLabel = (CAT_META[dupe.cat] && CAT_META[dupe.cat].label) || dupe.cat;
      _showDuplicateWarning(title, catLabel);
    } else {
      showToast('Error creating entry.', 'err');
      console.error(e);
    }
  }
}

/* Keyboard shortcuts */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('addModal')?.classList.contains('open')) closeModal();
    document.getElementById('mobileNav')?.classList.remove('open');
    document.getElementById('mobileSearchBar')?.classList.remove('open');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    window.location.reload();
  }
  if (e.key === 'n' && !e.target.closest('input,textarea,select')) openAddModal();
  if (e.key === '/' && !e.target.closest('input,textarea,select')) {
    e.preventDefault();
    document.getElementById('globalSearch')?.focus();
  }
});

/* ══════════════════════════════════════════
   Pull-to-refresh
   Page drags down naturally, loading bar on release
══════════════════════════════════════════ */
(function() {
  const MAX_PULL  = 85;
  let startY = 0, currentY = 0, pulling = false, triggered = false;

  // Loading bar at top
  const bar = document.createElement('div');
  bar.id = 'ptr-bar';
  document.body.insertBefore(bar, document.body.firstChild);

  const style = document.createElement('style');
  style.textContent = `
    body { overscroll-behavior-y: none; }

    /* Top loading bar */
    #ptr-bar {
      position: fixed;
      top: 0; left: 0;
      width: 0%;
      height: 2px;
      background: var(--olive-light);
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.2s;
    }
    #ptr-bar.ptr-loading {
      opacity: 1;
      animation: ptr-load 0.6s ease forwards;
    }
    @keyframes ptr-load {
      0%   { width: 0%; }
      40%  { width: 60%; }
      70%  { width: 80%; }
      100% { width: 95%; }
    }

    /* Page content drags */
    body.ptr-pulling > *:not(#ptr-bar) {
      transform: translateY(var(--ptr-y, 0px));
      transition: none;
    }
    body.ptr-snap > *:not(#ptr-bar) {
      transform: translateY(0);
      transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }
  `;
  document.head.appendChild(style);

  function setTranslate(px) {
    document.body.style.setProperty('--ptr-y', px + 'px');
  }

  document.addEventListener('touchstart', e => {
    if (window.scrollY > 0) return;
    if (e.target.closest('.hc-card, .det-comments-card, .modal-wrap, [class*="overlay"], .mobile-nav')) return;
    startY = e.touches[0].clientY;
    pulling = false;
    triggered = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (triggered) return;
    if (window.scrollY > 0) return;
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    // Only claim the gesture once it's confirmed as a genuine downward
    // pull. Calling preventDefault() unconditionally here (even before
    // checking direction) was meant to close a small timing gap with the
    // native pull-to-refresh gesture, but it also blocked the browser's
    // default scroll-down behavior on every page load (scrollY starts at
    // 0 everywhere) — breaking normal scrolling entirely. Correctness of
    // scrolling matters far more than shaving that native-gesture edge case.
    if (diff <= 0) return;
    e.preventDefault();
    pulling = true;
    const pull = Math.min(diff * 0.42, MAX_PULL);
    document.body.classList.add('ptr-pulling');
    document.body.classList.remove('ptr-snap');
    setTranslate(pull);
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!pulling) return;
    const diff = currentY - startY;
    const pull = Math.min(diff * 0.42, MAX_PULL);
    if (pull >= MAX_PULL && !triggered) {
      triggered = true;
      // Snap page back up
      document.body.classList.remove('ptr-pulling');
      document.body.classList.add('ptr-snap');
      setTranslate(0);
      // Show loading bar
      bar.classList.add('ptr-loading');
      setTimeout(() => {
        // Failsafe: reg.update() is a network call and can hang or fail —
        // never let that leave the page stuck on the loading bar forever.
        // Whatever happens with the service-worker check, the reload
        // fires within 1.5s no matter what.
        let done = false;
        const doReload = () => { if (!done) { done = true; window.location.reload(true); } };
        setTimeout(doReload, 1500);
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            if (reg) {
              reg.update().then(doReload).catch(doReload);
            } else {
              doReload();
            }
          }).catch(doReload);
        } else {
          doReload();
        }
      }, 300);
    } else {
      document.body.classList.remove('ptr-pulling');
      document.body.classList.add('ptr-snap');
      setTranslate(0);
      setTimeout(() => document.body.classList.remove('ptr-snap'), 300);
    }
    pulling = false;
  });
})();
/* ══════════════════════════════════════════
   tmdb.js — TMDB + AniList auto-complete
   Attach to any title input by calling:
     initTMDBSearch(inputId, onSelect)
   onSelect(data) receives the filled entry object
══════════════════════════════════════════ */

const TMDB_KEY  = '76cd214d703cd01341549206b8a3b57e'; // replace with your key from themoviedb.org
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w185';
const TMDB_FULL = 'https://image.tmdb.org/t/p/w500';

// Validate key on load
if (TMDB_KEY === 'YOUR_TMDB_API_KEY') {
  console.warn('[TMDB] API key not set — replace YOUR_TMDB_API_KEY in js/tmdb.js');
}

/* ── Genre ID → label mapping ── */
const TMDB_GENRE_MAP = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy',
  80:'Crime', 99:'Documentary', 18:'Drama', 10751:'Family',
  14:'Fantasy', 36:'History', 27:'Horror', 10402:'Music',
  9648:'Mystery', 10749:'Romance', 878:'Sci-Fi', 53:'Thriller',
  10752:'War', 37:'Western', 10759:'Action', 10762:'Animation',
  10763:'News', 10764:'Reality', 10765:'Sci-Fi', 10766:'Soap',
  10767:'Talk', 10768:'War', 10770:'TV Movie'
};

/* ── AniList GraphQL query ── */
async function _anilistSearch(query) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: `
        query ($search: String) {
          Page(page: 1, perPage: 6) {
            media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
              id title { english romaji }
              episodes duration format startDate { year }
              coverImage { medium large }
              genres description(asHtml: false)
              season seasonYear
            }
          }
        }`, variables: { search: query } })
    });
    const json = await res.json();
    return json?.data?.Page?.media || [];
  } catch { return []; }
}

/* ── TMDB multi-search ── */
async function _tmdbSearch(query, limit = 6, includePersons = false) {
  if (TMDB_KEY === 'YOUR_TMDB_API_KEY') { console.warn('[TMDB] Key not set'); return []; }
  try {
    const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
    console.log('[TMDB] searching:', query);
    const res = await fetch(url);
    if (!res.ok) { console.error('[TMDB] HTTP error:', res.status, res.statusText); return []; }
    const json = await res.json();
    console.log('[TMDB] results:', json.results?.length || 0);
    const allowed = includePersons ? ['movie', 'tv', 'person'] : ['movie', 'tv'];
    return (json.results || []).filter(r => allowed.includes(r.media_type)).slice(0, limit);
  } catch(e) { console.error('[TMDB] fetch error:', e); return []; }
}

/* ── Fetch TV detail (seasons/episodes) ── */
async function _tmdbTV(id) {
  try {
    const res = await fetch(`${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`);
    const data = await res.json();

    // Fetch per-season episode counts (skip specials = season 0)
    const seasons = (data.seasons || []).filter(s => s.season_number > 0);
    data._season_breakdown = seasons.map(s => s.episode_count);

    return data;
  } catch { return null; }
}

/* ── Fetch Movie detail (runtime) ── */
async function _tmdbMovie(id) {
  try {
    const res = await fetch(`${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=en-US`);
    return await res.json();
  } catch { return null; }
}

/* ── Map TMDB result → entry fields ── */
function _tmdbToEntry(result, detail) {
  const isMovie = result.media_type === 'movie';
  const genres  = (result.genre_ids || []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean).slice(0, 5);
  const year    = isMovie
    ? (result.release_date || '').split('-')[0]
    : (result.first_air_date || '').split('-')[0];
  const title   = isMovie ? result.title : result.name;
  const poster  = result.poster_path ? TMDB_FULL + result.poster_path : null;
  const desc    = result.overview || '';
  const cat     = isMovie ? 'movies' : 'tv';

  const entry = { title, cat, year, genres, poster_url: poster, description: desc, _source: 'tmdb', tmdb_id: result.id, tmdb_type: result.media_type };

  if (detail) {
    if (!isMovie) {
      entry.total_seasons = detail.number_of_seasons || null;
      entry.total_eps     = detail.number_of_episodes || null;
      entry._season_breakdown = detail._season_breakdown || [];
      // Only set completion year if show has actually ended
      const status = detail.status; // 'Ended', 'Canceled', 'In Production', 'Returning Series' etc
      if ((status === 'Ended' || status === 'Canceled') && detail.last_air_date) {
        entry._completion_year = detail.last_air_date.split('-')[0];
      } else {
        entry._completion_year = null; // leave blank for ongoing shows
      }
    } else {
      const mins = detail.runtime || 0;
      entry.runtime_h = mins > 0 ? Math.floor(mins / 60) : null;
      entry.runtime_m = mins > 0 ? (mins % 60) : null;
    }
  }
  return entry;
}

/* ── Map AniList result → entry fields ── */
function _anilistToEntry(media) {
  const title  = media.title?.english || media.title?.romaji || '';
  const year   = media.startDate?.year ? String(media.startDate.year) : '';
  const genres = (media.genres || []).slice(0, 5);
  const poster = media.coverImage?.large || media.coverImage?.medium || null;
  const desc   = (media.description || '').replace(/<[^>]+>/g, '').trim();
  const isMovie = media.format === 'MOVIE';
  const duration = media.duration || null; // AniList gives duration in minutes
  return {
    title, cat: 'anime', year, genres, poster_url: poster, description: desc,
    total_eps: isMovie ? null : (media.episodes || null),
    runtime_h: isMovie && duration ? Math.floor(duration / 60) : null,
    runtime_m: isMovie && duration ? (duration % 60) : null,
    ratings: { _type: isMovie ? 'movie' : 'show' },
    _source: 'anilist'
  };
}

/* ══════════════════════════════════════════
   initDiscoverSearch — type-ahead TMDB dropdown
   used by the nav search bar + home hero search.
   Unlike initTMDBSearch (which fills the Add Entry
   form), selecting a result here navigates to
   title.html — the TMDB detail/discovery page.
   inputId: id of the <input> element
   opts.max: how many results to show (nav = 3, home hero = more)
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   Dropdown mutual exclusivity — opening any
   dropdown (search results, sel-dd, etc.) closes
   whatever other dropdown was already open.
══════════════════════════════════════════ */
function _closeAllDropdownsExcept(exceptId) {
  document.querySelectorAll('.tmdb-dropdown.open').forEach(el => {
    if (el.id !== exceptId) { el.classList.remove('open'); el.innerHTML = ''; }
  });
  document.querySelectorAll('.sel-dd.open').forEach(el => {
    if (el.id !== exceptId) el.classList.remove('open');
  });
  document.querySelectorAll('.td-dd.open').forEach(el => {
    if (el.id !== exceptId) el.classList.remove('open');
  });
}

/* ══════════════════════════════════════════
   sel-dd — reusable theme-aware dropdown
   (drop-in replacement for a native <select>)
   options: [{value,label}], selected: current value
   Reads back via document.getElementById(id).dataset.value
══════════════════════════════════════════ */
function _selDDHTML(id, options, selected, onchangeFn, placeholder) {
  const selOpt = options.find(o => o.value === selected);
  const usePlaceholder = !selOpt && placeholder;
  const label = selOpt ? selOpt.label : (usePlaceholder ? placeholder : options[0].label);
  const value = selOpt ? selOpt.value : (usePlaceholder ? '' : options[0].value);
  return `<div class="sel-dd${usePlaceholder ? ' sel-dd-placeholder' : ''}" id="${id}" data-value="${value}" ${onchangeFn ? `data-onchange="${onchangeFn}"` : ''}>
    <button type="button" class="sel-dd-trigger" onclick="event.stopPropagation();_selToggleDD('${id}')">
      <span class="sel-dd-label">${label}</span>
      <svg class="sel-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="sel-dd-menu">
      ${options.map(o => `<div class="sel-dd-opt${o.value===value?' active':''}" data-value="${o.value}" onclick="event.stopPropagation();_selSelectDD('${id}','${o.value}')">${o.label}</div>`).join('')}
    </div>
  </div>`;
}

function _selToggleDD(id) {
  const target = document.getElementById(id);
  const wasOpen = target.classList.contains('open');
  if (wasOpen) { target.classList.remove('open'); return; }
  _closeAllDropdownsExcept(id);
  target.classList.add('open');
}

function _selSelectDD(id, value) {
  const el = document.getElementById(id);
  el.dataset.value = value;
  el.classList.remove('sel-dd-placeholder');
  const opt = el.querySelector(`.sel-dd-opt[data-value="${value}"]`);
  if (opt) el.querySelector('.sel-dd-label').textContent = opt.textContent;
  el.querySelectorAll('.sel-dd-opt').forEach(o => o.classList.toggle('active', o.dataset.value === value));
  el.classList.remove('open');
  const onchange = el.getAttribute('data-onchange');
  if (onchange) window[onchange]?.(value);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.sel-dd')) {
    document.querySelectorAll('.sel-dd.open').forEach(el => el.classList.remove('open'));
  }
});

/* ══════════════════════════════════════════
   Viewport-aware positioning for fixed-position
   dropdowns. On mobile, opening the keyboard
   shrinks/offsets the *visual* viewport while
   window.innerWidth/Height and getBoundingClientRect()
   stay layout-viewport-relative — and position:fixed
   elements track the visual viewport on modern mobile
   browsers. Without correcting for that mismatch, any
   fixed dropdown anchored to an input drifts away from
   it the moment the keyboard opens. This helper gives
   both search dropdowns a single, consistent fix.
══════════════════════════════════════════ */
function _viewportInfo() {
  const vv = window.visualViewport;
  return vv
    ? { vw: vv.width, vh: vv.height, offX: vv.offsetLeft, offY: vv.offsetTop }
    : { vw: window.innerWidth, vh: window.innerHeight, offX: 0, offY: 0 };
}

function initDiscoverSearch(inputId, opts = {}) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const max = opts.max || 3;
  const connected = !!opts.connected;
  const includePersons = !!opts.includePersons;
  const anchor = connected ? (input.closest('.hero-search-wrap, .fused-search-wrap') || input) : input;

  // Anchors inside the fixed <nav> bar never move with page scroll, so a
  // viewport-relative position:fixed dropdown tracks them correctly. Anchors
  // in normal scrollable page content (hero search, friends "Find People",
  // etc.) need position:absolute in document coordinates instead — that way
  // the dropdown scrolls with the page automatically, with no JS needed to
  // chase it. Using position:fixed for those was the root cause of both the
  // keyboard misplacement and the "moves while scrolling" jank: the browser
  // auto-scrolls the page to reveal a focused input above the keyboard, and
  // every scroll tick after that requires more fixed-position math to catch up.
  const inFixedNav = !!anchor.closest('nav');

  const drop = document.createElement('div');
  drop.className = connected ? 'tmdb-dropdown dd-connected' : 'tmdb-dropdown';
  drop.style.position = inFixedNav ? 'fixed' : 'absolute';
  // .dd-connected's z-index (390) is tuned for dropdowns living in normal
  // page content, well clear of the nav bar (z-index:400). A connected
  // dropdown anchored *inside* the nav sits right at its edge, so it needs
  // to clear the nav explicitly or its top portion renders behind it.
  if (connected && inFixedNav) drop.style.zIndex = 500;
  drop.id = inputId + '-discover-drop';
  document.body.appendChild(drop);

  let _timer = null;
  let _lastQ  = '';

  function _positionDrop() {
    // Pinch-zoom makes fixed/absolute positioning notoriously unreliable
    // to track precisely across browsers mid-gesture — rather than risk
    // the dropdown rendering detached or invisible, just close it cleanly
    // as soon as zoom is detected.
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.01) {
      _closeDrop();
      return;
    }

    const raw = anchor.getBoundingClientRect();
    const { vw, vh, offX, offY } = _viewportInfo();
    const isMobile = vw <= 640;
    const gap = connected ? 0 : 4;

    if (inFixedNav) {
      // Translate the layout-viewport-relative rect into visual-viewport
      // space so it lines up with where the fixed-position dropdown renders.
      const r = { left: raw.left - offX, right: raw.right - offX, top: raw.top - offY, bottom: raw.bottom - offY, width: raw.width };
      if (r.bottom <= 0 || r.top >= vh) { _closeDrop(); return; }

      // Same structure as the in-page (index) dropdown, applied uniformly
      // across all screen sizes: width/left come straight from the
      // anchor's own box rather than being clamped against
      // visualViewport's width (pinch-zoom shrinks that value without
      // proportionally shrinking getBoundingClientRect(), and clamping
      // against the mismatched number is what made it look narrower or
      // misaligned than the input). It also always stays glued directly
      // below the input instead of flipping above when space is tight —
      // flipping only ever ran on wider screens here, and is what caused
      // the same "teleports to the top of the screen" bug we already
      // fixed for mobile, just left unfixed on desktop-width nav bars.
      const dropW = r.width;
      const left  = r.left;
      const spaceBelow = vh - r.bottom - gap;
      const dropMaxH = Math.max(44, Math.min(isMobile ? 220 : 340, spaceBelow - 8, vh - 16));
      const top = r.bottom + gap;

      drop.style.top       = top + 'px';
      drop.style.left      = left + 'px';
      drop.style.width     = dropW + 'px';
      drop.style.maxHeight = dropMaxH + 'px';
    } else {
      // In-flow anchors: position in document coordinates. No scroll
      // listener needed — position:absolute keeps it glued below the
      // input as the page (and any keyboard-driven scroll-into-view) moves.
      // Width/left come straight from the anchor's own box rather than
      // being clamped against visualViewport's width — pinch-zoom shrinks
      // that value without proportionally shrinking getBoundingClientRect(),
      // and clamping against the mismatched number is what made the
      // dropdown look narrower/misaligned than the input whenever zoom
      // was active. This matches the friends-page dropdown, which never
      // had that clamp and doesn't show the issue.
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const dropW = raw.width;
      const left  = raw.left + scrollX;
      const top   = raw.bottom + scrollY + gap;
      // Still cap height to whatever's visible right now below the input
      // (accounts for the keyboard eating the visual viewport) so it
      // doesn't render mostly hidden — the rest is a page-scroll away.
      const spaceBelowVisible = vh - (raw.bottom - offY) - gap;
      const dropMaxH = Math.max(44, Math.min(isMobile ? 220 : 340, spaceBelowVisible - 8, vh - 16));
      drop.style.top       = top + 'px';
      drop.style.left      = left + 'px';
      drop.style.width     = dropW + 'px';
      drop.style.maxHeight = dropMaxH + 'px';
    }
  }

  function _closeDrop() {
    drop.classList.remove('open');
    drop.innerHTML = '';
    if (connected) anchor.classList.remove('dd-connected-active');
  }

  async function _search() {
    const q = input.value.trim();
    if (q.length < 2 || q === _lastQ) return;
    _lastQ = q;
    _positionDrop();
    drop.innerHTML = '<div class="tmdb-loading">Searching…</div>';
    _closeAllDropdownsExcept(drop.id);
    drop.classList.add('open');
    if (connected) anchor.classList.add('dd-connected-active');

    const tmdb = await _tmdbSearch(q, max, includePersons);
    const results = tmdb.map(r => {
      if (r.media_type === 'person') {
        return {
          id:     r.id,
          type:   'person',
          title:  r.name,
          year:   '',
          thumb:  r.profile_path ? TMDB_IMG + r.profile_path : null,
          label:  r.known_for_department || 'Person',
          genres: [],
        };
      }
      const isMovie = r.media_type === 'movie';
      return {
        id:    r.id,
        type:  isMovie ? 'movie' : 'tv',
        title: isMovie ? r.title : r.name,
        year:  (isMovie ? r.release_date : r.first_air_date || '').split('-')[0],
        thumb: r.poster_path ? TMDB_IMG + r.poster_path : null,
        label: isMovie ? 'Movie' : 'TV Show',
        genres: (r.genre_ids || []).map(gid => TMDB_GENRE_MAP[gid]).filter(Boolean).slice(0, 2),
      };
    });

    if (!results.length) {
      drop.innerHTML = '<div class="tmdb-empty">No results found</div>';
      return;
    }

    drop.innerHTML = results.map((r, i) => `
      <div class="tmdb-item" data-i="${i}">
        <div class="tmdb-thumb${r.type === 'person' ? ' tmdb-thumb-round' : ''}">
          ${r.thumb ? `<img src="${r.thumb}" loading="lazy">` : '<div class="tmdb-thumb-ph"></div>'}
        </div>
        <div class="tmdb-info">
          <div class="tmdb-title">${r.title || '—'}</div>
          <div class="tmdb-meta">
            <span class="tmdb-tag">${r.label}</span>
            ${r.year ? `<span class="tmdb-year">${r.year}</span>` : ''}
            ${r.genres.length ? `<span class="tmdb-genres">${r.genres.join(' · ')}</span>` : ''}
          </div>
        </div>
      </div>`).join('');

    drop.querySelectorAll('.tmdb-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        const r = results[i];
        _closeDrop();
        input.value = '';
        window.location.href = r.type === 'person'
          ? `person.html?id=${r.id}`
          : `title.html?type=${r.type}&id=${r.id}`;
      });
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(_timer);
    if (input.value.trim().length < 2) { _closeDrop(); return; }
    _timer = setTimeout(_search, 350);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') _closeDrop();
  });

  window.addEventListener('resize', _positionDrop, { passive: true });
  if (inFixedNav) window.addEventListener('scroll', _positionDrop, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _positionDrop);
    if (inFixedNav) window.visualViewport.addEventListener('scroll', _positionDrop);
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#' + inputId) && !e.target.closest('#' + drop.id)) {
      _closeDrop();
    }
  });
}

/* ══════════════════════════════════════════
   initTMDBSearch — attach to an input
   inputId: id of the <input> element
   getCat:  function returning current category ('tv','movies','anime','cartoons')
   onSelect: function called with the filled entry object
══════════════════════════════════════════ */
function initTMDBSearch(inputId, getCat, onSelect, opts = {}) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const connected = !!opts.connected;

  /* Create dropdown */
  const drop = document.createElement('div');
  drop.className = connected ? 'tmdb-dropdown dd-connected dd-connected-modal' : 'tmdb-dropdown';
  drop.id = inputId + '-tmdb-drop';
  document.body.appendChild(drop);

  let _timer = null;
  let _lastQ  = '';

  function _positionDrop() {
    const raw = input.getBoundingClientRect();
    const { vw, vh, offX, offY } = _viewportInfo();
    // Translate the layout-viewport-relative rect into visual-viewport space
    // so it lines up with where the fixed-position dropdown actually renders.
    const r = { left: raw.left - offX, right: raw.right - offX, top: raw.top - offY, bottom: raw.bottom - offY, width: raw.width };

    // If the input has scrolled out of the visible area, close instead of
    // dragging a disconnected box around.
    if (r.bottom <= 0 || r.top >= vh) { _closeDrop(); return; }

    const isMobile = vw <= 640;
    // Width: on mobile use full input width clamped to viewport
    const dropW = isMobile ? Math.min(r.width, vw - 24) : r.width;
    // Left: clamp so dropdown never goes off-screen
    const gap = connected ? 0 : 4;
    let left = Math.max(isMobile ? 12 : 0, Math.min(r.left, vw - dropW - (isMobile ? 12 : gap)));
    const spaceBelow = vh - r.bottom - gap;
    let top, dropMaxH;

    if (isMobile) {
      // Flipping above assumes room up there — with the keyboard open
      // there usually isn't, which is what sent the dropdown flying to
      // the top of the screen. Stay glued directly below the input and
      // shrink to whatever space is actually available instead.
      dropMaxH = Math.max(44, Math.min(220, spaceBelow - 8, vh - 16));
      top = r.bottom + gap;
    } else {
      dropMaxH = Math.min(240, vh - 16);
      top = spaceBelow >= Math.min(dropMaxH, 80)
        ? r.bottom + gap
        : Math.max(8, r.top - Math.min(dropMaxH, spaceBelow < 0 ? dropMaxH : vh - r.bottom) - gap);
    }

    drop.style.top       = top + 'px';
    drop.style.left      = left + 'px';
    drop.style.width     = dropW + 'px';
    drop.style.maxWidth  = (vw - 24) + 'px';
    drop.style.maxHeight = dropMaxH + 'px';
  }

  function _closeDrop() {
    drop.classList.remove('open');
    drop.innerHTML = '';
    if (connected) input.classList.remove('dd-connected-active');
  }

  async function _search() {
    const q   = input.value.trim();
    const cat = getCat ? getCat() : 'tv';
    if (q.length < 2 || q === _lastQ) return;
    _lastQ = q;
    _positionDrop();
    drop.innerHTML = '<div class="tmdb-loading">Searching…</div>';
    _closeAllDropdownsExcept(drop.id);
    drop.classList.add('open');
    if (connected) input.classList.add('dd-connected-active');

    let results = [];

    // All categories search full TMDB database
    // Only 'movies' filters to movie type only, everything else shows all results
    const tmdb = await _tmdbSearch(q, 20);
    let filtered = cat === 'movies'
      ? tmdb.filter(r => r.media_type === 'movie')
      : cat === 'tv'
        ? tmdb.filter(r => r.media_type === 'tv')
        : tmdb; // anime and cartoons — show everything

    results = filtered.map(r => {
      const isMovie = r.media_type === 'movie';
      return {
        _raw: r, _type: 'tmdb',
        title: isMovie ? r.title : r.name,
        year:  (isMovie ? r.release_date : r.first_air_date || '').split('-')[0],
        thumb: r.poster_path ? TMDB_IMG + r.poster_path : null,
        label: isMovie ? 'Movie' : 'TV Show',
        genres: (r.genre_ids || []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean).slice(0, 2)
      };
    });

    // For anime with few results, supplement with AniList
    if (cat === 'anime' && results.length < 5) {
      const aniResults = await _anilistSearch(q);
      const extra = aniResults.map(m => ({
        _raw: m, _type: 'anilist',
        title: m.title?.english || m.title?.romaji,
        year:  m.startDate?.year ? String(m.startDate.year) : '',
        thumb: m.coverImage?.medium || null,
        label: m.format === 'MOVIE' ? 'Movie' : 'TV Show',
        genres: (m.genres || []).slice(0, 2)
      }));
      results = [...results, ...extra].slice(0, 20);
    }

    if (!results.length) {
      drop.innerHTML = '<div class="tmdb-empty">No results found</div>';
      return;
    }

    drop.innerHTML = results.map((r, i) => `
      <div class="tmdb-item" data-i="${i}">
        <div class="tmdb-thumb">
          ${r.thumb ? `<img src="${r.thumb}" loading="lazy">` : '<div class="tmdb-thumb-ph"></div>'}
        </div>
        <div class="tmdb-info">
          <div class="tmdb-title">${r.title || '—'}</div>
          <div class="tmdb-meta">
            <span class="tmdb-tag">${r.label}</span>
            ${r.year ? `<span class="tmdb-year">${r.year}</span>` : ''}
            ${r.genres.length ? `<span class="tmdb-genres">${r.genres.join(' · ')}</span>` : ''}
          </div>
        </div>
      </div>`).join('');

    /* Click handlers */
    drop.querySelectorAll('.tmdb-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        const r = results[i];
        _closeDrop();
        input.value = r.title || '';
        input.disabled = true;

        window._tmdbSelectionInFlight = (async () => {
          let entry;
          try {
            if (r._type === 'anilist') {
              entry = _anilistToEntry(r._raw);
              entry.cat = 'anime';
            } else {
              const isMovie = r._raw.media_type === 'movie';
              const detail  = isMovie ? await _tmdbMovie(r._raw.id) : await _tmdbTV(r._raw.id);
              entry = _tmdbToEntry(r._raw, detail);
              // Keep the user's chosen category (anime/cartoons override TMDB cat)
              if (cat === 'anime' || cat === 'cartoons') entry.cat = cat;
            }
            if (onSelect) onSelect(entry);
            showToast && showToast('Details filled from TMDB ✓');
          } finally {
            input.disabled = false;
            window._tmdbSelectionInFlight = null;
          }
          return entry;
        })();
      });
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(_timer);
    if (input.value.trim().length < 2) { _closeDrop(); return; }
    _timer = setTimeout(_search, 400);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') _closeDrop();
  });

  window.addEventListener('scroll', _positionDrop, { passive: true });
  window.addEventListener('resize', _positionDrop, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _positionDrop);
    window.visualViewport.addEventListener('scroll', _positionDrop);
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#' + inputId) && !e.target.closest('#' + inputId + '-tmdb-drop')) {
      _closeDrop();
    }
  });
}
function _showDuplicateWarning(title, catLabel) {
  const old = document.getElementById('dupWarnOverlay');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'dupWarnOverlay';
  el.style.cssText = 'position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;opacity:0;transition:opacity .2s;pointer-events:none;';
  el.innerHTML = '<div id="dupWarnCard" style="background:var(--bg-2);border:1.5px solid var(--olive-light);box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);width:97%;max-width:440px;padding:28px 28px 24px;box-sizing:border-box;transform:translateY(16px);transition:transform .25s cubic-bezier(.4,0,.2,1);text-align:center;">'
    + '<div style="color:var(--olive-light);margin-bottom:14px;opacity:.7;">' + icon('x', 32) + '</div>'
    + '<h2 style="font-family:var(--serif);font-size:22px;font-weight:300;margin-bottom:10px;color:var(--text);">This Entry Already Exists</h2>'
    + '<p style="font-size:14px;color:var(--text-2);line-height:1.6;margin-bottom:6px;"><strong style="color:var(--text);">' + title + '</strong> is already in your library as a <strong style="color:var(--text);">' + catLabel + '</strong>.</p>'
    + '<p style="font-size:13px;color:var(--text-3);margin-bottom:24px;">Close this to update your existing entry instead.</p>'
    + '<button onclick="_closeDupWarn()" style="padding:10px 28px;border-radius:var(--radius-sm);background:var(--olive);color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans);">Got it</button>'
    + '</div>';
  el.addEventListener('click', function(ev) { if (ev.target === el) _closeDupWarn(); });
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function() {
    el.style.opacity = '1'; el.style.pointerEvents = 'auto';
    document.getElementById('dupWarnCard').style.transform = 'translateY(0)';
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { _closeDupWarn(); document.removeEventListener('keydown', esc); }
  }, { once: true });
}

function _closeDupWarn() {
  const el = document.getElementById('dupWarnOverlay');
  if (el) el.remove();
  document.body.style.overflow = '';
}