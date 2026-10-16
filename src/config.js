// =====================================================================
//  DBR ONBOARDING — single place to change fields, documents, steps and checklist.
//  Field keys are also used by apps-script/Code.gs (checklist cells, register
//  columns, Word file) — if you rename a key, rename it there too.
// =====================================================================

export const APP_TITLE = 'DBR Onboarding';
export const COMPANY = 'Gyandhara';
export const APP_VERSION = '0.3.0';

// Dropdown values = Sheet1 of the "DB Opening Checklist" template (cell B38)
export const TEHSIL_STATUS = [
  'New Tehsil',
  'Vacant Tehsil, DB Replaced By:',
  'DB Replaced BY:',
  'Another DB Also Present In Same Tehsil:',
];

// ---------------------------------------------------------------------
// Fields
//   type   : text | tel | email | number | select | textarea
//   check  : mobile | pincode | aadhaar | pan | gst | ifsc | account | email | number
//            (rules + messages live in validators.js)
//   min    : minimum length · maxLength: typing limit · upper: CAPS
//   persist: remembered on this phone for the next DBR (officer + hierarchy)
//   showIf : (values) => boolean — field only shown/required when true
//   matches: must equal another field (account no. re-entry)
//   local  : used in the app only, never sent to Drive
//   wide   : full-width on tablets
// ---------------------------------------------------------------------
export const FORM_SECTIONS = [
  {
    id: 'officer',
    title: 'Registered by',
    fields: [
      { key: 'regName', label: 'Your name', type: 'text', required: true, min: 3, persist: true },
      { key: 'regMobile', label: 'Your mobile', type: 'tel', required: true, check: 'mobile', maxLength: 10, persist: true },
    ],
  },
  {
    id: 'hierarchy',
    title: 'Sales hierarchy',
    fields: [
      { key: 'zone', label: 'Zone', type: 'text', required: true, min: 2, persist: true, placeholder: 'e.g. UP East I' },
      { key: 'rateZone', label: 'Rate zone', type: 'text', persist: true },
      { key: 'rsm', label: 'RSM', type: 'text', required: true, min: 3, persist: true },
      { key: 'asm', label: 'ASM', type: 'text', required: true, min: 3, persist: true },
      { key: 'se', label: 'SE', type: 'text', required: true, min: 3, persist: true },
      { key: 'dbId', label: 'DB ID', type: 'text', upper: true, help: 'Only if the DB code is already created' },
    ],
  },
  {
    id: 'firm',
    title: 'Firm details',
    fields: [
      { key: 'firmName', label: 'Firm name', type: 'text', required: true, min: 3, wide: true, placeholder: 'e.g. Sanjay Pashu Aahar Kendra' },
      { key: 'address', label: 'Address', type: 'textarea', required: true, min: 10, help: 'Shop / mandi, street, village or town' },
      { key: 'district', label: 'District', type: 'text', required: true, min: 3 },
      { key: 'tehsil', label: 'Tehsil', type: 'text', required: true, min: 2 },
      { key: 'pincode', label: 'Pincode', type: 'tel', required: true, check: 'pincode', maxLength: 6 },
      { key: 'contactPerson', label: 'Contact person', type: 'text', required: true, min: 3 },
      { key: 'mobile1', label: 'Contact number', type: 'tel', required: true, check: 'mobile', maxLength: 10 },
      { key: 'mobile2', label: 'Alternate number', type: 'tel', check: 'mobile', maxLength: 10 },
      { key: 'email', label: 'Email', type: 'email', check: 'email', placeholder: 'name@gmail.com' },
    ],
  },
  {
    id: 'kyc',
    title: 'KYC',
    fields: [
      { key: 'aadhaar', label: 'Aadhaar no.', type: 'tel', required: true, check: 'aadhaar', maxLength: 12, help: '12 digits, no spaces' },
      { key: 'pan', label: 'PAN no.', type: 'text', required: true, check: 'pan', maxLength: 10, placeholder: 'ABCPE1234F' },
      { key: 'gst', label: 'GST no.', type: 'text', check: 'gst', maxLength: 15, placeholder: '09ABCPE1234F1Z5', help: 'Optional. PAN is filled from it automatically.' },
    ],
  },
  {
    id: 'bank',
    title: 'Bank details',
    fields: [
      { key: 'accHolder', label: 'Account holder name', type: 'text', required: true, min: 3, wide: true },
      { key: 'ifsc', label: 'IFSC', type: 'text', required: true, check: 'ifsc', maxLength: 11, placeholder: 'BARB0VVJPRE', help: '11 characters. Bank name fills automatically.' },
      { key: 'bankName', label: 'Bank name', type: 'text', required: true, min: 3 },
      { key: 'accountNo', label: 'Account no.', type: 'tel', required: true, check: 'account', maxLength: 18 },
      { key: 'accountNo2', label: 'Re-enter account no.', type: 'tel', required: true, check: 'account', maxLength: 18, matches: 'accountNo', local: true },
    ],
  },
  {
    id: 'tehsil',
    title: 'Tehsil & first order',
    fields: [
      { key: 'tehsilStatus', label: 'Tehsil status', type: 'select', required: true, options: TEHSIL_STATUS, wide: true },
      {
        key: 'existingDb', label: 'Existing / replaced DB (name & ID)', type: 'text', required: true, min: 3, wide: true,
        placeholder: 'e.g. Pashu Aahar Kendra (10416)', showIf: (v) => Boolean(v.tehsilStatus) && v.tehsilStatus !== 'New Tehsil',
      },
      { key: 'firstDemandMt', label: 'First demand (MT)', type: 'number', required: true, check: 'number' },
      { key: 'distanceKm', label: 'Distance from plant (Kms)', type: 'number', check: 'number' },
      { key: 'remark', label: 'Remark', type: 'textarea' },
    ],
  },
];

