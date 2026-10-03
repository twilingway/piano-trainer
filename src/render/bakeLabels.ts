import { Text } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

import type { Finger } from "../fingering/fingering";

export type FallingNoteNames = "ru" | "en";

/** Names by pitch class, sharps for the black keys: a falling note has no written spelling. */
const FALLING_NAMES: Readonly<Record<FallingNoteNames, readonly string[]>> = {
  ru: ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"],
  en: ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
};

/** The key a note name is baked under: its style and the pitch's class. */
export function nameKey(style: FallingNoteNames, pitch: number): string {
  return `${style}:${String(pitch % 12)}`;
}

/** Every note name of every style, drawn once; look one up with `nameKey`. */
export function bakeNames(renderer: Renderer): Map<string, Texture> {
  const textures = new Map<string, Texture>();
  for (const [style, names] of Object.entries(FALLING_NAMES)) {
    names.forEach((label, pitchClass) => {
      const text = new Text({
        text: label,
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 22,
          fontWeight: "700",
          fill: 0xffffff,
          stroke: { color: 0x00314f, width: 2 },
          dropShadow: { color: 0x00d9ff, blur: 6, distance: 0, alpha: 0.8 }
        },
        resolution: 2
      });
      textures.set(
        `${style}:${String(pitchClass)}`,
        renderer.generateTexture({ target: text, resolution: 3 })
      );
      text.destroy();
    });
  }
  return textures;
}

/** The finger digits 1 to 5 in `fill`, drawn once. */
export function bakeDigits(renderer: Renderer, fill = 0x10121a): Map<Finger, Texture> {
  const textures = new Map<Finger, Texture>();
  for (const finger of [1, 2, 3, 4, 5] as const) {
    const text = new Text({
      text: String(finger),
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 32,
        fontWeight: "700",
        fill,
        ...(fill === 0x10121a
          ? {}
          : {
              stroke: { color: 0x00314f, width: 2 },
              dropShadow: { color: 0x00d9ff, blur: 7, distance: 0, alpha: 0.8 }
            })
      },
      resolution: 2
    });
    textures.set(finger, renderer.generateTexture({ target: text, resolution: 3 }));
    text.destroy();
  }
  return textures;
}
