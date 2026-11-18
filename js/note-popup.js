/* ═══════════════════════════════════════════════════════════════
   note-popup.js — note cards, the featured note and the pinned note (Notes redesign)

   One card for every note list — the Notes page (Mine, Friends, Community), the Notes tab on
   profile.html / profile-view.html and a title page's Community notes:

     MSSNote.cardHTML(note, { open, counts, blur, author, react: { mine, fn }, replies })
       → the nc-card: poster, title + year, score, "Watched … · genres" + Spoiler, 3 lines of the
         note, words · 👍 · 👎 (or live buttons) and Read →
       open: JS run on click / Enter · counts: { like, dislike } · blur: someone else's spoiler
       author: { username, avatar_url } (Friends / Community) · react: live like / dislike —
       mine ('like' | 'dislike' | undefined) and fn(entryId, isLike) · replies: fn(entryId, username)
     MSSNote.featuredHTML(entry, { open, pinned, blur }) → the big note over the title's backdrop
       (the Library's Watching card look), with the Edit page's score ring
     MSSNote.featured(list, pinId) → the entry to feature: the pinned one, else the latest
     MSSNote.reactionCounts(entryIds) → { entryId: { like, dislike } }
     MSSNote.pinnedId(userId) / setPin(entry | null) / pinOrAsk(entry) → one pinned note per person
       (profiles.pinned_note_id, sql/123; this device until it runs). 'mss:notepin' fires on a change.
     MSSNote.more(n) → the View more button (20 at a time) · MSSNote.PAGE

   Small helpers: MSSNote.words · date · watchedDate · readMins
   Styles: nc-* and nf-* in style.css. A note is read and written in the title's panel / page (title-view.js).
═══════════════════════════════════════════════════════════════ */

