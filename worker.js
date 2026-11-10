// rr6-nx-installer (from kameo-nx-installer, renut-nx-webinstaller): makes the package off the page's thread and streams
// the zip to the download service worker (sw.js). From kameo-nx-installer's worker.js (bejeweled3-nx-installer's,
// nfsmw-nx-installer's download stream, GPL-3.0).
//
// rr6-nx carries its shaders (Ridge Racer 6 keeps all 176 in default.xex), so the page makes none: it checks the game,
// packs the game files (lib/lz4b.js on pack_worker.js, one per core: the three RRM archives as LZ4 blocks, every other
// file but default.xex as ZXC blocks, 2026-11-11) and writes the zip.
import { CODECS, codecFor, pack, SUFFIX } from './lib/lz4b.js';
import { workerPool } from './lib/pool.js';
import { ZipWriter } from './lib/zip.js';

const ROOT = 'switch/rr6-nx';
// The share of a file left after packing, for the size of the download before it is known (rr6-nx's measures).
const KEPT = { lz4: 0.80, zxc: 0.94 };
const log = (text) => postMessage({ type: 'log', text });

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

// A release file, checked against the SHA-256 the manifest gives for it.
async function fetchChecked(name, hash) {
  const bytes = await fetchBytes(`./release/${name}`);
  const got = await sha256(bytes);
  if (hash && got !== hash) throw new Error(`release/${name} is not the one the manifest names (${got})`);
  return bytes;
}

// Sends every write as one chunk, and only when the download has asked for more ("pull").
function portSink(port) {
  let credits = 0, cancelled = false, waiting = null;
  port.onmessage = ({ data }) => {
    if (data.type === 'pull') credits++;
    else if (data.type === 'cancel') cancelled = true;
    if (waiting) { const wake = waiting; waiting = null; wake(); }
  };
  return {
    async write(bytes) {
      while (!credits) {
        if (cancelled) throw new Error('the download was cancelled');
        await new Promise((resolve) => (waiting = resolve));
      }
      if (cancelled) throw new Error('the download was cancelled');
      credits--;
      const copy = bytes.slice();
      port.postMessage({ type: 'chunk', buffer: copy.buffer }, [copy.buffer]);
    },
    async close() { port.postMessage({ type: 'end' }); },
    fail(message) { port.postMessage({ type: 'error', message }); },
  };
}

// The game's files: { path (in the game folder), size, read(offset, length) } from the page's Files, or for
// test/browser.html from the test server (HTTP range requests). A file inside a disc image has the image as its file
// and its offset there (lib/xiso.js).
function gameFiles(entries) {
  return entries.map((e) => ({
    path: e.path,
    size: e.size,
    read: e.file
      ? async (offset, length) => {
          const at = (e.offset || 0) + offset;
          return new Uint8Array(await e.file.slice(at, at + length).arrayBuffer());
        }
      : async (offset, length) => {
          const r = await fetch(e.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
          if (!r.ok) throw new Error(`${e.url}: HTTP ${r.status}`);
          return new Uint8Array(await r.arrayBuffer());
        },
  }));
}

async function* chunks(file, size = 8 << 20) {
  for (let at = 0; at < file.size; at += size) yield await file.read(at, Math.min(size, file.size - at));
}

// count pack_worker.js workers, each started and ready, as lib/pool.js takes them
function startWorkers(count) {
  return Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const w = new Worker('./pack_worker.js', { type: 'module' });
    w.onerror = (e) => reject(new Error(`pack_worker.js: ${e.message}`));
    w.addEventListener('message', ({ data }) => {
      if (data.ready) resolve({ w, version: data.version, zxcVersion: data.zxcVersion, post: (m, t) => w.postMessage(m, t),
                                onMessage: (cb) => w.addEventListener('message', ({ data: d }) => cb(d)) });
    }, { once: true });
  })));
}

