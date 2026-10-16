/**
 * DBR Onboarding — Google Apps Script backend (Gyandhara)  v0.3
 * ---------------------------------------------------------------
 * Called by the React app (Netlify). For every new DBR it:
 *   create   → Drive folder  <Root>/<Zone>/<Firm Name>_<dd-MM-yyyy>
 *   upload   → saves each document / photo / merged KYC PDF (same name = replaced, never duplicated)
 *   finalize → fills a copy of the "DB Opening Checklist" (Google Sheet + .xlsx),
 *              writes "00 DBR Details.docx", and adds / updates one row in the DBR Register
 *
 * Safe to retry: the app sends a submissionId, so a repeated create/finalize after a network
 * drop returns the same folder and updates the same register row.
 *
 * Reports: "Summary" tab (live counts by zone / SE / status / month), "Error Log" tab,
 * and an optional daily email (set REPORT_EMAILS, run installDailyReport once).
 *
 * AFTER EDITING: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL stays the same).
 */

const ROOT_FOLDER_ID        = '1_inxzYbRFjOo7OLGtBP1aJG6dWGfLc8Q';             // "DBR Onboarding Uploads"
const CHECKLIST_TEMPLATE_ID = '1Uiw9pKLTg6E9RLp8nN7IlWaK0ZIcAPU7oZvnggaPwCE';  // checklist template (Google Sheet)
const REGISTER_SHEET_ID     = '1C6aytj-Btmrv5LaM713tM9PNbVj1zRirKtvo1HpGr6k';  // "DBR Register"
const APP_KEY               = 'dbr-ChOUQzEg1M3I';                               // must match VITE_APP_KEY on Netlify

const GROUP_BY      = 'zone';   // 'zone' → Root/<Zone>/<DBR folder> · 'month' → Root/2026-10/<DBR folder> · 'none'
const REPORT_EMAILS = [];       // e.g. ['nitin.kumar@gyandhara.com'] — daily summary at 9 AM (run installDailyReport once)

const TZ = 'Asia/Kolkata';
const REGISTER_TAB = 'DBR Register';
const OLD_REGISTER_TAB = 'DBR Register (v1 old)';
const SUMMARY_TAB = 'Summary';
const ERROR_TAB = 'Error Log';
const TEHSIL_STATUS = ['New Tehsil', 'Vacant Tehsil, DB Replaced By:', 'DB Replaced BY:', 'Another DB Also Present In Same Tehsil:'];
const STATUS_LIST = ['Pending Verification', 'Verified', 'Docs Missing', 'Rejected', 'DB Created'];
const CHECKLIST_ROWS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28];

/* ======================= web app entry points ======================= */

function doPost(e) {
  let req = {};
  try {
    req = JSON.parse(e.postData.contents);
    if (req.key !== APP_KEY) throw new Error('Unauthorized');
    switch (req.action) {
      case 'create':   return json_(create_(req));
      case 'upload':   return json_(upload_(req));
      case 'finalize': return json_(finalize_(req));
      default: throw new Error('Unknown action');
    }
  } catch (err) {
    logError_(req.action, err, req.fields && req.fields.firmName, req.fileName);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// Health check — open the /exec URL in a browser
function doGet() {
  return json_({ ok: true, service: 'DBR Onboarding', version: '0.3', time: now_() });
}

/* ============================ actions ============================ */

function create_(req) {
  const f = req.fields || {};
  if (!f.firmName) throw new Error('Firm name missing');
  const sid = String(req.submissionId || '').slice(0, 64);
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Same submission retried after a network drop → same folder
    if (sid) {
      const prev = props.getProperty('SUB_' + sid);
      if (prev) {
        const p = JSON.parse(prev);
        try { DriveApp.getFolderById(p.folderId); return Object.assign({ ok: true, resumed: true }, p); } catch (e) { /* folder deleted — make a new one */ }
      }
    }
    const parent = groupFolder_(f);
    const base = `${safe_(f.firmName)}_${today_()}`;
    let name = base;
    for (let n = 2; parent.getFoldersByName(name).hasNext(); n++) name = `${base} (${n})`;
    const folder = parent.createFolder(name);
    const regId = nextRegId_(props);
    folder.setDescription(`${regId} · ${f.district || ''} · Registered by ${f.regName || ''} (${f.regMobile || ''})`);
    const out = { regId, folderId: folder.getId(), folderUrl: folder.getUrl(), folderName: name };
    if (sid) props.setProperty('SUB_' + sid, JSON.stringify(out));
    return Object.assign({ ok: true }, out);
  } finally {
    lock.releaseLock();
  }
}

function upload_(req) {
  const folder = DriveApp.getFolderById(req.folderId);
  assertInsideRoot_(folder);
  if (!req.data) throw new Error('Empty file');
  const name = safe_(req.fileName || 'file');
  // A retry sends the same file name again → replace instead of keeping two copies
  const same = folder.getFilesByName(name);
  while (same.hasNext()) same.next().setTrashed(true);
  const blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mimeType || 'application/octet-stream', name);
  const file = folder.createFile(blob);
  file.setDescription(req.docLabel || '');
  return { ok: true, fileId: file.getId(), fileUrl: file.getUrl() };
}

