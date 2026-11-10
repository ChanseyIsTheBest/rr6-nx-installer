# rr6-nx-installer

Version 1.0.0, for **rr6-nx 1.0.0**: Ridge Racer 6 on the Nintendo Switch (homebrew), by ChanseyIsTheBest.

This page makes the Switch package from **your own copy** of the game. It runs entirely in your browser: your game files are
not uploaded, and none of the game's files come with rr6-nx.

## What you need

- Your **Xbox 360 disc** of Ridge Racer 6 as an `.iso` image, or the folder it was extracted to, with `default.xex` and the
  `RRM.DAT`, `RRM2.DAT` and `RRM3.DAT` archives in it.
- Optional: the game's **DLC** packages (music packs, cars), as the Xbox 360 packages you have.
- A desktop **Chromium browser** (Chrome, Edge, Brave...) and about 6 GB of free disk space for the download.
- A Switch that runs homebrew (Atmosphère) with **Sphaira**, and an SD card with about 6 GB free.

## How to use it

1. Open the page. To run it on your own computer: `python serve.py 8193 .` in this folder, then open
   http://127.0.0.1:8193/.
2. **Choose your game**: the disc image (`.iso`) or the extracted folder. The page checks that it is the supported version.
3. Optional: **add the DLC** packages, or a folder of them.
4. Press **Create rr6-nx.zip**. The zip downloads while it is made; keep the page open until it finishes.
5. If you have an older rr6-nx, delete its `switch/rr6-nx/game_root` folder first: an unpacked `RRM.DAT` left there is used
   instead of the packed one.
6. Extract `rr6-nx.zip` to the **root of the SD card**. It makes `switch/rr6-nx/`.
7. On the Switch, open **Sphaira**, find Ridge Racer 6, press **X** to open Options and choose **Install Forwarder**, make
   sure **Address Space** is **39-bit**, choose **Create Forwarder**, then start the game from the **Home Screen**.

## Smaller game files

The three RRM archives (3 GB) are packed with **LZ4 HC level 9 in 256 KB blocks**, on all of the computer's cores, and go to
the SD card as `RRM.DAT.lz4b`, `RRM2.DAT.lz4b` and `RRM3.DAT.lz4b`: about 2.4 GB, 600 MB less. rr6-nx reads them as the
files they were (`sdk/src/filesystem/lz4_blocks.cpp` in rr6-nx), decompressing only the blocks a read needs. The music and
the videos are compressed already and are copied as they are.

The format (`lib/lz4b.js`), little-endian: a 32-byte header (`RXLZ4BLK`, version 1, the block size, the file's size, the
block count), the blocks in LZ4's block format back to back (a block that does not get smaller is stored as it is), a u32
per block with its stored size, and a 16-byte footer (the index's offset, `RXLZ4END`). rr6-nx's `tools/lz4b_pack.py` makes
and checks the same files on a PC.

## Settings

`switch/rr6-nx/config.toml` holds your options, with a comment on each: the language (by default the Switch's), SMAA, the
game's MSAA (off by default), rumble (on), the DLC's car Unlock Keys (off: the music packs always load) and the
controls. Every other setting is built into the NRO. Delete the file and the game
writes it again at the next start.

## If something goes wrong

- Crash logs are written to `switch/rr6-nx/logs/`.
- The page says the game is not supported: rr6-nx supports one `default.xex`, the one the release's `manifest.json` names.

## How it works

The rest of this file is for developers.

rr6-nx carries its shaders: Ridge Racer 6 keeps all 176 of them in `default.xex`, so unlike kameo-nx-installer this page
translates and compiles nothing. It checks the game, packs the archives (`lib/lz4b.js`, on `lz4_worker.js` workers running
`wasm/lz4.wasm`: LZ4 1.10.0's HC, built by `wasm/src/lz4/build.sh`), and streams `rr6-nx.zip` to a download through the
service worker (`sw.js`). The zip's size is known only once the archives are packed, so the download starts without one.

`release/` is filled by `tools/make_release.py` from an rr6-nx tree: the NRO, `config.toml`, the DKSH cache
(`deko3d_shaders.bin`) and `pipeline_list.bin`, with `manifest.json` naming each one's SHA-256 and the supported
`default.xex`'s.

## Tests (Node 24, from this folder)

| Test | What it checks |
|---|---|
| `test/pack_node.mjs <out> <file>...` | the packer as the page runs it (`lib/lz4b.js`, `wasm/lz4.mjs` on worker threads); check its files with rr6-nx's `tools/lz4b_pack.py check` |
| `test/browser.html` (with `python serve.py 8193 . --test-files <game>`) | `worker.js` in a browser, the zip read as it streams: every entry's CRC, and every packed archive's blocks against the original |

Outputs of the tests are game data: never commit or share them.

## License

GPL-3.0 (see [LICENSE](LICENSE)). Third-party components are listed in [NOTICES.md](NOTICES.md). The page is built on
kameo-nx-installer and [renut-nx-webinstaller](https://github.com/ChanseyIsTheBest/renut-nx-webinstaller).

Ridge Racer is a trademark of Bandai Namco Entertainment; the icon artwork is © Bandai Namco Entertainment. This project is
not affiliated with or endorsed by Bandai Namco or Nintendo.
