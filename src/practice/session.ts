import type { Hand } from "../fingering/fingering";
import type { Song, SongBeat, SongNote } from "../song/song";
import type { GameScore } from "./gameScore";
import { SessionScoring } from "./sessionScoring";
import { difficultyWindows, judgeOffset, LEARNING_LATE_WINDOW_MS } from "./gameRules";
import type { Difficulty, Judgement } from "./gameRules";
import { SongTimeline } from "./timing";
import { SessionHolds } from "./sessionHolds";
import type { HoldStatistics } from "./sessionHolds";

export type PracticeMode = "wait" | "tempo";

export interface PracticeOptions {
  readonly mode: PracticeMode;
  /** The hands the player plays; the program plays the rest. Empty = listen only. */
  readonly hands: ReadonlySet<Hand>;
  /** 1 = written tempo. */
  readonly speed: number;
  readonly difficulty?: Difficulty;
  readonly learningWindow?: boolean;
  readonly from?: number;
  readonly to?: number;
  readonly missGraceMs?: number;
}

/** "skipped": before the point the run was started from; it never counts. */
export type NoteStatus = "pending" | "hit" | "missed" | "skipped";

export type PracticeEvent =
  | { readonly type: "autoNoteOn"; readonly pitch: number; readonly velocity?: number }
  | { readonly type: "autoNoteOff"; readonly pitch: number }
  | {
      readonly type: "hit";
      readonly noteId: string;
      readonly offset: number;
      readonly judgement?: Judgement;
      readonly assisted?: boolean;
    }
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
  readonly game?: ReturnType<GameScore["snapshot"]>;
  readonly hold?: HoldStatistics;
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
  time: number;
  finished = false;
  /**
   * Seconds of run-up before a start point. Only a player needs one, to get
   * the hands ready; a listen-through starts on its first note.
   */
  private readonly leadIn: number;

  private readonly playerNotes: SongNote[];
  private readonly hintNotes: SongNote[] = [];
  private readonly autoNotes: SongNote[];
  private readonly status = new Map<string, NoteStatus>();
  private offsets: number[] = [];
  private wrongPitches: number[] = [];
  private missedPitches: number[] = [];
  private autoStartIndex = 0;
  private from = 0;
  private readonly soundingAuto: SongNote[] = [];
  /** The song's beat grid, preceded by a count-in over the lead-in. */
  private readonly beats: readonly SongBeat[];
  private beatIndex = 0;
  private readonly timeline = new SongTimeline();
  private clockStarted = false;
  private clockPaused = false;
  private lastPerformanceMs = 0;
  private inputGraceMs = 250;
  private game: SessionScoring;
  private holds!: SessionHolds;
  private readonly finalizedChords = new Set<string>();
  private readonly hitTimes = new Map<string, number>();

  constructor(song: Song, options: PracticeOptions) {
    this.song = song;
    this.options = options;
    this.inputGraceMs = options.missGraceMs ?? 250;
    const inRange = (note: SongNote) =>
      note.start >= (options.from ?? 0) && note.start < (options.to ?? Infinity);
    this.playerNotes = song.notes.filter((note) => options.hands.has(note.hand) && inRange(note));
    this.autoNotes = song.notes.filter((note) => !options.hands.has(note.hand) && inRange(note));
    this.game = new SessionScoring(
      this.scoringNotes(this.playerNotes),
      options.difficulty ?? "normal",
      options.mode === "tempo" && options.learningWindow === true
    );
    for (const note of this.playerNotes) this.status.set(note.id, "pending");
    this.beats = [...countIn(song.beats), ...song.beats];
    this.leadIn = options.hands.size > 0 ? LEAD_IN_S : 0;
    this.time = 0 - this.leadIn;
    // Without a run-up the count-in clicks lie in the past: they must not all fire at once.
    const firstBeat = this.beats.findIndex((beat) => beat.time >= this.time);
    this.beatIndex = firstBeat === -1 ? this.beats.length : firstBeat;
    this.holds = this.createHolds();
    if (options.from !== undefined) this.seek(options.from);
  }

  /**
   * Starts the run over from song time `from`: earlier notes are skipped and
   * never counted, the score is cleared, and the song resumes a lead-in
   * before `from` so the metronome counts the player in; a listen-through
   * resumes on `from` itself. Call `stopAuto` first if the program may be
   * holding notes.
   */
  seek(from: number, performanceMs?: number): void {
    const edge = from - 1e-6;
    for (const note of this.playerNotes) {
      this.status.set(note.id, note.start < edge ? "skipped" : "pending");
    }
    this.offsets = [];
    this.wrongPitches = [];
    this.missedPitches = [];
    this.holds = this.createHolds();
    this.finalizedChords.clear();
    this.hitTimes.clear();
    const expected = this.playerNotes.filter((note) => note.start >= edge);
    this.game = new SessionScoring(
      this.scoringNotes(expected),
      this.options.difficulty ?? "normal",
      this.options.mode === "tempo" && this.options.learningWindow === true
    );
    this.soundingAuto.length = 0;
    this.finished = false;
    this.from = from;
    this.time = from - this.leadIn;
    // The other hand resumes at `from` too; what it played before stays silent.
    const autoIndex = this.autoNotes.findIndex((note) => note.start >= edge);
    this.autoStartIndex = autoIndex === -1 ? this.autoNotes.length : autoIndex;
    const beatIndex = this.beats.findIndex((beat) => beat.time >= this.time);
    this.beatIndex = beatIndex === -1 ? this.beats.length : beatIndex;
    if (this.clockStarted) this.startClock(performanceMs ?? this.lastPerformanceMs);
  }

  startClock(performanceMs: number): void {
    this.clockStarted = true;
    this.clockPaused = false;
    this.lastPerformanceMs = performanceMs;
    this.timeline.reset(performanceMs, this.time, this.options.speed);
  }

  setInputGrace(compensationMs: number): void {
    this.inputGraceMs = (this.options.missGraceMs ?? 250) + Math.max(0, compensationMs);
  }

  songTimeAt(performanceMs: number): number | undefined {
    return this.timeline.at(performanceMs, true);
  }

  performanceTimeAt(songSeconds: number): number | undefined {
    return this.timeline.performanceAt(songSeconds);
  }

  tick(performanceMs: number): PracticeEvent[] {
    if (!this.clockStarted) this.startClock(performanceMs);
    if (this.clockPaused || performanceMs < this.lastPerformanceMs) return [];
    const target = this.timeline.at(performanceMs) ?? this.time;
    const due = this.options.mode === "wait" ? this.nextDue()[0] : undefined;
    if (due && target >= due.start && (this.timeline.segmentAt(performanceMs)?.speed ?? 0) > 0) {
      const crossing = performanceMs - ((target - due.start) / this.options.speed) * 1000;
      this.timeline.anchor(crossing, due.start, 0);
    }
    this.lastPerformanceMs = performanceMs;
    const events = this.advance(Math.max(0, target - this.time) / this.options.speed, true);
    this.updateHolds(this.time - (this.inputGraceMs / 1000) * this.options.speed);
    return events;
  }

  pauseClock(performanceMs: number): PracticeEvent[] {
    const events = this.tick(performanceMs);
    this.updateHolds(this.time);
    this.clockPaused = true;
    this.timeline.anchor(performanceMs, this.time, 0, false);
    this.holds.stop(this.time / this.options.speed, performanceMs);
    return events;
  }

  resumeClock(performanceMs: number): void {
    this.clockPaused = false;
    this.lastPerformanceMs = performanceMs;
    this.timeline.anchor(performanceMs, this.time, this.waiting ? 0 : this.options.speed);
  }

  pressKeyAt(
    pitch: number,
    performanceMs: number,
    receivedMs = performanceMs,
    source = "default"
  ): PracticeEvent[] {
    const eventTime = this.songTimeAt(performanceMs);
    if (eventTime === undefined) return [];
    const wasWaiting = this.waiting;
    this.updateHolds(eventTime);
    const events = this.pressKey(pitch, eventTime, source, performanceMs);
    const next = this.nextDue()[0];
    if (wasWaiting && !this.clockPaused && (next === undefined || next.start > this.time))
      this.timeline.anchor(
        Math.max(receivedMs, this.lastPerformanceMs),
        this.time,
        this.options.speed
      );
    return events;
  }

  releaseKeyAt(pitch: number, performanceMs: number, source = "default"): PracticeEvent[] {
    const eventTime = this.timeline.at(performanceMs);
    if (eventTime === undefined) return [];
    this.updateHolds(eventTime);
    this.holds.release(pitch, eventTime / this.options.speed, source);
    return [];
  }

  activateOverdrive(performanceMs: number): boolean {
    return this.game.activateOverdrive(
      (this.timeline.at(performanceMs) ?? this.time) / this.options.speed
    );
  }

  /** Song seconds this run started from: 0, or the point of the last seek. */
  get startedFrom(): number {
    return this.from;
  }

  get audioBeats(): readonly SongBeat[] {
    return this.beats;
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

  /** All pending key cues, so a late attack cannot hide the following preparation. */
  keyHints(): SongNote[] {
    this.hintNotes.length = 0;
    for (const note of this.playerNotes) {
      if (note.start > this.time + 0.3 * this.options.speed) break;
      if (this.status.get(note.id) === "pending") this.hintNotes.push(note);
    }
    return this.hintNotes;
  }

  /** True while the wait mode holds the song for the player. */
  get waiting(): boolean {
    if (this.options.mode !== "wait") return false;
    const due = this.nextDue()[0];
    return due !== undefined && this.time >= due.start;
  }

  advance(realSeconds: number, timestampClock = false): PracticeEvent[] {
    if (this.finished) return [];
    const events: PracticeEvent[] = [];
    let target = this.time + realSeconds * this.options.speed;

    if (this.options.mode === "wait") {
      const due = this.nextDue()[0];
      if (due && target > due.start) target = due.start;
    } else {
      const grace = timestampClock ? this.inputGraceMs / 1000 : 0;
      const window = (this.lateWindow + grace) * this.options.speed;
      for (const note of this.playerNotes) {
        if (note.start >= target - window) break;
        if (this.status.get(note.id) !== "pending") continue;
        this.status.set(note.id, "missed");
        this.missedPitches.push(note.pitch);
        this.game.miss(note.id, note.start / this.options.speed + this.lateWindow);
        events.push({ type: "miss", noteId: note.id });
      }
    }

    this.time = Math.max(this.time, target);
    this.finalizeChords();
    this.playAuto(events);
    // The metronome follows song time, so it slows with the speed and falls silent while waiting.
    while (this.beatIndex < this.beats.length) {
      const beat = this.beats[this.beatIndex];
      if (!beat || beat.time > this.time) break;
      this.beatIndex++;
      events.push({ type: "beat", downbeat: beat.downbeat });
    }

    const allPlayed = this.playerNotes.every((note) => this.status.get(note.id) !== "pending");
    const finishGrace = timestampClock ? (this.inputGraceMs / 1000) * this.options.speed : 0;
    if (
      allPlayed &&
      this.time >= (this.options.to ?? this.song.duration) + finishGrace &&
      this.soundingAuto.length === 0
    ) {
      this.finished = true;
      events.push({ type: "finished" });
    }
    return events;
  }

  pressKey(
    pitch: number,
    eventSongTime = this.time,
    source = "default",
    performanceMs?: number
  ): PracticeEvent[] {
    if (this.finished) return [];
    if (this.options.mode === "wait") {
      // A key of the owed chord counts even a moment before the song reaches it.
      const due = this.nextDue();
      const match = due.find((note) => note.pitch === pitch);
      const reachable =
        due[0] !== undefined &&
        due[0].start - eventSongTime <= this.matchWindow * this.options.speed;
      if (match && reachable) {
        this.status.set(match.id, "hit");
        return [{ type: "hit", noteId: match.id, offset: 0 }];
      }
      if (this.clockStarted && !reachable) return [];
      this.wrongPitches.push(pitch);
      return [{ type: "wrong", pitch }];
    }

    const early = this.matchWindow * this.options.speed;
    const late = this.lateWindow * this.options.speed;
    let best: SongNote | undefined;
    for (const note of this.playerNotes) {
      if (note.start > eventSongTime + early + 1e-9) break;
      if (note.pitch !== pitch || this.status.get(note.id) !== "pending") continue;
      if (eventSongTime - note.start > late + 1e-9) continue;
      if (
        !best ||
        Math.abs(note.start - eventSongTime) < Math.abs(best.start - eventSongTime) - 1e-9
      )
        best = note;
    }
    if (!best) {
      if (
        this.clockStarted &&
        !this.playerNotes.some(
          (note) => eventSongTime >= note.start - early && eventSongTime <= note.start + late
        )
      )
        return [];
      this.wrongPitches.push(pitch);
      this.game.wrong(eventSongTime / this.options.speed);
      return [{ type: "wrong", pitch }];
    }
    this.status.set(best.id, "hit");
    const offset = (eventSongTime - best.start) / this.options.speed;
    this.offsets.push(offset);
    this.game.hit(best.id, Math.round(offset * 1e9) / 1e6, eventSongTime / this.options.speed);
    this.hitTimes.set(best.id, eventSongTime / this.options.speed);
    const heldNote = this.scoringNotes([best])[0];
    if (heldNote)
      this.holds.start(heldNote, eventSongTime / this.options.speed, source, performanceMs);
    this.finalizeChords();
    return [
      {
        type: "hit",
        noteId: best.id,
        offset,
        ...(this.clockStarted || this.options.learningWindow
          ? {
              judgement: judgeOffset(
                Math.round(offset * 1e9) / 1e6,
                this.options.difficulty ?? "normal",
                this.options.learningWindow
              ),
              assisted: this.options.learningWindow === true && offset > this.matchWindow
            }
          : {})
      }
    ];
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
    return {
      hits,
      misses,
      wrong: this.wrongPitches.length,
      meanOffset,
      troubleSpots,
      ...(this.options.mode === "tempo"
        ? {
            game: this.game.snapshot(this.time / this.options.speed),
            hold: this.holds.snapshot(this.time / this.options.speed)
          }
        : {})
    };
  }

  private get matchWindow(): number {
    return this.clockStarted || this.options.difficulty !== undefined || this.options.learningWindow
      ? difficultyWindows(this.options.difficulty ?? "normal").ok / 1000
      : HIT_WINDOW_S;
  }

  private get lateWindow(): number {
    return this.options.mode === "tempo" && this.options.learningWindow
      ? LEARNING_LATE_WINDOW_MS / 1000
      : this.matchWindow;
  }

  private scoringNotes(notes: readonly SongNote[]): SongNote[] {
    return notes.map((note) => ({
      ...note,
      start: note.start / this.options.speed,
      duration:
        Math.max(0, Math.min(note.duration, (this.options.to ?? Infinity) - note.start)) /
        this.options.speed
    }));
  }

  private createHolds(): SessionHolds {
    return new SessionHolds(
      this.scoringNotes(this.playerNotes.filter((note) => this.status.get(note.id) !== "skipped")),
      (id, ticks, at) => {
        this.game.hold(id, ticks, at);
      },
      (id, until) => {
        this.game.truncateHold(id, until);
      }
    );
  }
  private updateHolds(songTime: number): void {
    this.holds.update(songTime / this.options.speed);
  }

  private finalizeChords(): void {
    for (let index = 0; index < this.playerNotes.length;) {
      const first = this.playerNotes[index];
      if (!first) break;
      const chord: SongNote[] = [];
      while (index < this.playerNotes.length) {
        const member = this.playerNotes[index];
        if (!member || member.start - first.start > CHORD_WINDOW_S) break;
        chord.push(member);
        index++;
      }
      if (
        chord.length < 2 ||
        this.finalizedChords.has(first.id) ||
        chord.some((note) => this.status.get(note.id) === "pending")
      )
        continue;
      if (chord.some((note) => this.status.get(note.id) === "skipped")) continue;
      this.game.chord(
        first.id,
        chord.every((note) => this.status.get(note.id) === "hit"),
        chord.every((note) => this.status.get(note.id) === "hit")
          ? Math.max(
              ...chord.map((note) => this.hitTimes.get(note.id) ?? note.start / this.options.speed)
            )
          : Math.max(...chord.map((note) => note.start)) / this.options.speed + this.lateWindow
      );
      this.finalizedChords.add(first.id);
    }
  }

  private playAuto(events: PracticeEvent[]): void {
    for (let index = this.soundingAuto.length - 1; index >= 0; index--) {
      const note = this.soundingAuto[index];
      if (note && Math.min(note.start + note.duration, this.options.to ?? Infinity) <= this.time) {
        this.soundingAuto.splice(index, 1);
        events.push({ type: "autoNoteOff", pitch: note.pitch });
      }
    }
    while (this.autoStartIndex < this.autoNotes.length) {
      const note = this.autoNotes[this.autoStartIndex];
      if (!note || note.start > this.time) break;
      this.autoStartIndex++;
      events.push(
        note.velocity === undefined
          ? { type: "autoNoteOn", pitch: note.pitch }
          : { type: "autoNoteOn", pitch: note.pitch, velocity: note.velocity }
      );
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
  const step = second.position - first.position;
  if (interval <= 0) return [];
  const clicks: SongBeat[] = [];
  for (let count = 1; first.time - count * interval >= -LEAD_IN_S; count++) {
    clicks.unshift({
      time: first.time - count * interval,
      position: first.position - count * step,
      downbeat: false
    });
  }
  return clicks;
}
