/* ══════════════════════════════════════════════════════════════════════
   consent.js — cookies & browser storage: your choices (Cookie Policy: cookies.html)
   Loaded FIRST on every page (before splash.js / i18n.js), so nothing optional is saved before
   you've said yes.

   Kinds of storage (the Cookie Policy describes each in plain words; the names live only here):
     necessary  always on: signing in, security, age checks, finishing what you asked for,
                settings you change on purpose (theme, language…), messages you've already closed
     prefs      optional "Remember my choices": recent searches, views, sorts, drafts, layouts
     speed      optional "Faster pages": copies of TMDB answers, posters and summaries on this device
     outside    optional "Extra sources": AniList when you search, the wsrv.nl image helper for exports
   sessionStorage (gone when the tab closes) is always necessary: it carries what you opened between pages.

   Until you choose, the optional kinds are OFF: their keys aren't written (setItem quietly does nothing),
   and AniList / wsrv.nl aren't contacted. Turning a kind off deletes what it had saved.

   ADDING A NEW localStorage KEY? Put it in RULES below — an unlisted key counts as "prefs" (optional)
   and warns in the console — and add it to the table in cookies.html (docs/legal/README.md).

   MSSConsent.allows(kind) · .allowsKey(key) · .open() (the choices popup) · .choice() · .set({prefs, speed, outside})
   MSF_LEGAL: the current version (date) of each legal page. Change one → update docs/legal/README.md.
     terms changes   → every member is asked to agree again (nav.js, _navTermsCheck)
     cookies changes → everyone sees the cookie banner again (only when the kinds or their meaning change)
══════════════════════════════════════════════════════════════════════ */
const MSF_LEGAL = { terms: '2026-11-19', privacy: '2026-11-19', cookies: '2026-11-19', email: 'myscreenfolio@gmail.com' };

