/* ══════════════════════════════════════════
   nav.js — Chrome injection + auth guard
══════════════════════════════════════════ */

/* Where you came from (the "‹ Back / Discover / This page" trail above a backdrop header).
   Every page remembers its own name as you leave it (sessionStorage 'mssPrevPage'); the next page
   reads it back when it matches the page you arrived from, else names that page by its file. */
const _NAV_PAGE_NAMES = { 'index.html': 'Home', 'discover.html': 'Discover', 'library.html': 'Library', 'browse.html': 'Browse',
  'discover-list.html': 'Discover', 'episodes.html': 'Episodes', 'title.html': 'Title', 'person.html': 'Person', 'item.html': 'Title',
  'season.html': 'Season', 'episode.html': 'Episode', 'lists.html': 'Lists', 'list-view.html': 'List', 'profile.html': 'Profile',
  'profile-view.html': 'Profile', 'user.html': 'Profile', 'friends.html': 'Friends', 'activity.html': 'Activity', 'diary.html': 'Diary',
  'ratings.html': 'Ratings', 'notes.html': 'Notes', 'movies.html': 'Movies', 'tv-shows.html': 'TV Shows', 'anime.html': 'Anime',
  'cartoons.html': 'Cartoons', 'notifications.html': 'Notifications', 'messages.html': 'Messages', 'challenges.html': 'Challenges',
  'compare.html': 'Compare', 'blend.html': 'Blend', 'movie-night.html': 'Movie Night', 'polls.html': 'Polls', 'detail.html': 'Edit' };
const _navFile = u => (u.pathname.split('/').pop() || 'index.html');
function _navPageLabel() {
  const t = (document.title || '').replace(/\s*[—·-]\s*MyScreenFolio\s*$/, '').trim();
  return t && t !== 'MyScreenFolio' && t.length <= 48 ? t : (_NAV_PAGE_NAMES[_navFile(location)] || 'Previous page');
}
addEventListener('pagehide', () => {
  try { sessionStorage.setItem('mssPrevPage', JSON.stringify({ url: _navFile(location) + location.search, label: _navPageLabel() })); } catch {}
});
// → { href, label } for the page you came from on this site, or null (opened directly / from another site)
function mssCameFrom() {
  try {
    if (!document.referrer) return null;
    const r = new URL(document.referrer);
    if (r.origin !== location.origin) return null;
    const href = _navFile(r) + r.search;
    if (href === _navFile(location) + location.search) return null;
    const p = JSON.parse(sessionStorage.getItem('mssPrevPage') || 'null');
    return { href, label: p && p.url === href && p.label ? p.label : (_NAV_PAGE_NAMES[_navFile(r)] || 'Previous page') };
  } catch { return null; }
}
// The trail itself: ‹ Back / <where you came from> / <this page>. fallback = { href, label } when you came from nowhere on the site.
// back: the Back link's onclick (it goes back in history when there is a page to go back to)
function mssCrumbHTML(current, fallback, back = 'return mssGoBack()') {
  const from = mssCameFrom() || fallback;
  const href = from?.href || 'index.html';
  return `<div class="tv-crumb mss-crumb" role="navigation" aria-label="Breadcrumb">
    <a href="${esc(href)}" onclick="${back}">${icon('back', 14)}<span>Back</span></a>
    ${from ? `<span aria-hidden="true">/</span><a href="${esc(from.href)}" translate="no">${esc(from.label)}</a>` : ''}
    <span aria-hidden="true">/</span><span aria-current="page" translate="no">${esc(current || '')}</span></div>`;
}
function mssGoBack() {
  if (mssCameFrom() && history.length > 1) { history.back(); return false; }
  return true;
}

/* New episodes + movie releases → notifications, on whatever page you open
   (tv-schedule.js, loaded here when the page doesn't have it; it waits 3 hours
   between checks). Runs once the page has settled so it never slows it down. */
function _navReleaseCheck(user) {
  const run = () => mssLoadScript('js/tv-schedule.js').then(() => { if (typeof MSSSchedule !== 'undefined') MSSSchedule.checkReleases(user.id); });
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
// "Does this count?" after marking a title Watched: one challenge → the shared confirm; several → a side panel S
// (full page on phones) with a box to tick for each
let _navPickPanel = null;
async function _navPickAsk(e, opts) {
  if (opts.length === 1) {
    const o = opts[0];
    const ok = await showConfirm({ title: 'Does this count?', message: `${e.title || 'This title'} — you just marked it Watched. Count it for “${o.title}” (${o.progress} / ${o.goal} so far)?`,
      confirmText: 'Count it', cancelText: 'Doesn’t count', iconName: 'trophy', danger: false });
    return _navPickDone(e, opts, ok ? opts : []);
  }
  await mssLoadScript('js/panel.js');
  let answered = false;
  const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Does this count?',
    body: `<div class="lyr-card-sec pick-ask-title"><span class="pick-ask-poster">${safeURL(e.poster_url) ? `<img src="${safeURL(e.poster_url)}" alt="">` : escHTML((e.title || '?')[0])}</span>
        <span><b translate="no">${escHTML(e.title || 'This title')}</b><small>You just marked it Watched</small></span></div>
      <div class="lyr-sec"><h3 class="lyr-sec-h">Tick the challenges it counts for:</h3>
        <div class="pick-ask-list">${opts.map((o, i) => `<label class="pick-ask-opt"><input type="checkbox" value="${i}" checked>
          <span>${icon('trophy', 15)}<b translate="no">${escHTML(o.title)}</b><small>${o.progress} / ${o.goal} so far</small></span></label>`).join('')}</div></div>`,
    footer: { secondary: [{ label: 'Doesn’t count', onClick: x => x.close() }],
      primary: { label: 'Count it', lead: icon('check', 16), onClick: x => { answered = true; const on = [...x.body.querySelectorAll('.pick-ask-opt input:checked')].map(i => opts[+i.value]); x.closeNow(); _navPickDone(e, opts, on); } } },
    onClose: () => { if (_navPickPanel !== h) return; _navPickPanel = null; if (!answered) _navPickDone(e, opts, []); } });
  _navPickPanel = h;
}
async function _navPickDone(e, opts, on) {
  try {   // remember the ones left unticked, so they aren't asked again
    const seen = JSON.parse(localStorage.getItem('mss_pick_asked') || '{}');
    opts.filter(o => !on.includes(o)).forEach(o => { seen[o.id + ':' + e.id] = 1; });
    localStorage.setItem('mss_pick_asked', JSON.stringify(seen));
  } catch {}
  if (!on.length) return;
  let finished = null;
  for (const o of on) {
    try { const { data, error } = await sb.rpc('set_challenge_pick', { p_ch: o.id, p_entry: e.id, p_on: true }); if (error) throw error; if (data?.finished) finished = o; }
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
  if (MSSDialog.top()) { _navFinTimer = setTimeout(_navFinRun, 1500); return; }
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

/* Switch account — every account signed in on this device, one tap to become it (config.js MSSAccounts
   keeps the sessions). A side panel S / full page; the You menu closes first. */
let _navAccPanel = null;
async function _navAccounts() {
  _navCloseAll();
  await mssLoadScript('js/panel.js');
  const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Switch account', body: '',
    footer: { secondary: [{ label: 'Close', only: 'side', onClick: x => x.close() }], primary: { label: '+ Add account', onClick: () => MSSAccounts.add() } },
    onClose: () => { if (_navAccPanel === h) _navAccPanel = null; } });
  _navAccPanel = h;
  h.body.addEventListener('click', ev => {
    const go = ev.target.closest('[data-go]'), more = ev.target.closest('[data-more]');
    if (go) _navAccountGo(go, go.dataset.go);
    if (more) _navAccountMore(more, more.dataset.more);
  });
  _navAccountsFill();
}
function _navAccountsFill() {
  const h = _navAccPanel; if (!h) return;
  const me = window._navUser?.id, all = MSSAccounts.list(), cur = all.find(a => a.id === me), others = all.filter(a => a.id !== me);
  h.setTitle('Switch account', `${all.length} ${all.length === 1 ? 'account' : 'accounts'} on this device`);
  const ava = a => { const u = safeURL(a.avatar_url);
    return `<span class="acc-sw-ava" aria-hidden="true">${u ? `<img src="${u}" alt="">` : escHTML((a.username || '?')[0].toUpperCase())}</span>`; };
  const name = a => `<span class="acc-sw-name"><b translate="no">${escHTML(a.display_name || a.username)}</b><small translate="no">@${escHTML(a.username)}</small></span>`;
  h.setBody(`${cur ? `<div class="acc-sw-row is-current" aria-current="true">${ava(cur)}${name(cur)}<span class="acc-sw-cur">${icon('check', 14)} Signed in</span></div>` : ''}
    <p class="lyr-hint">Accounts stay signed in on this device only. Add one once and switch any time without the password.</p>
    <div class="lyr-sec"><h3 class="lyr-sec-h">On this device</h3>
      ${others.length ? `<ul class="acc-sw-list">${others.map(a => `<li class="acc-sw-item">
          <button type="button" class="acc-sw-row" data-go="${escHTML(a.id)}">${ava(a)}${name(a)}<span class="sr-only">, switch to this account</span></button>
          <button type="button" class="acc-sw-more" data-more="${escHTML(a.id)}" aria-label="Options for @${escHTML(a.username)}">${icon('moreV', 18)}</button></li>`).join('')}</ul>`
        : '<p class="acc-sw-empty">No other accounts yet.</p>'}</div>`);
}
async function _navAccountGo(btn, id) {
  btn.disabled = true; btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
  if (!(await MSSAccounts.switchTo(id))) _navAccountsFill();
}
// ⋯ on an account: Remove from this device (asks first)
function _navAccountMore(btn, id) {
  const a = MSSAccounts.list().find(x => x.id === id); if (!a) return;
  MSSPopover.open(btn, { title: `@${a.username}`, label: `Options for @${a.username}`, items: [{ label: 'Remove from this device', icon: 'trash', danger: true, onSelect: async () => {
    const ok = await showConfirm({ title: `Remove @${a.username} from this device?`, message: 'You’ll need the password to add it here again. The account itself isn’t changed.', confirmText: 'Remove', iconName: 'trash' });
    if (!ok) return;
    MSSAccounts.forget(id);
    _navAccountsFill();
    showToast(`Removed @${a.username} from this device`);
    _navAccPanel?.body.querySelector('.acc-sw-row[data-go]')?.focus();
  } }] });
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

/* The MSF Member medal's one-time popup (075) — new accounts and everyone who
   was already here. Waits for any other popup to close first; once it's been
   seen (on any device) it's remembered here so the check stops. */
function _navMemberMedal(uid) {
  if (/(login|cabinet)\.html$/.test(location.pathname)) return;
  const key = 'mss_member_seen_' + uid;
  try { if (localStorage.getItem(key)) return; } catch { return; }
  setTimeout(async () => {
    let b = null;
    try { const r = await sb.rpc('member_medal'); if (r.error) return; b = r.data; } catch { return; }
    if (!b || b.seen) { try { localStorage.setItem(key, '1'); } catch {} return; }
    await mssAfterLaunch();
    for (let i = 0; i < 40 && (MSSDialog.top() || document.querySelector('.soc-overlay.open')); i++) await new Promise(r => setTimeout(r, 1500));
    if (MSSDialog.top()) return;                            // still busy — next page
    try {
      if (typeof MSSMedal === 'undefined') await _navLoadScript('js/medals.js');
      if (typeof MSSSpotlight === 'undefined') await _navLoadScript('js/spotlights.js');
      MSSSpotlight.member(b);
      localStorage.setItem(key, '1');
    } catch {}
  }, 2200);
}

/* Photos uploaded before msf-v95 were saved bigger than needed (500px at 0.92,
   some ~250 kB+). Once per device: if yours is over MSS_AVATAR.max, it's redrawn
   at the new size and saved over the old file — nothing changes on screen. */
function _navAvatarShrink(uid, profile) {
  const url = safeURL(profile?.avatar_url), key = 'mss_ava_tidy_' + uid;
  if (!url || !url.includes('/storage/v1/object/public/avatars/')) return;   // only photos in our own storage
  try { if (localStorage.getItem(key) === url) return; } catch { return; }
  setTimeout(async () => {
    try {
      const old = await (await fetch(url, { cache: 'no-store' })).blob();
      if (old.size > MSS_AVATAR.max) {
        // redraw it smaller, the same shape (square from before, or a 2:3 portrait); kept as it is if that wouldn't save anything
        const img = await createImageBitmap(old), k = Math.min(1, MSS_AVATAR.px / img.width);
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', MSS_AVATAR.q));
        if (blob && blob.size < old.size) {
          const path = `${uid}/avatar.jpg`;
          const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
          if (error) return;                                 // try again next time
          const fresh = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
          await updateProfile(uid, { avatar_url: fresh });
          profile.avatar_url = fresh;
        }
      }
      await mssAvatarTidy(uid, profile.avatar_url);         // and drop old files left behind
      localStorage.setItem(key, profile.avatar_url);
    } catch {}
  }, 6000);                                                  // after the page has settled
}

/* Welcome to MyScreenFolio + Set up your folio (js/onboarding.js): once per account (profiles.onboarding, sql/134 —
   until it runs, once per device), and back to the rating step after rating a Top 5 title (?setup=rate).
   The module only loads when there's something to show. */
function _navOnboarding(user, profile) {
  let due = new URLSearchParams(location.search).has('setup');
  if (!due) {
    let st = null;                                   // welcome not seen yet, or setup left half-way (a refresh)
    if (profile && 'onboarding' in profile) st = profile.onboarding || {};
    else try { st = JSON.parse(localStorage.getItem('mss_onboarding_' + user.id) || '{}') || {}; } catch {}
    due = !!st && (!st.welcome || (!!st.step && !st.closed));
  }
  if (!due || /(login|detail|admin|404|offline)\.html$/.test(location.pathname)) return;
  window._mssOnboarding = true;
  mssLoadScript('js/onboarding.js').then(() => typeof MSSOnboarding !== 'undefined' ? MSSOnboarding.auto() : mssOnboardingDone());
}
// the welcome / setup closed (or never opened): the popups waiting in mssAfterLaunch go ahead
function mssOnboardingDone() {
  if (!window._mssOnboarding) return;
  window._mssOnboarding = false;
  document.dispatchEvent(new CustomEvent('mss:onboarding-done'));
}

function _navSpotlight() {
  // Home page only, once each time the app is opened (sessionStorage resets when it's closed)
  if (!/\/(index\.html)?$/.test(location.pathname)) return;
  try { if (sessionStorage.getItem('mss_spot_open')) return; } catch { return; }
  mssAfterLaunch().then(() => setTimeout(async () => {
    try {
      if (typeof MSSMedal === 'undefined') await _navLoadScript('js/medals.js');
      if (typeof MSSSpotlight === 'undefined') await _navLoadScript('js/spotlights.js');
      MSSSpotlight.check();
    } catch {}
  }, 900));
}

// On This Day (115): the day's grouped notification (once a day per device, once per account in the
// database), and on the home page only the 9+ pop-up. on-this-day.js loads only when there's something to do.
function _navOnThisDay(user, profile) {
  const home = (location.pathname.split('/').pop() || 'index.html') === 'index.html' && !location.search;
  let asked = false;
  try { const d = new Date(); asked = localStorage.getItem('msf_otd_n:' + user.id) === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; } catch {}
  if (asked && !home) return;
  mssLoadScript('js/on-this-day.js').then(() => {
    if (typeof MSSOtd === 'undefined') return;
    MSSOtd.daily(user);
    if (home) mssAfterLaunch().then(() => MSSOtd.home(user, profile));
  });
}

// Your device's time zone on your profile, so the Diary logs a watch on YOUR day (112)
function _navTimeZone(uid, profile) {
  let tz; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return; }
  if (!tz || !profile || profile.time_zone === tz || !('time_zone' in profile)) return;
  sb.from('profiles').update({ time_zone: tz }).eq('id', uid).then(() => {}, () => {});
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
  _navAgeCheck(user.id);
  _navAccountCheck(profile);
  _navOnboarding(user, profile);                     // first: the popups below wait while it's due (mssAfterLaunch)
  _navSessionCheck();
  _navReleaseCheck(user);
  _navSpotlight();
  _navMemberMedal(user.id);
  _navAvatarShrink(user.id, profile);
  _navAchSync();
  _navFinishCheck(2500);
  _navTimeZone(user.id, profile);
  _navOnThisDay(user, profile);
  _shellUserPaint(profile);
  // the menus' counts and cards (and the Friends chip), ready before the first hover
  ('requestIdleCallback' in window) ? requestIdleCallback(() => _shellSummary(), { timeout: 3000 }) : setTimeout(_shellSummary, 1500);
  _bnavDot(pending);
  return profile;
}
// Your photo (or initial) on the header's avatar buttons
function _shellUserPaint(profile) {
  const name = profile?.username || window._navUser?.email?.split('@')[0] || 'You', av = safeURL(profile?.avatar_url);
  ['navUserInitial', 'navUserInitialMobile'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = av ? `<img src="${av}" alt="">` : escHTML(name[0].toUpperCase()); });
  document.querySelectorAll('#navUserBtn, #navTopUser').forEach(b => b.setAttribute('aria-label', `Your account, @${name}`));
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
// Active Sessions (091): checked on every page, so a signed-out device leaves on its next page load.
// If the check can't run, nothing happens (never signs anyone out by mistake).
async function _navSessionCheck() {
  try { const { data } = await sb.rpc('session_alive'); if (data === false) mssSessionEnded(); } catch {}
}

async function _navAccountCheck(profile) {
  const uid = window._navUser?.id, name = profile?.username;
  if (!uid || !name || document.getElementById('mssRenameOverlay')) return;
  const key = uid + ':' + name;
  try { if (sessionStorage.getItem('mss_account_ok') === key) return; } catch {}
  let st = null;
  try { const { data, error } = await sb.rpc('mss_my_status'); if (!error && data && typeof data.banned === 'boolean') st = data; } catch {}
  if (!st) st = { banned: false, username_ok: await isUsernameAllowed(name) };   // before migration 040
  if (st.banned === true) return _navSuspended(st.until);
  if (st.username_ok !== false) { try { sessionStorage.setItem('mss_account_ok', key); } catch {} return; }
  _navRenamePopup(uid, name);
}
/* ── Age (088): 13–17 accounts don't get mature titles (MSSAge, config.js).
   Accounts made before birth dates were asked for give theirs once; an
   under-13 date locks the account (MyScreenFolio is for 13 and up). ── */
async function _navAgeCheck(uid) {
  const { data, error } = await sb.rpc('my_age');
  if (error) { MSSAge.setGroup(null, null); return; }   // 088 not run yet — no limits
  MSSAge.setGroup(uid, data || 'unknown');              // no date yet → limited like 13–15 until they give it
  if (data === 'child') _navAgeLocked();
  else if (!data && !/login\.html$/.test(location.pathname)) _navBirthPopup(uid);
}
function _navAgeLocked() {
  if (document.getElementById('mssAgeLockOverlay')) return;
  const el = document.createElement('div');
  el.className = 'confirm-overlay mss-block';
  el.id = 'mssAgeLockOverlay';
  el.innerHTML = `<div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="mssAgeLockT" aria-describedby="mssAgeLockM">
      <div class="confirm-icon" aria-hidden="true">${icon('lock', 36)}</div>
      <div class="confirm-title" id="mssAgeLockT">MyScreenFolio is for ages 13 and up</div>
      <div class="confirm-msg" id="mssAgeLockM">This account can’t be used. If the birth date was entered by mistake, contact the site’s owners.</div>
      <div class="confirm-actions"><button type="button" class="confirm-ok is-safe" onclick="handleLogout()">Sign out</button></div>
    </div>`;
  MSSDialog.bind(el, () => {});
  document.body.appendChild(el);
  MSSDialog.open(el, { focus: el.querySelector('button') });
}
// The date-of-birth question (088): a full screen in the sign-up page's look — the poster stage with the logo, the question
// on a card beside it (a poster band on top on phones). It can't be skipped — only saved, or signed out.
function _navBirthPopup(uid) {
  if (document.getElementById('mssBirthOverlay')) return;
  const el = document.createElement('div');
  el.className = 'confirm-overlay mss-block mss-gate';
  el.id = 'mssBirthOverlay';
  const li = (ic, t) => `<li><span aria-hidden="true">${icon(ic, 16)}</span>${t}</li>`;
  el.innerHTML = `<div class="gate" role="dialog" aria-modal="true" aria-labelledby="mssBirthT" aria-describedby="mssBirthMsg">
      <aside class="gate-stage"><div class="pw-wall" aria-hidden="true"></div><img class="gate-logo" src="icons/logo-dark.svg" alt="MyScreenFolio" width="142" height="60">
        <div class="gate-copy"><span class="gate-eb">One quick thing</span><h2>Before you <em>dive in.</em></h2>
          <ul class="gate-feats">${li('lock', 'Private — it never shows on your profile')}${li('eye', 'Keeps age-restricted titles away from younger members')}${li('check', 'Asked once — it can’t be changed later')}</ul></div></aside>
      <div class="gate-main"><form class="gate-card" novalidate>
        <span class="gate-eb is-card">Your account</span>
        <h1 class="gate-t" id="mssBirthT">What’s your date of birth?</h1>
        <p class="gate-msg" id="mssBirthMsg">Everyone on MyScreenFolio gives it once, so age-restricted titles stay away from younger members.</p>
        <div class="mss-birth-row" role="group" aria-label="Date of birth" id="mssBirthRow"></div>
        <div class="mss-rename-hint bad" id="mssBirthHint" aria-live="polite"></div>
        <div class="gate-acts">
          <button type="button" class="gate-b is-t" onclick="handleLogout()">Sign out</button>
          <button type="submit" class="gate-b is-p" id="mssBirthSave" disabled>Save ${icon('chevright', 16)}</button>
        </div>
      </form></div></div>`;
  MSSDialog.bind(el, () => {});                        // can't be skipped — only saved, or signed out
  document.body.appendChild(el);
  mssLoadScript('js/poster-wall.js').then(() => { if (el.isConnected && typeof MSSPosterWall !== 'undefined') el._wall = MSSPosterWall.mount(el.querySelector('.pw-wall')); });
  const save = el.querySelector('#mssBirthSave'), hint = el.querySelector('#mssBirthHint');
  mssDateFields(el.querySelector('#mssBirthRow'), 'mssBirth', { label: 'Date of birth', view: 'years', onChange: () => { save.disabled = !mssBirthValue('mssBirth'); hint.textContent = ''; } });
  el.querySelector('form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = mssBirthValue('mssBirth');
    if (!v) return;
    if (v === 'invalid') { hint.textContent = 'That date doesn’t exist — check the day.'; return; }
    save.disabled = true; save.textContent = 'Saving…';
    const { data, error } = await sb.rpc('set_birth_date', { p_birth: v });
    if (error) { hint.textContent = error.hint || 'Couldn’t save — try again.'; save.disabled = false; save.innerHTML = `Save ${icon('chevright', 16)}`; return; }
    MSSDialog.close(el);
    setTimeout(() => { el._wall?.stop(); el.remove(); }, 300);
    MSSAge.setGroup(uid, data);
    if (data === 'child') _navAgeLocked();
    else { showToast('Saved — thanks!'); if (data !== 'adult') setTimeout(() => location.reload(), 600); }
  });
  MSSDialog.open(el);
}

