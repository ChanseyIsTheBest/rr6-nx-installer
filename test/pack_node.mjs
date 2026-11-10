// rr6-nx-installer (2026-11-10): packs game files as the page does (lib/lz4b.js, wasm/lz4.mjs on worker threads) into
// a folder, for rr6-nx's tools/lz4b_pack.py check and test runs of the game. Node 24, from this folder:
//   node test/pack_node.mjs <out folder> <file>...
// Writes <out folder>/<name>.lz4b per file. Game data: never commit or share what it writes.
import { open } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { pack, SUFFIX } from '../lib/lz4b.js';
import { workerPool } from '../lib/pool.js';

const [outDir, ...files] = process.argv.slice(2);
if (!outDir || !files.length) {
  console.error('usage: node test/pack_node.mjs <out folder> <file>...');
  process.exit(2);
}

const WORKER = `
import { parentPort } from 'node:worker_threads';
import createLz4Module from ${JSON.stringify(new URL('../wasm/lz4.mjs', import.meta.url).href)};
const lz4 = await createLz4Module();
let capacity = 0, src = 0, dst = 0;
parentPort.on('message', ({ id, bytes, level }) => {
  if (bytes.length > capacity) {
    if (src) { lz4._lz4_free(src); lz4._lz4_free(dst); }
    capacity = bytes.length; src = lz4._lz4_malloc(capacity); dst = lz4._lz4_malloc(capacity);
  }
  lz4.HEAPU8.set(bytes, src);
  const n = lz4._lz4_compress(src, bytes.length, dst, bytes.length - 1, level);
  const out = n > 0 ? lz4.HEAPU8.slice(dst, dst + n) : bytes;
  parentPort.postMessage({ id, bytes: out }, [out.buffer]);
});
parentPort.postMessage({ ready: true, version: lz4._lz4_version() });
`;

const count = Math.max(1, availableParallelism() - 1);
const workers = await Promise.all(Array.from({ length: count }, () => new Promise((resolve) => {
  const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(WORKER)}`), { type: 'module' });
  w.once('message', (m) => resolve({ w, version: m.version, post: (msg, t) => w.postMessage(msg, t),
                                     onMessage: (cb) => w.on('message', cb) }));
})));
console.log(`LZ4 ${workers[0].version} on ${count} worker threads`);
const pool = workerPool(workers);
const compress = (bytes, level) => pool.run({ bytes, level }, [bytes.buffer]).then((r) => r.bytes);

for (const path of files) {
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
  for await (const chunk of pack(file, compress, { inFlight: count * 4 })) {
    written += chunk.length;
    if (!out.write(chunk)) await once(out, 'drain');
  }
  out.end();
  await once(out, 'finish');
  await handle.close();
  const s = (performance.now() - started) / 1000;
  console.log(`${basename(path)}: ${(size / 1048576).toFixed(1)} MB -> ${(written / 1048576).toFixed(1)} MB ` +
              `(${(written / size * 100).toFixed(1)} %) in ${s.toFixed(1)} s, ${(size / 1048576 / s).toFixed(0)} MB/s`);
}
for (const { w } of workers) await w.terminate();
