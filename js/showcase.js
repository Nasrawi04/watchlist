/* ═══════════════════════════════════════════════════════════════
   showcase.js — the Showcase tab on profiles (062 + 063_showcase_shelves.sql)
   A cabinet of 3 shelves × 3 medals someone picked to show off — achievements,
   official and challenge medals. It follows the site's light / dark look by
   default; the owner can pick a shelf style (SCHEMES) and a background picture
   from any title (slightly blurred). Edit: tap a spot, tap a medal; Save.

   MSSShowcase.mount(el, userId, { own })   profile.html (own) · profile-view.html

   Requires config.js (icon, escHTML, MSSDialog, showToast), nav.js
   (tmdbFetch, TMDB_*, _tmdbSearch), medals.js. Styles: §58.
═══════════════════════════════════════════════════════════════ */
const MSSShowcase = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const SLOTS = 9, IMG = 'https://image.tmdb.org/t/p/';
  // Shelf styles — colours live in CSS (.sc-s-<key>, §58); 'default' follows light / dark
  const SCHEMES = [['default', 'Site'], ['walnut', 'Walnut'], ['oak', 'Oak'], ['marble', 'Marble'], ['midnight', 'Midnight'], ['emerald', 'Emerald'], ['crimson', 'Crimson']];
  let S = null;        // { el, uid, own, slots: [badge|null ×9], bg, scheme, all }
  let E = null;        // editor: { slots, bg, scheme, sel, view: 'medals' | 'bg', hits, imgs }

  const medal = (b, size) => b.kind === 'member' ? MSSMedal.member({ size: Math.round(size * .85) })
    : b.kind === 'achievement' ? MSSMedal.achievement(b.ach_key, b.ach_level, { size, at: b.at })
    : b.kind === 'official' ? MSSMedal.official(b.medal, { size, team: b.team_color ? { color: b.team_color } : null })
    : MSSMedal.challenge(b.place, b.cat, { size: Math.round(size * .8) });
  const name = b => b.kind === 'achievement' ? (MSSMedal.ACH[b.ach_key]?.name || b.title) : b.title;
  const sub = b => b.kind === 'member' ? MSSMedal.memberFor(b.earned_at)          // how long they've been here (075)
    : b.kind === 'achievement' ? `${MSSMedal.LEVEL[b.ach_level - 1]} · ${Number(b.at || 0).toLocaleString(MSSI18n.locale)}`
    : b.kind === 'official' ? (b.team_name || 'Official') : b.place === 1 ? 'Gold · 1st' : b.place === 2 ? 'Silver · 2nd' : 'Bronze';
  const cabinet = () => S.own ? 'cabinet.html' : `cabinet.html?user=${encodeURIComponent(S.uid)}`;

  async function mount(el, uid, o = {}) {
    if (!el || !uid) return;
    if (S && S.el === el && S.uid === uid && S.loaded) return;      // tab opened again — already drawn
    S = { el, uid, own: !!o.own, name: o.name || '', slots: Array(SLOTS).fill(null), bg: null, scheme: 'default', all: [], loaded: false };
    try {
      const d = await rpc('get_showcase', { p_user: uid, p_all: S.own });
      S.slots = Array.from({ length: SLOTS }, (_, i) => d?.slots?.[i] || null);
      S.bg = d?.bg || null; S.all = Array.isArray(d?.all) ? d.all : [];
      S.scheme = SCHEMES.some(x => x[0] === d?.scheme) ? d.scheme : 'default';
    } catch { /* no showcase yet — an empty shelf */ }
    S.loaded = true;
    draw();
  }

  // The cabinet: three shelves of three. Each medal stands on its shelf, its name
  // printed underneath; the back panel can be a picture, slightly blurred.
  function slotHTML(b, i) {
    if (b) return `<a class="sc-slot" href="${cabinet()}" aria-label="${esc(name(b))} — ${esc(sub(b))}"><span class="sc-medal">${medal(b, 88)}</span></a>`;
    return S.own ? `<button type="button" class="sc-slot sc-empty" onclick="MSSShowcase.edit(${i})" aria-label="Empty spot ${i + 1} — add a medal"><span class="sc-medal"><span class="sc-plus">${icon('plus', 18)}</span></span></button>`
      : `<span class="sc-slot sc-empty" aria-hidden="true"><span class="sc-medal"></span></span>`;
  }
  const labelHTML = b => `<span class="sc-label">${b ? `<b translate="no">${esc(name(b))}</b><small>${esc(sub(b))}</small>` : ''}</span>`;
  function draw() {
    const filled = S.slots.filter(Boolean).length;
    const shelf = row => { const k3 = [0, 1, 2].map(k => row * 3 + k);
      return `<div class="sc-shelf">
        <div class="sc-row">${k3.map(i => slotHTML(S.slots[i], i)).join('')}</div>
        <div class="sc-ledge" aria-hidden="true"></div>
        <div class="sc-row sc-labels" aria-hidden="true">${k3.map(i => labelHTML(S.slots[i])).join('')}</div>
      </div>`; };
    S.el.innerHTML = `<section class="sc" aria-label="Showcase">
      <div class="sc-head">
        <div><h2 class="sc-title">${S.own ? 'Your showcase' : `<span translate="no">${esc(S.name)}</span>’s showcase`}</h2>
          <div class="sc-sub">${filled} of ${SLOTS} ${S.own && !filled ? '— put the medals you’re proudest of on show' : 'on show'}</div></div>
        <div class="sc-acts">
          ${S.own ? `<button type="button" class="sc-btn primary" onclick="MSSShowcase.edit()">${icon('edit', 14)} Edit</button>` : ''}
          <a class="sc-btn" href="${cabinet()}">${icon('trophy', 14)} All medals</a>
        </div>
      </div>
      <div class="sc-cab sc-s-${S.scheme}${S.bg ? ' has-bg' : ''}">
        ${S.bg ? `<div class="sc-bg" style="background-image:url('${IMG}w780${esc(S.bg)}')" aria-hidden="true"></div>` : ''}
        ${shelf(0)}${shelf(1)}${shelf(2)}
        ${!S.own && !filled ? `<div class="sc-none-msg">No medals on show yet.</div>` : ''}
      </div>
    </section>`;
  }

  /* ── Editor ── */
  function edit(slot) {
    E = { slots: S.slots.map(b => b?.id || null), bg: S.bg, scheme: S.scheme, sel: Number.isInteger(slot) ? slot : S.slots.findIndex(b => !b), view: 'medals', hits: [], imgs: [] };
    if (E.sel < 0) E.sel = 0;
    let ov = document.getElementById('scEdit');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'scEdit'; ov.className = 'soc-overlay';
      ov.innerHTML = `<div class="soc-card sc-edit" role="dialog" aria-modal="true" aria-labelledby="scEditTitle">
          <div class="sf-header"><div class="sf-title" id="scEditTitle">Edit Showcase</div><button type="button" class="sf-close" onclick="MSSShowcase._close()" aria-label="Close">${icon('x', 18)}</button></div>
          <div class="sf-body" id="scEditBody"></div>
          <div class="sf-footer"><button type="button" class="sf-clear-btn" onclick="MSSShowcase._close()">Cancel</button>
            <button type="button" class="sf-apply-btn" id="scSave" onclick="MSSShowcase._save()">Save</button></div></div>`;
      MSSDialog.bind(ov, close);
      document.body.appendChild(ov);
    }
    document.getElementById('scSave').disabled = false;   // the dialog is reused — a finished save left it switched off
    drawEdit();
    MSSDialog.open(ov, { focus: '#scSave' });
  }
  const byId = id => S.all.find(b => b.id === id);
  function drawEdit() {
    const body = document.getElementById('scEditBody'); if (!body || !E) return;
    // the editor's shelves are a live preview: the chosen style and picture show here as you pick them
    const slots = `<div class="sf-section-label">Your shelves <span class="sf-section-hint">tap a spot, then a medal · style and picture preview here</span></div>
      <div class="sc-cab sc-edit-cab sc-s-${E.scheme}${E.bg ? ' has-bg' : ''}">${E.bg ? `<div class="sc-bg" style="background-image:url('${IMG}w780${esc(E.bg)}')" aria-hidden="true"></div>` : ''}
      <div class="sc-edit-shelf" role="group" aria-label="Showcase slots">${E.slots.map((id, i) => { const b = id && byId(id);
        return `<div class="sc-edit-slot${i === E.sel ? ' sel' : ''}">
          <button type="button" class="sc-edit-pick" onclick="MSSShowcase._sel(${i})" aria-pressed="${i === E.sel}" aria-label="Slot ${i + 1}${b ? ': ' + esc(name(b)) : ', empty'}">${b ? medal(b, 52) : `<span class="sc-plus">${icon('plus', 16)}</span>`}</button>
          ${b ? `<button type="button" class="sc-edit-x" onclick="MSSShowcase._clear(${i})" aria-label="Take ${esc(name(b))} off">${icon('x', 11)}</button>` : ''}</div>`; }).join('')}</div></div>`;
    const medals = S.all.length ? `<div class="sc-edit-grid">${S.all.map(b => { const at = E.slots.indexOf(b.id);
        return `<button type="button" class="sc-edit-medal${at >= 0 ? ' on' : ''}" onclick="MSSShowcase._put(${attrJSON(b.id)})" aria-pressed="${at >= 0}" title="${esc(name(b))} — ${esc(sub(b))}">
          ${medal(b, 58)}<span translate="no">${esc(name(b))}</span><small>${esc(sub(b))}</small>${at >= 0 ? `<i class="sc-edit-n">${at + 1}</i>` : ''}</button>`; }).join('')}</div>`
      : `<div class="cab-empty sc-none">No medals yet — finish a challenge or reach an achievement level and they’ll show up here.</div>`;
    const style = `<div class="sf-section-label">Shelf style</div>
      <div class="sc-edit-schemes" role="radiogroup" aria-label="Shelf style">${SCHEMES.map(([k, l]) =>
        `<button type="button" role="radio" class="sc-swatch${E.scheme === k ? ' on' : ''}" aria-checked="${E.scheme === k}" onclick="MSSShowcase._scheme('${k}')">
          <span class="sc-swatch-chip sc-s-${k}" aria-hidden="true"><i></i><i></i></span><span>${l}</span></button>`).join('')}</div>`;
    const bg = `<div class="sf-section-label">Background <span class="sf-section-hint">optional — a picture from any title, slightly blurred</span></div>
      <div class="sc-edit-bg">
        <span class="sc-edit-bg-prev"${E.bg ? ` style="background-image:url('${IMG}w300${esc(E.bg)}')"` : ''}>${E.bg ? '' : icon('image', 18)}</span>
        <button type="button" class="rec-btn" onclick="MSSShowcase._bgView()">${icon('search', 14)} ${E.bg ? 'Change' : 'Choose a title'}</button>
        ${E.bg ? `<button type="button" class="poll-link poll-danger" onclick="MSSShowcase._bg(null)">Remove</button>` : ''}
      </div>`;
    body.innerHTML = E.view === 'bg' ? bgPicker() : slots + `<div class="sf-section-label">Your medals <span class="sf-section-hint">${S.all.length}</span></div>` + medals + style + bg;
    if (E.view === 'bg') setTimeout(() => document.getElementById('scBgQ')?.focus(), 30);
  }
  function bgPicker() {
    return `<button type="button" class="poll-link sc-back" onclick="MSSShowcase._bgBack()">${icon('back', 14)} Back to medals</button>
      <div class="search-wrap fav-picker-search"><span class="search-icon-wrap">${icon('search', 14)}</span>
        <input type="search" id="scBgQ" placeholder="Search a movie or show…" aria-label="Search a movie or show" autocomplete="off" enterkeyhint="search" oninput="MSSShowcase._q(this.value)"></div>
      <div id="scBgHits" class="sc-bg-hits">${hitsHTML()}</div>`;
  }
  const hitsHTML = () => E.imgs.length
    ? `<div class="sf-section-label">Pick a background <span class="sf-section-hint">scenes and posters</span></div><div class="sc-bg-imgs">${E.imgs.map(p => `<button type="button" class="sc-bg-img" onclick="MSSShowcase._bg(${attrJSON(p)})" style="background-image:url('${IMG}w300${esc(p)}')" aria-label="Use this picture"></button>`).join('')}</div>`
    : E.hits.map((h, i) => `<button type="button" class="pf-r" onclick="MSSShowcase._title(${i})">
        <span class="poll-thumb">${h.poster_path ? `<img src="${IMG}w92${esc(h.poster_path)}" alt="" loading="lazy">` : icon('film', 16)}</span>
        <span class="poll-opt-text"><b translate="no">${esc(h.title || h.name)}</b><small>${esc(((h.release_date || h.first_air_date || '').slice(0, 4)) + (h.media_type === 'movie' ? ' · Movie' : ' · TV Show'))}</small></span></button>`).join('');
  let qT = null;
  function search(q) {
    clearTimeout(qT);
    qT = setTimeout(async () => {
      if (!E) return;
      E.imgs = []; E.hits = q.trim().length < 2 ? [] : (await _tmdbSearch(q.trim(), 8)).filter(h => h.backdrop_path || h.poster_path);
      const box = document.getElementById('scBgHits'); if (box) box.innerHTML = hitsHTML();
    }, 280);
  }
  async function pickTitle(i) {
    const h = E?.hits[i]; if (!h) return;
    const box = document.getElementById('scBgHits'); if (box) box.innerHTML = `<div class="page-loading" style="padding:1.5rem"><div class="spinner"></div></div>`;
    let imgs = [];
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/${h.media_type}/${h.id}/images?include_image_language=en,null`);
      if (res.ok) { const j = await res.json(); imgs = [...(j.backdrops || []).slice(0, 12), ...(j.posters || []).slice(0, 6)].map(x => x.file_path); }
    } catch {}
    E.imgs = [...new Set([h.backdrop_path, ...imgs, h.poster_path].filter(Boolean))].slice(0, 20);
    if (box) box.innerHTML = hitsHTML();
  }
  function put(id) {
    const at = E.slots.indexOf(id);
    if (at >= 0) { E.slots[at] = null; E.sel = at; }
    else { E.slots[E.sel] = id; const next = E.slots.findIndex(x => !x); if (next >= 0) E.sel = next; }
    drawEdit();
  }
  function close() { E = null; MSSDialog.close(document.getElementById('scEdit')); }
  async function save() {
    if (!E) return;
    const btn = document.getElementById('scSave'); btn.disabled = true;
    try {
      await rpc('set_showcase', { p_slots: E.slots, p_bg: E.bg, p_scheme: E.scheme });
      // read it back, so what's shown is what was really saved
      const d = await rpc('get_showcase', { p_user: S.uid, p_all: true });
      S.slots = Array.from({ length: SLOTS }, (_, i) => d?.slots?.[i] || null);
      S.bg = d?.bg || null; S.all = Array.isArray(d?.all) ? d.all : S.all;
      S.scheme = SCHEMES.some(x => x[0] === d?.scheme) ? d.scheme : 'default';
      close(); draw();
      showToast(d && d.scheme === undefined ? 'Saved — but the shelf style needs the 063 database update to stick' : 'Showcase saved', d && d.scheme === undefined ? 'err' : 'ok');
    } catch (err) {
      btn.disabled = false;
      const missing = err?.code === 'PGRST202' || /function .*set_showcase/i.test(err?.message || '');
      showToast(missing ? 'Couldn’t save — the showcase database update (063) hasn’t been run yet.' : err?.hint || err?.message || 'Couldn’t save — try again.', 'err');
    }
  }

  return { mount, edit, _close: close, _save: save, _put: put,
    _sel: i => { E.sel = i; drawEdit(); }, _clear: i => { E.slots[i] = null; E.sel = i; drawEdit(); },
    _bgView: () => { E.view = 'bg'; E.hits = []; E.imgs = []; drawEdit(); }, _bgBack: () => { E.view = 'medals'; drawEdit(); },
    _bg: p => { E.bg = p; E.view = 'medals'; drawEdit(); }, _q: search, _title: pickTitle,
    _scheme: k => { E.scheme = k; drawEdit(); } };
})();