function _navSuspended(until) {
  if (document.getElementById('mssSuspendedOverlay')) return;
  const el = document.createElement('div');
  el.className = 'confirm-overlay mss-block';
  el.id = 'mssSuspendedOverlay';
  el.innerHTML = `<div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="mssSuspTitle" aria-describedby="mssSuspMsg">
      <div class="confirm-icon" aria-hidden="true">${icon('lock', 36)}</div>
      <div class="confirm-title" id="mssSuspTitle">${until ? 'Your account is suspended' : 'Your account is banned'}</div>
      <div class="confirm-msg" id="mssSuspMsg">${until
        ? `This account broke MyScreenFolio’s community rules. It can be used again on ${escHTML(new Date(until).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'long', year: 'numeric' }))}.`
        : 'This account broke MyScreenFolio’s community rules, so it can’t be used anymore.'} If you think this is a mistake, contact the site’s owners.</div>
      <div class="confirm-actions"><button type="button" class="confirm-ok is-safe" onclick="handleLogout()">Sign out</button></div>
    </div>`;
  MSSDialog.bind(el, () => {});
  document.body.appendChild(el);
  MSSDialog.open(el, { focus: el.querySelector('button') });
}
function _navRenamePopup(uid, name) {
  const el = document.createElement('div');
  el.className = 'confirm-overlay mss-block';
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
      _shellUserPaint(p);
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

// Signed out: Sign in + Create account in the header; the pages that need an account open the Join panel (mssJoin, config.js)
const _isGuest = () => !!window._navGuest || document.documentElement.classList.contains('mss-guest');
function _shellGuest() {
  MSSAge.setGroup(null, null);   // guests see every title (088)
  window._navGuest = true;
  document.documentElement.classList.add('mss-guest');
  document.querySelectorAll('.nav-auth-only').forEach(el => el.style.display = 'none');
}

async function initPage(onReady) {
  injectChrome();
  const user = await getCurrentUser();
  if (!user) {
    _shellGuest();
    // Still call callback with null so pages can render their own empty/guest state
    if (typeof onReady === 'function') await onReady(null, null);
    return;
  }
  document.documentElement.classList.remove('mss-guest');
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
// Filters, sorts, type picks (owner, 17 Nov 2026): every visit to a page starts from its defaults (a link, the nav, a
// reload); only Back / Forward brings back what you had. Saved defaults and list / grid views (your choices) aren't filters.
const _mssBackForward = _mssNavType === 'back_forward';
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
  _navTermsCheck(user);
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

/* Terms & Privacy (MSF_LEGAL, consent.js): a member who hasn't agreed to the current Terms — everyone who joined before
   they existed, and everyone again when the Terms version changes — is asked once per visit, after the launch screen and
   any other popup. I agree → saved on the account (user_metadata.terms_version / privacy_version / terms_accepted_at; sign-up
   saves the same, login.html). Read them first → terms.html (the legal pages never ask). Not now → asked again next visit. */
function _navTermsCheck(user) {
  if (!user || typeof MSF_LEGAL === 'undefined' || user.user_metadata?.terms_version === MSF_LEGAL.terms) return;
  if (/(login|terms|privacy|cookies|about|contact|admin|cabinet)\.html$/.test(location.pathname)) return;
  try { if (sessionStorage.getItem('msf_terms_later')) return; } catch {}
  mssAfterLaunch().then(() => setTimeout(async () => {
    if (MSSDialog.top()) return;                                   // something else is asking — next page
    const v = await showConfirm({ title: 'Our Terms and Privacy Policy',
      message: 'MyScreenFolio now has Terms of Service, a Privacy Policy and a Cookie Policy: the rules, what we collect and why, and the choices you have. Please read them — choosing “I agree” means you accept them.',
      confirmText: 'I agree', cancelText: 'Not now', altText: 'Read them first', iconName: 'shield', danger: false });
    if (v === 'alt') { location.href = 'terms.html'; return; }
    if (v !== true) { try { sessionStorage.setItem('msf_terms_later', '1'); } catch {} return; }
    const { error } = await sb.auth.updateUser({ data: { terms_version: MSF_LEGAL.terms, privacy_version: MSF_LEGAL.privacy, terms_accepted_at: new Date().toISOString() } });
    showToast(error ? 'Couldn’t save that — we’ll ask again next time.' : 'Thanks — you’ve agreed to the Terms and Privacy Policy.', error ? 'err' : 'ok');
  }, 1200));
}

/* Guest-friendly init — the same; pages that work signed out (Home, Discover, titles, people…) */
async function initPageGuest(onReady) {
  injectChrome();
  const user = await getCurrentUser();
  if (!user) {
    _shellGuest();
    try { if (typeof onReady === 'function') await onReady(null, null); }
    finally { _mssRestoreScroll(); }
    return;
  }
  document.documentElement.classList.remove('mss-guest');
  await _runPageReady(user, onReady);
}

/* ══════════════════════════════════════════════════════════════════════
   The shell — everything around every page (.claude/plans/shell-guest-entry-plan.md)
     Header (desktop ≥1200px): logo · Home · Discover · Library ▾ · Social ▾ · You ▾ ·
       search · Create (+) · Messages · Notifications · avatar. The names never change;
       only the olive pill moves, decided from the page's URL before the first paint.
     Menus: one panel joined under the header, as wide as it — links with counts on the
       left, a live card on the right (_dm*). Hover (short delay), click / tap, keyboard.
     Account (avatar): a menu on desktop, a full page on phones (shellAccountHTML).
     Phones / tablets: the top bar (wayfinding · search · bell · avatar), the bottom bar (Home · Discover ·
       Library · Social · You — the last three open their section sheet), the round Create button.
     Guests (owner, 19 Nov 2026): every menu opens as usual; the few pages that need an account (MSS_JOIN_PAGES,
       config.js) wear a small lock, and their links open the Join panel instead (_navJoinClick).
     Footer: link columns, the Light / Dark switch, credits and the TMDB notice.
══════════════════════════════════════════════════════════════════════ */
// The Library menu (owner, 14 Nov 2026): the four kinds in one group, your Library, Episodes and Diary in the other (Episodes moved from You, 16 Nov 2026) —
// Watched is a tab on the Library pages now, not a page of its own
const LIBRARY_PAGES = [
  ['By type', [
    { href: 'movies.html',    icon: 'film',      label: 'Movies',   count: 'movies',   card: 'movie',    info: 'Watchlist to rated' },
    { href: 'tv-shows.html',  icon: 'tv',        label: 'TV Shows', count: 'tv',       card: 'tv',       info: 'Watching, waiting, finished' },
    { href: 'anime.html',     icon: 'animeFace', label: 'Anime',    count: 'anime',    card: 'anime',    info: 'Series and films' },
    { href: 'cartoons.html',  icon: 'crown',     label: 'Cartoons', count: 'cartoons', card: 'cartoons', info: 'Animated shows and films' },
  ]],
  ['Your library', [
    { href: 'library.html',   icon: 'list',      label: 'Library',  count: 'all',      card: 'any',      info: 'Everything, in one place', desc: 'All your titles by status', also: ['season.html', 'episode.html'] },   // a season / an episode: Library lit (Season & Episode redesign)
    { href: 'episodes.html',  icon: 'episodes',  label: 'Episodes',  n: 'eps', card: 'eps',      info: 'Ratings and charts', desc: 'Your episode ratings' },
    { href: 'diary.html',     icon: 'calendar',  label: 'Diary',                       card: 'diary',    info: 'Every watch, by day', desc: 'Every watch, day by day' },
  ]],
];
const _VIEWS = page => [['Mine', page], ['Friends', `${page}?view=friends`], ['Community', `${page}?view=community`]];
const SHELL_TABS = [
  { k: 'home', label: 'Home', icon: 'home', href: 'index.html' },
  { k: 'discover', label: 'Discover', icon: 'compass', href: 'discover.html', also: ['discover-list.html', 'browse.html'] },
  // sheet: the phone / tablet section sheet (Mobile nav v2) — the same pages, laid out as cards, rows or a 2-column grid
  { k: 'lib', label: 'Library', icon: 'grid', href: 'library.html', groups: LIBRARY_PAGES, sheet: { sub: 'Everything you track', groups: [
    [null, 'cards', ['library.html', 'episodes.html', 'diary.html']],
    ['By type', 'grid', ['tv-shows.html', 'movies.html', 'anime.html', 'cartoons.html']]] } },
  { k: 'social', label: 'Social', icon: 'users', href: 'friends.html', sheet: { sub: 'Friends and things to do together', groups: [
    ['People', 'rows', ['friends.html', 'activity.html', 'messages.html']],
    ['Together', 'grid', ['compare.html', 'blend.html', 'movie-night.html', 'challenges.html', 'polls.html', 'episode-chat.html']]] }, groups: [
    ['People', [
      { label: 'Friends', icon: 'users', href: 'friends.html', count: 'friends', req: true, card: 'friends', info: 'Requests and suggestions', desc: 'Friends, following, followers' },
      { label: 'Activity', icon: 'activity', href: 'activity.html', card: 'lately', info: 'What friends watched and rated', desc: 'What friends just did' },
      { label: 'Compare', icon: 'compare', href: 'compare.html', card: 'compare', info: 'Your taste side by side' },
      { label: 'Blend', icon: 'shuffle', href: 'blend.html', card: 'blend', info: 'Picks you’ll both enjoy' },
    ]],
    ['Together', [
      { label: 'Movie Night', icon: 'film', href: 'movie-night.html', card: 'night', waiting: 'night_invites', info: 'Pick something together' },
      { label: 'Challenges', icon: 'trophy', href: 'challenges.html', card: 'challenge', info: 'Race to a watching goal' },
      { label: 'Polls', icon: 'poll', href: 'polls.html', card: 'poll', info: 'Ask what to watch next' },
      { label: 'Episode Chat', icon: 'comment', href: 'episode-chat.html', card: 'epchat', info: 'Talk about episodes' },
      { label: 'Messages', icon: 'inbox', href: 'messages.html', msg: true, sep: true, card: 'msgs', info: 'Your chats', desc: 'Chats and recommendations' },
    ]],
  ] },
  // You (owner, 16 Nov 2026): your profile, medals and export in one group, Lists and Notes in the other (Made by you — Tier lists will join it)
  { k: 'you', label: 'You', icon: 'user', href: 'profile.html', sheet: { account: true, groups: [
    [null, 'rows', ['profile.html', 'lists.html', 'notes.html']],
    [null, 'rows', ['cabinet.html', 'export.html']]] }, groups: [
    ['Your profile', [
      { label: 'Profile', icon: 'user', href: 'profile.html', card: 'you', info: 'Stats, favourites, taste', desc: 'Overview, library, showcase' },
      { label: 'Medals', icon: 'trophy', href: 'cabinet.html', n: 'medals', card: 'medals', info: 'Achievements you’ve earned', desc: 'Achievement Cabinet' },
      { label: 'Export', icon: 'download', href: 'export.html', card: 'export', info: 'Cards, PDFs, backups', desc: 'PDFs, images, backups' },
    ]],
    ['Made by you', [
      { label: 'Lists', icon: 'layers', href: 'lists.html', sub: _VIEWS('lists.html'), n: 'lists', card: 'list', info: 'Yours, friends’, community', desc: 'Yours, friends’, community' },
      { label: 'Notes', icon: 'notebook', href: 'notes.html', sub: _VIEWS('notes.html'), n: 'notes', card: 'note', info: 'Your thoughts on what you watch', desc: 'Everything you wrote' },
    ]],
  ] },
];
const _shellItems = t => (t?.groups || []).flatMap(([, items]) => items);
// Social in three sections — People · Together · Messages (the desktop tab bar, social-nav.js)
const _socialSections = t => {
  const [people = [], together = []] = (t?.groups || []).map(([, items]) => items);
  return [{ label: 'People', icon: 'users', items: people }, { label: 'Together', icon: 'film', items: together.filter(it => !it.msg) },
    { label: 'Messages', icon: 'inbox', items: together.filter(it => it.msg) }];
};
const _SHELL_YOU_PAGES = ['notifications.html', 'settings.html', 'admin.html'];

/* Where a URL sits: { tab, href (the item it is), sub (the Mine / Friends / Community view) } */
function _mtabKey(u) {
  const page = u.pathname.split('/').pop() || 'index.html';
  if (page === 'lists.html' || page === 'notes.html') { const v = mssViewOf(u.search); return v === 'mine' ? page : `${page}?view=${v}`; }
  return page;
}
function shellWhere(href = location.href, viaRef) {
  const key = _mtabKey(new URL(href, location.href)), page = key.split('?')[0];
  for (const t of SHELL_TABS) {
    if (!t.groups && (t.href === key || t.also?.includes(page))) return { tab: t.k, href: t.href, sub: null };
    for (const it of _shellItems(t)) {
      const s = it.sub?.find(([, h]) => h === key);
      if (s) return { tab: t.k, href: it.href, sub: s[1] };
      if (it.href === key) return { tab: t.k, href: it.href, sub: it.sub ? it.sub[0][1] : null };
      if (it.also?.includes(page)) return { tab: t.k, href: null, sub: null };   // the tab lit, no page of it marked (no switcher)
    }
  }
  if (_SHELL_YOU_PAGES.includes(page)) return { tab: 'you', href: null, sub: null };
  // a title, a person… → the tab of the page you came from (this site's previous page, else the last one this visit);
  // nothing known → no tab lit (owner, 13 Nov 2026: never an unrelated one)
  let last = null;
  try {
    const ref = document.referrer && new URL(document.referrer);
    if (!viaRef && ref && ref.origin === location.origin && ref.href !== location.href) { const w = shellWhere(ref.href, true); if (w.tab) last = w.tab; }
  } catch {}
  if (!last) { try { last = sessionStorage.getItem('mss_tab'); } catch {} }
  return { tab: SHELL_TABS.some(t => t.k === last) ? last : null, href: null, sub: null };
}

/* ── Building it (before the page's first paint) ── */
function injectChrome() {
  const where = shellWhere();
  const ownSearch = ['index.html', 'discover.html'].includes(_mtabKey(new URL(location.href)));   // Home and Discover have their own search field: none in the bar
  try { if (where.tab) sessionStorage.setItem('mss_tab', where.tab); } catch {}
  // signed in or not, as far as this device knows (splash.js) — corrected once auth answers (_shellGuest)
  document.documentElement.classList.toggle('mss-guest', window.mssSignedInHint === false);

  const navEl = document.createElement('nav');
  navEl.id = 'mainNav';
  navEl.setAttribute('aria-label', 'Site');
  navEl.innerHTML = `
    <div class="nav-top" id="navTop">
      <div class="ntop-l" id="ntopL">${_ntopLeftHTML(where)}</div>
      <div class="nav-top-controls">
        ${ownSearch ? '' : `<button type="button" class="ntop-btn" id="navSearchBtn" onclick="mssOpenSearch()" aria-label="Search" aria-haspopup="dialog">${icon('search', 18)}</button>`}
        <button type="button" class="ntop-btn notif-btn nav-auth-only" onclick="toggleNotifPanel(event)" aria-label="Notifications">
          ${icon('bell', 18)}<span class="notif-badge" data-notif-badge></span></button>
        <button type="button" class="nav-top-user nav-auth-only" id="navTopUser" onclick="shellAccountPage()" aria-label="Your account" aria-haspopup="dialog">
          <span class="nav-user-avatar" id="navUserInitialMobile">?</span></button>
        <a class="nav-top-signin guest-only" href="login.html">Sign in</a>
      </div>
    </div>
    <div class="nav-inner" id="dnav">
      <a class="nav-logo" href="index.html" aria-label="MyScreenFolio home">${mssLogoSVG('nav-logo-img')}</a>
      <ul class="dnav-tabs" aria-label="Main">${_shellTabsHTML(where)}</ul>
      <div class="nav-right">
        ${ownSearch ? '' : `<div class="shs-wrap" id="shsWrap">
          <span class="shs-ic" aria-hidden="true">${icon('search', 15)}</span>
          <input type="text" id="globalSearch" placeholder="Search titles, people…" aria-label="Search titles and people" autocomplete="off" spellcheck="false">
          <kbd class="shs-key" aria-hidden="true">/</kbd>
        </div>`}
        <button type="button" class="nav-add-btn nav-auth-only" id="navCreate" onclick="shellCreate(event)" aria-haspopup="menu" aria-expanded="false">${icon('plus', 15)}<span>Add</span></button>
        <a class="nav-ic-btn notif-btn notif-btn-desktop nav-auth-only nav-msg-btn" href="messages.html" aria-label="Messages">${icon('inbox', 17)}<span class="notif-badge" data-msg-badge></span></a>
        <button type="button" class="nav-ic-btn notif-btn notif-btn-desktop nav-auth-only" onclick="toggleNotifPanel(event)" aria-label="Notifications">${icon('bell', 17)}<span class="notif-badge" data-notif-badge></span></button>
        <button type="button" class="nav-user-btn nav-auth-only" id="navUserBtn" aria-label="Your account" aria-haspopup="true" aria-expanded="false" aria-controls="acctMenu">
          <span class="nav-user-avatar" id="navUserInitial">?</span><span class="nav-chevron" aria-hidden="true">${icon('chevdown', 12)}</span></button>
        <a class="nav-guest-btn guest-only" href="login.html">Sign in</a>
        <a class="nav-guest-btn is-main guest-only" href="login.html#signup">Create account</a>
        <div class="acct-menu" id="acctMenu" hidden></div>
      </div>
      <div class="dnav-mega" id="dnavMega" hidden><div class="dnav-mega-in" id="dnavMegaIn"></div></div>
    </div>`;

  const bottomNavEl = _bnavEl(where);
  _navPortraitOnPhones();

  /* ── CONFIRM DIALOG ── */
  const confirmEl = document.createElement('div');
  confirmEl.className = 'confirm-overlay';
  confirmEl.id = 'confirmOverlay';
  confirmEl.innerHTML = `
    <div class="confirm-card is-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMsg">
      <span class="cf-handle" aria-hidden="true"></span>
      <div class="cf-head">
        <div class="confirm-icon" id="confirmIcon" aria-hidden="true"></div>
        <div class="cf-text">
          <div class="confirm-title" id="confirmTitle">Are you sure?</div>
          <div class="confirm-msg"   id="confirmMsg"></div>
        </div>
      </div>
      <div class="confirm-choices" id="confirmChoices" role="radiogroup" aria-labelledby="confirmTitle" hidden></div>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel confirm-alt" id="confirmAlt" hidden></button>
        <button type="button" class="confirm-cancel" id="confirmCancel">Cancel</button>
        <button type="button" class="confirm-ok"     id="confirmOk">Confirm</button>
      </div>
    </div>`;

  /* ── TOAST ── */
  // (one may already be up — e.g. a delete's Undo carried over from the page before)
  const toastEl = document.getElementById('toast') || Object.assign(document.createElement('div'), { className: 'toast', id: 'toast' });

  const first = document.body.firstChild;
  document.body.insertBefore(toastEl,    first);
  document.body.insertBefore(confirmEl,  first);
  document.body.insertBefore(bottomNavEl, first);
  document.body.insertBefore(_shellFabEl(), first);
  document.body.insertBefore(navEl,      first);
  _navInitBackToTop();
  document.body.appendChild(_shellFooterEl());

  _ntopInit();
  _bnavLongInit(bottomNavEl);
  _dmInit();
  _acctInit();
  // Search: the header field on every page but Home and Discover (they have their own); shell-search.js does the rest
  if (!ownSearch) mssLoadScript('js/shell-search.js').then(() => { if (typeof MSSSearch !== 'undefined') MSSSearch.mount(document.getElementById('globalSearch')); });
}

// Search: the header field (desktop), the full-page search (phones) — shell-search.js
function mssOpenSearch(q) { mssLoadScript('js/shell-search.js').then(() => { if (typeof MSSSearch !== 'undefined') MSSSearch.open(q); }); }

// A guest's lock on a page that needs an account (its link opens the Join panel — _navJoinClick)
const _navLockHTML = (href, cls) => typeof MSS_JOIN_PAGES !== 'undefined' && MSS_JOIN_PAGES[href.split('?')[0]]
  ? `<span class="${cls} guest-only" aria-hidden="true">${icon('lock', 12)}</span><span class="sr-only guest-only">, needs an account</span>` : '';
function _navJoinClick(ev) {
  if (!_isGuest() || ev.defaultPrevented || ev.button > 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  const a = ev.target.closest('a[href]');
  if (!a || a.target === '_blank') return;
  let url; try { url = new URL(a.getAttribute('href'), location.href); } catch { return; }
  const file = url.pathname.split('/').pop(), topic = url.origin === location.origin && MSS_JOIN_PAGES[file];
  if (!topic) return;
  ev.preventDefault(); ev.stopPropagation();
  if (typeof _dmHide === 'function' && _dmCur) _dmHide();
  if (typeof _ntopDropHide === 'function') _ntopDropHide();
  const sheet = !!_nsh; if (sheet) shellSheetClose();
  setTimeout(() => mssJoin({ topic, href: file }), sheet ? 220 : 0);   // the sheet goes first, so the panel lands on the page
}
document.addEventListener('click', _navJoinClick, true);
function _shellTabsHTML(w) {
  return SHELL_TABS.map(t => {
    const on = t.k === w.tab;
    if (!t.groups) return `<li><a class="dnav-tab${on ? ' active' : ''}" href="${t.href}"${on ? ` aria-current="${location.pathname.endsWith('/' + t.href) || (t.k === 'home' && /\/$/.test(location.pathname)) ? 'page' : 'true'}"` : ''}>${t.label}</a></li>`;
    return `<li><button type="button" class="dnav-tab${on ? ' active' : ''}" id="dnavTab-${t.k}" data-tab="${t.k}" aria-expanded="false" aria-controls="dnavMega"${on ? ' aria-current="true"' : ''}>
      <span>${t.label}</span><span class="dnav-chev" aria-hidden="true">${icon('chevdown', 12)}</span></button></li>`;
  }).join('');
}

/* ── Back to top: a round olive button bottom-right once you've scrolled a good way and start back up ── */
function _navInitBackToTop() {
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
  let lastY = window.scrollY, upFor = 0, shown = false;
  const show = on => {
    if (on === shown) return;
    shown = on;
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
}

/* ── Phones stay upright ──
   Tablets (iPad) turn both ways. A phone turned sideways gets a "turn it
   back" screen (style.css .mss-rotate — phone-sized landscape only); the
   installed app on Android also locks itself upright where the browser allows. */
function _navPortraitOnPhones() {
  const el = document.createElement('div');
  el.className = 'mss-rotate';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="mss-rotate-ic" aria-hidden="true">${icon('refresh', 30)}</div>
    <b>Turn your phone upright</b><span>MyScreenFolio works in portrait on phones.</span>`;
  document.body.appendChild(el);
  const phone = Math.min(screen.width, screen.height) < 600;
  const app = matchMedia('(display-mode: standalone)').matches;
  if (phone && app) screen.orientation?.lock?.('portrait').catch(() => {});
}

/* Only one header panel at a time: opening a menu, search, notifications, the account menu
   or the Create sheet closes the others first. */
function _navCloseAll(except) {
  if (except !== 'add' && typeof MSSPopover !== 'undefined') MSSPopover.close();
  if (except !== 'user') _acctHide();
  if (except !== 'search' && typeof MSSSearch !== 'undefined') MSSSearch.close();
  if (except !== 'notif' && typeof closeNotifPanel === 'function') closeNotifPanel();
  if (except !== 'mega') _dmHide();
  if (except !== 'ntop') _ntopDropHide();
}

/* ═════════ Desktop menus: Library · Social · You ═════════ */
let _dmCur = null, _dmOpenT = 0, _dmCloseT = 0, _dmAt = 0, _dmPick = null;
let _dmPinned = false;    // opened (or kept) with a click: stays until a click outside, Esc or the tab again — not when the pointer leaves
let _shellSum = null;     // shell_summary() (117): counts + the live cards' titles

function _dmInit() {
  const bar = document.getElementById('dnav'), mega = document.getElementById('dnavMega');
  if (!bar || !mega) return;
  bar.querySelectorAll('button.dnav-tab').forEach(t => {
    const k = t.dataset.tab;
    t.addEventListener('click', ev => {
      ev.stopPropagation();
      if (_dmCur === k && _dmPinned) { _dmHide(); return; }               // a second click closes it
      if (_dmCur !== k) _dmShow(k);
      _dmPinned = true;                                                   // a click keeps it open (also one opened by hovering)
      if (ev.detail === 0) _dmFocus(0);                                   // Enter / Space → into the menu
    });
    t.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (_dmCur !== k) _dmShow(k); _dmFocus(0); }
      if (ev.key === 'ArrowUp' && _dmCur === k) { ev.preventDefault(); _dmFocus(-1); }
    });
    t.addEventListener('pointerenter', ev => {
      if (ev.pointerType !== 'mouse') return;
      clearTimeout(_dmCloseT); clearTimeout(_dmOpenT);
      if (_dmCur !== k) _dmOpenT = setTimeout(() => _dmShow(k), _dmCur ? 80 : 150);
    });
    t.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { clearTimeout(_dmOpenT); _dmLeave(); } });
  });
  mega.addEventListener('pointerenter', () => clearTimeout(_dmCloseT));
  mega.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') _dmLeave(); });
  mega.addEventListener('click', ev => ev.stopPropagation());
  document.addEventListener('click', () => _dmHide());
  // the live card follows the row you point at or move to
  const pick = ev => { const a = ev.target.closest?.('[data-card]'); if (a) _dmCard(a.dataset.card); };
  mega.addEventListener('pointerover', pick);
  mega.addEventListener('focusin', pick);
  mega.addEventListener('keydown', ev => {
    const links = [...mega.querySelectorAll('.dm-link, .dm-card a, .dm-card button, .shp-acts a')], i = links.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); const k = _dmCur; _dmHide(); document.getElementById('dnavTab-' + k)?.focus(); return; }
    if (i < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? links.length - 1 : (i + (ev.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[n].focus();
  });
  // leaving the menu and its tab with Tab closes it
  bar.addEventListener('focusout', ev => {
    if (!_dmCur) return;
    const to = ev.relatedTarget;
    if (to && (mega.contains(to) || to.id === 'dnavTab-' + _dmCur)) return;
    setTimeout(() => { if (!mega.contains(document.activeElement) && document.activeElement?.id !== 'dnavTab-' + _dmCur) _dmHide(); }, 0);
  });
}
function _dmLeave() { clearTimeout(_dmCloseT); if (_dmPinned) return; _dmCloseT = setTimeout(() => { if (!document.getElementById('dnavMega')?.contains(document.activeElement)) _dmHide(); }, 250); }
function _dmFocus(i) {
  const links = [...document.querySelectorAll('#dnavMega .dm-link, #dnavMega .shp-acts a')];
  (i < 0 ? links[links.length - 1] : links[i])?.focus();
}
function _dmShow(k) {
  const t = SHELL_TABS.find(x => x.k === k), mega = document.getElementById('dnavMega');
  if (!t?.groups || !mega) return;
  clearTimeout(_dmCloseT);
  if (mega.hidden) _navCloseAll('mega');
  _dmCur = k; _dmAt = Date.now();
  document.querySelectorAll('#dnav button.dnav-tab').forEach(b => { const on = b.dataset.tab === k; b.classList.toggle('open', on); b.setAttribute('aria-expanded', on); });
  mega.setAttribute('aria-labelledby', 'dnavTab-' + k);
  mega.setAttribute('role', 'region');
  mega.dataset.tab = k;
  document.getElementById('dnavMegaIn').innerHTML = _dmHTML(t);
  if (_isGuest()) document.getElementById('dmCard').innerHTML = _dmGuestCard(k);
  else { _dmPick = null; _dmCard(_DM_FIRST[k]); if (!_shellSum) _shellSummary(); }
  mega.hidden = false;
  _dmPlace();
  requestAnimationFrame(() => mega.classList.add('open'));
}
const _DM_FIRST = { lib: 'any', social: 'lately', you: 'you' };
// The panel floats a little under the bar, its left edge lined up with the tab that opened it
// (kept 16px inside the bar on both sides, so "You" on the right slides back in)
function _dmPlace() {
  const mega = document.getElementById('dnavMega'), bar = document.getElementById('dnav');
  if (!mega || !bar) return;
  const box = (mega.offsetParent || bar).getBoundingClientRect();
  const tab = document.querySelector(`#dnav button.dnav-tab[data-tab="${_dmCur}"]`);
  const want = tab ? tab.getBoundingClientRect().left - box.left : (box.width - mega.offsetWidth) / 2;
  mega.style.left = Math.round(Math.max(16, Math.min(want, box.width - mega.offsetWidth - 16))) + 'px';
}
addEventListener('resize', () => { if (_dmCur) _dmPlace(); });
function _dmHide() {
  clearTimeout(_dmOpenT);
  const mega = document.getElementById('dnavMega');
  if (!mega || mega.hidden) return;
  mega.classList.remove('open'); mega.hidden = true; _dmCur = null; _dmPinned = false;
  document.querySelectorAll('#dnav button.dnav-tab').forEach(b => { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
}
// The menu's columns of rows — the desktop menu and the phone top bar's ▾ menu (pre: their id prefix)
function _dmColsHTML(t, pre) {
  const w = shellWhere();
  return t.groups.map(([h, items], gi) => `<div class="dm-col${items.length > 5 ? ' is-split' : ''}" style="--rows:${Math.ceil(items.length / 2)}"${h ? ` role="group" aria-labelledby="${pre}H-${t.k}-${gi}"` : ''}>
      ${h ? `<div class="dm-h" id="${pre}H-${t.k}-${gi}">${h}</div>` : ''}
      <ul class="dm-list">${items.map(it => {
        const here = w.href === it.href;
        return `<li${it.sep ? ' class="dm-sep"' : ''}><a class="dm-link${it.msg ? ' nav-msg-btn' : ''}${here ? ' here' : ''}" href="${it.href}" data-card="${it.card || t.k}"${here ? ' aria-current="page"' : ''}>
          <span class="dm-ic" aria-hidden="true">${icon(it.icon, 16)}</span><span class="dm-name"><b>${it.label}${_isGuest() ? _navLockHTML(it.href, 'dm-lock') : ''}</b><small>${it.info}</small></span>
          ${it.count ? `<span class="dm-n" data-count="${it.count}">${_dmCount(it.count)}</span>` : ''}${it.msg ? '<span class="notif-badge dm-badge" data-msg-badge></span>' : ''}
          ${it.req ? '<span class="nav-badge dm-req" data-req-badge hidden></span>' : ''}${here ? `<span class="dm-here" aria-hidden="true">${icon('check', 16)}</span>` : ''}</a></li>`;
      }).join('')}</ul></div>`).join('');
}
function _dmHTML(t) {
  return `<div class="dm-cols" style="--cols:${t.groups.length}">${_dmColsHTML(t, 'dm')}</div><div class="dm-card" id="dmCard"></div>`;
}
const _dmCount = k => { const S = _shellSum; if (!S) return ''; const n = k === 'friends' ? S.friends : S.counts?.[k]; return n == null ? '' : `<span class="sr-only">, </span>${Number(n).toLocaleString(MSSI18n.locale)}`; };
function _dmPaintCounts() {
  document.querySelectorAll('#dnavMega [data-count], #ntopDrop [data-count]').forEach(el => { el.innerHTML = _dmCount(el.dataset.count); });
  _navMsgBadge(_navMsgCount); _bnavDotPaint();
}

// shell_summary (117), kept for 2 minutes this session; anything you log drops it (mss:watched / progress)
async function _shellSummary(force) {
  const uid = window._navUser?.id;
  if (!uid) return null;
  if (!force && !_shellSum) try { const c = JSON.parse(sessionStorage.getItem('mss_shell_sum') || 'null'); if (c?.uid === uid && Date.now() - c.at < 120000) _shellSum = c.v; } catch {}
  if (_shellSum && !force) { _dmPaintCounts(); _dmRefresh(); return _shellSum; }
  try {
    const { data, error } = await sb.rpc('shell_summary');
    if (error) throw error;
    _shellSum = data || {};
    try { sessionStorage.setItem('mss_shell_sum', JSON.stringify({ uid, at: Date.now(), v: _shellSum })); } catch {}
  } catch (err) { console.warn('Menu summary:', err?.message || err); _shellSum = _shellSum || null; }
  _dmPaintCounts();
  _dmRefresh();
  return _shellSum;
}
function _shellSumDrop() { _shellSum = null; try { sessionStorage.removeItem('mss_shell_sum'); } catch {} }
['mss:watched', 'mss:progress', 'mss:library-changed'].forEach(n => document.addEventListener(n, () => { _shellSumDrop(); if (_dmCur) _shellSummary(true); }));
function _dmRefresh() {
  if (!_dmCur || _isGuest()) return;
  _dmPaintCounts();
  const k = _dmPick; _dmPick = null; _dmCard(k || _DM_FIRST[_dmCur]);
}

/* The live card on the right */
const _dmPoster = (url, title, cls = 'dm-poster') => { const u = safeURL(url); return `<span class="${cls}" aria-hidden="true">${u ? `<img src="${u}" alt="" loading="lazy">` : escHTML((title || '?')[0].toUpperCase())}</span>`; };
const _dmTitleHref = e => e?.tmdb_id && e?.tmdb_type ? `title.html?type=${encodeURIComponent(e.tmdb_type)}&id=${encodeURIComponent(e.tmdb_id)}` : 'library.html';
function _dmCard(kind) {
  const box = document.getElementById('dmCard');
  if (!box || kind === _dmPick) return;
  _dmPick = kind;
  const S = _shellSum;
  if (!S && !['lately', 'msgs', 'export', 'night', 'challenge', 'poll', 'epchat', 'medals'].includes(kind)) {     // loading: the site's skeleton lines (.skel)
    box.innerHTML = `<div class="dm-card-in" aria-busy="true"><span class="skel skel-line" style="width:40%"></span><div class="dm-title-row"><span class="dm-poster skel"></span>
      <span class="dm-tx" style="flex:1"><span class="skel skel-line" style="width:70%"></span><span class="skel skel-line" style="width:45%"></span></span></div></div>`;
    _dmPick = null; return;
  }
  const W = S?.watching || {};
  const html = ({
    any: () => S.watching_any && _dmWatchCard(S.watching_any),
    tv: () => _dmCatCard('tv'), anime: () => _dmCatCard('anime'), cartoons: () => _dmCatCard('cartoons'), movie: () => _dmCatCard('movies'),
    diary: () => S.diary && _dmDiaryCard(S.diary),
    lately: _dmFriendsLately, friends: _dmFriendsCard, compare: () => _dmFacesCard('compare'), blend: () => _dmFacesCard('blend'),
    night: _dmNightCard, challenge: _dmChallengeCard, poll: _dmPollCard, epchat: _dmEpChatCard, msgs: _dmMsgsCard,
    you: _dmYouCard, list: _dmListCard, note: _dmNoteCard, eps: _dmEpsCard, medals: _dmMedalsCard, export: _dmExportCard,
  }[kind] || (() => ''))();
  box.innerHTML = html || (['any', 'diary'].includes(kind)
    ? (S.watching_any ? _dmWatchCard(S.watching_any) : `<div class="dm-card-in dm-empty">${icon('play', 18)}<b>Nothing in progress yet</b>
      <span>Start a show and it waits for you here.</span><button type="button" class="dm-btn is-main" onclick="_dmHide();openAddModal()">${icon('plus', 14)} Add a title</button></div>`) : '');
  mssFillEpNames(box);
  _dmBackdrops(box);
  _dmTopPosters(box);
}
/* TV Shows / Movies / Anime / Cartoons: only that category — what you're watching, else the last one you
   finished, else the newest on your Watchlist; with none of it yet, its Top 250 like Home's Explore cards */
function _dmCatCard(cat) {
  const S = _shellSum, W = S.watching || {}, P = S.paused_by || {}, D = S.done_by || {}, Q = S.queue_by || {};
  if (cat === 'movies' && S.up_next_movie) return _dmMovieCard(S.up_next_movie);
  if (W[cat]) return _dmWatchCard(W[cat]);
  if (P[cat]) return _dmPausedCard(P[cat]);
  if (D[cat]) return _dmDoneCard(D[cat]);
  if (Q[cat]) return _dmQueueCard(Q[cat]);
  return _dmTopCard(cat);
}
function _dmQueueCard(e) {
  const movie = e.cat === 'movies' || e.tmdb_type === 'movie';
  return _dmHero(e, e.status === 'up_next' ? 'Up next' : 'On your Watchlist', `${_dmHeroTitle(_dmTitleHref(e), e.title)}
      <span class="dm-hero-sub">${escHTML(CAT_META[e.cat]?.label || (movie ? 'Movie' : 'TV Show'))}${e.year ? ' · ' + escHTML(String(e.year).slice(0, 4)) : ''}</span>`,
    `<button type="button" class="dm-btn is-main" onclick="_dmStart(this, '${escHTML(e.id)}')">${icon('play', 13)} Start watching</button><a class="dm-btn is-ghost" href="${_dmTitleHref(e)}">Open</a>`);
}
function _dmPausedCard(e) {
  const total = _dmTotal(e), done = Number(e.watched) || 0;
  return _dmHero(e, 'Taking a break', `${_dmHeroTitle(_dmTitleHref(e), e.title)}
      <span class="dm-hero-sub">${+e.episode ? `Stopped at S${Number(e.season) || 1} E${Number(e.episode)}` : 'Paused'}${total ? ` · ${done} of ${total} episodes` : ''}</span>`,
    `<button type="button" class="dm-btn is-main" onclick="_dmStart(this, '${escHTML(e.id)}')">${icon('play', 13)} Resume</button><a class="dm-btn is-ghost" href="${_dmTitleHref(e)}">Open</a>`);
}
// Start watching (from the Watchlist) / Resume (Taking a Break) — the same changes as the category pages' buttons
async function _dmStart(btn, id) {
  const S = _shellSum || {}, e = [...Object.values(S.queue_by || {}), ...Object.values(S.paused_by || {})].find(x => x?.id === id);
  if (!e || btn.disabled) return;
  btn.disabled = true;
  const movie = e.cat === 'movies' || e.ratings?._media_type === 'movie', fresh = e.status === 'queue';
  const updates = fresh && !movie ? { status: 'watching', season: e.season || 1, episode: 0, watched: 0 } : { status: 'watching' };
  try {
    await updateProgress(e.id, window._navUser.id, updates);
    showToast(e.status === 'paused' ? 'Resumed!' : 'Moved to Currently Watching!');
    if (!movie && typeof _refreshTmdbSeasonData === 'function') _refreshTmdbSeasonData(Object.assign(e, updates), window._navUser.id);
    document.dispatchEvent(new CustomEvent('mss:progress', { detail: { entry: e } }));
  } catch (err) { console.error(err); showToast('Couldn’t start it — try again.', 'err'); btn.disabled = false; }
}
const _DM_CAT_PAGE = { tv: 'tv-shows.html', movies: 'movies.html', anime: 'anime.html', cartoons: 'cartoons.html' };
// the same lists, colours and saved posters as Home's Explore cards (index.html, 'mss_explore_posters_v1')
const _DM_TOP = { tv: ['top250_shows', 'Top 250 Shows', 'the best TV ever made', '#2F5F8A', '#0C1D2E'], movies: ['top250_movies', 'Top 250 Movies', 'the best movies ever', '#9C3D1C', '#2E1007'],
  anime: ['top250_anime', 'Top 250 Anime', 'the best anime', '#7A3E78', '#240F24'], cartoons: ['top250_cartoons', 'Top 250 Cartoons', 'the best cartoons', '#3F7A6E', '#0D2520'] };
const _DM_XP_STORE = 'mss_explore_posters_v1';
function _dmTopCard(cat) {
  const [key, title, what, a, b] = _DM_TOP[cat];
  return `<a class="dm-card-in dm-top" href="discover-list.html?list=${key}&title=${encodeURIComponent(title)}" style="--xp-a:${a};--xp-b:${b}" data-top="${key}">
      <span class="dm-top-num" aria-hidden="true">250</span>
      <span class="dm-eyebrow">Nothing here yet</span>
      <span class="dm-top-t">${title}</span>
      <span class="dm-top-s">Start with ${what}, ranked.</span>
      <span class="dm-btn is-ghost">Explore ${icon('arrowRight', 13)}</span>
      <span class="dm-top-fan" aria-hidden="true"><span class="dm-top-p"></span><span class="dm-top-p"></span><span class="dm-top-p"></span></span></a>`;
}
async function _dmTopPosters(box) {
  const card = box.querySelector('[data-top]'); if (!card) return;
  const key = card.dataset.top, fill = list => card.isConnected && card.querySelectorAll('.dm-top-p').forEach((p, i) => { const u = safeURL(list[i]); p.innerHTML = u ? `<img src="${u}" alt="">` : ''; });
  let saved = null; try { saved = JSON.parse(localStorage.getItem(_DM_XP_STORE) || '{}')[key]; } catch {}
  if (saved?.posters?.length) { fill(saved.posters); return; }
  try {   // not seen on Home yet: ask Discover for it, and keep it for Home too
    await mssLoadScript('js/discover-categories.js');
    const items = await getDiscoverCategory(key)?.fetch(1);
    const posters = (items || []).map(it => it.poster_url).filter(u => safeURL(u)).slice(0, 3);
    if (!posters.length) return;
    try { const all = JSON.parse(localStorage.getItem(_DM_XP_STORE) || '{}'); all[key] = { t: Date.now(), posters }; localStorage.setItem(_DM_XP_STORE, JSON.stringify(all)); } catch {}
    fill(posters);
  } catch {}
}
// Library-style cards: the title's backdrop (wide scene art — MSSBackdrop, so a chosen one shows)
function _dmBackdrops(box) {
  box.querySelectorAll('img[data-bd]').forEach(img => MSSBackdrop.path(img.dataset.bd).then(path => {
    if (!path || !img.isConnected) return;
    img.onload = () => img.classList.add('in'); img.src = `https://image.tmdb.org/t/p/w780${path}`;
  }));
}
function _dmNext(e) {    // the episode after where you are: { s, e } (null when we don't know)
  const b = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number).filter(n => n > 0) : [];
  const s = Number(e.season) || 1, ep = Number(e.episode) || 0;
  if (b.length && ep >= (b[s - 1] || 0)) return s < b.length ? { s: s + 1, e: 1 } : null;
  return { s, e: ep + 1 };
}
function _dmTotal(e) { const b = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number).filter(n => n > 0) : []; return b.length ? b.reduce((a, c) => a + c, 0) : Number(e.total_eps) || 0; }
// Library cards: the title's poster fills the card under a dark wash (the PDF's "Continue watching" card)
function _dmHero(e, eyebrow, body, acts) {
  const u = safeURL(e.poster_url);
  const bg = e.tmdb_id ? `<img class="dm-hero-bg is-bd" data-bd="${escHTML(MSSBackdrop.key(e))}" alt="">` : u ? `<img class="dm-hero-bg in" src="${u}" alt="" loading="lazy">` : '';
  return `<div class="dm-card-in dm-hero">${bg}
      <div class="dm-eyebrow">${eyebrow}</div>
      <div class="dm-hero-row">${u ? `<span class="dm-hero-poster" aria-hidden="true"><img src="${u}" alt="" loading="lazy"></span>` : ''}<div class="dm-hero-body">${body}</div></div>
      ${acts ? `<div class="dm-acts">${acts}</div>` : ''}</div>`;
}
const _dmHeroTitle = (href, title) => `<a class="dm-hero-t" href="${href}" translate="no">${escHTML(title)}</a>`;
function _dmWatchCard(e) {
  const nx = _dmNext(e), total = _dmTotal(e), done = Number(e.watched) || 0, pct = total ? Math.min(100, Math.round(done / total * 100)) : null;
  const movie = e.cat === 'movies' || e.ratings?._media_type === 'movie';
  return _dmHero(e, movie ? 'Watching now' : 'Continue watching',
    `${_dmHeroTitle(_dmTitleHref(e), e.title)}
      ${nx && !movie ? `<span class="dm-hero-sub">Next: S${nx.s} E${nx.e}</span>${e.tmdb_id && e.tmdb_type === 'tv' ? mssEpNameHTML(e.tmdb_id, nx.s, nx.e, 'dm-ep') : ''}` : ''}
      ${pct != null ? `<span class="dm-prog"><span class="w-prog-track"><span class="w-prog-fill" style="width:${pct}%"></span></span>
        <span class="dm-prog-l">${done} of ${total} episodes · ${pct}%</span></span>` : ''}`,
    `${movie ? '' : `<button type="button" class="dm-btn is-main" onclick="_dmPlusOne(this, '${escHTML(e.id)}')">${icon('plus', 14)} 1 episode</button>`}<a class="dm-btn is-ghost" href="${_dmTitleHref(e)}">Open</a>`);
}
function _dmMovieCard(e) {
  return _dmHero(e, 'Next in Up Next', `${_dmHeroTitle(_dmTitleHref(e), e.title)}${e.year ? `<span class="dm-hero-sub">Movie · ${escHTML(String(e.year).slice(0, 4))}</span>` : ''}`,
    `<button type="button" class="dm-btn is-main" onclick="_dmMovieDone(this, '${escHTML(e.id)}')">${icon('check', 14)} Mark watched</button><a class="dm-btn is-ghost" href="${_dmTitleHref(e)}">Open</a>`);
}
function _dmDoneCard(e) {
  const sc = liveScore(e);
  const when = e.completed_date ? ' · ' + escHTML(new Date(e.completed_date + 'T12:00').toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' })) : '';
  return _dmHero(e, 'Last finished', `${_dmHeroTitle(_dmTitleHref(e), e.title)}<span class="dm-hero-sub">${e.status === 'ongoing' ? 'To Be Continued' : 'Watched'}${when}</span>
      ${sc != null ? `<span class="dm-score">${scoreBadge(sc, 'sm')}<span class="dm-hero-sub">your score</span></span>` : '<span class="dm-hero-sub">Not rated yet</span>'}`,
    `<a class="dm-btn is-ghost" href="library.html?sec=watched">All watched ${icon('arrowRight', 13)}</a>`);
}
function _dmDiaryCard(d) {
  const when = d.watched_at ? new Date(d.watched_at) : d.watched_date ? new Date(d.watched_date + 'T12:00') : null;
  const day = when ? when.toLocaleDateString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date';
  const time = d.watched_at ? when.toLocaleTimeString(MSSI18n.locale, { hour: 'numeric', minute: '2-digit' }) : '';
  return _dmHero(d, 'Last in your Diary', `${_dmHeroTitle('diary.html', d.title)}
      ${+d.episode ? `<span class="dm-hero-sub">S${Number(d.season) || 1} E${Number(d.episode)}</span>${d.tmdb_id && d.tmdb_type === 'tv' ? mssEpNameHTML(d.tmdb_id, d.season, d.episode, 'dm-ep') : ''}` : ''}
      <span class="dm-hero-sub">${escHTML(day)}${time ? ' · ' + escHTML(time) : ''}</span>`,
    `<a class="dm-btn is-ghost" href="diary.html">Open Diary ${icon('arrowRight', 13)}</a>`);
}
/* You: your profile's backdrop and the first three stats you chose for its header (Edit profile › Profile stats).
   profile-v2.js picks and counts them (the same numbers as your profile); it and your library load the first time
   this card shows, then stay for this visit. Until then the three tiles wait as placeholders. */
let _dmYou = null, _dmYouBusy = false;
function _dmYouDrop() { _dmYou = null; }   // your stats or backdrop changed (profile-v2.js)
async function _dmYouLoad() {
  if (_dmYou || _dmYouBusy || !window._navUser) return;
  _dmYouBusy = true;
  try {
    await mssLoadScript('js/profile-v2.js');
    const p = window._navUserProfile || {}, uid = window._navUser.id, keys = MSSProfile.statKeys(p).slice(0, 3);
    const count = q => q.then(r => r.count ?? null, () => null);
    const [entries, lists, diary] = await Promise.all([getEntries(uid).then(async es => { if (keys.some(k => k === 'eptime' || k === 'totaltime')) await mssFillEpRuntimes(es, uid, 20); return es; }),
      keys.includes('lists') ? count(sb.from('favorite_lists').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('cat', 'custom')) : null,
      keys.includes('diary') ? count(sb.from('diary_watches').select('id', { count: 'exact', head: true }).eq('user_id', uid)) : null]);
    const vals = MSSProfile.statValues(entries, { lists, diary, time: MSSProfile.timeOf(p) }), bd = await MSSProfile.bannerURL(p, entries).catch(() => null);
    _dmYou = { stats: keys.map(k => [vals[k] ?? '—', MSSProfile.statLabel(k)]), bd: bd?.url ? bd.url.replace('/w1280/', '/w780/') : null };
    document.querySelectorAll('.dm-you').forEach(el => { el.outerHTML = _dmYouCard(); });
  } catch (err) { console.warn('You card:', err); }
  finally { _dmYouBusy = false; }
}
function _dmYouCard() {
  const p = window._navUserProfile || {}, name = p.username || '', Y = _dmYou;
  const av = safeURL(p.avatar_url);
  if (!Y) _dmYouLoad();
  const tiles = Y ? Y.stats.map(([v, l]) => `<span><b>${escHTML(v)}</b><small>${escHTML(l)}</small></span>`).join('')
    : '<span><b class="skel skel-line"></b><small>&nbsp;</small></span>'.repeat(3);
  return `<a class="dm-card-in dm-you${Y?.bd ? ' has-bd' : ''}" href="profile.html" aria-label="Open your profile"${Y ? '' : ' aria-busy="true"'}>
      ${Y?.bd ? `<span class="dm-you-bg" style="background-image:${cssURL(Y.bd)}" aria-hidden="true"></span>` : ''}
      <span class="dm-you-top"><span class="dm-you-av" aria-hidden="true">${av ? `<img src="${av}" alt="">` : escHTML((name || '?')[0].toUpperCase())}</span>
        <span class="dm-tx"><b translate="no">${escHTML(p.display_name || name || 'You')}</b><small translate="no">@${escHTML(name)}</small></span></span>
      <span class="dm-you-stats">${tiles}</span>
      <span class="dm-you-cta">Open profile ${icon('arrowRight', 13)}</span></a>`;
}
// Social / You: one card per row (shell_summary, 118)
const _dmFaces = (list, n = 5) => `<span class="dm-faces" aria-hidden="true">${(list || []).slice(0, n).map(p => { const u = safeURL(p.avatar_url);
  return `<span class="dm-face">${u ? `<img src="${u}" alt="">` : escHTML((p.username || '?')[0].toUpperCase())}</span>`; }).join('')}</span>`;
const _dmWhen = d => d ? escHTML(new Date(d).toLocaleDateString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short' })) : '';
const _dmPlain = (eyebrow, title, sub, extra, acts, cls = '') => `<div class="dm-card-in dm-plain${cls}"><div class="dm-eyebrow">${eyebrow}</div>
    <div class="dm-plain-t">${title}</div>${sub ? `<div class="dm-plain-s">${sub}</div>` : ''}${extra || ''}${acts ? `<div class="dm-acts">${acts}</div>` : ''}</div>`;
const _dmGo = (href, label, main) => `<a class="dm-btn${main ? ' is-main' : ''}" href="${href}">${label} ${icon('arrowRight', 13)}</a>`;
const _dmFace = (p, size = '') => { const u = safeURL(p?.avatar_url); return `<span class="dm-face${size}">${u ? `<img src="${u}" alt="">` : escHTML(((p?.display_name || p?.username || '?')[0]).toUpperCase())}</span>`; };
const _dmMe = () => { const p = window._navUserProfile || {}; return { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }; };
function _dmFriendsCard() {
  const S = _shellSum || {}, n = Number(S.friends) || 0, f = S.friend_faces || [];
  return `<div class="dm-card-in dm-plain dm-people"><div class="dm-eyebrow">Your friends</div>
      <div class="dm-plain-t">${n ? `${n} friend${n === 1 ? '' : 's'}` : 'No friends yet'}${_bnavReq > 0 ? ` <span class="dm-pill">${_bnavReq} request${_bnavReq === 1 ? '' : 's'}</span>` : ''}</div>
      ${f.length ? `<ul class="dm-roster">${f.slice(0, 4).map(p => `<li>${_dmFace(p, ' is-lg')}<span translate="no">${escHTML(p.display_name || p.username)}</span></li>`).join('')}</ul>`
        : '<div class="dm-plain-s">Follow people you know — when they follow you back, you’re friends.</div>'}
      <div class="dm-acts">${_dmGo(_bnavReq > 0 ? 'friends.html?view=requests' : 'friends.html', _bnavReq > 0 ? 'See requests' : n ? 'All friends' : 'Find friends', true)}</div></div>`;
}
function _dmFacesCard(kind) {
  const S = _shellSum || {}, f = S.friend_faces || [], first = f[0];
  if (!first) return _dmPlain(kind === 'compare' ? 'Compare' : 'Blend', 'Better with a friend', 'Follow a friend to compare your taste and blend your picks.', '', _dmGo('friends.html', 'Find friends', true));
  if (kind === 'compare') {
    return `<div class="dm-card-in dm-plain dm-versus"><div class="dm-eyebrow">Compare</div>
        <div class="dm-vs">${_dmFace(_dmMe(), ' is-xl')}<span class="dm-vs-mid" aria-hidden="true">${icon('compare', 18)}</span>${_dmFace(first, ' is-xl')}</div>
        <div class="dm-plain-t">You &amp; <span translate="no">${escHTML(first.display_name || first.username)}</span></div>
        <div class="dm-plain-s">Line your scores up side by side — where you agree, and where you really don’t.</div>
        <div class="dm-acts">${_dmGo('compare.html', 'Compare taste', true)}</div></div>`;
  }
  const posters = [...Object.values(S.queue_by || {}), ...Object.values(S.watching || {}), ...Object.values(S.done_by || {})].map(e => safeURL(e?.poster_url)).filter(Boolean).slice(0, 3);
  return `<div class="dm-card-in dm-plain dm-blend"><div class="dm-eyebrow">Blend</div>
      <div class="dm-plain-t">One list for you and your friends</div>
      <div class="dm-plain-s">Picks you’ll all enjoy, from what each of you loves and wants to watch.</div>
      <div class="dm-blend-row">${_dmFaces([_dmMe(), ...f], 4)}${posters.length ? `<span class="dm-top-fan dm-mini-fan" aria-hidden="true">${posters.map(u => `<span class="dm-top-p"><img src="${u}" alt=""></span>`).join('')}</span>` : ''}</div>
      <div class="dm-acts">${_dmGo('blend.html', 'Make a blend', true)}</div></div>`;
}
/* Movie Night, Challenges, Polls, Episode Chat and Medals come from their pages' own functions (they decide who
   sees what): each is asked the first time its row is shown, and kept for this session for 2 minutes. */
const _dmSoc = {}, _DM_SOC = { nights: ['get_movie_nights'], challenges: ['get_challenges', { p_ended: false }], polls: ['get_polls', { p_scope: 'friends', p_offset: 0 }],
  chats: ['my_episode_chats'], badges: ['my_badges'] };
function _dmSocGet(k) {
  if (k in _dmSoc && !(_dmSoc[k] instanceof Promise)) return _dmSoc[k];
  const uid = window._navUser?.id;
  try { const c = JSON.parse(sessionStorage.getItem('mss_shell_' + k) || 'null'); if (c?.uid === uid && Date.now() - c.at < 120000) return (_dmSoc[k] = c.v); } catch {}
  if (!(_dmSoc[k] instanceof Promise)) {
    const [fn, args] = _DM_SOC[k];
    _dmSoc[k] = sb.rpc(fn, args).then(r => r.error ? [] : (Array.isArray(r.data) ? r.data : []), () => []).then(v => {
      _dmSoc[k] = v;
      try { sessionStorage.setItem('mss_shell_' + k, JSON.stringify({ uid, at: Date.now(), v })); } catch {}
      if (_dmCur) { const kind = _dmPick; _dmPick = null; _dmCard(kind); }
      return v;
    });
  }
  return null;            // still loading
}
const _dmLoading = eyebrow => `<div class="dm-card-in dm-plain" aria-busy="true"><div class="dm-eyebrow">${eyebrow}</div><span class="skel skel-line" style="width:70%"></span><span class="skel skel-line" style="width:45%"></span></div>`;
const _dmWhenTime = d => d ? escHTML(new Date(d).toLocaleString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) : '';
function _dmNightCard() {
  const all = _dmSocGet('nights'); if (!all) return _dmLoading('Movie Night');
  const n = all.find(x => x.status === 'open' || (x.status === 'decided' && (!x.scheduled_at || new Date(x.scheduled_at) > Date.now() - 6 * 3600000)));
  if (!n) return _dmPlain('Movie Night', 'Nothing planned', 'Pick something to watch together and let everyone vote.', '', _dmGo('movie-night.html', 'Plan one', true));
  const going = (n.members || []).filter(m => m.status === 'going' || m.host), pick = (n.options || []).find(o => o.id === n.pick_id);
  const when = n.scheduled_at ? _dmWhenTime(n.scheduled_at) : 'No date yet';
  if (pick) return _dmHero({ tmdb_id: pick.tmdb_id, tmdb_type: pick.tmdb_type, poster_url: pick.poster_path ? 'https://image.tmdb.org/t/p/w342' + pick.poster_path : null }, 'Next Movie Night',
    `${_dmHeroTitle('movie-night.html', n.title || 'Movie Night')}<span class="dm-hero-sub">Watching <b translate="no">${escHTML(pick.title)}</b></span><span class="dm-hero-sub">${when} · ${going.length} going</span>${_dmFaces(going, 5)}`,
    `<a class="dm-btn is-main" href="movie-night.html">Open</a>`);
  const opts = (n.options || []).slice(0, 3);
  return `<div class="dm-card-in dm-plain"><div class="dm-eyebrow">${n.status === 'open' && n.voting ? 'Voting now' : 'Next Movie Night'}</div>
      <div class="dm-plain-t" translate="no">${escHTML(n.title || 'Movie Night')}</div><div class="dm-plain-s">${when} · ${going.length} going${n.voting ? ` · ${(n.options || []).length} options` : ''}</div>
      ${opts.length ? `<span class="dm-covers" aria-hidden="true">${opts.map(o => o.poster_path ? `<img src="https://image.tmdb.org/t/p/w185${escHTML(o.poster_path)}" alt="">` : '').join('')}</span>` : _dmFaces(going, 5)}
      <div class="dm-acts">${_dmGo('movie-night.html', n.voting && !n.my_vote && n.status === 'open' ? 'Vote' : 'Open', true)}</div></div>`;
}
function _dmChallengeCard() {
  const all = _dmSocGet('challenges'); if (!all) return _dmLoading('Challenges');
  const c = all.find(x => x.my_status === 'joined' && x.state === 'live' && !x.my_finished_at) || all.find(x => x.my_status === 'joined' && x.state === 'upcoming') || all.find(x => x.state !== 'ended');
  if (!c) return _dmPlain('Challenges', 'No challenge running', 'Race your friends to a watching goal.', '', _dmGo('challenges.html', 'Start one', true));
  const goal = Number(c.goal) || 1, got = Math.min(goal, Number(c.my_progress) || 0), pct = Math.round(got / goal * 100), done = !!c.my_finished_at;
  const ends = c.ends_on ? escHTML(new Date(c.ends_on + 'T12:00').toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' })) : '';
  // the medal it's for — the same art as the Challenges page (an official one, or gold · silver · bronze)
  if (typeof MSSMedal === 'undefined') mssLoadScript('js/medals.js').then(() => { if (_dmPick === 'challenge') { _dmPick = null; _dmCard('challenge'); } });
  const medal = typeof MSSMedal === 'undefined' ? `<span class="dm-medal-ic">${icon('trophy', 26)}</span>`
    : c.official && c.medal ? MSSMedal.official(c.medal, { size: 74, locked: !done })
    : `<span class="dm-medal-set">${[2, 1, 3].map(pl => MSSMedal.challenge(pl, c.cat, { size: pl === 1 ? 52 : 40 })).join('')}</span>`;
  return `<div class="dm-card-in dm-plain dm-chal"><div class="dm-eyebrow">${c.state === 'upcoming' ? 'Starting soon' : done ? 'Finished' : 'Your challenge'}</div>
      <div class="dm-chal-top"><div class="dm-chal-tx"><div class="dm-plain-t" translate="no">${escHTML(c.title)}</div>
        <div class="dm-plain-s">${got} of ${goal}${ends ? ` · ends ${ends}` : ''}</div></div>
        <span class="dm-chal-medal" aria-hidden="true">${medal}</span></div>
      <div class="dm-meter" role="img" aria-label="${got} of ${goal}"><i style="width:${pct}%"></i></div>
      ${_dmFaces((c.members || c.board || []).filter(m => m.status === 'joined'), 6)}
      <div class="dm-acts">${_dmGo('challenges.html', 'Open', true)}</div></div>`;
}
function _dmPollCard() {
  const all = _dmSocGet('polls'); if (!all) return _dmLoading('Polls');
  const p = all.find(x => x.is_open) || all[0];
  if (!p) return _dmPlain('Polls', 'No polls yet', 'Ask your friends what to watch next.', '', _dmGo('polls.html?new=1', 'New poll', true));
  const a = p.author || {}, total = Number(p.total_votes) || 0, results = !!p.show_results;
  const left = (() => {      // "ends in 2 days" / "ended"
    const ms = new Date(p.closes_at) - Date.now(); if (!(ms > 0)) return 'ended';
    const [v, u] = ms < 3600000 ? [ms / 60000, 'minute'] : ms < 86400000 ? [ms / 3600000, 'hour'] : [ms / 86400000, 'day'];
    try { return 'ends ' + new Intl.RelativeTimeFormat(MSSI18n.locale, { numeric: 'auto' }).format(Math.max(1, Math.round(v)), u); } catch { return ''; }
  })();
  const opts = (p.options || []).slice(0, 4), top = Math.max(1, ...opts.map(o => Number(o.votes) || 0));
  const row = o => {
    const n = Number(o.votes) || 0, pct = results && total ? Math.round(n / total * 100) : 0, mine = p.my_vote === o.id, lead = results && n === top && n > 0;
    return `<li class="dm-po${mine ? ' is-mine' : ''}${lead ? ' is-lead' : ''}">${results ? `<i class="dm-po-bar" style="width:${pct}%"></i>` : ''}
        ${o.image_path ? `<img src="https://image.tmdb.org/t/p/w92${escHTML(o.image_path)}" alt="">` : `<span class="dm-po-dot" aria-hidden="true">${mine ? icon('check', 11) : ''}</span>`}
        <span class="dm-po-l" translate="no">${escHTML(o.label || '')}</span>${results ? `<b class="dm-po-n">${pct}%</b>` : ''}</li>`;
  };
  return `<div class="dm-card-in dm-plain dm-poll">
      <div class="dm-poll-head">${_dmFace(a)}<span class="dm-poll-who"><b translate="no">${escHTML(a.display_name || a.username || '')}</b><small>asks${left ? ' · ' + escHTML(left) : ''}</small></span>
        <span class="dm-pill${p.is_open ? '' : ' is-off'}">${p.is_open ? 'Open' : 'Closed'}</span></div>
      <div class="dm-poll-q" translate="no">${escHTML(p.question)}</div>
      ${opts.length ? `<ul class="dm-po-list">${opts.map(row).join('')}</ul>` : ''}
      <div class="dm-poll-foot"><span>${icon('poll', 14)} ${total} vote${total === 1 ? '' : 's'}${p.my_vote ? ' · you voted' : ''}</span>${_dmGo('polls.html', p.is_open && !p.my_vote ? 'Vote' : 'See results', true)}</div></div>`;
}
function _dmEpChatCard() {
  const all = _dmSocGet('chats'); if (!all) return _dmLoading('Episode Chat');
  const c = all[0];
  if (!c) return _dmPlain('Episode Chat', 'Quiet for now', 'Talk about an episode with your friends.', '', _dmGo('episode-chat.html', 'Open', true));
  return _dmHero({ tmdb_id: c.tmdb_id, tmdb_type: 'tv', poster_url: c.poster_path ? 'https://image.tmdb.org/t/p/w342' + c.poster_path : null }, c.new ? `Episode Chat · ${Number(c.new)} new` : 'Episode Chat',
    `${_dmHeroTitle('episode-chat.html', c.show_title || 'A show')}<span class="dm-hero-sub">S${Number(c.season) || 1} E${Number(c.episode) || 1} · ${Number(c.count) || 0} message${Number(c.count) === 1 ? '' : 's'} · ${escHTML(_notifTimeAgo(c.last_at))}</span>
      ${c.unlocked && c.last ? `<span class="dm-quote" translate="no">${c.last.mine ? 'You' : escHTML(c.last.name || '')}: “${escHTML(c.last.body)}”</span>` : '<span class="dm-hero-sub">Watch the episode to read it.</span>'}`,
    `<a class="dm-btn is-main" href="episode-chat.html">Join in</a>`);
}
function _dmMsgsCard() {
  const n = typeof _navMsgCount !== 'undefined' ? _navMsgCount : 0, f = _shellSum?.friend_faces || [];
  return `<div class="dm-card-in dm-plain dm-msgs"><div class="dm-eyebrow">Messages</div>
      <div class="dm-msgs-top"><span class="dm-msgs-ic" aria-hidden="true">${icon('inbox', 24)}${n ? `<span class="dm-msgs-n">${n > 9 ? '9+' : n}</span>` : ''}</span>
        <span class="dm-chal-tx"><span class="dm-plain-t">${n ? `${n} new message${n === 1 ? '' : 's'}` : 'All caught up'}</span>
        <span class="dm-plain-s">${f.length ? `Chat with <span translate="no">${f.slice(0, 2).map(x => escHTML(x.display_name || x.username)).join(', ')}</span>${f.length > 2 ? ' and more' : ''}` : 'Private chats with your friends'}</span></span></div>
      ${f.length ? _dmFaces(f, 5) : ''}
      <div class="dm-e2e">${icon('lock', 13)} End-to-end encrypted — only the people in a chat can read it</div>
      <div class="dm-acts">${_dmGo('messages.html', n ? 'Read them' : 'Open Messages', true)}</div></div>`;
}
function _dmListCard() {
  const l = _shellSum?.list;
  if (!l) return _dmPlain('Lists', 'No lists yet', 'Rank your favourites, plan a marathon, share it.', '', _dmGo('lists.html?new=1', 'New list', true));
  const covers = (l.posters || []).map(safeURL).filter(Boolean), n = Number(l.count) || 0;
  return `<div class="dm-card-in dm-plain dm-listcard"><div class="dm-eyebrow">Your latest list</div>
      <div class="dm-plain-t" translate="no">${escHTML(l.title)}</div>
      <div class="dm-plain-s">${n} title${n === 1 ? '' : 's'}</div>
      ${covers.length ? `<span class="dm-top-fan dm-list-fan" aria-hidden="true">${covers.map(u => `<span class="dm-top-p"><img src="${u}" alt=""></span>`).join('')}</span>` : ''}
      <div class="dm-acts">${_dmGo('lists.html', 'Your lists', true)}<a class="dm-btn" href="lists.html?new=1">${icon('plus', 13)} New list</a></div></div>`;
}
function _dmNoteCard() {
  const n = _shellSum?.note;
  if (!n) return _dmPlain('Notes', 'No notes yet', 'Write what you thought of anything you watch.', '', _dmGo('notes.html?add=1', 'Write a note', true));
  return _dmHero(n, 'Your latest note', `${_dmHeroTitle('notes.html', n.title)}<span class="dm-quote" translate="no">“${escHTML(String(n.text || '').slice(0, 120))}${String(n.text || '').length > 120 ? '…' : ''}”</span>`,
    `<a class="dm-btn is-ghost" href="notes.html">All notes ${icon('arrowRight', 13)}</a>`);
}
function _dmEpsCard() {
  const r = _shellSum?.ep_rating;
  if (!r) return _dmPlain('Episodes', 'No episodes rated yet', 'Rate episodes and see each season’s chart.', '', _dmGo('episodes.html', 'Open Episodes', true));
  return _dmHero({ ...r, tmdb_type: 'tv' }, 'Last episode you rated', `${_dmHeroTitle('episodes.html?show=' + encodeURIComponent(r.tmdb_id || ''), r.title)}
      <span class="dm-hero-sub">S${Number(r.season) || 1} E${Number(r.episode) || 1}</span>${r.tmdb_id ? mssEpNameHTML(r.tmdb_id, r.season, r.episode, 'dm-ep') : ''}
      ${r.score != null ? `<span class="dm-score">${scoreBadge(r.score, 'sm')}</span>` : ''}`, `<a class="dm-btn is-ghost" href="episodes.html">Episodes ${icon('arrowRight', 13)}</a>`);
}
function _dmMedalsCard() {
  const all = _dmSocGet('badges'); if (!all) return _dmLoading('Medals');
  const n = all.length, last = all[0];
  if (typeof MSSMedal === 'undefined' && n) mssLoadScript('js/medals.js').then(() => { if (_dmPick === 'medals') { _dmPick = null; _dmCard('medals'); } });
  const draw = b => typeof MSSMedal === 'undefined' ? icon('trophy', 26)        // the same medals as the cabinet (showcase.js)
    : b.kind === 'member' ? MSSMedal.member({ size: 50 }) : b.kind === 'secret' ? MSSMedal.secret(b.medal, { size: 58 })
    : b.kind === 'achievement' ? MSSMedal.achievement(b.ach_key, b.ach_level, { size: 58, at: b.at })
    : b.kind === 'official' ? MSSMedal.official(b.medal, { size: 58 }) : MSSMedal.challenge(b.place, b.cat, { size: 48 });
  const name = b => b.kind === 'achievement' ? (typeof MSSMedal !== 'undefined' && MSSMedal.ACH?.[b.ach_key]?.name) || b.title : b.title;
  return `<div class="dm-card-in dm-plain"><div class="dm-eyebrow">Medals</div>
      <div class="dm-plain-t">${n ? `${n} medal${n === 1 ? '' : 's'}` : 'Your cabinet is waiting'}</div>
      ${n ? `<div class="dm-shelf" aria-hidden="true">${all.slice(0, 4).map(b => `<span class="dm-shelf-m">${draw(b)}</span>`).join('')}</div>
        <div class="dm-plain-s">Newest: <span translate="no">${escHTML(name(last) || 'a medal')}</span> · ${_dmWhen(last.earned_at)}</div>`
        : '<div class="dm-plain-s">Earn them by watching, rating and finishing challenges.</div>'}
      <div class="dm-acts">${_dmGo('cabinet.html', 'Open the cabinet', true)}</div></div>`;
}
function _dmExportCard() {
  const n = _shellSum?.counts?.all;
  const tile = (fmt, ic, l) => `<a class="dm-ex-t" href="export.html?format=${fmt}"><span class="dm-ex-ic" aria-hidden="true">${icon(ic, 18)}</span>${l}</a>`;
  return `<div class="dm-card-in dm-plain dm-export"><div class="dm-eyebrow">Export</div>
      <div class="dm-plain-t">Take your folio anywhere</div>
      <div class="dm-plain-s">${n != null ? `All ${Number(n).toLocaleString(MSSI18n.locale)} titles, ` : ''}your scores and notes — pick a format to start.</div>
      <div class="dm-ex">${tile('pdf', 'download', 'PDF')}${tile('image', 'image', 'Image')}${tile('csv', 'list', 'Spreadsheet')}${tile('backup', 'layers', 'Full backup')}</div>
      <div class="dm-acts">${_dmGo('export.html', 'Open Export', true)}</div></div>`;
}
// Friends lately: the newest friend activity among the notifications already loaded on this page
const _DM_FRIEND_TYPES = ['friend_started', 'friend_episode', 'friend_finished', 'friend_rated', 'friend_note', 'friend_watchlist', 'friend_dropped', 'friend_list', 'friend_poll'];
function _dmFriendsLately() {
  const items = (typeof _notifItems !== 'undefined' ? _notifItems : []).filter(n => _DM_FRIEND_TYPES.includes(n.type)).slice(0, 4);
  const row = n => {
    const m = n.meta || {}, href = m.tmdb_id && m.tmdb_type ? `title.html?type=${encodeURIComponent(m.tmdb_type)}&id=${encodeURIComponent(m.tmdb_id)}`
      : n.actor_id ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}` : 'activity.html';
    return `<li><a class="dm-fl" href="${href}">${_dmPoster(m.poster_url || n.actor?.avatar_url, m.title || n.actor?.username, 'dm-fl-pic')}
      <span class="dm-tx"><span class="dm-fl-t">${_notifShortText(n)}</span><small>${escHTML(_notifTimeAgo(n.created_at))}</small></span></a></li>`;
  };
  return `<div class="dm-card-in dm-lately"><div class="dm-eyebrow">Friends lately</div>
      ${items.length ? `<ul class="dm-fl-list">${items.map(row).join('')}</ul>` : `<div class="dm-empty"><span>No friend activity yet.</span></div>`}
      <div class="dm-acts"><a class="dm-btn" href="${items.length ? 'activity.html' : 'friends.html'}">${items.length ? 'All activity' : 'Find friends'} ${icon('arrowRight', 13)}</a></div></div>`;
}
// +1 episode — the shared steps (db.js mssStepEpisode); the Diary logs it by itself
async function _dmPlusOne(btn, id) {
  const S = _shellSum, e = [S?.watching_any, ...Object.values(S?.watching || {})].find(x => x?.id === id);
  if (!e || btn.disabled) return;
  btn.disabled = true;
  try {
    if (typeof MSSEp === 'undefined') await mssLoadScript('js/episode-ratings.js');
    const r = await mssStepEpisode(e, 1, window._navUser.id);
    if (r === 'finish') {
      _dmHide();
      const st = await showConfirm({ title: `Finished “${e.title}”`, message: 'Has the show ended, or are more seasons coming?', confirmText: 'Save', danger: false,
        iconName: 'trophy', choices: [['completed', 'Watched', 'The show has ended'], ['ongoing', 'To Be Continued', 'More seasons coming']] });
      if (st) { await mssFinishShow(e, window._navUser.id, st); showToast(`Added to ${st === 'ongoing' ? 'To Be Continued' : 'Watched'}.`); }
    } else showToast(r === 'movie_done' ? `“${e.title}” marked as watched!` : 'Progress updated');
    document.dispatchEvent(new CustomEvent('mss:progress', { detail: { entry: e } }));
  } catch (err) { console.error(err); showToast('Error updating progress.', 'err'); }
  finally { btn.disabled = false; }
}
async function _dmMovieDone(btn, id) {
  const e = _shellSum?.up_next_movie;
  if (!e || e.id !== id || btn.disabled) return;
  btn.disabled = true;
  try {
    const done = { status: 'completed', completed_date: mssToday() };
    await updateProgress(e.id, window._navUser.id, done);
    Object.assign(e, done);
    showToast(`“${e.title}” marked as watched!`);
    document.dispatchEvent(new CustomEvent('mss:watched', { detail: e }));
  } catch (err) { console.error(err); showToast('Error marking complete.', 'err'); btn.disabled = false; }
}

/* ═════════ Guests: the menus' card — what this area does for you once you join ═════════ */
const SHELL_GUEST_CARD = {
  lib: ['Your library', 'Look around freely. With a free account it fills with everything you watch, down to the episode, and Diary keeps every watch by day.'],
  social: ['Social', 'Search people and open their profiles from Friends. Following, Activity, Compare and the rest come with a free account.'],
  you: ['You', 'Read Community lists and notes, and preview your profile. Medals and Export come with a free account.'],
};
function _dmGuestCard(k) {
  const [h, p] = SHELL_GUEST_CARD[k] || SHELL_GUEST_CARD.lib;
  return `<div class="dm-card-in dm-guest"><div class="dm-eyebrow">${h}</div><p class="dm-guest-p">${p}</p>
    <div class="dm-guest-acts"><a class="dm-btn is-main" href="login.html#signup">Create a free account</a><a class="dm-btn" href="login.html">Sign in</a></div></div>`;
}

/* ═════════ Account: a menu under the avatar (desktop), a full page (phones) ═════════ */
function shellAccountHTML() {
  const p = window._navUserProfile || {}, name = p.username || '';
  const av = safeURL(p.avatar_url), n = typeof MSSAccounts !== 'undefined' ? MSSAccounts.list().length : 1;
  let admin = false; try { admin = (sessionStorage.getItem('mss_admin') || '').endsWith(':1'); } catch {}
  const ic = (name, cls = '') => `<span class="acct-ic${cls}" aria-hidden="true">${icon(name, 16)}</span>`, go = `<span class="acct-chev" aria-hidden="true">${icon('chevright', 14)}</span>`;
  return `<a class="acct-head" href="profile.html"><span class="acct-av" aria-hidden="true">${av ? `<img src="${av}" alt="">` : escHTML((name || '?')[0].toUpperCase())}</span>
      <span class="acct-who"><b translate="no">${escHTML(p.display_name || name || 'You')}</b><small><span translate="no">@${escHTML(name)}</span> · View profile</small></span></a>
    <ul class="acct-list">
      <li><a class="acct-row" href="settings.html">${ic('settings')}<span class="acct-l">Settings</span>${go}</a></li>
      <li class="nav-admin-link"${admin ? '' : ' hidden'}><a class="acct-row" href="admin.html">${ic('lock')}<span class="acct-l">Admin</span><span class="acct-owner">Owner</span>${go}</a></li>
      <li><div class="acct-row acct-theme">${ic('sun')}<span class="acct-l" id="acctThemeL">Theme</span>${mssThemeSwitch('acctThemeL')}</div></li>
      <li><button type="button" class="acct-row" onclick="_acctHide();_navAccounts()">${ic('users')}<span class="acct-l">Switch account</span><span class="acct-meta">${n} on this device</span>${go}</button></li>
      <li class="acct-sep"><button type="button" class="acct-row is-out" onclick="handleLogout()">${ic('logout', ' is-out')}<span class="acct-l">Sign out</span></button></li>
    </ul>`;
}
function _acctInit() {
  const btn = document.getElementById('navUserBtn'), menu = document.getElementById('acctMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', ev => { ev.stopPropagation(); menu.hidden ? _acctShow(ev.detail === 0) : _acctHide(); });
  btn.addEventListener('keydown', ev => { if (ev.key === 'ArrowDown') { ev.preventDefault(); _acctShow(true); } });
  menu.addEventListener('click', ev => {
    ev.stopPropagation();                                          // a click inside doesn't close it…
    const t = ev.target.closest('[data-theme-sw] .mss-theme-opt');  // …so the Light / Dark switch is handled here (config.js's page listener never hears it)
    if (t) setTheme(t.dataset.v);
  });
  menu.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); _acctHide(); btn.focus(); return; }
    const all = [...menu.querySelectorAll('a, button:not([aria-checked="false"])')], i = all.indexOf(document.activeElement);
    if (i < 0 || !['ArrowDown', 'ArrowUp'].includes(ev.key) || ev.target.closest('[data-theme-sw]')) return;
    ev.preventDefault(); all[(i + (ev.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus();
  });
  menu.addEventListener('focusout', ev => { if (ev.relatedTarget && !menu.contains(ev.relatedTarget) && ev.relatedTarget !== btn) _acctHide(); });
  document.addEventListener('click', () => _acctHide());
}
function _acctShow(focus) {
  const menu = document.getElementById('acctMenu');
  _navCloseAll('user');
  menu.innerHTML = shellAccountHTML();
  menu.hidden = false;
  document.getElementById('navUserBtn').setAttribute('aria-expanded', 'true');
  if (focus) menu.querySelector('a')?.focus();
}
function _acctHide() {
  const menu = document.getElementById('acctMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  document.getElementById('navUserBtn')?.setAttribute('aria-expanded', 'false');
}
// Phones: the same content as a full page (focus stays inside until Back)
function shellAccountPage() {
  const ov = _shellPage('shellAcctPage', 'Account');
  ov.querySelector('.shell-page-body').innerHTML = shellAccountHTML();
  MSSDialog.open(ov, { focus: '.shell-page-back' });
}
// A full-page screen on phones (account, search): back button + title, as a dialog
function _shellPage(id, title, onClose) {
  let ov = document.getElementById(id);
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = id; ov.className = 'shell-page';
  ov.innerHTML = `<div class="shell-page-card" role="dialog" aria-modal="true" aria-labelledby="${id}T">
      <div class="shell-page-head"><button type="button" class="shell-page-back" aria-label="Back">${icon('back', 20)}</button>
        <span class="shell-page-t" id="${id}T">${title}</span></div>
      <div class="shell-page-body"></div></div>`;
  const close = () => { MSSDialog.close(ov); onClose?.(); };
  ov.querySelector('.shell-page-back').onclick = close;
  MSSDialog.bind(ov, close);
  document.body.appendChild(ov);
  return ov;
}

/* ═════════ Create: + Add in the header (desktop), the round + bottom-right (phones / tablets) ═════════ */
const SHELL_CREATE = [['title', 'film', 'Add a title', 'Search TMDB or type it in'], ['note', 'edit', 'Write a note', 'Pick a title from your library'],
  ['list', 'layers', 'New list', 'Opens List Studio'], ['poll', 'poll', 'New poll', 'Ask your friends']];
function _shellFabEl() {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'shell-fab nav-auth-only'; b.id = 'shellFab';
  b.setAttribute('aria-label', 'Create'); b.setAttribute('aria-haspopup', 'dialog');
  b.innerHTML = icon('plus', 26);
  b.onclick = e => { if (!mssGuestGate('add titles')) shellSheet('create', e.currentTarget); };
  return b;
}
// desktop: a menu under + Add (MSSPopover) · the round + (phones / tablets): Create in the section sheet (shellSheet)
async function shellCreate(e) {
  e?.stopPropagation?.();
  if (mssGuestGate('add titles')) return;
  const btn = e?.currentTarget || document.getElementById('navCreate');
  _navCloseAll('add');
  await mssLoadScript('js/panel.js');
  MSSPopover.open(btn, { title: 'Create', subtitle: 'What do you want to add?', label: 'Create',
    items: SHELL_CREATE.map(([k, ic, label, sub]) => ({ label, sub, icon: ic, onSelect: () => _bnavDo(k) })) });
}
function _bnavDo(k) {
  const page = location.pathname.split('/').pop() || 'index.html';
  if (k === 'title') return openAddModal();
  if (k === 'note') return page === 'notes.html' && typeof openNotesSearchPopup === 'function' ? openNotesSearchPopup() : (location.href = 'notes.html?add=1');
  if (k === 'list') return (location.href = 'list-view.html?new=1');   // the list editor (Lists redesign)
  if (k === 'poll') {
    if (page === 'polls.html' && typeof MSSPolls !== 'undefined') return MSSPolls.create();
    location.href = 'polls.html?new=1';
  }
}

/* ═════════ Phones / tablets (<1200px): the bottom bar ═════════
   Home · Discover · Library · Social · You. The tab you're on sits in the olive circle that rises out
   of the bar's cut-out — drawn there from the first paint (no slide from another tab). */
function _bnavEl(where) {
  const el = document.createElement('nav');
  el.className = 'bnav' + (where.tab ? '' : ' is-none'); el.id = 'bnav';   // is-none: a page with no tab of its own and no known way in — nothing lit
  el.setAttribute('aria-label', 'Main');
  const i = Math.max(0, SHELL_TABS.findIndex(t => t.k === where.tab));
  el.style.setProperty('--x', (i * 20 + 10) + '%');
  el.innerHTML = `<div class="bnav-bg" aria-hidden="true"></div><div class="bnav-ring" aria-hidden="true"></div><span class="bnav-orb" aria-hidden="true"></span>
    ${SHELL_TABS.map(t => `<a class="bnav-item${t.k === where.tab ? ' on' : ''}" href="${t.href}" data-tab="${t.k}"${t.k === where.tab ? ' aria-current="page"' : ''}${t.groups ? ` onclick="return _bnavTap(event, '${t.k}')" aria-haspopup="dialog" aria-expanded="false"` : ''}>
      <span class="bnav-ic">${icon(t.icon, 23)}</span><span class="bnav-lb">${t.label}</span></a>`).join('')}`;
  return el;
}
/* Red dot on Social (bar + desktop tab) and a count on Friends while follow requests or messages wait */
let _bnavReq = 0, _bnavMsg = 0;
function _bnavDot(n) { _bnavReq = n; _bnavDotPaint(); }
function _bnavDotPaint() {
  const why = [_bnavReq > 0 && `${_bnavReq} follow request${_bnavReq === 1 ? '' : 's'}`, _bnavMsg > 0 && `${_bnavMsg} new message${_bnavMsg === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  document.querySelectorAll('#bnav [data-tab="social"], #dnav [data-tab="social"]').forEach(a => {
    a.querySelector('.bnav-dot')?.remove();
    if (why) a.insertAdjacentHTML('beforeend', `<span class="bnav-dot"><span class="sr-only">, ${why}</span></span>`);
  });
  document.querySelectorAll('[data-req-badge]').forEach(b => { b.textContent = _bnavReq > 9 ? '9+' : _bnavReq > 0 ? _bnavReq : ''; b.hidden = !(_bnavReq > 0); });
  _nshPaintCounts();
}

/* ═════════ Phones / tablets (<1200px): the top bar (Mobile nav v2) ═════════
   Left: Home — the logo · Discover — its name · a page of Library / Social / You — the area in small green
   capitals over the page's name + ▾ (drops that area's menu down under the bar: the desktop menu's rows) · everything else (a title, a person, a list,
   a friend's profile, Settings, Notifications…) — ‹ Back, the page's name, Share and ⋯ where the page has them.
   Right: Search · Notifications · your avatar (its menu: Settings, Admin, Theme, Switch account, Sign out).
   Scrolled: a 1px line under it. The page's own big title is hidden on phones (it stays for screen readers). */
const _NTOP_SHARE = ['title.html', 'person.html', 'list-view.html', 'profile-view.html', 'season.html', 'episode.html', 'discover-list.html'];
const _ntopName = () => (document.title || '').replace(/\s*[—–|-]\s*MyScreenFolio\s*$/, '').trim() || 'MyScreenFolio';
function _ntopLeftHTML(w) {
  const page = _navFile(location), t = SHELL_TABS.find(x => x.k === w.tab);
  if (page === 'index.html') return `<a class="nav-logo" href="index.html" aria-label="MyScreenFolio home">${mssLogoSVG('nav-logo-img')}</a>`;
  if (page === 'discover.html') return '<span class="ntop-name">Discover</span>';
  const it = t?.sheet && w.href ? _shellItems(t).find(x => x.href === w.href) : null;
  if (it) return `<button type="button" class="ntop-area" id="ntopArea" onclick="_ntopDrop('${t.k}', event)" aria-haspopup="true" aria-expanded="false">
      <span class="ntop-kicker">${t.label}<span class="sr-only">:</span></span><span class="ntop-name">${it.label}${icon('chevdown', 15)}</span></button>`;
  return `<a class="ntop-btn ntop-back" href="${t?.href || 'index.html'}" onclick="return mssGoBack()" aria-label="Back">${icon('back', 20)}</a>
    <span class="ntop-name ntop-dname" id="ntopName" translate="no">${escHTML(_ntopName())}</span>
    ${_NTOP_SHARE.includes(page) ? `<button type="button" class="ntop-btn" onclick="_ntopShare()" aria-label="Share">${icon('share', 17)}</button>` : ''}
    <button type="button" class="ntop-btn" id="ntopMore" onclick="_ntopMore()" aria-label="More actions" aria-haspopup="menu" hidden>${icon('moreV', 18)}</button>`;
}
async function _ntopShare() {
  const url = location.href;
  if (navigator.share) { try { await navigator.share({ title: _ntopName(), url }); } catch {} return; }
  try { await navigator.clipboard.writeText(url); showToast('Link copied.'); } catch { showToast('Couldn’t copy the link.', 'err'); }
}
// ⋯ opens the page's own ⋯ menu (the button the page marks with data-top-more)
const _ntopMoreEl = () => { const all = [...document.querySelectorAll('[data-top-more]')]; return all.find(el => el.getClientRects().length) || all[0]; };
function _ntopMore() { _ntopMoreEl()?.click(); }

/* The page name's ▾: the area's menu drops down from under the bar (the desktop menu's rows, in one column),
   over a dimmed page. Tap a row → go there; tap ▾ again, the dim page or Esc → closed. */
function _ntopDrop(k, ev) {
  const btn = document.getElementById('ntopArea');
  let el = document.getElementById('ntopDrop');
  if (el && !el.hidden) { _ntopDropHide(true); return; }
  const t = SHELL_TABS.find(x => x.k === k);
  if (!t?.groups || !btn) return;
  _navCloseAll('ntop');
  if (typeof shellSheetClose === 'function') shellSheetClose();
  if (!el) {
    el = document.createElement('div');
    el.className = 'ntop-drop'; el.id = 'ntopDrop'; el.hidden = true;
    el.addEventListener('click', e => { if (e.target === el) _ntopDropHide(); });
    el.addEventListener('keydown', e => {
      const links = [...el.querySelectorAll('.dm-link')], i = links.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); _ntopDropHide(true); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
    });
    document.getElementById('navTop').appendChild(el);
  }
  el.innerHTML = `<div class="ntop-drop-in" role="region" aria-labelledby="ntopArea"><div class="dm-cols">${_dmColsHTML(t, 'nd')}</div></div>`;
  el.style.top = Math.round(document.getElementById('mainNav').getBoundingClientRect().bottom) + 'px';
  el.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => el.classList.add('open'));
  if (ev.detail === 0) el.querySelector('.dm-link')?.focus();       // opened from the keyboard → into the menu
  _shellSummary();
}
function _ntopDropHide(refocus) {
  const el = document.getElementById('ntopDrop');
  if (!el || el.hidden) return;
  el.classList.remove('open'); el.hidden = true;
  const btn = document.getElementById('ntopArea');
  btn?.setAttribute('aria-expanded', 'false');
  if (refocus) btn?.focus({ preventScroll: true });
}
function _ntopInit() {
  const root = document.documentElement;
  const line = () => { if (!root.classList.contains('mss-scroll-locked')) root.classList.toggle('ntop-line', window.scrollY > 2); };
  window.addEventListener('scroll', line, { passive: true }); line();
  const name = document.getElementById('ntopName'), more = document.getElementById('ntopMore');
  if (!name && !more) return;
  // a detail page fills its name and ⋯ in as it loads
  let raf = 0;
  const sync = () => { raf = 0; if (name) name.textContent = _ntopName(); if (more) more.hidden = !_ntopMoreEl(); };
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(sync); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  sync();
}

/* ═════════ Phones / tablets: the section sheets (Mobile nav v2) ═════════
   Library, Social and You in the bottom bar open their area's sheet instead
   of going anywhere; the round + opens Create in the same sheet. One component, built from SHELL_TABS[].sheet.
   It sits flush on the bar (same surface, rounded top only); while it's open the bar's circle sinks away and
   the area's tab shows flat (green icon + label + a short line on the bar's top edge). Pick a row → go there
   (the page you're on just closes it). Swipe down, tap the dim page, Esc, or tap the tab again → closed,
   and the circle rises back on the page's own tab. Long-press Library / Social / You → straight to
   Library / Friends / Profile. */
let _nsh = null;          // { k, opener } while open
let _nshC = null;         // nav_counts() (133): lists, notes, eps, night_invites
function _nshEl() {
  let ov = document.getElementById('nsh');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'nsh'; ov.className = 'nsh';
  ov.innerHTML = '<div class="nsh-card" role="dialog" aria-modal="true" aria-labelledby="nshT"><span class="nsh-grab" aria-hidden="true"></span><div class="nsh-body" id="nshBody"></div></div>';
  MSSDialog.bind(ov, () => shellSheetClose());
  ov.addEventListener('keydown', _nshKeys);
  ov.addEventListener('click', ev => {
    const a = ev.target.closest('a.nsh-row');
    if (a && a.getAttribute('aria-current') === 'page') { ev.preventDefault(); shellSheetClose(); }
  });
  _nshSwipe(ov.firstElementChild);
  document.body.appendChild(ov);
  return ov;
}
// kb: opened from the keyboard — focus goes to the current row (else the first); a tap focuses the sheet itself (no ring on a row)
function shellSheet(k, opener, kb) {
  if (_nsh?.k === k) return shellSheetClose();
  const ov = _nshEl(), bar = document.getElementById('bnav'), wasOpen = !!_nsh;
  _nsh = { k, opener: _nsh?.opener || opener || null };
  ov.dataset.k = k;
  document.getElementById('nshBody').innerHTML = k === 'create' ? _nshCreateHTML() : _nshHTML(k);
  ov.querySelector('.nsh-card').scrollTop = 0;
  bar?.classList.add('has-sheet', 'sheet-anim');
  document.querySelectorAll('#bnav .bnav-item').forEach(a => {
    const on = a.dataset.tab === k;
    a.classList.toggle('is-sheet', on);
    if (a.hasAttribute('aria-expanded')) a.setAttribute('aria-expanded', String(on));
  });
  const target = k === 'create' ? ov.querySelector('#nshQ') : kb ? ov.querySelector('.nsh-row[aria-current]') || ov.querySelector('.nsh-row') : ov.querySelector('.nsh-card');
  if (!wasOpen) MSSDialog.open(ov, { focus: target });
  else target?.focus({ preventScroll: true });
  if (k === 'create') _nshCreateInit();
  else _nshCountsLoad();
}
function shellSheetClose() {
  if (!_nsh) return;
  const ov = document.getElementById('nsh'), opener = _nsh.opener;
  _nsh = null;
  MSSDialog.close(ov);
  document.getElementById('bnav')?.classList.remove('has-sheet');
  document.querySelectorAll('#bnav .bnav-item').forEach(a => { a.classList.remove('is-sheet'); if (a.hasAttribute('aria-expanded')) a.setAttribute('aria-expanded', 'false'); });
  if (opener?.isConnected && !ov.contains(document.activeElement) && document.activeElement === document.body) { try { opener.focus({ preventScroll: true }); } catch {} }
}

// One row: icon tile, name (+ one line on main rows), count, ✓ on the page you're on
function _nshRow(it, kind, w) {
  const here = it.href === w.href;
  return `<li><a class="nsh-row" href="${it.href}"${here ? ' aria-current="page"' : ''}>
      <span class="nsh-ic" aria-hidden="true">${icon(it.icon, 18)}</span>
      <span class="nsh-tx"><b>${it.label}${_isGuest() ? _navLockHTML(it.href, 'nsh-lock') : ''}</b>${kind !== 'grid' && it.desc ? `<small>${it.desc}</small>` : ''}</span>
      <span class="nsh-cnt" data-nsh-n="${it.href}" data-kind="${kind}">${_nshNum(it, kind)}</span>
      ${here ? `<span class="nsh-tick" aria-hidden="true">${icon('check', 16)}</span>` : ''}</a></li>`;
}
function _nshHTML(k) {
  const t = SHELL_TABS.find(x => x.k === k), S = t.sheet, w = shellWhere(), items = _shellItems(t);
  const p = window._navUserProfile || {}, name = p.username || '', av = safeURL(p.avatar_url);
  const guest = _isGuest();
  const head = S.account && guest
    ? `<div class="nsh-acct is-guest"><span class="nsh-av" aria-hidden="true">${icon('user', 20)}</span><span class="nsh-who"><b class="nsh-t" id="nshT">Browsing as a guest</b><small>Your profile preview, lists and notes</small></span></div>`
    : S.account
    ? `<a class="nsh-acct" href="profile.html"${w.href === 'profile.html' ? ' aria-current="page"' : ''}><span class="nsh-av" aria-hidden="true">${av ? `<img src="${av}" alt="">` : escHTML((name || '?')[0].toUpperCase())}</span>
        <span class="nsh-who"><b class="nsh-t" id="nshT" translate="no">${escHTML(p.display_name || name || 'You')}</b><small translate="no">@${escHTML(name)}</small></span></a>`
    : `<h2 class="nsh-t" id="nshT">${t.label}</h2><p class="nsh-sub">${S.sub}</p>`;
  const groups = S.groups.map(([label, kind, hrefs]) => {
    const list = hrefs.map(h => items.find(it => it.href === h)).filter(Boolean);
    return `<div class="nsh-grp">${label ? `<p class="nsh-gl" id="nshG-${k}-${label.replace(/\W/g, '')}">${label}</p>` : ''}
      <ul class="nsh-list is-${kind}"${label ? ` aria-labelledby="nshG-${k}-${label.replace(/\W/g, '')}"` : ''}>${list.map(it => _nshRow(it, kind, w)).join('')}</ul></div>`;
  }).join('');
  const foot = S.account && guest ? `<div class="nsh-foot"><a class="nsh-fbtn nsh-row is-main" href="login.html#signup">${icon('sparkles', 16)}<span>Create account</span></a>
      <a class="nsh-fbtn nsh-row" href="login.html">${icon('user', 16)}<span>Sign in</span></a></div>`
    : S.account ? `<div class="nsh-foot"><a class="nsh-fbtn nsh-row" href="settings.html"${_navFile(location) === 'settings.html' ? ' aria-current="page"' : ''}>${icon('settings', 16)}<span>Settings</span></a>
      <button type="button" class="nsh-fbtn nsh-row is-out" onclick="shellSheetClose();handleLogout()">${icon('logout', 16)}<span>Sign out</span></button></div>` : '';
  return `<div class="nsh-head">${head}</div><div class="nsh-nav" role="navigation" aria-label="${t.label}">${groups}</div>${foot}`;
}

/* Counts: grey for totals, a red pill only when something's waiting (requests, unread, invites).
   Two-column rows show only the red ones. */
function _nshNum(it, kind) {
  const S = _shellSum || {}, C = _nshC || {}, msg = typeof _navMsgCount !== 'undefined' ? _navMsgCount : 0;
  const red = (n, what) => `<span class="nsh-red">${n > 99 ? '99+' : n}<span class="sr-only"> ${what}</span></span>`;
  if (it.req && _bnavReq > 0) return red(_bnavReq, _bnavReq === 1 ? 'request waiting' : 'requests waiting');
  if (it.msg && msg > 0) return red(msg, 'unread');
  if (it.waiting && C[it.waiting] > 0) return red(C[it.waiting], C[it.waiting] === 1 ? 'invite waiting' : 'invites waiting');
  if (kind === 'grid') return '';
  let n = null;
  if (it.count === 'all') n = S.counts?.all;
  else if (it.count === 'friends') n = S.friends;
  else if (it.n === 'medals') { try { n = localStorage.getItem('mss_medals_' + window._navUser?.id); } catch {} }
  else if (it.n) n = C[it.n];
  return n == null || n === '' || Number(n) === 0 && it.n === 'medals' ? '' : `<span class="sr-only">, </span>${Number(n).toLocaleString(MSSI18n.locale)}`;
}
function _nshPaintCounts() {
  if (!_nsh || _nsh.k === 'create') return;
  const items = _shellItems(SHELL_TABS.find(x => x.k === _nsh.k));
  document.querySelectorAll('#nsh [data-nsh-n]').forEach(el => { const it = items.find(x => x.href === el.dataset.nshN); if (it) el.innerHTML = _nshNum(it, el.dataset.kind); });
}
async function _nshCountsLoad() {
  const uid = window._navUser?.id;
  if (!uid) return;
  _shellSummary().then(_nshPaintCounts);
  if (!_nshC) try { const c = JSON.parse(sessionStorage.getItem('mss_nav_counts') || 'null'); if (c?.uid === uid && Date.now() - c.at < 120000) _nshC = c.v; } catch {}
  if (_nshC) return _nshPaintCounts();
  try {
    const { data, error } = await sb.rpc('nav_counts');
    if (error) throw error;
    _nshC = data || {};
    try { sessionStorage.setItem('mss_nav_counts', JSON.stringify({ uid, at: Date.now(), v: _nshC })); } catch {}
  } catch { _nshC = {}; }   // not run yet (sql/133): no numbers on those rows
  _nshPaintCounts();
}

// ↑ ↓ (and ← →) move between rows, Home / End to the ends; Enter opens (a link)
function _nshKeys(ev) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key) || ev.target.matches('input')) return;
  const rows = [...document.querySelectorAll('#nsh .nsh-row')], i = rows.indexOf(document.activeElement);
  if (!rows.length) return;
  ev.preventDefault();
  const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? rows.length - 1
    : i < 0 ? 0 : (i + (ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : rows.length - 1)) % rows.length;
  rows[j].focus();
}
// Swipe the sheet down to close it (from the handle / header, or anywhere once its list is at the top)
function _nshSwipe(card) {
  let y0 = null, dy = 0, t0 = 0;
  card.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1 || (card.scrollTop > 0 && !ev.target.closest('.nsh-grab, .nsh-head'))) { y0 = null; return; }
    y0 = ev.touches[0].clientY; dy = 0; t0 = Date.now();
  }, { passive: true });
  card.addEventListener('touchmove', ev => {
    if (y0 == null) return;
    dy = Math.max(0, ev.touches[0].clientY - y0);
    if (dy > 0) { card.style.transition = 'none'; card.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  const end = () => {
    if (y0 == null) return;
    const fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.5;
    card.style.transition = ''; card.style.transform = '';
    if (dy > 90 || fast) shellSheetClose();
    y0 = null;
  };
  card.addEventListener('touchend', end); card.addEventListener('touchcancel', end);
}

/* The bottom bar's Library / Social / You: tap → the sheet, long-press → the area's main page */
let _bnavLong = 0;
function _bnavTap(e, k) {
  e.preventDefault();
  if (Date.now() - _bnavLong < 800) return false;        // the long-press already went there
  shellSheet(k, e.currentTarget, e.detail === 0);
  return false;
}
function _bnavLongInit(bar) {
  let timer = 0, x0 = 0, y0 = 0;
  const stop = () => clearTimeout(timer);
  bar.addEventListener('pointerdown', ev => {
    const a = ev.target.closest('.bnav-item[aria-haspopup]');
    if (!a || ev.button) return;
    x0 = ev.clientX; y0 = ev.clientY;
    timer = setTimeout(() => { _bnavLong = Date.now(); shellSheetClose(); location.href = a.getAttribute('href'); }, 500);
  });
  bar.addEventListener('pointermove', ev => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 10) stop(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => bar.addEventListener(n, stop));
  bar.addEventListener('contextmenu', ev => { if (ev.target.closest('.bnav-item[aria-haspopup]')) ev.preventDefault(); });
}

/* ═════════ Create, from the round + (phones / tablets) ═════════
   In the same sheet: a search (TMDB — Add opens the Add panel with the title picked), Write a note ·
   New list · New poll (the Create menu's actions), and Recent — the last 5 titles you added from here,
   kept on this device. */
const _NSH_RECENT = 'mss_create_recent';
const _nshRecent = () => { try { return JSON.parse(localStorage.getItem(_NSH_RECENT) || '[]').slice(0, 5); } catch { return []; } };
let _nshFound = [];
const _nshMeta = r => `${r.media_type === 'movie' ? 'Movie' : 'TV Show'}${(r.release_date || r.first_air_date || '').slice(0, 4) ? ' · ' + (r.release_date || r.first_air_date).slice(0, 4) : ''}`;
function _nshResRow(r, i, from) {
  const t = r.media_type === 'movie' ? r.title : r.name, p = r.poster_path ? TMDB_IMG + r.poster_path : null;
  return `<li class="nsh-res"><span class="nsh-res-p" aria-hidden="true">${p ? `<img src="${p}" alt="" loading="lazy">` : ''}</span>
    <span class="nsh-tx"><b translate="no">${escHTML(t || '—')}</b><small>${_nshMeta(r)}</small></span>
    <button type="button" class="nsh-add" onclick="_nshAdd('${from}', ${i})" aria-label="Add ${escHTML(t || '')}">${icon('plus', 14)}<span>Add</span></button></li>`;
}
function _nshCreateHTML() {
  const rec = _nshRecent();
  return `<div class="nsh-head nsh-chead"><h2 class="nsh-t" id="nshT">Create</h2>
      <button type="button" class="nsh-x" onclick="shellSheetClose()" aria-label="Close">${icon('x', 18)}</button></div>
    <div class="nsh-search" role="search"><span aria-hidden="true">${icon('search', 16)}</span>
      <input id="nshQ" type="search" placeholder="Add a title — type to search" aria-label="Add a title — type to search" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" data-1p-ignore data-lpignore="true"></div>
    <p class="nsh-status sr-only" id="nshStatus" role="status"></p>
    <ul class="nsh-results" id="nshResults" aria-label="Search results" hidden></ul>
    <div class="nsh-tiles" id="nshTiles">${SHELL_CREATE.filter(([k]) => k !== 'title').map(([k, ic, label]) =>
      `<button type="button" class="nsh-tile nsh-row" onclick="shellSheetClose();_bnavDo('${k}')"><span class="nsh-tile-ic" aria-hidden="true">${icon(ic, 17)}</span><span>${label}</span></button>`).join('')}</div>
    ${rec.length ? `<div class="nsh-grp" id="nshRecent"><p class="nsh-gl" id="nshRecentH">Recent</p><ul class="nsh-results" aria-labelledby="nshRecentH">${rec.map((r, i) => _nshResRow(r, i, 'recent')).join('')}</ul></div>` : ''}`;
}
function _nshCreateInit() {
  const q = document.getElementById('nshQ'), out = document.getElementById('nshResults'), status = document.getElementById('nshStatus');
  let timer = 0, last = '';
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const v = q.value.trim();
    const quiet = !v;
    document.getElementById('nshTiles').hidden = !quiet;
    const rec = document.getElementById('nshRecent'); if (rec) rec.hidden = !quiet;
    if (quiet) { out.hidden = true; out.innerHTML = ''; last = ''; return; }
    timer = setTimeout(async () => {
      if (v === last) return;
      last = v;
      out.hidden = false;
      out.innerHTML = '<li class="nsh-res is-msg">Searching…</li>';
      const res = (await _tmdbSearch(v, 8)).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
      if (q.value.trim() !== v) return;
      _nshFound = res;
      out.innerHTML = res.length ? res.map((r, i) => _nshResRow(r, i, 'found')).join('') : '<li class="nsh-res is-msg">No titles found. Try another name.</li>';
      status.textContent = res.length ? `${res.length} result${res.length === 1 ? '' : 's'}` : 'No titles found';
    }, 300);
  });
}
function _nshAdd(from, i) {
  const r = (from === 'recent' ? _nshRecent() : _nshFound)[i];
  if (!r) return;
  const keep = { id: r.id, media_type: r.media_type, title: r.title, name: r.name, release_date: r.release_date, first_air_date: r.first_air_date, poster_path: r.poster_path, genre_ids: r.genre_ids };
  try { localStorage.setItem(_NSH_RECENT, JSON.stringify([keep, ..._nshRecent().filter(x => !(x.id === r.id && x.media_type === r.media_type))].slice(0, 5))); } catch {}
  shellSheetClose();
  openAddModal('', keep);
}

/* ═════════ Footer ═════════ */
const SHELL_FOOTER = [
  ['Explore', [['Home', 'index.html'], ['Discover', 'discover.html'], ['What’s Popular', 'discover-list.html?list=popular'],
    ['Top 250 Movies', 'discover-list.html?list=top250_movies'], ['Top 250 Shows', 'discover-list.html?list=top250_shows'],
    ['Top 250 Anime', 'discover-list.html?list=top250_anime'], ['Top Rated on MSF', 'discover-list.html?list=top_rated_mss'],
    ['Upcoming Movies', 'discover-list.html?list=upcoming_movies']]],
  ['Your folio', [['Library', 'library.html'], ['TV Shows', 'tv-shows.html'], ['Movies', 'movies.html'], ['Anime', 'anime.html'],
    ['Cartoons', 'cartoons.html'], ['Diary', 'diary.html'], ['Profile', 'profile.html']]],
  ['Social', [['Friends', 'friends.html'], ['Activity', 'activity.html'], ['Messages', 'messages.html'], ['Compare', 'compare.html'],
    ['Blend', 'blend.html'], ['Movie Night', 'movie-night.html'], ['Challenges', 'challenges.html'], ['Polls', 'polls.html'],
    ['Episode Chat', 'episode-chat.html']]],
];
// Phones: the footer stays short — these, the Light / Dark switch and "More links" for the rest
const SHELL_FOOTER_QUICK = [['Discover', 'discover.html'], ['Library', 'library.html'], ['Friends', 'friends.html'], ['Profile', 'profile.html'], ['Settings', 'settings.html']];
// Help & Guides (guide.js), Set up your folio and the welcome again (onboarding.js) — the footer's Help column and Settings › Help
function mssHelp(what) {
  if (what === 'guide') mssLoadScript('js/guide.js').then(() => typeof MSSGuide !== 'undefined' && MSSGuide.open());
  else if (!window._navUser) mssJoin('set up your folio');
  else mssLoadScript('js/onboarding.js').then(() => typeof MSSOnboarding !== 'undefined' && (what === 'welcome' ? MSSOnboarding.welcome() : MSSOnboarding.setup()));
  return false;
}
function _shellFooterMore(btn) {
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', open);
  btn.innerHTML = `${open ? 'Fewer links' : 'More links'} ${icon(open ? 'chevup' : 'chevdown', 14)}`;
  btn.closest('.site-footer').classList.toggle('is-open', open);
}
/* The MSF monogram, drawn inline (no file to wait for, so it's there the moment the header is — an external
   <use> could miss a page change, Safari especially). Colours: the theme's --logo-m / --logo-s / --logo-f
   (css/theme.css), so it follows Light / Dark with the page; the footer sets the dark ones (it's Forest in both).
   Same drawing as icons/logo-light.svg / logo-dark.svg (frame 20 61 467 198). */
const MSF_LOGO_PATHS = '<path style="fill:var(--logo-m)" fill-rule="evenodd" d="M88.01 251.36L88.01 144.40C88.01 143.66 88.93 143.32 89.41 143.88L144.25 208.00C145.11 209.01 146.65 209.04 147.54 208.07L205.06 146.16C205.37 145.83 205.60 147.20 206.04 147.09C210.48 146.02 216.18 154.26 219.50 156.62C228.03 162.68 240.45 167.62 250.72 168.80L267.35 170.72C302.46 174.76 301.02 209.01 273.88 209.01L203.32 209.01C200.54 209.01 197.89 210.16 196.00 212.20L156.63 254.57C155.78 255.49 156.43 256.99 157.69 256.99L272.26 256.99C293.68 256.99 325.00 240.33 325.00 216.21L325.00 158.71C325.00 145.47 289.65 137.58 279.71 136.43L260.01 134.16C241.78 132.06 239.24 109.29 256.41 102.33C257.92 101.72 261.46 100.01 262.75 100.01L315.64 100.01C318.42 100.01 321.08 98.86 322.97 96.82L351.27 66.36C351.75 65.84 351.38 65.01 350.69 65.01L258.83 65.01C256.47 65.01 253.22 63.03 251.64 63.03L230.14 63.03C218.61 63.03 204.22 70.99 196.45 79.36L146.30 133.33C145.78 133.89 144.90 133.90 144.36 133.35L79.95 67.05C78.06 65.11 75.47 64.01 72.77 64.01L29.37 64.01C24.23 64.01 20.06 68.18 20.06 73.32L20.06 251.34C20.06 255.49 23.43 258.85 27.58 258.85L80.52 258.85C84.65 258.85 88.01 255.50 88.01 251.36Z M41.88 190.89H55.23A4 4 0 0 1 59.23 194.89V209.22A4 4 0 0 1 55.23 213.22H41.88A4 4 0 0 1 37.88 209.22V194.89A4 4 0 0 1 41.88 190.89Z M41.88 163.17H55.23A4 4 0 0 1 59.23 167.17V181.50A4 4 0 0 1 55.23 185.50H41.88A4 4 0 0 1 37.88 181.50V167.17A4 4 0 0 1 41.88 163.17Z M41.88 135.45H55.23A4 4 0 0 1 59.23 139.45V153.78A4 4 0 0 1 55.23 157.78H41.88A4 4 0 0 1 37.88 153.78V139.45A4 4 0 0 1 41.88 135.45Z M41.88 107.72H55.23A4 4 0 0 1 59.23 111.72V126.05A4 4 0 0 1 55.23 130.05H41.88A4 4 0 0 1 37.88 126.05V111.72A4 4 0 0 1 41.88 107.72Z M41.88 80.00H55.23A4 4 0 0 1 59.23 84.00V98.33A4 4 0 0 1 55.23 102.33H41.88A4 4 0 0 1 37.88 98.33V84.00A4 4 0 0 1 41.88 80.00Z"/><path style="fill:var(--logo-s)" d="M327.00 216.38L327.00 158.89C327.00 144.10 290.62 135.73 279.63 134.47L259.69 132.17C240.21 129.93 244.17 102.01 263.05 102.01L316.06 102.01C318.84 102.01 321.49 100.86 323.38 98.82L354.61 65.21C355.38 64.38 354.79 63.04 353.66 63.04L258.50 63.04C256.83 63.04 254.73 63.14 252.97 63.14L230.97 63.14C230.37 63.14 232.17 63.37 232.74 63.57C233.15 63.71 231.03 63.87 231.47 63.87L249.46 63.87C250.06 63.87 248.26 64.26 247.91 64.74C247.21 65.67 245.10 66.05 244.08 66.44C240.04 67.99 236.05 69.73 232.28 71.85C221.20 78.07 212.36 87.49 206.63 98.80C193.08 125.50 205.41 159.57 236.12 167.00L252.00 170.84C263.67 173.67 278.42 171.33 287.70 180.59C295.93 188.81 290.92 207.27 277.89 207.27L202.77 207.27C199.99 207.27 197.34 208.42 195.44 210.46L153.78 255.30C152.56 256.62 153.49 258.75 155.28 258.75L272.49 258.75C294.45 258.75 327.00 241.05 327.00 216.38Z"/>'
  + '<path style="fill:var(--logo-f)" d="M407.28 220.21L407.28 176.33C407.28 175.25 408.14 174.39 409.22 174.39L459.41 174.39C462.46 174.39 464.94 171.91 464.94 168.86L464.94 138.63C464.94 135.25 462.19 132.51 458.81 132.51L390.75 132.51C372.76 132.51 371.26 103.30 392.21 103.30L458.60 103.30C462.02 103.30 465.20 101.56 467.03 98.68L486.35 68.36C487.85 66.01 486.16 62.93 483.38 62.93L384.72 62.93C352.63 62.93 303.51 127.35 340.35 151.31L386.71 181.45C392.82 185.42 392.76 194.40 386.59 198.29L339.05 228.30C338.45 228.68 337.88 229.12 337.38 229.63L309.82 256.73C309.07 257.46 309.59 258.73 310.64 258.73L366.62 258.73C384.91 258.73 407.28 239.07 407.28 220.21Z"/><path style="fill:var(--logo-m)" d="M340.55 218.25L380.13 193.26C382.52 191.75 382.55 188.27 380.17 186.72L340.90 161.19C338.37 159.54 335.01 161.36 335.01 164.38L335.01 215.19C335.01 218.03 338.15 219.76 340.55 218.25Z"/>';
function mssLogoSVG(cls, label) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="${cls}" viewBox="20 61 467 198" ${a11y} focusable="false">${MSF_LOGO_PATHS}</svg>`;
}
function _shellFooterEl() {
  const f = document.createElement('footer');
  f.className = 'site-footer';
  f.innerHTML = `<div class="ft-in">
      <div class="ft-brand">${mssLogoSVG('ft-logo', 'MyScreenFolio')}<p>Everything you watch, in one folio. Track it, rate it, rank it, share it.</p>${mssSocialHTML('ft-social')}</div>
      <div class="ft-quick" role="navigation" aria-label="Main links"><ul>${SHELL_FOOTER_QUICK.map(([l, href]) =>
          `<li><a href="${href}">${l}</a></li>`).join('')}<li><a href="#" onclick="return mssHelp('guide')">Help</a></li></ul>
        <div class="ft-quick-row">${mssThemeSwitch()}<button type="button" class="ft-more" aria-expanded="false" aria-controls="ftCols" onclick="_shellFooterMore(this)">More links ${icon('chevdown', 14)}</button></div></div>
      <div class="ft-cols" id="ftCols" role="navigation" aria-label="Footer">${SHELL_FOOTER.map(([h, links], i) => `<div class="ft-col"><div class="ft-h" id="ftH${i}">${h}</div>
        <ul aria-labelledby="ftH${i}">${links.map(([l, href]) => `<li><a href="${href}">${l}${_navLockHTML(href, 'ft-lock')}</a></li>`).join('')}</ul></div>`).join('')}
        <div class="ft-col"><div class="ft-h" id="ftH4">Help</div>
          <ul aria-labelledby="ftH4"><li><a href="#" onclick="return mssHelp('guide')">Help &amp; Guides</a></li><li class="nav-auth-only"><a href="#" onclick="return mssHelp('setup')">Set up your folio</a></li>
            <li class="nav-auth-only"><a href="#" onclick="return mssHelp('welcome')">Watch the welcome again</a></li></ul></div>
        <div class="ft-col"><div class="ft-h" id="ftH5">MyScreenFolio</div>
          <ul aria-labelledby="ftH5"><li><a href="about.html">About us</a></li><li><a href="contact.html">Contact</a></li><li><a href="privacy.html">Privacy Policy</a></li>
            <li><a href="terms.html">Terms of Service</a></li><li><a href="cookies.html">Cookie Policy</a></li>
            <li><a href="#" onclick="MSSConsent.open(); return false">Cookie settings</a></li></ul></div>
        <div class="ft-col"><div class="ft-h" id="ftH3">Appearance</div>
          <div class="ft-theme">${mssThemeSwitch('ftH3')}</div>
          <ul aria-labelledby="ftH3"><li><a href="settings.html">Settings${_navLockHTML('settings.html', 'ft-lock')}</a></li><li><a href="export.html">Export${_navLockHTML('export.html', 'ft-lock')}</a></li></ul></div>
      </div>
    </div>
    <div class="ft-bottom"><span>Created by <b translate="no">Mohammad &amp; Narimaan</b> · © 2026 MyScreenFolio</span>
      <a href="https://www.themoviedb.org" target="_blank" rel="noopener" class="ft-tmdb">Movie &amp; TV data from <b>TMDB</b>. This product uses the TMDB API but is not endorsed or certified by TMDB.</a></div>`;
  return f;
}

/* ── Add new entry (+ Add, the + menu, empty states, N): a side panel S, or a full page that slides up.
   Search TMDB first, then Category and Status as one-tap choices; the Year fills in from the title.
   Add → stays here (toast with Open) · Add & edit → → the full edit page. Same checks as always:
   category + status required, the duplicate check (quickCreate). ── */
const ADD_CATS = [['tv', 'TV Show'], ['movies', 'Movie'], ['anime', 'Anime'], ['cartoons', 'Cartoon']];
// [value, label, icon, what it means]
const ADD_STATUSES = [['queue', 'Watchlist', 'bookmark', 'You want to watch it'], ['up_next', 'Up Next', 'skipForward', 'You’re watching it next'],
  ['watching', 'Currently Watching', 'play', 'You’re watching it now'], ['paused', 'Taking a Break', 'pause', 'Started, paused for now'],
  ['completed', 'Watched', 'check', 'You’ve finished it'], ['ongoing', 'To Be Continued', 'clock', 'Caught up, waiting for more'],
  ['dropped', 'Dropped', 'drop', 'You stopped watching']];
let _add = null;          // { h, cat, status, picked } while the panel is open
let _addBody = null;      // built once (the TMDB search is tied to its title field), filled fresh each time
function _addStatusHTML() {
  const movie = _add.cat === 'movies';
  // movies have no Taking a Break / To Be Continued
  if (movie && (_add.status === 'paused' || _add.status === 'ongoing')) _add.status = 'watching';
  const list = ADD_STATUSES.filter(([v]) => !movie || (v !== 'paused' && v !== 'ongoing'));
  return `<div class="lyr-choices is-tiles is-compact" role="radiogroup" aria-labelledby="mStatusH">${list.map(([v, l, ic, hint], i) => {
    const on = v === _add.status;
    return `<div class="lyr-choice${on ? ' is-on' : ''}"><button type="button" class="lyr-choice-main" role="radio" data-status="${v}" aria-checked="${on}" tabindex="${on || (!_add.status && !i) ? 0 : -1}">
      <span class="lyr-tile-ic" aria-hidden="true">${icon(ic, 17)}</span><span class="lyr-tile-txt"><b>${escHTML(l)}</b><small>${escHTML(hint)}</small></span></button></div>`;
  }).join('')}</div>`;
}
function _addBuild() {
  _addBody = document.createElement('div');
  _addBody.className = 'add-form';
  _addBody.innerHTML = `
    <div class="lyr-sec"><label class="lyr-sec-h" for="mTitle">Title</label>
      <div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input class="lyr-field" id="mTitle" placeholder="Search or type a title…" autocomplete="off" enterkeyhint="search"></div></div>
    <div class="lyr-sec"><h3 class="lyr-sec-h" id="mCatH">Category</h3><div id="mCatWrap"></div></div>
    <div class="lyr-sec"><h3 class="lyr-sec-h" id="mStatusH">Status</h3><div id="mStatusWrap"></div></div>
    <div class="lyr-sec"><label class="lyr-sec-h" for="mYear">Year</label>
      <input class="lyr-field" id="mYear" type="number" inputmode="numeric" min="1900" max="2030" placeholder="e.g. 2024" aria-describedby="mYearHint">
      <p class="lyr-hint" id="mYearHint" hidden>Filled in from the title you picked</p></div>`;
  _addBody.addEventListener('click', ev => {
    const st = ev.target.closest('[data-status]');
    if (st) {
      _add.status = st.dataset.status;
      _addBody.querySelectorAll('[data-status]').forEach(x => { const on = x === st; x.setAttribute('aria-checked', on); x.tabIndex = on ? 0 : -1; x.parentElement.classList.toggle('is-on', on); });
    }
    const b = ev.target.closest('#mCatWrap .lyr-seg-opt');
    if (b) { _add.cat = mssSegPick(b); _addPaintStatus(); }
    if (st || b) _addValidate();
  });
  _addBody.querySelector('#mTitle').addEventListener('input', () => { _add.picked = false; window._tmdbPrefill = null; _addBody.querySelector('#mYearHint').hidden = true; _addValidate(); });
}
function _addPaintStatus() {
  const focused = document.activeElement?.closest('#mStatusWrap');
  _addBody.querySelector('#mStatusWrap').innerHTML = _addStatusHTML();
  if (focused) _addBody.querySelector('#mStatusWrap [tabindex="0"]')?.focus();
}
// Add and Add & edit stay disabled until a title, a category and a status are set
function _addValidate() {
  if (!_add) return;
  const ok = !!(_addBody.querySelector('#mTitle').value.trim() && (_add.cat || window._tmdbPrefill?.cat) && _add.status);
  _add.h.setPrimary({ disabled: !ok });
  const add = _add.h.body.closest('.lyr-card').querySelector('.lyr-foot .add-only');
  if (add) add.disabled = !ok;
}
// tmdb: a TMDB search result to start from (Create's search / Recent) — picked as if chosen in the panel's own search
async function openAddModal(cat, tmdb) {
  const user = await getCurrentUser();
  if (!user) { mssJoin('add titles'); return; }
  await mssLoadScript('js/panel.js');
  const first = !_addBody;
  if (first) _addBuild();
  window._tmdbPrefill = null;
  _add = { cat: cat || '', status: '', picked: false };
  _addBody.querySelector('#mTitle').value = '';
  _addBody.querySelector('#mYear').value = '';
  _addBody.querySelector('#mYearHint').hidden = true;
  _addBody.querySelector('#mCatWrap').innerHTML = mssSegHTML({ labelledby: 'mCatH', options: ADD_CATS, value: _add.cat });
  _addBody.querySelector('#mStatusWrap').innerHTML = _addStatusHTML();
  const h = MSSPanel.open({ size: 'S', kind: 'generic', create: true, title: 'Add new entry', subtitle: 'Search, then choose where it goes', body: _addBody,
    footer: { secondary: [{ label: 'Cancel', only: 'page', onClick: x => x.close() }, { label: 'Add', end: true, onClick: () => modalQuickCreate(false) }],
              primary: { label: 'Add & edit →', disabled: true, onClick: () => modalQuickCreate(true) } },
    dirty: () => !!_add?.picked,
    onClose: () => { if (_add?.h === h) _add = null; } });
  _add.h = h;
  h.body.closest('.lyr-card').querySelector('.lyr-foot [data-i="1"]').classList.add('add-only');
  _addValidate();
  if (first) _initTMDBOnModal();
  if (!tmdb) { setTimeout(() => _addBody.querySelector('#mTitle').focus({ preventScroll: true }), 60); return; }
  _addBody.querySelector('#mTitle').value = (tmdb.media_type === 'movie' ? tmdb.title : tmdb.name) || '';
  try {
    const detail = tmdb.media_type === 'movie' ? await _tmdbMovie(tmdb.id) : await _tmdbTV(tmdb.id);
    if (_add?.h === h) _addPicked(_tmdbToEntry(tmdb, detail));
  } catch { showToast('Couldn’t load that title’s details — search for it here.', 'err'); }
}

/* TMDB search on the title field: any type until a category is chosen */
function _initTMDBOnModal() {
  if (typeof initTMDBSearch !== 'function') return;
  initTMDBSearch('mTitle', () => _add?.cat || '', _addPicked, { connected: true });
}
function _addPicked(entry) {
    if (!_add) return;
    if (entry.title) document.getElementById('mTitle').value = entry.title;
    if (entry.cat) { _add.cat = entry.cat; const b = _addBody.querySelector(`#mCatWrap [data-v="${entry.cat}"]`); if (b) mssSegPick(b); }
    if (entry.year) { document.getElementById('mYear').value = entry.year; document.getElementById('mYearHint').hidden = false; }
    _addPaintStatus();
    // the FULL entry, so the edit page can fill in every field
    window._tmdbPrefill = entry;
    _add.picked = true;
    _addValidate();
}

