# DBR Onboarding: Gyandhara (v0.3)

A mobile web app for the sales team to register a new distributor (DBR). The SE fills a 6-step form, attaches the signed form and KYC photos, and the app files everything into Google Drive and the DBR Register.

```
Phone ──► React app (Netlify, from GitHub) ──► Apps Script web app ──► Drive: Root / <Zone> / <Firm>_<dd-MM-yyyy>/
                                                                    └─► DBR Register (Google Sheet) + Summary + Error Log
```

## What lands in Drive for each DBR

| File | What it is |
|---|---|
| `00 DBR Details - ….docx` | Word file: every field, GPS, checklist status, duplicate warning, and links to each file |
| `01 DBR Form & Agreement.pdf` | Signed form and agreement. Photos of pages are joined into one PDF. |
| `02–05 Aadhaar Front/Back, PAN Front/Back` | KYC copies |
| `06 Cancelled Cheque` · `07 DBR Photo` · `08 Retailer List` | |
| `09 KYC Documents (Merged).pdf` | All KYC items in one captioned PDF, ready to print or send to F&A |
| `10 Checklist - …` (Google Sheet + `.xlsx`) | The "DB Opening Checklist" template, filled in |

**DBR Register** (Google Sheet) has one row per DBR, with columns for Status (dropdown), Verified By/On, HO Remarks and Possible Duplicate. It has three tabs:

- **Summary**: live totals by Zone, Status and SE, plus total first-demand MT.
- **Error Log**: every server-side failure, with time and firm.
- **DBR Register (v1 old)**: the rows from the first test version, kept as-is.

---

## Deploy

### 1. Apps Script (backend)

1. Open the existing Apps Script project and replace **all** of `Code.gs` with `apps-script/Code.gs`. The IDs and `APP_KEY` are already filled in.
2. Optional: set `REPORT_EMAILS = ['you@gyandhara.com']` to get a daily 9 AM summary email.
3. Run **`setup`** and approve the permissions (Drive, Sheets, Docs, external request, email). This upgrades the register and builds the Summary tab.
4. Optional: run **`testFinalize`** and check the "TEST Sanjay…" folder that appears under *UP East I*. Delete it afterwards.
5. Optional: run **`installDailyReport`** if you set `REPORT_EMAILS`.
6. Go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The `/exec` URL stays the same.

### 2. GitHub → Netlify (frontend)

1. Push this folder to a GitHub repo. `node_modules`, `dist` and `.env` are git-ignored, so keys stay out of GitHub.
2. In Netlify, choose **Add new site → Import an existing project → GitHub** and pick the repo. The build settings come from `netlify.toml` (`npm run build` → `dist`).
3. Under **Site configuration → Environment variables**, add:
   - `VITE_SCRIPT_URL` = the Apps Script `/exec` URL
   - `VITE_APP_KEY` = the same value as `APP_KEY` in Code.gs
4. Deploy. Every push to GitHub redeploys automatically.

Run locally: `npm install`, then `npm run dev`. The values come from `.env`.

> Deploy the new **Code.gs and the new app together**. The new app sends different fields from v1.

---

## Reliability features

- **Nothing is lost if the phone reloads the page.** That often happens on low-RAM Android phones when the camera opens. Typed fields are kept in localStorage; photos and PDFs are kept in IndexedDB, and a banner says when they were restored.
- **Safe retries.** Each submission has an ID. If the network drops mid-upload, tapping **Retry** reuses the same Drive folder, skips files already sent, and updates the same register row. No duplicate folders or rows.
- **Server-side protection.** Uploading a file with the same name replaces the old copy. Register writes are locked against two SEs submitting at once. Exports retry, and temp Google Docs are always cleaned up.
- **Timeouts** on every request (60–120 s), with plain-language errors such as "network dropped" or "deployment access must be Anyone".
- **Screen stays awake** during upload, and the browser warns before closing the tab.
- **Bug fix:** reaching the Review step no longer submits the form by itself.

## Validation before submit

| Field | Check |
|---|---|
| Aadhaar | 12 digits and the UIDAI check-digit, which catches most typos |
| PAN | Format, plus the 4th-letter holder type |
| GST | Format and check-digit. Warns if the PAN inside the GST doesn't match, or the state code doesn't match the PIN. PAN is filled from GST. |
| IFSC | 11 characters with 0 as the 5th. The bank name and branch fill in automatically. |
| Account no. | Must be entered twice and match (paste is blocked on the second box) |
| Mobile, PIN, email | Format checks; PIN also gives a state hint |
| Tehsil status | If it's not "New Tehsil", the existing/replaced DB becomes required |

**Duplicate check:** if the PAN, Aadhaar, GST or account number already exists on an earlier DBR, the submission still goes through. It's flagged in the success screen, the register (highlighted) and the Word file.

## Code map

| File | What lives there |
|---|---|
| `src/config.js` | **Fields, wizard steps, documents, checklist rows, limits.** Edit this first. |
| `src/validators.js` | Field rules and error messages (Aadhaar Verhoeff, GST checksum, IFSC…) |
| `src/i18n.js` | English / Hindi text for steps, fields and documents |
| `src/App.jsx` | Wizard, review, submit / resume logic, success screen |
| `src/api.js` | Calls to Apps Script (timeouts, retries), IFSC lookup |
| `src/storage.js` | Phone storage for drafts, files and the in-progress submission |
| `src/fileUtils.js` · `src/pdfUtils.js` | Photo compression, PDF joining, merged KYC PDF |
| `src/mobileBridge.js` | Messages to a host mobile app, haptics, GPS, PIN → state |
| `apps-script/Code.gs` | Drive folders, checklist filling, Word file, register, reports |

**Adding a field:**

1. Add it to `FORM_SECTIONS` in `config.js`.
2. Add its label to `i18n.js` (en and hi).
3. If it should appear in Drive, add it to `REGISTER_HEADERS` and `upsertRegister_` (and `fillChecklist_` / `writeDetailsDocx_` if needed) in `Code.gs`.

Register rows are written by **column name**, so HO can reorder columns or add their own without breaking anything.

## Before a wide rollout

- `APP_KEY` stops random submissions, but it is visible in the app's code. For a large team, add an employee code + PIN check against a Users tab.
- The folders hold Aadhaar, PAN and bank details. Share zone folders only with that zone's RSM, and the root only with F&A and Sales Admin. Never use "anyone with the link".
