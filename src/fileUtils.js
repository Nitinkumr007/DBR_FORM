import { IMAGE_MAX_SIDE, IMAGE_QUALITY, MAX_PICK_MB } from './config.js';

// Turns a picked file into { id, name, type, size, bytes, preview }.
// Photos are resized and re-encoded as JPEG: small uploads on field networks,
// and pdf-lib can always embed them. PDFs are kept as they are.
export async function prepareFile(file) {
  if (file.size > MAX_PICK_MB * 1048576) {
    throw new Error(`${file.name} is ${formatSize(file.size)}. Files above ${MAX_PICK_MB} MB can't be used — scan at a lower quality.`);
  }
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error(`${file.name} is not a valid PDF file.`);
    return withId({ name: file.name, type: 'application/pdf', size: file.size, bytes, preview: null });
  }
  const looksImage = file.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
  if (!looksImage) throw new Error(`${file.name}: only photos or PDF files can be attached.`);

  let blob = null;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs -> white, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();
    blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', IMAGE_QUALITY));
    canvas.width = canvas.height = 0; // free memory on low-RAM phones
  } catch {
    blob = null;
  }
  if (!blob) {
    if (file.type === 'image/jpeg' || file.type === 'image/png') blob = file; // could not resize, keep original
    else throw new Error(`${file.name}: this photo format can't be read on this phone. Use the Take Photo button instead.`);
  }
  const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
  return withId({ name, type, size: blob.size, bytes: new Uint8Array(await blob.arrayBuffer()), preview: null });
}

const withId = (f) => attachPreview({ ...f, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` });

// Object URLs are not stored; recreate them after restoring from the phone's storage
export function attachPreview(f) {
  if (f.type.startsWith('image/') && !f.preview) f.preview = URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
  return f;
}

function loadImage(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export const formatSize = (b) =>
  b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

export const extFor = (type) => (type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg');
