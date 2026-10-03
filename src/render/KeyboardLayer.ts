import { Assets, Container, NineSliceSprite, Sprite, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { Finger, Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import type { SongNote } from "../song/song";
import { FINGER_COLOR } from "./fingerColors";
import { keyHintNote } from "./keyFeedback";
import { HIGHEST_PITCH, LOWEST_PITCH } from "./keyboardLayout";
import { KEY_LIGHT_PAD, bakeKeyLight, keyShape, shapeId } from "./keyLightShapes";
import type { KeyRect } from "./keyboardLayout";
import { BLACK_STICKER, WHITE_STICKER, bakeKeySticker } from "./keyStickers";
import { bakeKeyTextures } from "./keyTextures";
import type { KeyTextures } from "./keyTextures";
import type { Geometry } from "./viewGeometry";

const HAND_HINT: Readonly<Record<Hand, number>> = {
  right: FINGER_COLOR[3],
  left: FINGER_COLOR[4]
};
const PRESSED_COLOR = FINGER_COLOR[2];
const SOUNDING_COLOR = FINGER_COLOR[1];
/*
 * A key keeps its own face and its colour is a light laid over it, the key's
 * own shape with a neon edge: faint while the key waits to be played, full
 * once it sounds. On a black key the light is added, so it glows.
 */
const LIGHT_WAITING = { white: 0.7, black: 0.85 } as const;
const LIGHT_SOUNDING = { white: 1, black: 1 } as const;
/** Deep-blue felt capped by the neon hit line. */
const FELT = 0x003b62;
const FELT_EDGE = 0x00e5ff;
/*
 * Key faces painted after the approved mockup, stretched as nine-slice
 * sprites: corners and the front bevel keep their size, the middle stretches.
 * The "lit" faces are the same keys in neutral grey, for a tint to colour
 * them. Should they fail to load, the faces baked in code stand in.
 *
 * Two styles: "classic" (src/render/keys) and "arcade" (src/render/keys-arcade),
 * thicker pseudo-3D keys over a lacquered rail.
 */
export type KeyStyle = "classic" | "arcade" | "perspective";

type FaceName =
  | "white"
  | "whiteLit"
  | "black"
  | "blackLit"
  | "whitePressed"
  | "whitePressedLit"
  | "blackPressed"
  | "blackPressedLit";

interface Slice {
  readonly leftWidth: number;
  readonly topHeight: number;
  readonly rightWidth: number;
  readonly bottomHeight: number;
}

interface StyleSet {
  readonly faces: Readonly<Record<FaceName, string>>;
  readonly white: Slice;
  readonly black: Slice;
  /** The lacquered rail under the keys, for a style that has one. */
  readonly rail?: string;
}

const KEY_STYLES: Readonly<Record<Exclude<KeyStyle, "perspective">, StyleSet>> = {
  classic: {
    faces: {
      white: new URL("./keys/white.webp", import.meta.url).href,
      whiteLit: new URL("./keys/white-lit.webp", import.meta.url).href,
      black: new URL("./keys/black.webp", import.meta.url).href,
      blackLit: new URL("./keys/black-lit.webp", import.meta.url).href,
      whitePressed: new URL("./keys/white-pressed.webp", import.meta.url).href,
      whitePressedLit: new URL("./keys/white-pressed-lit.webp", import.meta.url).href,
      blackPressed: new URL("./keys/black-pressed.webp", import.meta.url).href,
      blackPressedLit: new URL("./keys/black-pressed-lit.webp", import.meta.url).href
    },
    white: { leftWidth: 12, topHeight: 60, rightWidth: 14, bottomHeight: 64 },
    black: { leftWidth: 16, topHeight: 178, rightWidth: 16, bottomHeight: 76 }
  },
  arcade: {
    faces: {
      white: new URL("./keys-arcade/white.webp", import.meta.url).href,
      whiteLit: new URL("./keys-arcade/white-lit.webp", import.meta.url).href,
      black: new URL("./keys-arcade/black.webp", import.meta.url).href,
      blackLit: new URL("./keys-arcade/black-lit.webp", import.meta.url).href,
      whitePressed: new URL("./keys-arcade/white-pressed.webp", import.meta.url).href,
      whitePressedLit: new URL("./keys-arcade/white-pressed-lit.webp", import.meta.url).href,
      blackPressed: new URL("./keys-arcade/black-pressed.webp", import.meta.url).href,
      blackPressedLit: new URL("./keys-arcade/black-pressed-lit.webp", import.meta.url).href
    },
    // The pressed faces share the up faces' slices: their sunk bevel sits inside the bottom band.
    white: { leftWidth: 20, topHeight: 50, rightWidth: 20, bottomHeight: 146 },
    black: { leftWidth: 26, topHeight: 38, rightWidth: 22, bottomHeight: 91 },
    rail: new URL("./keys-arcade/case-rail.webp", import.meta.url).href
  }
};
/** The case's rail under the keys, in white-key widths. */
const RAIL_PER_WIDTH = 0.2;

type PaintedFaces = KeyTextures & Readonly<Record<FaceName, Texture>>;
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
  readonly hints?: boolean;
}

/**
 * The keyboard and everything drawn on it: the keys with their finger's
 * colour as a light over them, the felt over them, the classroom
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
  /** The light over each key, in its note's colour; a white key's under the black keys. */
  private readonly keyFronts = new Map<number, Sprite>();
  private readonly stickerSprites = new Map<number, Sprite>();
  private keyTextures: KeyTextures | undefined;
  /** The painted key faces once loaded; kept for good, never re-baked. */
  private painted: PaintedFaces | undefined;
  /** The style the painted faces are of. */
  private style: Exclude<KeyStyle, "perspective"> = "classic";
  /** The rail under the keys, for a style that has one. */
  private railTexture: Texture | undefined;
  private readonly rail = new Sprite();
  /** The owed chord by pitch, refilled every frame rather than made anew. */
  private readonly dueByPitch = new Map<number, SongNote>();
  /** Each key's light, baked for its shape at the last layout; keys of one shape share one. */
  private readonly lightOf = new Map<number, Texture>();
  private lightTextures = new Map<string, Texture>();
  /** The key the mouse holds down, if any. */
  private mouseKey: number | undefined;
  /** The front bevel's height on screen, white and black: the finger digit stands above it. */
  private bevel = { white: 3, black: 3 };

  constructor(
    private readonly renderer: Renderer,
    private readonly digitTextures: ReadonlyMap<Finger, Texture>,
    private readonly onKeyPointer: (event: KeyEvent) => void
  ) {
    this.container.addChild(this.keyboard, this.rail, this.felt, this.stickers, this.hints);
    this.rail.eventMode = "none";
    this.rail.visible = false;
    this.stickers.eventMode = "none";
    this.stickers.visible = false;
    for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
      const sprite = new NineSliceSprite({ texture: Texture.WHITE, ...NO_SLICE });
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointerdown", () => {
        this.pressWithMouse(pitch);
      });
      // Dragging across the keys with the button held plays each one: a glissando.
      sprite.on("pointerover", (event) => {
        if (
          this.mouseKey !== undefined &&
          (event.buttons & 1) === 1 &&
          document.elementFromPoint(event.clientX, event.clientY) === this.renderer.canvas
        )
          this.pressWithMouse(pitch);
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
      const front = new Sprite();
      front.eventMode = "none";
      front.visible = false;
      this.keyFronts.set(pitch, front);
      this.hints.addChild(digit);
      const sticker = new Sprite(bakeKeySticker(renderer, pitch));
      sticker.anchor.set(0.5, 1);
      this.stickerSprites.set(pitch, sticker);
      this.stickers.addChild(sticker);
    }
    // White keys and their lights first, so black keys and theirs draw over them.
    const pitches = [...this.keySprites.keys()];
    for (const black of [false, true]) {
      for (const layer of [this.keySprites, this.keyFronts]) {
        for (const pitch of pitches) {
          const sprite = layer.get(pitch);
          if (sprite && isBlackKey(pitch) === black) this.keyboard.addChild(sprite);
        }
      }
    }
  }

  /**
   * Loads the painted key faces of `style`; without them the keys stay as they
   * were. The faces take effect on the next layout. Assets caches every load.
   */
  async loadPaintedFaces(style: KeyStyle): Promise<void> {
    const paintedStyle = style === "perspective" ? "classic" : style;
    const set = KEY_STYLES[paintedStyle];
    try {
      const names = Object.keys(set.faces) as FaceName[];
      const textures = await Promise.all(
        names.map((name) => Assets.load<Texture>(set.faces[name]))
      );
      const rail = set.rail ? await Assets.load<Texture>(set.rail) : undefined;
      // Every name has its texture: Promise.all keeps the order of `names`.
      this.painted = Object.fromEntries(
        names.map((name, index) => [name, textures[index]])
      ) as unknown as PaintedFaces;
      this.railTexture = rail;
      this.style = paintedStyle;
    } catch (error) {
      console.warn("The painted key faces did not load; keeping the keys as they are", error);
    }
  }

  /** The red felt over the keys; on the road a glowing hit line takes its place. */
  showFelt(show: boolean): void {
    this.felt.visible = show;
  }

  /** Compact Latin and solfege note names on every key. */
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
    this.bakeLights(keys, keyboardHeight, blackHeight);

    // One scale per kind of sticker, so every white label reads at one size and every black one too.
    const whiteWidth = white?.width ?? 0;
    const blackWidth = black?.width ?? 0;
    const digitRoom = Math.min(whiteWidth * 0.9, DIGIT_MAX_PX) + 4;
    // A sticker keeps off a painted key's rounded sides and its front bevel.
    const painted = this.painted;
    const { white: WHITE_SLICE, black: BLACK_SLICE } = KEY_STYLES[this.style];
    const whiteBevel = painted ? (WHITE_SLICE.bottomHeight * whiteWidth) / painted.white.width : 3;
    const blackBevel = painted ? (BLACK_SLICE.bottomHeight * blackWidth) / painted.black.width : 3;
    this.bevel = { white: whiteBevel, black: blackBevel };
    // Nine-slice border bands include broad flat areas, especially on arcade keys.
    // Only reserve the narrow visible rim, rather than shrinking to their centre slice.
    const whiteLabelWidth = Math.max(0, whiteWidth - Math.max(4, whiteWidth * 0.12));
    const blackLabelWidth = Math.max(0, blackWidth - Math.max(3, blackWidth * 0.14));
    const whiteScale = Math.min(
      whiteLabelWidth / WHITE_STICKER.width,
      (keyboardHeight - blackHeight - digitRoom - whiteBevel) / WHITE_STICKER.height
    );
    const blackScale = Math.min(
      blackLabelWidth / BLACK_STICKER.width,
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

    this.placeRail(whiteWidth, keyboardTop + keyboardHeight, total);

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
      const pressed = frame.pressed.has(pitch);
      const sounding = pressed || frame.sounding.has(pitch);
      const shown = keyHintNote(due, frame.playing.get(pitch), sounding);
      // A key with a fingered note is its finger's colour whoever plays it; the press and
      // the program's own colours are for keys without one.
      const color =
        shown?.finger !== undefined
          ? FINGER_COLOR[shown.finger]
          : pressed
            ? PRESSED_COLOR
            : frame.sounding.has(pitch)
              ? SOUNDING_COLOR
              : shown
                ? HAND_HINT[shown.hand]
                : undefined;
      const key = keys.get(pitch);
      // Held by the player or sounded by the program, a painted key sinks.
      if (key && this.keyTextures) {
        const face = this.faceOf(key.black, false, this.painted !== undefined && sounding);
        if (sprite.texture !== face) sprite.texture = face;
      }
      sprite.tint = 0xffffff;
      const light = this.keyFronts.get(pitch);
      if (light) {
        light.visible = key !== undefined && color !== undefined;
        if (light.visible && key && color !== undefined) {
          const strength = sounding ? LIGHT_SOUNDING : LIGHT_WAITING;
          light.tint = color;
          light.texture = this.lightOf.get(pitch) ?? Texture.EMPTY;
          light.blendMode = key.black ? "add" : "normal";
          light.alpha = key.black ? strength.black : strength.white;
          light.position.set(key.x - KEY_LIGHT_PAD, keyboardTop - KEY_LIGHT_PAD);
        }
      }
      const hint = this.keyDigits.get(pitch);
      if (!hint) continue;
      hint.visible = key !== undefined && shown?.finger !== undefined && frame.hints !== false;
      if (!key || shown?.finger === undefined) continue;
      hint.texture = this.digitTextures.get(shown.finger) ?? Texture.EMPTY;
      hint.x = key.x + key.width / 2;
      if (!stickers) {
        // Fit the digit below the black keys and above the front bevel.
        const bevel = key.black ? this.bevel.black : this.bevel.white;
        const bottom = keyboardTop + (key.black ? blackHeight : keyboardHeight) - bevel - 4;
        const top = keyboardTop + (key.black ? 4 : blackHeight + 4);
        hint.scale.set(
          Math.min(
            (key.width * 0.7) / hint.texture.width,
            DIGIT_BARE_PX / hint.texture.height,
            Math.max(0, bottom - top) / hint.texture.height
          )
        );
        hint.y = bottom;
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
        const slices = KEY_STYLES[this.style];
        Object.assign(sprite, isBlack ? slices.black : slices.white);
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

  /** Bakes a light for every key's shape; the last layout's lights are freed. */
  private bakeLights(
    keys: ReadonlyMap<number, KeyRect>,
    keyboardHeight: number,
    blackHeight: number
  ): void {
    const old = this.lightTextures;
    this.lightTextures = new Map();
    this.lightOf.clear();
    for (const pitch of keys.keys()) {
      const shape = keyShape(pitch, keys, keyboardHeight - 2, blackHeight);
      if (!shape) continue;
      const id = shapeId(shape);
      let texture = this.lightTextures.get(id) ?? old.get(id);
      texture ??= bakeKeyLight(this.renderer, shape);
      this.lightTextures.set(id, texture);
      this.lightOf.set(pitch, texture);
    }
    for (const [id, texture] of old) {
      if (!this.lightTextures.has(id)) texture.destroy(true);
    }
  }

  /** The lacquered rail under the keys, for a style with one. */
  private placeRail(whiteWidth: number, keysBottom: number, total: number): void {
    const texture = this.railTexture;
    this.rail.visible = texture !== undefined && whiteWidth > 0;
    if (!texture || whiteWidth <= 0) return;
    this.rail.texture = texture;
    this.rail.x = 0;
    this.rail.y = keysBottom;
    this.rail.width = total;
    this.rail.height = whiteWidth * RAIL_PER_WIDTH;
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
