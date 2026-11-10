#!/usr/bin/env python3
"""rr6-nx-installer (2026-11-10): fills release/ from an rr6-nx tree, and release/manifest.json with every file's SHA-256
and the supported default.xex's.

  python tools/make_release.py [--rr6 <rr6-nx>] [--xex <default.xex>] [--nro <NRO>] [--config <config.toml>]
                               [--shaders <deko3d_shaders.bin>] [--pipelines <pipeline_list.bin>]

The defaults are the user's console play setup (rr6-nx's docs/progress-log.md, 2026-11-09): the ultimate build's NRO
(app/out/switch-ult, built with RR6_BUILTIN_CONFIG=ON since 2026-11-10: the play settings compiled in, and the player's
config.toml, app/rr6_switch.toml: language, SMAA, MSAA, the controls), round 5's DKSH cache
(out/deko3d_shaders_ult/deko3d_shaders_r5.bin) and pipeline_list_r123_ryu.bin. The NRO carries the game's shaders
(all 176 are in default.xex), the cache is them compiled for the console, the list says which pipelines to prebuild.
The NRO must read .lz4b files (rr6-nx's sdk/src/filesystem/lz4_blocks.cpp, 2026-11-10).
"""
import argparse
import hashlib
import json
import os
import shutil

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELEASE = os.path.join(HERE, 'release')
VERSION = '1.0.0'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rr6', default=os.path.join(os.path.dirname(HERE), 'rr6-nx'))
    ap.add_argument('--xex', default=None)
    ap.add_argument('--nro', default=None)
    ap.add_argument('--config', default=None)
    ap.add_argument('--shaders', default=None)
    ap.add_argument('--pipelines', default=None)
    a = ap.parse_args()
    rr6 = a.rr6
    sources = {
        'rr6-nx.nro': a.nro or os.path.join(rr6, 'app', 'out', 'switch-ult', 'renut.nro'),
        'config.toml': a.config or os.path.join(rr6, 'app', 'rr6_switch.toml'),
        'deko3d_shaders.bin': a.shaders or os.path.join(rr6, 'out', 'deko3d_shaders_ult', 'deko3d_shaders_sd_2026-11-10.bin'),
        'pipeline_list.bin': a.pipelines or os.path.join(rr6, 'out', 'deko3d_shaders_ult', 'pipeline_list_sd_2026-11-10.bin'),
    }
    xex = a.xex or os.path.join(rr6, 'app', 'assets', 'default.xex')
    os.makedirs(RELEASE, exist_ok=True)
    hashes = {}
    for name, src in sources.items():
        if not os.path.isfile(src):
            raise SystemExit(f'missing: {src}')
        shutil.copyfile(src, os.path.join(RELEASE, name))
        hashes[name] = sha256(os.path.join(RELEASE, name))
        print(f'{name:20s} {os.path.getsize(src):>10,} bytes  {hashes[name][:16]}  <- {src}')
    manifest = {
        'version': VERSION,
        'builds': [{
            'edition': 'Xbox 360 disc',
            'xex_sha256': sha256(xex),
            'nro': 'rr6-nx.nro',
            'nro_sha256': hashes['rr6-nx.nro'],
            'files': [{'path': n, 'source': n, 'sha256': hashes[n]} for n in ('config.toml', 'deko3d_shaders.bin',
                                                                              'pipeline_list.bin')],
        }],
    }
    with open(os.path.join(RELEASE, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(f'manifest.json: default.xex {manifest["builds"][0]["xex_sha256"][:16]}, version {VERSION}')


if __name__ == '__main__':
    main()
