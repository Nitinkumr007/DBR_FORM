// Builds PDFs in the browser with pdf-lib (loaded only when first needed).
//   mergeToPdf  : several photos / PDFs of one slot -> one PDF
//   buildKycPdf : all KYC slots -> one captioned PDF for printing / F&A

const A4 = [595.28, 841.89];
const MARGIN = 28;
const CAPTION_H = 26;

let libPromise;
const lib = () => (libPromise ||= import('pdf-lib'));

// Standard PDF fonts only cover basic Latin
const ascii = (s) => String(s).replace(/[^\x20-\x7E]/g, '').trim();

async function addItem(pdf, font, rgb, item, caption) {
  if (item.type === 'application/pdf') {
    let src;
    try {
      src = await (await lib()).PDFDocument.load(item.bytes, { ignoreEncryption: true });
    } catch {
      throw new Error(`${item.name} could not be opened (damaged or password-protected PDF)`);
    }
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach((p, i) => {
      pdf.addPage(p);
      if (!caption) return;
      const { height } = p.getSize();
      const text = ascii(`${caption}${pages.length > 1 ? ` (page ${i + 1}/${pages.length})` : ''}`);
      p.drawRectangle({ x: 6, y: height - 22, width: font.widthOfTextAtSize(text, 9) + 12, height: 16, color: rgb(1, 1, 1), opacity: 0.9 });
      p.drawText(text, { x: 12, y: height - 17, size: 9, font, color: rgb(0.08, 0.5, 0.24) });
    });
    return;
  }
  const img = item.type === 'image/png' ? await pdf.embedPng(item.bytes) : await pdf.embedJpg(item.bytes);
  const landscape = img.width > img.height; // cheque / PAN print larger on a landscape page
  const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
  const page = pdf.addPage([pw, ph]);
  const top = caption ? CAPTION_H : 0;
  const boxW = pw - MARGIN * 2;
  const boxH = ph - MARGIN * 2 - top;
  const s = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * s;
  const h = img.height * s;
  page.drawImage(img, { x: (pw - w) / 2, y: MARGIN + (boxH - h) / 2, width: w, height: h });
  if (caption) page.drawText(ascii(caption), { x: MARGIN, y: ph - MARGIN - 14, size: 13, font, color: rgb(0.08, 0.5, 0.24) });
}

export async function mergeToPdf(items, title) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const pdf = await PDFDocument.create();
  pdf.setTitle(ascii(title || 'Document'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const it of items) await addItem(pdf, font, rgb, it, null);
  return new Uint8Array(await pdf.save());
}

// sections: [{ caption, items }] -> { bytes, skipped: [captions that could not be added] }
export async function buildKycPdf(sections, title) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const pdf = await PDFDocument.create();
  pdf.setTitle(ascii(title));
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const skipped = [];
  for (const s of sections) {
    for (let i = 0; i < s.items.length; i++) {
      const cap = s.items.length > 1 ? `${s.caption} (${i + 1}/${s.items.length})` : s.caption;
      try { await addItem(pdf, font, rgb, s.items[i], cap); } catch { skipped.push(s.caption); }
    }
  }
  return { bytes: new Uint8Array(await pdf.save()), skipped: [...new Set(skipped)] };
}
