import { Container, Graphics, Text } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import { LOWEST_PITCH } from "./keyboardLayout";

/* Compact note names are baked once, then scaled to the usable key face. */
export const WHITE_STICKER = { width: 60, height: 60 } as const;
export const BLACK_STICKER = { width: 52, height: 60 } as const;

/** Rainbow from red C to violet B, the usual sticker colours. */
const STICKER_COLORS = [0xe53935, 0xfb8c00, 0x8bc34a, 0x2e9e4f, 0x2f9be0, 0x2146c7, 0x8e44ad];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SYLLABLES = ["до", "ре", "ми", "фа", "соль", "ля", "си"];
/** Pitch class -> index of its white key (black keys use the white key below them). */
const LETTER_OF: readonly number[] = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

const FONT = "system-ui, sans-serif";
/** Ledger lines allowed before the note is written an octave away with 8va/8vb. */
const MAX_LEDGERS = 2;
/** Diatonic step of the bottom line: E4 in the treble clef, G2 in the bass clef. */
const TREBLE_BOTTOM = 4 * 7 + 2;
const BASS_BOTTOM = 2 * 7 + 4;

/** Key number on an 88-key piano, A0 = 1. */
export function keyNumber(pitch: number): number {
  return pitch - LOWEST_PITCH + 1;
}

function diatonicStep(pitch: number): number {
  const octave = Math.floor(pitch / 12) - 1;
  return octave * 7 + (LETTER_OF[pitch % 12] ?? 0);
}

export interface Placement {
  /** Staff position counted in half spaces above the bottom line. */
  readonly position: number;
  /** "8va", "8vb", "15ma"… when the note is written away from where it sounds. */
  readonly octaveMark: string;
}

export type Clef = "treble" | "bass";

/**
 * Where a note sits on a staff: in `clef` if given (a hand's own staff),
 * else middle C and above in the treble clef, below it in the bass clef.
 */
export function placeOnStaff(pitch: number, clef?: Clef): Placement {
  const treble = clef === undefined ? pitch >= 60 : clef === "treble";
  let position = diatonicStep(pitch) - (treble ? TREBLE_BOTTOM : BASS_BOTTOM);
  let shifted = 0;
  while (position > 8 + MAX_LEDGERS * 2) {
    position -= 7;
    shifted++;
  }
  while (position < -MAX_LEDGERS * 2) {
    position += 7;
    shifted--;
  }
  const marks: Readonly<Record<number, string>> = {
    1: "8va",
    2: "15ma",
    [-1]: "8vb",
    [-2]: "15mb"
  };
  return { position, octaveMark: marks[shifted] ?? "" };
}

function label(text: string, fill: number, fontSize: number, bold = true): Text {
  return new Text({
    text,
    style: { fontFamily: FONT, fontSize, fontWeight: bold ? "700" : "400", fill },
    resolution: 3
  });
}

function centred(text: Text, centerX: number, top: number): Text {
  text.x = Math.round(centerX - text.width / 2);
  text.y = top;
  return text;
}

function nameSticker(pitch: number): Container {
  const black = isBlackKey(pitch);
  const { width } = black ? BLACK_STICKER : WHITE_STICKER;
  const letter = LETTER_OF[pitch % 12] ?? 0;
  const ink = black ? 0xffffff : (STICKER_COLORS[letter] ?? 0x000000);
  const accidental = black ? "♯" : "";
  const octave = Math.floor(pitch / 12) - 1;
  const main = label(`${LETTERS[letter] ?? ""}${accidental}${String(octave)}`, ink, 28);
  const solfege = label(`${SYLLABLES[letter] ?? ""}${accidental}`, ink, 20);
  // Keep the longest solfege and sharps inside the baked texture.
  for (const text of [main, solfege]) {
    text.scale.set(Math.min(1, (width - 4) / text.width));
  }
  const sticker = new Container();
  sticker.addChild(centred(main, width / 2, 0), centred(solfege, width / 2, 34));
  return sticker;
}

/** Draws the sticker for one key into a texture sized WHITE_STICKER or BLACK_STICKER. */
export function bakeKeySticker(renderer: Renderer, pitch: number): Texture {
  const black = isBlackKey(pitch);
  const size = black ? BLACK_STICKER : WHITE_STICKER;
  const content = nameSticker(pitch);
  // An invisible frame fixes the texture to the sticker size, whatever the content's bounds.
  const frame = new Graphics()
    .rect(0, 0, size.width, size.height)
    .fill({ color: 0x000000, alpha: 0 });
  const root = new Container();
  root.addChild(frame, content);
  const texture = renderer.generateTexture({ target: root, resolution: 3 });
  root.destroy({ children: true });
  return texture;
}
