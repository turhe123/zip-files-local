// app.js — Create ZIP File Online. Collects files (and folders, with their relative paths), then builds
// one ZIP in worker.js with fflate. Everything stays on the device; nothing is fetched except by __demo.
import { toast, downloadBlob, formatBytes, wireDropzone } from './site.js';

const $ = (id) => document.getElementById(id);
const zone = $('dropzone');
const fileInput = $('file-input');
const folderInput = $('folder-input');
const nameInput = $('archive-name');
const levelSelect = $('level');
const skipHidden = $('skip-hidden');
const list = $('file-list');
const emptyState = $('empty-state');
const countEl = $('file-count');
const totalEl = $('total-size');
const clearBtn = $('clear-all');
const notices = $('notices');
const createBtn = $('create');
const progress = $('progress');
const progressBar = progress.querySelector('span');
const barNote = $('bar-note');
const results = $('results');

const LEVELS = { store: 0, fast: 1, best: 9 };
const SAFE_LIMIT = 2 * 1024 ** 3; // the whole archive lives in memory; beyond this browsers fail unpredictably
const MOBILE_WARN = 500 * 1024 ** 2;
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const DEFAULT_NOTE = barNote.textContent;
// Already-compressed formats: deflating them again costs time and saves almost nothing, so they are stored.
const STORED_EXT = new Set(('jpg jpeg png gif webp avif heic heif jxl mp4 m4v mov mkv webm avi wmv mp3 m4a aac ogg oga opus flac ' +
  'zip gz tgz bz2 xz 7z rar zst lz4 cab pdf docx xlsx pptx odt ods odp epub jar apk ipa woff woff2').split(' '));
const HIDDEN_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', 'ehthumbs.db', '.localized']);

let items = []; // { id, file, path }
let nextId = 1;
let busy = false;
let resultUrl = null;

// ---------- paths ----------
function normalisePath(p) {
  const parts = String(p).replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..');
  return parts.join('/') || 'file';
}

function isHiddenSystem(path) {
  const parts = path.split('/');
  if (parts.some((s) => s === '__MACOSX')) return true;
  return parts.some((s) => s.startsWith('.') || HIDDEN_NAMES.has(s.toLowerCase()));
}

function uniquePath(path, taken) {
  if (!taken.has(path.toLowerCase())) return path;
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const base = path.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${dir}${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

const extOf = (path) => { const m = /\.([^./]+)$/.exec(path); return m ? m[1].toLowerCase() : ''; };

// ---------- adding files ----------
function addEntries(entries, failed = [], { quiet = false } = {}) {
  clearNotices();
  clearResult();
  const taken = new Set(items.map((it) => it.path.toLowerCase()));
  const hidden = [];
  let added = 0;
  for (const { file, path } of entries) {
    const clean = normalisePath(path || file.name);
    if (skipHidden.checked && isHiddenSystem(clean)) { hidden.push(clean); continue; }
    const unique = uniquePath(clean, taken);
    taken.add(unique.toLowerCase());
    items.push({ id: nextId++, file, path: unique });
    added++;
  }
  if (hidden.length) notice(`Skipped ${hidden.length} hidden system file${hidden.length === 1 ? '' : 's'}: ${listNames(hidden)}. Untick “Skip hidden system files” to include them.`);
  if (failed.length) showError(`Could not read ${failed.length} file${failed.length === 1 ? '' : 's'}, so ${failed.length === 1 ? 'it was' : 'they were'} skipped: ${listNames(failed)}.`, 'read');
  render();
  if (added && !quiet) toast(`${added} file${added === 1 ? '' : 's'} added. Nothing was uploaded.`);
}

const listNames = (names) => (names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', '));

function readEntryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readAllEntries(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry, prefix, out, failed) {
  const path = prefix + entry.name;
  if (entry.isFile) {
    try { out.push({ file: await readEntryFile(entry), path }); } catch { failed.push(path); }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    try {
      // readEntries returns results in batches (about 100 at a time in Chromium) until it returns none.
      for (let batch = await readAllEntries(reader); batch.length; batch = await readAllEntries(reader)) {
        for (const child of batch) await walkEntry(child, `${path}/`, out, failed);
      }
    } catch { failed.push(`${path}/`); }
  }
}

// Folder drops: grab the directory entries synchronously during the drop event, walk them afterwards.
// wireDropzone below also sees the drop and passes plain files; we ignore that copy when we took over.
let dropTakenOver = false;
zone.addEventListener('drop', (e) => {
  const dtItems = [...(e.dataTransfer?.items || [])].filter((it) => it.kind === 'file');
  const entries = dtItems.map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null));
  if (!entries.length || entries.some((en) => !en)) return; // no entry API (or synthetic drop): use plain files
  dropTakenOver = true;
  setTimeout(() => { dropTakenOver = false; }, 0);
  (async () => {
    const out = [];
    const failed = [];
    for (const entry of entries) await walkEntry(entry, '', out, failed);
    addEntries(out, failed);
  })();
});

