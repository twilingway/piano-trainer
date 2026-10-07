# Tasks

## 1. Setup

- [x] 1.1 Add `three` and `@types/three` and verify `pnpm install` succeeds

## 2. Camera

- [x] 2.1 Expose the projection parameters from `worldCamera` and verify the existing camera tests
      still pass
- [x] 2.2 Build three's view and projection matrices in `src/render/three/threeCamera.ts` and verify
      `threeCamera.test.ts`: projected points match `worldCamera.project` within 0.5 px over
      pitches, fovs, scales, vertical shifts and key offsets

## 3. Setting

- [x] 3.1 Add the `3d` key style, the «3D (с дорогой)» option and its English text; choosing it
      turns the road on and shows the camera settings; verify with settings tests that it survives a
      reload and that the option opens the camera settings

## 4. Rendering

- [x] 4.1 Lay the keys out as boxes in `src/render/three/keyBoxes.ts` and verify with a test that
      every top face's corners match `keySurface(...).top` through the three camera
- [x] 4.2 Draw the frame in three passes in one WebGL context (`ThreeStage`), lazy-loaded and
      falling back to the Pixi perspective; verify `pnpm build` puts three in its own chunk and the
      3D keys show on the dev server
- [x] 4.3 Materials, light, the top faces from `keysTexture` and pressed keys dipping; verify on the
      dev server: colours, stickers, presses by mouse and MIDI, pan, key offset, camera sliders,
      switching styles mid-song, 360×640

## 5. Integration

- [x] 5.1 `pnpm check` and `pnpm spec:validate` pass
