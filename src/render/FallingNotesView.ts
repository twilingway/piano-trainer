import { Application, Container, Sprite, Text, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { Finger, Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import type { NoteStatus } from "../practice/session";
import type { Song, SongNote } from "../song/song";
import { layoutKeyboard } from "./keyboardLayout";
import type { KeyRect } from "./keyboardLayout";

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
const KEYBOARD_SHARE = 0.22;

/*
 * Note names as on classroom key stickers: a rainbow from red C to violet B,
 * the Latin letter over the solfège syllable on white keys, both enharmonic
 * names on black ones.
 */
const STICKER_COLORS = [0xe53935, 0xfb8c00, 0x8bc34a, 0x2e9e4f, 0x2f9be0, 0x2146c7, 0x8e44ad];
const WHITE_NAMES: readonly (readonly [string, string])[] = [
  ["C", "до"],
  ["D", "ре"],
  ["E", "ми"],
  ["F", "фа"],
  ["G", "соль"],
  ["A", "ля"],
  ["B", "си"]
];
const BLACK_NAMES: Readonly<Record<number, readonly [string, string]>> = {
  1: ["до♯", "ре♭"],
  3: ["ре♯", "ми♭"],
  6: ["фа♯", "соль♭"],
  8: ["соль♯", "ля♭"],
  10: ["ля♯", "си♭"]
};
const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEY_HEIGHT = 0.62;
const NOTE_GAP_PX = 1;

interface NoteSprite {
  readonly note: SongNote;
  readonly body: Sprite;
  readonly digit: Sprite;
}

/**
 * The Synthesia-style picture: notes fall onto an 88-key keyboard, each
 * carrying the finger that plays it. Everything is a tinted sprite; the only
 * drawn things, the five finger digits, are baked into textures once.
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
  private readonly keyLabels = new Container();
  private notes: NoteSprite[] = [];
  private readonly keySprites = new Map<number, Sprite>();
  private readonly keyDigits = new Map<number, Sprite>();
  private readonly labelSprites = new Map<number, Sprite>();
  private digitTextures = new Map<Finger, Texture>();
  /** One baked label per pitch class. */
  private labelTextures = new Map<number, Texture>();
  private keys = new Map<number, KeyRect>();
  private laidOutFor = { width: 0, height: 0 };
  private ready = false;
  private resizeObserver: ResizeObserver | undefined;
  /** The key the mouse holds down, if any. */
  private mouseKey: number | undefined;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: 0x11131a, antialias: true });
    host.appendChild(this.app.canvas);
    // `resizeTo` follows the window only; the lane also changes when the staff above it does.
    this.resizeObserver = new ResizeObserver(() => {
      this.app.queueResize();
    });
    this.resizeObserver.observe(host);
    this.app.stage.addChild(this.guides, this.lane, this.keyboard, this.keyLabels, this.keyHints);
    this.keyLabels.eventMode = "none";
    this.keyLabels.visible = false;
    this.digitTextures = this.bakeDigits();
    this.labelTextures = this.bakeLabels();
    for (let pitch = 21; pitch <= 108; pitch++) {
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
      const label = new Sprite(this.labelTextures.get(pitch % 12) ?? Texture.EMPTY);
      label.anchor.set(0.5, 1);
      this.labelSprites.set(pitch, label);
      this.keyLabels.addChild(label);
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

  /** Note names on the keys, like stickers on a classroom piano. */
  setShowLabels(show: boolean): void {
    this.keyLabels.visible = show;
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
    const keyboardTop = height * (1 - KEYBOARD_SHARE);
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
      body.tint = status === "missed" ? MISSED_COLOR : HAND_COLOR[note.hand];
      body.alpha = !playerNote ? 0.45 : status === "hit" ? 0.3 : 1;

      const digitScale = Math.min(1, (key.width * 0.9) / 40);
      digit.scale.set(digitScale);
      digit.x = key.x + key.width / 2;
      digit.y = bottom - 2;
      digit.alpha = body.alpha;
    }

    const dueByPitch = new Map(state.due.map((note) => [note.pitch, note]));
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
      if (!hint || !key) continue;
      hint.visible = shown?.finger !== undefined;
      if (shown?.finger !== undefined) {
        hint.texture = this.digitTextures.get(shown.finger) ?? Texture.EMPTY;
        hint.scale.set(Math.min(1, (key.width * 0.9) / 40));
        hint.x = key.x + key.width / 2;
        const keyBottom = keyboardTop + (height - keyboardTop) * (key.black ? BLACK_KEY_HEIGHT : 1);
        if (!this.keyLabels.visible) {
          hint.y = keyBottom - 4;
        } else {
          // The label sits at the bottom of the key; the finger moves to the top of its free part.
          const blackBottom = keyboardTop + (height - keyboardTop) * BLACK_KEY_HEIGHT;
          hint.y = (key.black ? keyboardTop : blackBottom) + hint.height + 2;
        }
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

  private layout(width: number, height: number): void {
    this.laidOutFor = { width, height };
    this.keys = layoutKeyboard(width);
    const keyboardTop = height * (1 - KEYBOARD_SHARE);
    const keyboardHeight = height - keyboardTop;
    for (const [pitch, sprite] of this.keySprites) {
      const key = this.keys.get(pitch);
      if (!key) continue;
      sprite.x = key.x + (key.black ? 0 : 0.5);
      sprite.y = keyboardTop;
      sprite.width = key.width - (key.black ? 0 : 1);
      sprite.height = keyboardHeight * (key.black ? BLACK_KEY_HEIGHT : 1);

      const label = this.labelSprites.get(pitch);
      if (!label) continue;
      const blackHeight = keyboardHeight * BLACK_KEY_HEIGHT;
      // Room left for the label: under the black keys on a white key, the lower half of a black one.
      const room = key.black ? blackHeight * 0.45 : (keyboardHeight - blackHeight) * 0.62;
      label.scale.set(1);
      label.scale.set(Math.min((key.width * 0.88) / label.width, room / label.height));
      label.x = key.x + key.width / 2;
      label.y = keyboardTop + (key.black ? blackHeight : keyboardHeight) - 3;
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
      textures.set(finger, this.app.renderer.generateTexture(text));
      text.destroy();
    }
    return textures;
  }

  /** Two centred lines per pitch class, baked once and shared by every octave. */
  private bakeLabels(): Map<number, Texture> {
    const textures = new Map<number, Texture>();
    const line = (text: string, fill: number, fontSize: number) =>
      new Text({
        text,
        style: { fontFamily: "system-ui, sans-serif", fontSize, fontWeight: "700", fill },
        resolution: 2
      });
    const bake = (pitchClass: number, top: Text, bottom: Text) => {
      const width = Math.max(top.width, bottom.width);
      top.x = (width - top.width) / 2;
      bottom.x = (width - bottom.width) / 2;
      bottom.y = top.height;
      const group = new Container();
      group.addChild(top, bottom);
      textures.set(pitchClass, this.app.renderer.generateTexture(group));
      group.destroy({ children: true });
    };
    WHITE_PITCH_CLASSES.forEach((pitchClass, index) => {
      const [letter, syllable] = WHITE_NAMES[index] ?? ["", ""];
      const color = STICKER_COLORS[index] ?? 0x000000;
      bake(pitchClass, line(letter, color, 30), line(syllable.toUpperCase(), color, 22));
    });
    for (const [pitchClass, [sharp, flat]] of Object.entries(BLACK_NAMES)) {
      bake(
        Number(pitchClass),
        line(sharp.toUpperCase(), 0xe8e8e8, 20),
        line(flat.toUpperCase(), 0xe8e8e8, 20)
      );
    }
    return textures;
  }
}