function finalize_(req) {
  const folder = DriveApp.getFolderById(req.folderId);
  assertInsideRoot_(folder);
  const f = req.fields || {};
  const checklist = (req.checklist || []).filter(c => CHECKLIST_ROWS.indexOf(Number(c.row)) >= 0);
  const files = req.files || [];
  const title = `${safe_(f.firmName)}_${today_()}`;
  const problems = [];
  const out = { ok: true };

  // Remove outputs of an earlier, interrupted finalize of this same folder
  ['10 Checklist - ' + title, '10 Checklist - ' + title + '.xlsx', '00 DBR Details - ' + title + '.docx'].forEach(n => {
    const it = folder.getFilesByName(n);
    while (it.hasNext()) it.next().setTrashed(true);
  });

  // 1) Checklist: Google Sheet copy + .xlsx export
  try {
    const sheetFile = DriveApp.getFileById(CHECKLIST_TEMPLATE_ID).makeCopy(`10 Checklist - ${title}`, folder);
    fillChecklist_(SpreadsheetApp.openById(sheetFile.getId()), f, checklist);
    const xlsx = exportAs_(`https://docs.google.com/spreadsheets/d/${sheetFile.getId()}/export?format=xlsx`, `10 Checklist - ${title}.xlsx`);
    out.checklistUrl = sheetFile.getUrl();
    out.checklistXlsxUrl = folder.createFile(xlsx).getUrl();
  } catch (e) {
    problems.push('Checklist: ' + e.message);
    logError_('finalize/checklist', e, f.firmName);
  }

  // 2) Duplicate check against earlier DBRs (same PAN / Aadhaar / GST / account no.)
  let dups = [];
  try { dups = findDuplicates_(f, req.submissionId); } catch (e) { logError_('finalize/duplicates', e, f.firmName); }
  out.duplicates = dups;

  // 3) Word file with all details
  try {
    out.detailsUrl = writeDetailsDocx_(folder, title, req.regId, f, checklist, files, req.note, req.gps, dups);
  } catch (e) {
    problems.push('Details doc: ' + e.message);
    logError_('finalize/docx', e, f.firmName);
  }

  // 4) Register row (added, or updated if this submission was finalized before)
  upsertRegister_(req, folder, f, files, out, dups);

  if (problems.length) out.note = [req.note].concat(problems).filter(Boolean).join(' · ');
  return out;
}

/* ===================== checklist template filling ===================== */

