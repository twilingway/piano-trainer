import type { Hand } from "../fingering/fingering";
import type { Song, SongBeat, SongNote } from "../song/song";

export type PracticeMode = "wait" | "tempo";

export interface PracticeOptions {
  readonly mode: PracticeMode;
  /** The hands the player plays; the program plays the rest. Empty = listen only. */
  readonly hands: ReadonlySet<Hand>;
  /** 1 = written tempo. */
  readonly speed: number;
}

export type NoteStatus = "pending" | "hit" | "missed";

export type PracticeEvent =
  | { readonly type: "autoNoteOn"; readonly pitch: number }
  | { readonly type: "autoNoteOff"; readonly pitch: number }
  | { readonly type: "hit"; readonly noteId: string; readonly offset: number }
  | { readonly type: "miss"; readonly noteId: string }
  | { readonly type: "wrong"; readonly pitch: number }
  | { readonly type: "beat"; readonly downbeat: boolean }
  | { readonly type: "finished" };

export interface PracticeStats {
  readonly hits: number;
  readonly misses: number;
  readonly wrong: number;
  /** Mean signed timing error of hits in real seconds, tempo mode only; negative = early. */
  readonly meanOffset: number;
  /** Pitches with the most misses and wrong presses, worst first. */
  readonly troubleSpots: readonly { readonly pitch: number; readonly errors: number }[];
}

/** Seconds of falling notes before the first one arrives. */
export const LEAD_IN_S = 2;
/** How far from a note's time a key still counts as that note, in real seconds. */
export const HIT_WINDOW_S = 0.18;
/** Onsets closer than this are one chord the wait mode waits for as a whole. */
const CHORD_WINDOW_S = 0.03;

/**
 * One run through a song. Time is song time in seconds: `advance` moves it by
 * real seconds times the speed, except that the wait mode stops it at the next
 * chord the player owes until every key of that chord is pressed.
 */
export class PracticeSession {
  readonly song: Song;
  readonly options: PracticeOptions;
  time = -LEAD_IN_S;
  finished = false;

  private readonly playerNotes: SongNote[];
  private readonly autoNotes: SongNote[];
  private readonly status = new Map<string, NoteStatus>();
  private readonly offsets: number[] = [];
  private readonly wrongPitches: number[] = [];
  private readonly missedPitches: number[] = [];
  private autoStartIndex = 0;
  private readonly soundingAuto: SongNote[] = [];
  /** The song's beat grid, preceded by a count-in over the lead-in. */
  private readonly beats: readonly SongBeat[];
  private beatIndex = 0;

  constructor(song: Song, options: PracticeOptions) {
    this.song = song;
    this.options = options;
    this.playerNotes = song.notes.filter((note) => options.hands.has(note.hand));
    this.autoNotes = song.notes.filter((note) => !options.hands.has(note.hand));
    for (const note of this.playerNotes) this.status.set(note.id, "pending");
    this.beats = [...countIn(song.beats), ...song.beats];
  }

  statusOf(noteId: string): NoteStatus | undefined {
    return this.status.get(noteId);
  }

  /** The chord the player owes next: the earliest pending notes. */
  nextDue(): SongNote[] {
    const first = this.playerNotes.find((note) => this.status.get(note.id) === "pending");
    if (!first) return [];
    return this.playerNotes.filter(
      (note) => this.status.get(note.id) === "pending" && note.start - first.start <= CHORD_WINDOW_S
    );
  }

  /** True while the wait mode holds the song for the player. */
  get waiting(): boolean {
    if (this.options.mode !== "wait") return false;
    const due = this.nextDue()[0];
    return due !== undefined && this.time >= due.start;
  }

  advance(realSeconds: number): PracticeEvent[] {
    if (this.finished) return [];
    const events: PracticeEvent[] = [];
    let target = this.time + realSeconds * this.options.speed;

    if (this.options.mode === "wait") {
      const due = this.nextDue()[0];
      if (due && target > due.start) target = due.start;
    } else {
      const window = HIT_WINDOW_S * this.options.speed;
      for (const note of this.playerNotes) {
        if (note.start >= target - window) break;
        if (this.status.get(note.id) !== "pending") continue;
        this.status.set(note.id, "missed");
        this.missedPitches.push(note.pitch);
        events.push({ type: "miss", noteId: note.id });
      }
    }

    this.time = Math.max(this.time, target);
    this.playAuto(events);
    // The metronome follows song time, so it slows with the speed and falls silent while waiting.
    while (this.beatIndex < this.beats.length) {
      const beat = this.beats[this.beatIndex];
      if (!beat || beat.time > this.time) break;
      this.beatIndex++;
      events.push({ type: "beat", downbeat: beat.downbeat });
    }

    const allPlayed = this.playerNotes.every((note) => this.status.get(note.id) !== "pending");
    if (allPlayed && this.time >= this.song.duration && this.soundingAuto.length === 0) {
      this.finished = true;
      events.push({ type: "finished" });
    }
    return events;
  }

