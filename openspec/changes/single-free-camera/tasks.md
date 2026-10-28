## 1. Render: one free camera

- [ ] 1.1 `ThreeStage`: drop `docked`; free camera = one world camera (`inspecting` and `separate`
      as in design), plain-depth passes, picking through the world camera; remove the `game` camera
- [ ] 1.2 Remove the docked-only path: `DockedWorldEffects`, `dockedScenePasses`, docked branch of
      `sceneCameraPasses`, `DockedRoadLabels` if unused, `keyboardCamera` of
      `PerformanceWorldStage.update`, `cameraCompositionRole`; grep for leftovers
- [ ] 1.3 Remove `setCameraComposition` from `ThreeKeysHost`, `RoadLayer`, `FallingNotesView`,
      `viewSceneCamera`; `CameraComposition` and `interactiveWorldCamera` go away
- [ ] 1.4 Tests: free camera renders keys with the world camera (one pass), standard keeps two
      cameras; update or delete tests of removed modules

## 2. Preferences and settings

- [ ] 2.1 `staffPreferences`: drop `cameraComposition`; migrate `"free"` → `freeCamera: true`; test
      free / game / unknown / missing and that the written prefs have no `cameraComposition`
- [ ] 2.2 `useFallingView`, `useFreeCameraInput`, `useKeyboardSettings`,
      `ConnectedKeyboardSettings`: remove composition wiring
- [ ] 2.3 Settings: no «Композиция 3D»; world FOV right under «Свободная камера», enabled only with
      it; «Камера клавиатуры» disabled with a hint while the free camera is on; hints no longer name
      the compositions; RU/EN strings; tests in `KeyboardSettings.test.tsx`

## 3. Verification

- [ ] 3.1 `pnpm check` and `pnpm spec:validate`
- [ ] 3.2 Grep: no `CameraComposition`, `"game"` composition, «Игровой кадр», «Свободный мир с
      клавиатурой», «Композиция 3D» in `src`
- [ ] 3.3 Browser on the task stand (5191): free camera orbits piano + stage + notes together,
      effects at keys, keyboard group disabled; standard view and its straightening unchanged;
      320×568 settings without overflow
