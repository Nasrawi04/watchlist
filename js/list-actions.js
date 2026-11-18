/* ══════════════════════════════════════════════════════════════
   list-actions.js — what you can do with a list (Lists redesign), one copy for the Lists page,
   the list page and the profile Lists tabs:

     MSSListActions.menu(button, list, { own, shared, resolve, onDeleted, onLeft, onForked })
       → the ⋯ (MSSPopover — a full action page on phones):
         yours        Edit list · Share · Invite collaborators · Export · Delete list…
         shared w/ you Edit list · Share · Export · Leave list…
         someone else's Share · Add to my lists · Report
     MSSListActions.share(list) · exportList(list) · collab(list, then) · remove(list) · leave(list)
     MSSListActions.fork(list, resolve) → a copy in your Lists (forked_from) — resolves true when made
     MSSListActions.editURL(list) / newURL() → the editor (the list page in edit mode)

   The collaborator panel (invite link + your friends) moved here from lists.html.
   Requires config.js, db.js (getFriendships, getEntries), nav.js; panel.js and the export
   scripts are loaded when needed.
══════════════════════════════════════════════════════════════ */
const MSSListActions = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const me = () => window._navUser?.id || null;
  const editURL = list => `list-view.html?list=${encodeURIComponent(list.id)}&edit=1`;
  const newURL = () => 'list-view.html?new=1';
  // Social → Recommendations; a Friends / Private list (068) is only sent on by its owner
  const canShare = list => !!me() && (!list.cat || list.cat === 'custom') && (list.visibility === 'anyone' || list.user_id === me());

  async function menu(btn, list, o = {}) {
    await mssLoadScript('js/panel.js');
    const items = [], add = (label, ic, fn, danger) => items.push({ label, icon: ic, onSelect: fn, danger });
    if (o.own) {
      add('Edit list', 'edit', () => { location.href = editURL(list); });
      if (canShare(list)) add('Share', 'send', () => share(list));
      add('Invite collaborators', 'users', () => collab(list, o.onChange));
      add('Export', 'download', () => exportList(list));
      items.push({ divider: true });
      add('Delete list…', 'trash', async () => { if (await remove(list)) o.onDeleted?.(list); }, true);
    } else if (o.shared) {
      add('Edit list', 'edit', () => { location.href = editURL(list); });
      if (canShare(list)) add('Share', 'send', () => share(list));
      add('Export', 'download', () => exportList(list));
      items.push({ divider: true });
      add('Leave list…', 'x', async () => { if (await leave(list)) o.onLeft?.(list); }, true);
    } else {
      if (canShare(list)) add('Share', 'send', () => share(list));
      add('Add to my lists', 'plus', async () => { if (await fork(list, o.resolve)) o.onForked?.(list); });
      if (me() && list.user_id !== me() && !list.official) add('Report', 'flag', () => mssReport('list', list.id));
    }
    return MSSPopover.open(btn, { title: list.title, label: 'List actions', items });
  }

  function share(list) {
    if (mssGuestGate('share lists')) return;
    mssRecommend({ kind: 'list', list_id: list.id, title: list.title, count: (list.items || []).length });
  }

  // The Export Studio with this list already picked — its scripts load the first time
  const EXPORT = ['js/vendor/jspdf-2.5.1.umd.min.js', 'js/export.js', 'js/taste-profile.js', 'js/year-review.js', 'js/export-formats.js', 'js/export-image.js', 'js/export-studio.js'];
  async function exportList(list) {
    if (mssGuestGate('export lists')) return;
    for (const src of EXPORT) await mssLoadScript(src);
    const p = window._navUserProfile || {};
    MSSStudio.open({ who: { name: p.display_name || p.username || '', username: p.username || '', avatar_url: p.avatar_url || '' },
      preset: { what: 'list', list: { id: list.id, title: list.title, description: list.description, items: list.items || [], ranked: !!list.ranked,
        owner: list.profiles?.username || list._owner?.username, mine: list.user_id === me() } },
      load: () => getEntries(me()) });
  }

  async function remove(list) {
    const ok = await showConfirm({ title: `Delete ${list.title}?`, message: 'This can’t be undone. Its titles stay in your library.', confirmText: 'Delete list', iconName: 'trash' });
    if (!ok) return false;
    try {
      const { error } = await sb.from('favorite_lists').delete().eq('id', list.id).eq('user_id', me());
      if (error) throw error;
      showToast('List deleted.');
      return true;
    } catch (e) { console.error('Delete list:', e); showToast('Couldn’t delete the list — try again.', 'err'); return false; }
  }

  async function leave(list) {
    const ok = await showConfirm({ title: 'Leave this list?', message: `You'll stop collaborating on “${list.title || 'this list'}”. The owner can invite you again.`, confirmText: 'Leave', iconName: 'x', danger: false });
    if (!ok) return false;
    try {
      const { error } = await sb.rpc('leave_list', { p_list_id: list.id });
      if (error) throw error;
      showToast('You left the list.');
      return true;
    } catch (e) { console.error(e); showToast('Could not leave — try again.', 'err'); return false; }
  }

  // A copy in your Lists: their titles become yours (your entry when you have the title, else the TMDB title)
  async function fork(list, resolve) {
    if (mssGuestGate('save lists') || !me()) return false;
    try {
      const { data: done } = await sb.from('favorite_lists').select('id').eq('user_id', me()).eq('forked_from', list.id).limit(1);
      if (done?.length) { showToast('It’s already in your Lists.'); return false; }
      const { data: mine } = await sb.from('entries').select('id, tmdb_id, tmdb_type').eq('user_id', me()).not('tmdb_id', 'is', null);
      const myByTmdb = Object.fromEntries((mine || []).map(e => [`${e.tmdb_type}:${e.tmdb_id}`, e.id]));
      const items = [];
      (list.items || []).forEach(id => {
        let next = id;
        if (MSSList.isTmdbId(id)) { const [, t, n] = id.split(':'); next = myByTmdb[`${t}:${n}`] || id; }
        else { const e = resolve?.(id); if (e?.tmdb_id && e?.tmdb_type) next = myByTmdb[`${e.tmdb_type}:${e.tmdb_id}`] || `tmdb:${e.tmdb_type}:${e.tmdb_id}`; }
        if (!items.includes(next)) items.push(next);
      });
      const { error } = await sb.from('favorite_lists').insert({ user_id: me(), cat: 'custom', genre: list.genre || '', title: list.title,
        description: list.description || null, items, ranked: list.ranked ?? null, forked_from: list.id });
      if (error) throw error;
      showToast('Added to your lists!');
      return true;
    } catch (err) {
      console.error('Add list:', err);
      showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t add that list — try again.', 'err');
      return false;
    }
  }

  /* ── Collaborators: a side panel S (full page on phones) — the invite link, then your friends ── */
  let C = null;   // { list, people: [{ user_id, status, profile }], friends, panel, then }
  async function collab(list, then) {
    if (!me() || list.user_id !== me()) return;
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: `Invite friends to “${list.title}”`, subtitle: 'Collaborate',
      body: `<div class="cp-link" id="collabLinkBox">
          <div class="cp-link-head"><span class="cp-link-ic">${icon('link', 15)}</span>
            <div><div class="cp-link-title">Invite link</div><div class="cp-link-sub">Anyone with the link can ask to join and add titles</div></div></div>
          <div class="cp-link-row">
            <input class="cp-link-input" id="collabLinkInput" readonly value="Creating link…" onclick="this.select()" aria-label="Invite link">
            <button class="cp-btn cp-invite" id="collabLinkCopy" onclick="MSSListActions._copyLink()" disabled>Copy</button>
          </div>
          <button class="cp-link-reset" onclick="MSSListActions._resetLink()">Reset link</button>
        </div>
        <div class="cp-divider"><span>or invite friends</span></div>
        <div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span><input class="lyr-field" type="text" id="collabSearch" placeholder="Search your friends…" aria-label="Search your friends" autocomplete="off" oninput="MSSListActions._draw()"></div>
        <div class="cp-list" id="collabList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`,
      footer: { primary: { label: 'Done', onClick: x => x.close() } },
      onClose: () => { if (C?.panel !== h) return; const next = C.then; C = null; if (next) setTimeout(next, 250); } });
    C = { list, people: [], friends: null, panel: h, then: then || null };
    const c = C;
    try {
      const [rows, fr] = await Promise.all([
        sb.from('list_collaborators').select('user_id, status').eq('list_id', list.id).neq('status', 'declined'),
        getFriendships(me()),
      ]);
      c.friends = (fr || []).filter(f => f.status === 'accepted' && f.friendProfile).map(f => f.friendProfile);
      c.people = rows.data || [];
    } catch { c.friends = c.friends || []; }
    if (C === c) { draw(); loadLink(); }
  }
  const linkURL = token => `${location.href.replace(/[^/]*$/, '')}list-view.html?list=${encodeURIComponent(C.list.id)}&join=${encodeURIComponent(token)}`;
  async function loadLink(reset) {
    const input = document.getElementById('collabLinkInput'), btn = document.getElementById('collabLinkCopy');
    if (!input || !C) return;
    input.value = reset ? 'Making a new link…' : 'Creating link…'; btn.disabled = true;
    try {
      const { data, error } = await sb.rpc(reset ? 'reset_list_join_token' : 'get_list_join_token', { p_list_id: C.list.id });
      if (error) throw error;
      input.value = linkURL(data); btn.disabled = false;
      if (reset) showToast('New link created — the old one no longer works.');
    } catch (e) { console.error(e); input.value = 'Could not create a link — try again.'; }
  }
  async function copyLink() {
    const url = document.getElementById('collabLinkInput').value, title = C?.list.title || 'my list';
    // Phones: the share sheet (Messages, WhatsApp…); otherwise copy
    if (navigator.share && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ title: `Join “${title}” on MyScreenFolio`, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); }
    catch { const i = document.getElementById('collabLinkInput'); i.select(); document.execCommand('copy'); }
    const btn = document.getElementById('collabLinkCopy');
    btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  }
  async function resetLink() {
    const ok = await showConfirm({ title: 'Reset invite link?', message: 'The current link will stop working. People who already joined stay on the list.', confirmText: 'Reset', iconName: 'refresh', danger: false });
    if (ok) loadLink(true);
  }
  function draw() {
    const wrap = document.getElementById('collabList');
    if (!wrap || !C) return;
    const q = (document.getElementById('collabSearch')?.value || '').trim().toLowerCase();
    if (!(C.friends || []).length) {
      wrap.innerHTML = `<div class="cp-empty">${icon('users', 28)}<div>You don't have any friends to invite yet.</div><a href="friends.html">Find friends →</a></div>`;
      return;
    }
    const friends = C.friends.filter(p => !q || (p.username || '').toLowerCase().includes(q) || (p.display_name || '').toLowerCase().includes(q));
    if (!friends.length) { wrap.innerHTML = `<div class="cp-empty">No friends match “${esc(q)}”.</div>`; return; }
    const status = Object.fromEntries(C.people.map(c => [c.user_id, c.status]));
    wrap.innerHTML = friends.map(p => {
      const st = status[p.id];
      const btn = st === 'accepted' ? `<button class="cp-btn cp-joined" onclick="MSSListActions._remove(${attrJSON(p.id)}, ${attrJSON(p.username)})" title="Remove from list">Joined ✓</button>`
        : st === 'pending' ? `<button class="cp-btn cp-sent" disabled>Invited</button>`
        : `<button class="cp-btn cp-invite" onclick="MSSListActions._invite(this, ${attrJSON(p.id)})">Invite</button>`;
      return `<div class="cp-row">${MSSList.avatarHTML(p, 'cp-av')}
        <div class="cp-who"><div class="cp-name" translate="no">${esc(p.display_name || p.username)}</div><div class="cp-user">@${esc(p.username)}</div></div>${btn}</div>`;
    }).join('');
  }
  async function invite(btn, userId) {
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const { data, error } = await sb.rpc('invite_to_list', { p_list_id: C.list.id, p_user_id: userId });
      if (error) throw error;
      C.people.push({ user_id: userId, status: data === 'accepted' ? 'accepted' : 'pending' });
      showToast('Invite sent!');
      draw();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Invite';
      showToast(isRateLimitError(e) ? RATE_LIMIT_MESSAGE : 'Could not send the invite — try again.', 'err');
      console.error(e);
    }
  }
  async function removePerson(userId, username) {
    if (!(await showConfirm({ title: 'Remove collaborator?', message: `@${username} won't be able to add titles to this list anymore.`, confirmText: 'Remove', iconName: 'x' }))) return;
    try {
      const { error } = await sb.rpc('remove_list_collaborator', { p_list_id: C.list.id, p_user_id: userId });
      if (error) throw error;
      C.people = C.people.filter(c => c.user_id !== userId);
      showToast(`Removed @${username}.`);
      draw();
    } catch (e) { showToast('Could not remove — try again.', 'err'); console.error(e); }
  }
  // Someone accepted or declined an invite (a live notification) → the open panel follows
  document.addEventListener('mss:notifications', async ev => {
    if (!C || !(ev.detail.arrived || []).some(n => n.type === 'list_invite_accepted' || n.type === 'list_invite_declined')) return;
    const { data } = await sb.from('list_collaborators').select('user_id, status').eq('list_id', C.list.id).neq('status', 'declined');
    if (C) { C.people = data || []; draw(); }
  });

  return { menu, share, exportList, collab, remove, leave, fork, editURL, newURL,
    _copyLink: copyLink, _resetLink: resetLink, _draw: draw, _invite: invite, _remove: removePerson };
})();