function fillChecklist_(ss, f, checklist) {
  const sh = ss.getSheetByName('DB Opening Checklist') || ss.getSheets()[0];
  const phones = [f.mobile1, f.mobile2].filter(Boolean).join(', ');
  const values = {
    A1: `Firm Name : ${f.firmName || ''}`,       C1: `Aadhar No. : ${f.aadhaar || ''}`,
    A2: `District : ${f.district || ''}`,        C2: `Pan No. : ${f.pan || ''}`,
    A3: `Tehsil : ${f.tehsil || ''}`,            C3: `GST No. : ${f.gst || ''}`,
    A4: `Address : ${f.address || ''}`,          C4: `Account Holder Name : ${f.accHolder || ''}`,
    A5: `Pincode : ${f.pincode || ''}`,          C5: `Bank Name : ${f.bankName || ''}`,
    A6: `Contact Person : ${f.contactPerson || ''}`, C6: `Account No. - ${f.accountNo || ''}`,
    A7: `Contact Number : ${phones}`,            C7: `IFSC : ${f.ifsc || ''}`,
    A8: `Email : ${f.email || ''}`,              C8: `RSM: ${f.rsm || ''}`,
    A9: `Zone : ${f.zone || ''}`,                C9: `ASM : ${f.asm || ''}`,
    A10: `Rate Zone : ${f.rateZone || ''}`,      C10: `SE : ${f.se || ''}`,
    A11: `DB ID : ${f.dbId || ''}`,              C11: `Registered By : ${f.regName || ''}${f.regMobile ? ' (' + f.regMobile + ')' : ''}`,
    C30: f.distanceKm ? `${f.distanceKm} Kms` : 'Kms',
    B39: f.tehsilStatus && f.tehsilStatus !== 'New Tehsil' ? (f.existingDb || '') : '',
    D38: f.firstDemandMt ? `${f.firstDemandMt} MT` : '',
    B43: `Remark: ${f.remark || ''}`,
  };
  Object.keys(values).forEach(a1 => sh.getRange(a1).setValue(values[a1]));

  // Formalities: D = By When, E = Yes/No, F = Remarks
  CHECKLIST_ROWS.forEach(r => sh.getRange(`D${r}:F${r}`).clearContent());
  checklist.forEach(c => sh.getRange(`D${c.row}:F${c.row}`).setValues([[c.date || '', c.status || '', c.remarks || '']]));
  if (sh.getColumnWidth(4) < 82) sh.setColumnWidth(4, 82); // fit dd-MM-yyyy

  // Tehsil status dropdown (re-applied: the template copy may have lost its validation)
  sh.getRange('B38').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TEHSIL_STATUS, true).setAllowInvalid(true).build());
  sh.getRange('B38').setValue(f.tehsilStatus || '');
  SpreadsheetApp.flush();
}

/* ========================= Word details file ========================= */

