/* ════════════════════════════════════════════════════════════
   pick.js — MSSPick: "Pick for me" on a Watchlist (the category pages and the Library)
   Can't decide? It picks one title from your watchlist, with a little shuffle, and
   tells you why it's a good one for tonight: how long it takes, what it's about,
   how much you like the genre, how long it's been waiting. Narrow it down first
   (Quick ones · Movies / Shows · a genre), skip one ("Not tonight"), roll again,
   or start watching it right there.
     MSSPick.open({ pool: () => [entries on the watchlist], all: () => [your whole library],
                    user, onStarted(entry), cats: true → TV / Movies / Anime / Cartoons moods (the Library) })
     MSSPick.buttonHTML(onclick, disabled) → the trigger (same height as the list / grid switch)
   Styles: "§28 Pick for me" in css/style.css.
   ════════════════════════════════════════════════════════════ */
const MSSPick = (() => {
  let o = null, cur = null, skip = new Set(), mood = { len: 'any', type: 'any', genre: '', cat: '' }, rolling = 0, detailsFor = null;
  const DICE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4.5"/><circle cx="8.2" cy="8.2" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.25" fill="currentColor" stroke="none"/></svg>`;
  const esc = s => escHTML(String(s ?? ''));
  const isMovie = e => (e.tmdb_type || '') === 'movie' || e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const mins = e => (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0);
  const quick = e => isMovie(e) ? (mins(e) ? mins(e) <= 105 : false) : (Number(e.total_seasons) || 0) === 1 && (Number(e.total_eps) || 99) <= 13;
  const dur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;

  function buttonHTML(onclick, disabled) {
    return `<button type="button" class="qp-trigger" onclick="${onclick}" ${disabled ? 'disabled' : ''} aria-label="Pick for me — a random title from your watchlist" title="Can’t decide? Let us pick">
      ${DICE}<span class="qp-label">Pick for me</span></button>`;
  }

  // What's left to pick from, after the mood filters and "Not tonight"
  function candidates() {
    return o.pool().filter(e => !skip.has(e.id)
      && (mood.len !== 'quick' || quick(e))
      && (mood.type === 'any' || (mood.type === 'movie') === isMovie(e))
      && (!mood.genre || (e.genres || []).includes(mood.genre))
      && (!mood.cat || e.cat === mood.cat));
  }
  // The genres on this watchlist, most common first (for the chips)
  function genres() {
    const n = {};
    o.pool().forEach(e => (e.genres || []).forEach(g => { n[g] = (n[g] || 0) + 1; }));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  // Why this one — a few honest reasons, from your own library
  function reasons(e) {
    const out = [], all = o.all ? o.all() : [];
    if (e.created_at) {
      const d = Math.floor((Date.now() - new Date(e.created_at)) / 864e5);
      out.push(['clock', d < 1 ? 'You only just added it — strike while you’re curious.'
        : d < 14 ? `On your watchlist for ${d} ${d === 1 ? 'day' : 'days'}.`
        : d < 60 ? `Waiting on your watchlist for ${Math.round(d / 7)} weeks. It’s been patient.`
        : `On your watchlist for ${Math.round(d / 30)} months. Its time has come.`]);
    }
    const m = mins(e);
    if (isMovie(e) && m) out.push(['film', m <= 100 ? `A quick one — about ${dur(m)}. Done before it gets late.` : m >= 150 ? `An epic: ${dur(m)}. Grab snacks.` : `About ${dur(m)} — a proper movie night.`]);
    else if (!isMovie(e) && e.total_seasons) out.push(['tv', e.total_seasons === 1
      ? `Just one season${e.total_eps ? ` · ${e.total_eps} episodes` : ''} — easy to finish.`
      : `${e.total_seasons} seasons${e.total_eps ? ` · ${e.total_eps} episodes` : ''} — something to settle into.`]);
    // the genre you score highest, if this has it
    const done = all.filter(x => (x.status === 'completed' || x.status === 'ongoing') && liveScore(x) != null);
    let best = null;
    (e.genres || []).forEach(g => {
      const xs = done.filter(x => (x.genres || []).includes(g));
      if (xs.length >= 2) {
        const avg = xs.reduce((a, x) => a + liveScore(x), 0) / xs.length;
        if (!best || avg > best.avg) best = { g, avg, n: xs.length };
      }
    });
    if (best) out.push(['ratingStar', `You rate ${best.g} titles ★ ${best.avg.toFixed(1)} on average (${best.n} watched).`]);
    return out.slice(0, 3);
  }

  function shell() {
    let ov = document.getElementById('qpOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'qpOverlay';
    ov.innerHTML = `<div class="qp-card" role="dialog" aria-modal="true" aria-labelledby="qpTitle">
        <div class="qp-hero" id="qpHero"><div class="qp-backdrop" id="qpBackdrop"></div>
          <div class="qp-top"><span class="qp-eyebrow">${DICE}<span>Tonight’s pick</span></span>
            <button type="button" class="qp-x" onclick="MSSPick.close()" aria-label="Close">${icon('x', 18)}</button></div>
          <div class="qp-main">
            <a class="qp-poster" id="qpPoster" href="#" aria-label="Open its page"></a>
            <div class="qp-info" id="qpInfo" aria-live="polite"></div>
          </div>
        </div>
        <div class="qp-body" id="qpBody"></div>
        <div class="qp-moods" id="qpMoods"></div>
        <div class="qp-foot">
          <button type="button" class="qp-btn" onclick="MSSPick.skip()" id="qpSkip">${icon('x', 15)}<span>Not tonight</span></button>
          <button type="button" class="qp-btn" onclick="MSSPick.roll()" id="qpRoll">${DICE}<span>Pick again</span></button>
          <button type="button" class="qp-btn primary" onclick="MSSPick.start()" id="qpStart">${icon('play', 15)}<span>Start watching</span></button>
        </div>
      </div>`;
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
    return ov;
  }

  function open(opts) {
    o = opts; skip = new Set(); mood = { len: 'any', type: 'any', genre: '', cat: '' };
    if (!o.pool().length) { showToast('Your watchlist is empty — add something first.', 'err'); return; }
    const ov = shell();
    MSSDialog.open(ov, { focus: '#qpRoll' });
    drawMoods();
    roll(true);
  }
  function close() {
    const ov = document.getElementById('qpOverlay');
    if (ov) MSSDialog.close(ov);
    clearTimeout(rolling); rolling = 0;
  }

  // In the mood for: Anything · Something quick · (Library) TV / Movies / Anime / Cartoons · (both kinds) A movie / A show · a genre
  function drawMoods() {
    const box = document.getElementById('qpMoods'); if (!box) return;
    const pool = o.pool(), mixed = pool.some(isMovie) && pool.some(e => !isMovie(e));
    const cats = o.cats ? ['tv', 'movies', 'anime', 'cartoons'].filter(c => pool.some(e => e.cat === c)) : [];
    const chip = (on, label, fn) => `<button type="button" class="qp-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="${fn}">${label}</button>`;
    const gs = genres();
    box.innerHTML = `<span class="qp-moods-h">In the mood for</span><div class="qp-chips">
      ${chip(mood.len === 'any' && mood.type === 'any' && !mood.genre && !mood.cat, 'Anything', "MSSPick.mood('reset')")}
      ${chip(mood.len === 'quick', `${icon('clock', 12)} Something quick`, "MSSPick.mood('len','quick')")}
      ${cats.length > 1 ? cats.map(c => chip(mood.cat === c, esc(CAT_META[c]?.label || c), `MSSPick.mood('cat','${c}')`)).join('') : ''}
      ${mixed && !(cats.length > 1) ? chip(mood.type === 'movie', 'A movie', "MSSPick.mood('type','movie')") + chip(mood.type === 'tv', 'A show', "MSSPick.mood('type','tv')") : ''}
      ${gs.length ? `<label class="qp-chip qp-select${mood.genre ? ' on' : ''}">${icon('filter', 12)}<span class="sr-only">Genre</span>
        <select onchange="MSSPick.mood('genre', this.value, true)" aria-label="Genre">
          <option value=""${mood.genre ? '' : ' selected'}>Any genre</option>
          ${gs.map(g => `<option value="${esc(g)}"${mood.genre === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}
        </select><svg class="qp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></label>` : ''}
    </div>`;
  }
  function setMood(k, v, set) {
    if (k === 'reset') mood = { len: 'any', type: 'any', genre: '', cat: '' };
    else if (k === 'len') mood.len = mood.len === v ? 'any' : v;
    else if (k === 'type') mood.type = mood.type === v ? 'any' : v;
    else if (k === 'cat') mood.cat = mood.cat === v ? '' : v;
    else mood.genre = set ? v : mood.genre === v ? '' : v;      // the genre dropdown sets it as chosen
    drawMoods();
    roll();
  }

  // Shuffle through a few posters, then land on the pick
  function roll(first) {
    const list = candidates();
    clearTimeout(rolling);
    if (!list.length) { cur = null; return drawNone(); }
    const others = list.length > 1 && cur ? list.filter(e => e.id !== cur.id) : list;
    const pick = others[Math.floor(Math.random() * others.length)];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const posterBox = document.getElementById('qpPoster');
    const frames = reduced || list.length < 2 ? 0 : first ? 9 : 7;
    let i = 0;
    document.getElementById('qpOverlay')?.classList.add('rolling');
    const tick = () => {
      if (i < frames) {
        const e = list[Math.floor(Math.random() * list.length)];
        posterBox.innerHTML = posterImg(e);
        i++;
        rolling = setTimeout(tick, 55 + i * 14);         // slows down like a wheel
        return;
      }
      rolling = 0;
      document.getElementById('qpOverlay')?.classList.remove('rolling');
      cur = pick; draw(pick);
    };
    tick();
  }
  const posterImg = e => safeURL(e.poster_url) ? `<img src="${safeURL(e.poster_url)}" alt="">` : `<span class="qp-letter">${esc((e.title || '?')[0])}</span>`;

  function draw(e) {
    const list = candidates(), n = o.pool().length;
    const href = e.tmdb_id ? `title.html?type=${isMovie(e) ? 'movie' : 'tv'}&id=${e.tmdb_id}` : `detail.html?id=${encodeURIComponent(e.id)}`;
    const p = document.getElementById('qpPoster');
    p.innerHTML = posterImg(e); p.href = href; p.classList.remove('land'); void p.offsetWidth; p.classList.add('land');
    const bits = [e.year, isMovie(e) ? 'Movie' : (CAT_META[e.cat]?.singular || 'Show'),
      isMovie(e) ? (mins(e) ? dur(mins(e)) : '') : e.total_seasons ? `${e.total_seasons} ${e.total_seasons === 1 ? 'season' : 'seasons'}` : ''].filter(Boolean);
    document.getElementById('qpInfo').innerHTML = `
      <div class="qp-count">${list.length === n ? `1 of ${n} on your watchlist` : `1 of ${list.length} that fit · ${n} on your watchlist`}</div>
      <h2 class="qp-title" id="qpTitle" translate="no">${esc(e.title)}</h2>
      <div class="qp-meta">${bits.map(esc).join(' · ')}<span id="qpVote"></span></div>
      ${(e.genres || []).length ? `<div class="qp-genres">${e.genres.slice(0, 4).map(g => `<span>${esc(g)}</span>`).join('')}</div>` : ''}`;
    const why = reasons(e);
    document.getElementById('qpBody').innerHTML = `
      <p class="qp-overview" id="qpOverview">${e.tmdb_id ? '<span class="qp-skel"></span><span class="qp-skel"></span><span class="qp-skel short"></span>' : ''}</p>
      <div class="qp-credit" id="qpCredit"></div>
      ${why.length ? `<div class="qp-why"><div class="qp-why-h">Why this one</div><ul>${why.map(([ic, t]) => `<li>${icon(ic, 14)}<span>${esc(t)}</span></li>`).join('')}</ul></div>` : ''}`;
    document.getElementById('qpStart').disabled = false;
    document.getElementById('qpSkip').disabled = list.length < 2;
    document.getElementById('qpRoll').disabled = list.length < 2;
    document.getElementById('qpBackdrop').style.backgroundImage = safeURL(e.poster_url) ? `url("${safeURL(e.poster_url)}")` : '';
    details(e);
  }
  // From TMDB: the story, the wide picture behind, its score and who made it (kept on the device like the rest)
  async function details(e) {
    if (!e.tmdb_id || typeof tmdbFetch !== 'function') { const ov = document.getElementById('qpOverview'); if (ov) ov.textContent = ''; return; }
    detailsFor = e.id;
    try {
      const type = isMovie(e) ? 'movie' : 'tv';
      const res = await tmdbFetch(`${TMDB_BASE}/${type}/${e.tmdb_id}?language=en-US&append_to_response=credits`);
      if (!res.ok) throw res;
      const d = await res.json();
      if (detailsFor !== e.id || cur?.id !== e.id) return;
      document.getElementById('qpOverview').textContent = d.overview || '';
      if (d.backdrop_path) document.getElementById('qpBackdrop').style.backgroundImage = `url("https://image.tmdb.org/t/p/w780${d.backdrop_path}")`;
      if (d.vote_average) document.getElementById('qpVote').innerHTML = ` · <b class="qp-vote">★ ${d.vote_average.toFixed(1)}</b> <small>TMDB</small>`;
      const dir = type === 'movie' ? (d.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name) : (d.created_by || []).map(c => c.name);
      const cast = (d.credits?.cast || []).slice(0, 3).map(c => c.name);
      document.getElementById('qpCredit').innerHTML = [dir.length ? `<span><b>${type === 'movie' ? 'Directed by' : 'Created by'}</b> ${esc(dir.slice(0, 2).join(', '))}</span>` : '',
        cast.length ? `<span><b>Starring</b> ${esc(cast.join(', '))}</span>` : ''].join('');
    } catch (err) {
      if (cur?.id === e.id) { const ov = document.getElementById('qpOverview'); if (ov) ov.textContent = ''; }
    }
  }
  function drawNone() {
    document.getElementById('qpPoster').innerHTML = `<span class="qp-letter">?</span>`;
    document.getElementById('qpInfo').innerHTML = `<div class="qp-count">Nothing fits</div><h2 class="qp-title" id="qpTitle">No match for that mood</h2>
      <div class="qp-meta">${skip.size ? 'You’ve skipped everything else. Picky tonight!' : 'Nothing on your watchlist fits all of those.'}</div>`;
    document.getElementById('qpBody').innerHTML = `<div class="qp-none">Try a different mood${skip.size ? ', or bring back the ones you skipped' : ''}.
      ${skip.size ? `<button type="button" class="qp-link" onclick="MSSPick.unskip()">Bring them back</button>` : ''}</div>`;
    document.getElementById('qpBackdrop').style.backgroundImage = '';
    ['qpSkip', 'qpRoll', 'qpStart'].forEach(id => { document.getElementById(id).disabled = true; });
  }

  async function start() {
    if (!cur || !o.user) return;
    const b = document.getElementById('qpStart');
    b.disabled = true; b.innerHTML = `${icon('play', 15)}<span>Starting…</span>`;
    try {
      const e = cur;
      await updateProgress(e.id, o.user.id, { status: 'watching' });
      close();
      showToast(`Enjoy “${e.title}”! It’s in Currently Watching.`);
      o.onStarted?.(e);
    } catch (err) {
      console.error(err);
      showToast('Couldn’t start it — try again.', 'err');
      b.disabled = false; b.innerHTML = `${icon('play', 15)}<span>Start watching</span>`;
    }
  }

  return {
    open, close, buttonHTML,
    roll: () => roll(), mood: setMood,
    skip: () => { if (cur) skip.add(cur.id); roll(); },
    unskip: () => { skip.clear(); document.getElementById('qpStart').disabled = false; roll(); },
    start,
  };
})();