wireDropzone(zone, fileInput, (files) => {
  if (dropTakenOver) return;
  // A folder dropped where the entry API is missing shows up as a 0-byte "file" without a type; it cannot be read.
  addEntries(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
});

folderInput.addEventListener('change', () => {
  const files = [...folderInput.files];
  folderInput.value = '';
  if (files.length) addEntries(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
});

$('pick-files').addEventListener('click', () => fileInput.click());
$('pick-folder').addEventListener('click', () => folderInput.click());
// The dropzone opens the file picker on Enter/Space; keep those keys for the buttons inside it.
$('pick-actions').addEventListener('keydown', (e) => e.stopPropagation());

// ---------- list ----------
function render() {
  list.replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.className = 'zip-item';
    li.dataset.id = it.id;
    const slash = it.path.lastIndexOf('/');
    const name = it.path.slice(slash + 1);
    const folder = slash >= 0 ? it.path.slice(0, slash + 1) : '';
    li.innerHTML = `<div class="zip-item__meta"><span class="zip-item__name"></span><span class="zip-item__path"></span></div>
      <span class="zip-item__size stat"></span>
      <button type="button" class="btn btn--small btn--ghost zip-item__remove">Remove</button>`;
    li.querySelector('.zip-item__name').textContent = name;
    li.querySelector('.zip-item__name').title = it.path;
    li.querySelector('.zip-item__path').textContent = folder ? folder : 'top level';
    li.querySelector('.zip-item__size').textContent = formatBytes(it.file.size);
    li.querySelector('.zip-item__remove').setAttribute('aria-label', `Remove ${it.path}`);
    return li;
  }));
  const total = totalSize();
  countEl.textContent = `(${items.length})`;
  totalEl.textContent = `${formatBytes(total)} total`;
  emptyState.hidden = items.length > 0;
  clearBtn.disabled = items.length === 0 || busy;
  createBtn.disabled = items.length === 0 || busy || total > SAFE_LIMIT;

  results.querySelectorAll('.alert--limit').forEach((el) => el.remove());
  notices.querySelectorAll('.alert--memory').forEach((el) => el.remove());
  if (total > SAFE_LIMIT) {
    showError(`These files add up to ${formatBytes(total)}, above the ${formatBytes(SAFE_LIMIT)} safe limit. The archive is built in memory, so remove some files or make two archives.`, 'limit');
  } else if (IS_MOBILE && total > MOBILE_WARN) {
    notice(`${formatBytes(total)} is a lot for a phone or tablet: the whole archive is kept in memory and the browser may close the tab. Store is the lightest option.`, 'memory');
  }
}

const totalSize = () => items.reduce((sum, it) => sum + it.file.size, 0);

list.addEventListener('click', (e) => {
  const btn = e.target.closest('.zip-item__remove');
  if (!btn || busy) return;
  const li = btn.closest('.zip-item');
  const index = items.findIndex((it) => String(it.id) === li.dataset.id);
  if (index < 0) return;
  const [removed] = items.splice(index, 1);
  clearResult();
  render();
  // Keep keyboard users in the list: focus the next remove button, or the previous one, or the picker.
  const buttons = list.querySelectorAll('.zip-item__remove');
  (buttons[Math.min(index, buttons.length - 1)] || $('pick-files')).focus();
  toast(`Removed ${removed.path}`);
});

clearBtn.addEventListener('click', () => {
  items = [];
  clearNotices();
  clearResult();
  results.replaceChildren();
  render();
  $('pick-files').focus();
});

// ---------- messages ----------
function showError(message, kind = 'general') {
  const el = document.createElement('div');
  el.className = `alert alert--error alert--${kind}`;
  el.setAttribute('role', 'alert');
  el.textContent = message;
  results.prepend(el);
  return el;
}

function notice(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `alert zip-notice alert--${kind}`;
  el.textContent = message;
  notices.appendChild(el);
}

function clearNotices() {
  notices.replaceChildren();
  results.querySelectorAll('.alert--read, .alert--general').forEach((el) => el.remove());
}

function clearResult() {
  results.querySelectorAll('.zip-result').forEach((el) => el.remove());
  if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
}

// ---------- building ----------
function archiveName() {
  const raw = nameInput.value.trim().replace(/\.zip$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^\.+/, '').trim();
  return `${raw || 'archive'}.zip`;
}

function setProgress(fraction, label) {
  const pct = Math.max(0, Math.min(100, Math.floor(fraction * 100)));
  progressBar.style.width = `${pct}%`;
  progress.setAttribute('aria-valuenow', String(pct));
  barNote.textContent = label;
}

// Honest percentages: truncate, never round up (99.96% saved shows as 99.9%, not 100%).
const trunc1 = (x) => (Math.floor(x * 10) / 10).toFixed(1);

function savedText(before, after) {
  if (!before) return 'n/a (empty files)';
  const ratio = 1 - after / before;
  return ratio >= 0 ? `${trunc1(ratio * 100)}% smaller` : `${trunc1(-ratio * 100)}% larger`;
}

