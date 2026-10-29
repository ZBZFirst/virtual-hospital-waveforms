# HRA male patient with fitted Portex SACETT

Open `Portex_SACETT_HRA_male_patient_v24.blend` in Blender. The `HRA male patient
root - supine` object contains a decimated male skin reference, selected mouth
structures, laryngeal cartilages, trachea, and the independently editable ETT.
The `08 HRA LEFT lung` and `09 HRA RIGHT lung` collections each contain ten
independent bronchopulmonary segment meshes. The HRA left and right main
bronchi are retained in `10 HRA main bronchi`. Their source also contains
smaller intrapulmonary bronchi, which this performance-oriented scene omits.
The rest of the HRA body organs were omitted. A separate `07 HRA airway cutaway
display` collection holds half-sliced copies of the larynx and trachea for
inspection; the full meshes remain in `03 HRA larynx trachea CC-BY-4.0`.

The ETT is rebuilt along a centerline that passes through the adapted oral
opening and HRA airway. `ETT 0 cm - tip in HRA trachea` is the distal anchor;
`ETT 23 cm - HRA lips` is 230.000 mm of centerline distance from that tip;
`ETT 33 cm - adapter` marks the 330 mm shaft end. The inserted path was fitted
by hand to this reference mesh. A two-sided ray check at the tip found 6.82 mm
and 6.75 mm to the HRA tracheal surface from its center, versus a 5.9 mm ETT
shaft outer radius. This checks the tip position only; it is not a full
collision or clinical placement validation. The lip opening and lip edge are adaptations,
and the in-situ cuff compression is illustrative. This scene is for visual
inspection, not a clinically verified placement or airway fit test.

## Breathing, underwear, and blanket

The full imported arm is retained. The dark-blue boxer-style underwear is one
connected mesh fitted from the pelvis and upper-thigh body surface. It has one
waist opening and two leg openings, and covers the pelvis when the blanket is
hidden. The blanket uses Blender
cloth physics, collides with the skin and mattress, and has a baked
cache for frames **1-181**. The first 60 frames settle the blanket. The visible
breathing cycle runs from **61-181 at 30 fps**: frame 61 is exhale, frame 91 is
inhale, and frame 181 returns to exhale. Press Space to play or scrub the
timeline. Keep `blendcache_Portex_SACETT_HRA_male_patient_v24/` beside the
`.blend` file for baked blanket playback.

The `LEFT lung expansion control` and `RIGHT lung expansion control` remain
independently editable. The chest skin uses the `Inhale - anterior chest
expansion` shape key. Its maximum vertex displacement is about 11.34 mm.
These motions are illustrative rather than measured respiratory mechanics.

## Original source and attribution

The anatomy is adapted from the **Human Reference Atlas 3D Reference Object
Library**, based on the National Library of Medicine Visible Human Male. The
library publishes its 3D reference objects under **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**.
Credit: Human Reference Atlas / HuBMAP 3D Reference Object Library. The skin,
mouth, larynx, trachea, lung, and main bronchus meshes were imported,
selectively retained,
decimated, rotated into a supine pose, and the skin was cut at the mouth.
The ETT, bed, lip border, underwear, blanket, and cutaway meshes are additional adaptations.

Sources:

- [NIH 3D Body, Male entry 3DPX-021022](https://3d.nih.gov/entries/21022)
- [HRA 3D Reference Object Library and license](https://humanatlas.io/3d-reference-library)
- [Skin, Male v1.4](https://cdn.humanatlas.io/digital-objects/ref-organ/skin-male/v1.4/assets/3d-vh-m-skin.glb)
- [Mouth, Male v1.0](https://cdn.humanatlas.io/digital-objects/ref-organ/mouth-male/v1.0/assets/3d-vh-m-mouth.glb)
- [Larynx, Male v1.1](https://cdn.humanatlas.io/digital-objects/ref-organ/larynx-male/v1.1/assets/3d-vh-m-larynx.glb)
- [Trachea, Male v1.1](https://cdn.humanatlas.io/digital-objects/ref-organ/trachea-male/v1.1/assets/3d-vh-m-trachea.glb)
- [Lung, Male v1.4](https://cdn.humanatlas.io/digital-objects/ref-organ/lung-male/v1.4/assets/3d-vh-m-lung.glb)
- [Main Bronchus, Male v1.1](https://cdn.humanatlas.io/digital-objects/ref-organ/main-bronchus-male/v1.1/assets/3d-vh-m-main-bronchus.glb)

The `.blend` includes the adapted geometry, so the original GLBs do not need
to be loaded merely to inspect or edit it. The unmodified downloads are kept
in `hra_reference/` for provenance and regeneration. For many visible patients,
instance the Blender collection rather than copying its meshes.

## Previews

- `Portex_SACETT_HRA_male_external_v24.png`: covered patient at exhale.
- `Portex_SACETT_HRA_male_inhale_v24.png`: covered patient at inhale.
- `Portex_SACETT_HRA_male_underwear_v24.png`: underwear with blanket hidden.
- `Portex_SACETT_HRA_male_underwear_foot_v24.png`: foot-end modesty check.
- `Portex_SACETT_HRA_male_airway_and_lungs_v10.png`: exposed HRA airway and
  both segmented lungs at inhale.

Run `/home/paulwasthere/Documents/blender-5.1.1-linux-x64/blender -b -t 2
--python make_hra_intubated_patient.py` from this directory to build a new
version, then run Blender with the generated `.blend`, `-t 4 --python
bake_hra_cloth.py` to bake cloth and render the breathing previews. The build
script intentionally refuses to overwrite its current output; change the
versioned output names before rebuilding.
