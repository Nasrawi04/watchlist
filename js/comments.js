/* ═══════════════════════════════════════════════════════════════
   comments.js — THE comments popup (MSSComments), used on every page
   that shows comments on a library entry (category pages, Completed,
   Library, Profile, someone's profile, the Edit page).

   Header: poster · title · category + genres · count. Below: comments
   with replies (usernames link to profiles, @mentions highlighted),
   Reply / delete (your own, after a confirm), and a Write a comment box.

   Usage:
     MSSComments.open(entry, {
       onChange(count),     // optional: after a post / delete (e.g. update a "Comments (3)" label)
     })
     MSSComments.close()
     MSSComments.count(entryId) → Promise<number>
     MSSComments.buttonHTML(onclickJS)   // the small "Comments" strip button

   Requires config.js (MSSDialog, escHTML, icon, showConfirm, showToast,
   mssProfileLinkHTML, posterHTML, CAT_META, isRateLimitError) and
   db.js (getComments, addComment, deleteComment, getCurrentUser).
   Styles: .mcm-* (popup) + .cc-* / .det-reply-* (comments) in style.css.
═══════════════════════════════════════════════════════════════ */

const MSSComments = (() => {
  let cur = null;        // { e, o }
  let replyFor = null;   // comment id with an open reply box
  const $ = id => document.getElementById(id);
  const fmt = d => new Date(d).toLocaleDateString(MSSI18n.locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const mention = s => escHTML(s || '').replace(/(@\w+)/g, '<span class="mcm-mention">$1</span>');
  const errMsg = (e, fallback) => (typeof isRateLimitError === 'function' && isRateLimitError(e) && typeof RATE_LIMIT_MESSAGE !== 'undefined') ? RATE_LIMIT_MESSAGE : fallback;

  function buttonHTML(onclick) {
    return `<button type="button" class="cc-strip" onclick="${onclick}">${icon('comment', 11)}<span>Comments</span></button>`;
  }

  function inject() {
    if ($('mssCommentsOverlay')) return;
    const el = document.createElement('div');
    el.id = 'mssCommentsOverlay';
    el.innerHTML = `<div id="mssCommentsCard" role="dialog" aria-modal="true" aria-labelledby="mssCommentsTitle">
        <div class="mcm-head">
          <div class="mcm-poster" id="mssCommentsPoster"></div>
          <div class="mcm-info">
            <div class="mcm-title" id="mssCommentsTitle" translate="no"></div>
            <div class="mcm-tags" id="mssCommentsTags"></div>
            <div class="mcm-count" id="mssCommentsCount"></div>
          </div>
          <button type="button" class="mcm-close" onclick="MSSComments.close()" aria-label="Close">✕</button>
        </div>
        <div class="mcm-list" id="mssCommentsList" aria-live="polite"></div>
        <div class="mcm-form cc-form">
          <input class="cc-input" id="mssCommentsInput" maxlength="1000" placeholder="Write a comment…" aria-label="Write a comment" autocomplete="off">
          <button type="button" class="cc-send" onclick="MSSComments._post()">Send</button>
        </div>
      </div>`;
    MSSDialog.bind(el, close);
    document.body.appendChild(el);
    $('mssCommentsInput').addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); post(); }
    });
    // Reply / delete / send-reply buttons in the list (no inline ids in onclick strings)
    $('mssCommentsList').addEventListener('click', ev => {
      const b = ev.target.closest('[data-mcm]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.mcm === 'reply') reply(id, b.dataset.user);
      else if (b.dataset.mcm === 'del') del(id);
      else if (b.dataset.mcm === 'send') postReply(id);
      else if (b.dataset.mcm === 'cancel') closeReply();
    });
    $('mssCommentsList').addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey && ev.target.matches('.det-reply-input')) { ev.preventDefault(); postReply(ev.target.dataset.id); }
    });
  }

  function open(e, o = {}) {
    if (!e || !e.id) return;
    inject();
    cur = { e, o };
    replyFor = null;
    $('mssCommentsPoster').innerHTML = posterHTML(e);
    $('mssCommentsTitle').textContent = e.title || '';
    const tags = [CAT_META?.[e.cat]?.label, ...(e.genres || []).slice(0, 2)].filter(Boolean);
    $('mssCommentsTags').innerHTML = tags.map(t => `<span class="w-ep-badge">${escHTML(t)}</span>`).join('');
    $('mssCommentsCount').textContent = '';
    $('mssCommentsInput').value = '';
    $('mssCommentsList').innerHTML = '<div class="cc-none mcm-empty">Loading…</div>';
    MSSDialog.open($('mssCommentsOverlay'), { focus: window.matchMedia('(max-width:640px)').matches ? null : '#mssCommentsInput' });
    load();
  }

  function close() {
    MSSDialog.close($('mssCommentsOverlay'));
    cur = null; replyFor = null;
  }

  function itemHTML(c, me, isReply) {
    const user = c.profiles?.username || 'Unknown';
    const who = mssProfileLinkHTML({ id: c.author_id, username: c.profiles?.username }, '@' + escHTML(user));
    const del = c.author_id === me ? `<button type="button" class="cc-del" data-mcm="del" data-id="${escHTML(c.id)}">Delete</button>` : '';
    if (isReply) return `<div class="det-reply-item">
        <div class="det-reply-author">${who}</div>
        <div class="det-reply-text" translate="no">${mention(c.content)}</div>
        <div class="det-reply-meta"><span>${fmt(c.created_at)}</span>${del}</div>
      </div>`;
    return `<div class="cc-comment"><div class="cc-comment-body">
        <div class="cc-author">${who}</div>
        <div class="cc-text" translate="no">${mention(c.content)}</div>
        <div class="cc-meta"><span>${fmt(c.created_at)}</span>
          <button type="button" class="cc-reply-btn" data-mcm="reply" data-id="${escHTML(c.id)}" data-user="${escHTML(user)}">Reply</button>${del}
        </div>
        ${c._replies.map(r => itemHTML(r, me, true)).join('')}
        <div class="mcm-reply-slot" id="mcmReply-${escHTML(c.id)}"></div>
      </div></div>`;
  }

  async function load() {
    if (!cur) return;
    const e = cur.e, list = $('mssCommentsList');
    try {
      const [comments, user] = await Promise.all([getComments(e.id), getCurrentUser()]);
      if (!cur || cur.e !== e) return;
      const me = user?.id;
      const top = comments.filter(c => !c.reply_to);
      top.forEach(c => { c._replies = comments.filter(r => r.reply_to === c.id); });
      list.innerHTML = top.length ? top.map(c => itemHTML(c, me, false)).join('')
        : '<div class="cc-none mcm-empty">No comments yet — be the first!</div>';
      $('mssCommentsCount').textContent = comments.length ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : '';
      replyFor = null;
      return comments.length;
    } catch (err) {
      console.error(err);
      list.innerHTML = '<div class="cc-none mcm-empty">Couldn’t load comments.</div>';
    }
  }

  async function changed() {
    const n = await load();
    if (n != null) cur?.o.onChange?.(n);
  }

  async function post() {
    const input = $('mssCommentsInput'), content = input.value.trim();
    if (!content || !cur) return;
    input.disabled = true;
    try {
      await addComment(cur.e.id, content);
      input.value = '';
      await changed();
    } catch (err) {
      showToast(errMsg(err, 'Could not post comment.'), 'err');
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  function closeReply() {
    if (replyFor) { const box = $('mcmReply-' + replyFor); if (box) box.innerHTML = ''; }
    replyFor = null;
  }

  function reply(id, user) {
    const again = replyFor === id;
    closeReply();
    if (again) return;
    const box = $('mcmReply-' + id);
    if (!box) return;
    replyFor = id;
    box.innerHTML = `<div class="det-reply-form">
        <input class="det-reply-input" id="mcmReplyInput" data-id="${escHTML(id)}" maxlength="1000" value="@${escHTML(user)} " aria-label="Reply to @${escHTML(user)}">
        <button type="button" class="det-reply-send" data-mcm="send" data-id="${escHTML(id)}">Send</button>
        <button type="button" class="det-comment-del" data-mcm="cancel" aria-label="Cancel reply">✕</button>
      </div>`;
    const inp = $('mcmReplyInput');
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }

  async function postReply(id) {
    const input = $('mcmReplyInput'), content = input?.value.trim();
    if (!content || !cur) return;
    input.disabled = true;
    try {
      await addComment(cur.e.id, content, id);
      await changed();
    } catch (err) {
      showToast(errMsg(err, 'Could not post reply.'), 'err');
      input.disabled = false;
    }
  }

  async function del(id) {
    if (!(await showConfirm({ title: 'Delete comment?', message: 'This comment will be permanently removed.', confirmText: 'Delete', iconName: 'trash' }))) return;
    try {
      await deleteComment(id);
      await changed();
    } catch (err) {
      showToast('Could not delete comment.', 'err');
    }
  }

  async function count(entryId) {
    try { return (await getComments(entryId)).length; } catch { return 0; }
  }

  return { open, close, count, buttonHTML, _post: post };
})();
