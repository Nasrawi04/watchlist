/* ══════════════════════════════════════════
   settings-nav.js — Getting around Settings (settings.html)
   Eight sections, each with its own link: settings.html#privacy, or #privacy/setBlocked to
   open a section and point at one setting. On a computer the list stays beside the open
   section; on a phone the list comes first and a section fills the screen (Back returns).
   Search works like iPhone Settings: results say which section a setting lives in.
   Unsaved edits: settingsDirty(section) and settingsReset(section), in settings.html.
══════════════════════════════════════════ */
const MSSSettingsNav = (() => {
  const SECTIONS = [
    ['profile', 'My Profile', 'Photo, name, bio, share link', 'user'],
    ['account', 'Account', 'Username, email, delete account', 'idCard'],
    ['data', 'Data', 'Import, export, backup', 'download'],
    ['privacy', 'Privacy', 'Private account, blocked people', 'eye'],
    ['security', 'Security', 'Password, devices, message lock', 'lock'],
    ['notifications', 'Notifications', 'Alerts and what you share', 'bell'],
    ['preferences', 'Preferences', 'Language, episodes, screensaver', 'settings'],
    ['appearance', 'Appearance', 'Light, Dark or System', 'brush'],
  ];
  const nameOf = id => SECTIONS.find(s => s[0] === id)[1];
  const ALIAS = { msgCard: 'security/setMessages' };    // older links
  const WHO = 'Notifications › Who hears about it';

  // label · section · the setting's card · other words people might search for · (optional) a longer path
  const INDEX = [
    ['Profile Photo', 'profile', 'setPhoto', 'picture avatar image'],
    ['Display Name', 'profile', 'setDetails', 'name'],
    ['Bio', 'profile', 'setDetails', 'about description'],
    ['Quote', 'profile', 'setDetails', 'tagline'],
    ['Share Profile', 'profile', 'setShare', 'link copy url'],
    ['Username', 'account', 'setUsernameCard', 'handle name change'],
    ['Email', 'account', 'setEmailCard', 'address mail'],
    ['Delete Account', 'account', 'setDelete', 'remove close erase'],
    ['Import', 'data', 'setImport', 'letterboxd imdb trakt anilist myanimelist tv time word text file history'],
    ['Export', 'data', 'setExport', 'download pdf image spreadsheet csv letterboxd'],
    ['Full Backup', 'data', 'setExport', 'save copy download'],
    ['Private Account', 'privacy', 'setPrivate', 'public followers lock requests'],
    ['Online Status', 'privacy', 'setOnline', 'show when online last seen active'],
    ['Blocked People', 'privacy', 'setBlocked', 'block unblock users'],
    ['Password', 'security', 'setPassword', 'change new reset'],
    ['Active Sessions', 'security', 'setSessions', 'devices signed in logins'],
    ['Sign Out of All Devices', 'security', 'setSessions', 'log out logout everywhere'],
    ['Message Passcode', 'security', 'setMessages', 'lock pin chats messages'],
    ['Message Recovery Code', 'security', 'setMessages', 'chats messages forgot restore'],
    ['Notification Alerts', 'notifications', 'setNotif', 'bell popups sound'],
    ...(typeof NS_RECEIVE !== 'undefined' ? NS_RECEIVE.map(r => [r[1], 'notifications', 'setNotif', 'notify ' + r[2], 'Notifications › Notify me about']) : []),
    ['Who Hears What You Do', 'notifications', 'setNotif', 'activity audience friends followers sending', WHO],
    ['Language', 'preferences', 'setLang', 'translate english'],
    ['Episode Ratings', 'preferences', 'setEpisodes', 'rate prompt ask always never'],
    ['Screensaver', 'preferences', 'setScreensaver', 'bouncing logo idle'],
    ['Theme', 'appearance', 'setTheme', 'dark mode light mode system colour color night'],
  ];

  let shell, shown = null, fromList = false;
  const $ = id => document.getElementById(id);

  function parse() {
    let h = decodeURIComponent(location.hash.slice(1));
    h = ALIAS[h] || h;
    const [section, item] = h.split('/');
    return SECTIONS.some(s => s[0] === section) ? { section, item } : { section: null, item: null };
  }

  function flash(id) {
    const el = id && $(id);
    if (!el || el.hidden) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('set-flash');
    void el.offsetWidth;
    el.classList.add('set-flash');
    if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
    el.focus({ preventScroll: true });
    setTimeout(() => el.classList.remove('set-flash'), 1900);
  }

  function paint(moveFocus) {
    const { section, item } = parse(), open = section || 'profile', changed = open !== shown;
    SECTIONS.forEach(([id]) => { $('pane-' + id).hidden = id !== open; });
    shown = open;
    shell.classList.toggle('is-open', !!section);
    document.body.classList.toggle('set-open', !!section);
    document.querySelectorAll('#setList .set-row').forEach(a => {
      if (a.dataset.s === open) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = (section ? nameOf(section) + ' · ' : '') + 'Settings — MyScreenFolio';
    if (changed && moveFocus) { window.scrollTo(0, 0); if (section) $('paneT-' + open).focus({ preventScroll: true }); }
    if (item) requestAnimationFrame(() => flash(item));
  }

  const askLeave = from => showConfirm({ title: 'Leave without saving?', message: `Your changes in ${nameOf(from)} haven’t been saved.`, confirmText: 'Leave', cancelText: 'Keep editing' });

  /* Leaving a section with unsaved edits asks first. The address has already changed, so it's put back meanwhile. */
  async function onHash() {
    // On a phone, going back to the list leaves the section too
    const target = parse().section || (matchMedia('(max-width:900px)').matches ? null : 'profile');
    if (shown && target !== shown && settingsDirty(shown)) {
      const want = location.hash, from = shown;
      history.pushState(null, '', '#' + from);
      paint(false);
      const ok = await askLeave(from);
      if (!ok) return;
      settingsReset(from);
      location.hash = want;
      return;
    }
    if (!parse().section) fromList = false;
    paint(true);
  }

  async function back() {
    if (fromList) { history.back(); return; }
    // Opened straight on this section: there's no list behind it in the history
    if (settingsDirty(shown)) {
      if (!(await askLeave(shown))) return;
      settingsReset(shown);
    }
    history.replaceState(null, '', location.pathname + location.search);
    paint(true);
  }

  /* ── Search ── */
  const go = `<svg class="set-row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
  const rowIcon = id => icon(SECTIONS.find(s => s[0] === id)[3], 17);

  function search() {
    const q = $('setSearch').value.trim().toLowerCase(), hits = $('setHits'), list = $('setList');
    list.hidden = !!q;
    hits.hidden = !q;
    if (!q) { hits.innerHTML = ''; $('setSearchLive').textContent = ''; return; }
    const words = q.split(/\s+/);
    const found = INDEX.filter(([label, sec, card, more, path]) => {
      if ($(card)?.hidden) return false;       // not available on this account
      const text = `${label} ${nameOf(sec)} ${more} ${path || ''}`.toLowerCase();
      return words.every(w => text.includes(w));
    }).sort((a, b) => Number(b[0].toLowerCase().startsWith(q)) - Number(a[0].toLowerCase().startsWith(q)));
    $('setSearchLive').textContent = found.length ? `${found.length} ${found.length === 1 ? 'result' : 'results'}` : 'No results';
    hits.innerHTML = found.length
      ? `<div class="set-hits">${found.map(([label, sec, card, , path]) => `<a class="set-row" href="#${sec}/${card}">
          <span class="set-row-ic">${rowIcon(sec)}</span>
          <span class="set-row-text"><span class="set-row-name">${escHTML(label)}</span><span class="set-row-sub">${escHTML(path || nameOf(sec))}</span></span>${go}</a>`).join('')}</div>`
      : mssEmpty({ compact: true, art: 'search', title: `No luck with “${q}”`, text: 'Try another word, like “password” or “blocked”.' });
  }

  function init() {
    shell = $('setShell');
    $('setList').innerHTML = SECTIONS.map(([id, name, sub]) => `<a class="set-row" data-s="${id}" href="#${id}">
        <span class="set-row-ic">${rowIcon(id)}</span>
        <span class="set-row-text"><span class="set-row-name">${name}</span><span class="set-row-sub">${sub}</span></span>${go}</a>`).join('');
    $('setSearch').addEventListener('input', search);
    // Going in from the list: Back returns to it. Tapping the result you're already on points at it again.
    shell.addEventListener('click', ev => {
      const a = ev.target.closest('.set-rail a.set-row');
      if (!a) return;
      fromList = true;
      if (a.getAttribute('href') === location.hash) flash(parse().item);
    });
    window.addEventListener('hashchange', onHash);
    window.addEventListener('beforeunload', ev => { if (shown && settingsDirty(shown)) ev.preventDefault(); });
    paint(false);
  }
  document.addEventListener('DOMContentLoaded', init);

  return { back };
})();
