import { Application, Container } from "pixi.js";
import type { FederatedPointerEvent, Texture } from "pixi.js";

import type { Finger, Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import type { ComboBoard, GradedStrike } from "../practice/combo";
import type { NoteStatus } from "../practice/session";
import type { Song, SongNote } from "../song/song";
import { bakeDigits, bakeNames } from "./bakeLabels";
import { bindKeyboardPointer } from "./bindKeyboardPointer";
import type { FallingNoteNames } from "./bakeLabels";
import { FINGER_COLOR } from "./fingerColors";
import { HandsLayer } from "./HandsLayer";
import { FxLayer } from "./FxLayer";
import type { FxKey } from "./FxLayer";
import { FpsMeter } from "./FpsMeter";
import { HudLayer } from "./HudLayer";
import { KeyboardLayer } from "./KeyboardLayer";
import type { KeyStyle } from "./KeyboardLayer";
import { HIGHEST_PITCH, LOWEST_PITCH, layoutKeyboard } from "./keyboardLayout";
import type { KeyRect } from "./keyboardLayout";
import { easePan, panToShow } from "./keyboardPan";
import type { Span } from "./keyboardPan";
import { HAND_COLOR, NotesLayer } from "./NotesLayer";
import { RoadLayer } from "./RoadLayer";
import type { RoadShape, Strike } from "./RoadLayer";
import { DEFAULT_CAMERA } from "./worldCamera";
import type { CameraPrefs } from "./worldCamera";
import { fitRange, viewGeometry } from "./viewGeometry";
import type { Geometry, ViewParts } from "./viewGeometry";

export type { FallingNoteNames } from "./bakeLabels";

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
  /** Pending notes that currently freeze the session in wait mode. */
  readonly waitingFor?: readonly SongNote[];
  readonly hands: ReadonlySet<Hand>;
  readonly hints?: boolean;
  /** A colour of the caller's choosing (a review grade); notes it colours are drawn solid. */
  readonly colorOf?: ((note: SongNote) => number | undefined) | undefined;
  /** The combo and accuracy board; none on a view that only mirrors another. */
  readonly board?: ComboBoard;
  /** Strikes graded since the last frame, shown over their keys at the hit line. */
  readonly graded?: readonly GradedStrike[];
}

/** Seconds the scroll takes to go most of the way to where it is headed. */
const PAN_SMOOTHING_S = 0.35;
/** How far ahead, as a share of the lane's time, the scroll looks for keys to bring in. */
const PAN_LOOK_AHEAD = 0.6;
/** Keys the scroll considers at most, earliest first. */
const PAN_NOTES = 24;
/** The road needs a longer approach so distant notes are readable before reaching the keys. */
const ROAD_LOOK_AHEAD_FACTOR = 4;
const NO_SOUNDING_KEYS: ReadonlySet<number> = new Set();

/**
 * The Synthesia-style picture: notes fall onto a keyboard, each carrying the
 * finger that plays it. Everything is a tinted sprite; the finger digits and
 * the key stickers are drawn once into textures.
 *
 * This class owns the Pixi application, the stage order, the layout and the
 * scroll along the keyboard; the notes, the keys, the hands and the road are
 * layers of their own that it lays out and draws every frame.
 */
export class FallingNotesView {
  onNoteClick: ((noteId: string) => void) | undefined;
  /** A key pressed or released with the mouse (or a finger on a touch screen). */
  onKeyPointer: ((event: KeyEvent) => void) | undefined;

