## 1. Speed and window

- [x] 1.1 Reference from the user's screenshot (3D «Прямо», staff and notes on): about 7.3 white-key
      steps per second, `NOTE_SPEED_MM` = 172, pinned by a test; the browser check is 2.2
- [x] 1.2 Flat views: `lookAhead` from `hitY` and the on-screen white step instead of 2 s
- [x] 1.3 Road, free fields, staging: `lookAhead` from road length and the white step in road units;
      replace `roadApproach`
- [x] 1.4 Bound `noteEnergy`, `RoadTrailAnchors` and the trail gap to 6 s; nearest-first fill under
      the note capacity (notes are added in start order)
- [x] 1.5 Tests: same white steps per second and note length in steps for near and far horizon,
      staff on and off, flat and 3D, straight and perspective
- [x] 1.6 Start and seek: notes inside the window drawn at their places on the first frame, no birth
      effect or catch-up; test with a seek into the middle of a song

## 2. Verification

- [ ] 2.1 `pnpm check` and `pnpm spec:validate`
- [ ] 2.2 Browser on the task stand: reference view, far horizon and hidden staff show the same note
      speed and length in white-key steps

## 3. Screen speed at the hit line (after PR #253)

- [x] 3.1 Replace the world speed on roads with the on-screen speed at the hit line
      (`screenNoteField` over `RoadLayer.notePlace`); flat lanes unchanged
- [x] 3.2 Tests: the same on-screen white keys a second at the hit line for roads that squeeze depth
      or widen keys; spec, proposal and design updated
