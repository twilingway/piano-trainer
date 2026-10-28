## Context

`FreeSceneCamera.reset` unions the visible meshes of the subject (keyboard, case, pianist) with
`roadBounds` (structural ends of every free lane, from `prepareFreeRoadBounds`) and `scoreBounds`
(the 3D staff poster, from `StageWorldScore`), then frames that box from `(0.4, 0.55, 1)` with
`boxCameraDistance`. The same box gives `radius`, which sets `near = radius / 200`, the zoom limits,
the WASD step and `far`. A road several metres long moves the target off the piano and pushes the
camera far away.

## Goals / Non-Goals

**Goals:** initial setup and «Вернуться к пианино» frame the instrument; road and poster stay inside
the far plane. **Non-Goals:** the view direction, controls, pose persistence until an explicit
reset, road and poster layout.

## Decisions

1. **Frame the subject only.** `reset` frames the box of the subject's visible meshes. The direction
   and `boxCameraDistance` stay. `radius` (near, zoom limits, WASD step) comes from that box, so the
   near plane follows the instrument size.
2. **Structural bounds feed the far plane.** Road and score boxes are kept in a separate world box;
   `far` covers the farthest of its corners from the camera, in addition to the existing
   `radius * 20` and road-reach terms. Their setters still invalidate without moving the pose.
3. **Zoom-out limit covers the world.** `maxDistance` allows backing off far enough to see the whole
   world box, so the old overview stays reachable with the wheel.

## Risks / Trade-offs

- An empty subject (model not loaded yet) falls back to the existing 400 mm box; once the keyboard
  appears, the usual invalidation reframes it, as today.