/* ── Create it: edit → the full edit page; otherwise stay here with a toast that opens it ── */
async function modalQuickCreate(edit) {
  if (!_add) return;
  const h = _add.h, title = document.getElementById('mTitle')?.value?.trim();
  if (!title) { h.fieldError(document.getElementById('mTitle'), 'Type or pick a title.'); return; }
  const catVal = window._tmdbPrefill?.cat || _add.cat, statusVal = _add.status;
  if (!catVal || !statusVal) return;
  const user = await getCurrentUser();
  if (!user) return;
  const addBtn = h.body.closest('.lyr-card').querySelector('.lyr-foot .add-only');
  const busy = on => { h.busy(on); if (addBtn) { addBtn.disabled = on; addBtn.textContent = on && !edit ? 'Adding…' : 'Add'; } if (!on) _addValidate(); };
  busy(true);
  // If a TMDB result was just clicked, its runtime/season detail fetch may still
  // be in flight — wait for it so we never save without that data.
  if (window._tmdbSelectionInFlight) { try { await window._tmdbSelectionInFlight; } catch (e) { /* ignore, fall back to manual fields */ } }
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
      cat:           catVal,
      status:        statusVal,
      year:          prefill.year          || document.getElementById('mYear')?.value || null,
      description:   prefill.description   || null,
      genres:        mssGenreList(prefill.genres),
      poster_url:    prefill.poster_url    || null,
      total_seasons: prefill.total_seasons || null,
      total_eps:     prefill.total_eps     || null,
      runtime_h:     prefill.runtime_h     || null,
      runtime_m:     prefill.runtime_m     || null,
      tmdb_id:       prefill.tmdb_id       || null,
      tmdb_type:     prefill.tmdb_type     || null,
      ratings:       Object.keys(ratings).length ? ratings : null,
    }, user.id);

    h.closeNow();
    const page = CAT_META[entry.cat]?.page || 'index.html';
    if (!edit) {
      window._tmdbPrefill = null;
      showActionToast(`Added ${entry.title || title}`, 'Open', () => goToDetail(entry.id, page), 6000);
      return;
    }
    // Pass remaining TMDB prefill data to detail page
    if (window._tmdbPrefill) {
      sessionStorage.setItem('tmdbPrefill', JSON.stringify(window._tmdbPrefill));
      window._tmdbPrefill = null;
    }
    goToDetail(entry.id, page);
  } catch(e) {
    busy(false);
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
  if (e.key === '/' && plainKey && !MSSDialog.top()) {
    e.preventDefault();
    mssOpenSearch();
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
    if (_mssLocks.size || MSSDialog.top() || e.target.closest('.hc-card, .modal-wrap, [class*="overlay"], .bnav')) return;
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

// TMDB goes through our own Supabase Edge Function (supabase/functions/tmdb): it adds the
// TMDB key on the server, so the key is never in these files or in anyone's browser.
// Same paths and parameters as TMDB's own API — just no api_key.
const TMDB_BASE = `${SUPABASE_URL}/functions/v1/tmdb`;
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
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?language=en-US`);
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

/* ── AniList GraphQL query ── */
// Private pages (<html data-no-anilist>) never contact AniList, and nor does anyone who hasn't allowed
// Extra sources (Cookie settings, consent.js)
const _mssAniListOff = () => 'noAnilist' in document.documentElement.dataset || (typeof MSSConsent !== 'undefined' && !MSSConsent.allows('outside'));
async function _anilistSearch(query) {
  if (_mssAniListOff()) return [];
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
  try {
    const url = `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
    const res = await tmdbFetch(url);
    if (!res.ok) { console.error('[TMDB] search failed:', res.status); return []; }
    const json = await res.json();
    const allowed = includePersons ? ['movie', 'tv', 'person'] : ['movie', 'tv'];
    return (json.results || []).filter(r => allowed.includes(r.media_type)).slice(0, limit);
  } catch(e) { console.error('[TMDB] fetch error:', e); return []; }
}

