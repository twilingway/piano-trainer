import { CanvasTexture, LinearFilter, LinearSRGBColorSpace } from "three";
import type { CanvasFactory } from "../bakeNoteMaterial";
import { fallingNoteName } from "../bakeLabels";

export interface NativeNoteGlyph {
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
}

export interface NativeNoteLabelAtlas {
  readonly texture: CanvasTexture;
  readonly glyphs: ReadonlyMap<string, NativeNoteGlyph>;
}

export const NATIVE_FINGER_LABELS = ["", "1", "2", "3", "4", "5"] as const;
const CELL_WIDTH = 320;
const CELL_HEIGHT = 128;
const COLUMNS = 4;

/** One CPU bake per owner, including both languages so preference changes never bake text. */
export function bakeNativeNoteLabelAtlas(
  createCanvas: CanvasFactory = (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
): NativeNoteLabelAtlas | undefined {
  try {
    const labels: string[] = NATIVE_FINGER_LABELS.slice(1);
    for (const language of ["ru", "en"] as const)
      for (let pitch = 0; pitch < 12; pitch++) labels.push(fallingNoteName(language, pitch));
    const width = COLUMNS * CELL_WIDTH;
    const height = Math.ceil(labels.length / COLUMNS) * CELL_HEIGHT;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.font = "700 80px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 8;
    context.strokeStyle = "#062133";
    context.fillStyle = "#ffffff";
    const glyphs = new Map<string, NativeNoteGlyph>();
    labels.forEach((label, index) => {
      const x = (index % COLUMNS) * CELL_WIDTH;
      const y = Math.floor(index / COLUMNS) * CELL_HEIGHT;
      const extent = Math.min(CELL_WIDTH - 8, Math.ceil(context.measureText(label).width) + 24);
      context.strokeText(label, x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2);
      context.fillText(label, x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2);
      glyphs.set(label, {
        u: (x + (CELL_WIDTH - extent) / 2) / width,
        v: y / height,
        width: extent / width,
        height: CELL_HEIGHT / height,
        aspect: extent / CELL_HEIGHT
      });
    });
    const texture = new CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = LinearSRGBColorSpace;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    return { texture, glyphs };
  } catch {
    // A missing Canvas2D backend retains the host's existing overlay fallback.
    return undefined;
  }
}
