// Points public/firebase-config.js at the local "demo-test" emulator project for tests.
import { readFileSync, writeFileSync } from "node:fs";
const f = "public/firebase-config.js";
writeFileSync(f, readFileSync(f, "utf8").replace("PASTE_API_KEY", "demo-key").replaceAll("PASTE_PROJECT_ID", "demo-test").replace("PASTE_SENDER_ID", "1").replace("PASTE_APP_ID", "1:1:web:1"));
