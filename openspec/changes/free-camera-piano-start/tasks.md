## 1. Camera

- [x] 1.1 `FreeSceneCamera.reset` frames only the subject's visible meshes; road and score bounds go
      to a separate world box used for `far` and the zoom-out limit
- [x] 1.2 Tests: reset with a long road and a high poster keeps the instrument filling the frame,
      the road far end and the poster stay inside the far plane, and the manual pose still survives
      bounds updates until an explicit reset

## 2. Verification

- [x] 2.1 `pnpm check` and `pnpm spec:validate`
