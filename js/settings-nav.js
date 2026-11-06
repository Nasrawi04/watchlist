/* ══════════════════════════════════════════
   settings-nav.js — Getting around Settings (settings.html)
   Three levels, each with its own link:
     settings.html              the sections (on a computer they stay beside everything else)
     settings.html#account      a section's list of settings
     settings.html#account/setUsernameCard   one setting, on its own screen
   A section with a single setting opens it straight away. Back goes up one level.
   Search works like iPhone Settings: results say where a setting lives, and open it.
   From settings.html: settingsDirty(item), settingsReset(item), settingsValue(item).
══════════════════════════════════════════ */
const MSSSettingsNav = (() => {
  const SECTIONS = [
    ['profile', 'My Profile', 'Photo, name, bio, share link', 'user'],
    ['account', 'Account', 'Username, email, delete account', 'idCard'],
    ['data', 'Data', 'Import, export, your uploads', 'download'],
    ['privacy', 'Privacy', 'Private account, blocked people', 'eye'],
    ['security', 'Security', 'Password, devices, message lock', 'lock'],
    ['notifications', 'Notifications', 'Alerts and what you share', 'bell'],
    ['preferences', 'Preferences', 'Language, episodes, screensaver', 'settings'],
    ['appearance', 'Appearance', 'Light, Dark or System', 'brush'],
  ];
  const GROUPS = [['You', ['profile', 'account', 'data']], ['Safety', ['privacy', 'security']], ['App', ['notifications', 'preferences', 'appearance']]];
  // Each section's settings: [the card, its name, optional group heading, optional style]
  const ITEMS = {
    profile: [['setPhoto', 'Profile Photo'], ['setDetails', 'Name and Bio'], ['setShare', 'Share Profile']],
    account: [['setUsernameCard', 'Username'], ['setEmailCard', 'Email'], ['setDelete', 'Delete Account', null, 'danger']],
    data: [['setImport', 'Import'], ['setExport', 'Export and Backup'], ['setUploads', 'My Uploads']],
    privacy: [['setPrivate', 'Private Account'], ['setOnline', 'Online Status'], ['setBlocked', 'Blocked People']],
    security: [['setPassword', 'Password'], ['setSessions', 'Active Sessions'], ['setMessages', 'Message Lock and Recovery']],
    notifications: [['nsAlertsT', 'Alerts', 'Receiving'], ['nsGetT', 'Notify Me About', 'Receiving'], ['nsWhoT', 'Who Gets Notified', 'Sending'], ['nsShareT', 'What They Hear About', 'Sending']],
    preferences: [['setLang', 'Language'], ['setEpisodes', 'Episode Ratings'], ['setWeekStart', 'Week Starts On'], ['setScreensaver', 'Screensaver']],
    appearance: [['setTheme', 'Theme']],
  };
  const sectionName = id => SECTIONS.find(s => s[0] === id)[1];
  const itemOf = (section, id) => ITEMS[section].find(i => i[0] === id);
  const isNotif = id => id.startsWith('ns');
  const ALIAS = { msgCard: 'security/setMessages' };    // older links

  // label · section · the setting's screen · other words people might search for
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
    ['My Uploads', 'data', 'setUploads', 'pictures images photos posters avatar copyright remove delete'],
    ['Private Account', 'privacy', 'setPrivate', 'public followers lock requests'],
    ['Online Status', 'privacy', 'setOnline', 'show when online last seen active'],
    ['Blocked People', 'privacy', 'setBlocked', 'block unblock users'],
    ['Password', 'security', 'setPassword', 'change new reset current'],
    ['Active Sessions', 'security', 'setSessions', 'devices signed in logins'],
    ['Sign Out of All Devices', 'security', 'setSessions', 'log out logout everywhere'],
    ['Message Passcode', 'security', 'setMessages', 'lock pin chats messages'],
    ['Message Recovery Code', 'security', 'setMessages', 'chats messages forgot restore'],
    ['Alerts', 'notifications', 'nsAlertsT', 'bell popups sound notification'],
    ...NS_RECEIVE.map(r => [r[1], 'notifications', 'nsGetT', 'notify notification ' + r[2]]),
    ['Who Gets Notified', 'notifications', 'nsWhoT', 'activity audience friends followers sending'],
    ['What They Hear About', 'notifications', 'nsShareT', 'activity sending share hide'],
    ['Language', 'preferences', 'setLang', 'translate english'],
    ['Episode Ratings', 'preferences', 'setEpisodes', 'rate prompt ask always never'],
    ['Week Starts On', 'preferences', 'setWeekStart', 'diary calendar monday sunday saturday first day'],
    ['Screensaver', 'preferences', 'setScreensaver', 'bouncing logo idle'],
    ['Theme', 'appearance', 'setTheme', 'dark mode light mode system colour color night'],
  ];

  let shell, shown = null;        // shown: what's on screen, as 'section' or 'section/item'
  const stack = [];               // the addresses behind this one, so Back can go up a level without piling up history
  const $ = id => document.getElementById(id);
  const hasRoomForList = () => !matchMedia('(max-width:900px)').matches;

  function parse() {
    let h = decodeURIComponent(location.hash.slice(1));
    h = ALIAS[h] || h;
    const [section, item] = h.split('/');
    if (!ITEMS[section]) return { section: null, item: null };
    const only = ITEMS[section].length === 1 ? ITEMS[section][0][0] : null;
    return { section, item: only || (itemOf(section, item) ? item : null) };
  }
  const keyOf = r => r.section ? r.section + (r.item && ITEMS[r.section].length > 1 ? '/' + r.item : '') : null;

  /* ── Drawing ── */
  const CHEVRON = `<svg class="set-row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
  const rowIcon = id => icon(SECTIONS.find(s => s[0] === id)[3], 17);

  function paintRows(section) {
    const box = $('rows-' + section);
    if (!box) return;
    const groups = [];
    ITEMS[section].forEach(item => {
      const el = isNotif(item[0]) ? null : $(item[0]);
      if (el?.hidden) return;                // not available on this account
      const name = item[2] || '';
      if (groups[groups.length - 1]?.name !== name) groups.push({ name, items: [] });
      groups[groups.length - 1].items.push(item);
    });
    box.innerHTML = groups.map(g => `${g.name ? `<div class="set-rows-head">${g.name}</div>` : ''}<div class="set-rows-list">${g.items.map(([id, label, , style]) => {
      const value = settingsValue(id);
      return `<a class="set-item${style ? ' is-' + style : ''}" href="#${section}/${id}"><span class="set-item-name">${escHTML(label)}</span>${value ? `<span class="set-item-value" translate="no">${escHTML(value)}</span>` : ''}${CHEVRON}</a>`;
    }).join('')}</div>`).join('');
  }

  function paint(moveFocus) {
    const r = parse(), open = r.section || 'profile', key = keyOf(r) || (hasRoomForList() ? 'profile' : null);
    const changed = key !== shown;
    SECTIONS.forEach(([id]) => { $('pane-' + id).hidden = id !== open; });
    shown = key;
    shell.classList.toggle('is-open', !!r.section);
    document.body.classList.toggle('set-open', !!r.section);
    document.querySelectorAll('#setList .set-row').forEach(a => {
      if (a.dataset.s === open) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    const pane = $('pane-' + open), item = r.item && itemOf(open, r.item), single = ITEMS[open].length === 1;
    pane.classList.toggle('is-item', !!item && !single);
    pane.querySelectorAll(':scope > .settings-section, :scope > #setNotif').forEach(c => c.classList.remove('set-on'));
    if (item) {
      const card = isNotif(r.item) ? $('setNotif') : $(r.item);
      card.classList.add('set-on');
      if (isNotif(r.item)) card.dataset.part = r.item;
    }
    paintRows(open);
    $('rows-' + open)?.toggleAttribute('hidden', !!item);

    const label = item && !single ? item[1] : sectionName(open);
    $('paneT-' + open).textContent = label;
    pane.querySelector('.set-trail').innerHTML = item && !single
      ? `<a href="#${open}">${sectionName(open)}</a><span aria-hidden="true">›</span><span aria-current="page">${escHTML(label)}</span>` : '';
    document.title = (r.section ? label + ' · ' : '') + 'Settings — MyScreenFolio';
    if (changed && moveFocus) { window.scrollTo(0, 0); if (r.section) $('paneT-' + open).focus({ preventScroll: true }); }
  }

  const askLeave = () => showConfirm({ title: 'Leave without saving?', message: 'Your changes on this screen haven’t been saved.', confirmText: 'Leave', cancelText: 'Keep editing' });
  const shownItem = () => shown?.split('/')[1] || null;
  const isDirty = () => !!shownItem() && settingsDirty(shownItem());

  /* Leaving a setting with unsaved edits asks first. The address has already changed, so it's put back meanwhile. */
  async function onHash() {
    const key = keyOf(parse()) || (hasRoomForList() ? 'profile' : null);
    if (key !== shown && isDirty()) {
      const want = location.hash, from = shown, item = shownItem();
      history.pushState(null, '', '#' + from);
      paint(false);
      if (!(await askLeave())) return;
      settingsReset(item);
      location.hash = want;
      return;
    }
    const here = location.hash;
    if (stack[stack.length - 2] === here) stack.pop();
    else if (stack[stack.length - 1] !== here) stack.push(here);
    paint(true);
  }

  /* Back: up one level */
  async function back() {
    const r = parse();
    const parent = r.item && ITEMS[r.section].length > 1 ? '#' + r.section : '';
    if (stack[stack.length - 2] === parent) { history.back(); return; }
    if (parent) { location.replace(parent); return; }
    if (isDirty()) {
      if (!(await askLeave())) return;
      settingsReset(shownItem());
    }
    history.replaceState(null, '', location.pathname + location.search);
    stack[stack.length - 1] = '';
    paint(true);
  }

  /* ── Search ── */
  function search() {
    const q = $('setSearch').value.trim().toLowerCase(), hits = $('setHits'), list = $('setList');
    list.hidden = !!q;
    hits.hidden = !q;
    if (!q) { hits.innerHTML = ''; $('setSearchLive').textContent = ''; return; }
    const words = q.split(/\s+/);
    const found = INDEX.filter(([label, sec, card, more]) => {
      if (!isNotif(card) && $(card)?.hidden) return false;       // not available on this account
      const text = `${label} ${sectionName(sec)} ${more}`.toLowerCase();
      return words.every(w => text.includes(w));
    }).sort((a, b) => Number(b[0].toLowerCase().startsWith(q)) - Number(a[0].toLowerCase().startsWith(q)));
    $('setSearchLive').textContent = found.length ? `${found.length} ${found.length === 1 ? 'result' : 'results'}` : 'No results';
    hits.innerHTML = found.length
      ? `<div class="set-hits">${found.map(([label, sec, card]) => {
        const where = isNotif(card) && itemOf(sec, card)[1] !== label ? `${sectionName(sec)} › ${itemOf(sec, card)[1]}` : sectionName(sec);
        return `<a class="set-row" href="#${sec}/${card}">
          <span class="set-row-ic">${rowIcon(sec)}</span>
          <span class="set-row-text"><span class="set-row-name">${escHTML(label)}</span><span class="set-row-sub">${escHTML(where)}</span></span>${CHEVRON}</a>`;
      }).join('')}</div>`
      : mssEmpty({ compact: true, art: 'search', title: `No luck with “${q}”`, text: 'Try another word, like “password” or “blocked”.' });
  }

  /* The page finished loading something. known: whether a setting is available is now settled,
     so a link to one this account doesn't have goes to its section instead. */
  function refresh(known) {
    if (!shell) return;
    const r = parse();
    if (known && r.item && !isNotif(r.item) && $(r.item)?.hidden) { location.replace('#' + r.section); return; }
    paintRows(r.section || 'profile');
  }

  function init() {
    shell = $('setShell');
    $('setList').innerHTML = GROUPS.map(([name, ids]) => `<div class="set-group"><div class="set-group-head">${name}</div><div class="set-group-list">${ids.map(id => {
      const [, label, sub] = SECTIONS.find(s => s[0] === id);
      return `<a class="set-row" data-s="${id}" href="#${id}"><span class="set-row-ic">${rowIcon(id)}</span><span class="set-row-text"><span class="set-row-name">${label}</span><span class="set-row-sub">${sub}</span></span>${CHEVRON}</a>`;
    }).join('')}</div></div>`).join('');
    SECTIONS.forEach(([id]) => {
      if (ITEMS[id].length === 1) return;
      const rows = document.createElement('div');
      rows.className = 'set-rows'; rows.id = 'rows-' + id;
      $('pane-' + id).querySelector('.set-pane-head').after(rows);
    });
    $('setSearch').addEventListener('input', search);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('beforeunload', ev => { if (isDirty()) ev.preventDefault(); });
    stack.push(location.hash);
    paint(false);
  }
  document.addEventListener('DOMContentLoaded', init);

  return { back, refresh };
})();