/* ── People on TMDB for the favourite-people lists (profile editor, Set up your folio): dept puts people known for it
   first ('Acting' · 'Directing'); gender keeps only Actors (2) or Actresses (1); skip = ids already picked ── */
async function mssPersonSearch(q, { dept, gender, skip } = {}) {
  let hits = [];
  try {
    const r = await tmdbFetch(`${TMDB_BASE}/search/person?query=${encodeURIComponent(q.trim())}&language=en-US&include_adult=false&page=1`);
    hits = r.ok ? ((await r.json()).results || []) : [];
  } catch {}
  const taken = new Set((skip || []).map(Number));
  return hits.filter(x => !taken.has(Number(x.id)) && (!gender || Number(x.gender) === gender))
    .sort((a, b) => (b.known_for_department === dept) - (a.known_for_department === dept) || (b.popularity || 0) - (a.popularity || 0)).slice(0, 20);
}
// a TMDB person → how the favourite-people lists save them
const mssPersonItem = x => ({ id: Number(x.id), name: x.name, path: x.profile_path || null,
  known: (x.known_for || []).map(k => k.title || k.name).filter(Boolean)[0] || null, gender: Number(x.gender) || 0 });

/* ── Fetch TV detail (seasons/episodes) ── */
async function _tmdbTV(id) {
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?language=en-US`);
    const data = await res.json();

    // Episode counts per season — only what has AIRED (announced seasons don't count yet: mssAired)
    const aired = mssAired(data);
    data._season_breakdown = aired.breakdown;
    data._aired_seasons = aired.seasons; data._aired_eps = aired.eps;

    return data;
  } catch { return null; }
}

/* ── Fetch Movie detail (runtime) ── */
async function _tmdbMovie(id) {
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/movie/${id}?language=en-US`);
    return await res.json();
  } catch { return null; }
}

