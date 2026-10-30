/* ═══════════════════════════════════════════════════════════════
   follows.js — Followers · Following · Friends (083_follows_private_accounts.sql)
   You follow people; when you follow each other you're friends. A private
   account's followers are let in one at a time (follow requests).

   MSSFollow.countsHTML(state, userId, username, own)  the "12 Followers · 30 Following · 8 Friends" row — each opens friends.html?people=…
   MSSFollow.open(userId, kind, name, own)         the list popup (kind: followers | following | friends | requests)
   MSSFollow.rowHTML(p, ctx)                        one person: avatar, name, the right button
   MSSFollow.btnLabel(rel)                          'Follow' / 'Follow back' / 'Requested' / 'Following' / 'Friends'
   MSSFollow.tap(userId, rel, opts)                 follow / unfollow / cancel (asks first before unfollowing)

   Uses db.js: followUser, unfollowUser, respondFollowRequest, removeFollower,
   getFollowList, followRelation. Pages listen for 'mss:follows-changed'.
═══════════════════════════════════════════════════════════════ */
const MSSFollow = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const nameOf = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 40) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av fl-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const fmt = n => Number(n || 0).toLocaleString(MSSI18n?.locale);
  const KINDS = [['followers', 'Followers'], ['following', 'Following'], ['friends', 'Friends']];

  function btnLabel(rel) {
    return rel === 'friends' ? `${icon('check', 13)} Friends` : rel === 'following' ? `${icon('check', 13)} Following`
      : rel === 'requested' ? 'Requested' : rel === 'follows_you' ? `${icon('plus', 13)} Follow back` : `${icon('plus', 13)} Follow`;
  }
  const btnCls = rel => rel === 'friends' || rel === 'following' ? 'on' : rel === 'requested' ? 'pending' : 'add';

  /* ── The counts row ── */
  function countsHTML(st, userId, name, own) {
    if (!st) return '';
    const open = own || st.can_see;
    return `<div class="fl-counts" role="group" aria-label="Followers, following and friends">${KINDS.map(([k, l]) => {
      const inner = `<b>${fmt(st[k])}</b><span>${Number(st[k]) === 1 && k !== 'following' ? l.slice(0, -1) : l}</span>`;
      // → the Social page on just that list (friends.html?people=…)
      const href = `friends.html?people=${k}${own ? '' : `&of=${encodeURIComponent(userId)}&u=${encodeURIComponent(name || '')}`}`;
      return open ? `<a class="fl-count" href="${href}">${inner}</a>`
        : `<span class="fl-count">${inner}</span>`;
    }).join('')}</div>`;
  }

  /* ── One person in a list ── */
  // ctx: { kind, own } — your own followers get a Remove; your requests get Accept / Decline
  function rowHTML(p, ctx = {}) {
    const me = window._navUser?.id || null;
    const id = attrJSON(p.id), rel = followRelation(p);
    let act = '';
    if (ctx.kind === 'requests') act = `<button type="button" class="fm-btn fm-btn-primary" onclick="MSSFollow._respond(${id}, true, this)">Accept</button>
        <button type="button" class="fm-btn" onclick="MSSFollow._respond(${id}, false, this)">Decline</button>`;
    else if (p.id !== me) act = `<button type="button" class="fl-btn ${btnCls(rel)}" onclick="MSSFollow._tapRow(${id}, this)">${btnLabel(rel)}</button>`;
    if (ctx.own && (ctx.kind === 'followers' || ctx.kind === 'friends')) act += `<button type="button" class="fm-icon-btn fm-danger" title="Remove follower" aria-label="Remove @${esc(p.username)} from your followers" onclick="MSSFollow._remove(${id}, this)">${icon('x', 13)}</button>`;
    return `<div class="fl-row" data-id="${esc(p.id)}">
      <button type="button" class="fl-who" onclick="MSSFollow._view(${id}, ${attrJSON(p.username || '')})">${av(p, 42)}
        <span><b translate="no">${esc(nameOf(p))}</b><small>${p.display_name ? '@' + esc(p.username) : ''}${p.is_private ? ` ${icon('lock', 11)}` : ''}${rel === 'follows_you' && ctx.kind !== 'requests' && ctx.kind !== 'back' ? `<em>Follows you</em>` : ''}</small></span></button>
      <div class="fl-acts">${act}</div></div>`;
  }

  /* ── Follow / unfollow from anywhere ── */
  async function tap(userId, rel, o = {}) {
    if (rel === 'following' || rel === 'friends' || rel === 'requested') {
      const who = o.username ? '@' + o.username : 'them';
      const ok = rel === 'requested' ? true : await showConfirm({
        title: `Unfollow ${who}?`,
        message: rel === 'friends' ? 'You’ll stop being friends — Movie Nights, shared lists and Friends-only things stop showing for each other.' : 'Their updates stop showing for you.',
        confirmText: 'Unfollow', iconName: 'users' });
      if (!ok) return null;
      await unfollowUser(userId);
      if (rel === 'requested') showToast('Request cancelled');
      changed(userId);
      return 'none';
    }
    const r = await followUser(userId);
    showToast(r === 'requested' ? 'Request sent — they’ll let you in' : rel === 'follows_you' ? 'You’re friends now!' : 'Following');
    changed(userId);
    return r;
  }
  const changed = id => { try { localStorage.setItem('mss_data_at', String(Date.now())); } catch {} document.dispatchEvent(new CustomEvent('mss:follows-changed', { detail: { id } })); };

  /* ── The list popup ── */
  let L = null;   // { userId, kind, name, own, items, offset, more, busy }
  function popupShell() {
    let ov = document.getElementById('flPop');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'flPop'; ov.className = 'soc-overlay';
    ov.innerHTML = `<div class="soc-card fl-card" role="dialog" aria-modal="true" aria-labelledby="flPopTitle">
        <div class="sf-header"><div class="sf-title" id="flPopTitle"></div>
          <button type="button" class="sf-close" aria-label="Close" onclick="MSSFollow.close()">${icon('x', 18)}</button></div>
        <div class="fl-tabs" id="flTabs" role="tablist"></div>
        <div class="sf-body fl-body" id="flBody"></div></div>`;
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
    return ov;
  }
  function open(userId, kind, name, own, reqCount) {
    L = { userId, kind, name, own: !!own, items: [], offset: 0, more: false, busy: false, req: reqCount || 0 };
    const ov = popupShell();
    document.getElementById('flPopTitle').textContent = own ? 'Your people' : (name || 'People');
    MSSDialog.open(ov, { focus: '.fl-tab.active' });
    load(kind);
  }
  function close() { MSSDialog.close(document.getElementById('flPop')); L = null; }
  function tabs() {
    const list = KINDS.concat(L.own && L.req ? [['requests', 'Requests']] : []);
    document.getElementById('flTabs').innerHTML = list.map(([k, l]) =>
      `<button type="button" role="tab" class="fl-tab${L.kind === k ? ' active' : ''}" aria-selected="${L.kind === k}" onclick="MSSFollow._tab('${k}')">${l}${k === 'requests' ? ` <span class="fr-tab-dot">${L.req}</span>` : ''}</button>`).join('');
  }
  async function load(kind, more) {
    if (!L) return;
    if (!more) { L.kind = kind; L.items = []; L.offset = 0; }
    tabs();
    const body = document.getElementById('flBody');
    if (!more) body.innerHTML = `<div class="page-loading" style="padding:2rem"><div class="spinner"></div></div>`;
    L.busy = true;
    let got = [];
    try { got = await getFollowList(L.userId, L.kind, L.offset); } catch { body.innerHTML = `<div class="fl-empty">Couldn’t load this — try again.</div>`; L.busy = false; return; }
    if (!L || L.kind !== kind) return;
    L.busy = false; L.items = L.items.concat(got); L.offset += got.length; L.more = got.length === 60;
    draw();
  }
  function draw() {
    const body = document.getElementById('flBody'); if (!body || !L) return;
    const empty = { followers: L.own ? 'No followers yet — share your profile and they’ll come.' : 'No followers yet.',
      following: L.own ? 'You’re not following anyone yet. Find people on the Social page.' : 'Not following anyone yet.',
      friends: L.own ? 'No friends yet — when you and someone follow each other, you’re friends.' : 'No friends yet.',
      requests: 'No requests waiting.' }[L.kind];
    body.innerHTML = L.items.length
      ? `<div class="fl-list">${L.items.map(p => rowHTML(p, { kind: L.kind, own: L.own })).join('')}</div>`
        + (L.more ? `<button type="button" class="rec-btn fl-more" onclick="MSSFollow._more()">Show more</button>` : '')
      : `<div class="fl-empty">${esc(empty)}</div>`;
  }
  const find = id => L?.items.find(x => x.id === id);
  async function tapRow(id, btn) {
    const p = find(id) || { id, i_follow: btn.classList.contains('on') ? 'accepted' : 'none', follows_me: 'none' };
    btn.disabled = true;
    try {
      const r = await tap(id, followRelation(p), { username: p.username });
      if (r != null) {
        p.i_follow = r === 'following' ? 'accepted' : r === 'requested' ? 'pending' : 'none';
        const rel = followRelation(p);
        btn.className = `fl-btn ${btnCls(rel)}`; btn.innerHTML = btnLabel(rel);
      }
    } catch (err) { showToast(err?.hint || 'Something went wrong — try again.', 'err'); }
    btn.disabled = false;
  }
  async function respond(id, ok, btn) {
    const row = btn.closest('.fl-row'); row.style.opacity = '.5';
    try {
      await respondFollowRequest(id, ok);
      showToast(ok ? 'Accepted — they follow you now' : 'Request declined');
      if (L) { L.items = L.items.filter(x => x.id !== id); L.req = Math.max(0, L.req - 1); draw(); tabs(); }
      changed(id);
    } catch { row.style.opacity = ''; showToast('Something went wrong — try again.', 'err'); }
  }
  async function remove(id, btn) {
    const p = find(id);
    const ok = await showConfirm({ title: 'Remove this follower?', message: `@${p?.username || ''} won’t be told. They stop following you${p?.i_follow === 'accepted' ? ' — and you stop being friends' : ''}.`, confirmText: 'Remove', iconName: 'users' });
    if (!ok) return;
    try { await removeFollower(id); if (L) { L.items = L.items.filter(x => x.id !== id); draw(); } changed(id); showToast('Removed'); }
    catch { showToast('Something went wrong — try again.', 'err'); }
  }
  function view(id, username) {
    sessionStorage.setItem('viewProfileId', id); sessionStorage.setItem('viewProfileUsername', username);
    location.href = 'profile-view.html';
  }

  return { countsHTML, rowHTML, btnLabel, btnCls, tap, open, close,
    _tab: k => load(k), _more: () => L && !L.busy && load(L.kind, true), _tapRow: tapRow, _respond: respond, _remove: remove, _view: view };
})();
