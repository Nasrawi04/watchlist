/* ═══════════════════════════════════════════════════════════════
   challenges.js — Social → Challenges (051_challenges.sql)
   "Watch 10 horror movies in October" between friends — up to 100 people.
     • a goal (1–500 titles), optional type + genre, start / end dates
     • progress is automatic: titles marked Watched with a date inside the
       challenge that fit its type / genre
     • a live leaderboard; finishers get the trophy badge in the order they got there
     • anyone who has joined can invite their own friends

   MSSChallenges.mount(el, user, { ch })   the section (ch: scroll to that one)

   Uses friends.html's _frAccepted for the invite lists, the shared Social
   popup (_socDialog, social.js) and the Polls / Inbox button styles.
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
  let el = null, user = null, list = [], focus = null;
  const showAll = {};

  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (o.ch) focus = o.ch;
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Challenges</div></div>
      ${user ? `<button type="button" class="btn-add-entry" onclick="MSSChallenges.create()">${icon('plus', 15)} New Challenge</button>` : ''}</div>`;
    if (!user) {
      el.innerHTML = head + `<div class="fr-empty"><div class="fr-empty-ic">${icon('trophy', 26)}</div><div class="fr-empty-title">Challenges with friends</div><div class="fr-empty-text">Sign in to race your friends to a watching goal.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div id="chList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    await load();
  }
  async function load() {
    try { list = await rpc('get_challenges', {}) || []; } catch { list = []; showToast('Couldn’t load challenges — try again.', 'err'); }
    draw();
    if (focus) { requestAnimationFrame(() => document.getElementById('ch-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); focus = null; }
  }
  function draw() {
    const box = document.getElementById('chList'); if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="fr-empty"><div class="fr-empty-ic">${icon('trophy', 26)}</div><div class="fr-empty-title">No challenges yet</div>
        <div class="fr-empty-text">Set a goal — “10 horror movies in October”, “50 movies this year” — invite friends, and race to the finish.</div>
        <button type="button" class="btn-add-entry" style="margin:14px auto 0" onclick="MSSChallenges.create()">${icon('plus', 15)} New Challenge</button></div>`;
      return;
    }
    box.innerHTML = `<div class="ch-list">${list.map(card).join('')}</div>`;
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
          <div class="ch-mine-n"><b>${c.my_progress || 0}</b><span>/ ${c.goal}</span></div>
          <div class="ch-mine-main">
            <div class="ch-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${c.my_progress || 0}" aria-label="Your progress"><i style="width:${pct}%"></i></div>
            <div class="ch-mine-text">${me?.finished_at ? `${icon('trophy', 13)} You finished — <b>#${me.finish_rank}</b> to get there` : c.state === 'upcoming' ? 'Starts soon — anything you watch from the start date counts.' : c.state === 'ended' ? `It’s over — you got ${c.my_progress || 0} of ${c.goal}.` : `${c.goal - (c.my_progress || 0)} to go · ${pct}%`}</div>
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
  function create() {
    const today = new Date(), end = new Date(); end.setDate(end.getDate() + 30);
    form = { mode: 'new', picked: new Set(), goal: 10, cat: '', genre: '' };
    popup('New Challenge', `
        <label class="sf-section-label" for="chT">Name it</label>
        <input id="chT" class="pf-input" maxlength="80" placeholder="Spooky October">
        <div class="sf-section-label">Goal <span class="sf-section-hint">(titles to watch)</span></div>
        <div class="ch-goal"><input id="chG" class="pf-input" type="number" min="1" max="500" value="10" aria-label="Goal" oninput="MSSChallenges._f('goal', this.value)">
          <div class="pf-chips">${[5, 10, 25, 50, 100].map(n => `<button type="button" class="pf-chip${n === 10 ? ' active' : ''}" data-goal="${n}" onclick="MSSChallenges._f('goalChip', ${n})">${n}</button>`).join('')}</div></div>
        <div class="sf-section-label">What counts</div>
        <div class="pf-chips" id="chCats">${CATS.map(([k, l]) => `<button type="button" class="pf-chip${k === '' ? ' active' : ''}" data-cat="${k}" onclick="MSSChallenges._f('cat', '${k}')">${l}</button>`).join('')}</div>
        <label class="sf-section-label" for="chGenre">Genre <span class="sf-section-hint">(optional)</span></label>
        <select id="chGenre" class="pf-input" onchange="MSSChallenges._f('genre', this.value)"><option value="">Any genre</option>${GENRES.map(g => `<option>${g}</option>`).join('')}</select>
        <div class="sf-section-label">Dates</div>
        <div class="ch-dates"><label><span>From</span><input id="chS" class="pf-input" type="date" value="${iso(today)}"></label>
          <label><span>To</span><input id="chE" class="pf-input" type="date" value="${iso(end)}" min="${iso(today)}"></label></div>
        <div class="pf-chips">${[['1 week', 7], ['1 month', 30], ['3 months', 91], ['Rest of the year', 'year']].map(([l, d]) => `<button type="button" class="pf-chip" onclick="MSSChallenges._f('span', '${d}')">${l}</button>`).join('')}</div>
        <div class="sf-section-label">Invite friends <span class="sf-section-hint">(up to 99 — they can invite theirs too)</span></div>
        <div class="mn-invite"><button type="button" class="poll-link" onclick="MSSChallenges._f('all')">Select all</button>${friendChips(new Set())}</div>
        <div class="pf-note">${icon('check', 13)} Titles you mark Watched with a date inside the challenge count automatically.</div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()">Start Challenge</button>`);
  }
  function invite(id) {
    const c = list.find(x => x.id === id); if (!c) return;
    const have = new Set(c.members.map(m => m.id));
    const chips = friendChips(have);
    form = { mode: 'invite', id, picked: new Set() };
    popup('Invite Friends', chips ? `<div class="sf-section-label">${esc(c.title)} <span class="sf-section-hint">(${100 - c.members.length} spots left)</span></div>
        <div class="mn-invite"><button type="button" class="poll-link" onclick="MSSChallenges._f('all')">Select all</button>${chips}</div>`
      : `<div class="pf-note">${icon('users', 13)} All your friends are already in this challenge.</div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Close</button>
        ${chips ? `<button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()" disabled>Invite</button>` : ''}`);
  }
  function f(what, v) {
    if (!form) return;
    if (what === 'goal') { form.goal = Number(v); document.querySelectorAll('[data-goal]').forEach(b => b.classList.toggle('active', Number(b.dataset.goal) === form.goal)); }
    if (what === 'goalChip') { form.goal = v; document.getElementById('chG').value = v; f('goal', v); }
    if (what === 'cat') { form.cat = v; document.querySelectorAll('#chCats .pf-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === v)); }
    if (what === 'genre') form.genre = v;
    if (what === 'span') {
      const s = document.getElementById('chS').value || iso(new Date()), e = day(s);
      if (v === 'year') { e.setMonth(11, 31); } else e.setDate(e.getDate() + Number(v));
      document.getElementById('chE').value = iso(e);
    }
    if (what === 'all') document.querySelectorAll('#chFormBody .mn-inv[aria-pressed="false"]').forEach(inv);
  }
  function inv(b) {
    const id = b.dataset.id, on = !form.picked.has(id);
    on ? form.picked.add(id) : form.picked.delete(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    if (form.mode === 'invite') document.getElementById('chSave').disabled = !form.picked.size;
  }
  async function save() {
    if (!form) return;
    const btn = document.getElementById('chSave'); btn.disabled = true;
    try {
      if (form.mode === 'new') {
        const invited = form.picked.size;
        const id = await rpc('create_challenge', { p_title: document.getElementById('chT').value.trim(), p_goal: Number(document.getElementById('chG').value),
          p_cat: form.cat || null, p_genre: form.genre || null, p_starts: document.getElementById('chS').value, p_ends: document.getElementById('chE').value, p_friends: [...form.picked] });
        closeForm(); focus = id; await load();
        showToast(invited ? 'Challenge started — your friends got an invite' : 'Challenge started');
      } else {
        const n = await rpc('invite_to_challenge', { p_ch: form.id, p_friends: [...form.picked] });
        closeForm(); await load();
        showToast(`Invited ${n} ${n === 1 ? 'friend' : 'friends'}`);
      }
    } catch (err) { btn.disabled = false; showToast(errText(err, 'Couldn’t save — try again.'), 'err'); }
  }

  return { mount, create, invite, respond, remove,
    _all: id => { showAll[id] = true; draw(); }, _f: f, _inv: inv, _save: save, _close: closeForm };
})();