/* ── Map TMDB result → entry fields ── */
function _tmdbToEntry(result, detail) {
  const isMovie = result.media_type === 'movie';
  const genres  = mssGenreNames(result.genre_ids).slice(0, 5);
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
      entry.total_seasons = detail._aired_seasons ?? detail.number_of_seasons ?? null;   // aired only (mssAired)
      entry.total_eps     = detail._aired_eps ?? detail.number_of_episodes ?? null;
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
  const genres = mssGenreList(media.genres).slice(0, 5);
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
   Dropdown mutual exclusivity — opening any
   dropdown (search results, sel-dd, etc.) closes
   whatever other dropdown was already open.
══════════════════════════════════════════ */
function _closeAllDropdownsExcept(exceptId) {
  document.querySelectorAll('.tmdb-dropdown.open').forEach(el => {
    if (el.id !== exceptId) { el.classList.remove('open'); el.innerHTML = ''; }
  });
  document.querySelectorAll('.td-dd.open').forEach(el => {
    if (el.id !== exceptId) el.classList.remove('open');
  });
}

/* ══════════════════════════════════════════
   sel-dd — a select-like button whose options open in the shared
   popover (MSSPopover: a menu under it; on phones a page of rows)
   options: [{value,label}], selected: current value; onchangeFn: a
   global function's name, called with the value picked
   Reads back via document.getElementById(id).dataset.value
══════════════════════════════════════════ */
const _selDDOptions = {};
function _selDDHTML(id, options, selected, onchangeFn, placeholder) {
  const selOpt = options.find(o => o.value === selected);
  const usePlaceholder = !selOpt && placeholder;
  const label = selOpt ? selOpt.label : (usePlaceholder ? placeholder : options[0].label);
  const value = selOpt ? selOpt.value : (usePlaceholder ? '' : options[0].value);
  _selDDOptions[id] = options;
  return `<div class="sel-dd${usePlaceholder ? ' sel-dd-placeholder' : ''}" id="${id}" data-value="${escHTML(value)}" ${onchangeFn ? `data-onchange="${onchangeFn}"` : ''}>
    <button type="button" class="sel-dd-trigger" aria-haspopup="menu" onclick="event.stopPropagation();_selToggleDD('${id}')">
      <span class="sel-dd-label">${escHTML(label)}</span>
      <svg class="sel-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>`;
}
async function _selToggleDD(id) {
  const dd = document.getElementById(id), btn = dd?.querySelector('.sel-dd-trigger'); if (!btn) return;
  await mssLoadScript('js/panel.js');
  const cur = dd.dataset.value;
  MSSPopover.open(btn, { title: btn.textContent.trim(), label: btn.textContent.trim(),
    items: (_selDDOptions[id] || []).map(o => ({ label: o.label, icon: o.value === cur ? 'check' : null, onSelect: () => _selPickDD(id, o) })) });
}
function _selPickDD(id, o) {
  const dd = document.getElementById(id); if (!dd) return;
  dd.dataset.value = o.value;
  dd.classList.remove('sel-dd-placeholder');
  dd.querySelector('.sel-dd-label').textContent = o.label;
  const fn = window[dd.dataset.onchange];
  if (typeof fn === 'function') fn(o.value);
}

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

    const res = await tmdbFetch(`${TMDB_BASE}/tv/${entry.tmdb_id}?language=en-US`);
    if (!res.ok) return;
    const data = await res.json();

    // Aired episodes only — a season that's announced but not out yet doesn't count (mssAired)
    const aired = mssAired(data);
    const newBreakdown = aired.breakdown;
    const newTotalSeasons = aired.seasons;
    const newTotalEps = aired.eps;
    if (!newBreakdown.length) return;
    // Latest aired episode's date — used for the "Episode: Latest/Earliest"
    // sort option, which needs to reflect how recently a show has actually
    // aired new content, not just when it was originally released.
    const newLastEpDate = data.last_episode_to_air?.air_date || null;
    // the show's usual episode length (Episode time / Total time on profiles): TMDB's, 0 when it doesn't say
    const newEpLen = Number(data.episode_run_time?.[0] || data.last_episode_to_air?.runtime || 0) || 0;

    const oldTotalSeasons = Number(entry.total_seasons) || 0;
    const oldTotalEps = Number(entry.total_eps) || 0;
    const oldLastEpDate = entry.ratings?._last_episode_date || null;
    const oldBreakdown = JSON.stringify((entry.ratings?._season_breakdown || []).map(Number));
    const hasNewData = (newTotalSeasons && newTotalSeasons !== oldTotalSeasons) ||
                        (newTotalEps && newTotalEps !== oldTotalEps) ||
                        oldBreakdown !== JSON.stringify(newBreakdown) ||
                        (newLastEpDate && newLastEpDate !== oldLastEpDate) ||
                        (newEpLen && newEpLen !== Number(entry.ratings?._ep_runtime));
    if (!hasNewData) return;

    const newRatings = { ...(entry.ratings || {}), _season_breakdown: newBreakdown, _last_episode_date: newLastEpDate || oldLastEpDate, ...(newEpLen ? { _ep_runtime: newEpLen } : {}) };
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
    if (newTotalSeasons > oldTotalSeasons && oldTotalSeasons) showToast(`${entry.title}: updated to ${newTotalSeasons} season${newTotalSeasons !== 1 ? 's' : ''}`);
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
/* Saved TMDB answers — kept on this device (Cache Storage, "tmdb-data-v1"), so asking
   again (a page you've seen, a sort or filter you've run before) costs no request at all:
   no wait, and nothing counted against the tmdb Edge Function's monthly allowance.
   How long an answer is kept depends on how fast it changes:
     searches 1 h · lists (trending, popular, discover…) 6 h · shows + seasons 1 day
     (new episodes, air dates) · movies + collections 3 days · people, genres 7 days
   Old answers are cleared once a day. If storage isn't available it just asks TMDB.
   Lists are also shared by everyone (076 · public.tmdb_cache): on a miss here, the
   site reads the shared copy straight from the database — no Edge Function call —
   and only asks the tmdb function when nobody has fetched it in the last 6 hours. */
const TMDB_STORE = 'tmdb-data-v1';
const _TMDB_HOUR = 3600e3;
function _tmdbKeep(url) {
  const p = url.slice(TMDB_BASE.length).split('?')[0];
  if (p.startsWith('/search')) return _TMDB_HOUR;
  if (/^\/(trending|discover)|^\/(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today)/.test(p)) return 6 * _TMDB_HOUR;
  if (p.startsWith('/tv/')) return 24 * _TMDB_HOUR;
  if (/^\/(movie|collection)\//.test(p)) return 3 * 24 * _TMDB_HOUR;
  return 7 * 24 * _TMDB_HOUR;
}
// Lists the same for every visitor → their key in public.tmdb_cache (same rule + key as the tmdb function)
const _TMDB_SHARED = /^\/(trending\/|discover\/|genre\/(movie|tv)\/list$|(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today)$)/;
function _tmdbShareKey(url) {
  try {
    const u = new URL(url), path = u.pathname.replace(/^.*?\/tmdb(?=\/|$)/, '');
    if (!_TMDB_SHARED.test(path)) return null;
    return path + '?' + new URLSearchParams([...u.searchParams].filter(([k]) => k !== 'api_key').sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  } catch { return null; }
}
async function _tmdbShared(key) {
  try {
    const { data } = await sb.from('tmdb_cache').select('body,saved_at').eq('key', key).maybeSingle();
    const at = data ? Date.parse(data.saved_at) : 0;
    return data && Date.now() - at < 6 * _TMDB_HOUR ? { body: JSON.stringify(data.body), at } : null;
  } catch { return null; }
}
// Request coalescing: the same address asked for again while its first request is still on
// its way (two parts of a page wanting the same show or season at once) joins that one
// request instead of sending another — each caller gets its own copy of the one answer.
const _tmdbInflight = new Map();
async function _tmdbStored(url, opts = {}) {
  if (opts.method && opts.method !== 'GET') return _tmdbQueued(url, opts);
  const id = url + (opts.cache === 'reload' ? '#reload' : '');
  let job = _tmdbInflight.get(id);
  if (!job) {
    job = _tmdbLoad(url, opts).finally(() => _tmdbInflight.delete(id));
    _tmdbInflight.set(id, job);
  }
  return (await job).clone();
}
async function _tmdbLoad(url, opts) {
  if (!('caches' in window) || (typeof MSSConsent !== 'undefined' && !MSSConsent.allows('speed'))) return _tmdbQueued(url, opts);   // Faster pages off (consent.js): nothing kept
  let box;
  try {
    box = await caches.open(TMDB_STORE);
    const hit = opts.cache === 'reload' ? null : await box.match(url);   // "Refresh info": skip what's saved
    if (hit && Date.now() - Number(hit.headers.get('x-msf-saved') || 0) < _tmdbKeep(url)) return hit;
  } catch { return _tmdbQueued(url, opts); }   // private mode / storage off
  const key = _tmdbShareKey(url), shared = key && await _tmdbShared(key);
  if (shared) {
    box.put(url, new Response(shared.body, { headers: { 'Content-Type': 'application/json', 'x-msf-saved': String(shared.at) } })).catch(() => {});
    return new Response(shared.body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const res = await _tmdbQueued(url, opts);
  if (res.ok) res.clone().blob().then(b => box.put(url, new Response(b, { headers: { 'Content-Type': 'application/json', 'x-msf-saved': String(Date.now()) } }))).catch(() => {});
  return res;
}
// "Refresh info" on a title page: forget everything this device saved about one title
// (its details, seasons, episodes — any language), so the next asks go to TMDB
async function mssTmdbForget(type, id) {
  try {
    const box = await caches.open(TMDB_STORE), head = `/${type}/${id}`;
    for (const req of await box.keys()) {
      const p = new URL(req.url).pathname.replace(/^.*?\/tmdb(?=\/|$)/, '');
      if (p === head || p.startsWith(head + '/')) await box.delete(req);
    }
  } catch {}
}
// once a day: drop answers past their time
(function _tmdbTidy() {
  try {
    if (!('caches' in window) || Date.now() - Number(localStorage.getItem('mss_tmdb_tidy') || 0) < 24 * _TMDB_HOUR) return;
    localStorage.setItem('mss_tmdb_tidy', String(Date.now()));
    setTimeout(async () => {
      try {
        const box = await caches.open(TMDB_STORE);
        for (const req of await box.keys()) {
          const r = await box.match(req);
          if (!r || Date.now() - Number(r.headers.get('x-msf-saved') || 0) > _tmdbKeep(req.url)) await box.delete(req);
        }
      } catch {}
    }, 8000);
  } catch {}
})();

async function tmdbFetch(url, opts = {}) {
  const local = MSSLang.localize(url);
  const res = await _tmdbStored(local, opts);
  if (local === url || !res.ok) return res;
  let data;
  try { data = await res.clone().json(); } catch { return res; }
  if (!_tmdbNeedsEnglish(data)) return res;
  try {
    const en = await _tmdbStored(url, opts);
    if (en.ok) _tmdbFill(data, await en.json());
  } catch { /* keep the translated response as it is */ }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/* A title's TMDB genres → the site's names (MSS_GENRES, config.js) */
const tmdbGenreNames = genres => [...new Set((genres || []).flatMap(g => _mssGenreById[g.id] || [g.name]).filter(Boolean))];
// Your own saved title, opened for the first time since this existed (095): adds the genres TMDB has
// that it's missing, once, so a genre you remove later stays removed. → the new list, or null if unchanged.
// userId: the page's signed-in user, when it knows before the nav does (default window._navUser)
async function mssSyncEntryGenres(entry, detail, userId = window._navUser?.id) {
  if (!entry?.id || !entry.tmdb_id || entry.genres_synced === true || !userId || entry.user_id !== userId || !Array.isArray(detail?.genres)) return null;
  entry.genres_synced = true;
  const have = mssGenreList(entry.genres), add = tmdbGenreNames(detail.genres).filter(g => MSS_GENRES[g] && !have.includes(g));
  const genres = [...have, ...add];
  try {
    const { error } = await sb.from('entries').update({ genres, genres_synced: true }).eq('id', entry.id).eq('user_id', entry.user_id);
    if (error) throw error;
  } catch { entry.genres_synced = false; return null; }
  entry.genres = genres;
  return add.length ? genres : null;
}

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

/* A library entry's name artwork, fetched on its own (TMDB /images, kept for the visit) → Promise<{ src, ratio } | null>.
   mssPaintLogo(el, entry): swaps a written title (el) for that artwork once it has loaded — the big backdrop cards
   (profile Top Favorites, Home's Top Favorites, the Watched podium). The name stays for screen readers; no artwork → the text stays. */
const _mssLogoAsk = {};
function mssTitleLogo(e) {
  const id = Number(e?.tmdb_id);
  if (!id || typeof tmdbFetch !== 'function' || typeof TMDB_BASE === 'undefined') return Promise.resolve(null);
  const type = e.tmdb_type || e.media_type || (e.cat === 'movies' || e.ratings?._media_type === 'movie' ? 'movie' : 'tv');
  const k = `msf_logo_${type}:${id}`;
  if (_mssLogoAsk[k]) return _mssLogoAsk[k];
  try { const c = sessionStorage.getItem(k); if (c != null) return (_mssLogoAsk[k] = Promise.resolve(JSON.parse(c))); } catch {}
  const base = (typeof MSSLang !== 'undefined' && MSSLang.code || 'en-US').split('-')[0];
  return (_mssLogoAsk[k] = tmdbFetch(`${TMDB_BASE}/${type}/${id}/images?include_image_language=${base},en,null`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { const l = d ? tmdbLogo({ images: d }) : null; try { sessionStorage.setItem(k, JSON.stringify(l)); } catch {} return l; })
    .catch(() => null));
}
function mssPaintLogo(el, e) {
  if (!el || !e || el.classList.contains('mss-logo-title')) return;
  mssTitleLogo(e).then(l => {
    if (!l || !el.isConnected || el.classList.contains('mss-logo-title')) return;
    const im = new Image(); im.className = 'mss-logo'; im.alt = ''; im.decoding = 'async';
    im.onload = () => {
      if (!el.isConnected || el.classList.contains('mss-logo-title')) return;
      const name = el.textContent;
      el.classList.add('mss-logo-title', ...(l.ratio < 1.8 ? ['mss-logo-tall'] : l.ratio > 5 ? ['mss-logo-wide'] : []));
      const sp = document.createElement('span'); sp.className = 'mss-logo-name'; sp.textContent = name;
      el.replaceChildren(im, sp);
    };
    im.src = l.src;
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
  drop.setAttribute('role', 'listbox');
  drop.setAttribute('aria-label', 'Search results');
  document.body.appendChild(drop);
  // a combobox: ↑ ↓ move through the results, Enter picks one
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', drop.id);
  input.setAttribute('aria-expanded', 'false');
  let _active = -1;
  function _setActive(i) {
    const items = [...drop.querySelectorAll('.tmdb-item')];
    if (!items.length) return;
    _active = (i + items.length) % items.length;
    items.forEach((el, k) => { el.classList.toggle('is-active', k === _active); el.setAttribute('aria-selected', k === _active); });
    input.setAttribute('aria-activedescendant', items[_active].id);
    items[_active].scrollIntoView({ block: 'nearest' });
  }

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
    _active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
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
    input.setAttribute('aria-expanded', 'true');
    _active = -1;
    if (connected) input.classList.add('dd-connected-active');

    let results = [];

    // All categories search full TMDB database
    // Only 'movies' filters to movie type only, everything else shows all results
    const tmdb = await _tmdbSearch(q, 20);
    if (input.value.trim() !== q) return;          // you've typed on since — that newer search will answer
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
        genres: mssGenreNames(r.genre_ids).slice(0, 2)
      };
    });

    // For anime with few results, supplement with AniList
    if (cat === 'anime' && results.length < 5) {
      const aniResults = await _anilistSearch(q);
      if (input.value.trim() !== q) return;
      const extra = aniResults.map(m => ({
        _raw: m, _type: 'anilist',
        title: m.title?.english || m.title?.romaji,
        year:  m.startDate?.year ? String(m.startDate.year) : '',
        thumb: m.coverImage?.medium || null,
        label: m.format === 'MOVIE' ? 'Movie' : 'TV Show',
        genres: mssGenreList(m.genres).slice(0, 2)
      }));
      results = [...results, ...extra].slice(0, 20);
    }

    if (!results.length) {
      drop.innerHTML = '<div class="tmdb-empty">No results found</div>';
      return;
    }

    drop.innerHTML = results.map((r, i) => `
      <div class="tmdb-item" role="option" aria-selected="false" id="${inputId}-opt-${i}" data-i="${i}"${r._type === 'tmdb' ? MSSAge.attr(r._raw.media_type, r._raw.id) : ''}>
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
    _timer = setTimeout(_search, MSS_SEARCH_MS);
  });

  input.addEventListener('keydown', e => {
    const open = drop.classList.contains('open') && drop.querySelector('.tmdb-item');
    if (e.key === 'Escape' && drop.classList.contains('open')) { e.stopPropagation(); _closeDrop(); return; }
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); _setActive(_active + (e.key === 'ArrowDown' ? 1 : -1)); return; }
    if (e.key === 'Enter' && open && _active >= 0) { e.preventDefault(); drop.querySelectorAll('.tmdb-item')[_active].click(); return; }
    if (e.key === 'Enter' && input.value.trim().length >= 2) { e.preventDefault(); clearTimeout(_timer); _search(); }
  });

  input.addEventListener('mss:close-list', _closeDrop);   // Esc inside a popup (MSSDialog) closes the list first
  // capture: also follows the field when a panel it sits in scrolls
  window.addEventListener('scroll', _positionDrop, { passive: true, capture: true });
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

/* ══════════════════════════════════════════
   Notifications — bell panel + notifications.html
   Two halves (the filters All · For you · Friends' activity, _nfMatch):
     For you           — anything about you or your shows: new_episode, new_release, on_this_day,
                         achievement, follows / requests, message, recommendation (126), list invites,
                         movie_night (050), challenge (051), comment / like (066), poll_comment,
                         episode_chat (049), report_actioned / moderation_notice (087)
     Friends' activity — friend_started, friend_episode, friend_finished, friend_dropped (Watched),
                         friend_watchlist, friend_queued (Watchlist), friend_note (Notes),
                         friend_rated (Ratings), friend_list (Lists), friend_poll
                         ("notify me about @friend", 022 / 047 / 072 — each follows the actor's
                         "What my friends hear about" switches, enforced in the database)
   Rows are created by the database (021/022 SQL); here we list them,
   act on them, mark them read and delete them.
══════════════════════════════════════════ */
let _notifUser = null;
let _notifItems = [];
/* Messages: how many are waiting. Desktop shows it on the icon next to the bell; phones on
   Social's Messages toggle and the dot on the Social tab. Follows new notifications, and
   Messages tells it when you've read some. */
let _navMsgCount = 0;
function _navMsgBadge(count) {
  _navMsgCount = count;
  _bnavMsg = count; _bnavDotPaint();
  document.querySelectorAll('[data-msg-badge]').forEach(b => { b.textContent = count > 9 ? '9+' : count; b.classList.toggle('show', count > 0); });
  document.querySelectorAll('.nav-msg-btn').forEach(a => {
    a.setAttribute('aria-label', count > 0 ? `Messages, ${count} new` : 'Messages');
    if ((location.pathname.split('/').pop() || '') === 'messages.html') a.setAttribute('aria-current', 'page');
  });
}
async function _navMsgRefresh() {
  try {
    sb.rpc('msg_mark_delivered').then(() => {}, () => {});       // two ticks: it reached this device
    const { data, error } = await sb.rpc('msg_unread_count');
    if (!error) _navMsgBadge(Number(data) || 0);
  } catch {}
}

function _notifInit(user) {
  if (!user || _notifUser) return;
  _notifUser = user;
  _nfDisplayLoad().catch(() => {}).then(() => _notifLoad());
  _navMsgRefresh();
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { _notifLoad(); _navMsgRefresh(); } });
}

/* Live updates: Supabase Realtime pushes each new notification row the
   moment it's created (needs 026_notifications_realtime.sql), so the bell,
   sheet and alert update without refreshing. RLS still applies — you only
   ever receive your own rows. */
let _notifLiveTimer = null;
function _notifLive(user) {
  if (!sb || typeof sb.channel !== 'function') return;
  const reload = () => { clearTimeout(_notifLiveTimer); _notifLiveTimer = setTimeout(() => { _notifLoad(); _navMsgRefresh(); }, 300); };
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
    const list = (rows || []).filter(n => !_nfHidden.has(n.id));     // deleted, Undo still on screen
    const actorIds  = [...new Set(list.map(n => n.actor_id).filter(Boolean))];
    const listIds   = [...new Set(list.map(n => n.list_id).filter(Boolean))];
    const friendIds = [...new Set(list.map(n => n.friendship_id).filter(Boolean))];
    const folIds = [...new Set(list.filter(n => ['new_follower', 'follow_request', 'follow_accepted'].includes(n.type)).map(n => n.actor_id).filter(Boolean))];
    const [profiles, lists, friendships, invites, toMe, fromMe] = await Promise.all([
      actorIds.length  ? sb.from('profiles').select('id, username, display_name, avatar_url').in('id', actorIds) : { data: [] },
      listIds.length   ? sb.from('favorite_lists').select('id, title').in('id', listIds) : { data: [] },
      friendIds.length ? sb.from('friendships').select('id, status').in('id', friendIds) : { data: [] },
      listIds.length   ? sb.from('list_collaborators').select('list_id, status').eq('user_id', _notifUser.id).in('list_id', listIds) : { data: [] },
      folIds.length    ? sb.from('follows').select('follower_id, status').eq('followee_id', _notifUser.id).in('follower_id', folIds) : { data: [] },
      folIds.length    ? sb.from('follows').select('followee_id, status').eq('follower_id', _notifUser.id).in('followee_id', folIds) : { data: [] },
    ]);
    // who follows you / who you follow, among these people — for Accept / Follow back (083)
    const FT = Object.fromEntries((toMe.data || []).map(f => [f.follower_id, f.status]));
    const FF = Object.fromEntries((fromMe.data || []).map(f => [f.followee_id, f.status]));
    const P = Object.fromEntries((profiles.data || []).map(p => [p.id, p]));
    const L = Object.fromEntries((lists.data || []).map(l => [l.id, l]));
    const F = Object.fromEntries((friendships.data || []).map(f => [f.id, f.status]));
    const I = Object.fromEntries((invites.data || []).map(c => [c.list_id, c.status]));
    _notifItems = list.map(n => ({ ...n, actor: P[n.actor_id] || null, list: L[n.list_id] || null,
      friendStatus: n.friendship_id ? (F[n.friendship_id] || 'gone') : null,
      inviteStatus: n.type === 'list_invite' ? (I[n.list_id] || 'gone') : null,
      followsMe: n.actor_id ? (FT[n.actor_id] || 'none') : null, iFollow: n.actor_id ? (FF[n.actor_id] || 'none') : null }));
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

/* ── Rows (notifications redesign) ──
   One compact row per notification: photo + type badge (green = a person, blue = MSF), the sentence, the time,
   any Accept / Decline / Follow back, and the title's poster on the right. The sentence is the row's link
   (stretched over the row); clicking marks it read. A friend's watchlist adds in one day group become one row. */
const _NF_KIND = { friend_started: 'watched', friend_episode: 'watched', friend_finished: 'watched', friend_dropped: 'watched',
  friend_watchlist: 'watchlist', friend_queued: 'watchlist', friend_note: 'notes', friend_rated: 'ratings', friend_list: 'lists', friend_poll: '' };
const _NF_KINDS = [['watched', 'Watched'], ['watchlist', 'Watchlist'], ['notes', 'Notes'], ['ratings', 'Ratings'], ['lists', 'Lists']];
const _NF_SYSTEM = new Set(['new_episode', 'new_release', 'on_this_day', 'achievement', 'report_actioned', 'moderation_notice']);
const _nfFriends = n => n.type in _NF_KIND;
function _nfMatch(n, f) {
  return f === 'all' || (f === 'you' ? !_nfFriends(n) : f === 'friends' ? _nfFriends(n) : _NF_KIND[n.type] === f);
}

// The filter is shared by the page and the bell panel: kept while you're on a page, back to All on the next one
// (only Back / Forward brings it back: _mssBackForward)
const _NF_FILTER_KEY = 'mss_notif_filter';
const _NF_FILTERS = ['all', 'you', 'friends', ..._NF_KINDS.map(k => k[0])];
try { localStorage.removeItem(_NF_FILTER_KEY); } catch {}   // was kept on the device (before 17 Nov 2026)
let _nfFilter = (() => { if (!_mssBackForward) return 'all'; try { const f = sessionStorage.getItem(_NF_FILTER_KEY); return _NF_FILTERS.includes(f) ? f : 'all'; } catch { return 'all'; } })();
function _nfSetFilter(f) {
  if (!_NF_FILTERS.includes(f)) return;
  const from = document.activeElement?.closest('.ntf-filters, .np-side, #notifPanel, #npList') || null;
  _nfFilter = f;
  try { sessionStorage.setItem(_NF_FILTER_KEY, f); } catch {}
  _nfPanelShown = 20;
  document.getElementById('notifList')?.scrollTo(0, 0);
  _notifRenderPanel();
  if (typeof renderNotificationsPage === 'function') renderNotificationsPage({ reset: true });
  // the buttons were redrawn: keep focus on the one just pressed
  if (from) (document.getElementById('notifPanel')?.classList.contains('open') ? document.getElementById('notifPanel') : document)
    .querySelector(`.ntf-filters [data-f="${f}"], .np-side [data-f="${f}"]`)?.focus();
}
function _nfFiltersHTML(short) {
  const cnt = f => _notifItems.filter(n => _nfMatch(n, f)).length;
  const sub = _NF_KINDS.some(k => k[0] === _nfFilter);
  const pill = (f, label) => `<button type="button" class="ntf-pill${_nfFilter === f ? ' on' : f === 'friends' && sub ? ' is-parent' : ''}" data-f="${f}" aria-pressed="${_nfFilter === f}" onclick="_nfSetFilter('${f}')">${label}<span class="ntf-n">${cnt(f)}</span></button>`;
  return `<div class="ntf-filters">
      <div class="ntf-pills" role="group" aria-label="Show">${pill('all', 'All')}${pill('you', 'For you')}${pill('friends', short ? 'Friends' : 'Friends’ activity')}</div>
      <div class="ntf-chips" role="group" aria-label="Friends’ activity by kind">${_NF_KINDS.map(([f, l]) =>
        `<button type="button" class="ntf-chip${_nfFilter === f ? ' on' : ''}" data-f="${f}" aria-pressed="${_nfFilter === f}" onclick="_nfSetFilter('${f}')">${l}<span class="ntf-n">${cnt(f)}</span></button>`).join('')}</div>
    </div>`;
}

// Group watchlist adds (Quiet the noise): profiles.notif_display (126), this device until it runs
let _nfDisplay = null;               // the account's choices, once loaded (null: not loaded / no column yet)
const _nfDisplayKey = () => 'mss_notif_display_' + (_notifUser?.id || '');
function _nfDisplayGet() {
  if (_nfDisplay) return _nfDisplay;
  try { return JSON.parse(localStorage.getItem(_nfDisplayKey()) || '{}') || {}; } catch { return {}; }
}
const _nfGroupOn = () => _nfDisplayGet().group_watchlist !== false;
async function _nfDisplayLoad() {
  const { data, error } = await sb.from('profiles').select('notif_display').eq('id', _notifUser.id).maybeSingle();
  if (error) return;                                   // 126 not run yet: the device's choice
  _nfDisplay = Object.assign(_nfDisplayGet(), data?.notif_display || {});
}
async function _nfDisplaySet(key, val) {
  const d = Object.assign({}, _nfDisplayGet(), { [key]: val });
  try { localStorage.setItem(_nfDisplayKey(), JSON.stringify(d)); } catch {}
  if (_nfDisplay) {
    _nfDisplay = d;
    const { error } = await sb.from('profiles').update({ notif_display: d }).eq('id', _notifUser.id);
    if (error) showToast('Couldn’t save that — it’s kept on this device.', 'err');
  }
  _nfRerender();
}

// Today (under 24 hours) · Yesterday · This week (2–6 days) · Earlier
function _nfDay(d) {
  const h = (Date.now() - new Date(d)) / 36e5;
  return h < 24 ? 'Today' : h < 48 ? 'Yesterday' : h < 168 ? 'This week' : 'Earlier';
}
// What the list shows: each notification, or one row for a friend's watchlist adds in the same day group
function _nfRows(items) {
  const group = _nfGroupOn(), out = [], by = {};
  for (const n of items) {
    const day = _nfDay(n.created_at);
    if (group && n.type === 'friend_watchlist' && n.actor_id) {
      const k = n.actor_id + '|' + (day === 'Earlier' ? new Date(n.created_at).toDateString() : day);
      if (by[k]) { by[k].items.push(n); continue; }
      out.push(by[k] = { day, items: [n] });
      continue;
    }
    out.push({ day, items: [n] });
  }
  return out;
}
function _nfListHTML(rows, opts) {
  let day = '', h = '';
  for (const r of rows) {
    if (r.day !== day) { day = r.day; h += `<div class="ntf-day" role="heading" aria-level="2">${day}</div>`; }
    h += _nfRowHTML(r, opts);
  }
  return h;
}

const _nfPoster = (url, title) => `<span class="ntf-poster">${safeURL(url) ? `<img src="${safeURL(url)}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${escHTML((title || '?')[0])}">` : escHTML((title || '?')[0].toUpperCase())}</span>`;

// The pieces of one notification's row: photo, badge icon, sentence, quote, buttons, link, posters
function _nfParts(n) {
  const name = n.actor ? escHTML(n.actor.display_name || n.actor.username) : 'Someone';
  const who = `<b translate="no">${name}</b>`;
  const title = n.list ? `<b translate="no">&ldquo;${escHTML(n.list.title)}&rdquo;</b>` : 'a list';
  const m = n.meta || {};
  const av = n.type === 'on_this_day' ? `<span class="notif-av-otd">${(m.posters || []).slice(0, 3).map(u => safeURL(u) ? `<img src="${safeURL(u)}" alt="">` : '').join('') || icon('calendar', 18)}</span>`
    : n.type === 'achievement' ? `<span class="notif-av-ach">${icon('trophy', 18)}</span>`
    : n.type === 'report_actioned' || n.type === 'moderation_notice' ? `<span class="notif-av-ach notif-av-mod">${icon('flag', 17)}</span>`
    : (n.type === 'new_episode' || n.type === 'new_release') && safeURL(m.poster_url) ? `<img src="${safeURL(m.poster_url)}" alt="" loading="lazy">`
    : n.actor && safeURL(n.actor.avatar_url) ? `<img src="${safeURL(n.actor.avatar_url)}" alt="" loading="lazy">`
    : escHTML(((n.actor && n.actor.username) || '?')[0].toUpperCase());
  let text = '', actions = '', quote = '', href = '', ic = '', posters = [];
  const q = s => `<div class="notif-quote ntf-quote" translate="no">${escHTML(s)}</div>`;
  const poster = () => { if (m.poster_url || m.title) posters = [_nfPoster(m.poster_url, m.title)]; };
  if (n.type === 'friend_request') {
    text = `${who} sent you a friend request`; ic = 'users';
    if (n.friendStatus === 'accepted') actions = `<span class="notif-state">You're now friends</span>`;
    href = 'friends.html';
  } else if (n.type === 'new_follower' || n.type === 'follow_request' || n.type === 'follow_accepted') {
    // Following (083): "started following you" · "wants to follow you" (private account) · "accepted your request"
    const aid = attrJSON(n.actor_id), friends = n.iFollow === 'accepted' && n.followsMe === 'accepted';
    text = n.type === 'follow_request' ? `${who} wants to follow you` : n.type === 'follow_accepted' ? `${who} accepted your follow request`
      : `${who} ${m.back ? 'followed you back' : 'started following you'}`;
    ic = 'users';
    const backBtn = `<button type="button" class="notif-act notif-act-yes" onclick="_notifFollow(event, ${aid}, 'follow')">Follow back</button>`;
    if (n.type === 'follow_request' && n.followsMe === 'pending')
      actions = `<button type="button" class="notif-act notif-act-yes" onclick="_notifFollow(event, ${aid}, 'accept')">Accept</button>
                 <button type="button" class="notif-act" onclick="_notifFollow(event, ${aid}, 'decline')">Decline</button>`;
    else if (friends) actions = `<span class="notif-state">You're friends</span>`;
    else if (n.iFollow === 'pending') actions = `<span class="notif-state">Requested</span>`;
    else if (n.followsMe === 'accepted' && n.iFollow === 'none') actions = (n.type === 'follow_request' ? `<span class="notif-state">Follows you</span>` : '') + backBtn;
    else if (n.type === 'follow_request' && n.followsMe === 'none') actions = `<span class="notif-state">Declined</span>`;
    href = n.type === 'follow_request' ? 'friends.html?view=requests' : n.actor ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}&u=${encodeURIComponent(n.actor.username || '')}` : 'friends.html';
  } else if (n.type === 'list_invite') {
    text = `${who} invited you to collaborate on ${title}`; ic = 'layers';
    if (n.inviteStatus === 'pending') {
      actions = `<button type="button" class="notif-act notif-act-yes" onclick="_notifInvite(event, ${attrJSON(n.list_id)}, true)">Accept</button>
                 <button type="button" class="notif-act" onclick="_notifInvite(event, ${attrJSON(n.list_id)}, false)">Decline</button>`;
    } else if (n.inviteStatus === 'accepted') actions = `<span class="notif-state">Joined</span>`;
    else if (n.inviteStatus === 'declined') actions = `<span class="notif-state">Declined</span>`;
    href = n.list ? `list-view.html?list=${encodeURIComponent(n.list_id)}` : '';
  } else if (n.type === 'list_invite_accepted') {
    text = `${who} joined your list ${title}`; ic = 'layers';
    href = n.list ? `list-view.html?list=${encodeURIComponent(n.list_id)}` : '';
  } else if (n.type === 'list_invite_declined') {
    text = `${who} declined your invite to ${title}`; ic = 'layers';
    href = n.list ? `list-view.html?list=${encodeURIComponent(n.list_id)}` : '';
  } else if (['friend_started', 'friend_finished', 'friend_episode', 'friend_note', 'friend_rated', 'friend_watchlist', 'friend_dropped'].includes(n.type)) {
    // "Notify me about @friend" (047): what they're watching, the moment they do it
    const t = `<b translate="no">${escHTML(m.title || 'something')}</b>`;
    href = m.tmdb_id && m.tmdb_type ? `title.html?type=${m.tmdb_type}&id=${m.tmdb_id}` : (n.actor_id ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}` : '');
    if (n.type === 'friend_started') { text = `${who} started watching ${t}`; ic = 'play'; }
    if (n.type === 'friend_finished') {
      const movie = m.cat === 'movies' || m.media_type === 'movie' || m.tmdb_type === 'movie';
      text = (m.kind === 'ongoing' ? `${who} is caught up on ${t}` : movie ? `${who} watched ${t}` : `${who} finished ${t}`)
        + (m.score != null ? ` · ★ ${Number(m.score).toFixed(2)}` : ''); ic = 'check';   // finished + rated at once (072)
    }
    // 072: rated · added to watchlist · dropped
    if (n.type === 'friend_rated') { text = `${who} rated ${t} ★ ${Number(m.score).toFixed(2)}${m.dropped ? ' (dropped)' : ''}`; ic = 'ratingStar'; }
    if (n.type === 'friend_watchlist') { text = `${who} added ${t} to their watchlist`; ic = 'bookmark'; }
    if (n.type === 'friend_dropped') { text = `${who} dropped ${t}${_notifDroppedAt(m)}`; ic = 'drop'; }
    if (n.type === 'friend_episode') {
      text = `${who} ${_notifFriendEpText(m, t)}`; ic = 'tv';
      if (m.tmdb_id) href = `episodes.html?show=${encodeURIComponent(m.tmdb_id)}${n.actor_id ? `&user=${encodeURIComponent(n.actor_id)}` : ''}`;
      if (_notifEpCount(m) === 1 && m.tmdb_id) quote = mssEpNameHTML(m.tmdb_id, m.season, m.episode, 'notif-quote ntf-quote');
    }
    if (n.type === 'friend_note') { text = `${who} wrote a note on ${t}`; ic = 'notebook'; href = 'notes.html?view=friends'; }
    poster();
  } else if (n.type === 'friend_list') {
    text = `${who} made a new list <b translate="no">&ldquo;${escHTML(m.title || 'Untitled')}&rdquo;</b>`; ic = 'layers';
    href = m.list_id ? `list-view.html?list=${encodeURIComponent(m.list_id)}` : '';
  } else if (n.type === 'new_episode') {
    text = _notifEpText(m, `<b translate="no">${escHTML(m.title || 'a show')}</b>`) + (m.episode_name && !(m.count > 1) ? ` “${escHTML(m.episode_name)}”` : ''); ic = 'tv';
    href = m.tmdb_id ? `episodes.html?show=${encodeURIComponent(m.tmdb_id)}` : '';
  } else if (n.type === 'new_release') {
    text = `<b translate="no">${escHTML(m.title || 'A movie')}</b> ${m.kind === 'digital' ? 'is out to stream or buy' : 'is out in cinemas'}`; ic = 'film';
    href = m.tmdb_id ? `title.html?type=movie&id=${encodeURIComponent(m.tmdb_id)}` : '';
  } else if (n.type === 'friend_poll' || n.type === 'poll_comment') {
    const qq = `“${escHTML(m.question || 'a poll')}”`;
    text = n.type === 'friend_poll' ? `${who} started a poll: ${qq}` : `${who} commented on your poll ${qq}`;
    ic = n.type === 'friend_poll' ? 'poll' : 'comment';
    if (n.type === 'poll_comment' && m.excerpt) quote = q(m.excerpt);
    href = m.poll_id ? `polls.html?poll=${encodeURIComponent(m.poll_id)}` : 'polls.html';
  } else if (n.type === 'challenge') {
    // Challenges (051): an invite, or someone reaching the goal
    const t = `<b translate="no">${escHTML(m.title || 'a challenge')}</b>`;
    text = m.kind === 'finished' ? `${who} finished ${t} — ${escHTML(m.goal)} watched!` : `${who} challenged you: ${t}${m.goal ? ` · watch ${escHTML(m.goal)}` : ''}`;
    ic = 'trophy';
    href = m.challenge_id ? `challenges.html?ch=${encodeURIComponent(m.challenge_id)}` : 'challenges.html';
  } else if (n.type === 'on_this_day') {
    // On This Day (115): what you finished on this date in earlier years — yours alone
    const t = m.titles || [], more = (Number(m.count) || t.length) - Math.min(t.length, 2);
    text = `<b>On This Day</b> · ${escHTML(Number(m.count) === 1 ? '1 title' : `${m.count} titles`)} — <span translate="no">${t.slice(0, 2).map(escHTML).join(', ')}</span>${more > 0 ? ` and ${more} more` : ''}`;
    ic = 'calendar';
    href = `diary.html?otd=${encodeURIComponent(m.date || '')}`;
  } else if (n.type === 'achievement') {
    // Achievements (060): the first time, one "check your cabinet" for everything already earned
    const more = (Number(m.count) || 1) - 1;
    text = m.kind === 'welcome' ? `<b>Your Achievement Cabinet is open</b> — you’ve already earned ${escHTML(m.count)} ${Number(m.count) === 1 ? 'medal' : 'medals'}. Take a look!`
      : `New medal: <b>${escHTML(m.name || 'Achievement')}</b>${m.at ? ` · ${escHTML(Number(m.at).toLocaleString(MSSI18n.locale))}` : ''}${more > 0 ? ` and ${more} more` : ''}`;
    ic = 'sparkles';
    href = m.key ? `cabinet.html?tab=ach` : 'cabinet.html';
  } else if (n.type === 'movie_night') {
    // Movie Night (050): invites, the pick, changes and the reminder on the day
    text = _notifNightText(m, who); ic = m.kind === 'review' ? 'ratingStar' : m.kind === 'decided' ? 'sparkles' : m.kind === 'cancelled' ? 'x' : m.kind === 'reminder' ? 'clock' : 'film';
    if (m.kind === 'decided' && m.pick) posters = [_nfPoster(m.poster_url, m.pick)];
    href = m.night_id ? `movie-night.html?night=${encodeURIComponent(m.night_id)}` : 'movie-night.html';
  } else if (n.type === 'episode_chat') {
    // Episode chat (049): only sent to friends who've watched the episode too
    text = `${who} commented on S${escHTML(m.season)} · E${escHTML(m.episode)} of <b translate="no">${escHTML(m.title || 'a show')}</b>`; ic = 'comment';
    if (m.body) quote = q(m.body);
    href = `episode-chat.html?ep=${encodeURIComponent(`${m.tmdb_id}:${m.season}:${m.episode}`)}`;
  } else if (n.type === 'message') {
    text = `${who} sent you a message`; ic = 'inbox';         // never the message itself: it's encrypted
    href = `messages.html?with=${encodeURIComponent(n.actor_id)}`;
  } else if (n.type === 'recommendation') {
    // A title or list shared in Messages (126): only what was shared is known here, never the message
    text = m.kind === 'list' ? `${who} recommended the list <b translate="no">&ldquo;${escHTML(m.title || 'Untitled')}&rdquo;</b> to you`
      : `${who} recommended <b translate="no">${escHTML(m.title || 'something')}</b> to you`;
    ic = 'send';
    href = `messages.html?with=${encodeURIComponent(n.actor_id)}`;
    if (m.kind !== 'list') poster();
  } else if (n.type === 'comment' || n.type === 'like') {
    // Comments, replies and likes on your things (066)
    text = _notifSocialText(n, who); ic = n.type === 'like' ? 'thumbsUp' : m.kind === 'entry' ? 'comment' : 'reply';
    if (m.excerpt) quote = q(m.excerpt);
    if (m.kind !== 'list') poster();
    href = _notifSocialHref(m);
  } else if (n.type === 'report_actioned' || n.type === 'moderation_notice') {
    // Reports (087): the admins acted on something — never says who reported it
    text = _notifModText(n); ic = n.type === 'report_actioned' ? 'check' : 'info';
    if (m.excerpt && m.kind !== 'user') quote = q(m.excerpt);
  } else if (n.type === 'friend_queued') {
    text = `${who} added something from your library to their watchlist`; ic = 'plus';
    poster();
    href = n.actor_id ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}` : '';
  }
  return { av, ic, text, quote, actions, href, posters };
}
// One friend's watchlist adds, as one row: "Nasrawi added 6 titles to their watchlist — A, B and 4 more"
function _nfGroupParts(items) {
  const n = items[0], p = _nfParts(n), t = items.map(x => x.meta?.title).filter(Boolean), more = items.length - Math.min(t.length, 2);
  const name = n.actor ? escHTML(n.actor.display_name || n.actor.username) : 'Someone';
  return { ...p, posters: items.slice(0, 3).map(x => _nfPoster(x.meta?.poster_url, x.meta?.title)),
    text: `<b translate="no">${name}</b> added <b>${items.length} titles</b> to their watchlist — <span translate="no">${t.slice(0, 2).map(escHTML).join(', ')}</span>${more > 0 ? ` and ${more} more` : ''}`,
    href: n.actor_id ? `profile-view.html?id=${encodeURIComponent(n.actor_id)}${n.actor?.username ? `&u=${encodeURIComponent(n.actor.username)}` : ''}&tab=1&sec=watchlist` : p.href };
}
// opts.page: the delete × (and the phone's swipe) · opts.fresh: ids still shown as new (the panel)
function _nfRowHTML(r, opts = {}) {
  const n = r.items[0], ids = r.items.map(x => x.id);
  const unread = r.items.some(x => !x.read_at || opts.fresh?.has(x.id));
  const p = r.items.length > 1 ? _nfGroupParts(r.items) : _nfParts(n);
  const idsA = attrJSON(ids);
  const sentence = p.href ? `<a class="ntf-link" href="${escHTML(p.href)}" onclick="_nfOpen(event, ${idsA})">${p.text}</a>` : `<span>${p.text}</span>`;
  const del = opts.page ? `<button type="button" class="ntf-del" onclick="_nfDelete(event, ${idsA})" aria-label="Delete notification">${icon('x', 14)}</button>` : '';
  return `<div class="ntf-row${unread ? ' unread' : ''}${p.href ? ' has-link' : ''}" data-ids="${escHTML(ids.join(','))}">
    ${opts.page ? `<button type="button" class="ntf-swipe-del" tabindex="-1" aria-hidden="true" onclick="_nfDelete(event, ${idsA})">${icon('trash', 16)}<span>Delete</span></button>` : ''}
    <div class="ntf-in">
      <div class="ntf-av notif-av">${p.av}${p.ic && ICONS[p.ic] ? `<span class="ntf-badge${_NF_SYSTEM.has(n.type) ? ' is-msf' : ''}">${icon(p.ic, 9)}</span>` : ''}</div>
      <div class="ntf-body">
        <div class="ntf-text">${unread ? '<span class="sr-only">New: </span>' : ''}${sentence}</div>
        ${p.quote}
        <div class="ntf-time">${_notifTimeAgo(n.created_at)}</div>
        ${p.actions ? `<div class="notif-actions">${p.actions}</div>` : ''}
      </div>
      ${p.posters.length ? `<div class="ntf-posters${p.posters.length > 1 ? ' is-stack' : ''}" aria-hidden="true">${p.posters.join('')}</div>` : ''}
      ${del}
    </div>
  </div>`;
}
// Open a row: mark it read first (briefly), then go — a new tab / window just marks it
async function _nfOpen(ev, ids) {
  const un = ids.filter(id => _notifItems.some(n => n.id === id && !n.read_at));
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) { _notifMarkRead(un); return; }
  ev.preventDefault();
  const href = ev.currentTarget.href;
  if (un.length) await Promise.race([_notifMarkRead(un), new Promise(r => setTimeout(r, 600))]);
  location.href = href;
}
function _nfRerender() {
  _notifRenderPanel();
  if (typeof renderNotificationsPage === 'function') renderNotificationsPage();
}

function _notifEmptyHTML(f) {
  const kind = _NF_KINDS.find(k => k[0] === f);
  const [title, text] = kind ? [`No ${kind[1].toLowerCase()} from friends`, 'Turn on notifications from a friend’s profile to hear what they do.']
    : ({ all: ['All quiet', 'You’re all caught up. Go watch something.'],
      you: ['Nothing for you yet', 'New episodes, follows, messages, invites and replies to you land here.'],
      friends: ['No friend activity yet', 'Turn on notifications from a friend’s profile to hear what they watch.'] })[f] || ['All quiet', ''];
  return mssEmpty({ compact: true, art: 'bell', title, text });
}

// The bell opens a side panel from the right edge (desktop / tablet). Phones go to the Notifications page.
function _notifEnsurePanel() {
  let el = document.getElementById('notifPanel');
  if (el) return el;
  const scrim = document.createElement('div');
  scrim.id = 'notifScrim';
  scrim.addEventListener('click', () => closeNotifPanel());
  el = document.createElement('aside');
  el.id = 'notifPanel';
  el.setAttribute('aria-labelledby', 'notifTitle');
  el.tabIndex = -1;
  el.innerHTML = `<div class="notif-head">
      <div>
        <h2 class="notif-title" id="notifTitle">Notifications</h2>
        <div class="notif-sub" id="notifSub"></div>
      </div>
      <button type="button" class="notif-close" onclick="closeNotifPanel()" aria-label="Close">${icon('x', 18)}</button>
    </div>
    <div id="notifTabsWrap" class="ntf-panel-filters"></div>
    <div class="notif-list" id="notifList"></div>
    <div class="notif-sheet-foot">
      <button type="button" class="notif-foot-btn" id="notifReadAll" onclick="_notifSheetReadAll()">${icon('check', 14)} Mark all read</button>
      <a class="notif-foot-btn primary" href="notifications.html">See all</a>
    </div>`;
  document.body.appendChild(scrim);
  document.body.appendChild(el);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNotifPanel(); });
  // 20 at a time; more as you scroll
  el.querySelector('#notifList').addEventListener('scroll', e => {
    const l = e.currentTarget;
    if (l.scrollTop + l.clientHeight > l.scrollHeight - 240 && l.querySelector('.ntf-more')) { _nfPanelShown += 20; _notifRenderPanel(); }
  }, { passive: true });
  return el;
}
let _notifSheetNew = new Set();   // ids that were unread when the sheet opened
let _nfPanelShown = 20;
function _notifRenderPanel() {
  const listEl = document.getElementById('notifList');
  if (!listEl || !document.getElementById('notifPanel')?.classList.contains('open')) return;
  document.getElementById('notifTabsWrap').innerHTML = _nfFiltersHTML(true);
  const rows = _nfRows(_notifItems.filter(n => _nfMatch(n, _nfFilter)));
  const fresh = _notifItems.filter(n => _notifSheetNew.has(n.id) || !n.read_at).length;
  const sub = document.getElementById('notifSub');
  if (sub) sub.textContent = fresh ? `${fresh} new` : 'You’re all caught up';
  const rb = document.getElementById('notifReadAll');
  if (rb) rb.disabled = !_notifItems.some(n => !n.read_at || _notifSheetNew.has(n.id));
  listEl.innerHTML = !rows.length ? _notifEmptyHTML(_nfFilter)
    : `<div class="ntf-list">${_nfListHTML(rows.slice(0, _nfPanelShown), { fresh: _notifSheetNew })}</div>${rows.length > _nfPanelShown ? '<div class="ntf-more" aria-hidden="true"></div>' : ''}`;
  mssFillEpNames(listEl);
}
function _notifSheetReadAll() {
  _notifMarkRead(_notifItems.filter(n => !n.read_at).map(n => n.id));
  _notifSheetNew.clear();
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

const _nfPhone = () => matchMedia('(max-width: 767px)').matches;
async function toggleNotifPanel(ev) {
  ev?.stopPropagation();
  if (location.pathname.endsWith('notifications.html')) return;   // already on the full page
  if (_nfPhone()) { location.href = 'notifications.html'; return; } // phones: the full page, no panel
  const el = _notifEnsurePanel();
  if (el.classList.contains('open')) { closeNotifPanel(); return; }
  _navCloseAll('notif');
  _notifSheetNew = new Set(_notifItems.filter(n => !n.read_at).map(n => n.id));
  _nfPanelShown = 20;
  const top = _notifSheetTop() + 'px';
  el.style.setProperty('--notif-top', top);
  document.getElementById('notifScrim').style.setProperty('--notif-top', top);
  el.classList.add('open');
  document.getElementById('notifScrim').classList.add('open');
  document.body.classList.add('notif-sheet-open');
  _notifRenderPanel();
  document.getElementById('notifList').scrollTop = 0;
  el.focus({ preventScroll: true });          // into the panel, without a ring on ×
  // Opening the sheet = seen (the highlight stays until it's closed)
  _notifMarkRead(_notifItems.filter(n => !n.read_at).map(n => n.id));
}
function closeNotifPanel() {
  const el = document.getElementById('notifPanel');
  if (!el || !el.classList.contains('open')) return;
  el.classList.remove('open');
  document.getElementById('notifScrim')?.classList.remove('open');
  document.body.classList.remove('notif-sheet-open');
  _notifSheetNew.clear();
}

/* Delete one (or a grouped row): gone at once, with 5 seconds to Undo before it's deleted for good.
   Leaving the page in the meantime deletes it then. */
const _nfHidden = new Set();      // waiting to be deleted: kept out of reloads meanwhile
function _nfDelete(ev, ids) {
  ev?.stopPropagation();
  const gone = _notifItems.filter(n => ids.includes(n.id));
  if (!gone.length) return;
  ids.forEach(id => _nfHidden.add(id));
  _notifItems = _notifItems.filter(n => !ids.includes(n.id));
  _notifRenderBadge(); _nfRerender();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    clearTimeout(timer); removeEventListener('pagehide', commit);
    sb.from('notifications').delete().in('id', ids).then(() => ids.forEach(id => _nfHidden.delete(id)), () => {});
  };
  const timer = setTimeout(commit, 5000);
  addEventListener('pagehide', commit);
  showActionToast(ids.length > 1 ? `${ids.length} notifications deleted.` : 'Notification deleted.', 'Undo', () => {
    if (done) return; done = true;
    clearTimeout(timer); removeEventListener('pagehide', commit);
    ids.forEach(id => _nfHidden.delete(id));
    _notifItems = _notifItems.concat(gone).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    _notifRenderBadge(); _nfRerender();
    showToast('Undone.');
  }, 5000);
}

// Follow notifications (083): accept / decline a request, or follow back
async function _notifFollow(ev, userId, what) {
  ev.stopPropagation();
  const btns = ev.currentTarget.parentElement.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  try {
    if (what === 'follow') { const r = await followUser(userId); showToast(r === 'requested' ? 'Request sent' : 'Following back — you’re friends now!'); }
    else { await respondFollowRequest(userId, what === 'accept'); showToast(what === 'accept' ? 'Accepted — they follow you now' : 'Request declined'); }
    await _notifLoad();
    document.dispatchEvent(new CustomEvent('mss:follows-changed', { detail: { id: userId } }));
    if (_notifUser) {
      const pending = await countPendingRequests(_notifUser.id).catch(() => 0);
      document.querySelectorAll('[data-page="friends.html"] .nav-badge').forEach(b => { b.textContent = pending; b.style.display = pending ? '' : 'none'; });
      _bnavDot(pending);
    }
  } catch (e) { btns.forEach(b => b.disabled = false); showToast(e?.hint || 'Something went wrong — try again.', 'err'); }
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

// Reports (087) — to the people who reported it, and to the person it belonged to
const _NOTIF_MOD_WHAT = { comment: 'comment', note_reply: 'reply', list_reply: 'reply', note: 'note', entry: 'poster', list: 'list',
  poll: 'poll', poll_comment: 'poll comment', episode_chat: 'episode chat message', user: 'profile', ep_note: 'note', ep_note_reply: 'reply' };
const _NOTIF_MOD_WHY = { spam: 'spam', harassment: 'harassment', offensive: 'hateful or offensive content', sexual: 'sexual content', copyright: 'using someone else’s picture or work', other: 'breaking the community rules' };
function _notifModText(n) {
  const m = n.meta || {}, what = _NOTIF_MOD_WHAT[m.kind] || 'post';
  const on = m.title && (m.kind === 'note' || m.kind === 'entry' || m.kind === 'ep_note') ? ` on <b translate="no">${escHTML(m.title)}</b>` : '';
  if (n.type === 'report_actioned') {
    return `<b>Thanks for your report.</b> ` + (m.action === 'banned' || m.action === 'suspended' || m.action === 'warned' ? `We took action on the account behind the ${what} you reported.`
      : m.action === 'removed' ? (m.kind === 'user' ? 'We removed the profile photo you reported.' : `We removed the ${what}${on} you reported.`)
      : `We took action on the ${what}${on} you reported.`);
  }
  const why = _NOTIF_MOD_WHY[m.reason] || 'breaking the community rules';
  const note = m.note ? ` <span class="notif-mod-note">“${escHTML(m.note)}”</span>` : '';
  if (m.action === 'banned') return `<b>Your account was banned</b> for breaking the community rules (${escHTML(why)}).`;
  if (m.action === 'suspended') return `<b>Your account was suspended${m.until ? ` until ${escHTML(new Date(m.until).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</b> for breaking the community rules (${escHTML(why)}). Repeat breaks can get it banned.`;
  if (m.action === 'warned') return `<b>Warning:</b> ${m.kind === 'user' ? 'your account' : `your ${what}${on}`} broke the community rules (${escHTML(why)}).${note} Please keep to the rules — repeat breaks can get an account suspended.`;
  const gone = m.kind === 'user' ? 'Your profile photo was removed' : m.kind === 'entry' ? `The poster you uploaded${on} was removed`
    : m.kind === 'note' || m.kind === 'ep_note' ? `The text of your ${what}${on} was removed` : `Your ${what} was removed`;
  return `<b>${m.action === 'removed' ? gone : `We took action on your ${what}${on}`}</b> for ${escHTML(why)}. Please keep to the community rules — repeat breaks can get an account suspended.`;
}

// One short line describing a notification
function _notifShortText(n) {
  const who = `<b translate="no">${escHTML(n.actor ? (n.actor.display_name || n.actor.username) : 'Someone')}</b>`;
  const t = n.meta?.title ? `<b translate="no">${escHTML(n.meta.title)}</b>` : 'something';
  const list = n.list ? `“${escHTML(n.list.title)}”` : 'a list';
  switch (n.type) {
    case 'friend_request':       return `${who} sent you a friend request`;
    case 'new_follower':         return `${who} ${n.meta?.back ? 'followed you back' : 'started following you'}`;
    case 'follow_request':       return `${who} wants to follow you`;
    case 'follow_accepted':      return `${who} accepted your follow request`;
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
    case 'message':              return `${who} sent you a message`;
    case 'recommendation':       return `${who} recommended ${n.meta?.kind === 'list' ? `the list “${escHTML(n.meta?.title || '')}”` : t} to you`;
    case 'movie_night':          return _notifNightText(n.meta || {}, who);
    case 'on_this_day':          return `On This Day · ${escHTML(Number(n.meta?.count) === 1 ? '1 title' : `${n.meta?.count || ''} titles`)}`;
    case 'achievement':          return n.meta?.kind === 'welcome' ? 'Your Achievement Cabinet is open — take a look!' : `New medal: ${escHTML(n.meta?.name || 'Achievement')}`;
    case 'challenge':            return n.meta?.kind === 'finished' ? `${who} finished ${t}` : `${who} challenged you: ${t}`;
    case 'episode_chat':         return `${who} commented on S${escHTML(n.meta?.season)} · E${escHTML(n.meta?.episode)} of ${t}`;
    case 'comment': case 'like': return _notifSocialText(n, who);
    case 'report_actioned': case 'moderation_notice': return _notifModText(n);
  }
  return 'New notification';
}

// Comments, replies and likes (066) — what happened, and where tapping it goes
function _notifSocialText(n, who) {
  const m = n.meta || {}, t = `<b translate="no">${escHTML(m.title || (m.kind === 'list' ? 'a list' : 'a title'))}</b>`;
  // episode and season notes (108): "your note on One Piece · S1 E3" / "your review of One Piece · Season 1"
  if (m.kind === 'ep_note' || m.kind === 'ep_note_reply') {
    const at = `${t} · ${+m.episode ? `S${escHTML(m.season)} E${escHTML(m.episode)}` : `Season ${escHTML(m.season)}`}`, w = +m.episode ? 'note on' : 'review of';
    if (n.type === 'like') return m.kind === 'ep_note' ? `${who} liked your ${w} ${at}` : `${who} liked your reply about ${at}`;
    return `${who} replied to your ${w} ${at}`;
  }
  if (n.type === 'like') return m.kind === 'list' ? `${who} liked your list “${t}”` : m.kind === 'note_reply' ? `${who} liked your reply on a note about ${t}` : `${who} liked your note on ${t}`;
  return m.kind === 'reply' ? `${who} replied to your comment on ${t}` : m.kind === 'note_reply' ? `${who} replied to your note on ${t}` : `${who} commented on your ${t}`;
}
function _notifSocialHref(m) {
  if (m.kind === 'list') return m.list_id ? `list-view.html?list=${encodeURIComponent(m.list_id)}` : '';
  if (m.kind === 'ep_note' || m.kind === 'ep_note_reply') {   // → the Episode / Season page, that note (or its replies)
    if (!m.tmdb_id || !m.rating_id) return '';
    const page = +m.episode ? `episode.html?show=${encodeURIComponent(m.tmdb_id)}&s=${encodeURIComponent(m.season)}&e=${encodeURIComponent(m.episode)}` : `season.html?show=${encodeURIComponent(m.tmdb_id)}&s=${encodeURIComponent(m.season)}`;
    return `${page}&${m.kind === 'ep_note' ? 'note' : 'replies'}=${encodeURIComponent(m.rating_id)}`;
  }
  if (m.kind === 'entry' || m.kind === 'reply' || m.kind === 'note_reply') {   // a comment / reply on a title → its Comments tab
    return m.entry_id ? `item.html?id=${encodeURIComponent(m.entry_id)}&tab=comments` : '';
  }
  if (!m.tmdb_id || !m.tmdb_type) return 'notes.html';   // notes live on the title page
  return `title.html?type=${encodeURIComponent(m.tmdb_type)}&id=${encodeURIComponent(m.tmdb_id)}&note=${encodeURIComponent(m.entry_id)}`;
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
    case 'reminder':    return `${t} is today${time ? ` at ${escHTML(time)}` : ''}${m.pick ? ` — <b translate="no">${escHTML(m.pick)}</b>` : m.voting === false ? '' : ' — time to vote!'}`;
  }
  return `${who} invited you to ${t}${m.pick ? ` to watch <b translate="no">${escHTML(m.pick)}</b>` : ''}${when ? ` · ${escHTML(when)}` : ''}`;
}

// A friend's episodes (047): one → "watched S2 · E5 of X";
// a run → "watched 3 episodes of X — S2 · E3–E5" (or S1 · E9 – S2 · E2 across seasons)
// How many episodes a "watched N episodes" run is — within one season the range says it
// (older notifications stored a running total that could be off — 085)
function _notifEpCount(m) {
  const s = +m.season || 1, e = +m.episode || 1, fs = +m.from_season || s, fe = +m.from_episode || e;
  return fs === s ? Math.max(1, e - fe + 1) : Math.max(1, +m.count || 1);
}
function _notifFriendEpText(m, t) {
  const s = +m.season || 1, e = +m.episode || 1, fs = +m.from_season || s, fe = +m.from_episode || e, c = _notifEpCount(m);
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
    : tmdbFetch(`${TMDB_BASE}/tv/${tmdbId}/season/${season}?language=en-US`)
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

// New notifications: the toast, with who it's from (avatar, or the count) on the left and "View" (opens the bell)
function _notifPeek(fresh) {
  const n = fresh[0], a = n.actor;
  const lead = fresh.length === 1
    ? `<span class="toast-av" aria-hidden="true">${a && safeURL(a.avatar_url) ? `<img src="${safeURL(a.avatar_url)}" alt="">` : escHTML(((a && a.username) || '?')[0].toUpperCase())}</span>`
    : `<span class="toast-av" aria-hidden="true"><b>${fresh.length > 99 ? '99+' : fresh.length}</b></span>`;
  const tmp = document.createElement('div'); tmp.innerHTML = fresh.length === 1 ? _notifShortText(n) : `${fresh.length} new notifications`;
  _mssToastShow(tmp.textContent, { lead, label: 'View', ms: 6000, onClick: () => { _mssToastEl().classList.remove('visible'); toggleNotifPanel(); } });
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
    // Not in the middle of what you're doing (that was the white flash while a page loaded):
    // the page swaps to the new version the next time it's out of sight — switching app or tab —
    // and any page you open from now on is already the new one.
    if (document.hidden) { location.reload(); return; }
    document.addEventListener('visibilitychange', () => { if (document.hidden) location.reload(); });
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
const _MSS_CAST_STORE = 'mss_cast_v3';   // v2: entries carry the TMDB person id · v3: anime voice actors fixed (Japanese, not the dub)
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

// One AniList anime whose title really is this show (± a year), with the fields asked for;
// null if there's none, undefined if AniList couldn't be asked (a private page, or no connection)
async function _mssAniListFind(title, year, fields) {
  if (_mssAniListOff() || !title) return undefined;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: `
        query ($search: String) {
          Page(page: 1, perPage: 5) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              title { english romaji } synonyms startDate { year }
              ${fields}
            }
          }
        }`, variables: { search: title } }),
    });
    const list = (await res.json())?.data?.Page?.media || [];
    const want = _mssNorm(title);
    return list.find(m => {
      const names = [m.title?.english, m.title?.romaji, ...(m.synonyms || [])].map(_mssNorm).filter(Boolean);
      const yearOk = !year || !m.startDate?.year || Math.abs(Number(m.startDate.year) - Number(year)) <= 1;
      return yearOk && names.includes(want);
    }) || null;
  } catch { return undefined; }
}
const _mssAniListCharacters = (title, year) => _mssAniListFind(title, year, `
              characters(sort: [ROLE, RELEVANCE, ID], perPage: 10) {
                edges {
                  role
                  node { name { full } image { large } }
                  voiceActors { name { full } languageV2 }
                }
              }`).then(m => {
  // AniList answers two aliased voiceActors(language: …) with the same list, so ask once and split by language
  (m?.characters?.edges || []).forEach(ed => {
    const va = ed.voiceActors || [];
    ed.ja = va.filter(v => v.languageV2 === 'Japanese'); ed.en = va.filter(v => v.languageV2 === 'English');
  });
  return m;
});

