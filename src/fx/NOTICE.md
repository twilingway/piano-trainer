# Effects

The atlases here are baked with Arcadia Effector (MIT, Anton Chuev), the submodule in
`tools/arcadia-effects`. Each effect keeps its source next to its atlas: `piano-hit.json` is the
effect, `piano-hit.webp` its baked frames.

To bake again after editing an effect:

1. Copy the JSON into `tools/arcadia-effects/Arcada Effects/library/` and run `node server.mjs`
   there (port 5179).
2. Open `http://localhost:5179/?open=piano-hit.json&fresh=1&tab=atlas`.
3. In the page's console: `AFX.Atlas.build(AFX.state.doc)` returns the atlas canvas and its numbers;
   post `canvas.toDataURL()` to `/api/snap` to save it under `.snap/`.
4. Save the PNG here as lossless WebP, update the numbers in `src/render/BurstLayer.ts` if the
   frames changed, and remove the copied JSON and `.snap/` from the submodule.
