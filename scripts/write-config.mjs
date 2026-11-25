// Writes public/firebase-config.js from the JSON in the FIREBASE_WEB_CONFIG GitHub variable,
// so the test and live projects can share one copy of the code.
import { readFileSync, writeFileSync } from "node:fs";
const [json, out] = process.argv.slice(2);
const cfg = JSON.parse(json);
const current = readFileSync(out, "utf8");
const owner = (current.match(/ownerEmail:\s*"([^"]+)"/) || [])[1] || "";
const name = (current.match(/PARISH_NAME\s*=\s*"([^"]+)"/) || [])[1] || "Parish Family Register";
writeFileSync(out, `window.FIREBASE_CONFIG = ${JSON.stringify({ ...cfg, ownerEmail: cfg.ownerEmail || owner }, null, 2)};\nwindow.PARISH_NAME = ${JSON.stringify(name)};\n`);
console.log("firebase-config.js written for", cfg.projectId);
