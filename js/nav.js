/* ══════════════════════════════════════════
   nav.js — Chrome injection + auth guard
══════════════════════════════════════════ */

/* New episodes + movie releases → notifications, on whatever page you open
   (tv-schedule.js, loaded here when the page doesn't have it; it waits 3 hours
   between checks). Runs once the page has settled so it never slows it down. */
function _navReleaseCheck(user) {
  const run = () => {
    if (typeof MSSSchedule !== 'undefined') { MSSSchedule.checkReleases(user.id); return; }
    const sc = document.createElement('script');
    sc.src = 'js/tv-schedule.js'; sc.async = true;
    sc.onload = () => { if (typeof MSSSchedule !== 'undefined') MSSSchedule.checkReleases(user.id); };
    document.head.appendChild(sc);
  };
  ('requestIdleCallback' in window) ? requestIdleCallback(() => setTimeout(run, 1500), { timeout: 6000 }) : setTimeout(run, 3000);
}

/* Spotlights (054): the popup for an official challenge — js/spotlights.js
   (+ medals.js), loaded on the home page every time the app is opened. */
/* "Does this count?" (061): a title just marked Watched while you're in a running
   "Let me choose" challenge → tick the challenges it counts for. Asked once per
   title (a "No" is remembered on this device); already-counted ones show ticked. */
document.addEventListener('mss:watched', async ev => {
  const e = ev.detail; if (!e?.id || !window._navUser) return;
  _navFinishCheck(1200, true);
  let opts = [];
  try { const { data, error } = await sb.rpc('challenge_pick_options', { p_entry: e.id }); if (error) return; opts = Array.isArray(data) ? data : []; } catch { return; }
  let seen = {}; try { seen = JSON.parse(localStorage.getItem('mss_pick_asked') || '{}'); } catch {}
  opts = opts.filter(o => !o.picked && !seen[o.id + ':' + e.id]);
  if (!opts.length) return;
  _navPickAsk(e, opts);
});
function _navPickAsk(e, opts) {
  let ov = document.getElementById('pickAskOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'pickAskOverlay'; ov.className = 'soc-overlay';
    ov.innerHTML = `<div class="soc-card pick-ask" role="dialog" aria-modal="true" aria-labelledby="pickAskTitle">
        <div class="sf-header"><div class="sf-title" id="pickAskTitle">Does this count?</div><button type="button" class="sf-close" aria-label="Close">${icon('x', 18)}</button></div>
        <div class="sf-body" id="pickAskBody"></div><div class="sf-footer" id="pickAskFoot"></div></div>`;
    ov.querySelector('.sf-close').onclick = () => _navPickDone(false);
    MSSDialog.bind(ov, () => _navPickDone(false));
    document.body.appendChild(ov);
  }
  ov._pick = { e, opts };
  const poster = safeURL(e.poster_url);
  document.getElementById('pickAskBody').innerHTML = `
    <div class="pick-ask-title"><span class="pick-ask-poster">${poster ? `<img src="${poster}" alt="">` : escHTML((e.title || '?')[0])}</span>
      <span><b translate="no">${escHTML(e.title || 'This title')}</b><small>You just marked it Watched</small></span></div>
    <p class="pick-ask-q">Tick the challenges it counts for:</p>
    <div class="pick-ask-list">${opts.map((o, i) => `<label class="pick-ask-opt"><input type="checkbox" value="${i}" checked>
        <span>${icon('trophy', 15)}<b translate="no">${escHTML(o.title)}</b><small>${o.progress} / ${o.goal} so far</small></span></label>`).join('')}</div>`;
  document.getElementById('pickAskFoot').innerHTML = `<button type="button" class="sf-clear-btn" onclick="_navPickDone(false)">Doesn’t count</button>
    <button type="button" class="sf-apply-btn" onclick="_navPickDone(true)">${icon('check', 14)} Count it</button>`;
  MSSDialog.open(ov, { focus: '#pickAskFoot .sf-apply-btn' });
}
async function _navPickDone(save) {
  const ov = document.getElementById('pickAskOverlay'), st = ov?._pick; if (!st) return;
  ov._pick = null;
  const on = save ? [...ov.querySelectorAll('.pick-ask-opt input:checked')].map(i => st.opts[+i.value]) : [];
  MSSDialog.close(ov);
  try {   // remember the ones left unticked, so they aren't asked again
    const seen = JSON.parse(localStorage.getItem('mss_pick_asked') || '{}');
    st.opts.filter(o => !on.includes(o)).forEach(o => { seen[o.id + ':' + st.e.id] = 1; });
    localStorage.setItem('mss_pick_asked', JSON.stringify(seen));
  } catch {}
  if (!on.length) return;
  let finished = null;
  for (const o of on) {
    try { const { data, error } = await sb.rpc('set_challenge_pick', { p_ch: o.id, p_entry: st.e.id, p_on: true }); if (error) throw error; if (data?.finished) finished = o; }
    catch (err) { showToast(err?.hint || 'Couldn’t count it — try again.', 'err'); return; }
  }
  if (finished) _navFinishCheck(300, true);   // the "You finished!" popup
  else showToast(`Counted for ${on.length === 1 ? `“${on[0].title}”` : `${on.length} challenges`}`);
  if (typeof MSSChallenges !== 'undefined' && document.getElementById('chList')) MSSChallenges.reload();
}

/* "You finished!" (067): after you log something (and once in a while on app
   open), the database finishes any challenge you've reached the goal on and
   hands back the ones you haven't celebrated yet → one popup each
   (MSSSpotlight.complete, loaded when needed). Waits while any popup is still
   open, so it comes after you're done logging. */
let _navFinTimer = null, _navFinBusy = false;
function _navFinishCheck(delay, force) {
  if (!force) {   // app open: every 5 minutes at most
    try { if (Date.now() - Number(localStorage.getItem('mss_fin_chk') || 0) < 5 * 60000) return; } catch {}
  }
  clearTimeout(_navFinTimer);
  _navFinTimer = setTimeout(_navFinRun, delay || 0);
}
async function _navFinRun() {
  if (_navFinBusy || !window._navUser) return;
  if (MSSDialog.top() || document.querySelector('.modal-overlay.open, .mss-views.open')) { _navFinTimer = setTimeout(_navFinRun, 1500); return; }
  _navFinBusy = true;
  try {
    try { localStorage.setItem('mss_fin_chk', String(Date.now())); } catch {}
    const { data, error } = await sb.rpc('challenge_finishes');
    if (error || !Array.isArray(data) || !data.length) return;
    if (typeof MSSMedal === 'undefined') await _navLoadScript('js/medals.js');
    if (typeof MSSSpotlight === 'undefined') await _navLoadScript('js/spotlights.js');
    for (const c of data) {
      sb.rpc('challenge_finish_seen', { p_ch: c.id }).then(() => {}, () => {});   // shown once, even if the page is left
      await MSSSpotlight.complete(c);
    }
    if (typeof MSSChallenges !== 'undefined' && document.getElementById('chList')) MSSChallenges.reload();
  } catch (err) { console.warn('Challenge finish check:', err); }
  finally { _navFinBusy = false; }
}
function _navLoadScript(src) {
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.async = true; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
}

/* Switch account — every account signed in on this device, one tap to become
   it (config.js MSSAccounts keeps the sessions). */
async function _navAccounts() {
  _navCloseAll();
  let ov = document.getElementById('accSwitchOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'accSwitchOverlay'; ov.className = 'soc-overlay';
    ov.innerHTML = `<div class="soc-card acc-sw" role="dialog" aria-modal="true" aria-labelledby="accSwTitle">
        <div class="sf-header"><div class="sf-title" id="accSwTitle">Switch account</div><button type="button" class="sf-close" aria-label="Close">${icon('x', 18)}</button></div>
        <div class="sf-body" id="accSwBody"></div>
        <div class="sf-footer"><button type="button" class="sf-apply-btn acc-sw-add" onclick="MSSAccounts.add()">${icon('plus', 14)} Add account</button></div></div>`;
    ov.querySelector('.sf-close').onclick = () => MSSDialog.close(ov);
    MSSDialog.bind(ov, () => MSSDialog.close(ov));
    document.body.appendChild(ov);
  }
  _navAccountsFill();
  MSSDialog.open(ov, { focus: '#accSwBody .acc-sw-row:not([aria-current]), .acc-sw-add' });
}
function _navAccountsFill() {
  const me = window._navUser?.id;
  const rows = MSSAccounts.list().sort((a, b) => (b.id === me) - (a.id === me));
  const ava = a => { const u = safeURL(a.avatar_url);
    return `<span class="acc-sw-ava" aria-hidden="true">${u ? `<img src="${u}" alt="">` : escHTML((a.username || '?')[0].toUpperCase())}</span>`; };
  document.getElementById('accSwBody').innerHTML = `<div class="acc-sw-list">${rows.map(a => {
      const cur = a.id === me, name = `<span class="acc-sw-name"><b translate="no">${escHTML(a.display_name || a.username)}</b><small translate="no">@${escHTML(a.username)}</small></span>`;
      return `<div class="acc-sw-item">${cur
        ? `<div class="acc-sw-row" aria-current="true">${ava(a)}${name}<span class="acc-sw-cur">${icon('check', 14)} Signed in</span></div>`
        : `<button type="button" class="acc-sw-row" onclick="_navAccountGo(this,'${a.id}')">${ava(a)}${name}</button>
           <button type="button" class="acc-sw-x" aria-label="Remove @${escHTML(a.username)} from this device" title="Remove from this device" onclick="_navAccountForget('${a.id}')">${icon('x', 14)}</button>`}</div>`;
    }).join('')}</div>
    <p class="acc-sw-note">Accounts stay signed in on this device only. Add one once and switch any time without the password.</p>`;
}
async function _navAccountGo(btn, id) {
  btn.disabled = true; btn.classList.add('is-busy');
  if (!(await MSSAccounts.switchTo(id))) { btn.disabled = false; btn.classList.remove('is-busy'); _navAccountsFill(); }
}
function _navAccountForget(id) {
  MSSAccounts.forget(id);
  _navAccountsFill();
  document.querySelector('#accSwBody .acc-sw-row, .acc-sw-add')?.focus();
}

/* Achievements (060): save newly reached levels now and then — every 30 minutes
   at most (the cabinet page does it on open). New medals arrive as one notification. */
function _navAchSync() {
  if (/cabinet\.html$/.test(location.pathname)) return;
  try {
    if (Date.now() - Number(localStorage.getItem('mss_ach_sync') || 0) < 30 * 60000) return;
    localStorage.setItem('mss_ach_sync', String(Date.now()));
  } catch { return; }
  setTimeout(() => sb.rpc('sync_achievements').then(({ error }) => { if (!error && typeof _notifLoad === 'function') _notifLoad(); }), 3000);
}

function _navSpotlight() {
  // Home page only, once each time the app is opened (sessionStorage resets when it's closed)
  if (!/\/(index\.html)?$/.test(location.pathname)) return;
  try { if (sessionStorage.getItem('mss_spot_open')) return; } catch { return; }
  setTimeout(async () => {
    try {
      if (typeof MSSMedal === 'undefined') await _navLoadScript('js/medals.js');
      if (typeof MSSSpotlight === 'undefined') await _navLoadScript('js/spotlights.js');
      MSSSpotlight.check();
    } catch {}
  }, 900);
}

async function _fillNavUser(user) {
  // Profile + friend-request badge fetched in parallel (was one after the other)
  const [profile, pending] = await Promise.all([
    getProfile(user.id),
    countPendingRequests(user.id).catch(() => 0),
  ]);
  window._navUserProfile = profile;  // store globally for create-card etc.
  MSSAccounts.setProfile(user.id, profile);
  _notifInit(user);
  window._navUser = user;
  // The account's content language (set on another device) → this device, once
  MSSLang.adopt(profile).then(r => { if (r) location.reload(); });
  _navAdminCheck();
  _navAccountCheck(profile);
  _navReleaseCheck(user);
  _navSpotlight();
  _navAchSync();
  _navFinishCheck(2500);
  const username = profile?.username || user.email?.split('@')[0] || 'You';
  const initial  = username[0].toUpperCase();

  const ini    = document.getElementById('navUserInitial');
  const iniMob = document.getElementById('navUserInitialMobile');
  const nm     = document.getElementById('navUserName');

  if (safeURL(profile?.avatar_url)) {
    const imgStyle = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    if (ini)    { ini.innerHTML    = `<img src="${safeURL(profile.avatar_url)}" style="${imgStyle}">`; ini.style.padding    = '0'; }
    if (iniMob) { iniMob.innerHTML = `<img src="${safeURL(profile.avatar_url)}" style="${imgStyle}">`; iniMob.style.padding = '0'; }
  } else {
    if (ini)    ini.textContent    = initial;
    if (iniMob) iniMob.textContent = initial;
  }
  if (nm) nm.textContent = username;

  if (pending > 0) {
    document.querySelectorAll('[data-page="friends.html"]').forEach(el => {
      el.innerHTML += `<span class="nav-badge">${pending}</span>`;
    });
  }
  return profile;
}

