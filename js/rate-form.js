/* ══════════════════════════════════════════
   rate-form.js — entering a title's ratings (the Edit page's Ratings tab, and Import's detailed rating)
   Reads the one category list (MSS_RATING_GROUPS, config.js). The Edit page redesign's look:
     · two columns where there's room (a container query): Core ratings · Bonus ratings, each with how
       many are rated;
     · each group is a card — its name, its average (as on the view page), then its ratings;
     · a rating is one row: name (+ ⓘ hint) · − · a 10-segment bar · + · the value. Click the bar (or drag
       along it) to set it in 0.5 steps (the left half of a segment is .5); hover shows "Set 7.5"; − / + are
       0.5 steps (the episode rater's buttons) — on an unrated one, + starts at 5.0 and − does nothing; − at 0.0 makes it unrated; the
       value can be typed (0–10). The bar is a slider for the keyboard: ← → 0.5 (from unrated: 5.0),
       PgUp / PgDn 1, Home / End 0 / 10, Delete clears. Narrow (phones, panels): name and value on one line, the bar under;
     · Bonus: rated ones are rows, the rest "+ name" chips (Suggested ones marked); a group with nothing
       rated folds to "Not rated · 3". Live action's Animation Quality is a "+" chip in its group.
   Unrated stays "—"; emptying the number clears it.

     MSSRateForm.mount(el, { cat, isMovie, genres, ratings, onChange })
       ratings is changed in place (the caller's object); onChange(ratings) after every change.
     MSSRateForm.row(key, label, value, opts)   one rating on its own (Import's single overall score)
     MSSRateForm.wire(el, onSet)                 makes rows drawn with row() work: onSet(key, value | null)
══════════════════════════════════════════ */
const MSSRateForm = (() => {
  const has = v => v !== undefined && v !== null && v !== '' && !isNaN(Number(v));
  const fmt = v => mssR1(Number(v));
  const snap = v => Math.max(0, Math.min(10, Math.round(Number(v) * 2) / 2));
  let uid = 0;

  const segs = v => Array.from({ length: 10 }, (_, i) => `<i style="--f:${has(v) ? Math.max(0, Math.min(1, Number(v) - i)) : 0}"></i>`).join('');
  function row(key, label, value, o = {}) {
    const id = `rf${++uid}-${key}`, on = has(value);
    return `<div class="rf-row${on ? mssTierCls(value) : ' is-empty'}" data-key="${key}" data-v="${on ? Number(value) : ''}">
      <div class="rf-name">
        <span class="rf-label" id="${id}-l">${escHTML(label)}</span>
        ${o.suggested ? `<span class="up-next-tag rf-sugg">Suggested<span class="sr-only"> for this title</span></span>` : ''}
        ${o.hint ? `<button type="button" class="rf-hint" aria-label="About ${escHTML(label)}" aria-expanded="false" aria-controls="${id}-h">${icon('info', 13)}</button>` : ''}
        <button type="button" class="rf-clear" aria-label="Clear ${escHTML(label)} (not rated)" title="Clear: not rated">${icon('x', 13)}</button>
      </div>
      <button type="button" class="ep-step rf-step" data-delta="-0.5" aria-label="Lower ${escHTML(label)}">${icon('minus', 14)}</button>
      <div class="rf-bar" role="slider" tabindex="0" aria-labelledby="${id}-l" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${on ? Number(value) : 0}" aria-valuetext="${on ? fmt(value) : 'Not rated'}"${o.hint ? ` aria-describedby="${id}-h"` : ''}>
        <span class="rf-segs" aria-hidden="true">${segs(value)}</span><span class="rf-set" aria-hidden="true" hidden></span></div>
      <button type="button" class="ep-step rf-step" data-delta="0.5" aria-label="Raise ${escHTML(label)}">${icon('plus', 14)}</button>
      <input class="rf-val" type="text" inputmode="decimal" data-mask="rating" maxlength="4" value="${on ? fmt(value) : ''}" placeholder="—" aria-label="${escHTML(label)}, out of 10">
      ${o.hint ? `<p class="rf-tip" id="${id}-h" hidden>${escHTML(o.hint)}</p>` : ''}
    </div>`;
  }

  // Reflect a value on a row without redrawing it (so typing and dragging stay smooth)
  function show(rowEl, v) {
    const on = v != null, val = rowEl.querySelector('.rf-val'), bar = rowEl.querySelector('.rf-bar');
    rowEl.classList.toggle('is-empty', !on); mssSetTier(rowEl, on ? v : null);   // the bar and number in its tier's colour
    if (document.activeElement !== val) val.value = on ? fmt(v) : '';
    rowEl.querySelectorAll('.rf-segs i').forEach((s, i) => s.style.setProperty('--f', on ? Math.max(0, Math.min(1, v - i)) : 0));
    bar.setAttribute('aria-valuenow', on ? v : 0); bar.setAttribute('aria-valuetext', on ? fmt(v) : 'Not rated');
    rowEl.dataset.v = on ? v : '';
  }
  function closeTips(except) {
    document.querySelectorAll('.rf-hint[aria-expanded="true"]').forEach(b => {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      document.getElementById(b.getAttribute('aria-controls')).hidden = true;
    });
  }
  // A tip closes with Escape or a tap anywhere else (added once for the page)
  document.addEventListener('click', ev => { if (!ev.target.closest('.rf-hint')) closeTips(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeTips(); });

  // the value under the pointer, in 0.5 steps: 0.5–10 (the left half of a segment is its .5)
  const segAt = (bar, x) => { const r = bar.getBoundingClientRect(); let f = (x - r.left) / r.width; if (getComputedStyle(bar).direction === 'rtl') f = 1 - f; return Math.max(0.5, Math.min(10, Math.ceil(f * 20) / 2)); };
  const START = 5;   // + (or →) on a rating that has no value yet

  function wire(el, onSet) {
    el._rfOnSet = onSet;               // the latest drawing's handler: listeners are added once
    if (el._rfWired) return;
    el._rfWired = true;
    const set = (rowEl, v, how) => { show(rowEl, v); el._rfOnSet(rowEl.dataset.key, v, how); };
    const now = rowEl => has(rowEl.dataset.v) ? Number(rowEl.dataset.v) : null;
    el.addEventListener('change', ev => {
      const rowEl = ev.target.closest('.rf-row');
      if (!rowEl || !ev.target.classList.contains('rf-val')) return;
      const s = ev.target.value.trim(), n = parseFloat(s);
      if (s === '' || s === '—') set(rowEl, null);
      else if (!isNaN(n)) { set(rowEl, snap(n)); ev.target.value = fmt(snap(n)); }
      else ev.target.value = has(rowEl.dataset.v) ? fmt(rowEl.dataset.v) : '';
    });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const rowEl = b.closest('.rf-row');
      if (b.classList.contains('rf-step') && rowEl) {
        const v = now(rowEl), d = Number(b.dataset.delta);
        if (v == null && d < 0) return;
        // − at 0.0: not rated (like ×), focus stays on −
        if (v === 0 && d < 0) return set(rowEl, null, { cleared: true, step: true });
        set(rowEl, v == null ? START : snap(v + d));
      }
      // ×: back to "—", as if it was never rated
      if (b.classList.contains('rf-clear') && rowEl && now(rowEl) != null) set(rowEl, null, { cleared: true });
      if (b.classList.contains('rf-hint')) {
        const tip = document.getElementById(b.getAttribute('aria-controls')), open = tip.hidden;
        closeTips(b);
        tip.hidden = !open; b.setAttribute('aria-expanded', String(open));
      }
    });
    // the bar: click a segment, or drag along it
    let drag = null;
    el.addEventListener('pointerdown', ev => {
      const bar = ev.target.closest('.rf-bar'); if (!bar || ev.button > 0) return;
      ev.preventDefault(); bar.focus();
      drag = bar; bar.setPointerCapture?.(ev.pointerId);
      set(bar.closest('.rf-row'), segAt(bar, ev.clientX));
    });
    el.addEventListener('pointermove', ev => {
      const bar = ev.target.closest('.rf-bar');
      if (drag) { const n = segAt(drag, ev.clientX); if (n !== now(drag.closest('.rf-row'))) set(drag.closest('.rf-row'), n); }
      if (!bar || ev.pointerType !== 'mouse') return;
      const n = segAt(bar, ev.clientX), tag = bar.querySelector('.rf-set');
      tag.hidden = false; tag.textContent = `Set ${n % 1 ? fmt(n) : n}`; tag.style.setProperty('--at', `${(n - .25) * 10}%`);
    });
    const end = () => { drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('pointerout', ev => { const bar = ev.target.closest('.rf-bar'); if (bar && !bar.contains(ev.relatedTarget)) bar.querySelector('.rf-set').hidden = true; });
    el.addEventListener('keydown', ev => {
      const bar = ev.target.closest('.rf-bar'); if (!bar) return;
      const rowEl = bar.closest('.rf-row'), v = now(rowEl), rtl = getComputedStyle(bar).direction === 'rtl';
      const step = { ArrowRight: rtl ? -0.5 : 0.5, ArrowUp: 0.5, ArrowLeft: rtl ? 0.5 : -0.5, ArrowDown: -0.5, PageUp: 1, PageDown: -1 }[ev.key];
      let to;
      if (step != null) to = v == null ? (step > 0 ? START : null) : snap(v + step);
      else if (ev.key === 'Home') to = 0;
      else if (ev.key === 'End') to = 10;
      else if (ev.key === 'Delete' || ev.key === 'Backspace') to = null;
      else return;
      ev.preventDefault();
      if (to !== v) set(rowEl, to);
    });
  }

  function mount(el, o) {
    const R = o.ratings, animated = o.cat === 'anime' || o.cat === 'cartoons';
    const groups = mssRatingGroups(o.cat, o.isMovie);
    const suggested = new Set(mssRatingSuggest(o.cat, o.isMovie, o.genres, R));
    el._rfAdded = el._rfAdded || new Set();      // bonus ratings added with their "+" chip (shown even before they're rated)
    el._rfOpen = el._rfOpen || new Set();        // folded bonus groups opened
    if (animated) delete R._animEnabled;
    const shownRow = (g, x) => g.kind === 'core' ? (!x.toggle || R._animEnabled) : has(R[x.key]) || el._rfAdded.has(x.key);
    const chips = g => g.items.filter(x => !shownRow(g, x) && (g.kind === 'bonus' || x.toggle));
    const avgOf = g => { const v = g.items.filter(x => shownRow(g, x)).map(x => R[x.key]).filter(has).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const chipHTML = (g, x) => `<button type="button" class="rf-add${suggested.has(x.key) ? ' is-sugg' : ''}" data-add="${x.key}">${icon('plus', 12)}<span>${escHTML(x.label)}</span>${suggested.has(x.key) ? '<span class="rf-add-s">Suggested</span>' : ''}</button>`;
    const groupHTML = g => {
      const rows = g.items.filter(x => shownRow(g, x)), add = chips(g);
      const folded = g.kind === 'bonus' && !rows.length && !el._rfOpen.has(g.id);
      return `<section class="rf-card${folded ? ' is-folded' : ''}" data-group="${g.id}" aria-labelledby="rfG-${g.id}">
        <div class="rf-card-h"><h4 class="rf-card-t" id="rfG-${g.id}">${escHTML(g.name)}</h4>
          ${g.kind === 'bonus' && !rows.length ? `<button type="button" class="rf-fold" data-fold="${g.id}" aria-expanded="${!folded}" aria-controls="rfB-${g.id}">Not rated · ${add.length}${icon('chevdown', 14)}</button>` : `<b class="rf-avg" data-avg="${g.id}"></b>`}</div>
        <div class="rf-card-b" id="rfB-${g.id}"${folded ? ' hidden' : ''}>
          ${rows.length ? `<div class="rf-rows">${rows.map(x => row(x.key, x.label, R[x.key], { hint: x.hint, suggested: g.kind === 'bonus' && suggested.has(x.key) && !has(R[x.key]) })).join('')}</div>` : ''}
          ${add.length ? `<div class="rf-adds">${add.map(x => chipHTML(g, x)).join('')}</div>` : ''}
        </div></section>`;
    };
    const col = kind => `<section class="rf-col" data-kind="${kind}" aria-labelledby="rfC-${kind}">
        <div class="rf-col-h"><h3 class="rf-col-t" id="rfC-${kind}">${kind === 'core' ? 'Core ratings' : 'Bonus ratings'}</h3><small class="rf-col-n" data-n="${kind}"></small></div>
        ${groups.filter(g => g.kind === kind).map(groupHTML).join('')}</section>`;
    el.innerHTML = `<div class="rf-wrap"><div class="rf-cols">${col('core')}${col('bonus')}</div></div>`;

    const paint = () => {
      groups.forEach(g => { const a = avgOf(g), s = el.querySelector(`[data-avg="${g.id}"]`); if (s) { s.textContent = a == null ? '—' : a.toFixed(2).replace(/0$/, ''); s.classList.toggle('is-none', a == null); mssSetTier(s, a); } });
      ['core', 'bonus'].forEach(kind => {
        const items = groups.filter(g => g.kind === kind).flatMap(g => g.items.filter(x => kind === 'bonus' || !x.toggle || R._animEnabled));
        const n = items.filter(x => has(R[x.key])).length;
        el.querySelector(`[data-n="${kind}"]`).textContent = `${n} of ${items.length} rated`;
      });
    };

    wire(el, (key, v, how) => {
      if (v == null) delete R[key]; else R[key] = v;
      const rowEl = el.querySelector(`.rf-row[data-key="${key}"]`);
      if (rowEl && v != null) rowEl.querySelector('.rf-sugg')?.remove();
      paint();
      o.onChange?.(R);
      // a bonus rating cleared with × goes back to its "+ name" chip
      if (how?.cleared && groups.some(g => g.kind === 'bonus' && g.items.some(x => x.key === key))) {
        el._rfAdded.delete(key);
        mount(el, o);
        el.querySelector(`[data-add="${key}"]`)?.focus();
      } else if (how?.cleared && !how.step) rowEl?.querySelector('.rf-bar')?.focus();
    });
    el.onclick = ev => {
      const add = ev.target.closest('[data-add]'), fold = ev.target.closest('[data-fold]');
      if (add) {
        const k = add.dataset.add;
        if (groups.some(g => g.kind === 'core' && g.items.some(x => x.key === k && x.toggle))) { R._animEnabled = true; o.onChange?.(R); }
        else el._rfAdded.add(k);
        mount(el, o);
        el.querySelector(`.rf-row[data-key="${k}"] .rf-bar`)?.focus();
      }
      if (fold) {
        const id = fold.dataset.fold;
        if (!el._rfOpen.delete(id)) el._rfOpen.add(id);
        mount(el, o);
        el.querySelector(`[data-fold="${id}"]`)?.focus();
      }
    };
    paint();
  }

  return { mount, row, wire };
})();
