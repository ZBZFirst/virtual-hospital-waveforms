"""Split the existing 10 Hz visual track by virtual hospital floor."""
from collections import defaultdict
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'manifest.json').read_text())
campus = json.loads((ROOT / 'scene3d/campus_manifest_full_catalog.json').read_text())
source = gzip.decompress((ROOT / 'atlas_signals.bin.gz').read_bytes())
groups = defaultdict(list)
room_by_recording = {room['uc_davis_recording']: room for room in campus['rooms'] if room.get('uc_davis_recording')}
offset = 0
for entry in manifest['entries']:
    length = math.ceil(entry['samples'] / 5) * 2
    room = room_by_recording[entry['name']]
    groups[(room['hospital_id'], room['floor'])].append((room['room'], source[offset:offset + length]))
    offset += length
if offset != len(source):
    raise ValueError('Atlas track length does not match feed manifest')

output = ROOT / 'signal-previews'
output.mkdir(exist_ok=True)
for (hospital, floor), recordings in groups.items():
    payload = b''.join(part for _, part in sorted(recordings))
    destination = output / f'{hospital}-{floor:02d}.bin.gz'
    destination.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
print(f'{len(groups)} preview groups; {sum(p.stat().st_size for p in output.glob("*.gz")):,} compressed bytes')
