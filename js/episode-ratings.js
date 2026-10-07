/* ═══════════════════════════════════════════════════════════════
   episode-ratings.js — Episode ratings (MSSEp) · phase 1

   • MSSEp.afterWatch(entry, season, episode)
       Called after "+" marks an episode watched. Respects the global
       setting (Settings → Episode Ratings: ask per show / always / never)
       and the per-show choice, asks the rewatch question once per rewatch,
       then opens the quick-rate popup.
   • MSSEp.rate(entry, season, episode, { onSaved })
       Opens the quick-rate popup directly (info popup "Rate Episodes",
       Episodes page), with ‹ › to move between episodes.
   • MSSEp.seasonEpisodes(tmdbId, season) — TMDB episode details (cached).
   • episode 0 = the whole season: MSSEp.rate(entry, season, 0) rates a
     season. Pressing "+" again while the popup is open queues the next
     episode ("Episode 2 of 3"); finishing a season shows a summary card.
   • MSSEp.showPopup({ title, poster, tmdbId, status, rows, total, userId, whoName })
       A show's rating summary with "View & Rate Episodes".
   • MSSEp.band(score) → { key, name } — the shared colour bands.

   Scores 1.0–10.0 (0.1 steps) · up to 3 tags · optional note ≤ 100 words.
   Stored in episode_ratings (031). Per-show choice: entries.ratings._ep_rate
   ('on' | 'off'); rewatch choice: entries.ratings._ep_rewatch ('update' | 'keep').
   Requires config.js, db.js, nav.js (tmdbFetch).
═══════════════════════════════════════════════════════════════ */

