/* ═══════════════════════════════════════════════════════════════
   profile-tabs.js — Notes + Lists tabs on profile.html / profile-view.html (v632)

   The "Personal" sections of the Notes and Lists pages, sized for a tab:
   no page header or stat boxes — just the toolbar (label + count + Sort /
   Filter) and the same cards and popups the pages use.

     MSSTabs.notes(el, { userId, entries, owner, name, onDelete })
       The featured note (pinned, else latest) and the note cards from note-popup.js, 20 at a time.
       Tap → the title's panel on its Review (MSSViews, title-view.js); your own profile: edit
       in place. Someone else's: read-only, spoilers blurred.
     MSSTabs.lists(el, { userId, entries, owner, name })
       Cards from list-popup.js — lists they made plus lists shared with them.
       Tap → the list page (list-view.html); ⋯ → MSSListActions (Edit, Share, Invite,
       Export, Delete on yours; Share, Add to my lists, Report on theirs).

   Requires sort-filter.js, note-popup.js, list-popup.js, list-actions.js, info-popup.js (MSSViews).
═══════════════════════════════════════════════════════════════ */

const MSSTabs = (() => {
  const N = { el: null, entries: [], owner: false, name: '', counts: {}, onDelete: null, userId: null, pin: null, show: 0 };
  const L = { el: null, lists: null, entries: [], userId: null, owner: false, name: '', collab: {}, map: {}, loading: null };
  const empty = (art, title, subHTML, actions) => mssEmpty({ art, title, textHTML: subHTML || '', actions });
  const possessive = name => name ? `${escHTML(name)}’s` : 'Their';

  /* ══ Notes ══ */
  const withNotes = () => N.entries.filter(e => e.notes && e.notes.trim());
  SF.register('tabNotes', {
    watched: () => true,          // Year Watched filter
    base: withNotes,
    render: () => { N.show = MSSNote.PAGE; renderNotes(); },   // a sort / filter starts again at 20
    defaultSort: 'newest',
    addedDate: e => MSSNote.watchedDate(e),
    presets: {
      added: { header: 'Date', opts: [['newest', 'Latest'], ['oldest', 'Earliest']] },
      length: { header: 'Note Length', opts: [['note_long', 'Longest'], ['note_short', 'Shortest']] },
      likes: { header: 'Likes', opts: [['likes_most', 'Most Liked'], ['likes_least', 'Least Liked']] },
    },
    sorts: () => ['added', 'alpha', 'length', 'ratings', 'likes'],
    filters: () => ['genre', 'year', 'score', 'length'],
    compare: {
      note_long:   (a, b) => MSSNote.words(b.notes) - MSSNote.words(a.notes),
      note_short:  (a, b) => MSSNote.words(a.notes) - MSSNote.words(b.notes),
      likes_most:  (a, b) => (N.counts[b.id]?.like || 0) - (N.counts[a.id]?.like || 0),
      likes_least: (a, b) => (N.counts[a.id]?.like || 0) - (N.counts[b.id]?.like || 0),
    },
    choiceFilters: () => [SF.typeChoice()],
  });

  function renderNotes() {
    if (!N.el) return;
    const all = withNotes();
    if (!all.length) {
      N.el.innerHTML = N.owner
        ? empty('notes', 'No notes yet', 'Hot takes, favourite scenes, that one line you can’t stop quoting. Write one from any title.', [{ label: 'Go to Notes', href: 'notes.html', primary: true }])
        : empty('notes', 'No notes yet', `${possessive(N.name)} hot takes are still under wraps.`);
      return;
    }
    const list = SF.list('tabNotes', 'all');
    // the Notes page's featured note: pinned, else the latest — not while filtering, never repeated below
    const top = SF.filterCount('tabNotes', 'all') ? null : MSSNote.featured(all, N.pin);
    const rest = top ? list.filter(e => e !== top) : list;
    const card = e => MSSNote.cardHTML(e, { counts: N.counts[e.id], open: `MSSTabs._openNote(${attrJSON(e.id)})`, blur: !N.owner });
    N.el.innerHTML = `<div class="mss-toolbar">${mssToolbarHTML(N.owner ? 'Your Notes' : `${possessive(N.name)} Notes`, list.length, SF.bar('tabNotes', 'all'), 'note')}</div>`
      + (list.length
        ? (top ? MSSNote.featuredHTML(top, { open: `MSSTabs._openNote(${attrJSON(top.id)})`, pinned: top.id === N.pin, blur: !N.owner }) : '')
          + `<div class="nc-grid">${rest.slice(0, N.show).map(card).join('')}</div>${MSSNote.more(rest.length - N.show, 'MSSTabs._moreNotes()')}`
        : mssEmpty({ compact: true, art: 'filter', title: 'Nothing matches these filters', text: 'Your filters are a little too picky. Loosen one and try again.',
          actions: [{ label: 'Clear filters', icon: 'x', onclick: "SF.clearFilters('tabNotes', 'all'); MSSTabs._redrawNotes()", primary: true }] }));
  }
  function notes(el, o) {
    Object.assign(N, { el, entries: o.entries || [], owner: !!o.owner, name: o.name || '', onDelete: o.onDelete || null,
      userId: o.userId || (o.owner ? window._navUser?.id : null), show: MSSNote.PAGE });
    renderNotes();
    const ids = withNotes().map(e => e.id);
    MSSNote.reactionCounts(ids).then(c => { N.counts = c; renderNotes(); }).catch(() => {});
    MSSNote.pinnedId(N.userId).then(id => { if (id !== N.pin) { N.pin = id; renderNotes(); } });
  }
  const moreNotes = () => { N.show += MSSNote.PAGE; renderNotes(); };
  // your own profile: pinned / unpinned in the title panel → the featured note follows
  document.addEventListener('mss:notepin', ev => { if (N.owner && N.el) { N.pin = ev.detail.id; renderNotes(); } });
  // The title panel / page, opening on the Review — same as the Notes page (MSSViews, title-view.js)
  function openNote(id) {
    const e = N.entries.find(x => x.id === id);
    if (!e) return;
    MSSViews.open(e, {
      start: 'note', note: true, own: N.owner, counts: N.counts[id], profile: N.owner ? null : { display_name: N.name },
      onNoteSaved: renderNotes, onChange: renderNotes,
      onDelete: x => { N.entries = N.entries.filter(y => y.id !== x.id); renderNotes(); N.onDelete?.(x); },
    });
  }

  /* ══ Lists ══ */
  const resolve = id => MSSList.isTmdbId(id) ? MSSList.tmdb(id) : (L.map[id] || null);
  const defaultOrder = () => (L.lists || []).slice().sort((a, b) => {
    const ao = a.sort_order, bo = b.sort_order;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  SF.register('tabLists', {
    base: () => defaultOrder().map((l, i) => Object.assign({}, l, { _rank: i + 1 })),
    render: () => renderLists(),
    defaultSort: 'rank',
    presets: {
      rank:  { header: 'Order',   opts: [['rank', 'Their order'], ['rankRev', 'Reversed']] },
      added: { header: 'Created', opts: [['newest', 'Newest'], ['oldest', 'Oldest']] },
    },
    sorts: () => ['rank', 'alpha', 'added'],
    filters: () => [],
    addedDate: l => l.created_at,
    choiceFilters: () => [
      { key: 'ranked', label: 'Ranking',
        options: [['', 'All Lists'], ['yes', 'Ranked'], ['no', 'Collection'], ['unset', 'Not Set']],
        test: (l, v) => v === 'yes' ? l.ranked === true : v === 'no' ? l.ranked === false : l.ranked == null },
      { key: 'origin', label: 'Source',
        options: [['', 'All Lists'], ['mine', 'Created'], ['imported', 'Imported'], ['shared', 'Shared With Them']],
        test: (l, v) => v === 'shared' ? !!l._collab : v === 'imported' ? !!l.forked_from && !l._collab : !l.forked_from && !l._collab },
    ],
  });

  // Imported / Shared / Collab beside the Ranked / Collection chip
  const tags = l => (l.forked_from ? '<span class="lc-chip">Imported</span>' : '')
    + (l._collab ? '<span class="cl-tag">Shared</span>' : (L.collab[l.id] || []).some(c => c.status === 'accepted') ? '<span class="cl-tag">Collab</span>' : '');

  function renderLists() {
    if (!L.el) return;
    if (!L.lists) { L.el.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`; return; }
    if (!L.lists.length) {
      L.el.innerHTML = L.owner
        ? empty('lists', 'Start your first list', 'Top 10s, comfort rewatches, guilty pleasures. Number one is up to you.', [{ label: 'Go to Lists', href: 'lists.html', primary: true }])
        : empty('lists', 'No lists yet', 'Nothing ranked here yet.');
      return;
    }
    const list = SF.list('tabLists', 'all');
    L.el.innerHTML = `<div class="mss-toolbar">${mssToolbarHTML(L.owner ? 'Your Lists' : `${possessive(L.name)} Lists`, list.length, SF.bar('tabLists', 'all'), 'list')}</div>`
      + (list.length
        ? `<div class="lc-grid">${list.map(l => MSSList.cardHTML(l, {
            resolve, open: `location.href=${attrJSON(MSSList.url(l))}`, menu: `MSSTabs._listMenu(this, ${attrJSON(l.id)})`, own: L.owner && !l._collab,
            extra: tags(l), collabLine: MSSList.collabLineHTML(l, L.collab[l.id]),
          })).join('')}</div>`
        : mssEmpty({ compact: true, art: 'filter', title: 'Nothing matches these filters', text: 'Your filters are a little too picky. Loosen one and try again.',
          actions: [{ label: 'Clear filters', icon: 'x', onclick: "SF.clearFilters('tabLists', 'all'); MSSTabs._redrawLists()", primary: true }] }));
  }

  // Their lists + lists shared with them, collaborators, and every title in them
  async function loadLists() {
    const uid = L.userId;
    const [ownRes, sharedRes] = await Promise.all([
      sb.from('favorite_lists').select('*').eq('user_id', uid).eq('cat', 'custom'),
      sb.from('list_collaborators').select('list_id, sort_order').eq('user_id', uid).eq('status', 'accepted'),
    ]);
    const own = ownRes.data || [];
    const sharedPos = Object.fromEntries((sharedRes.data || []).map(r => [r.list_id, r.sort_order]));
    const sharedIds = Object.keys(sharedPos);
    const [collabRes, sharedListsRes] = await Promise.all([
      own.length ? sb.from('list_collaborators').select('list_id, user_id, status').in('list_id', own.map(l => l.id)).neq('status', 'declined') : { data: [] },
      sharedIds.length ? sb.from('favorite_lists').select('*').in('id', sharedIds) : { data: [] },
    ]);
    const shared = sharedListsRes.data || [];
    const peopleIds = [...new Set([...(collabRes.data || []).map(r => r.user_id), ...shared.map(l => l.user_id)])];
    const people = peopleIds.length ? (await sb.from('profiles').select('id, username, display_name, avatar_url').in('id', peopleIds)).data || [] : [];
    const P = Object.fromEntries(people.map(p => [p.id, p]));
    L.collab = {};
    (collabRes.data || []).forEach(r => { (L.collab[r.list_id] ||= []).push({ ...r, profile: P[r.user_id] || null }); });
    // A shared list sits where *they* put it (their row's sort_order); new ones on top
    shared.forEach(l => { l._collab = true; l._owner = P[l.user_id] || null; l.sort_order = sharedPos[l.id] ?? -1; });
    L.lists = own.concat(shared);
    renderLists();
    // Titles from other people's libraries (shared lists, imports) + Discover titles
    const foreign = [...new Set(L.lists.flatMap(l => l.items || []))].filter(id => !MSSList.isTmdbId(id) && !L.map[id]);
    if (foreign.length) {
      const { data } = await sb.from('entries').select('*').in('id', foreign.slice(0, 1000));
      (data || []).forEach(e => { L.map[e.id] = e; });
      await mssFillHiddenListItems(foreign.slice(0, 1000), L.map);   // hidden titles (073): name + poster only
      renderLists();
    }
    if (await MSSList.hydrate(L.lists, 8)) renderLists();
  }
  function lists(el, o) {
    const sameUser = L.userId === o.userId;
    Object.assign(L, { el, userId: o.userId, owner: !!o.owner, name: o.name || '', entries: o.entries || [] });
    L.map = Object.fromEntries(L.entries.map(e => [e.id, e]));
    if (!sameUser) { L.lists = null; L.loading = null; }
    renderLists();
    if (!L.loading) L.loading = loadLists().catch(err => { console.error('Lists tab:', err); L.lists = L.lists || []; renderLists(); });
  }
  // A card's ⋯ (MSSListActions): yours / shared with you on your own profile, else someone else's
  function listMenu(btn, id) {
    const l = (L.lists || []).find(x => x.id === id);
    if (!l) return;
    const me = window._navUser?.id, drop = x => { L.lists = L.lists.filter(y => y.id !== x.id); renderLists(); };
    MSSListActions.menu(btn, l, { own: !!me && l.user_id === me, shared: L.owner && !!l._collab, resolve, onDeleted: drop, onLeft: drop });
  }

  /* ══ Episodes tab: the Episodes page's own design (episodes-home.js) — yours, or someone else's read-only ══ */
  async function episodes(el, o) {
    el.innerHTML = '<div class="page-loading" data-skel="eph"></div>';
    try { await MSSEpHome.mount(el, { userId: o.userId, owner: !!o.owner, name: o.name || '' }); }
    catch (err) { console.error('Episodes tab:', err); mssErrorPage(mssErrorKind(err), { in: el, error: err }); }
  }

  return { notes, lists, episodes, _openNote: openNote, _listMenu: listMenu, _redrawNotes: renderNotes, _moreNotes: moreNotes, _redrawLists: renderLists };
})();