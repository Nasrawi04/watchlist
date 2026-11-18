/* ═══════════════════════════════════════════════════════════════
   movie-night.js — Social → Movie Night (050, 052, 082, 129)
   Pick something to watch together:
     • the host invites friends, optionally sets a date / time
     • one night can hold SEVERAL movies (129: the lineup, in order — e.g. Dune and then
       Avengers: Doomsday). "I'll choose": the host picks 1–6 movies (now or later, and can
       change them). "Let everyone vote": anyone adds titles (search, "On your watchlists",
       "From your Blend"), one vote each; the host locks in one or more winners, or "Surprise us"
     • each movie of the lineup is a backdrop band — the HOST's own backdrop for that title
       (their Edit-page choice and framing) when they set one, else TMDB's; never the viewer's
     • Going / Can't make it (Can't make it takes you off Going); a reminder on the day
     • After the movie (052): everyone's take on each movie — score, note, favourite, lists,
       "1 of 2 rated" — and the ratings side by side
     • Upcoming (default) · Past · Hosting; ⋯ holds Edit / Cancel / Delete (host) or Leave
     • ?poll=<id> (a poll's "Make it a Movie Night"): New Movie Night with the poll's winning title(s)
   Until sql/129 runs, the page reads the old functions and a night's pick is its only movie.

   MSSNight.mount(el, user, { night })   the section (night: open that one)

   Uses social-core.js's friends (_frAccepted, _frProfiles, _frEntries, _cmpLoad / _cmpMine),
   the date + time picker (MSSDateRange.when), the standard card (MSSCard.poster), the shared
   side panel (_socDialog → MSSPanel; a full page on phones) and the ⋯ menu (MSSPopover).
═══════════════════════════════════════════════════════════════ */
const MSSNight = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const missing = err => err?.code === 'PGRST202' || /Could not find the function/i.test(err?.message || '');
  const errText = (err, fb) => err?.hint || fb;
  const nameOf = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 30) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const img = (p, size = 'w185') => p ? `https://image.tmdb.org/t/p/${size}${p}` : '';
  const whenText = d => d ? new Date(d).toLocaleString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const typeOf = o => o.tmdb_type === 'movie' ? 'movie' : 'tv';
  const MAX = 6;
  let el = null, user = null, nights = [], focus = null, v2 = true, view = 'upcoming';
  const adding = {};       // night id → search open
  const reviews = {};      // night id → [{ pick, people }] (After the movie)
  const cmpOpen = {};      // 'night:option' → ratings comparison shown
  const hits = {};         // night id → search results
  const locking = {};      // night id → Set of option ids picked to lock in (vote nights)

  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (o.night) focus = o.night;
    if (!user) { el.innerHTML = mssGuestEmpty('movie-night'); return; }
    const act = document.getElementById('socHeadAct');
    if (act) act.innerHTML = `<button type="button" class="btn-add-entry" onclick="MSSNight.create()">${icon('plus', 15)} New Movie Night</button>`;
    el.innerHTML = `<div id="mnViews"></div><div id="mnList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    if (typeof _cmpLoad === 'function') _cmpLoad().then(() => draw()).catch(() => {});   // your library, for suggestions + "In your library"
    await load();
    if (o.poll) fromPoll(o.poll);
  }
  // A poll's winner (the most-voted title options; a tie → all of them, up to the lineup's limit) → a new night
  async function fromPoll(id) {
    const url = new URL(location.href); url.searchParams.delete('poll'); history.replaceState(history.state, '', url.pathname + url.search);
    let p = null;
    try { p = await MSSPolls.get(id); } catch {}
    const t = (p?.options || []).filter(x => x.kind === 'title');
    if (!t.length) { showToast('That poll isn’t available any more.', 'err'); return; }
    const top = Math.max(0, ...t.map(x => x.votes || 0));
    const win = t.filter(x => (x.votes || 0) === top).slice(0, MAX);
    await create();
    if (!form) return;
    form.lineup = win.map(x => ({ tmdb_id: x.tmdb_id, tmdb_type: x.tmdb_type, title: x.label, poster_path: x.image_path, year: (x.sub || '').slice(0, 4) }));
    const n = document.getElementById('mnT'); if (n) n.value = p.question.slice(0, 80);
    form.dirty = true; drawFormPick();
  }
  // The night as the page uses it: a lineup (in_lineup options, in order). Old data / before 129: the pick.
  function norm(n) {
    const lineup = n.options.filter(o => o.in_lineup).sort((a, b) => (a.lineup_pos ?? 0) - (b.lineup_pos ?? 0));
    if (!lineup.length && n.pick_id) { const p = n.options.find(o => o.id === n.pick_id); if (p) lineup.push(p); }
    const past = n.phase ? n.phase === 'past' : n.status === 'cancelled' || (n.scheduled_at && new Date(n.scheduled_at) < Date.now() - 6 * 36e5);
    return { ...n, lineup, past };
  }
  async function fetchNights() {
    if (v2) {
      try { return (await rpc('get_movie_nights_v2', {}) || []).map(norm); }
      catch (err) { if (!missing(err)) throw err; v2 = false; }
    }
    return (await rpc('get_movie_nights', {}) || []).map(norm);
  }
  async function load() {
    v2 = true;                                    // checked again on every load (sql/129 may have just been run)
    Object.keys(reviews).forEach(k => delete reviews[k]);
    try { nights = await fetchNights(); } catch { nights = []; showToast('Couldn’t load Movie Nights — try again.', 'err'); }
    const up = nights.filter(n => !n.past).length;
    window.MSSSocial?.count(up ? `${up} coming up` : 'Pick something to watch together.');
    if (focus) { const f = nights.find(n => n.id === focus); if (f) view = f.past ? 'past' : 'upcoming'; }
    draw();
    if (focus) { requestAnimationFrame(() => document.getElementById('mn-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); focus = null; }
  }
  async function refresh() {
    try { nights = await fetchNights(); } catch {}
    draw();
  }
  // Upcoming (default) · Past · Hosting (the upcoming ones you host)
  const inView = (n, k) => k === 'past' ? n.past : k === 'hosting' ? n.is_host && !n.past : !n.past;
  function draw() {
    const box = document.getElementById('mnList'), vb = document.getElementById('mnViews'); if (!box) return;
    const counts = { upcoming: nights.filter(n => inView(n, 'upcoming')).length, past: nights.filter(n => inView(n, 'past')).length, hosting: nights.filter(n => inView(n, 'hosting')).length };
    if (vb) vb.innerHTML = nights.length ? `<div class="fr-tabs mn-views" role="tablist" aria-label="Which Movie Nights">${[['upcoming', 'Upcoming'], ['past', 'Past'], ['hosting', 'Hosting']].map(([k, l]) =>
      `<button type="button" role="tab" class="fr-tab${view === k ? ' active' : ''}" aria-selected="${view === k}" onclick="MSSNight._view('${k}')">${l}${counts[k] ? `<span class="fr-people-n">${counts[k]}</span>` : ''}</button>`).join('')}</div>` : '';
    if (!nights.length) {
      box.innerHTML = `<div class="mss-es">${mssArt('popcorn')}<div class="mss-es-title">No Movie Nights yet</div>
        <div class="mss-es-text">The popcorn’s ready; the only thing missing is a plan. Invite friends, pick a movie or a few — or put some up for a vote.</div>
        <button type="button" class="mss-es-btn primary" style="margin-top:18px" onclick="MSSNight.create()">${icon('plus', 15)} New Movie Night</button></div>`;
      return;
    }
    const list = nights.filter(n => inView(n, view));
    box.innerHTML = list.length ? `<div class="mn-list">${list.map(card).join('')}</div>`
      : `<div class="mn-empty-view">${icon('film', 18)} ${view === 'past' ? 'No past Movie Nights yet.' : view === 'hosting' ? 'You’re not hosting anything coming up.' : 'Nothing coming up — start one with New Movie Night.'}</div>`;
    list.filter(n => n.lineup.length && n.status === 'decided').forEach(n => { if (!reviews[n.id]) loadReviews(n.id); });
    paintBackdrops(box);
  }
  // Each movie's band: the host's backdrop for it (their choice + framing), else TMDB's — never the viewer's own
  function paintBackdrops(root) {
    root.querySelectorAll('.mn-band[data-bd]:not([data-bd-on])').forEach(b => {
      b.dataset.bdOn = '1';
      const o = nights.flatMap(n => n.options).find(x => x.id === b.dataset.bd); if (!o) return;
      const ent = { tmdb_id: o.tmdb_id, tmdb_type: o.tmdb_type, ratings: o.host_backdrop || {} };
      MSSBackdrop.url(ent, 'w1280').then(u => {
        if (!u) return;
        const im = new Image();
        im.onload = () => { const art = b.querySelector('.mn-band-art'); art.style.backgroundImage = `url('${u}')`; art.setAttribute('style', art.getAttribute('style') + MSSBackdrop.style(ent, false, 'desk')); art.classList.add('in'); };
        im.src = u;
      });
    });
  }

  /* ── After the movie (052 / 129): one block per movie ── */
  const scoreOf = e => e && liveScore(e) != null ? Number(liveScore(e)) : null;
  async function loadReviews(id) {
    reviews[id] = 'loading';
    try {
      reviews[id] = v2 ? await rpc('get_movie_night_reviews_v2', { p_night: id }) || []
        : [await rpc('get_movie_night_reviews', { p_night: id })].filter(Boolean);
    } catch (err) {
      if (v2 && missing(err)) { v2 = false; return loadReviews(id); }
      reviews[id] = { error: true };
    }
    const box = document.getElementById('mnA-' + id), n = find(id);
    if (box && n) box.outerHTML = afterHTML(n);
  }
  function afterHTML(n) {
    const id = n.id, R = reviews[id];
    const wrap = (inner, sub = '') => `<section class="mn-after" id="mnA-${id}" aria-label="After the movie"><div class="mn-after-head">${icon('film', 14)} After the movie${sub}</div>${inner}</section>`;
    if (!R || R === 'loading') return wrap(`<div class="page-loading" style="padding:1rem"><div class="spinner"></div></div>`);
    if (R.error || !R.length) return wrap(`<div class="mn-hl"><span>${icon('ratingStar', 12)} Watched it? Rate it and add a note — everyone here sees each other’s take.</span></div>`);
    const blocks = R.map((r, j) => movieTakes(n, r, j));
    const many = R.length > 1;
    return wrap(blocks.join(''), many ? '' : ` <small>${rateCount(R[0])}</small>`);
  }
  const rateCount = r => { const ppl = r.people || []; return `${ppl.filter(p => scoreOf(p.entry) != null).length} of ${ppl.length} rated`; };
  function movieTakes(n, r, j) {
    const id = n.id, many = (reviews[id] || []).length > 1, key = `${id}:${j}`;
    const people = (r.people || []).map(p => ({ ...p, score: scoreOf(p.entry) }));
    const rated = people.filter(p => p.score != null);
    const avg = rated.length ? rated.reduce((a, p) => a + p.score, 0) / rated.length : null;
    const hi = rated.slice().sort((a, b) => b.score - a.score)[0], lo = rated.slice().sort((a, b) => a.score - b.score)[0];
    const spread = rated.length > 1 ? hi.score - lo.score : null;
    const who = p => p.me ? 'You' : esc(nameOf(p));
    const status = e => !e ? 'Hasn’t logged it yet' : e.status === 'completed' ? `Watched${e.completed_date ? ' · ' + new Date(e.completed_date + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' }) : ''}`
      : e.status === 'queue' || e.status === 'up_next' ? 'On their watchlist' : e.status === 'watching' ? 'Watching' : 'In their library';
    const take = (p, i) => {
      const e = p.entry, note = e?.notes?.trim();
      const quote = note ? `<blockquote class="mn-take-note" translate="no">“${esc(MSSRich.plain(note).trim().split(/\s+/).slice(0, 40).join(' '))}${MSSRich.plain(note).trim().split(/\s+/).length > 40 ? '…' : ''}”</blockquote>` : '';
      const tags = `${p.favourite ? `<span class="mn-tag fav">${icon('trophy', 11)} Favourite</span>` : ''}${(p.lists || []).length ? `<span class="mn-tag" title="${esc(p.lists.join(', '))}">${icon('layers', 11)} In ${p.lists.length === 1 ? esc(p.lists[0]) : p.lists.length + ' lists'}</span>` : ''}`;
      const open = e ? `MSSNight._take(${attrJSON(id)}, ${j}, ${i})` : (p.me ? `MSSNight._details(${attrJSON(r.pick.id || n.pick_id)})` : '');
      return `<${open ? 'button type="button"' : 'div'} class="mn-take${p.me ? ' me' : ''}${e ? '' : ' empty'}" ${open ? `onclick="${open}"` : ''}>
          <span class="mn-take-top">${av(p, 30)}<span class="mn-take-who"><b translate="no">${who(p)}</b><small>${status(e)}</small></span>
            ${p.score != null ? `<span class="mn-take-score${p === hi && rated.length > 1 ? ' top' : ''}">${mssR1(p.score)}</span>` : `<span class="mn-take-score none">—</span>`}</span>
          ${note ? (mssIsSpoiler(e) && !p.me ? mssSpoilerHTML(quote, { compact: true, id: e.id, e }) : quote) : ''}
          ${tags ? `<span class="mn-tags">${tags}</span>` : ''}
          ${p.me && (!e || p.score == null) ? `<span class="mn-take-cta">${icon('ratingStar', 12)} ${e ? 'Rate it & add a note' : 'Log it & rate it'}</span>` : ''}
        </${open ? 'button' : 'div'}>`;
    };
    const used = k => rated.some(p => p.entry.ratings?.[k] != null && p.entry.ratings[k] !== '');
    const groups = MSS_RATING_GROUPS.map(g => ({ name: g.name, keys: [...new Set(g.items.map(x => x.key))].filter(used) })).filter(g => g.keys.length);
    const table = cmpOpen[key] && rated.length ? `<div class="mn-cmp" role="region" aria-label="Ratings side by side" tabindex="0"><table>
        <thead><tr><th></th>${rated.map(p => `<th>${av(p, 22)}<span translate="no">${who(p)}</span></th>`).join('')}</tr></thead>
        <tbody>${groups.map(g => `<tr class="mn-cmp-grp"><th scope="rowgroup" colspan="${rated.length + 1}">${esc(g.name)}</th></tr>` + g.keys.map(k => { const vals = rated.map(p => Number(p.entry.ratings[k])).filter(v => !isNaN(v)); const mx = Math.max(...vals);
          return `<tr><td>${esc(MSS_RATING_LABEL[k])}</td>${rated.map(p => { const v = p.entry.ratings[k]; return `<td class="${Number(v) === mx && vals.length > 1 ? 'best' : ''}">${v != null && v !== '' ? mssR1(Number(v)) : '—'}</td>`; }).join('')}</tr>`; }).join('')).join('')}
        <tr class="mn-cmp-total"><td>Score</td>${rated.map(p => `<td>${mssR1(p.score)}</td>`).join('')}</tr></tbody></table></div>` : '';
    return `<div class="mn-after-movie">
      ${many ? `<div class="mn-after-title">${r.pick?.poster_path ? `<img src="${img(r.pick.poster_path, 'w92')}" alt="" loading="lazy">` : ''}<b translate="no">${esc(r.pick?.title)}</b><small>${rateCount(r)}</small>${avg != null ? `<span class="mn-group"><b>${mssR1(avg)}</b> group score</span>` : ''}</div>`
        : avg != null ? `<div class="mn-after-title"><span class="mn-group"><b>${mssR1(avg)}</b> group score</span></div>` : ''}
      ${rated.length > 1 ? `<div class="mn-hl">
          <span>${icon('trophy', 12)} Loved it most: <b translate="no">${who(hi)}</b> ${mssR1(hi.score)}</span>
          <span>${spread < 1 ? `${icon('check', 12)} You all agree` : `${icon('zap', 12)} Split by <b>${mssR1(spread)}</b> — ${esc(who(lo))} ${mssR1(lo.score)}`}</span>
        </div>` : rated.length === 1 ? `<div class="mn-hl"><span>${icon('ratingStar', 12)} ${who(rated[0])} rated it first — your turn.</span></div>`
        : `<div class="mn-hl"><span>${icon('ratingStar', 12)} Watched it? Rate it and add a note — everyone here sees each other’s take.</span></div>`}
      <div class="mn-takes">${people.map(take).join('')}</div>
      ${rated.length ? `<button type="button" class="fm-btn mn-cmp-btn" aria-expanded="${!!cmpOpen[key]}" onclick="MSSNight._cmp(${attrJSON(id)}, ${j})">${icon('compare', 14)} ${cmpOpen[key] ? 'Hide' : 'Compare'} ratings</button>` : ''}
      ${table}</div>`;
  }
  function openTake(id, j, i) {
    const p = reviews[id]?.[j]?.people?.[i]; if (!p?.entry) return;
    MSSViews.open(p.entry, p.me ? { own: true, start: scoreOf(p.entry) != null ? 'rate' : 'info', onChange: () => loadReviews(id), onNoteSaved: () => loadReviews(id) }
      : { start: scoreOf(p.entry) != null ? 'rate' : p.entry.notes ? 'note' : 'info', profile: p });
  }

  // Titles on more than one of the members' watchlists (yours + friends'), not already in the night
  function suggestions(n) {
    const ids = new Set(n.members.filter(m => m.status !== 'declined').map(m => m.id));
    const pool = [...(typeof _cmpMine !== 'undefined' && _cmpMine ? _cmpMine : []), ...(typeof _frEntries !== 'undefined' ? _frEntries.filter(e => ids.has(e.user_id)) : [])];
    const have = new Set(n.options.map(o => `${o.tmdb_type}:${o.tmdb_id}`));
    const tally = {};
    pool.forEach(e => {
      if (!e.tmdb_id || !(e.status === 'queue' || e.status === 'up_next')) return;
      const k = `${e.tmdb_type}:${e.tmdb_id}`; if (have.has(k)) return;
      const t = (tally[k] ||= { e, who: new Set() }); t.who.add(e.user_id);
    });
    return Object.values(tally).filter(t => t.who.size >= 2).sort((a, b) => b.who.size - a.who.size).slice(0, 8);
  }
  // From the group's Blend (social-core.js _blendFor): loved by someone here, new to others
  const blendFrom = {};    // night id → items (kept so a tap can add one)
  function blendSuggestions(n, skip) {
    if (typeof _blendFor !== 'function' || typeof _cmpMine === 'undefined' || !_cmpMine) return [];
    const friends = n.members.filter(m => m.id !== user?.id && m.status !== 'declined' && _frProfiles[m.id]).map(m => m.id);
    if (!friends.length) return [];
    const d = _blendFor(friends), have = new Set([...n.options.map(o => `${o.tmdb_type}:${o.tmdb_id}`), ...skip]);
    const out = [];
    [...d.theyLoved, ...d.youLoved].forEach(x => {
      const o = _blOption(x.e); if (!o) return;
      const k = `${o.tmdb_type}:${o.tmdb_id}`; if (have.has(k)) return; have.add(k);
      out.push({ o, why: x.why.replace(/<[^>]+>/g, '') });
    });
    return (blendFrom[n.id] = out.slice(0, 6));
  }
  const inLibrary = o => typeof _cmpMine !== 'undefined' && (_cmpMine || []).some(e => String(e.tmdb_id) === String(o.tmdb_id) && (e.tmdb_type || (e.cat === 'movies' ? 'movie' : 'tv')) === o.tmdb_type);

  // A movie of the lineup: its backdrop band — poster, "You're watching", title, year · type, Details / Add to watchlist
  function band(n, o, i) {
    const many = n.lineup.length > 1;
    return `<div class="mn-band" data-bd="${esc(o.id)}">
      <span class="mn-band-art" style="" aria-hidden="true"></span>
      ${o.poster_path ? `<img class="mn-band-poster" src="${img(o.poster_path, 'w342')}" alt="" loading="lazy">` : `<span class="mn-band-poster mn-pick-ph">${icon('film', 24)}</span>`}
      <div class="mn-band-info">
        <span class="mn-band-eyebrow">${many ? `${i + 1} of ${n.lineup.length} · ` : ''}${n.past ? 'You watched' : 'You’re watching'}</span>
        <b class="mn-band-title" translate="no">${esc(o.title)}</b>
        <small>${[o.year, o.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small>
        <div class="mn-band-acts">
          <button type="button" class="mn-glass" onclick="MSSNight._details(${attrJSON(o.id)})">${icon('info', 14)} Details</button>
          ${inLibrary(o) ? `<span class="mn-glass is-on">${icon('check', 14)} In your library</span>` : `<button type="button" class="mn-glass" onclick="MSSNight._watchlist(${attrJSON(o.id)})">${icon('bookmark', 14)} Add to watchlist</button>`}
        </div>
      </div>
    </div>`;
  }
  function card(n) {
    const id = attrJSON(n.id), voting = n.voting !== false, open = n.status === 'open' && voting, host = n.is_host;
    const choosing = !n.lineup.length && !voting && n.status !== 'cancelled';
    const d = n.scheduled_at ? new Date(n.scheduled_at) : null;
    const going = n.members.filter(m => m.status === 'going'), invited = n.members.filter(m => m.status === 'invited').length;
    const total = n.options.reduce((s, o) => s + (o.votes || 0), 0);
    const top = Math.max(0, ...n.options.map(o => o.votes || 0));
    const hostP = n.members.find(m => m.host);
    const status = n.status === 'cancelled' ? ['Cancelled', 'cancelled'] : n.status === 'decided' ? [host ? 'Hosting · Decided' : 'Decided', 'decided']
      : voting ? ['Voting', 'open'] : [host ? 'Hosting' : 'Choosing', 'open'];
    // Who's coming: the faces of everyone going, then Going / Can't make it
    const people = `<div class="mn-people">
        <div class="mn-coming"><span class="mn-label">Who’s coming · ${going.length} going${invited ? ` · ${invited} invited` : ''}</span>
          <div class="mn-avs">${going.map(m => `<span class="mn-av going" title="${esc(nameOf(m))}${m.host ? ' — host' : ''}">${av(m, 32)}</span>`).join('') || '<span class="mn-nobody">Nobody yet</span>'}</div></div>
        ${!host && n.status !== 'cancelled' && !n.past ? `<div class="fr-tabs mn-rsvp" role="group" aria-label="Are you going?">${[['going', 'Going'], ['declined', 'Can’t make it']].map(([k, l]) =>
          `<button type="button" class="fr-tab${n.my_status === k ? ' active' : ''}" aria-pressed="${n.my_status === k}" onclick="MSSNight.rsvp(${id}, '${k}')">${k === 'going' && n.my_status === k ? icon('check', 13) + ' ' : ''}${l}</button>`).join('')}</div>` : ''}
      </div>`;
    // The ballot — a poster per title: votes on the poster, who voted, a bar under it; while locking in, tick the winners
    const lock = locking[n.id];
    const optCard = o => {
      const pct = total ? Math.round((o.votes || 0) / total * 100) : 0, mine = n.my_vote === o.id, lead = open && total && o.votes === top && top > 0;
      const inLine = !open && n.lineup.some(x => x.id === o.id), picked = lock?.has(o.id);
      const voters = (o.voters || []).map(v => n.members.find(m => m.id === v)).filter(Boolean);
      const over = `${lead || inLine || picked ? `<span class="mn-b-flag">${icon(inLine || picked ? 'check' : 'crown', 12)} ${picked ? 'Locking in' : inLine ? 'In the lineup' : 'Leading'}</span>` : ''}
        ${voters.length ? `<span class="mn-voters">${voters.slice(0, 4).map(m => av(m, 22)).join('')}</span>` : ''}
        ${open && !lock && (o.mine || host) ? `<button type="button" class="mn-b-rm" onclick="event.stopPropagation();MSSNight.removeOption(${attrJSON(o.id)})" onkeydown="event.stopPropagation()" aria-label="Remove ${esc(o.title)}" title="Remove">${icon('x', 13)}</button>` : ''}`;
      const below = `<div class="mn-b-bar" aria-hidden="true"><span style="width:${pct}%"></span></div><div class="mn-b-pct">${mine ? `${icon('check', 12)} Your vote${total ? ` · ${pct}%` : ''}` : total ? `${pct}%` : open ? 'Tap to vote' : 'No votes'}</div>`;
      const cls = `mn-b${mine ? ' mine' : ''}${lead ? ' lead' : ''}${inLine || picked ? ' pick' : ''}${open ? '' : ' closed'}`;
      const attrs = lock ? `onclick="MSSNight._lockPick(${id}, ${attrJSON(o.id)})" aria-pressed="${!!picked}" aria-label="${esc(o.title)} — ${picked ? 'locking in, tap to leave out' : 'tap to lock in'}"`
        : open ? `onclick="MSSNight.vote(${id}, ${attrJSON(mine ? null : o.id)})" aria-pressed="${mine}" aria-label="${esc(o.title)}, ${o.votes || 0} ${o.votes === 1 ? 'vote' : 'votes'}${mine ? ' — your vote, tap to take it back' : ' — vote for this'}"`
        : `onclick="MSSNight._details(${attrJSON(o.id)})" aria-label="${esc(o.title)}, ${o.votes || 0} ${o.votes === 1 ? 'vote' : 'votes'} — details"`;
      return MSSCard.poster({ cls, title: o.title, year: o.year, poster: img(o.poster_path, 'w342'), type: typeOf(o), over, below, age: [typeOf(o), o.tmdb_id],
        meta: `${o.votes || 0} ${o.votes === 1 ? 'vote' : 'votes'}`, attrs });
    };
    const addTile = open && !lock ? `<button type="button" class="mn-b-add" onclick="MSSNight._add(${id})" aria-expanded="${!!adding[n.id]}">
        <span class="mn-b-add-ic">${icon(adding[n.id] ? 'search' : 'plus', 22)}</span><b>Add a title</b><small>Search any movie or show</small></button>` : '';
    const rail = (ic, label, items) => items.length ? `<section class="mn-rail-sec"><div class="mn-rail-head">${icon(ic, 14)}<span>${label}</span><b>${items.length}</b></div>
        <div class="msf-rail mn-rail">${items.join('')}</div></section>` : '';
    const suggCard = (title, year, poster, type, why, onclick, tid) => MSSCard.poster({ cls: 'mn-s', title, year, poster, type, age: [type, tid, true],
      over: `<span class="mn-s-plus" aria-hidden="true">${icon('plus', 16)}</span>`, below: `<div class="mn-s-why">${why}</div>`,
      attrs: `onclick="${onclick}" aria-label="Add ${esc(title)} to the vote"` });
    const sugg = open && !lock ? suggestions(n) : [];
    const bsugg = open && !lock ? blendSuggestions(n, sugg.map(t => `${t.e.tmdb_type}:${t.e.tmdb_id}`)) : [];
    const addBox = open && !lock ? `<div class="mn-add">
        ${adding[n.id] ? searchBox(n.id, id, 'Search movies and shows…') : ''}
        ${rail('bookmark', 'On your watchlists', sugg.map(t => suggCard(t.e.title, t.e.year, t.e.poster_url, t.e.tmdb_type === 'movie' ? 'movie' : 'tv',
          `On <b>${t.who.size}</b> watchlists`, `MSSNight._addSugg(${id}, ${attrJSON(`${t.e.tmdb_type}:${t.e.tmdb_id}`)})`, t.e.tmdb_id)))}
        ${rail('shuffle', 'From your Blend', bsugg.map((t, k) => suggCard(t.o.title, t.o.year, img(t.o.poster_path, 'w342'), typeOf(t.o), esc(t.why), `MSSNight._addBlend(${id}, ${k})`, t.o.tmdb_id)))}
      </div>` : '';
    const hero = n.lineup.length ? `<div class="mn-hero${n.lineup.length > 1 ? ' is-many' : ''}">${n.lineup.map((o, i) => band(n, o, i)).join('')}</div>` : '';
    const chooseNote = choosing ? (host ? `<div class="mn-none">${icon('film', 14)} No movies yet — <button type="button" class="poll-link" onclick="MSSNight.edit(${id})">choose what you’re watching</button>.</div>`
      : `<div class="mn-none">${icon('film', 14)} ${esc(nameOf(hostP))} is choosing what you’ll watch.</div>`) : '';
    const hostBar = open && host && n.options.length ? (lock ? `<div class="mn-host">
          <button type="button" class="btn-add-entry" onclick="MSSNight._lockGo(${id})" ${lock.size ? '' : 'disabled'}>${icon('check', 14)} Lock in ${lock.size || ''} ${lock.size === 1 ? 'movie' : 'movies'}</button>
          <button type="button" class="fm-btn" onclick="MSSNight._lockCancel(${id})">Cancel</button>
          <span class="mn-host-hint">Tap the posters to pick one or more — up to ${MAX}.</span></div>`
      : `<div class="mn-host">
          <button type="button" class="btn-add-entry" onclick="MSSNight._lockStart(${id})">${icon('check', 14)} Lock in the winners</button>
          <button type="button" class="fm-btn" onclick="MSSNight.decide(${id})">${icon('shuffle', 14)} Surprise us</button>
        </div>`) : '';
    return `<article class="mn-card is-${status[1]}${n.past ? ' is-past' : ''}" id="mn-${n.id}">
      <header class="mn-head">
        <div class="mn-date${d ? '' : ' none'}" aria-hidden="true">${d ? `<small>${d.toLocaleDateString(MSSI18n.locale, { month: 'short' })}</small><b>${d.getDate()}</b>` : icon('clock', 20)}</div>
        <div class="mn-head-info">
          <h2 class="mn-title" translate="no">${esc(n.title)}</h2>
          <div class="mn-when">${d ? whenText(d) : 'No date yet'} · ${host ? 'You’re hosting' : `Hosted by <b translate="no">${esc(nameOf(hostP))}</b>`}${n.lineup.length > 1 ? ` · ${n.lineup.length} movies` : ''}</div>
        </div>
        <span class="mn-status ${status[1]}">${status[1] === 'decided' ? icon('check', 11) + ' ' : ''}${status[0]}</span>
        <button type="button" class="fm-icon-btn mn-more" aria-label="Movie Night actions" aria-haspopup="menu" onclick="MSSNight._more(this, ${id})">${icon('moreV', 15)}</button>
      </header>
      ${hero}
      ${chooseNote}
      ${people}
      ${n.lineup.length && n.status === 'decided' ? afterHTML(n) : ''}
      ${voting && n.status !== 'cancelled' && (n.options.length || open) ? `<div class="mn-rail-head">${icon('poll', 14)}<span>${lock ? 'Lock in the winners' : open ? 'Vote for one' : 'The votes'}</span>${total ? `<b>${total} ${total === 1 ? 'vote' : 'votes'}</b>` : ''}</div>
        ${open && !n.options.length ? `<div class="mn-none">No titles yet — add one, or tap a poster below to put it up for a vote.</div>` : ''}
        <div class="msf-grid mn-ballot">${n.options.map(optCard).join('')}${addTile}</div>` : ''}
      ${addBox}
      ${hostBar}
    </article>`;
  }

  // The Library's search box (icon · field · × · green Search), with the results under it
  function searchBox(key, arg, placeholder) {
    return `<div class="mn-search"><div class="sf-search mn-sbox" role="search">
        <span class="sf-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input type="search" class="sf-search-input" id="mnQ-${esc(key)}" placeholder="${esc(placeholder)}" aria-label="Search movies and shows" autocomplete="off" spellcheck="false" enterkeyhint="search"
          oninput="this.closest('.sf-search').classList.toggle('has-q', !!this.value);MSSNight._q(${arg}, this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();MSSNight._q(${arg}, this.value, true)}">
        <button type="button" class="sf-search-clear" aria-label="Clear search" onclick="const i=this.parentElement.querySelector('input');i.value='';i.dispatchEvent(new Event('input'));i.focus()">${icon('x', 14)}</button>
        <button type="button" class="sf-search-go" onclick="const i=this.parentElement.querySelector('input');MSSNight._q(${arg}, i.value, true);i.focus()">${icon('search', 16)}<span>Search</span></button>
      </div><div class="mn-hits" id="mnH-${esc(key)}"></div></div>`;
  }

  /* ── Actions ── */
  const find = id => nights.find(n => n.id === id);
  async function act(fn, args, fb) {
    try { await rpc(fn, args); await refresh(); return true; } catch (err) { showToast(errText(err, fb || 'Something went wrong — try again.'), 'err'); return false; }
  }
  const rsvp = (id, s) => act('respond_movie_night', { p_night: id, p_status: s });
  const vote = (id, opt) => act('vote_movie_night', { p_night: id, p_option: opt }, 'Couldn’t save your vote — try again.');
  const removeOption = oid => act('remove_movie_night_option', { p_option: oid });
  // ⋯: Edit · Cancel · Delete (host) — Leave (guests: you're off the Going list)
  async function more(btn, id) {
    const n = find(id); if (!n) return;
    await mssLoadScript('js/panel.js');
    const items = n.is_host ? [
      ...(n.status !== 'cancelled' ? [{ label: 'Edit', icon: 'edit', onSelect: () => edit(id) }] : []),
      ...(n.status !== 'cancelled' && !n.past ? [{ label: 'Cancel this Movie Night…', icon: 'x', onSelect: () => cancelNight(id) }] : []),
      { divider: true },
      { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => remove(id) },
    ] : [
      { label: 'Details of the movies', icon: 'info', onSelect: () => n.lineup[0] && details(n.lineup[0].id) },
      ...(n.my_status !== 'declined' && n.status !== 'cancelled' ? [{ label: 'Leave this Movie Night', icon: 'logout', danger: true, onSelect: () => rsvp(id, 'declined') }] : []),
    ];
    MSSPopover.open(btn, { title: n.title, label: 'Movie Night actions', items: items.filter((it, i, a) => !(it.divider && (i === 0 || i === a.length - 1))) });
  }
  // Vote nights: the host ticks one or more winners (129); before 129, one
  function lockStart(id) {
    const n = find(id); if (!n) return;
    const top = Math.max(0, ...n.options.map(o => o.votes || 0));
    locking[id] = new Set(top ? n.options.filter(o => (o.votes || 0) === top).slice(0, MAX).map(o => o.id) : []);
    draw();
  }
  function lockPick(id, oid) {
    const s = locking[id]; if (!s) return;
    if (s.has(oid)) s.delete(oid);
    else if (!v2) { s.clear(); s.add(oid); }
    else if (s.size >= MAX) { showToast(`Up to ${MAX} movies.`, 'err'); return; }
    else s.add(oid);
    draw();
  }
  async function lockGo(id) {
    const ids = [...(locking[id] || [])]; if (!ids.length) return;
    const ok = await showConfirm({ title: ids.length > 1 ? `Lock in ${ids.length} movies?` : 'Lock in this movie?', message: 'Voting stops and everyone gets told what you’re watching.', confirmText: 'Lock It In', iconName: 'check', danger: false });
    if (!ok) return;
    delete locking[id];
    const done = v2 ? await act('decide_movie_night_v2', { p_night: id, p_options: ids }) : await act('decide_movie_night', { p_night: id, p_option: ids[0] });
    if (done) { const n = find(id); if (n?.lineup.length) showToast(`You’re watching ${n.lineup.map(o => o.title).join(' and ')}!`); }
  }
  async function decide(id) {
    const ok = await showConfirm({ title: 'Surprise everyone?', message: 'We’ll pick one of the titles at random and tell everyone.', confirmText: 'Surprise Us', iconName: 'shuffle', danger: false });
    if (!ok) return;
    const done = v2 ? await act('decide_movie_night_v2', { p_night: id, p_options: [] }) : await act('decide_movie_night', { p_night: id, p_option: null });
    if (done) { const p = find(id)?.lineup[0]; if (p) showToast(`You’re watching ${p.title}!`); }
  }
  async function remove(id) {
    const ok = await showConfirm({ title: 'Delete this Movie Night?', message: 'It disappears for everyone, with its votes.', confirmText: 'Delete', iconName: 'trash' });
    if (ok) act('delete_movie_night', { p_night: id });
  }
  async function addOption(id, o) {
    if (await act('add_movie_night_option', { p_night: id, p_option: o }, 'Couldn’t add it — try again.')) { adding[id] = false; draw(); }
  }
  // Search (TMDB): into the vote, or into the form's lineup ('new' / 'edit')
  let qTimer = null; const qLast = {};
  function search(id, q, now) {
    clearTimeout(qTimer); qLast[id] = q;
    const box = document.getElementById('mnH-' + id); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    qTimer = setTimeout(async () => {
      box.innerHTML = `<div class="pf-r-msg">Searching…</div>`;
      const res = await _tmdbSearch(q.trim(), 6);
      if (qLast[id] !== q) return;                     // typed on since
      hits[id] = res.map(r => ({ tmdb_id: r.id, tmdb_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path, year: (r.release_date || r.first_air_date || '').slice(0, 4) }));
      const b2 = document.getElementById('mnH-' + id); if (!b2) return;
      b2.innerHTML = hits[id].length ? hits[id].map((h, k) => `<button type="button" class="pf-r" onclick="MSSNight._pick(${attrJSON(id)}, ${k})"${MSSAge.attr(h.tmdb_type, h.tmdb_id)}>
          <span class="poll-thumb">${h.poster_path ? `<img src="${img(h.poster_path, 'w92')}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span>${icon('plus', 15)}</button>`).join('')
        : `<div class="pf-r-msg">Nothing found — try another spelling.</div>`;
    }, now ? 0 : MSS_SEARCH_MS);
  }
  function addSugg(id, key) {
    const [t, tid] = key.split(':');
    const pool = [...(typeof _cmpMine !== 'undefined' && _cmpMine ? _cmpMine : []), ...(typeof _frEntries !== 'undefined' ? _frEntries : [])];
    const e = pool.find(x => x.tmdb_type === t && String(x.tmdb_id) === tid); if (!e) return;
    const poster = (e.poster_url || '').match(/\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/)?.[0] || null;
    addOption(id, { tmdb_id: Number(tid), tmdb_type: t, title: e.title, poster_path: poster, year: String(e.year || '').slice(0, 4) });
  }
  const optById = oid => nights.flatMap(n => n.options).find(x => x.id === oid);
  const asItem = o => ({ id: o.tmdb_id, tmdb_id: o.tmdb_id, media_type: o.tmdb_type, title: o.title, year: o.year, poster_url: o.poster_path ? img(o.poster_path, 'w500') : null });
  function details(oid) { const o = optById(oid); if (o) MSSInfo.fromDiscover(asItem(o)); }
  function watchlist(oid) { const o = optById(oid); if (o) MSSInfo.addToLibrary(asItem(o), { status: 'queue' }); }

  /* ── New / edit: the shared side panel (a full page on phones) ── */
  let form = null;
  async function popup(title, body, foot) {
    const h = await _socDialog('mnForm', title, () => { form = null; }, 'L', () => !!form?.dirty);
    document.getElementById('mnFormBody').innerHTML = body;
    document.getElementById('mnFormFoot').innerHTML = foot;
    if (!h.isPage) document.getElementById('mnT')?.focus();
  }
  // Cancel / ✕ / Back with changes asks first (the panel's own "Discard changes?"); after saving it just closes
  function closeForm(force) { if (force) { form = null; _socDialogClose('mnForm'); } else _socDialogCancel('mnForm'); }
  const dirty = () => { if (form) form.dirty = true; };
  async function create() {
    const friends = typeof _frAccepted !== 'undefined' ? _frAccepted : [];
    if (!friends.length) { showToast('Add a friend first — then invite them to a Movie Night.', 'err'); return; }
    form = { mode: 'new', picked: new Set(), voting: false, lineup: [], dirty: false };
    await popup('New Movie Night', `
        <label class="sf-section-label" for="mnT">Name it</label>
        <input id="mnT" class="pf-input" maxlength="80" placeholder="Movie Night" oninput="MSSNight._dirty()">
        <div class="sf-section-label">When <span class="sf-section-hint">optional · everyone gets a reminder that day</span></div>
        <div onchange="MSSNight._dirty()">${MSSDateRange.when('mnW', { value: null })}</div>
        <div class="sf-section-label">Invite friends <span class="sf-section-hint">(1–19)</span></div>
        <div class="mn-invite" role="group" aria-label="Invite friends">${friends.map(f => `<button type="button" class="soc-chip mn-inv" aria-pressed="false" data-id="${esc(f.friendId)}" onclick="MSSNight._inv(this)">${av(f.friendProfile, 22)}<span translate="no">${esc(nameOf(f.friendProfile))}</span></button>`).join('')}</div>
        <div class="sf-section-label">What you’ll watch</div>
        <div class="fr-tabs mn-vote-mode" role="group" aria-label="How you pick">
          <button type="button" class="fr-tab active" aria-pressed="true" data-v="0" onclick="MSSNight._voting(false)">${icon('film', 14)} I’ll choose</button>
          <button type="button" class="fr-tab" aria-pressed="false" data-v="1" onclick="MSSNight._voting(true)">${icon('poll', 14)} Let everyone vote</button></div>
        <div id="mnPickBox"></div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSNight._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="mnSave" onclick="MSSNight._save()" disabled>Create</button>`);
    drawFormPick();
  }
  function setVoting(on) {
    if (!form) return;
    form.voting = on; dirty();
    document.querySelectorAll('.mn-vote-mode .fr-tab').forEach(b => { const a = (b.dataset.v === '1') === on; b.classList.toggle('active', a); b.setAttribute('aria-pressed', a); });
    drawFormPick();
  }
  // The lineup in the form: the movies picked so far (× to remove, ↑ to move up), then the search
  function drawFormPick() {
    const box = document.getElementById('mnPickBox'); if (!box || !form) return;
    if (form.voting) { box.innerHTML = `<div class="pf-note">${icon('poll', 13)} Everyone adds titles and votes once it’s made — we’ll suggest the ones on your watchlists. You lock in the winner, or a few.</div>`; return; }
    const L = form.lineup;
    box.innerHTML = `${L.length ? `<ol class="mn-lineup">${L.map((h, k) => `<li class="mn-chosen"><span class="mn-lineup-n">${k + 1}</span><span class="poll-thumb">${h.poster_path ? `<img src="${img(h.poster_path, 'w92')}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span>
          ${k ? `<button type="button" class="fm-icon-btn" onclick="MSSNight._lineUp(${k})" aria-label="Move ${esc(h.title)} up">${icon('chevup', 14)}</button>` : ''}
          <button type="button" class="fm-icon-btn" onclick="MSSNight._lineDrop(${k})" aria-label="Remove ${esc(h.title)}">${icon('x', 14)}</button></li>`).join('')}</ol>` : ''}
      ${L.length < MAX ? searchBox('form', "'form'", L.length ? 'Add another movie…' : 'Search movies and shows (optional)…') : ''}
      <div class="pf-note">${icon('film', 13)} No vote — you choose, now or later. ${L.length} of ${MAX} movies${L.length >= MAX ? ' — that’s the most for one night' : ''}.</div>`;
  }
  function formAdd(h) {
    if (!form) return;
    if (form.lineup.some(x => x.tmdb_type === h.tmdb_type && x.tmdb_id === h.tmdb_id)) { showToast('Already in the lineup.'); return; }
    form.lineup.push(h); dirty(); drawFormPick();
    if (form.mode === 'edit') { const s = document.getElementById('mnSave'); if (s) s.disabled = false; }
    document.getElementById('mnQ-form')?.focus();
  }
  async function edit(id) {
    const n = find(id); if (!n) return;
    const choose = n.voting === false && n.status !== 'cancelled';
    form = { mode: 'edit', id, voting: n.voting !== false, lineup: choose ? n.lineup.map(o => ({ tmdb_id: o.tmdb_id, tmdb_type: o.tmdb_type, title: o.title, poster_path: o.poster_path, year: o.year })) : [], dirty: false, choose };
    await popup('Edit Movie Night', `
        <label class="sf-section-label" for="mnT">Name</label>
        <input id="mnT" class="pf-input" maxlength="80" value="${esc(n.title)}" oninput="MSSNight._dirty()">
        <div class="sf-section-label">When <span class="sf-section-hint">optional</span></div>
        <div onchange="MSSNight._dirty()">${MSSDateRange.when('mnW', { value: n.scheduled_at })}</div>
        ${choose ? `<div class="sf-section-label">What you’ll watch</div><div id="mnPickBox"></div>` : ''}`,
      `<button type="button" class="sf-clear-btn" onclick="MSSNight._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="mnSave" onclick="MSSNight._save()">Save</button>`);
    if (choose) { form.voting = false; drawFormPick(); }
  }
  function inv(b) {
    const id = b.dataset.id, on = !form.picked.has(id);
    on ? form.picked.add(id) : form.picked.delete(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); dirty();
    document.getElementById('mnSave').disabled = !form.picked.size;
  }
  async function save() {
    if (!form) return;
    const t = document.getElementById('mnT').value.trim(), w = document.getElementById('mnW').value;
    const when = w ? new Date(w).toISOString() : null;
    const btn = document.getElementById('mnSave'); btn.disabled = true;
    try {
      if (form.mode === 'new') {
        const voting = form.voting, opts = voting ? [] : form.lineup;
        const args = { p_title: t || null, p_when: when, p_friends: [...form.picked], p_options: opts, p_voting: voting };
        const id = await rpc('create_movie_night_v2', args).catch(err => {
          if (!missing(err)) throw err;
          if (opts.length > 1) throw { hint: 'Several movies in one night need the database update (sql/129) — pick one for now.' };
          return rpc('create_movie_night', args);
        });
        closeForm(true); focus = id; view = 'upcoming'; adding[id] = voting; await load();
        showToast('Movie Night made — your friends got an invite');
      } else {
        const n = find(form.id);
        await rpc('update_movie_night', { p_night: form.id, p_title: t || null, p_when: when, p_clear_when: !w, p_cancel: false });
        const was = (n?.lineup || []).map(o => `${o.tmdb_type}:${o.tmdb_id}`).join(','), now = form.lineup.map(o => `${o.tmdb_type}:${o.tmdb_id}`).join(',');
        if (form.choose && form.lineup.length && was !== now)
          await rpc('set_movie_night_lineup', { p_night: form.id, p_options: form.lineup }).catch(err => {
            if (!missing(err)) throw err;
            if (form.lineup.length > 1) throw { hint: 'Several movies in one night need the database update (sql/129) — keep one for now.' };
            return rpc('set_movie_night_pick', { p_night: form.id, p_option: form.lineup[0] });
          });
        closeForm(true); await refresh();
      }
    } catch (err) { btn.disabled = false; showToast(errText(err, 'Couldn’t save — try again.'), 'err'); }
  }
  async function cancelNight(id) {
    const ok = await showConfirm({ title: 'Cancel this Movie Night?', message: 'Everyone gets told it’s off.', confirmText: 'Cancel It', iconName: 'x', danger: false });
    if (ok) act('update_movie_night', { p_night: id, p_title: null, p_when: null, p_clear_when: false, p_cancel: true });
  }

  return { mount, create, edit, remove, rsvp, vote, decide, removeOption, redraw: draw,
    _view: k => { view = k; draw(); }, _more: more, _take: openTake, _details: details, _watchlist: watchlist,
    _addBlend: (id, k) => { const t = blendFrom[id]?.[k]; if (t) addOption(id, t.o); },
    _cmp: (id, j) => { const k = `${id}:${j}`; cmpOpen[k] = !cmpOpen[k]; const n = find(id), b = document.getElementById('mnA-' + id); if (n && b) b.outerHTML = afterHTML(n); },
    _add: id => { adding[id] = !adding[id]; draw(); document.getElementById('mnQ-' + id)?.focus(); },
    _q: search, _pick: (id, k) => { const h = hits[id]?.[k]; if (!h) return; if (id === 'form') return formAdd(h); addOption(id, h); }, _addSugg: addSugg,
    _lockStart: lockStart, _lockPick: lockPick, _lockGo: lockGo, _lockCancel: id => { delete locking[id]; draw(); },
    _lineUp: k => { const L = form?.lineup; if (!L || !k) return; [L[k - 1], L[k]] = [L[k], L[k - 1]]; dirty(); drawFormPick(); },
    _lineDrop: k => { form?.lineup.splice(k, 1); dirty(); drawFormPick(); },
    _close: () => closeForm(), _inv: inv, _save: save, _voting: setVoting, _dirty: dirty };
})();
