#!/usr/bin/env python3
"""Turn the claude.ai version of the register (one HTML fragment) into the
stand-alone page served from Firebase Hosting (public/index.html).

Usage: python3 scripts/build-from-artifact.py <artifact.html> public/index.html
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

def rep(a, b):
    global s
    if s.count(a) != 1:
        raise SystemExit(f"Expected exactly one match for: {a[:80]!r} (found {s.count(a)})")
    s = s.replace(a, b)

# Firebase SDK, settings and the adapter load before the register's own scripts.
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>',
    '''<script src="vendor/firebase-app-compat.js"></script>
<script src="vendor/firebase-auth-compat.js"></script>
<script src="vendor/firebase-firestore-compat.js"></script>
<script src="vendor/firebase-storage-compat.js"></script>
<script src="firebase-config.js"></script>
<script src="adapter.js"></script>
<script src="vendor/qrcode.min.js"></script>''')

rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>', '<script src="vendor/jspdf.umd.min.js"></script>')

# Wording that referred to claude.ai.
rep('S.error = "Sign in to claude.ai with an account this register is shared with (as Contributor or Editor) to open the records.";',
    'S.error = "Your account doesn\'t have access to the register. Ask the parish office to invite you under Church setup → Users.";')
rep('<p class="muted" style="margin:0;font-size:.8rem">An approver also needs <b>Editor</b> access in the Share menu. People appear in search once the register is shared with them.</p>',
    '<p class="muted" style="margin:0;font-size:.8rem">An approver must have the <b>Admin</b> role under Users. People appear in search once they have signed in at least once.</p>')
rep('<thead><tr><th>Access (Share menu)</th><th>Role here</th><th>Can do</th></tr></thead>',
    '<thead><tr><th>Role (Users)</th><th>Shown as</th><th>Can do</th></tr></thead>')
rep('<tr><td>Owner, Editor</td><td><span class="chip good">Admin</span></td>', '<tr><td>Admin</td><td><span class="chip good">Admin</span></td>')
rep('<tr><td>Contributor</td><td><span class="chip off">Staff</span></td>', '<tr><td>Staff</td><td><span class="chip off">Staff</span></td>')
rep('<tr><td>Viewer, Commenter</td><td><span class="chip off">No access</span></td><td>Cannot see any records (keeps salaries and birth dates private)</td></tr>',
    '<tr><td>Not invited</td><td><span class="chip off">No access</span></td><td>Cannot sign in or see any records</td></tr>')
rep('<p class="muted" style="margin:0">To make someone an admin, open <b>Share</b> and set them to <b>Editor</b>. Give office staff <b>Contributor</b>.</p>',
    '<p class="muted" style="margin:0">Invite people and set their role under <b>Users</b> above.</p>')

# Users panel in Church setup.
rep('''  ${backupPanel()}
  ${importPanel()}''', '''  ${usersPanel()}
  ${backupPanel()}
  ${importPanel()}''')
rep('/* ---------- full backup ---------- */', r'''/* ---------- users (Firebase) ---------- */
function usersPanel(){
  if (!S.isAdmin || !window.parishUsers) return "";
  if (!S.usersSub) S.usersSub = window.parishUsers.subscribe((u, i)=>{ S.usersList = u; S.invitesList = i; if (S.view==="setup") render(); });
  const users = (S.usersList||[]).slice().sort((a,b)=>(a.role||"").localeCompare(b.role||"") || (a.name||"").localeCompare(b.name||""));
  const invites = (S.invitesList||[]).filter(i=>!users.some(u=>u.email===i.email));
  const owner = window.parishUsers.ownerEmail;
  return `<div class="panel" style="display:grid;gap:12px">
    <div class="section-head"><div><h3>Users</h3><div class="muted" style="font-size:.85rem">Invite the priest and office staff by email. They sign in at this website with that email, using Google or a password they create.</div></div></div>
    <form id="form-invite" class="fields" style="align-items:end" novalidate>
      <div class="field"><label for="inv-email">Email address</label><input id="inv-email" type="email" placeholder="name@gmail.com" autocomplete="off"></div>
      <div class="field"><label for="inv-role">Role</label><select id="inv-role"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
      <div class="field"><button class="primary" type="submit">Invite</button></div>
    </form>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
      ${users.map(u=>`<tr><td>${esc(u.name||"")}${u.id===S.me?' <span class="chip off">You</span>':""}</td><td class="mono">${esc(u.email||"")}</td>
        <td>${u.email===owner||u.id===S.me ? `<span class="chip good">${u.role==="admin"?"Admin":"Staff"}</span>` : `<select data-user-role="${esc(u.id)}" style="width:auto"><option value="staff"${u.role==="staff"?" selected":""}>Staff</option><option value="admin"${u.role==="admin"?" selected":""}>Admin</option></select>`}</td>
        <td class="r">${u.email===owner||u.id===S.me ? "" : `<button class="small danger" data-act="user-remove" data-id="${esc(u.id)}">Remove access</button>`}</td></tr>`).join("")}
      ${invites.map(i=>`<tr><td class="muted">Invited, not signed in yet</td><td class="mono">${esc(i.email)}</td><td>${i.role==="admin"?"Admin":"Staff"}</td><td class="r"><button class="small danger" data-act="invite-remove" data-id="${esc(i.email)}">Cancel invite</button></td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="margin:0;font-size:.8rem">Admins can edit families, approve requests and see salaries, Aadhaar numbers and transfer documents. Staff can view, enroll, record offerings and report events for approval.</p>
  </div>`;
}

/* ---------- full backup ---------- */''')
rep('''  else if (act==="toggle-left")''', '''  else if (act==="user-remove") { try { await window.parishUsers.remove(id); toast("Access removed"); logChange("User access removed", null, [{f:"User", from:nameOf(id), to:""}]); } catch(x){ toast("Couldn't remove access"); } }
  else if (act==="invite-remove") { try { await window.parishUsers.removeInvite(id); toast("Invite cancelled"); } catch(x){ toast("Couldn't cancel the invite"); } }
  else if (act==="toggle-left")''')
rep('''  if (e.target.id==="form-tl") {''', '''  if (e.target.id==="form-invite") { e.preventDefault(); const em = $("#inv-email").value.trim().toLowerCase(), r = $("#inv-role").value;
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(em)) { toast("Enter a valid email address"); return; }
    try { await window.parishUsers.invite(em, r); logChange("User invited", null, [{f:em, from:"", to:r==="admin"?"Admin":"Staff"}]); toast(`${em} invited`); $("#inv-email").value = ""; } catch(x){ toast("Couldn't send the invite"); } return; }
  if (e.target.id==="form-tl") {''')
rep('''  if (e.target.id==="ff-join") syncJoin();''', '''  if (e.target.id==="ff-join") syncJoin();
  if (e.target.dataset?.userRole) { const uid = e.target.dataset.userRole, r = e.target.value; window.parishUsers.setRole(uid, r).then(()=>{ toast("Role updated"); logChange("User role changed", null, [{f:nameOf(uid), from:r==="admin"?"Staff":"Admin", to:r==="admin"?"Admin":"Staff"}]); }).catch(()=>toast("Couldn't change the role")); }''')

head = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
'''
open(dst, "w", encoding="utf-8").write(head + s + "\n</body>\n</html>\n")
print("built", dst)
