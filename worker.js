// worker.js — builds the ZIP off the main thread with fflate's streaming Zip (classic worker).
// In:  { entries: [{ file: File, path: string, level: 0-9, mtime: number }] }
// Out: { type: 'progress', done, total, path } … then { type: 'done', blob, skipped } or { type: 'error', message }
importScripts('vendor/fflate/fflate.js');

const SLICE = 1 << 20; // feed the compressor 1 MB at a time so progress moves inside big files
const MIN_TIME = new Date(1980, 0, 2).getTime();
const MAX_TIME = new Date(2099, 11, 31).getTime();

self.onmessage = async (event) => {
  const { entries } = event.data;
  const total = entries.reduce((sum, e) => sum + e.file.size, 0);
  const chunks = [];
  const skipped = [];
  let failure = null;
  let done = 0;
  let lastPost = 0;

  const zip = new fflate.Zip((err, data) => {
    if (err) { failure = err; return; }
    chunks.push(data);
  });

  const progress = (path, force) => {
    const now = Date.now();
    if (!force && now - lastPost < 60) return;
    lastPost = now;
    self.postMessage({ type: 'progress', done, total, path });
  };

  try {
    for (const entry of entries) {
      let bytes;
      try {
        // Read the whole file first so a read error skips it cleanly instead of corrupting the archive.
        bytes = new Uint8Array(await entry.file.arrayBuffer());
      } catch (err) {
        skipped.push({ path: entry.path, reason: (err && err.name) || 'read error' });
        done += entry.file.size;
        progress(entry.path, true);
        continue;
      }
      const item = entry.level === 0 ? new fflate.ZipPassThrough(entry.path) : new fflate.ZipDeflate(entry.path, { level: entry.level });
      item.mtime = Math.min(MAX_TIME, Math.max(MIN_TIME, entry.mtime || Date.now()));
      zip.add(item);
      if (bytes.length === 0) {
        item.push(bytes, true);
      } else {
        for (let i = 0; i < bytes.length; i += SLICE) {
          const end = Math.min(bytes.length, i + SLICE);
          item.push(bytes.subarray(i, end), end === bytes.length);
          done += end - i;
          progress(entry.path, false);
          if (failure) throw failure;
        }
      }
      progress(entry.path, true);
    }
    zip.end();
    if (failure) throw failure;
    const blob = new Blob(chunks, { type: 'application/zip' });
    self.postMessage({ type: 'done', blob, skipped, total });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err && err.message) || String(err), skipped });
  }
};
