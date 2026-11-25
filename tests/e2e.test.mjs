// End-to-end check of the main workflows against the local Firebase emulators.
// Run with: npm run test:e2e
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
async function mkUser(email, pw){ const r = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({email, password:pw, returnSecureToken:true})}).then(r=>r.json());
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/demo-test/accounts`, {method:"GET"});
  await fetch(`${AUTH}/accounts:update?key=demo-key`, {method:"POST", headers:{"content-type":"application/json", "authorization":"Bearer owner"}, body:JSON.stringify({localId:r.localId, emailVerified:true})}); return r.localId; }
await mkUser("officialholyeucharist@gmail.com","Test12345");
await mkUser("staff@gmail.com","Test12345");
const browser = await chromium.launch();
const log = [];
async function session(email){
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  page.on("pageerror", e=>log.push(`[${email}] pageerror: ${e.message}`));
  page.on("console", m=>{ if (m.type()==="error") log.push(`[${email}] console: ${m.text().slice(0,160)}`); });
  await page.goto("http://127.0.0.1:5000/");
  await page.fill("#g-email", email); await page.fill("#g-pass", "Test12345"); await page.click("#g-in");
  return page;
}
const step = async (name, fn) => { try { await fn(); log.push(`PASS ${name}`); } catch(e){ log.push(`FAIL ${name}: ${e.message.split("\n")[0]}`); } };
const owner = await session("officialholyeucharist@gmail.com");
await step("owner signs in and dashboard loads", ()=>owner.waitForSelector("text=No families enrolled yet", {timeout:15000}));
await step("owner invites staff", async ()=>{ await owner.goto("http://127.0.0.1:5000/#setup"); await owner.waitForSelector("td.mono >> text=officialholyeucharist@gmail.com",{timeout:8000}); await owner.waitForTimeout(800); await owner.fill("#inv-email","staff@gmail.com"); await owner.selectOption("#inv-role","staff"); await owner.click("#form-invite button[type=submit]"); await owner.waitForSelector("text=Invited, not signed in yet", {timeout:8000}); });
await step("owner sets church name", async ()=>{ await owner.fill("#st-name","The Holy Eucharist Church"); await owner.click("#form-settings button[type=submit]"); await owner.waitForSelector("text=Church details saved",{timeout:8000}); });
const staff = await session("staff@gmail.com");
await step("staff signs in", ()=>staff.waitForSelector("text=No families enrolled yet", {timeout:15000}));
await step("staff sees Staff role", ()=>staff.waitForSelector("#role >> text=Staff", {timeout:5000}));
await step("staff enrolls family (request)", async ()=>{
  await staff.waitForTimeout(800); await staff.click("text=+ Enroll family"); await staff.fill("#ff-name","Joseph family"); await staff.fill("#ff-num","123");
  await staff.selectOption("#ff-zone",{index:1}); await staff.fill("#ff-pledge","500");
  await staff.fill(".m-name","Joseph Antony"); await staff.fill(".m-dob","1975-04-15"); await staff.fill(".m-ph","9845011223");
  await staff.click("#ff-save"); await staff.waitForSelector("text=Waiting for a decision", {timeout:8000}); });
await step("owner sees pending banner and approves", async ()=>{ await owner.goto("http://127.0.0.1:5000/#approvals"); await owner.click("button:has-text('Approve')", {timeout:8000}); await owner.waitForSelector("text=added as THE-0123", {timeout:8000}); });
await step("staff records offering with auto receipt", async ()=>{ await staff.goto("http://127.0.0.1:5000/#family-THE-0123"); await staff.waitForSelector("text=Joseph family",{timeout:8000}); await staff.click("button.primary:has-text('Record offering')", {timeout:8000}); await staff.click("#fp-save"); await staff.waitForSelector("text=R-2026-0001", {timeout:8000}); });
await step("staff cannot see Edit family", async ()=>{ await staff.keyboard.press("Escape"); const n = await staff.locator("button:has-text('Edit family'):visible").count(); if (n) throw new Error("Edit family visible to staff"); });
await step("staff reports a death -> pending", async ()=>{ await staff.goto("http://127.0.0.1:5000/#deceased"); await staff.waitForTimeout(800); await staff.click("button:has-text('Report a death')", {timeout:5000}); await staff.fill("#dd-search","Joseph"); await staff.click("[data-act=dd-pick]"); await staff.fill("#dd-date","2026-11-20"); await staff.click("#dd-save"); await staff.waitForSelector("text=Waiting for approval (1)", {timeout:8000}); });
await step("change history records approval", async ()=>{ await owner.goto("http://127.0.0.1:5000/#history"); await owner.waitForSelector("text=Family added (approved)", {timeout:8000}); });
await step("backup downloads", async ()=>{ await owner.goto("http://127.0.0.1:5000/#setup"); const [dl] = await Promise.all([owner.waitForEvent("download",{timeout:15000}), owner.click("button:has-text('Download full backup')")]); log.push("  backup file: "+dl.suggestedFilename()); });
await owner.goto("http://127.0.0.1:5000/#family-THE-0123"); await owner.waitForTimeout(1500);
console.log(log.join("\n")); await browser.close();
if (log.some(l=>l.startsWith("FAIL"))) process.exit(1);
