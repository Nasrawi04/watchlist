/* ══════════════════════════════════════════
   avatar-upload.js — Your profile photo's two framings: a 2:3 Poster and a Circle, each with its own zoom and position
   (Settings › My Profile, Edit profile, Set up your folio)
   MSSAvatarUpload.pick(o)          the device's file picker → Adjust photo
   MSSAvatarUpload.poster(path, o)  a TMDB poster path (Choose a poster) → Adjust photo
   MSSAvatarUpload.adjust(o)        your current photo, framed again (no new picture)
   MSSAvatarUpload.canAdjust(p)     true when p's photo was framed here (so Adjust can reopen it)
     o = { onPreview(url), onSaved(url, profile) }
   Adjust photo (a side panel L, full page on phones): Poster | Circle tabs over one stage; the picture is dimmed
   outside the frame; drag / pinch / wheel to frame it (zoom follows the pointer), arrow keys move it, + / − zoom,
   Reset; live previews of both. Save photo → the picture check (new uploads only) → the avatars bucket:
     avatar.jpg        the circle, square — profiles.avatar_url, so every round avatar on the site shows it
     avatar-poster.jpg the poster, 2:3 — profile_layout.pic.poster (mssPhotoPoster: the profile header and other tall spots)
     avatar-src.jpg    the whole picture you uploaded (a poster keeps TMDB's address instead), so Adjust can reframe it
   profile_layout.pic = { src, poster, av, fp:[x, y, z], fc:[x, y, z] } — x / y the frame's centre as a share of the
   picture, z the zoom over "just covers the frame"; av = the avatar_url it was made with (anything else that sets
   avatar_url — a quick poster, Remove — leaves pic stale, and mssPhotoPic ignores it then).
   Styles: §72 "Adjust photo" (.pe-*) in css/style.css.
══════════════════════════════════════════ */
const MSSAvatarUpload = (() => {
  const IMG = 'https://image.tmdb.org/t/p/';
  const SRC_MAX = 1600;                         // the kept original's longest side
  const ZMAX = 4;                               // up to 4× closer than "just covers the frame"
  const OUT = { poster: [MSS_AVATAR.px, MSS_AVATAR.h], circle: [MSS_AVATAR.px, MSS_AVATAR.px] };
  let st = null;                                // the open editor
  let input = null;

  /* ── Ways in ── */
  function pick(o = {}) {
    MSSImageCheck.preload();                    // start loading the picture check while they frame it
    if (!input) {
      input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
      input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; if (f) fromFile(f, input._o); });
      document.body.appendChild(input);
    }
    input._o = o;
    input.click();
  }
  async function fromFile(file, o) {
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB.', 'err'); return; }
    let bmp;
    try { bmp = await loadImage(URL.createObjectURL(file)); }
    catch { showToast('That picture couldn’t be opened — try a JPG or PNG.', 'err'); return; }
    // the original, at most SRC_MAX on its longest side (keeps the file small; still sharp at 4× zoom)
    const k = Math.min(1, SRC_MAX / Math.max(bmp.naturalWidth, bmp.naturalHeight));
    const c = canvas(Math.round(bmp.naturalWidth * k), Math.round(bmp.naturalHeight * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    if (!blob) { showToast('Failed to process image.', 'err'); return; }
    const url = URL.createObjectURL(blob);
    open({ img: await loadImage(url), srcBlob: blob, o });
  }
  async function poster(path, o = {}) {
    try { open({ img: await loadImage(`${IMG}w780${path}`, true), srcURL: `${IMG}w780${path}`, o }); }
    catch { showToast('That poster couldn’t be loaded — try again.', 'err'); }
  }
  async function adjust(o = {}) {
    const pic = mssPhotoPic(window._navUserProfile); if (!pic) return;
    try { open({ img: await loadImage(pic.src, true), srcURL: pic.src, pic, o }); }
    catch { showToast('Your photo couldn’t be loaded — try again.', 'err'); }
  }
  const canAdjust = p => !!mssPhotoPic(p);

  function loadImage(src, cors) {
    return new Promise((res, rej) => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';    // TMDB and our storage both allow it, so the canvas can be saved
      im.onload = () => res(im); im.onerror = rej;
      im.src = src;
    });
  }
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

  /* ── The editor ── */
  async function open(s) {
    await mssLoadScript('js/panel.js');
    const nw = s.img.naturalWidth, nh = s.img.naturalHeight;
    // a saved framing (fractions of the picture) or a sensible start: the poster centred, the circle a little high (faces)
    const from = (f, dy) => f ? { cx: f[0] * nw, cy: f[1] * nh, z: Math.min(ZMAX, Math.max(1, f[2] || 1)) } : { cx: nw / 2, cy: nh * dy, z: 1 };
    st = { ...s, nw, nh, shape: 'poster', W: 0, H: 0,
      f: { poster: from(s.pic?.fp, 0.5), circle: from(s.pic?.fc, 0.42) },
      start: null };
    const src = s.img.src;
    const prev = (shape, size, label) => `<button type="button" class="pe-pv" data-shape="${shape}" aria-label="${label}">
        <span class="pe-pv-pic is-${shape}" style="--w:${size[0]}px;--h:${size[1]}px"><img alt="" src="${src}"></span></button>`;
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: 'Adjust photo',
      body: `<div class="pe">
        <div class="pn-toggle pe-tabs" role="tablist" aria-label="Framing">
          <button type="button" role="tab" class="pn-toggle-btn active" id="peTab-poster" data-shape="poster" aria-selected="true" aria-controls="peStage">Poster</button>
          <button type="button" role="tab" class="pn-toggle-btn" id="peTab-circle" data-shape="circle" aria-selected="false" aria-controls="peStage" tabindex="-1">Circle</button>
        </div>
        <p class="pe-hint" id="peHint"></p>
        <div class="pe-stage" id="peStage" role="tabpanel" aria-labelledby="peTab-poster" tabindex="0"
             aria-roledescription="photo framing" aria-describedby="peKeys">
          <img class="pe-img" id="peImg" alt="" src="${src}" draggable="false">
          <span class="pe-frame" id="peFrame" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </div>
        <p class="sr-only" id="peKeys">Drag to move the picture. Arrow keys move it, plus and minus zoom.</p>
        <div class="pe-tools">
          <div class="ep-slider-row pe-zoom">
            <button type="button" class="ep-step" data-step="-1" aria-label="Zoom out">${icon('minus', 16)}</button>
            <div class="ep-bar"><span class="ep-bar-segs" id="peSegs" aria-hidden="true">${'<i></i>'.repeat(10)}</span>
              <input type="range" class="ep-slider" id="peZoom" min="1" max="${ZMAX}" step="0.01" value="1" aria-label="Zoom"></div>
            <button type="button" class="ep-step" data-step="1" aria-label="Zoom in">${icon('plus', 16)}</button>
          </div>
          <output class="pe-pct" id="pePct" for="peZoom" aria-hidden="true">100%</output>
          <button type="button" class="set-btn pe-reset" id="peReset">${icon('refresh', 14)}<span>Reset</span></button>
        </div>
        <p class="pe-warn" id="peWarn" role="status" hidden>${icon('info', 14)}<span><b>Low quality</b> — the picture is small for this zoom. Zoom out a little.</span></p>
        <div class="pe-pvs">
          <div class="pe-pv-g"><span class="pe-pv-l">Poster</span>${prev('poster', [56, 84], 'Poster preview — edit the poster framing')}</div>
          <div class="pe-pv-g"><span class="pe-pv-l">Circle</span><div class="pe-pv-row">${prev('circle', [64, 64], 'Circle preview — edit the circle framing')}${prev('circle', [40, 40], 'Circle preview, small')}${prev('circle', [24, 24], 'Circle preview, smallest')}</div></div>
        </div>
        <div class="avatar-crop-rule">${mssUploadRuleHTML()}</div></div>`,
      footer: { secondary: [{ label: 'Cancel', onClick: x => x.close() }], primary: { label: 'Save photo', onClick: save } },
      dirty: () => st && (st.srcBlob || st.srcURL !== st.pic?.src || JSON.stringify(st.f) !== st.start),
      onClose: () => { if (st && st.h === h) { st.ro?.disconnect(); st = null; } } });
    st.h = h;
    wire(h.body);
    setShape('poster', true);
    clamp(st.f.circle, 'circle');
    st.start = JSON.stringify(st.f);          // what "no changes" is (a saved framing, once it's fitted)
  }

  // the frame in stage pixels: the poster as tall as fits (2:3), the circle as wide as fits
  function frameSize(shape) {
    const pad = st.W < 360 ? 28 : 40;
    if (shape === 'circle') { const d = Math.min(st.W, st.H) - pad * 2; return [d, d]; }
    const fh = Math.min(st.H - pad * 2, (st.W - pad * 2) * 1.5);
    return [fh / 1.5, fh];
  }
  const cover = (shape, fw, fh) => Math.max(fw / st.nw, fh / st.nh);   // the scale that just covers the frame
  // keep the picture covering the frame: the frame's centre can't come closer to an edge than half the crop
  function clamp(f, shape) {
    const [fw, fh] = frameSize(shape), s = cover(shape, fw, fh) * f.z, hw = fw / s / 2, hh = fh / s / 2;
    f.z = Math.min(ZMAX, Math.max(1, f.z));
    f.cx = Math.min(st.nw - hw, Math.max(hw, f.cx));
    f.cy = Math.min(st.nh - hh, Math.max(hh, f.cy));
  }
  // the crop as a rectangle of the picture: what's saved, and what each preview shows
  function crop(shape) {
    const f = st.f[shape], [fw, fh] = frameSize(shape), s = cover(shape, fw, fh) * f.z;
    return { x: f.cx - fw / s / 2, y: f.cy - fh / s / 2, w: fw / s, h: fh / s };
  }

  function draw() {
    if (!st) return;
    const shape = st.shape, f = st.f[shape];
    clamp(f, shape);
    const [fw, fh] = frameSize(shape), s = cover(shape, fw, fh) * f.z;
    const img = document.getElementById('peImg'), fr = document.getElementById('peFrame');
    img.style.width = st.nw * s + 'px'; img.style.height = st.nh * s + 'px';
    img.style.transform = `translate(${st.W / 2 - f.cx * s}px, ${st.H / 2 - f.cy * s}px)`;
    fr.style.width = fw + 'px'; fr.style.height = fh + 'px';
    fr.classList.toggle('is-circle', shape === 'circle');
    // the zoom bar: its 10 segments fill up to the zoom; the readout; Reset only when there's something to undo
    const sl = document.getElementById('peZoom'), t = (f.z - 1) / (ZMAX - 1) * 10;
    sl.value = f.z; sl.setAttribute('aria-valuetext', Math.round(f.z * 100) + '%');
    document.getElementById('pePct').textContent = Math.round(f.z * 100) + '%';
    document.querySelectorAll('#peSegs i').forEach((el, i) => el.style.setProperty('--f', Math.min(1, Math.max(0, t - i))));
    // Low quality: the crop would be stretched more than 1.5× to make the saved picture
    const c = crop(shape);
    document.getElementById('peWarn').hidden = OUT[shape][0] / c.w <= 1.5;
    previews();
  }
  // every preview shows its own framing (so you see the poster's while you work on the circle, and the other way round)
  function previews() {
    document.querySelectorAll('.pe-pv').forEach(b => {
      const shape = b.dataset.shape, pic = b.firstElementChild, img = pic.firstElementChild;
      const w = pic.offsetWidth, h = pic.offsetHeight, f = st.f[shape];
      const [fw, fh] = frameSize(shape), k = w / fw, s = cover(shape, fw, fh) * f.z * k;
      img.style.width = st.nw * s + 'px'; img.style.height = st.nh * s + 'px';
      img.style.transform = `translate(${w / 2 - f.cx * s}px, ${h / 2 - f.cy * s}px)`;
      b.classList.toggle('is-on', shape === st.shape);
      b.setAttribute('aria-pressed', String(shape === st.shape));
    });
  }

  function setShape(shape, first) {
    st.shape = shape;
    document.querySelectorAll('.pe-tabs [role="tab"]').forEach(b => {
      const on = b.dataset.shape === shape;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    });
    document.getElementById('peStage').setAttribute('aria-labelledby', 'peTab-' + shape);
    document.getElementById('peHint').textContent = shape === 'poster'
      ? 'The poster is what your profile shows. The circle has its own framing — switch to Circle to set it.'
      : 'The circle shows next to your name everywhere else: comments, friends, lists, the menu.';
    if (!first) st.h.body.querySelector('#peStage').focus({ preventScroll: true });
    draw();
  }

  // zoom to z, keeping the picture point under (px, py) — stage pixels — where it is (the frame's centre by default)
  function zoomAt(z, px = st.W / 2, py = st.H / 2) {
    const shape = st.shape, f = st.f[shape], [fw, fh] = frameSize(shape), c0 = cover(shape, fw, fh);
    const s0 = c0 * f.z, sx = f.cx + (px - st.W / 2) / s0, sy = f.cy + (py - st.H / 2) / s0;
    f.z = Math.min(ZMAX, Math.max(1, z));
    const s1 = c0 * f.z;
    f.cx = sx - (px - st.W / 2) / s1; f.cy = sy - (py - st.H / 2) / s1;
    draw();
  }

  function wire(body) {
    const stage = body.querySelector('#peStage'), sl = body.querySelector('#peZoom');
    const measure = () => { st.W = stage.clientWidth; st.H = stage.clientHeight; draw(); };
    st.ro = new ResizeObserver(measure); st.ro.observe(stage);
    measure();
    // Poster | Circle: the tabs (← → between them) and the previews
    body.querySelectorAll('.pe-tabs [role="tab"], .pe-pv').forEach(b => b.addEventListener('click', () => setShape(b.dataset.shape)));
    body.querySelector('.pe-tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = st.shape === 'poster' ? 'circle' : 'poster';
      setShape(next, true); body.querySelector('#peTab-' + next).focus();
    });
    sl.addEventListener('input', () => zoomAt(Number(sl.value)));
    body.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => zoomAt(st.f[st.shape].z + Number(b.dataset.step) * (ZMAX - 1) / 10)));
    body.querySelector('#peReset').addEventListener('click', () => {
      const nw = st.nw, nh = st.nh;
      st.f[st.shape] = { cx: nw / 2, cy: nh * (st.shape === 'circle' ? 0.42 : 0.5), z: 1 };
      draw();
    });

    // drag with one pointer, pinch with two (the zoom follows the fingers' midpoint)
    const pts = new Map(); let g = null;
    const local = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const startGesture = () => {
      const f = st.f[st.shape], [a, b] = [...pts.values()];
      g = b ? { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: f.z, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
            : { p: a, cx: f.cx, cy: f.cy };
    };
    stage.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); startGesture();
      stage.classList.add('is-drag');
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, local(e));
      const f = st.f[st.shape], [fw, fh] = frameSize(st.shape), s = cover(st.shape, fw, fh) * f.z, [a, b] = [...pts.values()];
      if (b && g.d) { zoomAt(g.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / g.d, g.m[0], g.m[1]); return; }
      f.cx = g.cx - (a[0] - g.p[0]) / s; f.cy = g.cy - (a[1] - g.p[1]) / s;
      draw();
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size) startGesture(); else { g = null; stage.classList.remove('is-drag'); }
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    // the wheel / a trackpad pinch (ctrlKey) zooms toward the pointer
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = local(e), f = st.f[st.shape];
      zoomAt(f.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), x, y);
    }, { passive: false });
    stage.addEventListener('dblclick', e => { const [x, y] = local(e); zoomAt(st.f[st.shape].z < 1.9 ? 2 : 1, x, y); });
    // keys: arrows move it (Shift: further), + / − zoom, 0 back to the fit
    stage.addEventListener('keydown', e => {
      const f = st.f[st.shape], [fw, fh] = frameSize(st.shape), s = cover(st.shape, fw, fh) * f.z, step = (e.shiftKey ? 40 : 8) / s;
      const k = e.key;
      if (k === 'ArrowLeft') f.cx -= step; else if (k === 'ArrowRight') f.cx += step;
      else if (k === 'ArrowUp') f.cy -= step; else if (k === 'ArrowDown') f.cy += step;
      else if (k === '+' || k === '=') { zoomAt(f.z * 1.1); e.preventDefault(); return; }
      else if (k === '-' || k === '_') { zoomAt(f.z / 1.1); e.preventDefault(); return; }
      else if (k === '0') { zoomAt(1); e.preventDefault(); return; }
      else return;
      e.preventDefault(); draw();
    });
  }

  /* ── Save: both pictures from the framings, the check, the upload, the profile ── */
  function render(shape) {
    const c = crop(shape), [w, h] = OUT[shape], cv = canvas(w, h), x = cv.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(st.img, c.x, c.y, c.w, c.h, 0, 0, w, h);
    return new Promise(r => cv.toBlob(r, 'image/jpeg', MSS_AVATAR.q));
  }
  async function save(h) {
    const s = st, uid = window._navUser?.id; if (!s || !uid) return;
    const [pBlob, cBlob] = await Promise.all([render('poster'), render('circle')]);
    if (!pBlob || !cBlob) throw new Error('canvas');
    // a new upload is checked once, whole; a TMDB poster or a reframe of a checked photo isn't checked again
    let verdict = true;
    if (s.srcBlob) { verdict = await MSSImageCheck.allowed(s.srcBlob, 'profile photo'); if (!verdict) return; }
    s.o.onPreview?.(URL.createObjectURL(cBlob));
    const up = async (name, blob) => {
      const { error } = await sb.storage.from('avatars').upload(`${uid}/${name}`, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      return sb.storage.from('avatars').getPublicUrl(`${uid}/${name}`).data.publicUrl + '?t=' + Date.now();
    };
    const [av, posterURL, src] = await Promise.all([up('avatar.jpg', cBlob), up('avatar-poster.jpg', pBlob), s.srcBlob ? up('avatar-src.jpg', s.srcBlob) : s.srcURL]);
    const frac = f => [+(f.cx / s.nw).toFixed(4), +(f.cy / s.nh).toFixed(4), +f.z.toFixed(3)];
    const lay = { ...(window._navUserProfile?.profile_layout || {}), pic: { src, poster: posterURL, av, fp: frac(s.f.poster), fc: frac(s.f.circle) } };
    const row = await updateProfile(uid, { avatar_url: av, profile_layout: lay });
    mssAvatarTidy(uid, [av, posterURL, src]).catch(() => {});   // anything older goes
    if (s.srcBlob) MSSImageCheck.review(verdict, 'avatar', src);
    if (window._navUserProfile) { Object.assign(window._navUserProfile, { avatar_url: row.avatar_url, profile_layout: row.profile_layout }); _shellUserPaint(window._navUserProfile); }
    s.h.closeNow();
    s.o.onSaved?.(row.avatar_url, row);
    showToast('Photo saved');
  }

  return { pick, poster, adjust, canAdjust };
})();
