import { soundAllOff, soundClick, soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { KeyEvent } from "../input/midiInput";
import type { FallingNotesView } from "../render/FallingNotesView";
import { TakeRecorder } from "../recording/take";
import type { Take } from "../recording/take";
import { quartersAt } from "../song/song";
import type { Song, SongNote } from "../song/song";
import { ComboCounter } from "./combo";
import type { GradedStrike } from "./combo";
import { PracticeSession } from "./session";
import type { PracticeEvent, PracticeOptions, PracticeStats } from "./session";

export interface TrainerSnapshot {
  readonly playing: boolean;
  readonly waiting: boolean;
  readonly finished: boolean;
  readonly time: number;
  /** Beat of the last note that has started; what the staff cursor follows. */
  readonly beat: number;
  readonly stats: PracticeStats;
}

const NOTHING: ReadonlySet<number> = new Set();

/** Song seconds visible above the hit line. */
const LOOK_AHEAD_S = 3;
const SNAPSHOT_INTERVAL_MS = 150;

/** Beat of the latest note that has started by `time`; notes are sorted by start. */
export function beatAt(song: Song, time: number): number {
  let low = 0;
  let high = song.notes.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const note = song.notes[middle];
    if (!note) break;
    if (note.start <= time) {
      found = note.startBeat;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Glue between the pure session, the picture, the sound and the keys. Owns
 * the frame loop; React only reads throttled snapshots and sends commands.
 */
export class Trainer {
  onSnapshot: ((snapshot: TrainerSnapshot) => void) | undefined;
  /** A take has ended: the song finished, or the run was restarted, moved or reloaded. */
  onTake: ((take: Take) => void) | undefined;
  metronome = false;

  private session: PracticeSession | undefined;
  private songKey = "";
  /** The run of good notes and the accuracy, started over with each run. */
  private readonly combo = new ComboCounter();
  /** Strikes graded since the last frame was drawn. */
  private graded: GradedStrike[] = [];
  /** The song's notes' keys by note id: a missed note is shown on its key. */
  private pitchOf = new Map<string, number>();
  private playing = false;
  private recorder: TakeRecorder | undefined;
  /** Colours for the notes on this trainer's view, and a second view drawn in step with it. */
  private comparison:
    | {
        readonly colorOf: (note: SongNote) => number | undefined;
        readonly mirror?: {
          readonly view: FallingNotesView;
          readonly colorOf: (note: SongNote) => number | undefined;
        };
      }
    | undefined;
  /** Real clock of the take: when it began and how long it sat paused, in ms. */
  private takeClock = { start: 0, paused: 0, pausedAt: 0 };
  private readonly pressed = new Set<number>();
  private readonly sounding = new Set<number>();
  private sinceSnapshot = 0;
  private lastBeat = -1;
  private readonly view: FallingNotesView;

  constructor(view: FallingNotesView) {
    this.view = view;
    view.onTick((deltaMs) => {
      this.frame(deltaMs);
    });
  }

  /** `songKey` names the song for its takes: the same key its finger corrections use. */
  load(song: Song, options: PracticeOptions, songKey: string): void {
    this.finishTake();
    this.silence();
    this.songKey = songKey;
    this.session = new PracticeSession(song, options);
    this.pitchOf = new Map(song.notes.map((note) => [note.id, note.pitch]));
    this.combo.reset();
    this.graded = [];
    this.playing = false;
    this.view.setSong(song);
    this.lastBeat = -1;
    this.publish();
  }

  /** Restarts the run from song time `from`, keeping play or pause as it was. */
  seek(from: number): void {
    if (!this.session) return;
    this.finishTake();
    this.silence();
    this.session.seek(from);
    this.combo.reset();
    this.graded = [];
    this.publish();
  }

  setPlaying(playing: boolean): void {
    const session = this.session;
    const wasPlaying = this.playing;
    this.playing = playing && session?.finished !== true;
    if (!this.playing) this.silence();
    const now = performance.now();
    if (this.playing && !wasPlaying && session) {
      if (this.recorder) {
        this.takeClock.paused += now - this.takeClock.pausedAt;
      } else if (session.options.hands.size > 0) {
        // A listen-through has no player: nothing to record.
        this.recorder = new TakeRecorder({
          songKey: this.songKey,
          mode: session.options.mode,
          speed: session.options.speed,
          hands: [...session.options.hands],
          from: session.startedFrom
        });
        this.takeClock = { start: now, paused: 0, pausedAt: 0 };
      }
    }
    if (!this.playing && wasPlaying) this.takeClock.pausedAt = now;
    this.publish();
  }

  key(event: KeyEvent): void {
    if (event.type === "down") this.pressed.add(event.pitch);
    else this.pressed.delete(event.pitch);
    const session = this.session;
    if (this.recorder && session) {
      // Releases are kept even while paused: a key held over the pause still ends somewhere.
      if (event.type === "down" && this.playing) {
        this.recorder.noteOn(event.pitch, event.velocity, session.time, this.realTime());
      } else if (event.type === "up") {
        this.recorder.noteOff(event.pitch, session.time, this.realTime());
      }
    }
    if (event.type === "down" && this.playing && session) {
      this.apply(session.pressKey(event.pitch));
      this.publish();
    }
  }

  /**
   * Compare mode: the trainer's own notes get `colorOf`, and `mirror` (a second
   * view already showing the other song) is drawn at the same song time.
   */
  setComparison(comparison: Trainer["comparison"]): void {
    this.comparison = comparison;
  }

  /** Where the song is now, in quarter notes, between notes too: what a view follows smoothly. */
  quarters(): number {
    return this.session ? quartersAt(this.session.song, this.session.time) : 0;
  }

  pedal(down: boolean): void {
    if (this.recorder && this.session) {
      this.recorder.setPedal(down, this.session.time, this.realTime());
    }
  }

  /** Seconds of the take's own clock: real time since it began, pauses left out. */
  private realTime(): number {
    const clock = this.takeClock;
    const pausedNow = this.playing ? 0 : performance.now() - clock.pausedAt;
    return (performance.now() - clock.start - clock.paused - pausedNow) / 1000;
  }

  /** Ends the take in progress, if anything was played, and hands it over. */
  private finishTake(): void {
    const recorder = this.recorder;
    const session = this.session;
    this.recorder = undefined;
    if (!recorder || !session || recorder.isEmpty) return;
    const take = recorder.finish(
      session.time,
      this.realTime(),
      `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`,
      new Date().toISOString()
    );
    this.onTake?.(take);
  }

  private frame(deltaMs: number): void {
    const session = this.session;
    if (!session) return;
    if (this.playing) {
      // A tab in the background delivers one huge frame; don't let it skip the song.
      this.apply(session.advance(Math.min(deltaMs, 100) / 1000));
    }
    this.view.draw({
      time: session.time,
      lookAhead: LOOK_AHEAD_S,
      statusOf: (id) => session.statusOf(id),
      pressed: this.pressed,
      sounding: this.sounding,
      due: this.playing || session.time < 0 ? session.nextDue() : [],
      hands: session.options.hands,
      colorOf: this.comparison?.colorOf,
      board: this.combo.board(),
      graded: this.graded
    });
    // The view has shown them: next frame grades only its own strikes.
    this.graded = [];
    const mirror = this.comparison?.mirror;
    mirror?.view.draw({
      time: session.time,
      lookAhead: LOOK_AHEAD_S,
      statusOf: () => undefined,
      pressed: NOTHING,
      sounding: NOTHING,
      due: [],
      hands: session.options.hands,
      colorOf: mirror.colorOf
    });
    this.sinceSnapshot += deltaMs;
    const beat = beatAt(session.song, session.time);
    if (this.sinceSnapshot >= SNAPSHOT_INTERVAL_MS || beat !== this.lastBeat) this.publish();
  }

  private apply(events: readonly PracticeEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "autoNoteOn":
          this.sounding.add(event.pitch);
          soundNoteOn(event.pitch, event.velocity);
          break;
        case "autoNoteOff":
          this.sounding.delete(event.pitch);
          soundNoteOff(event.pitch);
          break;
        case "beat":
          if (this.metronome) soundClick(event.downbeat);
          break;
        case "finished":
          this.playing = false;
          this.finishTake();
          break;
        case "hit":
        case "miss":
        case "wrong": {
          const grade = this.combo.record(event);
          const pitch = event.type === "wrong" ? event.pitch : this.pitchOf.get(event.noteId);
          if (grade && pitch !== undefined) this.graded.push({ grade, pitch });
          break;
        }
      }
    }
  }

  private silence(): void {
    if (this.session) this.apply(this.session.stopAuto());
    this.sounding.clear();
    soundAllOff();
  }

  private publish(): void {
    const session = this.session;
    if (!session) return;
    this.sinceSnapshot = 0;
    this.lastBeat = beatAt(session.song, session.time);
    this.onSnapshot?.({
      playing: this.playing,
      waiting: session.waiting,
      finished: session.finished,
      time: session.time,
      beat: this.lastBeat,
      stats: session.stats()
    });
  }
}