function writeDetailsDocx_(folder, title, regId, f, checklist, files, note, gps, dups) {
  const doc = DocumentApp.create(`00 DBR Details - ${title}`);
  const id = doc.getId();
  try {
    const body = doc.getBody();
    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(42).setMarginRight(42);
    body.appendParagraph('Gyandhara Industries Pvt. Ltd. — New Distributor (DBR) Details').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(f.firmName || '').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(`Ref: ${regId}    Submitted: ${now_()}    Registered by: ${f.regName || ''} (${f.regMobile || ''})`)
      .editAsText().setFontSize(9).setForegroundColor('#555555');
    if (dups && dups.length) {
      body.appendParagraph('⚠ Possible duplicate: ' + dups.map(d => `same ${d.field} as ${d.regId} (${d.firm})`).join('; '))
        .editAsText().setForegroundColor('#b45309').setBold(true);
    }

    const section = (heading, rows) => {
      body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      const t = body.appendTable(rows.map(([k, v]) => [k, String(v || '—')]));
      styleTable_(t, false);
      for (let i = 0; i < t.getNumRows(); i++) t.getCell(i, 0).setWidth(170).editAsText().setBold(true);
    };
    section('Firm', [
      ['Firm Name', f.firmName], ['Address', f.address], ['District', f.district], ['Tehsil', f.tehsil],
      ['Pincode', f.pincode], ['State', f.state], ['Contact Person', f.contactPerson],
      ['Contact Number', [f.mobile1, f.mobile2].filter(Boolean).join(', ')], ['Email', f.email],
    ]);
    section('KYC & Bank', [
      ['Aadhaar No.', f.aadhaar], ['PAN No.', f.pan], ['GST No.', f.gst],
      ['Account Holder', f.accHolder], ['Bank Name', f.bankName], ['Account No.', f.accountNo], ['IFSC', f.ifsc],
    ]);
    section('Sales Hierarchy', [['Zone', f.zone], ['Rate Zone', f.rateZone], ['RSM', f.rsm], ['ASM', f.asm], ['SE', f.se], ['DB ID', f.dbId]]);
    section('Tehsil & First Order', [
      ['Tehsil Status', (f.tehsilStatus || '').replace(/:$/, '')], ['Existing / Replaced DB', f.existingDb],
      ['First Demand', f.firstDemandMt ? f.firstDemandMt + ' MT' : ''], ['Distance from Plant', f.distanceKm ? f.distanceKm + ' Kms' : ''],
      ['GPS Location', gps && gps.formatted ? gps.formatted : ''], ['Remark', f.remark],
    ]);
    if (gps && gps.mapsUrl) {
      const p = body.appendParagraph('Open shop location in Google Maps');
      p.editAsText().setLinkUrl(gps.mapsUrl).setFontSize(9);
    }

    body.appendParagraph('Appointment Checklist').setHeading(DocumentApp.ParagraphHeading.HEADING3);
    const ct = body.appendTable([['S No.', 'Formality', 'Responsibility', 'By When', 'Yes/No', 'Remarks']]
      .concat(checklist.map(c => [c.no || '', c.label || '', c.owner || '', c.date || '', c.status || '', c.remarks || ''])));
    styleTable_(ct, true);

    body.appendParagraph('Documents in this folder').setHeading(DocumentApp.ParagraphHeading.HEADING3);
    files.forEach(x => body.appendListItem(`${x.label}: ${x.name}`).editAsText().setLinkUrl(x.url));
    if (note) body.appendParagraph('Note: ' + note).editAsText().setForegroundColor('#a86b00');
    doc.saveAndClose();

    const blob = exportAs_(`https://docs.google.com/document/d/${id}/export?format=docx`, `00 DBR Details - ${title}.docx`);
    return folder.createFile(blob).getUrl();
  } finally {
    DriveApp.getFileById(id).setTrashed(true); // never leave the temporary Google Doc behind
  }
}

function styleTable_(t, headerRow) {
  t.setBorderColor('#c9d3cd');
  for (let r = 0; r < t.getNumRows(); r++) {
    const row = t.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cell.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(5).setPaddingRight(5);
      cell.editAsText().setFontSize(9.5);
      if (headerRow && r === 0) {
        cell.setBackgroundColor('#15803d');
        cell.editAsText().setBold(true).setForegroundColor('#ffffff');
      }
    }
  }
}

/* ============================ register ============================ */

// Written by column NAME, so HO can reorder or add their own columns safely.
const REGISTER_HEADERS = [
  'Ref ID', 'Submitted At', 'Folder Name', 'Firm Name', 'District', 'Tehsil', 'Address', 'Pincode', 'State',
  'Contact Person', 'Contact Number', 'Email', 'Aadhaar No.', 'PAN No.', 'GST No.', 'Account Holder',
  'Bank Name', 'Account No.', 'IFSC', 'Zone', 'Rate Zone', 'RSM', 'ASM', 'SE', 'DB ID', 'Tehsil Status',
  'Existing / Replaced DB', 'First Demand (MT)', 'Distance (Kms)', 'Remark', 'GPS', 'Registered By',
  'Registered Mobile', 'Files', 'Drive Folder', 'Checklist (Sheet)', 'Checklist (xlsx)', 'Details (docx)',
  'Possible Duplicate', 'Status', 'Verified By', 'Verified On', 'HO Remarks', 'Submission ID', 'App Version',
];

