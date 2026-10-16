// Field checks with clear, specific messages.
// A check returns '' when fine, a string for a blocking error,
// or { warn: '...' } for something worth double-checking that does not block submit.

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// First two digits of PIN codes per state
const STATE_PIN = {
  'Madhya Pradesh': [45, 48], Chhattisgarh: [49, 49], Maharashtra: [40, 44],
  Gujarat: [36, 39], Rajasthan: [30, 34], 'Uttar Pradesh': [20, 28],
};

// GST state codes
const STATE_GST = {
  'Madhya Pradesh': '23', Chhattisgarh: '22', Maharashtra: '27',
  Gujarat: '24', Rajasthan: '08', 'Uttar Pradesh': '09',
};

// 4th letter of a PAN = holder type
const PAN_TYPES = 'PFCHATBLJG';

const EMAIL_TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com', 'yahoo.co': 'yahoo.com', 'rediffmail.co': 'rediffmail.com' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------------- cleaning while typing ---------------- */

const CLEAN = {
  digits: (v, max) => v.replace(/\D/g, '').slice(0, max),
  // Accept pasted "+91 98765 43210" or "098765 43210"
  mobile: (v) => {
    let d = v.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
    if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
    return d.slice(0, 10);
  },
  code: (v, max) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max),
};

export function cleanInput(f, raw) {
  if (f.check === 'mobile') return CLEAN.mobile(raw);
  if (f.check === 'pincode') return CLEAN.digits(raw, 6);
  if (f.check === 'pan') return CLEAN.code(raw, 10);
  if (f.check === 'gst') return CLEAN.code(raw, 15);
  if (f.check === 'email') return raw.replace(/\s/g, '');
  if (f.check === 'aadhaar') return CLEAN.digits(raw, 12);
  if (f.check === 'ifsc') return CLEAN.code(raw, 11);
  if (f.check === 'account') return CLEAN.digits(raw, 18);
  if (f.check === 'number') return raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8);
  return f.upper ? raw.toUpperCase() : raw;
}

/* ---------------- checks ---------------- */

