## 1. Bursts on the free field

- [x] 1.1 `ThreeRoadFrame` keeps this frame's free-field bursts: far point, colour, age
- [x] 1.2 `RoadLayer` turns arrivals into bursts at their lane's `freeFar`
- [x] 1.3 `ThreeFreeBursts`: world sprites from the Explosion atlas in the road group, a share of
      the screen at least, drawn over the world score
- [x] 1.4 Tests: burst placement, frame and size; no burst without a free lane

## 2. Verification

- [x] 2.1 `pnpm check` and `pnpm spec:validate`
- [x] 2.2 Browser: the user judges size and brightness on the 5190 stand (task stand: sprites at the
      far point, measured; a flash and a ring seen)
