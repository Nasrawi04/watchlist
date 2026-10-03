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
        const res = await tmdbFetch(`${TMDB_BASE}/${type}/${tid}?api_key=${TMDB_KEY}&language=en-US`);
        if (!res.ok) return;
        const d = await res.json();
        cache[pid] = {
          id: pid, title: (type === 'movie' ? d.title : d.name) || '',
          poster_url: d.poster_path ? TMDB_FULL + d.poster_path : null,
          tmdb_id: Number(tid), tmdb_type: type,
          year: ((type === 'movie' ? d.release_date : d.first_air_date) || '').split('-')[0],
          genres: (d.genres || []).map(g => g.name),
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
    <div class="lc-title-row"><div class="lc-title">${esc(list.title)}</div>${rankBadge(list.ranked)}</div>
    <div class="lc-meta">${countHTML(items.length)}${o.metaExtra || ''}</div>
    ${o.collabLine || ''}
    ${list.description ? `<div class="lc-desc">${esc(list.description)}</div>` : ''}
    ${postersHTML(items, o.resolve)}`;
  }
  const cardHTML = (list, o = {}) => `<div class="lc-card" onclick="${o.onclick}">${cardInnerHTML(list, o)}</div>`;

  /* ── Read-only popup ── */
  function close() {
    document.getElementById('mssListOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }
  function open(list, o = {}) {
    let ov = document.getElementById('mssListOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mssListOverlay';
      ov.innerHTML = `<div id="mssListCard" role="dialog" aria-modal="true" aria-label="List"></div>`;
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
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
      <div class="lp-title-row"><div class="lp-title">${esc(list.title)}</div>${rankBadge(list.ranked)}</div>
      ${list.description ? `<div class="lp-desc">${esc(list.description)}</div>` : ''}
      <div class="lp-meta">${countHTML(items.length)}</div>
      ${o.collabLine || ''}
      ${posters.length ? `<div class="lp-posters">${posters.map(e => `<div class="lp-poster">${posterHTML(e, 'big')}</div>`).join('')}${extra > 0 ? `<div class="lp-poster lp-more">+${extra}</div>` : ''}</div>` : ''}
      <div id="lpNavPopupActions" class="lp-footer${o.social ? ' np-actions' : ''}">${footerHTML(list, o, null, null)}</div>`;
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    cur = { list, o, react: null, imported: null };
    if (o.social) {
      const me = window._navUser?.id, c = cur;
      Promise.all([
        mssReactions('list', list.id).catch(() => null),
        me ? sb.from('favorite_lists').select('id').eq('user_id', me).eq('forked_from', list.id).limit(1).then(r => !!(r.data && r.data.length), () => false) : Promise.resolve(false),
      ]).then(([st, imp]) => { if (cur === c) { c.react = st; c.imported = imp; drawFooter(); } });
    }
  }

  /* Footer: View List + Close / Manage — and on someone else's list (o.social)
     like / dislike and "Add to My Lists" (a copy in your Lists) */
  let cur = null;
  function footerHTML(list, o, react, imported) {
    const url = `list-view.html?list=${encodeURIComponent(list.id)}`;
    const view = `<button type="button" class="popup-action-btn lp-view" onclick="location.href=${escHTML(JSON.stringify(url))}">${icon('list', 14)} View List</button>`;
    if (o.social) {
      return mssReactButtonsHTML(react, 'MSSList._react(true)', 'MSSList._react(false)') + view
        + (imported ? `<button type="button" class="popup-action-btn lp-replies" disabled>${icon('check', 14)} In My Lists</button>`
          : `<button type="button" class="popup-action-btn lp-replies" onclick="MSSList._import(this)">${icon('plus', 14)} Add to My Lists</button>`);
    }
    return view + (o.manage
      ? `<button type="button" class="popup-action-btn lp-replies" onclick="location.href='lists.html'">${icon('edit', 14)} Manage in Lists</button>`
      : `<button type="button" class="popup-action-btn lp-replies" onclick="MSSList.close()">Close</button>`);
  }
  function drawFooter() {
    const el = document.getElementById('lpNavPopupActions');
    if (el && cur) el.innerHTML = footerHTML(cur.list, cur.o, cur.react, cur.imported);
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
    if (!me) { showToast('Sign in to add lists.', 'err'); return; }
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

  return { _react: react, _import: importList, cardHTML, cardInnerHTML, open, close, rankBadge, countHTML, postersHTML, ownerHTML, avatarHTML, collabLineHTML, tmdb, isTmdbId, hydrate, cache };
})();