// Admin link (account menu) for the site's owners — app_admins, migration 036.
// Asked once per session; the admin page and its data are checked by the database.
async function _navAdminCheck() {
  const uid = window._navUser?.id;
  if (!uid) return;
  let on = null;
  try { const c = sessionStorage.getItem('mss_admin'); if (c && c.startsWith(uid + ':')) on = c.slice(-1); } catch {}
  if (on == null) {
    // only a real answer is remembered — a failed check (offline, mid-deploy) asks again next page
    try {
      const { data, error } = await sb.rpc('is_app_admin');
      if (error) throw error;
      on = data === true ? '1' : '0';
      try { sessionStorage.setItem('mss_admin', uid + ':' + on); } catch {}
    } catch { on = '0'; }
  }
  document.querySelectorAll('.nav-admin-link').forEach(a => { a.hidden = on !== '1'; });
}

// Account check, once per session (migrations 038–040):
//  • suspended by an admin → a popup that only signs out;
//  • username breaks the word filter (made before it existed, or a word
//    added since) → must pick a new one. Neither popup can be dismissed.
async function _navAccountCheck(profile) {
  const uid = window._navUser?.id, name = profile?.username;
  if (!uid || !name || document.getElementById('mssRenameOverlay')) return;
  const key = uid + ':' + name;
  try { if (sessionStorage.getItem('mss_account_ok') === key) return; } catch {}
  let st = null;
  try { const { data, error } = await sb.rpc('mss_my_status'); if (!error && data && typeof data.banned === 'boolean') st = data; } catch {}
  if (!st) st = { banned: false, username_ok: await isUsernameAllowed(name) };   // before migration 040
  if (st.banned === true) return _navSuspended();
  if (st.username_ok !== false) { try { sessionStorage.setItem('mss_account_ok', key); } catch {} return; }
  _navRenamePopup(uid, name);
}
function _navSuspended() {
  if (document.getElementById('mssSuspendedOverlay')) return;
  const el = document.createElement('div');
  el.className = 'confirm-overlay';
  el.id = 'mssSuspendedOverlay';
  el.innerHTML = `<div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="mssSuspTitle" aria-describedby="mssSuspMsg">
      <div class="confirm-icon" aria-hidden="true">${icon('lock', 36)}</div>
      <div class="confirm-title" id="mssSuspTitle">Your account is suspended</div>
      <div class="confirm-msg" id="mssSuspMsg">This account broke MyScreenFolio’s community rules, so it can’t be used anymore. If you think this is a mistake, contact the site’s owners.</div>
      <div class="confirm-actions"><button type="button" class="confirm-ok is-safe" onclick="handleLogout()">Sign out</button></div>
    </div>`;
  MSSDialog.bind(el, () => {});
  document.body.appendChild(el);
  MSSDialog.open(el, { focus: el.querySelector('button') });
}
function _navRenamePopup(uid, name) {
  const el = document.createElement('div');
  el.className = 'confirm-overlay';
  el.id = 'mssRenameOverlay';
  el.innerHTML = `<form class="confirm-card mss-rename" role="dialog" aria-modal="true" aria-labelledby="mssRenameTitle" aria-describedby="mssRenameMsg" novalidate>
      <div class="confirm-icon" aria-hidden="true">${icon('user', 36)}</div>
      <div class="confirm-title" id="mssRenameTitle">Choose a new username</div>
      <div class="confirm-msg" id="mssRenameMsg">Your username <b translate="no">@${escHTML(name)}</b> isn’t allowed on MyScreenFolio. Pick a new one to keep going — your library, ratings and friends stay the same.</div>
      <input class="field-input" id="mssRenameInput" maxlength="20" placeholder="new_username" aria-label="New username" aria-describedby="mssRenameHint" autocomplete="off" spellcheck="false" autocapitalize="none">
      <div class="mss-rename-hint" id="mssRenameHint" aria-live="polite">Letters, numbers and _ only — at least 3.</div>
      <div class="confirm-actions"><button type="submit" class="confirm-ok is-safe" id="mssRenameSave" disabled>Save username</button></div>
    </form>`;
  MSSDialog.bind(el, () => {});                    // can't be closed until a username is picked
  document.body.appendChild(el);
  const input = el.querySelector('input'), hint = el.querySelector('#mssRenameHint'), save = el.querySelector('#mssRenameSave');
  let timer = null, okName = null;
  const say = (t, cls = '') => { hint.textContent = t; hint.className = 'mss-rename-hint ' + cls; };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    const v = input.value; okName = null; save.disabled = true; clearTimeout(timer);
    if (v.length < 3) { say('Letters, numbers and _ only — at least 3.'); return; }
    say('Checking…');
    timer = setTimeout(async () => {
      const [free, allowed] = await Promise.all([checkUsernameAvailable(v, uid), isUsernameAllowed(v)]);
      if (input.value !== v) return;
      if (!allowed) say('That username isn’t allowed.', 'bad');
      else if (!free) say('That username is taken.', 'bad');
      else { say('Available', 'ok'); okName = v; save.disabled = false; }
    }, 350);
  });
  el.querySelector('form').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!okName) return;
    save.disabled = true; save.textContent = 'Saving…';
    try {
      const p = await updateProfile(uid, { username: okName });
      window._navUserProfile = p;
      document.querySelectorAll('#navUserName').forEach(n => { n.textContent = p.username; });
      try { sessionStorage.setItem('mss_account_ok', uid + ':' + p.username); } catch {}
      MSSDialog.close(el);
      setTimeout(() => el.remove(), 300);
      showToast(`You’re now @${p.username}.`);
    } catch (err) {
      console.error(err);
      say(isUsernameBlockedError(err) ? 'That username isn’t allowed.' : /duplicate|unique/i.test(err?.message || '') ? 'That username is taken.' : 'Couldn’t save — try again.', 'bad');
      save.disabled = false; save.textContent = 'Save username';
    }
  });
  MSSDialog.open(el, { focus: input });
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
  await _runPageReady(user, onReady);
}

