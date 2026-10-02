import type { ScorePlacement } from "../song/scorePlacement";
import { BlurFilter, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import { placeOnStaff } from "./keyStickers";
import type { Clef } from "./keyStickers";
import type { NoteGlyph } from "./noteGlyph";

/*
 * A falling note's card: a little staff with the note written on it, at its
 * pitch and with its value, the way a score shows it. The face is bright
 * lines on smoked glass, so the road shows through; the frame round it and
 * the glow behind it are white, for a tint to give them the finger's colour.
 */

/** The card's size in its own pixels; the view scales it to the keys. */
export const CARD_WIDTH = 64;
export const CARD_HEIGHT = 84;
const FRAME = 4;
const RADIUS = 10;
const INK = 0xffffff;
const FACE = 0x0b0d14;
const FACE_ALPHA = 0.72;
/** How far the glow reaches past the card, in the card's pixels. */
export const CARD_GLOW = 22;
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

/**
 * The white frame, a ring: tinted to the note's colour round the see-through
 * face. The left hand's card has a second, inner ring, so the two hands tell
 * apart at a glance even where a finger's colour is the same.
 */
export function bakeCardFrame(renderer: Renderer, double = false): Texture {
  const frame = new Graphics();
  const half = FRAME / 2;
  frame
    .roundRect(half, half, CARD_WIDTH - FRAME, CARD_HEIGHT - FRAME, RADIUS - half)
    .stroke({ width: FRAME * 0.6, color: 0xffffff });
  if (double) {
    const inset = FRAME + 3;
    frame
      .roundRect(inset, inset, CARD_WIDTH - inset * 2, CARD_HEIGHT - inset * 2, RADIUS - inset / 2)
      .stroke({ width: 1.6, color: 0xffffff });
  }
  const root = new Container();
  root.addChild(frame);
  return bake(renderer, root);
}

/**
 * A soft white halo the card's shape: rings fading outwards, cheaper than a
 * blur and baked once. Added in the finger's colour behind the card, it glows.
 */
/** The trail tile's side in pixels: one beat of a note's trail on the road. */
export const TRAIL_TILE = 64;

/**
 * One beat of a note's trail on the road, white for a tint to colour: a thin
 * glassy fill, bright edges fading inwards, and a bright bar across its
 * bottom with a soft glow over it. Repeated along the note, it marks every
 * beat of its length.
 */
export function bakeTrailTile(): Texture {
  const size = TRAIL_TILE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  context.fillStyle = "rgba(255, 255, 255, 0.3)";
  context.fillRect(0, 0, size, size);
  const edge = 8;
  for (const [from, to] of [
    [0, edge],
    [size, size - edge]
  ] as const) {
    const gradient = context.createLinearGradient(from, 0, to, 0);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(Math.min(from, to), 0, edge, size);
  }
  const bar = 5;
  const halo = context.createLinearGradient(0, size - bar - 14, 0, size - bar);
  halo.addColorStop(0, "rgba(255, 255, 255, 0)");
  halo.addColorStop(1, "rgba(255, 255, 255, 0.4)");
  context.fillStyle = halo;
  context.fillRect(0, size - bar - 14, size, 14);
  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  context.fillRect(0, size - bar, size, bar);
  return Texture.from(canvas);
}

export function bakeCardGlow(renderer: Renderer): Texture {
  const width = CARD_WIDTH + CARD_GLOW * 2;
  const height = CARD_HEIGHT + CARD_GLOW * 2;
  const glow = canvasSprite(width, height, (context) => {
    context.strokeStyle = "#ffffff";
    context.shadowColor = "#ffffff";
    // A neon tube's light: wide and faint, then tighter and brighter round the line itself.
    for (const [blur, lineWidth, alpha] of [
      [16, 6, 0.55],
      [9, 4, 0.7],
      [4, 3, 0.9]
    ] as const) {
      context.globalAlpha = alpha;
      context.shadowBlur = blur;
      context.lineWidth = lineWidth;
      context.beginPath();
      context.roundRect(CARD_GLOW, CARD_GLOW, CARD_WIDTH, CARD_HEIGHT, RADIUS);
      context.stroke();
    }
  });
  const root = new Container();
  root.addChild(glow);
  return bake(renderer, root);
}

/**
 * A sprite of a canvas drawn in card units: the canvas is the bake's resolution
 * finer, the sprite as much smaller, so baking it keeps every edge sharp.
 */
function canvasSprite(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void
): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * BAKE_RESOLUTION);
  canvas.height = Math.ceil(height * BAKE_RESOLUTION);
  const context = canvas.getContext("2d");
  if (context) {
    context.scale(BAKE_RESOLUTION, BAKE_RESOLUTION);
    draw(context);
  }
  const sprite = new Sprite(Texture.from(canvas));
  sprite.scale.set(1 / BAKE_RESOLUTION);
  return sprite;
}

/**
 * The face: the hand's clef (treble for the right, bass for the left, as the
 * score writes them), staff lines, ledger lines, the note's head, stem,
 * flags and dot, a sharp if black.
 */
