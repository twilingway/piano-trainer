import { Application, Container, Texture } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";

import type { Finger } from "../fingering/fingering";
import type { Locale } from "../i18n/locales";
import type { KeyEvent } from "../input/midiInput";
import type { Song, SongNote } from "../song/song";
import { publishOverlayLayout } from "./viewOverlayLayout";
import { bakeDigits, bakeNames } from "./bakeLabels";
import { bindKeyboardPointer } from "./bindKeyboardPointer";
import { ComputerKeyboardLayer } from "./ComputerKeyboardLayer";
import type { KeysLayer } from "./ComputerKeyboardLayer";
import { computerGeometry, computerWidth, layoutComputerKeys } from "./computerKeyboardLayout";
import { ComputerKeys, noteColor } from "./computerKeys";
import type { ComputerKeyboard } from "./computerKeys";
import type { FallingNoteNames } from "./bakeLabels";
import { HandsLayer } from "./HandsLayer";
import { FxLayer } from "./FxLayer";
import type { FxKey } from "./FxLayer";
import { FpsMeter } from "./FpsMeter";
import { loadViewAssets, loadViewFonts } from "./viewAssets";
import type { FrameState } from "./frameState";
import { HudLayer } from "./HudLayer";
import { KeyboardLayer } from "./KeyboardLayer";
import type { KeyStyle } from "./KeyboardLayer";
import { HIGHEST_PITCH, LOWEST_PITCH, layoutKeyboard } from "./keyboardLayout";
import type { KeyRect } from "./keyboardLayout";
import { easePan, panToShow } from "./keyboardPan";
import type { Span } from "./keyboardPan";
import { NotesLayer } from "./NotesLayer";
import { RoadLayer } from "./RoadLayer";
import type { RoadShape, Strike } from "./RoadLayer";
import { DEFAULT_CAMERA } from "./worldCamera";
import type { CameraPrefs } from "./worldCamera";
import { USUAL_PLACEMENT, fitRange, viewGeometry } from "./viewGeometry";
import type { Geometry, KeysPlacement, ViewParts } from "./viewGeometry";