/* ══════════════════════════════════════════
   Scroll restore on Back / reload (all pages)
   Most pages reload when you come back (so fresh edits show up) and
   their content arrives a moment later from the database — the browser
   restored the scroll against a half-empty page, landing you higher up.
   Now the position is saved on leave and re-applied once the page has
   loaded its data, correcting for late content for a moment and
   stopping the instant you scroll yourself. Pages with their own
   restore (Discover) set window.MSS_OWN_SCROLL = true.
══════════════════════════════════════════ */
const _mssScrollKey = () => 'mss_scroll:' + location.pathname + location.search;   // read live: pages keep their tab in the URL
const _mssNavType = (performance.getEntriesByType('navigation')[0] || {}).type;
const _mssReturning = _mssNavType === 'back_forward' || _mssNavType === 'reload';
if (_mssReturning && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('pagehide', () => {
  if (window.MSS_OWN_SCROLL) return;
  try { sessionStorage.setItem(_mssScrollKey(), String(Math.round(window.scrollY))); } catch {}
});

let _mssScrollRestored = false;
function _mssRestoreScroll() {
  if (_mssScrollRestored || window.MSS_OWN_SCROLL || !_mssReturning) return;
  _mssScrollRestored = true;
  const target = Number(sessionStorage.getItem(_mssScrollKey()) || 0);
  if (!target) return;
  let stop = false;
  const end = () => { stop = true; obs.disconnect(); clearTimeout(timer); };
  const apply = () => {
    if (stop) return;
    mssJumpTo(target); // no smooth-scroll animation; Safari-safe
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (Math.abs(window.scrollY - target) < 4 && maxY >= target) end();
  };
  // Late content (images, lazy sections) can still grow the page —
  // re-apply as it changes, for up to 3s.
  const obs = new MutationObserver(() => requestAnimationFrame(apply));
  obs.observe(document.body, { childList: true, subtree: true });
  const timer = setTimeout(end, 3000);
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(ev =>
    window.addEventListener(ev, end, { passive: true, once: true }));
  apply();
}

// Nav fill and the page's own data loading used to run strictly one after
// the other — the page couldn't start fetching until the nav's profile +
// badge requests had finished. Now they run at the same time. Pages whose
// callback takes (user, profile) still get the profile; they just wait for
// it themselves. Callbacks that only take (user) start immediately.
async function _runPageReady(user, onReady) {
  const navP = _fillNavUser(user).catch(err => { console.error('Nav fill error:', err); return null; });
  if (typeof onReady !== 'function') { await navP; _mssRestoreScroll(); return; }
  try {
    if (onReady.length >= 2) {
      await onReady(user, await navP);
    } else {
      await Promise.all([navP, onReady(user)]);
    }
  } finally {
    _mssRestoreScroll();
  }
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
    try { if (typeof onReady === 'function') await onReady(null, null); }
    finally { _mssRestoreScroll(); }
    return;
  }

  await _runPageReady(user, onReady);
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
      <a class="nav-logo" href="index.html"><img src="icons/logo-nav.png" alt="MyScreenFolio" class="nav-logo-img"></a>
      <div class="nav-top-controls">
<button class="nav-icon-btn" onclick="toggleMobileSearch()" aria-label="Search">
          ${icon('search', 15)}
        </button>
        <button class="notif-btn notif-btn-mobile nav-auth-only" onclick="toggleNotifPanel(event)" aria-label="Notifications">
          ${icon('bell', 16)}<span class="notif-badge" data-notif-badge></span>
        </button>
        <div class="nav-top-user" id="navTopUser" onclick="toggleMobileUser(event)">
          <div class="nav-user-avatar" id="navUserInitialMobile">?</div>
          <div class="nav-user-dropdown" id="userMenuDropdownMobile">
            <a href="profile.html">${icon('user', 15)} Profile</a>
            <a href="cabinet.html">${icon('trophy', 15)} Achievement Cabinet</a>
            <a href="notifications.html">${icon('bell', 15)} Notifications</a>
            <a href="settings.html">${icon('settings', 15)} Settings</a>
            <a href="admin.html" class="nav-admin-link" hidden>${icon('lock', 15)} Admin</a>
            <a href="#" class="nav-auth-only" onclick="_navAccounts();return false">${icon('users', 15)} Switch Account</a>
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
        <button type="button" class="mobile-search-close" id="mobileSearchX" onclick="_mobileSearchX()" aria-label="Close search">${icon('x', 16)}</button>
      </div>
    </div>
    <!-- DESKTOP LINKS ROW -->
    <div class="nav-inner">
      <a class="nav-logo" href="index.html"><img src="icons/logo-nav.png" alt="MyScreenFolio" class="nav-logo-img"></a>
      <div class="nav-links">
        ${navLink('index.html',     page, 'home',     'Home')}
        ${navLink('discover.html',  page, 'compass',  'Discover')}
        ${navLibraryDropdown(page)}
        ${navLink('lists.html',      page, 'layers',   'Lists')}
        ${navLink('notes.html',      page, 'notebook',     'Notes')}
        ${navLink('episodes.html',   page, 'episodes', 'Episodes')}
        ${navLink('friends.html',   page, 'users',    'Social')}
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
        <button class="notif-btn notif-btn-desktop nav-auth-only" onclick="toggleNotifPanel(event)" aria-label="Notifications">
          ${icon('bell', 17)}<span class="notif-badge" data-notif-badge></span>
        </button>
        <div class="nav-user-wrap" onclick="toggleUserMenu(event)">
          <div class="nav-user-avatar" id="navUserInitial">?</div>
          <span class="nav-user-name" id="navUserName" translate="no">…</span>
          <span class="nav-chevron">${icon('chevdown', 12)}</span>
          <div class="nav-user-dropdown" id="userMenuDropdown">
            <a href="profile.html">${icon('user', 15)} Profile</a>
            <a href="cabinet.html">${icon('trophy', 15)} Achievement Cabinet</a>
            <a href="notifications.html">${icon('bell', 15)} Notifications</a>
            <a href="settings.html">${icon('settings', 15)} Settings</a>
            <a href="admin.html" class="nav-admin-link" hidden>${icon('lock', 15)} Admin</a>
            <a href="#" class="nav-auth-only" onclick="_navAccounts();return false">${icon('users', 15)} Switch Account</a>
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
    ${mobileNavLink('discover.html',  page, 'compass',  'Discover')}
    ${mobileLibraryGroup(page)}
    ${mobileNavLink('lists.html',     page, 'layers',   'Lists')}
    ${mobileNavLink('notes.html',     page, 'notebook',     'Notes')}
    ${mobileNavLink('episodes.html',  page, 'episodes', 'Episodes')}
    ${mobileNavLink('friends.html',   page, 'users',    'Social')}
    ${mobileNavLink('profile.html',   page, 'user',     'Profile')}
    ${mobileNavLink('settings.html',  page, 'settings', 'Settings')}
    <hr>
    <a class="mobile-nav-link mobile-auth-only" href="#" onclick="openAddModal();return false">${icon('plus', 18)} Add Entry</a>
    <a class="mobile-nav-link mobile-auth-only" href="#" onclick="_navAccounts();return false">${icon('users', 18)} Switch Account</a>
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
    ${bnItem('anime.html',    page, 'animeFace', 'Anime')}
    ${bnItem('cartoons.html', page, 'crown',    'Cartoons')}`;

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
  modalEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="addModalTitle">
      <div class="modal-title" id="addModalTitle">Add New Entry</div>
      <div class="modal-row"><label class="modal-label" for="mTitle">Title</label>
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
          { value:'up_next', label:'Up Next' },
          { value:'watching', label:'Currently Watching' },
          { value:'paused', label:'Taking a Break' },
          { value:'completed', label:'Watched' },
          { value:'ongoing', label:'To Be Continued' },
          { value:'dropped', label:'Dropped' },
        ], null, null, 'Select status…')}</div></div>
      <div class="modal-row"><div class="modal-label">Year</div>
        <input class="modal-input" id="mYear" type="number" min="1900" max="2030" placeholder="e.g. 2024"></div>
      <div id="mValidationMsg" style="display:none;font-size:12px;color:#e0a45c;background:rgba(224,164,92,0.1);border:0.5px solid rgba(224,164,92,0.3);border-radius:var(--radius-sm);padding:8px 12px;margin-top:4px;">Please select a category and status before adding.</div>
      <div class="modal-actions">
        <button type="button" class="btn-modal-cancel" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn-modal-save" id="mSaveBtn" onclick="modalQuickCreate()" disabled>Add &amp; Edit →</button>
      </div>
    </div>`;

  /* ── CONFIRM DIALOG ── */
  const confirmEl = document.createElement('div');
  confirmEl.className = 'confirm-overlay';
  confirmEl.id = 'confirmOverlay';
  confirmEl.innerHTML = `
    <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMsg">
      <div class="confirm-icon"  id="confirmIcon" aria-hidden="true"></div>
      <div class="confirm-title" id="confirmTitle">Are you sure?</div>
      <div class="confirm-msg"   id="confirmMsg"></div>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel" id="confirmCancel">Cancel</button>
        <button type="button" class="confirm-ok"     id="confirmOk">Confirm</button>
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
  MSSDialog.bind(modalEl, closeModal);

  // Init TMDB search now that #mTitle exists in DOM
  setTimeout(_initTMDBOnModal, 300);
  document.body.insertBefore(themeEl,    first);
  _navInitBackToTop(themeEl);
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
      +'<span class="footer-copy">&copy; 2026 MyScreenFolio</span>'
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
  attachClearButton('globalSearch');
  // one ✕ on the phone search bar: clears what you typed, then (empty) closes the bar
  document.getElementById('mobileSearchInput')?.addEventListener('input', ev => {
    document.getElementById('mobileSearchX').setAttribute('aria-label', ev.target.value ? 'Clear search' : 'Close search');
  });
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
  { href: 'anime.html',    iconName: 'animeFace', label: 'Anime'    },
  { href: 'cartoons.html', iconName: 'crown',    label: 'Cartoons' },
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


/* ── Back to top ──
   A round olive button that floats just above the dark / light toggle once
   you've scrolled down a good way and start scrolling back up; tap it to
   glide to the top. It sits centred over the toggle on every screen size
   (it measures the toggle, so it follows it on phones too). */
function _navInitBackToTop(themeEl) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-to-top';
  btn.id = 'backToTop';
  btn.setAttribute('aria-label', 'Back to top');
  btn.title = 'Back to top';
  btn.innerHTML = icon('chevup', 22);
  btn.tabIndex = -1;
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    btn.blur();
  });
  document.body.appendChild(btn);

  const place = () => {
    const r = themeEl.getBoundingClientRect();
    if (!r.width) return;
    const size = btn.offsetWidth || 46;
    btn.style.right = Math.round(window.innerWidth - (r.left + r.width / 2) - size / 2) + 'px';
    btn.style.bottom = Math.round(window.innerHeight - r.top + 12) + 'px';
  };
  let lastY = window.scrollY, upFor = 0, shown = false;
  const show = on => {
    if (on === shown) return;
    shown = on;
    if (on) place();
    btn.classList.toggle('show', on);
    btn.tabIndex = on ? 0 : -1;
  };
  window.addEventListener('scroll', () => {
    const y = window.scrollY, dy = y - lastY;
    lastY = y;
    if (y < 400) { upFor = 0; show(false); return; }
    if (dy < 0) { upFor += -dy; if (upFor > 40) show(true); }        // scrolling back up
    else if (dy > 0) { upFor = 0; if (dy > 4) show(false); }          // scrolling on down
  }, { passive: true });
  window.addEventListener('resize', () => { if (shown) place(); });
}

/* ── Toggle functions ──
   Only one top-bar panel is open at a time: opening the menu (☰), search,
   notifications or the profile menu closes the others first — otherwise the
   profile / search panels opened *underneath* the full-screen phone menu
   and looked like they did nothing. */
function _navCloseAll(except) {
  if (except !== 'nav')    document.getElementById('mobileNav')?.classList.remove('open');
  if (except !== 'search') document.getElementById('mobileSearchBar')?.classList.remove('open');
  if (except !== 'user') {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    document.getElementById('userMenuDropdownMobile')?.classList.remove('open');
  }
  if (except !== 'notif' && typeof closeNotifPanel === 'function') closeNotifPanel();
  document.getElementById('navLibDropdown')?.classList.remove('open');
  document.getElementById('navLibGroup')?.classList.remove('menu-open');
  document.getElementById('mobileLibGroup')?.classList.remove('menu-open');
}

function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  if (!nav) return;
  if (!nav.classList.contains('open')) _navCloseAll('nav');
  nav.classList.toggle('open');
}

function toggleMobileSearch() {
  const bar = document.getElementById('mobileSearchBar');
  if (!bar) return;
  if (!bar.classList.contains('open')) _navCloseAll('search');
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) document.getElementById('mobileSearchInput')?.focus();
}

function _mobileSearchX() {
  const input = document.getElementById('mobileSearchInput');
  if (!input?.value) { toggleMobileSearch(); return; }
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function toggleMobileUser(e) {
  e.stopPropagation();
  const dd = document.getElementById('userMenuDropdownMobile');
  if (!dd) return;
  if (!dd.classList.contains('open')) _navCloseAll('user');
  dd.classList.toggle('open');
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const dd = document.getElementById('userMenuDropdown');
  if (!dd) return;
  if (!dd.classList.contains('open')) _navCloseAll('user');
  dd.classList.toggle('open');
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
    { value:'up_next', label:'Up Next' },
    { value:'watching', label:'Currently Watching' },
    ...(!isMovie ? [{ value:'paused', label:'Taking a Break' }] : []),
    { value:'completed', label:'Watched' },
    ...(!isMovie ? [{ value:'ongoing', label:'To Be Continued' }] : []),
    { value:'dropped', label:'Dropped' },
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
      { value:'up_next', label:'Up Next' },
      { value:'watching', label:'Currently Watching' },
      { value:'paused', label:'Taking a Break' },
      { value:'completed', label:'Watched' },
      { value:'ongoing', label:'To Be Continued' },
      { value:'dropped', label:'Dropped' },
    ], null, '_updateAddModalValidation', 'Select status…');
  }
  _updateAddModalValidation();
}

function openAddModal(cat) {
  getCurrentUser().then(user => {
    if (!user) { window.location.href = 'login.html'; return; }
    const modal = document.getElementById('addModal');
    if (!modal) return;
    _resetAddModalDropdowns();
    const m = document.getElementById('mCat');
    if (cat && m) _selSelectDD('mCat', cat);
    document.getElementById('mobileNav')?.classList.remove('open');
    MSSDialog.open(modal, { focus: '#mTitle' });
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

function closeModal() { MSSDialog.close(document.getElementById('addModal')); }

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
    // Everything that only lives inside the ratings JSON blob (not its
    // own column) — completion year for ended shows, the detailed
    // per-season episode breakdown, and the Movie/TV sub-type marker
    // for anime/cartoons — has to be explicitly collected here, since
    // quickCreate() only saves whatever ratings object it's actually
    // given.
    const ratings = {};
    if (prefill._completion_year) ratings._completion_year = prefill._completion_year;
    if (prefill._season_breakdown && prefill._season_breakdown.length) ratings._season_breakdown = prefill._season_breakdown;
    if (prefill.ratings && prefill.ratings._type) ratings._type = prefill.ratings._type;
    else if (prefill.tmdb_type) ratings._media_type = prefill.tmdb_type;

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
      ratings:       Object.keys(ratings).length ? ratings : null,
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
      showConfirm({
        title: 'This Entry Already Exists',
        message: `"${title}" is already in your library as a ${catLabel}. Close this to update your existing entry instead.`,
        confirmText: 'Got it', cancelText: null, danger: false,
      });
    } else {
      showToast('Error creating entry.', 'err');
      console.error(e);
    }
  }
}

/* Keyboard shortcuts */
document.addEventListener('keydown', e => {
  // Esc closes whatever top-bar panel is open (mobile menu, search, account menu, notifications)
  if (e.key === 'Escape') _navCloseAll();
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    window.location.reload();
  }
  // single-key shortcuts never fire while you're typing (fields, the note box) or with Ctrl / ⌘ / Alt held
  const typing = e.target.closest?.('input,textarea,select,[contenteditable]') || e.target.isContentEditable;
  const plainKey = !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (e.key === 'n' && plainKey && !MSSDialog.top()) openAddModal();
  if (e.key === '/' && plainKey) {
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
  let startY = null, currentY = 0, pulling = false, triggered = false;

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
    startY = null;                          // only a touch that starts on the page itself can pull
    if (window.scrollY > 0) return;
    if (_mssLocks.size || MSSDialog.top() || e.target.closest('.hc-card, .modal-wrap, [class*="overlay"], .mobile-nav')) return;
    startY = e.touches[0].clientY;
    pulling = false;
    triggered = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (triggered || startY == null) return;
    // A popup pins the page (scrollY reads 0 then) — its swipes are never a pull-to-refresh
    if (_mssLocks.size || window.scrollY > 0) return;
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
// Small TMDB posters (w92 / w154 / w185) look soft on phone screens: ask for w342 instead
const mssSharpPoster = url => typeof url === 'string' ? url.replace(/(image\.tmdb\.org\/t\/p\/)w(92|154|185)\//, '$1w342/') : url;
const TMDB_FULL = 'https://image.tmdb.org/t/p/w500';

/* ── "Release Date" sort support ──
   Movies have one fixed release date, so entry.year is already
   accurate. Shows are different: a show that started in 2019 but is
   still airing could have dropped a new episode yesterday — sorting
   by the show's original air year would bury it under everything
   else, when it should be one of the most "recent" things in the
   list. There's no way to know a show's CURRENT last-aired date
   without asking TMDB live, since that changes over time as new
   episodes air — it's not something we store ourselves. This caches
   that lookup (session-only, in memory) so switching to "Release
   Date" sort doesn't re-fetch the same show over and over. */
window._releaseDateCache = window._releaseDateCache || {};

async function ensureReleaseDatesFetched(entries) {
  const toFetch = [...new Set(
    entries
      .filter(e => e.tmdb_id && e.tmdb_type === 'tv' && !(e.tmdb_id in window._releaseDateCache))
      .map(e => e.tmdb_id)
  )];
  if (!toFetch.length) return;
  await Promise.all(toFetch.map(async id => {
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`);
      if (!res.ok) { window._releaseDateCache[id] = null; return; }
      const d = await res.json();
      // last_air_date is the most recently aired episode's date — this
      // is what actually needs to be "yesterday" for a currently-airing
      // show to sort as the newest thing. Falls back to first_air_date
      // for shows TMDB has no last_air_date for.
      window._releaseDateCache[id] = d.last_air_date || d.first_air_date || null;
    } catch (err) {
      console.error('Release date fetch error:', id, err);
      window._releaseDateCache[id] = null;
    }
  }));
}

