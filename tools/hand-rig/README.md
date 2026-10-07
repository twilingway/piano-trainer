# Hand rig

Blender scripts that pose a rigged 3D right hand over a real-size keyboard and render the poses of
`src/render/handStudy` from straight above. The renders are shown on `public/hand-study.html`; the
solved poses (`poses/<id>.json`) are kept as keyframe data for a later playing animation.

## Setup

- Blender 5.2 with the BlenderMCP addon (port 9876), or `bl.py` as a plain socket client to it.
- The mesh: object `Hand  - Realistic` from Blender Studio's Human Base Meshes bundle v1.4.1 (CC0),
  appended into the open file (it arrives as `Hand  - Realistic.001`). The bundle is not committed.
- Scripts run inside Blender with `exec(open(path).read(), globals_dict)`; `ROOT` in the dict
  overrides the repository path baked into them.

## Steps

1. `studio_rig.py` builds collection `studio`: `HandMesh` (Multires baked, automatic weights)
   parented to `HandRig` (21 bones, MPFB names). `studio_geo.py` measures the finger sections it
   uses.
2. `studio_study.py` solves and renders every study pose with `studio_pose.py` into the git-ignored
   `blender/renders/study/` (`<id>.png`, `poses/<id>.json`, `report.json`). A pose takes about a
   minute; pass `{"ASYNC": True}` so the call returns at once and watch `progress.log` for `DONE`.
3. `game_tips.py`, inside Blender, puts every solved pose back on the rig and writes the fingertip
   pads in the top render's pixels to `poses/tips.json`; it reports how far each pressed pad lies
   from its key's centre.
4. `python tools/hand-rig/export.py` (Pillow) crops every render by one shared box into
   `public/hand-study/<id>.webp`, copies the poses and the report into `poses/`, and writes the
   game's set: `src/render/hands/rendered/<id>.webp` (the same crop at `GAME_SCALE`, wrist faded
   out) and `catalog.json` (pads in those pixels, pressed fingers, pixels per white key).
5. `node --experimental-strip-types src/render/handStudy/build.ts` rebuilds the page.

## Piano kit and the live hand

- `piano_kit.py` builds collection `piano_kit` (every key shape, cheek, rails, table; origins on the
  white keys' front top edge) and lays out collection `piano` from MIDI `LOW` to `HIGH` (C2..C6) in
  the solver's coordinates; `{"EXPORT": True}` writes the kit to `blender/exports/piano-kit.glb` for
  three.js. Ivory grain and the velvet bump are procedural: Blender only, not in the glTF.
- `node --experimental-strip-types src/render/three/handDemo.ts` plans a phrase with
  `handPlacement.ts` and writes `blender/exports/hand-demo.json`; `live_demo.py` then keys the rig
  (fingers-31 base, each finger between relaxed and pressed, knuckle turns for reach) and the keys.
  Run `piano_kit.py` first: it rebuilds the keys and drops their keys.
- `hand_skin.py`, after `studio_rig.py`, makes the hand a person's: object `HandNails` (a plate
  per finger on the distal phalanx, skinned to it alone, lunula and free edge in a colour
  attribute) and the skin maps in the hand's UVs, computed per texel from its rest position
  against the bones — colour, roughness, and a height map of knuckle wrinkles, palmar creases, nail
  folds, veins, pores and fine hair that Cycles bakes into a tangent-space normal map. The maps
  (1024², `blender/exports/hand-skin/`) are what three.js uses too. About 25 s.

## The solver, in short

The hand is a rigid body whose fingers wrap an "apple" under the palm. Nelder-Mead fits the wrist
position and the hand's yaw, pitch, roll and spread so the pressed fingertips land on their keys;
the forearm follows part of the yaw and carries the pronation. Pressed fingers then adjust curl and
knuckle flex/yaw within their abduction; the thumb is solved by IK and may bend its tip joint into
an "L". Free fingers rest nearly straight, lift until their skin clears the keys and fan after their
pressed neighbours. Phalanx capsules keep skin out of the keys and out of each other; the pads are
finally calibrated against the subdivided mesh as rendered. A stretch (spread past 1) lowers the
knuckles, turns the hand counter-clockwise and brings the outer fingers to the keys' front edge.

## `poses/<id>.json`

`down` and `over`: finger to semitone from C4 (pressed, and free fingers that anchor the hand).
`bones`: every pose bone's `matrix_basis` as `location`, `rotation_quaternion` (w, x, y, z) and
`scale`; `rig_matrix_world` is the armature object's matrix. Units are metres. `report.json` holds
the solver's measurements per pose (misses, pad gaps, collisions, hand angles), in millimetres and
degrees.
