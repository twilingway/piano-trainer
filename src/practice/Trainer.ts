import { soundAllOff } from "../audio/pianoSound";
import type { SessionMelodyOutput } from "../audio/sessionAudio";
import { SessionAudio } from "../audio/sessionAudio";
import { loadVoiceTrack } from "../audio/voiceTrack";
import type { KeyEvent } from "../input/midiInput";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Take, TakeRecorder } from "../recording/take";
import type { Song, SongNote } from "../song/song";
import { ComboCounter } from "./combo";
import type { ComboBoard, GradedStrike } from "./combo";
import { RunCompletionTracker } from "./runCompletion";
import type { RunCompletion } from "./runCompletion";
import { PracticeSession } from "./session";
import type { PracticeEvent, PracticeOptions } from "./session";
import type { TimingConfig } from "./timingConfig";
import { maximumInputCompensation } from "./timingConfig";
import { SongTimeline } from "./timing";
import { beatAt } from "./sessionBeats";
export { beatAt } from "./sessionBeats";
import { ReadingAttackGate, type TrainerReadingPolicy } from "./readingPolicy";
import type { CourseKeyContext, CourseKind, CoursePolicies, KeyTimes } from "./trainerCourse";
import { createTrainerRecorder, finishTrainerTake } from "./trainerRecording";
import {
  drawTrainerMirror,
  trainerQuarters,
  drawGuidedTrainerScene,
  trainerGrade
} from "./trainerView";
import { TrainerCoursePolicies } from "./trainerCoursePolicies";
import { processPianoInput } from "./trainerPianoInput";
import { TrainerInputHolds } from "./trainerInputHolds";
import * as snapshots from "./trainerSnapshot";
import type { InputDiagnostic, TrainerSnapshot } from "./trainerSnapshot";
export type { InputDiagnostic, TrainerSnapshot } from "./trainerSnapshot";

export type TrainerTiming = TimingConfig;

/** React snapshots are slower than the shared animation clock. */
const SNAPSHOT_INTERVAL_MS = 150;

/**
 * Glue between the pure session, the picture, the sound and the keys. Owns
 * the frame loop; React only reads throttled snapshots and sends commands.
 */
export class Trainer {
  onSnapshot: ((snapshot: TrainerSnapshot) => void) | undefined;
  /** A take has ended: the song finished, or the run was restarted, moved or reloaded. */
  onTake: ((take: Take) => void) | undefined;
  /** Natural end only, emitted before a loop restarts or a take is delivered. */
  onRunFinished: ((result: RunCompletion) => void) | undefined;
  /** The keys to light on the player's instrument, every frame; none once the run stops. */
  onLights: ((pitches: readonly number[]) => void) | undefined;
  metronome = false;
  loop = false;
  stopOnError = false;
  canStart = true;
  onInput: ((event: KeyEvent) => boolean) | undefined;
  private readonly courses: TrainerCoursePolicies;
  private readonly inputHolds = new TrainerInputHolds();
  private readonly readingGate = new ReadingAttackGate();

  /** One course at a time; null removes it only when the active course is of this kind. */
  configureCourse<K extends CourseKind>(kind: K, policy: CoursePolicies[K] | null): void {
    this.courses.configure(kind, policy);
  }
  cancelInput(resetAll = false): void {
    this.courses.cancelInput(resetAll);
  }
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
  private resumeWhenReady = false;
  private resumePending = false;
  private textNoteIds: readonly string[] = [];
  private readonly audio = new SessionAudio();

