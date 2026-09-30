import { Container, Graphics, Text } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import { placeOnStaff } from "./keyStickers";
import type { NoteGlyph } from "./noteGlyph";

/*
 * A falling note's card: a little staff with the note written on it, at its
 * pitch and with its value, the way a score shows it. The face is drawn in
 * ink on ivory; the frame around it is white, for a tint to give it the
 * finger's colour.
 */

/** The card's size in its own pixels; the view scales it to the keys. */
export const CARD_WIDTH = 64;
export const CARD_HEIGHT = 84;
const FRAME = 4;
const RADIUS = 10;
const INK = 0x16181f;
const FACE = 0xfbf8ee;
const SPACING = 8;
/** Y of the bottom staff line on the card. */
const STAFF_BOTTOM = 56;
const BAKE_RESOLUTION = 3;

function bake(renderer: Renderer, root: Container): Texture {
  const texture = renderer.generateTexture({
    target: root,
    resolution: BAKE_RESOLUTION,
    antialias: true
  });
  root.destroy({ children: true, context: true });
  return texture;
}

/** The white frame: tinted to the note's colour under the face. */
export function bakeCardFrame(renderer: Renderer): Texture {
  const frame = new Graphics();
  frame.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS).fill(0xffffff);
  const root = new Container();
  root.addChild(frame);
  return bake(renderer, root);
}

/** The face: staff lines, ledger lines, the note's head, stem, flags and dot, a sharp if black. */
export function bakeCardFace(renderer: Renderer, pitch: number, glyph: NoteGlyph): Texture {
  const inner = CARD_WIDTH - FRAME * 2;
  const g = new Graphics();
  g.roundRect(0, 0, inner, CARD_HEIGHT - FRAME * 2, RADIUS - FRAME).fill(FACE);
  const left = 5;
  const right = inner - 5;
  for (let line = 0; line < 5; line++) {
    const y = STAFF_BOTTOM - line * SPACING;
    g.moveTo(left, y).lineTo(right, y);
  }
  const { position, octaveMark } = placeOnStaff(pitch);
  const x = inner * 0.56;
  const y = STAFF_BOTTOM - (position * SPACING) / 2;
  for (let ledger = -2; ledger >= position; ledger -= 2) {
    const ly = STAFF_BOTTOM - (ledger * SPACING) / 2;
    g.moveTo(x - 10, ly).lineTo(x + 10, ly);
  }
  for (let ledger = 10; ledger <= position; ledger += 2) {
    const ly = STAFF_BOTTOM - (ledger * SPACING) / 2;
    g.moveTo(x - 10, ly).lineTo(x + 10, ly);
  }
  g.stroke({ width: 1.4, color: INK });

  const headX = 5.8;
  const headY = 4.2;
  const hollow = glyph.kind === "whole" || glyph.kind === "half";
  if (hollow) {
    g.ellipse(x, y, headX, headY).stroke({ width: 2.2, color: INK });
  } else {
    g.ellipse(x, y, headX, headY).fill(INK);
  }
  if (glyph.kind !== "whole") {
    // Below the middle line the stem goes up on the right; from it and above, down on the left.
    const up = position < 4;
    const stemX = up ? x + headX - 0.7 : x - headX + 0.7;
    const stemEnd = up ? y - 26 : y + 26;
    g.moveTo(stemX, y).lineTo(stemX, stemEnd).stroke({ width: 1.6, color: INK });
    const flags = glyph.kind === "eighth" ? 1 : glyph.kind === "sixteenth" ? 2 : 0;
    for (let flag = 0; flag < flags; flag++) {
      const fy = stemEnd + (up ? 1 : -1) * flag * 6;
      g.moveTo(stemX, fy)
        .quadraticCurveTo(stemX + 9, fy + (up ? 7 : -7), stemX + 6, fy + (up ? 14 : -14))
        .stroke({ width: 1.8, color: INK });
    }
  }
  if (glyph.dotted) g.circle(x + headX + 4, y - (position % 2 === 0 ? 2.5 : 0), 1.8).fill(INK);

  const root = new Container();
  root.addChild(g);
  if (isBlackKey(pitch)) root.addChild(mark("♯", 15, x - 17, y - 10));
  if (octaveMark !== "") {
    const above = octaveMark.endsWith("a");
    root.addChild(
      mark(octaveMark, 10, 6, above ? STAFF_BOTTOM - 4 * SPACING - 13 : STAFF_BOTTOM + 3)
    );
  }
  return bake(renderer, root);
}

function mark(text: string, fontSize: number, x: number, y: number): Text {
  const label = new Text({
    text,
    style: { fontFamily: "system-ui, sans-serif", fontSize, fontWeight: "700", fill: INK },
    resolution: BAKE_RESOLUTION
  });
  label.x = x;
  label.y = y;
  return label;
}

/** Where the face sits on its frame. */
export const CARD_FACE_OFFSET = FRAME;
