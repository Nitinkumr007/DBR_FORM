import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_TITLE, APP_VERSION, COMPANY, FORM_SECTIONS, STEPS, DOCUMENTS, CHECKLIST, KYC_MERGED_FILE, MAX_FILE_MB,
} from './config.js';
import { createEntry, uploadFile, finalizeEntry, isConfigured, lookupIfsc } from './api.js';
import { prepareFile, attachPreview, formatSize, bytesToBase64, extFor } from './fileUtils.js';
import { mergeToPdf, buildKycPdf } from './pdfUtils.js';
import { saveFiles, loadFiles, idbDel, requestPersistentStorage, ls } from './storage.js';
import { cleanInput, checkField, checkDoc } from './validators.js';
import {
  isMobileAppEnvironment, getMobileInitialParams, sendToMobileApp,
  triggerHaptic, getGPSCoordinates, lookupPinCode,
} from './mobileBridge.js';
import { TRANSLATIONS } from './i18n.js';

// SVG Icons for clean, crisp, lightweight mobile UI
const Icons = {
  User: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Badge: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h6M7 16h4"/>
    </svg>
  ),
  Building: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/><line x1="9" y1="18" x2="9" y2="18.01"/><line x1="15" y1="18" x2="15" y2="18.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/>
    </svg>
  ),
  Phone: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  Mail: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  MapPin: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Gps: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  Hash: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  ),
  FileText: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Camera: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  Upload: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Alert: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Trash: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  Copy: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  WhatsApp: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  ),
  External: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
  Sun: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  Globe: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};


const ALL_FIELDS = FORM_SECTIONS.flatMap((s) => s.fields);
const SECTION_BY_ID = Object.fromEntries(FORM_SECTIONS.map((s) => [s.id, s]));
const DRAFT_KEY = 'dbr-draft-v3';        // typed fields, checklist, GPS
const PROFILE_KEY = 'dbr-profile-v1';    // officer + hierarchy, kept across DBRs
const ATTEMPT_KEY = 'dbr-attempt-v1';    // in-progress submission (folder + uploaded files)
const LAST_STEP = STEPS.length - 1;

const isShown = (f, v) => !f.showIf || f.showIf(v);
const todayDMY = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};
const ymdToDmy = (s) => (s ? s.split('-').reverse().join('-') : '');
// Identity of the picked files behind one output (rebuilt PDFs differ byte-wise, sources don't)
const sigOf = (items) => items.map((i) => `${i.id}:${i.size}`).join(',');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function emptyFields() {
  const base = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, '']));
  return { ...base, ...(ls.get(PROFILE_KEY, {}) || {}) };
}

function loadDraft() {
  const d = ls.get(DRAFT_KEY, null);
  const base = emptyFields();
  if (d?.fields) for (const f of ALL_FIELDS) if (d.fields[f.key] != null) base[f.key] = cleanInput(f, String(d.fields[f.key]));
  // Values passed by the host mobile app in the URL win
  for (const [k, v] of Object.entries(getMobileInitialParams())) {
    const f = ALL_FIELDS.find((x) => x.key === k);
    if (f && v) base[k] = cleanInput(f, v);
  }
  return { fields: base, check: d?.check || {}, gps: d?.gps || null };
}

