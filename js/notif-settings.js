/* ═══════════════════════════════════════════════════════════════
   notif-settings.js — Notification settings (notifications.html?tab=settings · Settings › Notifications)

   Alerts — "Pop-up alerts" on this device (mssNotifPopupsOn / mssSetNotifPopups, nav.js). Only changes
            pop-ups and the bell's ring, never what arrives.
   What you get — one switch per kind of notification (profiles.notif_off, set_notif_receive, 084), in four
            groups. A group's switch turns its whole group on / off ("mixed" when some are on).
            Off = it never arrives (the database drops it).
   What you share
     • Who gets notified: Friends & followers · Friends only · No one (profiles.activity_audience,
       set_activity_audience). Activity pings go to people in it who turned on "Notify me" for you;
       polls go to everyone in it. "No one" outranks the switches below (they're shown dimmed, unchanged).
     • One switch per activity, all on by default (072). Under each:
         on  → "Hide from…"    those people don't get it
         off → "Only send to…" just those people still do
       Saved straight away (set_activity_pref); the database checks every notification against all of this.
   MSSNotifSettings.render(el) draws it into el. The Notifications page's "Quiet the noise" uses
   ready() / isOn(k) / setOn(k, on) — the same settings, so both stay in step ('mss:notif-prefs').
═══════════════════════════════════════════════════════════════ */
const NS_RECEIVE = [
  ['releases',     'New episodes & releases', 'New episodes and releases of titles in your library'],
  ['on_this_day',  'On This Day',               'Once a day, what you finished on this date in earlier years'],
  ['on_this_day_popup', 'On This Day pop-ups',  'Titles you rated 9+ on this date in earlier years, on the home page, once a day'],
  ['achievements', 'Medals',                    'When you earn a medal'],
  ['followers',    'New followers',             'Someone follows you, or accepts your follow request'],
  ['requests',     'Follow requests',           'Someone asks to follow your private account. Requests still wait on the Friends page'],
  ['activity',     'Friends’ activity',         'What people you turned “Notify me” on for watch, rate, add and write'],
  ['polls',        'Polls',                     'New polls from people you follow, and comments on yours'],
  ['messages',     'Messages & recommendations', 'A friend messages you or recommends a title or list. Never shows what the message says'],
  ['comments',     'Comments & replies',        'On your titles, notes, lists and comments'],
  ['likes',        'Likes',                     'On your notes, lists and replies'],
  ['episode_chat', 'Episode chat',              'Replies in episode chats you’re in'],
  ['lists',        'List invites',              'Invites to collaborate on a list, and answers to yours'],
  ['movie_night',  'Movie Night',               'Invites, picks, changes and reminders'],
  ['challenges',   'Challenges',                'Invites and finishes'],
];
const NS_GROUPS = [
  ['shows',  'Your shows & you', 'tv',      ['releases', 'on_this_day', 'on_this_day_popup', 'achievements']],
  ['people', 'People',           'users',   ['followers', 'requests', 'activity', 'polls']],
  ['talk',   'Conversations',    'comment', ['messages', 'comments', 'likes', 'episode_chat']],
  ['plans',  'Plans together',   'film',    ['lists', 'movie_night', 'challenges']],
];
const NS_AUDIENCE = [
  ['followers', 'Friends & followers', 'users'],
  ['friends',   'Friends only',        'check'],
  ['nobody',    'No one',              'x'],
];
const NS_KINDS = [
  ['started',   'Started watching',   'When you start a movie or show'],
  ['episodes',  'Episodes',           'Each episode you watch — a run of them counts as one'],
  ['finished',  'Finished',           'When you finish something or catch up on a show'],
  ['rated',     'Rated something',    'The first time you score a title'],
  ['note',      'Wrote a note',       'When a title gets your note'],
  ['watchlist', 'Added to watchlist', 'New titles on your Watchlist or Up Next'],
  ['dropped',   'Dropped',            'When you drop a show or movie'],
  ['list',      'Made a list',        'A new list (not private-link lists)'],
  ['poll',      'Posted a poll',      'Goes to everyone in your audience, not only the ones with your bell on'],
];

