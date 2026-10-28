## Context

Every view lays notes out by a fixed look-ahead: `trainerView` gives 2 s to the flat views and
`roadFrameState` replaces it with `roadApproach` (2.22 s straight, 6 s perspective) for the road.
`NotesLayer` and `ThreeRoadFrame` place a note at `hitY - (start - time) * hitY / lookAhead`, and
the 3D road maps that row linearly onto `[near.z, roadFarZ]`. Field length therefore sets the speed:
`roadFarZ` follows the horizon, `hitY` follows the staff and the screen.

## Goals / Non-Goals

**Goals:** one screen speed at the hit line, in on-screen white keys a second, equal to today's 3D
«Прямо» with the staff on; the window follows from field length. **Non-Goals:** music time, grading,
horizon and camera geometry, perspective shrink of far notes.

## Decisions

1. **One screen speed at the hit line.** `NOTE_SPEED_MM / KEYBOARD_WHITE_STEP` (172 / 23.5, about
   7.3) white keys a second, the keys measured as the screen shows them at the hit line. The value
   comes from the user's screenshot of 3D «Прямо» with the staff on and is pinned by a test.
   _Rejected after the first release (PR #253):_ one world speed of 172 mm/s on every road. In
   perspective the same millimetres of depth are foreshortened several times, so notes became short,
   and a far horizon held tens of seconds, so notes crawled for seconds along the far bend of the
   docked road.
2. **Window from the field, measured on screen.** Flat lanes:
   `lookAhead = hitY / (7.3 · whiteWidth)` in pixels. Roads: `screenNoteField` asks
   `RoadLayer.notePlace` (the projection the player sees, docking included) for the screen distance
   per row at the hit line and the on-screen width of a white key there, around the centre of the
   view; the white key in rows is their ratio, and `lookAhead = hitY / (7.3 · whiteKeyInRows)`. Rows
   still map linearly to the road's depth, so deeper notes slow down and shorten by perspective
   alone, and a longer field only shows more notes. `notePlace` never uses the orbit camera, so the
   free camera and the staging keep the standard view's speed while the player turns the camera.
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
- [Reference measured on one screen] → the speed is in on-screen white keys, so it holds on every
  screen size; the value comes from the user's screenshot and is pinned by a test, the user confirms
  it in the browser.
- [Measured at the centre of the view] → keys at the sides of a wide perspective road appear a
  little narrower; their notes share the centre's window, as before.
