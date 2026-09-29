import { Application, Container, Sprite, Text, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { Finger, Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import type { NoteStatus } from "../practice/session";
import type { Song, SongNote } from "../song/song";
import { HIGHEST_PITCH, LOWEST_PITCH, layoutKeyboard } from "./keyboardLayout";
import type { KeyRect } from "./keyboardLayout";
import { BLACK_STICKER, WHITE_STICKER, bakeKeySticker } from "./keyStickers";

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
const WHITE_KEY = 0xf4f4f4;
const BLACK_KEY = 0x1c1c22;
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
/** Largest size of a finger digit on a key. */
const DIGIT_MAX_PX = 26;

interface NoteSprite {
  readonly note: SongNote;
  readonly body: Sprite;
  readonly digit: Sprite;
}

interface Geometry {
  readonly keyboardTop: number;
  readonly keyboardHeight: number;
  readonly blackHeight: number;
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
  private readonly keyboard = new Container();
  private readonly keyHints = new Container();
  private readonly keyStickers = new Container();
  private notes: NoteSprite[] = [];
  private readonly keySprites = new Map<number, Sprite>();
  private readonly keyDigits = new Map<number, Sprite>();
  private readonly stickerSprites = new Map<number, Sprite>();
  private digitTextures = new Map<Finger, Texture>();
  private keys = new Map<number, KeyRect>();
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
    this.app.stage.addChild(this.guides, this.lane, this.keyboard, this.keyStickers, this.keyHints);
    this.keyStickers.eventMode = "none";
    this.keyStickers.visible = false;
    this.digitTextures = this.bakeDigits();
    for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
      const sprite = new Sprite(Texture.WHITE);
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
    this.ready = true;
  }

  /** Note names, key numbers and a mini staff on every key, like classroom stickers. */
  setShowLabels(show: boolean): void {
    this.keyStickers.visible = show;
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** The keys shown, lowest to highest; fewer keys are wider. */
  setRange(low: number, high: number): void {
    this.range = { low, high };
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** Runs `onFrame` with real milliseconds before every draw. */
  onTick(onFrame: (deltaMs: number) => void): void {
    this.app.ticker.add((ticker) => {
      onFrame(ticker.deltaMS);
    });
  }

  setSong(song: Song): void {
    for (const sprite of this.notes) {
      sprite.body.destroy();
      sprite.digit.destroy();
    }
    this.notes = song.notes.map((note) => {
      const body = new Sprite(Texture.WHITE);
      body.eventMode = "static";
      body.cursor = "pointer";
      body.on("pointertap", () => this.onNoteClick?.(note.id));
      const digit = new Sprite(note.finger ? this.digitTextures.get(note.finger) : undefined);
      digit.anchor.set(0.5, 1);
      digit.eventMode = "none";
      this.lane.addChild(body, digit);
      return { note, body, digit };
    });
  }

  draw(state: FrameState): void {
    if (!this.ready) return;
    const { width, height } = this.app.screen;
    if (width !== this.laidOutFor.width || height !== this.laidOutFor.height) {
      this.layout(width, height);
    }
    const { keyboardTop, keyboardHeight, blackHeight } = this.geometry(height);
    const pixelsPerSecond = keyboardTop / state.lookAhead;

    // Notes crossing the hit line right now: their finger is shown on the key too.
    const playing = new Map<number, SongNote>();
    for (const { note, body, digit } of this.notes) {
      if (note.start <= state.time && state.time < note.start + note.duration) {
        playing.set(note.pitch, note);
      }
      const key = this.keys.get(note.pitch);
      const bottom = keyboardTop - (note.start - state.time) * pixelsPerSecond;
      const noteHeight = Math.max(note.duration * pixelsPerSecond - NOTE_GAP_PX, 4);
      const onScreen = key !== undefined && bottom > 0 && bottom - noteHeight < keyboardTop;
      body.visible = onScreen;
      digit.visible = onScreen && note.finger !== undefined;
      if (!onScreen) continue;

      const playerNote = state.hands.has(note.hand);
      const status = state.statusOf(note.id);
      body.x = key.x + NOTE_GAP_PX;
      body.width = key.width - NOTE_GAP_PX * 2;
      body.y = bottom - noteHeight;
      body.height = noteHeight;
      const custom = state.colorOf?.(note);
      body.tint = custom ?? (status === "missed" ? MISSED_COLOR : HAND_COLOR[note.hand]);
      body.alpha = custom !== undefined ? 1 : !playerNote ? 0.45 : status === "hit" ? 0.3 : 1;

      digit.scale.set(Math.min(1, (key.width * 0.9) / 40));
      digit.x = key.x + key.width / 2;
      digit.y = bottom - 2;
      digit.alpha = body.alpha;
    }

    const dueByPitch = new Map(state.due.map((note) => [note.pitch, note]));
    const stickers = this.keyStickers.visible;
    for (const [pitch, sprite] of this.keySprites) {
      const due = dueByPitch.get(pitch);
      // The owed note wins: it is the one the player has to find next.
      const shown = due ?? playing.get(pitch);
      sprite.tint = state.pressed.has(pitch)
        ? PRESSED_COLOR
        : state.sounding.has(pitch)
          ? SOUNDING_COLOR
          : shown
            ? HAND_HINT[shown.hand]
            : isBlackKey(pitch)
              ? BLACK_KEY
              : WHITE_KEY;
      const hint = this.keyDigits.get(pitch);
      const key = this.keys.get(pitch);
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
    this.app.destroy({ removeView: true }, { children: true });
  }

  private geometry(height: number): Geometry {
    const stickers = this.keyStickers.visible;
    const whiteWidth = [...this.keys.values()].find((key) => !key.black)?.width ?? 0;
    const wanted = Math.max(KEYBOARD_MIN_PX, whiteWidth * KEY_LENGTH_PER_WIDTH);
    const keyboardHeight = Math.min(wanted, height * MAX_KEYBOARD_SHARE);
    const blackShare = stickers ? BLACK_KEY_HEIGHT_WITH_STICKERS : BLACK_KEY_HEIGHT;
    return {
      keyboardTop: height - keyboardHeight,
      keyboardHeight,
      blackHeight: keyboardHeight * blackShare
    };
  }

  private layout(width: number, height: number): void {
    this.laidOutFor = { width, height };
    this.keys = layoutKeyboard(width, this.range.low, this.range.high);
    const { keyboardTop, keyboardHeight, blackHeight } = this.geometry(height);

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
      sprite.x = key.x + (key.black ? 0 : 0.5);
      sprite.y = keyboardTop;
      sprite.width = key.width - (key.black ? 0 : 1);
      sprite.height = key.black ? blackHeight : keyboardHeight;
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
      line.height = keyboardTop;
      this.guides.addChild(line);
    }
    const hitLine = new Sprite(Texture.WHITE);
    hitLine.tint = HIT_LINE;
    hitLine.alpha = 0.5;
    hitLine.y = keyboardTop - 1;
    hitLine.width = width;
    hitLine.height = 2;
    this.guides.addChild(hitLine);
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
