// rr6-nx-installer (2026-11-10): packs game files as the page does (lib/lz4b.js; wasm/lz4.mjs and wasm/zxc.mjs on worker
// threads, as pack_worker.js does) into a folder, for rr6-nx's tools/test_lz4_blocks.cpp check and test runs of the game.
// 2026-11-11: each file by lib/lz4b.js's codecFor (the RRM archives LZ4, every other file ZXC; default.xex copied as it
// is). Node 24, from this folder:
//   node test/pack_node.mjs <out folder> <file>...
// Writes <out folder>/<name>.lz4b per packed file (default.xex as <name>). Game data: never commit or share what it writes.
import { copyFile, open } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { CODECS, codecFor, pack, SUFFIX } from '../lib/lz4b.js';
import { workerPool } from '../lib/pool.js';

const [outDir, ...files] = process.argv.slice(2);
if (!outDir || !files.length) {
  console.error('usage: node test/pack_node.mjs <out folder> <file>...');
  process.exit(2);
}

// pack_worker.js on a worker thread (the same calls; parentPort for self)
const WORKER = `
import { parentPort } from 'node:worker_threads';
import createLz4Module from ${JSON.stringify(new URL('../wasm/lz4.mjs', import.meta.url).href)};
import createZxcModule from ${JSON.stringify(new URL('../wasm/zxc.mjs', import.meta.url).href)};
const [lz4, zxc] = await Promise.all([createLz4Module(), createZxcModule()]);
const room = { lz4: { size: 0, src: 0, dst: 0 }, zxc: { size: 0, src: 0, dst: 0 } };
function buffers(name, m, size, dstSize) {
  const r = room[name];
  if (size > r.size) {
    if (r.src) { m['_' + name + '_free'](r.src); m['_' + name + '_free'](r.dst); }
    r.size = size; r.src = m['_' + name + '_malloc'](size); r.dst = m['_' + name + '_malloc'](dstSize);
  }
  return r;
}
parentPort.on('message', ({ id, bytes, codec, level, block }) => {
  let n, m, r;
  if (codec === 'zxc') {
    m = zxc; r = buffers('zxc', zxc, bytes.length, zxc._zxc_bound(Math.max(bytes.length, block)));
    zxc.HEAPU8.set(bytes, r.src);
    n = zxc._zxc_pack(r.src, bytes.length, r.dst, zxc._zxc_bound(bytes.length), level, block);
  } else {
    m = lz4; r = buffers('lz4', lz4, bytes.length, bytes.length);
    lz4.HEAPU8.set(bytes, r.src);
    n = lz4._lz4_compress(r.src, bytes.length, r.dst, bytes.length - 1, level);
  }
  const out = n > 0 ? m.HEAPU8.slice(r.dst, r.dst + n) : bytes;
  parentPort.postMessage({ id, bytes: out }, [out.buffer]);
});
parentPort.postMessage({ ready: true, version: lz4._lz4_version(), zxcVersion: zxc._zxc_version() });
`;

const count = Math.max(1, availableParallelism() - 1);
const workers = await Promise.all(Array.from({ length: count }, () => new Promise((resolve) => {
  const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(WORKER)}`), { type: 'module' });
  w.once('message', (m) => resolve({ w, version: m.version, zxcVersion: m.zxcVersion, post: (msg, t) => w.postMessage(msg, t),
                                     onMessage: (cb) => w.on('message', cb) }));
})));
console.log(`LZ4 ${workers[0].version}, ZXC ${workers[0].zxcVersion} on ${count} worker threads`);
const pool = workerPool(workers);
const compress = (bytes, codec) =>
  pool.run({ bytes, codec, level: CODECS[codec].level, block: CODECS[codec].block }, [bytes.buffer]).then((r) => r.bytes);

let totalIn = 0, totalOut = 0;
const began = performance.now();
for (const path of files) {
  const codec = codecFor(basename(path));
  if (!codec) {
    await copyFile(path, join(outDir, basename(path)));
    console.log(`${basename(path)}: copied as it is`);
    continue;
  }
  const handle = await open(path, 'r');
  const { size } = await handle.stat();
  const file = {
    size,
    async read(offset, length) {
      const buffer = new Uint8Array(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error(`${path}: short read`);
      return buffer;
    },
  };
  const target = join(outDir, basename(path) + SUFFIX);
  const out = createWriteStream(target);
  const started = performance.now();
  let written = 0;
  for await (const chunk of pack(file, compress, { codec, inFlight: count * 4 })) {
    written += chunk.length;
    if (!out.write(chunk)) await once(out, 'drain');
  }
  out.end();
  await once(out, 'finish');
  await handle.close();
  totalIn += size;
  totalOut += written;
  const s = (performance.now() - started) / 1000;
  console.log(`${basename(path)} (${codec}): ${(size / 1048576).toFixed(1)} MB -> ${(written / 1048576).toFixed(1)} MB ` +
              `(${(written / size * 100).toFixed(1)} %) in ${s.toFixed(1)} s, ${(size / 1048576 / s).toFixed(0)} MB/s`);
}
const all = (performance.now() - began) / 1000;
console.log(`all: ${(totalIn / 1048576).toFixed(0)} MB -> ${(totalOut / 1048576).toFixed(0)} MB in ${all.toFixed(0)} s`);
for (const { w } of workers) await w.terminate();
