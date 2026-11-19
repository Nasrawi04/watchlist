/* ══════════════════════════════════════════
   settings-nav.js — Getting around Settings (settings.html)
   Every section is one page with its settings on it. Privacy + Security share a page, and so do
   Appearance + Preferences; the nav keeps all 8 links and scrolls to each. Only long lists open a
   page of their own ("doors"): Blocked people, My uploads, Message lock, and on phones Signed-in devices.
     settings.html                     computers: My Profile · phones: the list of sections
     settings.html#privacy             a section (#security scrolls to Security on the shared page)
     settings.html#privacy/blocked     a door
     settings.html#notifications/who   a tab of Notifications (get · who · hear)
     settings.html#account/setUsernameCard   a section, and that setting flashes (search, older links)
   Search matches names and descriptions on every page; Enter or a tap jumps there and flashes the row.
   From settings.html: settingsDirty(), settingsReset() (unsaved text fields ask before you leave).
══════════════════════════════════════════ */
const MSSSettingsNav = (() => {
  // id · name · line on the phone list · icon · its page
  const SECTIONS = [
    ['profile', 'My Profile', 'Photo, name, bio, share link', 'user', 'profile'],
    ['account', 'Account', 'Username, email, delete account', 'idCard', 'account'],
    ['data', 'Data', 'Import, export, your uploads', 'download', 'data'],
    ['privacy', 'Privacy', 'Private account, blocked people', 'eye', 'safety'],
    ['security', 'Security', 'Password, devices, message lock', 'lock', 'safety'],
    ['notifications', 'Notifications', 'What you get and what you share', 'bell', 'notifications'],
    ['preferences', 'Preferences', 'Language, episodes, region, recommendations', 'settings', 'look'],
    ['appearance', 'Appearance', 'Light, Dark or System', 'brush', 'look'],
  ];
  const GROUPS = [['You', ['profile', 'account', 'data']], ['Safety', ['privacy', 'security']], ['App', ['notifications', 'preferences', 'appearance']]];
  const DOORS = { 'privacy/blocked': 'blocked', 'data/uploads': 'uploads', 'security/lock': 'lock', 'security/devices': 'devices', 'preferences/recommendations': 'notint' };
  const TABS = ['get', 'who', 'hear'];
  // older links (the one-setting-per-screen Settings, Messages' link to the lock)
  const ALIAS = { msgCard: 'security/lock', 'security/setMessages': 'security/lock', 'privacy/setBlocked': 'privacy/blocked', 'data/setUploads': 'data/uploads',
    'notifications/nsAlertsT': 'notifications/get/nsAlerts', 'notifications/nsGetT': 'notifications/get', 'notifications/nsWhoT': 'notifications/who',
    'notifications/nsShareT': 'notifications/hear' };
  // more words people might search for, per setting
  const WORDS = {
    setPhoto: 'photo picture avatar image backdrop banner poster circle', setDetails: 'display name bio quote tagline about',
    setShare: 'link copy url qr code', setUsernameCard: 'handle name change', setEmailCard: 'address mail', setDelete: 'remove close erase delete account',
    setImport: 'letterboxd imdb trakt anilist myanimelist tv time file history', setExport: 'download pdf image spreadsheet csv backup',
    setUploads: 'pictures images photos posters copyright remove', setPrivate: 'public followers requests', setConnections: 'followers following friends lists who can see view hide', setOnline: 'last seen active',
    setBlocked: 'block unblock users', setPassword: 'change new reset', setSessions: 'devices sessions logins sign out log out everywhere others',
    setMessages: 'passcode pin chats messages recovery code', setLang: 'translate english', setEpisodes: 'rate prompt ask always never',
    setWeekStart: 'diary calendar monday sunday saturday first day', setRegion: 'country where to watch streaming release dates',
    setScreensaver: 'bouncing logo idle preview', setNotInt: 'not interested hidden hide recommend recommendations discover picked for your taste show again', setTheme: 'dark mode light mode system colour color night', nsAlerts: 'pop-up alerts bell sound',
  };

  let shell, shown = null;
  const stack = [];                       // the addresses behind this one, so Back goes up without piling up history
  const $ = id => document.getElementById(id);
  const phoneMQ = matchMedia('(max-width:900px)');
  const sec = id => SECTIONS.find(s => s[0] === id);

  /* ── Where are we ── */
  function parse() {
    let h = decodeURIComponent(location.hash.slice(1));
    h = ALIAS[h] || h;
    const [s, a, b] = h.split('/');
    if (!sec(s)) return { sec: null };
    const r = { sec: s, page: sec(s)[4], door: null, tab: null, row: null };
    if (DOORS[s + '/' + a]) {
      if (DOORS[s + '/' + a] === 'devices' && !phoneMQ.matches) r.row = 'setSessions';   // inline on a computer
      else r.door = DOORS[s + '/' + a];
    } else if (s === 'notifications' && TABS.includes(a)) { r.tab = a; r.row = b || null; }
    else if (a) r.row = a;
    return r;
  }
  const keyOf = r => r.sec ? [r.sec, r.door || r.tab].filter(Boolean).join('/') : (phoneMQ.matches ? '' : 'profile');

  /* ── Drawing ── */
  const ic = (name, size) => icon(name, size);
  function paint(moveFocus) {
    const r = parse(), s = r.sec || (phoneMQ.matches ? null : 'profile'), key = keyOf(r), changed = key !== shown;
    const pageId = r.door ? 'page-' + r.door : s ? 'page-' + sec(s)[4] : null;
    document.querySelectorAll('#setMain > .set-page').forEach(p => { p.hidden = p.id !== pageId; });
    shown = key;
    shell.classList.toggle('is-open', !!r.sec);
    document.querySelectorAll('#setList .set-nav').forEach(a => { if (a.dataset.s === s) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    placeDevices(r.door === 'devices');
    if (s === 'notifications' && typeof MSSNotifSettings !== 'undefined') MSSNotifSettings.tab(r.tab || 'get');
    titles(s);
    const page = pageId && $(pageId), title = page?.querySelector('.set-title');
    document.title = (s ? (title?.textContent || sec(s)[1]) + ' · ' : '') + 'Settings — MyScreenFolio';
    if (!changed && !r.row) return;
    // where to land: the setting (flashes), the second half of a shared page, or the top
    const row = r.row && $(r.row);
    const half = !r.door && page && page.querySelector('.set-pane') !== $('pane-' + s) ? $('pane-' + s) : null;
    requestAnimationFrame(() => {
      if (row && !row.closest('[hidden]')) { row.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); flash(row); }
      else if (half) half.scrollIntoView({ block: 'start' });
      else if (changed) window.scrollTo(0, 0);
      if (changed && moveFocus && r.sec) (row || title)?.focus?.({ preventScroll: true });
    });
  }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // a shared page is named after the link you came from on a phone (PDF), and after both on a computer
  function titles(s) {
    document.querySelectorAll('#setMain .set-title[data-title]').forEach(t => {
      const mine = s && t.closest('.set-page').dataset.sections.split(' ').includes(s);
      t.textContent = phoneMQ.matches && mine ? sec(s)[1] : t.dataset.title;
    });
  }
  // Signed-in devices: inline on Security (computers), its own screen on phones
  function placeDevices(asDoor) {
    const box = $('setSessions'), home = $('devicesHome');
    if (asDoor && box.parentElement !== home) home.appendChild(box);
    if (!asDoor && box.parentElement === home) $('setPassword').after(box);
  }
  function flash(el) {
    const t = el.closest('.set-row, .set-devices, .ns-row, .ns-box, .set-themes, .set-field, .set-card') || el;
    t.classList.remove('set-flash'); void t.offsetWidth; t.classList.add('set-flash');
    setTimeout(() => t.classList.remove('set-flash'), 1900);
    if (!t.hasAttribute('tabindex') && !t.matches('a, button')) { t.tabIndex = -1; t.addEventListener('blur', () => t.removeAttribute('tabindex'), { once: true }); }
    t.focus({ preventScroll: true });
  }

  /* ── Leaving with unsaved text asks first (the address has already changed, so it's put back meanwhile) ── */
  const askLeave = () => showConfirm({ title: 'Leave without saving?', message: 'Your changes on this page haven’t been saved.', confirmText: 'Leave', cancelText: 'Keep editing', danger: false });
  const pageOf = key => { const s = (key || '').split('/')[0]; return s ? sec(s)?.[4] : null; };
  const isDirty = () => !!shown && settingsDirty(pageOf(shown));
  async function onHash() {
    const key = keyOf(parse());
    if (pageOf(key) !== pageOf(shown) && isDirty()) {
      const want = location.hash, from = shown;
      history.pushState(null, '', '#' + from);
      paint(false);
      if (!(await askLeave())) return;
      settingsReset(pageOf(from));
      location.hash = want;
      return;
    }
    const here = location.hash;
    if (stack[stack.length - 2] === here) stack.pop();
    else if (stack[stack.length - 1] !== here) stack.push(here);
    paint(true);
  }
  // Back on a phone: up one level (a door → its section → the list)
  async function back(to) {
    if (stack[stack.length - 2] === to || (to === '' && stack[stack.length - 2] === '')) { history.back(); return; }
    if (to) { location.replace(to); return; }
    if (isDirty()) { if (!(await askLeave())) return; settingsReset(pageOf(shown)); }
    history.replaceState(null, '', location.pathname + location.search);
    stack[stack.length - 1] = '';
    paint(true);
  }

  /* ── Search: names and descriptions on every page ── */
  const pathOf = (s, extra) => sec(s)[1] + (extra ? ' → ' + extra : '');
  function index() {
    const out = [];
    document.querySelectorAll('#setMain .set-pane').forEach(pane => {
      const s = pane.id.replace('pane-', ''); if (!sec(s)) return;
      pane.querySelectorAll('.set-row[id], .set-card[id], .set-themes[id], .set-devices[id]').forEach(el => {
        if (el.hidden || el.parentElement.closest('.set-row[hidden]')) return;   // not on this account
        const name = el.querySelector('.set-name')?.textContent.trim() || el.getAttribute('aria-label') || $(el.getAttribute('aria-labelledby'))?.textContent.trim();
        if (!name) return;
        const door = el.matches('a.is-door[href^="#"]') ? el.getAttribute('href') : null;
        out.push({ name, desc: el.querySelector('.set-desc')?.textContent.trim() || '', more: WORDS[el.id] || '', href: door || `#${s}/${el.id}`, where: pathOf(s) });
      });
    });
    // inside My Profile's card, the theme pictures and the Notifications switches
    [['Display name', 'setDisplayName', 'name'], ['Quote', 'setQuote', 'tagline'], ['Bio', 'setBio', 'about'], ['Profile photo', 'pfNew', 'avatar picture poster circle'], ['Backdrop', 'setBackdrop', 'banner header']]
      .forEach(([name, id, more]) => out.push({ name, desc: '', more, href: `#profile/${id}`, where: pathOf('profile') }));
    [['Light', 'light'], ['Dark', 'dark'], ['System', 'system']].forEach(([name]) => out.push({ name: name + ' theme', desc: '', more: 'theme mode', href: '#appearance/setTheme', where: pathOf('appearance') }));
    out.push({ name: 'Pop-up alerts', desc: 'A banner when something new arrives while MSF is open.', more: WORDS.nsAlerts, href: '#notifications/get/nsAlerts', where: pathOf('notifications') });
    NS_RECEIVE.forEach(([k, name, desc]) => out.push({ name, desc, more: 'notify notification', href: `#notifications/get/nsG-${k}`, where: pathOf('notifications', 'What you get') }));
    out.push({ name: 'Who gets notified', desc: 'Friends & followers, friends only, or no one.', more: 'audience activity sharing', href: '#notifications/who', where: pathOf('notifications') });
    NS_KINDS.forEach(([k, name, desc]) => out.push({ name, desc, more: 'activity share hide', href: `#notifications/hear/nsL-${k}`, where: pathOf('notifications', 'What they hear') }));
    out.push({ name: 'Sign out', desc: 'Sign out of MSF on this device.', more: 'log out logout', href: '#signout', where: 'Settings' });
    return out;
  }
  const norm = t => String(t || '').toLowerCase();
  function mark(text, q) {
    const i = norm(text).indexOf(q);
    return i < 0 ? escHTML(text) : escHTML(text.slice(0, i)) + `<mark>${escHTML(text.slice(i, i + q.length))}</mark>` + escHTML(text.slice(i + q.length));
  }
  let hits = [], active = 0;
  function search() {
    const raw = $('setSearch').value.trim(), q = norm(raw), box = $('setHits');
    $('setList').hidden = !!q;
    box.hidden = !q;
    if (!q) { box.innerHTML = ''; $('setSearchLive').textContent = ''; hits = []; return; }
    const words = q.split(/\s+/);
    hits = index().filter(h => words.every(w => norm(`${h.name} ${h.desc} ${h.more} ${h.where}`).includes(w)))
      .sort((a, b) => (norm(b.name).startsWith(q) - norm(a.name).startsWith(q)) || (norm(b.name).includes(q) - norm(a.name).includes(q)));
    active = 0;
    const n = hits.length;
    $('setSearchLive').textContent = n ? `${n} ${n === 1 ? 'result' : 'results'}` : 'No results';
    box.innerHTML = n
      ? `<div class="set-hits-n" aria-hidden="true">${n} ${n === 1 ? 'result' : 'results'}</div>${hits.map((h, i) => `<a class="set-hit${i === 0 ? ' is-on' : ''}" href="${h.href}" data-i="${i}">
          <span class="set-hit-t"><b>${mark(h.name, q)}</b><small>${escHTML(h.where)}</small></span></a>`).join('')}`
      : mssEmpty({ compact: true, art: 'search', title: `No luck with “${raw}”`, text: 'Try another word, like “password” or “blocked”.' });
  }
  function go(h) {
    if (!h) return;
    $('setSearch').value = ''; search();
    if (h.href === '#signout') { handleLogout(); return; }
    if (location.hash === h.href) paint(true); else location.hash = h.href.slice(1);
  }
  function keys(ev) {
    if (!hits.length) return;
    const els = [...document.querySelectorAll('#setHits .set-hit')];
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
      els.forEach((e, i) => e.classList.toggle('is-on', i === active));
      els[active].scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') { ev.preventDefault(); go(hits[active]); }
    else if (ev.key === 'Escape') { $('setSearch').value = ''; search(); }
  }

  /* The page finished loading something: a link to a setting this account doesn't have goes to its section */
  function refresh(known) {
    if (typeof settingsValues === 'function') settingsValues();
    if (!shell || !known) return;
    const r = parse();
    if (r.door === 'lock' && $('setMessages').hidden) location.replace('#security');
  }

  function init() {
    shell = $('setShell');
    document.querySelectorAll('.set-shell [data-ic]').forEach(e => { e.innerHTML = ic(e.dataset.ic, e.closest('.set-ic, .set-nav-ic') ? 15 : 16); });
    $('setList').innerHTML = GROUPS.map(([name, ids]) => `<div class="set-group"><div class="set-group-head" id="grp-${name}">${name}</div><div class="set-group-list" role="list" aria-labelledby="grp-${name}">${ids.map(id => {
      const [, label, sub, icn] = sec(id);
      return `<a class="set-nav" role="listitem" data-s="${id}" href="#${id}"><span class="set-nav-ic" aria-hidden="true">${ic(icn, 16)}</span><span class="set-nav-t">${label}<span class="set-nav-sub">${sub}</span></span><span class="set-nav-go" aria-hidden="true">${ic('chevright', 15)}</span></a>`;
    }).join('')}</div></div>`).join('')
      // Help: not settings pages — they open Help & Guides (guide.js), Set up your folio (onboarding.js), About and the legal pages
      + `<div class="set-group"><div class="set-group-head" id="grp-Help">Help</div><div class="set-group-list" role="list" aria-labelledby="grp-Help">${[
        ['guide', 'Help & Guides', 'How every feature works', 'help'], ['setup', 'Set up your folio', 'Photo, Top 5, ratings, people, friends', 'sparkles']].map(([a, label, sub, icn]) =>
        `<button type="button" class="set-nav" role="listitem" onclick="mssHelp('${a}')"><span class="set-nav-ic" aria-hidden="true">${ic(icn, 16)}</span><span class="set-nav-t">${label}<span class="set-nav-sub">${sub}</span></span><span class="set-nav-go" aria-hidden="true">${ic('chevright', 15)}</span></button>`).join('')}${[
        // About and the legal pages (about.html, privacy.html…): their own pages
        ['about.html', 'About & contact', 'Who makes MSF, how to reach us', 'info'], ['privacy.html', 'Privacy & Terms', 'Privacy, Terms and Cookie policies', 'shield']].map(([href, label, sub, icn]) =>
        `<a class="set-nav" role="listitem" href="${href}"><span class="set-nav-ic" aria-hidden="true">${ic(icn, 16)}</span><span class="set-nav-t">${label}<span class="set-nav-sub">${sub}</span></span><span class="set-nav-go" aria-hidden="true">${ic('chevright', 15)}</span></a>`).join('')}</div></div>`;
    // a click on the link you're already on still scrolls to it (shared pages)
    $('setList').addEventListener('click', ev => { const a = ev.target.closest('.set-nav'); if (a && location.hash === a.getAttribute('href')) { ev.preventDefault(); paint(true); } });
    $('setHits').addEventListener('click', ev => { const a = ev.target.closest('.set-hit'); if (!a) return; ev.preventDefault(); go(hits[+a.dataset.i]); });
    document.querySelectorAll('#setMain [data-back]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); back(''); }));
    document.querySelectorAll('#setMain .set-door-page .set-back, #setMain .set-trail a').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); back(a.getAttribute('href')); }));
    $('setSearch').addEventListener('input', search);
    $('setSearch').addEventListener('keydown', keys);
    // "/" jumps to search (not while typing somewhere)
    document.addEventListener('keydown', ev => {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (phoneMQ.matches && shell.classList.contains('is-open')) return;
      ev.preventDefault(); $('setSearch').focus();
    });
    window.addEventListener('hashchange', onHash);
    window.addEventListener('beforeunload', ev => { if (isDirty()) ev.preventDefault(); });
    phoneMQ.addEventListener('change', () => paint(false));
    stack.push(location.hash);
    paint(false);
  }
  document.addEventListener('DOMContentLoaded', init);

  return { refresh };
})();
