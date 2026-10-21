/* ════════════════════════════════════════════════════════════
   easter-egg.js — MSSEgg: little surprises tied to a title
   Load after config.js. Adding one = one entry in EGGS below.

   An egg can have (all optional except id + match):
     id           unique name — also how "already shown this visit" is remembered
     match(e)     true for the title(s) it belongs to (e = the entry: tmdb_id, tmdb_type, title…)
     placeholder  what the empty note box says for that title
     onType(box)  runs the first time you type in that title's note (once per visit) —
                  box = the box you're typing in
     confirm      { title, message, ok, cancel, stamp } — asked before a new or changed note is saved
     saved        the toast after the note is saved

   Hooks the app calls:
     MSSEgg.noteBox(textarea, getEntry)          — the Notes popup and the detail page's note box
     MSSEgg.beforeNoteSave(e, notes, before)     — resolves false to stop the save
     MSSEgg.savedMsg(e, plain)                   — the toast text after saving
   Styles: "Easter eggs" in css/style.css.
   ════════════════════════════════════════════════════════════ */
const MSSEgg = (() => {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // a rubber stamp pinned to the box's corner; lines = [[heading, small line], …] shown one after another
  function stamp(box, lines, gap = 1700) {
    document.querySelector('.mss-egg-stamp')?.remove();
    const r = box.getBoundingClientRect(), st = document.createElement('div');
    st.className = 'mss-egg-stamp'; st.setAttribute('role', 'status');
    st.style.top = Math.max(12, r.top + 10) + 'px';
    st.style.insetInlineEnd = Math.max(12, (document.documentElement.dir === 'rtl' ? r.left : window.innerWidth - r.right) + 10) + 'px';
    const say = ([h, s]) => { st.innerHTML = `<b>${escHTML(h)}</b><span>${escHTML(s)}</span>`; st.classList.remove('in'); void st.offsetWidth; st.classList.add('in'); };
    document.body.appendChild(st);
    lines.forEach((l, i) => setTimeout(() => say(l), i * gap));
    const end = lines.length * gap + 200;
    const gone = () => { removeEventListener('scroll', moved, true); st.classList.add('out'); setTimeout(() => st.remove(), 500); };
    const moved = () => { if (Math.abs(box.getBoundingClientRect().top - r.top) > 40) gone(); };   // pinned to the screen — goes once the box scrolls away
    setTimeout(gone, end);
    addEventListener('scroll', moved, { capture: true, passive: true });
  }
  // a quick spliced-frame glitch on an element (skipped for reduced motion)
  function splice(el) {
    if (reduced()) return;
    el.classList.remove('mss-splice'); void el.offsetWidth; el.classList.add('mss-splice');
    setTimeout(() => el.classList.remove('mss-splice'), 600);
  }

  const EGGS = [
    { // Fight Club: writing a note about it means talking about it
      id: 'fightclub',
      match: e => Number(e?.tmdb_id) === 550 && (e?.tmdb_type || 'movie') === 'movie',
      placeholder: 'Shh… keep it down.',
      onType: box => { splice(box); stamp(box, [['Rule #1', 'You just broke it.'], ['Rule #2', 'Yep. That one too.']]); },
      confirm: { title: 'Breaking the rules?', stamp: 'Rule #1', ok: 'Break them', cancel: 'Keep quiet',
        message: 'Posting this note means talking about it — that’s rule #1 and rule #2 gone. Save it anyway?' },
      saved: 'Saved. Nobody talks about it.',
    },
  ];

  const find = e => e && EGGS.find(g => g.match(e));
  const seen = new Set();                                  // `${egg}:${entry}` — once per visit
  const key = (g, e) => `${g.id}:${e?.id || 'new'}`;

  function noteBox(ta, getEntry) {
    if (!ta || ta._mssEgg) return;
    ta._mssEgg = true;
    const box = () => ta._mssRich?.ed || ta;               // MSSRich's styled box, once it's attached
    const ph = ta.placeholder;
    ta.parentNode.addEventListener('focusin', () => {
      const v = find(getEntry())?.placeholder || ph;
      ta.placeholder = v; if (ta._mssRich) ta._mssRich.ed.dataset.placeholder = v;
    });
    ta.addEventListener('input', () => {
      const e = getEntry(), g = find(e);
      if (!g?.onType || seen.has(key(g, e)) || !ta.value.trim()) return;
      seen.add(key(g, e));
      g.onType(box());
    });
  }
  function beforeNoteSave(e, notes, before) {
    const g = find(e), c = g?.confirm;
    if (!c || !String(notes || '').trim() || String(notes).trim() === String(before || '').trim()) return Promise.resolve(true);
    return showConfirm({ title: c.title, message: c.message, confirmText: c.ok, cancelText: c.cancel, tone: 'egg',
      iconHTML: c.stamp ? `<span class="mss-egg-confirm-stamp">${escHTML(c.stamp)}</span>` : '' });
  }
  const savedMsg = (e, plain) => find(e)?.saved || plain;

  return { noteBox, beforeNoteSave, savedMsg };
})();