// Wizard steps. `sections` -> FORM_SECTIONS ids; `docs` -> documents step; `review` -> final step
export const STEPS = [
  { id: 'officer', icon: 'User', sections: ['officer', 'hierarchy'] },
  { id: 'firm', icon: 'Building', sections: ['firm'] },
  { id: 'kyc', icon: 'FileText', sections: ['kyc', 'bank'] },
  { id: 'tehsil', icon: 'MapPin', sections: ['tehsil'] },
  { id: 'docs', icon: 'Camera', docs: true },
  { id: 'review', icon: 'Check', review: true },
];

// ---------------------------------------------------------------------
// Documents — each slot becomes ONE file in Drive:
//   1 photo -> .jpg · 1 PDF -> .pdf · several photos/PDFs -> joined into one .pdf
//   kyc: true -> also included (captioned) in "09 KYC Documents (Merged).pdf"
// ---------------------------------------------------------------------
export const DOCUMENTS = [
  {
    key: 'formAgreement', file: '01 DBR Form & Agreement', label: 'DBR Form & Agreement (signed)', required: true,
    accept: 'any', capture: true, multi: true,
    hint: 'Upload the scanned PDF, or photograph every page. Photos are joined into one PDF.',
  },
  { key: 'aadhaarFront', file: '02 Aadhaar Front', label: 'Aadhaar — Front', required: true, accept: 'any', capture: true, kyc: true },
  { key: 'aadhaarBack', file: '03 Aadhaar Back', label: 'Aadhaar — Back', required: true, accept: 'any', capture: true, kyc: true },
  { key: 'panFront', file: '04 PAN Front', label: 'PAN — Front', required: true, accept: 'any', capture: true, kyc: true },
  { key: 'panBack', file: '05 PAN Back', label: 'PAN — Back', required: true, accept: 'any', capture: true, kyc: true },
  { key: 'cheque', file: '06 Cancelled Cheque', label: 'Cancelled cheque', required: true, accept: 'any', capture: true, kyc: true },
  { key: 'dbrPhoto', file: '07 DBR Photo', label: 'DBR photo', required: true, accept: 'image', capture: true, kyc: true },
  { key: 'retailerList', file: '08 Retailer List', label: 'Retailer list', accept: 'any', capture: true, multi: true, kyc: true, hint: 'Surveyed retailers (minimum 60). Photograph every page.' },
];
export const KYC_MERGED_FILE = '09 KYC Documents (Merged)';

// ---------------------------------------------------------------------
// "New Distributor Appointment Check List". row = row in the Excel template
// (D = By When, E = Yes/No, F = Remarks). auto = ticked Yes when those docs are attached.
// ---------------------------------------------------------------------
export const CHECKLIST = [
  { row: 14, no: '1', label: 'Distributor Appointments Form', owner: 'SE/ASM', auto: ['formAgreement'] },
  { row: 15, no: '2', label: 'Submission of KYC documents (PAN / Aadhaar / Bank details)', owner: 'SE/ASM', auto: ['aadhaarFront', 'aadhaarBack', 'panFront', 'cheque'] },
  { row: 16, no: '3', label: 'Dedicated geography allocation (at Tehsil level)', owner: 'SE/ASM' },
  { row: 17, no: '4', label: 'Retailer allocation (minimum 60 surveyed retail list)', owner: 'SE' },
  { row: 18, no: '5', label: 'Wall painting (15000 sq ft), 20 fix board & distributor board', owner: 'Marketing HO - Team' },
  { row: 19, no: '6', label: 'Submission of original documents with F&A Dept.', owner: 'RSM' },
  { row: 20, no: '7', label: 'HO visit to meet MD, followed by plant visit', owner: 'Sales Coordinator' },
  { row: 21, no: '8', label: 'Authorized distributor certificate (signed & framed)', owner: 'Sales Coordinator' },
  { row: 22, no: '9', label: 'Bank guarantee submission (mention amount in remarks)', owner: 'ASM / RSM' },
  { row: 23, no: '10', label: 'Bank guarantee provision in future (tentative date)', owner: 'ASM / RSM' },
  { row: 25, no: '11 (I)', label: 'Welcome kit: Welcome letter by MD', owner: 'Marketing HO - Team' },
  { row: 26, no: '11 (II)', label: 'Welcome kit: Welcome gift', owner: 'Marketing HO - Team' },
  { row: 27, no: '11 (III)', label: 'Welcome kit: Gyandhara diary & pen', owner: 'Marketing HO - Team' },
  { row: 28, no: '11 (IV)', label: 'Welcome kit: Product brochure', owner: 'Marketing HO - Team' },
];

// ---------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------
export const MAX_FILE_MB = 20;          // any single file sent to Drive (after joining/compressing)
export const MAX_PICK_MB = 40;          // a single file picked from the phone (PDF scans)
export const IMAGE_MAX_SIDE = 1800;     // px — photos are resized to this
export const IMAGE_QUALITY = 0.82;      // JPEG quality 0–1
