import type { PoseSprite } from "./handSprites";
import fiveUrl from "./hands/five.webp";
import sixthUrl from "./hands/sixth-15.webp";
import seventhUrl from "./hands/seventh-15.webp";
import octaveUrl from "./hands/octave-15.webp";

export interface HandSpriteDefinition extends PoseSprite {
  readonly url: string;
  readonly pixelsPerKey: number;
}

/** Nail-pad centres measured in each original raster, never resized to match another pose. */
export const HAND_SPRITES: readonly HandSpriteDefinition[] = [
  {
    id: "five",
    url: fiveUrl,
    tips: {
      1: { x: 202, y: 437 },
      2: { x: 386, y: 177 },
      3: { x: 503, y: 132 },
      4: { x: 621, y: 177 },
      5: { x: 765, y: 264 }
    },
    pressed: new Set([1, 2, 3, 4, 5]),
    pixelsPerKey: (765 - 386) / 3
  },
  {
    id: "sixth",
    url: sixthUrl,
    tips: {
      1: { x: 169, y: 457 },
      2: { x: 385, y: 176 },
      3: { x: 501, y: 127 },
      4: { x: 618, y: 175 },
      5: { x: 866, y: 310 }
    },
    pressed: new Set([1, 5]),
    pixelsPerKey: (866 - 169) / 5
  },
  {
    id: "seventh",
    url: seventhUrl,
    tips: {
      1: { x: 117, y: 422 },
      2: { x: 386, y: 161 },
      3: { x: 504, y: 108 },
      4: { x: 621, y: 164 },
      5: { x: 940, y: 332 }
    },
    pressed: new Set([1, 5]),
    pixelsPerKey: (940 - 117) / 6
  },
  {
    id: "octave",
    url: octaveUrl,
    tips: {
      1: { x: 331, y: 431 },
      2: { x: 681, y: 170 },
      3: { x: 783, y: 142 },
      4: { x: 884, y: 195 },
      5: { x: 1227, y: 267 }
    },
    pressed: new Set([1, 5]),
    pixelsPerKey: (1227 - 331) / 7
  }
];
