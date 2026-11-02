## Context

C01 (`separate-camera-controls`, PR #235) split the world and keyboard cameras for every view. The
free camera became a "docked" view: `ThreeStage` renders the world with `FreeSceneCamera`, then the
keys in a second pass under `keyboardCamera`, with effect batches duplicated per owner
(`DockedWorldEffects`), roles on scene groups (`cameraCompositionRole`, `dockedScenePasses`) and a
label pass for the docked road (`DockedRoadLabels`). The compositions `game` and `free` are the
other users of that path. Before C01 the free camera was one camera over one world, the same model
the performance scene still uses ("Free and performance cameras see one world" in `ThreeStage`).

## Goals / Non-Goals

**Goals:** the free camera renders the whole stage with one camera, keys placed in the world frame
as before C01; `game` and `free` compositions and their code paths are gone; the standard view keeps
its separate keyboard camera, road docking and straightening unchanged.

**Non-Goals:** changing `FreeSceneCamera` controls, reset framing, WASD, the performance route, the
standard view's near-quarter bend or straightening.

## Decisions

1. **One camera = the performance model.** In `ThreeStage`, `docked` disappears: `inspecting` is
   `freeEnabled && !performanceEnabled`, `separate` is `!performanceEnabled && !freeEnabled`. Keys
   are placed by `placeStageGroups` in the world frame (it already takes `freeEnabled`), picking
   uses the world camera, the road is not docked, passes are plain depth. Alternative — keep the
   docked path and only feed it the world camera for the keys — keeps the duplicated effects and
   roles alive for nothing.
2. **Delete what only served docked views.** The `game` `FreeSceneCamera`, `DockedWorldEffects`,
   `dockedScenePasses` (and the docked branch of `sceneCameraPasses`), `DockedRoadLabels` if no
   standard caller remains, the `keyboardCamera` argument of `PerformanceWorldStage.update`, and
   `cameraCompositionRole` tags. Each removal is checked with grep for remaining callers; anything
   the standard road still uses (`dockedRoadProjection`, `updateDockedKeyOffsets`) stays.
3. **`CameraComposition` goes away.** `cameraComposition.ts` keeps only the world FOV constants and
   `normalizeWorldFov`; `interactiveWorldCamera(composition, free)` becomes `freeCamera`.
   `setCameraComposition` disappears from `ThreeKeysHost`, `RoadLayer`, `FallingNotesView`,
   `viewSceneCamera`. `useFreeCameraInput` requires visible keys, as before C01 (the lane-only case
   existed for `free`).
4. **Migration in `normalizeStaffPrefs`.** `raw.cameraComposition === "free"` sets `freeCamera` to
   true; other values are ignored; the field is dropped from `StaffPrefs`, so the next write omits
   it. Reading once is enough: after the first save the legacy field is gone.
5. **Settings.** `CameraCompositionSettings` loses the select and becomes the world FOV slider plus
   hints, rendered right under the «Свободная камера» checkbox; disabled unless the free camera is
   on (and during the performance scene). The «Камера клавиатуры» group gets a `disabled` state
   while the free camera is on, with one hint line; values stay untouched. Strings for the
   compositions are deleted; changed hints get EN translations.

## Risks / Trade-offs

- [Docked removal touches the frame loop near the 500-line cap of `ThreeStage`] → the change only
  deletes branches; run the road, dock and effect tests plus a browser check on the task stand.
- [Effects relied on the docked owner for key lift] → with one world camera the shared batches are
  used, as in the performance scene; the browser check covers flame and mist at keys while orbiting.
- [Players who used «Игровой кадр» lose it] → accepted by the user (2026-10-28); they land in the
  standard view with their saved cameras.

## Migration Plan

Single release. Saved `cameraComposition` is read once (free → free camera on) and dropped. Rollback
is a revert; the old build reads missing `cameraComposition` as `standard`.
