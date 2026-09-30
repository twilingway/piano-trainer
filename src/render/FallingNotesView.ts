import { Application, Assets, Container, NineSliceSprite, Sprite, Text, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { Finger, Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import type { NoteStatus } from "../practice/session";
import { quartersAt } from "../song/song";
import type { Song, SongNote } from "../song/song";
import { HIGHEST_PITCH, LOWEST_PITCH, layoutKeyboard } from "./keyboardLayout";
import type { KeyRect } from "./keyboardLayout";
import { FINGER_COLOR } from "./fingerColors";
import { HandsLayer } from "./HandsLayer";
import {
  CARD_FACE_OFFSET,
  CARD_HEIGHT,
  CARD_WIDTH,
  bakeCardFace,
  bakeCardFrame
} from "./noteCards";
import { noteGlyph } from "./noteGlyph";
import { RoadLayer } from "./RoadLayer";
import type { Strike } from "./RoadLayer";
import { BLACK_STICKER, WHITE_STICKER, bakeKeySticker } from "./keyStickers";
import { bakeKeyTextures } from "./keyTextures";
import type { KeyTextures } from "./keyTextures";

export interface FrameState {
  /** Song seconds at the hit line. */
  readonly time: number;
  /** Song seconds between the top of the lane and the hit line. */
  readonly lookAhead: number;
  readonly statusOf: (noteId: string) => NoteStatus | undefined;
  /** Keys the player holds down right now. */
  readonly pressed: ReadonlySet<number>;
  /** Keys the program is sounding for the other hand. */
  readonly sounding: ReadonlySet<number>;
  /** The chord the player owes next, shown on the keyboard with its fingers. */
  readonly due: readonly SongNote[];
  readonly hands: ReadonlySet<Hand>;
  /** A colour of the caller's choosing (a review grade); notes it colours are drawn solid. */
  readonly colorOf?: ((note: SongNote) => number | undefined) | undefined;
}

const HAND_COLOR: Readonly<Record<Hand, number>> = { right: 0x4cc9f0, left: 0xf4a261 };
const HAND_HINT: Readonly<Record<Hand, number>> = { right: 0xbdeefb, left: 0xfbdcc0 };
const MISSED_COLOR = 0xe63946;
const PRESSED_COLOR = 0xffd166;
const SOUNDING_COLOR = 0xb8b8ff;
/** The dark red felt strip over the keys, as on a real piano. */
const FELT = 0x6e1616;
const FELT_EDGE = 0xb33a3a;
/*
 * Trial: key faces painted by Codex (public/generated/keys), stretched as
 * nine-slice sprites, instead of the ones baked in code. On with ?keys=codex.
 */
const CODEX_KEYS = new URLSearchParams(window.location.search).get("keys") === "codex";
const WHITE_SLICE = { leftWidth: 32, topHeight: 32, rightWidth: 32, bottomHeight: 80 };
const BLACK_SLICE = { leftWidth: 18, topHeight: 56, rightWidth: 18, bottomHeight: 96 };
const NO_SLICE = { leftWidth: 0, topHeight: 0, rightWidth: 0, bottomHeight: 0 };
/** The felt strip's height, in white-key widths. */
const FELT_PER_WIDTH = 0.22;
const OCTAVE_LINE = 0x2a2f3d;
const HIT_LINE = 0xffffff;
const NOTE_GAP_PX = 1;

/*
 * The keyboard's height follows its key width, like a real key, long and
 * narrow, and nothing else: a staff zoomed in takes room from the falling
 * notes, never from the keys, and stickers on or off leave the keys alone.
 * Stickers only shorten the black keys, to leave a white key room for one.
 */
const KEY_LENGTH_PER_WIDTH = 3.6;
const KEYBOARD_MIN_PX = 110;
const MAX_KEYBOARD_SHARE = 0.6;
const BLACK_KEY_HEIGHT = 0.62;
const BLACK_KEY_HEIGHT_WITH_STICKERS = 0.5;
/** Room under the keys for the palms of the drawn hands, in white-key widths and at most a share. */
const HANDS_STRIP_PER_WIDTH = 3;
const MAX_HANDS_SHARE = 0.25;
/** Largest size of a finger digit on a key. */
const DIGIT_MAX_PX = 26;

interface NoteSprite {
  readonly note: SongNote;
  readonly body: Sprite;
  /** The note written on a little staff, at the head of the body. */
  readonly frame: Sprite;
  readonly face: Sprite;
  /** The finger, on the card. */
  readonly badge: Sprite;
  readonly digit: Sprite;
  readonly name: Sprite;
}

/** A note card's width, in white-key widths, and its limits in pixels. */
const CARD_PER_WIDTH = 1.9;
const CARD_MIN_PX = 34;
const CARD_MAX_PX = 96;

export type FallingNoteNames = "ru" | "en";

/** Names by pitch class, sharps for the black keys: a falling note has no written spelling. */
const FALLING_NAMES: Readonly<Record<FallingNoteNames, readonly string[]>> = {
  ru: ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"],
  en: ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
};

interface Geometry {
  readonly keyboardTop: number;
  readonly keyboardHeight: number;
  readonly blackHeight: number;
  readonly whiteWidth: number;
  /** Where notes meet the keys: the top of the felt over them, or the view's bottom without keys. */
  readonly hitY: number;
  readonly feltHeight: number;
}

/**
 * The Synthesia-style picture: notes fall onto a keyboard, each carrying the
 * finger that plays it. Everything is a tinted sprite; the finger digits and
 * the key stickers are drawn once into textures.
 */
export class FallingNotesView {
  onNoteClick: ((noteId: string) => void) | undefined;
  /** A key pressed or released with the mouse (or a finger on a touch screen). */
  onKeyPointer: ((event: KeyEvent) => void) | undefined;

  private readonly app = new Application();
  private readonly lane = new Container();
  private readonly guides = new Container();
  /** The guides and the notes together: on the stage flat, or drawn into the road. */
  private readonly laneRoot = new Container();
  /**
   * The note cards, over the lane on the stage in both views: flat they sit
   * where the notes are, on the road they stand upright where the notes land.
   */
  private readonly cardsLayer = new Container({ sortableChildren: true });
  /** The keys and everything drawn on them: on the stage flat, or laid back under the road. */
  private readonly keysRoot = new Container();
  private road: RoadLayer | undefined;
  private roadMode = false;
  private readonly keyboard = new Container();
  private readonly keyHints = new Container();
  private readonly keyStickers = new Container();
  private readonly hands = new HandsLayer();
  private readonly felt = new Container();
  private keyTextures: KeyTextures | undefined;
  /** Codex's key faces, when the trial is on; kept for good, never re-baked. */
  private codexFaces: KeyTextures | undefined;
  private notes: NoteSprite[] = [];
  private readonly keySprites = new Map<number, NineSliceSprite>();
  private readonly keyDigits = new Map<number, Sprite>();
  private readonly stickerSprites = new Map<number, Sprite>();
  private digitTextures = new Map<Finger, Texture>();
  private nameTextures = new Map<string, Texture>();
  private cardFrame: Texture = Texture.WHITE;
  /** Card faces by pitch and written value, baked the first time a song needs one. */
  private readonly cardFaces = new Map<string, Texture>();
  private cards = true;
  private noteNames: FallingNoteNames | undefined;
  private labels = false;
  /** Which parts are on screen: the falling notes, the keyboard, the hands over it. */
  private parts = { notes: true, keys: true, hands: false };
  private keys = new Map<number, KeyRect>();
  /** A white key's width in this layout, kept so a frame need not search the keys for it. */
  private whiteWidth = 0;
  /** The player wants the road; it shows only while both the notes and the keys are on screen. */
  private roadWanted = false;
  private range = { low: LOWEST_PITCH, high: HIGHEST_PITCH };
  private laidOutFor = { width: 0, height: 0 };
  private ready = false;
  private resizeObserver: ResizeObserver | undefined;
  /** The key the mouse holds down, if any. */
  private mouseKey: number | undefined;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x11131a,
      antialias: true,
      // Draw at the screen's pixel density, or text is blurred on scaled displays.
      resolution: window.devicePixelRatio,
      autoDensity: true
    });
    host.appendChild(this.app.canvas);
    // `resizeTo` follows the window only; the lane also changes when the staff above it does.
    this.resizeObserver = new ResizeObserver(() => {
      this.app.queueResize();
    });
    this.resizeObserver.observe(host);
    this.laneRoot.addChild(this.guides, this.lane);
    this.road = new RoadLayer(this.app.renderer);
    this.road.container.visible = false;
    this.road.effects.visible = false;
    this.keysRoot.addChild(
      this.keyboard,
      this.felt,
      this.keyStickers,
      this.keyHints,
      this.hands.container
    );
    this.app.stage.addChild(
      this.road.container,
      this.laneRoot,
      this.cardsLayer,
      this.keysRoot,
      this.road.effects
    );
    this.keyStickers.eventMode = "none";
    this.keyStickers.visible = false;
    this.digitTextures = this.bakeDigits();
    this.nameTextures = this.bakeNames();
    this.cardFrame = bakeCardFrame(this.app.renderer);
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
      this.keyHints.addChild(digit);
      const sticker = new Sprite(bakeKeySticker(this.app.renderer, pitch));
      sticker.anchor.set(0.5, 1);
      this.stickerSprites.set(pitch, sticker);
      this.keyStickers.addChild(sticker);
    }
    // White keys first so black keys draw over them.
    const pitches = [...this.keySprites.keys()];
    for (const black of [false, true]) {
      for (const pitch of pitches) {
        const sprite = this.keySprites.get(pitch);
        if (sprite && isBlackKey(pitch) === black) this.keyboard.addChild(sprite);
      }
    }
    if (CODEX_KEYS) {
      try {
        const [white, black, blackLit] = await Promise.all(
          ["white", "black", "black-lit"].map((name) =>
            Assets.load<Texture>(`/generated/keys/${name}.png`)
          )
        );
        if (white && black && blackLit) this.codexFaces = { white, black, blackLit };
      } catch (error) {
        // The faces are local drafts, not in the repository: without them the baked keys stay.
        console.warn("Codex key faces did not load; using the baked keys", error);
      }
    }
    this.ready = true;
  }

  /** Note names, key numbers and a mini staff on every key, like classroom stickers. */
  /** Note names on the falling notes, over the finger; undefined hides them. */
  setNoteNames(style: FallingNoteNames | undefined): void {
    this.noteNames = style;
    for (const { note, name } of this.notes) {
      name.texture = style
        ? (this.nameTextures.get(`${style}:${String(note.pitch % 12)}`) ?? Texture.EMPTY)
        : Texture.EMPTY;
    }
  }

  /** Each falling note carries a card with the note written on a staff; off, plain bars. */
  setNoteCards(on: boolean): void {
    this.cards = on;
  }

  setShowLabels(show: boolean): void {
    this.labels = show;
    this.keyStickers.visible = show && this.parts.keys;
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** The keys shown, lowest to highest; fewer keys are wider. */
  setRange(low: number, high: number): void {
    this.range = { low, high };
    this.laidOutFor = { width: 0, height: 0 };
  }

  /**
   * Shows the falling notes, the keyboard, or both. Without the notes the
   * keys fill the view; without the keys the notes fall to its bottom edge.
   * Hands lie over the keyboard, so they need it on screen.
   */
  setParts(parts: { notes: boolean; keys: boolean; hands?: boolean }): void {
    this.parts = { notes: parts.notes, keys: parts.keys, hands: parts.hands === true };
    this.hands.container.visible = this.parts.hands && parts.keys;
    this.lane.visible = parts.notes;
    this.cardsLayer.visible = parts.notes;
    this.guides.visible = parts.notes;
    this.keyboard.visible = parts.keys;
    this.felt.visible = parts.keys;
    this.keyHints.visible = parts.keys;
    this.keyStickers.visible = this.labels && parts.keys;
    if (!this.hands.container.visible) this.hands.reset();
    this.syncRoad();
    this.laidOutFor = { width: 0, height: 0 };
  }

  /**
   * The trial road view: the notes come out of the horizon in perspective,
   * glowing, with sparks in their finger's colour where they are struck.
   * Notes cannot be clicked there, nor keys played with the mouse: the lane
   * and the keyboard are pictures laid on the road.
   */
  setRoad(on: boolean): void {
    this.roadWanted = on;
    this.syncRoad();
  }

  /** Puts the road on or off: on when asked for and the notes show, with or without the keys. */
  private syncRoad(): void {
    const on = this.roadWanted && this.parts.notes;
    if (!this.road || on === this.roadMode) return;
    this.roadMode = on;
    this.road.container.visible = on;
    this.road.effects.visible = on;
    if (on) this.app.stage.removeChild(this.laneRoot, this.keysRoot);
    else {
      this.app.stage.addChildAt(this.laneRoot, 1);
      this.app.stage.addChildAt(this.keysRoot, 3);
    }
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** Runs `onFrame` with real milliseconds before every draw. */
  onTick(onFrame: (deltaMs: number) => void): void {
    this.app.ticker.add((ticker) => {
      onFrame(ticker.deltaMS);
    });
  }

  setSong(song: Song): void {
    this.hands.setSong(song);
    for (const sprite of this.notes) {
      sprite.body.destroy();
      sprite.digit.destroy();
      sprite.name.destroy();
      sprite.frame.destroy();
      sprite.face.destroy();
      sprite.badge.destroy();
    }
    this.notes = song.notes.map((note) => {
      const body = new Sprite(Texture.WHITE);
      body.eventMode = "static";
      body.cursor = "pointer";
      body.on("pointertap", () => this.onNoteClick?.(note.id));
      const digit = new Sprite(note.finger ? this.digitTextures.get(note.finger) : undefined);
      digit.anchor.set(0.5, 1);
      digit.eventMode = "none";
      const style = this.noteNames;
      const name = new Sprite(
        style
          ? (this.nameTextures.get(`${style}:${String(note.pitch % 12)}`) ?? Texture.EMPTY)
          : Texture.EMPTY
      );
      name.anchor.set(0.5, 1);
      name.eventMode = "none";
      const frame = new Sprite(this.cardFrame);
      frame.anchor.set(0.5, 1);
      frame.eventMode = "static";
      frame.cursor = "pointer";
      frame.on("pointertap", () => this.onNoteClick?.(note.id));
      const glyph = noteGlyph(quartersAt(song, note.start + note.duration) - note.startBeat);
      const face = new Sprite(this.cardFace(note.pitch, glyph));
      face.anchor.set(0.5, 1);
      face.eventMode = "none";
      const badge = new Sprite(note.finger ? this.digitTextures.get(note.finger) : undefined);
      badge.anchor.set(0.5, 0);
      badge.eventMode = "none";
      // Nearer notes in front: on the road the earlier note is the closer one.
      frame.zIndex = -note.start * 4;
      face.zIndex = frame.zIndex + 1;
      badge.zIndex = frame.zIndex + 2;
      this.lane.addChild(body, digit, name);
      this.cardsLayer.addChild(frame, face, badge);
      return { note, body, frame, face, badge, digit, name };
    });
  }

  draw(state: FrameState): void {
    if (!this.ready) return;
    const { width, height } = this.app.screen;
    if (width !== this.laidOutFor.width || height !== this.laidOutFor.height) {
      this.layout(width, height);
    }
    const geometry = this.geometry(height);
    const { keyboardTop, keyboardHeight, blackHeight, hitY } = geometry;
    const pixelsPerSecond = hitY / state.lookAhead;

    // Notes crossing the hit line right now: their finger is shown on the key too.
    const playing = new Map<number, SongNote>();
    const cardWidth = Math.min(
      CARD_MAX_PX,
      Math.max(CARD_MIN_PX, geometry.whiteWidth * CARD_PER_WIDTH)
    );
    const cardScale = cardWidth / CARD_WIDTH;
    for (const { note, body, frame, face, badge, digit, name } of this.notes) {
      if (note.start <= state.time && state.time < note.start + note.duration) {
        playing.set(note.pitch, note);
      }
      const key = this.keys.get(note.pitch);
      const bottom = hitY - (note.start - state.time) * pixelsPerSecond;
      const noteHeight = Math.max(note.duration * pixelsPerSecond - NOTE_GAP_PX, 4);
      const onScreen = key !== undefined && bottom > 0 && bottom - noteHeight < hitY;
      // With cards the note is its card: the value is written on it, no bar stretches out.
      body.visible = onScreen && !this.cards;
      frame.visible = onScreen && this.cards;
      face.visible = frame.visible;
      badge.visible = frame.visible && note.finger !== undefined;
      digit.visible = onScreen && !this.cards && note.finger !== undefined;
      name.visible = false;
      if (!onScreen) continue;

      const playerNote = state.hands.has(note.hand);
      const status = state.statusOf(note.id);
      body.x = key.x + NOTE_GAP_PX;
      body.width = key.width - NOTE_GAP_PX * 2;
      body.y = bottom - noteHeight;
      body.height = noteHeight;
      const custom = state.colorOf?.(note);
      const own =
        this.roadMode && note.finger !== undefined
          ? FINGER_COLOR[note.finger]
          : HAND_COLOR[note.hand];
      body.tint = custom ?? (status === "missed" ? MISSED_COLOR : own);
      body.alpha = custom !== undefined ? 1 : !playerNote ? 0.45 : status === "hit" ? 0.3 : 1;

      digit.scale.set(Math.min(1, (key.width * 0.9) / 40));
      digit.x = key.x + key.width / 2;
      digit.y = bottom - 2;
      digit.alpha = body.alpha;
      if (this.cards) {
        // The card stands where the note lands; on the road it faces the player and
        // grows as it comes nearer.
        const centre = key.x + key.width / 2;
        const spot = this.roadMode ? this.road?.place(centre, bottom) : undefined;
        const scale = cardScale * (spot?.scale ?? 1);
        const x = spot?.x ?? centre;
        const y = spot?.y ?? bottom;
        frame.scale.set(scale);
        frame.position.set(x, y);
        frame.tint = body.tint;
        frame.alpha = body.alpha;
        face.scale.set(scale);
        face.position.set(x, y - CARD_FACE_OFFSET * scale);
        face.alpha = body.alpha;
        badge.scale.set(scale * 0.55);
        badge.position.set(x, y - (CARD_HEIGHT - CARD_FACE_OFFSET - 1) * scale);
        badge.alpha = body.alpha;
        continue;
      }
      if (this.noteNames) {
        // Over the finger, when the note is tall enough to hold both.
        name.scale.set(Math.min(1, (key.width * 0.92) / Math.max(name.texture.width, 1)));
        const digitHeight = note.finger === undefined ? 0 : digit.height + 2;
        name.visible = noteHeight >= digitHeight + name.height + 4;
        name.x = key.x + key.width / 2;
        name.y = bottom - 2 - digitHeight;
        name.alpha = body.alpha;
      }
    }

    const dueByPitch = new Map(state.due.map((note) => [note.pitch, note]));
    const stickers = this.labels;
    for (const [pitch, sprite] of this.keySprites) {
      const due = dueByPitch.get(pitch);
      // The owed note wins: it is the one the player has to find next.
      const shown = due ?? playing.get(pitch);
      const pressed = state.pressed.has(pitch);
      const color = pressed
        ? PRESSED_COLOR
        : state.sounding.has(pitch)
          ? SOUNDING_COLOR
          : shown
            ? shown.finger !== undefined
              ? FINGER_COLOR[shown.finger]
              : HAND_HINT[shown.hand]
            : undefined;
      const key = this.keys.get(pitch);
      if (key?.black && this.keyTextures) {
        // A black key is repainted in pale grey for its colour to show; a white one is tinted as it is.
        const face = color === undefined ? this.keyTextures.black : this.keyTextures.blackLit;
        if (sprite.texture !== face) sprite.texture = face;
      }
      sprite.tint = color ?? 0xffffff;
      const hint = this.keyDigits.get(pitch);
      if (!hint) continue;
      hint.visible = key !== undefined && shown?.finger !== undefined;
      if (!key || shown?.finger === undefined) continue;
      hint.texture = this.digitTextures.get(shown.finger) ?? Texture.EMPTY;
      hint.scale.set(Math.min(1, (key.width * 0.9) / 40, DIGIT_MAX_PX / 40));
      hint.x = key.x + key.width / 2;
      if (!stickers) {
        hint.y = keyboardTop + (key.black ? blackHeight : keyboardHeight) - 4;
      } else {
        // The sticker fills the bottom of the key; the finger sits at the top of its free part.
        hint.y = (key.black ? keyboardTop : keyboardTop + blackHeight) + hint.height + 2;
      }
    }
    if (this.hands.container.visible) {
      this.hands.draw(state.time, this.app.ticker.deltaMS / 1000, state.hands, this.keys, geometry);
    }
    // Last, once the keys and hands of this frame are drawn: the road takes a picture of them.
    if (this.roadMode && this.road) {
      const strikes: Strike[] = [];
      for (const [pitch, note] of playing) {
        const key = this.keys.get(pitch);
        // Only the player's own notes, held while they sound.
        if (!key || !state.hands.has(note.hand) || !state.pressed.has(pitch)) continue;
        const color = note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand];
        strikes.push({ pitch, x: key.x + key.width / 2, color });
      }
      this.road.draw(this.laneRoot, this.keysRoot, strikes, this.app.ticker.deltaMS / 1000);
    }
  }

  private pressWithMouse(pitch: number): void {
    if (this.mouseKey === pitch) return;
    this.releaseMouse();
    this.mouseKey = pitch;
    this.onKeyPointer?.({ type: "down", pitch, velocity: 90 });
  }

  private releaseMouse(): void {
    if (this.mouseKey === undefined) return;
    this.onKeyPointer?.({ type: "up", pitch: this.mouseKey, velocity: 0 });
    this.mouseKey = undefined;
  }

  destroy(): void {
    this.ready = false;
    this.resizeObserver?.disconnect();
    // Off the stage in the road view, so the stage's own destroy would miss them.
    if (this.roadMode) {
      this.laneRoot.destroy({ children: true });
      this.keysRoot.destroy({ children: true });
    }
    this.road?.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private geometry(height: number): Geometry {
    const stickers = this.labels;
    const whiteWidth = this.whiteWidth;
    if (!this.parts.keys) {
      const none = { keyboardHeight: 0, blackHeight: 0, feltHeight: 0 };
      return { ...none, keyboardTop: height, hitY: height, whiteWidth };
    }
    const feltHeight = Math.max(3, whiteWidth * FELT_PER_WIDTH);
    const blackOf = (keyboardHeight: number) =>
      keyboardHeight * (stickers ? BLACK_KEY_HEIGHT_WITH_STICKERS : BLACK_KEY_HEIGHT);
    // The palms reach below the keys, into a strip of their own.
    const strip = this.parts.hands
      ? Math.min(whiteWidth * HANDS_STRIP_PER_WIDTH, height * MAX_HANDS_SHARE)
      : 0;
    // Only the keys: they take the whole view, whatever its height.
    if (!this.parts.notes) {
      const keyboardHeight = height - strip - feltHeight;
      return {
        keyboardTop: feltHeight,
        keyboardHeight,
        blackHeight: blackOf(keyboardHeight),
        whiteWidth,
        hitY: 0,
        feltHeight
      };
    }
    const wanted = Math.max(KEYBOARD_MIN_PX, whiteWidth * KEY_LENGTH_PER_WIDTH);
    const keyboardHeight = Math.min(wanted, height * MAX_KEYBOARD_SHARE);
    const keyboardTop = height - strip - keyboardHeight;
    return {
      keyboardTop,
      keyboardHeight,
      blackHeight: blackOf(keyboardHeight),
      whiteWidth,
      hitY: keyboardTop - feltHeight,
      feltHeight
    };
  }

  private layout(width: number, height: number): void {
    this.laidOutFor = { width, height };
    this.keys = layoutKeyboard(width, this.range.low, this.range.high);
    this.whiteWidth = [...this.keys.values()].find((key) => !key.black)?.width ?? 0;
    const { keyboardTop, keyboardHeight, blackHeight, hitY, feltHeight } = this.geometry(height);
    this.bakeKeys(keyboardHeight, blackHeight);
    // The hands' pixels belong to the old layout.
    this.hands.reset();

    // One scale per kind of sticker, so every white label reads at one size and every black one too.
    const sample = [...this.keys.values()];
    const whiteWidth = sample.find((key) => !key.black)?.width ?? 0;
    const blackWidth = sample.find((key) => key.black)?.width ?? 0;
    const digitRoom = Math.min(whiteWidth * 0.9, DIGIT_MAX_PX) + 4;
    const whiteScale = Math.min(
      (whiteWidth * 0.92) / WHITE_STICKER.width,
      (keyboardHeight - blackHeight - digitRoom) / WHITE_STICKER.height
    );
    const blackScale = Math.min(
      (blackWidth * 0.92) / BLACK_STICKER.width,
      (blackHeight - digitRoom) / BLACK_STICKER.height
    );

    for (const [pitch, sprite] of this.keySprites) {
      const key = this.keys.get(pitch);
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
      sticker.y = keyboardTop + (key.black ? blackHeight : keyboardHeight) - 3;
    }

    this.guides.removeChildren().forEach((child) => {
      child.destroy();
    });
    // A faint line at every C, so the eye finds octaves on the way down.
    for (const [pitch, key] of this.keys) {
      if (pitch % 12 !== 0) continue;
      const line = new Sprite(Texture.WHITE);
      line.tint = OCTAVE_LINE;
      line.x = key.x;
      line.width = 1;
      line.height = hitY;
      this.guides.addChild(line);
    }
    this.felt.removeChildren().forEach((child) => {
      child.destroy();
    });
    // The road ends on the felt, where the notes meet the keys.
    this.road?.layout(width, hitY, height);
    const felt = new Sprite(Texture.WHITE);
    felt.tint = FELT;
    felt.y = keyboardTop - feltHeight;
    felt.width = width;
    felt.height = feltHeight;
    const feltEdge = new Sprite(Texture.WHITE);
    feltEdge.tint = FELT_EDGE;
    feltEdge.y = keyboardTop - feltHeight;
    feltEdge.width = width;
    feltEdge.height = 1;
    // The felt throws a thin shadow on the tops of the keys.
    const feltShade = new Sprite(Texture.WHITE);
    feltShade.tint = 0x000000;
    feltShade.alpha = 0.25;
    feltShade.y = keyboardTop;
    feltShade.width = width;
    feltShade.height = 2;
    this.felt.addChild(felt, feltEdge, feltShade);

    const hitLine = new Sprite(Texture.WHITE);
    hitLine.tint = HIT_LINE;
    hitLine.alpha = 0.5;
    hitLine.y = hitY - 1;
    hitLine.width = width;
    hitLine.height = 2;
    this.guides.addChild(hitLine);
  }

  /**
   * Puts a key on screen. A Codex face keeps its corners at the picture's own
   * proportions: it is sized in picture pixels across and scaled to the key.
   */
  private placeKey(sprite: NineSliceSprite, x: number, y: number, width: number, height: number) {
    sprite.x = x;
    sprite.y = y;
    if (!this.codexFaces) {
      sprite.scale.set(1);
      sprite.setSize(width, height);
      return;
    }
    const scale = width / sprite.texture.width;
    sprite.scale.set(scale);
    sprite.setSize(sprite.texture.width, height / scale);
  }

  private cardFace(pitch: number, glyph: ReturnType<typeof noteGlyph>): Texture {
    const key = `${String(pitch)}:${glyph.kind}:${String(glyph.dotted)}`;
    let texture = this.cardFaces.get(key);
    if (!texture) {
      texture = bakeCardFace(this.app.renderer, pitch, glyph);
      this.cardFaces.set(key, texture);
    }
    return texture;
  }

  /** Key faces at this keyboard's size; the old ones are freed once replaced. */
  private bakeKeys(keyboardHeight: number, blackHeight: number): void {
    if (this.codexFaces) {
      this.keyTextures = this.codexFaces;
      for (const [pitch, sprite] of this.keySprites) {
        const black = isBlackKey(pitch);
        sprite.texture = black ? this.codexFaces.black : this.codexFaces.white;
        Object.assign(sprite, black ? BLACK_SLICE : WHITE_SLICE);
      }
      return;
    }
    const sample = [...this.keys.values()];
    const white = sample.find((key) => !key.black);
    const black = sample.find((key) => key.black);
    const old = this.keyTextures;
    this.keyTextures = bakeKeyTextures(
      this.app.renderer,
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

  private bakeNames(): Map<string, Texture> {
    const textures = new Map<string, Texture>();
    for (const [style, names] of Object.entries(FALLING_NAMES)) {
      names.forEach((label, pitchClass) => {
        const text = new Text({
          text: label,
          style: {
            fontFamily: "system-ui, sans-serif",
            fontSize: 22,
            fontWeight: "700",
            fill: 0x10121a
          },
          resolution: 2
        });
        textures.set(
          `${style}:${String(pitchClass)}`,
          this.app.renderer.generateTexture({ target: text, resolution: 3 })
        );
        text.destroy();
      });
    }
    return textures;
  }

  private bakeDigits(): Map<Finger, Texture> {
    const textures = new Map<Finger, Texture>();
    for (const finger of [1, 2, 3, 4, 5] as const) {
      const text = new Text({
        text: String(finger),
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 32,
          fontWeight: "700",
          fill: 0x10121a
        },
        resolution: 2
      });
      textures.set(finger, this.app.renderer.generateTexture({ target: text, resolution: 3 }));
      text.destroy();
    }
    return textures;
  }
}
