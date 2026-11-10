# Third-party notices

rr6-nx-installer is a fork of kameo-nx-installer, itself built on
[renut-nx-webinstaller](https://github.com/ChanseyIsTheBest/renut-nx-webinstaller) (GPL-3.0).

| Component | Where | License |
|---|---|---|
| kameo-nx-installer, [bejeweled3-nx-installer](https://github.com/ChanseyIsTheBest/bejeweled3-nx-installer) and [sa2-nx-installer](https://github.com/ChanseyIsTheBest/sa2-nx-installer) by ChanseyIsTheBest: this page's starting point (the page, the worker, the zip writer, the disc image reader, the worker pool, the test server) | `app.js`, `worker.js`, `lib/zip.js`, `lib/xiso.js`, `lib/pool.js`, `serve.py` | GPL-3.0 |
| [nfsmw-nx-installer](https://github.com/StevensND/nfsmw-nx-installer) by StevensND: the download service worker and the worker's download stream (through bejeweled3-nx-installer), the zip writer | `sw.js`, `worker.js`, `lib/zip.js` | GPL-3.0 |
| [LZ4](https://github.com/lz4/lz4) 1.10.0 by Yann Collet: `lz4.c`, `lz4.h`, `lz4hc.c`, `lz4hc.h`, unmodified (the copy in peggle2-nx-installer) | `wasm/src/lz4/`, `wasm/lz4.*` | BSD 2-Clause (`wasm/src/lz4/LICENSE`) |
| [ZXC](https://github.com/hellobertrand/zxc) 0.15.0 by Bertrand Lebonnois: its library, unmodified but for `zxc_driver.c` left out (the same commit rr6-nx decodes with) | `wasm/src/zxc/`, `wasm/zxc.*` | BSD 3-Clause (`wasm/src/zxc/LICENSE`) |
| [rapidhash](https://github.com/Nicoshev/rapidhash) by Nicolas De Carli, bundled with ZXC | `wasm/src/zxc/src/lib/vendors/rapidhash.h`, `wasm/zxc.*` | MIT (`wasm/src/zxc/THIRD_PARTY_NOTICES`) |
| [Emscripten](https://emscripten.org) 6.0.11 runtime and the musl libc it links | `wasm/lz4.mjs`, `wasm/lz4.wasm`, `wasm/zxc.mjs`, `wasm/zxc.wasm` | MIT and NCSA |

`wasm/lz4.*` is built by `wasm/src/lz4/build.sh` and `wasm/zxc.*` by `wasm/src/zxc/build.sh` (Emscripten 6.0.11).

The licenses of the software in the NRO are listed in rr6-nx's repository, with its source code.