function createZip({ autoDownload = true } = {}) {
  if (busy || !items.length) return Promise.resolve(null);
  const total = totalSize();
  if (total > SAFE_LIMIT) { render(); return Promise.resolve(null); }
  busy = true;
  clearResult();
  clearNotices();
  const name = archiveName();
  const level = LEVELS[levelSelect.value] ?? 1;
  const snapshot = items.slice();
  const entries = snapshot.map((it) => ({
    file: it.file,
    path: it.path,
    level: STORED_EXT.has(extOf(it.path)) ? 0 : level,
    mtime: it.file.lastModified,
  }));
  createBtn.disabled = true;
  clearBtn.disabled = true;
  createBtn.textContent = 'Creating…';
  progress.hidden = false;
  setProgress(0, `Compressing ${snapshot.length} file${snapshot.length === 1 ? '' : 's'}…`);
  const started = performance.now();

  return new Promise((resolve) => {
    const worker = new Worker('worker.js');
    const finish = (value) => {
      worker.terminate();
      busy = false;
      createBtn.textContent = 'Create ZIP';
      progress.hidden = true;
      barNote.textContent = DEFAULT_NOTE;
      render();
      resolve(value);
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress(msg.total ? msg.done / msg.total : 1, `Compressing ${msg.path}… ${Math.floor((msg.total ? msg.done / msg.total : 1) * 100)}%`);
      } else if (msg.type === 'done') {
        const skippedPaths = msg.skipped.map((s) => s.path);
        if (skippedPaths.length) {
          showError(`Could not read ${skippedPaths.length} file${skippedPaths.length === 1 ? '' : 's'}, so ${skippedPaths.length === 1 ? 'it was' : 'they were'} left out: ${listNames(skippedPaths)}. The file may have been moved or deleted since you added it.`, 'read');
        }
        if (skippedPaths.length === snapshot.length) { finish(null); return; }
        const skipped = new Set(skippedPaths);
        const included = snapshot.filter((it) => !skipped.has(it.path));
        const before = included.reduce((sum, it) => sum + it.file.size, 0);
        showResult(msg.blob, name, included.length, before, (performance.now() - started) / 1000);
        if (autoDownload) downloadBlob(msg.blob, name);
        finish(msg.blob);
      } else if (msg.type === 'error') {
        showError(`The ZIP could not be created: ${msg.message}. Try fewer or smaller files, or the Store level.`);
        finish(null);
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      showError(`The ZIP could not be created: ${e.message || 'the compressor stopped unexpectedly'}. This usually means the browser ran out of memory.`);
      finish(null);
    };
    worker.postMessage({ entries });
  });
}

function showResult(blob, name, count, before, seconds) {
  resultUrl = URL.createObjectURL(blob);
  const card = document.createElement('div');
  card.className = 'result zip-result';
  card.innerHTML = `
    <svg class="zip-result__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11 6h2M11 9h2M11 12h2M10.5 15h3v3h-3z" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>
    <div class="result__meta">
      <div class="result__name"></div>
      <div class="result__info"></div>
    </div>
    <dl class="zip-stats">
      <div><dt>Original</dt><dd class="stat" id="stat-before"></dd></div>
      <div><dt>Archive</dt><dd class="stat" id="stat-after"></dd></div>
      <div><dt>Saved</dt><dd class="stat" id="stat-saved"></dd></div>
    </dl>
    <a class="btn btn--primary zip-result__download" id="download"></a>`;
  card.querySelector('.result__name').textContent = name;
  card.querySelector('.result__info').textContent = `${count} file${count === 1 ? '' : 's'} · built ${seconds < 0.1 ? 'in under 0.1 s' : `in ${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`} on this device`;
  card.querySelector('#stat-before').textContent = formatBytes(before);
  card.querySelector('#stat-after').textContent = formatBytes(blob.size);
  const saved = card.querySelector('#stat-saved');
  saved.textContent = savedText(before, blob.size);
  saved.classList.add(blob.size <= before ? 'stat--ok' : 'stat--warn');
  const link = card.querySelector('#download');
  link.href = resultUrl;
  link.download = name;
  link.textContent = `Download ${name}`;
  results.appendChild(card);
  card.scrollIntoView({ block: 'nearest' });
}

createBtn.addEventListener('click', () => createZip());
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); createZip(); }
});
window.addEventListener('pagehide', () => { if (resultUrl) URL.revokeObjectURL(resultUrl); });

render();

// Called by the factory's screenshot script: the fictional "Solar Oven Report" project, zipped.
window.__demo = async () => {
  const base = './tests/fixtures/solar-oven-report/';
  const paths = ['outline.txt', 'temperatures.csv', 'chart.png', 'notes/build-notes.txt'];
  const types = { txt: 'text/plain', csv: 'text/csv', png: 'image/png' };
  const files = await Promise.all(paths.map(async (p, i) => {
    const blob = await (await fetch(base + p)).blob();
    const file = new File([blob], p.split('/').pop(), { type: types[extOf(p)], lastModified: Date.UTC(2026, 3, 14, 10, 5 * i) });
    return { file, path: `solar-oven-report/${p}` };
  }));
  items = [];
  addEntries(files, [], { quiet: true });
  return createZip({ autoDownload: false });
};