// The actual comparator value used for "Release Date" sort — a real
// timestamp when we have one, falling back to whatever year-level data
// is available locally (so the sort still works reasonably even before
// the live fetch completes, or if it fails for a given entry).
function getReleaseDateValue(e) {
  if (e.cat === 'movies') {
    return e.year ? new Date(String(e.year) + '-06-15').getTime() : 0;
  }
  if (e.tmdb_id && window._releaseDateCache[e.tmdb_id]) {
    return new Date(window._releaseDateCache[e.tmdb_id]).getTime();
  }
  const y = (e.ratings && e.ratings._completion_year) || e.year;
  return y ? new Date(String(y) + '-06-15').getTime() : 0;
}

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
              coverImage { medium large extraLarge }
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
    const res = await tmdbFetch(url);
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
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`);
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
    const res = await tmdbFetch(`${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=en-US`);
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
  const poster = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || null;
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
      ${options.map(o => `<div class="sel-dd-opt${o.value===value?' active':''}" data-value="${escHTML(o.value)}" onclick="event.stopPropagation();_selSelectDD('${id}','${o.value}')">${escHTML(o.label)}</div>`).join('')}
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

/* ── Universal "clear" (×) button for any text/search input ──
   Sits at the far right, shown only while the input actually has
   text, clears it fully and re-fires the input's own 'input' event
   so whatever search/filter logic is already wired up just re-runs
   naturally against an empty value — no per-input special-casing
   needed anywhere this gets attached. */
function attachClearButton(input) {
  if (typeof input === 'string') input = document.getElementById(input);
  if (!input || input._hasClearBtn) return;
  input._hasClearBtn = true;

  // Always wrap the input in its own dedicated container, rather than
  // assuming its existing parent is a tight wrapper around just this
  // input — some search inputs share a parent with a title, results
  // list, etc., where reusing that parent would badly mis-position
  // the button. `flex:1` makes this a no-op sizing-wise when the
  // original parent happens to be a flex row (the common case for
  // search bars), while still behaving like a normal full-width block
  // when it isn't.
  //
  // The wrapper is a plain block div, NOT a flex container — so if the
  // input itself had its own `flex:1` (or similar) CSS rule assuming
  // its *direct* parent was a flex row, that rule now does nothing,
  // since it's one level deeper than before. Force full width directly
  // on the input itself so it always fills the wrapper regardless of
  // whatever CSS it originally relied on.
  const wrapper = document.createElement('div');
  wrapper.className = 'clear-btn-wrap';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.flex = '1';
  input.style.minWidth = '0';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'input-clear-btn';
  btn.innerHTML = '&#x2715;';
  btn.setAttribute('aria-label', 'Clear');
  btn.tabIndex = -1;
  btn.addEventListener('mousedown', e => e.preventDefault()); // don't steal focus from the input
  btn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    btn.classList.remove('visible');
    input.focus();
  });
  wrapper.appendChild(btn);
  input.style.paddingRight = '32px';

  const sync = () => btn.classList.toggle('visible', input.value.length > 0);
  input.addEventListener('input', sync);
  sync();
}

/* ── TMDB request throttling + rate-limit handling ──
   The TMDB API key is embedded client-side, so EVERY visitor shares
   the same quota with TMDB (historically ~40 requests per 10 seconds
   per key). A busy moment — several people browsing Discover at once,
   each triggering a dozen+ parallel fetches for content ratings,
   credits, person pages, etc. — can trip that limit for everyone at
   once. This throttles our own outgoing requests to a safe rate,
   queuing anything over that, and retries with backoff on an actual
   429 rather than failing silently or showing a broken empty page.
   Use this instead of a bare fetch() for any TMDB call. */
const _tmdbQueue = [];
let _tmdbActive = 0;
const TMDB_MAX_CONCURRENT = 4;
const TMDB_MIN_GAP_MS = 60;
let _tmdbLastStart = 0;

function _tmdbProcessQueue() {
  if (_tmdbActive >= TMDB_MAX_CONCURRENT || !_tmdbQueue.length) return;
  const wait = Math.max(0, _tmdbLastStart + TMDB_MIN_GAP_MS - Date.now());
  setTimeout(() => {
    if (_tmdbActive >= TMDB_MAX_CONCURRENT || !_tmdbQueue.length) return;
    const job = _tmdbQueue.shift();
    _tmdbActive++;
    _tmdbLastStart = Date.now();
    job();
  }, wait);
}

/* ── Auto-refresh season/episode counts from TMDB ──
   Season/episode totals are only fetched once, at add-time. If a show
   airs a new season after that, the stored counts go stale and the
   person has to notice and manually re-enter them. This quietly checks
   TMDB for a linked show whenever its detail popup opens (or the person
   starts/resumes watching it), and updates the entry in the background
   if TMDB now shows more seasons/episodes than what's stored.
   Shared across every page that has its own entry-info popup (category
   pages, library, profile, completed) rather than duplicated per page —
   pass the current user's id and a callback that re-renders whatever
   that page's own list/grid looks like. */
async function _refreshTmdbSeasonData(entry, userId, rerender) {
  try {
    if (!entry || !entry.tmdb_id || entry.tmdb_type !== 'tv' || !userId) return;
    const isMovie = entry.cat === 'movies' || entry.ratings?._media_type === 'movie';
    if (isMovie) return;

    const res = await tmdbFetch(`${TMDB_BASE}/tv/${entry.tmdb_id}?api_key=${TMDB_KEY}&language=en-US`);
    if (!res.ok) return;
    const data = await res.json();

    const seasons = (data.seasons || []).filter(s => s.season_number > 0);
    const newBreakdown = seasons.map(s => s.episode_count);
    const newTotalSeasons = data.number_of_seasons || newBreakdown.length || null;
    const newTotalEps = data.number_of_episodes || newBreakdown.reduce((a, b) => a + b, 0) || null;
    // Latest aired episode's date — used for the "Episode: Latest/Earliest"
    // sort option, which needs to reflect how recently a show has actually
    // aired new content, not just when it was originally released.
    const newLastEpDate = data.last_episode_to_air?.air_date || null;

    const oldTotalSeasons = Number(entry.total_seasons) || 0;
    const oldTotalEps = Number(entry.total_eps) || 0;
    const oldLastEpDate = entry.ratings?._last_episode_date || null;
    const hasNewData = (newTotalSeasons && newTotalSeasons > oldTotalSeasons) ||
                        (newTotalEps && newTotalEps > oldTotalEps) ||
                        (newLastEpDate && newLastEpDate !== oldLastEpDate);
    if (!hasNewData) return;

    const newRatings = { ...(entry.ratings || {}), _season_breakdown: newBreakdown, _last_episode_date: newLastEpDate || oldLastEpDate };
    await updateProgress(entry.id, userId, {
      total_seasons: newTotalSeasons,
      total_eps: newTotalEps,
      ratings: newRatings,
    });

    // Update the in-memory entry (the same object reference the calling
    // page's own list/array points to) and re-render so the new counts
    // show immediately.
    entry.total_seasons = newTotalSeasons;
    entry.total_eps = newTotalEps;
    entry.ratings = newRatings;
    if (typeof rerender === 'function') rerender();
    showToast(`${entry.title}: updated to ${newTotalSeasons} season${newTotalSeasons !== 1 ? 's' : ''}`);
  } catch (err) {
    // Silent failure — this is a background convenience check, not a
    // user-initiated action, so it shouldn't surface an error toast for
    // something like a flaky network request.
    console.error('TMDB season refresh error:', err);
  }
}

function _tmdbQueued(url, opts = {}, _attempt = 0) {
  return new Promise((resolve, reject) => {
    _tmdbQueue.push(async () => {
      const done = () => { _tmdbActive--; _tmdbProcessQueue(); };
      try {
        const res = await fetch(url, opts);
        if (res.status === 429) {
          done();
          if (_attempt < 3) {
            const retryAfter = Number(res.headers.get('Retry-After')) || (1 + _attempt);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            try { resolve(await _tmdbQueued(url, opts, _attempt + 1)); }
            catch (e) { reject(e); }
          } else {
            reject(new TmdbRateLimitError('TMDB is rate-limiting this app right now — please try again shortly.'));
          }
          return;
        }
        done();
        resolve(res);
      } catch (err) {
        done();
        reject(err);
      }
    });
    _tmdbProcessQueue();
  });
}

/* tmdbFetch — every TMDB request. Asks for the user's content language
   (MSSLang, config.js). TMDB leaves overviews / biographies empty when
   it has no translation, and falls back to the ORIGINAL title (e.g.
   Japanese) — so when either happens the English response fills the gaps,
   matched field by field (arrays by id). English users: one request, as before. */
const _TMDB_TEXT = ['overview', 'biography', 'tagline'];
const _tmdbGeneric = n => /^\D{1,24}\s*\d{1,4}$/u.test(String(n || '').trim());   // "Episodio 5", "Xilli 1"
function _tmdbForeignTitle(o, k) {
  return typeof o[k] === 'string' && o[k] && o[k] === o['original_' + k]
    && o.original_language && o.original_language !== MSSLang.base;
}
function _tmdbNeedsEnglish(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 4) return false;
  if (Array.isArray(o)) return o.some(x => _tmdbNeedsEnglish(x, depth + 1));
  if (_TMDB_TEXT.slice(0, 2).some(k => o[k] === '')) return true;
  if (_tmdbForeignTitle(o, 'title') || _tmdbForeignTitle(o, 'name')) return true;
  return Object.keys(o).some(k => o[k] && typeof o[k] === 'object' && _tmdbNeedsEnglish(o[k], depth + 1));
}
function _tmdbFill(o, en, depth = 0) {
  if (!o || !en || typeof o !== 'object' || typeof en !== 'object' || depth > 5) return;
  if (Array.isArray(o)) {
    if (!Array.isArray(en)) return;
    const byId = new Map(en.filter(x => x && x.id != null).map(x => [x.id, x]));
    o.forEach((x, i) => _tmdbFill(x, x && x.id != null ? byId.get(x.id) : en[i], depth + 1));
    return;
  }
  const untranslated = o.overview === '' && !!en.overview;
  _TMDB_TEXT.forEach(k => { if (o[k] === '' && en[k]) o[k] = en[k]; });
  ['title', 'name'].forEach(k => { if (_tmdbForeignTitle(o, k) && en[k] && en[k] !== o[k]) o[k] = en[k]; });
  if (untranslated && o.episode_number != null && _tmdbGeneric(o.name) && en.name && !_tmdbGeneric(en.name)) o.name = en.name;
  Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object') _tmdbFill(o[k], en[k], depth + 1); });
}
async function tmdbFetch(url, opts = {}) {
  const local = MSSLang.localize(url);
  const res = await _tmdbQueued(local, opts);
  if (local === url || !res.ok) return res;
  let data;
  try { data = await res.clone().json(); } catch { return res; }
  if (!_tmdbNeedsEnglish(data)) return res;
  try {
    const en = await _tmdbQueued(url, opts);
    if (en.ok) _tmdbFill(data, await en.json());
  } catch { /* keep the translated response as it is */ }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/* TMDB genres in English, whatever the content language — saved entries
   keep the same genre names (filters, stats, the genre picker). */
const TMDB_GENRE_EN = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime', 99:'Documentary', 18:'Drama',
  10751:'Family', 14:'Fantasy', 36:'History', 27:'Horror', 10402:'Music', 9648:'Mystery', 10749:'Romance',
  878:'Science Fiction', 10770:'TV Movie', 53:'Thriller', 10752:'War', 37:'Western',
  10759:'Action & Adventure', 10762:'Kids', 10763:'News', 10764:'Reality', 10765:'Sci-Fi & Fantasy',
  10766:'Soap', 10767:'Talk', 10768:'War & Politics',
};
const tmdbGenreNames = genres => (genres || []).map(g => TMDB_GENRE_EN[g.id] || g.name).filter(Boolean);

/* Title logos — TMDB's name artwork (images.logos), shown instead of the written
   title where a title has one. Fetch details with append_to_response=…,images and
   include_image_language=en,null (MSSLang.localize puts the content language first).
   Pick: content language → English → no-text logo; best voted first.
   The written name stays in the heading for screen readers, and shows if the image fails. */
function tmdbLogo(d) {
  const base = (MSSLang.code || 'en-US').split('-')[0];
  const rank = l => l.iso_639_1 === base ? 0 : l.iso_639_1 === 'en' ? 1 : l.iso_639_1 == null ? 2 : 3;
  const best = (d?.images?.logos || []).filter(l => l.file_path && rank(l) < 3)
    .sort((a, b) => rank(a) - rank(b) || (b.vote_average || 0) - (a.vote_average || 0))[0];
  if (!best) return null;
  const svg = /\.svg$/i.test(best.file_path);
  return { src: `https://image.tmdb.org/t/p/${svg ? 'original' : 'w500'}${best.file_path}`, ratio: best.aspect_ratio || (best.width && best.height ? best.width / best.height : 3) };
}
function tmdbTitleHTML(d, name, cls, tag = 'div') {
  const logo = tmdbLogo(d);
  if (!logo) return `<${tag} class="${cls}" translate="no">${escHTML(name)}</${tag}>`;
  const shape = logo.ratio < 1.8 ? ' mss-logo-tall' : logo.ratio > 5 ? ' mss-logo-wide' : '';
  return `<${tag} class="${cls} mss-logo-title${shape}" translate="no"><img class="mss-logo" src="${logo.src}" alt="" onerror="this.parentNode.classList.add('mss-logo-failed')"><span class="mss-logo-name">${escHTML(name)}</span></${tag}>`;
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
          <div class="tmdb-title" translate="no">${escHTML(r.title || '—')}</div>
          <div class="tmdb-meta">
            <span class="tmdb-tag">${r.label}</span>
            ${r.year ? `<span class="tmdb-year">${escHTML(r.year)}</span>` : ''}
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
          <div class="tmdb-title" translate="no">${escHTML(r.title || '—')}</div>
          <div class="tmdb-meta">
            <span class="tmdb-tag">${r.label}</span>
            ${r.year ? `<span class="tmdb-year">${escHTML(r.year)}</span>` : ''}
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
/*
 * fitTitleYear — measures every ".title-year-row" on the page (or
 * within a given root) and decides whether the year fits inline next
 * to the title or needs to drop to its own line below. Call this
 * after any HTML that includes ".title-year-row" is inserted into
 * the DOM — a fresh render, a re-sort, a view-toggle, etc. — since
 * the measurement only makes sense once the elements have real
 * rendered widths.
 */
function fitTitleYear(root) {
  const scope = root || document;
  scope.querySelectorAll('.title-year-row').forEach(row => {
    const title = row.querySelector('.wg-title, .w-title');
    if (!title) return;
    // Reset to inline first so the measurement reflects the
    // "year competing for space" case, not the already-collapsed one.
    row.classList.remove('year-overflow');
    if (title.scrollWidth > title.clientWidth + 1) {
      row.classList.add('year-overflow');
    }
  });
}

/* ══════════════════════════════════════════
   Notifications — bell panel + notifications.html
   Sections:
     episodes  — new_episode, new_release (tv-schedule.js → add_new_episode_notifications /
                 add_release_notifications, 033 / 042)
     activity  — friend_started, friend_episode, friend_finished, friend_note, friend_list,
                 friend_rated, friend_watchlist, friend_dropped (072 — each follows the actor's
                 "What my friends hear about" switches, enforced in the database),
                 rec_reply (Inbox conversations, 048), episode_chat (049), movie_night (050),
                 challenge (051)
                 ("notify me about @friend", 022 / 047), friend_queued, friend_poll,
                 poll_comment, friend_rec (Social, 045)
     social    — comment (on your title / your comment / your note), like (your note, list or
                 reply on a note) — 066
     lists     — list_invite, list_invite_accepted
     requests  — friend_request
   Rows are created by the database (021/022 SQL); here we list them,
   act on them, mark them read and delete them.
══════════════════════════════════════════ */
let _notifUser = null;
let _notifItems = [];
let _notifTab = 'all';
const NOTIF_SECTIONS = [
  ['all', 'All'], ['episodes', 'New Releases'], ['social', 'Comments & Likes'], ['activity', 'Friend Activity'], ['lists', 'Lists'], ['requests', 'Friend Requests'],
];
function _notifSection(n) {
  if (n.type === 'friend_request') return 'requests';
  if (n.type === 'new_episode' || n.type === 'new_release') return 'episodes';
  if (n.type === 'comment' || n.type === 'like') return 'social';
  if (n.type === 'list_invite' || n.type === 'list_invite_accepted' || n.type === 'list_invite_declined') return 'lists';
  return 'activity';
}

function _notifInit(user) {
  if (!user || _notifUser) return;
  _notifUser = user;
  _notifLoad();
  _notifLive(user);
  // Movie Night (050): a reminder on the day of a dated night — checked when the app opens (every 20 min at most)
  try {
    const last = Number(localStorage.getItem('mss_mn_rem') || 0);
    if (Date.now() - last > 20 * 60000) {
      localStorage.setItem('mss_mn_rem', String(Date.now()));
      sb.rpc('movie_night_reminders').then(r => { if (r.data > 0) _notifLoad(); }, () => {});
    }
  } catch {}
  // Safety net if the live connection drops (and when coming back to the tab)
  setInterval(() => _notifLoad(), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _notifLoad(); });
}

