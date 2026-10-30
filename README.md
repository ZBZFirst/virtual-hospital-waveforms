# ZeBeZo virtual hospital waveform catalog

This bundle contains the staged browser hospital scene, the UC Davis waveform
library viewer, and 24 complete PhysioNet MGH/MF recordings required by the
teaching rooms. Run `python3 serve.py` from the repository root and open
`http://127.0.0.1:8767/site/` to test it locally. The MGH decoder requests
byte ranges from `mgh/`; the server must return HTTP 206. The page and scene
controllers are edited in `site/page/` and `site/scene3d/parts/`, then bundled
with `python3 site/build_runtime_bundles.py`. Floor previews and per-feed
indexes live in `site/signal-previews/` and `site/feed-index/`. See
`site/README.txt` for their source and validation details.

The scene's `model_base` is relative to `site/scene3d/`, so its GLB files load
from the same release as the viewer. `mgh_base` remains pinned to the existing
immutable GitHub commit. Check those asset URLs from the intended public origin
before activating a new Pi release.

The 145 UC Davis source CSVs remain in the public `ZBZFirst/file` repository,
under `WaveformBackups/`, pinned by `site/viewer.js` to commit
`32063407e7fffb75d3866d080078d80295de476c`. The catalog's 169 source
recordings occupy distinct teaching rooms in five hospitals, six floors each,
six rooms per floor. Eleven rooms are unassigned. Recording files do not
establish unique patient identity or clinical correspondence between datasets.

`site/assign_campus_patients.py` assigns those recordings in a campus-wide
hospital rotation, alternating UC Davis and MGH until MGH is exhausted. Run
`python3 site/build_signal_previews.py` after changing assignments. Room devices
then show only the connections supported by their assigned source.

## Sources and rights

- UC Davis ventilator recordings: https://zenodo.org/records/14884306 .
  The source archive is GPL-3.0-or-later; see `site/DATA-LICENSE.txt` and
  preserve the paper citation shown by the source record.
- PhysioNet MGH/MF Waveform Database v1.0.0:
  https://physionet.org/content/mghdb/1.0.0/ . Source files are published
  under Open Data Commons Attribution License v1.0; retain this attribution.
  `SHA256SUMS.txt` verifies every copied `.hea` and `.dat` against the official
  PhysioNet checksums.
- Patient anatomy derived from Human Reference Atlas 3D Reference Object
  Library / HuBMAP, CC BY 4.0: https://humanatlas.io/3d-reference-library .
  The source meshes were decimated and adapted for the scene. See
  `HRA_ATTRIBUTION.md` for detailed credit and source links.
- Endotracheal tube geometry is an illustrative teaching asset; its incomplete
  manufacturer dimensions are provisional and it is not an engineering model.

The room scene, waveform display, and bedside placement are educational
visualizations. The MGH and UC Davis recordings are independent; the 3D patient
is an illustration and is not the actual recorded patient.
