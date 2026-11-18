/* ══════════════════════════════════════════
   diary.js — MSSDiary: your watches, as they're logged (112_diary_logging.sql)
   The database logs every watch by itself, from every page (112). This tells you about it and
   lets you change the day, loaded by db.js the first time something is saved:
     • one watch (an episode, a movie, a finish) → "Logged · Today 9:42 PM" with Change
     • several at once (a bulk log) → asks which day you watched them
     • added partway through, so before today → "Saved to No date" with Set date
   The picker: Today · Yesterday · Pick a date (any year), the time (or No time), and soft
   warnings for a future day or one before it came out. Times show only in the Diary.

     MSSDiary.noticed(entryId, finished)   after a save (db.js); finished = it was just marked Watched
     MSSDiary.pick({ label, date, time, release, noDate, onSave(date | null, time | null) })
     MSSDiary.seasons(el, rows, { mode, day, onChange })   a day per season (see "Days per season")
     MSSDiary.savePlan(plan)   MSSDiary.unknownIds()
══════════════════════════════════════════ */
const MSSDiary = (() => {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lang = () => document.documentElement.lang || undefined;
  const todayISO = () => iso(new Date());
  const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
  const local = s => new Date(s + 'T12:00:00');
  const dayText = s => s === todayISO() ? 'Today' : s === yesterdayISO() ? 'Yesterday'
    : local(s).toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: s.slice(0, 4) === todayISO().slice(0, 4) ? undefined : 'numeric' });
  const timeText = t => new Date(`2024-01-01T${t}:00`).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' });
  const hhmm = at => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const monthYear = s => local(s).toLocaleDateString(lang(), { month: 'short', year: 'numeric' });

  // "S2 E5" · "S2 E1–E10" · "S1 E1 – S2 E3" · the title itself for a movie or a whole show
  function what(rows) {
    const eps = rows.filter(r => r.season != null).sort((a, b) => a.season - b.season || a.episode - b.episode);
    if (!eps.length) return rows[0].title;
    const a = eps[0], b = eps[eps.length - 1];
    const range = eps.length === 1 ? `S${a.season} E${a.episode}`
      : a.season === b.season ? `S${a.season} E${a.episode}–E${b.episode}` : `S${a.season} E${a.episode} – S${b.season} E${b.episode}`;
    return `${rows[0].title} · ${range}`;
  }

  // When it came out (the warning's "This came out Dec 2024"): the episode's air date, or the title's
  async function released(row) {
    if (!row?.tmdb_id || typeof tmdbFetch !== 'function') return null;
    try {
      const movie = row.tmdb_type === 'movie' || row.cat === 'movies';
      const url = movie ? `${TMDB_BASE}/movie/${row.tmdb_id}?language=en-US`
        : row.season != null ? `${TMDB_BASE}/tv/${row.tmdb_id}/season/${row.season}/episode/${row.episode}?language=en-US`
        : `${TMDB_BASE}/tv/${row.tmdb_id}?language=en-US`;
      const res = await tmdbFetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      return (movie ? d.release_date : row.season != null ? d.air_date : d.first_air_date) || null;
    } catch { return null; }
  }

  /* ── The picker ── */
  // a side panel S (full page on phones): Today / Yesterday / a date, the time, Save
  async function pick(o) {
    const st = { date: o.date === undefined ? todayISO() : o.date, time: o.time === undefined ? hhmm(Date.now()) : o.time, release: o.release || null };
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: o.title || 'When did you watch it?', subtitle: o.label || '',
      body: `<div class="lyr-sec"><h3 class="lyr-sec-h" id="dyPickDayH">Day</h3><div class="dy-days" role="group" aria-labelledby="dyPickDayH"></div></div>
        <div class="lyr-sec"><label class="lyr-sec-h" for="dyPickTime">Time</label>
          <div class="dy-time"><input class="lyr-field dy-time-in" id="dyPickTime" type="time">
            <button type="button" class="dy-chip dy-notime" aria-pressed="false">No time</button></div></div>
        <p class="dy-warn" id="dyPickW" aria-live="polite"></p>`,
      footer: { secondary: [{ label: 'Cancel', only: 'side', onClick: x => x.close() }],
        primary: { label: 'Save', onClick: async x => { await o.onSave(st.date, st.date ? st.time : null); x.closeNow(); } } } });
    const ov = h.body;
    const days = ov.querySelector('.dy-days'), timeIn = ov.querySelector('#dyPickTime'), noTime = ov.querySelector('.dy-notime'), warn = ov.querySelector('#dyPickW');
    function paint() {
      const t = todayISO(), y = yesterdayISO(), other = st.date && st.date !== t && st.date !== y;
      const chip = (k, label, on) => `<button type="button" class="dy-chip" data-day="${k}" aria-pressed="${on}">${label}</button>`;
      days.innerHTML = chip('today', 'Today', st.date === t) + chip('yesterday', 'Yesterday', st.date === y)
        + chip('pick', `${icon('calendar', 14)}<span>${other ? escHTML(dayText(st.date)) : 'Pick a date'}</span>`, !!other)
        + (o.noDate ? chip('none', 'No date', !st.date) : '');
      const timeless = !st.date || st.time == null;
      timeIn.disabled = timeless; timeIn.value = st.time || '';
      noTime.setAttribute('aria-pressed', String(st.time == null)); noTime.disabled = !st.date;
      // soft warnings: never blocking
      warn.textContent = !st.date ? '' : st.date > t ? 'This date is in the future — log it anyway?'
        : st.release && st.date < st.release ? `This came out ${monthYear(st.release)} — log it anyway?` : '';
    }
    days.addEventListener('click', ev => {
      const b = ev.target.closest('[data-day]'); if (!b) return;
      const k = b.dataset.day;
      if (k === 'today') st.date = todayISO();
      else if (k === 'yesterday') st.date = yesterdayISO();
      else if (k === 'none') st.date = null;
      else return mssLoadScript('js/date-range.js').then(() => MSSDateRange.pickDate({ value: st.date || todayISO(), label: 'When did you watch it?',
        onPick: v => { st.date = v; if (st.time == null && o.time !== null) st.time = hhmm(Date.now()); paint(); ov.querySelector('[data-day="pick"]')?.focus(); } }));
      paint();
    });
    timeIn.addEventListener('change', () => { if (timeIn.value) st.time = timeIn.value; });
    noTime.addEventListener('click', () => { st.time = st.time == null ? hhmm(Date.now()) : null; paint(); });
    paint();
    if (!st.release && o.release === undefined && o.row) released(o.row).then(r => { st.release = r; if (ov.isConnected) paint(); });
  }

  // Moves these watches to a day (and time) — your local day, as the database keeps it
  async function move(rows, date, time) {
    const at = date && time ? new Date(`${date}T${time}:00`).toISOString() : null;
    const batch = rows.length > 1 && rows.every(r => r.batch_id && r.batch_id === rows[0].batch_id) ? rows[0].batch_id : null;
    let q = sb.from('diary_watches').update({ watched_date: date, watched_at: at });
    q = batch ? q.eq('batch_id', batch) : q.in('id', rows.map(r => r.id));
    const { error } = await q;
    if (error) throw error;
    showToast(date ? `Logged · ${dayText(date)}${time ? ' ' + timeText(time) : ''}` : 'Saved to No date');
  }
  const change = rows => { document.getElementById('toast')?.classList.remove('visible'); pick({ label: what(rows), row: rows[0], date: rows[0].watched_date, time: rows[0].watched_at ? hhmm(rows[0].watched_at) : null,
    noDate: rows.length > 1, onSave: (d, t) => move(rows, d, t) }); };

  /* ── After a save: what did it log? ── */
  const told = {};   // entry → the log already told about (a save that logs nothing doesn't repeat it)
  const COLS = 'id,title,tmdb_id,tmdb_type,cat,season,episode,watched_date,watched_at,completes_title,source,batch_id,created_at,updated_at';
  async function noticed(entryId, finished) {
    if (!entryId || typeof sb === 'undefined') return;
    const { data } = await sb.from('diary_watches').select(COLS).eq('entry_id', entryId).order('created_at', { ascending: false }).limit(1000);
    if (!data?.length) return;
    // one save's watches share one moment (the database's); older than a minute isn't this save
    const newest = data[0].created_at;
    const fresh = told[entryId] !== newest && Date.now() - Date.parse(newest) < 60_000;
    let rows = fresh ? data.filter(r => r.created_at === newest) : [];
    // just finished, and the last episode was already logged: that watch now finishes it
    if (!rows.length && finished) {
      const done = data.filter(r => r.completes_title).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
      if (done && Date.now() - Date.parse(done.updated_at) < 60_000) rows = [done];
    }
    if (!rows.length) return;
    told[entryId] = newest;
    rows.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    const r = rows[0];
    if (!r.watched_date) {
      showActionToast(`Saved to No date · ${what(rows)}`, 'Set date', () => change(rows), 8000);
    } else if (rows.length > 1 && new Set(rows.map(x => x.season)).size > 1) {
      // a show logged across seasons: a day per season, or one for all (Cancel keeps the day they were logged)
      seasonsPanel(rows);
    } else if (rows.length > 1) {
      // several at once: which day? (Cancel keeps them on the day they were logged)
      pick({ title: `When did you watch ${rows.filter(x => x.season != null).length} episodes?`, label: what(rows), row: r,
        date: r.watched_date, time: r.watched_at ? hhmm(r.watched_at) : null, noDate: true, onSave: (d, t) => move(rows, d, t) });
    } else {
      const fin = rows.some(x => x.completes_title) ? ' · Finished' : '';
      showActionToast(`Logged · ${dayText(r.watched_date)}${r.watched_at ? ' ' + timeText(hhmm(r.watched_at)) : ''}${fin}`, 'Change', () => change(rows), 7000);
    }
  }

  /* ── Days per season ──
     seasons(el, rows, o) draws the three ways — Per season · Same day · Not sure
     — and a row per season (a movie or a whole show: one row) with Pick a day.
     o.mode 'season' | 'all' | 'unknown' to start with, o.day the day already set, o.onChange().
     Returns { plan(), left() }: plan = [{ rows, date }] or [{ rows, unknown: true }]; left = rows still
     without a day. Used right after a show is logged across seasons (seasonsPanel) and on the Diary's
     Set dates page. Nothing else about a watch changes: scores, Finished, episodes stay as they are. */
  const UNKNOWN_LS = 'msf_diary_unknown';
  function unknownIds() { try { return new Set(JSON.parse(localStorage.getItem(UNKNOWN_LS) || '[]')); } catch { return new Set(); } }
  function keepUnknown(ids, on) {
    const s = unknownIds();
    ids.forEach(id => on ? s.add(id) : s.delete(id));
    try { localStorage.setItem(UNKNOWN_LS, JSON.stringify([...s])); } catch {}
  }
  function seasonGroups(rows) {
    const by = new Map();
    rows.forEach(r => { const k = r.season ?? -1; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([s, list]) => ({ s, rows: list }));
  }
  async function seasons(el, rows, o = {}) {
    await mssLoadScript('js/panel.js');
    const groups = seasonGroups(rows), many = groups.length > 1;
    const ui = { mode: many ? (o.mode || 'season') : (o.mode === 'unknown' ? 'unknown' : 'all'), all: o.day || null, per: new Map(groups.map(g => [g.s, o.day || null])) };
    const longDay = s => local(s).toLocaleDateString(lang(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const r0 = rows[0], movie = r0.tmdb_type === 'movie' || r0.cat === 'movies';
    const count = n => `${n} ${n === 1 ? 'episode' : 'episodes'}`;
    const row = (key, label, sub, badge, value) => `<li class="dy-sd-row${value ? ' is-set' : ''}">
        <span class="dy-sd-badge" aria-hidden="true">${badge}</span>
        <span class="dy-sd-text"><b>${escHTML(label)}</b><small>${escHTML(sub)}</small></span>
        <button type="button" class="dy-sd-pick${value ? ' is-set' : ''}" data-k="${key}" aria-label="${escHTML(value ? `${label}: ${longDay(value)} — change the day` : `Pick a day for ${label}`)}">${icon('calendar', 14)}<span>${escHTML(value ? longDay(value) : 'Pick a day')}</span></button>
        <span class="dy-sd-ok${value ? '' : ' is-off'}" aria-hidden="true">${icon('check', 12)}</span>
      </li>`;
    function paint() {
      const modes = many ? mssSegHTML({ label: 'How to date them', options: [['season', 'Per season'], ['all', 'Same day'], ['unknown', 'Not sure']], value: ui.mode, strong: true })
        : mssSegHTML({ label: 'How to date it', options: [['all', 'Pick a day'], ['unknown', 'Not sure']], value: ui.mode, strong: true });
      let list = '';
      if (ui.mode === 'season') list = groups.map(g => row(g.s, g.s < 0 ? r0.title : mssSeasonLabel(g.s), g.s < 0 ? (movie ? 'Movie' : 'The whole show') : count(g.rows.length), g.s < 0 ? '•' : `S${g.s}`, ui.per.get(g.s))).join('');
      else if (ui.mode === 'all') list = row('all', many ? `All ${groups.length} seasons` : (groups[0].s < 0 ? r0.title : mssSeasonLabel(groups[0].s)),
        rows.some(r => r.season != null) ? count(rows.length) : (movie ? 'Movie' : 'The whole show'), many ? '∗' : groups[0].s < 0 ? '•' : `S${groups[0].s}`, ui.all);
      el.innerHTML = `<div class="dy-sd-modes">${modes}</div>`
        + (ui.mode === 'unknown' ? `<p class="dy-sd-note">${icon('info', 15)}<span>They stay without a day and the Diary stops asking about them. You can still give them a day from Set dates.</span></p>`
          : `<ul class="dy-sd-list">${list}</ul>`);
    }
    el.addEventListener('click', ev => {
      const m = ev.target.closest('[data-v]');
      if (m) { ui.mode = mssSegPick(m); paint(); el.querySelector('[role="radio"][aria-checked="true"]')?.focus(); o.onChange?.(); return; }
      const b = ev.target.closest('.dy-sd-pick'); if (!b) return;
      const k = b.dataset.k, cur = k === 'all' ? ui.all : ui.per.get(Number(k));
      mssLoadScript('js/date-range.js').then(() => MSSDateRange.pickDate({ value: cur || o.day || todayISO(), label: 'When did you watch it?', anchor: b,
        onPick: v => {
          if (k === 'all') ui.all = v; else ui.per.set(Number(k), v);
          paint(); el.querySelector(`.dy-sd-pick[data-k="${k}"]`)?.focus(); o.onChange?.();
        } }));
    });
    paint();
    return {
      plan: () => ui.mode === 'unknown' ? [{ rows, unknown: true }]
        : ui.mode === 'all' ? (ui.all ? [{ rows, date: ui.all }] : [])
        : groups.filter(g => ui.per.get(g.s)).map(g => ({ rows: g.rows, date: ui.per.get(g.s) })),
      left: () => ui.mode === 'unknown' ? 0 : ui.mode === 'all' ? (ui.all ? 0 : rows.length)
        : groups.filter(g => !ui.per.get(g.s)).reduce((n, g) => n + g.rows.length, 0),
      seasonsLeft: () => ui.mode === 'season' ? groups.filter(g => !ui.per.get(g.s)).length : ui.mode === 'all' && !ui.all ? 1 : 0,
    };
  }
  // Puts each part of a plan on its day (no time: the day is what you picked) or back to "No date"
  // as "I don't remember" (diary_watches.date_unknown, 125; this device until it runs)
  async function savePlan(plan) {
    let col = true;
    for (const p of plan) {
      const rows = p.unknown ? p.rows : p.rows.filter(r => r.watched_date !== p.date);
      if (!rows.length) continue;
      const ids = rows.map(r => r.id);
      for (let i = 0; i < ids.length; i += 150) {
        const patch = p.unknown ? { watched_date: null, watched_at: null } : { watched_date: p.date, watched_at: null };
        let { error } = await sb.from('diary_watches').update(col ? { ...patch, date_unknown: !!p.unknown } : patch).in('id', ids.slice(i, i + 150));
        if (error && col && /date_unknown/.test(error.message || '')) { col = false; ({ error } = await sb.from('diary_watches').update(patch).in('id', ids.slice(i, i + 150))); }
        if (error) throw error;
      }
      keepUnknown(ids, !!p.unknown && !col);
    }
  }
  // Right after a show is logged across seasons: the same choice in a side panel S (full page on phones)
  async function seasonsPanel(rows) {
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: `When did you watch ${rows[0].title}?`, subtitle: `${what(rows)} · ${rows.length} episodes`,
      body: `<p class="dy-sd-intro">A day per season keeps your Diary true to when you watched them.</p><div class="dy-sd"></div>`,
      footer: { secondary: [{ label: 'Cancel', only: 'side', onClick: x => x.close() }],
        primary: { label: 'Save', onClick: async x => {
          if (ctl.left()) { showToast('Pick a day for every season, or choose Same day.', 'err'); return; }
          await savePlan(ctl.plan()); x.closeNow();
          showToast(ctl.plan()[0]?.unknown ? 'Saved to No date' : 'Saved · each season on its day');
        } } } });
    const ctl = await seasons(h.body.querySelector('.dy-sd'), rows, { mode: 'all', day: rows[0].watched_date });
  }

  return { noticed, pick, seasons, savePlan, unknownIds };
})();
