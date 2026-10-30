"""Check that every displayed floor can use the one room-neutral GLB."""
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
scene = ROOT / 'scene3d'
meta = json.loads((scene / 'scene_meta.json').read_text())
floor_files = {floor['file'] for floor in meta['floors']}
roof_files = {floor['roof']['file'] for floor in meta['floors']}
assert floor_files == {'ward_floor_02.glb'}, floor_files
assert roof_files == {'roof_floor_02.glb'}, roof_files
assert meta['shared_floor_template_level'] == 2

base = meta['floors'][1]['bounds_blender_xyz_m']
for floor in meta['floors']:
    assert floor['selected_objects'] == 794
    offset = (floor['level'] - 2) * meta['floor_height_m']
    bounds = floor['bounds_blender_xyz_m']
    for edge in ('min', 'max'):
        assert abs(bounds[edge][2] - base[edge][2] - offset) < 0.001

blob = (scene / 'ward_floor_02.glb').read_bytes()
json_size, chunk_type = struct.unpack_from('<II', blob, 12)
assert chunk_type == 0x4E4F534A
gltf = json.loads(blob[20:20 + json_size])
names = [node.get('name', '') for node in gltf['nodes']]
for room in range(1, 7):
    label = f'Room {room:02}'
    assert any(label in name and 'OCCUPANCY display' in name for name in names), label
    assert any(label in name and 'adjustable bed' in name for name in names), label
    assert any(label in name and 'door hinge' in name for name in names), label
    assert any(label in name and 'ventilator monitor screen' in name for name in names), label
    assert any(re.search(fr'F02 R{room:02} MGH\d+ full-feed screen overlay', name)
               for name in names), label

loader = (scene / 'parts/floor-loader.js').read_text()
assert 'const sharedFloorMeta=()=>meta.floors[meta.shared_floor_template_level-1];' in loader
assert 'entry.record' not in loader
assert 'else if(level===1)' not in loader
assert 'loadFloorManifest()' not in loader
reveal = (scene / 'parts/floor-reveal.js').read_text()
assert 'floorRevealOrder=[4,5,6,1,2,3]' in reveal
print('One GLB supplies six floor levels; patient and monitor sources remain room assignments')