function upsertRegister_(req, folder, f, files, out, dups) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = getRegister_();
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const col = name => head.indexOf(name);
    const txt = v => (v ? "'" + v : ''); // keep long numbers as text (no 5.32E+11)
    const gps = req.gps && req.gps.latitude ? `${req.gps.latitude}, ${req.gps.longitude}` : '';
    const data = {
      'Ref ID': req.regId, 'Submitted At': now_(), 'Folder Name': folder.getName(), 'Firm Name': f.firmName,
      'District': f.district, 'Tehsil': f.tehsil, 'Address': f.address, 'Pincode': txt(f.pincode), 'State': f.state,
      'Contact Person': f.contactPerson, 'Contact Number': txt([f.mobile1, f.mobile2].filter(Boolean).join(', ')),
      'Email': f.email, 'Aadhaar No.': txt(f.aadhaar), 'PAN No.': f.pan, 'GST No.': f.gst, 'Account Holder': f.accHolder,
      'Bank Name': f.bankName, 'Account No.': txt(f.accountNo), 'IFSC': f.ifsc, 'Zone': f.zone, 'Rate Zone': f.rateZone,
      'RSM': f.rsm, 'ASM': f.asm, 'SE': f.se, 'DB ID': txt(f.dbId), 'Tehsil Status': (f.tehsilStatus || '').replace(/:$/, ''),
      'Existing / Replaced DB': f.existingDb, 'First Demand (MT)': Number(f.firstDemandMt) || '', 'Distance (Kms)': Number(f.distanceKm) || '',
      'Remark': f.remark, 'GPS': gps, 'Registered By': f.regName, 'Registered Mobile': txt(f.regMobile), 'Files': files.length,
      'Drive Folder': folder.getUrl(), 'Checklist (Sheet)': out.checklistUrl || '', 'Checklist (xlsx)': out.checklistXlsxUrl || '',
      'Details (docx)': out.detailsUrl || '', 'Possible Duplicate': dups.map(d => `${d.field}: ${d.regId}`).join('; '),
      'Submission ID': req.submissionId || '', 'App Version': (req.client && req.client.version) || '',
    };

    // Existing row for this submission? (retry) → update it, keep HO's Status / Verified columns
    let rowNo = -1;
    const sidCol = col('Submission ID');
    if (req.submissionId && sidCol >= 0 && sh.getLastRow() > 1) {
      const ids = sh.getRange(2, sidCol + 1, sh.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(req.submissionId)) { rowNo = i + 2; break; }
    }
    if (rowNo < 0) {
      data['Status'] = 'Pending Verification';
      rowNo = sh.getLastRow() + 1;
    }
    const row = rowNo <= sh.getLastRow() ? sh.getRange(rowNo, 1, 1, head.length).getValues()[0] : head.map(() => '');
    Object.keys(data).forEach(k => { const c = col(k); if (c >= 0) row[c] = data[k] == null ? '' : data[k]; });
    sh.getRange(rowNo, 1, 1, head.length).setValues([row]);
    if (dups.length && col('Possible Duplicate') >= 0) sh.getRange(rowNo, col('Possible Duplicate') + 1).setBackground('#fef3c7');
  } finally {
    lock.releaseLock();
  }
}

