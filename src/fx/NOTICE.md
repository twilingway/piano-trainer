# Effects

The atlases here are baked with Arcadia Effector (MIT, Anton Chuev), the submodule in
`tools/arcadia-effects`. Each effect keeps its source next to its atlas: `piano-hit.json` is the
effect, `piano-hit.webp` its baked frames.

`horizon-explosion.json` is derived from the editor's `library/Explosion.json`: its flash, sparks
and shockwave are neutral white for the note's finger-colour tint; dark smoke is omitted.
`horizon-explosion.webp` is a lossless RGBA atlas: 15 frames of 160×160, 5 columns and 3 rows, 30
FPS over 0.5 seconds, with a centred anchor. The road selects its frame from song time.

`hold-glass.json` is a static Arcadia composition of white glass, bevels and glow. `hold-glass.webp`
is a lossless 96×192 RGBA frame, tinted per note. The retired legacy road used NineSlice borders (32
pixels left/right, 36 top, 38 bottom), shrinking the caps proportionally for short notes. The
original composition and export remain here; the shared native road uses its existing 3D materials.

`note-glass-block.json` is a brighter neutral Arcadia composition for the world-camera notes.
`note-glass-block.webp` is its lossless 96×192 RGBA export from `AFX.Atlas.build`. The renderer
projects a raised nine-slice top and separate front/side faces with the shared camera; all faces use
this material and the finger tint. Its brightness persists for the entire hold.

`note-hold-fire.json` is a looping Arcadia effect with smoke wisps, flame and embers. Its lossless
`note-hold-fire.webp` atlas contains 24 frames of 144×192 pixels over 1.6 seconds. Each duration bar
reuses the atlas, tints the effect to its note and animates it continuously while the bar is
visible. The road projects its fire mesh along the same perspective as the glass on every frame. The
Arcadia source uses radial fading so the exported frames are transparent at the lower edge; the road
keeps the glow close to the glass and stops its short downward tail at the hit line.

To bake again after editing an effect:

1. Copy the JSON into `tools/arcadia-effects/Arcada Effects/library/` and run `node server.mjs`
   there (port 5179).
2. Open `http://localhost:5179/?open=piano-hit.json&fresh=1&tab=atlas`.
3. In the page's console: `AFX.Atlas.build(AFX.state.doc)` returns the atlas canvas and its numbers;
   post `canvas.toDataURL()` to `/api/snap` to save it under `.snap/`.
4. Save the PNG here as lossless WebP, update the numbers in `src/render/FxLayer.ts` or
   `src/render/HorizonBurstLayer.ts` if the frames changed, and remove the copied JSON and `.snap/`
   from the submodule.

## Layered plasma and neutral mist

`plasma-flame.json` is our neutral Arcadia composition of turbulent flame tongues. Its lossless
`plasma-flame.webp` contains 96 RGBA frames of 144×192 pixels in 8 columns and 12 rows, at 24 FPS
over four seconds. Local flames receive the pure note tint. The core and halo use SCREEN blending to
add light without dirty darkening of the duration bars; chord energy is normalized. All previous
strike and horizon flashes remain, drawn above the new plasma. Existing background glitter is
quieter, rather than removed.

`piano-mist.json` is our separate neutral white-grey Arcadia fog made from `softSmokePuff` and
`softCircle`. Its lossless `piano-mist.webp` contains 96 RGBA frames of 192×96 pixels in 8 columns
and 12 rows, at 16 FPS over six seconds. Two overlapping SCREEN layers form an airy upper mist and a
narrower bright base along the keyboard. It has no rainbow tint or note-driven equalizer motion. The
mist is distinct from the local note-coloured flame and has its own atlas frames.

The visible mist sprite does not illuminate geometry by itself. In Three.js one continuous,
shadowless RectAreaLight along the actual keyboard width provides neutral light from the back edge
down and forward across the keys and hands, with a gentle falloff past the middle. It uses Three's
built-in RectAreaLightUniformsLib/LTC addon with the existing standard materials; no dependency is
added. Eight coloured note SpotLights form broad soft cones from sounding notes towards the fingers,
rather than overhead isotropic blobs: at most nine local light sources in addition to the dimmed
ambient scene lighting. Targets belong to their lights, preserving the fixed eight-light group. Mist
baking and musical-sign assets are unchanged.

Local flame release retains the last note tint and uses a slower visual response than attack. It
visibly fades for about two seconds with a small tail up to roughly 4.5 seconds; release immediately
stops new musical-sign emission. Pause freezes the tail; seek and clear remove it at once.

Both loops use the vendored Arcadia engine and the named export `bakePlasmaLoop` from
`src/fxTools/bakePlasmaLoop.ts`, loaded in a browser on the task Vite stand. Load the JSON through
`AFX.Model.loadEffectFile`, then:

- For local plasma call `bakePlasmaLoop(doc, new AFX.Engine())`. After the seam crossfade and edge
  mask, the exporter applies one neutral heat transform: RGB = sqrt(alpha * luminance), and alpha =
  rawAlpha^0.25. It preserves the dark-to-hot gradient rather than repeating opaque passes.
- For mist call `bakePlasmaLoop(doc, new AFX.Engine(), false)`. This disables the heat transform,
  retaining the raw soft alpha and smoke gradient.

The last second crossfades the already-running cycles. Save the returned canvas as PNG, then encode
each atlas losslessly, for example
`ffmpeg -i piano-mist.png -c:v libwebp -lossless 1 piano-mist.webp`. Plain `AFX.Atlas.build` does
not apply this loop crossfade. Check transparency on every frame edge and compare the seam against
ordinary adjacent frames at the actual display scale.

## Rising musical signs

`plasma-note.svg` is our code-native white musical sign ♪ with a soft glow. It is loaded once as a
texture and tinted at runtime; it is not an Arcadia particle atlas and contains no reference-video
imagery. Edit the SVG paths and glow directly, then inspect the rasterized texture in the app.

The fixed pool contains 128 signs, drawn behind all mist, halo and flame layers. An attack emits two
signs; continuous emission grows with elapsed active visual hold time h in seconds: 2 + 4 * (1 -
exp(-h / 2)) signs/second, approaching six. A local visual-delta counter continues while waiting for
the next note, freezes on explicit pause, and resets on release, a new note identity or clear. Song
time is not used as the elapsed hold counter. Written duration d only affects bounded size through
0.85 + 0.5 * (1 - exp(-d / 2)); seeded variation keeps screen sizes within 12–34 pixels.

Each flight lasts 7–11 seconds, with seeded bidirectional orbit and spin, axial turns, smooth
irregular wander, soft birth and firefly-like pulses. Altitude fading begins in the upper quarter
and finishes near the top edge. Full pools skip new signs without truncating existing flights. The
older strike sparks and flashes remain separate effects.

The ten-second source excerpt 00:30–00:40 was viewed in a foreground browser page; reference frames
remain outside git. No music or imagery from the video is included in distributed assets. The editor
retains the MIT attribution above.
