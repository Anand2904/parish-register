# Parish Family Register

The family register of **The Holy Eucharist Church**: families and members, sacraments, monthly offerings with receipts, approvals, celebrations, remembrance and reports. Staff sign in with their own email; nobody needs a claude.ai account.

It runs on the parish's own **Google Firebase** account:

| Part | Firebase service |
|---|---|
| Website | Firebase Hosting, at `register.holyeucharistchurch.org` |
| Sign-in | Firebase Authentication (Google, or email + password) |
| Records | Cloud Firestore, Mumbai region (`asia-south1`) |
| Photos and documents | Cloud Storage |
| Who can do what | `firestore.rules` and `storage.rules`, enforced by Google's servers |

---

## Part A — one-time setup (about 1–2 hours)

Do every step while signed in to Google as **officialholyeucharist@gmail.com**.

### A1. Create two Firebase projects
1. Open <https://console.firebase.google.com> → **Add project**.
2. Name it `holyeucharist-test`. Google Analytics: **off**. Create.
3. Repeat for `holyeucharist-register` (the live register).

Do steps A2–A6 in **both** projects. Always try changes on *test* first.

### A2. Turn on the services
In the project's left menu:
1. **Build → Firestore Database → Create database** → location **asia-south1 (Mumbai)** → *Start in production mode*.
2. **Build → Authentication → Get started** → *Sign-in method* → enable **Google** and **Email/Password**.
3. **Build → Storage → Get started** → production mode → same location.
4. **Build → Hosting → Get started** → just click through (the deploy below does the work).

### A3. Switch to the Blaze plan and set a budget
Bottom-left **Upgrade** → **Blaze (pay as you go)**. Daily backups need it. At parish size the cost is usually **₹0–500 a month**.
Then in Google Cloud console → **Billing → Budgets & alerts** → create a budget of **₹500/month** with email alerts.

### A4. Daily automatic backups
Firestore Database → **Disaster recovery** (or *Backups*) → **Create schedule** → **Daily**, keep **14 days**.

### A5. Get the web settings
Project settings (gear icon) → **General** → *Your apps* → **Web (`</>`)** → nickname `register` → **Register app**.
Copy the `firebaseConfig` block — you need it in A7. These values are not secret.

### A6. Create the deploy key (service account)
1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts> and select the project.
2. **Create service account** → name `github-deploy`.
3. Give it these roles: **Firebase Admin**, **Service Account User**, **API Keys Viewer**.
4. Open the new account → **Keys → Add key → Create new key → JSON**. A file downloads. Keep it private; never send it by email or chat.

### A7. Connect GitHub to Firebase
In GitHub: this repository → **Settings → Environments**:
1. Create environment **`test`**:
   - **Environment secret** `FIREBASE_SERVICE_ACCOUNT` = paste the *whole* JSON key file from A6 (test project).
   - **Environment variable** `FIREBASE_PROJECT_ID` = `holyeucharist-test`
   - **Environment variable** `FIREBASE_WEB_CONFIG` = the config from A5 written as JSON, for example
     `{"apiKey":"…","authDomain":"holyeucharist-test.firebaseapp.com","projectId":"holyeucharist-test","storageBucket":"holyeucharist-test.appspot.com","messagingSenderId":"…","appId":"…"}`
2. Create environment **`live`** the same way with the live project's key, ID and config.
   Under *Deployment protection rules*, tick **Required reviewers** and add yourself, so nothing reaches the live register without your click.

### A8. First deploy
GitHub → **Actions → Deploy register → Run workflow** → choose **test**.
When it finishes, open `https://holyeucharist-test.web.app`, press **Sign in with Google** as `officialholyeucharist@gmail.com`. You are the first admin.

### A9. Your own web address
1. Buy the domain `holyeucharistchurch.org` if the parish doesn't own it yet (any registrar, about ₹1,000/year).
2. Live project → **Hosting → Add custom domain** → `register.holyeucharistchurch.org`.
3. Add the DNS records Firebase shows at your domain registrar. HTTPS is set up automatically (can take up to 24 hours).
4. Authentication → **Settings → Authorized domains** → make sure `register.holyeucharistchurch.org` is listed.

---

## Part B — moving the data from claude.ai (on the go-live day)

1. In the claude.ai register: **Church setup → Download full backup**. Save it as `backup/parish-register-backup.json`.
2. Photos and documents: ask Claude to export them into an `assets/` folder (one file per id).
3. On a computer with Node.js 20 (or ask Claude to run it):
   ```bash
   npm install
   ```
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=service-account-live.json node scripts/migrate.mjs --project holyeucharist-register --backup backup/parish-register-backup.json --assets assets/
   ```
   Try with `--dry-run` first. The script refuses to run if the target already has families, and ends by comparing family counts and offering totals (**MATCH** / **MISMATCH**).
4. In the new register: **Church setup → Users** → invite the priest (Admin) and office staff (Staff); then **Approvers** → add the priest.
5. Keep the claude.ai register read-only for one month, then retire it.

---

## Part C — everyday running

| When | What | Who |
|---|---|---|
| Daily | Automatic Firestore backup (A4) | nobody |
| Monthly | Church setup → **Download full backup** → save in the parish Google Drive | Admin |
| Quarterly | Church setup → **Users**: remove anyone who has left | Admin |
| Yearly | Restore a backup into the *test* project to prove it works | Admin / volunteer |

**Roles**

| Role | Can do |
|---|---|
| Admin | Everything: edit families, approve requests, cancel receipts, see salary/Aadhaar/transfer documents, manage users |
| Staff | View, enroll families (sent for approval), record offerings, report deaths and families leaving (sent for approval) |
| Not invited | Cannot sign in |

The account in `ownerEmail` (`officialholyeucharist@gmail.com`) is always an admin and can't be removed.

---

## For the developer

```
public/index.html        the register (built from the claude.ai version)
public/adapter.js        connects the register to Firebase (database, sign-in, files, downloads)
public/firebase-config.js  project settings (written automatically by the deploy from FIREBASE_WEB_CONFIG)
public/vendor/           bundled libraries (Firebase SDK, jsPDF, QRCode.js) — no outside CDNs
firestore.rules, storage.rules   access rules
scripts/migrate.mjs      copies a claude.ai backup into Firebase
scripts/build-from-artifact.py   rebuilds public/index.html from the claude.ai version
tests/                   rule tests and an end-to-end browser test (Firebase emulators)
```

Run locally (needs Node.js 20 and Java):
```bash
npm install
```
```bash
npm run test:rules
```
```bash
npm run test:e2e
```
On `localhost` the site talks to the local emulators, never to the real projects.

**Known limits**
- Salary and Aadhaar are hidden from Staff on screen, but they are stored on the family record, which Staff can read. Moving them to an admin-only record is the next planned change.
- Photos are opened with private download links; anyone given such a link can open that one file.
- Names typed in Tamil script don't print in PDFs yet (English names print correctly).
