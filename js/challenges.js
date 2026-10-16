/* ═══════════════════════════════════════════════════════════════
   challenges.js — Social → Challenges (051_challenges.sql)
   "Watch 10 horror movies in October" between friends — up to 100 people.
     • a goal (1–500 titles), optional type + genre, start / end dates
     • progress is automatic: titles marked Watched with a date inside the
       challenge that fit its type / genre
     • a live leaderboard; finishers get a medal (MSSMedal) — 1st gold, 2nd silver, 3rd+ bronze
     • anyone who has joined can invite their own friends
   Official challenges (054) — made by the official account, open to everyone:
     • Featured at the top from 7 days before they start ("Coming soon") until they end
     • a set list (only those titles count) or "anything that fits", their own
       medal artwork (same for everyone who finishes) and an optional spotlight popup

   MSSChallenges.mount(el, user, { ch })   the section (ch: scroll to that one)

   Uses friends.html's _frAccepted for the invite lists, the shared Social
   popup (_socDialog, social.js), the filter dropdown (SF.dd, sort-filter.js),
   the date range picker (MSSDateRange, date-range.js), medals.js, spotlights.js
   (tags, poster strip, preview) and the Polls / Inbox button styles.
═══════════════════════════════════════════════════════════════ */
const MSSChallenges = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const errText = (err, fb) => err?.hint || fb;
  const nameOf = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 30) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const CATS = [['', 'Anything'], ['movies', 'Movies'], ['tv', 'TV Shows'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'];
  const day = d => new Date(d + 'T12:00:00');
  const fmtDay = d => day(d).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: day(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 864e5);
  const what = c => {
    const cat = CATS.find(x => x[0] === (c.cat || ''))[1];
    return `${c.genre ? esc(c.genre) + ' ' : ''}${c.cat ? cat.toLowerCase() : 'titles'}`;
  };
  let el = null, user = null, list = [], off = { me_official: false, list: [] }, focus = null;
  const showAll = {};

  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (o.ch) focus = o.ch;
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Challenges</div></div>
      ${user ? `<span id="chHeadBtn">${newBtn()}</span>` : ''}</div>`;
    if (!user) {
      el.innerHTML = head + `<div class="fr-empty"><div class="fr-empty-ic">${icon('trophy', 26)}</div><div class="fr-empty-title">Challenges with friends</div><div class="fr-empty-text">Sign in to race your friends to a watching goal.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div id="chList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    await load();
  }
  // The official account makes official challenges; everyone else, friends' ones
  const newBtn = () => off.me_official
    ? `<button type="button" class="btn-add-entry" onclick="MSSChallenges.official()">${icon('crown', 15)} New Official Challenge</button>`
    : `<button type="button" class="btn-add-entry" onclick="MSSChallenges.create()">${icon('plus', 15)} New Challenge</button>`;
  async function load() {
    const [a, b] = await Promise.allSettled([rpc('get_challenges', {}), rpc('official_challenges', {})]);
    if (a.status === 'rejected') showToast('Couldn’t load challenges — try again.', 'err');
    list = (a.value || []).filter(c => !c.official);
    off = { me_official: !!b.value?.me_official, list: b.value?.list || [] };
    const hb = document.getElementById('chHeadBtn'); if (hb) hb.innerHTML = newBtn();
    draw();
    if (focus) { requestAnimationFrame(() => document.getElementById('ch-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); focus = null; }
  }
  function draw() {
    const box = document.getElementById('chList'); if (!box) return;
    const feat = off.list.length ? `<section class="chf-sec" aria-label="Official challenges"><div class="chf-sec-head">${icon('crown', 14)}<span>Featured</span></div>
        <div class="chf-list">${off.list.map(featured).join('')}</div></section>` : '';
    if (!list.length) {
      if (feat) { box.innerHTML = feat; return; }
      box.innerHTML = `<div class="fr-empty"><div class="fr-empty-ic">${icon('trophy', 26)}</div><div class="fr-empty-title">No challenges yet</div>
        <div class="fr-empty-text">Set a goal — “10 horror movies in October”, “50 movies this year” — invite friends, and race to the finish.</div>
        <button type="button" class="btn-add-entry" style="margin:14px auto 0" onclick="MSSChallenges.create()">${icon('plus', 15)} New Challenge</button></div>`;
      return;
    }
    box.innerHTML = feat + `<div class="ch-list">${list.map(card).join('')}</div>`;
  }

  /* ── An official challenge: medal, story, tags, posters, join / your progress ── */
  function featured(c) {
    const id = attrJSON(c.id), joined = c.my_status === 'joined', done = !!c.my_finished_at;
    const pct = Math.min(100, Math.round((c.my_progress || 0) / c.goal * 100));
    const state = c.state === 'hidden' ? [`Hidden until ${fmtDay(iso(new Date(day(c.starts_on).getTime() - 7 * 864e5)))}`, 'hidden']
      : c.state === 'soon' ? ['Coming soon', 'soon'] : c.state === 'ended' ? ['Ended', 'ended'] : ['Live', 'live'];
    const foot = done ? `<div class="chf-done">${icon('check', 15)} You finished — the medal is yours</div>`
      : joined ? `<div class="ch-mine chf-mine">
            <div class="ch-mine-n"><b>${c.my_progress || 0}</b><span>/ ${c.goal}</span></div>
            <div class="ch-mine-main"><div class="ch-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${c.my_progress || 0}" aria-label="Your progress"><i style="width:${pct}%"></i></div>
              <div class="ch-mine-text">${c.state === 'soon' ? 'You’re in — it starts soon.' : `${c.goal - (c.my_progress || 0)} to go · ${pct}%`}</div></div>
          </div>`
      : c.state === 'soon' || c.state === 'live' ? `<button type="button" class="btn-add-entry chf-join" onclick="MSSChallenges._joinOfficial(${id})">${icon('check', 15)} Join the challenge</button>` : '';
    return `<article class="chf is-${state[1]}" id="ch-${c.id}">
      <div class="chf-medal">${MSSMedal.official(c.medal, { size: 132, label: `${c.title} medal` })}</div>
      <div class="chf-body">
        <div class="chf-eyebrow"><span class="chf-state ${state[1]}">${state[0]}</span>${c.state !== 'hidden' && c.state !== 'ended' ? `<span>${MSSSpotlight.when(c, true)}</span>` : ''}<span>${fmtDay(c.starts_on)} – ${fmtDay(c.ends_on)}</span></div>
        <h3 class="chf-title" translate="no">${esc(c.title)}</h3>
        ${c.description ? `<p class="chf-desc">${esc(c.description)}</p>` : ''}
        <div class="spot-tags">${MSSSpotlight.tags(c)}</div>
        ${MSSSpotlight.posters(c, 10)}
        <div class="chf-foot">${foot}<span class="chf-count">${icon('users', 13)} <b>${c.joined}</b> joined${c.finished ? ` · <b>${c.finished}</b> finished` : ''}</span>
          ${joined && !done ? `<button type="button" class="poll-link poll-danger" onclick="MSSChallenges.respond(${id}, 'leave')">Leave</button>` : ''}</div>
        ${c.is_creator ? `<div class="chf-own">
            <button type="button" class="rec-btn" onclick="MSSChallenges.official(${id})">${icon('edit', 14)} Edit</button>
            <button type="button" class="rec-btn" onclick="MSSChallenges._preview(${id})">${icon('eye', 14)} Preview spotlight</button>
            <button type="button" class="rec-icon rec-icon-x" onclick="MSSChallenges.remove(${id})" aria-label="Delete challenge" title="Delete">${icon('trash', 14)}</button></div>` : ''}
      </div>
    </article>`;
  }
  async function joinOfficial(id) {
    if (await act('join_official_challenge', { p_ch: id })) showToast('You’re in — go watch something!');
  }

  function card(c) {
    const id = attrJSON(c.id), invited = c.my_status === 'invited';
    const joined = c.members.filter(m => m.status === 'joined'), pending = c.members.filter(m => m.status === 'invited');
    const me = c.members.find(m => m.me);
    const pct = Math.min(100, Math.round((c.my_progress || 0) / c.goal * 100));
    const today = iso(new Date());
    const left = daysBetween(today, c.ends_on), until = daysBetween(today, c.starts_on);
    const state = c.state === 'upcoming' ? [`Starts in ${until} ${until === 1 ? 'day' : 'days'}`, 'upcoming']
      : c.state === 'ended' ? ['Ended', 'ended'] : [left === 0 ? 'Last day!' : `${left} ${left === 1 ? 'day' : 'days'} left`, 'live'];
    const shown = showAll[c.id] ? joined : joined.slice(0, 10);
    const row = (m, i) => {
      const p = Math.min(100, Math.round((m.progress || 0) / c.goal * 100));
      return `<li class="ch-row${m.me ? ' me' : ''}${m.finished_at ? ' done' : ''}">
        <span class="ch-rank">${m.finished_at ? `<span class="poll-win" title="Finished #${m.finish_rank}">${icon('trophy', 11)}</span>` : i + 1}</span>
        ${av(m, 28)}
        <span class="ch-row-main"><span class="ch-row-name"><b translate="no">${m.me ? 'You' : esc(nameOf(m))}</b>${m.finished_at ? `<small>Finished #${m.finish_rank}</small>` : ''}</span>
          <span class="ch-bar" aria-hidden="true"><i style="width:${p}%"></i></span></span>
        <span class="ch-row-n"><b>${m.progress || 0}</b>/${c.goal}</span>
      </li>`;
    };
    return `<article class="ch-card is-${state[1]}" id="ch-${c.id}">
      <header class="ch-head">
        <span class="ch-ic" aria-hidden="true">${icon('trophy', 20)}</span>
        <div class="ch-head-info">
          <div class="ch-title" translate="no">${esc(c.title)}</div>
          <div class="ch-meta">Watch <b>${c.goal}</b> ${what(c)} · ${fmtDay(c.starts_on)} – ${fmtDay(c.ends_on)}</div>
        </div>
        <span class="ch-state ${state[1]}">${state[0]}</span>
        ${c.is_creator ? `<div class="poll-own"><button type="button" class="rec-icon rec-icon-x" onclick="MSSChallenges.remove(${id})" aria-label="Delete challenge" title="Delete">${icon('trash', 14)}</button></div>` : ''}
      </header>
      ${invited ? `<div class="ch-invite">
          <span>${icon('trophy', 14)} You’re invited — your titles from ${fmtDay(c.starts_on)} count as soon as you join.</span>
          <div class="ch-invite-acts"><button type="button" class="btn-add-entry" onclick="MSSChallenges.respond(${id}, 'join')">${icon('check', 14)} Join</button>
            <button type="button" class="rec-btn" onclick="MSSChallenges.respond(${id}, 'decline')">Decline</button></div>
        </div>` : `<div class="ch-mine">
          ${me?.finished_at ? `<span class="ch-medal" title="Your medal">${MSSMedal.challenge(me.finish_rank, c.cat, { size: 46, label: `Your medal — ${me.finish_rank === 1 ? 'gold' : me.finish_rank === 2 ? 'silver' : 'bronze'}` })}</span>` : ''}
          <div class="ch-mine-n"><b>${c.my_progress || 0}</b><span>/ ${c.goal}</span></div>
          <div class="ch-mine-main">
            <div class="ch-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${c.my_progress || 0}" aria-label="Your progress"><i style="width:${pct}%"></i></div>
            <div class="ch-mine-text">${me?.finished_at ? `You finished — <b>#${me.finish_rank}</b> to get there` : c.state === 'upcoming' ? 'Starts soon — anything you watch from the start date counts.' : c.state === 'ended' ? `It’s over — you got ${c.my_progress || 0} of ${c.goal}.` : `${c.goal - (c.my_progress || 0)} to go · ${pct}%`}</div>
          </div>
        </div>`}
      <div class="ch-board-head">${icon('users', 13)} Leaderboard · <b>${joined.length}</b> ${joined.length === 1 ? 'person' : 'people'}${pending.length ? ` · ${pending.length} invited` : ''}</div>
      <ol class="ch-board">${shown.map(row).join('')}</ol>
      ${joined.length > shown.length ? `<button type="button" class="poll-link" onclick="MSSChallenges._all(${id})">Show all ${joined.length}</button>` : ''}
      ${pending.length ? `<div class="ch-pending">${pending.slice(0, 12).map(m => `<span title="${esc(nameOf(m))} — invited">${av(m, 22)}</span>`).join('')}<span>Invited</span></div>` : ''}
      ${!invited && c.state !== 'ended' && c.members.length < 100 ? `<div class="ch-acts"><button type="button" class="rec-btn" onclick="MSSChallenges.invite(${id})">${icon('plus', 14)} Invite friends</button>
          ${!c.is_creator ? `<button type="button" class="poll-link poll-danger" onclick="MSSChallenges.respond(${id}, 'leave')">Leave</button>` : ''}</div>` : ''}
    </article>`;
  }

  /* ── Actions ── */
  async function act(fn, args, fb) {
    try { await rpc(fn, args); await load(); return true; } catch (err) { showToast(errText(err, fb || 'Something went wrong — try again.'), 'err'); return false; }
  }
  async function respond(id, a) {
    if (a === 'leave') {
      const ok = await showConfirm({ title: 'Leave this challenge?', message: 'You’re taken off the leaderboard.', confirmText: 'Leave', iconName: 'x' });
      if (!ok) return;
    }
    if (await act('respond_challenge', { p_ch: id, p_action: a }) && a === 'join') showToast('You’re in — go watch something!');
  }
  async function remove(id) {
    const ok = await showConfirm({ title: 'Delete this challenge?', message: 'It disappears for everyone, with the leaderboard.', confirmText: 'Delete', iconName: 'trash' });
    if (ok) act('delete_challenge', { p_ch: id });
  }

  /* ── New challenge / invite popups (same shell as New Poll) ── */
  let form = null;
  function popup(title, body, foot) {
    const ov = _socDialog('chForm', title, closeForm);
    document.getElementById('chFormBody').innerHTML = body;
    document.getElementById('chFormFoot').innerHTML = foot;
    MSSDialog.open(ov, { focus: '#chT' });
  }
  function closeForm() { MSSDialog.close(document.getElementById('chForm')); form = null; }
  const friendChips = exclude => (typeof _frAccepted !== 'undefined' ? _frAccepted : []).filter(f => !exclude.has(f.friendId))
    .map(f => `<button type="button" class="soc-chip mn-inv" aria-pressed="false" data-id="${esc(f.friendId)}" onclick="MSSChallenges._inv(this)">${av(f.friendProfile, 22)}<span translate="no">${esc(nameOf(f.friendProfile))}</span></button>`).join('');
  // A row of equal buttons (Goal presets, What counts, date ranges) — one is pressed
  const seg = (key, items, on) => `<div class="ch-seg" role="group">${items.map(([v, l, ic]) =>
    `<button type="button" class="ch-seg-btn${String(v) === String(on) ? ' active' : ''}" data-${key}="${v}" aria-pressed="${String(v) === String(on)}"
      onclick="MSSChallenges._f('${key}', '${v}')">${ic ? icon(ic, 16) : ''}<span>${l}</span></button>`).join('')}</div>`;
  const press = (key, v) => document.querySelectorAll(`#chFormBody [data-${key}]`).forEach(b => {
    const on = b.dataset[key] === String(v); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  // "Invite friends ……… Select all" — the label row both popups share
  const inviteHead = (label, hint) => `<div class="sf-section-label ch-label-row"><span>${label} <span class="sf-section-hint">${hint}</span></span>
      <button type="button" class="ch-all" id="chAll" onclick="MSSChallenges._f('all')">Select all</button></div>`;
  // Goal · What counts · Genre · Dates — the same in both forms
  const goalHTML = goal => `<div class="sf-section-label">Goal <span class="sf-section-hint">titles to watch</span></div>
        <div class="ch-goal">
          <div class="ch-step" role="group" aria-label="Goal">
            <button type="button" class="ch-step-btn" aria-label="One less" onclick="MSSChallenges._f('step', -1)">${icon('minus', 16)}</button>
            <input id="chG" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${goal}" aria-label="Goal — titles to watch" oninput="MSSChallenges._f('goal', this.value)">
            <button type="button" class="ch-step-btn" aria-label="One more" onclick="MSSChallenges._f('step', 1)">${icon('plus', 16)}</button>
          </div>
          ${seg('goal', [5, 10, 25, 50, 100].map(n => [n, n]), goal)}
        </div>`;
  const kindHTML = (cat, genre) => `<div class="sf-section-label">${form.mode === 'official' ? 'Type' : 'What counts'}</div>
        ${seg('cat', [['', 'Anything', 'sparkles'], ['movies', 'Movies', 'film'], ['tv', 'TV Shows', 'tv'], ['anime', 'Anime', 'animeFace'], ['cartoons', 'Cartoons', 'brush']], cat).replace('ch-seg"', 'ch-seg ch-cats"')}
        <div class="sf-section-label">Genre <span class="sf-section-hint">optional</span></div>
        ${SF.dd('chGenreDD', genre || 'Any genre', !!genre, ['', ...GENRES].map(g => `<button type="button" class="td-dd-opt${g === genre ? ' active' : ''}" data-genre="${esc(g)}" onclick="MSSChallenges._f('genre', ${attrJSON(g)})">${g || 'Any genre'}</button>`).join(''))}`;
  const datesHTML = (start, end) => `<div class="sf-section-label">Dates</div>
        ${MSSDateRange.html('chD', { start, end, min: iso(new Date()), onChange: () => f('dates') })}
        ${seg('span', [[7, '1 week'], [30, '1 month'], [91, '3 months'], ['year', 'This year']], daysBetween(start, end)).replace('ch-seg"', 'ch-seg ch-spans"')}`;
  function create() {
    const today = new Date(), end = new Date(); end.setDate(end.getDate() + 30);
    form = { mode: 'new', picked: new Set(), goal: 10, cat: '', genre: '' };
    const chips = friendChips(new Set());
    popup('New Challenge', `
        <label class="sf-section-label" for="chT">Name it</label>
        <input id="chT" class="pf-input ch-in" maxlength="80" placeholder="Spooky October" autocomplete="off">
        ${goalHTML(10)}
        ${kindHTML('', '')}
        ${datesHTML(iso(today), iso(end))}
        <div class="soc-tip"><span class="soc-tip-ic">${icon('check', 15)}</span>
          <div><b>Counts automatically</b><span>Anything you mark Watched between these dates counts toward the goal.</span></div></div>
        ${chips ? inviteHead('Invite friends', 'up to 99') + `<div class="mn-invite" role="group" aria-label="Invite friends">${chips}</div>` : ''}`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()">Start Challenge</button>`);
  }
  /* ── The official account: make / edit an official challenge ── */
  function official(id) {
    const c = id ? off.list.find(x => x.id === id) : null;
    const today = new Date(), end = new Date(); end.setDate(end.getDate() + 14);
    form = { mode: 'official', id: c?.id || null, medal: c?.medal || MSSMedal.OFFICIAL[0].key, cmode: c ? c.count_mode : 'list',
      titles: (c?.titles || []).map(t => ({ ...t })), goal: c && c.count_mode === 'auto' ? c.goal : 10, cat: c?.cat || '', genre: c?.genre || '', spot: c?.spotlight || '' };
    popup(c ? 'Edit Official Challenge' : 'New Official Challenge', `
        <label class="sf-section-label" for="chT">Name it</label>
        <input id="chT" class="pf-input ch-in" maxlength="80" placeholder="Halloween 2026" autocomplete="off" value="${esc(c?.title || '')}">
        <label class="sf-section-label" for="chDesc">Description <span class="sf-section-hint">shown on the card and the spotlight</span></label>
        <textarea id="chDesc" class="pf-input chf-ta" maxlength="400" rows="3" placeholder="Watch the classics before Halloween night…">${esc(c?.description || '')}</textarea>
        <div class="sf-section-label">Medal <span class="sf-section-hint">everyone who finishes gets it</span></div>
        <div class="chf-medals" role="group" aria-label="Medal">${MSSMedal.OFFICIAL.map(m => `<button type="button" class="chf-medal-opt${m.key === form.medal ? ' active' : ''}" data-medal="${m.key}" aria-pressed="${m.key === form.medal}" onclick="MSSChallenges._f('medal', '${m.key}')">
            ${MSSMedal.official(m.key, { size: 76 })}<span>${esc(m.name)}</span></button>`).join('')}</div>
        <div class="sf-section-label">What counts</div>
        ${seg('cmode', [['list', 'Set list', 'list'], ['auto', 'Anything that fits', 'sparkles']], form.cmode)}
        <div id="chfListBox"${form.cmode === 'list' ? '' : ' hidden'}>
          <div class="mn-search chf-search"><input id="chfQ" type="search" placeholder="Search a movie or show to add…" aria-label="Search a movie or show to add" autocomplete="off" enterkeyhint="search" oninput="MSSChallenges._q(this.value)">
            <div class="mn-hits" id="chfHits"></div></div>
          <div id="chfChosen"></div>
        </div>
        <div id="chfAutoBox"${form.cmode === 'auto' ? '' : ' hidden'}>${goalHTML(form.goal)}${kindHTML(form.cat, form.genre)}</div>
        ${datesHTML(c?.starts_on || iso(today), c?.ends_on || iso(end))}
        <div class="sf-section-label">Spotlight <span class="sf-section-hint">the popup — from js/spotlights.js</span></div>
        ${seg('spot', [['', 'None'], ...MSSSpotlights.map(e => [e.key, esc(e.name)])], form.spot).replace('ch-seg"', 'ch-seg chf-spots"')}
        <div class="soc-tip"><span class="soc-tip-ic">${icon('crown', 15)}</span>
          <div><b>Open to everyone</b><span>It shows in Featured 7 days before it starts. Until then only you can see it.</span></div></div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()">${c ? 'Save' : 'Create Challenge'}</button>`);
    drawChosen();
  }
  function drawChosen() {
    const box = document.getElementById('chfChosen'); if (!box || !form) return;
    const t = form.titles;
    box.innerHTML = t.length ? `<div class="chf-chosen-head"><b>${t.length}</b> ${t.length === 1 ? 'title' : 'titles'} · watch them all to finish</div>
        <ol class="chf-chosen">${t.map((x, i) => `<li><span class="poll-thumb">${x.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(x.poster_path)}" alt="" loading="lazy">` : icon(x.tmdb_type === 'movie' ? 'film' : 'tv', 14)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(x.title)}</b><small>${[x.year, x.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span>
          <button type="button" class="rec-icon" onclick="MSSChallenges._rm(${i})" aria-label="Remove ${esc(x.title)}" title="Remove">${icon('x', 13)}</button></li>`).join('')}</ol>`
      : `<div class="chf-chosen-empty">No titles yet — search above and add the ones that count.</div>`;
  }
  let qTimer = null, hits = [];
  function search(q) {
    clearTimeout(qTimer);
    const box = document.getElementById('chfHits'); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    qTimer = setTimeout(async () => {
      box.innerHTML = `<div class="pf-r-msg">Searching…</div>`;
      const res = await _tmdbSearch(q.trim(), 8);
      hits = res.filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(r => ({ tmdb_id: r.id, tmdb_type: r.media_type, title: r.title || r.name,
        poster_path: r.poster_path || null, year: (r.release_date || r.first_air_date || '').slice(0, 4) || null }));
      const b2 = document.getElementById('chfHits'); if (!b2) return;
      b2.innerHTML = hits.length ? hits.map((h, k) => {
        const have = form?.titles.some(t => t.tmdb_id === h.tmdb_id && t.tmdb_type === h.tmdb_type);
        return `<button type="button" class="pf-r" onclick="MSSChallenges._pick(${k})"${have ? ' disabled' : ''}>
          <span class="poll-thumb">${h.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(h.poster_path)}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}${have ? ' · added' : ''}</small></span></button>`; }).join('')
        : `<div class="pf-r-msg">Nothing found — try another spelling.</div>`;
    }, 280);
  }
  function pick(k) {
    const h = hits[k]; if (!h || !form) return;
    if (!form.titles.some(t => t.tmdb_id === h.tmdb_id && t.tmdb_type === h.tmdb_type)) form.titles.push(h);
    const q = document.getElementById('chfQ'); if (q) { q.value = ''; q.focus(); }
    document.getElementById('chfHits').innerHTML = '';
    drawChosen();
  }
  function invite(id) {
    const c = list.find(x => x.id === id); if (!c) return;
    const have = new Set(c.members.map(m => m.id));
    const chips = friendChips(have);
    form = { mode: 'invite', id, picked: new Set() };
    popup('Invite Friends', chips ? inviteHead(esc(c.title), `${100 - c.members.length} spots left`) + `<div class="mn-invite" role="group" aria-label="Invite friends">${chips}</div>`
      : `<div class="soc-tip"><span class="soc-tip-ic">${icon('users', 15)}</span><div><b>Everyone’s in</b><span>All your friends are already in this challenge.</span></div></div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Close</button>
        ${chips ? `<button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()" disabled>Invite</button>` : ''}`);
  }
  function f(what, v) {
    if (!form) return;
    const g = document.getElementById('chG');
    if (what === 'step') { v = Math.min(500, Math.max(1, (Number(g.value) || 0) + v)); g.value = v; what = 'goal'; }
    if (what === 'goal') {
      if (g && g.value !== String(v)) g.value = v;
      const n = Number(String(v).replace(/\D/g, '')) || 0;
      if (g && /\D/.test(g.value)) g.value = n || '';
      form.goal = n; press('goal', n);
    }
    if (what === 'cat') { form.cat = v; press('cat', v); }
    if (what === 'medal') { form.medal = v; press('medal', v); document.querySelectorAll('#chFormBody .chf-medal-opt').forEach(b => b.classList.toggle('active', b.dataset.medal === v)); }
    if (what === 'spot') { form.spot = v; press('spot', v); }
    if (what === 'cmode') {
      form.cmode = v; press('cmode', v);
      document.getElementById('chfListBox').hidden = v !== 'list';
      document.getElementById('chfAutoBox').hidden = v !== 'auto';
    }
    if (what === 'genre') {
      form.genre = v;
      document.querySelectorAll('#chGenreDD .td-dd-opt').forEach(o => o.classList.toggle('active', o.dataset.genre === v));
      const t = document.querySelector('#chGenreDD .sf-dd-trigger');
      t.classList.toggle('active', !!v); t.querySelector('.td-dd-label').textContent = v || 'Any genre';
      SF.closeDD();
    }
    if (what === 'span') {
      const s = MSSDateRange.get('chD').start, e = day(s);
      if (v === 'year') { e.setMonth(11, 31); } else e.setDate(e.getDate() + Number(v));
      MSSDateRange.set('chD', s, iso(e));
      press('span', v);
    }
    if (what === 'dates') press('span', null);
    if (what === 'all') {
      const off = [...document.querySelectorAll('#chFormBody .mn-inv[aria-pressed="false"]')];
      (off.length ? off : [...document.querySelectorAll('#chFormBody .mn-inv')]).forEach(inv);
    }
  }
  function inv(b) {
    const id = b.dataset.id, on = !form.picked.has(id);
    on ? form.picked.add(id) : form.picked.delete(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    const all = document.getElementById('chAll');
    if (all) all.textContent = document.querySelector('#chFormBody .mn-inv[aria-pressed="false"]') ? 'Select all' : 'Clear';
    if (form.mode === 'invite') document.getElementById('chSave').disabled = !form.picked.size;
  }
  async function save() {
    if (!form) return;
    const btn = document.getElementById('chSave'); btn.disabled = true;
    try {
      if (form.mode === 'official') {
        const list = form.cmode === 'list';
        if (list && !form.titles.length) { btn.disabled = false; showToast('Add at least one title to the set list.', 'err'); return; }
        const d = MSSDateRange.get('chD');
        const id = await rpc('update_official_challenge', { p_ch: form.id, p_title: document.getElementById('chT').value.trim(),
          p_description: document.getElementById('chDesc').value.trim(), p_goal: list ? null : Number(document.getElementById('chG').value),
          p_cat: list ? null : form.cat || null, p_genre: list ? null : form.genre || null, p_starts: d.start, p_ends: d.end,
          p_medal: form.medal, p_spotlight: form.spot || null, p_titles: list ? form.titles : [] });
        const edited = !!form.id;
        closeForm(); focus = id; await load();
        showToast(edited ? 'Saved' : 'Official challenge made — it shows in Featured 7 days before it starts');
      } else if (form.mode === 'new') {
        const invited = form.picked.size;
        const id = await rpc('create_challenge', { p_title: document.getElementById('chT').value.trim(), p_goal: Number(document.getElementById('chG').value),
          p_cat: form.cat || null, p_genre: form.genre || null, p_starts: MSSDateRange.get('chD').start, p_ends: MSSDateRange.get('chD').end, p_friends: [...form.picked] });
        closeForm(); focus = id; await load();
        showToast(invited ? 'Challenge started — your friends got an invite' : 'Challenge started');
      } else {
        const n = await rpc('invite_to_challenge', { p_ch: form.id, p_friends: [...form.picked] });
        closeForm(); await load();
        showToast(`Invited ${n} ${n === 1 ? 'friend' : 'friends'}`);
      }
    } catch (err) { btn.disabled = false; showToast(errText(err, 'Couldn’t save — try again.'), 'err'); }
  }

  return { mount, create, official, invite, respond, remove, reload: load,
    _all: id => { showAll[id] = true; draw(); }, _f: f, _inv: inv, _save: save, _close: closeForm,
    _joinOfficial: joinOfficial, _preview: id => { const c = off.list.find(x => x.id === id); if (c) MSSSpotlight.preview(c); },
    _q: search, _pick: pick, _rm: i => { form?.titles.splice(i, 1); drawChosen(); } };
})();
