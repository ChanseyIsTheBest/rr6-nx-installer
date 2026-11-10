#!/usr/bin/env python3
"""rr6-nx-installer (2026-11-10): checks an rr6-nx.zip the page made against the game folder it was made from and
release/: the zip's CRCs (zipfile), every game_root file byte for byte, every .lz4b entry's blocks decompressed and
compared with the original archive, and the release files by SHA-256 (manifest.json).

  python test/check_zip.py <rr6-nx.zip> <game folder>

Needs the lz4 module. Game data: never commit or share the zip.
"""
import hashlib
import json
import os
import struct
import sys
import zipfile

import lz4.block

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = 'switch/rr6-nx/'


def check_lz4b(z, info, original):
    with z.open(info) as f:
        magic, version, block, size, count, _ = struct.unpack('<8sIIQII', f.read(32))
        assert magic == b'RXLZ4BLK' and version == 1, 'header'
        assert size == os.path.getsize(original), f'holds {size} bytes, the original has {os.path.getsize(original)}'
        f.seek(info.file_size - 16)
        index_offset, end = struct.unpack('<Q8s', f.read(16))
        assert end == b'RXLZ4END', 'footer'
        f.seek(index_offset)
        sizes = struct.unpack(f'<{count}I', f.read(4 * count))
        assert 32 + sum(sizes) == index_offset, 'index'
        f.seek(32)
        with open(original, 'rb') as o:
            for i, stored in enumerate(sizes):
                length = block if i + 1 < count else size - i * block
                data = f.read(stored)
                raw = data if stored == length else lz4.block.decompress(data, uncompressed_size=length)
                if raw != o.read(length):
                    raise AssertionError(f'block {i} differs')
    return size, info.file_size, count


def main():
    zip_path, game = sys.argv[1], sys.argv[2]
    manifest = json.load(open(os.path.join(HERE, 'release', 'manifest.json'), encoding='utf-8'))
    build = manifest['builds'][0]
    with zipfile.ZipFile(zip_path) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit(f'FAIL: {bad} has a wrong CRC')
        names = [i.filename for i in z.infolist()]
        print(f'{len(names)} entries, all CRCs right')
        release = {ROOT + 'rr6-nx.nro': build['nro_sha256'], **{ROOT + f['path']: f['sha256'] for f in build['files']}}
        for name, want in release.items():
            got = hashlib.sha256(z.read(name)).hexdigest()
            if got != want:
                raise SystemExit(f'FAIL: {name} is not the release file')
        print(f'release files: {len(release)} as the manifest names them')
        game_files = sorted(os.listdir(game))
        packed_in = packed_out = 0
        for name in game_files:
            original = os.path.join(game, name)
            if name.upper() in ('RRM.DAT', 'RRM2.DAT', 'RRM3.DAT'):
                entry = ROOT + 'game_root/' + name + '.lz4b'
                if ROOT + 'game_root/' + name in names:
                    raise SystemExit(f'FAIL: {name} is in the zip unpacked too')
                size, packed, count = check_lz4b(z, z.getinfo(entry), original)
                packed_in += size
                packed_out += packed
                print(f'{entry}: {count} blocks equal {name} ({packed / size * 100:.1f} %)')
            else:
                entry = ROOT + 'game_root/' + name
                h = hashlib.sha256()
                with z.open(entry) as f:
                    for piece in iter(lambda: f.read(1 << 20), b''):
                        h.update(piece)
                o = hashlib.sha256()
                with open(original, 'rb') as f:
                    for piece in iter(lambda: f.read(1 << 20), b''):
                        o.update(piece)
                if h.digest() != o.digest():
                    raise SystemExit(f'FAIL: {entry} differs from {name}')
        print(f'game_root: {len(game_files)} files right; the archives {packed_in / 1048576:.0f} MB -> '
              f'{packed_out / 1048576:.0f} MB')
    print('OK')


if __name__ == '__main__':
    main()
