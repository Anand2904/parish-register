// Security rule tests. Run with: npm run test:rules
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url),"utf8"), host:"127.0.0.1", port:8080 } });
const ctx = (uid, email, verified=true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const owner = ctx("o1","officialholyeucharist@gmail.com"), adminDb = owner;
const results = [];
const t = async (name, p, ok) => { try { await (ok ? assertSucceeds(p) : assertFails(p)); results.push(["PASS", name]); } catch(e){ results.push(["FAIL", name, e.message.slice(0,120)]); } };
// owner self-creates as admin
await t("owner creates own admin user", owner.doc("users/o1").set({email:"officialholyeucharist@gmail.com", name:"Office", role:"admin"}), true);
// stranger cannot self-create
const stranger = ctx("x1","random@gmail.com");
await t("uninvited cannot create user", stranger.doc("users/x1").set({email:"random@gmail.com", role:"staff"}), false);
await t("uninvited cannot read families", stranger.doc("families/THE-0001").get(), false);
// invite staff
await t("admin invites staff", adminDb.doc("invites/staff@gmail.com").set({role:"staff"}), true);
const staff = ctx("s1","staff@gmail.com");
await t("invited cannot self-promote to admin", staff.doc("users/s1").set({email:"staff@gmail.com", role:"admin"}), false);
await t("invited creates staff user", staff.doc("users/s1").set({email:"staff@gmail.com", name:"S", role:"staff"}), true);
await t("staff cannot change own role", staff.doc("users/s1").update({role:"admin"}), false);
await t("staff can change own name", staff.doc("users/s1").update({name:"Staff One"}), true);
// families
await t("admin writes family", adminDb.doc("families/THE-0001").set({name:"A", members:[]}), true);
await t("staff reads family", staff.doc("families/THE-0001").get(), true);
await t("staff cannot edit family", staff.doc("families/THE-0001").update({name:"B"}), false);
await t("staff cannot create family directly", staff.doc("families/THE-0002").set({name:"B"}), false);
// requests & decisions
await t("staff creates own request", staff.doc("requests/r1").set({type:"add", requestedBy:"s1"}), true);
await t("staff cannot forge requester", staff.doc("requests/r2").set({type:"add", requestedBy:"o1"}), false);
await t("staff cannot decide", staff.doc("decisions/r1").set({status:"approved", decidedBy:"s1"}), false);
await t("admin decides", adminDb.doc("decisions/r1").set({status:"approved", decidedBy:"o1"}), true);
await t("decision cannot be changed", adminDb.doc("decisions/r1").update({status:"rejected"}), false);
await t("staff cannot withdraw decided request", staff.doc("requests/r1").delete(), false);
await t("staff creates request 3", staff.doc("requests/r3").set({type:"death", requestedBy:"s1"}), true);
await t("staff withdraws pending own request", staff.doc("requests/r3").delete(), true);
// payments
await t("staff records offering", staff.doc("payments/p1").set({amount:500}), true);
await t("staff cannot cancel offering", staff.doc("payments/p1").update({cancelled:true}), false);
await t("admin cancels offering", adminDb.doc("payments/p1").update({cancelled:true}), true);
// history
await t("staff adds history as self", staff.doc("history/h1").set({by:"s1", action:"x"}), true);
await t("staff cannot forge history author", staff.doc("history/h2").set({by:"o1"}), false);
await t("history cannot be edited", adminDb.doc("history/h1").update({action:"y"}), false);
await t("history cannot be deleted", adminDb.doc("history/h1").delete(), false);
// settings
await t("staff reads settings", staff.doc("settings/church").get(), true);
await t("staff cannot change settings", staff.doc("settings/church").set({name:"x"}), false);
await t("admin changes settings", adminDb.doc("settings/church").set({name:"x"}), true);
// counters
await t("staff uses counter", staff.doc("counters/receipts-2026").set({last:1}), true);
// unverified owner email
const fake = ctx("f1","officialholyeucharist@gmail.com", false);
await t("unverified owner email is not admin", fake.doc("users/f1").set({email:"officialholyeucharist@gmail.com", role:"admin"}), false);
// remove access
await t("admin removes staff", adminDb.doc("users/s1").delete(), true);
await t("removed staff loses read", staff.doc("families/THE-0001").get(), false);
await t("owner cannot be removed", adminDb.doc("users/o1").delete(), false);
console.table(results);
console.log(results.filter(r=>r[0]==="FAIL").length, "failures of", results.length);
await env.cleanup();
if (results.some(r=>r[0]==="FAIL")) process.exit(1);
