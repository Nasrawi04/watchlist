/* ════════════════════════════════════════════════════════════
   easter-egg.js — MSSEgg: little surprises tied to a title
   Load after config.js. Adding one = one entry in EGGS below.

   An egg can have (all optional except id + match):
     id           unique name — also how "already shown this visit" is remembered
     match(e)     true for the title(s) it belongs to (e = the entry: tmdb_id, tmdb_type, title…)
     placeholder  what the empty note box says for that title
     onType(box)  runs when you start writing that title's note in an empty box — again
                  every time you come back to it empty — box = the box you're typing in
     confirm      { title, message, ok, cancel, stamp } — asked before a new or changed note is saved
     saved        the toast after the note is saved
     spoiler      { title, sub, cardSub, tag, toggle } — its spoiler notes: the cover's button,
                  the covered note on Create Card, the small tag and the "Mark as spoiler"
                  switch say this instead

   Hooks the app calls:
     MSSEgg.noteBox(textarea, getEntry)          — the Notes popup and the detail page's note box
     MSSEgg.beforeNoteSave(e, notes, before)     — resolves false to stop the save
     MSSEgg.savedMsg(e, plain)                   — the toast text after saving
     MSSEgg.spoiler(e)                           — that title's spoiler wording, or null (config.js uses it)
   Styles: "Easter eggs" in css/style.css.
   ════════════════════════════════════════════════════════════ */
const MSSEgg = (() => {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // a rubber stamp pinned to the box's corner; lines = [[heading, small line], …] shown one after another
  function stamp(box, lines, gap = 2600) {
    document.querySelector('.mss-egg-stamp')?.remove();
    const r = box.getBoundingClientRect(), st = document.createElement('div');
    st.className = 'mss-egg-stamp'; st.setAttribute('role', 'status');
    st.style.top = Math.max(12, r.top + 10) + 'px';
    st.style.insetInlineEnd = Math.max(12, (document.documentElement.dir === 'rtl' ? r.left : window.innerWidth - r.right) + 10) + 'px';
    const say = ([h, s]) => { st.innerHTML = `<b>${escHTML(h)}</b><span>${escHTML(s)}</span>`; st.classList.remove('in'); void st.offsetWidth; st.classList.add('in'); };
    document.body.appendChild(st);
    lines.forEach((l, i) => setTimeout(() => say(l), i * gap));
    const end = lines.length * gap + 400;
    const gone = () => { removeEventListener('scroll', moved, true); st.classList.add('out'); setTimeout(() => st.remove(), 900); };
    const moved = () => { if (Math.abs(box.getBoundingClientRect().top - r.top) > 40) gone(); };   // pinned to the screen — goes once the box scrolls away
    setTimeout(gone, end);
    addEventListener('scroll', moved, { capture: true, passive: true });
  }
  // a quick spliced-frame glitch on an element (skipped for reduced motion)
  function splice(el) {
    if (reduced()) return;
    el.classList.remove('mss-splice'); void el.offsetWidth; el.classList.add('mss-splice');
    setTimeout(() => el.classList.remove('mss-splice'), 1100);
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
      spoiler: { title: 'The first rule of Fight Club', sub: 'You do not talk about Fight Club. Tap to break it.',
        cardSub: 'You do not talk about Fight Club.', tag: 'Rule #1', toggle: 'Mark as spoiler — Rule #1' },
    },
  ];

  const find = e => e && EGGS.find(g => g.match(e));

  function noteBox(ta, getEntry) {
    if (!ta || ta._mssEgg) return;
    ta._mssEgg = true;
    const box = () => ta._mssRich?.ed || ta;               // MSSRich's styled box, once it's attached
    const ph = ta.placeholder;
    ta.parentNode.addEventListener('focusin', () => {
      const v = find(getEntry())?.placeholder || ph;
      ta.placeholder = v; if (ta._mssRich) ta._mssRich.ed.dataset.placeholder = v;
    });
    let was = '';                                          // the text before this keystroke
    ta.parentNode.addEventListener('focusin', () => { was = ta.value.trim(); });
    ta.addEventListener('input', () => {
      const now = ta.value.trim(), started = !was && now, g = started && find(getEntry());
      was = now;
      if (g?.onType) g.onType(box());                      // an empty box got its first words
    });
  }
  function beforeNoteSave(e, notes, before) {
    const g = find(e), c = g?.confirm;
    if (!c || !String(notes || '').trim() || String(notes).trim() === String(before || '').trim()) return Promise.resolve(true);
    return showConfirm({ title: c.title, message: c.message, confirmText: c.ok, cancelText: c.cancel, tone: 'egg',
      iconHTML: c.stamp ? `<span class="mss-egg-confirm-stamp">${escHTML(c.stamp)}</span>` : '' });
  }
  const savedMsg = (e, plain) => find(e)?.saved || plain;
  const spoiler = e => find(e)?.spoiler || null;

  return { noteBox, beforeNoteSave, savedMsg, spoiler };
})();
