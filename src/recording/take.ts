import type { Hand } from "../fingering/fingering";
import type { PracticeMode } from "../practice/session";
import type { TimingConfig } from "../practice/timingConfig";
import type { Difficulty } from "../practice/gameRules";

/** One key as it was played. */
export interface InputTiming {
  readonly rawTimestampMs: number;
  readonly correctedTimestampMs: number;
  readonly inputOffsetMs: number;
  readonly source: string;
}

export interface PlayedNote {
  readonly deviceId?: string;
  readonly inputTiming?: InputTiming;
  readonly pitch: number;
  /** MIDI velocity, 1-127. */
  readonly velocity: number;
  /** Song seconds, on the score's timeline: what the comparison uses. */
  readonly start: number;
  readonly end: number;
  /** Seconds since the take began, as the hands really moved: what playback uses. */
  readonly realStart: number;
  readonly realEnd: number;
}

/** The sustain pedal held down, on the same two clocks. */
export interface PedalSpan {
  readonly start: number;
  readonly end: number;
  readonly realStart: number;
  readonly realEnd: number;
}

export interface Take {
  readonly timing?: TimingConfig & {
    readonly rulesVersion: number;
    readonly difficulty: Difficulty;
    readonly learningWindow?: boolean;
  };
  readonly id: string;
  /** Which song this is a take of: the same key the finger corrections use. */
  readonly songKey: string;
  /** ISO date and time the take was finished. */
  readonly createdAt: string;
  readonly mode: PracticeMode;
  readonly speed: number;
  readonly hands: readonly Hand[];
  /** Song seconds the run started from: notes before it were not asked for. */
  readonly from: number;
  readonly notes: readonly PlayedNote[];
  readonly pedal: readonly PedalSpan[];
}

export interface TakeSettings {
  readonly timing?: NonNullable<Take["timing"]>;
  readonly songKey: string;
  readonly mode: PracticeMode;
  readonly speed: number;
  readonly hands: readonly Hand[];
  readonly from: number;
}

interface OpenNote {
  readonly deviceId?: string;
  readonly inputTiming?: InputTiming;
  readonly pitch: number;
  readonly velocity: number;
  readonly start: number;
  readonly realStart: number;
}

/**
 * Collects a take while it is played: every key with its velocity and how
 * long the finger held it, and the pedal on a track of its own. Times come
 * in on both clocks: song time from the session, real time from the caller.
 */
export class TakeRecorder {
  private readonly settings: TakeSettings;
  private readonly notes: PlayedNote[] = [];
  private readonly pedal: PedalSpan[] = [];
  private readonly open = new Map<string, OpenNote>();
  private readonly lastOn = new Map<string, OpenNote>();
  private readonly closedOrder = new WeakMap<PlayedNote, { start: number; end: number }>();
  private pedalOpen: { start: number; realStart: number } | undefined;

  constructor(settings: TakeSettings) {
    this.settings = settings;
  }

  get isEmpty(): boolean {
    return this.notes.length === 0 && this.open.size === 0;
  }

  noteOn(
    pitch: number,
    velocity: number,
    time: number,
    realTime: number,
    deviceId?: string,
    inputTiming?: InputTiming
  ): void {
    if (!Number.isFinite(time) || !Number.isFinite(realTime)) return;
    const key = `${deviceId ?? ""}:${String(pitch)}`;
    const order = inputTiming?.correctedTimestampMs ?? realTime;
    const previous = this.lastOn.get(key);
    const previousOrder =
      inputTiming && previous?.inputTiming
        ? previous.inputTiming.correctedTimestampMs
        : previous?.realStart;
    const currentOrder = inputTiming && previous?.inputTiming ? order : realTime;
    if (!Number.isFinite(order) || currentOrder <= (previousOrder ?? -Infinity)) return;
    // A key struck again before its release (a lost note off) ends the old note there.
    this.close(key, time, realTime, order);
    const note = {
      pitch,
      velocity,
      start: time,
      realStart: realTime,
      ...(deviceId ? { deviceId } : {}),
      ...(inputTiming ? { inputTiming: { ...inputTiming } } : {})
    };
    this.lastOn.set(key, note);
    this.open.set(key, note);
  }

  noteOff(
    pitch: number,
    time: number,
    realTime: number,
    deviceId?: string,
    inputTiming?: InputTiming
  ): void {
    if (!Number.isFinite(time) || !Number.isFinite(realTime)) return;
    const key = `${deviceId ?? ""}:${String(pitch)}`;
    const order = inputTiming?.correctedTimestampMs ?? realTime;
    if (!Number.isFinite(order)) return;
    const open = this.open.get(key);
    const afterOpen =
      open &&
      (inputTiming && open.inputTiming
        ? order >= open.inputTiming.correctedTimestampMs
        : realTime >= open.realStart);
    if (afterOpen) {
      this.close(key, time, realTime, order);
      return;
    }
    // A release delivered after a newer attack still belongs to the previous span.
    for (let index = this.notes.length - 1; index >= 0; index--) {
      const previous = this.notes[index];
      if (previous?.pitch !== pitch || previous.deviceId !== deviceId) continue;
      const span = this.closedOrder.get(previous);
      const usesTimestamps = inputTiming && previous.inputTiming;
      if (
        !span ||
        (usesTimestamps
          ? order < span.start || order > span.end
          : realTime < previous.realStart || realTime > previous.realEnd)
      )
        continue;
      const shortened = {
        ...previous,
        end: Math.max(previous.start, Math.min(previous.end, time)),
        realEnd: Math.max(previous.realStart, Math.min(previous.realEnd, realTime))
      };
      this.notes[index] = shortened;
      this.closedOrder.set(shortened, { start: span.start, end: order });
      return;
    }
  }

  private close(key: string, time: number, realTime: number, order: number): void {
    const note = this.open.get(key);
    if (!note) return;
    this.open.delete(key);
    const closed = {
      ...note,
      end: Math.max(time, note.start),
      realEnd: Math.max(realTime, note.realStart)
    };
    this.notes.push(closed);
    this.closedOrder.set(closed, {
      start: note.inputTiming?.correctedTimestampMs ?? note.realStart,
      end: order
    });
  }

  setPedal(down: boolean, time: number, realTime: number): void {
    if (!Number.isFinite(time) || !Number.isFinite(realTime)) return;
    if (down && !this.pedalOpen) this.pedalOpen = { start: time, realStart: realTime };
    if (!down && this.pedalOpen) {
      this.pedal.push({
        ...this.pedalOpen,
        end: Math.max(time, this.pedalOpen.start),
        realEnd: Math.max(realTime, this.pedalOpen.realStart)
      });
      this.pedalOpen = undefined;
    }
  }

  /** Closes whatever is still held and returns the take, notes in the order they were struck. */
  finish(time: number, realTime: number, id: string, createdAt: string): Take {
    for (const [key, note] of [...this.open.entries()])
      this.close(
        key,
        Number.isFinite(time) ? time : note.start,
        Number.isFinite(realTime) ? realTime : note.realStart,
        Infinity
      );
    this.setPedal(false, time, realTime);
    const notes = [...this.notes].sort((a, b) => a.realStart - b.realStart || a.pitch - b.pitch);
    return { ...this.settings, id, createdAt, notes, pedal: [...this.pedal] };
  }
}