export type { FallingNoteNames } from "./bakeLabels";
export type { FrameState } from "./frameState";

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
  /** The word mode's computer keys, standing in for the piano's while `computer` is set. */
  private computerKeyboard: ComputerKeyboardLayer | undefined;
  private computer: ComputerKeys | undefined;
  private road: RoadLayer | undefined;
  private roadMode = false;
  /** Whole hands over the keys; the app sets their look directly. */
  readonly hands = new HandsLayer();
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
  /** Where the player dragged the keys: lifted off the bottom, larger or smaller. */
  private placement: KeysPlacement = USUAL_PLACEMENT;
  /** The keys' offset as drawn: moved down no further than the view's bottom. */
  private offset = { x: 0, y: 0 };
  private keysFloor = Number.POSITIVE_INFINITY;
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
  private locale: Locale = "ru";
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
    this.fpsMeter = new FpsMeter(host, this.app.ticker, this.locale, this.fpsVisible);
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
    keyboard.showStickers(this.labels);
    this.keyboard = keyboard;
    const computerKeyboard = new ComputerKeyboardLayer(renderer, (event) => {
      this.onKeyPointer?.(event);
    });
    computerKeyboard.setKeys(this.computer);
    computerKeyboard.showStickers(this.labels);
    this.computerKeyboard = computerKeyboard;
    this.road = new RoadLayer(renderer, this.app, keyboard);
    this.road.setCamera(this.cameraPrefs);
    this.road.setKeyStyle(this.keyStyle);
    this.road.container.visible = false;
    this.road.effects.visible = false;
    this.keysRoot.addChild(keyboard.container, computerKeyboard.container);
    this.syncKeyboards();
    // Pixi draws a Text the first time it is shown: wait for the web fonts, or the board is set
    // in a fallback face. Offline they never come, and the fallback is fine.
    await loadViewFonts();
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
    await loadViewAssets(this.fx, notes, this.road, this.hands);
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
        this.keysLayer?.releaseMouse();
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
    this.road?.setKeyStyle(style);
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
    this.computerKeyboard?.showStickers(show);
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** Renderer diagnostics do not affect song time or the scene layout. */
  setFpsVisible(visible: boolean): void {
    this.fpsVisible = visible;
    this.fpsMeter?.setVisible(visible);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.hud.setLocale(locale);
    this.fpsMeter?.setLocale(locale);
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
    this.notesLayer?.setVisible(parts.notes);
    this.syncKeyboards();
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

  setKeysPlacement(placement: KeysPlacement): void {
    // Moved keys only shift with the scroll; a lift or a size lays the view out again.
    const { lift, scale } = this.placement;
    this.placement = placement;
    if (placement.lift !== lift || placement.scale !== scale)
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
    this.computerKeyboard?.showFelt(!on);
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
      : { x: event.global.x + this.pan - this.offset.x, y: event.global.y - this.offset.y };
    const pitch = point && this.keysLayer?.pitchAt(point.x, point.y);
    if (pitch !== undefined) this.keysLayer?.pressWithMouse(pitch);
  }

  /**
   * The word mode: the computer keys in place of the piano's, each a column of the falling notes
   * (`tokens` say what each key types and plays); undefined brings the piano back.
   */
  setComputerKeys(keys: ComputerKeyboard | undefined): void {
    this.keysLayer?.releaseMouse();
    const letter = (text: string) => this.computerKeyboard?.letter(text) ?? Texture.EMPTY;
    this.computer = keys
      ? new ComputerKeys(keys.tokens, keys.language, letter, keys.wordPitch)
      : undefined;
    this.computerKeyboard?.setKeys(this.computer);
    this.syncKeyboards();
    if (this.song) this.setSong(this.song);
    this.laidOutFor = { width: 0, height: 0 };
  }

  /** The keyboard on screen: the computer's in the word mode, else the piano's. */
  private get keysLayer(): KeysLayer | undefined {
    return this.computer ? this.computerKeyboard : this.keyboard;
  }

  /** Shows the keyboard of the mode; the hands lie over piano keys only. */
  private syncKeyboards(): void {
    const computer = this.computer !== undefined;
    if (this.keyboard) this.keyboard.container.visible = this.parts.keys && !computer;
    if (this.computerKeyboard)
      this.computerKeyboard.container.visible = this.parts.keys && computer;
    this.hands.container.visible = this.parts.hands && this.parts.keys && !computer;
    if (!this.hands.container.visible) this.hands.reset();
  }

  /** Runs `onFrame` with real milliseconds before every draw. */
  onTick(onFrame: (deltaMs: number) => void): void {
    this.app.ticker.add((ticker) => {
      onFrame(ticker.deltaMS);
    });
  }

  setSong(song: Song): void {
    // The word mode draws the song one column a computer key.
    const shown = this.computer?.mapSong(song) ?? song;
    this.hands.setSong(shown);
    this.notesLayer?.setSong(shown, this.computer?.look);
    this.song = song;
    this.songNotes = shown.notes;
    this.hud.clear();
    this.fx.clear();
    this.wasSounding.clear();
    // The new song's keys are elsewhere: the scroll lands on them rather than gliding there.
    this.panSnap = true;
  }

  draw(frame: FrameState): void {
    if (!this.ready || !this.notesLayer || !this.keyboard) return;
    // Song time is shared; the road alone previews a longer approach.
    const state = this.computer?.frame(frame) ?? frame;
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
    this.keysLayer?.draw(
      {
        pressed: state.pressed,
        // Only the key-colour layer hides accompaniment; fire follows every sounding note.
        sounding: state.hands.size === 0 ? state.sounding : NO_SOUNDING_KEYS,
        due: state.due,
        hintTime: state.hintTime ?? state.time,
        hintSpeed: state.hintSpeed ?? 1,
        waiting: (state.waitingFor?.length ?? 0) > 0,
        ...(state.hintNotes ? { hintNotes: state.hintNotes } : {}),
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
        state.waitingFor ?? [],
        state.hintSpeed ?? 1
      );
    }
    // The road takes a picture of the keys; whole hands stay in their own projected overlay.
    if (road) {
      const strikes: Strike[] = [];
      for (const [pitch, note] of playing) {
        const key = this.keys.get(pitch);
        // The player's own notes while held, and the program's while it sounds them.
        const own = state.owns(note) && state.pressed.has(pitch);
        if (!key || !(own || state.sounding.has(pitch))) continue;
        strikes.push({ pitch, x: key.x + key.width / 2, color: noteColor(note, this.computer) });
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
      const color = note ? noteColor(note, this.computer) : 0xffffff;
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
      const own = state.owns(note) && state.pressed.has(pitch);
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
        if (state.hands.size > 0 && !state.owns(note)) continue;
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
    // The keys may be moved off the hit line, the hands with them; the notes stay on it.
    this.offset = { x: this.placement.x, y: Math.min(this.placement.y, this.keysFloor) };
    this.keysRoot.position.set(flat + this.offset.x, this.offset.y);
    this.hands.container.position.copyFrom(this.offset);
    this.road?.setKeysOffset(this.offset);
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
    this.computerKeyboard?.destroy();
    this.hands.destroy();
    this.notesLayer?.destroy();
    for (const baked of [this.digitTextures, this.badgeTextures, this.nameTextures])
      for (const texture of baked.values()) texture.destroy(true);
    this.app.destroy({ removeView: true }, { children: true });
  }

  private geometry(height: number): Geometry {
    const { parts, placement, labels, rangeFitsViewport: fits } = this;
    if (this.computer) return computerGeometry(height, this.total, parts, placement);
    return viewGeometry(height, this.whiteWidth, parts, labels, fits, placement);
  }

  private layout(width: number, height: number): void {
    this.laidOutFor = { width, height };
    // The computer keys fill the width; the piano's range may be wider and scroll.
    const total = this.computer ? computerWidth(width, this.placement.scale) : this.fitPiano(width);
    this.total = total;
    this.pan = Math.min(this.pan, Math.max(0, total - width));
    const geometry = this.geometry(height);
    if (this.computer) this.keys = layoutComputerKeys(total, geometry).keys;
    this.keysLayer?.layout(this.keys, geometry, total);
    // The hands' pixels belong to the old layout.
    this.hands.reset();
    // The computer keys lie in staggered rows: no lane guides between them, only the hit line.
    this.notesLayer?.layout(this.computer ? new Map() : this.keys, geometry.hitY, total);
    // The road ends on the felt, where the notes meet the keys.
    // Lifted keys leave the floor under them empty: the road and its keys end above it.
    const floor = this.parts.keys ? height * this.placement.lift : 0;
    const keysBottom = geometry.keyboardTop + geometry.keyboardHeight;
    this.keysFloor = height - keysBottom;
    if (this.road) {
      const handRoom = this.parts.hands ? height - floor - keysBottom : 0;
      this.road.layout(total, geometry.hitY, height - floor, width, handRoom);
      // On the road the computer keyboard is one slab, its picture its face.
      this.road.setKeyboard(
        this.computer ? new Map([[0, { pitch: 0, black: false, x: 0, width: total }]]) : this.keys,
        geometry
      );
      // The road shows itself when it fits; off, it stays hidden whatever the layout.
      if (!this.roadMode) {
        this.road.container.visible = false;
        this.road.effects.visible = false;
      }
    }
    const hitLineY = this.roadMode && this.road ? this.road.hitLineY : geometry.hitY;
    this.hud.layout(width, hitLineY, this.hudTop);
    // Where the notes meet the keys, for the page's overlays: the word mode's text sits over it.
    publishOverlayLayout(this.app.canvas.parentElement, hitLineY, keysBottom, this.hudTop);
  }

  /** Fits the piano's range to `width`, lays its keys out and returns their whole width. */
  private fitPiano(width: number): number {
    const { low, high, total } = fitRange(
      width,
      this.range.low,
      this.range.high,
      this.rangeFitsSong,
      width <= 900 || window.matchMedia("(height <= 500px), (pointer: coarse)").matches,
      this.rangeFitsViewport
    );
    this.keys = layoutKeyboard(total, low, high);
    this.whiteWidth = [...this.keys.values()].find((key) => !key.black)?.width ?? 0;
    return total;
  }
}
