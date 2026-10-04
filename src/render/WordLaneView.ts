import { Application } from "pixi.js";
import type { Texture } from "pixi.js";

import type { Hand } from "../fingering/fingering";
import type { NoteStatus } from "../practice/session";
import type { Song } from "../song/song";
import { bakeDigits, bakeNames } from "./bakeLabels";
import type { KeyRect } from "./keyboardLayout";
import { NotesLayer } from "./NotesLayer";
import type { Geometry } from "./viewGeometry";

/** Where a computer key's column is, in pixels from the lane's left edge. */
export interface LaneColumn {
  readonly x: number;
  readonly width: number;
}

/** What the lane reads every frame; song time comes from the session, as everywhere. */
export interface LaneSource {
  readonly time: () => number;
  readonly lookAhead: number;
  readonly statusOf: (noteId: string) => NoteStatus | undefined;
}

const BOTH_HANDS: ReadonlySet<Hand> = new Set(["left", "right"]);

/**
 * The word-typing lane: the piano lane's own falling notes (flat blocks, their glow, their
 * length and the finger), laid out over the computer keys instead of the piano's.
 */
export class WordLaneView {
  private readonly app = new Application();
  private notes: NotesLayer | undefined;
  private baked: Texture[] = [];
  private song: Song | undefined;
  private pitches: ReadonlyMap<string, number> = new Map();
  private columns: ReadonlyMap<string, LaneColumn> = new Map();
  private keys = new Map<number, KeyRect>();
  private geometry: Geometry | undefined;
  /** The size the hit line was laid out for. */
  private laidOut = { width: 0, height: 0 };
  private resizeObserver: ResizeObserver | undefined;

  constructor(private readonly source: LaneSource) {}

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
    this.app.stage.addChild(notes.root, notes.cards);
    this.notes = notes;
    if (this.song) notes.setSong(this.song);
    this.app.ticker.add(() => {
      this.draw();
    });
  }

  /** The lane's song and the stand-in pitch of each computer key it uses. */
  setSong(song: Song, pitches: ReadonlyMap<string, number>): void {
    this.song = song;
    this.pitches = pitches;
    this.notes?.setSong(song);
    this.placeKeys();
  }

  /** The computer keys' columns, measured from the keyboard under the lane. */
  setColumns(columns: ReadonlyMap<string, LaneColumn>): void {
    this.columns = columns;
    this.placeKeys();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.notes?.destroy();
    for (const texture of this.baked) texture.destroy(true);
    this.app.destroy({ removeView: true }, { children: true });
  }

  private placeKeys(): void {
    this.keys = new Map();
    for (const [code, pitch] of this.pitches) {
      const column = this.columns.get(code);
      if (column) this.keys.set(pitch, { pitch, black: false, x: column.x, width: column.width });
    }
    // Laid out again on the next frame.
    this.geometry = undefined;
  }

  private draw(): void {
    const notes = this.notes;
    if (!notes) return;
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
      this.laidOut = { width, height };
    }
    notes.draw(
      {
        time: this.source.time(),
        lookAhead: this.source.lookAhead,
        statusOf: this.source.statusOf,
        hands: BOTH_HANDS
      },
      this.keys,
      this.geometry,
      undefined
    );
  }
}
