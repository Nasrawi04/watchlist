/* ══════════════════════════════════════════════════════════════════════
   splash.js — what's on screen before the page: plain HTML/CSS, drawn at once (first in <head>)
     Signed out → the guest intro, on the home page only and only on this device's first visit:
       logo · "Your screen portfolio" · Everything you watch, in one folio. · three benefits ·
       Create your folio · Sign in · Just looking? Browse as a guest. On desktop "A folio in action"
       (folio-cards.js — the admin's Guest showcase) fills in on the right; phones have the poster
       wall on top instead. Never on login.html (it doesn't load this file).
     Signed in → the launch screen (logo on the poster wall), once each time the app or tab is opened
       (sessionStorage: moving between pages, reloading and coming back from the background don't
       bring it back). The page loads and runs behind it — nothing waits for it — and it fades out
       after LAUNCH_MS (a shorter LAUNCH_DEEP_MS when the first page is a deep link or a notification).
       Tap / any key / Skip closes it sooner. It's announced, and never holds the keyboard.
   Both use the poster wall chosen in Admin (sign_in_wall, 078; this device's copy 'msf_wall').
   Also sets window.mssSignedInHint (nav.js draws the header for it before auth answers) and
   window.mssLaunchOpen() (popups that open on their own wait for the launch screen: config.js mssAfterLaunch).
   Not shown: inside a frame, the offline and 404 pages, password-reset or email links.
══════════════════════════════════════════════════════════════════════ */
(() => {
  const LAUNCH_MS = 7000;           // how long the signed-in launch screen stays — the one place to change it
  const LAUNCH_DEEP_MS = 1200;      // …when the app opens straight onto another page (a link, a notification)
  const page = location.pathname.split('/').pop() || 'index.html', params = new URLSearchParams(location.search);
  const signedIn = (() => {
    try {
      if (localStorage.getItem('mss_remember') === '0' && !/(?:^|;\s*)mss_live=1/.test(document.cookie)) return false;   // ended with the browser
      return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k));
    } catch { return false; }
  })();
  window.mssSignedInHint = signedIn;
  window.mssLaunchOpen = () => !!document.getElementById('msfLaunch');
  let store;
  try { store = sessionStorage; store.getItem('msf_launch'); } catch { return; }
  if (window.top !== window || page === 'offline.html' || page === '404.html' || page === 'login.html') return;
  if (/access_token|type=recovery|error_description/.test(location.hash) || params.has('ended')) return;

  const home = page === 'index.html';
  const preview = home && params.has('showcase-preview');           // Admin → Guest showcase → Preview
  const first = !store.getItem('msf_launch');        // the first page since the app / tab was opened
  store.setItem('msf_launch', '1');
  let mode = null;
  if (preview) mode = 'intro';
  else if (signedIn) { if (first) mode = 'launch'; }
  else if (home) { try { if (!localStorage.getItem('msf_guest_intro')) { mode = 'intro'; localStorage.setItem('msf_guest_intro', '1'); } } catch {} }
  if (params.has('preview')) mode = null;
  if (!mode) return;

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  // The splash is dark in both themes (it sits on the poster wall): MSF's dark palette
  const css = document.createElement('style');
  css.textContent = `
html.msf-splash { overflow:hidden; }
.msf-sp { --s-bg:#04130A; --s-text:#F3EEDC; --s-text-2:#C7C4B7; --s-olive:#1F4D33; --s-olive-light:#A6CCB1; --s-line:rgba(255,255,255,.18);
  position:fixed; inset:0; z-index:2147483000; overflow:hidden; isolation:isolate; box-sizing:border-box; background:var(--s-bg); color:var(--s-text);
  font-family:'Manrope', system-ui, sans-serif; transition:opacity .5s ease; }
.msf-sp *, .msf-sp *::before { box-sizing:border-box; }
.msf-sp.is-out { opacity:0; pointer-events:none; }
.msf-s-wall { position:absolute; inset:-14% -12%; z-index:-2; display:grid; grid-template-columns:repeat(var(--cols, 5), 1fr); gap:12px; transform:rotate(-8deg) scale(1.08); }
.msf-s-col { display:flex; flex-direction:column; gap:12px; animation:msfDrift 60s linear infinite; }
.msf-s-col:nth-child(even) { animation-direction:reverse; }
.msf-s-tile { aspect-ratio:2/3; border-radius:10px; overflow:hidden; border:0.5px solid rgba(255,255,255,.1); background:linear-gradient(160deg, var(--g), var(--s-bg)); }
.msf-s-tile img { display:block; width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity .8s ease; }
.msf-s-tile img.in { opacity:.62; }
@keyframes msfDrift { to { transform:translateY(-50%); } }
.msf-sp::before { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:radial-gradient(70% 60% at 50% 50%, rgba(4,19,10,.82), rgba(4,19,10,.55) 70%, rgba(4,19,10,.8)), radial-gradient(60% 45% at 12% 100%, rgba(74,103,65,.42), transparent 72%); }
.msf-i { display:grid; grid-template-columns:minmax(0, 560px) minmax(0, 420px); justify-content:center; align-items:center; gap:clamp(32px, 6vw, 96px); height:100%;
  padding:max(24px, env(safe-area-inset-top)) clamp(20px, 5vw, 72px) max(24px, env(safe-area-inset-bottom)); overflow-y:auto; }
.msf-sp.msf-i-on::before { background:linear-gradient(90deg, rgba(4,19,10,.94) 0%, rgba(4,19,10,.82) 45%, rgba(4,19,10,.45) 100%), radial-gradient(60% 45% at 12% 100%, rgba(74,103,65,.42), transparent 72%); }
.msf-i-logo { display:block; height:clamp(52px, 8vh, 72px); width:auto; margin-bottom:20px; }
.msf-i-eyebrow { font-size:11px; font-weight:800; letter-spacing:3px; text-transform:uppercase; color:var(--s-olive-light); }
.msf-i-head:focus { outline:none; }
.msf-i-head { margin:10px 0 0; font-family:'Oswald', system-ui, sans-serif; font-weight:600; font-size:clamp(36px, 5vw, 60px); line-height:1.04; letter-spacing:-.3px; color:#fff; }
.msf-i-head em { display:block; font-style:normal; color:var(--s-olive-light); }
.msf-i-feats { display:grid; gap:10px; margin:22px 0 0; padding:0; list-style:none; font-size:15px; line-height:1.4; color:var(--s-text-2); }
.msf-i-feats li { display:flex; gap:10px; align-items:center; }
.msf-i-feats li::before { content:''; width:8px; height:8px; flex:none; border-radius:2px; background:var(--s-olive-light); }
.msf-i-acts { display:flex; gap:10px; margin-top:28px; flex-wrap:wrap; }
.msf-i-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:50px; padding:0 22px; border-radius:10px; border:1px solid var(--s-line);
  font:700 15px 'Manrope', system-ui, sans-serif; color:#fff; text-decoration:none; background:rgba(4,19,10,.5); cursor:pointer; }
.msf-i-btn:hover { border-color:#fff; }
.msf-i-btn.is-main { background:var(--s-olive); border-color:var(--s-olive-light); }
.msf-i-btn.is-main:hover { background:#2E6B45; }
.msf-i-skip { display:inline-flex; align-items:center; gap:4px; min-height:44px; margin-top:10px; padding:0; border:0; background:none; cursor:pointer;
  font:600 14px 'Manrope', system-ui, sans-serif; color:var(--s-text-2); }
.msf-i-skip u { color:#fff; text-underline-offset:3px; }
.msf-i-credit { margin-top:14px; font-size:12px; color:var(--s-text-2); }
.msf-i-btn:focus-visible, .msf-i-skip:focus-visible, .msf-l-skip:focus-visible { outline:2px solid var(--s-olive-light); outline-offset:3px; }
.msf-i-right { display:flex; flex-direction:column; gap:14px; }
.msf-i-cards { opacity:0; transform:translateY(10px); transition:opacity .6s ease, transform .8s cubic-bezier(.16,1,.3,1); }
.msf-i-cards.in { opacity:1; transform:none; }

@media (max-width:959px) {
  .msf-i { grid-template-columns:1fr; align-content:end; justify-content:stretch; gap:0; }
  .msf-i-right { display:none; }
  .msf-i-left { max-width:520px; width:100%; margin:0 auto; }
  .msf-sp.msf-i-on::before { background:linear-gradient(180deg, rgba(4,19,10,.1) 0%, rgba(4,19,10,.55) 38%, rgba(4,19,10,.96) 62%); }
  .msf-i-acts { flex-direction:column; }
  .msf-i-acts .msf-i-btn { width:100%; }
  .msf-i-skip { width:100%; justify-content:center; }
  .msf-i-credit { text-align:center; }
}
@media (max-height:640px) and (max-width:959px) { .msf-i-feats { display:none; } .msf-i-logo { display:none; } }
.msf-l { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:24px; }
.msf-l-logo { display:block; height:clamp(84px, 16vh, 128px); width:auto; animation:msfIn .9s cubic-bezier(.22,1,.36,1) both; }
.msf-l-eyebrow { font-size:11px; font-weight:800; letter-spacing:3px; text-transform:uppercase; color:var(--s-olive-light); animation:msfIn .9s .2s cubic-bezier(.22,1,.36,1) both; }
.msf-l-skip { position:absolute; inset-inline-end:max(16px, env(safe-area-inset-right)); bottom:max(20px, env(safe-area-inset-bottom)); min-height:44px; padding:0 18px; border-radius:10px;
  border:1px solid var(--s-line); background:rgba(4,19,10,.5); color:#fff; font:700 14px 'Manrope', system-ui, sans-serif; cursor:pointer; }
.msf-l-skip:hover { border-color:#fff; }
.msf-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
@keyframes msfIn { from { opacity:0; transform:translateY(10px) scale(.97); } }
@media (prefers-reduced-motion: reduce) { .msf-sp, .msf-sp * { animation:none !important; transition-duration:.15s !important; } }
@media print { .msf-sp { display:none; } }`;
  document.head.appendChild(css);
  root.classList.add('msf-splash');

  // The wall: posters chosen in Admin (this device's copy), on the site's colours until they arrive
  const TONES = ['#2F4A2A', '#6B4A22', '#3B2347', '#22384F', '#1E4A47', '#4A2A22', '#33442A'], PER = 7;
  const COLS = innerWidth >= 1200 ? 9 : innerWidth >= 700 ? 7 : 5;     // posters about the same size on every screen
  const okPath = p => typeof p === 'string' && /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$/.test(p);
  const savedPosters = () => {
    try { return Object.values(JSON.parse(localStorage.getItem('msf_wall') || 'null')?.slots || {}).flat().map(t => t?.poster).filter(okPath); } catch { return []; }
  };
  const wall = `<div class="msf-s-wall" aria-hidden="true" style="--cols:${COLS}">${Array.from({ length: COLS }, (_, c) => `<div class="msf-s-col" style="animation-delay:-${(c * 7) % 23}s">${Array.from({ length: PER * 2 }, (_, i) =>
      `<div class="msf-s-tile" style="--g:${TONES[(c * 3 + i) % TONES.length]}"></div>`).join('')}</div>`).join('')}</div>`;

  const el = document.createElement('div');
  el.className = 'msf-sp';
  if (mode === 'intro') {
    el.id = 'msfSplash';
    el.classList.add('msf-i-on');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'msfIntroT');
    el.innerHTML = `${wall}<div class="msf-i">
        <div class="msf-i-left">
          <img class="msf-i-logo" src="icons/logo-dark.svg" alt="MyScreenFolio">
          <div class="msf-i-eyebrow">Your screen portfolio</div>
          <h1 class="msf-i-head" id="msfIntroT" tabindex="-1">Everything you watch, <em>in one folio.</em></h1>
          <ul class="msf-i-feats"><li>Track shows, movies, anime and every episode</li><li>Rate what you finish and rank your favourites</li><li>Share lists and notes, compare taste with friends</li></ul>
          <div class="msf-i-acts"><a class="msf-i-btn is-main" href="login.html#signup">Create your folio <span aria-hidden="true">→</span></a><a class="msf-i-btn" href="login.html">Sign in</a></div>
          <button type="button" class="msf-i-skip" data-skip>Just looking? <u>Browse as a guest</u> <span aria-hidden="true">→</span></button>
          <div class="msf-i-credit">Free · Movies, TV, anime and cartoons · Data from TMDB</div>
        </div>
        <div class="msf-i-right" role="group" aria-labelledby="msfFolioT"><div class="msf-i-eyebrow" id="msfFolioT">A folio in action</div><div class="msf-i-cards mf-stage" id="msfFolio"></div></div>
      </div>`;
  } else {
    el.id = 'msfLaunch';
    el.setAttribute('role', 'status');
    el.innerHTML = `${wall}<div class="msf-l"><img class="msf-l-logo" src="icons/logo-dark.svg" alt=""><span class="msf-sr">MyScreenFolio is opening</span>
        <div class="msf-l-eyebrow" aria-hidden="true">Your screen portfolio</div></div>
      <button type="button" class="msf-l-skip">Skip</button>`;
  }
  root.appendChild(el);

  function fillWall(paths) {
    if (!paths.length) return;
    el.querySelectorAll('.msf-s-col').forEach((col, c) => [...col.children].forEach((tile, i) => {
      if (tile.firstChild) return;
      const img = new Image();
      img.alt = ''; img.decoding = 'async';
      img.onload = () => img.classList.add('in');
      img.src = `https://image.tmdb.org/t/p/w342${paths[(c * PER + i % PER) % paths.length]}`;
      tile.appendChild(img);
    }));
  }
  fillWall(savedPosters());
  if (still) el.querySelectorAll('.msf-s-col').forEach(c => { c.style.animation = 'none'; });

  const whenReady = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); };
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    el.classList.add('is-out');
    setTimeout(() => {
      el.remove(); root.classList.remove('msf-splash'); css.remove();
      document.dispatchEvent(new CustomEvent('mss:launch-done'));
    }, still ? 150 : 520);
  }
  // The admin's poster wall, the first time this device sees it (sign_in_wall, 078)
  const fetchWall = async () => {
    if (savedPosters().length || typeof sb === 'undefined' || !sb) return;
    try {
      const { data } = await sb.from('sign_in_wall').select('slots, updated_at').eq('id', 1).maybeSingle();
      const paths = Object.values(data?.slots || {}).flat().map(t => t?.poster).filter(okPath);
      if (!paths.length) return;
      try { localStorage.setItem('msf_wall', JSON.stringify({ slots: data.slots, updated_at: data.updated_at })); } catch {}
      fillWall(paths);
    } catch {}
  };
  if (document.readyState === 'complete') fetchWall(); else addEventListener('load', fetchWall, { once: true });
  addEventListener('pageshow', ev => { if (ev.persisted) finish(); });   // back to a page kept in memory

  if (mode === 'launch') {
    // nothing here waits: the page under it is already loading; it just fades out
    setTimeout(finish, home && !location.search ? LAUNCH_MS : LAUNCH_DEEP_MS);
    el.addEventListener('click', finish);
    addEventListener('keydown', finish, { once: true });
    return;
  }

  // The guest intro: keys stay on its buttons while it's open; Esc = browse as a guest
  whenReady(() => {
    el.querySelector('#msfIntroT')?.focus({ preventScroll: true });
    const show = () => {
      const box = el.querySelector('#msfFolio');
      if (!box || typeof MSSFolio === 'undefined' || !matchMedia('(min-width:960px)').matches) return;
      box.innerHTML = MSSFolio.cardsHTML();
      requestAnimationFrame(() => box.classList.add('in'));
    };
    show();
    if (typeof MSSFolio !== 'undefined') MSSFolio.refresh().then(n => { if (n) show(); });
  });
  el.addEventListener('click', e => { if (e.target.closest('[data-skip]')) finish(); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
    if (e.key !== 'Tab') return;
    const all = [...el.querySelectorAll('a[href], button')], i = all.indexOf(document.activeElement);
    e.preventDefault();
    all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
  });
})();
