## Context

Every view lays notes out by a fixed look-ahead: `trainerView` gives 2 s to the flat views and
`roadFrameState` replaces it with `roadApproach` (2.22 s straight, 6 s perspective) for the road.
`NotesLayer` and `ThreeRoadFrame` place a note at `hitY - (start - time) * hitY / lookAhead`, and
the 3D road maps that row linearly onto `[near.z, roadFarZ]`. Field length therefore sets the speed:
`roadFarZ` follows the horizon, `hitY` follows the staff and the screen.

## Goals / Non-Goals

**Goals:** one world speed in millimetres per second, equal to today's 3D «Прямо» with the staff on;
the window follows from field length. **Non-Goals:** music time, grading, horizon and camera
geometry, perspective shrink of far notes.

## Decisions

1. **One world speed in millimetres per second.** `NOTE_SPEED_MM` is a constant measured in the
   piano's own metres: the white-key step is 23.5 mm (`KEYBOARD_WHITE_STEP`). Each road converts it
   to its units through its white-key step: `unitsPerMm = whiteStepInRoadUnits / 23.5`. The value is
   calibrated once from the reference, 3D «Прямо» with the staff on: road length over 2.22 s,
   divided by the white-key step there, times 23.5 mm (the user's screenshot, 88 keys: about 7.3
   white steps per second, about 0.17 m/s). It is measured in the browser and pinned by a test.
2. **Window from the road length.** `lookAhead = roadLength / (NOTE_SPEED_MM * unitsPerMm)` in the
   road's own units: flat views use `hitY` and the on-screen white step; the 3D road uses
   `roadFarZ - near.z` and the white step in road units; the free fields and the staging use their
   own field length. Notes keep their linear time-to-position placement, so every note moves at the
   same metres per second and has the same length in metres. A narrower key range shows bigger keys,
   so the same metres take more pixels: this follows the piano, as requested.
3. **Bounded consumers.** `noteEnergy`, `RoadTrailAnchors` and the trail mesh's world gap read
   `min(lookAhead, 6 s)` so a long window does not change glow or trails. `keyboardPan` already
   reads the trainer's own 2 s snapshot, not the notes' window, and stays as it is. `noteArrival`
   keeps the full window: the birth effect belongs at the horizon. Notes themselves are never
   capped: everything between the horizon and the keys is drawn.
4. **No catch-up at start or seek.** Placement is a pure function of `start - time`; a note's
   appearance age counts from the moment it crosses the horizon (`start - lookAhead`), so after a
   load or seek every note already inside the window is drawn at its place without a birth effect.
5. **Capacity.** The frame fills nearest notes first; a capacity cap only trims the far end.

## Risks / Trade-offs

- [Far horizon puts tens of seconds in view] → nearest-first fill and the capacity cap; measured on
  a dense song.
- [Reference measured on one screen] → the speed is in metres, so it holds on every screen; the
  value (172 mm/s, 7.3 white keys a second) comes from the user's screenshot and is pinned by a
  test, the user confirms it in the browser.
- [Lanes ending at different depths] → the field length is taken at the camera's hit row; contact
  lanes a few centimetres nearer move a few per cent faster on a metres-long field, as before.
