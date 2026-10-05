import { soundAllOff } from "../audio/pianoSound";
import { SessionAudio } from "../audio/sessionAudio";
import type { KeyEvent } from "../input/midiInput";
import type { FallingNotesView } from "../render/FallingNotesView";
import { TakeRecorder } from "../recording/take";
import type { Take } from "../recording/take";
import { quartersAt } from "../song/song";
import type { Song, SongNote } from "../song/song";
import { ComboCounter } from "./combo";
import type { ComboBoard, GradedStrike } from "./combo";
import { PracticeSession } from "./session";
import type { NoteStatus, PracticeEvent, PracticeOptions, PracticeStats } from "./session";
import type { TimingConfig } from "./timingConfig";
import { SongTimeline } from "./timing";
import { timingPolicy } from "./timingPolicy";
import type { TimingPolicy } from "./timingPolicy";

export interface TrainerSnapshot {
  readonly playing: boolean;
  readonly waiting: boolean;
  readonly finished: boolean;
  readonly time: number;
  readonly timingPolicy: TimingPolicy;
  /** Beat of the last note that has started; what the staff cursor follows. */
  readonly beat: number;
  readonly stats: PracticeStats;
  readonly diagnostic?: InputDiagnostic;
  readonly noteStatuses?: Readonly<Record<string, NoteStatus | undefined>>;
}

export type TrainerTiming = TimingConfig;
export interface InputDiagnostic {
  readonly source: string;
  readonly deviceId: string;
  readonly pitch: number;
  readonly velocity: number;
  readonly raw: number;
  readonly corrected: number;
  readonly offset: number;
  readonly expired: boolean;
}

const NOTHING: ReadonlySet<number> = new Set();

