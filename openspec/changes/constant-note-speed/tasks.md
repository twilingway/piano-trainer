## 1. Speed and window

- [ ] 1.1 Measure the reference in the browser (3D «Прямо», staff and notes on): road length / 2.22
      s in white-key steps times 23.5 mm gives `NOTE_SPEED_MM`; pin it with a test
- [ ] 1.2 Flat views: `lookAhead` from `hitY` and the on-screen white step instead of 2 s
- [ ] 1.3 Road, free fields, staging: `lookAhead` from road length and the white step in road units;
      replace `roadApproach`
- [ ] 1.4 Bound `keyboardPan`, `noteEnergy`, `noteArrival`, `RoadTrailAnchors` to 6 s; nearest-first
      fill under the note capacity
- [ ] 1.5 Tests: same white steps per second and note length in steps for near and far horizon,
      staff on and off, flat and 3D, straight and perspective
- [ ] 1.6 Start and seek: notes inside the window drawn at their places on the first frame, no birth
      effect or catch-up; test with a seek into the middle of a song

## 2. Verification

- [ ] 2.1 `pnpm check` and `pnpm spec:validate`
- [ ] 2.2 Browser on the task stand: reference view, far horizon and hidden staff show the same note
      speed and length in white-key steps
