/* ══════════════════════════════════════════
   splash.js — the opening animation, once each time the site or app is opened
   Loaded first in every page's <head>, so it's on screen before the page paints.
   "Once" lasts as long as the tab or installed app is open (sessionStorage): moving between
   pages, reloading and hard refreshing don't show it; closing and opening again does.

     Signed in → the logo, then the page they opened.
     Signed out, on any page → the logo, then Get Started · Log In · just looking, until they choose
                               (a reload or a redirect to the login page keeps it up). The two buttons
                               shrink the whole screen into the login page's poster panel as the form comes in.
     Signing out or a session ending counts as signed out: "seen" remembers which state it was seen in.

   Not shown: inside a frame, the offline and 404 pages, and password-reset or email links.
   Needs nothing else on the page. Uses the wall of posters saved by login.html when there is one.
══════════════════════════════════════════ */
(() => {
  const SEEN = 'msf_splash_seen', TO = 'msf_splash_to', SHOWN = 'msf_splash_shown', STATE = 'msf_splash_state';
  const page = location.pathname.split('/').pop() || 'index.html', params = new URLSearchParams(location.search);
  let store;
  try { store = sessionStorage; store.getItem(SEEN); } catch { return; }
  if (window.top !== window || page === 'offline.html' || page === '404.html') return;
  if (/access_token|type=recovery|error_description/.test(location.hash) || params.has('preview') || params.has('ended') || params.has('add')) { store.setItem(SEEN, 'guest'); return; }

  const signedIn = (() => {
    try {
      if (localStorage.getItem('mss_remember') === '0' && !/(?:^|;\s*)mss_live=1/.test(document.cookie)) return false;   // ended with the browser
      return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k));
    } catch { return false; }
  })();
  const handOff = page === 'login.html' ? store.getItem(TO) : null;
  store.removeItem(TO);
  const seen = store.getItem(SEEN);
  if (signedIn && seen) store.setItem(SEEN, 'in');
  if (!handOff && (signedIn ? seen : seen === 'guest')) return;
  if (signedIn && page === 'login.html') return;       // about to be sent Home, which plays it
  if (signedIn || handOff) store.setItem(SEEN, signedIn ? 'in' : 'guest');   // otherwise it counts once they choose, in landing()

  const mode = handOff ? 'enter' : signedIn ? 'logo' : 'landing';
  const again = mode === 'landing' && store.getItem(SHOWN);   // a reload or redirect: the logo already played
  if (mode === 'landing') store.setItem(SHOWN, '1');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  const css = document.createElement('style');
  css.textContent = `
html.msf-splash { overflow:hidden; }
#msfSplash { position:fixed; inset:0; z-index:2147483000; overflow:hidden; isolation:isolate; display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:max(24px, env(safe-area-inset-top)) 22px max(24px, env(safe-area-inset-bottom)); box-sizing:border-box; background:#0B0B0F; color:#EDEDED; font-family:'Manrope', system-ui, sans-serif;
  transition:opacity .55s ease, transform .7s cubic-bezier(.22,1,.36,1), clip-path 1s cubic-bezier(.62,.02,.18,1); }
#msfSplash *, #msfSplash *::before { box-sizing:border-box; }
#msfSplash.is-out { opacity:0; transform:scale(1.05); pointer-events:none; }
.msf-s-wall { position:absolute; inset:-14% -12%; z-index:-2; display:grid; grid-template-columns:repeat(5, 1fr); gap:12px; transform:rotate(-8deg) scale(1.18); will-change:transform; opacity:0; transition:opacity 1.2s ease, transform 2.8s cubic-bezier(.16,1,.3,1); }
#msfSplash.is-on .msf-s-wall { opacity:.72; transform:rotate(-8deg) scale(1.05); }
#msfSplash.is-carried, #msfSplash.is-carried .msf-s-wall { transition:none; }
.msf-s-col { display:flex; flex-direction:column; gap:12px; animation:msfDrift 46s linear infinite; }
.msf-s-col:nth-child(even) { animation-direction:reverse; }
.msf-s-tile { aspect-ratio:2/3; border-radius:10px; overflow:hidden; border:0.5px solid rgba(255,255,255,.12); background:linear-gradient(160deg, var(--g), #0B0B0F); }
.msf-s-tile img { display:block; width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity .6s ease; }
.msf-s-tile img.in { opacity:1; }
#msfSplash.is-carried .msf-s-tile img { opacity:1; transition:none; }
@keyframes msfDrift { to { transform:translateY(-50%); } }
#msfSplash::before { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none; background:radial-gradient(min(92vw, 640px) 300px at 50% 62%, rgba(11,11,15,.86) 45%, rgba(11,11,15,0)), radial-gradient(70% 58% at 50% 46%, rgba(11,11,15,.9), rgba(11,11,15,.62) 62%, rgba(11,11,15,.82)), radial-gradient(60% 45% at 12% 100%, rgba(74,103,65,.48), transparent 72%); transition:opacity 1s ease; }
#msfSplash.is-shrinking::before { opacity:.45; }
.msf-s-mark { display:flex; flex-direction:column; align-items:center; gap:18px; width:100%; max-width:560px; }
.msf-s-logo { display:block; height:clamp(84px, 16vh, 128px); width:auto; opacity:0; transform:scale(.86); clip-path:inset(0 100% 0 0); animation:msfLogo .82s cubic-bezier(.22,1,.36,1) .08s forwards; transform-origin:top left; }
@keyframes msfLogo { 55% { opacity:1; } to { opacity:1; transform:none; clip-path:inset(0 -2% 0 0); } }
.msf-s-line { width:min(190px, 46vw); height:2px; border-radius:2px; overflow:hidden; background:rgba(255,255,255,.14); }
.msf-s-line i { display:block; height:100%; background:#7EB86C; transform-origin:left; transform:scaleX(0); animation:msfLine 1s cubic-bezier(.3,.7,.3,1) .12s forwards; }
@keyframes msfLine { to { transform:scaleX(1); } }
.msf-s-eyebrow { font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; text-align:center; color:#9FD88A; opacity:0; animation:msfUp .5s ease .38s forwards; }
@keyframes msfUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
.msf-s-land { display:none; flex-direction:column; align-items:center; width:100%; max-width:440px; margin-top:22px; text-align:center; }
#msfSplash.is-land .msf-s-land { display:flex; }
#msfSplash.is-land .msf-s-line { display:none; }
#msfSplash.is-land .msf-s-logo { height:clamp(64px, 11vh, 92px); }
.msf-s-land > * { opacity:0; animation:msfRise .85s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes msfRise { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:none; } }
.msf-s-head { width:max-content; max-width:calc(100vw - 40px); margin:0; font-family:'Oswald', system-ui, sans-serif; font-weight:600; font-size:clamp(34px, 8.5vw, 56px); line-height:1.06; letter-spacing:-.3px; color:#fff; animation-delay:.14s; }
.msf-s-head em { display:block; font-style:normal; color:#8FCB7C; }
.msf-s-feats { display:grid; gap:8px; margin:18px 0 0; padding:0; list-style:none; font-size:14px; line-height:1.4; color:rgba(237,237,237,.88); animation-delay:.26s; }
.msf-s-acts { display:flex; flex-direction:column; gap:10px; width:100%; margin-top:26px; animation-delay:.38s; }
@media (min-width:520px) { .msf-s-acts { flex-direction:row; } .msf-s-acts > * { flex:1; } }
.msf-s-btn { display:flex; align-items:center; justify-content:center; min-height:52px; padding:0 22px; font:700 15px 'Manrope', system-ui, sans-serif; border-radius:14px; cursor:pointer; border:1px solid rgba(255,255,255,.28); background:rgba(11,11,15,.55); color:#fff; transition:background .18s, border-color .18s, transform .18s; }
.msf-s-btn:hover { border-color:#fff; }
.msf-s-btn.is-main { background:#2E6B36; border-color:#2E6B36; }
.msf-s-btn.is-main:hover { background:#357A3E; border-color:#357A3E; }
.msf-s-btn:active { transform:scale(.98); }
.msf-s-btn:focus-visible, .msf-s-skip:focus-visible { outline:2px solid #9FD88A; outline-offset:3px; }
.msf-s-skip { min-height:44px; margin-top:8px; padding:0 12px; font:600 13.5px 'Manrope', system-ui, sans-serif; color:rgba(237,237,237,.86); background:none; border:none; border-radius:10px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; animation-delay:.48s; }
#msfSplash.is-leaving .msf-s-eyebrow { animation:none; opacity:0; transition:opacity .24s ease; }
#msfSplash.is-leaving .msf-s-land > * { animation:none; opacity:0; transform:translateY(-10px); transition:opacity .24s ease, transform .24s ease; }
html.msf-entering .au-side { opacity:0; transform:translateY(26px); }
html.msf-entering.msf-entered .au-side { opacity:1; transform:none; transition:opacity .7s ease .32s, transform 1s cubic-bezier(.16,1,.3,1) .24s; }
@media (min-width:960px) { html.msf-entering .au-side { transform:translateX(34px); } }
@media (max-height:620px) { .msf-s-feats { display:none; } .msf-s-acts { margin-top:18px; } .msf-s-mark { gap:12px; } }
@media (prefers-reduced-motion: reduce) { #msfSplash, #msfSplash *, html.msf-entering .au-side { animation-duration:.01ms !important; animation-delay:0s !important; transition-duration:.15s !important; transition-delay:0s !important; } .msf-s-col { animation:none; } }
#msfSplash.is-again .msf-s-logo { animation:none; opacity:1; transform:none; clip-path:none; }
#msfSplash.is-again .msf-s-eyebrow { animation:none; opacity:1; }
@media print { #msfSplash { display:none; } }`;
  document.head.appendChild(css);
  root.classList.add('msf-splash');

  // The wall: posters saved by login.html or an earlier visit, on the site's colours until then
  const TONES = ['#2F4A2A', '#6B4A22', '#3B2347', '#22384F', '#1E4A47', '#4A2A22', '#33442A'], COLS = 5, PER = 7;
  const okPath = p => typeof p === 'string' && /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$/.test(p);
  function savedPosters() {
    try {
      const slots = JSON.parse(localStorage.getItem('msf_wall') || 'null')?.slots || {};
      const list = Object.values(slots).flat().map(t => t?.poster);
      const tr = JSON.parse(store.getItem('msf_login_trending') || '[]').map(t => t?.poster);
      return [...list, ...tr].filter(okPath);
    } catch { return []; }
  }

  const el = document.createElement('div');
  el.id = 'msfSplash';
  el.innerHTML = `<div class="msf-s-wall" aria-hidden="true">${Array.from({ length: COLS }, (_, c) => `<div class="msf-s-col" style="animation-delay:-${(c * 7) % 23}s">${Array.from({ length: PER * 2 }, (_, i) =>
      `<div class="msf-s-tile" style="--g:${TONES[(c * 3 + i) % TONES.length]}"></div>`).join('')}</div>`).join('')}</div>
    <div class="msf-s-mark">
      <img class="msf-s-logo" src="icons/logo-nav.png" alt="MyScreenFolio">
      <div class="msf-s-line" aria-hidden="true"><i></i></div>
      <div class="msf-s-eyebrow">Your screen portfolio</div>
      ${mode === 'landing' ? `<div class="msf-s-land">
        <h1 class="msf-s-head" id="msfSplashT">Everything you watch, <em>in one folio.</em></h1>
        <ul class="msf-s-feats"><li>Track shows, movies, anime and every episode</li><li>Rate what you finish and rank your favourites</li><li>Share notes and lists, compare taste with friends</li></ul>
        <div class="msf-s-acts"><button type="button" class="msf-s-btn is-main" data-go="signup">Get Started</button><button type="button" class="msf-s-btn" data-go="login">Log In</button></div>
        <button type="button" class="msf-s-skip" data-skip>Just looking? Browse without an account</button>
      </div>` : ''}
    </div>`;
  if (mode === 'landing') { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'msfSplashT'); }
  else el.setAttribute('aria-hidden', 'true');
  root.appendChild(el);
  // Coming from the landing screen: pick up exactly where that page left off
  const carried = mode === 'enter' ? (() => { try { return JSON.parse(store.getItem(STATE)); } catch { return null; } })() : null;
  store.removeItem(STATE);
  if (mode === 'enter') {
    el.classList.add('is-carried', 'is-on');
    (carried?.wall || []).forEach((t, i) => { const a = el.querySelectorAll('.msf-s-col')[i]?.getAnimations()[0]; if (a) a.currentTime = t + (Date.now() - carried.at); });
  } else requestAnimationFrame(() => el.classList.add('is-on'));

  function fillWall(paths) {
    if (!paths.length) return;
    el.querySelectorAll('.msf-s-col').forEach((col, c) => [...col.children].forEach((tile, i) => {
      if (tile.firstChild) return;
      const img = new Image();
      img.alt = ''; img.decoding = mode === 'enter' ? 'sync' : 'async';
      img.onload = () => img.classList.add('in');
      img.src = `https://image.tmdb.org/t/p/w342${paths[(c * PER + i % PER) % paths.length]}`;
      if (img.complete) img.classList.add('in');      // already downloaded: no fade, it was on screen a moment ago
      tile.appendChild(img);
    }));
  }
  fillWall(savedPosters());

  const setInert = on => { if (document.body) document.body.inert = on; };
  const whenReady = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); };
  whenReady(() => { if (document.getElementById('msfSplash')) setInert(true); });

  function finish() {
    el.classList.add('is-out');
    setInert(false);
    setTimeout(() => { el.remove(); root.classList.remove('msf-splash'); css.remove(); }, 580);
  }

  /* The whole screen really shrinks into the login page's poster panel: the visible area closes in while the
     posters scale down to fit it, the logo glides into its place, and the form comes in behind them. */
  function shrink() {
    whenReady(() => requestAnimationFrame(() => {
      const stage = document.querySelector('.au-stage');
      root.classList.add('msf-entering');
      if (!stage || still) { root.classList.add('msf-entered'); setTimeout(() => { root.classList.remove('msf-entering', 'msf-entered'); finish(); }, 180); return; }
      const E = 'cubic-bezier(.62,.02,.18,1)', vw = window.innerWidth, vh = window.innerHeight;
      const s = stage.getBoundingClientRect(), r = vw - s.right, b = Math.max(0, vh - s.bottom);
      const logo = el.querySelector('.msf-s-logo'), wall = el.querySelector('.msf-s-wall');
      const from = logo.getBoundingClientRect(), to = document.querySelector('.au-brand img')?.getBoundingClientRect();
      el.classList.add('is-leaving', 'is-shrinking');
      el.classList.remove('is-carried');
      el.style.clipPath = 'inset(0px 0px 0px 0px)';
      logo.getAnimations().forEach(a => a.cancel());
      logo.style.animation = 'none'; logo.style.opacity = '1'; logo.style.clipPath = 'none'; logo.style.transform = 'none';
      el.getBoundingClientRect();     // these are the starting values
      requestAnimationFrame(() => {
        el.style.clipPath = `inset(${Math.max(0, s.top)}px ${Math.max(0, r)}px ${b}px ${Math.max(0, s.left)}px)`;
        wall.style.transition = `opacity 1s ease, transform 1s ${E}`;
        wall.style.transformOrigin = '50% 50%';
        wall.style.transform = `translate(${s.left + s.width / 2 - vw / 2}px, ${Math.max(0, s.top) + Math.min(s.height, vh) / 2 - vh / 2}px) rotate(-8deg) scale(${Math.max(s.width / vw, Math.min(s.height, vh) / vh) * 1.05})`;
        if (to && from.height) {
          logo.style.transition = `transform 1s ${E}`;
          logo.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.height / from.height})`;
        }
        root.classList.add('msf-entered');
      });
      setTimeout(() => {
        setInert(false);
        el.style.transition = 'opacity .3s ease';
        el.style.opacity = '0';
        setTimeout(() => { el.remove(); css.remove(); root.classList.remove('msf-splash', 'msf-entering', 'msf-entered'); }, 320);
      }, 1040);
    }));
  }

  /* Logo to landing: everything moves from where it was to its new place, nothing jumps */
  function settle() {
    const logo = el.querySelector('.msf-s-logo'), eyebrow = el.querySelector('.msf-s-eyebrow'), line = el.querySelector('.msf-s-line');
    const a = logo.getBoundingClientRect(), e = eyebrow.getBoundingClientRect(), l = line.getBoundingClientRect();
    el.classList.add('is-land');
    const a2 = logo.getBoundingClientRect(), e2 = eyebrow.getBoundingClientRect(), opts = { duration: 950, easing: 'cubic-bezier(.16,1,.3,1)' };
    logo.animate([{ transform: `translate(${a.left - a2.left}px, ${a.top - a2.top}px) scale(${a.height / a2.height})` }, { transform: 'none' }], opts);
    eyebrow.animate([{ transform: `translateY(${e.top - e2.top}px)` }, { transform: 'none' }], opts);
    const ghost = line.cloneNode(true);       // the progress line leaves the layout at once, so its picture fades out
    Object.assign(ghost.style, { position: 'fixed', left: l.left + 'px', top: l.top + 'px', width: l.width + 'px', display: 'block' });
    Object.assign(ghost.firstElementChild.style, { animation: 'none', transform: 'none' });
    el.appendChild(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease' }).onfinish = () => ghost.remove();
  }

  function landing() {
    if (still || again) el.classList.add('is-land'); else settle();
    const pre = document.createElement('link');          // so the login page is ready the moment they choose
    pre.rel = 'prefetch'; pre.href = 'login.html'; document.head.appendChild(pre);
    el.tabIndex = -1; el.style.outline = 'none'; el.focus({ preventScroll: true });     // read out by screen readers; Tab goes to the buttons
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      store.setItem(SEEN, 'guest');
      if (b.dataset.skip != null) { if (page === 'login.html') location.href = 'index.html'; else finish(); return; }
      el.classList.add('is-leaving');
      if (page === 'login.html') {       // the form is already behind it
        whenReady(() => { const up = b.dataset.go === 'signup'; setMode(up); history.replaceState(null, '', up ? '#signup' : location.pathname); });
        return shrink();
      }
      store.setItem(TO, b.dataset.go);
      setTimeout(() => {
        const at = el.querySelector('.msf-s-logo').getBoundingClientRect();
        store.setItem(STATE, JSON.stringify({ at: Date.now(), left: at.left, top: at.top, height: at.height, wall: [...el.querySelectorAll('.msf-s-col')].map(c => c.getAnimations()[0]?.currentTime || 0) }));
        location.href = b.dataset.go === 'signup' ? 'login.html#signup' : 'login.html';
      }, still ? 0 : 240);
    });
    // Keys stay on these buttons while it's open
    el.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const all = [...el.querySelectorAll('button')], i = all.indexOf(document.activeElement);
      e.preventDefault();
      all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
    });
    // The first visit has no saved posters: fetch them as the login page would
    const fetchWall = async () => {
      if (savedPosters().length || typeof SUPABASE_URL === 'undefined') return;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/tmdb/trending/all/week?language=en-US`);
        if (!res.ok) return;
        const list = ((await res.json()).results || []).map(x => ({ id: x.id, type: x.media_type, title: x.title || x.name, poster: x.poster_path }))
          .filter(t => okPath(t.poster) && (t.type === 'movie' || t.type === 'tv'));
        if (list.length) store.setItem('msf_login_trending', JSON.stringify(list));
        fillWall(list.map(t => t.poster));
      } catch {}
    };
    if (document.readyState === 'complete') fetchWall(); else window.addEventListener('load', fetchWall, { once: true });
  }

  // Coming Back to a page kept in memory shouldn't bring a finished splash back
  window.addEventListener('pageshow', ev => { if (ev.persisted && el.classList.contains('is-leaving')) finish(); });

  const hold = still ? 250 : 1250;
  if (mode === 'enter') {
    el.querySelector('.msf-s-eyebrow').style.display = 'none';
    el.querySelector('.msf-s-line').style.display = 'none';
    const logo = el.querySelector('.msf-s-logo');
    logo.style.animation = 'none'; logo.style.opacity = '1'; logo.style.transform = 'none'; logo.style.clipPath = 'none'; logo.style.height = 'clamp(64px, 11vh, 92px)';
    if (carried) Object.assign(logo.style, { position: 'fixed', left: carried.left + 'px', top: carried.top + 'px', height: carried.height + 'px' });
    shrink();
  } else if (mode === 'landing') {
    if (again) el.classList.add('is-again');
    setTimeout(landing, again ? 0 : still ? 150 : 1000);
  } else setTimeout(finish, hold);
})();
