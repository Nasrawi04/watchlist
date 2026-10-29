/* ═══════════════════════════════════════════════════════════════
   movie-night.js — Social → Movie Night (050_movie_night.sql)
   Pick something to watch together:
     • the host invites friends, optionally sets a date / time
     • voting is optional (082): "I'll choose" — the host picks the title (now or
       later, and can change it); "Let everyone vote" — as below
     • anyone in it adds titles (search, or "From your watchlists": titles
       on more than one of your watchlists), one vote each
     • the host locks in the top pick, or hits "Surprise us"
     • Going / Can't make it; a reminder on the day (nav.js → movie_night_reminders)
     • After the movie (052): everyone's take on the pick side by side — score,
       note, favourite, lists — a group score, highlights and a ratings comparison
     • From your Blend: suggestions from the group's Blend (friends.html, _blendGroup)

   MSSNight.mount(el, user, { night })   the section (night: open that one)

   Uses friends.html's friends (_frAccepted, _frProfiles, _frEntries, _cmpLoad /
   _cmpMine) for the invite list and the watchlist suggestions. Uses the date +
   time picker (MSSDateRange.when, date-range.js) in the popups, the shared
   poster card (MSSCard.poster) for the ballot and the suggestion rails, and
   the poll form's search results (pf-r …).
═══════════════════════════════════════════════════════════════ */
const MSSNight = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const errText = (err, fb) => err?.hint || fb;
  const nameOf = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 30) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const img = (p, size = 'w185') => p ? `https://image.tmdb.org/t/p/${size}${p}` : '';
  const whenText = d => d ? new Date(d).toLocaleString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  let el = null, user = null, nights = [], focus = null;
  const adding = {};       // night id → search open
  const reviews = {};      // night id → get_movie_night_reviews (After the movie)
  const cmpOpen = {};      // night id → ratings comparison shown
  const hits = {};         // night id → search results

  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (o.night) focus = o.night;
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Movie Night</div></div>
      ${user ? `<button type="button" class="btn-add-entry" onclick="MSSNight.create()">${icon('plus', 15)} New Movie Night</button>` : ''}</div>`;
    if (!user) {
      el.innerHTML = head + `<div class="mss-es">${mssArt('popcorn')}<div class="mss-es-title">Movie nights with friends</div><div class="mss-es-text">Sign in to pick something to watch together.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div id="mnList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    if (typeof _cmpLoad === 'function') _cmpLoad().then(() => draw()).catch(() => {});   // your watchlist, for suggestions
    await load();
  }
  async function load() {
    Object.keys(reviews).forEach(k => delete reviews[k]);
    try { nights = await rpc('get_movie_nights', {}) || []; } catch { nights = []; showToast('Couldn’t load Movie Nights — try again.', 'err'); }
    draw();
    if (focus) { requestAnimationFrame(() => document.getElementById('mn-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); focus = null; }
  }
  async function refresh(id) {
    try { const all = await rpc('get_movie_nights', {}) || []; nights = all; } catch {}
    draw();
  }
  function draw() {
    const box = document.getElementById('mnList'); if (!box) return;
    if (!nights.length) {
      box.innerHTML = `<div class="mss-es">${mssArt('popcorn')}<div class="mss-es-title">No Movie Nights yet</div>
        <div class="mss-es-text">The popcorn’s ready; the only thing missing is a plan. Invite friends, add a few titles (we’ll suggest some from your watchlists), vote — or let us surprise you.</div>
        <button type="button" class="mss-es-btn primary" style="margin-top:18px" onclick="MSSNight.create()">${icon('plus', 15)} New Movie Night</button></div>`;
      return;
    }
    box.innerHTML = `<div class="mn-list">${nights.map(card).join('')}</div>`;
    nights.filter(n => n.pick_id && n.status === 'decided').forEach(n => { if (!reviews[n.id]) loadReviews(n.id); });
  }

  /* ── After the movie (052) ── */
  const LABELS = Object.fromEntries([...CORE_RATINGS, ...BONUS_RATINGS, ...ANIME_CORE_RATINGS, ...ANIME_BONUS_RATINGS, ANIMATION_RATING].map(r => [r.key, r.label]));
  const scoreOf = e => e && liveScore(e) != null ? Number(liveScore(e)) : null;
  async function loadReviews(id) {
    reviews[id] = 'loading';
    try { reviews[id] = await rpc('get_movie_night_reviews', { p_night: id }) || { people: [] }; } catch { reviews[id] = { people: [], error: true }; }
    const box = document.getElementById('mnA-' + id);
    if (box) box.outerHTML = afterHTML(find(id));
  }
  function afterHTML(n) {
    const id = n.id, R = reviews[id];
    const wrap = inner => `<section class="mn-after" id="mnA-${id}" aria-label="After the movie">${inner}</section>`;
    if (!R || R === 'loading') return wrap(`<div class="mn-after-head">${icon('film', 14)} After the movie</div><div class="page-loading" style="padding:1rem"><div class="spinner"></div></div>`);
    const people = (R.people || []).map(p => ({ ...p, score: scoreOf(p.entry) }));
    const rated = people.filter(p => p.score != null);
    const avg = rated.length ? rated.reduce((a, p) => a + p.score, 0) / rated.length : null;
    const hi = rated.slice().sort((a, b) => b.score - a.score)[0], lo = rated.slice().sort((a, b) => a.score - b.score)[0];
    const spread = rated.length > 1 ? hi.score - lo.score : null;
    const who = p => p.me ? 'You' : esc(nameOf(p));
    const me = people.find(p => p.me);
    const status = e => !e ? 'Hasn’t logged it yet' : e.status === 'completed' ? `Watched${e.completed_date ? ' · ' + new Date(e.completed_date + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' }) : ''}`
      : e.status === 'queue' || e.status === 'up_next' ? 'On their watchlist' : e.status === 'watching' ? 'Watching' : 'In their library';
    const take = (p, i) => {
      const e = p.entry, note = e?.notes?.trim();
      const quote = note ? `<blockquote class="mn-take-note" translate="no">“${esc(MSSRich.plain(note).trim().split(/\s+/).slice(0, 40).join(' '))}${MSSRich.plain(note).trim().split(/\s+/).length > 40 ? '…' : ''}”</blockquote>` : '';
      const tags = `${p.favourite ? `<span class="mn-tag fav">${icon('trophy', 11)} Favourite</span>` : ''}${(p.lists || []).length ? `<span class="mn-tag" title="${esc(p.lists.join(', '))}">${icon('layers', 11)} In ${p.lists.length === 1 ? esc(p.lists[0]) : p.lists.length + ' lists'}</span>` : ''}`;
      const open = e ? `MSSNight._take(${attrJSON(id)}, ${i})` : (p.me ? `MSSNight._details(${attrJSON(n.pick_id)})` : '');
      return `<${open ? 'button type="button"' : 'div'} class="mn-take${p.me ? ' me' : ''}${e ? '' : ' empty'}" ${open ? `onclick="${open}"` : ''}>
          <span class="mn-take-top">${av(p, 30)}<span class="mn-take-who"><b translate="no">${who(p)}</b><small>${status(e)}</small></span>
            ${p.score != null ? `<span class="mn-take-score${p === hi && rated.length > 1 ? ' top' : ''}">${p.score.toFixed(1)}</span>` : `<span class="mn-take-score none">—</span>`}</span>
          ${note ? (mssIsSpoiler(e) && !p.me ? mssSpoilerHTML(quote, { compact: true, id: e.id, e }) : quote) : ''}
          ${tags ? `<span class="mn-tags">${tags}</span>` : ''}
          ${p.me && (!e || p.score == null) ? `<span class="mn-take-cta">${icon('ratingStar', 12)} ${e ? 'Rate it' : 'Log it & rate it'}</span>` : ''}
        </${open ? 'button' : 'div'}>`;
    };
    // the ratings side by side (only categories someone used)
    const ratedCols = rated;
    const keys = [...new Set(ratedCols.flatMap(p => Object.keys(p.entry.ratings || {}).filter(k => !k.startsWith('_') && LABELS[k] && p.entry.ratings[k] != null && p.entry.ratings[k] !== '')))];
    const table = cmpOpen[id] && ratedCols.length ? `<div class="mn-cmp" role="region" aria-label="Ratings side by side" tabindex="0"><table>
        <thead><tr><th></th>${ratedCols.map(p => `<th>${av(p, 22)}<span translate="no">${who(p)}</span></th>`).join('')}</tr></thead>
        <tbody>${keys.map(k => { const vals = ratedCols.map(p => Number(p.entry.ratings[k])).filter(v => !isNaN(v)); const mx = Math.max(...vals);
          return `<tr><td>${esc(LABELS[k])}</td>${ratedCols.map(p => { const v = p.entry.ratings[k]; return `<td class="${Number(v) === mx && vals.length > 1 ? 'best' : ''}">${v != null && v !== '' ? Number(v).toFixed(1) : '—'}</td>`; }).join('')}</tr>`; }).join('')}
        <tr class="mn-cmp-total"><td>Score</td>${ratedCols.map(p => `<td>${p.score.toFixed(1)}</td>`).join('')}</tr></tbody></table></div>` : '';
    return wrap(`
      <div class="mn-after-head">${icon('film', 14)} After the movie
        ${avg != null ? `<span class="mn-group"><b>${avg.toFixed(1)}</b> group score</span>` : ''}
        <small>${rated.length} of ${people.length} rated</small></div>
      ${rated.length > 1 ? `<div class="mn-hl">
          <span>${icon('trophy', 12)} Loved it most: <b translate="no">${who(hi)}</b> ${hi.score.toFixed(1)}</span>
          <span>${spread < 1 ? `${icon('check', 12)} You all agree` : `${icon('zap', 12)} Split by <b>${spread.toFixed(1)}</b> — ${esc(who(lo))} ${lo.score.toFixed(1)}`}</span>
          ${people.filter(p => p.entry?.notes?.trim()).length ? `<span>${icon('notebook', 12)} ${people.filter(p => p.entry?.notes?.trim()).length} notes</span>` : ''}
        </div>` : rated.length === 1 ? `<div class="mn-hl"><span>${icon('ratingStar', 12)} ${who(rated[0])} rated it first — your turn.</span></div>`
        : `<div class="mn-hl"><span>${icon('ratingStar', 12)} Watched it? Rate it and add a note — everyone here sees each other’s take.</span></div>`}
      <div class="mn-takes">${people.map(take).join('')}</div>
      ${rated.length ? `<button type="button" class="rec-btn mn-cmp-btn" aria-expanded="${!!cmpOpen[id]}" onclick="MSSNight._cmp(${attrJSON(id)})">${icon('compare', 14)} ${cmpOpen[id] ? 'Hide' : 'Compare'} ratings</button>` : ''}
      ${table}`);
  }
  function openTake(id, i) {
    const R = reviews[id]; const p = R?.people?.[i]; if (!p?.entry) return;
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
  // From the group's Blend (friends.html _blendFor): loved by someone here, new to others
  const blendFrom = {};    // night id → items (kept so a tap can add one)
  function blendSuggestions(n, skip) {
    if (typeof _blendFor !== 'function' || typeof _cmpMine === 'undefined' || !_cmpMine) return [];
    const friends = n.members.filter(m => !m.me && m.status !== 'declined' && _frProfiles[m.id]).map(m => m.id);
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

  function card(n) {
    const id = attrJSON(n.id), voting = n.voting !== false, open = n.status === 'open' && voting, host = n.is_host;
    const choosing = n.status === 'open' && !voting;          // no vote: the host is still choosing
    const d = n.scheduled_at ? new Date(n.scheduled_at) : null;
    const going = n.members.filter(m => m.status === 'going').length, invited = n.members.filter(m => m.status === 'invited').length;
    const total = n.options.reduce((s, o) => s + (o.votes || 0), 0);
    const top = Math.max(0, ...n.options.map(o => o.votes || 0));
    const pick = n.options.find(o => o.id === n.pick_id);
    const hostP = n.members.find(m => m.host);
    const status = n.status === 'cancelled' ? ['Cancelled', 'cancelled'] : n.status === 'decided' ? ['Decided', 'decided'] : voting ? ['Voting', 'open'] : ['Choosing', 'open'];
    const people = `<div class="mn-people">
        <div class="mn-avs">${n.members.map(m => `<span class="mn-av ${m.status}" title="${esc(nameOf(m))} — ${m.host ? 'host' : m.status === 'going' ? 'going' : m.status === 'declined' ? 'can’t make it' : 'invited'}">${av(m, 30)}</span>`).join('')}</div>
        <span class="mn-count"><b>${going}</b> going${invited ? ` · ${invited} invited` : ''}</span>
        ${!host && n.status !== 'cancelled' ? `<div class="pn-toggle soc-toggle soc-toggle-sm mn-rsvp" role="group" aria-label="Are you going?">${[['going', 'Going'], ['declined', 'Can’t make it']].map(([k, l]) =>
          `<button type="button" class="pn-toggle-btn${n.my_status === k ? ' active' : ''}" aria-pressed="${n.my_status === k}" onclick="MSSNight.rsvp(${id}, '${k}')">${l}</button>`).join('')}</div>` : ''}
      </div>`;
    const typeOf = o => o.tmdb_type === 'movie' ? 'movie' : 'tv';
    // The ballot — a poster per title: votes on the poster, who voted, a bar under it
    const optCard = o => {
      const pct = total ? Math.round((o.votes || 0) / total * 100) : 0, mine = n.my_vote === o.id, lead = open && total && o.votes === top && top > 0;
      const isPick = !open && o.id === n.pick_id;
      const voters = (o.voters || []).map(v => n.members.find(m => m.id === v)).filter(Boolean);
      const over = `<span class="mn-b-votes"><b>${o.votes || 0}</b><small>${o.votes === 1 ? 'vote' : 'votes'}</small></span>
        ${lead || isPick ? `<span class="mn-b-flag">${icon(isPick ? 'sparkles' : 'crown', 12)} ${isPick ? 'The pick' : 'Leading'}</span>` : ''}
        ${voters.length ? `<span class="mn-voters">${voters.slice(0, 4).map(m => av(m, 22)).join('')}</span>` : ''}
        ${open && (o.mine || host) ? `<button type="button" class="mn-b-rm" onclick="event.stopPropagation();MSSNight.removeOption(${attrJSON(o.id)})" onkeydown="event.stopPropagation()" aria-label="Remove ${esc(o.title)}" title="Remove">${icon('x', 13)}</button>` : ''}`;
      const below = `<div class="mn-b-bar" aria-hidden="true"><span style="width:${pct}%"></span></div><div class="mn-b-pct">${mine ? `${icon('check', 12)} Your vote${total ? ` · ${pct}%` : ''}` : total ? `${pct}%` : open ? 'Tap to vote' : 'No votes'}</div>`;
      const cls = `mn-b${mine ? ' mine' : ''}${lead ? ' lead' : ''}${isPick ? ' pick' : ''}${open ? '' : ' closed'}`;
      return MSSCard.poster({ cls, title: o.title, year: o.year, poster: img(o.poster_path, 'w342'), type: typeOf(o), overPoster: over, below,
        attrs: open ? `onclick="MSSNight.vote(${id}, ${attrJSON(mine ? null : o.id)})" aria-pressed="${mine}" aria-label="${esc(o.title)}, ${o.votes || 0} ${o.votes === 1 ? 'vote' : 'votes'}${mine ? ' — your vote, tap to take it back' : ' — vote for this'}"`
          : `onclick="MSSNight._details(${attrJSON(o.id)})" aria-label="${esc(o.title)}, ${o.votes || 0} ${o.votes === 1 ? 'vote' : 'votes'} — details"` });
    };
    const addTile = open ? `<button type="button" class="mn-b-add" onclick="MSSNight._add(${id})" aria-expanded="${!!adding[n.id]}">
        <span class="mn-b-add-ic">${icon(adding[n.id] ? 'search' : 'plus', 22)}</span><b>Add a title</b><small>Search any movie or show</small></button>` : '';
    // Suggestion rails: posters with a + on them
    const rail = (ic, label, items) => items.length ? `<section class="mn-rail-sec"><div class="mn-rail-head">${icon(ic, 14)}<span>${label}</span><b>${items.length}</b></div>
        <div class="mn-rail">${items.join('')}</div></section>` : '';
    const suggCard = (title, year, poster, type, why, onclick) => MSSCard.poster({ cls: 'mn-s', title, year, poster, type,
      overPoster: `<span class="mn-s-plus" aria-hidden="true">${icon('plus', 16)}</span>`, below: `<div class="mn-s-why">${why}</div>`,
      attrs: `onclick="${onclick}" aria-label="Add ${esc(title)} to the vote"` });
    const sugg = open ? suggestions(n) : [];
    const bsugg = open ? blendSuggestions(n, sugg.map(t => `${t.e.tmdb_type}:${t.e.tmdb_id}`)) : [];
    const addBox = open ? `<div class="mn-add">
        ${adding[n.id] ? `<div class="mn-search"><input id="mnQ-${n.id}" type="search" placeholder="Search a movie or show…" aria-label="Search a movie or show" autocomplete="off" enterkeyhint="search" oninput="MSSNight._q(${id}, this.value)">
            <div class="mn-hits" id="mnH-${n.id}"></div></div>` : ''}
        ${rail('bookmark', 'On your watchlists', sugg.map(t => suggCard(t.e.title, t.e.year, t.e.poster_url, t.e.tmdb_type === 'movie' ? 'movie' : 'tv',
          `On <b>${t.who.size}</b> watchlists`, `MSSNight._addSugg(${id}, ${attrJSON(`${t.e.tmdb_type}:${t.e.tmdb_id}`)})`)))}
        ${rail('shuffle', 'From your Blend', bsugg.map((t, k) => suggCard(t.o.title, t.o.year, img(t.o.poster_path, 'w342'), typeOf(t.o), esc(t.why), `MSSNight._addBlend(${id}, ${k})`)))}
      </div>` : '';
    const decided = pick ? `<div class="mn-pick">
        ${pick.poster_path ? `<span class="mn-pick-bg" style="background-image:url('${img(pick.poster_path, 'w342')}')" aria-hidden="true"></span><img src="${img(pick.poster_path, 'w342')}" alt="" loading="lazy">` : `<span class="mn-pick-ph">${icon('film', 26)}</span>`}
        <div class="mn-pick-info"><span class="mn-pick-eyebrow">${icon('sparkles', 12)} You’re watching</span>
          <b translate="no">${esc(pick.title)}</b><small>${[pick.year, pick.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small>
          <div class="mn-pick-acts"><button type="button" class="btn-add-entry" onclick="MSSNight._details(${attrJSON(pick.id)})">${icon('info', 14)} Details & Watchlist</button>${!voting && host && n.status !== 'cancelled' ? `<button type="button" class="rec-btn" onclick="MSSNight._add(${id})" aria-expanded="${!!adding[n.id]}">${icon('edit', 14)} Change</button>` : ''}</div>
        </div></div>` : '';
    // No vote: the host picks the title (search), and can change it later
    const chooseBox = !voting && host && n.status !== 'cancelled' && (choosing || adding[n.id]) ? `<div class="mn-choose">
        <div class="mn-rail-head">${icon('film', 14)}<span>${choosing ? 'Choose what you’re watching' : 'Change what you’re watching'}</span></div>
        <div class="mn-search"><input id="mnQ-${n.id}" type="search" placeholder="Search a movie or show…" aria-label="Search a movie or show" autocomplete="off" enterkeyhint="search" oninput="MSSNight._q(${id}, this.value)">
          <div class="mn-hits" id="mnH-${n.id}"></div></div></div>`
      : choosing && !host ? `<div class="mn-none">${icon('film', 14)} ${esc(nameOf(hostP))} is choosing what you’ll watch.</div>` : '';
    return `<article class="mn-card is-${status[1]}" id="mn-${n.id}">
      <header class="mn-head">
        <div class="mn-date${d ? '' : ' none'}" aria-hidden="true">${d ? `<small>${d.toLocaleDateString(MSSI18n.locale, { month: 'short' })}</small><b>${d.getDate()}</b>` : icon('clock', 20)}</div>
        <div class="mn-head-info">
          <div class="mn-title" translate="no">${esc(n.title)}</div>
          <div class="mn-when">${d ? whenText(d) : 'No date yet'} · ${host ? 'You’re hosting' : `Hosted by <b translate="no">${esc(nameOf(hostP))}</b>`}</div>
        </div>
        <span class="mn-status ${status[1]}">${status[0]}</span>
        ${host ? `<div class="poll-own">
          ${n.status !== 'cancelled' ? `<button type="button" class="rec-icon" onclick="MSSNight.edit(${id})" aria-label="Edit Movie Night" title="Edit">${icon('edit', 14)}</button>` : ''}
          <button type="button" class="rec-icon rec-icon-x" onclick="MSSNight.remove(${id})" aria-label="Delete Movie Night" title="Delete">${icon('trash', 14)}</button></div>` : ''}
      </header>
      ${people}
      ${decided}
      ${chooseBox}
      ${pick && n.status === 'decided' ? afterHTML(n) : ''}
      ${voting && n.status !== 'cancelled' && (n.options.length || open) ? `<div class="mn-rail-head">${icon('poll', 14)}<span>${open ? 'Vote for one' : 'The votes'}</span>${total ? `<b>${total} ${total === 1 ? 'vote' : 'votes'}</b>` : ''}</div>
        ${open && !n.options.length ? `<div class="mn-none">No titles yet — add one, or tap a poster below to put it up for a vote.</div>` : ''}
        <div class="mn-ballot">${n.options.map(optCard).join('')}${addTile}</div>` : ''}
      ${addBox}
      ${open && host && n.options.length ? `<div class="mn-host">
          <button type="button" class="btn-add-entry" onclick="MSSNight.decide(${id}, false)" ${total ? '' : 'disabled title="No votes yet"'}>${icon('check', 14)} Lock in top pick</button>
          <button type="button" class="rec-btn" onclick="MSSNight.decide(${id}, true)">${icon('shuffle', 14)} Surprise us</button>
        </div>` : ''}
    </article>`;
  }

  /* ── Actions ── */
  const find = id => nights.find(n => n.id === id);
  async function act(fn, args, fb) {
    try { await rpc(fn, args); await refresh(); return true; } catch (err) { showToast(errText(err, fb || 'Something went wrong — try again.'), 'err'); return false; }
  }
  const rsvp = (id, s) => act('respond_movie_night', { p_night: id, p_status: s });
  const vote = (id, opt) => act('vote_movie_night', { p_night: id, p_option: opt }, 'Couldn’t save your vote — try again.');
  const removeOption = oid => act('remove_movie_night_option', { p_option: oid });
  async function decide(id, surprise) {
    const n = find(id); if (!n) return;
    let opt = null;
    if (!surprise) {
      const top = Math.max(...n.options.map(o => o.votes || 0));
      const leaders = n.options.filter(o => (o.votes || 0) === top);
      opt = leaders[Math.floor(Math.random() * leaders.length)].id;     // a tie → one of the tied titles
    }
    const ok = await showConfirm({ title: surprise ? 'Surprise everyone?' : 'Lock in the top pick?', message: surprise ? 'We’ll pick one of the titles at random and tell everyone.' : 'Voting stops and everyone gets told what you’re watching.', confirmText: surprise ? 'Surprise Us' : 'Lock It In', iconName: surprise ? 'shuffle' : 'check', danger: false });
    if (!ok) return;
    if (await act('decide_movie_night', { p_night: id, p_option: opt })) {
      const p = find(id)?.options.find(o => o.id === find(id)?.pick_id);
      if (p) showToast(`You’re watching ${p.title}!`);
    }
  }
  async function remove(id) {
    const n = find(id); if (!n) return;
    const ok = await showConfirm({ title: 'Delete this Movie Night?', message: 'It disappears for everyone, with its votes.', confirmText: 'Delete', iconName: 'trash' });
    if (ok) act('delete_movie_night', { p_night: id });
  }
  // No-vote night: the host's choice is the pick (082)
  async function setPick(id, o) {
    if (await act('set_movie_night_pick', { p_night: id, p_option: o }, 'Couldn’t save it — try again.')) { adding[id] = false; draw(); showToast(`You’re watching ${o.title}!`); }
  }
  async function addOption(id, o) {
    if (await act('add_movie_night_option', { p_night: id, p_option: o }, 'Couldn’t add it — try again.')) { adding[id] = false; draw(); }
  }
  let qTimer = null; const qLast = {};
  function search(id, q) {
    clearTimeout(qTimer); qLast[id] = q;
    const box = document.getElementById('mnH-' + id); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    qTimer = setTimeout(async () => {
      box.innerHTML = `<div class="pf-r-msg">Searching…</div>`;
      const res = await _tmdbSearch(q.trim(), 6);
      if (qLast[id] !== q) return;                     // typed on since
      hits[id] = res.map(r => ({ tmdb_id: r.id, tmdb_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path, year: (r.release_date || r.first_air_date || '').slice(0, 4) }));
      const b2 = document.getElementById('mnH-' + id); if (!b2) return;
      b2.innerHTML = hits[id].length ? hits[id].map((h, k) => `<button type="button" class="pf-r" onclick="MSSNight._pick(${attrJSON(id)}, ${k})">
          <span class="poll-thumb">${h.poster_path ? `<img src="${img(h.poster_path, 'w92')}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span></button>`).join('')
        : `<div class="pf-r-msg">Nothing found — try another spelling.</div>`;
    }, MSS_SEARCH_MS);
  }
  function addSugg(id, key) {
    const [t, tid] = key.split(':');
    const pool = [...(typeof _cmpMine !== 'undefined' && _cmpMine ? _cmpMine : []), ...(typeof _frEntries !== 'undefined' ? _frEntries : [])];
    const e = pool.find(x => x.tmdb_type === t && String(x.tmdb_id) === tid); if (!e) return;
    const poster = (e.poster_url || '').match(/\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/)?.[0] || null;
    addOption(id, { tmdb_id: Number(tid), tmdb_type: t, title: e.title, poster_path: poster, year: String(e.year || '').slice(0, 4) });
  }
  function details(optId) {
    const o = nights.flatMap(n => n.options).find(x => x.id === optId); if (!o) return;
    MSSInfo.fromDiscover({ id: o.tmdb_id, tmdb_id: o.tmdb_id, media_type: o.tmdb_type, title: o.title, year: o.year, poster_url: o.poster_path ? img(o.poster_path, 'w500') : null });
  }

  /* ── New / edit popup ── */
  let form = null;
  // Same popup shell as New Poll / Recommend (_socDialog, social.js)
  function popup(title, body, foot) {
    const ov = _socDialog('mnForm', title, closeForm);
    document.getElementById('mnFormBody').innerHTML = body;
    document.getElementById('mnFormFoot').innerHTML = foot;
    MSSDialog.open(ov, { focus: '#mnT' });
  }
  function closeForm() { MSSDialog.close(document.getElementById('mnForm')); form = null; }
  function create() {
    const friends = typeof _frAccepted !== 'undefined' ? _frAccepted : [];
    if (!friends.length) { showToast('Add a friend first — then invite them to a Movie Night.', 'err'); return; }
    form = { mode: 'new', picked: new Set(), voting: false, pick: null };
    popup('New Movie Night', `
        <label class="sf-section-label" for="mnT">Name it</label>
        <input id="mnT" class="pf-input" maxlength="80" placeholder="Movie Night">
        <div class="sf-section-label">When <span class="sf-section-hint">optional · everyone gets a reminder that day</span></div>
        ${MSSDateRange.when('mnW', { value: null })}
        <div class="sf-section-label">Invite friends <span class="sf-section-hint">(1–19)</span></div>
        <div class="mn-invite" role="group" aria-label="Invite friends">${friends.map(f => `<button type="button" class="soc-chip mn-inv" aria-pressed="false" data-id="${esc(f.friendId)}" onclick="MSSNight._inv(this)">${av(f.friendProfile, 22)}<span translate="no">${esc(nameOf(f.friendProfile))}</span></button>`).join('')}</div>
        <div class="sf-section-label">What you’ll watch</div>
        <div class="pn-toggle soc-toggle mn-vote-mode" role="group" aria-label="How you pick">
          <button type="button" class="pn-toggle-btn active" aria-pressed="true" data-v="0" onclick="MSSNight._voting(false)">${icon('film', 14)} I’ll choose</button>
          <button type="button" class="pn-toggle-btn" aria-pressed="false" data-v="1" onclick="MSSNight._voting(true)">${icon('poll', 14)} Let everyone vote</button></div>
        <div id="mnPickBox"></div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSNight._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="mnSave" onclick="MSSNight._save()" disabled>Create</button>`);
    drawFormPick();
  }
  function setVoting(on) {
    if (!form) return;
    form.voting = on;
    document.querySelectorAll('.mn-vote-mode .pn-toggle-btn').forEach(b => { const a = (b.dataset.v === '1') === on; b.classList.toggle('active', a); b.setAttribute('aria-pressed', a); });
    drawFormPick();
  }
  function drawFormPick() {
    const box = document.getElementById('mnPickBox'); if (!box || !form) return;
    if (form.voting) { box.innerHTML = `<div class="pf-note">${icon('poll', 13)} Everyone adds titles and votes once it’s made — we’ll suggest the ones on your watchlists. You lock in the winner.</div>`; return; }
    const h = form.pick;
    box.innerHTML = h ? `<div class="mn-chosen"><span class="poll-thumb">${h.poster_path ? `<img src="${img(h.poster_path, 'w92')}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span>
          <button type="button" class="rec-btn" onclick="MSSNight._formPick(null)">Change</button></div>`
      : `<div class="mn-search"><input id="mnQ-new" type="search" placeholder="Search a movie or show… (optional)" aria-label="Search a movie or show" autocomplete="off" enterkeyhint="search" oninput="MSSNight._q('new', this.value)">
          <div class="mn-hits" id="mnH-new"></div></div>
        <div class="pf-note">${icon('film', 13)} No vote — you choose. You can pick it now or later.</div>`;
  }
  function formPick(h) {
    if (!form) return;
    form.pick = h; drawFormPick();
    if (!h) document.getElementById('mnQ-new')?.focus();
  }
  function edit(id) {
    const n = find(id); if (!n) return;
    form = { mode: 'edit', id };
    popup('Edit Movie Night', `
        <label class="sf-section-label" for="mnT">Name</label>
        <input id="mnT" class="pf-input" maxlength="80" value="${esc(n.title)}">
        <div class="sf-section-label">When <span class="sf-section-hint">optional</span></div>
        ${MSSDateRange.when('mnW', { value: n.scheduled_at })}
        <button type="button" class="poll-link poll-danger mn-cancel" onclick="MSSNight._cancelNight()">${icon('x', 13)} Cancel this Movie Night</button>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSNight._close()">Close</button>
        <button type="button" class="sf-apply-btn" id="mnSave" onclick="MSSNight._save()">Save</button>`);
  }
  function inv(b) {
    const id = b.dataset.id, on = !form.picked.has(id);
    on ? form.picked.add(id) : form.picked.delete(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    document.getElementById('mnSave').disabled = !form.picked.size;
  }
  async function save() {
    if (!form) return;
    const t = document.getElementById('mnT').value.trim(), w = document.getElementById('mnW').value;
    const when = w ? new Date(w).toISOString() : null;
    const btn = document.getElementById('mnSave'); btn.disabled = true;
    try {
      if (form.mode === 'new') {
        const voting = form.voting;
        const id = await rpc('create_movie_night', { p_title: t || null, p_when: when, p_friends: [...form.picked],
          p_options: !form.voting && form.pick ? [form.pick] : [], p_voting: form.voting });
        closeForm(); focus = id; adding[id] = voting; await load();
        showToast('Movie Night made — your friends got an invite');
      } else {
        await rpc('update_movie_night', { p_night: form.id, p_title: t || null, p_when: when, p_clear_when: !w, p_cancel: false });
        closeForm(); await refresh();
      }
    } catch (err) { btn.disabled = false; showToast(errText(err, 'Couldn’t save — try again.'), 'err'); }
  }
  async function cancelNight() {
    const id = form?.id; if (!id) return;
    const ok = await showConfirm({ title: 'Cancel this Movie Night?', message: 'Everyone gets told it’s off.', confirmText: 'Cancel It', iconName: 'x' });
    if (!ok) return;
    closeForm(); act('update_movie_night', { p_night: id, p_title: null, p_when: null, p_clear_when: false, p_cancel: true });
  }

  return { mount, create, edit, remove, rsvp, vote, decide, removeOption, redraw: draw,
    _take: openTake, _addBlend: (id, k) => { const t = blendFrom[id]?.[k]; if (t) addOption(id, t.o); }, _cmp: id => { cmpOpen[id] = !cmpOpen[id]; const n = find(id); const b = document.getElementById('mnA-' + id); if (n && b) b.outerHTML = afterHTML(n); },
    _add: id => { adding[id] = !adding[id]; draw(); document.getElementById('mnQ-' + id)?.focus(); },
    _q: search, _pick: (id, k) => { const h = hits[id]?.[k]; if (!h) return; if (id === 'new') return formPick(h);
      find(id)?.voting === false ? setPick(id, h) : addOption(id, h); }, _addSugg: addSugg, _details: details,
    _close: closeForm, _inv: inv, _save: save, _cancelNight: cancelNight, _voting: setVoting, _formPick: formPick };
})();