/** Two seconds fill the lane: at 114 BPM a quarter spans about 79 px of a 300 px lane. */
const LOOK_AHEAD_S = 2;
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
  loop = false;
  stopOnError = false;
  canStart = true;
  onInput: ((event: KeyEvent) => boolean) | undefined;
  private timing: TrainerTiming = {
    inputOffsets: {},
    manualInputOffsetMs: 0,
    audioOffsetMs: 0,
    visualOffsetMs: 0
  };
  private nextTiming = this.timing;
  private diagnostic: InputDiagnostic | undefined;
  private board: ComboBoard | undefined;
  private allowedDeviceId: string | undefined;
  private performanceMode = false;
  private textNoteIds: readonly string[] = [];
  private readonly audio = new SessionAudio();

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
  private readonly takeTimeline = new SongTimeline();
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
    this.timing = this.nextTiming;
    this.session.startClock(performance.now());
    this.session.pauseClock(performance.now());
    this.pitchOf = new Map(song.notes.map((note) => [note.id, note.pitch]));
    this.combo.reset();
    this.graded = [];
    this.playing = false;
    this.view.setSong(song);
    this.lastBeat = -1;
    this.publish();
  }

  /** The note a key answers now, if any (PracticeSession.owedNote). */
  nextDueNoteId(): string | undefined {
    return this.session?.owedNote()?.id;
  }

  /** Restarts the run from song time `from`, keeping play or pause as it was. */
  seek(from: number): void {
    if (!this.session) return;
    const resume = this.playing;
    this.finishTake();
    this.silence();
    this.playing = false;
    const now = performance.now();
    this.session.seek(from, now);
    this.session.pauseClock(now);
    this.combo.reset();
    this.graded = [];
    if (resume) this.setPlaying(true);
    this.publish();
  }

  setPlaying(playing: boolean): void {
    const session = this.session;
    const wasPlaying = this.playing;
    this.playing = playing && this.canStart && session?.finished !== true;
    if (this.playing && !wasPlaying && !this.recorder) this.timing = this.nextTiming;
    if (session)
      session.setInputGrace(
        Math.max(
          0,
          ...Object.values(this.timing.inputOffsets).map(
            (offset) => offset + this.timing.manualInputOffsetMs
          ),
          this.timing.manualInputOffsetMs
        )
      );
    if (!this.playing) this.silence();
    const now = performance.now();
    if (session && this.playing && !wasPlaying) {
      session.resumeClock(now);
      this.audio.start(session, now, this.timing.audioOffsetMs, () => this.metronome);
    }
    if (session && !this.playing && wasPlaying) this.apply(session.pauseClock(now));
    if (this.playing && !wasPlaying && session) {
      if (this.recorder) {
        this.takeTimeline.anchor(now, this.takeTimeline.at(now) ?? 0, 1);
      } else if (session.options.hands.size > 0) {
        // A listen-through has no player: nothing to record.
        this.recorder = new TakeRecorder({
          songKey: this.songKey,
          mode: session.options.mode,
          speed: session.options.speed,
          hands: [...session.options.hands],
          ...(session.options.playable ? { playable: session.options.playable } : {}),
          from: session.startedFrom,
          timing: {
            rulesVersion: 2,
            difficulty: session.options.difficulty ?? "normal",
            learningWindow:
              session.options.mode === "tempo" && session.options.learningWindow === true,
            ...this.timing
          }
        });
        this.takeTimeline.reset(now, 0, 1);
      }
    }
    if (!this.playing && wasPlaying)
      this.takeTimeline.anchor(now, this.takeTimeline.at(now) ?? 0, 0);
    this.publish();
  }

  key(event: KeyEvent): void {
    if (this.onInput?.(event)) return;
    if (
      this.allowedDeviceId &&
      event.deviceId !== this.allowedDeviceId &&
      !(this.allowedDeviceId === "keyboard" && event.source !== "midi")
    )
      return;
    const received = performance.now();
    const raw = event.timestamp ?? received;
    if (!Number.isFinite(raw)) return;
    const offset =
      (this.timing.inputOffsets[event.deviceId ?? event.source ?? "pointer"] ?? 0) +
      this.timing.manualInputOffsetMs;
    const corrected = raw - offset;
    if (event.type === "down") this.pressed.add(event.pitch);
    else this.pressed.delete(event.pitch);
    const session = this.session;
    if (session && this.playing) this.apply(session.tick(received));
    const eventTime =
      session?.songTimeAt(corrected) ?? (event.type === "up" ? session?.time : undefined);
    this.diagnostic = {
      source: event.source ?? "pointer",
      deviceId: event.deviceId ?? "pointer",
      pitch: event.pitch,
      velocity: event.velocity,
      raw,
      corrected,
      offset,
      expired: eventTime === undefined || received - raw > 250
    };
    if (eventTime === undefined || received - raw > 250) {
      this.publish();
      return;
    }
    if (this.recorder && session) {
      const inputTiming = {
        rawTimestampMs: raw,
        correctedTimestampMs: corrected,
        inputOffsetMs: offset,
        source: event.source ?? "pointer"
      };
      // Releases are kept even while paused: a key held over the pause still ends somewhere.
      if (event.type === "down") {
        this.recorder.noteOn(
          event.pitch,
          event.velocity,
          eventTime,
          this.realTime(corrected),
          event.deviceId,
          inputTiming
        );
      } else {
        this.recorder.noteOff(
          event.pitch,
          eventTime,
          this.realTime(corrected),
          event.deviceId,
          inputTiming
        );
      }
    }
    if (event.type === "down" && session) {
      this.apply(
        session.pressKeyAt(event.pitch, corrected, received, event.deviceId ?? event.source)
      );
      this.publish();
    }
    if (event.type === "up" && session)
      session.releaseKeyAt(event.pitch, corrected, event.deviceId ?? event.source);
  }

  configureTiming(timing: TrainerTiming): void {
    this.nextTiming = timing;
  }
  configureControls(controls: {
    loop: boolean;
    stopOnError: boolean;
    canStart: boolean;
    allowedDeviceId?: string;
    performance?: boolean;
  }): void {
    if (
      this.playing &&
      this.allowedDeviceId &&
      (!controls.canStart || controls.allowedDeviceId !== this.allowedDeviceId)
    )
      this.setPlaying(false);
    this.loop = controls.loop;
    this.stopOnError = controls.stopOnError;
    this.canStart = controls.canStart;
    this.allowedDeviceId = controls.allowedDeviceId;
    this.performanceMode = controls.performance === true;
  }
  activateOverdrive(): void {
    if (this.playing) this.session?.activateOverdrive(performance.now());
    this.publish();
  }

  destroy(): void {
    this.setPlaying(false);
    this.finishTake();
    this.onSnapshot = undefined;
    this.onTake = undefined;
    this.onInput = undefined;
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
    return this.session
      ? quartersAt(
          this.session.song,
          this.session.time - (this.timing.visualOffsetMs / 1000) * this.session.options.speed
        )
      : 0;
  }

  /** Only the text mode needs note statuses in the throttled React snapshot. */
  observeTextNotes(noteIds: readonly string[]): void {
    this.textNoteIds = noteIds;
  }

  pedal(down: boolean, timestamp = performance.now(), deviceId = ""): void {
    if (this.recorder && this.session) {
      if (performance.now() - timestamp > 250) return;
      const corrected =
        timestamp - (this.timing.inputOffsets[deviceId] ?? 0) - this.timing.manualInputOffsetMs;
      const time = this.session.songTimeAt(corrected) ?? (!down ? this.session.time : undefined);
      if (time !== undefined) this.recorder.setPedal(down, time, this.realTime(corrected));
    }
  }

  /** Seconds of the take's own clock: real time since it began, pauses left out. */
  private realTime(timestamp = performance.now()): number {
    return Math.max(0, this.takeTimeline.at(timestamp) ?? 0);
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
      const now = performance.now();
      this.apply(session.tick(now));
    }
    this.view.draw({
      time: session.time - (this.timing.visualOffsetMs / 1000) * session.options.speed,
      hintTime: session.time,
      hintSpeed: session.options.speed,
      hintNotes: session.keyHints(),
      lookAhead: LOOK_AHEAD_S,
      statusOf: (id) => session.statusOf(id),
      pressed: this.pressed,
      sounding: this.sounding,
      due: this.playing || session.time < 0 ? session.nextDue() : [],
      owedNoteId: session.owedNote()?.id,
      waitingFor: session.waiting ? session.nextDue() : [],
      hands: session.options.hands,
      owns: session.owns,
      hints: !this.performanceMode,
      colorOf: this.comparison?.colorOf,
      board: this.board ?? this.combo.board(),
      graded: this.graded
    });
    // The view has shown them: next frame grades only its own strikes.
    this.graded = [];
    const mirror = this.comparison?.mirror;
    mirror?.view.draw({
      time: session.time,
      hintTime: session.time,
      hintSpeed: session.options.speed,
      hintNotes: [],
      lookAhead: LOOK_AHEAD_S,
      statusOf: () => undefined,
      pressed: NOTHING,
      sounding: NOTHING,
      due: [],
      hands: session.options.hands,
      owns: session.owns,
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
          break;
        case "autoNoteOff":
          this.sounding.delete(event.pitch);
          break;
        case "beat":
          break;
        case "finished":
          this.finishTake();
          this.playing = false;
          this.silence();
          if (this.loop && this.session) {
            this.seek(this.session.options.from ?? 0);
            this.setPlaying(true);
          }
          break;
        case "hit":
        case "miss":
        case "wrong": {
          const grade = this.combo.record(event);
          const pitch = event.type === "wrong" ? event.pitch : this.pitchOf.get(event.noteId);
          if (grade && pitch !== undefined)
            this.graded.push({
              grade,
              pitch,
              ...(event.type === "hit"
                ? { offsetMs: event.offset * 1000, assisted: event.assisted }
                : {})
            });
          if (event.type !== "hit" && this.stopOnError) this.setPlaying(false);
          break;
        }
      }
    }
  }

  private silence(): void {
    if (this.session) this.apply(this.session.stopAuto());
    this.sounding.clear();
    this.audio.reset(performance.now());
    soundAllOff();
  }

  private publish(): void {
    const session = this.session;
    if (!session) return;
    this.sinceSnapshot = 0;
    this.lastBeat = beatAt(session.song, session.time);
    const stats = session.stats();
    const game = stats.game;
    this.board = game
      ? { combo: game.combo, best: game.maxCombo, accuracy: (game.accuracy ?? 100) / 100 }
      : undefined;
    this.onSnapshot?.({
      playing: this.playing,
      waiting: session.waiting,
      finished: session.finished,
      time: session.time,
      beat: this.lastBeat,
      timingPolicy: timingPolicy(session.options),
      stats,
      ...(this.textNoteIds.length > 0
        ? {
            noteStatuses: Object.fromEntries(
              this.textNoteIds.map((id) => [id, session.statusOf(id)])
            )
          }
        : {}),
      ...(this.diagnostic ? { diagnostic: this.diagnostic } : {})
    });
  }
}
