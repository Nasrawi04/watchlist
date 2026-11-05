/* ══════════════════════════════════════════
   settings-uploads.js — My Uploads (Settings → Data)
   Every picture you uploaded yourself, in one place: your profile photo (Supabase Storage,
   the avatars bucket) and your own posters (Cloudinary: an entry's poster_url).
   Removing one takes it off the site straight away and deletes the file. A poster goes back
   to the title's TMDB poster, or to its first letter when the title isn't linked to TMDB;
   a profile photo goes back to your initial.
   The file delete goes through supabase/functions/cloudinary-sign (it holds the secret).
══════════════════════════════════════════ */
const MSSUploads = (() => {
  let me = null, posters = [], loaded = false;
  const box = () => document.getElementById('uploadsList');
  const photo = () => window._navUserProfile?.avatar_url || _sProfile?.avatar_url || '';
  const isOwnPhoto = url => /\/storage\/v1\/object\/public\/avatars\//.test(url || '');

  async function load(userId) {
    me = userId || me;
    if (!me || !box()) return;
    const { data, error } = await sb.from('entries').select('id, title, cat, poster_url, tmdb_id, tmdb_type')
      .eq('user_id', me).ilike('poster_url', '%res.cloudinary.com%').order('title', { ascending: true });
    if (error) { box().innerHTML = '<li class="sess-note">Couldn’t load your uploads — try again in a moment.</li>'; return; }
    posters = data || [];
    loaded = true;
    draw();
  }

  const row = (img, name, sub, action, link) => `<li class="sess-row upl-row">
      <img class="upl-thumb${action.startsWith('photo') ? ' is-round' : ''}" src="${img}" alt="" loading="lazy">
      <span class="sess-info">${link ? `<a class="sess-name upl-link" href="${link}" translate="no">${name}</a>` : `<span class="sess-name" translate="no">${name}</span>`}<span class="sess-when">${sub}</span></span>
      <button type="button" class="sess-out" aria-label="Remove ${name}" onclick="MSSUploads.${action}">Remove</button>
    </li>`;

  function draw() {
    const rows = [];
    if (isOwnPhoto(photo())) rows.push(row(safeURL(photo()), 'Profile photo', 'Shows on your profile', 'photo(this)'));
    posters.forEach(e => {
      const url = safeURL(e.poster_url);
      if (url) rows.push(row(url, escHTML(e.title || 'Untitled'), 'Poster', `poster(this, '${e.id}')`, e.tmdb_id ? `title.html?type=${e.tmdb_type === 'movie' ? 'movie' : 'tv'}&id=${e.tmdb_id}` : ''));
    });
    box().innerHTML = rows.join('');
    document.getElementById('uploadsEmpty').hidden = rows.length > 0;
    MSSSettingsNav.refresh();
  }

  function value() {
    if (!loaded) return '';
    const n = posters.length + (isOwnPhoto(photo()) ? 1 : 0);
    return n === 1 ? '1 picture' : n ? `${n} pictures` : 'None';
  }

  // The title's own poster from TMDB. Not found, or no link: no poster, and the page shows its first letter.
  async function defaultPoster(e) {
    if (!e.tmdb_id || !e.tmdb_type) return null;
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/${e.tmdb_type === 'movie' ? 'movie' : 'tv'}/${e.tmdb_id}?language=en-US`);
      if (!res.ok) return null;
      const path = (await res.json()).poster_path;
      return path ? TMDB_FULL + path : null;
    } catch { return null; }
  }

  async function poster(btn, id) {
    const e = posters.find(x => x.id === id);
    if (!e) return;
    const ok = await showConfirm({
      title: 'Remove this poster?',
      message: `Your picture is deleted, and “${e.title || 'this title'}” goes back to its normal poster everywhere. This can’t be undone.`,
      confirmText: 'Remove', iconName: 'trash',
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      const old = e.poster_url, fresh = await defaultPoster(e);
      const { error } = await sb.from('entries').update({ poster_url: fresh }).eq('user_id', me).eq('poster_url', old);
      if (error) throw error;
      await sb.from('recently_viewed').delete().eq('user_id', me).eq('poster_url', old).then(() => {}, () => {});
      posters = posters.filter(x => x.poster_url !== old);
      draw();
      const { data } = await sb.functions.invoke('cloudinary-sign', { body: { action: 'delete', url: old } }).catch(() => ({}));
      if (!data?.deleted) console.warn('My Uploads: the file wasn’t deleted from Cloudinary', data);
      showToast('Poster removed.');
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      showToast('Couldn’t remove that poster. Try again.', 'err');
    }
  }

  async function removePhoto(btn) {
    const ok = await showConfirm({
      title: 'Remove your profile photo?',
      message: 'Your picture is deleted, and your profile goes back to showing your initial. This can’t be undone.',
      confirmText: 'Remove', iconName: 'trash',
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      const updated = await updateProfile(me, { avatar_url: null });
      window._navUserProfile = updated;
      _sProfile = updated;
      await mssAvatarTidy(me, null).catch(err => console.warn('My Uploads: the photo file stayed', err));
      populateSettings();
      const initial = (updated?.username || '?')[0].toUpperCase();
      ['navUserInitial', 'navUserInitialMobile'].forEach(i => {
        const el = document.getElementById(i);
        if (el) { el.textContent = initial; el.style.padding = ''; }
      });
      draw();
      showToast('Profile photo removed.');
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      showToast('Couldn’t remove your photo. Try again.', 'err');
    }
  }

  return { load, draw, value, poster, photo: removePhoto };
})();