// Same PAN / Aadhaar / GST / account no. on an earlier DBR → returned as warnings (never blocks)
function findDuplicates_(f, submissionId) {
  const sh = getRegister_();
  if (sh.getLastRow() < 2) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues();
  const c = n => head.indexOf(n);
  const keys = [['PAN', 'PAN No.', f.pan], ['Aadhaar', 'Aadhaar No.', f.aadhaar], ['GST', 'GST No.', f.gst], ['Account no.', 'Account No.', f.accountNo]];
  const found = [];
  rows.forEach(r => {
    if (submissionId && String(r[c('Submission ID')]) === String(submissionId)) return;
    if (String(r[c('Status')]) === 'Rejected') return;
    keys.forEach(([label, colName, val]) => {
      if (!val || c(colName) < 0) return;
      if (String(r[c(colName)]).replace(/^'/, '').trim().toUpperCase() === String(val).toUpperCase()) {
        found.push({ field: label, regId: String(r[c('Ref ID')]), firm: String(r[c('Firm Name')]) });
      }
    });
  });
  return found.slice(0, 5);
}

// Returns the register tab with all current columns.
//  • old v1 tab (Employee Code, Territory…) → renamed "DBR Register (v1 old)", new tab created
//  • v2 tab → missing new columns are added at the end; existing rows are kept
function getRegister_() {
  const ss = SpreadsheetApp.openById(REGISTER_SHEET_ID);
  let sh = ss.getSheetByName(REGISTER_TAB);
  if (sh && sh.getLastColumn() > 0) {
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    if (head[0] !== 'Ref ID') {
      sh.setName(ss.getSheetByName(OLD_REGISTER_TAB) ? `${OLD_REGISTER_TAB} ${now_()}` : OLD_REGISTER_TAB);
      sh = null;
    } else {
      const missing = REGISTER_HEADERS.filter(h => head.indexOf(h) < 0);
      if (missing.length) {
        const start = head.filter(String).length + 1;
        if (sh.getMaxColumns() < start + missing.length - 1) sh.insertColumnsAfter(sh.getMaxColumns(), start + missing.length - 1 - sh.getMaxColumns());
        sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#15803d').setFontColor('#ffffff');
        applyStatusDropdown_(sh);
      }
    }
  }
  if (!sh) {
    sh = ss.insertSheet(REGISTER_TAB, 0);
    sh.getRange(1, 1, 1, REGISTER_HEADERS.length).setValues([REGISTER_HEADERS])
      .setFontWeight('bold').setBackground('#15803d').setFontColor('#ffffff').setWrap(true).setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(4);
    sh.setRowHeight(1, 36);
    sh.setColumnWidths(1, REGISTER_HEADERS.length, 130);
    sh.setColumnWidth(4, 220);
    sh.setColumnWidth(7, 260);
    applyStatusDropdown_(sh);
    const blank = ss.getSheetByName('Sheet1');
    if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  }
  return sh;
}

function applyStatusDropdown_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const c = head.indexOf('Status');
  if (c < 0) return;
  sh.getRange(2, c + 1, Math.max(1, sh.getMaxRows() - 1), 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).build());
}

/* ============================ reports ============================ */

// Live "Summary" tab built from formulas (no script needed to keep it current)
function buildSummary_() {
  const ss = SpreadsheetApp.openById(REGISTER_SHEET_ID);
  const reg = getRegister_();
  const head = reg.getRange(1, 1, 1, reg.getLastColumn()).getValues()[0].map(String);
  const L = name => colLetter_(head.indexOf(name) + 1);
  let sh = ss.getSheetByName(SUMMARY_TAB);
  if (sh) sh.clear(); else sh = ss.insertSheet(SUMMARY_TAB, 1);
  const R = `'${REGISTER_TAB}'!`;
  const blocks = [
    ['A1', 'DBR Onboarding — Summary (live)'],
    ['A3', 'Total DBRs'], ['B3', `=COUNTA(${R}${L('Ref ID')}2:${L('Ref ID')})`],
    ['A4', 'Pending verification'], ['B4', `=COUNTIF(${R}${L('Status')}2:${L('Status')},"Pending Verification")`],
    ['A5', 'Possible duplicates'], ['B5', `=COUNTIF(${R}${L('Possible Duplicate')}2:${L('Possible Duplicate')},"?*")`],
    ['A6', 'First demand total (MT)'], ['B6', `=SUM(${R}${L('First Demand (MT)')}2:${L('First Demand (MT)')})`],
    ['A8', 'By Zone'], ['A9', `=QUERY(${R}A:ZZ,"select ${L('Zone')}, count(${L('Ref ID')}), sum(${L('First Demand (MT)')}) where ${L('Ref ID')} is not null group by ${L('Zone')} order by count(${L('Ref ID')}) desc label ${L('Zone')} 'Zone', count(${L('Ref ID')}) 'DBRs', sum(${L('First Demand (MT)')}) 'First demand MT'",1)`],
    ['E8', 'By Status'], ['E9', `=QUERY(${R}A:ZZ,"select ${L('Status')}, count(${L('Ref ID')}) where ${L('Ref ID')} is not null group by ${L('Status')} label ${L('Status')} 'Status', count(${L('Ref ID')}) 'DBRs'",1)`],
    ['H8', 'By SE'], ['H9', `=QUERY(${R}A:ZZ,"select ${L('SE')}, ${L('Zone')}, count(${L('Ref ID')}) where ${L('Ref ID')} is not null group by ${L('SE')}, ${L('Zone')} order by count(${L('Ref ID')}) desc label ${L('SE')} 'SE', ${L('Zone')} 'Zone', count(${L('Ref ID')}) 'DBRs'",1)`],
  ];
  blocks.forEach(([a1, v]) => sh.getRange(a1).setValue(v));
  sh.getRange('A1').setFontSize(14).setFontWeight('bold');
  ['A3:A6', 'A8', 'E8', 'H8'].forEach(r => sh.getRange(r).setFontWeight('bold'));
  sh.getRange('B3:B6').setFontWeight('bold').setHorizontalAlignment('left');
  sh.setColumnWidth(1, 200);
}

