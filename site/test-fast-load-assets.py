"""Verify derived fast-load files against their original release assets."""
from collections import defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'manifest.json').read_text())
campus = json.loads((ROOT / 'scene3d/campus_manifest_full_catalog.json').read_text())
index = json.loads((ROOT / 'segment-index.json').read_text())
model_sizes = json.loads((ROOT / 'scene3d/model_sizes.json').read_text())
assert model_sizes and all((ROOT / 'scene3d' / name).stat().st_size == size
                           for name, size in model_sizes.items())
original = gzip.decompress((ROOT / 'atlas_signals.bin.gz').read_bytes())
room_by_id = {room['id']: room for room in campus['rooms']}
hospital_ids = [hospital['id'] for hospital in campus['hospitals']]
slots = [room_by_id[f'{hospital}-F{floor:02d}-R{bed:02d}']
         for floor in range(1, 7) for bed in range(1, 7) for hospital in hospital_ids]
assert len(room_by_id) == len(slots) == 180
assert [room['source_kind'] for room in slots[:48]] == ['uc_davis', 'physionet_mgh'] * 24
assert [room['source_kind'] for room in slots[48:169]] == ['uc_davis'] * 121
assert all(room['source_kind'] is None and room['patient_id'] is None for room in slots[169:])
assert len({room['telemetry_record'] for room in slots if room['telemetry_record']}) == 24
assert {room['uc_davis_recording'] for room in slots if room['uc_davis_recording']} == {
    entry['name'] for entry in manifest['entries']}
rooms = {room['uc_davis_recording']: room for room in campus['rooms'] if room.get('uc_davis_recording')}
groups = defaultdict(list)
offset = 0
opening_bytes = 0
source_root = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent
source_files = [source_root / entry['name'] for entry in manifest['entries']]
verify_source = all(path.is_file() for path in source_files)
if any(path.is_file() for path in source_files) and not verify_source:
    raise FileNotFoundError(f'Only some source CSVs are present in {source_root}')
for entry in manifest['entries']:
    name = entry['name']
    length = math.ceil(entry['samples'] / 5) * 2
    room = rooms[name]
    groups[(room['hospital_id'], room['floor'])].append((room['room'], original[offset:offset + length]))
    offset += length
    shard = json.loads((ROOT / 'feed-index' / f'{name}.json').read_text())
    assert shard['feeds'][name] == index['feeds'][name]
    first = shard['feeds'][name]['segments'][0]
    assert first['coreEnd'] <= 3000
    length = first['byteEnd'] - first['byteStart']
    if verify_source:
        with (source_root / name).open('rb') as file:
            file.seek(first['byteStart'])
            data = file.read(length)
        assert hashlib.sha256(data).hexdigest() == first['sha256']
    opening_bytes += length
assert offset == len(original)
for (hospital, floor), members in groups.items():
    expected = b''.join(data for _, data in sorted(members))
    actual = gzip.decompress((ROOT / 'signal-previews' / f'{hospital}-{floor:02d}.bin.gz').read_bytes())
    assert actual == expected
assert opening_bytes < 20_000_000
print(f'Fast-load assets verified: {len(groups)} floor previews, {len(manifest["entries"])} feed indexes, {opening_bytes:,} opening bytes; source CSV hashes {"verified" if verify_source else "not checked (source files absent)"}')