/* Live updates: Supabase Realtime pushes each new notification row the
   moment it's created (needs 026_notifications_realtime.sql), so the bell,
   sheet and alert update without refreshing. RLS still applies — you only
   ever receive your own rows. */
let _notifLiveTimer = null;
function _notifLive(user) {
  if (!sb || typeof sb.channel !== 'function') return;
  const reload = () => { clearTimeout(_notifLiveTimer); _notifLiveTimer = setTimeout(() => _notifLoad(), 300); };
  try {
    sb.channel('mss-notif-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, reload)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, reload)
      .subscribe();
  } catch (e) { console.warn('Live notifications unavailable:', e); }
}

let _notifLimit = 60;
const _notifKnown = new Set();
let _notifLoadedOnce = false;
async function _notifLoad(limit) {
  if (limit) _notifLimit = limit;   // the full page asks for more; polling keeps that
  if (!_notifUser) return;
  try {
    const { data: rows, error } = await sb.from('notifications')
      .select('id, type, actor_id, list_id, friendship_id, entry_id, meta, read_at, created_at')
      .eq('user_id', _notifUser.id).order('created_at', { ascending: false }).limit(_notifLimit);
    if (error) throw error;
    const list = rows || [];
    const actorIds  = [...new Set(list.map(n => n.actor_id).filter(Boolean))];
    const listIds   = [...new Set(list.map(n => n.list_id).filter(Boolean))];
    const friendIds = [...new Set(list.map(n => n.friendship_id).filter(Boolean))];
    const [profiles, lists, friendships, invites] = await Promise.all([
      actorIds.length  ? sb.from('profiles').select('id, username, display_name, avatar_url').in('id', actorIds) : { data: [] },
      listIds.length   ? sb.from('favorite_lists').select('id, title').in('id', listIds) : { data: [] },
      friendIds.length ? sb.from('friendships').select('id, status').in('id', friendIds) : { data: [] },
      listIds.length   ? sb.from('list_collaborators').select('list_id, status').eq('user_id', _notifUser.id).in('list_id', listIds) : { data: [] },
    ]);
    const P = Object.fromEntries((profiles.data || []).map(p => [p.id, p]));
    const L = Object.fromEntries((lists.data || []).map(l => [l.id, l]));
    const F = Object.fromEntries((friendships.data || []).map(f => [f.id, f.status]));
    const I = Object.fromEntries((invites.data || []).map(c => [c.list_id, c.status]));
    _notifItems = list.map(n => ({ ...n, actor: P[n.actor_id] || null, list: L[n.list_id] || null,
      friendStatus: n.friendship_id ? (F[n.friendship_id] || 'gone') : null,
      inviteStatus: n.type === 'list_invite' ? (I[n.list_id] || 'gone') : null }));
    _notifRenderBadge();
    if (document.getElementById('notifPanel')?.classList.contains('open')) _notifRenderPanel();
    if (typeof renderNotificationsPage === 'function') renderNotificationsPage();
    _notifMaybePopup();
    // Let pages react to what just arrived (e.g. Lists refreshes when a friend joins)
    const arrived = _notifItems.filter(n => !_notifKnown.has(n.id));
    _notifItems.forEach(n => _notifKnown.add(n.id));
    if (arrived.length && _notifLoadedOnce) document.dispatchEvent(new CustomEvent('mss:notifications', { detail: { arrived } }));
    _notifLoadedOnce = true;
  } catch (e) { console.warn('Notifications load failed:', e); }
}

function _notifRenderBadge() {
  const unread = _notifItems.filter(n => !n.read_at).length;
  document.querySelectorAll('[data-notif-badge]').forEach(b => {
    b.textContent = unread > 9 ? '9+' : unread;
    b.classList.toggle('show', unread > 0);
  });
}

function _notifTimeAgo(d) {
  const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const dd = Math.round(h / 24); if (dd < 7) return dd + 'd ago';
  return new Date(d).toLocaleDateString(MSSI18n.locale, { month: 'short', day: 'numeric' });
}

// "a new show" / "a new movie" / … for friend activity
function _notifTypeLabel(meta) {
  const m = meta || {};
  const isMovie = m.cat === 'movies' || m.media_type === 'movie' || m.tmdb_type === 'movie';
  const label = (m.cat && CAT_META[m.cat]?.label) || (isMovie ? 'Movie' : 'TV Show');
  return `<span class="${isMovie ? 'type-label' : 'type-label type-label-tv'}">${escHTML(label)}</span>`;
}
// Title card shown under friend-activity notifications
function _notifTitleCard(meta) {
  const m = meta || {};
  const poster = safeURL(m.poster_url);
  return `<div class="notif-card">
    <div class="notif-card-poster">${poster ? `<img src="${poster}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${escHTML((m.title || '?')[0])}">` : escHTML((m.title || '?')[0].toUpperCase())}</div>
    <div class="notif-card-info">
      <div class="notif-card-title" translate="no">${escHTML(m.title || 'Untitled')}</div>
      <div class="notif-card-meta">${_notifTypeLabel(m)}${m.year ? `<span class="notif-card-year">${escHTML(String(m.year).slice(0, 4))}</span>` : ''}</div>
    </div>
  </div>`;
}

function _notifItemHTML(n, opts = {}) {
  const name = n.actor ? escHTML(n.actor.display_name || n.actor.username) : 'Someone';
  const who = `<b>${name}</b>`;
  const title = n.list ? `<b>&ldquo;${escHTML(n.list.title)}&rdquo;</b>` : 'a list';
  const av = n.type === 'achievement' ? `<span class="notif-av-ach">${icon('trophy', 18)}</span>`
    : (n.type === 'new_episode' || n.type === 'new_release') && safeURL(n.meta?.poster_url)
    ? `<img src="${safeURL(n.meta.poster_url)}" alt="">`
    : n.actor && safeURL(n.actor.avatar_url)
    ? `<img src="${safeURL(n.actor.avatar_url)}" alt="">`
    : escHTML(((n.actor && n.actor.username) || '?')[0].toUpperCase());
  let text = '', actions = '', extra = '', href = '', icon2 = '';
  const idA = attrJSON(n.id);
  if (n.type === 'friend_request') {
    text = `${who} sent you a friend request`; icon2 = 'users';
    if (n.friendStatus === 'pending') {
      actions = `<button class="notif-act notif-act-yes" onclick="_notifFriend(event, ${attrJSON(n.friendship_id)}, true)">Accept</button>
                 <button class="notif-act" onclick="_notifFriend(event, ${attrJSON(n.friendship_id)}, false)">Decline</button>`;
    } else if (n.friendStatus === 'accepted') actions = `<span class="notif-state">You're now friends</span>`;
    href = 'friends.html';
  } else if (n.type === 'list_invite') {
    text = `${who} invited you to collaborate on ${title}`; icon2 = 'layers';
    if (n.inviteStatus === 'pending') {
      actions = `<button class="notif-act notif-act-yes" onclick="_notifInvite(event, ${attrJSON(n.list_id)}, true)">Accept</button>
                 <button class="notif-act" onclick="_notifInvite(event, ${attrJSON(n.list_id)}, false)">Decline</button>`;
    } else if (n.inviteStatus === 'accepted') actions = `<span class="notif-state">Joined</span>`;
    else if (n.inviteStatus === 'declined') actions = `<span class="notif-state">Declined</span>`;
    href = n.list ? `list-view.html?list=${encodeURIComponent(n.list_id)}` : '';
  } else if (n.type === 'list_invite_accepted') {
    text = `${who} joined your list ${title}`; icon2 = 'layers';
    href = n.list ? `list-view.html?list=${encodeURIComponent(n.list_id)}` : '';
  } else if (n.type === 'list_invite_declined') {
    text = `${who} declined your invite to ${title}`; icon2 = 'layers';
    href = n.list ? `list-view.html?list=${encodeURIComponent(n.list_id)}` : '';
  } else if (['friend_started', 'friend_finished', 'friend_episode', 'friend_note', 'friend_rated', 'friend_watchlist', 'friend_dropped'].includes(n.type)) {
    // "Notify me about @friend" (047): what they're watching, the moment they do it
    const m = n.meta || {}, t = `<b translate="no">${escHTML(m.title || 'something')}</b>`;
    const titleHref = m.tmdb_id && m.tmdb_type ? `title.html?type=${m.tmdb_type}&id=${m.tmdb_id}` : (n.actor_id ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}` : '');
    href = titleHref;
    if (n.type === 'friend_started') { text = `${who} started watching ${t}`; icon2 = 'play'; }
    if (n.type === 'friend_finished') {
      const movie = m.cat === 'movies' || m.media_type === 'movie' || m.tmdb_type === 'movie';
      text = (m.kind === 'ongoing' ? `${who} is caught up on ${t}` : movie ? `${who} watched ${t}` : `${who} finished ${t}`)
        + (m.score != null ? ` · ★ ${Number(m.score).toFixed(2)}` : ''); icon2 = 'check';   // finished + rated at once (072)
    }
    // 072: rated · added to watchlist · dropped
    if (n.type === 'friend_rated') { text = `${who} rated ${t} ★ ${Number(m.score).toFixed(2)}${m.dropped ? ' (dropped)' : ''}`; icon2 = 'ratingStar'; }
    if (n.type === 'friend_watchlist') { text = `${who} added ${t} to their watchlist`; icon2 = 'bookmark'; }
    if (n.type === 'friend_dropped') { text = `${who} dropped ${t}${_notifDroppedAt(m)}`; icon2 = 'drop'; }
    if (n.type === 'friend_episode') {
      text = `${who} ${_notifFriendEpText(m, t)}`; icon2 = 'tv';
      if (m.tmdb_id) href = `episodes.html?show=${encodeURIComponent(m.tmdb_id)}${n.actor_id ? `&user=${encodeURIComponent(n.actor_id)}` : ''}`;
    }
    if (n.type === 'friend_note') { text = `${who} wrote a note on ${t}`; icon2 = 'notebook'; href = 'friends.html?s=notes'; }
    extra = (n.type === 'friend_episode' && !(m.count > 1) && m.tmdb_id ? mssEpNameHTML(m.tmdb_id, m.season, m.episode, 'notif-quote') : '') + _notifTitleCard(m);
  } else if (n.type === 'friend_list') {
    const m = n.meta || {};
    text = `${who} made a new list <b translate="no">&ldquo;${escHTML(m.title || 'Untitled')}&rdquo;</b>`; icon2 = 'layers';
    href = m.list_id ? `list-view.html?list=${encodeURIComponent(m.list_id)}` : '';
  } else if (n.type === 'new_episode') {
    const m = n.meta || {};
    text = _notifEpText(m, `<b translate="no">${escHTML(m.title || 'a show')}</b>`) + (m.episode_name && !(m.count > 1) ? ` “${escHTML(m.episode_name)}”` : ''); icon2 = 'tv';
    href = m.tmdb_id ? `episodes.html?show=${encodeURIComponent(m.tmdb_id)}` : '';
  } else if (n.type === 'new_release') {
    const m = n.meta || {};
    text = `<b translate="no">${escHTML(m.title || 'A movie')}</b> ${m.kind === 'digital' ? 'is out to stream or buy' : 'is out in cinemas'}`; icon2 = 'film';
    href = m.tmdb_id ? `title.html?type=movie&id=${encodeURIComponent(m.tmdb_id)}` : '';
  } else if (n.type === 'friend_poll' || n.type === 'poll_comment') {
    const m = n.meta || {}, q = `“${escHTML(m.question || 'a poll')}”`;
    text = n.type === 'friend_poll' ? `${who} started a poll: ${q}` : `${who} commented on your poll ${q}`;
    icon2 = n.type === 'friend_poll' ? 'poll' : 'comment';
    if (n.type === 'poll_comment' && m.excerpt) extra = `<div class="notif-quote" translate="no">${escHTML(m.excerpt)}</div>`;
    href = m.poll_id ? `friends.html?s=polls&poll=${encodeURIComponent(m.poll_id)}` : 'friends.html?s=polls';
  } else if (n.type === 'friend_rec') {
    const m = n.meta || {};
    const t = `<b translate="no">${escHTML(m.title || 'something')}</b>`;
    text = m.kind === 'entry' ? `${who} shared that they watched ${t}` : m.kind === 'list' ? `${who} shared their list ${t}` : `${who} recommended ${t} to you`;
    icon2 = m.kind === 'list' ? 'layers' : 'send';
    extra = (m.message ? `<div class="notif-quote" translate="no">${escHTML(m.message)}</div>` : '') + (m.kind === 'list' ? '' : _notifTitleCard({ ...m, media_type: m.tmdb_type }));
    href = m.rec_id ? `friends.html?s=recs&box=received&rec=${encodeURIComponent(m.rec_id)}` : 'friends.html?s=recs';
  } else if (n.type === 'challenge') {
    // Challenges (051): an invite, or someone reaching the goal
    const m = n.meta || {}, t = `<b translate="no">${escHTML(m.title || 'a challenge')}</b>`;
    text = m.kind === 'finished' ? `${who} finished ${t} — ${escHTML(m.goal)} watched!` : `${who} challenged you: ${t}${m.goal ? ` · watch ${escHTML(m.goal)}` : ''}`;
    icon2 = 'trophy';
    href = m.challenge_id ? `friends.html?s=challenges&ch=${encodeURIComponent(m.challenge_id)}` : 'friends.html?s=challenges';
  } else if (n.type === 'achievement') {
    // Achievements (060): the first time, one "check your cabinet" for everything already earned
    const m = n.meta || {}, more = (Number(m.count) || 1) - 1;
    text = m.kind === 'welcome' ? `<b>Your Achievement Cabinet is open</b> — you’ve already earned ${escHTML(m.count)} ${Number(m.count) === 1 ? 'medal' : 'medals'}. Take a look!`
      : `New medal: <b>${escHTML(m.name || 'Achievement')}</b>${m.at ? ` · ${escHTML(Number(m.at).toLocaleString(MSSI18n.locale))}` : ''}${more > 0 ? ` and ${more} more` : ''}`;
    icon2 = 'sparkles';
    href = m.key ? `cabinet.html?tab=ach` : 'cabinet.html';
  } else if (n.type === 'movie_night') {
    // Movie Night (050): invites, the pick, changes and the reminder on the day
    const m = n.meta || {};
    text = _notifNightText(m, who); icon2 = m.kind === 'review' ? 'ratingStar' : m.kind === 'decided' ? 'sparkles' : m.kind === 'cancelled' ? 'x' : m.kind === 'reminder' ? 'clock' : 'film';
    if (m.kind === 'decided' && m.pick) extra = _notifTitleCard({ title: m.pick, poster_url: m.poster_url, tmdb_type: m.tmdb_type, media_type: m.tmdb_type });
    href = m.night_id ? `friends.html?s=night&night=${encodeURIComponent(m.night_id)}` : 'friends.html?s=night';
  } else if (n.type === 'episode_chat') {
    // Episode chat (049): only sent to friends who've watched the episode too
    const m = n.meta || {};
    text = `${who} commented on S${escHTML(m.season)} · E${escHTML(m.episode)} of <b translate="no">${escHTML(m.title || 'a show')}</b>`; icon2 = 'comment';
    if (m.body) extra = `<div class="notif-quote" translate="no">${escHTML(m.body)}</div>`;
    href = `friends.html?s=epchat&ep=${encodeURIComponent(`${m.tmdb_id}:${m.season}:${m.episode}`)}`;
  } else if (n.type === 'rec_reply') {
    // Inbox conversation (048): their reply, or what they did with what you sent
    const m = n.meta || {}, t = `<b translate="no">${escHTML(m.title || 'it')}</b>`;
    text = _notifRecReplyText(m, who, t);
    icon2 = m.code ? ({ added: 'plus', had_it: 'check', started: 'play', finished: 'check', saved_list: 'layers' }[m.code] || 'inbox') : 'comment';
    if (!m.code && m.body) extra = `<div class="notif-quote" translate="no">${escHTML(m.body)}</div>`;
    href = m.rec_id ? `friends.html?s=recs&box=${m.box === 'sent' ? 'sent' : 'received'}&rec=${encodeURIComponent(m.rec_id)}` : 'friends.html?s=recs';
  } else if (n.type === 'comment' || n.type === 'like') {
    // Comments, replies and likes on your things (066)
    const m = n.meta || {};
    text = _notifSocialText(n, who); icon2 = n.type === 'like' ? 'thumbsUp' : m.kind === 'entry' ? 'comment' : 'reply';
    if (m.excerpt) extra = `<div class="notif-quote" translate="no">${escHTML(m.excerpt)}</div>`;
    if (m.kind !== 'list') extra += _notifTitleCard(m);
    href = _notifSocialHref(m);
  } else if (n.type === 'friend_queued') {
    text = `${who} added something from your library to their watchlist`; icon2 = 'plus';
    extra = _notifTitleCard(n.meta);
    href = n.actor_id ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}` : '';
  }
  return `<div class="notif-item${n.read_at ? '' : ' unread'}" ${href ? `onclick="location.href='${href}'"` : ''}>
    <div class="notif-av">${av}${icon2 && ICONS[icon2] ? `<span class="notif-av-type">${icon(icon2, 10)}</span>` : ''}</div>
    <div class="notif-body">
      <div class="notif-text">${text}</div>
      <div class="notif-time">${_notifTimeAgo(n.created_at)}</div>
      ${extra}
      ${actions ? `<div class="notif-actions">${actions}</div>` : ''}
    </div>
    ${opts.page ? `<button class="notif-del" onclick="_notifDelete(event, ${idA})" aria-label="Delete notification">${icon('x', 14)}</button>` : ''}
  </div>`;
}

function _notifTabsHTML(active, onclick) {
  return `<div class="notif-tabs">${NOTIF_SECTIONS.map(([k, l]) => {
    const unread = _notifItems.filter(n => !n.read_at && (k === 'all' || _notifSection(n) === k)).length;
    return `<button class="notif-tab${active === k ? ' active' : ''}" onclick="${onclick}('${k}')">${l}${unread ? `<span class="notif-tab-dot">${unread}</span>` : ''}</button>`;
  }).join('')}</div>`;
}
function _notifFiltered(tab) { return _notifItems.filter(n => tab === 'all' || _notifSection(n) === tab); }
function _notifEmptyHTML(tab) {
  const msg = { all: "You're all caught up", activity: 'No friend activity yet — turn on notifications from a friend\'s profile', social: 'No comments or likes yet', lists: 'No list invites yet', requests: 'No friend requests' }[tab];
  return `<div class="notif-empty">${icon('bell', 26)}<div>${msg}</div></div>`;
}

// The bell opens a sheet that slides in from the right edge (full height,
// full width on phones) — part of the page chrome, not a floating pop-up.
function _notifEnsurePanel() {
  let el = document.getElementById('notifPanel');
  if (el) return el;
  const scrim = document.createElement('div');
  scrim.id = 'notifScrim';
  scrim.addEventListener('click', () => closeNotifPanel());
  el = document.createElement('aside');
  el.id = 'notifPanel';
  el.setAttribute('aria-label', 'Notifications');
  el.innerHTML = `<div class="notif-head">
      <div>
        <div class="notif-title">Notifications</div>
        <div class="notif-sub" id="notifSub"></div>
      </div>
      <button class="notif-close" onclick="closeNotifPanel()" aria-label="Close">${icon('x', 18)}</button>
    </div>
    <div id="notifTabsWrap"></div>
    <div class="notif-list" id="notifList"></div>
    <div class="notif-sheet-foot">
      <button class="notif-foot-btn" id="notifReadAll" onclick="_notifSheetReadAll()">${icon('check', 14)} Mark all read</button>
      <a class="notif-foot-btn primary" href="notifications.html">See all notifications ${icon('arrowRight', 14)}</a>
    </div>`;
  document.body.appendChild(scrim);
  document.body.appendChild(el);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNotifPanel(); });
  return el;
}
function _notifSetTab(t) { _notifTab = t; _notifRenderPanel(); }
let _notifSheetNew = new Set();   // ids that were unread when the sheet opened
function _notifRenderPanel() {
  const listEl = document.getElementById('notifList');
  if (!listEl) return;
  document.getElementById('notifTabsWrap').innerHTML = _notifTabsHTML(_notifTab, '_notifSetTab');
  const items = _notifFiltered(_notifTab).slice(0, 30);
  const fresh = items.filter(n => _notifSheetNew.has(n.id) || !n.read_at);
  const older = items.filter(n => !fresh.includes(n));
  const sub = document.getElementById('notifSub');
  if (sub) sub.textContent = fresh.length ? `${fresh.length} new` : "You're all caught up";
  const rb = document.getElementById('notifReadAll');
  if (rb) rb.disabled = !_notifItems.some(n => !n.read_at || _notifSheetNew.has(n.id));
  listEl.innerHTML = !items.length ? _notifEmptyHTML(_notifTab)
    : (fresh.length ? `<div class="notif-group">New</div>${fresh.map(n => _notifItemHTML(n)).join('')}` : '')
    + (older.length ? `<div class="notif-group">Earlier</div>${older.map(n => _notifItemHTML(n)).join('')}` : '');
  mssFillEpNames(listEl);
}
function _notifSheetReadAll() {
  _notifMarkRead(_notifItems.filter(n => !n.read_at).map(n => n.id));
  _notifSheetNew.clear();
  document.querySelectorAll('#notifList .notif-item.unread').forEach(i => i.classList.remove('unread'));
  _notifRenderPanel();
}
// The sheet sits below the top bar — even when the bar is scrolled away
function _notifSheetTop() {
  // #mainNav holds both the phone bar and the desktop bar; offsetHeight is its
  // full height even if it's been slid out of view
  const nav = document.getElementById('mainNav');
  const h = nav ? nav.offsetHeight : 0;
  if (h) return h;
  const pt = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-pt'));
  return isNaN(pt) ? 64 : pt;
}