  private readonly app = new Application();
  private notesLayer: NotesLayer | undefined;
  /** The keys and everything drawn on them: on the stage flat, or laid back under the road. */
  private readonly keysRoot = new Container();
  private keyboard: KeyboardLayer | undefined;
  private road: RoadLayer | undefined;
  private roadMode = false;
  private readonly hands = new HandsLayer();
  /** The combo board and the strikes' grades, over everything. */
  private readonly hud = new HudLayer();
  /** Bursts, light and glitter on the keys at the hit line. */
  private readonly fx = new FxLayer();
  /** Keys the program was sounding last frame: a key that starts to sound bursts too. */
  private readonly wasSounding = new Set<number>();
  private digitTextures = new Map<Finger, Texture>();
  private badgeTextures = new Map<Finger, Texture>();
  private nameTextures = new Map<string, Texture>();
  /** The song on screen: set before `mount`, it goes to the notes once they exist. */
  private song: Song | undefined;
  /** Its notes, earliest first: the scroll looks ahead through them. */
  private songNotes: readonly SongNote[] = [];
  private labels = false;
  /** Which parts are on screen: the falling notes, the keyboard, the hands over it. */
  private parts: ViewParts = { notes: true, keys: true, hands: false };
  private keys = new Map<number, KeyRect>();
  /** A white key's width in this layout, kept so a frame need not search the keys for it. */
  private whiteWidth = 0;
  /** The player wants the road; it shows only while both the notes and the keys are on screen. */
  private roadWanted = false;
  private range = { low: LOWEST_PITCH, high: HIGHEST_PITCH };
  /** The range follows the song, so the road may show more keys around it; a fixed range stays. */
  private rangeFitsSong = false;
  private rangeFitsViewport = false;
  private laidOutFor = { width: 0, height: 0 };
  private hudTop = 0;
  /** The next scroll lands on its target at once: a new song starts where its keys are. */
  private panSnap = true;
  /** The whole keyboard's width: wider than the view when it scrolls. */
  private total = 0;
  /** How far the view is scrolled along the keyboard. */
  private pan = 0;
  private ready = false;
  private resizeObserver: ResizeObserver | undefined;
  private fpsMeter: FpsMeter | undefined;
  private fpsVisible = false;
  private unbindKeyboardPointer: (() => void) | undefined;
  /** Settings made before `mount`, applied to the layers once they exist. */
  private noteNames: FallingNoteNames | undefined;
  private cards = true;
  private keyStyle: KeyStyle = "arcade";
  private cameraPrefs: CameraPrefs = DEFAULT_CAMERA;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x020c18,
      antialias: true,
      // Draw at the screen's pixel density, or text is blurred on scaled displays.
      resolution: window.devicePixelRatio,
      autoDensity: true
    });
    host.appendChild(this.app.canvas);
    this.fpsMeter = new FpsMeter(host, this.app.ticker);
    this.fpsMeter.setVisible(this.fpsVisible);
    // `resizeTo` follows the window only; the lane also changes when the staff above it does.
    this.resizeObserver = new ResizeObserver(() => {
      this.app.queueResize();
    });
    this.resizeObserver.observe(host);
    const renderer = this.app.renderer;
    this.digitTextures = bakeDigits(renderer);
    // Light digits for the cards' smoked glass.
    this.badgeTextures = bakeDigits(renderer, 0xffffff);
    this.nameTextures = bakeNames(renderer);
    const notes = new NotesLayer(renderer, {
      digits: this.digitTextures,
      badges: this.badgeTextures,
      names: this.nameTextures
    });
    notes.setNoteNames(this.noteNames);
    notes.setCards(this.cards);
    notes.setVisible(this.parts.notes);
    if (this.song) notes.setSong(this.song);
    this.notesLayer = notes;
    const keyboard = new KeyboardLayer(renderer, this.digitTextures, (event) =>
      this.onKeyPointer?.(event)
    );
    keyboard.container.visible = this.parts.keys;
    keyboard.showStickers(this.labels);
    this.keyboard = keyboard;
    this.road = new RoadLayer(renderer);
    this.road.setCamera(this.cameraPrefs);
    this.road.setPerspective(this.keyStyle === "perspective");
    this.road.container.visible = false;
    this.road.effects.visible = false;
    this.keysRoot.addChild(keyboard.container);
    // Pixi draws a Text the first time it is shown: wait for the web fonts, or the board is set
    // in a fallback face. Offline they never come, and the fallback is fine.
    await Promise.all([
      document.fonts.load("34px 'Russo One'"),
      document.fonts.load("700 20px Manrope")
    ]).catch(() => undefined);
    this.app.stage.addChild(
      this.road.container,
      notes.root,
      notes.cards,
      this.keysRoot,
      this.road.effects,
      this.hands.container,
      this.fx.container,
      this.hud.container
    );
    await Promise.all([
      this.fx.load(),
      notes.loadNeon(),
      this.road.loadArrivalEffects(),
      this.hands.load()
    ]);
    // On the road the keys are a picture: the stage finds the key under the mouse itself.
    const stage = this.app.stage;
    stage.eventMode = "static";
    stage.hitArea = this.app.screen;
    this.unbindKeyboardPointer = bindKeyboardPointer(
      stage,
      this.app.canvas,
      (event) => {
        this.keysPointer(event);
      },
      () => {
        keyboard.releaseMouse();
      }
    );
    await keyboard.loadPaintedFaces(this.keyStyle);
    this.ready = true;
  }

  /** Note names on the falling notes, over the finger; undefined hides them. */
  setNoteNames(style: FallingNoteNames | undefined): void {
    this.noteNames = style;
    this.notesLayer?.setNoteNames(style);
  }

  /** The look of the keys: classic, or arcade in a case. */
  setKeyStyle(style: KeyStyle): void {
    if (style === this.keyStyle) return;
    this.keyStyle = style;
    this.road?.setPerspective(style === "perspective");
    this.laidOutFor = { width: 0, height: 0 };
    const keyboard = this.keyboard;
    if (!keyboard) return;
    void keyboard.loadPaintedFaces(style).then(() => {
      this.laidOutFor = { width: 0, height: 0 };
    });
  }

  /** Each falling note carries a card with the note written on a staff; off, plain bars. */
  setNoteCards(on: boolean): void {
    this.cards = on;
    this.notesLayer?.setCards(on);
  }

  /** Note names, key numbers and a mini staff on every key, like classroom stickers. */
  setShowLabels(show: boolean): void {
    this.labels = show;
    this.keyboard?.showStickers(show);
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** Renderer diagnostics do not affect song time or the scene layout. */
  setFpsVisible(visible: boolean): void {
    this.fpsVisible = visible;
    this.fpsMeter?.setVisible(visible);
  }

  /** The keys shown, lowest to highest; fewer keys are wider. */
  setRange(low: number, high: number, fitsSong = false, fitsViewport = false): void {
    this.range = { low, high };
    this.rangeFitsSong = fitsSong;
    this.rangeFitsViewport = fitsViewport;
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
    this.notesLayer?.setVisible(parts.notes);
    if (this.keyboard) this.keyboard.container.visible = parts.keys;
    if (!this.hands.container.visible) this.hands.reset();
    this.syncRoad();
    this.laidOutFor = { width: 0, height: 0 };
  }

  /**
   * The trial road view: the notes come out of the horizon in perspective,
   * glowing, with sparks in their finger's colour where they are struck.
   * Notes cannot be clicked there: the lane is a picture laid on the road.
   * The keys are one too, so the stage finds the key under the mouse.
   */
  /** Keep the combo below an overlaid score without shortening the road behind it. */
  setHudTop(top: number): void {
    if (top === this.hudTop) return;
    this.hudTop = top;
    this.laidOutFor = { width: 0, height: 0 };
  }

  setRoadShape(shape: RoadShape): void {
    this.road?.setShape(shape);
    this.laidOutFor = { width: 0, height: 0 };
  }

  setCamera(prefs: CameraPrefs): void {
    this.cameraPrefs = prefs;
    this.road?.setCamera(prefs);
    this.laidOutFor = { width: 0, height: 0 };
  }

  setRoad(on: boolean): void {
    this.roadWanted = on;
    this.syncRoad();
  }

  /** Puts the road on or off: on when asked for and the notes show, with or without the keys. */
  private syncRoad(): void {
    const on = this.roadWanted && this.parts.notes;
    if (!this.road || !this.notesLayer || on === this.roadMode) return;
    this.roadMode = on;
    this.keyboard?.showFelt(!on);
    this.road.container.visible = on;
    this.road.effects.visible = on;
    if (on) this.app.stage.removeChild(this.notesLayer.root, this.keysRoot);
    else {
      this.app.stage.addChildAt(this.notesLayer.root, 1);
      this.app.stage.addChildAt(this.keysRoot, 3);
    }
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** Physical/legacy keys and the flat key fallback share the stage's pointer gesture. */
  private keysPointer(event: FederatedPointerEvent): void {
    if (event.target !== this.app.stage || !this.parts.keys) return;
    const point = this.roadMode
      ? this.road?.keysPointAt(event.global.x, event.global.y)
      : { x: event.global.x + this.pan, y: event.global.y };
    const pitch = point && this.keyboard?.pitchAt(point.x, point.y);
    if (pitch !== undefined) this.keyboard?.pressWithMouse(pitch);
  }

  /** Runs `onFrame` with real milliseconds before every draw. */
  onTick(onFrame: (deltaMs: number) => void): void {
    this.app.ticker.add((ticker) => {
      onFrame(ticker.deltaMS);
    });
  }

  setSong(song: Song): void {
    this.hands.setSong(song);
    this.notesLayer?.setSong(song);
    this.song = song;
    this.songNotes = song.notes;
    this.hud.clear();
    this.fx.clear();
    this.wasSounding.clear();
    // The new song's keys are elsewhere: the scroll lands on them rather than gliding there.
    this.panSnap = true;
  }

  draw(frame: FrameState): void {
    if (!this.ready || !this.notesLayer || !this.keyboard) return;
    // Song time is shared; the road alone previews a longer approach.
    const state = frame;
    const { width, height } = this.app.screen;
    if (width !== this.laidOutFor.width || height !== this.laidOutFor.height) {
      this.layout(width, height);
    }
    const geometry = this.geometry(height);
    this.scroll(state, width);
    const road = this.roadMode ? this.road : undefined;
    this.notesLayer.draw(
      road ? { ...state, lookAhead: state.lookAhead * ROAD_LOOK_AHEAD_FACTOR } : state,
      this.keys,
      geometry,
      road
    );
    // Notes crossing the hit line right now: their finger is shown on the key too.
    const playing = this.notesLayer.playing;
    this.keyboard.draw(
      {
        pressed: state.pressed,
        // Only the key-colour layer hides accompaniment; fire follows every sounding note.
        sounding: state.hands.size === 0 ? state.sounding : NO_SOUNDING_KEYS,
        due: state.due,
        playing,
        ...(state.hints === undefined ? {} : { hints: state.hints })
      },
      this.keys,
      geometry,
      this.labels
    );
    if (this.hands.container.visible) {
      this.hands.draw(
        state.time,
        this.app.ticker.deltaMS / 1000,
        state.hands,
        this.keys,
        geometry,
        (x, y, reach) => (road ? road.handPlace(x, y, geometry, reach) : { x: x - this.pan, y }),
        state.waitingFor ?? []
      );
    }
    // The road takes a picture of the keys; whole hands stay in their own projected overlay.
    if (road) {
      const strikes: Strike[] = [];
      for (const [pitch, note] of playing) {
        const key = this.keys.get(pitch);
        // The player's own notes while held, and the program's while it sounds them.
        const own = state.hands.has(note.hand) && state.pressed.has(pitch);
        if (!key || !(own || state.sounding.has(pitch))) continue;
        const color = note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand];
        strikes.push({ pitch, x: key.x + key.width / 2, color });
      }
      road.draw(
        this.notesLayer.root,
        this.keysRoot,
        strikes,
        this.notesLayer.arrivals,
        this.app.ticker.deltaMS / 1000
      );
    }
    const hitLineY = road ? road.hitLineY : geometry.hitY;
    const fxKey = (pitch: number): FxKey | undefined => {
      const key = this.keys.get(pitch);
      if (!key) return undefined;
      const note = playing.get(pitch) ?? state.due.find((item) => item.pitch === pitch);
      const color =
        note?.finger !== undefined
          ? FINGER_COLOR[note.finger]
          : note
            ? HAND_COLOR[note.hand]
            : 0xffffff;
      const projected = road?.notePlace(key.x + key.width / 2, geometry.hitY);
      return {
        pitch,
        x: projected?.x ?? key.x + key.width / 2 - this.pan,
        width: key.width * (projected?.scale ?? 1),
        y: projected?.y ?? hitLineY,
        color
      };
    };
    const struck: FxKey[] = [];
    for (const strike of state.graded ?? []) {
      const key = strike.grade === "miss" ? undefined : fxKey(strike.pitch);
      if (key) struck.push(key);
    }
    // The program's own notes, for the hand the player leaves to it, flash as they sound.
    for (const pitch of state.sounding) {
      const key = this.wasSounding.has(pitch) ? undefined : fxKey(pitch);
      if (key) struck.push(key);
    }
    this.wasSounding.clear();
    for (const pitch of state.sounding) this.wasSounding.add(pitch);
    // A note burns away on its key while it sounds: the player's held notes and the program's.
    const sounding: FxKey[] = [];
    for (const [pitch, note] of playing) {
      const own = state.hands.has(note.hand) && state.pressed.has(pitch);
      const key = own || state.sounding.has(pitch) ? fxKey(pitch) : undefined;
      if (key) sounding.push(key);
    }
    this.fx.draw(struck, sounding, hitLineY, this.app.ticker.deltaMS / 1000);
    // React's GameBoard owns the score panels; Pixi only draws transient strike grades.
    this.hud.draw(
      undefined,
      state.graded ?? [],
      (pitch) => {
        const key = this.keys.get(pitch);
        return (
          key &&
          (road?.notePlace(key.x + key.width / 2, geometry.hitY)?.x ??
            key.x + key.width / 2 - this.pan)
        );
      },
      hitLineY,
      this.app.ticker.deltaMS / 1000
    );
  }

  /**
   * Scrolls a keyboard wider than the view towards the keys to play next,
   * the player's hands' first (every hand's when listening), smoothly.
   */
  private scroll(state: FrameState, width: number): void {
    let pan = Math.min(0, (this.total - width) / 2);
    if (this.total > width) {
      const until = state.time + state.lookAhead * PAN_LOOK_AHEAD;
      const spans: Span[] = [];
      for (const note of this.songNotes) {
        if (note.start >= until) break;
        if (note.start + note.duration <= state.time) continue;
        if (state.hands.size > 0 && !state.hands.has(note.hand)) continue;
        const key = this.keys.get(note.pitch);
        if (key) spans.push({ left: key.x, right: key.x + key.width });
        if (spans.length >= PAN_NOTES) break;
      }
      const target = panToShow(this.pan, spans, width, this.total, this.whiteWidth);
      pan = this.panSnap
        ? target
        : easePan(this.pan, target, this.app.ticker.deltaMS / 1000, PAN_SMOOTHING_S);
      // The ease never quite arrives: settle once it is within half a pixel.
      if (Math.abs(target - pan) < 0.5) pan = target;
    }
    this.panSnap = false;
    this.pan = pan;
    // Flat, the lane and the keys slide; on the road they are pictures and the road scrolls them.
    const flat = this.roadMode ? 0 : -pan;
    if (this.notesLayer) {
      this.notesLayer.root.x = flat;
      this.notesLayer.cards.x = flat;
    }
    this.keysRoot.x = flat;
    if (this.roadMode) this.road?.setPan(pan);
  }

  destroy(): void {
    this.unbindKeyboardPointer?.();
    this.fpsMeter?.destroy();
    this.ready = false;
    this.resizeObserver?.disconnect();
    // Off the stage in the road view, so the stage's own destroy would miss them.
    if (this.roadMode) {
      this.notesLayer?.root.destroy({ children: true });
      this.keysRoot.destroy({ children: true });
    }
    this.road?.destroy();
    this.hands.destroy();
    this.notesLayer?.destroy();
    const baked = [
      ...this.digitTextures.values(),
      ...this.badgeTextures.values(),
      ...this.nameTextures.values()
    ];
    for (const texture of baked) texture.destroy(true);
    this.app.destroy({ removeView: true }, { children: true });
  }

  private geometry(height: number): Geometry {
    return viewGeometry(height, this.whiteWidth, this.parts, this.labels, this.rangeFitsViewport);
  }

  private layout(width: number, height: number): void {
    this.laidOutFor = { width, height };
    const { low, high, total } = fitRange(
      width,
      this.range.low,
      this.range.high,
      this.rangeFitsSong,
      width <= 900 || window.matchMedia("(height <= 500px), (pointer: coarse)").matches,
      this.rangeFitsViewport
    );
    this.total = total;
    this.pan = Math.min(this.pan, Math.max(0, total - width));
    this.keys = layoutKeyboard(total, low, high);
    this.whiteWidth = [...this.keys.values()].find((key) => !key.black)?.width ?? 0;
    const geometry = this.geometry(height);
    this.keyboard?.layout(this.keys, geometry, total);
    // The hands' pixels belong to the old layout.
    this.hands.reset();
    this.notesLayer?.layout(this.keys, geometry.hitY, total);
    // The road ends on the felt, where the notes meet the keys.
    if (this.road) {
      const handRoom = this.parts.hands
        ? height - geometry.keyboardTop - geometry.keyboardHeight
        : 0;
      this.road.layout(total, geometry.hitY, height, width, handRoom);
      this.road.setKeyboard(this.keys, geometry);
      // The road shows itself when it fits; off, it stays hidden whatever the layout.
      if (!this.roadMode) {
        this.road.container.visible = false;
        this.road.effects.visible = false;
      }
    }
    this.hud.layout(
      width,
      this.roadMode && this.road ? this.road.hitLineY : geometry.hitY,
      this.hudTop
    );
  }
}