// Daily email to REPORT_EMAILS with yesterday's DBRs (run installDailyReport once)
function sendDailyReport() {
  if (!REPORT_EMAILS.length) return;
  const sh = getRegister_();
  if (sh.getLastRow() < 2) return;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues();
  const c = n => head.indexOf(n);
  const y = Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'dd-MM-yyyy');
  const list = rows.filter(r => String(r[c('Submitted At')]).indexOf(y) === 0);
  const pending = rows.filter(r => r[c('Status')] === 'Pending Verification').length;
  const td = v => `<td style="padding:4px 8px;border:1px solid #ddd">${String(v || '')}</td>`;
  const html = `<h3 style="font-family:sans-serif">DBR onboarding — ${y}</h3>
    <p style="font-family:sans-serif">${list.length} new DBR(s) yesterday · ${pending} pending verification in total.</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
    <tr>${['Ref', 'Firm', 'District', 'Zone', 'SE', 'First MT', 'Duplicate?'].map(td).join('')}</tr>
    ${list.map(r => `<tr>${[r[c('Ref ID')], `<a href="${r[c('Drive Folder')]}">${r[c('Firm Name')]}</a>`, r[c('District')], r[c('Zone')], r[c('SE')], r[c('First Demand (MT)')], r[c('Possible Duplicate')]].map(td).join('')}</tr>`).join('')}
    </table><p><a href="https://docs.google.com/spreadsheets/d/${REGISTER_SHEET_ID}">Open DBR Register</a></p>`;
  MailApp.sendEmail({ to: REPORT_EMAILS.join(','), subject: `DBR onboarding — ${list.length} new on ${y}`, htmlBody: html });
}

function installDailyReport() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDailyReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailyReport').timeBased().atHour(9).everyDays(1).inTimezone(TZ).create();
  Logger.log('Daily report scheduled for 9 AM IST to: ' + REPORT_EMAILS.join(', '));
}

