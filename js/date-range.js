/* ═══════════════════════════════════════════════════════════════
   date-range.js — the site's date range picker (Challenges)
   Two big "Starts / Ends" cards with the length between them; tap one and a
   month calendar opens under them with the range shaded. Picking the start
   moves straight on to the end; picking the end closes the calendar.
   Arrow keys move between days, Page Up / Down between months.

   MSSDateRange.html(id, { start, end, min, onChange })   markup ('YYYY-MM-DD'; min = earliest end)
   MSSDateRange.set(id, start, end)                        e.g. from a preset
   MSSDateRange.get(id)                                    → { start, end }
   Hidden inputs #<id>S / #<id>E always hold the chosen dates.

   Requires config.js (icon). Styles: §55 in style.css.
═══════════════════════════════════════════════════════════════ */
const MSSDateRange = (() => {
  const S = {};                          // id → { start, end, min, edit, month, onChange }
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = s => new Date(s + 'T12:00:00');
  const add = (s, n) => { const d = day(s); d.setDate(d.getDate() + n); return iso(d); };
  const lang = () => document.documentElement.lang || undefined;
  const fmt = (s, o) => day(s).toLocaleDateString(lang(), o);
  const days = (a, b) => Math.round((day(b) - day(a)) / 864e5);
  const lenText = st => {
    const n = days(st.start, st.end);
    if (!n) return 'Same day';
    return n % 7 === 0 && n <= 56 ? `${n / 7} ${n === 7 ? 'week' : 'weeks'}` : `${n} ${n === 1 ? 'day' : 'days'}`;
  };

  function html(id, o) {
    const st = S[id] = { start: o.start, end: o.end, min: o.min || null, edit: null, month: o.start.slice(0, 7), onChange: o.onChange || null };
    return `<div class="dr" id="${id}">
        <input type="hidden" id="${id}S" value="${st.start}"><input type="hidden" id="${id}E" value="${st.end}">
        <div class="dr-cards" id="${id}Cards">${cards(id)}</div>
        <div class="dr-cal" id="${id}Cal" hidden></div>
      </div>`;
  }
  function cards(id) {
    const st = S[id];
    const card = (k, label) => `<button type="button" class="dr-card${st.edit === k ? ' active' : ''}" aria-expanded="${st.edit === k}" aria-controls="${id}Cal"
        onclick="MSSDateRange._edit('${id}', '${k}')" aria-label="${label}: ${fmt(st[k], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — change">
        <span class="dr-card-label">${label}</span>
        <span class="dr-card-day">${fmt(st[k], { day: 'numeric' })}</span>
        <span class="dr-card-rest"><b>${fmt(st[k], { month: 'short' })} ${fmt(st[k], { year: 'numeric' })}</b><span>${fmt(st[k], { weekday: 'long' })}</span></span>
        ${icon('edit', 13)}
      </button>`;
    return card('start', 'Starts') + `<span class="dr-len" aria-live="polite">${icon('arrowRight', 14)}<b>${lenText(st)}</b></span>` + card('end', 'Ends');
  }
  function cal(id) {
    const st = S[id], [y, m] = st.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1, 12), lead = (first.getDay() + 6) % 7;      // weeks start on Monday
    const count = new Date(y, m, 0).getDate(), today = iso(new Date());
    const min = st.edit === 'end' ? (st.min && st.min > st.start ? st.min : st.start) : null;   // min = earliest end
    const wk = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i, 12).toLocaleDateString(lang(), { weekday: 'narrow' }));
    const cells = [...Array(lead)].map(() => '<span></span>');
    for (let d = 1; d <= count; d++) {
      const s = `${st.month}-${pad(d)}`, off = min && s < min;
      const cls = ['dr-day', s === st.start && 'is-start', s === st.end && 'is-end', s > st.start && s < st.end && 'in-range', s === today && 'is-today'].filter(Boolean).join(' ');
      const sel = s === st[st.edit];
      cells.push(`<button type="button" class="${cls}" data-d="${s}" tabindex="${sel ? 0 : -1}"${off ? ' disabled' : ''} aria-pressed="${sel}"
        aria-label="${fmt(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${s === today ? ' (today)' : ''}"
        onclick="MSSDateRange._pick('${id}', '${s}')"><span>${d}</span></button>`);
    }
    const canPrev = !min || `${st.month}-01` > min;
    return `<div class="dr-cal-head">
        <button type="button" class="dr-nav" onclick="MSSDateRange._month('${id}', -1)" aria-label="Previous month"${canPrev ? '' : ' disabled'}>${icon('back', 16)}</button>
        <div class="dr-cal-title" aria-live="polite">${first.toLocaleDateString(lang(), { month: 'long', year: 'numeric' })}</div>
        <button type="button" class="dr-nav" onclick="MSSDateRange._month('${id}', 1)" aria-label="Next month">${icon('arrowRight', 16)}</button>
      </div>
      <div class="dr-cal-hint">Pick the ${st.edit === 'start' ? 'start' : 'end'} date</div>
      <div class="dr-week" aria-hidden="true">${wk.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="dr-grid" role="group" aria-label="${st.edit === 'start' ? 'Start' : 'End'} date" onkeydown="MSSDateRange._key(event, '${id}')">${cells.join('')}</div>`;
  }
  function draw(id, focusDay) {
    const st = S[id], c = document.getElementById(id + 'Cal'); if (!c) return;
    document.getElementById(id + 'S').value = st.start;
    document.getElementById(id + 'E').value = st.end;
    document.getElementById(id + 'Cards').innerHTML = cards(id);
    c.hidden = !st.edit;
    c.innerHTML = st.edit ? cal(id) : '';
    if (focusDay) c.querySelector(`[data-d="${focusDay}"]`)?.focus();
  }
  function edit(id, k) {
    const st = S[id];
    st.edit = st.edit === k ? null : k;
    if (st.edit) st.month = st[k].slice(0, 7);
    draw(id);
    if (st.edit) document.getElementById(id + 'Cal').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function pick(id, s) {
    const st = S[id];
    if (st.edit === 'start') {
      const len = days(st.start, st.end);
      st.start = s;
      if (st.end < s) st.end = add(s, Math.max(len, 0));
      st.edit = 'end'; st.month = st.end.slice(0, 7);
      draw(id, st.end);
    } else {
      st.end = s; st.edit = null;
      draw(id);
      document.querySelector(`#${id}Cards .dr-card:last-child`)?.focus();
    }
    st.onChange?.(st.start, st.end);
  }
  function month(id, n) {
    const st = S[id], [y, m] = st.month.split('-').map(Number), d = new Date(y, m - 1 + n, 1, 12);
    st.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    draw(id);
  }
  function key(e, id) {
    const b = e.target.closest('.dr-day'); if (!b) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const rtl = getComputedStyle(b).direction === 'rtl';
    let to = null;
    if (step) to = add(b.dataset.d, rtl && Math.abs(step) === 1 ? -step : step);
    if (e.key === 'PageUp' || e.key === 'PageDown') { const d = day(b.dataset.d); d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1)); to = iso(d); }
    if (!to) return;
    e.preventDefault();
    const st = S[id];
    if (to.slice(0, 7) !== st.month) { st.month = to.slice(0, 7); draw(id); }
    const t = document.querySelector(`#${id}Cal [data-d="${to}"]:not([disabled])`);
    if (t) { document.querySelectorAll(`#${id}Cal .dr-day`).forEach(x => x.tabIndex = -1); t.tabIndex = 0; t.focus(); }
  }
  function set(id, start, end) {
    const st = S[id]; if (!st) return;
    st.start = start; st.end = end;
    if (st.edit) st.month = st[st.edit].slice(0, 7);
    draw(id);
  }

  return { html, set, get: id => S[id] && { start: S[id].start, end: S[id].end },
    _edit: edit, _pick: pick, _month: month, _key: key };
})();
