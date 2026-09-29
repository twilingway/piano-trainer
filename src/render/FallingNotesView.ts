import { Application, Container, Sprite, Text, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { Finger, Hand } from "../fingering/fingering";
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
const KEYBOARD_SHARE = 0.18;
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

  private readonly app = new Application();
  private readonly lane = new Container();
  private readonly guides = new Container();
  private readonly keyboard = new Container();
  private readonly keyHints = new Container();
  private notes: NoteSprite[] = [];
  private readonly keySprites = new Map<number, Sprite>();
  private readonly keyDigits = new Map<number, Sprite>();
  private digitTextures = new Map<Finger, Texture>();
  private keys = new Map<number, KeyRect>();
  private laidOutFor = { width: 0, height: 0 };
  private ready = false;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: 0x11131a, antialias: true });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.guides, this.lane, this.keyboard, this.keyHints);
    this.digitTextures = this.bakeDigits();
    for (let pitch = 21; pitch <= 108; pitch++) {
      const sprite = new Sprite(Texture.WHITE);
      this.keySprites.set(pitch, sprite);
      const digit = new Sprite();
      digit.anchor.set(0.5, 1);
      digit.visible = false;
      this.keyDigits.set(pitch, digit);
      this.keyHints.addChild(digit);
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

    for (const { note, body, digit } of this.notes) {
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
      sprite.tint = state.pressed.has(pitch)
        ? PRESSED_COLOR
        : state.sounding.has(pitch)
          ? SOUNDING_COLOR
          : due
            ? HAND_HINT[due.hand]
            : isBlackKey(pitch)
              ? BLACK_KEY
              : WHITE_KEY;
      const hint = this.keyDigits.get(pitch);
      const key = this.keys.get(pitch);
      if (!hint || !key) continue;
      hint.visible = due?.finger !== undefined;
      if (due?.finger !== undefined) {
        hint.texture = this.digitTextures.get(due.finger) ?? Texture.EMPTY;
        hint.scale.set(Math.min(1, (key.width * 0.9) / 40));
        hint.x = key.x + key.width / 2;
        hint.y = keyboardTop + (height - keyboardTop) * (key.black ? BLACK_KEY_HEIGHT : 1) - 4;
      }
    }
  }

  destroy(): void {
    this.ready = false;
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
}
