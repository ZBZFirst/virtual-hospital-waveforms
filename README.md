# ZeBeZo virtual hospital waveform catalog

This bundle contains the staged browser hospital scene, the existing UC Davis
waveform library viewer, and 24 complete PhysioNet MGH/MF recordings required
by the teaching rooms. Run `python3 serve.py` from the repository root and
open `http://127.0.0.1:8767/site/` to test it locally.
The MGH decoder requests byte ranges from `mgh/`; the server must honor the
`Range` request and return HTTP 206. `site/scene3d/catalog_config.json` uses a
relative path so a GitHub Pages deployment rooted at this repository can also
serve the source files. For the ZeBeZo origin, change that file to an immutable
raw.githubusercontent.com commit URL after publishing.

The 145 UC Davis source CSVs remain in the public `ZBZFirst/file` repository,
under `WaveformBackups/`, pinned by `site/viewer.js` to commit
`32063407e7fffb75d3866d080078d80295de476c`. The catalog's 169 source
recordings occupy distinct teaching rooms in five hospitals, six floors each,
six rooms per floor. Eleven rooms are unassigned. Recording files do not
establish unique patient identity or clinical correspondence between datasets.

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
