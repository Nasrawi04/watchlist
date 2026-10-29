/* ════════════════════════════════════════════════════════════
   screensaver.js — MSSScreensaver: the bouncing-logo Easter egg
   Loaded by config.js (mssIdle) the first time you leave the site alone long
   enough (3 minutes on a computer, 1 on a phone). The page dims slightly and the
   MSF logo — one solid colour, like the old DVD logo — drifts around and bounces
   off the edges, changing to another of the site's colours at every bounce.
   Hitting a corner exactly earns the secret Perfect Corner medal (077).
   Any move, tap, key or scroll wakes the page straight away; the tap that wakes
   it doesn't also press whatever was under your finger.
   Styles: "Screensaver" in css/style.css.
   ════════════════════════════════════════════════════════════ */
window.MSSScreensaver = (() => {
  // the site's colours — brighter ones over the dark theme, deeper ones over the light (so it always stands out)
  const COLORS = {
    dark:  ['#7EB86C', '#8AAFD1', '#B48BC9', '#E2B53E', '#5FB3A8', '#D9774A', '#E2DAD0'],
    light: ['#1E5C26', '#3D6D96', '#7A4A8C', '#B8862A', '#2E7D72', '#B0562E', '#2B2A28'],
  };
  const touch = matchMedia('(pointer: coarse)').matches;
  let el = null, logo = null, ci = -1, x = 0, y = 0, vx = 0, vy = 0, w = 0, h = 0, raf = 0, last = 0, swallow = false, px = null, py = null;
  const api = { on: false, start, stop };

  function build() {
    el = document.createElement('div');
    el.className = 'mss-ss';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="mss-ss-logo"></div>
      <div class="mss-ss-hint">
        <span class="mss-ss-hint-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2.5"/><path d="m17 2-5 5-5-5"/></svg></span>
        <span class="mss-ss-hint-tx"><b>Your folio is resting</b><small>${touch ? 'Tap anywhere to wake it' : 'Move your mouse to wake it'}</small></span>
      </div>`;
    document.body.appendChild(el);
    logo = el.firstElementChild;
  }
  // the next colour — never the same twice in a row
  function color() {
    const set = COLORS[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
    let n; do n = Math.floor(Math.random() * set.length); while (n === ci);
    ci = n; el.style.setProperty('--ss-c', set[ci]);
  }
  function measure() {
    const r = logo.getBoundingClientRect(); w = r.width; h = r.height;
    x = Math.min(Math.max(0, x), Math.max(0, innerWidth - w)); y = Math.min(Math.max(0, y), Math.max(0, innerHeight - h));
  }
  function burst(cx, cy) {
    const b = document.createElement('div');
    b.className = 'mss-ss-burst'; b.style.left = cx + 'px'; b.style.top = cy + 'px';
    b.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * (360 / 14)}deg;--d:${60 + (i % 3) * 22}px"></i>`).join('');
    el.appendChild(b); setTimeout(() => b.remove(), 1000);
  }
  // The moment everyone waits for → the secret medal (signed in), once
  async function corner(cx, cy) {
    burst(cx, cy);
    if (window._navGuest || !window._navUser) { showToast('★ It hit the corner! Sign in to keep the Perfect Corner medal.'); return; }
    try {
      const { data, error } = await sb.rpc('earn_secret_medal', { p_key: 'perfect-corner' });
      if (error) throw error;
      showToast(data?.new ? '★ It hit the corner! New secret medal: Perfect Corner' : '★ Another perfect corner!');
    } catch (err) {
      console.warn('Perfect Corner:', err);
      showToast('★ It hit the corner!');
    }
  }
  function step(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    x += vx * dt; y += vy * dt;
    const maxX = Math.max(0, innerWidth - w), maxY = Math.max(0, innerHeight - h);
    let hitX = false, hitY = false;
    if (x <= 0)    { x = 0;    vx = Math.abs(vx);  hitX = true; }
    if (x >= maxX) { x = maxX; vx = -Math.abs(vx); hitX = true; }
    if (y <= 0)    { y = 0;    vy = Math.abs(vy);  hitY = true; }
    if (y >= maxY) { y = maxY; vy = -Math.abs(vy); hitY = true; }
    // a corner = both walls within a few pixels of each other
    const nearX = x <= 3 || x >= maxX - 3, nearY = y <= 3 || y >= maxY - 3;
    if ((hitX && nearY) || (hitY && nearX)) corner(x < 10 ? 0 : innerWidth, y < 10 ? 0 : innerHeight);
    if (hitX || hitY) color();
    logo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    raf = requestAnimationFrame(step);
  }

  function start() {
    if (api.on) return;
    if (!el) build();
    api.on = true; swallow = false; px = py = null;
    document.body.classList.add('mss-ss-running');
    color();
    el.classList.remove('out');
    el.offsetWidth;                                   // (so the fade-in runs)
    el.classList.add('on');
    measure();
    const speed = Math.max(90, Math.min(innerWidth, innerHeight) * 0.22);    // px a second — a calm drift on any screen
    const a = Math.PI / 4 + Math.floor(Math.random() * 4) * (Math.PI / 2) + (Math.random() - 0.5) * 0.5;
    x = Math.random() * Math.max(0, innerWidth - w); y = Math.random() * Math.max(0, innerHeight - h);
    vx = Math.cos(a) * speed; vy = Math.sin(a) * speed;
    logo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    last = 0; raf = requestAnimationFrame(step);
    addEventListener('resize', measure);
    document.addEventListener('visibilitychange', vis);
  }
  function stop() {
    if (!api.on) return;
    api.on = false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', measure);
    document.removeEventListener('visibilitychange', vis);
    el.classList.add('out'); el.classList.remove('on');
    document.body.classList.remove('mss-ss-running');
    mssIdle.arm();
  }
  function vis() {
    cancelAnimationFrame(raf);
    if (!document.hidden && api.on) { last = 0; raf = requestAnimationFrame(step); }
  }

  // Waking up — anything at all, but not a jittery mouse; a waking tap / click goes no further
  addEventListener('pointermove', e => {
    if (!api.on) return;
    if (px == null) { px = e.clientX; py = e.clientY; return; }
    if (Math.hypot(e.clientX - px, e.clientY - py) > 6) stop();
  }, { passive: true });
  addEventListener('pointerdown', e => { if (api.on) { e.preventDefault(); e.stopPropagation(); swallow = true; setTimeout(() => { swallow = false; }, 700); stop(); } }, true);
  addEventListener('click', e => { if (swallow) { e.preventDefault(); e.stopPropagation(); swallow = false; } }, true);
  ['keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (api.on) stop(); }, { passive: true, capture: true }));

  return api;
})();