const MSSConsent = (() => {
  const KEY = 'msf_consent', KINDS = ['prefs', 'speed', 'outside'];
  // [pattern, kind] — first match wins; strings match exactly, RegExps by pattern
  const RULES = [
    // necessary — signing in and security
    [/^sb-.*-auth-token/, 'necessary'], [/^lswt-/, 'necessary'] /* Supabase's own can-I-store test */, ['mss_remember', 'necessary'], ['msf_accounts', 'necessary'], [KEY, 'necessary'],
    [/^msf_pub_/, 'necessary'], [/^mss_age_/, 'necessary'], ['msf_pending_deletes', 'necessary'], ['mss_data_at', 'necessary'],
    // necessary — settings you change on purpose
    ['wl-theme', 'necessary'], ['mss_lang', 'necessary'], ['mss_notif_popups', 'necessary'], ['mss_wtw_region', 'necessary'],
    ['msf_ep_spoilers', 'necessary'], ['mss_screensaver', 'necessary'], [/^msf_not_interested_/, 'necessary'] /* until sql/136 runs */,
    // necessary — one-time messages you've already seen, and checks that run at most every few minutes / once a day
    ['msf_guest_intro', 'necessary'], [/^mss_welcomed_/, 'necessary'], [/^mss_member_seen_/, 'necessary'], ['mss_pick_asked', 'necessary'],
    [/^msf_otd_n:/, 'necessary'], ['mss_notif_popped', 'necessary'], ['msf_msg_tip_hidden', 'necessary'], [/^msf_pf_make_/, 'necessary'],
    [/^mss_ava_tidy_/, 'necessary'], ['mss_tmdb_tidy', 'necessary'], ['mss_fin_chk', 'necessary'], ['mss_ach_sync', 'necessary'], ['mss_mn_rem', 'necessary'],
    // prefs — remembered to save you time
    [/^mss_recent_search:/, 'prefs'], ['mss_create_recent', 'prefs'], ['mss_emoji_use', 'prefs'], [/^msf_note_draft_/, 'prefs'],
    [/^msf_sort_defaults_/, 'prefs'], [/^msf_list_view_/, 'prefs'], [/^msf_list_bd_/, 'prefs'], [/^pv_view_/, 'prefs'], ['rt_view', 'prefs'],
    ['mss_ep_mode', 'prefs'], [/^mss_notif_display_/, 'prefs'], ['msf_export_prefs', 'prefs'], ['msf_export_recent', 'prefs'],
    ['mss_card_prefs', 'prefs'], ['mss_card_priv', 'prefs'], [/^msf_diary_/, 'prefs'], [/^mss_onboarding_/, 'prefs'],
    [/^msf_home_layout_/, 'prefs'], [/^msf_pinned_note_/, 'prefs'], ['mss_spot_turn', 'prefs'], ['mss_browse_q_v2', 'prefs'],
    // speed — copies kept so pages open faster
    ['mss_ep_seasons_v3', 'speed'], ['mss_browse_prov_v3', 'speed'], ['mss_top_eps_v2', 'speed'], ['mss_recs_v4', 'speed'],
    ['mss_tmdb_posters_v1', 'speed'], ['mss_explore_posters_v1', 'speed'], ['mss_anilist_genres_v1', 'speed'], ['mss_cast_v3', 'speed'],
    [/^mss_skel_/, 'speed'], ['msf_showcase', 'speed'], ['msf_wall', 'speed'], [/^msf_bd_/, 'speed'], [/^mss_ys_html_/, 'speed'],
    [/^msf_home_snap_/, 'speed'], ['msf_export_thumbs', 'speed'], ['mss_tv_season_v1', 'speed'], ['mss_movie_release_v1', 'speed'],
    [/^mss_medals_/, 'speed'],
  ];
  const warned = new Set();
  function kindOf(k) {
    for (const [p, kind] of RULES) if (typeof p === 'string' ? p === k : p.test(k)) return kind;
    if (!warned.has(k)) { warned.add(k); console.warn(`MSSConsent: "${k}" isn’t listed in js/consent.js — treated as optional (prefs). Add it there and describe it in cookies.html.`); }
    return 'prefs';
  }

  let ls = null;
  try { ls = window.localStorage; } catch {}
  const rawSet = Storage.prototype.setItem;
  function read() {
    try { const c = JSON.parse(ls.getItem(KEY) || 'null'); return c && c.v === MSF_LEGAL.cookies ? c : null; } catch { return null; }
  }
  let state = read();
  const allows = kind => kind === 'necessary' || !!state?.[kind];
  const allowsKey = k => allows(kindOf(String(k)));

  // The guard: optional localStorage keys are only written with your OK (sessionStorage is untouched)
  Storage.prototype.setItem = function (k, v) {
    if (ls && this === ls && !allowsKey(k)) return;
    return rawSet.call(this, k, v);
  };

  // Deletes what a kind you've turned off had saved (and the TMDB copies in Cache Storage, nav.js)
  function purge() {
    if (!ls) return;
    try { Object.keys(ls).forEach(k => { if (!allowsKey(k)) ls.removeItem(k); }); } catch {}
    if (!allows('speed') && 'caches' in window) caches.delete('tmdb-data-v1').catch(() => {});
  }

  function set(c) {
    state = { v: MSF_LEGAL.cookies, at: new Date().toISOString() };
    KINDS.forEach(k => { state[k] = !!c[k]; });
    try { rawSet.call(ls, KEY, JSON.stringify(state)); } catch {}
    purge();
    hideBanner();
    document.dispatchEvent(new CustomEvent('msf:consent', { detail: { ...state } }));
  }
  const all = on => set({ prefs: on, speed: on, outside: on });

  /* ── The banner: bottom of the page until you choose (not a blocker — the page works behind it) ── */
  let banner = null;
  const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
  const policy = () => (/cookies\.html$/.test(location.pathname) ? '' : ' <a href="cookies.html">Read the Cookie Policy</a>.');
  function showBanner() {
    // Global Privacy Control (the browser's "don't sell or share" signal) counts as Reject optional — no banner
    if (state || banner || navigator.globalPrivacyControl === true || document.documentElement.hasAttribute('data-no-consent')) return;
    banner = document.createElement('section');
    banner.className = 'ck-banner';
    banner.setAttribute('aria-labelledby', 'ckBannerT');
    banner.innerHTML = `<div class="ck-b-txt"><h2 class="ck-b-t" id="ckBannerT">${ic('shield', 16)}Cookies &amp; storage</h2>
        <p>MSF uses one cookie and your browser’s storage to keep you signed in and safe — that part is always on. With your OK we also
        remember handy things, keep copies so pages open faster, and ask AniList for more anime results.${policy()}</p></div>
      <div class="ck-b-acts"><button type="button" class="ck-btn" data-ck="none">Reject optional</button>
        <button type="button" class="ck-btn" data-ck="choose">Choose…</button>
        <button type="button" class="ck-btn is-primary" data-ck="all">Accept all</button></div>`;
    banner.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ck]'); if (!b) return;
      const a = b.dataset.ck;
      if (a === 'all') all(true); else if (a === 'none') all(false); else open();
    });
    document.body.appendChild(banner);
  }
  function hideBanner() { banner?.remove(); banner = null; }

  /* ── The choices popup (banner › Choose…, footer › Cookie settings, Settings › Privacy, cookies.html) ── */
  const ROWS = [
    ['necessary', 'Necessary', 'Keeps you signed in, keeps your account and messages secure, checks your age group, and remembers settings you change on purpose (Light / Dark, language) and messages you’ve already closed. MSF can’t work without it.', 'lock'],
    ['prefs', 'Remember my choices', 'Recent searches, the views and sorts you pick, unsent note drafts, your Home layout and where you were in setup — on this device.', 'bookmark'],
    ['speed', 'Faster pages', 'Copies of title details, posters and summaries kept on this device, so pages open without asking TMDB again.', 'zap'],
    ['outside', 'Extra sources', 'Searching also asks AniList (an anime database) for more anime, and exported images can fetch posters through wsrv.nl. Your search words and IP address reach them.', 'globe'],
  ];
  let ov = null;
  function open() {
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'confirm-overlay ck-ov';
      ov.innerHTML = `<div class="confirm-card ck-card" role="dialog" aria-labelledby="ckT" aria-describedby="ckD">
          <h2 class="confirm-title" id="ckT">Cookies &amp; storage</h2>
          <p class="ck-d" id="ckD">Choose what MSF may keep on this device. You can change this any time from the footer (Cookie settings) or Settings › Privacy.
            ${/cookies\.html$/.test(location.pathname) ? '' : '<a href="cookies.html">What each one does</a>'}</p>
          <div class="ck-rows">${ROWS.map(([k, name, desc, icn]) => `<div class="ck-row">
              <span class="ck-ic" aria-hidden="true">${ic(icn, 16)}</span>
              <div class="ck-row-t"><div class="ck-name" id="ckN-${k}">${name}</div><div class="ck-desc" id="ckS-${k}">${desc}</div></div>
              ${k === 'necessary' ? `<span class="ck-always">${ic('check', 13)}Always on</span>`
                : `<button type="button" class="push-switch" role="switch" data-kind="${k}" aria-checked="false" aria-labelledby="ckN-${k}" aria-describedby="ckS-${k}"><span aria-hidden="true"></span></button>`}
            </div>`).join('')}</div>
          <div class="ck-acts"><button type="button" class="ck-btn" data-ck="none">Reject optional</button><button type="button" class="ck-btn" data-ck="all">Accept all</button>
            <button type="button" class="ck-btn is-primary" data-ck="save">Save my choices</button></div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => { if (typeof MSSDialog !== 'undefined') MSSDialog.close(ov); else ov.classList.remove('open'); };
      if (typeof MSSDialog !== 'undefined') MSSDialog.bind(ov, close);
      ov.addEventListener('click', ev => {
        const sw = ev.target.closest('.push-switch[data-kind]');
        if (sw) { sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); return; }
        const b = ev.target.closest('[data-ck]'); if (!b) return;
        const a = b.dataset.ck;
        if (a === 'save') { const c = {}; ov.querySelectorAll('[data-kind]').forEach(s => { c[s.dataset.kind] = s.getAttribute('aria-checked') === 'true'; }); set(c); }
        else all(a === 'all');
        close();
        if (typeof showToast === 'function') showToast('Cookie choices saved on this device.');
      });
    }
    ov.querySelectorAll('[data-kind]').forEach(s => s.setAttribute('aria-checked', String(allows(s.dataset.kind))));
    if (typeof MSSDialog !== 'undefined') MSSDialog.open(ov, { focus: '.push-switch' }); else ov.classList.add('open');
    return false;
  }

  function start() {
    const go = () => (state ? null : showBanner());
    if (typeof mssAfterLaunch === 'function') mssAfterLaunch().then(go); else go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // One word for Settings › Privacy › Cookies & storage
  const summary = () => { const n = KINDS.filter(k => allows(k)).length; return n === KINDS.length ? 'All on' : n ? 'Some on' : 'Necessary only'; };
  return { allows, allowsKey, open, set, summary, choice: () => (state ? { ...state } : null), KINDS };
})();