const MSSNotifSettings = (() => {
  let el = null, prefs = {}, friends = [], picking = null, loading = null, loaded = false;
  let audience = 'followers', off = new Set(), me = null;   // sending: who · receiving: kinds switched off (084)
  const st = k => prefs[k] || (prefs[k] = { on: true, ex: [] });
  const fr = id => friends.find(f => f.id === id);
  const kindName = k => NS_KINDS.find(x => x[0] === k)[1];
  const recName = k => NS_RECEIVE.find(x => x[0] === k)[1];
  const av = f => `<span class="ns-av" aria-hidden="true">${safeURL(f?.avatar_url) ? `<img src="${safeURL(f.avatar_url)}" alt="">` : escHTML(((f?.username || '?')[0]).toUpperCase())}</span>`;
  const sw = (on, attrs) => `<button type="button" class="push-switch" role="switch" aria-checked="${on}" ${attrs}><span aria-hidden="true"></span></button>`;
  const changed = () => document.dispatchEvent(new CustomEvent('mss:notif-prefs'));

  // render(el, { tabs }) — tabs (Settings): Pop-up alerts as a settings row, then a 3-way switch
  // (What you get · Who gets notified · What they hear) over the same cards, one at a time.
  let tabs = false, tabNow = 'get';
  const TABS = [['get', 'What you get'], ['who', 'Who gets notified'], ['hear', 'What they hear']];
  async function render(target, o = {}) {
    el = target; tabs = !!o.tabs;
    const popSw = sw(mssNotifPopupsOn(), 'id="nsPopSw" aria-labelledby="nsPopL" aria-describedby="nsPopS" onclick="MSSNotifSettings._alerts()"');
    const get = `<section class="ns-card" aria-labelledby="nsGetT">
            <h3 class="ns-title sr-only" id="nsGetT">What you get</h3>
            <div class="ns-grid" id="nsGetList">${skelBoxes(4, 3)}</div>
          </section>`;
    const who = `<section class="ns-card" aria-labelledby="nsWhoT">
              <h3 class="ns-title${tabs ? ' sr-only' : ''}" id="nsWhoT">Who gets notified</h3>
              <div class="ns-box ns-box-pad" id="nsWho">${skelBoxes(0, 1)}</div>
            </section>`;
    const hear = `<section class="ns-card" aria-labelledby="nsShareT">
              <h3 class="ns-title${tabs ? ' sr-only' : ''}" id="nsShareT">What they hear about</h3>
              <div id="nsShareList">${skelBoxes(1, 6)}</div>
            </section>`;
    const GET_SUB = 'Anything switched off never reaches you — not on the bell, not on the Notifications page.';
    const SHARE_SUB = 'Who hears about what you watch, and what they hear. Friends Activity still shows what you watch.';
    el.innerHTML = tabs ? `<div class="ns-wrap ns-tabbed">
        <h2 class="set-sub">This device</h2>
        <div class="set-card"><div class="set-row" id="nsAlerts">
          <span class="set-ic">${icon('bell', 15)}</span>
          <div class="set-txt"><div class="set-name" id="nsPopL">Pop-up alerts</div><div class="set-desc" id="nsPopS">A banner when something new arrives while MSF is open. Only this device.</div></div>
          <div class="set-ctl">${popSw}</div>
        </div></div>
        <div class="ns-tabbar">
          <div class="pn-toggle set-seg ns-tabs" role="tablist" aria-label="Notification settings">${TABS.map(([k, l]) =>
            `<button type="button" class="pn-toggle-btn" role="tab" id="nsTabB-${k}" aria-controls="nsTab-${k}" data-tab="${k}">${l}</button>`).join('')}</div>
          <span class="ns-tab-n" id="nsTabN" aria-live="polite"></span>
        </div>
        <div class="ns-tab" role="tabpanel" id="nsTab-get" aria-labelledby="nsTabB-get"><p class="ns-tab-sub">${GET_SUB}</p>${get}</div>
        <div class="ns-tab" role="tabpanel" id="nsTab-who" aria-labelledby="nsTabB-who" hidden><p class="ns-tab-sub">${SHARE_SUB}</p>${who}</div>
        <div class="ns-tab" role="tabpanel" id="nsTab-hear" aria-labelledby="nsTabB-hear" hidden><p class="ns-tab-sub">${SHARE_SUB}</p>${hear}</div>
      </div>` : `<div class="ns-wrap">
        <section class="ns-card" aria-labelledby="nsAlertsT">
          <h3 class="ns-title" id="nsAlertsT">On this device</h3>
          <div class="ns-box"><div class="ns-row">
            <div class="ns-txt"><div class="ns-name" id="nsPopL">Pop-up alerts</div>
              <div class="ns-sub" id="nsPopS">Ring the bell and show a short alert when something new arrives. Only changes this device — what reaches you is set below.</div></div>
            ${popSw}
          </div></div>
        </section>
        <div class="ns-sec">
          <div class="ns-sec-head"><h2 class="ns-sec-title">What you get</h2>
            <p class="ns-sec-sub">${GET_SUB}</p></div>
          ${get}
        </div>
        <div class="ns-sec">
          <div class="ns-sec-head"><h2 class="ns-sec-title">What you share</h2>
            <p class="ns-sec-sub">${SHARE_SUB}</p></div>
          <div class="ns-stack">
            ${who}
            ${hear}
          </div>
        </div>
      </div>`;
    if (tabs) {
      const bar = el.querySelector('.ns-tabs');
      bar.addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) pickTab(b.dataset.tab); });
      bar.addEventListener('keydown', ev => {
        const i = TABS.findIndex(t => t[0] === tabNow), step = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: TABS.length - 1 - i }[ev.key];
        if (step === undefined) return;
        ev.preventDefault();
        const k = TABS[(i + (document.dir === 'rtl' && Math.abs(step) === 1 ? -step : step) + TABS.length) % TABS.length][0];
        pickTab(k); document.getElementById('nsTabB-' + k).focus();
      });
      tab(tabNow);
    }
    try { await ready(); }
    catch (err) {
      console.error(err);
      ['nsShareList', 'nsGetList', 'nsWho'].forEach(i => { const b = document.getElementById(i); if (b) b.innerHTML = '<div class="ns-loading">Couldn’t load these — try again later.</div>'; });
      return;
    }
    draw();
  }
  // Settings: show one tab (its address is #notifications/<tab>, kept without a new history step)
  function tab(k) {
    tabNow = TABS.some(t => t[0] === k) ? k : 'get';
    if (!tabs || !el) return;
    TABS.forEach(([t]) => {
      const b = document.getElementById('nsTabB-' + t); if (!b) return;
      const on = t === tabNow;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
      document.getElementById('nsTab-' + t).hidden = !on;
    });
    count();
  }
  function pickTab(k) {
    tab(k);
    history.replaceState(history.state, '', '#notifications/' + tabNow);
  }
  function count() {
    const n = document.getElementById('nsTabN'); if (!n) return;
    if (!loaded || tabNow === 'who') { n.textContent = ''; return; }
    const [on, all] = tabNow === 'get' ? [NS_RECEIVE.filter(r => !off.has(r[0])).length, NS_RECEIVE.length] : [NS_KINDS.filter(k => st(k[0]).on).length, NS_KINDS.length];
    n.textContent = `${on} of ${all} on`;
  }
  // grey rows while loading (n boxes of r rows; n = 0: just the rows)
  function skelBoxes(n, r) {
    const rows = Array.from({ length: r }, () => '<div class="ns-row"><div class="ns-txt"><span class="skel skel-line" style="width:40%"></span><span class="skel skel-line skel-sm" style="width:70%"></span></div><span class="skel ns-sw-skel"></span></div>').join('');
    return n ? Array.from({ length: n }, () => `<div class="ns-box">${rows}</div>`).join('') : rows;
  }
  function ready() {
    return loading || (loading = load().catch(err => { loading = null; throw err; }));
  }
  async function load() {
    me = window._navUser?.id || (await getCurrentUser()).id;
    const [p, x, f, fo, prof] = await Promise.all([
      sb.from('activity_prefs').select('kind, is_on').eq('user_id', me).then(r => { if (r.error) throw r.error; return r.data || []; }),
      sb.from('activity_pref_exceptions').select('kind, friend_id').eq('user_id', me).then(r => { if (r.error) throw r.error; return r.data || []; }),
      getFriendships(me).then(r => r.filter(z => z.status === 'accepted')),
      typeof getFollowList === 'function' ? getFollowList(me, 'followers').catch(() => []) : [],
      sb.from('profiles').select('activity_audience, notif_off').eq('id', me).maybeSingle().then(r => { if (r.error) throw r.error; return r.data || {}; }),
    ]);
    audience = prof.activity_audience || 'followers';
    off = new Set(prof.notif_off || []);
    // the people the "hide from / only send to" pickers list: friends, then followers (084)
    const fr0 = f.map(z => ({ id: z.friendId, username: z.friendProfile?.username || 'friend', avatar_url: z.friendProfile?.avatar_url || null, friend: true }));
    const ids = new Set(fr0.map(z => z.id));
    friends = fr0.concat((fo || []).filter(z => !ids.has(z.id)).map(z => ({ id: z.id, username: z.username || 'someone', avatar_url: z.avatar_url || null, friend: false })))
      .sort((a, b) => (b.friend - a.friend) || a.username.localeCompare(b.username));
    prefs = {};
    p.forEach(r => { st(r.kind).on = r.is_on; });
    x.forEach(r => { if (fr(r.friend_id)) st(r.kind).ex.push(r.friend_id); });    // ex-friends drop out
    loaded = true;
  }

  // ── What you get ──
  function groupHTML([g, name, ic, keys]) {
    const n = keys.filter(k => !off.has(k)).length, all = n === keys.length;
    const state = all ? 'true' : n ? 'mixed' : 'false';
    return `<div class="ns-box ns-group" role="group" aria-labelledby="nsGrp-${g}">
        <div class="ns-row ns-group-head">
          <span class="ns-group-ic" aria-hidden="true">${icon(ic, 15)}</span>
          <div class="ns-txt"><div class="ns-group-name" id="nsGrp-${g}">${name}</div><div class="ns-sub" id="nsGrpN-${g}">${n} of ${keys.length} on</div></div>
          ${sw(state, `aria-label="All of ${name}" aria-describedby="nsGrpN-${g}" onclick="MSSNotifSettings._group('${g}')"`)}
        </div>
        ${keys.map(k => { const [, l, s] = NS_RECEIVE.find(r => r[0] === k); return `<div class="ns-row">
          <div class="ns-txt"><div class="ns-name" id="nsG-${k}">${l}</div><div class="ns-sub" id="nsGS-${k}">${s}</div></div>
          ${sw(!off.has(k), `data-k="${k}" aria-labelledby="nsG-${k}" aria-describedby="nsGS-${k}" onclick="MSSNotifSettings._get('${k}')"`)}
        </div>`; }).join('')}
      </div>`;
  }
  // ── What they hear about ──
  function rowHTML([k, name, sub]) {
    const s = st(k), n = s.ex.length;
    const btn = s.on ? (n ? `Hidden from ${n}` : 'Hide from…') : (n ? `Only to ${n}` : 'Only send to…');
    return `<div class="ns-row ns-share" id="ns-${k}">
        <div class="ns-txt"><div class="ns-name" id="nsL-${k}">${name}</div><div class="ns-sub" id="nsS-${k}">${sub}</div>
          ${n ? `<div class="ns-chips" aria-label="${s.on ? 'Hidden from' : 'Only sent to'}">${s.ex.map(id => `<span class="ns-chip" translate="no">${av(fr(id))}@${escHTML(fr(id)?.username || '')}</span>`).join('')}</div>` : ''}
        </div>
        ${pickable().length ? `<button type="button" class="ns-who-btn${n ? ' has' : ''}" onclick="MSSNotifSettings._pick('${k}')" aria-describedby="nsL-${k}">${icon('users', 13)} ${btn}</button>` : ''}
        ${sw(s.on, `aria-labelledby="nsL-${k}" aria-describedby="nsS-${k}" onclick="MSSNotifSettings._toggle('${k}')"`)}
      </div>`;
  }
  // who can be picked right now: friends always; followers only while your audience includes them
  const pickable = () => friends.filter(f => f.friend || audience === 'followers');
  function draw() {
    const g = document.getElementById('nsGetList');
    if (g) g.innerHTML = NS_GROUPS.map(groupHTML).join('');
    const w = document.getElementById('nsWho');
    if (w) w.innerHTML = `<div class="pn-toggle ns-aud" role="radiogroup" aria-labelledby="nsWhoT">${NS_AUDIENCE.map(([k, l2, ic]) =>
        `<button type="button" class="pn-toggle-btn${audience === k ? ' active' : ''}" role="radio" aria-checked="${audience === k}" onclick="MSSNotifSettings._aud('${k}')">${icon(ic, 13)} ${l2}</button>`).join('')}</div>
      <p class="ns-aud-note">${audience === 'followers' ? 'Anyone who follows you can turn on notifications for you. Your polls go to all your followers.'
        : audience === 'friends' ? 'Only people you follow back (your friends) can get notified. Followers can’t turn notifications on for you.'
        : 'Nobody gets notified about what you do — not even your polls. The switches below wait until you pick someone again.'}</p>`;
    const l = document.getElementById('nsShareList');
    if (l) {
      l.innerHTML = `<div class="ns-box ns-share-box${audience === 'nobody' ? ' ns-muted' : ''}">${NS_KINDS.map(rowHTML).join('')}</div>`;
      l.firstElementChild.toggleAttribute('inert', audience === 'nobody');
    }
    count();
  }
  async function setAudience(k) {
    if (k === audience) return;
    const prev = audience; audience = k; draw();
    document.querySelector('.ns-aud .active')?.focus();
    const { error } = await sb.rpc('set_activity_audience', { p_audience: k });
    if (error) { audience = prev; draw(); showToast('Couldn’t save that — try again.', 'err'); return; }
    // followers picked in "hide from / only send to" no longer apply under Friends only / No one — the database ignores them anyway
    showToast(k === 'followers' ? 'Friends and followers can get your notifications.' : k === 'friends' ? 'Only your friends can get your notifications.' : 'Nobody gets notified about what you do.');
  }
  // one receive switch: saved at once; flips back if it can't be saved → true when saved
  async function setOn(k, on) {
    on ? off.delete(k) : off.add(k);
    paint();
    const { error } = await sb.rpc('set_notif_receive', { p_group: k, p_on: on });
    if (error) { on ? off.add(k) : off.delete(k); paint(); return false; }
    changed();
    return true;
  }
  // redraw the receive switches in place (keeps focus where it is)
  function paint() {
    NS_GROUPS.forEach(([g, , , keys]) => {
      const n = keys.filter(k => !off.has(k)).length;
      const head = document.querySelector(`[aria-labelledby="nsGrp-${g}"] .ns-group-head .push-switch`);
      if (head) head.setAttribute('aria-checked', n === keys.length ? 'true' : n ? 'mixed' : 'false');
      const c = document.getElementById(`nsGrpN-${g}`); if (c) c.textContent = `${n} of ${keys.length} on`;
    });
    document.querySelectorAll('#nsGetList .push-switch[data-k]').forEach(b => b.setAttribute('aria-checked', !off.has(b.dataset.k)));
    count();
  }
  async function setGet(k) {
    if (!(await setOn(k, off.has(k)))) showToast('Couldn’t save that — try again.', 'err');
    else showToast('Saved');
  }
  // a group's switch: all on → all off; otherwise all on
  async function setGroup(g) {
    const keys = NS_GROUPS.find(x => x[0] === g)[3], on = keys.some(k => off.has(k));
    const todo = keys.filter(k => off.has(k) === on);
    const ok = await Promise.all(todo.map(k => setOn(k, on)));
    if (ok.includes(false)) showToast('Couldn’t save all of those — try again.', 'err');
    else showToast(`${NS_GROUPS.find(x => x[0] === g)[1]}: all ${on ? 'on' : 'off'}.`);
  }
  async function save(k) {
    const s = st(k);
    const { error } = await sb.rpc('set_activity_pref', { p_kind: k, p_on: s.on, p_except: s.ex });
    if (error) { console.error(error); showToast('Couldn’t save that — try again.', 'err'); loading = null; await ready().catch(() => {}); draw(); return false; }
    return true;
  }
  // flipping a switch flips who the picked friends are for — so they're cleared
  async function toggle(k) {
    const s = st(k), had = s.ex.length;
    s.on = !s.on; s.ex = [];
    draw();
    document.querySelector(`#ns-${k} .push-switch`)?.focus();
    if (!(await save(k))) return;
    showToast(had ? (s.on ? `${kindName(k)} is on for everyone again.` : `${kindName(k)} is off for everyone.`) : 'Saved');
  }
  function alerts() {
    const on = !mssNotifPopupsOn();
    mssSetNotifPopups(on);
    document.getElementById('nsPopSw')?.setAttribute('aria-checked', on);
    showToast(on ? 'Pop-up alerts on.' : 'Pop-up alerts off — new notifications just show on the bell.');
  }

  /* the friend picker: a side panel S (full page on phones) — search, tick people, Clear / Done */
  let panel = null;
  async function pick(k) {
    const s = st(k);
    picking = { k, sel: new Set(s.ex) };
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: s.on ? `${kindName(k)}: hide from…` : `${kindName(k)}: only send to…`,
      body: `<p class="lyr-hint ns-pick-hint">${s.on ? 'Tick the people who shouldn’t get this.' : 'This is off — tick the people who should still get it.'}</p>
        <div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
          <input type="search" id="nsPickQ" class="lyr-field" autocomplete="off" placeholder="Search friends and followers…" aria-label="Search your friends and followers" oninput="MSSNotifSettings._list()"></div>
        <div class="ns-pick-list" id="nsPickList" role="group" aria-label="People"></div>`,
      footer: { secondary: [{ label: 'Clear', onClick: () => clear() }], primary: { label: 'Done', onClick: () => done() } },
      onClose: () => { if (panel === h) { panel = null; picking = null; } } });
    panel = h;
    list();
    if (!h.isPage) document.getElementById('nsPickQ').focus();
  }
  function list() {
    const q = (document.getElementById('nsPickQ').value || '').trim().toLowerCase();
    const rows = pickable().filter(f => !q || f.username.toLowerCase().includes(q));
    document.getElementById('nsPickList').innerHTML = rows.map(f => {
      const on = picking.sel.has(f.id);
      return `<button type="button" class="ns-pick-row${on ? ' on' : ''}" role="checkbox" aria-checked="${on}" onclick="MSSNotifSettings._tick(${attrJSON(f.id)}, this)">
          ${av(f)}<span class="ns-pick-name" translate="no">@${escHTML(f.username)}${f.friend ? '' : ' <small class="ns-pick-tag">Follower</small>'}</span><span class="ns-pick-box" aria-hidden="true">${on ? icon('check', 13) : ''}</span></button>`;
    }).join('') || '<div class="ns-pick-none">Nobody matches.</div>';
  }
  function tick(id, btn) {
    const on = !picking.sel.has(id);
    on ? picking.sel.add(id) : picking.sel.delete(id);
    btn.classList.toggle('on', on); btn.setAttribute('aria-checked', on);
    btn.querySelector('.ns-pick-box').innerHTML = on ? icon('check', 13) : '';
  }
  function close() { panel?.closeNow(); }
  async function done() {
    if (!picking) return;
    const k = picking.k;
    st(k).ex = friends.filter(f => picking.sel.has(f.id)).map(f => f.id);
    picking = null; close(); draw();
    document.querySelector(`#ns-${k} .ns-who-btn`)?.focus();
    await save(k);
  }
  function clear() { if (!picking) return; picking.sel.clear(); list(); }
  return { render, ready, tab, loaded: () => loaded, isOn: k => !off.has(k), setOn, name: recName,
    _aud: setAudience, _get: setGet, _group: setGroup, _toggle: toggle, _alerts: alerts,
    _pick: pick, _list: list, _tick: tick, _close: close, _done: done, _clear: clear };
})();
