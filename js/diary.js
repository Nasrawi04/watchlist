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
  function pick(o) {
    const st = { date: o.date === undefined ? todayISO() : o.date, time: o.time === undefined ? hhmm(Date.now()) : o.time, release: o.release || null };
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `<div class="confirm-card dy-pick" role="dialog" aria-modal="true" aria-labelledby="dyPickT" aria-describedby="dyPickM">
        <div class="confirm-title" id="dyPickT">${escHTML(o.title || 'When did you watch it?')}</div>
        <div class="confirm-msg" id="dyPickM">${escHTML(o.label || '')}</div>
        <div class="dy-days" role="group" aria-label="Day"></div>
        <div class="dy-time">
          <label class="dy-time-l" for="dyPickTime">Time</label>
          <input class="field-input dy-time-in" id="dyPickTime" type="time">
          <button type="button" class="dy-chip dy-notime" aria-pressed="false">No time</button>
        </div>
        <p class="dy-warn" id="dyPickW" aria-live="polite"></p>
        <div class="confirm-actions"><button type="button" class="confirm-cancel" data-close>Cancel</button><button type="button" class="confirm-ok is-safe" data-save>Save</button></div>
      </div>`;
    const close = () => { MSSDialog.close(ov); setTimeout(() => ov.remove(), 220); };
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
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
    ov.querySelector('[data-close]').onclick = close;
    ov.querySelector('[data-save]').onclick = async ev => {
      const btn = ev.currentTarget; btn.disabled = true;
      try { await o.onSave(st.date, st.date ? st.time : null); close(); }
      catch (err) { console.error(err); btn.disabled = false; showToast('Couldn’t save that — try again.', 'err'); }
    };
    paint();
    MSSDialog.open(ov, { focus: '[data-day][aria-pressed="true"], [data-day]' });
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
    } else if (rows.length > 1) {
      // several at once: which day? (Cancel keeps them on the day they were logged)
      pick({ title: `When did you watch ${rows.filter(x => x.season != null).length} episodes?`, label: what(rows), row: r,
        date: r.watched_date, time: r.watched_at ? hhmm(r.watched_at) : null, noDate: true, onSave: (d, t) => move(rows, d, t) });
    } else {
      const fin = rows.some(x => x.completes_title) ? ' · Finished' : '';
      showActionToast(`Logged · ${dayText(r.watched_date)}${r.watched_at ? ' ' + timeText(hhmm(r.watched_at)) : ''}${fin}`, 'Change', () => change(rows), 7000);
    }
  }

  return { noticed, pick };
})();
