/* ══════════════════════════════════════════
   avatar-upload.js — Upload a profile photo: pick a file, frame it, check it, save it
   (Settings › My Profile and Set up your folio)
   MSSAvatarUpload.pick({ onPreview(url), onSaved(url) })
     opens the device's file picker → Adjust Photo (a side panel L, full page on phones) with a 2:3 portrait
     you drag and zoom (the circle shows what round avatars elsewhere show) → Use Photo → the picture check
     (MSSImageCheck) → uploaded to avatars/<you>/avatar.jpg → profiles.avatar_url. onPreview gets a local
     preview while it uploads; onSaved gets the saved address. Your old photo files are tidied away.
   Styles: .avatar-crop-* in css/style.css.
══════════════════════════════════════════ */
const MSSAvatarUpload = (() => {
  const VW = 200, VH = 300;                    // the portrait frame (matches .avatar-crop-vp)
  let st = null;                               // { file, img, nw, nh, min, zoom, x, y, o, h, el }
  let input = null;

  function pick(o = {}) {
    MSSImageCheck.preload();                   // start loading the picture check while they crop
    if (!input) {
      input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
      input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; if (f) start(f, input._o); });
      document.body.appendChild(input);
    }
    input._o = o;
    input.click();
  }

  function start(file, o) {
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB.', 'err'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        // the smallest zoom is the one that covers the portrait, so there's never empty space
        const min = Math.max(VW / img.naturalWidth, VH / img.naturalHeight);
        st = { file, src: ev.target.result, nw: img.naturalWidth, nh: img.naturalHeight, min, zoom: min, x: 0, y: 0, o };
        open();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function open() {
    await mssLoadScript('js/panel.js');
    const seg = '<i></i>'.repeat(10);
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: 'Adjust Photo',
      body: `<div class="avatar-crop">
        <div class="avatar-crop-vp" id="avCropVp"><img id="avCropImg" alt="" src="${st.src}"><span class="avatar-crop-ring" aria-hidden="true"></span></div>
        <p class="avatar-crop-hint">Your profile shows the whole portrait. The circle is what shows next to your name elsewhere.</p>
        <div class="ep-slider-row avatar-zoom">
          <button type="button" class="ep-step" data-step="-1" aria-label="Zoom out">${icon('minus', 16)}</button>
          <div class="ep-bar"><span class="ep-bar-segs" id="avCropSegs" aria-hidden="true">${seg}</span>
            <input type="range" class="ep-slider" id="avCropZoom" min="${st.min}" max="${st.min * 3}" step="0.001" value="${st.min}" aria-label="Zoom"></div>
          <button type="button" class="ep-step" data-step="1" aria-label="Zoom in">${icon('plus', 16)}</button>
        </div>
        <div class="avatar-crop-rule">${mssUploadRuleHTML()}</div></div>`,
      footer: { secondary: [{ label: 'Cancel', onClick: x => x.close() }], primary: { label: 'Use Photo', onClick: confirm } },
      onClose: () => { if (st && st.h === h) st = null; } });
    st.h = h;
    wire(h.body);
    zoomTo(st.min);
  }

  function apply() {
    const img = document.getElementById('avCropImg'); if (!img || !st) return;
    const w = st.nw * st.zoom, h = st.nh * st.zoom;
    img.style.width = w + 'px'; img.style.height = h + 'px';
    // keep the picture covering the portrait while you pan
    const mx = Math.max(0, (w - VW) / 2), my = Math.max(0, (h - VH) / 2);
    st.x = Math.min(mx, Math.max(-mx, st.x)); st.y = Math.min(my, Math.max(-my, st.y));
    img.style.transform = `translate(-50%, -50%) translate(${st.x}px, ${st.y}px)`;
  }
  // the slider and its 10 segments (filled up to the zoom, the last one partly), then the picture
  function zoomTo(v) {
    const sl = document.getElementById('avCropZoom'); if (!sl || !st) return;
    const min = Number(sl.min), max = Number(sl.max);
    st.zoom = Math.min(max, Math.max(min, Number(v)));
    sl.value = st.zoom;
    sl.setAttribute('aria-valuetext', Math.round(st.zoom / min * 100) + '%');
    const t = max > min ? (st.zoom - min) / (max - min) * 10 : 0;
    document.querySelectorAll('#avCropSegs i').forEach((el, i) => el.style.setProperty('--f', Math.min(1, Math.max(0, t - i))));
    apply();
  }

  function wire(body) {
    const vp = body.querySelector('#avCropVp'), sl = body.querySelector('#avCropZoom');
    sl.addEventListener('input', () => zoomTo(sl.value));
    // − / +: a tenth of the way each press, like one segment
    body.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => zoomTo(st.zoom + Number(b.dataset.step) * (Number(sl.max) - Number(sl.min)) / 10)));
    let drag = null;
    vp.addEventListener('pointerdown', e => { vp.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, px: st.x, py: st.y }; vp.classList.add('is-drag'); });
    vp.addEventListener('pointermove', e => { if (!drag) return; st.x = drag.px + (e.clientX - drag.x); st.y = drag.py + (e.clientY - drag.y); apply(); });
    const end = () => { drag = null; vp.classList.remove('is-drag'); };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
    vp.addEventListener('wheel', e => { e.preventDefault(); zoomTo(st.zoom - e.deltaY * 0.0015); }, { passive: false });
  }

  // the visible portrait → source pixels → a fixed-size 2:3 picture (this "bakes in" the pan + zoom)
  function confirm() {
    const img = document.getElementById('avCropImg'); if (!img || !st) return;
    const s = st, cx = s.nw / 2 - s.x / s.zoom, cy = s.nh / 2 - s.y / s.zoom, sw = VW / s.zoom, sh = VH / s.zoom;
    const canvas = document.createElement('canvas');
    canvas.width = MSS_AVATAR.px; canvas.height = MSS_AVATAR.h;
    canvas.getContext('2d').drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, MSS_AVATAR.px, MSS_AVATAR.h);
    canvas.toBlob(blob => save(blob, s.o || {}), 'image/jpeg', MSS_AVATAR.q);
    s.h?.closeNow();
  }

  async function save(blob, o) {
    if (!blob) { showToast('Failed to process image.', 'err'); return; }
    const uid = window._navUser?.id; if (!uid) return;
    showToast('Checking photo…');
    const verdict = await MSSImageCheck.allowed(blob, 'profile photo');
    if (!verdict) return;
    o.onPreview?.(URL.createObjectURL(blob));
    showToast('Uploading photo…');
    try {
      const path = `${uid}/avatar.jpg`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path);
      const url = publicUrl + '?t=' + Date.now();
      await updateProfile(uid, { avatar_url: url });
      mssAvatarTidy(uid, url).catch(() => {});   // old avatar.png / .jpeg files go
      MSSImageCheck.review(verdict, 'avatar', url);
      if (window._navUserProfile) { window._navUserProfile.avatar_url = url; _shellUserPaint(window._navUserProfile); }
      o.onSaved?.(url);
      showToast('Photo updated!');
    } catch (e) {
      showToast('Upload failed — check Supabase Storage is set up.', 'err');
      console.error(e);
    }
  }
  return { pick };
})();