export function bakeCardFace(
  renderer: Renderer,
  pitch: number,
  glyph: NoteGlyph,
  clef: Clef,
  placement?: ScorePlacement
): Texture {
  const inner = CARD_WIDTH - FRAME * 2;
  let g = new Graphics();
  g.roundRect(0, 0, inner, CARD_HEIGHT - FRAME * 2, RADIUS - FRAME).fill({
    color: FACE,
    alpha: FACE_ALPHA
  });
  const left = 5;
  const right = inner - 5;
  for (let line = 0; line < 5; line++) {
    const y = STAFF_BOTTOM - line * SPACING;
    g.moveTo(left, y).lineTo(right, y);
  }
  const fallback = placeOnStaff(pitch, clef);
  let position = placement?.position ?? fallback.position;
  let octaveMark = placement ? "" : fallback.octaveMark;
  let octaveShift = 0;
  while (position > 12) {
    position -= 7;
    octaveShift++;
  }
  while (position < -4) {
    position += 7;
    octaveShift--;
  }
  if (octaveShift)
    octaveMark = `${Math.abs(octaveShift) === 1 ? "8" : "15"}${octaveShift > 0 ? "va" : "vb"}`;
  const x = inner * 0.62;
  const y = STAFF_BOTTOM - (position * SPACING) / 2;
  for (let ledger = -2; ledger >= position; ledger -= 2) {
    const ly = STAFF_BOTTOM - (ledger * SPACING) / 2;
    g.moveTo(x - 10, ly).lineTo(x + 10, ly);
  }
  for (let ledger = 10; ledger <= position; ledger += 2) {
    const ly = STAFF_BOTTOM - (ledger * SPACING) / 2;
    g.moveTo(x - 10, ly).lineTo(x + 10, ly);
  }
  // The staff stays in the background: the note on it is what reads first.
  g.stroke({ width: 1.8, color: INK, alpha: 0.42 });

  // The note on its own, so it can glow over the dim staff.
  const staff = g;
  g = new Graphics();
  const headX = 6.8;
  const headY = 4.9;
  const hollow = glyph.kind === "whole" || glyph.kind === "half";
  if (hollow) {
    g.ellipse(x, y, headX, headY).stroke({ width: 2.8, color: INK });
  } else {
    g.ellipse(x, y, headX, headY).fill(INK);
  }
  if (glyph.kind !== "whole") {
    // Below the middle line the stem goes up on the right; from it and above, down on the left.
    const up = position < 4;
    const stemX = up ? x + headX - 0.7 : x - headX + 0.7;
    const stemEnd = up ? y - 26 : y + 26;
    g.moveTo(stemX, y).lineTo(stemX, stemEnd).stroke({ width: 2.4, color: INK });
    const flags = glyph.kind === "eighth" ? 1 : glyph.kind === "sixteenth" ? 2 : 0;
    for (let flag = 0; flag < flags; flag++) {
      const fy = stemEnd + (up ? 1 : -1) * flag * 6;
      g.moveTo(stemX, fy)
        .quadraticCurveTo(stemX + 9, fy + (up ? 7 : -7), stemX + 6, fy + (up ? 14 : -14))
        .stroke({ width: 2.4, color: INK });
    }
  }
  if (glyph.dotted) g.circle(x + headX + 4, y - (position % 2 === 0 ? 2.5 : 0), 2.3).fill(INK);

  const halo = g.clone();
  halo.filters = [new BlurFilter({ strength: 3, quality: 3 })];
  const root = new Container();
  root.addChild(staff, halo, g);
  const top = STAFF_BOTTOM - 4 * SPACING;
  // Align the treble clef's G curl with the second line from the bottom.
  root.addChild(
    clef === "treble"
      ? mark("\u{1D11E}", 38, 2, top - 6.5, CLEF_FONT)
      : mark("\u{1D122}", 26, 3, top - 5, CLEF_FONT)
  );
  const accidental = placement?.accidental ?? (isBlackKey(pitch) ? "♯" : "");
  if (accidental) root.addChild(mark(accidental, 15, x - 17, y - 10));
  if (octaveMark !== "") {
    const above = octaveMark.endsWith("a");
    root.addChild(
      mark(octaveMark, 10, 6, above ? STAFF_BOTTOM - 4 * SPACING - 13 : STAFF_BOTTOM + 3)
    );
  }
  return bake(renderer, root);
}

/** Fonts that carry the musical clef symbols on Windows, macOS and Linux. */
const CLEF_FONT = '"Segoe UI Symbol", "Noto Music", "Apple Symbols", serif';

function mark(
  text: string,
  fontSize: number,
  x: number,
  y: number,
  fontFamily = "system-ui, sans-serif"
): Text {
  const label = new Text({
    text,
    style: { fontFamily, fontSize, fontWeight: "700", fill: INK },
    resolution: BAKE_RESOLUTION
  });
  label.x = x;
  label.y = y;
  return label;
}

/** Where the face sits on its frame. */
export const CARD_FACE_OFFSET = FRAME;
