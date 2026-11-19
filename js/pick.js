/* ════════════════════════════════════════════════════════════
   pick.js — MSSPick: "Pick for me" on a Watchlist (the category pages and the Library)
   Can't decide? It picks one title from your watchlist, with a little shuffle, and
   tells you why it's a good one for tonight: how long it takes, what it's about,
   how much you like the genre, how long it's been waiting. Narrow it down first
   (Quick ones · any mix of types · any mix of genres), skip one ("Not tonight"), roll again,
   or start watching it right there.
     MSSPick.open({ pool: () => [entries on the watchlist], all: () => [your whole library],
                    user, onStarted(entry) })
     MSSPick.buttonHTML(onclick, disabled) → the trigger (same height as the list / grid switch)
   Opens in a side panel L (a full page on phones — js/panel.js); its own look lives inside.
   Styles: "§28 Pick for me" in css/style.css.
   ════════════════════════════════════════════════════════════ */
const MSSPick = (() => {
  const blankMood = () => ({ len: 'any', types: new Set(), genres: new Set() });
  // Each title's type. A title matches when it's any ticked type AND any ticked genre.
  const TYPES = [['tv', 'TV Show'], ['movies', 'Movie'], ['cartoons:movie', 'Cartoon: Movie'], ['cartoons:show', 'Cartoon: TV Show'], ['anime:movie', 'Anime: Movie'], ['anime:show', 'Anime: Show']];
  let o = null, cur = null, skip = new Set(), mood = blankMood(), rolling = 0, detailsFor = null;
  const DICE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4.5"/><circle cx="8.2" cy="8.2" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.25" fill="currentColor" stroke="none"/></svg>`;
  const esc = s => escHTML(String(s ?? ''));
  const isMovie = e => (e.tmdb_type || '') === 'movie' || e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const mins = e => (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0);
  const quick = e => isMovie(e) ? (mins(e) ? mins(e) <= 105 : false) : (Number(e.total_seasons) || 0) === 1 && (Number(e.total_eps) || 99) <= 13;
  const typeOf = e => e.cat === 'anime' || e.cat === 'cartoons' ? `${e.cat}:${isMovie(e) ? 'movie' : 'show'}` : e.cat === 'movies' || (e.cat !== 'tv' && isMovie(e)) ? 'movies' : 'tv';
  const genreLabel = () => mood.genres.size === 1 ? [...mood.genres][0] : mood.genres.size ? `${mood.genres.size} genres` : '';
  const dur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;

  function buttonHTML(onclick, disabled) {
    return `<button type="button" class="qp-trigger" onclick="${onclick}" ${disabled ? 'disabled' : ''} aria-label="Pick for me — a random title from your watchlist" title="Can’t decide? Let us pick">
      ${DICE}<span class="qp-label">Pick for me</span></button>`;
  }

  // What's left to pick from, after the mood filters and "Not tonight"
  function candidates() {
    return o.pool().filter(e => !skip.has(e.id)
      && (mood.len !== 'quick' || quick(e))
      && (!mood.types.size || mood.types.has(typeOf(e)))
      && (!mood.genres.size || (e.genres || []).some(g => mood.genres.has(g))));
  }
  // The genres on this watchlist, most common first (for the chips)
  function genres() {
    const n = {};
    o.pool().forEach(e => (e.genres || []).forEach(g => { n[g] = (n[g] || 0) + 1; }));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  // Why this one — a few honest reasons, from your own library
  // list: your whole library (the home page's Pick for me passes it; inside the panel it's o.all())
  function reasons(e, list) {
    const out = [], all = list || (o && o.all ? o.all() : []);
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
    if (best) out.push(['ratingStar', `You rate ${best.g} titles ★ ${mssR1(best.avg)} on average (${best.n} watched).`]);
    return out.slice(0, 3);
  }

  // Its content, built once: the blurred-backdrop hero (poster, title, why this one) and the moods
  let box = null, ph = null, foot = { skip: false, roll: false, start: false };
  function shell() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'qp';
    box.innerHTML = `<div class="qp-hero" id="qpHero"><div class="qp-backdrop" id="qpBackdrop"></div>
          <div class="qp-top"><span class="qp-eyebrow">${DICE}<span>Tonight’s pick</span></span></div>
          <div class="qp-main">
            <a class="qp-poster" id="qpPoster" href="#" aria-label="Open its page"></a>
            <div class="qp-info" id="qpInfo" aria-live="polite"></div>
          </div>
        </div>
        <div class="qp-body" id="qpBody"></div>
        <div class="qp-moods" id="qpMoods"></div>`;
    box.addEventListener('click', ev => { const b = ev.target.closest('[data-qplen]'); if (b) setMood('len', mssSegPick(b)); });
    box.addEventListener('mss:dd-closed', () => { const inp = document.getElementById('qpGenreIn'); if (inp) inp.value = genreLabel(); gRollIfChanged(); });   // Esc (MSSDialog)
    new ResizeObserver(gFollow).observe(box.querySelector('#qpBody'));
    window.visualViewport?.addEventListener('resize', gFollow);
    window.visualViewport?.addEventListener('scroll', gFollow);
    window.addEventListener('resize', gFollow);
    return box;
  }
  // Not tonight · Pick again · Start watching, in the panel's footer
  function paintFoot() {
    ph?.setFooter({ stack: true, secondary: [
        { label: 'Not tonight', lead: icon('x', 15), disabled: !foot.skip, onClick: () => MSSPick.skip() },
        { label: 'Pick again', lead: DICE, disabled: !foot.roll, onClick: () => roll() }],
      primary: { label: 'Start watching', lead: icon('play', 15), disabled: !foot.start, onClick: start } });
  }

  async function open(opts) {
    o = opts; skip = new Set(); mood = blankMood();
    if (!o.pool().length) { showToast('Your watchlist is empty — add something first.', 'err'); return; }
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: 'Pick for me', subtitle: 'From your watchlist', body: shell(),
      onClose: () => { if (ph === h) { ph = null; gChanged = false; gClose(); clearTimeout(rolling); rolling = 0; } } });
    ph = h;
    h.body.closest('.lyr-body').addEventListener('scroll', gFollow, { passive: true });
    drawMoods();
    roll(true);
  }
  function close() { ph?.closeNow(); }

  // In the mood for, one row each: Length (any · something quick) · Type (the types on this watchlist,
  // any mix — only when there's more than one) · Genre (any mix); Reset when something's set
  function drawMoods() {
    const box = document.getElementById('qpMoods'); if (!box) return;
    const inPool = new Set(o.pool().map(typeOf)), types = TYPES.filter(([k]) => inPool.has(k));
    const chip = (on, label, fn) => `<button type="button" class="qp-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="${fn}">${label}</button>`;
    const gs = genres(), any = mood.genres.size > 0, label = genreLabel(), set = mood.len !== 'any' || mood.types.size || any;
    box.innerHTML = `<div class="qp-moods-top"><h3 class="lyr-sec-h">In the mood for</h3>${set ? `<button type="button" class="qp-link qp-reset" onclick="MSSPick.mood('reset')">Reset</button>` : ''}</div>
      <div class="qp-row"><span class="qp-row-h" id="qpLenH">Length</span>${mssSegHTML({ labelledby: 'qpLenH', value: mood.len, options: [['any', 'Any length'], ['quick', 'Something quick']], data: { qplen: '1' } })}</div>
      ${types.length > 1 ? `<div class="qp-row"><span class="qp-row-h" id="qpTypeH">Type</span><div class="qp-chips" role="group" aria-labelledby="qpTypeH">${types.map(([k, l]) => chip(mood.types.has(k), l, `MSSPick.mood('type','${k}')`)).join('')}</div></div>` : ''}
      ${gs.length ? `<div class="qp-row"><span class="qp-row-h" id="qpGenreH">Genre</span><div class="qp-genre"><div class="td-dd sf-dd sf-dd-wide" id="qpGenreDD">
          <input type="text" class="sf-dd-trigger qp-genre-in${any ? ' active' : ''}" id="qpGenreIn" value="${esc(label)}" placeholder="Any genre"
            role="combobox" aria-label="Genres — type to search, pick any" aria-autocomplete="list" aria-expanded="false" aria-controls="qpGenreMenu"
            autocomplete="off" spellcheck="false" autocapitalize="none" data-1p-ignore data-lpignore="true"
            onfocus="MSSPick._g('open')" onclick="event.stopPropagation();MSSPick._g('open')" oninput="MSSPick._g('type')" onkeydown="MSSPick._gKey(event)">
          <button type="button" class="qp-genre-btn" tabindex="-1" aria-label="${any ? 'Any genre' : 'Show genres'}"
            onmousedown="event.preventDefault()" onclick="event.stopPropagation();MSSPick._g('${any ? 'clear' : 'toggle'}')">${any ? icon('x', 13)
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'}</button>
          <div class="td-dd-menu" id="qpGenreMenu" role="listbox" aria-multiselectable="true" aria-label="Genres"></div></div></div></div>` : ''}`;
  }
  /* The genre box: tick any number from the list, or type to narrow it (Enter ticks the first match). Stays open until you leave it. */
  let gi = -1;
  let gChanged = false;
  function gRollIfChanged() { if (gChanged) { gChanged = false; roll(); } }
  function gClose() {
    const dd = document.getElementById('qpGenreDD'); if (!dd) return;
    dd.classList.remove('open'); dd.querySelector('.td-dd-menu').style.cssText = '';
    const inp = document.getElementById('qpGenreIn');
    if (inp) { inp.setAttribute('aria-expanded', 'false'); inp.value = genreLabel(); }
    gRollIfChanged();
  }
  // Placed on the screen so the popup can't clip it. Stays with the box whenever the popup's
  // layout shifts (its text loads late) or a phone keyboard takes up part of the screen.
  function gPlace(dd) {
    const r = dd.querySelector('.sf-dd-trigger').getBoundingClientRect(), menu = dd.querySelector('.td-dd-menu');
    const card = dd.closest('.lyr-body').getBoundingClientRect();
    if (r.bottom < card.top || r.top > card.bottom) return gClose();     // scrolled out of the panel
    const vv = window.visualViewport, top = vv ? vv.offsetTop : 0, height = vv ? vv.height : innerHeight;
    const below = top + height - r.bottom - 12, above = r.top - top - 12, up = below < 160 && above > below;
    const h = Math.max(120, Math.min(up ? above : below, 240));
    menu.style.cssText = `position:fixed; left:${r.left}px; width:${r.width}px; z-index:2060; display:block; max-height:${h}px; overflow-y:auto; `
      + (up ? `bottom:${innerHeight - r.top}px; top:auto; border-radius:var(--radius-sm) var(--radius-sm) 0 0; border-top:0.5px solid var(--olive-light); border-bottom:none;` : `top:${r.bottom}px; bottom:auto;`);
  }
  const gFollow = () => { const dd = document.getElementById('qpGenreDD'); if (dd?.classList.contains('open')) gPlace(dd); };
  function gOpen(typed) {
    const dd = document.getElementById('qpGenreDD'), inp = document.getElementById('qpGenreIn'); if (!dd || !inp) return;
    const q = typed ? inp.value.trim().toLowerCase() : '';
    const list = genres().filter(g => !q || g.toLowerCase().includes(q));
    gi = typed && q && list.length ? 0 : -1;
    dd.querySelector('.td-dd-menu').innerHTML = (q ? '' : `<div class="td-dd-opt${!mood.genres.size ? ' active' : ''}" role="option" aria-selected="${!mood.genres.size}" onmousedown="event.preventDefault()" onclick="MSSPick._gPick('')">Any genre</div>`)
      + (list.length ? list.map((g, i) => `<div class="td-dd-opt${mood.genres.has(g) ? ' active' : ''}${i === gi ? ' hl' : ''}" role="option" aria-selected="${mood.genres.has(g)}" onmousedown="event.preventDefault()" onclick="event.stopPropagation();MSSPick._gPick(${attrJSON(g)})">${q ? esc(g).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<b>$1</b>') : esc(g)}</div>`).join('')
        : `<div class="sf-empty" style="padding:10px 14px">No genre like “${esc(inp.value.trim())}” on your watchlist.</div>`);
    dd.classList.add('open'); inp.setAttribute('aria-expanded', 'true');
    inp.scrollIntoView({ block: 'nearest' });
    gPlace(dd);
  }
  function gAct(what) {
    if (what === 'open') return gOpen(false);
    if (what === 'type') return gOpen(true);
    if (what === 'toggle') { const dd = document.getElementById('qpGenreDD'); if (dd?.classList.contains('open')) return gClose(); document.getElementById('qpGenreIn')?.focus(); return gOpen(false); }
    if (what === 'clear') return gPick('');
  }
  function gPick(g) {
    if (!g) { gChanged = false; gClose(); mood.genres.clear(); drawMoods(); return roll(); }
    const top = document.getElementById('qpGenreMenu')?.scrollTop || 0;
    if (!mood.genres.delete(g)) mood.genres.add(g);
    gChanged = true;                     // rolled when the list closes, so nothing moves while you're ticking
    drawMoods();
    if (!matchMedia('(pointer:coarse)').matches) document.getElementById('qpGenreIn')?.focus({ preventScroll: true });   // keeps ↑ ↓ Enter working
    gOpen(false);
    document.getElementById('qpGenreMenu').scrollTop = top;
  }
  function gKey(ev) {
    const menu = document.getElementById('qpGenreMenu'), opts = menu ? [...menu.querySelectorAll('.td-dd-opt')] : [];
    if (ev.key === 'Escape') { if (document.getElementById('qpGenreDD')?.classList.contains('open')) { ev.preventDefault(); ev.stopPropagation(); gClose(); } return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!document.getElementById('qpGenreDD')?.classList.contains('open')) gOpen(false);
      const os = [...document.getElementById('qpGenreMenu').querySelectorAll('.td-dd-opt')];
      gi = Math.max(0, Math.min(os.length - 1, gi + (ev.key === 'ArrowDown' ? 1 : -1)));
      os.forEach((o, i) => o.classList.toggle('hl', i === gi)); os[gi]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const o = opts[gi >= 0 ? gi : 0];
      if (o) o.click(); else if (!ev.target.value.trim()) gPick('');
    }
  }
  // a click anywhere else closes the list (and a half-typed name goes back to the chosen genre)
  document.addEventListener('mousedown', ev => {
    const dd = document.getElementById('qpGenreDD');
    if (dd?.classList.contains('open') && !dd.contains(ev.target)) gClose();
  }, true);

  function setMood(k, v) {
    if (k === 'reset') mood = blankMood();
    else if (k === 'len') mood.len = v;
    else if (k === 'type' && !mood.types.delete(v)) mood.types.add(v);
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
    box?.classList.add('rolling');
    const tick = () => {
      if (i < frames) {
        const e = list[Math.floor(Math.random() * list.length)];
        posterBox.innerHTML = posterImg(e);
        i++;
        rolling = setTimeout(tick, 55 + i * 14);         // slows down like a wheel
        return;
      }
      rolling = 0;
      box?.classList.remove('rolling');
      cur = pick; draw(pick);
    };
    tick();
  }
  // just the poster inside the "open its page" link (the title's first letter when there's none)
  const posterImg = e => { const u = safeURL(mssSharpPoster(e.poster_url)); return u ? `<img src="${u}" alt="">` : `<span class="qp-poster-ph" aria-hidden="true">${esc((e.title || '?')[0])}</span>`; };

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
      ${(e.genres || []).length ? `<div class="qp-genres">${mssGenreList(e.genres).slice(0, 4).map(g => `<span class="w-ep-badge">${esc(g)}</span>`).join('')}</div>` : ''}`;
    const why = reasons(e);
    document.getElementById('qpBody').innerHTML = `
      <p class="qp-overview" id="qpOverview">${e.tmdb_id ? '<span class="qp-skel"></span><span class="qp-skel"></span><span class="qp-skel short"></span>' : ''}</p>
      <div class="qp-credit" id="qpCredit"></div>
      ${why.length ? `<div class="qp-why"><div class="qp-why-h">Why this one</div><ul>${why.map(([ic, t]) => `<li>${icon(ic, 14)}<span>${esc(t)}</span></li>`).join('')}</ul></div>` : ''}`;
    foot = { start: true, skip: list.length > 1, roll: list.length > 1 };
    paintFoot();
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
      MSSBackdrop.url(e, 'w780').then(u => { if (u && cur?.id === e.id) document.getElementById('qpBackdrop').style.backgroundImage = `url("${u}")`; });   // the one you picked, else TMDB's
      if (d.vote_average) document.getElementById('qpVote').innerHTML = ` · <b class="qp-vote">★ ${mssR1(d.vote_average)}</b> <small>TMDB</small>`;
      const dir = type === 'movie' ? (d.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name) : (d.created_by || []).map(c => c.name);
      const cast = (d.credits?.cast || []).slice(0, 3).map(c => c.name);
      document.getElementById('qpCredit').innerHTML = [dir.length ? `<span><b>${type === 'movie' ? 'Directed by' : 'Created by'}</b> ${esc(dir.slice(0, 2).join(', '))}</span>` : '',
        cast.length ? `<span><b>Starring</b> ${esc(cast.join(', '))}</span>` : ''].join('');
    } catch (err) {
      if (cur?.id === e.id) { const ov = document.getElementById('qpOverview'); if (ov) ov.textContent = ''; }
    }
  }
  function drawNone() {
    document.getElementById('qpPoster').innerHTML = '<span class="qp-poster-ph" aria-hidden="true">?</span>';
    document.getElementById('qpInfo').innerHTML = `<div class="qp-count">Nothing fits</div><h2 class="qp-title" id="qpTitle">No match for that mood</h2>
      <div class="qp-meta">${skip.size ? 'You’ve skipped everything else. Picky tonight!' : 'Nothing on your watchlist fits all of those.'}</div>`;
    document.getElementById('qpBody').innerHTML = `<div class="qp-none">Try a different mood${skip.size ? ', or bring back the ones you skipped' : ''}.
      ${skip.size ? `<button type="button" class="qp-link" onclick="MSSPick.unskip()">Bring them back</button>` : ''}</div>`;
    document.getElementById('qpBackdrop').style.backgroundImage = '';
    foot = { start: false, skip: false, roll: false };
    paintFoot();
  }

  // (the panel shows a spinner in the button meanwhile)
  async function start() {
    if (!cur) return;
    if (!o.user) { close(); mssJoin('start watching'); return; }   // a guest (the example library)
    try {
      const e = cur;
      await updateProgress(e.id, o.user.id, { status: 'watching' });
      close();
      showToast(`Enjoy “${e.title}”! It’s in Currently Watching.`);
      o.onStarted?.(e);
    } catch (err) {
      console.error(err);
      showToast('Couldn’t start it — try again.', 'err');
    }
  }

  return {
    open, close, buttonHTML, reasons,
    roll: () => roll(), mood: setMood, _g: gAct, _gKey: gKey, _gPick: gPick,
    skip: () => { if (cur) skip.add(cur.id); roll(); },
    unskip: () => { skip.clear(); roll(); },
    start,
  };
})();
