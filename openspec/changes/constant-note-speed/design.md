## Context

Every view lays notes out by a fixed look-ahead: `trainerView` gives 2 s to the flat views and
`roadFrameState` replaces it with `roadApproach` (2.22 s straight, 6 s perspective) for the road.
`NotesLayer` and `ThreeRoadFrame` place a note at `hitY - (start - time) * hitY / lookAhead`, and
the 3D road maps that row linearly onto `[near.z, roadFarZ]`. Field length therefore sets the speed:
`roadFarZ` follows the horizon, `hitY` follows the staff and the screen.

## Goals / Non-Goals

**Goals:** one screen speed at the hit line, equal to today's 3D «Прямо» with the staff on; the
window follows from field length. **Non-Goals:** music time, grading, horizon and camera geometry,
perspective shrink of far notes.

## Decisions

1. **Speed in viewport heights per second.** `noteSpeed = k * viewportHeight` px/s. `k` is
   calibrated from the reference: field height of 3D «Прямо» with the staff on, divided by 2.22 s,
   divided by the viewport height (the user's screenshot gives a field of about 0.51 of the window,
   so k is about 0.23). Measured once in the browser on the reference layout and pinned by a test.
   Alternative: recompute a hypothetical staff-on field every frame, which couples the road to the
   staff layout.
2. **Window from the hit-line slope.** For any projection, `lookAhead = fieldLength / speedAtHit` in
   the road's own units. Flat views: `hitY / noteSpeed`. The 3D road projects two rows next to the
   hit line, takes `dScreenY/dz`, gets the world speed `V = noteSpeed / (dScreenY/dz)` and
   `lookAhead = (roadFarZ - near.z) / V`. Notes keep their linear time-to-z placement, so a note
   keeps a constant world speed and the same screen speed and length at the keys. The free camera
   and the staging use the keyboard-camera slope of the same road.
3. **Bounded consumers.** `keyboardPan`, `noteEnergy`, `noteArrival` and `RoadTrailAnchors` read
   `min(lookAhead, 6 s)` so a long window does not change panning, glow or trails.
4. **Capacity.** The frame fills nearest notes first; a capacity cap only trims the far end.

## Risks / Trade-offs

- [Far horizon puts tens of seconds in view] → nearest-first fill and the capacity cap; measured on
  a dense song.
- [k measured on one screen] → viewport-relative speed keeps proportions on other screens; phones
  cover the same share of the window per second.
