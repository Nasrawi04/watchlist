/* ═══════════════════════════════════════════════════════════════
   entry-views.js — Info · Ratings · Note in one popup (v641)

   Opens a title in the shared popups (MSSInfo, MSSRate, MSSNote) with a
   switcher on top, so you can move between its Info, Ratings and Note
   without closing anything — tap a tab, swipe left / right on the
   popup, or use the ← → keys. Only the views a title actually has show
   up (Ratings once it's rated / watched, Note once it has one).

   The order (and so the first view) depends on where you opened it:
     MSSViews.open(entry, {
       order: ['info', 'rate', 'note'],   // lists, friends' activity
              ['note', 'rate', 'info'],   // notes
              ['rate', 'note', 'info'],   // your library / dashboard
       start: 'info',          // optional: open on this view instead of the first
       own: true,              // your entry → Edit / Delete…, editable note
       writeNote: true,        // with own: show Note even when empty (opens the editor)
       profile,                // their profile, for "Sam's rating"
       counts,                 // note 👍/👎, if the page already has them
       onChange(entry), onDelete(entry), onNoteSaved(entry), from,
       note: { open(entry), close() },   // optional: a page's own note popup (e.g. Community
                                         // notes with reactions + replies). It puts
                                         // MSSViews.barFor('note', id) at the top of its card.
     })

   Requires info-popup.js, rating-popup.js, note-popup.js.
═══════════════════════════════════════════════════════════════ */

const MSSViews = (() => {
  const VIEWS = {
    info: { label: 'Info',    ico: 'info',     slot: 'mssInfoViews', card: 'mssInfoCard' },
    rate: { label: 'Ratings', ico: 'trophy',   slot: 'mssRateViews', card: 'mssRateCard' },
    note: { label: 'Note',    ico: 'notebook', slot: 'mssNoteViews', card: null },        // .note-popup2
  };
  let st = null;   // { e, views, cur, o, refreshed }

  const isRated = e => e.status === 'completed' || e.status === 'ongoing' || liveScore(e) != null;
  const hasNote = e => !!(e.notes && e.notes.trim());
  // writeNote: your own entry gets the Note view even before it has one (to write it)
  const available = (e, order, o) => order.filter(v => v === 'info' || (v === 'rate' && isRated(e)) || (v === 'note' && (hasNote(e) || (o.own && o.writeNote))));
  const cardOf = v => v === 'note' ? document.querySelector('#mssNoteOverlay .note-popup2') : document.getElementById(VIEWS[v].card);

  function closeAll() { MSSInfo.close(); MSSRate.close(); MSSNote.close(); st?.o.note?.close(); }

  function barHTML() {
    return `<div class="mss-views-bar" role="tablist" aria-label="Views">${st.views.map(v => {
      const on = v === st.cur;
      return `<button type="button" role="tab" class="mss-views-tab${on ? ' active' : ''}" aria-selected="${on}" ${on ? '' : `onclick="MSSViews.show('${v}')"`}>${icon(VIEWS[v].ico, 13)}<span>${VIEWS[v].label}</span></button>`;
    }).join('')}</div>`;
  }

  function show(v) {
    if (!st || !st.views.includes(v)) return;
    const { e, o } = st;
    st.cur = v;
    // Swap popups without their fade / slide so it feels like one popup
    document.body.classList.add('mss-switching');
    try {
      closeAll();
      Object.values(VIEWS).forEach(x => { const el = document.getElementById(x.slot); if (el) el.innerHTML = ''; });
      const cbs = { from: o.from, onChange: o.onChange, onDelete: o.onDelete, noRefresh: st.refreshed };
      if (v === 'info') o.own ? MSSInfo.forOwnEntry(e, cbs) : MSSInfo.fromEntry(e);
      if (v === 'rate') o.own ? MSSRate.forOwnEntry(e, cbs) : MSSRate.forFriend(e, o.profile);
      if (v === 'note' && o.note) o.note.open(e);
      else if (v === 'note') MSSNote.open(e, {
        counts: st.counts, editable: !!o.own,
        eyebrow: o.own ? 'Your Note' : `${o.profile?.display_name || o.profile?.username ? (o.profile.display_name || o.profile.username) + '’s' : 'Their'} Note`,
        onSaved: x => { o.onNoteSaved?.(x); },
      });
      st.refreshed = true;
      if (st.views.length > 1) {
        if (v === 'note' && o.note) bindSwipe(document.querySelector('#snPopupCard'));   // custom popup renders its own bar
        else {
          const slot = document.getElementById(VIEWS[v].slot);
          // No slot = an old cached copy of info-popup / rating-popup / note-popup.js
          if (slot) { slot.innerHTML = barHTML(); bindSwipe(cardOf(v)); }
          else console.warn('MSSViews: popup file is out of date (no switcher slot) — hard refresh to update.');
        }
      }
    } finally {
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('mss-switching')));
    }
  }

  // For a page's own note popup: the switcher markup for the top of its card
  // ('' when this entry wasn't opened through MSSViews)
  function barFor(view, id) {
    if (!st || st.cur !== view || st.views.length < 2) return '';
    if (id != null && String(st.e.id) !== String(id) && String(st.e.entry_id) !== String(id)) return '';
    return `<div class="mss-views">${barHTML()}</div>`;
  }

  function step(dir) {
    if (!st) return;
    const i = st.views.indexOf(st.cur) + dir;
    if (i >= 0 && i < st.views.length) show(st.views[i]);
  }

  // Swipe left / right on the popup → next / previous view
  function bindSwipe(card) {
    if (!card || card._mssSwipe) return;
    card._mssSwipe = true;
    let x0 = null, y0 = null;
    card.addEventListener('touchstart', ev => {
      if (!st || ev.target.closest('textarea, input, .mss-cast, .pvi-seasons, .lp-posters')) { x0 = null; return; }
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY;
    }, { passive: true });
    card.addEventListener('touchend', ev => {
      if (x0 == null || !st) return;
      const dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  document.addEventListener('keydown', ev => {
    if (!st || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const anyOpen = document.querySelector('#mssInfoOverlay.open, #mssRateOverlay.open, #mssNoteOverlay.open') || document.getElementById('snPopupOverlay')?.style.display === 'flex';
    if (!anyOpen || ![...document.querySelectorAll('.mss-views-bar')].some(b => b.offsetParent)) return;
    step(ev.key === 'ArrowRight' ? 1 : -1);
  });

  // Rows from a feed (e.g. Community notes) may not carry the full entry —
  // fetch it once so Ratings / Info have everything they need.
  async function full(e) {
    if (e.ratings && e.status) return e;
    const id = e.entry_id || e.id;
    if (!id || String(id).startsWith('tmdb:')) return e;
    try {
      const { data } = await sb.from('entries').select('*').eq('id', id).single();
      return data ? Object.assign({}, e, data) : e;
    } catch { return e; }
  }

  async function open(entry, o = {}) {
    if (!entry) return;
    const e = await full(entry);
    const views = available(e, o.order || ['info', 'rate', 'note'], o);
    st = { e, o, views, cur: null, refreshed: false, counts: o.counts };
    if (!o.counts && hasNote(e) && views.includes('note') && typeof MSSNote.reactionCounts === 'function') {
      MSSNote.reactionCounts([e.id]).then(c => { if (st && st.e === e) st.counts = c[e.id]; }).catch(() => {});
    }
    show(o.start && views.includes(o.start) ? o.start : views[0]);
  }

  return { open, show, barFor };
})();