/* ── Anime genres from AniList (TMDB has no anime genres) ──
   mssIsAnime(it, d)          → an anime: in Anime, or a Japanese animation on TMDB (d = its details)
   mssAnimeGenres(title, year) → AniList's genres in the site's names, plus its main tags
                                 (Isekai, Shounen, Seinen, Shoujo, Josei); never 18+ ones. [] if no match.
                                 Kept on this device for a week; null when AniList couldn't be asked.
   mssSyncAnimeGenres(entry, userId) → your own saved anime: adds the ones it's missing, once (ratings._anilist_genres),
                                 so one you remove later stays removed. → the new list, or null if unchanged. */
const _MSS_ANI_GENRE = { 'Sci-Fi': 'Science Fiction', 'Mahou Shoujo': 'Magical Girl' };
const _MSS_ANI_SKIP = new Set(['Ecchi', 'Hentai']);
const _MSS_ANI_TAGS = new Set(['Isekai', 'Shounen', 'Seinen', 'Shoujo', 'Josei']);
const _MSS_ANI_STORE = 'mss_anilist_genres_v1', _MSS_ANI_TTL = 7 * 24 * 60 * 60 * 1000;
function mssIsAnime(it, d) {
  if (it?.cat) return it.cat === 'anime';
  const animation = (d?.genres || []).some(g => g.id === 16) || (d?.genre_ids || it?.genre_ids || []).includes(16);
  return animation && (d?.original_language === 'ja' || (d?.origin_country || []).includes('JP'));
}
async function mssAnimeGenres(title, year) {
  const key = _mssNorm(title) + '|' + (year || '');
  let all = {};
  try { all = JSON.parse(localStorage.getItem(_MSS_ANI_STORE) || '{}'); } catch {}
  if (all[key] && Date.now() - all[key].t < _MSS_ANI_TTL) return all[key].g;
  const m = await _mssAniListFind(title, year, 'isAdult genres tags { name rank isAdult }');
  if (m === undefined) return null;
  const known = new Set([...Object.keys(MSS_GENRES), ...MSS_EXTRA_GENRES]);
  const g = !m || m.isAdult ? [] : mssGenreList([
    ...(m.genres || []).filter(x => !_MSS_ANI_SKIP.has(x)).map(x => _MSS_ANI_GENRE[x] || x),
    ...(m.tags || []).filter(t => _MSS_ANI_TAGS.has(t.name) && !t.isAdult && t.rank >= 50).map(t => t.name),
  ]).filter(x => known.has(x));
  try {
    all[key] = { t: Date.now(), g };
    const keys = Object.keys(all);
    if (keys.length > 300) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 300).forEach(k => delete all[k]);
    localStorage.setItem(_MSS_ANI_STORE, JSON.stringify(all));
  } catch {}
  return g;
}
async function mssSyncAnimeGenres(entry, userId = window._navUser?.id) {
  if (!entry?.id || entry.cat !== 'anime' || entry.ratings?._anilist_genres || !userId || entry.user_id !== userId) return null;
  const extra = await mssAnimeGenres(entry.title, String(entry.year || '').slice(0, 4));
  if (!extra) return null;                 // ask again next time
  const have = mssGenreList(entry.genres), add = extra.filter(g => !have.includes(g));
  const genres = [...have, ...add], ratings = { ...(entry.ratings || {}), _anilist_genres: true };
  try {
    const { error } = await sb.from('entries').update(add.length ? { genres, ratings } : { ratings }).eq('id', entry.id).eq('user_id', entry.user_id);
    if (error) throw error;
  } catch { return null; }
  entry.ratings = ratings;
  if (!add.length) return null;
  entry.genres = genres;
  return genres;
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
    const res = await tmdbFetch(`${TMDB_BASE}/${it.tmdb_type}/${it.tmdb_id}/${path}?language=en-US`);
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