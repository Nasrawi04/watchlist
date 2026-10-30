/* ═══════════════════════════════════════════════════════════════
   notif-settings.js — Notification settings (notifications.html?tab=settings)

   Two sections (084):
     Receiving — what you get
       • Alerts — "New notification alerts" (mssNotifPopupsOn / mssSetNotifPopups, nav.js),
         the same switch as Settings → Notifications
       • One switch per kind of notification (profiles.notif_off, set_notif_receive).
         Follow requests always arrive.
     Sending — who hears about what you do
       • Who: Friends & followers · Friends only · No one (profiles.activity_audience,
         set_activity_audience). Activity pings go to people in it who turned on
         "Notify me" for you; polls go to everyone in it.
       • One switch per activity, all on by default (072). Under each:
           on  → "Hide from…"    those people don't get it
           off → "Only send to…" just those people still do
         Saved straight away (set_activity_pref); the database checks every
         notification against all of this. Friends Activity still shows what you watch.
   MSSNotifSettings.render(el) draws it into el.
═══════════════════════════════════════════════════════════════ */
const NS_RECEIVE = [
  ['releases',     'New releases',          'New episodes and releases of titles in your library'],
  ['activity',     'Activity from people',  'What people you turned “Notify me” on for are watching'],
  ['followers',    'New followers',         'Someone follows you, or accepts your follow request'],
  ['comments',     'Comments & replies',    'On your titles, notes, lists and comments'],
  ['likes',        'Likes',                 'On your notes, lists and replies'],
  ['polls',        'Polls',                 'New polls from people you follow, and comments on yours'],
  ['inbox',        'Inbox',                 'Titles and lists sent to you, and replies'],
  ['lists',        'List invites',          'Invites to collaborate on a list, and answers to yours'],
  ['movie_night',  'Movie Night',           'Invites, picks, changes and reminders'],
  ['challenges',   'Challenges',            'Invites and finishes'],
  ['episode_chat', 'Episode chat',          'Replies in episode chats you’re in'],
  ['achievements', 'Medals',                'When you earn a medal'],
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
  let el = null, prefs = {}, friends = [], picking = null, ov = null, loaded = false;
  let audience = 'followers', off = new Set(), me = null;   // sending: who · receiving: kinds switched off (084)
  const st = k => prefs[k] || (prefs[k] = { on: true, ex: [] });
  const fr = id => friends.find(f => f.id === id);
  const kindName = k => NS_KINDS.find(x => x[0] === k)[1];
  const av = f => `<span class="ns-av" aria-hidden="true">${safeURL(f?.avatar_url) ? `<img src="${safeURL(f.avatar_url)}" alt="">` : escHTML(((f?.username || '?')[0]).toUpperCase())}</span>`;

  async function render(target) {
    el = target;
    el.innerHTML = `<div class="ns-wrap">
        <div class="ns-sec-head"><span class="ns-sec-ic">${icon('bell', 15)}</span><div><div class="ns-sec-title">Receiving</div><div class="ns-sec-sub">What you get notified about</div></div></div>
        <section class="ns-card" aria-labelledby="nsAlertsT">
          <div class="ns-title" id="nsAlertsT">Alerts</div>
          <div class="push-row">
            <div class="push-text"><div class="push-name" id="nsPopL">New notification alerts</div>
              <div class="push-sub" id="nsPopS">Ring the bell and show a short alert at the bottom of the screen when something new arrives. When off, you'll only see the count on the bell.</div></div>
            <button type="button" class="push-switch" id="nsPopSw" role="switch" aria-checked="${mssNotifPopupsOn()}" aria-labelledby="nsPopL" aria-describedby="nsPopS" onclick="MSSNotifSettings._alerts()"><span aria-hidden="true"></span></button>
          </div>
        </section>
        <section class="ns-card" aria-labelledby="nsGetT">
          <div class="ns-title" id="nsGetT">Notify me about</div>
          <p class="ns-desc">Switch off anything you don’t want. Follow requests always come through.</p>
          <div id="nsGetList"><div class="ns-loading">Loading…</div></div>
        </section>
        <div class="ns-sec-head"><span class="ns-sec-ic">${icon('share', 15)}</span><div><div class="ns-sec-title">Sending</div><div class="ns-sec-sub">Who hears about what you do</div></div></div>
        <section class="ns-card" aria-labelledby="nsWhoT">
          <div class="ns-title" id="nsWhoT">Who gets notified</div>
          <p class="ns-desc">Your account can be public without everyone being pinged about what you watch. Only people who turned on “Notify me” for you get your activity; polls go to everyone you pick here.</p>
          <div id="nsWho"></div>
        </section>
        <section class="ns-card" aria-labelledby="nsShareT">
          <div class="ns-title" id="nsShareT">What they hear about</div>
          <p class="ns-desc">Choose which of your activities send a notification. Friends Activity still shows what you watch.</p>
          <div id="nsShareList"><div class="ns-loading">Loading…</div></div>
        </section>
      </div>`;
    if (!loaded) {
      try { await load(); loaded = true; }
      catch (err) { console.error(err); ['nsShareList', 'nsGetList'].forEach(i => { document.getElementById(i).innerHTML = '<div class="ns-loading">Couldn’t load these — try again later.</div>'; }); return; }
    }
    draw();
  }
  async function load() {
    me = window._navUser?.id || (await getCurrentUser()).id;
    const [p, x, f, fo, prof] = await Promise.all([
      sb.from('activity_prefs').select('kind, is_on').eq('user_id', me).then(r => { if (r.error) throw r.error; return r.data || []; }),
      sb.from('activity_pref_exceptions').select('kind, friend_id').eq('user_id', me).then(r => { if (r.error) throw r.error; return r.data || []; }),
      getFriendships(me).then(r => r.filter(z => z.status === 'accepted')),
      typeof getFollowList === 'function' ? getFollowList(me, 'followers').catch(() => []) : [],
      sb.from('profiles').select('activity_audience, notif_off').eq('id', me).maybeSingle().then(r => r.data || {}, () => ({})),
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
  }

  function rowHTML([k, name, sub]) {
    const s = st(k), n = s.ex.length;
    const btn = s.on ? (n ? `Hidden from ${n}` : 'Hide from…') : (n ? `Only to ${n}` : 'Only send to…');
    const note = s.on ? (n ? 'These people won’t get it' : 'Everyone in your audience with notifications on for you')
                      : (n ? 'Only these people get it' : 'Off — nobody gets it');
    return `<div class="ns-row" id="ns-${k}">
        <div class="push-row">
          <div class="push-text"><div class="push-name" id="nsL-${k}">${name}</div><div class="push-sub" id="nsS-${k}">${sub}</div></div>
          <button type="button" class="push-switch" role="switch" aria-checked="${s.on}" aria-labelledby="nsL-${k}" aria-describedby="nsS-${k}" onclick="MSSNotifSettings._toggle('${k}')"><span aria-hidden="true"></span></button>
        </div>
        ${pickable().length ? `<div class="ns-who">
          <button type="button" class="ns-who-btn${n ? ' has' : ''}" onclick="MSSNotifSettings._pick('${k}')">${icon('users', 13)} ${btn}</button>
          <span class="ns-who-note">${note}</span>
          ${n ? `<div class="ns-chips">${s.ex.map(id => `<span class="ns-chip" translate="no">${av(fr(id))}@${escHTML(fr(id)?.username || '')}</span>`).join('')}</div>` : ''}
        </div>` : ''}
      </div>`;
  }
  // who can be picked right now: friends always; followers only while your audience includes them
  const pickable = () => friends.filter(f => f.friend || audience === 'followers');
  function draw() {
    const l = document.getElementById('nsShareList');
    if (l) { l.innerHTML = NS_KINDS.map(rowHTML).join(''); l.classList.toggle('ns-muted', audience === 'nobody'); l.toggleAttribute('inert', audience === 'nobody'); }
    const w = document.getElementById('nsWho');
    if (w) w.innerHTML = `<div class="pn-toggle ns-aud" role="radiogroup" aria-labelledby="nsWhoT">${NS_AUDIENCE.map(([k, l2, ic]) =>
        `<button type="button" class="pn-toggle-btn${audience === k ? ' active' : ''}" role="radio" aria-checked="${audience === k}" onclick="MSSNotifSettings._aud('${k}')">${icon(ic, 13)} ${l2}</button>`).join('')}</div>
      <p class="ns-aud-note">${audience === 'followers' ? 'Anyone who follows you can turn on notifications for you. Your polls go to all your followers.'
        : audience === 'friends' ? 'Only people you follow back (your friends) can get notified. Followers can’t turn notifications on for you.'
        : 'Nobody gets notified about what you do — not even your polls. Friends Activity still shows it.'}</p>`;
    const g = document.getElementById('nsGetList');
    if (g) g.innerHTML = NS_RECEIVE.map(([k, name, sub]) => `<div class="ns-row ns-row-get"><div class="push-row">
        <div class="push-text"><div class="push-name" id="nsG-${k}">${name}</div><div class="push-sub" id="nsGS-${k}">${sub}</div></div>
        <button type="button" class="push-switch" role="switch" aria-checked="${!off.has(k)}" aria-labelledby="nsG-${k}" aria-describedby="nsGS-${k}" onclick="MSSNotifSettings._get('${k}', this)"><span aria-hidden="true"></span></button>
      </div></div>`).join('');
  }
  async function setAudience(k) {
    if (k === audience) return;
    const prev = audience; audience = k; draw();
    const { error } = await sb.rpc('set_activity_audience', { p_audience: k });
    if (error) { audience = prev; draw(); showToast('Couldn’t save that — try again.', 'err'); return; }
    // followers picked in "hide from / only send to" no longer apply under Friends only / No one — the database ignores them anyway
    showToast(k === 'followers' ? 'Friends and followers can get your notifications.' : k === 'friends' ? 'Only your friends can get your notifications.' : 'Nobody gets notified about what you do.');
  }
  async function setGet(k, btn) {
    const on = off.has(k);       // was off → turning on
    on ? off.delete(k) : off.add(k);
    btn.setAttribute('aria-checked', on);
    const { error } = await sb.rpc('set_notif_receive', { p_group: k, p_on: on });
    if (error) { on ? off.add(k) : off.delete(k); btn.setAttribute('aria-checked', !on); showToast('Couldn’t save that — try again.', 'err'); }
  }
  async function save(k) {
    const s = st(k);
    const { error } = await sb.rpc('set_activity_pref', { p_kind: k, p_on: s.on, p_except: s.ex });
    if (error) { console.error(error); showToast('Couldn’t save that — try again.', 'err'); await load().catch(() => {}); draw(); }
  }
  // flipping a switch flips who the picked friends are for — so they're cleared
  async function toggle(k) {
    const s = st(k), had = s.ex.length;
    s.on = !s.on; s.ex = [];
    draw();
    document.querySelector(`#ns-${k} .push-switch`)?.focus();
    await save(k);
    if (had) showToast(s.on ? `${kindName(k)} is on for everyone again.` : `${kindName(k)} is off for everyone.`);
  }
  function alerts() {
    const on = !mssNotifPopupsOn();
    mssSetNotifPopups(on);
    document.getElementById('nsPopSw')?.setAttribute('aria-checked', on);
    showToast(on ? 'Notification alerts on.' : 'Alerts off — new notifications will just show on the bell.');
  }

  /* the friend picker */
  function overlay() {
    if (ov) return ov;
    ov = document.createElement('div');
    ov.className = 'soc-overlay'; ov.id = 'nsPickOverlay';
    ov.innerHTML = `<div class="soc-card ns-pick-card" role="dialog" aria-modal="true" aria-labelledby="nsPickTitle">
        <div class="sf-header"><div class="sf-title" id="nsPickTitle"></div>
          <button type="button" class="sf-close" aria-label="Close" onclick="MSSNotifSettings._close()">${icon('x', 18)}</button></div>
        <div class="ns-pick-body">
          <p class="ns-pick-hint" id="nsPickHint"></p>
          <div class="fav-picker-search-wrap ls-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" id="nsPickQ" class="fav-picker-search-input" autocomplete="off" placeholder="Search people…" aria-label="Search your friends and followers" oninput="MSSNotifSettings._list()">
          </div>
          <div class="ns-pick-list" id="nsPickList" role="group" aria-labelledby="nsPickTitle"></div>
        </div>
        <div class="sf-footer">
          <button type="button" class="sf-clear-btn" onclick="MSSNotifSettings._clear()">Clear</button>
          <button type="button" class="sf-apply-btn" onclick="MSSNotifSettings._done()">Done</button>
        </div>
      </div>`;
    MSSDialog.bind(ov, () => close());
    document.body.appendChild(ov);
    attachClearButton('nsPickQ');
    return ov;
  }
  function pick(k) {
    const o = overlay(), s = st(k);
    picking = { k, sel: new Set(s.ex) };
    o.querySelector('#nsPickTitle').textContent = s.on ? `${kindName(k)}: hide from…` : `${kindName(k)}: only send to…`;
    o.querySelector('#nsPickHint').textContent = s.on ? 'Tick the people who shouldn’t get this.' : 'This is off — tick the people who should still get it.';
    o.querySelector('#nsPickQ').value = '';
    list();
    MSSDialog.open(o, { focus: '#nsPickQ' });
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
  function close() { if (ov) MSSDialog.close(ov); picking = null; }
  async function done() {
    if (!picking) return;
    const k = picking.k;
    st(k).ex = friends.filter(f => picking.sel.has(f.id)).map(f => f.id);
    close(); draw();
    document.querySelector(`#ns-${k} .ns-who-btn`)?.focus();
    await save(k);
  }
  function clear() { if (!picking) return; picking.sel.clear(); list(); }
  return { render, _aud: setAudience, _get: setGet, _toggle: toggle, _alerts: alerts, _pick: pick, _list: list, _tick: tick, _close: close, _done: done, _clear: clear };
})();