const CHECKS = {
  mobile(v) {
    if (v.length !== 10) return `Mobile number needs 10 digits. You entered ${plural(v.length, 'digit')}.`;
    if (!/^[6-9]/.test(v)) return `Indian mobile numbers start with 6, 7, 8 or 9. This one starts with ${v[0]}.`;
    if (/^(\d)\1{9}$/.test(v) || v === '9876543210') return 'This looks like a dummy number. Enter the owner\'s real mobile.';
    return '';
  },

  pan(v) {
    const fmt = ' Format: ABCPE1234F (5 letters, 4 numbers, 1 letter).';
    const letters = v.slice(0, 5);
    if (!/^[A-Z]*$/.test(letters)) return `PAN must start with 5 letters.${fmt}`;
    if (!/^\d*$/.test(v.slice(5, 9))) return `Characters 6 to 9 of PAN must be numbers.${fmt}`;
    if (v.length === 10 && !/[A-Z]/.test(v[9])) return `The last character of PAN must be a letter.${fmt}`;
    if (v.length !== 10) return `PAN has 10 characters. You entered ${v.length}.${fmt}`;
    if (!PAN_TYPES.includes(v[3])) return `The 4th letter of a PAN shows the holder type (P = person, F = firm, C = company). "${v[3]}" is not valid.`;
    return '';
  },

  gst(v, all) {
    if (v.length !== 15) return `GSTIN has 15 characters. You entered ${v.length}.`;
    if (!/^\d{2}/.test(v)) return 'GSTIN must start with the 2-digit state code (23 for Madhya Pradesh).';
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]/.test(v)) return 'Characters 3 to 12 of GSTIN must be a PAN (ABCPE1234F).';
    if (v[13] !== 'Z') return 'The 14th character of a GSTIN is always Z.';
    if (!gstChecksumOk(v)) return 'This GSTIN fails the check-digit test, so a character is probably mistyped. Compare it with the GST certificate.';
    if (/^[A-Z]{5}\d{4}[A-Z]$/.test(all.pan || '') && v.slice(2, 12) !== all.pan)
      return { warn: `The PAN inside this GSTIN (${v.slice(2, 12)}) is different from the PAN entered (${all.pan}). Check both.` };
    const code = STATE_GST[all.state];
    if (code && v.slice(0, 2) !== code)
      return { warn: `GSTIN state code is ${v.slice(0, 2)}, but ${all.state} is ${code}. Check the state or GSTIN.` };
    return '';
  },

  pincode(v, all) {
    if (v.length !== 6) return `PIN code needs 6 digits. You entered ${plural(v.length, 'digit')}.`;
    if (v[0] === '0') return 'PIN codes do not start with 0.';
    const r = STATE_PIN[all.state];
    const p = Number(v.slice(0, 2));
    if (r && (p < r[0] || p > r[1]))
      return { warn: `PIN ${v} is not a ${all.state} PIN (those start with ${r[0] === r[1] ? r[0] : `${r[0]} to ${r[1]}`}). Check the PIN or state.` };
    return '';
  },

  aadhaar(v) {
    if (v.length !== 12) return `Aadhaar has 12 digits. You entered ${plural(v.length, 'digit')}.`;
    if (/^[01]/.test(v)) return 'Aadhaar numbers never start with 0 or 1. Check the number on the card.';
    if (!verhoeffOk(v)) return 'This Aadhaar number fails the check-digit test, so a digit is probably mistyped. Compare it with the card.';
    return '';
  },

  ifsc(v) {
    if (v.length !== 11) return `IFSC has 11 characters. You entered ${v.length}. Copy it from the cheque.`;
    if (!/^[A-Z]{4}/.test(v)) return 'IFSC starts with 4 letters (the bank code), like BARB or SBIN.';
    if (v[4] !== '0') return 'The 5th character of an IFSC is always 0 (zero).';
    return '';
  },

  account(v, all, f) {
    if (v.length < 9) return `Bank account numbers have 9 to 18 digits. You entered ${plural(v.length, 'digit')}.`;
    if (/^0+$/.test(v)) return 'Enter the real account number from the cheque.';
    return '';
  },

  number(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 'Enter a number greater than 0.';
    if (n > 100000) return 'This number looks too large. Check it again.';
    return '';
  },

  email(v) {
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return 'Enter a full email address, like name@gmail.com.';
    const domain = v.split('@')[1].toLowerCase();
    if (EMAIL_TYPOS[domain]) return { warn: `Did you mean @${EMAIL_TYPOS[domain]}?` };
    return '';
  },
};

// Verhoeff checksum used by UIDAI for the last Aadhaar digit
const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
function verhoeffOk(num) {
  let c = 0;
  const d = num.split('').reverse().map(Number);
  for (let i = 0; i < d.length; i++) c = VD[c][VP[i % 8][d[i]]];
  return c === 0;
}

function gstChecksumOk(g) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const n = ALNUM.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(n / 36) + (n % 36);
  }
  return ALNUM[(36 - (sum % 36)) % 36] === g[14];
}

/* ---------------- public ---------------- */

// -> { error } | { warn } | {}
export function checkField(f, value, all) {
  const v = String(value || '').trim();
  if (!v) return f.required ? { error: `${f.label} is required.` } : {};
  if (f.min && v.length < f.min) return { error: `${f.label} looks too short. Enter at least ${f.min} characters.` };
  const fn = CHECKS[f.check];
  let r = fn ? fn(v, all, f) : '';
  if (!r && f.matches && v !== String(all[f.matches] || '').trim()) r = 'The two account numbers do not match. Enter them again carefully.';
  if (!r && f.key === 'mobile2' && v === all.mobile1) r = { warn: 'Alternate number is the same as the contact number.' };
  if (!r) return {};
  return typeof r === 'string' ? { error: r } : r;
}

export function checkDoc(d, files) {
  if (!d.required || files?.length) return {};
  return { error: d.accept === 'image' ? `Add the ${d.label.toLowerCase()}: tap Camera or Gallery.` : `Add the ${d.label.toLowerCase()} (photo or PDF).` };
}
