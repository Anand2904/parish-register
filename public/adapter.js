/*
 * Firebase adapter for the Parish Family Register.
 *
 * The register's screens were first built for claude.ai, where the page reaches its
 * database, sign-in, file store and downloads through `claude.use(name)`.
 * This file provides the same calls on top of the parish's own Firebase project,
 * so the register's screens and workflows run unchanged on our own website.
 *
 *   claude.use("db")        -> Cloud Firestore
 *   claude.use("user")      -> Firebase Authentication + the `users` collection (roles)
 *   claude.use("assets")    -> Cloud Storage (photos, transfer letters, card copies)
 *   claude.use("downloads") -> ordinary browser downloads
 */
(function () {
  "use strict";
  const CFG = window.FIREBASE_CONFIG || {};
  const OWNER = String(CFG.ownerEmail || "").toLowerCase();
  if (!CFG.apiKey || CFG.apiKey.startsWith("PASTE")) {
    document.addEventListener("DOMContentLoaded", () => showGate("setup"));
  }
  firebase.initializeApp(CFG);
  const fs = firebase.firestore();
  const auth = firebase.auth();
  const storage = firebase.storage();
  // On a developer's computer, talk to the local Firebase emulators instead of the real project.
  if (["localhost", "127.0.0.1"].includes(location.hostname) && CFG.useEmulators !== false) {
    auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
    fs.useEmulator("127.0.0.1", 8080);
    storage.useEmulator("127.0.0.1", 9199);
  }
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  /* ---------------- sign-in gate ---------------- */
  let me = null;          // {uid, email, name}
  let role = null;        // "admin" | "staff" | null
  let resolveReady;
  const ready = new Promise(r => (resolveReady = r));

  const css = `
  #gate{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:var(--bg,#f3f6f5);padding:24px}
  #gate .card{background:var(--surface,#fff);border:1px solid var(--line,#d8e0dd);border-radius:14px;padding:28px;max-width:420px;width:100%;display:grid;gap:14px;font:14px/1.5 Inter,system-ui,sans-serif;color:var(--ink,#15201e)}
  #gate h1{margin:0;font:700 1.3rem "Bricolage Grotesque",system-ui,sans-serif}
  #gate p{margin:0;color:var(--muted,#5a6a66)}
  #gate input{font:inherit;padding:9px 10px;border:1px solid var(--line,#d8e0dd);border-radius:8px;width:100%;box-sizing:border-box;background:var(--surface,#fff);color:inherit}
  #gate button{font:inherit;font-weight:600;padding:9px 12px;border-radius:8px;border:1px solid var(--line,#d8e0dd);background:var(--surface,#fff);color:inherit;cursor:pointer}
  #gate button.primary{background:var(--accent,#1d5c55);border-color:var(--accent,#1d5c55);color:var(--accent-ink,#fff)}
  #gate .or{text-align:center;color:var(--muted,#5a6a66);font-size:.8rem}
  #gate .err{color:var(--bad,#b0372d)}
  #gate .row{display:flex;gap:8px;flex-wrap:wrap}
  #acct{display:flex;gap:8px;align-items:center;font-size:.8rem;color:var(--muted,#5a6a66)}
  #acct button{font:inherit;padding:4px 9px;border-radius:8px;border:1px solid var(--line,#d8e0dd);background:var(--surface,#fff);color:var(--ink,#15201e);cursor:pointer}`;
  document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  });

  function showGate(kind, detail) {
    let g = document.getElementById("gate");
    if (!g) { g = document.createElement("div"); g.id = "gate"; document.body.appendChild(g); }
    g.hidden = false;
    const church = (window.PARISH_NAME || "Parish Family Register");
    if (kind === "setup") {
      g.innerHTML = `<div class="card"><h1>Almost ready</h1><p>This copy of the register has no Firebase settings yet. Paste the project's web app settings into <b>public/firebase-config.js</b> and deploy again.</p></div>`;
      return;
    }
    if (kind === "denied") {
      g.innerHTML = `<div class="card"><h1>${esc(church)}</h1>
        <p>You're signed in as <b>${esc(detail)}</b>, but this account hasn't been given access to the register.</p>
        <p>Ask the parish office to invite this email address under <b>Church setup → Users</b>, then sign in again.</p>
        <div class="row"><button class="primary" id="g-retry">Try again</button><button id="g-out">Sign out</button></div></div>`;
      g.querySelector("#g-retry").onclick = () => location.reload();
      g.querySelector("#g-out").onclick = () => auth.signOut().then(() => location.reload());
      return;
    }
    if (kind === "verify") {
      g.innerHTML = `<div class="card"><h1>Confirm your email</h1>
        <p>We sent a confirmation link to <b>${esc(detail)}</b>. Open it, then press Continue.</p>
        <div class="row"><button class="primary" id="g-cont">Continue</button><button id="g-resend">Send the link again</button><button id="g-out">Sign out</button></div><p class="err" id="g-err"></p></div>`;
      g.querySelector("#g-cont").onclick = () => auth.currentUser.reload().then(() => location.reload());
      g.querySelector("#g-resend").onclick = () => auth.currentUser.sendEmailVerification().then(() => (g.querySelector("#g-err").textContent = "Link sent."));
      g.querySelector("#g-out").onclick = () => auth.signOut().then(() => location.reload());
      return;
    }
    g.innerHTML = `<div class="card"><h1>${esc(church)}</h1><p>Sign in with the account the parish office invited.</p>
      <button class="primary" id="g-google">Sign in with Google</button>
      <div class="or">or with email and password</div>
      <input id="g-email" type="email" placeholder="Email address" autocomplete="username">
      <input id="g-pass" type="password" placeholder="Password" autocomplete="current-password">
      <div class="row"><button id="g-in">Sign in</button><button id="g-new">Create password (first time)</button><button id="g-reset">Forgot password</button></div>
      <p class="err" id="g-err"></p></div>`;
    const err = m => (g.querySelector("#g-err").textContent = m);
    const em = () => g.querySelector("#g-email").value.trim(), pw = () => g.querySelector("#g-pass").value;
    const friendly = e => ({
      "auth/invalid-credential": "The email or password is wrong.", "auth/wrong-password": "The email or password is wrong.",
      "auth/user-not-found": "No account with that email yet. Use Create password (first time).",
      "auth/email-already-in-use": "This email already has a password. Use Sign in, or Forgot password.",
      "auth/weak-password": "Use a password of at least 8 characters.", "auth/invalid-email": "That email address doesn't look right.",
      "auth/popup-closed-by-user": "The Google window was closed before signing in.", "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again."
    })[e.code] || "Sign-in didn't work. Check your connection and try again.";
    g.querySelector("#g-google").onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => err(friendly(e)));
    g.querySelector("#g-in").onclick = () => auth.signInWithEmailAndPassword(em(), pw()).catch(e => err(friendly(e)));
    g.querySelector("#g-new").onclick = () => {
      if (pw().length < 8) return err("Choose a password of at least 8 characters.");
      auth.createUserWithEmailAndPassword(em(), pw()).then(c => c.user.sendEmailVerification()).catch(e => err(friendly(e)));
    };
    g.querySelector("#g-reset").onclick = () => { if (!em()) return err("Type your email address first."); auth.sendPasswordResetEmail(em()).then(() => err("A password reset link has been sent.")).catch(e => err(friendly(e))); };
  }
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function addAccountBar() {
    const host = document.querySelector(".top-actions"); if (!host || document.getElementById("acct")) return;
    const d = document.createElement("div"); d.id = "acct"; d.setAttribute("data-no-tr", "");
    d.innerHTML = `<span>${esc(me.email)}</span><button type="button" id="acct-out">Sign out</button>`;
    host.prepend(d);
    d.querySelector("#acct-out").onclick = () => auth.signOut().then(() => location.reload());
  }

  auth.onAuthStateChanged(async u => {
    if (!u) { role = null; me = null; showGate("login"); return; }
    const email = String(u.email || "").toLowerCase();
    const isPassword = u.providerData.some(p => p.providerId === "password");
    if (isPassword && !u.emailVerified) { showGate("verify", email); return; }
    me = { uid: u.uid, email, name: u.displayName || email.split("@")[0] };
    try {
      const ref = fs.collection("users").doc(u.uid);
      let snap = await ref.get();
      if (!snap.exists) {
        let newRole = null, approver = false;
        if (email === OWNER) newRole = "admin";
        else { const inv = await fs.collection("invites").doc(email).get(); if (inv.exists) newRole = inv.data().role; }
        if (newRole) { await ref.set({ email, name: me.name, role: newRole, createdAt: new Date().toISOString() }); snap = await ref.get(); }
      }
      role = snap.exists ? snap.data().role : null;
      if (snap.exists && snap.data().name !== me.name && u.displayName) ref.update({ name: me.name }).catch(() => {});
    } catch (e) { role = null; }
    if (role !== "admin" && role !== "staff") { showGate("denied", email); return; }
    const g = document.getElementById("gate"); if (g) g.hidden = true;
    addAccountBar();
    resolveReady();
  });

  /* ---------------- helpers ---------------- */
  function clean(v) {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = {}; for (const k of Object.keys(v)) { if (v[k] !== undefined) o[k] = clean(v[k]); } return o;
    }
    return typeof v === "number" && !isFinite(v) ? null : v;
  }
  const mapErr = e => {
    const code = ({ "permission-denied": "invalid_argument", "not-found": "invalid_argument", "invalid-argument": "invalid_argument",
      "resource-exhausted": "resource_exhausted", "unavailable": "unavailable", "unauthenticated": "revoked" })[e && e.code] || "unavailable";
    return { code, message: (e && e.message) || String(e) };
  };
  const wrapErr = p => p.catch(e => { throw mapErr(e); });
  const docSnap = s => ({ id: s.id, exists: s.exists, data: () => (s.exists ? s.data() : undefined),
    metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });
  const querySnap = q => ({ docs: q.docs.map(docSnap), size: q.size, empty: q.empty,
    docChanges: () => q.docChanges().map(c => ({ type: c.type, doc: docSnap(c.doc), oldIndex: c.oldIndex, newIndex: c.newIndex })),
    metadata: { fromCache: q.metadata.fromCache, hasPendingWrites: q.metadata.hasPendingWrites } });

  function wrapDoc(ref) {
    return {
      id: ref.id, path: ref.path,
      get: () => wrapErr(ref.get().then(docSnap)),
      set: data => wrapErr(ref.set(clean(data))),
      update: data => wrapErr(ref.update(clean(data))),
      delete: () => wrapErr(ref.delete()),
      collection: p => wrapCol(ref.collection(p)),
      onSnapshot: (next, error) => ref.onSnapshot({ includeMetadataChanges: false }, s => next(docSnap(s)), e => error && error(mapErr(e))),
      acquire: ({ holder, ttlMs }) => wrapErr(fs.runTransaction(async tx => {
        const s = await tx.get(ref), now = Date.now(), ttl = Math.min(600000, Math.max(1000, ttlMs || 30000));
        const lease = s.exists ? s.data().__lease : null;
        if (lease && lease.until > now && lease.holder !== holder) return { acquired: false, expiresAt: new Date(lease.until).toISOString() };
        tx.set(ref, { __lease: { holder, until: now + ttl } }, { merge: true });
        return { acquired: true, holder, expiresAt: new Date(now + ttl).toISOString() };
      }))
    };
  }
  function wrapQuery(q) {
    return {
      where: (f, op, v) => wrapQuery(q.where(f, op, v)),
      orderBy: (f, dir) => wrapQuery(q.orderBy(f, dir || "asc")),
      limit: n => wrapQuery(q.limit(n)),
      get: () => wrapErr(q.get().then(querySnap)),
      onSnapshot: (next, error) => q.onSnapshot(s => next(querySnap(s)), e => error && error(mapErr(e)))
    };
  }
  function wrapCol(col) {
    return Object.assign(wrapQuery(col), {
      path: col.path,
      doc: id => wrapDoc(id ? col.doc(id) : col.doc()),
      add: data => wrapErr(col.add(clean(data)).then(r => wrapDoc(r)))
    });
  }
  const DB = { doc: p => wrapDoc(fs.doc(p)), collection: p => wrapCol(fs.collection(p)) };

  /* ---------------- people ---------------- */
  let usersCache = null;
  async function allUsers() {
    if (!usersCache) { const s = await fs.collection("users").get(); usersCache = s.docs.map(d => ({ id: d.id, ...d.data() })); setTimeout(() => (usersCache = null), 60000); }
    return usersCache;
  }
  const USER = {
    id: async () => (me ? me.uid : null),
    me: async () => ({ id: me?.uid || null, name: me?.name || "", email: me?.email || null }),
    email: async () => me?.email || null,
    isOwner: async () => !!me && me.email === OWNER,
    canEdit: async () => role === "admin",
    can: async name => (name === "data.write" ? role === "admin" || role === "staff" : role === "admin"),
    profiles: async ids => { const list = await allUsers().catch(() => []); const out = {}; [].concat(ids).forEach(id => { const u = list.find(x => x.id === id); out[id] = { id, name: u ? (u.name || u.email) : "", email: u ? u.email : null, guest: false }; }); return out; },
    search: async q => { q = String(q || "").toLowerCase(); const list = await allUsers().catch(() => []); return list.filter(u => !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").includes(q)).map(u => ({ id: u.id, name: u.name || u.email, email: u.email, guest: false })); }
  };

  /* ---------------- files ---------------- */
  const urlCache = {};
  const ASSETS = {
    upload: async blob => {
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
      const ref = storage.ref("uploads/" + id);
      try { await ref.put(blob, { contentType: blob.type || "application/octet-stream" }); }
      catch (e) { throw { code: e.code === "storage/unauthorized" ? "not_granted" : "upstream_error", message: e.message }; }
      const url = await ref.getDownloadURL(); urlCache[id] = url;
      return { id, url, sizeBytes: blob.size, contentType: blob.type };
    },
    list: async () => ({ assets: [], usage: {} }),
    delete: async () => {}
  };
  // The register writes "/_blob/<id>" for photos and documents. Swap those for Storage links.
  async function resolveBlob(el, attr) {
    const v = el.getAttribute(attr); if (!v || !v.startsWith("/_blob/")) return;
    const id = v.slice(7); el.setAttribute(attr, "data:,");
    try { urlCache[id] = urlCache[id] || await storage.ref("uploads/" + id).getDownloadURL(); el.setAttribute(attr, urlCache[id]); }
    catch (e) { el.setAttribute(attr, ""); el.title = "File not available"; }
  }
  function scanBlobs(root) {
    if (!root || root.nodeType !== 1) return;
    const els = [root, ...root.querySelectorAll('img[src^="/_blob/"],a[href^="/_blob/"]')];
    els.forEach(el => { if (el.matches?.('img[src^="/_blob/"]')) resolveBlob(el, "src"); if (el.matches?.('a[href^="/_blob/"]')) resolveBlob(el, "href"); });
  }
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(scanBlobs))).observe(document.body, { childList: true, subtree: true });
    scanBlobs(document.body);
  });

  /* ---------------- downloads ---------------- */
  const DOWNLOADS = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".json") ? "application/json" : filename.endsWith(".csv") ? "text/csv;charset=utf-8" : "application/octet-stream" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return { status: "saved" };
    }
  };

  /* ---------------- user management (Church setup → Users) ---------------- */
  window.parishUsers = {
    subscribe(cb) {
      let users = [], invites = [];
      const push = () => cb(users, invites);
      const u1 = fs.collection("users").onSnapshot(s => { users = s.docs.map(d => ({ id: d.id, ...d.data() })); usersCache = null; push(); }, () => {});
      const u2 = fs.collection("invites").onSnapshot(s => { invites = s.docs.map(d => ({ email: d.id, ...d.data() })); push(); }, () => {});
      return () => { u1(); u2(); };
    },
    invite: (email, r) => fs.collection("invites").doc(String(email).trim().toLowerCase()).set({ role: r, invitedBy: me?.uid || "", invitedAt: new Date().toISOString() }),
    removeInvite: email => fs.collection("invites").doc(email).delete(),
    setRole: (uid, r) => fs.collection("users").doc(uid).update({ role: r }),
    remove: uid => fs.collection("users").doc(uid).delete(),
    ownerEmail: OWNER
  };

  /* ---------------- the claude.use() shim ---------------- */
  window.claude = {
    use: async name => {
      await ready;
      return { db: DB, user: USER, assets: ASSETS, downloads: DOWNLOADS }[name] || null;
    }
  };
})();
