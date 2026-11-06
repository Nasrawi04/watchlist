/* ══════════════════════════════════════════
   on-this-day.js — MSSOtd: what you finished on today's date in earlier years (115_on_this_day.sql)
   Only finishes from your Diary (a movie, or a whole show / rewatch run), each on its own;
   never episodes, To Be Continued, No date or anything estimated. Feb 29 shows on Feb 28.

     MSSOtd.daily(user)        every page, once a day per device: the grouped notification
                               (the database makes it once per account, whichever device asks first)
     MSSOtd.home(user, profile) the home page only: titles you rated 9+ as a pop-up, once a day per
                               ACCOUNT, after any other pop-up, never on your first day on MSF
     MSSOtd.list(day)          → the anniversaries on that day (oldest first)
     MSSOtd.open(rows)         the cards: swipe, arrows (keys too), dots, "2 of 3"
     MSSOtd.strip(el, rows)    the slim strip at the top of the Diary
   Switches: Settings → Notifications ("On This Day notifications" / "On This Day pop-ups",
   profiles.notif_off 'on_this_day' / 'on_this_day_popup').
══════════════════════════════════════════ */
const MSSOtd = (() => {
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const lang = () => document.documentElement.lang || undefined;
  const longDate = s => new Date(s + 'T12:00:00').toLocaleDateString(lang(), { day: 'numeric', month: 'long', year: 'numeric' });
  const CAT = { movies: 'Movie', tv: 'TV Show', anime: 'Anime', cartoons: 'Cartoon' };
  const esc = s => escHTML(s == null ? '' : String(s));
  const ago = n => n === 1 ? '1 year ago' : `${n} years ago`;
  const big = url => url ? String(url).replace('/w185/', '/w500/') : '';

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
    while (MSSDialog.top() || document.querySelector('.modal-overlay.open, .mss-views.open')) {
      if (Date.now() - start > 120000) return;
      await new Promise(res => setTimeout(res, 1500));
    }
    const { data: mine } = await sb.rpc('otd_claim_popup', { p_day: d });
    if (mine) open(rows);
  }

  /* ── The cards ── */
  let ov = null, cur = 0, rows = [], backdrops = {};
  function slideHTML(r, i) {
    const poster = safeURL(big(r.poster_url));
    return `<section class="otd-slide${i === cur ? ' on' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${rows.length}" data-i="${i}"${i === cur ? '' : ' hidden'}>
        <div class="otd-bg" data-bg="${i}"${poster ? ` style="background-image:url('${poster}')"` : ''}></div><div class="otd-shade"></div>
        <div class="otd-in">
          ${poster ? `<img class="otd-poster" src="${poster}" alt="">` : `<span class="otd-poster otd-ph" aria-hidden="true">${esc((r.title || '?')[0])}</span>`}
          <div class="otd-text">
            <div class="otd-eyebrow">On This Day</div>
            <div class="otd-ago">${esc(ago(r.years))}</div>
            <h2 class="otd-title" id="otdT${i}" translate="no">${esc(r.title)}</h2>
            <div class="otd-meta">${esc(CAT[r.cat] || '')} · ${esc(longDate(r.watched_date))}${r.is_rewatch ? ` · Rewatch #${r.rewatch_no}` : ''}</div>
            ${r.rating != null ? `<div class="otd-rate" aria-label="You rated it ${Number(r.rating).toFixed(1)}">★ ${Number(r.rating).toFixed(1)}<small>your rating then</small></div>` : ''}
          </div>
        </div>
      </section>`;
  }
  function paint() {
    ov.querySelectorAll('.otd-slide').forEach((s, i) => { const on = i === cur; s.hidden = !on; s.classList.toggle('on', on); });
    ov.querySelectorAll('.otd-dot').forEach((b, i) => { b.setAttribute('aria-current', i === cur ? 'true' : 'false'); });
    const many = rows.length > 1;
    ov.querySelector('.otd-pos').textContent = many ? `${cur + 1} of ${rows.length}` : '';
    ov.querySelector('[data-go="-1"]').disabled = !many || cur === 0;
    ov.querySelector('[data-go="1"]').disabled = !many || cur === rows.length - 1;
    ov.querySelector('.otd-card').setAttribute('aria-labelledby', `otdT${cur}`);
    loadBackdrop(cur);
  }
  // the title's wide picture behind the card (TMDB), else its poster, blurred
  async function loadBackdrop(i) {
    const r = rows[i]; if (!r?.tmdb_id || backdrops[i] !== undefined || typeof tmdbFetch !== 'function') return;
    backdrops[i] = null;
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/${r.tmdb_type === 'movie' || r.cat === 'movies' ? 'movie' : 'tv'}/${r.tmdb_id}?language=en-US`);
      const d = res.ok ? await res.json() : null;
      if (d?.backdrop_path) {
        backdrops[i] = TMDB_IMG.replace('w185', 'w780') + d.backdrop_path;
        const el = ov?.querySelector(`[data-bg="${i}"]`);
        if (el) { el.style.backgroundImage = `url('${backdrops[i]}')`; el.classList.add('is-wide'); }
      }
    } catch {}
  }
  function go(n) { const to = Math.max(0, Math.min(rows.length - 1, cur + n)); if (to !== cur) { cur = to; paint(); } }
  function close() { if (!ov) return; const o = ov; ov = null; MSSDialog.close(o); setTimeout(() => o.remove(), 220); }

  function open(list) {
    if (!list?.length) return;
    rows = list; cur = 0; backdrops = {};
    ov?.remove();
    ov = document.createElement('div');
    ov.className = 'confirm-overlay otd-ov';
    ov.innerHTML = `<div class="otd-card" role="dialog" aria-modal="true" aria-roledescription="carousel">
        <button type="button" class="otd-x" data-act="close" aria-label="Close">${icon('x', 18)}</button>
        <div class="otd-track">${rows.map(slideHTML).join('')}</div>
        <div class="otd-nav"${rows.length > 1 ? '' : ' hidden'}>
          <button type="button" class="otd-arrow" data-go="-1" aria-label="Previous">${icon('chevleft', 18)}</button>
          <div class="otd-dots">${rows.map((r, i) => `<button type="button" class="otd-dot" data-to="${i}" aria-label="${esc(r.title)}, ${i + 1} of ${rows.length}"></button>`).join('')}</div>
          <button type="button" class="otd-arrow" data-go="1" aria-label="Next">${icon('chevright', 18)}</button>
        </div>
        <div class="otd-pos sr-only" aria-live="polite"></div>
        <div class="otd-actions">
          <button type="button" class="otd-btn is-primary" data-act="rewatch">${icon('refresh', 15)}<span>Rewatch</span></button>
          <button type="button" class="otd-btn" data-act="diary">${icon('calendar', 15)}<span>View in Diary</span></button>
          <button type="button" class="otd-btn" data-act="close">Close</button>
        </div>
      </div>`;
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
    ov.addEventListener('click', ev => {
      if (ev.target === ov) return close();
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.go) return go(Number(b.dataset.go));
      if (b.dataset.to) { cur = Number(b.dataset.to); return paint(); }
      const a = b.dataset.act, r = rows[cur];
      if (a === 'close') close();
      else if (a === 'diary') location.href = `diary.html?d=${r.watched_date}`;
      else if (a === 'rewatch') rewatch(r, b);
    });
    ov.addEventListener('keydown', ev => {
      const rtl = document.documentElement.dir === 'rtl';
      if (ev.key === 'ArrowRight') { ev.preventDefault(); go(rtl ? -1 : 1); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(rtl ? 1 : -1); }
    });
    let sx = null;
    const track = ov.querySelector('.otd-track');
    track.addEventListener('touchstart', ev => { sx = ev.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', ev => {
      if (sx == null) return; const dx = ev.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) go((dx < 0) !== (document.documentElement.dir === 'rtl') ? 1 : -1);
    }, { passive: true });
    paint();
    MSSDialog.open(ov, { focus: '[data-act="rewatch"]' });
  }

  // Rewatch → Up Next (never twice); a title you've since removed goes back through Add to Library
  async function rewatch(r, btn) {
    btn.disabled = true;
    try {
      const { data: e } = r.entry_id ? await sb.from('entries').select('*').eq('id', r.entry_id).maybeSingle() : { data: null };
      if (!e) {
        if (typeof MSSInfo === 'undefined') await mssLoadScript('js/info-popup.js');
        close();
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
