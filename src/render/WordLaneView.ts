import { Application } from "pixi.js";
import type { Texture } from "pixi.js";

import type { Hand } from "../fingering/fingering";
import type { NoteStatus } from "../practice/session";
import type { Song, SongNote } from "../song/song";
import { bakeDigits, bakeNames } from "./bakeLabels";
import type { FrameState } from "./FallingNotesView";
import { TYPING_FINGER_COLOR } from "./fingerColors";
import { FxLayer } from "./FxLayer";
import type { FxKey } from "./FxLayer";
import { HudLayer } from "./HudLayer";
import type { KeyRect } from "./keyboardLayout";
import { NotesLayer } from "./NotesLayer";
import type { Geometry } from "./viewGeometry";

/** Where a computer key's column is, in pixels from the lane's left edge. */
export interface LaneColumn {
  readonly x: number;
  readonly width: number;
}

/** The lane's song, as `laneSong` builds it. */
export interface LaneSongData {
  readonly song: Song;
  readonly columns: ReadonlyMap<string, number>;
  readonly realPitch: ReadonlyMap<string, number>;
}

const BOTH_HANDS: ReadonlySet<Hand> = new Set(["left", "right"]);

/**
 * The word-typing lane: the piano lane's own falling notes (flat blocks, their glow, their
 * length and the finger), its bursts, burning and grades, laid out over the computer keys
 * instead of the piano's. It draws the trainer's own frames, so it shares the one clock.
 */
export class WordLaneView {
  private readonly app = new Application();
  private readonly fx = new FxLayer();
  private readonly hud = new HudLayer();
  private notes: NotesLayer | undefined;
  private baked: Texture[] = [];
  private data: LaneSongData | undefined;
  /** The lane's notes by id, for a note due at a real pitch. */
  private laneNotes = new Map<string, SongNote>();
  private columns: ReadonlyMap<string, LaneColumn> = new Map();
  private keys = new Map<number, KeyRect>();
  private geometry: Geometry | undefined;
  /** The size the hit line was laid out for. */
  private laidOut = { width: 0, height: 0 };
  private resizeObserver: ResizeObserver | undefined;
  private statusOf: ((noteId: string) => NoteStatus | undefined) | undefined;
  /** The note the player owes next, as last reported. */
  private dueId: string | undefined;
  private onDue: ((noteId: string | undefined) => void) | undefined;
  /** The typing palette; a missed note keeps the lane's own red. */
  private readonly colorOf = (note: SongNote): number | undefined =>
    note.finger === undefined || this.statusOf?.(note.id) === "missed"
      ? undefined
      : TYPING_FINGER_COLOR[note.hand][note.finger];

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x020c18,
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true
    });
    host.appendChild(this.app.canvas);
    this.resizeObserver = new ResizeObserver(() => {
      this.app.queueResize();
    });
    this.resizeObserver.observe(host);
    const renderer = this.app.renderer;
    const digits = bakeDigits(renderer);
    const badges = bakeDigits(renderer, 0xffffff);
    const names = bakeNames(renderer);
    this.baked = [...digits.values(), ...badges.values(), ...names.values()];
    const notes = new NotesLayer(renderer, { digits, badges, names });
    notes.setCards(false);
    this.app.stage.addChild(notes.root, notes.cards, this.fx.container, this.hud.container);
    this.notes = notes;
    if (this.data) notes.setSong(this.data.song);
    await this.fx.load();
  }

  setSong(data: LaneSongData): void {
    this.data = data;
    this.laneNotes = new Map(data.song.notes.map((note) => [note.id, note]));
    this.notes?.setSong(data.song);
    this.fx.clear();
    this.hud.clear();
    this.placeKeys();
  }

  /** Told the note the player owes next, the frame it changes; undefined while paused. */
  setOnDue(listener: ((noteId: string | undefined) => void) | undefined): void {
    this.onDue = listener;
  }

  /** The computer keys' columns, measured from the keyboard under the lane. */
  setColumns(columns: ReadonlyMap<string, LaneColumn>): void {
    this.columns = columns;
    this.placeKeys();
  }

  /** One of the trainer's frames, drawn over the computer keys. */
  draw(frame: FrameState): void {
    const notes = this.notes;
    const data = this.data;
    if (!notes || !data) return;
    const { width, height } = this.app.screen;
    if (!this.geometry || width !== this.laidOut.width || height !== this.laidOut.height) {
      const first = this.keys.values().next().value;
      this.geometry = {
        keyboardTop: height,
        keyboardHeight: 0,
        blackHeight: 0,
        whiteWidth: first?.width ?? 0,
        hitY: height - 1,
        feltHeight: 0
      };
      // No per-key guides: the computer keys' rows are staggered. Only the hit line.
      notes.layout(new Map(), this.geometry.hitY, width);
      this.hud.layout(width, this.geometry.hitY);
      this.laidOut = { width, height };
    }
    const { hitY } = this.geometry;
    this.statusOf = frame.statusOf;
    const dueId = frame.due[0]?.id;
    if (dueId !== this.dueId) {
      this.dueId = dueId;
      this.onDue?.(dueId);
    }
    // Every note of the lane is the player's, whichever hand types it.
    notes.draw(
      { ...frame, hands: BOTH_HANDS, colorOf: this.colorOf },
      this.keys,
      this.geometry,
      undefined
    );
    const seconds = this.app.ticker.deltaMS / 1000;
    const struck: FxKey[] = [];
    for (const strike of frame.graded ?? []) {
      const key = strike.grade === "miss" ? undefined : this.strikeKey(strike.pitch, frame);
      if (key) struck.push(key);
    }
    // A held note burns away on its key, as on the piano.
    const sounding: FxKey[] = [];
    for (const [pitch, note] of notes.playing) {
      const real = data.realPitch.get(note.id);
      const key =
        real !== undefined && frame.pressed.has(real) ? this.fxKey(pitch, note) : undefined;
      if (key) sounding.push(key);
    }
    this.fx.draw(struck, sounding, hitY, seconds);
    this.hud.draw(
      undefined,
      frame.graded ?? [],
      (pitch) => this.strikeKey(pitch, frame)?.x,
      hitY,
      seconds
    );
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.notes?.destroy();
    for (const texture of this.baked) texture.destroy(true);
    this.app.destroy({ removeView: true }, { children: true });
  }

  private placeKeys(): void {
    this.keys = new Map();
    for (const [code, pitch] of this.data?.columns ?? []) {
      const column = this.columns.get(code);
      if (column) this.keys.set(pitch, { pitch, black: false, x: column.x, width: column.width });
    }
    // Laid out again on the next frame.
    this.geometry = undefined;
  }

  /** Where a strike at a real pitch lands: the sounding note of that pitch, else the one due. */
  private strikeKey(realPitch: number, frame: FrameState): FxKey | undefined {
    const data = this.data;
    if (!data || !this.notes) return undefined;
    for (const [pitch, note] of this.notes.playing) {
      if (data.realPitch.get(note.id) === realPitch) return this.fxKey(pitch, note);
    }
    const due = frame.due.find((note) => note.pitch === realPitch);
    const note = due && this.laneNotes.get(due.id);
    return note && this.fxKey(note.pitch, note);
  }

  private fxKey(pitch: number, note: SongNote): FxKey | undefined {
    const key = this.keys.get(pitch);
    if (!key) return undefined;
    return {
      pitch,
      x: key.x + key.width / 2,
      width: key.width,
      color: note.finger !== undefined ? TYPING_FINGER_COLOR[note.hand][note.finger] : 0xffffff
    };
  }
}
