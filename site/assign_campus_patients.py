"""Place independent UC Davis and MGH recordings in alternating campus beds.

The room IDs are illustrative locations, never source patient identities.
Run this before build_signal_previews.py when changing assignments.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
path = ROOT / 'scene3d/campus_manifest_full_catalog.json'
campus = json.loads(path.read_text())
feed_manifest = json.loads((ROOT / 'manifest.json').read_text())
rooms = campus['rooms']
hospitals = [hospital['id'] for hospital in campus['hospitals']]
room_by_id = {room['id']: room for room in rooms}
assert len(hospitals) == 5 and len(room_by_id) == 180

uc_sources = [entry['name'] for entry in feed_manifest['entries']]
mgh_sources = sorted({room['telemetry_record'] for room in rooms if room.get('telemetry_record')})
legacy_units = {room['uc_davis_recording']: room.get('legacy_unit') for room in rooms if room.get('uc_davis_recording')}
assert len(uc_sources) == len(set(uc_sources)) == 145
assert len(mgh_sources) == 24
assert set(legacy_units) == set(uc_sources)

# Visit each hospital once per bed position, so both sources reach every
# hospital before the smaller MGH pool is exhausted.
slots = [room_by_id[f'{hospital}-F{floor:02d}-R{bed:02d}']
         for floor in range(1, 7) for bed in range(1, 7) for hospital in hospitals]
uc_index = mgh_index = 0
next_source = 'uc_davis'
for room in slots:
    for key in ('simulation_room', 'simulated_uc_davis_recording', 'simulated_telemetry_record'):
        room.pop(key, None)
    source = next_source if uc_index < len(uc_sources) and mgh_index < len(mgh_sources) else (
        'uc_davis' if uc_index < len(uc_sources) else
        'physionet_mgh' if mgh_index < len(mgh_sources) else None)
    room.update(patient_id=f'SIM-{room["id"]}' if source else None,
                source_kind=source, uc_davis_recording=None, telemetry_record=None,
                ventilator_excerpt_room=None, legacy_unit=None,
                assignment_status='illustrative' if source else 'unassigned')
    if source == 'uc_davis':
        recording = uc_sources[uc_index]
        room['uc_davis_recording'] = recording
        room['legacy_unit'] = legacy_units[recording]
        uc_index += 1
        next_source = 'physionet_mgh'
    elif source == 'physionet_mgh':
        room['telemetry_record'] = mgh_sources[mgh_index]
        mgh_index += 1
        next_source = 'uc_davis'

assert (uc_index, mgh_index) == (145, 24)
for hospital in hospitals:
    for floor in range(1, 7):
        donor = room_by_id[f'{hospital}-F{floor:02d}-R05']
        simulation = room_by_id[f'{hospital}-F{floor:02d}-R06']
        if not simulation['patient_id']:
            continue
        simulation['simulation_room'] = True
        if not simulation['uc_davis_recording'] and donor['uc_davis_recording']:
            simulation['simulated_uc_davis_recording'] = donor['uc_davis_recording']
        if not simulation['telemetry_record'] and donor['telemetry_record']:
            simulation['simulated_telemetry_record'] = donor['telemetry_record']

campus['version'] = 4
campus['note'] = ('Illustrative campus beds rotate across hospitals A-E and alternate independent '
                  'UC Davis and MGH recordings until MGH is exhausted; remaining beds use UC Davis. '
                  'Occupied Room 6 beds are marked Simulation Room. Where Room 5 has the missing type, '
                  'Room 6 displays that source as a simulation; the two recordings are not from one patient. '
                  'Recording IDs are not verified patient identities.')
path.write_text(json.dumps(campus, indent=2) + '\n')
print(f'Assigned {uc_index} UC Davis and {mgh_index} MGH recordings across {len(hospitals)} hospitals; '
      f'{len(slots)-uc_index-mgh_index} beds empty')