function logError_(action, err, firm, extra) {
  try {
    const ss = SpreadsheetApp.openById(REGISTER_SHEET_ID);
    let sh = ss.getSheetByName(ERROR_TAB);
    if (!sh) {
      sh = ss.insertSheet(ERROR_TAB);
      sh.appendRow(['Time', 'Action', 'Firm', 'Detail', 'Error']);
      sh.getRange(1, 1, 1, 5).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.appendRow([now_(), action || '', firm || '', extra || '', String((err && err.message) || err)]);
    if (sh.getLastRow() > 2000) sh.deleteRows(2, 500); // keep the log small
  } catch (e) { console.error(e); }
}

/* ============================= helpers ============================= */

// Zone / month sub-folders keep the root folder tidy and easy to share per zone
function groupFolder_(f) {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  let name = '';
  if (GROUP_BY === 'zone') name = safe_(f.zone || 'No Zone');
  if (GROUP_BY === 'month') name = Utilities.formatDate(new Date(), TZ, 'yyyy-MM MMMM');
  if (!name) return root;
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// Only allow writing into folders that sit inside ROOT_FOLDER_ID (up to 3 levels deep)
function assertInsideRoot_(folder) {
  let level = [folder];
  for (let depth = 0; depth < 3; depth++) {
    const next = [];
    for (const f of level) {
      const parents = f.getParents();
      while (parents.hasNext()) {
        const p = parents.next();
        if (p.getId() === ROOT_FOLDER_ID) return;
        next.push(p);
      }
    }
    level = next;
  }
  throw new Error('Folder not allowed');
}

function exportAs_(url, name) {
  let res;
  for (let i = 0; i < 3; i++) {
    res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return res.getBlob().setName(name);
    Utilities.sleep(1500 * (i + 1)); // Drive export is sometimes briefly unavailable
  }
  throw new Error('Export failed (' + res.getResponseCode() + ')');
}

function nextRegId_(props) {
  const n = Number(props.getProperty('DBR_SEQ') || 0) + 1;
  props.setProperty('DBR_SEQ', String(n));
  return `DBR-${Utilities.formatDate(new Date(), TZ, 'yyMMdd')}-${String(n).padStart(4, '0')}`;
}

function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function safe_(s) { return String(s).replace(/[\\/:*?"<>|#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy HH:mm:ss'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ============================ run once ============================ */

// Run from the editor once after pasting: grants permissions, upgrades the register, builds Summary.
function setup() {
  Logger.log('Root folder: ' + DriveApp.getFolderById(ROOT_FOLDER_ID).getName());
  Logger.log('Template: ' + SpreadsheetApp.openById(CHECKLIST_TEMPLATE_ID).getName());
  Logger.log('Register: ' + SpreadsheetApp.openById(REGISTER_SHEET_ID).getName());
  getRegister_();
  buildSummary_();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); // external_request permission
  const d = DocumentApp.create('tmp-permission-check'); DriveApp.getFileById(d.getId()).setTrashed(true);
  Logger.log('Setup OK. Now: Deploy → Manage deployments → ✏️ → New version → Deploy.');
}

// Optional: creates a full sample DBR (no files) so you can check the folder, checklist, Word file and register row.
function testFinalize() {
  const fields = {
    firmName: 'TEST Sanjay Pashu Aahar Kendra', district: 'Prayagraj', tehsil: 'Sadar', state: 'Uttar Pradesh',
    address: 'Galla Mandi, Sadar, Prayagraj, Uttar Pradesh', pincode: '211011', contactPerson: 'Rahul Kesarwani',
    mobile1: '8299635263', mobile2: '9335120002', email: 'rahul90614080@gmail.com', aadhaar: '532404037175',
    pan: 'EFVPK7879M', gst: '09EFVPK7879M1ZY', accHolder: 'Sanjay Pashu Aahar kendra', bankName: 'Bank of Baroda',
    accountNo: '66600500000012', ifsc: 'BARB0VVJPRE', zone: 'UP East I', rateZone: '', rsm: 'Dipendra Singh',
    asm: 'Prem Sagar', se: 'Nitin Pandey', dbId: '', tehsilStatus: 'Vacant Tehsil, DB Replaced By:',
    existingDb: 'Pashu Aahar Kendra (10416)', firstDemandMt: '10', distanceKm: '', remark: 'Test entry — delete me',
    regName: 'Test User', regMobile: '9999999999',
  };
  const sid = 'test-' + Date.now();
  const c = create_({ submissionId: sid, fields });
  const r = finalize_({ submissionId: sid, regId: c.regId, folderId: c.folderId, fields, files: [], client: { version: 'test' },
    checklist: [{ row: 14, no: '1', label: 'Distributor Appointments Form', owner: 'SE/ASM', status: 'Yes', date: today_(), remarks: 'test' }] });
  Logger.log(c.folderUrl + '\n' + JSON.stringify(r));
}
