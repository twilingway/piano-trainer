# Effects

The atlases here are baked with Arcadia Effector (MIT, Anton Chuev), the submodule in
`tools/arcadia-effects`. Each effect keeps its source next to its atlas: `piano-hit.json` is the
effect, `piano-hit.webp` its baked frames.

`horizon-explosion.json` is derived from the editor's `library/Explosion.json`: its flash, sparks
and shockwave are neutral white for the note's finger-colour tint; dark smoke is omitted.
`horizon-explosion.webp` is a lossless RGBA atlas: 15 frames of 160×160, 5 columns and 3 rows, 30
FPS over 0.5 seconds, with a centred anchor. The road selects its frame from song time.

`hold-glass.json` is a static Arcadia composition of white glass, bevels and glow. `hold-glass.webp`
is a lossless 96×192 RGBA frame, tinted per note. `RoadGlassLayer.ts` preserves its borders with
NineSlice (32 pixels left/right, 36 top, 38 bottom), shrinking the caps proportionally for short
notes.

`note-glass-block.json` is a brighter neutral Arcadia composition for the world-camera notes.
`note-glass-block.webp` is its lossless 96×192 RGBA export from `AFX.Atlas.build`. The renderer
projects a raised nine-slice top and separate front/side faces with the shared camera; all faces use
this material and the finger tint. Its brightness persists for the entire hold.

`note-hold-fire.json` is a looping Arcadia effect with smoke wisps, flame and embers. Its lossless
`note-hold-fire.webp` atlas contains 24 frames of 144×192 pixels over 1.6 seconds. Each duration bar
reuses the atlas, tints the effect to its note and animates it continuously while the bar is
visible.

To bake again after editing an effect:

1. Copy the JSON into `tools/arcadia-effects/Arcada Effects/library/` and run `node server.mjs`
   there (port 5179).
2. Open `http://localhost:5179/?open=piano-hit.json&fresh=1&tab=atlas`.
3. In the page's console: `AFX.Atlas.build(AFX.state.doc)` returns the atlas canvas and its numbers;
   post `canvas.toDataURL()` to `/api/snap` to save it under `.snap/`.
4. Save the PNG here as lossless WebP, update the numbers in `src/render/FxLayer.ts` or
   `src/render/HorizonBurstLayer.ts` if the frames changed, and remove the copied JSON and `.snap/`
   from the submodule.
