import { Assets, Container, NineSliceSprite, Sprite, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { Finger, Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import type { SongNote } from "../song/song";
import { FINGER_COLOR } from "./fingerColors";
import { HIGHEST_PITCH, LOWEST_PITCH } from "./keyboardLayout";
import type { KeyRect } from "./keyboardLayout";
import { BLACK_STICKER, WHITE_STICKER, bakeKeySticker } from "./keyStickers";
import { bakeKeyTextures } from "./keyTextures";
import type { KeyTextures } from "./keyTextures";
import type { Geometry } from "./viewGeometry";

const HAND_HINT: Readonly<Record<Hand, number>> = { right: 0xbdeefb, left: 0xfbdcc0 };
const PRESSED_COLOR = 0xffd166;
const SOUNDING_COLOR = 0xb8b8ff;
/** How much a held fingered key darkens, so the press stands out from the hint. */
const PRESSED_DARKEN = 0.62;
/** The dark red felt strip over the keys, as on a real piano. */
const FELT = 0x6e1616;
const FELT_EDGE = 0xb33a3a;
/*
 * Key faces painted after the approved mockup (src/render/keys), stretched as
 * nine-slice sprites: corners and the front bevel keep their size, the middle
 * stretches. The "lit" faces are the same keys in neutral grey, for a tint to
 * colour them. Should they fail to load, the faces baked in code stand in.
 */
const PAINTED_FACES = {
  white: new URL("./keys/white.webp", import.meta.url).href,
  whiteLit: new URL("./keys/white-lit.webp", import.meta.url).href,
  black: new URL("./keys/black.webp", import.meta.url).href,
  blackLit: new URL("./keys/black-lit.webp", import.meta.url).href,
  whitePressed: new URL("./keys/white-pressed.webp", import.meta.url).href,
  whitePressedLit: new URL("./keys/white-pressed-lit.webp", import.meta.url).href,
  blackPressed: new URL("./keys/black-pressed.webp", import.meta.url).href,
  blackPressedLit: new URL("./keys/black-pressed-lit.webp", import.meta.url).href
};
const WHITE_SLICE = { leftWidth: 20, topHeight: 60, rightWidth: 20, bottomHeight: 64 };
const BLACK_SLICE = { leftWidth: 16, topHeight: 178, rightWidth: 16, bottomHeight: 76 };

type PaintedFaces = KeyTextures & Readonly<Record<keyof typeof PAINTED_FACES, Texture>>;
const NO_SLICE = { leftWidth: 0, topHeight: 0, rightWidth: 0, bottomHeight: 0 };
/** Largest size of a finger digit on a key. */
const DIGIT_MAX_PX = 26;
/** The finger digit's height on a key without stickers, at most. */
const DIGIT_BARE_PX = 44;

/** What the keys show in a frame: what is held, sounded and owed, and what crosses the hit line. */
export interface KeysFrame {
  readonly pressed: ReadonlySet<number>;
  readonly sounding: ReadonlySet<number>;
  readonly due: readonly SongNote[];
  /** Notes crossing the hit line right now, by pitch. */
  readonly playing: ReadonlyMap<number, SongNote>;
}

/**
 * The keyboard and everything drawn on it: the keys, lit in their finger's
 * colour, the fronts the left hand lights, the felt over them, the classroom
 * stickers and the finger digits. The keys can be played with the mouse.
 */
export class KeyboardLayer {
  /** The keys, the felt, the stickers and the digits, in that order from the back. */
  readonly container = new Container();
  private readonly keyboard = new Container();
  private readonly hints = new Container();
  private readonly stickers = new Container();
  private readonly felt = new Container();
  private readonly keySprites = new Map<number, NineSliceSprite>();
  private readonly keyDigits = new Map<number, Sprite>();
  /** The front part of a key, lit on its own for the left hand. */
  private readonly keyFronts = new Map<number, Sprite>();
  private readonly stickerSprites = new Map<number, Sprite>();
  private keyTextures: KeyTextures | undefined;
  /** The painted key faces once loaded; kept for good, never re-baked. */
  private painted: PaintedFaces | undefined;
  /** The owed chord by pitch, refilled every frame rather than made anew. */
  private readonly dueByPitch = new Map<number, SongNote>();
  /** The key the mouse holds down, if any. */
  private mouseKey: number | undefined;
  /** The front bevel's height on screen, white and black: the finger digit stands above it. */
  private bevel = { white: 3, black: 3 };

  constructor(
    private readonly renderer: Renderer,
    private readonly digitTextures: ReadonlyMap<Finger, Texture>,
    private readonly onKeyPointer: (event: KeyEvent) => void
  ) {
    this.container.addChild(this.keyboard, this.felt, this.stickers, this.hints);
    this.stickers.eventMode = "none";
    this.stickers.visible = false;
    const fronts: Sprite[] = [];
    for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
      const sprite = new NineSliceSprite({ texture: Texture.WHITE, ...NO_SLICE });
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointerdown", () => {
        this.pressWithMouse(pitch);
      });
      // Dragging across the keys with the button held plays each one: a glissando.
      sprite.on("pointerover", (event) => {
        if (this.mouseKey !== undefined && (event.buttons & 1) === 1) this.pressWithMouse(pitch);
      });
      sprite.on("pointerup", () => {
        this.releaseMouse();
      });
      sprite.on("pointerupoutside", () => {
        this.releaseMouse();
      });
      this.keySprites.set(pitch, sprite);
      const digit = new Sprite();
      digit.anchor.set(0.5, 1);
      digit.visible = false;
      this.keyDigits.set(pitch, digit);
      const front = new Sprite(Texture.WHITE);
      front.eventMode = "none";
      front.visible = false;
      this.keyFronts.set(pitch, front);
      // Over the keys, under their stickers and digits: added to the keyboard after the keys.
      fronts.push(front);
      this.hints.addChild(digit);
      const sticker = new Sprite(bakeKeySticker(renderer, pitch));
      sticker.anchor.set(0.5, 1);
      this.stickerSprites.set(pitch, sticker);
      this.stickers.addChild(sticker);
    }
    // White keys first so black keys draw over them.
    const pitches = [...this.keySprites.keys()];
    for (const black of [false, true]) {
      for (const pitch of pitches) {
        const sprite = this.keySprites.get(pitch);
        if (sprite && isBlackKey(pitch) === black) this.keyboard.addChild(sprite);
      }
    }
    for (const front of fronts) this.keyboard.addChild(front);
  }

  /** Loads the painted key faces; without them the baked keys stay. */
  async loadPaintedFaces(): Promise<void> {
    try {
      const names = Object.keys(PAINTED_FACES) as (keyof typeof PAINTED_FACES)[];
      const textures = await Promise.all(
        names.map((name) => Assets.load<Texture>(PAINTED_FACES[name]))
      );
      // Every name has its texture: Promise.all keeps the order of `names`.
      this.painted = Object.fromEntries(
        names.map((name, index) => [name, textures[index]])
      ) as unknown as PaintedFaces;
    } catch (error) {
      console.warn("The painted key faces did not load; using the baked keys", error);
    }
  }

  /** Note names, key numbers and a mini staff on every key, like classroom stickers. */
  showStickers(show: boolean): void {
    this.stickers.visible = show;
  }

  /** Puts the keys, their stickers and the felt `total` pixels wide where `geometry` says. */
  layout(keys: ReadonlyMap<number, KeyRect>, geometry: Geometry, total: number): void {
    const { keyboardTop, keyboardHeight, blackHeight, feltHeight } = geometry;
    const sample = [...keys.values()];
    const white = sample.find((key) => !key.black);
    const black = sample.find((key) => key.black);
    this.bakeKeys(white, black, keyboardHeight, blackHeight);

    // One scale per kind of sticker, so every white label reads at one size and every black one too.
    const whiteWidth = white?.width ?? 0;
    const blackWidth = black?.width ?? 0;
    const digitRoom = Math.min(whiteWidth * 0.9, DIGIT_MAX_PX) + 4;
    // A sticker keeps off a painted key's rounded sides and its front bevel.
    const painted = this.painted;
    const whiteBevel = painted ? (WHITE_SLICE.bottomHeight * whiteWidth) / painted.white.width : 3;
    const blackBevel = painted ? (BLACK_SLICE.bottomHeight * blackWidth) / painted.black.width : 3;
    this.bevel = { white: whiteBevel, black: blackBevel };
    const whiteShare = painted ? 1 - (2 * WHITE_SLICE.leftWidth) / painted.white.width : 0.92;
    const blackShare = painted ? 1 - (2 * BLACK_SLICE.leftWidth) / painted.black.width : 0.92;
    const whiteScale = Math.min(
      (whiteWidth * whiteShare) / WHITE_STICKER.width,
      (keyboardHeight - blackHeight - digitRoom - whiteBevel) / WHITE_STICKER.height
    );
    const blackScale = Math.min(
      (blackWidth * blackShare) / BLACK_STICKER.width,
      (blackHeight - digitRoom - blackBevel) / BLACK_STICKER.height
    );

    for (const [pitch, sprite] of this.keySprites) {
      const key = keys.get(pitch);
      const sticker = this.stickerSprites.get(pitch);
      sprite.visible = key !== undefined;
      if (sticker) sticker.visible = key !== undefined;
      if (!key) continue;
      this.placeKey(
        sprite,
        key.x + (key.black ? 0 : 0.5),
        keyboardTop,
        key.width - (key.black ? 0 : 1),
        key.black ? blackHeight : keyboardHeight
      );
      if (!sticker) continue;
      sticker.scale.set(Math.max(key.black ? blackScale : whiteScale, 0));
      sticker.x = key.x + key.width / 2;
      sticker.y =
        keyboardTop + (key.black ? blackHeight - blackBevel : keyboardHeight - whiteBevel);
    }

    this.felt.removeChildren().forEach((child) => {
      child.destroy();
    });
    const felt = new Sprite(Texture.WHITE);
    felt.tint = FELT;
    felt.y = keyboardTop - feltHeight;
    felt.width = total;
    felt.height = feltHeight;
    const feltEdge = new Sprite(Texture.WHITE);
    feltEdge.tint = FELT_EDGE;
    feltEdge.y = keyboardTop - feltHeight;
    feltEdge.width = total;
    feltEdge.height = 1;
    // The felt throws a thin shadow on the tops of the keys.
    const feltShade = new Sprite(Texture.WHITE);
    feltShade.tint = 0x000000;
    feltShade.alpha = 0.25;
    feltShade.y = keyboardTop;
    feltShade.width = total;
    feltShade.height = 2;
    this.felt.addChild(felt, feltEdge, feltShade);
  }

  /** Lights the keys for this frame: the owed chord, the notes sounding, the keys held. */
  draw(
    frame: KeysFrame,
    keys: ReadonlyMap<number, KeyRect>,
    geometry: Geometry,
    stickers: boolean
  ): void {
    const { keyboardTop, keyboardHeight, blackHeight } = geometry;
    const dueByPitch = this.dueByPitch;
    dueByPitch.clear();
    for (const note of frame.due) dueByPitch.set(note.pitch, note);
    for (const [pitch, sprite] of this.keySprites) {
      const due = dueByPitch.get(pitch);
      // The owed note wins: it is the one the player has to find next.
      const shown = due ?? frame.playing.get(pitch);
      const pressed = frame.pressed.has(pitch);
      // A key with a fingered note is its finger's colour whoever plays it; the press and
      // the program's own colours are for keys without one.
      // Held by the player, a fingered key darkens: the press stands out from the hint.
      const color =
        shown?.finger !== undefined
          ? pressed
            ? darken(FINGER_COLOR[shown.finger], PRESSED_DARKEN)
            : FINGER_COLOR[shown.finger]
          : pressed
            ? PRESSED_COLOR
            : frame.sounding.has(pitch)
              ? SOUNDING_COLOR
              : shown
                ? HAND_HINT[shown.hand]
                : undefined;
      const key = keys.get(pitch);
      // The left hand lights only the key's front part, the right hand all of it: the two
      // hands tell apart where a finger's colour is the same.
      const leftHand = shown?.hand === "left" && shown.finger !== undefined;
      const whole = leftHand ? undefined : color;
      // Held by the player or sounded by the program, a painted key sinks.
      const down = this.painted !== undefined && (pressed || frame.sounding.has(pitch));
      if (key && this.keyTextures) {
        // A coloured key takes its grey face, so the tint shows true; a baked white key has none
        // and is tinted as it is.
        const face = this.faceOf(key.black, whole !== undefined, down);
        if (sprite.texture !== face) sprite.texture = face;
      }
      sprite.tint = whole ?? 0xffffff;
      const front = this.keyFronts.get(pitch);
      if (front) {
        front.visible = leftHand && key !== undefined && color !== undefined;
        if (front.visible && key && color !== undefined) {
          const top = key.black ? keyboardTop + blackHeight * 0.5 : keyboardTop + blackHeight;
          const bottom = keyboardTop + (key.black ? blackHeight - 3 : keyboardHeight - 2);
          front.tint = color;
          front.x = key.x + (key.black ? 2 : 1.5);
          front.width = key.width - (key.black ? 4 : 3);
          front.y = top;
          front.height = Math.max(0, bottom - top);
        }
      }
      const hint = this.keyDigits.get(pitch);
      if (!hint) continue;
      hint.visible = key !== undefined && shown?.finger !== undefined;
      if (!key || shown?.finger === undefined) continue;
      hint.texture = this.digitTextures.get(shown.finger) ?? Texture.EMPTY;
      hint.x = key.x + key.width / 2;
      if (!stickers) {
        // Without stickers the key is free: a large digit, just above the front bevel.
        hint.scale.set(Math.min((key.width * 0.7) / hint.texture.width, DIGIT_BARE_PX / 40));
        const bevel = key.black ? this.bevel.black : this.bevel.white;
        hint.y = keyboardTop + (key.black ? blackHeight : keyboardHeight) - bevel - 4;
      } else {
        hint.scale.set(Math.min(1, (key.width * 0.9) / 40, DIGIT_MAX_PX / 40));
        // The sticker fills the bottom of the key; the finger sits at the top of its free part.
        hint.y = (key.black ? keyboardTop : keyboardTop + blackHeight) + hint.height + 2;
      }
    }
  }

  /** The face for a key: black or white, coloured (grey, to tint) or not, sunk or not. */
  private faceOf(black: boolean, lit: boolean, down: boolean): Texture {
    const painted = this.painted;
    const baked = this.keyTextures;
    if (!painted) {
      if (!baked) return Texture.WHITE;
      return black ? (lit ? baked.blackLit : baked.black) : baked.white;
    }
    if (black) {
      if (down) return lit ? painted.blackPressedLit : painted.blackPressed;
      return lit ? painted.blackLit : painted.black;
    }
    if (down) return lit ? painted.whitePressedLit : painted.whitePressed;
    return lit ? painted.whiteLit : painted.white;
  }

  /**
   * Puts a key on screen. A painted face keeps its corners at the picture's own
   * proportions: it is sized in picture pixels across and scaled to the key.
   */
  private placeKey(sprite: NineSliceSprite, x: number, y: number, width: number, height: number) {
    sprite.x = x;
    sprite.y = y;
    if (!this.painted) {
      sprite.scale.set(1);
      sprite.setSize(width, height);
      return;
    }
    const scale = width / sprite.texture.width;
    sprite.scale.set(scale);
    sprite.setSize(sprite.texture.width, height / scale);
  }

  /** Key faces at this keyboard's size; the old ones are freed once replaced. */
  private bakeKeys(
    white: KeyRect | undefined,
    black: KeyRect | undefined,
    keyboardHeight: number,
    blackHeight: number
  ): void {
    if (this.painted) {
      this.keyTextures = this.painted;
      for (const [pitch, sprite] of this.keySprites) {
        const isBlack = isBlackKey(pitch);
        sprite.texture = isBlack ? this.painted.black : this.painted.white;
        Object.assign(sprite, isBlack ? BLACK_SLICE : WHITE_SLICE);
      }
      return;
    }
    const old = this.keyTextures;
    this.keyTextures = bakeKeyTextures(
      this.renderer,
      { width: (white?.width ?? 10) - 1, height: keyboardHeight },
      { width: black?.width ?? 6, height: blackHeight }
    );
    for (const [pitch, sprite] of this.keySprites) {
      sprite.texture = isBlackKey(pitch) ? this.keyTextures.black : this.keyTextures.white;
    }
    if (old) {
      for (const texture of [old.white, old.black, old.blackLit]) texture.destroy(true);
    }
  }

  /** The key under a point of the keyboard, black keys first: they lie over the white ones. */
  pitchAt(x: number, y: number): number | undefined {
    for (const black of [true, false]) {
      for (const [pitch, sprite] of this.keySprites) {
        if (!sprite.visible || isBlackKey(pitch) !== black) continue;
        // A nine-slice sprite's width and height leave out its scale, which a painted face uses.
        const inside =
          x >= sprite.x &&
          x < sprite.x + sprite.width * sprite.scale.x &&
          y >= sprite.y &&
          y < sprite.y + sprite.height * sprite.scale.y;
        if (inside) return pitch;
      }
    }
    return undefined;
  }

  pressWithMouse(pitch: number): void {
    if (this.mouseKey === pitch) return;
    this.releaseMouse();
    this.mouseKey = pitch;
    this.onKeyPointer({ type: "down", pitch, velocity: 90 });
  }

  releaseMouse(): void {
    if (this.mouseKey === undefined) return;
    this.onKeyPointer({ type: "up", pitch: this.mouseKey, velocity: 0 });
    this.mouseKey = undefined;
  }
}

/** A colour with each channel scaled by `factor`. */
function darken(color: number, factor: number): number {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * factor) << shift;
  return channel(16) | channel(8) | channel(0);
}