self.onmessage = async ({ data }) => {
  const sink = portSink(data.port);
  const started = performance.now();
  const seconds = () => Math.round((performance.now() - started) / 1000);
  let workers = [];
  try {
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('./release/manifest.json')));
    const files = gameFiles(data.entries);
    const xex = files.find((f) => f.path.toLowerCase() === 'default.xex');
    if (!xex) throw new Error('no default.xex in the folder: choose the folder the game was extracted to');
    const xexHash = await sha256(await xex.read(0, xex.size));
    const build = manifest.builds.find((b) => b.xex_sha256 === xexHash);
    if (!build) throw new Error(`this default.xex is not one this release supports (SHA-256 ${xexHash})`);

    log('Downloading the program and its files...');
    const nro = await fetchChecked(build.nro, build.nro_sha256);
    const extras = await Promise.all(build.files.map(async (f) => ({ ...f, bytes: await fetchChecked(f.source, f.sha256) })));

    // the packing workers: one per core but one (the zip and the reads run here)
    const cores = Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));
    workers = await startWorkers(cores);
    const pool = workerPool(workers);
    const compress = (bytes, codec) =>
      pool.run({ bytes, codec, level: CODECS[codec].level, block: CODECS[codec].block }, [bytes.buffer]).then((r) => r.bytes);
    const version = (v) => `${Math.floor(v / 10000)}.${Math.floor(v / 100) % 100}.${v % 100}`;
    log(`LZ4 ${version(workers[0].version)} and ZXC ${version(workers[0].zxcVersion)} ready on ${cores} threads ` +
        `(${seconds()} s).`);

    const dlc = gameFiles(data.dlc || []);
    const game = files.filter((f) => !f.path.startsWith('$SystemUpdate/'));
    const totalIn = nro.length + extras.reduce((n, f) => n + f.bytes.length, 0) + game.reduce((n, f) => n + f.size, 0) +
                    dlc.reduce((n, f) => n + f.size, 0);
    let doneIn = 0;
    const counted = (n) => { doneIn += n; postMessage({ type: 'progress', fraction: doneIn / totalIn }); };
    // the zip's size is known only once the files are packed: the download starts without one (KEPT of each)
    const estimate = totalIn - game.reduce((n, f) => n + (codecFor(f.path) ? f.size * (1 - KEPT[codecFor(f.path)]) : 0), 0);
    postMessage({ type: 'start', estimate });

    const zip = new ZipWriter(sink);
    await zip.addBytes(`${ROOT}/rr6-nx.nro`, nro); counted(nro.length);
    for (const f of extras) { await zip.addBytes(`${ROOT}/${f.path}`, f.bytes); counted(f.bytes.length); }
    let packedIn = 0, packedOut = 0;
    for (const f of game) {
      const codec = codecFor(f.path);
      if (codec) {
        const t0 = performance.now();
        // the large files by name (the RRM archives and the videos over 50 MB); the small ones only in the summary
        const named = f.size > 50 * 1048576;
        if (named) log(`Packing ${f.path} (${(f.size / 1048576).toFixed(0)} MB, ${codec.toUpperCase()})...`);
        const size = await zip.addStream(`${ROOT}/game_root/${f.path}${SUFFIX}`,
                                         pack(f, compress, { codec, inFlight: cores * 4, onRaw: counted }));
        packedIn += f.size;
        packedOut += size;
        const s = (performance.now() - t0) / 1000;
        if (named) {
          log(`  ${f.path}${SUFFIX}: ${(size / 1048576).toFixed(0)} MB (${(size / f.size * 100).toFixed(1)} %), ` +
              `${s.toFixed(0)} s (${(f.size / 1048576 / Math.max(s, 0.001)).toFixed(0)} MB/s)`);
        }
      } else {
        await zip.addFile(`${ROOT}/game_root/${f.path}`, f.size, chunks(f), (c) => counted(c.length));
      }
    }
    for (const f of dlc) {
      await zip.addFile(`${ROOT}/dlc/${f.path}`, f.size, chunks(f), (c) => counted(c.length));
    }
    const total = await zip.finish();
    log(`The game files: ${(packedIn / 1048576).toFixed(0)} MB packed to ${(packedOut / 1048576).toFixed(0)} MB, ` +
        `${((packedIn - packedOut) / 1048576).toFixed(0)} MB saved.`);
    for (const x of workers) x.w.terminate();
    postMessage({ type: 'done', seconds: seconds(), size: total });
  } catch (error) {
    for (const x of workers) x.w.terminate();
    const message = error.message || String(error);
    sink.fail(message);
    postMessage({ type: 'error', message });
  }
};
