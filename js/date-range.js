/* ═══════════════════════════════════════════════════════════════
   date-range.js — the site's date pickers (Challenges, Movie Night)
   Big tappable cards; tap one and its panel opens underneath.
   • Range (Challenges): "Starts / Ends" cards with the length between them,
     a month calendar with the range shaded. Picking the start moves straight
     on to the end; picking the end closes the calendar.
   • Date + time (Movie Night): "Day / Time" cards with "in 3 days" between
     them. Picking the day moves on to the time panel: quick evening times,
     hour and minute steppers, AM / PM (only where the locale uses a 12-hour
     clock). Optional — "No date" clears it.
   Arrow keys move between days, Page Up / Down between months.

   MSSDateRange.html(id, { start, end, min, onChange })   range ('YYYY-MM-DD'; min = earliest end)
   MSSDateRange.set(id, start, end)                        e.g. from a preset
   MSSDateRange.when(id, { value, min, onChange })         date + time (value: Date / ISO / null)
   MSSDateRange.get(id)                                    → { start, end } | { date, time, value }
   Hidden inputs: range → #<id>S / #<id>E; date + time → #<id> ('YYYY-MM-DDTHH:MM' or '').

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

  const h24 = () => { try { return new Intl.DateTimeFormat(lang(), { hour: 'numeric' }).resolvedOptions().hourCycle?.startsWith('h2'); } catch { return false; } };
  const tFmt = t => new Date(`2024-01-01T${t}:00`).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' });
  const relText = s => {
    const n = days(iso(new Date()), s);
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? `in ${n} days` : n >= 7 && n < 14 ? 'Next week' : n >= 14 ? `in ${Math.round(n / 7)} weeks` : 'Past';
  };

  function html(id, o) {
    const st = S[id] = { mode: 'range', start: o.start, end: o.end, min: o.min || null, edit: null, month: o.start.slice(0, 7), onChange: o.onChange || null };
    return `<div class="dr" id="${id}">
        <input type="hidden" id="${id}S" value="${st.start}"><input type="hidden" id="${id}E" value="${st.end}">
        <div class="dr-cards" id="${id}Cards">${cards(id)}</div>
        <div class="dr-cal" id="${id}Cal" hidden></div>
      </div>`;
  }
  function when(id, o) {
    let d = o.value ? new Date(o.value) : null; if (d && isNaN(d)) d = null;
    const st = S[id] = { mode: 'when', date: d ? iso(d) : null, time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '20:00',
      min: o.min || iso(new Date()), edit: null, month: (d ? iso(d) : iso(new Date())).slice(0, 7), onChange: o.onChange || null };
    return `<div class="dr dr-when" id="${id}Box">
        <input type="hidden" id="${id}" value="${value(st)}">
        <div class="dr-cards" id="${id}Cards">${cards(id)}</div>
        <div class="dr-cal" id="${id}Cal" hidden></div>
      </div>`;
  }
  const value = st => st.date ? `${st.date}T${st.time}` : '';
  function whenCards(id) {
    const st = S[id], on = !!st.date;
    const [hh, mm] = st.time.split(':').map(Number), am = hh < 12;
    const tLabel = h24() ? `${pad(hh)}:${pad(mm)}` : `${hh % 12 || 12}:${pad(mm)}`;
    const part = hh < 5 ? 'Late night' : hh < 12 ? 'Morning' : hh < 17 ? 'Afternoon' : hh < 21 ? 'Evening' : 'Night';
    const day = on ? `<span class="dr-card-day">${fmt(st.date, { day: 'numeric' })}</span>
        <span class="dr-card-rest"><b>${fmt(st.date, { month: 'short' })} ${fmt(st.date, { year: 'numeric' })}</b><span>${fmt(st.date, { weekday: 'long' })}</span></span>`
      : `<span class="dr-card-day dr-card-ic">${icon('clock', 26)}</span><span class="dr-card-rest"><b>Pick a day</b><span>Optional</span></span>`;
    const card = (k, label, inner, aria) => `<button type="button" class="dr-card${st.edit === k ? ' active' : ''}${k === 'date' && !on ? ' empty' : ''}${k === 'time' && !on ? ' dim' : ''}" aria-expanded="${st.edit === k}" aria-controls="${id}Cal"
        onclick="MSSDateRange._edit('${id}', '${k}')" aria-label="${aria}">
        <span class="dr-card-label">${label}</span>${inner}${icon('edit', 13)}</button>`;
    return card('date', 'Day', day, on ? `Day: ${fmt(st.date, { weekday: 'long', day: 'numeric', month: 'long' })} — change` : 'Pick a day (optional)')
      + `<span class="dr-len" aria-live="polite">${on ? `${icon('clock', 14)}<b>${relText(st.date)}</b>` : ''}</span>`
      + card('time', 'Time', `<span class="dr-card-day">${tLabel}</span><span class="dr-card-rest"><b>${h24() ? '' : am ? 'AM' : 'PM'}</b><span>${part}</span></span>`, `Time: ${tFmt(st.time)} — change`);
  }
  function timePanel(id) {
    const st = S[id], [hh, mm] = st.time.split(':').map(Number), am = hh < 12, is24 = h24();
    const quick = ['18:00', '19:00', '20:00', '21:00', '22:00'];
    const stepper = (k, v, label) => `<div class="dr-step" role="group" aria-label="${label}">
        <button type="button" class="dr-step-btn" onclick="MSSDateRange._time('${id}', '${k}', -1)" aria-label="${label} down">${icon('minus', 16)}</button>
        <b aria-live="polite">${v}</b>
        <button type="button" class="dr-step-btn" onclick="MSSDateRange._time('${id}', '${k}', 1)" aria-label="${label} up">${icon('plus', 16)}</button></div>`;
    return `<div class="dr-cal-hint">Pick a time${st.date ? ` for ${fmt(st.date, { weekday: 'long' })}` : ''}</div>
      <div class="dr-quick" role="group" aria-label="Quick times">${quick.map(t => `<button type="button" class="dr-chip${t === st.time ? ' active' : ''}" aria-pressed="${t === st.time}" onclick="MSSDateRange._time('${id}', 'set', '${t}')" aria-label="${tFmt(t)}">${new Date(`2024-01-01T${t}:00`).toLocaleTimeString(lang(), { hour: 'numeric' })}</button>`).join('')}</div>
      <div class="dr-clock">
        ${stepper('h', is24 ? pad(hh) : hh % 12 || 12, 'Hour')}<span class="dr-colon" aria-hidden="true">:</span>${stepper('m', pad(mm), 'Minutes')}
        ${is24 ? '' : `<div class="dr-ampm" role="group" aria-label="AM or PM">${[['am', 'AM'], ['pm', 'PM']].map(([k, l]) =>
          `<button type="button" class="dr-chip${(k === 'am') === am ? ' active' : ''}" aria-pressed="${(k === 'am') === am}" onclick="MSSDateRange._time('${id}', '${k}')">${l}</button>`).join('')}</div>`}
      </div>
      <div class="dr-time-foot">${st.date ? `<button type="button" class="dr-clear" onclick="MSSDateRange._clear('${id}')">${icon('x', 13)} No date</button>` : '<span></span>'}
        <button type="button" class="sf-apply-btn dr-done" onclick="MSSDateRange._edit('${id}', null)">Done</button></div>`;
  }
  function cards(id) {
    const st = S[id];
    if (st.mode === 'when') return whenCards(id);
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
    const single = st.mode === 'when', a = single ? st.date : st.start, b = single ? st.date : st.end;
    const min = single ? st.min : st.edit === 'end' ? (st.min && st.min > st.start ? st.min : st.start) : null;   // range: min = earliest end
    const wk = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i, 12).toLocaleDateString(lang(), { weekday: 'narrow' }));
    const cells = [...Array(lead)].map(() => '<span></span>');
    for (let d = 1; d <= count; d++) {
      const s = `${st.month}-${pad(d)}`, off = min && s < min;
      const cls = ['dr-day', a && s === a && 'is-start', b && s === b && 'is-end', a && s > a && s < b && 'in-range', s === today && 'is-today'].filter(Boolean).join(' ');
      const sel = s === (single ? st.date : st[st.edit]) || (single && !st.date && s === (min || today));
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
      <div class="dr-cal-hint">${single ? 'Pick the day' : `Pick the ${st.edit === 'start' ? 'start' : 'end'} date`}</div>
      <div class="dr-week" aria-hidden="true">${wk.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="dr-grid" role="group" aria-label="${single ? 'Day' : st.edit === 'start' ? 'Start date' : 'End date'}" onkeydown="MSSDateRange._key(event, '${id}')">${cells.join('')}</div>`;
  }
  function draw(id, focusDay) {
    const st = S[id], c = document.getElementById(id + 'Cal'); if (!c) return;
    if (st.mode === 'when') document.getElementById(id).value = value(st);
    else { document.getElementById(id + 'S').value = st.start; document.getElementById(id + 'E').value = st.end; }
    document.getElementById(id + 'Cards').innerHTML = cards(id);
    c.hidden = !st.edit;
    c.classList.toggle('dr-time', st.edit === 'time');
    c.innerHTML = !st.edit ? '' : st.edit === 'time' ? timePanel(id) : cal(id);
    if (focusDay) c.querySelector(`[data-d="${focusDay}"]`)?.focus();
  }
  function edit(id, k) {
    const st = S[id];
    if (k === 'time' && st.mode === 'when' && !st.date) k = 'date';      // a day first, then the time
    st.edit = st.edit === k ? null : k;
    if (st.edit && st.edit !== 'time') st.month = (st.mode === 'when' ? st.date || st.min : st[k]).slice(0, 7);
    draw(id);
    if (st.edit) document.getElementById(id + 'Cal').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function pick(id, s) {
    const st = S[id];
    if (st.mode === 'when') { st.date = s; st.edit = 'time'; draw(id); st.onChange?.(value(st)); return; }
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

  function time(id, k, v) {
    const st = S[id]; let [hh, mm] = st.time.split(':').map(Number);
    if (k === 'set') [hh, mm] = v.split(':').map(Number);
    if (k === 'h') hh = (hh + v + 24) % 24;
    if (k === 'm') { mm += v * 15; if (mm >= 60) { mm = 0; hh = (hh + 1) % 24; } if (mm < 0) { mm = 45; hh = (hh + 23) % 24; } mm -= mm % 15; }
    if (k === 'am' && hh >= 12) hh -= 12;
    if (k === 'pm' && hh < 12) hh += 12;
    st.time = `${pad(hh)}:${pad(mm)}`;
    if (!st.date) st.date = st.min;                       // a time on its own means the first possible day
    draw(id); st.onChange?.(value(st));
  }
  function clear(id) { const st = S[id]; st.date = null; st.edit = null; draw(id); st.onChange?.(''); document.querySelector(`#${id}Cards .dr-card`)?.focus(); }

  return { html, set, when,
    get: id => !S[id] ? null : S[id].mode === 'when' ? { date: S[id].date, time: S[id].time, value: value(S[id]) } : { start: S[id].start, end: S[id].end },
    _edit: edit, _pick: pick, _month: month, _key: key, _time: time, _clear: clear };
})();