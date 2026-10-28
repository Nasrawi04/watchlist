/* ═══════════════════════════════════════════════════════════════
   list-popup.js — List card + read-only list popup (v632)

   The Lists page's card design, shared by the Lists page, the Friends
   page's Lists tab and the Lists tab on profile.html / profile-view.html:

     MSSList.cardHTML(list, { resolve, onclick, ownerHTML, metaExtra, collabLine })
       → the lc-card: title + Ranked/Unranked pill, title count, optional
         owner / collaborators line, description and up to 5 posters
     MSSList.open(list, { resolve, owner, eyebrow, collabLine, manage, social })
       (social: someone else's list → like / dislike + "Add to My Lists")
       → the lp-* popup, read-only: posters (+N), View List, and on your
         own profile "Manage in Lists"
     MSSList.addTo(entry)
       → "Add to List" picker (ratings popup on Library / category pages):
         your lists — and lists shared with you — one under another as list
         cards; tap one to add the title (tap again to take it out). Ranked
         lists with a set order (Highest, A–Z…) re-sort themselves.
     MSSList.reorder(list, mode, resolve) → puts a list in its saved order (sort_mode)
     MSSList.ORDER_GROUPS · orderLabel(mode) · sortBy(rows, mode) · orderValue(e, mode) · orderHint(e, mode)
     MSSList.rankBadge(ranked) · countHTML(n) · postersHTML(items, resolve) ·
     collabLineHTML(list, collaborators) · avatarHTML(profile)

   Lists can hold titles added straight from Discover ("tmdb:movie:123").
   MSSList.tmdb(id) resolves those from a device cache (14 days, shared by
   every page), and MSSList.hydrate(lists) fetches any that are missing —
   resolves true when something new arrived (re-render then).
═══════════════════════════════════════════════════════════════ */

