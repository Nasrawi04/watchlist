/* ═══════════════════════════════════════════════════════════════
   episode-ratings.js — Episode ratings (MSSEp) · phase 1

   • MSSEp.afterWatch(entry, season, episode)
       Called after "+" marks an episode watched. Respects the global
       setting (Settings → Episode Ratings: ask per show / always / never)
       and the per-show choice, asks the rewatch question once per rewatch,
       then opens the quick-rate popup.
   • MSSEp.rate(entry, season, episode, { onSaved, note })   note: start in the note box
       Opens Rate episodes directly (info popup "Rate Episodes", Episodes page): a side panel L,
       or a full page on phones (js/panel.js), with Prev / Next to move between episodes.
   • MSSEp.seasonEpisodes(tmdbId, season) — TMDB episode details (cached).
   • MSSEp.warm(entries) — the episode pictures of the in-progress shows on screen, loaded ahead (see warm()).
   • episode 0 = the whole season: MSSEp.rate(entry, season, 0) rates a
     season. Pressing "+" again while the popup is open queues the next
     episode ("Episode 2 of 3"); finishing a season shows a summary card.
   • MSSEp.showPopup({ title, poster, tmdbId, entry, status, rows, total, userId, whoName })
       A show's rating summary with "View & Rate Episodes" — a side panel L / full page.
       "Rate episodes of …?" is the shared confirm with a third answer (altText).
   • MSSEp.band(score) → { key, name } — the shared colour bands (= mssScoreTier's 9 tiers).

   Scores 1.0–10.0 (0.1 steps) · up to 3 tags · optional note (a season's: its review), up to 500 words,
   with bold / italic / quotes, a spoiler mark and who can read it (Anyone · Friends · Only me — 108).
   A Friends / Only me note's text lives in episode_private_notes: mssWithEpNotes(rows) (db.js) puts it back.
   Stored in episode_ratings (031). Per-show choice: entries.ratings._ep_rate
   ('on' | 'off'); rewatch choice: entries.ratings._ep_rewatch ('update' | 'keep').
   Requires config.js, db.js, nav.js (tmdbFetch).
═══════════════════════════════════════════════════════════════ */