const MSSEp = (() => {
  const BANDS = [
    { min: 9.5, key: 'masterpiece', name: 'Masterpiece' },
    { min: 8.5, key: 'great',       name: 'Great' },
    { min: 7.5, key: 'good',        name: 'Good' },
    { min: 6.5, key: 'decent',      name: 'Decent' },
    { min: 5.0, key: 'meh',         name: 'Meh' },
    { min: 0,   key: 'bad',         name: 'Bad' },
  ];
  const TAGS = ['Plot Twist', 'Emotional', 'Funny', 'Action-Packed', 'Cliffhanger', 'Scary', 'Iconic', 'Character Focus', 'Slow', 'Filler'];
  const NOTE_WORDS = 100;
  const band = v => BANDS.find(b => Number(v) >= b.min) || BANDS[BANDS.length - 1];
  const esc = s => escHTML(s == null ? '' : String(s));
  const isShow = e => e && !(e.cat === 'movies' || e.ratings?._media_type === 'movie');
  const uid = () => window._navUser?.id || null;

  /* ── Global setting (profiles.episode_rating_mode), cached on the device ── */
  const MODE_KEY = 'mss_ep_mode';
  let modeLoaded = null;
  async function mode() {
    if (modeLoaded) return modeLoaded;
    const cached = localStorage.getItem(MODE_KEY);
    if (cached) modeLoaded = cached;
    try {
      if (uid()) {
        const { data } = await sb.from('profiles').select('episode_rating_mode').eq('id', uid()).single();
        if (data?.episode_rating_mode) { modeLoaded = data.episode_rating_mode; localStorage.setItem(MODE_KEY, modeLoaded); }
      }
    } catch {}
    return modeLoaded || 'ask';
  }
  async function setMode(m) {
    modeLoaded = m; localStorage.setItem(MODE_KEY, m);
    const { error } = await sb.from('profiles').update({ episode_rating_mode: m }).eq('id', uid());
    if (error) throw error;
  }

  /* ── TMDB episode details (name, still, air date, runtime, score) — cached 7 days ── */
  const EP_STORE = 'mss_ep_seasons_v3', EP_TTL = 7 * 864e5;
  const epCache = (() => { try { return JSON.parse(localStorage.getItem(EP_STORE) || '{}'); } catch { return {}; } })();
  async function seasonEpisodes(tmdbId, season) {
    if (!tmdbId) return [];
    const k = `${tmdbId}:${season}`, hit = epCache[k];
    if (hit && Date.now() - hit.t < EP_TTL) return hit.eps;
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${tmdbId}/season/${season}?api_key=${TMDB_KEY}&language=en-US`);
      const d = res.ok ? await res.json() : null;
      // Some shows (One Piece) number episodes across the whole series on
      // TMDB (Season 2 starts at 62). Always use the episode's place in its
      // season (1, 2, 3…) to match your progress; keep TMDB's number as abs.
      const sorted = (d?.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number);
      const eps = sorted.map((x, i) => ({ n: i + 1, abs: x.episode_number !== i + 1 ? x.episode_number : null, name: x.name, still: x.still_path, air: x.air_date, rt: x.runtime, vote: x.vote_average, overview: x.overview }));
      epCache[k] = { t: Date.now(), eps };
      const keys = Object.keys(epCache);
      if (keys.length > 120) keys.sort((a, b) => epCache[a].t - epCache[b].t).slice(0, keys.length - 120).forEach(x => delete epCache[x]);
      try { localStorage.setItem(EP_STORE, JSON.stringify(epCache)); } catch {}
      return eps;
    } catch { return []; }
  }
  // Episodes per season: your saved breakdown, else TMDB
  function seasonSizes(e) {
    const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number).filter(n => n > 0) : [];
    return bd;
  }

  async function existing(e, s, n) {
    const { data } = await sb.from('episode_ratings').select('*').eq('entry_id', e.id).eq('season_number', s).eq('episode_number', n).maybeSingle();
    return data || null;
  }
  async function saveEntryPref(e, patch) {
    const ratings = { ...(e.ratings || {}), ...patch };
    await updateProgress(e.id, uid(), { ratings });
    e.ratings = ratings;
  }

  /* ── Popup shell ── */
  let st = null;   // { e, s, n, prev, score, tags:Set, note, eps }
  function inject() {
    if (document.getElementById('mssEpOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'mssEpOverlay';
    ov.innerHTML = `<div id="mssEpCard" role="dialog" aria-modal="true" aria-labelledby="mssEpTitle"></div>`;
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
  }
  function show(html) {
    inject();
    document.getElementById('mssEpCard').innerHTML = html;
    MSSDialog.open(document.getElementById('mssEpOverlay'));
  }
  function close() {
    MSSDialog.close(document.getElementById('mssEpOverlay'));
    st = null;
  }

  /* ── 1) "Rate episodes of …?" (first "+" on a show, when the setting is "ask") ── */
  let askResolve = null;
  function askShow(e) {
    return new Promise(res => {
      askResolve = res;
      const poster = safeURL(e.poster_url);
      show(`<div class="ep-ask">
          <div class="ep-ask-poster">${poster ? `<img src="${poster}" alt="">` : esc((e.title || '?')[0])}</div>
          <div class="ep-ask-body">
            <div class="ep-eyebrow">Episode ratings</div>
            <div class="ep-ask-title" id="mssEpTitle">Rate episodes of ${esc(e.title)}?</div>
            <div class="ep-ask-sub">Each time you mark an episode watched, you can give it a quick score.</div>
          </div>
        </div>
        <div class="ep-actions ep-actions-3" id="mssEpPopupActions">
          <button type="button" class="popup-action-btn" onclick="MSSEp._ask('yes')">Yes</button>
          <button type="button" class="popup-action-btn np-ghost" onclick="MSSEp._ask('later')">Not now</button>
          <button type="button" class="popup-action-btn np-ghost" onclick="MSSEp._ask('never')">Never for this show</button>
        </div>`);
    });
  }
  function answerAsk(a) { const r = askResolve; askResolve = null; close(); r?.(a); }

  /* ── 2) Quick-rate popup ── */
  // The number is a text box: type a score (1–10) or use − / + and the slider
  function scoreHTML() {
    const b = band(st.score);
    return `<div class="ep-score ep-band-${b.key}" id="mssEpScore">
      <input type="text" inputmode="decimal" class="ep-score-input" id="mssEpScoreInput" value="${st.score.toFixed(1)}" maxlength="4"
             aria-label="Episode score, 1 to 10" oninput="MSSEp._typed(this.value)" onchange="MSSEp._typedDone(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      <span id="mssEpBand">${b.name}</span></div>`;
  }
  // Update colour + band name + slider without rewriting what's being typed
  function paintScore() {
    const b = band(st.score), box = document.getElementById('mssEpScore');
    if (box) box.className = `ep-score ep-band-${b.key}`;
    const nm = document.getElementById('mssEpBand'); if (nm) nm.textContent = b.name;
    const sl = document.getElementById('mssEpSlider'); if (sl && Number(sl.value) !== st.score) sl.value = st.score;
  }
  function typed(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (!isNaN(n) && n >= 1 && n <= 10) { st.score = Math.round(n * 10) / 10; paintScore(); }
  }
  function typedDone(el) {
    let n = parseFloat(String(el.value).replace(',', '.'));
    if (isNaN(n)) n = st.score;
    st.score = Math.min(10, Math.max(1, Math.round(n * 10) / 10));
    el.value = st.score.toFixed(1);
    paintScore();
  }
  function render(meta) {
    const e = st.e, m = meta || {};
    const still = m.still ? `https://image.tmdb.org/t/p/w780${m.still}` : null;
    const words = (st.note || '').trim().split(/\s+/).filter(Boolean).length;
    const season = st.n === 0;
    const poster = safeURL(e.poster_url);
    const q = st.queue?.length ? `<div class="ep-queue">Episode ${st.qi + 1} of ${st.queue.length}<span style="width:${Math.round(100 * (st.qi + 1) / st.queue.length)}%"></span></div>` : '';
    show(`${q}<div class="ep-hero${season ? ' ep-hero-season' : ''}">${still ? `<img src="${still}" alt="">` : season && poster ? `<img src="${poster}" alt="" class="ep-hero-poster">` : `<div class="ep-hero-empty">${esc(e.title)}</div>`}
        <span class="ep-se">${season ? 'Season ' + st.s : `S${st.s} · E${st.n}${m.abs ? ` <small>#${m.abs}</small>` : ''}`}</span>
        <button type="button" class="ep-close" onclick="MSSEp.close()" aria-label="Close">✕</button>
      </div>
      <div class="ep-body">
        <div class="ep-eyebrow">${esc(e.title)}${st.prev ? ' · Your previous: ' + Number(st.prev.score).toFixed(1) : ''}</div>
        <div class="ep-title" id="mssEpTitle">${esc(season ? `Rate Season ${st.s}` : (m.name || `Episode ${st.n}`))}</div>
        <div class="ep-meta">${season ? esc([st.eps?.length ? st.eps.length + ' episodes' : '', st.epAvg != null ? 'Your episode average ' + st.epAvg.toFixed(1) : ''].filter(Boolean).join(' · ')) : [m.air ? new Date(m.air + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '', m.rt ? m.rt + 'm' : '', m.vote ? 'TMDB ' + Number(m.vote).toFixed(1) : ''].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="ep-rate">
          ${scoreHTML()}
          <div class="ep-slider-row">
            <button type="button" class="ep-step" onclick="MSSEp._step(-0.1)" aria-label="Lower by 0.1">−</button>
            <input type="range" class="ep-slider" id="mssEpSlider" min="1" max="10" step="0.1" value="${st.score}" aria-label="Episode score" oninput="MSSEp._slide(this.value)">
            <button type="button" class="ep-step" onclick="MSSEp._step(0.1)" aria-label="Raise by 0.1">+</button>
          </div>
        </div>
        <div class="ep-extras">
          <button type="button" class="ep-extra-btn" onclick="MSSEp._toggle('tags')" aria-expanded="${!!st.showTags}">+ Tags${st.tags.size ? ` (${st.tags.size})` : ''}</button>
          <button type="button" class="ep-extra-btn" onclick="MSSEp._toggle('note')" aria-expanded="${!!st.showNote}">+ Note${st.note ? ' ✓' : ''}</button>
        </div>
        ${st.showTags ? `<div class="ep-tags">${TAGS.map(t => `<button type="button" class="genre-opt${st.tags.has(t) ? ' selected' : ''}" onclick="MSSEp._tag(${attrJSON(t)})">${esc(t)}</button>`).join('')}<div class="ep-hint">Up to 3</div></div>` : ''}
        ${st.showNote ? `<div class="ep-note"><textarea class="field-input" id="mssEpNote" rows="3" placeholder="A thought on this episode…" aria-label="Episode note" oninput="MSSEp._note(this)">${esc(st.note || '')}</textarea><div class="ep-hint" id="mssEpNoteCount">${words} / ${NOTE_WORDS} words</div></div>` : ''}
      </div>
      <div class="ep-nav">
        ${st.queue?.length ? `<button type="button" class="ep-nav-btn" onclick="MSSEp.close()">Skip all</button>`
          : `<button type="button" class="ep-nav-btn" onclick="MSSEp._go(-1)" aria-label="Previous">‹ Prev</button>`}
        ${season ? '<span></span>' : `<button type="button" class="ep-stop" onclick="MSSEp._stop()">Stop asking for this show</button>`}
        ${st.queue?.length ? '<span></span>' : `<button type="button" class="ep-nav-btn" onclick="MSSEp._go(1)" aria-label="Next">Next ›</button>`}
      </div>
      <div class="ep-actions" id="mssEpPopupActions">
        <button type="button" class="popup-action-btn np-ghost" onclick="MSSEp._skip()">Skip</button>
        <button type="button" class="popup-action-btn ep-save" onclick="MSSEp._save(this)">Save</button>
      </div>`);
  }
  async function open(e, s, n, opts = {}) {
    if (!e || !isShow(e) || !uid()) return;
    s = Math.max(1, s || 1); n = n === 0 ? 0 : Math.max(1, n || 1);   // n = 0 → rate the whole season
    const prev = await existing(e, s, n).catch(() => null);
    st = { e, s, n, prev, score: prev ? Number(prev.score) : 8.0, tags: new Set(prev?.tags || []), note: prev?.note || '', rewatch: !!opts.rewatch, onSaved: opts.onSaved,
           queue: opts.queue || null, qi: opts.qi || 0, showTags: !!(prev?.tags?.length), showNote: !!prev?.note };
    render(null);
    const eps = await seasonEpisodes(e.tmdb_id, s);
    if (!st || st.e !== e || st.s !== s || st.n !== n) return;
    st.eps = eps;
    if (n === 0) {                                          // season: start from your episode average
      const { data: mine } = await sb.from('episode_ratings').select('score').eq('entry_id', e.id).eq('season_number', s).gt('episode_number', 0);
      const sc = (mine || []).map(r => Number(r.score));
      st.epAvg = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
      if (!prev && st.epAvg != null) st.score = Math.round(st.epAvg * 10) / 10;
      return render(null);
    }
    const meta = eps.find(x => x.n === n) || null;
    if (!prev && meta?.vote) st.score = Math.min(10, Math.max(1, Math.round(meta.vote * 10) / 10));   // start from TMDB's score
    render(meta);
  }

  function setScore(v) {
    st.score = Math.min(10, Math.max(1, Math.round(Number(v) * 10) / 10));
    const inp = document.getElementById('mssEpScoreInput'); if (inp) inp.value = st.score.toFixed(1);
    paintScore();
  }
  function toggleTag(t) {
    if (st.tags.has(t)) st.tags.delete(t);
    else if (st.tags.size < 3) st.tags.add(t);
    else { showToast('Up to 3 tags per episode.'); return; }
    render(st.eps?.find(x => x.n === st.n));
  }
  function onNote(el) {
    let w = el.value.trim().split(/\s+/).filter(Boolean);
    if (w.length > NOTE_WORDS) { el.value = clampWords(el.value, NOTE_WORDS); w = w.slice(0, NOTE_WORDS); }
    st.note = el.value;
    const c = document.getElementById('mssEpNoteCount'); if (c) c.textContent = `${Math.min(w.length, NOTE_WORDS)} / ${NOTE_WORDS} words`;
  }
  async function go(dir) {
    if (!st) return;
    const e = st.e, sizes = seasonSizes(e);
    let { s, n } = st;
    if (n === 0) { s = Math.max(1, s + dir); if (sizes.length) s = Math.min(s, sizes.length); return open(e, s, 0, { onSaved: st.onSaved }); }
    const count = sizes[s - 1] || (st.eps?.length || 0);
    n += dir;
    if (n < 1) { if (s > 1) { s--; n = sizes[s - 1] || (await seasonEpisodes(e.tmdb_id, s)).length || 1; } else n = 1; }
    else if (count && n > count) { if (!sizes.length || s < sizes.length) { s++; n = 1; } else n = count; }
    open(e, s, n, { rewatch: st.rewatch, onSaved: st.onSaved });
  }
  async function save(btn) {
    if (!st) return;
    const inp = document.getElementById('mssEpScoreInput'); if (inp) typedDone(inp);
    const { e, s, n, prev } = st;
    btn.disabled = true; btn.textContent = 'Saving…';
    const row = {
      user_id: uid(), entry_id: e.id, tmdb_id: e.tmdb_id || null, season_number: s, episode_number: n,
      score: st.score, tags: [...st.tags], note: (st.note || '').trim() || null, is_rewatch: !!st.rewatch,
    };
    try {
      const { error } = await sb.from('episode_ratings').upsert(row, { onConflict: 'user_id,entry_id,season_number,episode_number' });
      if (error) throw error;
      if (e.ratings?._ep_rate !== 'on') saveEntryPref(e, { _ep_rate: 'on' }).catch(() => {});   // rating one turns the show (back) on
      const onSaved = st.onSaved, queue = st.queue, qi = st.qi, eps = st.eps;
      close();
      onSaved?.(row);
      if (queue && qi + 1 < queue.length) open(e, queue[qi + 1][0], queue[qi + 1][1], { queue, qi: qi + 1, rewatch: row.is_rewatch, onSaved });
      else if (n > 0) maybeSeasonDone(e, s, n, eps);
      showUndoToast(`Rated S${s} · E${n} — ${row.score.toFixed(1)}`, async () => {
        if (prev) {
          const { id, created_at, updated_at, ...back } = prev;
          const { error: er } = await sb.from('episode_ratings').upsert(back, { onConflict: 'user_id,entry_id,season_number,episode_number' });
          if (er) throw er;
        } else {
          const { error: er } = await sb.from('episode_ratings').delete().eq('entry_id', e.id).eq('season_number', s).eq('episode_number', n);
          if (er) throw er;
        }
        onSaved?.(null);
      });
    } catch (err) {
      console.error('Episode rating:', err);
      showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t save that rating — try again.', 'err');
      btn.disabled = false; btn.textContent = 'Save';
    }
  }
  // Skip: the next queued episode, if any
  function skip() {
    if (!st) return;
    const { e, queue, qi, onSaved, rewatch } = st;
    close();
    if (queue && qi + 1 < queue.length) open(e, queue[qi + 1][0], queue[qi + 1][1], { queue, qi: qi + 1, rewatch, onSaved });
  }

  /* ── 3) Season finished: summary card (after rating its last episode) ── */
  async function maybeSeasonDone(e, s, n, eps) {
    const size = seasonSizes(e)[s - 1] || eps?.length || 0;
    if (!size || n < size) return;
    const { data } = await sb.from('episode_ratings').select('episode_number,score').eq('entry_id', e.id).eq('season_number', s).gt('episode_number', 0);
    const rs = (data || []).sort((a, b) => a.episode_number - b.episode_number);
    if (rs.length < 2) return;
    const a = rs.reduce((x, r) => x + Number(r.score), 0) / rs.length;
    const best = rs.reduce((x, y) => (Number(y.score) > Number(x.score) ? y : x)), worst = rs.reduce((x, y) => (Number(y.score) < Number(x.score) ? y : x));
    const b = band(a);
    show(`<div class="ep-body ep-done">
        <div class="ep-eyebrow">${esc(e.title)}</div>
        <div class="ep-title" id="mssEpTitle">Season ${s} complete</div>
        <div class="ep-score ep-band-${b.key}" style="margin:14px auto"><b>${a.toFixed(1)}</b><span>Your average · ${b.name}</span></div>
        <div class="ep-done-row" aria-label="Season ${s} episode scores">${rs.map(r => `<i class="ep-band-${band(r.score).key}" title="E${r.episode_number}: ${Number(r.score).toFixed(1)}">${Number(r.score).toFixed(1)}</i>`).join('')}</div>
        <div class="ep-meta" style="text-align:center;margin-top:10px">Best: E${best.episode_number} (${Number(best.score).toFixed(1)}) · Lowest: E${worst.episode_number} (${Number(worst.score).toFixed(1)})</div>
      </div>
      <div class="ep-actions">
        <button type="button" class="popup-action-btn np-ghost" onclick="MSSEp.close()">Done</button>
        <button type="button" class="popup-action-btn ep-save" onclick="MSSEp._rateSeason(${s})">Rate the Season</button>
      </div>`);
    lastEntry = e;
  }
  let lastEntry = null;

  async function stop() {
    if (!st) return;
    const e = st.e;
    close();
    try { await saveEntryPref(e, { _ep_rate: 'off' }); showToast(`Won’t ask for ${e.title} — turn it back on from the info popup.`); }
    catch { showToast('Couldn’t save that — try again.', 'err'); }
  }

  /* ── 4) Show popup: a show's episode-rating summary, then "View & Rate"
     (Episodes page cards and profile Episodes tabs) ──
     o = { title, poster, tmdbId, status, rows:[{season_number, episode_number, score, updated_at}],
           total, userId (someone else's), whoName } */
  const STATUS_LABEL = { watching: 'Watching', ongoing: 'To Be Continued', completed: 'Watched', up_next: 'Up Next', paused: 'Taking a Break', queue: 'Watchlist' };
  function showPopup(o) {
    const rows = (o.rows || []).filter(r => r.episode_number > 0).sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
    const avg = rows.length ? rows.reduce((x, r) => x + Number(r.score), 0) / rows.length : null;
    const best = rows.length ? rows.reduce((x, y) => (Number(y.score) > Number(x.score) ? y : x)) : null;
    const last = rows.length ? rows.reduce((x, y) => (new Date(y.updated_at) > new Date(x.updated_at) ? y : x)) : null;
    const b = avg != null ? band(avg) : null;
    const href = `episodes.html?show=${o.tmdbId}${o.userId ? '&user=' + encodeURIComponent(o.userId) : ''}`;
    const poster = safeURL(o.poster);
    show(`<div class="ep-show-head">
        <div class="ep-show-poster">${poster ? `<img src="${poster}" alt="">` : esc((o.title || '?')[0])}</div>
        <div class="ep-show-info">
          <div class="ep-eyebrow">${o.whoName ? esc(o.whoName) + '’s episode ratings' : 'Episode ratings'}</div>
          <div class="ep-title" id="mssEpTitle">${esc(o.title)}</div>
          ${o.status ? `<span class="ep-status">${esc(STATUS_LABEL[o.status] || o.status)}</span>` : ''}
        </div>
        <button type="button" class="ep-close ep-close-flat" onclick="MSSEp.close()" aria-label="Close">✕</button>
      </div>
      <div class="ep-body">
        <div class="ep-show-stats">
          <div class="ep-show-stat ${b ? 'ep-band-' + b.key : ''}"><b>${avg != null ? avg.toFixed(1) : '—'}</b><span>${b ? b.name : 'Average'}</span></div>
          <div class="ep-show-stat"><b>${rows.length}${o.total ? `<small>/${o.total}</small>` : ''}</b><span>Rated</span></div>
          <div class="ep-show-stat"><b>${best ? Number(best.score).toFixed(1) : '—'}</b><span>${best ? `Best · S${best.season_number}·E${best.episode_number}` : 'Best'}</span></div>
        </div>
        ${o.total ? `<div class="ep-show-progress" aria-label="${rows.length} of ${o.total} episodes rated"><span style="width:${Math.min(100, Math.round(100 * rows.length / o.total))}%"></span></div>` : ''}
        ${rows.length ? `<div class="eg-mini ep-show-mini" aria-hidden="true">${rows.slice(0, 120).map(r => `<i class="ep-band-${band(r.score).key}" title="S${r.season_number}·E${r.episode_number}: ${Number(r.score).toFixed(1)}"></i>`).join('')}</div>` : `<p class="ep-ask-sub">No episodes rated yet${o.userId ? '' : ' — open the show to start rating'}.</p>`}
        ${last ? `<div class="ep-meta" style="margin-top:10px">Last rated: S${last.season_number} · E${last.episode_number} · ${new Date(last.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
      </div>
      <div class="ep-actions">
        <button type="button" class="popup-action-btn np-ghost" onclick="MSSEp.close()">Close</button>
        <a class="popup-action-btn ep-save" href="${href}">${o.userId ? 'View Ratings' : 'View & Rate Episodes'}</a>
      </div>`);
  }

  /* Show card (Episodes page + profile Episodes tabs) → opens showPopup */
  const cards = {};
  const totalOf = e => (Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number).filter(n => n > 0).reduce((a, b) => a + b, 0) : 0) || null;
  function showCardHTML(e, rows, o = {}) {
    cards[e.id] = { e, rows, o };
    const rs = (rows || []).filter(r => r.episode_number > 0).sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
    const avg = rs.length ? rs.reduce((x, r) => x + Number(r.score), 0) / rs.length : null;
    const total = totalOf(e), b = avg != null ? band(avg) : null;
    const poster = safeURL(e.poster_url);
    return `<button type="button" class="eg-show" onclick="MSSEp._card(${attrJSON(e.id)})" aria-label="${esc(e.title)} — episode ratings">
      <span class="eg-show-poster">${poster ? `<img src="${poster}" alt="" loading="lazy">` : ''}</span>
      <span class="eg-show-info">
        <span class="eg-show-title">${esc(e.title)}</span>
        <span class="eg-show-tags">${e.status ? `<span class="ep-status">${esc(STATUS_LABEL[e.status] || e.status)}</span>` : ''}${b ? `<span class="eg-show-avg ep-band-${b.key}">${avg.toFixed(1)}</span>` : ''}</span>
        <span class="eg-show-sub">${rs.length ? `${rs.length}${total ? ' / ' + total : ''} episodes rated` : 'No episodes rated yet'}</span>
        ${total ? `<span class="ep-show-progress eg-show-progress"><span style="width:${Math.min(100, Math.round(100 * rs.length / total))}%"></span></span>` : ''}
        ${rs.length ? `<span class="eg-mini" title="Your episode scores — one square per rated episode">${rs.slice(0, 60).map(r => `<i class="ep-band-${band(r.score).key}" title="S${r.season_number}·E${r.episode_number}: ${Number(r.score).toFixed(1)}"></i>`).join('')}</span>` : ''}
      </span>
    </button>`;
  }
  function openCard(id) {
    const c = cards[id]; if (!c) return;
    showPopup({ title: c.e.title, poster: c.e.poster_url, tmdbId: c.e.tmdb_id, status: c.e.status, rows: c.rows, total: totalOf(c.e), userId: c.o.userId, whoName: c.o.whoName });
  }

  /* ── After "+" ── */
  const askedThisVisit = new Set();
  async function afterWatch(e, s, n) {
    if (!isShow(e) || !uid() || !n) return;
    // "+" again while rating this show → line it up instead of replacing
    if (st && st.e.id === e.id && st.n > 0) {
      if (!st.queue) { st.queue = [[st.s, st.n]]; st.qi = 0; }
      if (!st.queue.some(([a, b]) => a === s && b === n)) st.queue.push([s, n]);
      render(st.eps?.find(x => x.n === st.n));
      return;
    }
    const m = await mode();
    if (m === 'off') return;
    let pref = e.ratings?._ep_rate;
    if (pref === 'off') return;
    if (pref !== 'on') {
      if (m === 'always') pref = 'on';
      else {
        if (askedThisVisit.has(e.id)) return;
        askedThisVisit.add(e.id);
        const a = await askShow(e);
        if (a === 'later') return;
        try { await saveEntryPref(e, { _ep_rate: a === 'yes' ? 'on' : 'off' }); } catch {}
        if (a !== 'yes') return;
      }
    }
    // Rewatching: ask once whether to update already-rated episodes
    if (typeof isRewatching === 'function' && isRewatching(e)) {
      const prev = await existing(e, s, n).catch(() => null);
      if (prev) {
        let choice = e.ratings?._ep_rewatch;
        if (!choice) {
          const yes = await showConfirm({ title: 'This is a rewatch', message: 'Update your episode ratings as you go? Your previous scores are shown so you can keep or change them.', confirmText: 'Update', iconName: 'refresh', danger: false });
          choice = yes ? 'update' : 'keep';
          try { await saveEntryPref(e, { _ep_rewatch: choice }); } catch {}
        }
        if (choice === 'keep') return;
        return open(e, s, n, { rewatch: true });
      }
    }
    open(e, s, n);
  }

  return {
    afterWatch, rate: (e, s, n, o = {}) => open(e, s, n, { ...o, rewatch: typeof isRewatching === 'function' && isRewatching(e) }),
    close, band, BANDS, TAGS, mode, setMode, isShow, seasonEpisodes, showPopup, showCardHTML, _card: openCard,
    _ask: answerAsk, _slide: setScore, _typed: typed, _typedDone: typedDone, _step: d => st && setScore(st.score + d), _tag: toggleTag, _note: onNote,
    _toggle: k => { if (!st) return; st[k === 'tags' ? 'showTags' : 'showNote'] = !st[k === 'tags' ? 'showTags' : 'showNote']; render(st.eps?.find(x => x.n === st.n)); },
    _go: go, _save: save, _stop: stop, _skip: skip,
    _rateSeason: sn => { const e = lastEntry; close(); if (e) open(e, sn, 0); },
  };
})();