const MSSList = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const STORE = 'mss_tmdb_items_v1';
  const cache = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    Object.entries(saved).forEach(([k, v]) => { if (v && v._t > cutoff) cache[k] = v; });
  } catch {}
  const saveCache = () => { try { localStorage.setItem(STORE, JSON.stringify(cache)); } catch {} };
  const isTmdbId = id => typeof id === 'string' && id.startsWith('tmdb:');
  const tmdb = id => cache[id] || null;

  const pending = new Set();
  // perList: only look up the first N titles of each list (cards show 5, popups 8)
  async function hydrate(lists, perList) {
    const need = new Set();
    (lists || []).forEach(l => (perList ? (l.items || []).slice(0, perList) : (l.items || []))
      .forEach(id => { if (isTmdbId(id) && !cache[id] && !pending.has(id)) need.add(id); }));
    if (!need.size) return false;
    need.forEach(id => pending.add(id));
    await Promise.all([...need].map(async pid => {
      const [, type, tid] = pid.split(':');
      try {
        const res = await tmdbFetch(`${TMDB_BASE}/${type}/${tid}?language=en-US`);
        if (!res.ok) return;
        const d = await res.json();
        cache[pid] = {
          id: pid, title: (type === 'movie' ? d.title : d.name) || '',
          poster_url: d.poster_path ? TMDB_FULL + d.poster_path : null,
          tmdb_id: Number(tid), tmdb_type: type,
          year: ((type === 'movie' ? d.release_date : d.first_air_date) || '').split('-')[0],
          released: (type === 'movie' ? d.release_date : d.first_air_date) || '',
          genres: tmdbGenreNames(d.genres),
          cat: type === 'movie' ? 'movies' : 'tv', _t: Date.now(),
        };
      } catch (e) { console.error('List item lookup failed:', pid, e); }
      pending.delete(pid);
    }));
    saveCache();
    return true;
  }

  /* ── Pieces ── */
  function rankBadge(ranked) {
    if (ranked === true)  return `<span class="list-rank-badge is-ranked">Ranked</span>`;
    if (ranked === false) return `<span class="list-rank-badge is-unranked">Unranked</span>`;
    return '';
  }
  // Lists by the official account (065)
  const officialBadge = list => list?.official ? `<span class="list-rank-badge is-official">${icon('crown', 11)} Official</span>` : '';
  const countHTML = n => `<b>${n}</b> ${n === 1 ? 'title' : 'titles'}`;
  function postersHTML(items, resolve) {
    const posters = (items || []).slice(0, 5).map(resolve).filter(Boolean);
    if (!posters.length) return `<div class="lc-posters"><div class="lc-poster lc-poster-empty">No titles yet</div></div>`;
    return `<div class="lc-posters">${posters.map(e => `<div class="lc-poster">${posterHTML(e, 'big')}</div>`).join('')}</div>`;
  }
  function ownerHTML(p) {
    const u = safeURL(p?.avatar_url);
    return `<div class="social-list-owner"><div class="social-list-avatar">${u ? `<img src="${u}" loading="lazy" alt="">` : esc((p?.username || '?')[0].toUpperCase())}</div><div class="social-list-username">@${esc(p?.username || 'user')}</div></div>`;
  }

  function avatarHTML(p, cls = 'cl-av') {
    const u = p && safeURL(p.avatar_url);
    return `<span class="${cls}">${u ? `<img src="${u}" alt="">` : esc(((p && p.username) || '?')[0].toUpperCase())}</span>`;
  }
  // "Shared by @x" for a list shared with you; "With @maya, @omar · 1 invite
  // pending" for a list with collaborators (people: [{ status, profile }])
  function collabLineHTML(list, people) {
    if (list._collab) return `<div class="cl-line">${avatarHTML(list._owner)}<span>Shared by <b>@${esc(list._owner?.username || 'user')}</b></span></div>`;
    const joined = (people || []).filter(p => p.status === 'accepted');
    const pending = (people || []).filter(p => p.status === 'pending').length;
    if (!joined.length && !pending) return '';
    const names = joined.slice(0, 3).map(p => '@' + esc(p.profile?.username || 'user')).join(', ');
    return `<div class="cl-line"><span class="cl-stack">${joined.slice(0, 3).map(p => avatarHTML(p.profile)).join('')}</span>
    <span>${joined.length ? `With <b>${names}</b>${joined.length > 3 ? ` +${joined.length - 3}` : ''}` : ''}${joined.length && pending ? ' · ' : ''}${pending ? `${pending} invite${pending === 1 ? '' : 's'} pending` : ''}</span></div>`;
  }

  // Card body — the Lists page wraps it with its reorder bar when reordering
  function cardInnerHTML(list, o = {}) {
    const items = list.items || [];
    return `${o.ownerHTML || ''}
    <div class="lc-title-row"><div class="lc-title" translate="no">${esc(list.title)}</div>${officialBadge(list) || rankBadge(list.ranked)}${mssVisBadge(list.visibility)}</div>
    <div class="lc-meta">${countHTML(items.length)}${o.metaExtra || ''}</div>
    ${o.collabLine || ''}
    ${list.description ? `<div class="lc-desc" translate="no">${esc(list.description)}</div>` : ''}
    ${postersHTML(items, o.resolve)}`;
  }
  const cardHTML = (list, o = {}) => `<div class="lc-card" onclick="${o.onclick}">${cardInnerHTML(list, o)}</div>`;

  /* ── Read-only popup ── */
  function close() {
    MSSDialog.close(document.getElementById('mssListOverlay'));
  }
  function open(list, o = {}) {
    let ov = document.getElementById('mssListOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mssListOverlay';
      ov.innerHTML = `<div id="mssListCard" role="dialog" aria-modal="true" aria-label="List" data-dbl-like></div>`;   // double-tap → Like (when the list has one)
      MSSDialog.bind(ov, close);
      document.body.appendChild(ov);
    }
    const items = list.items || [];
    const shown = items.map(o.resolve).filter(Boolean);
    const max = shown.length > 8 ? 7 : 8, posters = shown.slice(0, max), extra = shown.length - posters.length;
    const head = o.owner ? mssProfileLinkHTML(o.owner, ownerHTML(o.owner).replace('class="social-list-owner"', 'class="social-list-owner" style="margin-bottom:0;"'))
      : `<div class="lp-eyebrow">${esc(o.eyebrow || 'List')}${list.forked_from ? '<span class="lp-tag">Imported</span>' : ''}</div>`;
    const url = `list-view.html?list=${encodeURIComponent(list.id)}`;
    document.getElementById('mssListCard').innerHTML = `
      <div class="lp-head">${head}<button type="button" class="lp-close" onclick="MSSList.close()" aria-label="Close">${icon('x', 18)}</button></div>
      <div class="lp-title-row"><div class="lp-title" translate="no">${esc(list.title)}</div>${officialBadge(list) || rankBadge(list.ranked)}${mssVisBadge(list.visibility)}</div>
      ${list.description ? `<div class="lp-desc" translate="no">${esc(list.description)}</div>` : ''}
      <div class="lp-meta">${countHTML(items.length)}</div>
      ${o.collabLine || ''}
      ${posters.length ? `<div class="lp-posters">${posters.map(e => `<div class="lp-poster">${posterHTML(e, 'big')}</div>`).join('')}${extra > 0 ? `<div class="lp-poster lp-more">+${extra}</div>` : ''}</div>` : ''}
      ${o.social ? `<div id="lpPopupActions" class="lp-actions lp-actions-social">${socialHTML(null, null)}</div>` : ''}
      <div id="lpNavPopupActions" class="lp-footer${o.manage ? ' lp-footer-manage' : ''}">${footerHTML(list, o)}</div>`;
    MSSDialog.open(ov);
    cur = { list, o, react: null, imported: null };
    if (o.social) {
      const me = window._navUser?.id, c = cur;
      Promise.all([
        mssReactions('list', list.id).catch(() => null),
        me ? sb.from('favorite_lists').select('id').eq('user_id', me).eq('forked_from', list.id).limit(1).then(r => !!(r.data && r.data.length), () => false) : Promise.resolve(false),
      ]).then(([st, imp]) => { if (cur === c) { c.react = st; c.imported = imp; drawFooter(); } });
    }
  }

  /* Same layout as the Lists page popup (lists.html): on someone else's list
     (o.social) a row with like / dislike + "Add to My Lists" (a copy in your
     Lists), then the footer — View List + Close, or Manage on your own profile */
  let cur = null;
  function socialHTML(react, imported) {
    const st = react || { like: 0, dislike: 0, mine: null };
    return `<div class="lp-react-pair">
        <button type="button" class="popup-action-btn lp-react${st.mine === 'like' ? ' is-on' : ''}" onclick="MSSList._react(true)" data-like aria-label="Like" aria-pressed="${st.mine === 'like'}" ${react ? '' : 'disabled'}>${icon(st.mine === 'like' ? 'thumbsUpFilled' : 'thumbsUp', 14)}<span>${st.like}</span></button>
        <button type="button" class="popup-action-btn lp-react lp-react-down${st.mine === 'dislike' ? ' is-on' : ''}" onclick="MSSList._react(false)" aria-label="Dislike" aria-pressed="${st.mine === 'dislike'}" ${react ? '' : 'disabled'}>${icon(st.mine === 'dislike' ? 'thumbsDownFilled' : 'thumbsDown', 14)}<span>${st.dislike}</span></button>
      </div>
      <button type="button" class="popup-action-btn lp-add" ${imported ? 'disabled' : ''} onclick="MSSList._import(this)">${imported ? 'Added to My Lists ✓' : '+ Add to My Lists'}</button>`;
  }
  function footerHTML(list, o) {
    const url = `list-view.html?list=${encodeURIComponent(list.id)}`;
    return `<button type="button" class="popup-action-btn lp-view" onclick="MSSList.close();location.href=${escHTML(JSON.stringify(url))}">${icon('list', 14)} View List</button>`
      // Share with friends (Social → Recommendations, social.js via mssRecommend)
      + (window._navUser && (!list.cat || list.cat === 'custom') ? `<button type="button" class="popup-action-btn lp-share" onclick="mssRecommend(${escHTML(JSON.stringify({ kind: 'list', list_id: list.id, title: list.title, count: (list.items || []).length }))})">${icon('send', 14)} Share</button>` : '')
      + (o.manage
        ? `<button type="button" class="popup-action-btn lp-manage" onclick="location.href='lists.html'">${icon('edit', 14)} Manage in Lists</button>`
        : `<button type="button" class="popup-action-btn lp-replies" onclick="MSSList.close()">Close</button>`);
  }
  function drawFooter() {
    const el = document.getElementById('lpPopupActions');
    if (el && cur) el.innerHTML = socialHTML(cur.react, cur.imported);
  }
  async function react(isLike) {
    if (!cur || !cur.react) return;
    const c = cur;
    c.react = await mssReact('list', c.list.id, isLike, c.react);
    if (cur === c) drawFooter();
  }
  // Copy into your Lists: their titles become yours (your entry when you have
  // the title, otherwise the TMDB title) — same as "Import" on list-view.html
  async function importList(btn) {
    const me = window._navUser?.id;
    if (mssGuestGate('save lists') || !me) return;
    if (!cur) return;
    const { list, o } = cur;
    btn.disabled = true;
    try {
      const { data: mine } = await sb.from('entries').select('id, tmdb_id, tmdb_type').eq('user_id', me).not('tmdb_id', 'is', null);
      const myByTmdb = Object.fromEntries((mine || []).map(e => [`${e.tmdb_type}:${e.tmdb_id}`, e.id]));
      const items = [];
      (list.items || []).forEach(id => {
        let next = id;
        if (isTmdbId(id)) { const [, t, n] = id.split(':'); next = myByTmdb[`${t}:${n}`] || id; }
        else { const e = o.resolve(id); if (e?.tmdb_id && e?.tmdb_type) next = myByTmdb[`${e.tmdb_type}:${e.tmdb_id}`] || `tmdb:${e.tmdb_type}:${e.tmdb_id}`; }
        if (!items.includes(next)) items.push(next);
      });
      const { error } = await sb.from('favorite_lists').insert({
        user_id: me, cat: 'custom', genre: list.genre || '', title: list.title, description: list.description || null,
        items, ranked: list.ranked ?? null, forked_from: list.id,
      });
      if (error) throw error;
      showToast('Added to your lists!');
      cur.imported = true; drawFooter();
    } catch (err) {
      console.error('Add list:', err);
      showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t add that list — try again.', 'err');
      btn.disabled = false;
    }
  }

  // A list's saved order (sort_mode): MSSOrder in config.js — also used by db.js to keep lists in order
  const { ORDER_GROUPS, orderLabel, orderValue, sortBy, reorder, orderHint } = MSSOrder;

  /* ── "Add to List" picker ── */
  let add = null;     // { entry, lists, map }
  const tmdbKey = e => e.tmdb_id && e.tmdb_type ? `tmdb:${e.tmdb_type}:${e.tmdb_id}` : null;
  const holds = (l, e) => (l.items || []).some(id => id === e.id || (tmdbKey(e) && id === tmdbKey(e)));
  const addResolve = id => isTmdbId(id) ? tmdb(id) : add?.map[id] || null;
  function addClose() { MSSDialog.close(document.getElementById('mssListAddOverlay')); }
  async function addTo(entry) {
    const me = window._navUser?.id;
    if (!entry || !me) return;
    let ov = document.getElementById('mssListAddOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mssListAddOverlay';
      ov.innerHTML = `<div id="mssListAddCard" role="dialog" aria-modal="true" aria-labelledby="mssListAddTitle">
          <div class="sf-header"><div><div class="lp-eyebrow" id="mssListAddFor"></div><div class="sf-title" id="mssListAddTitle">Add to List</div></div>
            <button type="button" class="sf-close" onclick="MSSList._addClose()" aria-label="Close">${icon('x', 18)}</button></div>
          <div class="sf-body" id="mssListAddBody"></div>
          <div class="sf-footer"><a class="sf-clear-btn la-new" href="lists.html">${icon('plus', 14)} New list</a><button type="button" class="sf-apply-btn" onclick="MSSList._addClose()">Done</button></div>
        </div>`;
      MSSDialog.bind(ov, addClose);
      document.body.appendChild(ov);
    }
    add = { entry, lists: null, map: { [entry.id]: entry } };
    document.getElementById('mssListAddFor').innerHTML = `<span translate="no">${esc(entry.title)}</span>`;
    document.getElementById('mssListAddBody').innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
    MSSDialog.open(ov);
    const cur = add;
    try {
      const [own, shared, entries] = await Promise.all([
        sb.from('favorite_lists').select('*').eq('user_id', me).eq('cat', 'custom').order('sort_order', { ascending: true }),
        sb.from('list_collaborators').select('list_id, sort_order').eq('user_id', me).eq('status', 'accepted').then(r => r, () => ({ data: [] })),
        sb.from('entries').select('*').eq('user_id', me),
      ]);
      const ids = (shared.data || []).map(r => r.list_id);
      const theirs = ids.length ? ((await sb.from('favorite_lists').select('*').in('id', ids)).data || []) : [];
      const pos = Object.fromEntries((shared.data || []).map(r => [r.list_id, r.sort_order ?? -1]));
      theirs.forEach(l => { l._collab = true; l.sort_order = pos[l.id]; });
      (entries.data || []).forEach(e => { cur.map[e.id] = e; });
      const lists = [...(own.data || []), ...theirs.sort((a, b) => a.sort_order - b.sort_order)];
      // titles of shared lists that aren't yours (their posters on the cards)
      const foreign = [...new Set(lists.flatMap(l => (l.items || []).slice(0, 5)))].filter(id => !isTmdbId(id) && !cur.map[id]);
      if (foreign.length) {
        ((await sb.from('entries').select('*').in('id', foreign)).data || []).forEach(e => { cur.map[e.id] = e; });
        await mssFillHiddenListItems(foreign, cur.map);   // a collaborator's hidden title (073)
      }
      if (add !== cur) return;
      cur.lists = lists;
      drawAdd();
      if (await hydrate(lists, 5) && add === cur) drawAdd();
    } catch (err) {
      console.error('Add to list:', err);
      if (add === cur) document.getElementById('mssListAddBody').innerHTML = '<div class="sf-empty">Couldn’t load your lists — try again.</div>';
    }
  }
  function drawAdd() {
    const box = document.getElementById('mssListAddBody');
    if (!box || !add?.lists) return;
    const { entry, lists } = add;
    if (!lists.length) { box.innerHTML = `<div class="la-empty">${icon('layers', 30)}<b>No lists yet</b><span>Make one on the Lists page, then add titles to it from here.</span></div>`; return; }
    box.innerHTML = `<div class="la-list">${lists.map((l, i) => {
      const inIt = holds(l, entry);
      return `<button type="button" class="lc-card la-card${inIt ? ' in' : ''}" aria-pressed="${inIt}" onclick="MSSList._addToggle(${i}, this)">
          <span class="la-state">${inIt ? `${icon('check', 13)} Added` : `${icon('plus', 13)} Add`}</span>
          ${cardInnerHTML(l, { resolve: addResolve, collabLine: l._collab ? '<div class="la-shared">Shared with you</div>' : '' })}
        </button>`;
    }).join('')}</div>`;
  }
  async function addToggle(i, btn) {
    const c = add, l = c?.lists?.[i];
    if (!l || btn.disabled) return;
    const e = c.entry, had = holds(l, e), before = (l.items || []).slice();
    l.items = had ? before.filter(id => id !== e.id && id !== tmdbKey(e)) : [...before, e.id];
    if (!had) reorder(l, l.sort_mode, addResolve);   // a list kept in order: the new title slots into place
    btn.disabled = true;
    try {
      const { error } = l._collab
        ? await sb.rpc('update_list_items', { p_list_id: l.id, p_items: l.items })
        : await sb.from('favorite_lists').update({ items: l.items }).eq('id', l.id).eq('user_id', window._navUser?.id);
      if (error) throw error;
      showToast(had ? `Removed from “${l.title}”.` : `Added to “${l.title}”.`);
    } catch (err) {
      console.error('Add to list:', err);
      l.items = before;
      showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t save that — try again.', 'err');
    }
    if (add === c) drawAdd();
  }

  return { _react: react, _import: importList, addTo, reorder, sortBy, orderValue, orderHint, ORDER_GROUPS, orderLabel, _addClose: addClose, _addToggle: addToggle, cardHTML, cardInnerHTML, open, close, rankBadge, officialBadge, countHTML, postersHTML, ownerHTML, avatarHTML, collabLineHTML, tmdb, isTmdbId, hydrate, cache };
})();