export default function App() {
  const initial = useMemo(loadDraft, []);
  const [fields, setFields] = useState(initial.fields);
  const [check, setCheck] = useState(initial.check);       // checklist row -> { status, date(yyyy-mm-dd), remarks }
  const [gpsData, setGpsData] = useState(initial.gps);
  const [files, setFiles] = useState({});                  // docKey -> [prepared file]
  const [filesReady, setFilesReady] = useState(false);     // true once restored from phone storage
  const [restoredCount, setRestoredCount] = useState(0);
  const [touched, setTouched] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [fileNotes, setFileNotes] = useState({});
  const [busyDoc, setBusyDoc] = useState(null);
  const [status, setStatus] = useState({ phase: 'idle' });
  const [progress, setProgress] = useState({ done: 0, total: 1, label: '' });
  const [ifscInfo, setIfscInfo] = useState(null);
  const [pinNotice, setPinNotice] = useState(() => lookupPinCode(initial.fields.pincode));
  const [fetchingGps, setFetchingGps] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [lang, setLang] = useState(() => (getMobileInitialParams().lang === 'hi' ? 'hi' : ls.get('dbr-lang', 'en')));
  const [sunlightMode, setSunlightMode] = useState(() => getMobileInitialParams().theme === 'sunlight' || ls.get('dbr-sunlight', false));
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isAppEmbedded] = useState(() => isMobileAppEnvironment());
  const [currentStep, setCurrentStep] = useState(0);
  const [viewMode, setViewMode] = useState('wizard');
  const [activeLightbox, setActiveLightbox] = useState(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [lastSaved, setLastSaved] = useState('');
  const autoBank = useRef(false);
  const wakeLock = useRef(null);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  /* ---------------- environment ---------------- */

  useEffect(() => {
    if (sunlightMode) document.documentElement.setAttribute('data-theme', 'sunlight');
    else document.documentElement.removeAttribute('data-theme');
    ls.set('dbr-sunlight', sunlightMode);
  }, [sunlightMode]);

  useEffect(() => {
    const on = () => { setIsOnline(true); triggerHaptic('light'); };
    const off = () => { setIsOnline(false); triggerHaptic('warning'); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    requestPersistentStorage();
    sendToMobileApp('DBR_PORTAL_READY', { isConfigured: isConfigured(), appTitle: APP_TITLE, company: COMPANY, version: APP_VERSION });
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    sendToMobileApp('DBR_STEP_CHANGED', { step: currentStep, stepTitle: t.steps[STEPS[currentStep].id]?.title, totalSteps: STEPS.length });
  }, [currentStep, t]);

  /* ---------------- drafts (fields + files survive reloads) ---------------- */

  useEffect(() => {
    if (ls.set(DRAFT_KEY, { fields, check, gps: gpsData, at: Date.now() })) {
      setLastSaved(`${t.savedToPhone} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
    }
  }, [fields, check, gpsData, t]);

  // Restore photos/PDFs saved on the phone
  useEffect(() => {
    let live = true;
    loadFiles().then((saved) => {
      if (!live) return;
      if (saved && typeof saved === 'object') {
        const restored = {};
        let n = 0;
        for (const d of DOCUMENTS) {
          const arr = (saved[d.key] || []).filter((f) => f && f.bytes && f.type).map((f) => attachPreview({ ...f, preview: null }));
          if (arr.length) { restored[d.key] = arr; n += arr.length; }
        }
        setFiles(restored);
        setRestoredCount(n);
      }
      setFilesReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!filesReady) return undefined;
    const id = setTimeout(() => saveFiles(files), 400);
    return () => clearTimeout(id);
  }, [files, filesReady]);

  // Warn before closing the tab in the middle of an upload
  useEffect(() => {
    if (status.phase !== 'sending') return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [status.phase]);

  /* ---------------- IFSC -> bank name ---------------- */

  useEffect(() => {
    const code = fields.ifsc;
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code || '')) { setIfscInfo(null); return undefined; }
    let live = true;
    lookupIfsc(code).then((info) => {
      if (!live) return;
      setIfscInfo(info);
      if (info?.bank) {
        setFields((p) => {
          if (p.bankName && !autoBank.current) return p;
          autoBank.current = true;
          return { ...p, bankName: info.bank };
        });
      }
    });
    return () => { live = false; };
  }, [fields.ifsc]);

  /* ---------------- validation ---------------- */

  const context = useMemo(() => ({ ...fields, state: lookupPinCode(fields.pincode)?.state || '' }), [fields]);
  const visibleFields = useMemo(() => ALL_FIELDS.filter((f) => isShown(f, fields)), [fields]);

  const checks = useMemo(() => {
    const r = {};
    for (const f of visibleFields) r[f.key] = checkField(f, fields[f.key], context);
    if (ifscInfo?.notFound && !r.ifsc?.error) r.ifsc = { warn: 'This IFSC was not found in the bank directory. Check it against the cheque.' };
    for (const d of DOCUMENTS) r[d.key] = checkDoc(d, files[d.key]);
    return r;
  }, [visibleFields, fields, context, files, ifscInfo]);

  const shown = (key) => (showAll || touched[key] ? checks[key] || {} : {});
  const problems = [...visibleFields, ...DOCUMENTS].filter((x) => checks[x.key]?.error);

  const stepItems = useCallback((step) => {
    if (step.docs) return DOCUMENTS;
    if (step.review) return [];
    return (step.sections || []).flatMap((id) => SECTION_BY_ID[id]?.fields || []).filter((f) => isShown(f, fields));
  }, [fields]);

  const stepStatus = useMemo(() => STEPS.map((s) => {
    if (s.review) return { complete: problems.length === 0, hasError: showAll && problems.length > 0 };
    const items = stepItems(s);
    return {
      complete: items.every((x) => !checks[x.key]?.error),
      hasError: items.some((x) => (touched[x.key] || showAll) && checks[x.key]?.error),
    };
  }), [checks, problems.length, stepItems, touched, showAll]);

  const totalFiles = useMemo(() => Object.values(files).reduce((n, a) => n + a.length, 0), [files]);
  const reqDocs = DOCUMENTS.filter((d) => d.required);
  const reqDone = reqDocs.filter((d) => files[d.key]?.length).length;

  const effectiveCheck = useMemo(() => {
    const out = {};
    for (const c of CHECKLIST) {
      const auto = c.auto && c.auto.every((k) => files[k]?.length);
      const m = check[c.row] || {};
      out[c.row] = auto
        ? { status: 'Yes', date: todayDMY(), remarks: 'Uploaded via DBR app', auto: true }
        : { status: m.status || '', date: ymdToDmy(m.date || ''), remarks: m.remarks || '' };
    }
    return out;
  }, [check, files]);

  /* ---------------- editing ---------------- */

  function setField(f, value) {
    const cleaned = cleanInput(f, value);
    if (f.key === 'bankName') autoBank.current = false;
    setFields((prev) => {
      const next = { ...prev, [f.key]: cleaned };
      // GST contains the PAN — fill PAN if it is still empty
      if (f.key === 'gst' && cleaned.length >= 12) {
        const pan = cleaned.slice(2, 12);
        if (/^[A-Z]{5}\d{4}[A-Z]$/.test(pan) && !next.pan) next.pan = pan;
      }
      return next;
    });
    if (f.key === 'pincode') setPinNotice(cleaned.length === 6 ? lookupPinCode(cleaned) : null);
  }

  const touch = (key) => setTouched((p) => (p[key] ? p : { ...p, [key]: true }));

  async function handleFetchGPS() {
    setFetchingGps(true);
    setGpsError(null);
    try {
      const coords = await getGPSCoordinates();
      setGpsData(coords);
      sendToMobileApp('DBR_GPS_CAPTURED', coords);
    } catch (err) {
      setGpsError(err.message || 'Unable to fetch location.');
    } finally {
      setFetchingGps(false);
    }
  }

  async function addFiles(doc, fileList) {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    triggerHaptic('medium');
    setBusyDoc(doc.key);
    const ready = [];
    const skipped = [];
    for (const f of picked) {
      try {
        const p = await prepareFile(f);
        if (doc.accept === 'image' && p.type === 'application/pdf') skipped.push(`${f.name}: this slot needs a photo, not a PDF`);
        else if (p.size > MAX_FILE_MB * 1048576) skipped.push(`${f.name} is ${formatSize(p.size)}, over the ${MAX_FILE_MB} MB limit`);
        else ready.push(p);
      } catch (e) {
        skipped.push(e.message || `${f.name} could not be processed`);
      }
    }
    setFiles((prev) => ({ ...prev, [doc.key]: [...(prev[doc.key] || []), ...ready] }));
    setFileNotes((n) => ({ ...n, [doc.key]: skipped.join(' · ') }));
    setTouched((p) => ({ ...p, [doc.key]: true }));
    setBusyDoc(null);
    triggerHaptic(skipped.length ? 'warning' : 'light');
  }

  function removeFile(docKey, idx) {
    triggerHaptic('medium');
    setFiles((prev) => {
      const arr = [...(prev[docKey] || [])];
      const [gone] = arr.splice(idx, 1);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return { ...prev, [docKey]: arr };
    });
    setActiveLightbox(null);
  }

  function goToField(key) {
    triggerHaptic('light');
    if (viewMode === 'wizard') {
      const idx = STEPS.findIndex((s) => stepItems(s).some((x) => x.key === key));
      if (idx >= 0) setCurrentStep(idx);
    }
    setTimeout(() => {
      const el = document.querySelector(`[data-key="${key}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById(key)?.focus({ preventScroll: true });
      }
    }, 120);
  }

  function handleNextStep() {
    triggerHaptic('light');
    const items = stepItems(STEPS[currentStep]);
    setTouched((p) => ({ ...p, ...Object.fromEntries(items.map((x) => [x.key, true])) }));
    const bad = items.find((x) => checks[x.key]?.error);
    if (bad) { triggerHaptic('error'); goToField(bad.key); return; }
    setCurrentStep((s) => Math.min(LAST_STEP, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handlePrevStep() {
    triggerHaptic('light');
    setCurrentStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- submit ---------------- */

  // Each slot -> exactly one Drive file; plus the merged, captioned KYC PDF
  async function buildOutputs(firm) {
    const out = [];
    for (const d of DOCUMENTS) {
      const items = files[d.key] || [];
      if (!items.length) continue;
      if (items.length === 1) {
        out.push({ key: d.key, label: d.label, name: `${d.file}.${extFor(items[0].type)}`, type: items[0].type, bytes: items[0].bytes, sig: sigOf(items) });
      } else {
        out.push({ key: d.key, label: d.label, name: `${d.file}.pdf`, type: 'application/pdf', bytes: await mergeToPdf(items, `${d.label} - ${firm}`), sig: sigOf(items) });
      }
    }
    let note = '';
    const sections = DOCUMENTS.filter((d) => d.kyc && files[d.key]?.length).map((d) => ({ caption: d.label.replace(/—/g, '-'), items: files[d.key] }));
    if (sections.length) {
      const { bytes, skipped } = await buildKycPdf(sections, `KYC Documents - ${firm}`);
      out.push({ key: '__kyc', label: 'KYC Documents (Merged)', name: `${KYC_MERGED_FILE}.pdf`, type: 'application/pdf', bytes, sig: sections.map((x) => sigOf(x.items)).join('#') });
      if (skipped.length) note = `Not in merged KYC PDF (file unreadable): ${skipped.join(', ')}`;
    }
    const big = out.find((o) => o.bytes.length > MAX_FILE_MB * 1048576);
    if (big) throw new Error(`${big.label} is ${formatSize(big.bytes.length)} after joining — the limit is ${MAX_FILE_MB} MB. Remove a few pages or use photos instead of large scans.`);
    return { out, note };
  }

  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) wakeLock.current = await navigator.wakeLock.request('screen');
      if (!on && wakeLock.current) { await wakeLock.current.release(); wakeLock.current = null; }
    } catch { /* not supported */ }
  }

  async function submit(ev) {
    if (ev) ev.preventDefault();
    if (status.phase === 'sending') return;
    triggerHaptic('medium');
    setShowAll(true);
    if (problems.length) { triggerHaptic('error'); goToField(problems[0].key); return; }
    if (!isConfigured()) { setStatus({ phase: 'error', message: 'App is in demo mode (VITE_SCRIPT_URL is not set).' }); return; }
    if (!navigator.onLine) { setStatus({ phase: 'error', message: 'No internet connection' }); return; }

    const clean = {};
    for (const f of ALL_FIELDS) {
      if (f.local) continue;
      clean[f.key] = isShown(f, fields) ? String(fields[f.key] ?? '').trim() : '';
    }
    clean.state = context.state;
    ls.set(PROFILE_KEY, Object.fromEntries(ALL_FIELDS.filter((f) => f.persist).map((f) => [f.key, clean[f.key]])));

    setStatus({ phase: 'sending' });
    setProgress({ done: 0, total: 1, label: 'Preparing documents…' });
    keepAwake(true);
    try {
      const { out, note } = await buildOutputs(clean.firmName);
      const total = out.length + 2;

      // Resume an interrupted submission (same folder, skip files already sent)
      let attempt = ls.get(ATTEMPT_KEY, null);
      if (!attempt || attempt.firmName !== clean.firmName) attempt = { submissionId: uid(), firmName: clean.firmName, uploaded: {} };
      if (!attempt.folder) {
        setProgress({ done: 0, total, label: 'Creating DBR folder in Drive…' });
        attempt.folder = await createEntry(attempt.submissionId, clean);
        ls.set(ATTEMPT_KEY, attempt);
      }
      const { folder } = attempt;

      for (let i = 0; i < out.length; i++) {
        const o = out[i];
        const sig = `${o.name}|${o.sig}`; // same source photos → already uploaded
        setProgress({ done: i + 1, total, label: `Uploading ${o.label} (${i + 1}/${out.length})…` });
        if (attempt.uploaded[o.key]?.sig === sig) continue;
        const r = await uploadFile(folder.folderId, o.label, { name: o.name, type: o.type, base64: bytesToBase64(o.bytes) });
        attempt.uploaded[o.key] = { label: o.label, name: o.name, url: r.fileUrl, sig, size: o.bytes.length };
        ls.set(ATTEMPT_KEY, attempt);
      }
      // Slots emptied since an earlier attempt are not listed
      const sentKeys = new Set(out.map((o) => o.key));
      const uploaded = Object.entries(attempt.uploaded).filter(([k]) => sentKeys.has(k)).map(([, v]) => v);

      setProgress({ done: total - 1, total, label: 'Filling checklist & saving record…' });
      const fin = await finalizeEntry({
        submissionId: attempt.submissionId,
        regId: folder.regId,
        folderId: folder.folderId,
        fields: clean,
        checklist: CHECKLIST.map((c) => ({ row: c.row, no: c.no, label: c.label, owner: c.owner, ...effectiveCheck[c.row] })),
        files: uploaded,
        gps: gpsData,
        note,
        client: { version: APP_VERSION, embedded: isAppEmbedded, ua: navigator.userAgent.slice(0, 160) },
      });

      setProgress({ done: total, total, label: 'Completed!' });
      triggerHaptic('success');
      setStatus({ phase: 'done', ...folder, ...fin, count: uploaded.length, note: fin.note || note, snapshot: clean });
      ls.del(ATTEMPT_KEY);
      ls.del(DRAFT_KEY);
      idbDel('files');
      sendToMobileApp('DBR_SUBMIT_SUCCESS', {
        regId: folder.regId, folderUrl: folder.folderUrl, firmName: clean.firmName,
        contactPerson: clean.contactPerson, mobile: clean.mobile1, count: uploaded.length,
      });
    } catch (err) {
      triggerHaptic('error');
      setStatus({ phase: 'error', message: err.message || String(err) });
      sendToMobileApp('DBR_SUBMIT_ERROR', { message: err.message || String(err) });
    } finally {
      keepAwake(false);
    }
  }

  function resetForm() {
    Object.values(files).flat().forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    ls.del(ATTEMPT_KEY);
    ls.del(DRAFT_KEY);
    idbDel('files');
    setFields(emptyFields());
    setFiles({});
    setCheck({});
    setGpsData(null);
    setTouched({});
    setShowAll(false);
    setFileNotes({});
    setCurrentStep(0);
    setStatus({ phase: 'idle' });
    setPinNotice(null);
    setIfscInfo(null);
    setRestoredCount(0);
    window.scrollTo({ top: 0 });
  }

  function startNew() {
    triggerHaptic('medium');
    if (status.phase === 'done' || window.confirm('Start a new DBR form? Everything entered for this DBR will be cleared.')) resetForm();
  }

  function copyReferenceId(refId) {
    triggerHaptic('light');
    navigator.clipboard?.writeText(refId);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  }

  function toggleLanguage() {
    triggerHaptic('light');
    const next = lang === 'en' ? 'hi' : 'en';
    setLang(next);
    ls.set('dbr-lang', next);
  }

  const shellProps = {
    onReset: startNew, lastSaved, lang, onToggleLang: toggleLanguage,
    sunlightMode, onToggleSunlight: () => { triggerHaptic('light'); setSunlightMode((p) => !p); }, isOnline,
  };

  /* ---------------- success ---------------- */

  if (status.phase === 'done') {
    const s = status.snapshot || {};
    const waText = encodeURIComponent(
      `*Gyandhara — New DBR registered*\n\n` +
      `*Firm:* ${s.firmName}\n*Contact:* ${s.contactPerson} (${s.mobile1})\n` +
      `*District / Tehsil:* ${s.district} / ${s.tehsil}\n*Zone:* ${s.zone} · *SE:* ${s.se}\n` +
      `*First demand:* ${s.firstDemandMt} MT\n*Ref:* ${status.regId}\n\n*Drive folder:* ${status.folderUrl || ''}`
    );
    return (
      <Shell {...shellProps}>
        <div className="main-wrap">
          <div className="success-card">
            <div className="success-badge">✓</div>
            <h2 className="success-title">{lang === 'hi' ? 'डीबीआर पंजीकरण सफल!' : 'DBR Registered!'}</h2>
            <p className="doc-meta-row">
              {lang === 'hi'
                ? 'सभी विवरण, दस्तावेज़, चेकलिस्ट और वर्ड फाइल गूगल ड्राइव में सुरक्षित हैं।'
                : 'Details, documents, checklist and Word file are saved in Google Drive.'}
            </p>
            <div className="ref-box">
              <span className="ref-label">{lang === 'hi' ? 'ड्राइव फोल्डर' : 'Drive folder'}</span>
              <span className="ref-code" style={{ fontSize: '15px', wordBreak: 'break-word' }}>{status.folderName}</span>
              <span className="ref-label">{lang === 'hi' ? 'संदर्भ संख्या' : 'Reference ID'}: <b>{status.regId}</b> · {status.count} {t.files}</span>
              <button type="button" className="copy-pill-btn" onClick={() => copyReferenceId(status.regId)}>
                {copiedRef ? '✓ Copied' : (lang === 'hi' ? 'आईडी कॉपी करें' : 'Copy Reference ID')}
              </button>
            </div>
            {status.duplicates?.length > 0 && (
              <div className="alert-banner warn" style={{ textAlign: 'left' }}>
                <Icons.Alert />
                <div><b>Possible duplicate:</b> {status.duplicates.map((d) => `same ${d.field} as ${d.regId} (${d.firm})`).join('; ')}. HO will check.</div>
              </div>
            )}
            {status.note && (
              <div className="alert-banner warn" style={{ textAlign: 'left' }}><Icons.Alert /><div>{status.note}</div></div>
            )}
            <div className="success-actions">
              <a className="btn-whatsapp" href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer">
                <Icons.WhatsApp /><span>{lang === 'hi' ? 'व्हाट्सएप पर शेयर करें' : 'Share on WhatsApp'}</span>
              </a>
              {status.folderUrl && (
                <a className="btn-secondary-action" href={status.folderUrl} target="_blank" rel="noreferrer">
                  <Icons.External /><span>{lang === 'hi' ? 'ड्राइव फोल्डर खोलें' : 'Open Drive Folder'}</span>
                </a>
              )}
              {status.checklistUrl && (
                <a className="btn-secondary-action" href={status.checklistUrl} target="_blank" rel="noreferrer">
                  <Icons.FileText /><span>{lang === 'hi' ? 'चेकलिस्ट खोलें' : 'Open Checklist'}</span>
                </a>
              )}
              <button type="button" className="btn-secondary-action" onClick={startNew}>
                + {lang === 'hi' ? 'नया डीबीआर जोड़ें' : 'Onboard Another DBR'}
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  /* ---------------- form ---------------- */

  const sending = status.phase === 'sending';
  const progressPercent = Math.round((progress.done / Math.max(1, progress.total)) * 100);
  const stepVisible = (idx) => (viewMode === 'all' ? !STEPS[idx].review : currentStep === idx);
  const fieldProps = (f) => ({
    f, value: fields[f.key] ?? '', check: shown(f.key), disabled: sending, lang,
    onChange: (v) => setField(f, v), onBlur: () => touch(f.key),
    info: f.key === 'bankName' && ifscInfo?.branch ? `Branch: ${ifscInfo.branch}, ${ifscInfo.city}` : '',
  });
  const checklistCard = (
    <ChecklistCard t={t} check={check} effective={effectiveCheck} disabled={sending}
      onChange={(row, patch) => setCheck((p) => ({ ...p, [row]: { ...p[row], ...patch } }))} />
  );

  const renderSections = (step) => step.sections.map((id) => {
    const sec = SECTION_BY_ID[id];
    const fs = sec.fields.filter((f) => isShown(f, fields));
    return (
      <div key={id} className="form-subsection">
        {step.sections.length > 1 && <h3 className="subsection-title">{t.sections?.[id] || sec.title}</h3>}
        {id === 'firm' && pinNotice && (
          <div className="pin-hint-tag"><span>💡 {t.pinHint}: <b>{pinNotice.state}</b> ({pinNotice.sampleDistrict})</span></div>
        )}
        <div className="fields-grid">{fs.map((f) => <Field key={f.key} {...fieldProps(f)} />)}</div>
        {id === 'tehsil' && (
          <div className="gps-action-box">
            <button type="button" className={`gps-pill-btn ${gpsData ? 'active' : ''}`} onClick={handleFetchGPS} disabled={fetchingGps || sending}>
              <Icons.Gps />
              <span>{fetchingGps ? (lang === 'hi' ? 'स्थान खोज रहे हैं…' : 'Detecting GPS…') : gpsData ? `✓ ${gpsData.formatted}` : t.gpsButton}</span>
            </button>
            {gpsError && <div className="gps-error-note"><Icons.Alert /><span>{gpsError}</span></div>}
          </div>
        )}
      </div>
    );
  });

  const renderReview = () => (
    <>
      {FORM_SECTIONS.map((sec) => {
        const idx = STEPS.findIndex((s) => s.sections?.includes(sec.id));
        const fs = sec.fields.filter((f) => !f.local && isShown(f, fields));
        return (
          <div className="review-group" key={sec.id}>
            <div className="review-group-head">
              <span className="review-group-title">{t.sections?.[sec.id] || sec.title}</span>
              <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(idx)}>{t.edit}</button>
            </div>
            {fs.map((f) => (
              <div className="review-item" key={f.key}>
                <span className="review-item-label">{t.fields[f.key]?.label || f.label}</span>
                <span className={`review-item-val ${['pan', 'gst', 'ifsc', 'aadhaar', 'account'].includes(f.check) ? 'mono-badge' : ''}`}>
                  {String(fields[f.key] || '').replace(/:$/, '') || '—'}
                </span>
              </div>
            ))}
            {sec.id === 'tehsil' && gpsData && (
              <div className="review-item"><span className="review-item-label">GPS</span><span className="review-item-val">{gpsData.formatted}</span></div>
            )}
          </div>
        );
      })}
      <div className="review-group">
        <div className="review-group-head">
          <span className="review-group-title">{t.steps.docs.title}</span>
          <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(STEPS.findIndex((s) => s.docs))}>{t.edit}</button>
        </div>
        {DOCUMENTS.map((d) => (
          <div className="review-item" key={d.key}>
            <span className="review-item-label">{t.docs[d.key] || d.label}</span>
            <span className="review-item-val">
              {files[d.key]?.length ? `✓ ${files[d.key].length > 1 ? `${files[d.key].length} → 1 PDF` : '1 file'}` : d.required ? '✗ missing' : '—'}
            </span>
          </div>
        ))}
      </div>
      {checklistCard}
    </>
  );

  return (
    <Shell {...shellProps}>
      {!isOnline && (
        <div className="main-wrap" style={{ paddingBottom: 0 }}>
          <div className="alert-banner offline-banner">
            <Icons.Alert />
            <div><b>{lang === 'hi' ? 'ऑफ़लाइन:' : 'Offline:'}</b> {lang === 'hi' ? 'इंटरनेट नहीं है। आपका ड्राफ्ट और फोटो फोन में सुरक्षित हैं।' : 'No internet. Your draft and photos are saved on this phone — submit when you are back online.'}</div>
          </div>
        </div>
      )}
      {!isConfigured() && (
        <div className="main-wrap" style={{ paddingBottom: 0 }}>
          <div className="alert-banner warn"><Icons.Alert /><div><b>Demo mode:</b> VITE_SCRIPT_URL is not set, so nothing can be submitted.</div></div>
        </div>
      )}
      {restoredCount > 0 && status.phase === 'idle' && (
        <div className="main-wrap" style={{ paddingBottom: 0 }}>
          <div className="alert-banner restored-banner">
            <Icons.Check />
            <div>{t.restoredFiles} ({restoredCount} {t.files})</div>
            <button type="button" className="banner-close" onClick={() => setRestoredCount(0)} aria-label="Dismiss"><Icons.X /></button>
          </div>
        </div>
      )}

      <nav className="stepper-nav" aria-label="Registration steps">
        <div className="stepper-inner">
          <div className="stepper-meta">
            <div className="stepper-counter">
              <span>{t.step} {currentStep + 1} {t.of} {STEPS.length}</span>
              <span className="stepper-step-name">· {t.steps[STEPS[currentStep].id].title}</span>
            </div>
            <span className="stepper-pct">{Math.round(((currentStep + 1) / STEPS.length) * 100)}%</span>
          </div>
          <div className="stepper-progress-track">
            <div className="stepper-progress-fill" style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="stepper-pills">
            {STEPS.map((s, idx) => {
              const st = stepStatus[idx];
              return (
                <button key={s.id} type="button"
                  className={`step-pill ${currentStep === idx ? 'active' : ''} ${st.complete ? 'completed' : ''} ${st.hasError ? 'has-error' : ''}`}
                  onClick={() => { triggerHaptic('light'); setViewMode('wizard'); setCurrentStep(idx); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <span className="step-pill-indicator">{st.complete ? '✓' : idx + 1}</span>
                  <span className="step-pill-label">{t.steps[s.id].label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="view-mode-bar">
        <button type="button" className="view-mode-btn" onClick={() => { triggerHaptic('light'); setViewMode((m) => (m === 'wizard' ? 'all' : 'wizard')); }}>
          {viewMode === 'wizard' ? t.showAll : t.showWizard}
        </button>
      </div>

      <main className="main-wrap">
        <form onSubmit={(ev) => { ev.preventDefault(); if (viewMode === 'wizard' && currentStep < LAST_STEP) handleNextStep(); else submit(); }} noValidate>
          {STEPS.map((step, idx) => {
            if (!stepVisible(idx)) return null;
            const Icon = Icons[step.icon] || Icons.FileText;
            const info = t.steps[step.id];
            return (
              <section className="step-card" key={step.id}>
                <div className="step-card-header">
                  <div className="step-card-title-group">
                    <h2 className="step-card-title"><Icon />{step.review ? t.reviewTitle : info.title}</h2>
                    <p className="step-card-desc">{step.review ? t.reviewDesc : info.desc}</p>
                  </div>
                  {step.id === 'officer' && isAppEmbedded && (
                    <span className="app-badge-tag"><Icons.Badge /><span>Mobile App</span></span>
                  )}
                  {step.docs && (
                    <span className={`docs-count-pill ${reqDone === reqDocs.length ? 'ready' : 'pending'}`}>{reqDone}/{reqDocs.length} {t.required}</span>
                  )}
                </div>

                {step.sections && renderSections(step)}

                {step.docs && (
                  <div className="docs-grid">
                    {DOCUMENTS.map((d) => (
                      <DocCard key={d.key} doc={d} files={files[d.key] || []} error={shown(d.key).error}
                        note={fileNotes[d.key]} busy={busyDoc === d.key} disabled={sending || !filesReady} lang={lang}
                        onAdd={(fl) => addFiles(d, fl)} onRemove={(i) => removeFile(d.key, i)}
                        onPreview={(f, i) => setActiveLightbox({ ...f, docKey: d.key, idx: i })} />
                    ))}
                  </div>
                )}

                {step.review && renderReview()}
              </section>
            );
          })}

          {viewMode === 'all' && <section className="step-card">{checklistCard}</section>}

          {showAll && problems.length > 0 && (
            <div className="validation-summary-card" role="alert">
              <div className="validation-summary-title">
                <Icons.Alert />
                <span>{problems.length === 1 ? '1 item needs attention' : `${problems.length} items need attention`}</span>
              </div>
              <ul className="validation-summary-list">
                {problems.map((x) => (
                  <li key={x.key}>
                    <button type="button" className="validation-item-btn" onClick={() => goToField(x.key)}>
                      <span className="validation-item-label">{t.fields[x.key]?.label || t.docs[x.key] || x.label}</span>
                      <span className="validation-item-msg">{checks[x.key].error}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {status.phase === 'error' && (
            <div className="alert-banner error">
              <Icons.Alert />
              <div>
                <b>Submission incomplete:</b> {friendlyError(status.message)}
                <br />Your details and photos are saved on this phone. Files already uploaded will not be sent twice — tap Submit to continue.
              </div>
            </div>
          )}

          <div className="sticky-bottom-bar">
            <div className="bottom-bar-inner">
              {showAll && problems.length > 0 && (
                <div className="fix-alert-row" onClick={() => goToField(problems[0].key)}>
                  <Icons.Alert /><span>{problems.length} item(s) to fix. Tap to go there.</span>
                </div>
              )}
              <div className="nav-buttons-row">
                {viewMode === 'wizard' && currentStep > 0 && (
                  <button type="button" className="btn-nav-prev" onClick={handlePrevStep} disabled={sending}>← {t.back}</button>
                )}
                {viewMode === 'wizard' && currentStep < LAST_STEP ? (
                  <button key="next-btn" type="button" className="btn-primary-action" onClick={handleNextStep} disabled={sending || !!busyDoc}>
                    <span>{t.continue}</span><span>→</span>
                  </button>
                ) : (
                  <button key="submit-btn" type="submit" className="btn-primary-action" disabled={sending || !!busyDoc || !filesReady}>
                    <Icons.Check />
                    <span>{status.phase === 'error' ? (lang === 'hi' ? 'फिर से सबमिट करें' : 'Retry Submit') : `${t.submit} (${totalFiles} ${t.files})`}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </main>

      {sending && (
        <div className="upload-modal-overlay">
          <div className="upload-modal-card">
            <div className="spinner-ring" />
            <h3 className="upload-modal-title">Submitting DBR</h3>
            <div className="upload-modal-step">{progress.label}</div>
            <div className="upload-bar-wrap"><div className="upload-bar-progress" style={{ width: `${progressPercent}%` }} /></div>
            <p className="upload-notice">Uploading to Gyandhara Google Drive. Keep this screen open. If the network drops, tap Submit again — it continues where it stopped.</p>
          </div>
        </div>
      )}

      {activeLightbox && (
        <div className="lightbox-overlay" onClick={() => setActiveLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img className="lightbox-img" src={activeLightbox.preview} alt={activeLightbox.name} />
            <div className="lightbox-bar">
              <span style={{ color: '#fff', fontSize: '13px' }}>{activeLightbox.name} ({formatSize(activeLightbox.size)})</span>
              <button type="button" className="btn-secondary-action" style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 14px' }}
                onClick={() => removeFile(activeLightbox.docKey, activeLightbox.idx)}>Delete</button>
              <button type="button" className="btn-secondary-action" style={{ padding: '8px 16px' }} onClick={() => setActiveLightbox(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

// Shell Component with Branding Header, Language & Sunlight Toggles
function Shell({
  children, onReset, lastSaved, lang, onToggleLang,
  sunlightMode, onToggleSunlight, isOnline
}) {
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-group">
            <div className="brand-icon">G</div>
            <div className="brand-text">
              <div className="brand-title">{COMPANY} {APP_TITLE}</div>
              <div className="brand-subtitle">
                <span>Distributor Portal</span>
                <span className="brand-badge">Official</span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            {/* Sunlight / Outdoor High-contrast Toggle */}
            <button
              type="button"
              className={`icon-toggle-btn ${sunlightMode ? 'active' : ''}`}
              onClick={onToggleSunlight}
              title="Toggle Outdoor High-Contrast Sunlight Mode"
              aria-label="Toggle Outdoor Sunlight Mode"
            >
              <Icons.Sun />
            </button>

            {/* Language Toggle (English / हिंदी) */}
            <button
              type="button"
              className="lang-pill-btn"
              onClick={onToggleLang}
              title="Switch Language"
            >
              <Icons.Globe />
              <span>{lang === 'en' ? 'हिंदी' : 'ENG'}</span>
            </button>

            {/* Online / Offline status */}
            <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
              <span className="status-dot" />
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Reset Form Button */}
            {onReset && (
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={onReset}
                title="Start New Form"
                aria-label="Start New Form"
              >
                <Icons.Trash />
              </button>
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}


// Mobile form field
function Field({ f, value, check, onChange, onBlur, disabled, lang, info }) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const fieldInfo = t.fields[f.key] || {};
  const labelText = fieldInfo.label || f.label;
  const placeholderText = fieldInfo.placeholder || f.placeholder || '';
  const msg = check.error || check.warn;
  const msgId = `${f.key}-msg`;
  const isFilled = Boolean(value && String(value).trim());
  const isValid = isFilled && !check.error;
  const icon = fieldIcon(f);
  const mono = ['pan', 'gst', 'ifsc', 'aadhaar', 'account'].includes(f.check) || f.upper;
  const numeric = ['mobile', 'pincode', 'aadhaar', 'account'].includes(f.check);

  const commonProps = {
    id: f.key,
    name: f.key,
    value,
    disabled,
    onChange: (e) => onChange(e.target.value),
    onBlur,
    className: `input-control ${icon ? '' : 'no-icon'} ${check.error ? 'is-invalid' : check.warn ? 'is-warned' : isValid ? 'is-valid' : ''} ${mono ? 'mono' : ''}`,
    'aria-invalid': check.error ? true : undefined,
    'aria-describedby': msg || f.help || info ? msgId : undefined,
  };

  return (
    <div className={`field-group ${f.type === 'textarea' || f.wide ? 'full-width' : ''}`} data-key={f.key}>
      <div className="field-label-row">
        <label htmlFor={f.key} className="field-label-text">
          <span>{labelText}</span>
          {f.required && <span className="required-mark">*</span>}
        </label>
        {f.maxLength && value ? (
          <span className={`field-counter ${value.length === f.maxLength ? 'limit-reached' : ''}`}>{value.length}/{f.maxLength}</span>
        ) : null}
      </div>

      <div className="input-container">
        {icon && <span className="field-icon">{icon}</span>}
        {f.type === 'select' ? (
          <select {...commonProps} onChange={(e) => { onChange(e.target.value); onBlur(); }}>
            <option value="">{fieldInfo.selectPlaceholder || 'Select…'}</option>
            {f.options.map((o) => <option key={o} value={o}>{o.replace(/:$/, '')}</option>)}
          </select>
        ) : f.type === 'textarea' ? (
          <textarea rows={3} {...commonProps} placeholder={placeholderText} />
        ) : (
          <input
            type={f.type === 'email' ? 'email' : 'text'}
            inputMode={numeric ? 'numeric' : f.type === 'number' ? 'decimal' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
            autoCapitalize={mono ? 'characters' : f.type === 'email' ? 'none' : 'words'}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            maxLength={f.maxLength}
            placeholder={placeholderText}
            onPaste={f.matches ? (e) => e.preventDefault() : undefined}
            {...commonProps}
          />
        )}
        {isFilled && !disabled && f.type !== 'select' && (
          <button type="button" className="input-clear-btn" onClick={() => { triggerHaptic('light'); onChange(''); }} title="Clear field" tabIndex={-1}>
            <Icons.X />
          </button>
        )}
        {isValid && <span className="valid-badge"><Icons.Check /></span>}
      </div>

      {check.error ? (
        <div className="field-feedback error" id={msgId}><Icons.Alert /><span>{check.error}</span></div>
      ) : check.warn ? (
        <div className="field-feedback warn" id={msgId}><Icons.Alert /><span>{check.warn}</span></div>
      ) : info ? (
        <div className="field-feedback help" id={msgId}><span>{info}</span></div>
      ) : f.help ? (
        <div className="field-feedback help" id={msgId}><span>{f.help}</span></div>
      ) : null}
    </div>
  );
}

function fieldIcon(f) {
  const k = f.key.toLowerCase();
  if (f.check === 'pincode' || f.check === 'number') return <Icons.Hash />;
  if (['pan', 'gst', 'ifsc', 'aadhaar', 'account'].includes(f.check) || k === 'dbid') return <Icons.FileText />;
  if (f.check === 'mobile') return <Icons.Phone />;
  if (f.check === 'email') return <Icons.Mail />;
  if (k.includes('firm') || k.includes('bank') || k === 'existingdb') return <Icons.Building />;
  if (['address', 'district', 'tehsil', 'zone', 'ratezone', 'tehsilstatus'].includes(k)) return <Icons.MapPin />;
  if (k.includes('name') || ['rsm', 'asm', 'se', 'contactperson', 'accholder'].includes(k)) return <Icons.User />;
  return null;
}

// Document & photo upload card
function DocCard({ doc, files, error, note, busy, disabled, lang, onAdd, onRemove, onPreview }) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const docLabel = t.docs[doc.key] || doc.label;
  const accept = doc.accept === 'image' ? 'image/*' : 'image/*,application/pdf';
  const hasFiles = files.length > 0;
  return (
    <div className={`doc-upload-card ${hasFiles ? 'has-files' : ''} ${error ? 'has-error' : ''}`} data-key={doc.key}>
      <div className="doc-card-head">
        <div className="doc-info">
          <div className="doc-name">
            <span>{docLabel}</span>
            <span className={`doc-badge-pill ${doc.required ? 'required' : 'optional'}`}>{doc.required ? t.required : t.optional}</span>
          </div>
          <div className="doc-meta-row">
            <span>{doc.accept === 'image' ? (lang === 'hi' ? 'केवल फोटो' : 'Photo only') : (lang === 'hi' ? 'फोटो या पीडीएफ' : 'Photo or PDF')}</span>
            {hasFiles && <span>· {files.length} attached{files.length > 1 ? ` · ${t.joinedPdf}` : ''}</span>}
          </div>
          {doc.hint && <div className="doc-hint">{doc.hint}</div>}
        </div>
        {hasFiles && <span className="doc-check-icon">✓</span>}
      </div>

      {hasFiles && (
        <ul className="thumbs-list">
          {files.map((f, i) => (
            <li key={f.id || i} className="thumb-item">
              <div className="thumb-preview-box" onClick={() => f.preview && onPreview(f, i)} title={f.preview ? 'Tap to view' : f.name}>
                {f.preview ? <img className="thumb-img" src={f.preview} alt="" /> : <div className="thumb-pdf"><span>PDF</span></div>}
              </div>
              <span className="thumb-size-tag">{formatSize(f.size)}</span>
              {!disabled && (
                <button type="button" className="thumb-del-btn" onClick={() => onRemove(i)} aria-label="Remove file" title="Remove file">×</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="doc-buttons-row">
        {doc.capture && (
          <label className={`btn-upload-action camera ${disabled || busy ? 'busy' : ''}`}>
            <Icons.Camera />
            <span>{hasFiles ? (lang === 'hi' ? '+ फोटो' : '+ Photo') : t.takePhoto}</span>
            <input hidden type="file" accept="image/*" capture="environment" disabled={disabled || busy}
              onChange={(e) => { onAdd(e.target.files); e.target.value = ''; }} />
          </label>
        )}
        <label className={`btn-upload-action ${disabled || busy ? 'busy' : ''}`}>
          <Icons.Upload />
          <span>{busy ? t.processing : doc.accept === 'image' ? (lang === 'hi' ? 'गैलरी से चुनें' : 'Choose Gallery') : t.chooseGallery}</span>
          <input hidden type="file" accept={accept} multiple disabled={disabled || busy}
            onChange={(e) => { onAdd(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {note && <div className="field-feedback warn" style={{ marginTop: '8px' }}><Icons.Alert /><span>{note}</span></div>}
      {error && <div className="field-feedback error" style={{ marginTop: '8px' }}><Icons.Alert /><span>{error}</span></div>}
    </div>
  );
}

// "New Distributor Appointment Check List" — optional for the SE
function ChecklistCard({ t, check, effective, onChange, disabled }) {
  return (
    <details className="review-group checklist-block">
      <summary className="review-group-head checklist-summary">
        <span className="review-group-title">{t.checklistTitle}</span>
        <span className="checklist-hint">{t.checklistDesc}</span>
      </summary>
      <div className="checklist-rows">
        {CHECKLIST.map((c) => {
          const v = effective[c.row];
          const m = check[c.row] || {};
          return (
            <div className={`checklist-row ${v.auto ? 'auto' : ''}`} key={c.row}>
              <div className="checklist-label"><b>{c.no}.</b> {c.label} <span className="checklist-owner">· {c.owner}</span></div>
              {v.auto ? (
                <div className="checklist-auto"><Icons.Check /> {t.autoYes}</div>
              ) : (
                <div className="checklist-inputs">
                  <div className="seg-toggle" role="group">
                    {['Yes', 'No'].map((o) => (
                      <button type="button" key={o} disabled={disabled} className={m.status === o ? 'on' : ''}
                        onClick={() => onChange(c.row, { status: m.status === o ? '' : o })}>{o}</button>
                    ))}
                  </div>
                  <input type="date" className="input-control no-icon" aria-label="By when" disabled={disabled}
                    value={m.date || ''} onChange={(e) => onChange(c.row, { date: e.target.value })} />
                  <input type="text" className="input-control no-icon" placeholder={t.remarks} disabled={disabled}
                    value={m.remarks || ''} onChange={(e) => onChange(c.row, { remarks: e.target.value })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

// Plain-language reasons for common failures
function friendlyError(msg = '') {
  if (/failed to fetch|network|load failed|no internet/i.test(msg)) return 'The network connection dropped. Check mobile data / Wi-Fi.';
  if (/too long/i.test(msg)) return 'The network is very slow right now. Move to better signal and try again.';
  if (/unauthorized/i.test(msg)) return 'App security key mismatch (VITE_APP_KEY does not match APP_KEY in Code.gs).';
  if (/json|unexpected/i.test(msg)) return 'Google Drive replied in an unexpected format. Try again in a minute.';
  return msg;
}
