// Copies a "Full backup" file from the claude.ai register into a Firebase project.
//
//   npm install firebase-admin
//   GOOGLE_APPLICATION_CREDENTIALS=service-account.json \
//     node scripts/migrate.mjs --project holyeucharist-test --backup backup/parish-register-backup.json [--assets assets/] [--dry-run]
//
// --assets is a folder of photos and documents named by their id (as exported from the old register);
// each one is uploaded to Storage at uploads/<id>.
// Approvers, the last-backup note and the test checklist are not copied: people get new
// sign-in accounts in Firebase, so approvers are chosen again under Church setup.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import admin from "firebase-admin";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]); return acc; }, []));
if (!args.project || !args.backup) { console.error("Usage: node scripts/migrate.mjs --project <id> --backup <file.json> [--assets <folder>] [--dry-run]"); process.exit(1); }

const backup = JSON.parse(readFileSync(args.backup, "utf8"));
if (backup.app !== "Parish Family Register") { console.error("This doesn't look like a register backup file."); process.exit(1); }
const dry = !!args["dry-run"];

admin.initializeApp({ projectId: args.project, storageBucket: `${args.project}.appspot.com` });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const COPY = ["families", "payments", "requests", "decisions", "history", "counters"];
const SKIP_SETTINGS = new Set(["approvers", "backup"]);

const strip = d => { const { id, ...rest } = d; delete rest.__lease; return rest; };

async function writeAll(col, docs) {
  let n = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) { batch.set(db.collection(col).doc(String(d.id)), strip(d)); n++; }
    if (!dry) await batch.commit();
  }
  return n;
}

const report = {};
for (const col of COPY) {
  const docs = backup.collections[col] || [];
  if (!dry) { const existing = await db.collection(col).limit(1).get(); if (!existing.empty && col === "families") { console.error(`The target project already has families. Stop: migrate into an empty project.`); process.exit(1); } }
  report[col] = await writeAll(col, docs);
}
report.settings = await writeAll("settings", (backup.collections.settings || []).filter(d => !SKIP_SETTINGS.has(d.id)));

if (args.assets && existsSync(args.assets)) {
  const files = readdirSync(args.assets); let up = 0;
  for (const f of files) {
    const id = f.replace(extname(f), ""); const type = /\.pdf$/i.test(f) ? "application/pdf" : /\.png$/i.test(f) ? "image/png" : "image/jpeg";
    if (!dry) await bucket.upload(join(args.assets, f), { destination: `uploads/${id}`, metadata: { contentType: type } });
    up++;
  }
  report.files = up;
}

// Check: totals in the new project match the backup.
const fam = backup.collections.families || [], pay = (backup.collections.payments || []).filter(p => !p.cancelled);
const total = pay.reduce((s, p) => s + (Number(p.amount) || 0), 0);
console.log(dry ? "DRY RUN (nothing written)" : "Copied", report);
console.log(`Backup: ${fam.length} families, ${fam.reduce((n, f) => n + (f.members || []).length, 0)} members, ${pay.length} valid offerings totalling ${total}.`);
if (!dry) {
  const [f2, p2] = await Promise.all([db.collection("families").get(), db.collection("payments").get()]);
  const t2 = p2.docs.map(d => d.data()).filter(p => !p.cancelled).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  console.log(`Firebase: ${f2.size} families, ${p2.size} offerings, valid total ${t2}.`, f2.size === fam.length && t2 === total ? "MATCH" : "MISMATCH – check before going live");
}
