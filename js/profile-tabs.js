/* ═══════════════════════════════════════════════════════════════
   profile-tabs.js — Notes + Lists tabs on profile.html / profile-view.html (v632)

   The "Personal" sections of the Notes and Lists pages, sized for a tab:
   no page header or stat boxes — just the toolbar (label + count + Sort /
   Filter) and the same cards and popups the pages use.

     MSSTabs.notes(el, { entries, owner, name, onDelete })
       Cards from note-popup.js. Tap → Note · Ratings · Info (entry-views.js);
       your own profile: Edit Note saves in place. Someone else's: read-only,
       spoilers blurred.
     MSSTabs.lists(el, { userId, entries, owner, name })
       Cards from list-popup.js — lists they made plus lists shared with them.
       Tap → the list popup → View List (list-view.html); on your own
       profile also "Manage in Lists" (editing stays on the Lists page).

   Requires sort-filter.js, note-popup.js, list-popup.js, entry-views.js.
═══════════════════════════════════════════════════════════════ */

const MSSTabs = (() => {
  const N = { el: null, entries: [], owner: false, name: '', counts: {}, onDelete: null };
  const L = { el: null, lists: null, entries: [], userId: null, owner: false, name: '', collab: {}, map: {}, loading: null };
  const empty = (ico, title, sub) => `<div class="empty" style="padding:3.5rem 1rem;text-align:center;">
      <div class="empty-icon" style="opacity:.4;margin-bottom:1rem;">${icon(ico, 44)}</div>
      <div class="empty-text" style="color:var(--text-2);margin-bottom:.5rem;">${title}</div>
      ${sub ? `<div style="font-size:13px;color:var(--text-3);">${sub}</div>` : ''}
    </div>`;
  const possessive = name => name ? `${escHTML(name)}’s` : 'Their';

  /* ══ Notes ══ */
  const withNotes = () => N.entries.filter(e => e.notes && e.notes.trim());
  SF.register('tabNotes', {
    watched: () => true,          // Year Watched filter
    base: withNotes,
    render: () => renderNotes(),
    defaultSort: 'newest',
    addedDate: e => MSSNote.watchedDate(e),
    presets: {
      added: { header: 'Date', opts: [['newest', 'Latest'], ['oldest', 'Earliest']] },
      length: { header: 'Note Length', opts: [['note_long', 'Longest'], ['note_short', 'Shortest']] },
      likes: { header: 'Likes', opts: [['likes_most', 'Most Liked'], ['likes_least', 'Least Liked']] },
    },
    sorts: () => ['added', 'alpha', 'length', 'ratings', 'likes'],
    filters: () => ['genre', 'year', 'score'],
    compare: {
      note_long:   (a, b) => MSSNote.words(b.notes) - MSSNote.words(a.notes),
      note_short:  (a, b) => MSSNote.words(a.notes) - MSSNote.words(b.notes),
      likes_most:  (a, b) => (N.counts[b.id]?.like || 0) - (N.counts[a.id]?.like || 0),
      likes_least: (a, b) => (N.counts[a.id]?.like || 0) - (N.counts[b.id]?.like || 0),
    },
    choiceFilters: () => [{
      key: 'cat', label: 'Type',
      options: [['', 'All Types'], ['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']],
    }, {
      key: 'format', label: 'Format',
      options: [['', 'All Formats'], ['show', 'Shows'], ['movie', 'Movies']],
      when: ch => ch.cat === 'anime' || ch.cat === 'cartoons',
      test: (e, v) => (v === 'movie') === SF.isMovie(e),
    }],
  });

  function renderNotes() {
    if (!N.el) return;
    const all = withNotes();
    if (!all.length) {
      N.el.innerHTML = N.owner
        ? empty('notebook', 'No notes yet', 'Write one from any title, or on the <a href="notes.html" style="color:var(--olive-light);font-weight:600;">Notes page</a>.')
        : empty('notebook', 'No notes yet', '');
      return;
    }
    const list = SF.list('tabNotes', 'all');
    N.el.innerHTML = `<div class="mss-toolbar">${mssToolbarHTML(N.owner ? 'Your Notes' : `${possessive(N.name)} Notes`, list.length, SF.bar('tabNotes', 'all'), 'note')}</div>`
      + (list.length
        ? `<div class="nc-grid">${list.map(e => MSSNote.cardHTML(e, { counts: N.counts[e.id], onclick: `MSSTabs._openNote(${attrJSON(e.id)})`, blurSpoiler: !N.owner })).join('')}</div>`
        : `<div class="mss-empty">No notes match these filters.</div>`);
  }
  function notes(el, o) {
    Object.assign(N, { el, entries: o.entries || [], owner: !!o.owner, name: o.name || '', onDelete: o.onDelete || null });
    renderNotes();
    const ids = withNotes().map(e => e.id);
    MSSNote.reactionCounts(ids).then(c => { N.counts = c; renderNotes(); }).catch(() => {});
  }
  // Note first, then Ratings and Info — same as the Notes page (entry-views.js)
  function openNote(id) {
    const e = N.entries.find(x => x.id === id);
    if (!e) return;
    MSSViews.open(e, {
      order: ['note', 'rate', 'info'], own: N.owner, counts: N.counts[id], profile: N.owner ? null : { display_name: N.name },
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
      rank:  { header: 'Order',   opts: [['rank', 'Default'], ['rankRev', 'Reversed']] },
      added: { header: 'Created', opts: [['newest', 'Newest'], ['oldest', 'Oldest']] },
    },
    sorts: () => ['rank', 'alpha', 'added'],
    filters: () => [],
    addedDate: l => l.created_at,
    choiceFilters: () => [
      { key: 'ranked', label: 'Ranking',
        options: [['', 'All Lists'], ['yes', 'Ranked'], ['no', 'Unranked'], ['unset', 'Not Set']],
        test: (l, v) => v === 'yes' ? l.ranked === true : v === 'no' ? l.ranked === false : l.ranked == null },
      { key: 'origin', label: 'Source',
        options: [['', 'All Lists'], ['mine', 'Created'], ['imported', 'Imported'], ['shared', 'Shared With Them']],
        test: (l, v) => v === 'shared' ? !!l._collab : v === 'imported' ? !!l.forked_from && !l._collab : !l.forked_from && !l._collab },
    ],
  });

  const metaExtra = l => (l.forked_from ? ' · Imported' : '')
    + (l._collab ? ' · <span class="cl-tag">Shared</span>' : (L.collab[l.id] || []).some(c => c.status === 'accepted') ? ' · <span class="cl-tag">Collab</span>' : '');

  function renderLists() {
    if (!L.el) return;
    if (!L.lists) { L.el.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`; return; }
    if (!L.lists.length) {
      L.el.innerHTML = L.owner
        ? empty('layers', 'No lists yet', 'Create one on the <a href="lists.html" style="color:var(--olive-light);font-weight:600;">Lists page</a> — mix any movies, shows, anime or cartoons.')
        : empty('layers', 'No lists yet', '');
      return;
    }
    const list = SF.list('tabLists', 'all');
    L.el.innerHTML = `<div class="mss-toolbar">${mssToolbarHTML(L.owner ? 'Your Lists' : `${possessive(L.name)} Lists`, list.length, SF.bar('tabLists', 'all'), 'list')}</div>`
      + (list.length
        ? `<div class="lc-grid">${list.map(l => MSSList.cardHTML(l, {
            resolve, onclick: `MSSTabs._openList(${attrJSON(l.id)})`, metaExtra: metaExtra(l), collabLine: MSSList.collabLineHTML(l, L.collab[l.id]),
          })).join('')}</div>`
        : `<div class="mss-empty">No lists match these filters.</div>`);
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
  function openList(id) {
    const l = (L.lists || []).find(x => x.id === id);
    if (!l) return;
    MSSList.open(l, {
      resolve,
      eyebrow: L.owner ? (l._collab ? 'Shared List' : 'Your List') : `${L.name ? L.name + '’s' : 'Their'} List`,
      collabLine: MSSList.collabLineHTML(l, L.collab[l.id]),
      manage: L.owner,
    });
  }

  return { notes, lists, _openNote: openNote, _openList: openList };
})();