  private session: PracticeSession | undefined;
  private songKey = "";
  private readonly run = new RunCompletionTracker();
  /** The run of good notes and the accuracy, started over with each run. */
  private readonly combo = new ComboCounter();
  /** Strikes graded since the last frame was drawn. */
  private graded: GradedStrike[] = [];
  /** The song's notes' keys by note id: a missed note is shown on its key. */
  private pitchOf = new Map<string, number>();
  private playing = false;
  private graphicsAvailable = true;
  private effectEpoch = 0;
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
    this.courses = new TrainerCoursePolicies(
      this.inputHolds,
      this.pressed,
      () => this.onLights,
      () => this.session
    );
    view.onTick((deltaMs) => {
      this.frame(deltaMs);
    });
  }

  /** `songKey` names the song for its takes: the same key its finger corrections use. */
  load(
    song: Song,
    options: PracticeOptions,
    songKey: string,
    {
      preservePosition = false,
      runContext
    }: { preservePosition?: boolean; runContext?: string } = {}
  ): void {
    this.cancelInput();
    const now = performance.now();
    const previous = preservePosition ? this.session : undefined;
    const resume = previous !== undefined && this.playing;
    this.resumePending = previous !== undefined && this.resumePending;
    // Resolve between-frame progress with the old clock and speed before replacing either.
    previous?.pauseClock(now);
    const position = previous?.time;
    this.run.load(song, options, songKey, runContext, previous !== undefined);
    this.finishTake();
    this.silence();
    this.songKey = songKey;
    this.session = new PracticeSession(song, options);
    if (song.voice) loadVoiceTrack(song.voice);
    this.courses.current?.attach?.(this.session);
    if (position !== undefined) this.session.seek(position, now, { leadIn: false });
    if (previous) this.session.inheritNoteResult(previous);
    this.timing = this.nextTiming;
    this.session.startClock(now);
    this.session.pauseClock(now);
    this.pitchOf = new Map(song.notes.map((note) => [note.id, note.pitch]));
    this.combo.reset();
    this.graded = [];
    this.playing = false;
    this.effectEpoch++;
    this.view.setSong(song);
    this.lastBeat = -1;
    if (resume) this.setPlaying(true);
    else this.publish();
  }

  /** The note a key answers now, if any (PracticeSession.owedNote). */
  nextDueNoteId(): string | undefined {
    return this.session?.owedNote()?.id;
  }

  /** Restarts the run from song time `from`, keeping play or pause as it was. */
  seek(from: number): void {
    this.move(from, false);
  }

  /** Starts a fresh eligible run, unlike moving the playback position. */
  restart(from = 0): void {
    this.move(from, true);
  }

  private move(from: number, restart: boolean): void {
    this.cancelInput();
    this.resumePending = false;
    if (!this.session) return;
    if (restart) this.run.restart();
    else this.run.seek();
    const resume = this.playing;
    this.finishTake();
    this.silence();
    this.playing = false;
    const now = performance.now();
    this.effectEpoch++;
    this.session.seek(from, now);
    this.session.pauseClock(now);
    this.combo.reset();
    this.graded = [];
    if (resume) this.setPlaying(true);
    this.publish();
  }

  /** Changes automatic-note routing without moving the song or restarting a take. */
  setMelodyOutput(output: SessionMelodyOutput): void {
    const now = performance.now();
    this.audio.configure(output, now);
    if (this.playing && this.session)
      this.audio.start(this.session, now, this.timing.audioOffsetMs, () => this.metronome);
  }

  setGraphicsAvailable(available: boolean): void {
    this.graphicsAvailable = available;
    if (!available) {
      this.setPlaying(false);
      this.cancelInput(true);
    }
  }

  setPlaying(playing: boolean): void {
    const course = this.courses.current;
    this.resumePending = false;
    const session = this.session;
    const wasPlaying = this.playing;
    this.playing =
      playing &&
      this.graphicsAvailable &&
      this.canStart &&
      (session?.finished !== true || course?.playsAfterFinish === true);
    if (this.playing && !wasPlaying && !this.recorder) this.timing = this.nextTiming;
    if (session)
      session.setInputGrace(
        course?.inputCompensationMs?.() ?? maximumInputCompensation(this.timing)
      );
    if (!this.playing) this.silence();
    const now = performance.now();
    if (session && this.playing && !wasPlaying) {
      this.run.begin(session.startedFrom);
      session.resumeClock(now);
      if (course?.start && !course.start(session, now, this.inputHolds.snapshot())) {
        this.playing = false;
        session.pauseClock(now);
        this.publish();
        return;
      }
      this.audio.start(session, now, this.timing.audioOffsetMs, () => this.metronome);
    }
    if (session && !this.playing && wasPlaying) this.apply(session.pauseClock(now));
    if (this.playing && !wasPlaying && session) {
      if (this.recorder) {
        this.takeTimeline.anchor(now, this.takeTimeline.at(now) ?? 0, 1);
      } else if (session.options.hands.size > 0 && !course?.ownsInput) {
        // A listen-through has no player: nothing to record.
        this.recorder = createTrainerRecorder(session, this.songKey, this.timing);
        this.takeTimeline.reset(now, 0, 1);
      }
    }
    if (!this.playing && wasPlaying)
      this.takeTimeline.anchor(now, this.takeTimeline.at(now) ?? 0, 0);
    if (session && course) this.apply(course.step(session, this.playing, now));
    this.publish();
  }

  key(event: KeyEvent): void {
    this.inputHolds.record(event, performance.now());
    const course = this.courses.current;
    if (course) course.key(event, this.keyContext());
    else this.ordinaryKey(event, null);
  }

  private keyContext(): CourseKeyContext {
    return {
      session: this.session,
      playing: () => this.playing,
      timing: this.timing,
      pressed: this.pressed,
      gate: this.readingGate,
      intercept: (event) => this.onInput?.(event) === true,
      admits: (event) => this.admits(event),
      times: (event) => this.keyTimes(event),
      ordinary: (event, reading) => {
        this.ordinaryKey(event, reading);
      },
      apply: (events) => {
        this.apply(events);
      },
      publish: () => {
        this.publish();
      }
    };
  }

  private admits(event: KeyEvent): boolean {
    return (
      !this.allowedDeviceId ||
      event.deviceId === this.allowedDeviceId ||
      (this.allowedDeviceId === "keyboard" && event.source !== "midi")
    );
  }

  private keyTimes(event: KeyEvent): KeyTimes | undefined {
    const received = performance.now();
    const raw = event.timestamp ?? received;
    if (!Number.isFinite(raw)) return undefined;
    const offset =
      (this.timing.inputOffsets[event.deviceId ?? event.source ?? "pointer"] ?? 0) +
      this.timing.manualInputOffsetMs;
    return { raw, corrected: raw - offset, received };
  }

  private ordinaryKey(event: KeyEvent, reading: TrainerReadingPolicy | null): void {
    if (this.onInput?.(event)) return;
    if (!this.admits(event)) return;
    const times = this.keyTimes(event);
    if (!times) return;
    const { raw, corrected, received } = times;
    const fresh = this.readingGate.accept(event);
    if (event.type === "down") this.pressed.add(event.pitch);
    else this.pressed.delete(event.pitch);
    processPianoInput(event, {
      session: this.session,
      reading,
      playing: () => this.playing,
      fresh,
      raw,
      corrected,
      received,
      recorder: () => this.recorder,
      realTime: this.realTime(corrected),
      apply: (events) => {
        this.apply(events);
      },
      diagnose: (diagnostic) => {
        this.diagnostic = diagnostic;
      },
      publish: () => {
        this.publish();
      }
    });
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
    resumeWhenReady?: boolean;
  }): void {
    const canResume =
      controls.resumeWhenReady === true && !this.allowedDeviceId && !controls.allowedDeviceId;
    const blocked = this.playing && !controls.canStart;
    const deviceChanged =
      this.playing && this.allowedDeviceId && controls.allowedDeviceId !== this.allowedDeviceId;
    this.loop = controls.loop;
    this.stopOnError = controls.stopOnError;
    this.canStart = controls.canStart;
    this.allowedDeviceId = controls.allowedDeviceId;
    this.performanceMode = controls.performance === true;
    this.resumeWhenReady = controls.resumeWhenReady === true;
    if (blocked || deviceChanged) {
      this.setPlaying(false);
      this.resumePending = blocked && canResume;
    }
    if (!canResume) this.resumePending = false;
    if (this.canStart && this.resumePending && this.resumeWhenReady) this.setPlaying(true);
  }
  activateOverdrive(): void {
    if (this.courses.current?.overdrive === false) return;
    if (this.playing) this.session?.activateOverdrive(performance.now());
    this.publish();
  }

  destroy(): void {
    this.run.restart();
    this.setPlaying(false);
    this.finishTake();
    this.onSnapshot = undefined;
    this.onTake = undefined;
    this.onRunFinished = undefined;
    this.onInput = undefined;
    this.courses.clear();
    this.readingGate.clear();
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
    return trainerQuarters(
      this.session,
      this.timing.visualOffsetMs,
      this.courses.current?.smoothClock === true
    );
  }

  /** Only the text mode needs note statuses in the throttled React snapshot. */
  observeTextNotes(noteIds: readonly string[]): void {
    this.textNoteIds = noteIds;
  }

  pedal(down: boolean, timestamp = performance.now(), deviceId = ""): void {
    if (this.courses.current?.ownsInput) return;
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
    this.recorder = undefined;
    if (recorder && this.session && !recorder.isEmpty)
      this.onTake?.(finishTrainerTake(recorder, this.session, this.realTime()));
  }

  private frame(deltaMs: number): void {
    const course = this.courses.current;
    const session = this.session;
    if (!session) return;
    const now = performance.now();
    if (this.playing) this.apply(session.tick(now));
    if (course) this.apply(course.step(session, this.playing, now));
    drawGuidedTrainerScene(
      this.view,
      session,
      {
        playing: this.playing,
        effectEpoch: this.effectEpoch,
        performance: this.performanceMode,
        visualOffsetMs: this.timing.visualOffsetMs,
        course,
        pressed: this.pressed,
        sounding: this.sounding,
        colorOf: this.comparison?.colorOf,
        board: this.board ?? this.combo.board(),
        graded: this.graded,
        onLights: this.onLights
      },
      now
    );
    // The view has shown them: next frame grades only its own strikes.
    this.graded = [];
    drawTrainerMirror(this.comparison?.mirror, session);
    this.sinceSnapshot += deltaMs;
    const beat = beatAt(session.song, session.time);
    if (this.sinceSnapshot >= SNAPSHOT_INTERVAL_MS || beat !== this.lastBeat) this.publish();
  }

  private apply(events: readonly PracticeEvent[]): void {
    const course = this.courses.current;
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
          if (course && !course.gradesRun) break;
          {
            const result = this.run.finish(this.session?.stats().noteResult);
            if (result) this.onRunFinished?.(result);
          }
          this.finishTake();
          this.playing = false;
          this.silence();
          if (this.loop && this.canStart && this.session) {
            this.restart(this.session.options.from ?? 0);
            this.setPlaying(true);
          }
          break;
        case "hit":
        case "miss":
        case "wrong": {
          if (course && !course.gradesRun) break;
          if (event.type === "hit") this.run.hit();
          const grade = trainerGrade(event, this.combo, this.pitchOf);
          if (grade) this.graded.push(grade);
          if (event.type !== "hit" && this.stopOnError) this.setPlaying(false);
          break;
        }
      }
    }
  }

  private silence(): void {
    this.cancelInput();
    if (this.session) this.apply(this.session.stopAuto());
    this.sounding.clear();
    this.onLights?.([]);
    this.audio.reset(performance.now());
    soundAllOff();
  }

  private publish(): void {
    const session = this.session;
    if (!session) return;
    this.sinceSnapshot = 0;
    const state = snapshots.trainerSnapshot(
      session,
      this.playing,
      beatAt(session.song, session.time),
      this.textNoteIds,
      this.diagnostic,
      this.courses.current
    );
    this.lastBeat = state.snapshot.beat;
    this.board = state.board;
    this.onSnapshot?.(state.snapshot);
  }
}
