import type { Hand } from "../fingering/fingering";
import type { PracticeMode } from "../practice/session";

/** One key as it was played. */
export interface PlayedNote {
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
  readonly songKey: string;
  readonly mode: PracticeMode;
  readonly speed: number;
  readonly hands: readonly Hand[];
  readonly from: number;
}

interface OpenNote {
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
  private readonly open = new Map<number, OpenNote>();
  private pedalOpen: { start: number; realStart: number } | undefined;

  constructor(settings: TakeSettings) {
    this.settings = settings;
  }

  get isEmpty(): boolean {
    return this.notes.length === 0 && this.open.size === 0;
  }

  noteOn(pitch: number, velocity: number, time: number, realTime: number): void {
    // A key struck again before its release (a lost note off) ends the old note there.
    this.noteOff(pitch, time, realTime);
    this.open.set(pitch, { pitch, velocity, start: time, realStart: realTime });
  }

  noteOff(pitch: number, time: number, realTime: number): void {
    const note = this.open.get(pitch);
    if (!note) return;
    this.open.delete(pitch);
    this.notes.push({ ...note, end: Math.max(time, note.start), realEnd: realTime });
  }

  setPedal(down: boolean, time: number, realTime: number): void {
    if (down && !this.pedalOpen) this.pedalOpen = { start: time, realStart: realTime };
    if (!down && this.pedalOpen) {
      this.pedal.push({ ...this.pedalOpen, end: time, realEnd: realTime });
      this.pedalOpen = undefined;
    }
  }

  /** Closes whatever is still held and returns the take, notes in the order they were struck. */
  finish(time: number, realTime: number, id: string, createdAt: string): Take {
    for (const pitch of [...this.open.keys()]) this.noteOff(pitch, time, realTime);
    this.setPedal(false, time, realTime);
    const notes = [...this.notes].sort((a, b) => a.realStart - b.realStart || a.pitch - b.pitch);
    return { ...this.settings, id, createdAt, notes, pedal: [...this.pedal] };
  }
}
