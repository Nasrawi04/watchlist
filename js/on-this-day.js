/* ══════════════════════════════════════════
   on-this-day.js — MSSOtd: what you finished on today's date in earlier years (115_on_this_day.sql)
   Only finishes from your Diary (a movie, or a whole show / rewatch run), each on its own;
   never episodes, To Be Continued, No date or anything estimated. Feb 29 shows on Feb 28.

     MSSOtd.daily(user)        every page, once a day per device: the grouped notification
                               (the database makes it once per account, whichever device asks first)
     MSSOtd.home(user, profile) the home page only: titles you rated 9+ as a pop-up, once a day per
                               ACCOUNT, after any other pop-up, never on your first day on MSF
     MSSOtd.list(day)          → the anniversaries on that day (oldest first)
     MSSOtd.open(rows)         the title panel in On This Day mode: ‹ › (keys too), "2 of 3", View in Diary · Rewatch
     MSSOtd.strip(el, rows)    the slim strip at the top of the Diary
   Switches: Settings → Notifications ("On This Day notifications" / "On This Day pop-ups",
   profiles.notif_off 'on_this_day' / 'on_this_day_popup').
══════════════════════════════════════════ */
const MSSOtd = (() => {
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const esc = s => escHTML(s == null ? '' : String(s));
  const ago = n => n === 1 ? '1 year ago' : `${n} years ago`;

  async function list(day) {
    const { data, error } = await sb.rpc('diary_on_this_day', { p_day: day || today() });
    if (error) throw error;
    return data || [];
  }

  // Once a day per device; the database keeps it to one per account
  function daily(user) {
    if (!user) return;
    const k = 'msf_otd_n:' + user.id, d = today();
    try { if (localStorage.getItem(k) === d) return; } catch {}
    sb.rpc('on_this_day_notify', { p_day: d }).then(({ error }) => { if (!error) { try { localStorage.setItem(k, d); } catch {} } }, () => {});
  }

  // The home page: 9+ titles, once a day per account, after anything else that pops up
  async function home(user, profile) {
    if (!user || (profile?.notif_off || []).includes('on_this_day_popup')) return;
    const d = today();
    if (profile?.created_at && new Date(profile.created_at).toDateString() === new Date().toDateString()) return;   // your first day
    let rows;
    try { rows = (await list(d)).filter(r => r.rating != null && Number(r.rating) >= 9); } catch { return; }
    if (!rows.length) return;
    // wait for the page's own pop-ups (date of birth, a finished challenge…) to be dealt with
    const start = Date.now();
    await new Promise(res => setTimeout(res, 2500));
    while (MSSDialog.top()) {
      if (Date.now() - start > 120000) return;
      await new Promise(res => setTimeout(res, 1500));
    }
    const { data: mine } = await sb.rpc('otd_claim_popup', { p_day: d });
    if (mine) open(rows);
  }

  /* ── The panel: the title panel itself (header, poster, Title Info) in On This Day mode (title-view.js) ──
     "On This Day · 7 years ago", when you watched it and your score then; ‹ › between the day's
     anniversaries; the bar: View in Diary + Rewatch (owner, 14 Nov 2026). */
  let rows = [], cur = 0;
  async function show(i) {
    cur = i;
    const r = rows[i];
    if (typeof MSSViews === 'undefined') await mssLoadScript('js/title-view.js');
    MSSViews.open({ id: r.entry_id, entry_id: r.entry_id, title: r.title, poster_url: r.poster_url, tmdb_id: r.tmdb_id, tmdb_type: r.tmdb_type, cat: r.cat },
      { own: true, otd: { years: r.years, date: r.watched_date, rewatchNo: r.rewatch_no, i, n: rows.length,
        step: dir => { const to = cur + dir; if (to >= 0 && to < rows.length) show(to); },
        diary: () => { location.href = `diary.html?d=${r.watched_date}`; },
        rewatch: btn => rewatch(r, btn) } });
  }
  async function open(list) {
    if (!list?.length) return;
    rows = list;
    show(0);
  }

  // Rewatch → Up Next (never twice); a title you've since removed goes back through Add to Library
  async function rewatch(r, btn) {
    btn.disabled = true;
    try {
      const { data: e } = r.entry_id ? await sb.from('entries').select('*').eq('id', r.entry_id).maybeSingle() : { data: null };
      if (!e) {
        if (typeof MSSInfo === 'undefined') await mssLoadScript('js/info-popup.js');
        MSSViews.close();
        MSSInfo.addToLibrary({ tmdb_id: r.tmdb_id, media_type: r.tmdb_type === 'movie' || r.cat === 'movies' ? 'movie' : 'tv', title: r.title, poster_url: r.poster_url, cat: r.cat }, { status: 'up_next' });
        return;
      }
      if (e.status === 'up_next') { showToast(`“${e.title}” is already in Up Next.`); return; }
      if (e.status === 'watching' || e.status === 'paused') { showToast(`You’re already watching “${e.title}”.`); return; }
      const ratings = { ...(e.ratings || {}) };
      if (e.status === 'completed' || e.status === 'ongoing') { ratings._rewatch_count = (Number(ratings._rewatch_count) || 1) + 1; ratings._is_rewatching = true; }
      await updateProgress(e.id, e.user_id, { status: 'up_next', ratings });
      showToast(`Added “${e.title}” to Up Next${ratings._is_rewatching ? ` · Rewatch #${ratings._rewatch_count}` : ''}`);
    } catch (err) { console.error(err); showToast('Couldn’t add it — try again.', 'err'); }
    finally { btn.disabled = false; }
  }

  // The Diary's strip: a slim line when today has anniversaries
  function strip(el, list) {
    if (!el) return;
    if (!list?.length) { el.innerHTML = ''; return; }
    const first = list[0], more = list.length - 1;
    el.innerHTML = `<button type="button" class="otd-strip">
        <span class="otd-strip-posters" aria-hidden="true">${list.slice(0, 3).map(r => r.poster_url ? `<img src="${esc(safeURL(r.poster_url))}" alt="">` : '').join('')}</span>
        <span class="otd-strip-text"><b>On This Day</b> · <span translate="no">${esc(first.title)}</span>${more ? ` and ${more} more` : ''} · ${esc(ago(first.years))}</span>
        ${icon('chevright', 14)}</button>`;
    el.querySelector('button').onclick = () => open(list);
  }

  return { list, daily, home, open, strip };
})();
