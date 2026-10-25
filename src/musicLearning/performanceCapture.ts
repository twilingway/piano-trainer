import type { Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import { TWO_HAND_HORIZON_MS } from "../reading/twoHandTypes";
import { MUSIC_MATERIAL_LIMIT } from "./material";
import type { MusicNote } from "./types";

export interface MusicPerformanceInput {
  readonly source: "midi" | "keyboard" | "pointer";
  readonly deviceId?: string;
  readonly channel?: number;
}
export interface MusicPerformanceCaptureOptions {
  readonly presentationId: string;
  readonly input: MusicPerformanceInput;
}
export interface MusicPerformanceReceipt {
  readonly presentationId: string;
  readonly raw: number;
  readonly corrected: number;
  readonly received: number;
  /** Historical beat at corrected event time, read from the existing PracticeSession. */
  readonly songBeat: number | undefined;
  /** Score part / input route only; this does not identify the player's physical hand. */
  readonly hand: Hand;
  readonly admitted: boolean;
  readonly playing: boolean;
}
export type MusicPerformanceCaptureStatus = "prepared" | "active" | "finished" | "cancelled";
export interface MusicPerformanceCaptureSnapshot {
  readonly heldCount: number;
  /** Completed notes in continuous quarter-note units, without score-grid quantization. */
  readonly notes: readonly MusicNote[];
  readonly status: MusicPerformanceCaptureStatus;
}
export interface MusicPerformanceAcceptance {
  readonly down: boolean;
  readonly up: boolean;
}
interface CapturedAttack {
  readonly pitch: number;
  readonly startBeat: number;
  readonly hand: Hand;
  durationBeats: number | null;
}
interface PhysicalDown {
  readonly raw: number;
  attack: CapturedAttack | null;
}
const IGNORE: MusicPerformanceAcceptance = { down: false, up: false };
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 512;
const time = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;
const beat = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
function validOrigin(event: MusicPerformanceInput): boolean {
  return (
    ["midi", "keyboard", "pointer"].includes(event.source) &&
    (event.deviceId === undefined || text(event.deviceId)) &&
    (event.channel === undefined ||
      (Number.isInteger(event.channel) && event.channel >= 1 && event.channel <= 16))
  );
}
function validKey(event: KeyEvent): boolean {
  return (
    ["down", "up"].includes(event.type) &&
    Number.isInteger(event.pitch) &&
    event.pitch >= 0 &&
    event.pitch <= 127 &&
    Number.isFinite(event.velocity) &&
    event.velocity >= 0 &&
    event.velocity <= 127 &&
    event.source !== undefined &&
    validOrigin({ ...event, source: event.source })
  );
}
const owner = (event: KeyEvent): string =>
  JSON.stringify([event.source, event.deviceId ?? "", event.channel ?? 0, event.pitch]);

/** Physical capture only: no target-pitch filtering, musical clock, finger grading or audio claims. */
export class MusicPerformanceCapture {
  private readonly options: MusicPerformanceCaptureOptions;
  private readonly held = new Map<string, PhysicalDown>();
  private readonly releases = new Map<string, number>();
  private readonly attacks: CapturedAttack[] = [];
  private ready = false;
  private paused = false;
  private boundary = 0;
  private received = 0;
  private terminal: "finished" | "cancelled" | null = null;
  constructor(options: MusicPerformanceCaptureOptions) {
    if (!text(options.presentationId) || !validOrigin(options.input))
      throw new RangeError("Invalid performance capture identity");
    this.options = { presentationId: options.presentationId, input: { ...options.input } };
  }
  setReady(ready: boolean, correctedBoundaryMs: number): void {
    if (
      this.terminal ||
      typeof ready !== "boolean" ||
      !time(correctedBoundaryMs) ||
      correctedBoundaryMs < this.boundary
    )
      return;
    this.ready = ready;
    this.boundary = correctedBoundaryMs;
  }
  setPaused(paused: boolean, boundaryMs: number): void {
    if (
      this.terminal ||
      typeof paused !== "boolean" ||
      !time(boundaryMs) ||
      boundaryMs < this.boundary
    )
      return;
    this.paused = paused;
    this.boundary = boundaryMs;
  }
  /** Ownership handoff never supplies attacks. Replacing an unfinished attack cancels evidence. */
  seedHeld(events: readonly KeyEvent[], atMs: number): void {
    if (this.terminal === "finished" || !time(atMs) || atMs < this.received) return;
    if ([...this.held.values()].some((key) => key.attack !== null)) this.cancel();
    this.held.clear();
    this.releases.clear();
    this.received = atMs;
    for (const event of events) {
      const raw = event.timestamp ?? atMs;
      if (
        !validKey(event) ||
        event.type !== "down" ||
        !this.matches(event) ||
        !time(raw) ||
        raw > atMs
      )
        continue;
      if (!this.held.has(owner(event)) && this.held.size >= MUSIC_MATERIAL_LIMIT) {
        this.cancel();
        break;
      }
      this.held.set(owner(event), { raw, attack: null });
    }
  }
  receive(event: KeyEvent, receipt: MusicPerformanceReceipt): MusicPerformanceAcceptance {
    if (
      this.terminal === "finished" ||
      !validKey(event) ||
      !this.matches(event) ||
      receipt.presentationId !== this.options.presentationId ||
      !time(receipt.raw) ||
      !time(receipt.corrected) ||
      !time(receipt.received) ||
      receipt.received < this.received ||
      receipt.raw > receipt.received ||
      (event.timestamp !== undefined && event.timestamp !== receipt.raw) ||
      !["left", "right"].includes(receipt.hand) ||
      typeof receipt.admitted !== "boolean" ||
      typeof receipt.playing !== "boolean"
    )
      return IGNORE;
    this.received = receipt.received;
    const id = owner(event);
    const previous = this.held.get(id);
    if (receipt.received - receipt.raw > TWO_HAND_HORIZON_MS) {
      if (event.type === "up" && previous && receipt.raw >= previous.raw) {
        this.held.delete(id);
        this.cancel();
      }
      return IGNORE;
    }
    for (const [key, raw] of this.releases)
      if (raw < receipt.received - TWO_HAND_HORIZON_MS) this.releases.delete(key);
    if (event.type === "up") {
      this.releases.set(id, Math.max(receipt.raw, this.releases.get(id) ?? receipt.raw));
      if (!previous || receipt.raw < previous.raw) return IGNORE;
      this.held.delete(id);
      const attack = previous.attack;
      if (!attack || this.terminal === "cancelled") return IGNORE;
      if (!beat(receipt.songBeat) || receipt.songBeat < attack.startBeat) {
        this.cancel();
        return IGNORE;
      }
      attack.durationBeats = receipt.songBeat - attack.startBeat;
      return { down: false, up: true };
    }
    if (previous || receipt.raw < (this.releases.get(id) ?? -1)) return IGNORE;
    if (this.held.size >= MUSIC_MATERIAL_LIMIT) {
      this.cancel();
      return IGNORE;
    }
    const physical: PhysicalDown = { raw: receipt.raw, attack: null };
    this.held.set(id, physical);
    if (
      this.terminal ||
      !this.ready ||
      this.paused ||
      !receipt.playing ||
      !receipt.admitted ||
      receipt.corrected < this.boundary
    )
      return IGNORE;
    if (!beat(receipt.songBeat) || this.attacks.length >= MUSIC_MATERIAL_LIMIT) {
      this.cancel();
      return IGNORE;
    }
    const attack: CapturedAttack = {
      pitch: event.pitch,
      startBeat: receipt.songBeat,
      hand: receipt.hand,
      durationBeats: null
    };
    physical.attack = attack;
    this.attacks.push(attack);
    return { down: true, up: false };
  }
  /** Fast status count: no snapshot, note objects or sort are allocated on the frame path. */
  get completedCount(): number {
    let count = 0;
    for (const attack of this.attacks) if (attack.durationBeats !== null) count++;
    return count;
  }
  snapshot(): MusicPerformanceCaptureSnapshot {
    return {
      heldCount: this.held.size,
      notes: this.completedNotes(),
      status: this.terminal ?? (this.ready && !this.paused ? "active" : "prepared")
    };
  }
  /** Explicit completion only. Empty capture is observable and never becomes a made-up accuracy. */
  finish(): readonly MusicNote[] | null {
    if (this.terminal === "cancelled" || this.held.size > 0) return null;
    this.terminal = "finished";
    return this.completedNotes();
  }
  cancel(): void {
    if (this.terminal === "finished") return;
    this.terminal = "cancelled";
    this.ready = false;
    for (const key of this.held.values()) key.attack = null;
  }
  private matches(event: KeyEvent): boolean {
    const input = this.options.input;
    return (
      event.source === input.source &&
      (input.deviceId === undefined || event.deviceId === input.deviceId) &&
      (input.channel === undefined || event.channel === input.channel)
    );
  }
  private completedNotes(): readonly MusicNote[] {
    return this.attacks
      .flatMap((attack) =>
        attack.durationBeats === null
          ? []
          : [
              {
                pitch: attack.pitch,
                startBeat: attack.startBeat,
                durationBeats: attack.durationBeats,
                hand: attack.hand
              }
            ]
      )
      .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  }
}