async function _notifMarkRead(ids) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  _notifItems.forEach(n => { if (ids.includes(n.id)) n.read_at = now; });
  _notifRenderBadge();
  try { await sb.from('notifications').update({ read_at: now }).in('id', ids); } catch {}
}

async function toggleNotifPanel(ev) {
  ev?.stopPropagation();
  if (location.pathname.endsWith('notifications.html')) return;   // already on the full page
  _notifPeekHide();
  const el = _notifEnsurePanel();
  if (el.classList.contains('open')) { closeNotifPanel(); return; }
  _navCloseAll('notif');
  _notifSheetNew = new Set(_notifItems.filter(n => !n.read_at).map(n => n.id));
  const top = _notifSheetTop() + 'px';
  el.style.setProperty('--notif-top', top);
  document.getElementById('notifScrim').style.setProperty('--notif-top', top);
  _notifRenderPanel();
  el.classList.add('open');
  document.getElementById('notifScrim').classList.add('open');
  document.body.classList.add('notif-sheet-open');
  // Opening the sheet = seen (the highlight stays until it's closed)
  _notifMarkRead(_notifItems.filter(n => !n.read_at).map(n => n.id));
}
function closeNotifPanel() {
  const el = document.getElementById('notifPanel');
  if (!el || !el.classList.contains('open')) return;
  el.classList.remove('open');
  document.getElementById('notifScrim')?.classList.remove('open');
  document.body.classList.remove('notif-sheet-open');
  el.querySelectorAll('.notif-item.unread').forEach(i => i.classList.remove('unread'));
  _notifSheetNew.clear();
}