  pressKey(pitch: number): PracticeEvent[] {
    if (this.finished) return [];
    if (this.options.mode === "wait") {
      // A key of the owed chord counts even a moment before the song reaches it.
      const due = this.nextDue();
      const match = due.find((note) => note.pitch === pitch);
      const reachable =
        due[0] !== undefined && due[0].start - this.time <= HIT_WINDOW_S * this.options.speed;
      if (match && reachable) {
        this.status.set(match.id, "hit");
        return [{ type: "hit", noteId: match.id, offset: 0 }];
      }
      this.wrongPitches.push(pitch);
      return [{ type: "wrong", pitch }];
    }

    const window = HIT_WINDOW_S * this.options.speed;
    let best: SongNote | undefined;
    for (const note of this.playerNotes) {
      if (note.start > this.time + window) break;
      if (note.pitch !== pitch || this.status.get(note.id) !== "pending") continue;
      if (Math.abs(note.start - this.time) > window) continue;
      if (!best || Math.abs(note.start - this.time) < Math.abs(best.start - this.time)) best = note;
    }
    if (!best) {
      this.wrongPitches.push(pitch);
      return [{ type: "wrong", pitch }];
    }
    this.status.set(best.id, "hit");
    const offset = (this.time - best.start) / this.options.speed;
    this.offsets.push(offset);
    return [{ type: "hit", noteId: best.id, offset }];
  }

  /** Silences whatever the program is holding; call when the run is abandoned. */
  stopAuto(): PracticeEvent[] {
    const events = this.soundingAuto.map(
      (note) => ({ type: "autoNoteOff", pitch: note.pitch }) as const
    );
    this.soundingAuto.length = 0;
    return events;
  }

  stats(): PracticeStats {
    let hits = 0;
    let misses = 0;
    for (const value of this.status.values()) {
      if (value === "hit") hits++;
      else if (value === "missed") misses++;
    }
    const errors = new Map<number, number>();
    for (const pitch of [...this.wrongPitches, ...this.missedPitches]) {
      errors.set(pitch, (errors.get(pitch) ?? 0) + 1);
    }
    const troubleSpots = [...errors]
      .map(([pitch, count]) => ({ pitch, errors: count }))
      .sort((a, b) => b.errors - a.errors || a.pitch - b.pitch)
      .slice(0, 5);
    const meanOffset =
      this.offsets.length === 0
        ? 0
        : this.offsets.reduce((sum, value) => sum + value, 0) / this.offsets.length;
    return { hits, misses, wrong: this.wrongPitches.length, meanOffset, troubleSpots };
  }

  private playAuto(events: PracticeEvent[]): void {
    for (let index = this.soundingAuto.length - 1; index >= 0; index--) {
      const note = this.soundingAuto[index];
      if (note && note.start + note.duration <= this.time) {
        this.soundingAuto.splice(index, 1);
        events.push({ type: "autoNoteOff", pitch: note.pitch });
      }
    }
    while (this.autoStartIndex < this.autoNotes.length) {
      const note = this.autoNotes[this.autoStartIndex];
      if (!note || note.start > this.time) break;
      this.autoStartIndex++;
      events.push({ type: "autoNoteOn", pitch: note.pitch });
      this.soundingAuto.push(note);
    }
  }
}

/** Clicks at the song's opening beat interval, filling the lead-in before time 0. */
function countIn(beats: readonly SongBeat[]): SongBeat[] {
  const first = beats[0];
  const second = beats[1];
  if (!first || !second) return [];
  const interval = second.time - first.time;
  if (interval <= 0) return [];
  const clicks: SongBeat[] = [];
  for (let time = first.time - interval; time >= -LEAD_IN_S; time -= interval) {
    clicks.unshift({ time, downbeat: false });
  }
  return clicks;
}
