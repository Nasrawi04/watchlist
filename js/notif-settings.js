/* ═══════════════════════════════════════════════════════════════
   notif-settings.js — Notification settings (notifications.html?tab=settings)

   Two cards:
     Alerts           — "New notification alerts" (mssNotifPopupsOn / mssSetNotifPopups, nav.js),
                        the same switch as Settings → Notifications
     Activity Sharing — what your friends get notified about when you do it (072).
                        One switch per activity, all on by default. Under each:
                          on  → "Hide from…"    those friends don't get it
                          off → "Only send to…" just those friends still do
                        Saved straight away (set_activity_pref); the database checks
                        every notification against it. Notifications only — Friends
                        Activity still shows what you watch.
   MSSNotifSettings.render(el) draws it into el.
═══════════════════════════════════════════════════════════════ */
const NS_KINDS = [
  ['started',   'Started watching',   'When you start a movie or show'],
  ['episodes',  'Episodes',           'Each episode you watch — a run of them counts as one'],
  ['finished',  'Finished',           'When you finish something or catch up on a show'],
  ['rated',     'Rated something',    'The first time you score a title'],
  ['note',      'Wrote a note',       'When a title gets your note'],
  ['watchlist', 'Added to watchlist', 'New titles on your Watchlist or Up Next'],
  ['dropped',   'Dropped',            'When you drop a show or movie'],
  ['list',      'Made a list',        'A new list (not private-link lists)'],
  ['poll',      'Posted a poll',      'Goes to all your friends, not only the ones with your bell on'],
];

const MSSNotifSettings = (() => {
  let el = null, prefs = {}, friends = [], picking = null, ov = null, loaded = false;
  const st = k => prefs[k] || (prefs[k] = { on: true, ex: [] });
  const fr = id => friends.find(f => f.id === id);
  const kindName = k => NS_KINDS.find(x => x[0] === k)[1];
  const av = f => `<span class="ns-av" aria-hidden="true">${safeURL(f?.avatar_url) ? `<img src="${safeURL(f.avatar_url)}" alt="">` : escHTML(((f?.username || '?')[0]).toUpperCase())}</span>`;

  async function render(target) {
    el = target;
    el.innerHTML = `<div class="ns-wrap">
        <section class="ns-card" aria-labelledby="nsAlertsT">
          <div class="ns-title" id="nsAlertsT">Alerts</div>
          <div class="push-row">
            <div class="push-text"><div class="push-name" id="nsPopL">New notification alerts</div>
              <div class="push-sub" id="nsPopS">Ring the bell and show a short alert at the bottom of the screen when something new arrives. When off, you'll only see the count on the bell.</div></div>
            <button type="button" class="push-switch" id="nsPopSw" role="switch" aria-checked="${mssNotifPopupsOn()}" aria-labelledby="nsPopL" aria-describedby="nsPopS" onclick="MSSNotifSettings._alerts()"><span aria-hidden="true"></span></button>
          </div>
        </section>
        <section class="ns-card" aria-labelledby="nsShareT">
          <div class="ns-title" id="nsShareT">Activity Sharing</div>
          <p class="ns-desc">Choose what your friends get notified about. Only friends who turned on notifications for you get these — and Friends Activity still shows what you watch.</p>
          <div id="nsShareList"><div class="ns-loading">Loading…</div></div>
        </section>
      </div>`;
    if (!loaded) {
      try { await load(); loaded = true; }
      catch (err) { console.error(err); document.getElementById('nsShareList').innerHTML = '<div class="ns-loading">Couldn’t load these — try again later.</div>'; return; }
    }
    draw();
  }
  async function load() {
    const me = window._navUser?.id || (await getCurrentUser()).id;
    const [p, x, f] = await Promise.all([
      sb.from('activity_prefs').select('kind, is_on').eq('user_id', me).then(r => { if (r.error) throw r.error; return r.data || []; }),
      sb.from('activity_pref_exceptions').select('kind, friend_id').eq('user_id', me).then(r => { if (r.error) throw r.error; return r.data || []; }),
      getFriendships(me).then(r => r.filter(z => z.status === 'accepted')),
    ]);
    friends = f.map(z => ({ id: z.friendId, username: z.friendProfile?.username || 'friend', avatar_url: z.friendProfile?.avatar_url || null }))
      .sort((a, b) => a.username.localeCompare(b.username));
    prefs = {};
    p.forEach(r => { st(r.kind).on = r.is_on; });
    x.forEach(r => { if (fr(r.friend_id)) st(r.kind).ex.push(r.friend_id); });    // ex-friends drop out
  }

  function rowHTML([k, name, sub]) {
    const s = st(k), n = s.ex.length;
    const btn = s.on ? (n ? `Hidden from ${n}` : 'Hide from…') : (n ? `Only to ${n}` : 'Only send to…');
    const note = s.on ? (n ? 'These friends won’t get it' : 'All your friends with notifications on for you')
                      : (n ? 'Only these friends get it' : 'Off — nobody gets it');
    return `<div class="ns-row" id="ns-${k}">
        <div class="push-row">
          <div class="push-text"><div class="push-name" id="nsL-${k}">${name}</div><div class="push-sub" id="nsS-${k}">${sub}</div></div>
          <button type="button" class="push-switch" role="switch" aria-checked="${s.on}" aria-labelledby="nsL-${k}" aria-describedby="nsS-${k}" onclick="MSSNotifSettings._toggle('${k}')"><span aria-hidden="true"></span></button>
        </div>
        ${friends.length ? `<div class="ns-who">
          <button type="button" class="ns-who-btn${n ? ' has' : ''}" onclick="MSSNotifSettings._pick('${k}')">${icon('users', 13)} ${btn}</button>
          <span class="ns-who-note">${note}</span>
          ${n ? `<div class="ns-chips">${s.ex.map(id => `<span class="ns-chip" translate="no">${av(fr(id))}@${escHTML(fr(id)?.username || '')}</span>`).join('')}</div>` : ''}
        </div>` : ''}
      </div>`;
  }
  function draw() { const l = document.getElementById('nsShareList'); if (l) l.innerHTML = NS_KINDS.map(rowHTML).join(''); }
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
            <input type="search" id="nsPickQ" class="fav-picker-search-input" autocomplete="off" placeholder="Search your friends…" aria-label="Search your friends" oninput="MSSNotifSettings._list()">
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
    o.querySelector('#nsPickHint').textContent = s.on ? 'Tick the friends who shouldn’t get this.' : 'This is off — tick the friends who should still get it.';
    o.querySelector('#nsPickQ').value = '';
    list();
    MSSDialog.open(o, { focus: '#nsPickQ' });
  }
  function list() {
    const q = (document.getElementById('nsPickQ').value || '').trim().toLowerCase();
    const rows = friends.filter(f => !q || f.username.toLowerCase().includes(q));
    document.getElementById('nsPickList').innerHTML = rows.map(f => {
      const on = picking.sel.has(f.id);
      return `<button type="button" class="ns-pick-row${on ? ' on' : ''}" role="checkbox" aria-checked="${on}" onclick="MSSNotifSettings._tick(${attrJSON(f.id)}, this)">
          ${av(f)}<span class="ns-pick-name" translate="no">@${escHTML(f.username)}</span><span class="ns-pick-box" aria-hidden="true">${on ? icon('check', 13) : ''}</span></button>`;
    }).join('') || '<div class="ns-pick-none">No friends match.</div>';
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
  return { render, _toggle: toggle, _alerts: alerts, _pick: pick, _list: list, _tick: tick, _close: close, _done: done, _clear: clear };
})();
