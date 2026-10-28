## 1. Speed and window

- [ ] 1.1 Measure the reference in the browser (3D «Прямо», staff and notes on): field px / 2.22 s /
      viewport height gives `k`; pin `noteSpeed` with a test
- [ ] 1.2 Flat views: `lookAhead = hitY / noteSpeed` instead of 2 s
- [ ] 1.3 Road: `lookAhead` from the hit-line slope and `roadFarZ - near.z`; replace `roadApproach`
- [ ] 1.4 Bound `keyboardPan`, `noteEnergy`, `noteArrival`, `RoadTrailAnchors` to 6 s; nearest-first
      fill under the note capacity
- [ ] 1.5 Tests: same screen speed and length at the hit line for near and far horizon, staff on and
      off, flat and 3D, straight and perspective

## 2. Verification

- [ ] 2.1 `pnpm check` and `pnpm spec:validate`
- [ ] 2.2 Browser on the task stand: reference view, far horizon and hidden staff show the same note
      speed and length at the keys