async function _notifDelete(ev, id) {
  ev.stopPropagation();
  _notifItems = _notifItems.filter(n => n.id !== id);
  _notifRenderBadge();
  if (typeof renderNotificationsPage === 'function') renderNotificationsPage();
  try { await sb.from('notifications').delete().eq('id', id); } catch {}
}

async function _notifFriend(ev, friendshipId, accept) {
  ev.stopPropagation();
  const btns = ev.currentTarget.parentElement.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  try {
    await respondFriendRequest(friendshipId, accept);
    showToast(accept ? 'Friend request accepted!' : 'Friend request declined.');
    await _notifLoad();
    if (_notifUser) {
      const pending = await countPendingRequests(_notifUser.id).catch(() => 0);
      document.querySelectorAll('[data-page="friends.html"] .nav-badge').forEach(b => { b.textContent = pending; b.style.display = pending ? '' : 'none'; });
    }
  } catch (e) { btns.forEach(b => b.disabled = false); showToast('Something went wrong — try again.', 'err'); }
}

async function _notifInvite(ev, listId, accept) {
  ev.stopPropagation();
  const btns = ev.currentTarget.parentElement.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  try {
    const { error } = await sb.rpc('respond_list_invite', { p_list_id: listId, p_accept: accept });
    if (error) throw error;
    showToast(accept ? 'You joined the list! Find it in Lists.' : 'Invite declined.');
    await _notifLoad();
    if (accept && typeof loadListsPage === 'function' && location.pathname.endsWith('lists.html')) loadListsPage();
  } catch (e) { btns.forEach(b => b.disabled = false); showToast('Something went wrong — try again.', 'err'); }
}


/* ══════════════════════════════════════════
   New-notification alerts (in-app)
   Settings → Notifications → "New notification alerts" (ON by default).
   When something new arrives while you're using the site, the bell rings
   and a slim strip drops down just under the top bar, pointing at the bell:
     1 new  → avatar + what happened      2+ new → "3 new notifications"
   Tapping the strip opens the notifications sheet; it tucks back into
   the bell after a few seconds. OFF = just the count on the bell.
   Each notification alerts at most once (remembered on this device).
══════════════════════════════════════════ */
const _NOTIF_POPUP_KEY = 'mss_notif_popups';          // '0' = off, anything else = on
const _NOTIF_SEEN_KEY  = 'mss_notif_popped';
function mssNotifPopupsOn() { try { return localStorage.getItem(_NOTIF_POPUP_KEY) !== '0'; } catch { return true; } }
function mssSetNotifPopups(on) { try { localStorage.setItem(_NOTIF_POPUP_KEY, on ? '1' : '0'); } catch {} }
function _notifSeenGet() { try { return new Set(JSON.parse(localStorage.getItem(_NOTIF_SEEN_KEY) || '[]')); } catch { return new Set(); } }
function _notifSeenAdd(ids) {
  const seen = [..._notifSeenGet(), ...ids];
  try { localStorage.setItem(_NOTIF_SEEN_KEY, JSON.stringify(seen.slice(-300))); } catch {}
}

function _notifMaybePopup() {
  const seen = _notifSeenGet();
  const fresh = _notifItems.filter(n => !n.read_at && !seen.has(n.id));
  if (!fresh.length) return;
  _notifSeenAdd(fresh.map(n => n.id));                 // never alert the same one twice
  if (!mssNotifPopupsOn()) return;                      // setting off → bell count only
  _notifRingBell();
  if (location.pathname.endsWith('notifications.html')) return;
  if (document.getElementById('notifPanel')?.classList.contains('open')) return;
  _notifPeek(fresh);
}

function _notifRingBell() {
  document.querySelectorAll('.notif-btn').forEach(b => {
    b.classList.remove('ringing'); void b.offsetWidth; b.classList.add('ringing');
    setTimeout(() => b.classList.remove('ringing'), 1200);
  });
}

// " at S2 · E4" / " at 1h 10m" for a friend's drop (072)
function _notifDroppedAt(m) {
  if (m.minutes) return ` at ${m.minutes >= 60 ? `${Math.floor(m.minutes / 60)}h ${m.minutes % 60}m` : `${m.minutes}m`}`;
  return m.episode > 0 ? ` at S${Number(m.season) || 1} · E${Number(m.episode)}` : '';
}

// One short line describing a notification
function _notifShortText(n) {
  const who = `<b translate="no">${escHTML(n.actor ? (n.actor.display_name || n.actor.username) : 'Someone')}</b>`;
  const t = n.meta?.title ? `<b translate="no">${escHTML(n.meta.title)}</b>` : 'something';
  const list = n.list ? `“${escHTML(n.list.title)}”` : 'a list';
  switch (n.type) {
    case 'friend_request':       return `${who} sent you a friend request`;
    case 'list_invite':          return `${who} invited you to ${list}`;
    case 'list_invite_accepted': return `${who} joined ${list}`;
    case 'list_invite_declined': return `${who} declined your invite to ${list}`;
    case 'friend_started':       return `${who} started watching ${t}`;
    case 'friend_episode':       return `${who} ${_notifFriendEpText(n.meta || {}, t)}`;
    case 'friend_finished':      return (n.meta?.kind === 'ongoing' ? `${who} is caught up on ${t}` : `${who} finished ${t}`) + (n.meta?.score != null ? ` · ★ ${Number(n.meta.score).toFixed(2)}` : '');
    case 'friend_note':          return `${who} wrote a note on ${t}`;
    case 'friend_rated':         return `${who} rated ${t} ★ ${Number(n.meta?.score).toFixed(2)}`;
    case 'friend_watchlist':     return `${who} added ${t} to their watchlist`;
    case 'friend_dropped':       return `${who} dropped ${t}${_notifDroppedAt(n.meta || {})}`;
    case 'friend_list':          return `${who} made a new list “${escHTML(n.meta?.title || '')}”`;
    case 'friend_queued':        return `${who} added ${t} from your library`;
    case 'new_episode':          return _notifEpText(n.meta || {}, t);
    case 'new_release':          return `${t} ${n.meta?.kind === 'digital' ? 'is out to stream or buy' : 'is out in cinemas'}`;
    case 'friend_poll':          return `${who} started a poll: “${escHTML(n.meta?.question || '')}”`;
    case 'poll_comment':         return `${who} commented on your poll`;
    case 'rec_reply':            return _notifRecReplyText(n.meta || {}, who, t);
    case 'movie_night':          return _notifNightText(n.meta || {}, who);
    case 'achievement':          return n.meta?.kind === 'welcome' ? 'Your Achievement Cabinet is open — take a look!' : `New medal: ${escHTML(n.meta?.name || 'Achievement')}`;
    case 'challenge':            return n.meta?.kind === 'finished' ? `${who} finished ${t}` : `${who} challenged you: ${t}`;
    case 'episode_chat':         return `${who} commented on S${escHTML(n.meta?.season)} · E${escHTML(n.meta?.episode)} of ${t}`;
    case 'comment': case 'like': return _notifSocialText(n, who);
    case 'friend_rec':           return n.meta?.kind === 'entry' ? `${who} shared that they watched ${t}` : n.meta?.kind === 'list' ? `${who} shared a list` : `${who} recommended ${t} to you`;
  }
  return 'New notification';
}

// Comments, replies and likes (066) — what happened, and where tapping it goes
function _notifSocialText(n, who) {
  const m = n.meta || {}, t = `<b translate="no">${escHTML(m.title || (m.kind === 'list' ? 'a list' : 'a title'))}</b>`;
  if (n.type === 'like') return m.kind === 'list' ? `${who} liked your list “${t}”` : m.kind === 'note_reply' ? `${who} liked your reply on a note about ${t}` : `${who} liked your note on ${t}`;
  return m.kind === 'reply' ? `${who} replied to your comment on ${t}` : m.kind === 'note_reply' ? `${who} replied to your note on ${t}` : `${who} commented on your ${t}`;
}
function _notifSocialHref(m) {
  if (m.kind === 'list') return m.list_id ? `list-view.html?list=${encodeURIComponent(m.list_id)}` : '';
  if (m.kind === 'entry' || m.kind === 'reply') {   // comments on a library entry → the comments popup on its owner's page
    if (!m.entry_id) return '';
    return m.owner_id && m.owner_id !== _notifUser?.id ? `profile-view.html?id=${encodeURIComponent(m.owner_id)}&comments=${encodeURIComponent(m.entry_id)}`
      : `library.html?comments=${encodeURIComponent(m.entry_id)}`;
  }
  if (!m.tmdb_id || !m.tmdb_type) return 'notes.html';   // notes live on the title page
  return `title.html?type=${encodeURIComponent(m.tmdb_type)}&id=${encodeURIComponent(m.tmdb_id)}&${m.kind === 'note' ? 'note' : 'replies'}=${encodeURIComponent(m.entry_id)}`;
}

