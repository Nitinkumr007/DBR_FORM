// Talks to the Google Apps Script web app.
// Body is sent as text/plain so the browser does NOT send a CORS preflight
// (Apps Script can't answer OPTIONS). Apps Script still parses it as JSON.

const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL;
const APP_KEY = import.meta.env.VITE_APP_KEY || '';

export const isConfigured = () => Boolean(SCRIPT_URL && SCRIPT_URL.includes('/exec'));

class ServerError extends Error {}

async function call(action, payload, { retries = 2, timeoutMs = 60000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, key: APP_KEY, ...payload }),
        signal: ctrl.signal,
        redirect: 'follow',
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        // Google returns an HTML page when the script is not deployed for "Anyone" or quota is hit
        throw new Error(/<html/i.test(text) ? 'Google Apps Script returned a web page instead of data (check deployment access = Anyone).' : 'Unexpected reply from server.');
      }
      if (!data.ok) throw new ServerError(data.error || 'Server error');
      return data;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? new Error('The server took too long to answer (slow network).') : e;
      if (e instanceof ServerError) break; // the server said no — retrying won't help
      if (i < retries) await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// submissionId makes "create" safe to repeat: the server returns the same folder.
// -> { regId, folderId, folderUrl, folderName }
export const createEntry = (submissionId, fields) => call('create', { submissionId, fields });

// Uploading a file with the same name again replaces the earlier copy.
// -> { fileId, fileUrl }
export const uploadFile = (folderId, docLabel, file) =>
  call('upload', { folderId, docLabel, fileName: file.name, mimeType: file.type, data: file.base64 },
    { timeoutMs: 120000 });

// Fills checklist (Sheet + xlsx), writes the Word details file, adds/updates the register row.
// -> { checklistUrl, checklistXlsxUrl, detailsUrl, duplicates, note }
export const finalizeEntry = (payload) => call('finalize', payload, { retries: 1, timeoutMs: 120000 });

// IFSC -> bank name (public Razorpay IFSC directory). null if unknown or offline.
export async function lookupIfsc(ifsc) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://ifsc.razorpay.com/${ifsc}`, { signal: ctrl.signal });
    if (r.status === 404) return { notFound: true };
    if (!r.ok) return null;
    const d = await r.json();
    return { bank: d.BANK, branch: d.BRANCH, city: d.CITY };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
