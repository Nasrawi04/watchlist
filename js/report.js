/* ═══════════════════════════════════════════════════════════════
   report.js — Report something (086_reports.sql)
   Loaded the first time someone taps Report (mssReport() in config.js).

   MSSReport.open(kind, id, { what, name })
     kind:  user · comment · note_reply · list_reply · note · entry · list ·
            poll · poll_comment · episode_chat · ep_note · ep_note_reply (109)
     what:  how to call it in the title ("comment", "list", "@sam") — optional
   Pick a reason, add a note if you like, Send → the popup closes with a toast.
   The admins see it in Admin → Safety → Reports. The person reported is
   never told who reported them.
═══════════════════════════════════════════════════════════════ */
const MSSReport = (() => {
  const REASONS = [
    ['spam', 'Spam or scam', 'Ads, links, the same thing posted again and again'],
    ['harassment', 'Bullying or harassment', 'Picking on someone, threats, sharing private info'],
    ['offensive', 'Hateful or offensive', 'Slurs, hate, graphic violence'],
    ['sexual', 'Sexual content', 'Nudity or sexual pictures or words'],
    ['copyright', 'Stolen picture or work', 'Someone else’s photo or artwork used without permission'],
    ['other', 'Something else', 'Tell us below'],
  ];
  const WHAT = { user: 'this person', comment: 'this comment', note_reply: 'this reply', list_reply: 'this reply',
    note: 'this note', entry: 'these pictures', list: 'this list', poll: 'this poll', poll_comment: 'this comment', episode_chat: 'this message',
    ep_note: 'this note', ep_note_reply: 'this reply' };
  let cur = null;   // { kind, id }

  // a side panel S (full page on phones): the reasons, a note, Send report (on until a reason is picked)
  let panel = null;
  function close() { panel?.close(); }

  async function open(kind, id, o = {}) {
    if (!window._navUser?.id) { if (typeof mssJoin === 'function') mssJoin('report things'); return; }
    if (!kind || !id) return;
    cur = { kind, id };
    const what = o.what || WHAT[kind] || 'this';
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: `Report ${what}`,
      body: `<p class="lyr-hint rpt-lead">What’s wrong with it? Only the MyScreenFolio team sees reports — ${kind === 'user' ? 'they' : 'whoever posted it'} won’t know it was you.</p>
      <form class="rpt-form" novalidate>
        <div class="rpt-reasons" role="radiogroup" aria-label="Reason">${REASONS.map(([k, l, s]) => `
          <label class="rpt-reason"><input type="radio" name="rpReason" value="${k}">
            <span><b>${l}</b><small>${s}</small></span></label>`).join('')}</div>
        <textarea class="lyr-field rpt-details" maxlength="500" rows="3" placeholder="Anything else we should know? (optional)" aria-label="More details (optional)"></textarea>
        <div class="rpt-err" role="alert"></div>
      </form>`,
      footer: { secondary: [{ label: 'Cancel', only: 'side', onClick: x => x.close() }], primary: { label: 'Send report', disabled: true, onClick: () => submit(h.body.querySelector('.rpt-form')) } },
      onClose: () => { if (panel === h) { panel = null; cur = null; } } });
    panel = h;
    const form = h.body.querySelector('.rpt-form');
    form.addEventListener('change', () => { h.setPrimary({ disabled: !form.querySelector('input[name=rpReason]:checked') }); form.querySelector('.rpt-err').textContent = ''; });
    form.addEventListener('submit', e => { e.preventDefault(); submit(form); });
  }

  async function submit(form) {
    const reason = form.querySelector('input[name=rpReason]:checked')?.value;
    if (!reason || !cur) return;
    const details = form.querySelector('.rpt-details').value.trim();
    const err = form.querySelector('.rpt-err');
    if (reason === 'other' && !details) { err.textContent = 'Tell us a little about what’s wrong.'; form.querySelector('.rpt-details').focus(); return; }
    try {
      await reportContent(cur.kind, cur.id, reason, details);
      done();
    } catch (e) {
      const code = String(e?.message || '');
      err.textContent = e?.hint || (code.includes('NOT_SIGNED_IN') ? 'Sign in to report.' : 'Couldn’t send that — try again.');
    }
  }

  // sent → the popup closes and a toast says thanks
  function done() {
    panel?.closeNow();
    showToast('Report sent — thanks, we’ll take a look.');
  }

  return { open, close };
})();
