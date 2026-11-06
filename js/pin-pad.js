/* ══════════════════════════════════════════
   pin-pad.js — MSSPinPad, the passcode keypad (Messages passcode, 100)
   Used by the Messages lock screen (messages.js) and the Set / Change / Remove
   passcode popups (settings.html).

   Dots that fill as you type and a square number keypad, like a phone's lock screen.
   A keyboard works too, but only digits go in: letters, spaces and symbols are
   ignored (pasting keeps just the digits), Backspace takes one off, Enter submits.
   A full-length code submits by itself.

   The real field is a password input under the dots with no on-screen keyboard
   (inputmode none), so screen readers hear a labelled passcode field. It only takes
   focus by itself where there's a mouse; on phones you tap the keypad.

     const pad = MSSPinPad.mount(host, {
       label: 'Enter your passcode',   // shown above the dots
       labelledby: 'someId',           // …or name it by a heading you already have (no label shown)
       submit: 'Unlock',               // the text key at the bottom left (Delete is bottom right)
       min: 4, max: 6,
       onSubmit: async pin => {},      // the keypad waits while this runs
     });
     pad.wrong(msg)          shake, clear, show msg
     pad.say(msg)            show msg (no shake)
     pad.step(label, submit) next question: clear, new label and key text
     pad.clear() · pad.focus() · pad.focusTarget()
══════════════════════════════════════════ */
const MSSPinPad = (() => {
  let n = 0;
  const hasMouse = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isDigit = k => /^[0-9]$/.test(k);

  function mount(host, { label = '', labelledby = '', submit = 'OK', min = 4, max = 6, onSubmit } = {}) {
    const id = 'pinPad' + (++n), labelId = labelledby || id + 'L';
    const key = d => `<button type="button" class="pin-key" data-d="${d}">${d}</button>`;
    host.innerHTML = `<div class="pin-pad" role="group" aria-labelledby="${labelId}">
        ${labelledby ? '' : `<div class="pin-label" id="${labelId}">${escHTML(label)}</div>`}
        <div class="pin-field">
          <input class="pin-input" id="${id}" type="password" inputmode="none" autocomplete="off" spellcheck="false" maxlength="${max}"
            aria-labelledby="${labelId}" aria-describedby="${id}M ${id}R" data-1p-ignore data-lpignore="true" data-form-type="other">
          <div class="pin-dots" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i${i >= min ? ' class="opt"' : ''}></i>`).join('')}</div>
        </div>
        <div class="sr-only" id="${id}R">${min} to ${max} digits</div>
        <div class="pin-msg" id="${id}M" aria-live="polite"></div>
        <div class="pin-keys">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}
          <button type="button" class="pin-key pin-go" disabled>${escHTML(submit)}</button>
          ${key(0)}
          <button type="button" class="pin-key pin-del" disabled>Delete</button>
        </div>
        <div class="sr-only" aria-live="polite" id="${id}S"></div>
      </div>`;
    const wrap = host.firstElementChild, input = wrap.querySelector('.pin-input'), field = wrap.querySelector('.pin-field');
    const dots = [...wrap.querySelectorAll('.pin-dots i')], msg = wrap.querySelector('.pin-msg'), spoken = wrap.querySelector('#' + id + 'S');
    const go = wrap.querySelector('.pin-go'), del = wrap.querySelector('.pin-del');
    let val = '', busy = false;

    function paint() {
      input.value = val;
      dots.forEach((d, i) => d.classList.toggle('on', i < val.length));
      go.disabled = busy || val.length < min;
      del.disabled = busy || !val.length;
      wrap.querySelectorAll('[data-d]').forEach(b => { b.disabled = busy; });
    }
    // The keypad's own buttons say how far you are (typing in the field is read out already)
    const speak = t => { spoken.textContent = ''; requestAnimationFrame(() => { spoken.textContent = t; }); };
    const count = () => speak(val.length === 1 ? '1 digit' : `${val.length} digits`);
    function add(digits, fromKeypad) {
      if (busy) return;
      const before = val;
      val = (val + String(digits).replace(/\D/g, '')).slice(0, max);
      if (val === before) return;
      msg.textContent = '';
      paint();
      if (fromKeypad) count();
      if (val.length === max) submitNow();
    }
    function back(fromKeypad) {
      if (busy || !val) return;
      val = val.slice(0, -1);
      paint();
      if (fromKeypad) count();
    }
    async function submitNow() {
      if (busy) return;
      if (val.length < min) { say(`Use ${min} to ${max} digits.`); return; }
      busy = true; paint();
      try { await onSubmit?.(val); }
      finally { busy = false; if (wrap.isConnected) paint(); }
    }
    function say(t) { msg.textContent = ''; requestAnimationFrame(() => { msg.textContent = t || ''; }); }
    function clear() { val = ''; paint(); }
    function wrong(t) {
      clear();
      say(t);
      field.classList.remove('is-wrong');
      void field.offsetWidth;                 // restart the shake
      field.classList.add('is-wrong');
    }
    function step(newLabel, newSubmit) {
      clear();
      msg.textContent = '';
      if (!labelledby) wrap.querySelector('.pin-label').textContent = newLabel;
      if (newSubmit) go.textContent = newSubmit;
      speak(newLabel);
    }
    const focusTarget = () => (hasMouse() ? input : null);
    const focus = () => { const t = focusTarget(); if (t) t.focus({ preventScroll: true }); };

    field.addEventListener('animationend', () => field.classList.remove('is-wrong'));
    // Tapping the dots on a phone does nothing (no keyboard to bring up); with a mouse it puts you in the field
    field.addEventListener('click', focus);
    // Mouse clicks on the keypad leave focus where it was, so you can carry on typing
    wrap.querySelector('.pin-keys').addEventListener('mousedown', ev => { if (ev.target.closest('.pin-key')) ev.preventDefault(); });
    wrap.querySelector('.pin-keys').addEventListener('click', ev => {
      const b = ev.target.closest('.pin-key');
      if (!b || b.disabled) return;
      if (b.dataset.d != null) add(b.dataset.d, true);
      else if (b === del) back(true);
      else if (b === go) submitNow();
    });

    // Keyboard: only digits, Backspace and Enter do anything
    function onKey(ev, inField) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;      // paste, copy, browser shortcuts
      if (isDigit(ev.key)) { add(ev.key); return true; }
      if (ev.key === 'Backspace') { back(); return true; }
      if (ev.key === 'Enter' && inField) { submitNow(); return true; }
      if (inField && (ev.key.length === 1 || ev.key === 'Delete')) return true;   // letters, spaces, symbols: ignored
      return false;
    }
    input.addEventListener('keydown', ev => { if (onKey(ev, true)) ev.preventDefault(); });
    input.addEventListener('paste', ev => { ev.preventDefault(); add((ev.clipboardData || window.clipboardData)?.getData('text') || ''); });
    // Anything that slips past (autofill, dictation, a keyboard that sends no key name): keep the digits only
    input.addEventListener('input', () => {
      if (busy) { input.value = val; return; }
      const typed = input.value.replace(/\D/g, '');
      val = '';
      add(typed);
      paint();
    });
    // Typing while a keypad key, the card around it or nothing at all has focus still goes in
    function onDocKey(ev) {
      if (!wrap.isConnected) { document.removeEventListener('keydown', onDocKey); return; }
      if (ev.defaultPrevented || ev.target === input) return;
      const ae = document.activeElement;
      const here = !ae || ae === document.body || ae.contains(wrap) || (wrap.contains(ae) && ae.classList.contains('pin-key'));
      if (here && onKey(ev, false)) ev.preventDefault();
    }
    document.addEventListener('keydown', onDocKey);

    paint();
    return { el: wrap, clear, wrong, say, step, focus, focusTarget };
  }
  return { mount };
})();
