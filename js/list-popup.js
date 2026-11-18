/* ═══════════════════════════════════════════════════════════════
   list-popup.js — the list card (Lists redesign) and Add to List

   One card for every list grid — the Lists page (Mine, Friends, Community), the Lists tab on
   profile.html / profile-view.html, a title page's lists and the Add to List picker:

     MSSList.cardHTML(list, { resolve, open, menu, own, ownerHTML, collabLine, reacts, extra })
       → the lc-card: a cover of the first five posters in the list's order (#1 large, no
         numbers — the arrangement shows the order; "+N" over the fifth), Ranked / Collection
         + how it's ordered ("By your score", "Your order"), title, two lines of description,
         then (ranked) "#1 title ★ score", the average ★ when there are ratings, and the count.
       open: JS for a click (the list page) · menu: JS for its ⋯ (MSSListActions) ·
       own: the viewer's list (wording) · reacts: the Community like / dislike buttons
     MSSList.addTo(entry) → "Add to List": your lists (and lists shared with you) as cards in a
       side panel — tap one to add the title (again to take it out); a list kept in order re-sorts.
     MSSList.rankBadge(ranked) (Ranked / Collection) · officialBadge · ownerHTML · avatarHTML ·
       collabLineHTML(list, collaborators) · average(list, resolve)
     MSSList.reorder · sortBy · orderValue · orderHint · ORDER_GROUPS · orderLabel · byLabel (MSSOrder, config.js)

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
  // Ranked (green) or Collection (the other kind — was "Unranked"); a list that's neither shows none
  function rankBadge(ranked) {
    if (ranked === true)  return `<span class="list-rank-badge is-ranked">Ranked</span>`;
    if (ranked === false) return `<span class="list-rank-badge is-collection">Collection</span>`;
    return '';
  }
  // Lists by the official account (065) — green like Ranked (yellow is for 9.80+ only)
  const officialBadge = list => list?.official ? `<span class="list-rank-badge is-official">${icon('crown', 11)} Official</span>` : '';
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

  // The average of the list's scores — only when every title it holds from a library is known
  // here (a Discover pick has no score) and at least one has a score; null otherwise
  function average(list, resolve) {
    let sum = 0, n = 0;
    for (const id of list.items || []) {
      if (isTmdbId(id)) continue;
      const e = resolve(id);
      if (!e) return null;
      const v = liveScore(e);
      if (v != null) { sum += Number(v); n++; }
    }
    return n ? sum / n : null;
  }
  // The cover: five cells (#1 spans both rows), the list's own order, "+N" over the fifth
  // (a title still being looked up shows as a grey cell, so the cover keeps its shape)
  function coverHTML(items, resolve) {
    const first = (items || []).slice(0, 5);
    if (!first.length) return `<div class="lc-cover is-empty"><span>${icon('layers', 22)}No titles yet</span></div>`;
    const more = (items || []).length - 5;
    return `<div class="lc-cover n${first.length}" aria-hidden="true">${first.map((id, i) => {
      const e = resolve(id), plus = i === 4 && more > 0 ? `<span class="lc-plus">+${more}</span>` : '';
      return e ? `<div class="lc-cell"${MSSAge.attr(e.tmdb_type || e.media_type, e.tmdb_id, 'soft')}>${posterHTML(e, 'big', i ? '(max-width:640px) 22vw, 90px' : '(max-width:640px) 36vw, 150px')}${plus}</div>`
        : `<div class="lc-cell">${plus}</div>`;
    }).join('')}</div>`;
  }
  // The card's body (the Add to List picker wraps it in its own button)
  function cardInnerHTML(list, o = {}) {
    const items = list.items || [], n = items.length, resolve = o.resolve || (() => null);
    const top = list.ranked === true ? resolve(items[0]) : null, topScore = top ? liveScore(top) : null;
    const avg = average(list, resolve);
    const orderChip = list.official ? '' : `<span class="lc-chip">${esc(MSSOrder.byLabel(list.sort_mode, o.own))}</span>`;
    return `${coverHTML(items, resolve)}
    <div class="lc-body">
      ${o.ownerHTML || ''}
      <div class="lc-chips">${officialBadge(list) || rankBadge(list.ranked)}${orderChip}${mssVisBadge(list.visibility)}${o.extra || ''}</div>
      <h3 class="lc-title" translate="no">${esc(list.title)}</h3>
      ${list.description ? `<p class="lc-desc" translate="no">${esc(list.description)}</p>` : ''}
      ${o.collabLine || ''}
      <div class="lc-foot">
        ${top ? `<span class="lc-top"><b>#1</b> <span translate="no">${esc(top.title)}</span></span>${topScore != null ? mssScoreHTML(topScore, { cls: 'lc-score' }) : ''}` : '<span class="lc-top"></span>'}
        ${avg != null ? `<span class="lc-avg${top ? ' is-side' : ''}">Avg ${mssScoreHTML(avg, { cls: 'lc-score' })}</span>` : ''}
        <span class="lc-n">${n} ${n === 1 ? 'title' : 'titles'}</span>
      </div>
      ${o.reacts ? `<div class="lc-reacts">${o.reacts}</div>` : ''}
    </div>`;
  }
  const cardHTML = (list, o = {}) => `<article class="lc-card" data-list-id="${esc(list.id)}" role="link" tabindex="0" aria-label="${esc(list.title)}"
      onclick="if(!event.target.closest('button,a'))${o.open}" onkeydown="if((event.key==='Enter')&&event.target===this){event.preventDefault();${o.open}}"${o.dbl ? ' data-dbl-like' : ''}>
      ${cardInnerHTML(list, o)}
      ${o.menu ? `<button type="button" class="lc-more" onclick="event.stopPropagation();${o.menu}" aria-label="Actions for ${esc(list.title)}" aria-haspopup="menu">${icon('moreV', 16)}</button>` : ''}
    </article>`;
  // The list page's address
  const url = list => `list-view.html?list=${encodeURIComponent(list.id)}`;

  // A list's saved order (sort_mode): MSSOrder in config.js — also used by db.js to keep lists in order
  const { ORDER_GROUPS, orderLabel, byLabel, orderValue, sortBy, reorder, orderHint } = MSSOrder;

  /* ── "Add to List" picker ── */
  let add = null;     // { entry, lists, map }
  const tmdbKey = e => e.tmdb_id && e.tmdb_type ? `tmdb:${e.tmdb_type}:${e.tmdb_id}` : null;
  const holds = (l, e) => (l.items || []).some(id => id === e.id || (tmdbKey(e) && id === tmdbKey(e)));
  const addResolve = id => isTmdbId(id) ? tmdb(id) : add?.map[id] || null;
  // a side panel S (full page on phones) with the title's backdrop: your lists to tick, New list, Done
  let addPanel = null;
  function addClose() { addPanel?.close(); }
  async function addTo(entry) {
    const me = window._navUser?.id;
    if (!entry || !me) return;
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'title', tallHero: true, poster: mssSharpPoster(entry.poster_url) || null, title: 'Add to List', subtitle: entry.title,
      backdrop: entry.tmdb_id ? entry : null,
      body: '<div id="mssListAddBody"><div class="page-loading"><div class="spinner"></div></div></div>',
      footer: { secondary: [{ label: 'New list', lead: icon('plus', 16), onClick: () => { location.href = 'lists.html'; } }], primary: { label: 'Done', onClick: x => x.close() } },
      onClose: () => { if (addPanel === h) { addPanel = null; add = null; } } });
    addPanel = h;
    add = { entry, lists: null, map: { [entry.id]: entry } };
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
      if (add === cur) document.getElementById('mssListAddBody').innerHTML = '<p class="lyr-rows-msg">Couldn’t load your lists — try again.</p>';
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

  return { addTo, reorder, sortBy, orderValue, orderHint, ORDER_GROUPS, orderLabel, byLabel, _addClose: addClose, _addToggle: addToggle, cardHTML, cardInnerHTML, url, average, rankBadge, officialBadge, ownerHTML, avatarHTML, collabLineHTML, tmdb, isTmdbId, hydrate, cache };
})();