const MSSNote = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const PAGE = 20;
  /* ── Helpers ── */
  const words = t => MSSRich.plain(t).trim().split(/\s+/).filter(Boolean).length;     // markers (**, > …) aren't words
  const readMins = t => Math.max(1, Math.round(words(t) / 220));
  // Date the title was watched (finished), falling back to when it was added
  const watchedDate = e => e.completed_date || e.created_at || e.updated_at;
  const has = e => !!(e && e.notes && String(e.notes).trim());
  function date(d, withDay) {
    if (!d) return '';
    const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
    return isNaN(dt) ? '' : dt.toLocaleDateString(MSSI18n.locale, withDay ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: 'numeric' });
  }
  // the card's few lines — CSS clamps them to three; the full note is in the panel
  const excerpt = t => { const w = MSSRich.plain(t).trim().split(/\s+/); return w.length > 70 ? w.slice(0, 70).join(' ') + '…' : w.join(' '); };
  const year = n => String(n.year || '').slice(0, 4);
  function poster(n, cls) {
    const u = safeURL(n.poster_url);
    return `<div class="${cls}" aria-hidden="true">${u ? `<img src="${u}" loading="lazy" alt="" data-letter="${esc((n.title || '?')[0])}" onerror="mssImgError(this)">` : esc((n.title || '?')[0].toUpperCase())}</div>`;
  }
  const avatar = p => { const u = safeURL(p?.avatar_url); return `<span class="snote-avatar">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`; };
  const enterKey = `onkeydown="if((event.key==='Enter'||event.key===' ')&&event.target===this){event.preventDefault();this.click()}"`;

  async function reactionCounts(ids) {
    const out = {};
    if (!ids.length) return out;
    const { data } = await sb.from('note_reactions').select('entry_id, is_like').in('entry_id', ids);
    (data || []).forEach(r => {
      const c = out[r.entry_id] ||= { like: 0, dislike: 0 };
      if (r.is_like) c.like++; else c.dislike++;
    });
    return out;
  }

  /* ── The card ── */
  function cardHTML(n, { open = '', counts, blur, author, react, replies } = {}) {
    const id = n.entry_id || n.id, w = words(n.notes), sp = mssIsSpoiler(n);
    const meta = [n.completed_date || n.created_at ? `Watched ${date(watchedDate(n), true)}` : '', mssGenreList(n.genres).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    const text = `<p class="nc-excerpt" translate="no">${esc(excerpt(n.notes))}</p>`;
    // someone else's note on a title above your age limit is left out (088)
    const age = n.user_id && n.user_id !== window._navUser?.id ? MSSAge.attr(n.tmdb_type, n.tmdb_id, true) : '';
    const c = react ? { like: Number(n.like_count) || 0, dislike: Number(n.dislike_count) || 0 } : counts || { like: 0, dislike: 0 };
    const btn = like => { const on = react.mine === (like ? 'like' : 'dislike'), k = like ? c.like : c.dislike;
      return `<button type="button" class="snote-react-btn ${on ? (like ? 'active-like' : 'active-dislike') : ''}"${like ? ' data-like' : ''} aria-label="${like ? 'Like' : 'Dislike'}: ${k}" aria-pressed="${on}" onclick="event.stopPropagation();${react.fn}(${attrJSON(id)}, ${like})">${icon(like ? (on ? 'thumbsUpFilled' : 'thumbsUp') : (on ? 'thumbsDownFilled' : 'thumbsDown'), 14)} <span>${k}</span></button>`; };
    const stats = react
      ? `<span class="nc-reacts">${btn(true)}${btn(false)}${replies ? `<button type="button" class="snote-react-btn" onclick='event.stopPropagation();${replies}(${attrJSON(id)}, ${attrJSON(n.username || '')})'>${icon('reply', 14)} Replies</button>` : ''}</span>`
      : `<span class="nc-count" aria-label="${c.like} likes, ${c.dislike} dislikes">${icon('thumbsUp', 13)}<b>${c.like}</b>${icon('thumbsDown', 13)}<b>${c.dislike}</b></span>`;
    const by = author ? `<div class="nc-author">${avatar(author)}<span translate="no">@${esc(author.username || 'user')}</span></div>` : '';
    return `<article class="nc-card" onclick="${open}" role="button" tabindex="0" ${enterKey} aria-label="Read ${author ? '@' + esc(author.username || 'user') + '’s' : 'the'} note on ${esc(n.title)}"${react ? ' data-dbl-like' : ''}${age}>
      ${poster(n, 'nc-poster')}
      <div class="nc-main">
        ${by}
        <div class="nc-top"><h3 class="nc-title" translate="no">${esc(n.title)}${year(n) ? ` <span class="nc-year">${year(n)}</span>` : ''}</h3>${mssScoreHTML(liveScore(n), { cls: 'nc-score' })}</div>
        <div class="nc-meta">${meta ? `<span>${esc(meta)}</span>` : ''}${sp ? mssSpoilerTag(n) : ''}</div>
        ${blur && sp ? mssSpoilerHTML(text, { compact: true, id, e: n }) : text}
        <div class="nc-foot"><span class="nc-stats"><span class="nc-words"><b>${w}</b> ${w === 1 ? 'word' : 'words'}</span>${stats}</span><span class="nc-read" aria-hidden="true">Read →</span></div>
      </div>
    </article>`;
  }

  /* ── The featured note: pinned, else the latest (owner: the Library's Watching card look, the Edit page's ring) ── */
  const featured = (list, pinId) => (pinId && list.find(e => e.id === pinId && has(e)))
    || [...list].filter(has).sort((a, b) => new Date(watchedDate(b)) - new Date(watchedDate(a)))[0] || null;
  function featuredHTML(e, { open = '', pinned, blur } = {}) {
    const w = words(e.notes), s = liveScore(e), sp = mssIsSpoiler(e);
    const bd = e.tmdb_id || e.ratings?._backdrop ? MSSBackdrop.key(e) : '', art = safeURL(e.poster_url) ? safeURL(e.poster_url).replace(/\/(w\d+|original)\//, '/w342/') : '';
    const frame = MSSBackdrop.style(e, false, 'big');
    const text = `<p class="nf-text" translate="no">${esc(excerpt(e.notes))}</p>`;
    const ring = s != null && typeof MSSViews !== 'undefined' ? MSSViews.ring(s, '', e.status === 'dropped') : s != null ? mssScoreHTML(s, { cls: 'nf-score' }) : '';
    return `<article class="nf-card" onclick="${open}" role="button" tabindex="0" ${enterKey} aria-label="Read the ${pinned ? 'pinned' : 'latest'} note on ${esc(e.title)}">
      ${bd || art ? `<span class="msf-row__art nf-art${bd ? ' is-bd' : ''}"${bd ? ` data-bd="${esc(bd)}"` : ''}${art ? ` data-poster="${esc(art)}"` : ''}${!bd && art ? ` style="background-image:url('${art}')"` : frame ? ` style="${esc(frame)}"` : ''} aria-hidden="true"></span>` : ''}
      <span class="nf-shade" aria-hidden="true"></span>
      ${poster(e, 'nf-poster')}
      <div class="nf-body">
        <p class="nf-label">${pinned ? `${icon('pin', 11)} Pinned note` : 'Latest note'}${watchedDate(e) ? ` · ${esc(date(watchedDate(e), true))}` : ''}</p>
        <h2 class="nf-title" translate="no">${esc(e.title)}</h2>
        ${blur && sp ? mssSpoilerHTML(text, { compact: true, id: e.id, e }) : text}
        <span class="nf-link">Read the full note · ${w} ${w === 1 ? 'word' : 'words'} <span aria-hidden="true">→</span></span>
      </div>
      ${ring ? `<div class="nf-ring">${ring}</div>` : ''}
    </article>`;
  }

  /* ── View more: 20 at a time ── */
  const more = (left, fn) => left > 0 ? `<div class="nc-more"><button type="button" class="btn-secondary nc-more-btn" onclick="${fn}">View more <span class="nc-more-n">${left} more</span></button></div>` : '';

  /* ── The pinned note: one per person (profiles.pinned_note_id, sql/123 — this device until it runs) ── */
  const pins = {}, LOCAL = uid => 'msf_pinned_note_' + uid;
  const local = uid => { try { return localStorage.getItem(LOCAL(uid)) || null; } catch { return null; } };
  function pinnedId(uid) {
    if (!uid) return Promise.resolve(null);
    return pins[uid] ||= sb.from('profiles').select('pinned_note_id').eq('id', uid).maybeSingle()
      .then(({ data, error }) => error ? (uid === window._navUser?.id ? local(uid) : null) : data?.pinned_note_id || null)
      .catch(() => null);
  }
  async function setPin(e) {
    const uid = window._navUser?.id || (await getCurrentUser())?.id; if (!uid) return;
    const id = e ? e.id : null;
    const { error } = await sb.from('profiles').update({ pinned_note_id: id }).eq('id', uid);
    if (error) { try { id ? localStorage.setItem(LOCAL(uid), id) : localStorage.removeItem(LOCAL(uid)); } catch {} }   // sql/123 not run yet
    pins[uid] = Promise.resolve(id);
    document.dispatchEvent(new CustomEvent('mss:notepin', { detail: { id } }));
  }
  // Pin this note; another already pinned → ask which one stays
  async function pinOrAsk(e) {
    const uid = window._navUser?.id;
    const cur = await pinnedId(uid);
    if (cur && cur !== e.id) {
      const { data: old } = await sb.from('entries').select('title, notes, note_visibility').eq('id', cur).maybeSingle();
      // a Friends / Private note's text lives elsewhere (069), so its entries.notes is empty
      if (old && (has(old) || old.note_visibility !== 'anyone') && !(await showConfirm({ title: `Pin ${e.title || 'this note'} instead?`, danger: false, iconName: 'pin',
        message: `Your note on ${old.title || 'another title'} is pinned now. Only one note can be pinned at a time.`,
        confirmText: `Pin ${e.title || 'this note'}`, cancelText: `Keep ${old.title || 'the current pin'}` }))) return false;
    }
    await setPin(e);
    showToast('Note pinned. It’s at the top of your Notes.');
    return true;
  }
  // a note's text was deleted: it can't stay pinned
  async function unpinIfGone(e) {
    if (!has(e) && (await pinnedId(window._navUser?.id)) === e.id) await setPin(null);
  }

  return { cardHTML, featuredHTML, featured, reactionCounts, more, PAGE, pinnedId, setPin, pinOrAsk, unpinIfGone, words, readMins, date, watchedDate };
})();