// Who can read the note in the rating popup (the shared picker calls a page-level function by name)
function _mssEpNoteVis(v) { MSSEp._noteVis(v); }
const MSSEp = (() => {
  // the colour bands are the site's rating scale (MSS_TIERS, config.js): Masterpiece 9.90+ … Garbage < 4
  const BANDS = MSS_TIERS.map(t => ({ min: t.min, key: t.key, name: t.name, gold: !!t.gold }));
  const TAGS = ['Plot Twist', 'Emotional', 'Funny', 'Action-Packed', 'Cliffhanger', 'Scary', 'Iconic', 'Character Focus', 'Slow', 'Filler'];
  const NOTE_WORDS = NOTE_WORD_LIMIT;   // 500, like title notes (config.js)
  const band = v => BANDS.find(b => Number(Number(v).toFixed(2)) >= b.min) || BANDS[BANDS.length - 1];
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
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${tmdbId}/season/${season}?language=en-US`);
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

  /* ── Pictures ready before you open them (owner, 23 Nov 2026 · perf audit) ──
     warm(entries): for the in-progress shows on screen (Library, Home), the stills of the episode you're on and the
     next one — or the show's backdrop when TMDB has no still — start loading quietly in the background, with the
     panel's code, so + (MSSEp.afterWatch) and the S·E label open with the picture already there. The same address
     the panel uses, so the browser simply has it. Skipped on Data Saver / 2G; at most 12 shows a call, each spot once. */
  const warmed = new Set();
  const slowNet = () => { const c = navigator.connection; return !!c && (c.saveData || /2g$/.test(c.effectiveType || '')); };
  function nextSpot(e) {
    const sizes = seasonSizes(e);
    let s = Number(e.season) || 1, n = (Number(e.episode) || 0) + 1;
    if (sizes[s - 1] && n > sizes[s - 1] && sizes[s]) { s++; n = 1; }
    return [s, n];
  }
  function warm(list) {
    if (slowNet() || typeof tmdbFetch !== 'function') return;
    const shows = (list || []).filter(e => e?.tmdb_id && isShow(e)).slice(0, 12);
    if (!shows.length) return;
    const go = async () => {
      mssLoadScript('js/panel.js');
      for (const e of shows) {
        for (const [s, n] of [[Number(e.season) || 1, Math.max(1, Number(e.episode) || 1)], nextSpot(e)]) {
          const k = `${e.id}:${s}:${n}`;
          if (warmed.has(k)) continue;
          warmed.add(k);
          try {
            const url = await stillOf(e, (await seasonEpisodes(e.tmdb_id, s)).find(x => x.n === n) || {});
            if (url) { const im = new Image(); im.decoding = 'async'; im.src = url; }
          } catch { /* the panel loads it when opened, as before */ }
        }
      }
    };
    'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200);
  }

  async function existing(e, s, n) {
    const { data } = await sb.from('episode_ratings').select('*').eq('entry_id', e.id).eq('season_number', s).eq('episode_number', n).maybeSingle();
    return data ? (await mssWithEpNotes([data]))[0] : null;
  }
  async function saveEntryPref(e, patch) {
    const ratings = { ...(e.ratings || {}), ...patch };
    await updateProgress(e.id, uid(), { ratings });
    e.ratings = ratings;
  }

  // Every item tied for the highest and the lowest score (as shown: to one decimal)
  function extremes(items, val) {
    const v = x => Math.round(Number(val(x)) * 10) / 10, all = items.map(v);
    const hi = Math.max(...all), lo = Math.min(...all);
    return { hi: items.filter(x => v(x) === hi), lo: items.filter(x => v(x) === lo), high: hi, low: lo };
  }

  /* ── Rate episodes: one panel that stays open while you move between episodes ── */
  let st = null;   // { e, s, n, prev, score, tags:Set, note, eps }
  let ph = null;   // the panel's handle
  let paintQ = Promise.resolve();
  // Fill the panel (opening it the first time); one paint at a time, in order
  function paint(o) {
    paintQ = paintQ.then(async () => {
      if (!ph) {
        await mssLoadScript('js/panel.js');
        if (!st && !o.done) return;                           // closed while loading
        const h = MSSPanel.open({ size: 'L', kind: 'title', tallHero: true, title: o.title, subtitle: o.sub, label: o.label, heroImg: o.media, body: o.body, footer: o.footer,
          dirty: () => !!st?.changed, onClose: () => { if (ph === h) { ph = null; st = null; } } });
        ph = h;
      } else {
        ph.setTitle(o.title, o.sub); ph.setHero(o.media); ph.setBody(o.body); ph.setFooter(o.footer);
        ph.body.closest('.lyr-body').scrollTop = 0;
      }
      o.after?.();
    });
    return paintQ;
  }
  function close() {
    const h = ph; ph = null; st = null;
    h?.closeNow();
  }

  /* ── 1) "Rate episodes of …?" (first "+" on a show, when the setting is "ask") ── */
  // the shared confirm with a third answer: Yes (green) · Not now · Never for this show
  async function askShow(e) {
    const a = await showConfirm({ title: `Rate episodes of ${e.title}?`, message: 'Each time you mark an episode watched, you can give it a quick score.',
      confirmText: 'Yes', cancelText: 'Not now', altText: 'Never for this show', iconName: 'star', danger: false });
    return a === true ? 'yes' : a === 'alt' ? 'never' : 'later';
  }

  /* ── 2) Quick-rate popup ── */
  // The number is a text box: type a score (1–10) or use − / + and the slider
  function scoreHTML() {
    const b = band(st.score);
    return `<div class="ep-score ep-band-${b.key}" id="mssEpScore">
      <input type="text" inputmode="decimal" data-mask="rating" class="ep-score-input" id="mssEpScoreInput" value="${st.score.toFixed(1)}" maxlength="4"
             aria-label="Episode score, 1 to 10" oninput="MSSEp._typed(this.value)" onchange="MSSEp._typedDone(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      <span id="mssEpBand">${b.name}</span></div>`;
  }
  // The slider drawn as 10 segments, filled up to the score (the last one partly)
  const segFill = i => Math.min(1, Math.max(0, st.score - i));
  const segsHTML = () => Array.from({ length: 10 }, (_, i) => `<i style="--f:${segFill(i)}"></i>`).join('');
  // Update colour + band name + slider without rewriting what's being typed
  function paintScore() {
    document.querySelectorAll('#mssEpSegs i').forEach((el, i) => el.style.setProperty('--f', segFill(i)));
    const b = band(st.score), box = document.getElementById('mssEpScore');
    if (box) box.className = `ep-score ep-band-${b.key}`;
    const nm = document.getElementById('mssEpBand'); if (nm) nm.textContent = b.name;
    const sl = document.getElementById('mssEpSlider');
    if (sl) { if (Number(sl.value) !== st.score) sl.value = st.score; sl.setAttribute('aria-valuetext', `${mssR1(st.score)}, ${b.name}`); }
  }
  function typed(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (!isNaN(n) && n >= 1 && n <= 10) { st.score = Math.round(n * 10) / 10; st.changed = true; paintScore(); }
  }
  function typedDone(el) {
    if (!st || !el.isConnected) return;     // a box being replaced must not write onto the next episode
    let n = parseFloat(String(el.value).replace(',', '.'));
    if (isNaN(n)) n = st.score;
    const was = st.score;
    st.score = Math.min(10, Math.max(1, Math.round(n * 10) / 10));
    if (st.score !== was) st.changed = true;
    el.value = st.score.toFixed(1);
    paintScore();
  }
  // Where you are: "The Sopranos · episode 51 of 86" (from your season breakdown, when there is one)
  function whereText(e, s, n) {
    const sizes = seasonSizes(e), sum = a => a.reduce((x, y) => x + y, 0);
    if (n === 0) return `${e.title} · Season ${s}${sizes.length ? ` of ${sizes.length}` : ''}`;
    return sizes.length >= s ? `${e.title} · episode ${sum(sizes.slice(0, s - 1)) + n} of ${sum(sizes)}` : `${e.title} · S${s} · E${n}`;
  }
  async function stillOf(e, m) {
    if (m.still) return `https://image.tmdb.org/t/p/w1280${m.still}`;
    return e.tmdb_id ? MSSBackdrop.url(e).catch(() => null) : null;     // no still: the show's backdrop (the one picked for it, else TMDB's)
  }
  // the numbers under the picture: TMDB, when it aired, how long (a season: its episodes, your average)
  function statsHTML(m, season) {
    const t = (v, lbl, sm) => `<div class="lyr-stat${sm ? ' is-sm' : ''}${typeof v === 'number' ? ' ep-band-' + band(v).key : ''}"><b>${typeof v === 'number' ? mssR1(v) : esc(v)}</b><span>${esc(lbl)}</span></div>`;
    const list = season
      ? [st.eps?.length ? t(String(st.eps.length), 'Episodes') : null, st.epAvg != null ? t(st.epAvg, 'Your episode average') : null]
      : [m.vote ? t(Number(mssR1(m.vote)), 'TMDB') : null,
         m.air ? t(new Date(m.air + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { month: 'short', day: 'numeric', year: 'numeric' }), 'Aired', true) : null,
         m.rt ? t(m.rt + 'm', 'Runtime', true) : null];
    const shown = list.filter(Boolean);
    return shown.length ? `<div class="lyr-stats${shown.length > 3 ? ' is-wrap' : ''}" style="--n:${shown.length}">${shown.join('')}</div>` : '';
  }
  async function render(meta) {
    const e = st.e, m = meta || {}, at = st;
    const season = st.n === 0;
    const [media] = await Promise.all([stillOf(e, m), mssLoadScript('js/panel.js')]);
    if (st !== at) return;
    const page = !mssLayerFits(600), next = page && !season;     // phones: Save & next
    const q = st.queue?.length ? `<div class="ep-queue">Episode ${st.qi + 1} of ${st.queue.length}<span style="width:${Math.round(100 * (st.qi + 1) / st.queue.length)}%"></span></div>` : '';
    const tags = st.showTags
      ? `<div class="ep-tags">${TAGS.map(t => `<button type="button" class="genre-opt${st.tags.has(t) ? ' selected' : ''}" aria-pressed="${st.tags.has(t)}" onclick="MSSEp._tag(${attrJSON(t)})">${esc(t)}</button>`).join('')}</div>
         <p class="lyr-hint">Up to 3 · <button type="button" class="ep-link" onclick="MSSEp._toggle('tags')" aria-expanded="true">Done</button></p>`
      : `<div class="ep-tags">${[...st.tags].map(t => `<span class="genre-opt selected">${esc(t)}</span>`).join('')}
         <button type="button" class="ep-extra-btn" onclick="MSSEp._toggle('tags')" aria-expanded="false">${st.tags.size ? 'Edit tags' : '+ Add tag'}</button></div>`;
    const navRow = st.queue?.length ? '' : `<div class="ep-nav">
        <button type="button" class="ep-nav-btn" onmousedown="event.preventDefault()" onclick="MSSEp._go(-1)">‹ Prev</button>
        <button type="button" class="ep-nav-btn" onmousedown="event.preventDefault()" onclick="MSSEp._go(1)">Next ›</button></div>`;
    const body = `${q}
      <div class="ep-eyebrow">${season ? 'Season ' + st.s : `S${st.s} · E${st.n}${m.abs ? ` <small>#${m.abs}</small>` : ''}`}${st.prev ? `<span> · ${mssT('Your previous: {0}', mssR1(Number(st.prev.score)))}</span>` : ''}</div>
      ${statsHTML(m, season)}
      ${!season && m.overview ? `<div class="ep-overview"><p class="ep-overview-txt${m.overview.length > 200 ? ' is-clamped' : ''}" id="mssEpOverview" translate="no">${esc(m.overview)}</p>${m.overview.length > 200 ? `<button type="button" class="ep-link" aria-expanded="false" aria-controls="mssEpOverview" onclick="this.previousElementSibling.classList.toggle('is-clamped'); const o = this.getAttribute('aria-expanded') === 'true'; this.setAttribute('aria-expanded', !o); this.textContent = o ? 'More' : 'Less'">More</button>` : ''}</div>` : ''}
      <div class="ep-rate">
        ${scoreHTML()}
        <div class="ep-slider-row">
          <button type="button" class="ep-step" onclick="MSSEp._step(-0.1)" aria-label="Lower by 0.1">${icon('minus', 16)}</button>
          <div class="ep-bar"><span class="ep-bar-segs" id="mssEpSegs" aria-hidden="true">${segsHTML()}</span>
            <input type="range" class="ep-slider" id="mssEpSlider" min="1" max="10" step="0.1" value="${st.score}" aria-label="Episode score" aria-valuetext="${mssR1(st.score)}, ${band(st.score).name}" oninput="MSSEp._slide(this.value)"></div>
          <button type="button" class="ep-step" onclick="MSSEp._step(0.1)" aria-label="Raise by 0.1">${icon('plus', 16)}</button>
        </div>
      </div>
      <div class="lyr-sec"><h4 class="lyr-sec-h">Tags</h4>${tags}</div>
      <div class="lyr-sec ep-note"><h4 class="lyr-sec-h"><label for="mssEpNote">${season ? 'Review' : 'Note'}</label></h4>
        <div id="mssEpNoteTools"></div>
        <textarea class="field-input" id="mssEpNote" rows="4" placeholder="${season ? 'Your review of this season…' : 'Add a note about this episode…'}" oninput="MSSEp._note(this)">${esc(st.note || '')}</textarea>
        <div class="ep-hint" id="mssEpNoteCount">${(st.note || '').trim().split(/\s+/).filter(Boolean).length} / ${NOTE_WORDS} words</div>
        ${mssEpNoteVisHTML('mssEpNoteVis', st.noteVis, '_mssEpNoteVis')}
      </div>
      ${navRow}
      ${season || !st.prompted ? '' : `<p class="ep-stop-row"><button type="button" class="ep-stop" onclick="MSSEp._stop()">Stop asking for this show</button></p>`}`;
    const more = { label: 'More actions', icon: 'moreV', onClick: (h, b) => moreMenu(b) };
    const footer = st.queue?.length
      ? { secondary: [more, { label: 'Skip', onClick: () => skip() }, { label: 'Skip all', onClick: () => close() }], primary: { label: 'Save', onClick: () => save() } }
      : { secondary: [more, { label: 'Skip', onClick: () => skip() },
            { label: '‹ Prev', end: true, only: 'side', onClick: () => go(-1) }, { label: 'Next ›', end: true, only: 'side', onClick: () => go(1) }],
          primary: { label: next ? 'Save & next' : 'Save', onClick: () => (next ? saveNext() : save()) } };
    await paint({ title: season ? `Rate Season ${st.s}` : (m.name || `Episode ${st.n}`),
      sub: whereText(e, st.s, st.n), label: `Rate episodes, ${e.title}`, media, body, footer,
      after: () => { noteTools(e); if (st?.focusNote) { st.focusNote = false; document.getElementById('mssEpNote')?.focus(); } } });
  }
  // ⋯ in the footer: remove this rating (Undo in the toast) · remove all of them (asks first)
  function moreMenu(btn) {
    if (!st) return;
    const { e, onSaved } = st;
    MSSPopover.open(btn, { title: e.title, label: 'More actions', items: [
      ...(st.prev ? [{ label: 'Remove rating', icon: 'trash', danger: true, onSelect: removeHere }] : []),
      { label: 'Remove all ratings', icon: 'trash', danger: true, onSelect: () => { close(); removeAll(e, { onSaved }); } },
    ] });
  }
  // The note's editor, like a title note's: B · I · U · S · Quote, the spoiler mark at the end of the row,
  // styles as you type, typing stops at the word limit
  function noteTools(e) {
    const ta = document.getElementById('mssEpNote');
    document.getElementById('mssEpNoteTools').innerHTML = MSSRich.toolbarHTML('mssEpNote', `<div class="mss-rt-end">${mssSpoilerToggleHTML('mssEpSpoiler', typeof MSSEgg !== 'undefined' ? e : null)}</div>`);   // a title's own spoiler wording where easter-egg.js is loaded
    MSSRich.attach(ta, { maxWords: NOTE_WORDS, onLimit: () => {
      const c = document.getElementById('mssEpNoteCount');
      if (c) { c.textContent = `Reached max word limit (${NOTE_WORDS}/${NOTE_WORDS} words)`; c.classList.add('over'); }
    } });
    const sp = document.getElementById('mssEpSpoiler');
    sp.checked = !!st.noteSpoiler;
    sp.addEventListener('change', () => { st.noteSpoiler = sp.checked; st.changed = true; });
  }
  async function open(e, s, n, opts = {}) {
    if (!e || !isShow(e) || !uid()) return;
    s = Math.max(1, s || 1); n = n === 0 ? 0 : Math.max(1, n || 1);   // n = 0 → rate the whole season
    const prev = await existing(e, s, n).catch(() => null);
    st = { e, s, n, prev, score: prev ? Number(prev.score) : 8.0, tags: new Set(prev?.tags || []), note: prev?.note || '', rewatch: !!opts.rewatch, onSaved: opts.onSaved, prompted: !!opts.prompted,
           noteVis: prev?.note_visibility || 'anyone', noteSpoiler: !!prev?.note_spoiler,
           queue: opts.queue || null, qi: opts.qi || 0, showTags: false, focusNote: !!opts.note };
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
    if (!prev && meta?.vote && !st.changed) st.score = Math.min(10, Math.max(1, Math.round(meta.vote * 10) / 10));   // start from TMDB's score
    render(meta);
  }

  function setScore(v) {
    st.changed = true;
    st.score = Math.min(10, Math.max(1, Math.round(Number(v) * 10) / 10));
    const inp = document.getElementById('mssEpScoreInput'); if (inp) inp.value = st.score.toFixed(1);
    paintScore();
  }
  function toggleTag(t) {
    if (st.tags.has(t)) st.tags.delete(t);
    else if (st.tags.size < 3) st.tags.add(t);
    else { showToast('Up to 3 tags per episode.'); return; }
    st.changed = true;
    render(st.eps?.find(x => x.n === st.n));
  }
  function onNote(el) {
    let w = el.value.trim().split(/\s+/).filter(Boolean);
    if (w.length > NOTE_WORDS) { el.value = clampWords(el.value, NOTE_WORDS); w = w.slice(0, NOTE_WORDS); }
    st.note = el.value;
    st.changed = true;
    const c = document.getElementById('mssEpNoteCount'); if (c) c.textContent = `${Math.min(w.length, NOTE_WORDS)} / ${NOTE_WORDS} words`;
  }
  // Prev / Next: anything you changed here saves first, and a failed save keeps you here.
  // An episode you only looked at stays unrated (its score is just TMDB's starting point).
  async function go(dir) {
    if (!st || st.moving) return;
    st.moving = true;
    const inp = document.getElementById('mssEpScoreInput'); if (inp) { inp.blur(); typedDone(inp); }
    const at = st;
    if (st.changed) {
      try { offerUndo(await persist()); }
      catch (err) { saveFailed(err); if (st === at) st.moving = false; return; }
      at.onSaved?.(at.lastRow);
    }
    if (st !== at) return;     // closed while it was saving
    const e = st.e, sizes = seasonSizes(e);
    let { s, n } = st;
    if (n === 0) { s = Math.max(1, s + dir); if (sizes.length) s = Math.min(s, sizes.length); return open(e, s, 0, { onSaved: st.onSaved, prompted: st.prompted }); }
    const count = sizes[s - 1] || (st.eps?.length || 0);
    n += dir;
    if (n < 1) { if (s > 1) { s--; n = sizes[s - 1] || (await seasonEpisodes(e.tmdb_id, s)).length || 1; } else n = 1; }
    else if (count && n > count) { if (!sizes.length || s < sizes.length) { s++; n = 1; } else n = count; }
    open(e, s, n, { rewatch: st.rewatch, onSaved: st.onSaved, prompted: st.prompted });
  }
  // Writes this popup's rating → what offerUndo needs
  async function persist() {
    const { e, s, n, prev } = st, at = st;
    const row = {
      user_id: uid(), entry_id: e.id, tmdb_id: e.tmdb_id || null, season_number: s, episode_number: n,
      score: st.score, tags: [...st.tags], note: (st.note || '').trim(), is_rewatch: !!st.rewatch,   // '' removes a note (108)
      note_visibility: st.noteVis || 'anyone', note_spoiler: !!st.noteSpoiler,
    };
    const { error } = await sb.from('episode_ratings').upsert(row, { onConflict: 'user_id,entry_id,season_number,episode_number' });
    if (error) throw error;
    if (e.ratings?._ep_rate !== 'on') saveEntryPref(e, { _ep_rate: 'on' }).catch(() => {});   // rating one turns the show (back) on
    at.lastRow = row;
    return { e, s, n, prev, row, onSaved: at.onSaved };
  }
  function offerUndo({ e, s, n, prev, row, onSaved }) {
    showUndoToast(`Rated ${lbl(s, n)} — ${mssR1(row.score)}`, async () => {
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
  }
  function saveFailed(err) {
    console.error('Episode rating:', err);
    showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t save that rating — try again.', 'err');
  }
  // Save: the next queued episode, the season summary after its last episode, or done
  async function save() {
    if (!st || st.moving) return;
    const inp = document.getElementById('mssEpScoreInput'); if (inp) { inp.blur(); typedDone(inp); }
    st.moving = true;
    const at = st;
    try {
      const saved = await persist(), { e, s, n, row, onSaved } = saved;
      if (st !== at) { onSaved?.(row); offerUndo(saved); return; }
      const queue = st.queue, qi = st.qi, eps = st.eps, prompted = st.prompted;
      st.changed = false;
      onSaved?.(row);
      offerUndo(saved);
      if (queue && qi + 1 < queue.length) return open(e, queue[qi + 1][0], queue[qi + 1][1], { queue, qi: qi + 1, rewatch: row.is_rewatch, onSaved, prompted });
      if (n > 0 && await maybeSeasonDone(e, s, n, eps)) return;
      close();
    } catch (err) {
      saveFailed(err);
      if (st === at) st.moving = false;
    }
  }
  // Phones: Save & next — saves, then the next episode (a season's last one shows its summary, as Save does)
  async function saveNext() {
    if (!st || st.moving) return;
    const size = seasonSizes(st.e)[st.s - 1] || st.eps?.length || 0;
    if (st.queue?.length || (size && st.n >= size)) return save();
    const inp = document.getElementById('mssEpScoreInput'); if (inp) { inp.blur(); typedDone(inp); }
    st.changed = true;                                        // Save always saves, even TMDB's starting score
    return go(1);
  }
  /* Rate in place (the title page's episode rows): only the score changes — the tags, note, its visibility and
     spoiler mark stay as they were; the same table, Undo and "rating one turns the show on" as Save. → the row, or null */
  async function quick(e, s, n, score, o = {}) {
    if (!e || !isShow(e) || !uid()) return null;
    try {
      const prev = await existing(e, s, n).catch(() => null);
      const row = {
        user_id: uid(), entry_id: e.id, tmdb_id: e.tmdb_id || null, season_number: s, episode_number: n,
        score: Math.min(10, Math.max(1, Math.round(Number(score) * 10) / 10)), tags: prev?.tags || [], note: prev?.note || '',
        is_rewatch: prev ? !!prev.is_rewatch : (typeof isRewatching === 'function' && isRewatching(e)),
        note_visibility: prev?.note_visibility || 'anyone', note_spoiler: !!prev?.note_spoiler,
      };
      const { error } = await sb.from('episode_ratings').upsert(row, { onConflict: 'user_id,entry_id,season_number,episode_number' });
      if (error) throw error;
      if (e.ratings?._ep_rate !== 'on') saveEntryPref(e, { _ep_rate: 'on' }).catch(() => {});
      o.onSaved?.(row);
      offerUndo({ e, s, n, prev, row, onSaved: o.onSaved });
      return row;
    } catch (err) { saveFailed(err); return null; }
  }
  /* Remove one rating (an episode, or a whole season when n = 0) — Undo puts it back */
  const lbl = (s, n) => n ? `S${s} · E${n}` : `Season ${s}`;
  const restoreRows = async rows => {
    const back = rows.map(({ id, created_at, updated_at, ...r }) => r);
    const { error } = await sb.from('episode_ratings').upsert(back, { onConflict: 'user_id,entry_id,season_number,episode_number' });
    if (error) throw error;
  };
  async function remove(e, s, n, o = {}) {
    const prev = o.prev || await existing(e, s, n).catch(() => null);
    if (!prev) return;
    const { error } = await sb.from('episode_ratings').delete().eq('entry_id', e.id).eq('season_number', s).eq('episode_number', n);
    if (error) { console.error('Remove rating:', error); showToast('Couldn’t remove that rating — try again.', 'err'); return; }
    o.onSaved?.(null);
    showUndoToast(`Removed your ${lbl(s, n)} rating`, async () => { await restoreRows([prev]); o.onSaved?.(prev); });
  }
  function removeHere() {
    if (!st?.prev) return;
    const { e, s, n, prev, onSaved } = st;
    close();
    remove(e, s, n, { prev, onSaved });
  }
  /* Remove every episode + season rating you gave a show (asks first; Undo puts them all back) */
  async function removeAll(e, o = {}) {
    const { data, error } = await sb.from('episode_ratings').select('*').eq('entry_id', e.id).eq('user_id', uid());
    if (error) { showToast('Couldn’t load your ratings — try again.', 'err'); return; }
    const rows = await mssWithEpNotes(data || []);   // so Undo puts private notes back too
    if (!rows.length) return;
    const eps = rows.filter(r => r.episode_number > 0).length, seasons = rows.length - eps;
    const what = [eps ? `${eps} episode rating${eps === 1 ? '' : 's'}` : '', seasons ? `${seasons} season rating${seasons === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
    const ok = await showConfirm({ title: 'Remove all your ratings?', message: `This removes your ${what} for ${e.title}. Notes and tags on them go too.`, confirmText: 'Remove all', iconName: 'trash' });
    if (!ok) return;
    const { error: er } = await sb.from('episode_ratings').delete().eq('entry_id', e.id).eq('user_id', uid());
    if (er) { console.error('Remove all ratings:', er); showToast('Couldn’t remove them — try again.', 'err'); return; }
    o.onSaved?.(null);
    showUndoToast(`Removed ${rows.length} rating${rows.length === 1 ? '' : 's'}`, async () => { await restoreRows(rows); o.onSaved?.(rows); }, 8000);
  }

  // Skip: the next queued episode, if any
  function skip() {
    if (!st) return;
    const { e, queue, qi, onSaved, rewatch, prompted } = st;
    if (queue && qi + 1 < queue.length) open(e, queue[qi + 1][0], queue[qi + 1][1], { queue, qi: qi + 1, rewatch, onSaved, prompted });
    else close();
  }

  /* ── 3) Season finished: summary card (after rating its last episode) ── */
  async function maybeSeasonDone(e, s, n, eps) {
    const size = seasonSizes(e)[s - 1] || eps?.length || 0;
    if (!size || n < size) return false;
    const { data } = await sb.from('episode_ratings').select('episode_number,score').eq('entry_id', e.id).eq('season_number', s).gt('episode_number', 0);
    const rs = (data || []).sort((a, b) => a.episode_number - b.episode_number);
    if (rs.length < 2) return false;
    const a = rs.reduce((x, r) => x + Number(r.score), 0) / rs.length;
    const top = extremes(rs, r => r.score), eps2 = l => l.map(r => 'E' + r.episode_number).join(', ');
    const b = band(a);
    st.changed = false;
    await paint({ title: `Season ${s} complete`, sub: e.title, label: `Season ${s} complete, ${e.title}`, media: null, done: true,
      body: `<div class="ep-done">
        <div class="ep-score ep-band-${b.key}"><b>${mssR1(a)}</b><span>Your average · ${b.name}</span></div>
        <div class="ep-done-row" aria-label="Season ${s} episode scores">${rs.map(r => `<i class="ep-band-${band(r.score).key}" title="E${r.episode_number}: ${mssR1(Number(r.score))}">${mssR1(Number(r.score))}</i>`).join('')}</div>
        <div class="ep-meta">Best: ${eps2(top.hi)} (${mssR1(top.high)}) · Lowest: ${eps2(top.lo)} (${mssR1(top.low)})</div>
      </div>`,
      footer: { secondary: [{ label: 'Done', onClick: () => close() }], primary: { label: 'Rate the Season', onClick: () => open(e, s, 0) } } });
    return true;
  }

  async function stop() {
    if (!st) return;
    const e = st.e;
    close();
    try { await saveEntryPref(e, { _ep_rate: 'off' }); showToast(`Won’t ask for ${e.title} — turn it back on from the info popup.`); }
    catch { showToast('Couldn’t save that — try again.', 'err'); }
  }

  /* ── 4) Show popup: a show's episode-rating summary, then "View & Rate"
     (a friend's episode ratings on the title page) ──
     o = { title, poster, tmdbId, status, rows:[{season_number, episode_number, score, updated_at}],
           total, userId (someone else's), whoName } */
  const STATUS_LABEL = { watching: 'Watching', ongoing: 'To Be Continued', completed: 'Watched', up_next: 'Up Next', paused: 'Taking a Break', queue: 'Watchlist', dropped: 'Dropped' };
  let sumPanel = null;
  // big tiles (average, rated, best, lowest), a few highlights, then every season: its average and one square per episode
  function summaryHTML(o, rows) {
    if (!rows.length) return `<div class="lyr-stats" style="--n:2"><div class="lyr-stat"><b>—</b><span>Average</span></div><div class="lyr-stat"><b>0${o.total ? `<small>/${o.total}</small>` : ''}</b><span>Rated</span></div></div>
      <p class="lyr-hint">No episodes rated yet${o.userId ? '' : ' — open the show to start rating'}.</p>`;
    const num = r => Number(r.score), se = r => `S${r.season_number}·E${r.episode_number}`;
    const avg = rows.reduce((x, r) => x + num(r), 0) / rows.length, b = band(avg);
    const ex = extremes(rows, num), best = ex.hi[0], low = ex.lo[0];
    const last = rows.reduce((x, y) => (new Date(y.updated_at) > new Date(x.updated_at) ? y : x));
    const tile = (v, lbl) => `<div class="lyr-stat ep-band-${band(v).key}"><b>${mssR1(v)}</b><span>${esc(lbl)}</span></div>`;
    const seasons = [...new Set(rows.map(r => r.season_number))].map(sn => {
      const rs = rows.filter(r => r.season_number === sn), a = rs.reduce((x, r) => x + num(r), 0) / rs.length;
      return { sn, rs, a };
    });
    const top = seasons.length > 1 ? seasons.reduce((x, y) => (y.a > x.a ? y : x)) : null;
    const tens = rows.filter(r => num(r) >= 10).length;
    const chips = [top ? `${icon('layers', 13)}<span>Best season <b>S${top.sn} · ${mssR1(top.a)}</b></span>` : '',
      tens ? `${icon('star', 13)}<span><b>${tens}</b> perfect ${tens === 1 ? '10' : '10s'}</span>` : '',
      `${icon('calendar', 13)}<span>Last rated: ${se(last)} · ${new Date(last.updated_at).toLocaleDateString(MSSI18n.locale, { month: 'short', day: 'numeric', year: 'numeric' })}</span>`].filter(Boolean);
    return `<div class="lyr-stats is-wrap" style="--n:4">
        ${tile(avg, b.name)}
        <div class="lyr-stat"><b>${rows.length}${o.total ? `<small>/${o.total}</small>` : ''}</b><span>Rated</span></div>
        ${tile(num(best), `Best · ${se(best)}${ex.hi.length > 1 ? ` +${ex.hi.length - 1}` : ''}`)}
        ${tile(num(low), `Lowest · ${se(low)}${ex.lo.length > 1 ? ` +${ex.lo.length - 1}` : ''}`)}
      </div>
      ${o.total ? `<div class="ep-show-progress" aria-label="${rows.length} of ${o.total} episodes rated"><span style="width:${Math.min(100, Math.round(100 * rows.length / o.total))}%"></span></div>` : ''}
      <div class="lyr-chips">${chips.map((c, i) => `<span class="lyr-chip${i === 0 && top ? ' is-up' : ''}">${c}</span>`).join('')}</div>
      <div class="lyr-sec"><h3 class="lyr-sec-h">Seasons</h3>
        <ul class="ep-sum-seasons">${seasons.map(x => `<li class="ep-sum-season">
          <span class="ep-sum-sn">S${x.sn}</span>
          <span class="ep-sum-avg ep-band-${band(x.a).key}">${mssR1(x.a)}</span>
          <span class="eg-mini ep-show-mini" role="img" aria-label="Season ${x.sn}: ${x.rs.length} rated, average ${mssR1(x.a)}">${x.rs.map(r => `<i class="ep-band-${band(num(r)).key}" title="${se(r)}: ${mssR1(num(r))}"></i>`).join('')}</span>
          <span class="ep-sum-n">${x.rs.length} rated</span></li>`).join('')}</ul></div>`;
  }
  async function showPopup(o) {
    const rows = (o.rows || []).filter(r => r.episode_number > 0).sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
    const href = `episodes.html?show=${o.tmdbId}${o.userId ? '&user=' + encodeURIComponent(o.userId) : ''}`;
    const poster = safeURL(o.poster);
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'L', kind: 'title', tallHero: true, backdrop: o.entry || { type: 'tv', id: o.tmdbId }, poster, title: o.title,
      subtitle: [o.whoName ? o.whoName + '’s episode ratings' : 'Episode ratings', o.status ? STATUS_LABEL[o.status] || o.status : ''].filter(Boolean).join(' · '),
      body: summaryHTML(o, rows),
      footer: { secondary: [{ label: 'Close', only: 'side', onClick: x => x.close() }], primary: { label: o.userId ? 'View Ratings' : 'View & Rate Episodes', onClick: () => { location.href = href; } } },
      onClose: () => { if (sumPanel === h) sumPanel = null; } });
    sumPanel = h;
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
        return open(e, s, n, { rewatch: true, prompted: true });
      }
    }
    open(e, s, n, { prompted: true });
  }

  return {
    extremes, afterWatch, rate: (e, s, n, o = {}) => open(e, s, n, { ...o, rewatch: typeof isRewatching === 'function' && isRewatching(e) }),
    close, band, BANDS, TAGS, mode, setMode, isShow, seasonEpisodes, showPopup,
    statusLabel: st => STATUS_LABEL[st] || st,
    _noteVis: v => { if (st) { st.noteVis = v; st.changed = true; } },
    _slide: setScore, _typed: typed, _typedDone: typedDone, _step: d => st && setScore(st.score + d), _tag: toggleTag, _note: onNote,
    _toggle: () => { if (!st) return; st.showTags = !st.showTags; render(st.eps?.find(x => x.n === st.n)); },
    remove, removeAll, quick, warm,
    _go: go, _stop: stop,
  };
})();