"""Write exact GLB byte counts used by the browser download progress bar."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'scene3d'
files = [*ROOT.glob('*.glb'), *(ROOT / 'patient_lods').glob('patient_001_lod[12].glb')]
sizes = {str(path.relative_to(ROOT)): path.stat().st_size for path in sorted(files)}
(ROOT / 'model_sizes.json').write_text(json.dumps(sizes, indent=2) + '\n')
(ROOT / 'parts/model-sizes.js').write_text('const modelBytes = Object.freeze(' + json.dumps(sizes, separators=(',', ':')) + ');\n')
print(f'{len(sizes)} model sizes written')
