/** The subset of an Arcadia document needed by the transparent loop exporter. */
export interface PlasmaLoopDocument {
  readonly comp: { readonly w: number; readonly h: number };
  readonly exp: {
    readonly cols: number;
    readonly rows: number;
    readonly frames: number;
    readonly cellW: number;
    readonly cellH: number;
    readonly t0: number;
    readonly t1: number;
  };
}

export interface ArcadiaEngine {
  render(doc: PlasmaLoopDocument, time: number, context: CanvasRenderingContext2D): void;
}

/** Crossfade the warm, already-running previous cycle into the final second of this one. */
export function plasmaLoopSamples(phase: number, duration: number, crossfade: number) {
  const time = ((phase % duration) + duration) % duration;
  const blend = Math.max(0, Math.min(1, (time - duration + crossfade) / crossfade));
  return {
    outgoing: duration + time,
    incoming: time,
    blend: blend * blend * (3 - 2 * blend)
  };
}

/**
 * Run in a browser with the vendored Arcadia engine, using the same neutral source JSON.
 * Additive premultiplied blending preserves energy and transparency through the loop seam.
 */
export function bakePlasmaLoop(
  doc: PlasmaLoopDocument,
  engine: ArcadiaEngine,
  heatGradient = true
) {
  const { exp, comp } = doc;
  const duration = exp.t1 - exp.t0;
  const create = (width: number, height: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas is required to bake the plasma atlas.");
    return { canvas, context };
  };
  const atlas = create(exp.cellW * exp.cols, exp.cellH * exp.rows);
  const outgoing = create(comp.w, comp.h);
  const incoming = create(comp.w, comp.h);
  const frame = create(comp.w, comp.h);
  const mask = create(comp.w, comp.h);
  const across = mask.context.createLinearGradient(0, 0, comp.w, 0);
  across.addColorStop(0, "transparent");
  across.addColorStop(0.08, "white");
  across.addColorStop(0.92, "white");
  across.addColorStop(1, "transparent");
  mask.context.fillStyle = across;
  mask.context.fillRect(0, 0, comp.w, comp.h);
  const vertical = mask.context.createLinearGradient(0, 0, 0, comp.h);
  vertical.addColorStop(0, "transparent");
  vertical.addColorStop(0.06, "white");
  vertical.addColorStop(0.84, "white");
  vertical.addColorStop(1, "transparent");
  mask.context.globalCompositeOperation = "destination-in";
  mask.context.fillStyle = vertical;
  mask.context.fillRect(0, 0, comp.w, comp.h);
  for (let index = 0; index < exp.frames; index++) {
    const phase = ((index + 0.5) / exp.frames) * duration;
    const sample = plasmaLoopSamples(phase, duration, 1);
    engine.render(doc, exp.t0 + sample.outgoing - duration, outgoing.context);
    frame.context.clearRect(0, 0, comp.w, comp.h);
    frame.context.globalCompositeOperation = "source-over";
    frame.context.globalAlpha = 1 - sample.blend;
    frame.context.drawImage(outgoing.canvas, 0, 0);
    if (sample.blend > 0) {
      engine.render(doc, exp.t0 + sample.incoming - duration, incoming.context);
      frame.context.globalCompositeOperation = "lighter";
      frame.context.globalAlpha = sample.blend;
      frame.context.drawImage(incoming.canvas, 0, 0);
    }
    frame.context.globalCompositeOperation = "destination-in";
    frame.context.globalAlpha = 1;
    frame.context.drawImage(mask.canvas, 0, 0);
    frame.context.clearRect(0, 0, 1, comp.h);
    frame.context.clearRect(comp.w - 1, 0, 1, comp.h);
    frame.context.clearRect(0, 0, comp.w, 1);
    frame.context.clearRect(0, comp.h - 1, comp.w, 1);
    // Preserve turbulent heat in RGB instead of flattening it with repeated opaque layers.
    // Alpha lifts thin tongues; the neutral heat gradient becomes the note's dark-to-hot hue.
    if (heatGradient) {
      const pixels = frame.context.getImageData(0, 0, comp.w, comp.h);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const alpha = (pixels.data[offset + 3] ?? 0) / 255;
        const luminance =
          ((pixels.data[offset] ?? 0) +
            (pixels.data[offset + 1] ?? 0) +
            (pixels.data[offset + 2] ?? 0)) /
          765;
        const heat = Math.sqrt(alpha * luminance);
        const light = Math.round(255 * heat);
        pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = light;
        pixels.data[offset + 3] = Math.round(255 * alpha ** 0.25);
      }
      frame.context.putImageData(pixels, 0, 0);
    }
    atlas.context.drawImage(
      frame.canvas,
      (index % exp.cols) * exp.cellW,
      Math.floor(index / exp.cols) * exp.cellH,
      exp.cellW,
      exp.cellH
    );
  }
  return atlas.canvas;
}
