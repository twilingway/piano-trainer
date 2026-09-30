import { Container, Graphics, Text } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import { LOWEST_PITCH } from "./keyboardLayout";

/*
 * Stickers like the ones sold for classroom pianos: the key's number from 1
 * to 88, the note's name in Latin and in solfège, and a tiny staff showing
 * where the note is written. Each is drawn once into a texture; white and
 * black stickers each share one size, so every label of a kind reads alike.
 */

export const WHITE_STICKER = { width: 60, height: 124 } as const;
export const BLACK_STICKER = { width: 44, height: 124 } as const;

/** Rainbow from red C to violet B, the usual sticker colours. */
const STICKER_COLORS = [0xe53935, 0xfb8c00, 0x8bc34a, 0x2e9e4f, 0x2f9be0, 0x2146c7, 0x8e44ad];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SYLLABLES = ["ДО", "РЕ", "МИ", "ФА", "СОЛЬ", "ЛЯ", "СИ"];
/** Pitch class -> index of its white key (black keys use the white key below them). */
const LETTER_OF: readonly number[] = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

const FONT = "system-ui, sans-serif";
const STAFF_SPACING = 6;
/** Y of the bottom staff line inside a sticker. */
const STAFF_BOTTOM = 78;
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

/** Five lines, ledger lines as needed, the notehead with its stem, and a sharp for a black key. */
function miniStaff(pitch: number, width: number, ink: number): Container {
  const group = new Container();
  const lines = new Graphics();
  const left = 4;
  const right = width - 4;
  for (let line = 0; line < 5; line++) {
    const y = STAFF_BOTTOM - line * STAFF_SPACING;
    lines.moveTo(left, y).lineTo(right, y);
  }
  const { position, octaveMark } = placeOnStaff(pitch);
  const noteX = width * 0.58;
  const noteY = STAFF_BOTTOM - (position * STAFF_SPACING) / 2;
  // Ledger lines on every line position between the staff and the note.
  for (let ledger = -2; ledger >= position; ledger -= 2) {
    const y = STAFF_BOTTOM - (ledger * STAFF_SPACING) / 2;
    lines.moveTo(noteX - 7, y).lineTo(noteX + 7, y);
  }
  for (let ledger = 10; ledger <= position; ledger += 2) {
    const y = STAFF_BOTTOM - (ledger * STAFF_SPACING) / 2;
    lines.moveTo(noteX - 7, y).lineTo(noteX + 7, y);
  }
  // Below the middle line the stem goes up on the right, from it and above down on the left.
  const stemUp = position < 4;
  if (stemUp) lines.moveTo(noteX + 3.9, noteY).lineTo(noteX + 3.9, noteY - 19);
  else lines.moveTo(noteX - 3.9, noteY).lineTo(noteX - 3.9, noteY + 19);
  lines.stroke({ width: 1.3, color: ink });
  lines.ellipse(noteX, noteY, 4.3, 3.2).fill({ color: ink });
  group.addChild(lines);

  if (isBlackKey(pitch)) group.addChild(centred(label("♯", ink, 12), noteX - 11, noteY - 8));
  if (octaveMark !== "") {
    const above = octaveMark.endsWith("a");
    const mark = label(octaveMark, ink, 9, false);
    group.addChild(
      centred(mark, width * 0.2, above ? STAFF_BOTTOM - 4 * STAFF_SPACING - 12 : STAFF_BOTTOM + 2)
    );
  }
  return group;
}

function whiteSticker(pitch: number): Container {
  const { width } = WHITE_STICKER;
  const letter = LETTER_OF[pitch % 12] ?? 0;
  const color = STICKER_COLORS[letter] ?? 0x000000;
  const sticker = new Container();
  const number = label(String(keyNumber(pitch)), 0x4a4e55, 13);
  number.x = 1;
  number.y = 0;
  sticker.addChild(
    number,
    centred(label(LETTERS[letter] ?? "", color, 28), width * 0.6, 4),
    miniStaff(pitch, width, 0x1b1d22),
    centred(label(SYLLABLES[letter] ?? "", color, 19), width / 2, 99)
  );
  return sticker;
}

function blackSticker(pitch: number): Container {
  const { width } = BLACK_STICKER;
  const below = LETTER_OF[pitch % 12] ?? 0;
  const ink = 0xeeeeee;
  const sharp = `${SYLLABLES[below] ?? ""}♯`;
  const flat = `${SYLLABLES[below + 1] ?? ""}♭`;
  const sticker = new Container();
  sticker.addChild(
    centred(label(String(keyNumber(pitch)), 0xc4c8d2, 13), width / 2, 0),
    centred(label(flat, ink, 12), width / 2, 18),
    miniStaff(pitch, width, ink),
    centred(label(sharp, ink, 12), width / 2, 100)
  );
  return sticker;
}

/** Draws the sticker for one key into a texture sized WHITE_STICKER or BLACK_STICKER. */
export function bakeKeySticker(renderer: Renderer, pitch: number): Texture {
  const black = isBlackKey(pitch);
  const size = black ? BLACK_STICKER : WHITE_STICKER;
  const content = black ? blackSticker(pitch) : whiteSticker(pitch);
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
