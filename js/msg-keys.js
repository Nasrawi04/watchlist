/* ══════════════════════════════════════════
   msg-keys.js — encryption for Messages (099, 100)

   Each account has one key pair. The private key is stored on the server locked
   with a key made from the account password (Argon2id), so signing in on any
   device opens it and the server only ever holds the locked copy. This device
   then keeps it in IndexedDB until you sign out.

   A key is never replaced by accident. When the password changes, the device that
   holds the key locks it again, and every other device asks for the password once.
   If nothing here can open it, the choice is the person's: a recovery code, the old
   password, another signed-in device, or starting fresh, which permanently deletes
   their side of every chat and the old key (102).

     MSSKeys.status()              'ready' | 'password' (type it here) | 'not-allowed'
     MSSKeys.afterLogin(password)  sign-in / sign-up: sets this device up, never throws
     MSSKeys.unlock(password)      'ok' | 'locked' (right password, key can't open) | 'wrong'
     MSSKeys.recover(secret, pw)   'locked' next step, a code or old password → 'ok' | 'wrong'
     MSSKeys.startFresh(pw)        deletes your side of every chat, new key → true | false
     MSSKeys.onPasswordChange(new) locks the key with the new password → true,
                                   false: this device doesn't hold the key
     MSSKeys.createRecovery(pw)    → the code | null (wrong password) | throws NO_KEY_HERE
     MSSKeys.recoveryOn()          a recovery code is saved
     MSSKeys.withPassword(pw, fn)  a short-lived sign-in to prove the password → fn(client)
     MSSKeys.encrypt(obj, theirPub)   { ciphertext, nonce, sender_pub, recipient_pub }
     MSSKeys.decrypt(row)             the object, or null if it can't be read
     MSSKeys.publicKeyOf(userId)      { pub, changed } (changed: differs from last time)

   Messages use crypto_box: both people's keys open the same ciphertext.
   Passcode (MSSLock, below): a lock screen, not encryption — 4–6 digits are far too
   few to protect a key.
══════════════════════════════════════════ */
const MSSKeys = (() => {
  const LIB = 'js/vendor/sodium-sumo-0.8.4.js';
  const KDF = { alg: 'argon2id13', ops: 4, mem: 67108864 };   // 64 MB: slow to guess, still fine on a phone
  let S = null, kp = null, bundle = null;   // sodium · { uid, pub, sk } once opened · msg_my_key

  async function lib() {
    if (S) return S;
    if (!window.sodium) await mssLoadScript(LIB);
    await window.sodium.ready;
    return (S = window.sodium);
  }
  const b64 = u => S.to_base64(u, S.base64_variants.URLSAFE_NO_PADDING);
  const unb64 = t => S.from_base64(t, S.base64_variants.URLSAFE_NO_PADDING);
  const uid = async () => (await sb.auth.getSession()).data.session?.user || null;

  /* ── This device's copy (IndexedDB), under a browser key that can't be exported ── */
  const db = () => new Promise((ok, no) => {
    const r = indexedDB.open('msf-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  const idb = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('keys', mode), q = fn(t.objectStore('keys')); t.oncomplete = () => { d.close(); ok(q.result); }; t.onerror = () => { d.close(); no(t.error); }; }); };
  async function saveLocal(id, pub, sk, salt) {
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, sk);
    await idb('readwrite', s => s.put({ pub, salt, aes, iv, ct }, id));
  }
  async function readLocal(id) {
    const row = await idb('readonly', s => s.get(id)).catch(() => null);
    if (!row) return null;
    const sk = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, row.aes, row.ct));
    return { uid: id, pub: row.pub, salt: row.salt, sk };
  }

  /* ── The locked copy on the server ── */
  function lockKey(password, salt, k = KDF) { return S.crypto_pwhash(S.crypto_secretbox_KEYBYTES, password, salt, k.ops, k.mem, S.crypto_pwhash_ALG_ARGON2ID13); }
  function wrap(sk, password) {
    const salt = S.randombytes_buf(S.crypto_pwhash_SALTBYTES), nonce = S.randombytes_buf(S.crypto_secretbox_NONCEBYTES);
    const box = S.crypto_secretbox_easy(sk, nonce, lockKey(password, salt));
    return { wrapped: b64(nonce) + '.' + b64(box), salt: b64(salt) };
  }
  function unwrap(bundle, password) {
    try {
      const [n, box] = bundle.wrapped_key.split('.');
      return S.crypto_secretbox_open_easy(unb64(box), unb64(n), lockKey(password, unb64(bundle.salt), bundle.kdf?.ops ? bundle.kdf : KDF));
    } catch { return null; }
  }
  const myBundle = async () => { const { data, error } = await sb.rpc('msg_my_key'); if (error) throw error; return (bundle = data); };
  const upload = async (pub, w) => { const { error } = await sb.rpc('msg_set_key', { p_public: pub, p_wrapped: w.wrapped, p_salt: w.salt, p_kdf: KDF }); if (error) throw error; };
  async function allowed() {
    const { data } = await sb.rpc('my_age');
    return data === 'adult' || data === 'teen16';
  }

  /* ── Recovery code: 24 letters and digits (120 random bits), so a fast hash is enough ── */
  const CODE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const newCode = () => Array.from({ length: 24 }, (_, i) => CODE[S.randombytes_uniform(32)] + (i % 4 === 3 && i < 23 ? '-' : '')).join('');
  const cleanCode = t => String(t).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const codeKey = (code, salt) => S.crypto_generichash(S.crypto_secretbox_KEYBYTES, S.from_string(code), salt);
  function openCode(b, code) {
    try {
      const [n, box] = b.recovery_wrapped.split('.');
      return S.crypto_secretbox_open_easy(unb64(box), unb64(n), codeKey(code, unb64(b.recovery_salt)));
    } catch { return null; }
  }
  function openWith(b, secret) {            // a recovery code or an old password
    const code = cleanCode(secret);
    return (b.recovery_wrapped && code.length === 24 && openCode(b, code)) || unwrap(b, secret);
  }

  /* ── Getting the key onto this device ── */
  async function use(id, b, sk, salt) {
    await saveLocal(id, b.public_key, sk, salt);
    kp = { uid: id, pub: b.public_key, sk };
  }
  async function relock(id, b, sk, password) {
    const w = wrap(sk, password);
    await upload(b.public_key, w);
    await use(id, b, sk, w.salt);
  }
  // The password is known to be right here. 'ok', or 'locked' when nothing on this device can open the key.
  async function settle(id, b, password, sk) {
    if (sk && !b.password_stale) { await use(id, b, sk, b.salt); return 'ok'; }
    if (sk) { await relock(id, b, sk, password); return 'ok'; }
    const prev = await readLocal(id);
    if (prev?.pub === b.public_key) { await relock(id, b, prev.sk, password); return 'ok'; }
    await sb.rpc('msg_key_mark_stale');
    return 'locked';
  }
  async function createKey(id, password) {
    const k = S.crypto_box_keypair(), w = wrap(k.privateKey, password);
    await upload(b64(k.publicKey), w);
    await use(id, await myBundle(), k.privateKey, w.salt);
  }

  async function status() {
    const u = await uid();
    if (!u || !(await allowed())) return 'not-allowed';
    await lib();
    const [local, server] = await Promise.all([readLocal(u.id), myBundle()]);
    kp = null;
    if (local && server && local.pub !== server.public_key) await mssForgetKeys(u.id);   // started fresh on another device
    // A password change keeps this device's copy until the password is typed: it may be the only one left
    else if (local && server && local.salt === server.salt && !server.password_stale) { kp = local; return 'ready'; }
    return 'password';
  }

  async function afterLogin(password) {
    try {
      const u = await uid();
      if (!u || !password || !(await allowed())) return;
      await lib();
      const server = await myBundle();
      if (server) await settle(u.id, server, password, unwrap(server, password)); else await createKey(u.id, password);
    } catch (e) { console.warn('Messages keys:', e); }
  }

  async function withPassword(password, fn) {
    const u = await uid();
    const temp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'msf-verify' } });
    const { error } = await temp.auth.signInWithPassword({ email: u.email, password });
    if (error) return false;
    try { await fn?.(temp); } finally { await temp.auth.signOut({ scope: 'local' }).catch(() => {}); }
    return true;
  }
  async function unlock(password) {
    const u = await uid();
    await lib();
    const server = await myBundle(), sk = server && unwrap(server, password);
    // Opening the key proves the password, unless the key still uses an older one
    if ((!sk || server.password_stale) && !(await withPassword(password))) return 'wrong';
    if (!server) { await createKey(u.id, password); return 'ok'; }
    return settle(u.id, server, password, sk);
  }
  async function recover(secret, password) {
    const u = await uid(), server = await myBundle(), sk = server && openWith(server, secret);
    if (!sk) return 'wrong';
    await relock(u.id, server, sk, password);
    return 'ok';
  }
  async function startFresh(password) {
    const u = await uid(), k = S.crypto_box_keypair(), w = wrap(k.privateKey, password);
    const ok = await withPassword(password, async c => {
      const { error } = await c.rpc('msg_start_fresh', { p_public: b64(k.publicKey), p_wrapped: w.wrapped, p_salt: w.salt, p_kdf: KDF });
      if (error) throw error;
    });
    if (ok) await use(u.id, await myBundle(), k.privateKey, w.salt);
    return ok;
  }
  async function onPasswordChange(password) {
    const u = await uid();
    if (!u) return false;
    await lib();
    const server = await myBundle();
    if (!server) return true;
    const local = await readLocal(u.id);
    if (local?.pub === server.public_key) { await relock(u.id, server, local.sk, password); return true; }
    await sb.rpc('msg_key_mark_stale');
    return false;
  }

  /* ── Recovery code (Settings) ── */
  async function createRecovery(password) {
    if ((await status()) !== 'ready') throw new Error('NO_KEY_HERE');
    const code = newCode(), salt = S.randombytes_buf(32), nonce = S.randombytes_buf(S.crypto_secretbox_NONCEBYTES);
    const box = S.crypto_secretbox_easy(kp.sk, nonce, codeKey(cleanCode(code), salt));
    const ok = await withPassword(password, async c => {
      const { error } = await c.rpc('msg_set_recovery', { p_public: kp.pub, p_wrapped: b64(nonce) + '.' + b64(box), p_salt: b64(salt) });
      if (error) throw error;
    });
    await myBundle();
    return ok ? code : null;
  }
  const recoveryOn = () => !!bundle?.recovery_wrapped;

  /* ── Messages ── */
  function encrypt(obj, theirPub) {
    const nonce = S.randombytes_buf(S.crypto_box_NONCEBYTES);
    const box = S.crypto_box_easy(S.from_string(JSON.stringify(obj)), nonce, unb64(theirPub), kp.sk);
    return { ciphertext: b64(box), nonce: b64(nonce), sender_pub: kp.pub, recipient_pub: theirPub };
  }
  function decrypt(row) {
    try {
      const mine = row.sender_pub === kp.pub, theirs = mine ? row.recipient_pub : row.sender_pub;
      if (!mine && row.recipient_pub !== kp.pub) return null;
      return JSON.parse(S.to_string(S.crypto_box_open_easy(unb64(row.ciphertext), unb64(row.nonce), unb64(theirs), kp.sk)));
    } catch { return null; }
  }
  const pubs = {};
  async function publicKeyOf(id, fresh) {
    if (pubs[id] && !fresh) return pubs[id];
    const { data, error } = await sb.rpc('msg_public_key', { p_user: id });
    if (error) throw error;
    if (!data) return { pub: null, changed: false };
    let changed = false;
    try {
      const key = `msf_pub_${kp?.uid}_${id}`, was = localStorage.getItem(key);
      changed = !!was && was !== data;
      localStorage.setItem(key, data);
    } catch {}
    return (pubs[id] = { pub: data, changed });
  }
  return { status, afterLogin, unlock, recover, startFresh, onPasswordChange, createRecovery, recoveryOn, withPassword, encrypt, decrypt, publicKeyOf, get me() { return kp?.pub || null; } };
})();

