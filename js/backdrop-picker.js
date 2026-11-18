/* ═══════════════════════════════════════════════════════════════
   backdrop-picker.js — the backdrop picker (MSSBackdropPicker): search any movie or show, pick one of
   its backdrops (the Details Page's grid, backdrop-tools.js), optionally Adjust framing, Save.
   One picker for the whole site: your profile's backdrop (profile-v2.js), the Showcase picture
   (showcase-studio.js — opened on top of the Studio; the picture goes to the showcase, not the profile)
   and, in poster mode, your profile photo (MSSBackdropPicker.photo — Settings › My Profile, Edit profile).

   MSSBackdropPicker.open({
     kind ('backdrop' | 'poster'),                       which of the title's pictures (default backdrop)
     title, subtitle,
     current: { type, id, title, path, pos } | null,   what's chosen now
     saveLabel ('Save backdrop'), resetLabel (shown when there's a current one; omit → no reset button),
     emptyText                                           shown while nothing's chosen
     preview(box, sel)                                   draw the preview into box; sel = { type, id, title, path, pos } | null
     framing: { targets(sel), live(all) } | null         Adjust framing (MSSBdTools.frame targets); null → no framing
     onSave(sel) → Promise (throw to stay open), onReset() → Promise, onClose()
   })
   MSSBackdropPicker.photo({ onSaved(url) }) — a title's poster as your profile photo (it's 2:3, like the photo)
   MSSBackdropPicker.usePoster(path) → url — save a TMDB poster path as your photo (Set up your folio's quick picks)
   Requires config.js, db.js (updateProfile), nav.js (_tmdbSearch); loads js/panel.js, js/backdrop-tools.js and
   css/profile.css (its "backdrop editor" styles, .pf-bn-*) on pages that don't have it.
═══════════════════════════════════════════════════════════════ */
const MSSBackdropPicker = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const IMG = 'https://image.tmdb.org/t/p/';
  const phone = () => matchMedia('(max-width: 767px)').matches;
  let B = null;   // { o, sel, path, pos, cur, hits, st, h }

  const poster = () => B?.o.kind === 'poster';
  const pics = () => poster() ? 'posters' : 'backdrops';
  const selNow = () => B && B.path ? { ...B.sel, path: B.path, pos: B.pos || null } : null;
  const changed = () => !!B && (B.path !== (B.cur?.path || null) || JSON.stringify(B.pos || null) !== JSON.stringify(B.cur?.pos || null));

  async function open(o = {}) {
    if (!document.querySelector('link[href$="css/profile.css"]')) document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="css/profile.css">');
    await Promise.all([mssLoadScript('js/panel.js'), mssLoadScript('js/backdrop-tools.js')]);
    const cur = o.current && o.current.path ? o.current : null;
    B = { o, cur, sel: cur ? { type: cur.type, id: cur.id, title: cur.title || '' } : null, path: cur?.path || null,
      pos: cur?.pos ? JSON.parse(JSON.stringify(cur.pos)) : null, hits: [], st: null };
    const me = B;
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: o.title || 'Backdrop', subtitle: o.subtitle || 'Any movie or show’s backdrop',
      body: `<div class="pf-bn${o.kind === 'poster' ? ' is-poster' : ''}"><div class="pf-bn-pv" id="bpPv"></div>
        <div class="pf-bn-tools" id="bpTools"></div>
        <div class="pf-bn-find"><div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
          <input class="lyr-field" type="search" id="bpQ" placeholder="Search movies and shows…" aria-label="Search movies and shows" autocomplete="off" enterkeyhint="search"></div>
          <div id="bpHits"></div>
          <div class="pp-tools"><div class="pp-lang" id="ppLang"></div></div></div>
        <div class="pp-sel" id="ppSel" hidden></div><div id="ppGrid"></div></div>`,
      footer: { secondary: [{ label: 'Cancel', onClick: x => x.close() }, ...(cur && o.onReset ? [{ label: o.resetLabel || 'Use default', onClick: reset }] : [])],
        primary: { label: o.saveLabel || 'Save backdrop', disabled: true, onClick: save } },
      dirty: changed,
      onClose: () => { if (B === me) { B = null; o.onClose?.(); } } });
    B.h = h;
    MSSBdTools.toTop(h);
    const q = h.body.querySelector('#bpQ');
    q.addEventListener('input', () => search(q.value));
    h.body.addEventListener('click', ev => {
      const t = ev.target.closest('[data-bphit]'); if (t) return title(+t.dataset.bphit);
      const p = ev.target.closest('[data-pp]'); if (p) return pick(+p.dataset.pp);
      const g = ev.target.closest('[data-ppg]'); if (g && B.st) { if (!B.st.closed.delete(g.dataset.ppg)) B.st.closed.add(g.dataset.ppg); return grid(); }
      if (ev.target.closest('[data-bpframe]')) return frame();
    });
    preview();
    if (B.sel) load();
  }
  function preview() {
    if (!B) return;
    const box = document.getElementById('bpPv');
    if (box && B.o.preview) B.o.preview(box, selNow());
    const tools = document.getElementById('bpTools');
    if (tools) tools.innerHTML = B.sel ? `<span class="pf-bn-cur">${icon('film', 14)} <b translate="no">${esc(B.sel.title || 'Chosen title')}</b></span>${B.path && B.o.framing ? `<button type="button" class="pf-btn-soft" data-bpframe>${icon('edit', 14)} Adjust framing</button>` : ''}`
      : `<span class="pf-muted">${esc(B.o.emptyText || `Search for any title to use one of its ${pics()}.`)}</span>`;
    B.h?.setPrimary({ disabled: !B.path || !changed() });
  }
  let qT = null, qLast = '';
  function search(q) {
    clearTimeout(qT); qLast = q;
    qT = setTimeout(async () => {
      if (!B) return;
      const hits = q.trim().length < 2 ? [] : (await _tmdbSearch(q.trim(), 8)).filter(x => x[poster() ? 'poster_path' : 'backdrop_path']);
      if (!B || qLast !== q) return;
      B.hits = hits;
      const box = document.getElementById('bpHits');
      box.innerHTML = hits.length ? `<ul class="lyr-rows pf-bn-hits">${hits.map((x, i) => `<li><button type="button" class="pf-person" data-bphit="${i}">
          <span class="pf-t5-img">${x.poster_path ? `<img src="${IMG}w92${esc(x.poster_path)}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="pf-t5-tx"><b translate="no">${esc(x.title || x.name)}</b><small>${esc([(x.release_date || x.first_air_date || '').slice(0, 4), x.media_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>`
        : q.trim().length < 2 ? '' : `<div class="dp-empty">No titles with ${pics()} match “${esc(q.trim())}”.</div>`;
    }, typeof MSS_SEARCH_MS !== 'undefined' ? MSS_SEARCH_MS : 300);
  }
  function title(i) {
    const x = B?.hits[i]; if (!x) return;
    B.sel = { type: x.media_type === 'movie' ? 'movie' : 'tv', id: x.id, title: x.title || x.name };
    B.hits = []; document.getElementById('bpHits').innerHTML = ''; document.getElementById('bpQ').value = '';
    load();
  }
  async function load() {
    const at = B, box = document.getElementById('ppGrid');
    const kind = poster() ? 'poster' : 'backdrop';
    box.innerHTML = `<div class="pp-grid${poster() ? '' : ' is-wide'}" aria-label="Loading">${'<span class="pp-skel"></span>'.repeat(poster() ? 5 : 3)}</div>`;
    try {
      const { items, groups, closed } = await MSSBdTools.load(B.sel.type, B.sel.id, kind);
      if (B !== at) return;
      if (!items.length) { box.innerHTML = `<p class="pp-empty">TMDB has no ${pics()} for this title.</p>`; return; }
      B.st = { kind, items, groups, lang: '', closed, sel: items.findIndex(x => x.file_path === B.path) };
      if (B.st.sel < 0) B.st.sel = null;
      MSSBdTools.mountLang(document.getElementById('ppLang'), B.st, () => grid());
      grid(); preview();
    } catch (err) {
      console.error(err);
      if (B === at) box.innerHTML = `<p class="pp-empty">Couldn't load ${pics()} right now — please try again.</p>`;
    }
  }
  function grid() {
    if (!B?.st) return;
    document.getElementById('ppGrid').innerHTML = MSSBdTools.gridHTML(B.st);
    const sel = document.getElementById('ppSel'), html = MSSBdTools.selHTML(B.st);
    sel.hidden = !html; sel.innerHTML = html;
  }
  function pick(i) {
    const x = B?.st?.items[i]; if (!x) return;
    if (B.path !== x.file_path) B.pos = null;      // a new picture starts from the default framing
    B.st.sel = i; B.path = x.file_path;
    grid(); preview();
  }
  function frame() {
    if (!B?.path || !B.o.framing) return;
    const F = B.o.framing;
    MSSBdTools.frame({ url: `${IMG}w1280${B.path}`, title: B.sel?.title || '', targets: F.targets(selNow()), ps: B.pos || {}, target: phone() ? 'phone' : 'desk',
      onLive: all => F.live?.(all),
      onApply: all => { const out = {}; Object.entries(all).forEach(([t, p]) => { if (!MSSBdTools.isDef(p)) out[t] = MSSBdTools.round(p); }); B.pos = Object.keys(out).length ? out : null;
        showToast(`Framing updated — ${B.o.saveLabel || 'Save backdrop'} to keep it.`); setTimeout(preview, 50); },
      onClose: () => setTimeout(preview, 50) });
  }
  async function save(h) {
    const me = B; if (!me?.path) return;
    try { await me.o.onSave(selNow()); } catch { return; }
    if (B === me) B = null;
    h.closeNow();
    me.o.onClose?.();
  }
  async function reset(h) {
    const me = B; if (!me) return;
    try { await me.o.onReset(); } catch { return; }
    if (B === me) B = null;
    h.closeNow();
    me.o.onClose?.();
  }

  /* ── A poster as your profile photo: saved as TMDB's picture (nothing uploaded, so no photo check);
     your old uploaded photo is tidied away like a new upload does ── */
  function photo(o = {}) {
    if (!window._navUser?.id) return;
    const now = safeURL(window._navUserProfile?.avatar_url);
    return open({ kind: 'poster', title: 'Profile photo', subtitle: 'Any movie or show’s poster', saveLabel: 'Use this poster',
      emptyText: 'Search for a movie or show, then pick one of its posters.',
      preview: (box, sel) => {
        box.classList.add('is-photo');
        const u = sel ? `${IMG}w342${esc(sel.path)}` : now;
        box.innerHTML = `<span class="pf-bn-photo">${u ? `<img src="${u}" alt="">` : icon('user', 22)}</span>
          <span class="pf-bn-photo-tx"><b>${sel ? 'New photo' : 'Your photo now'}</b><small>Your profile shows the whole poster. Elsewhere it’s cropped to a circle.</small></span>`;
      },
      onSave: async sel => { o.onSaved?.(await usePoster(sel.path)); } });
  }
  // a TMDB poster path → your profile photo (also Set up your folio's "From your Top 5")
  async function usePoster(path) {
    const uid = window._navUser?.id, url = `${IMG}w500${path}`;
    try { await updateProfile(uid, { avatar_url: url }); }
    catch (err) { showToast('Couldn’t save — try again.', 'err'); throw err; }
    mssAvatarTidy(uid, url).catch(() => {});
    if (window._navUserProfile) { window._navUserProfile.avatar_url = url; _shellUserPaint(window._navUserProfile); }
    showToast('Photo updated');
    return url;
  }
  return { open, photo, usePoster };
})();
