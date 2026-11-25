/* ══════════════════════════════════════════
   onboarding.js — Welcome to MyScreenFolio (8 slides) → Set up your folio (5 steps)
   Design: the approved proposal v2 (18 Nov 2026; in git history). Styles: css/onboarding.css (loaded when it opens).

   Who sees it: every signed-in account once — new accounts right after sign-up, existing accounts the first
   time they open MSF after it went live. Guests never. Remembered on the account (profiles.onboarding,
   sql/134; until 134 runs, on this device).
     MSSOnboarding.auto()           nav.js calls this on sign-in: the welcome if it hasn't been seen, or the
                                    rating step when you come back from rating a Top 5 title (?setup=rate)
     MSSOnboarding.welcome()        the slides again (footer › Help › Watch the welcome again)
     MSSOnboarding.setup()          Set up your folio (Settings › My Profile, footer › Help)

   Setup uses only what MSF already has — nothing is stored twice:
     1 Profile photo      MSSAvatarUpload (upload) · MSSBackdropPicker (a poster) · profile_layout.photo (shape)
     2 Your Top 5         profiles.top_picks (entry ids); a pick that isn't in your library is added as
                          Watched (MSSInfo.quickAdd)
     3 Rate them          your Top 5 as the profile's Top Favorites tiles; one opens the full rating page
                          (goToDetail → detail.html, Ratings) and Save comes back here (?setup=rate)
     4 Favourite people   profiles.fav_actors · fav_directors · profile_layout.fav_actresses (mssPersonSearch)
     5 Friends            profiles search by @username · MSSFollow rows · mssTasteMatch · your profile link
   A step counts as done from what's on your profile, so an existing account only sees what's missing.
══════════════════════════════════════════ */
const MSSOnboarding = (() => {
  const A = 'assets/onboarding/', IMG = 'https://image.tmdb.org/t/p/';
  const esc = s => escHTML(s == null ? '' : String(s));
  const ic = (n, s) => `<span class="ob-ic" aria-hidden="true">${icon(n, s || 18)}</span>`;
  const uid = () => window._navUser?.id;
  const prof = () => window._navUserProfile || {};
  const phone = () => matchMedia('(max-width: 767px)').matches;
  const tablet = () => !phone() && matchMedia('(max-width: 1023px)').matches;
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const logo = () => `<img class="ob-logo" src="icons/logo-${dark() ? 'dark' : 'light'}.svg" alt="MyScreenFolio" width="142" height="60">`;
  let root = null, lastFocus = null, onKey = null, wall = null, changed = false;

  /* ── Where you are (profiles.onboarding, or this device until sql/134 runs) ── */
  const LS = () => 'mss_onboarding_' + uid();
  const hasCol = () => 'onboarding' in prof();
  function state() {
    if (hasCol()) return { ...(prof().onboarding || {}) };
    try { return JSON.parse(localStorage.getItem(LS()) || '{}') || {}; } catch { return {}; }
  }
  async function save(patch) {
    const s = { v: 1, ...state(), ...patch };
    if (hasCol()) {
      prof().onboarding = s;
      try { await updateProfile(uid(), { onboarding: s }); } catch (err) { console.warn('Onboarding:', err); }
    } else try { localStorage.setItem(LS(), JSON.stringify(s)); } catch {}
    return s;
  }
  const mark = (k, how) => { const s = state(), done = new Set(s.done || []), skip = new Set(s.skipped || []);
    if (how === 'done') { done.add(k); skip.delete(k); } else if (!done.has(k)) skip.add(k);
    return save({ done: [...done], skipped: [...skip] }); };

  /* ── The layer: one full-screen dialog over the page ── */
  function openLayer(label) {
    close(true);
    lastFocus = document.activeElement;
    root = document.createElement('div');
    root.className = 'ob ob-layer-in';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', label);
    document.body.appendChild(root);
    document.documentElement.classList.add('ob-open');
    document.body.style.overflow = 'hidden';
    return root;
  }
  // closes the layer; a finished or skipped setup is remembered, and Home redraws when something changed
  async function close(quiet) {
    if (!root) return;
    wall?.stop(); wall = null;
    if (onKey) removeEventListener('keydown', onKey, true), onKey = null;
    root.remove(); root = null;
    document.documentElement.classList.remove('ob-open');
    document.body.style.overflow = '';
    if (quiet) return;
    mssOnboardingDone();
    lastFocus?.focus?.();
    if (changed && /(^|\/)(index\.html)?$/.test(location.pathname)) location.reload();
  }
  // focus stays inside the layer (Tab / Shift+Tab wrap)
  function trap(e) {
    if (e.key !== 'Tab' || !root) return;
    const f = [...root.querySelectorAll('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  /* ══════════════ Welcome: 8 slides ══════════════ */
  // a real screenshot (assets/onboarding/<name>-<desktop|tablet|phone>-<light|dark>.jpg) in a device frame
  const shot = (n, d) => `${A}${n}-${d}-${dark() ? 'dark' : 'light'}.jpg`;
  const lap = (n, st) => `<div class="dvf dvf-lap" style="${st}"><div class="dvf-scr"><div><img src="${shot(n, 'desktop')}" alt="" loading="lazy" decoding="async"></div></div><div class="dvf-base"></div></div>`;
  const ph = (n, st) => `<div class="dvf dvf-ph" style="${st}"><div>${mssPhoneBar()}<img src="${shot(n, 'phone')}" alt="" loading="lazy" decoding="async"></div></div>`;
  const tab = (n, st) => `<div class="dvf dvf-tab" style="${st}"><div><img src="${shot(n, 'tablet')}" alt="" loading="lazy" decoding="async"></div></div>`;
  // the usual pair: a laptop with the page, a phone in front; phones see the phone alone, tablets the tablet layout
  const pair = (a, b) => phone() ? ph(a, '--w:min(58vw, 225px);position:relative') : tablet() ? tab(a, '--w:min(62vw, 46vh);position:relative;margin-inline-end:12%') + ph(b || a, '--w:min(28vw, 22vh);right:4%;bottom:2%')
    : lap(a, '--w:min(57vw, 820px);left:0;top:50%;transform:translateY(-54%)') + ph(b || a, '--w:min(14.5vw, 210px);right:-10px;bottom:6%');
  const chips = a => `<div class="ob-chips">${a.map(([i, l]) => `<span class="ob-chip">${ic(i, 15)} ${l}</span>`).join('')}</div>`;
  const RATE = [['Story & Plot', 9.5], ['World Building', 10], ['Writing & Dialogue', 10], ['Pacing & Consistency', 9.5], ['Ending & Payoff', 10],
    ['Character Development', 10], ['Acting / Voice Acting', 10], ['Animation Quality', 10], ['Overall Enjoyment', 10]];
  const BONUS = [['Emotional Impact', 10], ['Music & Soundtrack', 10], ['Rewatchability', 10]];
  // slide 6: MSF's creators (@nasrawi04 and @nrimn_hs) — mssTasteMatch on their libraries, 18 Nov 2026: 91%, 75 titles rated by both;
  // four they both scored 9+ (title, poster, Nasrawi's score, N1's)
  const MATCH = { rated: 75, loves: [['Breaking Bad', '/7LUswjn6jgLxdJ4e6sgwkULXsZI.jpg', 9.86, 9.91], ['Interstellar', '/96LZNXbXW6lNIuNlnn5rbmx5SVS.jpg', 9.65, 9.64],
    ['Arcane', '/o3nXoZaMMgGeDPBMv9SMhsXxE4V.jpg', 9.92, 9.34], ['Se7en', '/qQVQ3zy2KkUYc4HkM46oSXilWaH.jpg', 9.63, 9.61]] };
  const rr = (a, bonus, n0 = 0) => a.map(([l, v], i) => `<div class="ob-rr${bonus ? ' is-bonus' : ''}" style="--v:${v};--n:${n0 + i}"><span>${l}</span><i></i><b>${String(v).replace('.0', '')}</b></div>`).join('');
  const ring = st => `<div class="ob-ring" style="--v:99;${st || ''}" role="img" aria-label="A 9.92 Masterpiece"><div><big data-count="9.92" data-dec="2">9.92</big><small>Masterpiece</small></div></div>`;
  function slides() {
    const p = prof(), av = safeURL(p.avatar_url), name = p.display_name || p.username || 'You';
    return [
      { label: 'Welcome to MyScreenFolio', copy: `<span class="ob-eyebrow">Welcome to MyScreenFolio</span><h1>Your screen portfolio starts here.</h1>
          <p>Track, rate and share everything you watch.</p>
          <div class="ob-cats">${[['tv', 'TV Shows'], ['film', 'Movies'], ['animeFace', 'Anime'], ['brush', 'Cartoons']].map(([i, l]) => `<span class="ob-cat">${ic(i, 17)} ${l}</span>`).join('')}</div>`,
        // the creators' folios: Nasrawi's profile, N1's Top Favorites (and the other way round on phones)
        vis: () => phone() ? `<div class="dvf dvf-ph" style="--w:min(39vw, 150px);left:4%;top:22%;rotate:-6deg"><div>${mssPhoneBar()}<img src="${shot('n1-profile', 'phone')}" alt=""></div></div><div class="dvf dvf-ph" style="--w:min(39vw, 150px);right:4%;top:22%;rotate:6deg"><div>${mssPhoneBar()}<img src="${shot('discover', 'phone')}" alt=""></div></div>` + ph('nas-favs', '--w:min(54vw, 205px);position:relative')
          : pair('nas-profile', 'n1-favs') },
      { label: 'Everything you watch, one place', copy: `<span class="ob-eyebrow">Your library</span><h1>Everything you watch, one place.</h1>
          <p>Watching, Watched, Watchlist — always know where you left off.</p>${chips([['play', 'Progress'], ['calendar', 'Watch dates'], ['filter', 'Sort & filter']])}`,
        vis: () => pair('n1-library', 'nas-library') },
      { label: 'Ratings that actually mean something', copy: `<span class="ob-eyebrow">What makes MSF different</span><h1>Ratings that actually mean something.</h1>
          <p>Not one star. Up to <span class="ob-em">9 core</span> and <span class="ob-em">bonus</span> criteria, weighted into your score.</p>
          ${phone() ? '' : `<div class="ob-vs"><div><div class="ob-stars" aria-hidden="true">★★★★☆</div>Elsewhere: a guess</div>${ic('chevright', 22)}<div><b>12 criteria → 9.92</b><br>On MSF: built</div></div>`}
          <p class="ob-say">Built, not randomly assigned.</p>`,
        vis: () => phone() ? `<div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center">${ph('nas-ratings', '--w:min(49vw, 190px);position:relative;margin-inline-end:24vw')}${ring('position:absolute;right:6px;top:50%;width:min(38vw, 150px);height:min(38vw, 150px);transform:translateY(-50%)')}</div>`
          : `<div class="ob-rate">${tablet() ? '' : ph('nas-ratings', '--w:min(16vw, 230px);position:relative')}<div class="ob-rcard"><h3>Core ratings <span>9 of 9</span></h3>${rr(RATE)}<h3>Bonus ratings <span>3 added</span></h3>${rr(BONUS, true, RATE.length)}</div>${ring()}</div>` },
      { label: 'Your entertainment, your way', copy: `<span class="ob-eyebrow">Your profile</span><h1>Your entertainment, your way.</h1>
          <p>Your Top 5, lists, notes and stats — your taste, on show.</p>${chips([['star', 'Top Favorites'], ['list', 'Lists'], ['notebook', 'Notes']])}`,
        vis: () => phone() ? ph('n1-favs', '--w:min(51vw, 200px);left:8%;top:6%') + ph('nas-lists', '--w:min(44vw, 170px);right:6%;bottom:6%')
          : tablet() ? pair('n1-favs', 'nas-lists') : lap('n1-favs', '--w:min(56vw, 800px);left:0;top:50%;transform:translateY(-56%)') + ph('nas-lists', '--w:min(14vw, 200px);right:-10px;bottom:4%') },
      { label: 'Find your next favourite', copy: `<span class="ob-eyebrow">Discover</span><h1>Find your next favourite.</h1>
          <p>Trending, picks for your taste and the community’s top rated.</p>${chips([['compass', 'For Your Taste'], ['trophy', 'Top Rated'], ['filter', 'Browse']])}`,
        vis: () => pair('discover') },
      { label: 'See how your taste compares', cls: 'is-match', copy: `<span class="ob-eyebrow">Together</span><h1>See how your taste compares.</h1>
          <p>Find a friend and see how well your tastes match — then pick a movie night together.</p>${chips([['shuffle', 'Taste match'], ['users', 'Friends'], ['film', 'Movie Night']])}`,
        // the real thing: MSF's creators, Nasrawi and N1 — their taste match from both libraries (18 Nov 2026)
        vis: () => `<figure class="ob-tm" aria-label="Nasrawi and N1, MSF's creators: a 91% taste match across 75 titles they've both rated">
            <div class="ob-tm-row" aria-hidden="true"><div class="ob-tm-av"><img src="${A}creator-nasrawi.jpg" alt=""><span>Nasrawi</span></div>
              <div class="ob-tm-ring" style="--v:91"><div><big data-count="91" data-suffix="%">91%</big><small>Taste match</small></div></div>
              <div class="ob-tm-av"><img src="${A}creator-n1.jpg" alt=""><span>N1</span></div></div>
            <figcaption class="ob-tm-cap">${MATCH.rated} titles rated by both · <b>MSF’s creators</b></figcaption>
            <div class="ob-tm-share" aria-hidden="true"><span>They both love</span><span class="ob-tm-po">${MATCH.loves.map(([t, p, a, b], i) => `<span style="--i:${i}"><img src="${IMG}w185${p}" alt=""><i>${a.toFixed(1)} · ${b.toFixed(1)}</i></span>`).join('')}</span></div></figure>` },
      { label: 'Every episode. Every watch.', copy: `<span class="ob-eyebrow">The whole journey</span><h1>Every episode. Every watch.</h1>
          <p>Episode ratings, your Diary, medals and a Showcase.</p>${chips([['play', 'Episodes'], ['calendar', 'Diary'], ['trophy', 'Medals']])}`,
        vis: () => phone() ? ph('n1-episodes', '--w:min(46vw, 178px);left:6%;top:3%;rotate:-4deg') + ph('nas-episodes', '--w:min(46vw, 178px);right:6%;top:9%;rotate:4deg')
          : tablet() ? pair('n1-episodes', 'nas-episodes')
          : lap('n1-episodes', '--w:min(44vw, 640px);left:0;top:4%') + ph('nas-episodes', '--w:min(13vw, 190px);right:20px;top:2%') + `<div class="dvf dvf-lap" style="--w:min(30vw, 430px);left:30%;bottom:2%"><div class="dvf-scr"><div><img src="${shot('season', 'desktop')}" alt=""></div></div><div class="dvf-base"></div></div>` },
      { label: 'Ready to build your screen portfolio?', cls: 'is-end', copy: `<span class="ob-eyebrow">Ready?</span><h1>Ready to build your screen portfolio?</h1>
          <p class="ob-say">Your taste. Your ratings. Your screen portfolio.</p>`,
        vis: () => `<div class="ob-choices"><div class="ob-choice is-main"><span class="ob-eyebrow">About 2 minutes · all skippable</span><h2>Personalise MyScreenFolio</h2>
            <ul>${['Profile photo', 'Your Top 5', 'Rate them the MSF way', 'Find your friends'].map(x => `<li>${ic('check', 16)} ${x}</li>`).join('')}</ul>
            <button type="button" class="ob-b is-p" data-ob="personalise">Let’s go ${icon('chevright', 16)}</button></div>
          <div class="ob-choice"><span class="ob-eyebrow">Skip setup</span><h2>Explore MSF</h2>${phone() ? '' : '<p>Straight to Home. Finish setup any time from Settings.</p>'}
            <button type="button" class="ob-b" data-ob="explore">Go to Home</button></div></div>` },
    ];
  }

  async function welcome() {
    await mssLoadStyle('css/onboarding.css');
    const S = slides(), N = S.length;
    const el = openLayer('Welcome to MyScreenFolio');
    el.innerHTML = `<div class="ob-w"><div class="ob-w-top">${logo()}<div style="display:flex;align-items:center;gap:4px"><span class="ob-count" aria-hidden="true"></span>
        <button type="button" class="ob-b is-t is-sm" data-ob="skip">Skip all</button></div></div>
      <div class="ob-track">${S.map((s, i) => `<section class="ob-slide${s.cls ? ' ' + s.cls : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${N}: ${esc(s.label)}" aria-hidden="true">
        <div class="ob-copy">${s.copy}</div><div class="ob-vis">${s.vis()}</div></section>`).join('')}</div>
      <div class="ob-w-bot"><div><button type="button" class="ob-b" data-ob="prev" aria-label="Back">${icon('chevleft', 16)}<span class="ob-hide-ph">Back</span></button></div>
        <div><div class="ob-dots" role="group" aria-label="Slides">${S.map((s, i) => `<button type="button" data-go="${i}" aria-label="Slide ${i + 1}: ${esc(s.label)}"></button>`).join('')}</div>
          <div class="ob-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> to move · <kbd>Esc</kbd> to skip</div></div>
        <div><button type="button" class="ob-b is-p" data-ob="next">Next ${icon('chevright', 16)}</button></div></div>
      <p class="sr-only" aria-live="polite" id="obLive"></p></div>`;
    // the motion: each slide's words, then its devices, come in one after another (--i), from the side you're heading
    el.querySelectorAll('.ob-slide').forEach(sl => {
      [...sl.querySelector('.ob-copy').children].forEach((c, k) => c.style.setProperty('--i', k));
      sl.querySelectorAll('.dvf, .ob-rcard, .ob-ring, .ob-tm, .ob-choice').forEach((c, k) => c.style.setProperty('--j', k));
    });
    const track = el.querySelector('.ob-track'), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // numbers count up as their slide arrives (9.92, 91%)
    const count = sl => sl.querySelectorAll('[data-count]').forEach(b => {
      const to = Number(b.dataset.count), dec = Number(b.dataset.dec || 0), suf = b.dataset.suffix || '';
      if (reduced) { b.textContent = to.toFixed(dec) + suf; return; }
      const t0 = performance.now(), dur = 1100;
      const tick = t => { const f = Math.min(1, (t - t0 - 250) / dur), e = f <= 0 ? 0 : 1 - Math.pow(1 - f, 3);
        b.textContent = (to * e).toFixed(dec) + suf; if (f < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    let at = -1;
    const go = i => {
      const to = Math.max(0, Math.min(N - 1, i));
      if (to === at) return;
      track.dataset.dir = to > at ? '1' : '-1';
      at = to;
      el.querySelectorAll('.ob-slide').forEach((s, k) => {
        s.setAttribute('aria-hidden', String(k !== at));
        s.classList.toggle('is-on', k === at); s.classList.toggle('is-before', k < at); s.classList.toggle('is-after', k > at);
        s.inert = k !== at;
      });
      el.querySelectorAll('.ob-dots button').forEach((b, k) => { b.classList.toggle('is-done', k < at); if (k === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      el.querySelector('.ob-count').textContent = `${at + 1} of ${N}`;
      el.querySelector('[data-ob="prev"]').style.visibility = at ? '' : 'hidden';
      el.querySelector('[data-ob="next"]').style.visibility = at < N - 1 ? '' : 'hidden';
      el.querySelector('#obLive').textContent = `Slide ${at + 1} of ${N}: ${S[at].label}`;
      el.querySelector('.ob-w').style.setProperty('--gx', `${[78, 70, 60, 74, 66, 58, 72, 50][at]}%`);
      el.querySelector('.ob-w').style.setProperty('--gy', `${[45, 35, 55, 40, 60, 45, 35, 50][at]}%`);
      count(el.querySelectorAll('.ob-slide')[at]);
    };
    const seen = () => save({ welcome: new Date().toISOString() });
    el.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-ob],[data-go]'); if (!b) return;
      if (b.dataset.go != null) return go(+b.dataset.go);
      const a = b.dataset.ob;
      if (a === 'next') go(at + 1);
      else if (a === 'prev') go(at - 1);
      else if (a === 'skip' || a === 'explore') { await seen(); await save({ closed: new Date().toISOString() }); close(); }
      else if (a === 'personalise') { await seen(); close(true); setup(); }
    });
    // ← → and Esc on a keyboard; a swipe on a touch screen
    onKey = e => { if (!root) return; trap(e);
      if (e.target.closest?.('input')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); el.querySelector('[data-ob="skip"]').click(); } };
    addEventListener('keydown', onKey, true);
    let sx = null, sy = 0;
    track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
    track.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1)); });
    track.addEventListener('pointercancel', () => { sx = null; });
    go(0);
    el.querySelector('[data-ob="next"]').focus();
  }

  /* ══════════════ Set up your folio ══════════════ */
  const STEPS = [
    { k: 'photo', n: 'Profile photo', s: 'Upload or pick a poster', t: 'Put a face to <em>your folio.</em>' },
    { k: 'top5', n: 'Your Top 5', s: 'Your all-time favourites', t: 'Five titles that <em>say who you are.</em>' },
    { k: 'rate', n: 'Rate them', s: 'The MSF way', t: 'Ratings that <em>mean something.</em>' },
    { k: 'people', n: 'Favourite people', s: 'Actors, actresses, directors', t: 'The people <em>you’d watch anything with.</em>' },
    { k: 'friends', n: 'Friends', s: 'See your taste match', t: 'Find your people. <em>Compare your taste.</em>' },
  ];
  const D = { picks: [], following: 0, stats: null };      // what the steps read: your Top 5 entries, how many you follow
  const layout = () => (prof().profile_layout && typeof prof().profile_layout === 'object') ? prof().profile_layout : {};
  const peopleKeys = { fav_actors: 'Actors', fav_actresses: 'Actresses', fav_directors: 'Directors' };
  const peopleOf = k => { const v = k === 'fav_actresses' ? layout().fav_actresses : prof()[k]; return Array.isArray(v) ? v : []; };
  const isDone = k => ({
    photo: () => !!safeURL(prof().avatar_url),
    top5: () => D.picks.length > 0,
    rate: () => D.picks.length > 0 && D.picks.every(e => liveScore(e) != null),
    people: () => Object.keys(peopleKeys).some(x => peopleOf(x).length),
    friends: () => D.following > 0,
  })[k]();

  async function load() {
    const p = await getProfile(uid()).catch(() => null);
    if (p) window._navUserProfile = { ...prof(), ...p };
    const ids = (Array.isArray(prof().top_picks) ? prof().top_picks : []).slice(0, 5);
    const [ents, fs] = await Promise.all([
      ids.length ? sb.from('entries').select('*').in('id', ids).then(r => r.data || [], () => []) : [],
      getFollowState(uid()).catch(() => null),
    ]);
    D.picks = ids.map(id => ents.find(e => e.id === id)).filter(Boolean);
    D.following = Number(fs?.following) || 0;
  }

  let S = null;   // { queue: step keys to go through, at: index, existing }
  async function setup(o = {}) {
    await mssLoadStyle('css/onboarding.css');
    loader();
    await Promise.all([mssLoadStyle('css/profile.css'), mssLoadScript('js/poster-wall.js'), load()]);
    const missing = STEPS.filter(s => !isDone(s.k)).map(s => s.k);
    const existing = STEPS.length - missing.length > 0;
    // new accounts go through all five; an account that has some already sees only what's missing
    S = { existing, queue: existing ? missing : STEPS.map(s => s.k), at: 0 };
    if (o.at && S.queue.includes(o.at)) return step(S.queue.indexOf(o.at));
    if (o.at === 'rate') { S.queue = [...new Set([...S.queue, 'rate'])].sort((a, b) => STEPS.findIndex(s => s.k === a) - STEPS.findIndex(s => s.k === b)); return step(S.queue.indexOf('rate')); }
    if (existing && !missing.length) return finish();
    return existing ? overview() : step(0);
  }

  // while setup loads (also right after a refresh): the stage colour, the logo and a spinner — never a blank page
  function loader() {
    if (root?.querySelector('.ob-s')) return;
    const el = openLayer('Set up your folio');
    el.innerHTML = `<div class="ob-load" role="status"><img src="icons/logo-dark.svg" alt="" width="142" height="60"><span class="ob-spin" aria-hidden="true"></span><span>Getting your folio ready…</span></div>`;
  }
  // the left side: the poster wall, the logo, the step's line and the timeline
  function stage(copy, extra = '') {
    return `<aside class="ob-stage"><div class="pw-wall" aria-hidden="true"></div><img class="ob-brand" src="icons/logo-dark.svg" alt="MyScreenFolio" width="142" height="60">
      <button type="button" class="ob-b is-t is-sm ob-skip-band" data-ob="close">${S?.existing && !S.started ? 'Not now' : 'Skip all'}</button>
      <div class="ob-scopy">${copy}${extra}</div></aside>`;
  }
  const timeline = cur => `<ol class="ob-tl">${STEPS.map((s, i) => { const st = isDone(s.k) ? 'is-done' : s.k === cur ? 'is-on' : '';
    return `<li class="${st}"${s.k === cur ? ' aria-current="step"' : ''}><span class="ob-nd">${st === 'is-done' ? icon('check', 15) : i + 1}</span><span><b>${s.n}</b><small>${s.s}</small></span></li>`; }).join('')}</ol>`;
  // the setup screen: the stage stays (its posters keep drifting) — only its words and timeline change; the step slides in
  function frame(stageHTML, top, body, bot) {
    const back = frame.dir < 0; frame.dir = 1;
    const main = `<main class="ob-main"><div class="ob-top">${top}</div><div class="ob-body"><div class="ob-in is-enter">${body}</div></div><div class="ob-bot">${bot}</div></main>`;
    let el = root, s = root?.querySelector('.ob-s');
    if (!s && root?.querySelector('.ob-load')) { el = root; el.innerHTML = ''; }
    if (s) {
      const t = document.createElement('div'); t.innerHTML = stageHTML;
      const copy = s.querySelector('.ob-scopy'); copy.innerHTML = t.querySelector('.ob-scopy').innerHTML;
      copy.classList.remove('is-enter'); void copy.offsetWidth; copy.classList.add('is-enter');
      s.querySelector('.ob-skip-band').textContent = t.querySelector('.ob-skip-band').textContent;
      s.querySelector('.ob-main').outerHTML = main;
      s.classList.toggle('is-back', back);
    } else {
      if (!el?.isConnected) el = openLayer('Set up your folio');
      el.innerHTML = `<div class="ob-s">${stageHTML}${main}</div>`;
      wall = MSSPosterWall.mount(el.querySelector('.pw-wall'));
      el.onclick = ev => { if (ev.target.closest('[data-ob="close"]')) { save({ closed: new Date().toISOString(), step: null }); close(); } };
    }
    if (!onKey) { onKey = e => { if (!root) return; trap(e); if (e.key === 'Escape' && !document.querySelector('.lyr.open, .confirm-overlay.open')) { e.preventDefault(); close(); } }; addEventListener('keydown', onKey, true); }
    setTimeout(() => el.querySelector('.ob-main h2, .ob-main .ob-b.is-p')?.focus({ preventScroll: true }), 60);
    return el;
  }
  const bars = (keys, at) => `<div class="ob-bars" aria-hidden="true">${keys.map((k, i) => `<i class="${i < at || isDone(k) && i !== at ? 'is-done' : i === at ? 'is-on' : ''}"></i>`).join('')}</div>`;

  /* ── Existing accounts: the timeline, with what's there and Start on what's missing ── */
  function overview() {
    const p = prof(), done = STEPS.filter(s => isDone(s.k)).length;
    const people = Object.keys(peopleKeys).flatMap(peopleOf);
    const thumbs = { photo: safeURL(p.avatar_url) ? `<span class="ob-thumbs"><img src="${esc(safeURL(p.avatar_url))}" alt=""></span>` : '',
      top5: `<span class="ob-thumbs is-po">${D.picks.map(e => safeURL(e.poster_url) ? `<img src="${esc(safeURL(e.poster_url))}" alt="">` : '').join('')}</span>`,
      people: `<span class="ob-thumbs">${people.slice(0, 5).map(x => x.path ? `<img src="${IMG}w185${esc(x.path)}" alt="">` : '').join('')}</span>` };
    const sub = { photo: 'Done', top5: `${D.picks.length} picked`, people: `${people.length} picked`, friends: `Following ${D.following}`,
      rate: D.picks.length ? `${D.picks.filter(e => liveScore(e) != null).length} of ${D.picks.length} rated` : 'Pick your Top 5 first' };
    const todo = { photo: 'No photo yet', top5: 'None picked yet', rate: `${D.picks.filter(e => liveScore(e) == null).length} not rated yet`, people: 'None picked yet', friends: 'See who matches your taste' };
    const left = STEPS.length - done;
    const el = frame(stage(`<span class="ob-eyebrow">Welcome back</span><h1>Let’s finish <em>your folio.</em></h1>`, statsHTML()),
      `<div class="ob-steps"><div class="ob-st">${done} of ${STEPS.length} done</div>${bars(STEPS.map(s => s.k), -1)}</div><button type="button" class="ob-b is-t is-sm ob-skip-top" data-ob="close">Not now</button>`,
      `<div class="ob-head"><div><span class="ob-eyebrow">Only what’s missing</span><h2>Finish setting up</h2></div></div>
       <ol class="ob-tlx">${STEPS.map(s => { const ok = isDone(s.k);
         return `<li class="${ok ? 'is-done' : ''}"><span class="ob-nd">${ok ? icon('check', 18) : icon({ photo: 'image', top5: 'star', rate: 'chart', people: 'user', friends: 'users' }[s.k], 18)}</span>
           <div class="ob-card"><div class="ob-n">${s.n}<small>${ok ? sub[s.k] : todo[s.k]}</small></div>${ok ? thumbs[s.k] || '' : `<button type="button" class="ob-b is-p is-sm" data-start="${s.k}">Start</button>`}</div></li>`; }).join('')}</ol>`,
      `<div></div><div><button type="button" class="ob-b is-p" data-start="">Finish the ${left} left ${icon('chevright', 16)}</button></div>`);
    el.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => { S.started = true; step(b.dataset.start ? S.queue.indexOf(b.dataset.start) : 0); }));
  }
  function statsHTML() {
    const n = D.stats; if (!n) return '';
    return `<div class="ob-stats">${n.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  }

  /* ── One step ── */
  async function step(i) {
    S.at = i; S.started = true;
    const k = S.queue[i], def = STEPS.find(s => s.k === k), n = S.queue.length;
    if (!def) return finish();
    if (state().step !== k) save({ step: k, closed: null });      // a refresh comes back to this step
    const last = i === n - 1;
    const el = frame(stage(`<span class="ob-eyebrow">Set up your folio</span><h1>${def.t}</h1>`, timeline(k)),
      `<div class="ob-steps"><div class="ob-st">Step ${i + 1} of ${n} <span>· ${def.n}</span></div>${bars(S.queue, i)}</div><button type="button" class="ob-b is-t is-sm ob-skip-top" data-ob="close">Skip all</button>`,
      '<div class="ob-step"></div>',
      `<div>${i ? `<button type="button" class="ob-b is-t" data-nav="back" aria-label="Back">${icon('chevleft', 16)}<span class="ob-hide-ph">Back</span></button>` : ''}<button type="button" class="ob-b is-t" data-nav="skip">Skip<span class="ob-hide-ph"> this step</span></button></div>
       <div><button type="button" class="ob-b is-p" data-nav="next">${last ? 'Finish' : 'Continue'} ${icon('chevright', 16)}</button></div>`);
    const box = el.querySelector('.ob-step');
    el.querySelector('.ob-bot').addEventListener('click', async ev => {
      const b = ev.target.closest('[data-nav]'); if (!b) return;
      if (b.dataset.nav === 'back') { frame.dir = -1; return step(i - 1); }
      b.disabled = true;
      if (b.dataset.nav === 'next' && STEP[k].leave) { const ok = await STEP[k].leave().catch(err => { console.error(err); showToast('Couldn’t save that — try again.', 'err'); return false; }); if (ok === false) { b.disabled = false; return; } }
      await mark(k, b.dataset.nav === 'next' && isDone(k) ? 'done' : 'skip');
      i + 1 < n ? step(i + 1) : finish();
    });
    await STEP[k].draw(box);
    el.querySelector('.ob-body').scrollTop = 0;
  }

  const head = (eb, h, right = '') => `<div class="ob-head"><div><span class="ob-eyebrow">${eb}</span><h2 tabindex="-1">${h}</h2></div>${right}</div>`;
  const search = (id, ph) => `<div class="sf-search" role="search"><span class="sf-search-ic" aria-hidden="true">${icon('search', 16)}</span>
    <input type="search" class="sf-search-input" id="${id}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    <button type="button" class="sf-search-go" tabindex="-1" aria-hidden="true">${icon('search', 16)}<span>Search</span></button></div>`;
  const posterPath = u => { const m = /\/t\/p\/[^/]+(\/[\w.-]+\.(?:jpg|jpeg|png))$/i.exec(u || ''); return m ? m[1] : null; };
  const rankB = r => `<span class="cg-rank-badge ${r === 1 ? 'cg-rank-1' : r === 2 ? 'cg-rank-2' : r === 3 ? 'cg-rank-3' : 'cg-rank-other'}" aria-hidden="true">${r}</span>`;
  // your profile's top: the banner (your #1's backdrop), photo, name
  async function miniBg(box) {
    const bg = box.querySelector('.ob-mini-bg'), first = D.picks[0]; if (!bg || !first) return;
    const u = await MSSBackdrop.url(first, 'w1280').catch(() => null);
    if (u) bg.style.backgroundImage = cssURL(u);
  }
  const avHTML = (cls = '') => { const p = prof(), u = safeURL(p.avatar_url), name = p.display_name || p.username || '?';
    const src = layout().photo === 'circle' ? u : mssPhotoPoster(p);   // the poster framing for the tall photo
    return `<div class="ob-av${layout().photo === 'circle' ? '' : ' is-poster'}${cls}">${u ? `<img src="${esc(src)}" alt="">` : esc(name[0].toUpperCase())}</div>`; };

  const STEP = {
    /* 1 · Profile photo */
    photo: {
      draw(box) {
        const p = prof(), circle = layout().photo === 'circle', posters = D.picks.map(e => posterPath(e.poster_url)).filter(Boolean);
        const cur = posterPath(p.avatar_url);
        box.innerHTML = head('Profile photo', 'Add a profile photo') + `<div class="ob-opts">
            <button type="button" class="ob-opt" data-ph="upload"><span class="ob-oi">${icon('download', 20)}</span><span><h3>Upload</h3><small>From your device</small></span></button>
            <button type="button" class="ob-opt" data-ph="poster"><span class="ob-oi">${icon('film', 20)}</span><span><h3>Choose a poster</h3><small>Any title or character</small></span></button></div>
          <div class="ob-mini"><span class="ob-mini-bg"></span><div class="ob-seg" role="group" aria-label="Show my photo as">
              <button type="button" data-shape="circle" aria-pressed="${circle}">Circle</button><button type="button" data-shape="poster" aria-pressed="${!circle}">Poster</button></div>
            ${avHTML()}<div><h3 translate="no">${esc(p.display_name || p.username || '')}</h3><small>@${esc(p.username || '')} · how your profile will look</small></div></div>
          ${posters.length ? `<div class="ob-lbl">From your Top 5</div><div class="ob-quick">${posters.map(x => `<button type="button" data-quick="${esc(x)}" aria-pressed="${x === cur}" aria-label="Use this poster as your photo"><img src="${IMG}w185${esc(x)}" alt=""></button>`).join('')}</div>` : ''}`;
        miniBg(box);
        const redraw = () => { changed = true; STEP.photo.draw(box); };
        box.onclick = async ev => {
          const t = ev.target.closest('[data-ph],[data-shape],[data-quick]'); if (!t) return;
          if (t.dataset.ph === 'upload') { await mssLoadScript('js/avatar-upload.js'); MSSAvatarUpload.pick({ onSaved: redraw }); }
          else if (t.dataset.ph === 'poster') { await mssLoadScript('js/backdrop-picker.js'); MSSBackdropPicker.photo({ onSaved: redraw }); }
          else if (t.dataset.quick) { await mssLoadScript('js/backdrop-picker.js'); await MSSBackdropPicker.usePoster(t.dataset.quick).catch(() => {}); redraw(); }
          else if (t.dataset.shape) {
            const lay = { ...layout() }; if (t.dataset.shape === 'circle') lay.photo = 'circle'; else delete lay.photo;
            try { await updateProfile(uid(), { profile_layout: lay }); prof().profile_layout = lay; redraw(); } catch { showToast('Couldn’t save that — try again.', 'err'); }
          }
        };
      },
    },

    /* 2 · Your Top 5 (Top Favorites) — standard cards, the rank badges, the Home search box */
    top5: (() => {
      let picks = [], cat = 'all', hits = [], q = '', T = null;
      // a TMDB result → its category, like adding it to your library does (Anime / Cartoons / Movies / TV)
      const catOf = it => (it.genre_ids || []).includes(16) ? ((it.origin_country || []).includes('JP') || it.original_language === 'ja' ? 'anime' : 'cartoons') : it.media_type === 'movie' ? 'movies' : 'tv';
      const keyOf = x => `${x.media_type}:${x.id}`;
      const fromEntry = e => ({ id: Number(e.tmdb_id), media_type: e.tmdb_type || (mssIsMovieEntry(e) ? 'movie' : 'tv'), title: e.title, year: e.year, poster: safeURL(e.poster_url), entry: e });
      async function list() {
        if (q.trim().length >= 2) return (await _tmdbSearch(q.trim(), 20)).map(r => ({ ...r, title: r.title || r.name }));
        try { const r = await tmdbFetch(`${TMDB_BASE}/trending/all/week?language=en-US`); return r.ok ? ((await r.json()).results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').map(r => ({ ...r, title: r.title || r.name })) : []; } catch { return []; }
      }
      function cards(box) {
        const shown = hits.filter(x => cat === 'all' || catOf(x) === cat).slice(0, phone() ? 9 : 10);
        box.querySelector('.ob-grid').innerHTML = shown.length ? shown.map(x => {
          const r = picks.findIndex(p => keyOf(p) === keyOf(x)) + 1;
          return `<div class="ob-pick${r ? ' is-on' : ''}">${MSSCard.poster({ title: x.title, year: (x.release_date || x.first_air_date || '').slice(0, 4), poster: x.poster_path ? IMG + 'w342' + x.poster_path : null,
            type: x.media_type === 'movie' ? 'movie' : 'tv', rank: r, tmdb: x.vote_average ? Math.round(x.vote_average * 10) / 10 : null,
            attrs: `data-pick="${esc(keyOf(x))}" aria-pressed="${!!r}"`, label: `${x.title}${r ? `, your #${r}` : ''} — ${r ? 'tap to remove' : 'tap to add to your Top 5'}`,
            over: r ? '' : `<span class="ob-add">${icon('plus', 16)}</span>` })}</div>`; }).join('')
          : `<div class="ob-empty" style="grid-column:1/-1">${q ? `Nothing matches “${esc(q)}”.` : 'Nothing to show right now.'}</div>`;
      }
      function tray(box) {
        box.querySelector('.ob-slots').innerHTML = Array.from({ length: 5 }, (_, i) => { const p = picks[i];
          return p ? `<div class="ob-slot is-on" data-slot="${i}" title="${esc(p.title)}">${p.poster ? `<img src="${esc(p.poster)}" alt="">` : ''}${rankB(i + 1)}
              <button type="button" class="ob-slot-x" data-rm="${i}" aria-label="Remove ${esc(p.title)}">${icon('x', 11)}</button></div>`
            : `<div class="ob-slot" aria-hidden="true"></div>`; }).join('');
        box.querySelector('.ob-tray-l').firstChild.textContent = `Your Top 5 · ${picks.length} of 5 `;
      }
      // drag a picked poster along the row to re-rank it
      function dragWire(box) {
        const row = box.querySelector('.ob-slots');
        row.addEventListener('pointerdown', ev => {
          const sl = ev.target.closest('.ob-slot.is-on'); if (!sl || ev.target.closest('[data-rm]')) return;
          ev.preventDefault();
          const from = +sl.dataset.slot; let to = from;
          sl.classList.add('is-drag');
          const move = e => { const all = [...row.querySelectorAll('.ob-slot.is-on')];
            to = all.findIndex(x => e.clientX < x.getBoundingClientRect().right); if (to < 0) to = all.length - 1;
            all.forEach((x, k) => x.classList.toggle('is-over', k === to && k !== from)); };
          const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
            if (to !== from) { const [m] = picks.splice(from, 1); picks.splice(to, 0, m); }
            tray(box); cards(box); };
          addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
        });
      }
      return {
        async draw(box) {
          picks = D.picks.filter(e => e.tmdb_id).map(fromEntry);
          box.innerHTML = head('Top Favorites', 'Pick your Top 5', phone() ? '' : `<div class="ob-seg" role="group" aria-label="Category">${[['all', 'All'], ['movies', 'Movies'], ['tv', 'TV'], ['anime', 'Anime'], ['cartoons', 'Cartoons']].map(([c, l]) => `<button type="button" data-cat="${c}" aria-pressed="${c === cat}">${l}</button>`).join('')}</div>`)
            + search('obTop5Q', phone() ? 'Search titles…' : 'Search movies, shows or people…')
            + `<div class="ob-lbl">${q ? 'Results · tap to add' : 'Popular · tap to add'}</div><div class="ob-grid" aria-live="polite"></div>
               <div class="ob-tray"><div class="ob-tray-l">Your Top 5 · <small>Drag to reorder · #1 gets the biggest spot</small></div><div class="ob-slots"></div></div>`;
          tray(box); dragWire(box);
          const qi = box.querySelector('#obTop5Q');
          qi.value = q;
          qi.addEventListener('input', () => { q = qi.value; clearTimeout(T); T = setTimeout(async () => { const mine = q; const h = await list(); if (mine !== q) return; hits = h; box.querySelector('.ob-lbl').textContent = q.trim().length >= 2 ? 'Results · tap to add' : 'Popular · tap to add'; cards(box); }, typeof MSS_SEARCH_MS !== 'undefined' ? MSS_SEARCH_MS : 300); });
          box.onclick = ev => {
            const c = ev.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; box.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', String(b === c))); return cards(box); }
            const rm = ev.target.closest('[data-rm]'); if (rm) { picks.splice(+rm.dataset.rm, 1); tray(box); return cards(box); }
            const t = ev.target.closest('[data-pick]'); if (!t) return;
            const x = hits.find(h => keyOf(h) === t.dataset.pick); if (!x) return;
            const i = picks.findIndex(p => keyOf(p) === keyOf(x));
            if (i >= 0) picks.splice(i, 1);
            else if (picks.length >= 5) return showToast('Your Top 5 is full — remove one first.');
            else picks.push({ id: x.id, media_type: x.media_type, title: x.title, year: (x.release_date || x.first_air_date || '').slice(0, 4), poster: x.poster_path ? IMG + 'w342' + x.poster_path : null, item: x });
            tray(box); cards(box);
          };
          box.querySelector('.ob-grid').innerHTML = `<div class="ob-empty" style="grid-column:1/-1">Loading…</div>`;
          hits = await list(); cards(box);
        },
        // Continue: each pick becomes (or already is) a title in your library, then they're saved as your Top Favorites
        async leave() {
          if (!picks.length && !D.picks.length) return true;
          await mssLoadScript('js/info-popup.js');
          const ids = [];
          for (const p of picks) {
            let e = p.entry || await getOwnEntryByTmdb(uid(), p.id, p.media_type, p.title).catch(() => null);
            if (!e) {
              try { e = await MSSInfo.quickAdd({ tmdb_id: p.id, media_type: p.media_type, title: p.title, year: p.year, poster_url: p.poster,
                genre_ids: p.item?.genre_ids, origin_country: p.item?.origin_country, original_language: p.item?.original_language, cat: p.item ? catOf(p.item) : undefined }, { status: 'completed' }); }
              catch (err) { if (String(err.message).startsWith('DUPLICATE:')) e = await getOwnEntryByTmdb(uid(), p.id, p.media_type, p.title).catch(() => null); else throw err; }
            } else if (!['completed', 'ongoing', 'watching', 'paused'].includes(e.status)) {
              await updateProgress(e.id, uid(), { status: 'completed' });       // a favourite is something you've watched
              e = { ...e, status: 'completed' };
            }
            if (e) ids.push(e);
          }
          await updateProfile(uid(), { top_picks: ids.map(e => e.id) });
          prof().top_picks = ids.map(e => e.id);
          D.picks = ids; changed = true;
          return true;
        },
      };
    })(),

    /* 3 · Rate them — the profile's Top Favorites tiles; one opens the full rating page */
    rate: {
      async draw(box) {
        if (!D.picks.length) { box.innerHTML = head('Rate them', 'Rate your Top 5') + `<div class="ob-empty">Pick your Top 5 first — then rate them here.</div>`; return; }
        await mssLoadScript('js/title-view.js');
        const rated = D.picks.filter(e => liveScore(e) != null).length, n = D.picks.length, rest = Math.max(1, n - 2);
        box.innerHTML = head('Rate them', 'Rate your Top 5', `<span class="ob-pill">${icon('check', 13)} ${rated} of ${n} rated</span>`)
          + `<div class="pf-favs is-n${n} ob-favs">${D.picks.map((e, i) => { const r = i + 1, sv = liveScore(e), t = mssTypeOf(e.cat, mssIsMovieEntry(e));
              const span = r === 1 ? (n === 1 ? 6 : 4) : r === 2 ? 2 : Math.round(6 / rest);
              return `<button type="button" class="pf-fav is-r${r}" style="--span:${span}" data-rate="${esc(e.id)}" aria-label="#${r} ${esc(e.title)}${sv != null ? `, rated ${Number(sv).toFixed(2)} — rate again` : ' — rate it'}">
                <span class="pf-fav-bg" data-bd="${esc(e.id)}" aria-hidden="true"></span><span class="pf-fav-shade" aria-hidden="true"></span>
                ${rankB(r).replace('cg-rank-badge', 'cg-rank-badge pf-fav-rank')}<span class="pf-fav-poster">${posterHTML(e, 'big', r === 1 ? '170px' : '110px')}${rankB(r)}</span>
                <span class="pf-fav-tx"><span class="pf-fav-title" translate="no">${esc(e.title)}</span><span class="pf-fav-meta">${esc([t.label, e.year].filter(Boolean).join(' · '))}</span>
                  ${sv == null && phone() ? `<span class="ob-rate-cta">${icon('star', 14)} Tap to rate</span>` : ''}</span>
                ${sv != null ? `<span class="pf-fav-ring" aria-hidden="true">${MSSViews.ring(sv, r === 1 ? '' : 's', e.status === 'dropped')}</span>` : phone() ? '' : `<span class="ob-rate-cta" aria-hidden="true">${icon('star', 14)} ${r === 1 ? 'Tap to rate' : 'Rate'}</span>`}</button>`; }).join('')}</div>
            <p class="ob-hint">${icon('info', 16)} Rate any of them, in any order. Each opens the full rating page — saving brings you back here.</p>`;
        box.querySelectorAll('[data-bd]').forEach(bg => { const e = D.picks.find(x => x.id === bg.dataset.bd);
          MSSBackdrop.url(e, 'w1280').then(u => { if (u) { bg.style.backgroundImage = cssURL(u); bg.classList.add('in'); } else if (safeURL(e.poster_url)) { bg.style.backgroundImage = cssURL(safeURL(e.poster_url)); bg.classList.add('in', 'is-poster'); } }).catch(() => {}); });
        box.onclick = ev => {
          const t = ev.target.closest('[data-rate]'); if (!t) return;
          // back here afterwards: this page with ?setup=rate (detail.html returns to it after Save)
          const u = new URL(location.href); u.searchParams.set('setup', 'rate');
          goToDetail(t.dataset.rate, u.pathname.split('/').pop() + u.search, 'ratings');
        };
      },
    },

    /* 4 · Favourite people — Actors · Actresses · Directors, the lists your profile shows */
    people: (() => {
      let grp = 'fav_actors', hits = [], T = null, qv = '';
      const DEPT = { fav_actors: ['Acting', 2], fav_actresses: ['Acting', 1], fav_directors: ['Directing', 0] };
      async function put(k, list) {
        if (k === 'fav_actresses') { const lay = { ...layout(), fav_actresses: list }; await updateProfile(uid(), { profile_layout: lay }); prof().profile_layout = lay; }
        else { await updateProfile(uid(), { [k]: list }); prof()[k] = list; }
        changed = true;
      }
      const chip = (x, k, i) => `<span class="ob-pp">${x.path ? `<img src="${IMG}w185${esc(x.path)}" alt="">` : `<span class="ob-pl">${esc((x.name || '?')[0])}</span>`}<span>${esc(x.name)}${x.known ? `<small>${esc(x.known)}</small>` : ''}</span>
        <button type="button" data-rmp="${k}:${i}" aria-label="Remove ${esc(x.name)}">${icon('x', 14)}</button></span>`;
      function picked(box) {
        box.querySelector('.ob-picked').innerHTML = Object.entries(peopleKeys).map(([k, l]) => `<div class="ob-grp"><div class="ob-lbl">${l} · ${peopleOf(k).length} of 5</div>
          <div class="ob-people">${peopleOf(k).map((x, i) => chip(x, k, i)).join('') || `<span class="ob-pl" style="font:500 13px var(--sans);color:var(--text-muted)">None yet</span>`}</div></div>`).join('');
      }
      function results(box) {
        box.querySelector('.ob-results').innerHTML = qv.trim().length < 2 ? '' : hits.length ? hits.map(x => { const known = (x.known_for || []).map(k => k.title || k.name).filter(Boolean)[0] || '';
          return `<button type="button" class="ob-person" data-add="${Number(x.id)}">${x.profile_path ? `<img src="${IMG}w185${esc(x.profile_path)}" alt="" loading="lazy">` : `<span class="ob-pl">${esc((x.name || '?')[0])}</span>`}
            <span><b>${esc(x.name)}</b><small>${esc([x.known_for_department, known].filter(Boolean).join(' · '))}</small></span></button>`; }).join('')
          : `<div class="ob-empty">No one matches “${esc(qv.trim())}”.</div>`;
      }
      return {
        draw(box) {
          box.innerHTML = head('Optional', 'Favourite people', `<div class="ob-seg" role="group" aria-label="Add to">${Object.entries(peopleKeys).map(([k, l]) => `<button type="button" data-grp="${k}" aria-pressed="${k === grp}">${l}</button>`).join('')}</div>`)
            + search('obPeopleQ', `Search ${peopleKeys[grp].toLowerCase()}…`) + `<div class="ob-results" aria-live="polite"></div><div class="ob-picked"></div>`;
          picked(box);
          const qi = box.querySelector('#obPeopleQ');
          const run = () => { clearTimeout(T); T = setTimeout(async () => { const mine = qv, [dept, gender] = DEPT[grp];
            if (mine.trim().length < 2) { hits = []; return results(box); }
            const h = await mssPersonSearch(mine, { dept, gender, skip: peopleOf(grp).map(x => x.id) }); if (mine !== qv) return; hits = h; results(box); }, typeof MSS_SEARCH_MS !== 'undefined' ? MSS_SEARCH_MS : 300); };
          qi.addEventListener('input', () => { qv = qi.value; run(); });
          box.onclick = async ev => {
            const g = ev.target.closest('[data-grp]');
            if (g) { grp = g.dataset.grp; box.querySelectorAll('[data-grp]').forEach(b => b.setAttribute('aria-pressed', String(b === g))); qi.placeholder = `Search ${peopleKeys[grp].toLowerCase()}…`; qi.setAttribute('aria-label', qi.placeholder); if (qv) run(); return; }
            const a = ev.target.closest('[data-add]');
            if (a) {
              const x = hits.find(h => String(h.id) === a.dataset.add); if (!x) return;
              if (peopleOf(grp).length >= 5) return showToast(`You have 5 ${peopleKeys[grp].toLowerCase()} — remove one first.`);
              try { await put(grp, [...peopleOf(grp), mssPersonItem(x)]); hits = hits.filter(h => h !== x); results(box); picked(box); } catch { showToast('Couldn’t save — try again.', 'err'); }
              return;
            }
            const r = ev.target.closest('[data-rmp]');
            if (r) { const [k, i] = r.dataset.rmp.split(':'); const list = peopleOf(k).slice(); list.splice(+i, 1);
              try { await put(k, list); picked(box); } catch { showToast('Couldn’t save — try again.', 'err'); } }
          };
        },
      };
    })(),

    /* 5 · Friends — find people, see the taste match, follow; invite someone with your profile link */
    friends: (() => {
      let T = null, mine = null;
      async function rows(box, list) {
        const el = box.querySelector('.ob-fr');
        if (!list.length) { el.innerHTML = `<div class="ob-empty">${box.querySelector('#obFrQ').value.trim().length >= 2 ? 'No one by that @username yet.' : 'Search for a friend by their @username.'}</div>`; return; }
        await mssLoadScript('js/follows.js'); await mssLoadScript('js/title-view.js');
        const st = await Promise.all(list.map(p => getFollowState(p.id).catch(() => null)));
        el.innerHTML = list.map((p, i) => MSSFollow.rowHTML({ ...p, i_follow: st[i]?.i_follow || 'none', follows_me: st[i]?.follows_me || 'none' })
          .replace('<div class="fl-acts">', `<div class="fl-acts"><span class="ob-match" data-match="${esc(p.id)}" title="Taste match"></span>`)).join('');
        // the taste match: how closely your scores line up on titles you've both rated (needs a few in common)
        mine = mine || await getEntries(uid()).catch(() => []);
        list.forEach(async p => {
          const theirs = await getPublicEntries(p.id).catch(() => []), m = mssTasteMatch(mine, theirs);
          const cell = el.querySelector(`[data-match="${CSS.escape(p.id)}"]`); if (!cell) return;
          cell.innerHTML = m.pct == null ? `<small>Not enough in common yet</small>` : `${MSSViews.ring(m.pct / 10, 's').replace(/<b[^>]*>[^<]*<\/b>/, `<b aria-hidden="true">${m.pct}%</b>`)}<small>${m.rated.length} rated by both</small>`;
          cell.setAttribute('aria-label', m.pct == null ? 'Taste match: not enough titles you’ve both rated yet' : `${m.pct}% taste match`);
        });
      }
      async function find(box, q) {
        const raw = q.trim().replace(/^@/, '').toLowerCase(), ok = /^[a-z0-9_]+$/.test(raw);
        let qy = sb.from('profiles').select('id, username, display_name, avatar_url, is_private').neq('id', uid()).limit(8);
        qy = raw.length >= 2 && ok ? qy.ilike('username', raw + '%') : qy.eq('is_official', true);   // before you type: MSF's official accounts
        const { data } = await qy.then(r => r, () => ({ data: [] }));
        if (q === box.querySelector('#obFrQ').value) rows(box, data || []);
      }
      const link = () => { const base = location.href.substring(0, location.href.lastIndexOf('/') + 1); return base + 'profile-view.html?u=' + encodeURIComponent(prof().username || ''); };
      return {
        draw(box) {
          box.innerHTML = head('Together', 'Find your friends') + search('obFrQ', 'Find a friend by @username…')
            + `<div class="ob-fr" aria-live="polite"></div>
               <div class="ob-inv"><span class="ob-oi">${icon('link', 18)}</span><b>Invite someone<small>Share your profile link</small></b><button type="button" class="ob-b is-sm" data-copy>Copy${phone() ? '' : ' my link'}</button></div>`;
          const qi = box.querySelector('#obFrQ');
          qi.addEventListener('input', () => { clearTimeout(T); T = setTimeout(() => find(box, qi.value), typeof MSS_SEARCH_MS !== 'undefined' ? MSS_SEARCH_MS : 300); });
          box.onclick = ev => {
            if (!ev.target.closest('[data-copy]')) return;
            const u = link();
            if (navigator.share && phone()) navigator.share({ title: 'MyScreenFolio — @' + (prof().username || ''), url: u }).catch(() => {});
            else navigator.clipboard?.writeText(u).then(() => showToast('Link copied'), () => showToast('Couldn’t copy — your link is ' + u, 'err'));
          };
          document.addEventListener('mss:follows-changed', () => { changed = true; }, { once: true });
          find(box, '');
        },
      };
    })(),
  };

  /* ── Finished: your profile, ready ── */
  async function finish() {
    await save({ closed: new Date().toISOString(), step: null });
    await load();
    const p = prof(), people = Object.keys(peopleKeys).flatMap(peopleOf).length;
    const el = frame(stage(`<div class="ob-done-big">${icon('check', 30)}</div><span class="ob-eyebrow">Welcome to your MSF</span><h1>Your folio <em>is ready.</em></h1>`, timeline('')),
      `<div class="ob-steps"><div class="ob-st">All set</div>${bars(STEPS.map(s => s.k), -1)}</div>`,
      `<div class="ob-pv"><div class="ob-mini"><span class="ob-mini-bg"></span>${avHTML()}
          <div><h3 translate="no">${esc(p.display_name || p.username || '')}</h3><small>@${esc(p.username || '')}</small>
            <div class="ob-mini-chips">${D.following ? `<span>Following ${D.following}</span>` : ''}${people ? `<span>${people} favourite ${people === 1 ? 'person' : 'people'}</span>` : ''}</div></div></div>
        ${D.picks.length ? `<div class="ob-pv-in"><div class="ob-lbl" style="margin-top:0">Your Top 5</div><div class="ob-pv-t5">${D.picks.map((e, i) => `<div>${safeURL(e.poster_url) ? `<img src="${esc(safeURL(e.poster_url))}" alt="${esc(e.title)}">` : ''}${rankB(i + 1)}${liveScore(e) != null ? `<span class="ob-sb">${mssScoreHTML(liveScore(e))}</span>` : ''}</div>`).join('')}</div></div>` : ''}</div>`,
      `<div><a class="ob-b" href="profile.html">See my profile</a></div><div><button type="button" class="ob-b is-p" data-ob="close">Go to my Home ${icon('chevright', 16)}</button></div>`);
    el.querySelector('.ob-done-big')?.setAttribute('aria-hidden', 'true');
    el.querySelector('[data-ob="close"]').addEventListener('click', () => { if (!/(^|\/)(index\.html)?$/.test(location.pathname)) location.href = 'index.html'; }, { once: true });
    miniBg(el);
  }

  /* ── On sign-in (nav.js) ── */
  // after the launch screen (mssAfterLaunch would wait for this very welcome) and any must-answer question (date of birth)
  async function ready() {
    await new Promise(res => { if (!window.mssLaunchOpen?.()) return res(); document.addEventListener('mss:launch-done', res, { once: true }); });
    for (let i = 0; i < 400 && document.querySelector('.mss-block'); i++) await new Promise(r => setTimeout(r, 700));
  }
  async function auto() {
    if (!uid() || root) return mssOnboardingDone();
    const u = new URL(location.href), back = u.searchParams.get('setup');
    if (back) {                                        // back from rating a Top 5 title
      u.searchParams.delete('setup'); history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      changed = true;
      return setup({ at: back === 'rate' ? 'rate' : undefined });
    }
    const st = state();
    if (st.welcome && st.step && !st.closed) { await ready(); return setup({ at: st.step }); }   // refreshed in the middle of setup: back to that step
    if (st.welcome) return mssOnboardingDone();
    await ready();
    if (!root) welcome();
  }
  return { auto, welcome, setup: () => setup(), close };
})();