/* ══ MSSLock — the optional passcode (4–6 digits, 100_message_passcode.sql)
   A lock screen on Messages that follows your account. It keeps out someone holding
   your unlocked phone; it isn't what protects the messages. Stays open for this tab
   until 5 minutes pass without using Messages. ══ */
const MSSLock = (() => {
  const KEY = 'msf_msg_open', IDLE = 5 * 60000;
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const status = () => rpc('msg_lock_status');                     // { on, wait }
  const isOpen = () => { try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < IDLE; } catch { return false; } };
  const touch = () => { try { sessionStorage.setItem(KEY, String(Date.now())); } catch {} };
  const close = () => { try { sessionStorage.removeItem(KEY); } catch {} };
  async function verify(pin) {                                     // { ok, wait }
    const r = await rpc('msg_lock_verify', { p_pin: pin });
    if (r.ok) touch();
    return r;
  }
  const set = (pin, current) => rpc('msg_lock_set', { p_pin: pin, p_current: current || null });
  const remove = current => rpc('msg_lock_clear', { p_current: current });
  // Forgot it: your account password turns it off
  async function resetWithPassword(password) { return MSSKeys.withPassword(password, async c => { const { error } = await c.rpc('msg_lock_clear', { p_current: null }); if (error) throw error; }); }
  return { status, isOpen, touch, close, verify, set, remove, resetWithPassword };
})();
