/* ══════════════════════════════════════════
   rate-form.js — Rate This: entering a title's ratings (the title page, and Import's detailed rating)
   Reads the one category list (MSS_RATING_GROUPS, config.js) and draws:
     Core groups · "+ Enable Animation Quality" (live action) ·
     "+ Bonus ratings · optional" (open when any bonus is rated) · Bonus groups with Suggested badges.
   The groups sit two to a row on wide screens (an odd one out spans the width), one under another on phones.
   The whole Bonus section opens and closes; its groups don't fold on their own.
   Each rating is − / + (0.5 at a time) around a number you can type, 0 to 10, with a thin meter along
   the bottom. Unrated stays "—" until touched; emptying the number clears it. The ⓘ hint sits with − / +
   in the middle of the card's height, and its text shows under the rating's name, in space every card keeps
   for it, so opening one never changes a card's size.

     MSSRateForm.mount(el, { cat, isMovie, genres, ratings, onChange })
       ratings is changed in place (the caller's object); onChange(ratings) after every change.
     MSSRateForm.row(key, label, value, opts)   one rating on its own (Import's single overall score)
     MSSRateForm.wire(el, onSet)                 makes rows drawn with row() work: onSet(key, value | null)
══════════════════════════════════════════ */
const MSSRateForm = (() => {
  const has = v => v !== undefined && v !== null && v !== '' && !isNaN(Number(v));
  const fmt = v => Number(v).toFixed(1);
  const snap = v => Math.max(0, Math.min(10, Math.round(Number(v) * 2) / 2));
  let uid = 0;

  function row(key, label, value, o = {}) {
    const id = `rf${++uid}-${key}`, on = has(value);
    return `<div class="rf-row${on ? '' : ' is-empty'}" data-key="${key}" data-v="${on ? Number(value) : ''}">
      <div class="rf-text">
        <div class="rf-name">
          <span class="rf-label" id="${id}-l">${escHTML(label)}</span>
          ${o.suggested ? `<span class="up-next-tag rf-sugg">Suggested<span class="sr-only"> for this title</span></span>` : ''}
        </div>
        ${o.hint ? `<p class="rf-tip" id="${id}-h" hidden>${escHTML(o.hint)}</p>` : ''}
      </div>
      <span class="rf-controls">
          ${o.hint ? `<button type="button" class="rf-hint" aria-label="About ${escHTML(label)}" aria-expanded="false" aria-controls="${id}-h">${icon('info', 13)}</button>` : ''}
          <button type="button" class="ep-btn rf-step" data-delta="-0.5" aria-label="Lower ${escHTML(label)}">−</button>
          <input class="rf-val" type="text" inputmode="decimal" data-mask="rating" maxlength="4" value="${on ? fmt(value) : ''}" placeholder="—" aria-labelledby="${id}-l"${o.hint ? ` aria-describedby="${id}-h"` : ''}>
          <button type="button" class="ep-btn rf-step" data-delta="0.5" aria-label="Raise ${escHTML(label)}">+</button>
      </span>
      <span class="rf-meter" aria-hidden="true"><i style="width:${on ? Number(value) * 10 : 0}%"></i></span>
    </div>`;
  }

  // Reflect a value on a row without redrawing it (so typing stays smooth)
  function show(rowEl, v) {
    const on = v != null, val = rowEl.querySelector('.rf-val');
    rowEl.classList.toggle('is-empty', !on);
    if (document.activeElement !== val) val.value = on ? fmt(v) : '';
    rowEl.querySelector('.rf-meter i').style.width = (on ? v * 10 : 0) + '%';
    rowEl.dataset.v = on ? v : '';
  }
  function closeTips(except) {
    document.querySelectorAll('.rf-hint[aria-expanded="true"]').forEach(b => {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      document.getElementById(b.getAttribute('aria-controls')).hidden = true;
    });
  }
  // A tip closes with Escape or a tap anywhere else (added once for the page). Escape also beats hover,
  // until the pointer leaves that ⓘ.
  document.addEventListener('click', ev => { if (!ev.target.closest('.rf-hint')) closeTips(); });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    closeTips();
    document.querySelectorAll('.rf-hint:hover').forEach(b => b.classList.add('is-shut'));
  });
  document.addEventListener('pointerout', ev => { if (ev.target.classList?.contains('rf-hint')) ev.target.classList.remove('is-shut'); });

  function wire(el, onSet) {
    el._rfOnSet = onSet;               // the latest drawing's handler: listeners are added once
    if (el._rfWired) return;
    el._rfWired = true;
    const set = (rowEl, v) => { show(rowEl, v); el._rfOnSet(rowEl.dataset.key, v); };
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
      if (b.classList.contains('rf-step')) {
        const now = has(rowEl.dataset.v) ? Number(rowEl.dataset.v) : null, d = Number(b.dataset.delta);
        if (now == null && d < 0) return;
        set(rowEl, snap((now == null ? -0.5 : now) + d));
      }
      if (b.classList.contains('rf-hint')) {
        const tip = document.getElementById(b.getAttribute('aria-controls')), open = tip.hidden;
        closeTips(b);
        tip.hidden = !open; b.setAttribute('aria-expanded', String(open));
      }
    });
  }

  function mount(el, o) {
    const R = o.ratings, animated = o.cat === 'anime' || o.cat === 'cartoons';
    const groups = mssRatingGroups(o.cat, o.isMovie);
    const suggested = new Set(mssRatingSuggest(o.cat, o.isMovie, o.genres, R));
    const bonusKeys = groups.filter(g => g.kind === 'bonus').flatMap(g => g.items.map(x => x.key));
    if (el._rfOpen == null) el._rfOpen = bonusKeys.some(k => has(R[k]));
    const shown = g => g.items.filter(x => !x.toggle || R._animEnabled);
    const avgOf = g => { const v = shown(g).map(x => R[x.key]).filter(has).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const groupHTML = g => `<section class="rf-group" data-group="${g.id}" aria-labelledby="rfG-${g.id}">
        <h3 class="ratings-section-label rf-group-t" id="rfG-${g.id}">${escHTML(g.name)}<span class="rf-group-avg" data-avg="${g.id}"></span></h3>
        <div class="rf-grid">${shown(g).map(x => row(x.key, x.label, R[x.key], { hint: x.hint, suggested: g.kind === 'bonus' && suggested.has(x.key) && !has(R[x.key]) })).join('')}</div>
        ${g.items.some(x => x.toggle) ? `<button type="button" class="anim-toggle-btn${R._animEnabled ? ' on' : ''}" data-anim aria-pressed="${!!R._animEnabled}">${R._animEnabled ? '− Disable' : '+ Enable'} Animation Quality</button>` : ''}
      </section>`;
    el.innerHTML = `<div class="det-ratings-col-title">Core Ratings</div>
      <div class="rf-groups">${groups.filter(g => g.kind === 'core').map(groupHTML).join('')}</div>
      <button type="button" class="anim-toggle-btn rf-bonus-btn${el._rfOpen ? ' on' : ''}" data-bonus aria-expanded="${el._rfOpen}" aria-controls="rfBonus">${el._rfOpen ? '− Bonus ratings' : '+ Bonus ratings · optional'}</button>
      <div class="rf-bonus" id="rfBonus"${el._rfOpen ? '' : ' hidden'}>
        <div class="det-ratings-col-title">Bonus Ratings</div>
        <div class="rf-groups">${groups.filter(g => g.kind === 'bonus').map(groupHTML).join('')}</div>
      </div>`;

    const paint = () => {
      groups.forEach(g => { const a = avgOf(g), s = el.querySelector(`[data-avg="${g.id}"]`); if (s) s.textContent = a == null ? '' : a.toFixed(2).replace(/0$/, ''); });
    };

    wire(el, (key, v) => {
      if (v == null) delete R[key]; else R[key] = v;
      const rowEl = el.querySelector(`.rf-row[data-key="${key}"]`);
      if (rowEl && v != null) rowEl.querySelector('.rf-sugg')?.remove();
      paint();
      o.onChange?.(R);
    });
    el.onclick = ev => {
      if (ev.target.closest('[data-bonus]')) { el._rfOpen = !el._rfOpen; mount(el, o); el.querySelector('[data-bonus]').focus(); }
      if (ev.target.closest('[data-anim]')) {
        R._animEnabled = !R._animEnabled;
        if (!R._animEnabled) delete R.animation;
        mount(el, o); el.querySelector('[data-anim]').focus(); o.onChange?.(R);
      }
    };
    if (animated) delete R._animEnabled;
    paint();
  }

  return { mount, row, wire };
})();
