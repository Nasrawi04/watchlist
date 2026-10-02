/* ═══════════════════════════════════════════════════════════════
   note-popup.js — Personal note card + note popup (v632)

   The Notes page's "Personal" design, shared by the Notes page and the
   Notes tab on profile.html / profile-view.html:

     MSSNote.cardHTML(entry, { counts, onclick, blurSpoiler })
       → the nc-card: poster, title + score, type/genre/date tags,
         a 60-word preview, 👍/👎 counts and the word count
     MSSNote.open(entry, { counts, editable, eyebrow, onSaved })
       → the note popup: backdrop header, poster, tags, reactions and the
         full note. editable → "Edit Note" with the 500-word editor and
         the spoiler toggle; read-only → spoiler notes stay blurred until
         revealed.
     MSSNote.reactionCounts(entryIds) → { entryId: { like, dislike } }

   Small helpers the Notes page also uses for its Community notes:
     MSSNote.words · date · watchedDate · trim · badges · scorePill ·
     poster · loadHero · fitLong

   Styles: nc-* / np-* / .note-popup-overlay2 in style.css.
═══════════════════════════════════════════════════════════════ */

const MSSNote = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  let current = null, opts = {};

  /* ── Helpers ── */
  const words = t => (t || '').trim().split(/\s+/).filter(Boolean).length;
  // Date the title was watched (finished), falling back to when it was added
  const watchedDate = e => e.completed_date || e.created_at;
  function date(d, withDay) {
    if (!d) return '';
    const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
    return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', withDay ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: 'numeric' });
  }
  // Card preview only — popups always show the full note
  function trim(text) {
    if (!text) return '';
    const w = text.trim().split(/\s+/);
    return w.length > 60 ? w.slice(0, 60).join(' ') + '…' : text;
  }
  function poster(url, title, cls) {
    const u = safeURL(url);
    return `<div class="${cls}">${u ? `<img src="${u}" loading="lazy" alt="" data-letter="${esc((title || '?')[0])}" onerror="mssImgError(this)">` : esc((title || '?')[0].toUpperCase())}</div>`;
  }
  // Score exactly like the category list view: plain Bebas, olive, no pill
  const scorePill = v => v != null ? `<span class="nc-score">★ ${Number(v).toFixed(2)}</span>` : '';
  // Badges like the ratings popup: type-label for the type, w-ep-badge for genres and dates
  const NB = `style="font-family:'Manrope',var(--sans);font-weight:500;"`;
  function typeBadge(e) {
    const isMovie = e.cat === 'movies' || e.tmdb_type === 'movie' || e.ratings?._media_type === 'movie';
    const label = (e.cat && CAT_META[e.cat]?.label) || (isMovie ? 'Movie' : e.tmdb_type === 'tv' ? 'TV Show' : '');
    return label ? `<span class="${isMovie ? 'type-label' : 'type-label type-label-tv'}" ${NB}>${esc(label)}</span>` : '';
  }
  function badges(e, { genres = 3, dateLabel = '', date: d = '' } = {}) {
    return typeBadge(e)
      + (e.genres || []).slice(0, genres).map(g => `<span class="w-ep-badge" ${NB}>${esc(g)}</span>`).join('')
      + (d ? `<span class="w-ep-badge" ${NB}>${dateLabel ? esc(dateLabel) + ' ' : ''}${esc(d)}</span>` : '');
  }

  /* Popup header: the title's TMDB backdrop, crisp. Until it loads — or
     when a title has none — a softly blurred poster fills in. */
  const backdropCache = {};
  async function loadHero(el, item) {
    if (!el) return;
    el.classList.remove('is-backdrop');
    el.style.backgroundImage = safeURL(item.poster_url) ? cssURL(item.poster_url) : 'none';
    if (!item.tmdb_id || !item.tmdb_type) return;
    const key = `${item.tmdb_type}:${item.tmdb_id}`;
    let path = backdropCache[key];
    if (path === undefined) {
      try {
        const res = await tmdbFetch(`${TMDB_BASE}/${item.tmdb_type}/${item.tmdb_id}?api_key=${TMDB_KEY}&language=en-US`);
        path = res.ok ? ((await res.json()).backdrop_path || null) : null;
      } catch { path = null; }
      backdropCache[key] = path;
    }
    if (!path || !el.isConnected) return;
    const url = `https://image.tmdb.org/t/p/w1280${path}`;
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = cssURL(url); el.classList.add('is-backdrop'); };
    img.src = url;
  }
  // Long notes: shorter header, upright text, and a soft fade while there's more to scroll
  function fitLong(card, n) {
    if (!card) return;
    card.classList.toggle('np-long', n > 120);
    requestAnimationFrame(() => card.querySelectorAll('.np-body').forEach(b => {
      const upd = () => b.classList.toggle('np-more', b.scrollHeight - b.scrollTop - b.clientHeight > 8);
      b.onscroll = upd; upd();
    }));
  }

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

  /* ── Card ── */
  function cardHTML(e, { counts, onclick, blurSpoiler } = {}) {
    const c = counts || { like: 0, dislike: 0 };
    const n = words(e.notes);
    const quote = `<blockquote class="nc-quote">&ldquo;${esc(trim(e.notes))}&rdquo;</blockquote>`;
    return `<article class="nc-card" onclick="${onclick}">
      ${poster(e.poster_url, e.title, 'nc-poster')}
      <div class="nc-main">
        <div class="nc-top"><div class="nc-title">${esc(e.title)}</div>${scorePill(liveScore(e))}</div>
        <div class="nc-tags">${badges(e, { genres: 2, date: date(watchedDate(e), true) })}${mssIsSpoiler(e) ? mssSpoilerTag() : ''}</div>
        ${blurSpoiler && mssIsSpoiler(e) ? mssSpoilerHTML(quote, { compact: true }) : quote}
        <div class="nc-foot">
          <div class="nc-reacts">
            <span class="snote-react-btn" style="cursor:default;">${icon('thumbsUp', 13)} <span>${c.like}</span></span>
            <span class="snote-react-btn" style="cursor:default;">${icon('thumbsDown', 13)} <span>${c.dislike}</span></span>
          </div>
          <span class="nc-words"><b>${n}</b> ${n === 1 ? 'word' : 'words'}</span>
        </div>
      </div>
    </article>`;
  }

  /* ── Popup ── */
  const PEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  function inject() {
    if (document.getElementById('mssNoteOverlay')) return;
    const el = document.createElement('div');
    el.className = 'note-popup-overlay2';
    el.id = 'mssNoteOverlay';
    el.innerHTML = `<div class="note-popup2 np-card" role="dialog" aria-modal="true" aria-labelledby="mssNoteTitle">
        <div class="mss-views" id="mssNoteViews"></div>
        <div class="np-hero">
          <div class="np-hero-blur" id="mssNoteBlur"></div>
          <div class="np-hero-fade"></div>
          <button type="button" class="np-close" onclick="MSSNote.close()" aria-label="Close">&#x2715;</button>
        </div>
        <div class="np-head">
          <div class="np-poster" id="mssNotePoster"></div>
          <div class="np-head-info">
            <div class="np-eyebrow" id="mssNoteEyebrow"></div>
            <div class="np-title" id="mssNoteTitle"></div>
            <div class="np-meta-row"><div class="np-meta" id="mssNoteTags"></div><span id="mssNoteScore" class="np-score-slot"></span></div>
          </div>
        </div>
        <div class="np-stats" id="mssNoteStats"></div>
        <div class="np-body" id="mssNoteViewBody"><div id="mssNoteText"></div></div>
        <div class="np-footer" id="mssNoteViewFooter">
          <div class="np-actions" id="mssNoteViewPopupActions"></div>
        </div>
        <div class="np-body" id="mssNoteEditBody" style="display:none">
          <textarea class="np-textarea" id="mssNoteTextarea" aria-label="Your note" placeholder="What did you think? Favorite moments, hot takes, anything…" oninput="MSSNote._count()"></textarea>
          <div class="np-count" id="mssNoteCount">0 / ${NOTE_WORD_LIMIT} words</div>
        </div>
        <div class="np-footer" id="mssNoteEditFooter" style="display:none">
          <div class="np-spoiler-wrap">${mssSpoilerToggleHTML('mssNoteSpoiler')}</div>
          <div class="np-actions" id="mssNoteEditPopupActions">
            <button type="button" class="popup-action-btn np-grow" id="mssNoteSave" onclick="MSSNote._save()">Save Note</button>
            <button type="button" class="popup-action-btn np-ghost" onclick="MSSNote._cancel()">Cancel</button>
          </div>
        </div>
      </div>`;
    el.addEventListener('click', ev => { if (ev.target === el) close(); });
    document.body.appendChild(el);
    guardLimit(document.getElementById('mssNoteTextarea'));
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !el.classList.contains('open')) return;
      if (document.getElementById('confirmOverlay')?.classList.contains('open')) return;
      close();
    });
  }

  function showView() {
    const e = current, $ = id => document.getElementById(id);
    const q = `<blockquote class="np-quote">&ldquo;${esc((e.notes || '').trim())}&rdquo;</blockquote>`;
    $('mssNoteText').innerHTML = !opts.editable && mssIsSpoiler(e) ? mssSpoilerHTML(q) : q;
    $('mssNoteViewPopupActions').innerHTML = (opts.editable
      ? `<button type="button" class="popup-action-btn np-grow" onclick="MSSNote._edit()">${PEN}Edit Note</button>` : '')
      + `<button type="button" class="popup-action-btn np-ghost${opts.editable ? '' : ' np-grow'}" onclick="MSSNote.close()">Close</button>`;
    ['mssNoteViewBody', 'mssNoteViewFooter'].forEach(id => { $(id).style.display = ''; });
    ['mssNoteEditBody', 'mssNoteEditFooter'].forEach(id => { $(id).style.display = 'none'; });
    fitLong(document.querySelector('#mssNoteOverlay .np-card'), words(e.notes));
  }
  function showEdit() {
    const e = current, $ = id => document.getElementById(id);
    const ta = $('mssNoteTextarea');
    ta.value = e.notes || '';
    $('mssNoteSpoiler').checked = mssIsSpoiler(e);
    updateCount();
    ['mssNoteViewBody', 'mssNoteViewFooter'].forEach(id => { $(id).style.display = 'none'; });
    ['mssNoteEditBody', 'mssNoteEditFooter'].forEach(id => { $(id).style.display = ''; });
    fitLong(document.querySelector('#mssNoteOverlay .np-card'), NOTE_WORD_LIMIT);   // editing: compact header, most room for typing
    setTimeout(() => ta.focus(), 100);
  }
  function stats() {
    const e = current, c = opts.counts || { like: 0, dislike: 0 }, n = words(e.notes);
    const el = document.getElementById('mssNoteStats');
    el.innerHTML = `<span>${icon('thumbsUp', 14)} <b>${c.like}</b></span><span>${icon('thumbsDown', 14)} <b>${c.dislike}</b></span><span><b>${n}</b> ${n === 1 ? 'word' : 'words'}</span>${mssIsSpoiler(e) ? mssSpoilerTag() : ''}`;
    el.style.display = (e.notes && e.notes.trim()) ? 'flex' : 'none';
  }

  function open(e, o = {}) {
    if (!e) return;
    inject();
    current = e; opts = o;
    const $ = id => document.getElementById(id);
    $('mssNoteViews').innerHTML = '';   // MSSViews fills it when switching views
    loadHero($('mssNoteBlur'), e);
    $('mssNotePoster').innerHTML = safeURL(e.poster_url) ? `<img src="${safeURL(e.poster_url)}" loading="lazy" alt="">` : esc(((e.title || '?')[0]).toUpperCase());
    $('mssNoteEyebrow').textContent = o.eyebrow || 'Your Note';
    $('mssNoteTitle').innerHTML = mssTitleLinkHTML(e, esc(e.title || ''));
    $('mssNoteScore').innerHTML = scorePill(liveScore(e));
    $('mssNoteTags').innerHTML = badges(e, { genres: 3, dateLabel: e.completed_date ? 'Completed On:' : 'Added On:', date: date(watchedDate(e), true) });
    stats();
    $('mssNoteOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    // An existing note opens read-only; a brand-new one goes straight to the editor
    if (e.notes && e.notes.trim()) showView(); else if (o.editable) showEdit(); else showView();
  }
  function close() {
    document.getElementById('mssNoteOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    current = null;
  }
  function cancel() {
    // A brand-new note has nothing to go back to — just close
    if (!current?.notes?.trim()) { close(); return; }
    showView();
  }

  async function save() {
    const e = current;
    if (!e) return;
    const btn = document.getElementById('mssNoteSave');
    const notes = document.getElementById('mssNoteTextarea').value.trim();
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const spoiler = !!document.getElementById('mssNoteSpoiler').checked;
      const ratings = { ...(e.ratings || {}), _notes_spoiler: spoiler && !!notes };
      const uid = window._navUser?.id || (await getCurrentUser()).id;
      const { error } = await sb.from('entries').update({ notes, ratings }).eq('id', e.id).eq('user_id', uid);
      if (error) throw error;
      e.notes = notes; e.ratings = ratings;
      close();
      opts.onSaved?.(e);
      showToast('Note saved!');
    } catch (err) {
      console.error('MSSNote save:', err);
      showToast('Error saving note.', 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Note';
    }
  }

  /* NOTE_WORD_LIMIT cap — blocks further typing at the limit instead of
     trimming after the fact, with a clear message when you hit it. */
  function updateCount() {
    const el = document.getElementById('mssNoteTextarea'), countEl = document.getElementById('mssNoteCount');
    const n = words(el.value);
    if (n > NOTE_WORD_LIMIT) {
      el.value = clampWords(el.value, NOTE_WORD_LIMIT);
      countEl.textContent = `Reached max word limit (${NOTE_WORD_LIMIT}/${NOTE_WORD_LIMIT} words)`;
      countEl.classList.add('over');
      return;
    }
    countEl.textContent = `${n} / ${NOTE_WORD_LIMIT} words`;
    countEl.classList.toggle('over', n >= NOTE_WORD_LIMIT);
  }
  function guardLimit(el) {
    el.addEventListener('beforeinput', ev => {
      if (ev.inputType && ev.inputType.startsWith('delete')) return;
      if (el.selectionStart !== el.selectionEnd) return;
      if (words(el.value) >= NOTE_WORD_LIMIT) {
        ev.preventDefault();
        const c = document.getElementById('mssNoteCount');
        c.textContent = `Reached max word limit (${NOTE_WORD_LIMIT}/${NOTE_WORD_LIMIT} words)`;
        c.classList.add('over');
      }
    });
  }

  return {
    cardHTML, open, close, reactionCounts,
    words, date, watchedDate, trim, badges, scorePill, poster, loadHero, fitLong,
    _edit: showEdit, _cancel: cancel, _save: save, _count: updateCount,
  };
})();