// Episodes that came out together share one notification (044):
// one → "New episode of X — S1 · E4", a few → "3 new episodes of X — S1 · E4–E6",
// a whole season at once → "All 8 episodes of Season 1 of X are out"
function _notifEpText(m, t) {
  const s = escHTML(m.season), a = escHTML(m.episode), b = escHTML(m.episode_to), c = +m.count || 1;
  if (c > 1 && +m.episode === 1 && +m.season_size === c) return `All ${c} episodes of Season ${s} of ${t} are out`;
  if (c > 1 && b) return `${c} new episodes of ${t} — S${s} · E${a}–E${b}`;
  return `New episode of ${t} — S${s} · E${a}`;
}

// Inbox (048): what they did with what you sent, or their reply.
// m.box is the box it sits in for YOU ('sent' = you sent it, they responded)
function _notifRecReplyText(m, who, t) {
  const yours = m.box === 'sent', thing = m.kind === 'list' ? `your list ${t}` : t;
  switch (m.code) {
    case 'added':      return `${who} added ${t} to their watchlist`;
    case 'had_it':     return `${who} already had ${t}`;
    case 'started':    return `${who} started watching ${t}`;
    case 'finished':   return `${who} watched ${t}`;
    case 'saved_list': return `${who} saved ${thing}`;
  }
  return yours ? `${who} replied about ${thing}` : `${who} replied about ${t}`;
}

// Movie Night (050)
function _notifNightText(m, who) {
  const t = `<b translate="no">${escHTML(m.title || 'Movie Night')}</b>`;
  const when = m.when ? new Date(m.when).toLocaleString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const time = m.when ? new Date(m.when).toLocaleTimeString(MSSI18n.locale, { hour: 'numeric', minute: '2-digit' }) : '';
  switch (m.kind) {
    case 'decided':     return `${t}: you’re watching <b translate="no">${escHTML(m.pick || 'something good')}</b>${m.surprise ? ' (surprise pick!)' : ''}`;
    case 'cancelled':   return `${who} cancelled ${t}`;
    case 'rescheduled': return `${who} moved ${t}${when ? ` to ${escHTML(when)}` : ''}`;
    case 'review':      return `${who} ${m.noted ? 'shared their take on' : 'rated'} <b translate="no">${escHTML(m.pick || 'the pick')}</b> from ${t}`;
    case 'reminder':    return `${t} is today${time ? ` at ${escHTML(time)}` : ''}${m.pick ? ` — <b translate="no">${escHTML(m.pick)}</b>` : ' — time to vote!'}`;
  }
  return `${who} invited you to ${t}${when ? ` · ${escHTML(when)}` : ''}`;
}

// A friend's episodes (047): one → "watched S2 · E5 of X";
// a run → "watched 3 episodes of X — S2 · E3–E5" (or S1 · E9 – S2 · E2 across seasons)
function _notifFriendEpText(m, t) {
  const s = +m.season || 1, e = +m.episode || 1, fs = +m.from_season || s, fe = +m.from_episode || e, c = +m.count || 1;
  if (c <= 1 || (fs === s && fe === e)) return `watched S${s} · E${e} of ${t}`;
  return `watched ${c} episodes of ${t} — ${fs === s ? `S${s} · E${fe}–E${e}` : `S${fs} · E${fe} – S${s} · E${e}`}`;
}

/* Episode names (TMDB season data, cached — MSSEp's 7-day cache when
   episode-ratings.js is on the page). mssEpNameHTML() leaves a hidden
   placeholder; mssFillEpNames(root) fills them in after a render. */
const _mssEpSeasons = {};
function mssEpName(tmdbId, season, ep) {
  if (!tmdbId || !(+season > 0) || !(+ep > 0)) return Promise.resolve(null);
  const k = tmdbId + ':' + season;
  const p = _mssEpSeasons[k] || (_mssEpSeasons[k] = typeof MSSEp !== 'undefined' && MSSEp.seasonEpisodes
    ? MSSEp.seasonEpisodes(tmdbId, season)
    : tmdbFetch(`${TMDB_BASE}/tv/${tmdbId}/season/${season}?api_key=${TMDB_KEY}&language=en-US`)
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number).map((x, i) => ({ n: i + 1, name: x.name })))
        .catch(() => []));
  return p.then(eps => {
    const name = (eps || []).find(x => x.n === +ep)?.name;
    return name && !/^Episode \d+$/i.test(name.trim()) ? name : null;     // skip TMDB's "Episode 3" placeholders
  }, () => null);
}
function mssEpNameHTML(tmdbId, season, ep, cls = '') {
  return `<div class="${cls}" translate="no" hidden data-ep-name="${escHTML(`${tmdbId}:${season}:${ep}`)}"></div>`;
}
function mssFillEpNames(root) {
  (root || document).querySelectorAll('[data-ep-name]').forEach(el => {
    const [id, s, e] = el.dataset.epName.split(':');
    el.removeAttribute('data-ep-name');
    mssEpName(id, s, e).then(name => { if (name) { el.textContent = `“${name}”`; el.hidden = false; } });
  });
}

let _notifPeekTimer = null;
function _notifPeek(fresh) {
  const bell = [...document.querySelectorAll('.notif-btn')].find(b => b.offsetParent !== null);
  if (!bell) return;
  let el = document.getElementById('notifPeek');
  if (!el) {
    el = document.createElement('button');
    el.id = 'notifPeek';
    el.type = 'button';
    el.setAttribute('aria-live', 'polite');
    el.addEventListener('click', e => { e.stopPropagation(); toggleNotifPanel(); });
    el.addEventListener('mouseenter', () => clearTimeout(_notifPeekTimer));
    el.addEventListener('mouseleave', () => _notifPeekLater(3000));
    document.body.appendChild(el);
  }
  const n = fresh[0], a = n.actor;
  const lead = fresh.length === 1
    ? (a && safeURL(a.avatar_url) ? `<img src="${safeURL(a.avatar_url)}" alt="">` : escHTML(((a && a.username) || '?')[0].toUpperCase()))
    : `<b>${fresh.length > 99 ? '99+' : fresh.length}</b>`;
  const text = fresh.length === 1 ? _notifShortText(n) : `<b>${fresh.length} new notifications</b>`;
  el.innerHTML = `<span class="np-lead">${lead}</span><span class="np-text">${text}</span><span class="np-go">${icon('arrowRight', 13)}</span>`;
  // Just below the top bar (even if the bar has scrolled away), lined up
  // under the bell with a small pointer at it
  const r = bell.getBoundingClientRect();
  const right = Math.max(10, window.innerWidth - r.right);
  el.style.top = (_notifSheetTop() + 10) + 'px';
  el.style.right = right + 'px';
  el.style.setProperty('--peek-max', Math.min(380, window.innerWidth - 20) + 'px');
  el.style.setProperty('--peek-caret', Math.max(14, r.width / 2 - 6) + 'px');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  _notifPeekLater(5500);
}
function _notifPeekLater(ms) { clearTimeout(_notifPeekTimer); _notifPeekTimer = setTimeout(_notifPeekHide, ms); }
function _notifPeekHide() {
  clearTimeout(_notifPeekTimer);
  document.getElementById('notifPeek')?.classList.remove('show');
}

/* ── Always show the newest version after a deploy ──
   When a new service worker takes over (every sw.js bump), reload once so
   the page you're on comes from the new version instead of the old cache.
   Skipped on a first-ever visit (no previous worker) to avoid a pointless reload. */
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let _mssSwReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_mssSwReloaded) return;
    _mssSwReloaded = true;
    location.reload();
  });
}

/* ══════════════════════════════════════════
   Top cast — shared by the info popup and the Create Card
   mssFetchCast({ tmdb_id, tmdb_type, title, year, animated, origin_country, original_language })
   → [{ character, actor, photo, isCharacterImage }]  (top 5)

   Always leads with the CHARACTER name, actor/voice actor underneath.
   For animated titles it also asks AniList (which has character artwork
   for anime and some western animation) and, when it finds the show,
   uses the character's picture instead of the voice actor's photo.
   TMDB itself only has photos of the people, never of characters, so
   titles AniList doesn't list keep the voice actor's photo.
   Results are kept on the device for 7 days.
══════════════════════════════════════════ */
const _MSS_CAST_STORE = 'mss_cast_v2';   // v2: entries carry the TMDB person id
const _MSS_CAST_TTL = 7 * 24 * 60 * 60 * 1000;
function _mssCastCache() { try { return JSON.parse(localStorage.getItem(_MSS_CAST_STORE) || '{}'); } catch { return {}; } }
function _mssCastSave(key, cast) {
  try {
    const all = _mssCastCache();
    all[key] = { t: Date.now(), cast };
    const keys = Object.keys(all);
    if (keys.length > 150) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 150).forEach(k => delete all[k]);
    localStorage.setItem(_MSS_CAST_STORE, JSON.stringify(all));
  } catch {}
}
const _mssNorm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function _mssAniListCharacters(title, year) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: `
        query ($search: String) {
          Page(page: 1, perPage: 5) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              title { english romaji } synonyms startDate { year }
              characters(sort: [ROLE, RELEVANCE, ID], perPage: 10) {
                edges {
                  role
                  node { name { full } image { large } }
                  ja: voiceActors(language: JAPANESE) { name { full } }
                  en: voiceActors(language: ENGLISH) { name { full } }
                }
              }
            }
          }
        }`, variables: { search: title } }),
    });
    const list = (await res.json())?.data?.Page?.media || [];
    const want = _mssNorm(title);
    // Only trust an AniList match whose title really is this show (± a year)
    return list.find(m => {
      const names = [m.title?.english, m.title?.romaji, ...(m.synonyms || [])].map(_mssNorm).filter(Boolean);
      const yearOk = !year || !m.startDate?.year || Math.abs(Number(m.startDate.year) - Number(year)) <= 1;
      return yearOk && names.includes(want);
    }) || null;
  } catch { return null; }
}

async function mssFetchCast(it) {
  if (!it?.tmdb_id || !it?.tmdb_type) return [];
  const key = `${it.tmdb_type}:${it.tmdb_id}`;
  const hit = _mssCastCache()[key];
  if (hit && Date.now() - hit.t < _MSS_CAST_TTL) return hit.cast;

  // 1) TMDB cast (TV uses aggregate credits so long-running roles rank right)
  let tmdb = [];
  try {
    const path = it.tmdb_type === 'movie' ? 'credits' : 'aggregate_credits';
    const res = await tmdbFetch(`${TMDB_BASE}/${it.tmdb_type}/${it.tmdb_id}/${path}?api_key=${TMDB_KEY}&language=en-US`);
    if (res.ok) {
      tmdb = ((await res.json()).cast || []).map(c => ({
        character: (c.character || c.roles?.[0]?.character || '').replace(/\s*\(voice\)\s*/i, '').trim(),
        actor: c.name || '',
        personId: c.id || null,          // TMDB person → person.html
        photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
        isCharacterImage: false,
      })).filter(c => c.actor);
    }
  } catch {}

  // 2) Animated → try character artwork from AniList
  let cast = tmdb.slice(0, 5);
  if (it.animated && it.title) {
    const media = await _mssAniListCharacters(it.title, it.year);
    const edges = media?.characters?.edges || [];
    if (edges.length) {
      const tmdbActors = new Set(tmdb.map(c => _mssNorm(c.actor)));
      const tmdbIds = Object.fromEntries(tmdb.map(c => [_mssNorm(c.actor), c.personId]));
      const jp = (it.origin_country || []).includes('JP') || it.original_language === 'ja';
      cast = edges.slice(0, 5).map(ed => {
        const vas = [...(ed.ja || []), ...(ed.en || [])].map(v => v.name?.full).filter(Boolean);
        // Prefer the voice actor TMDB also lists (same dub), else JP for anime, EN otherwise
        const actor = vas.find(n => tmdbActors.has(_mssNorm(n)))
          || (jp ? ed.ja?.[0]?.name?.full : ed.en?.[0]?.name?.full)
          || vas[0] || '';
        return { character: ed.node?.name?.full || '', actor, personId: tmdbIds[_mssNorm(actor)] || null, photo: ed.node?.image?.large || null, isCharacterImage: true };
      }).filter(c => c.character);
      // Fill up to 5 with TMDB cast AniList didn't cover (actor photo)
      const have = new Set(cast.map(c => _mssNorm(c.character)));
      for (const c of tmdb) {
        if (cast.length >= 5) break;
        const k = _mssNorm(c.character);
        if (k && ![...have].some(h => h === k || h.split(' ')[0] === k.split(' ')[0])) { cast.push(c); have.add(k); }
      }
    }
  }
  _mssCastSave(key, cast);
  return cast;
}
