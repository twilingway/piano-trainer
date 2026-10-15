import { soundAllOff } from "../audio/pianoSound";
import { SessionAudio } from "../audio/sessionAudio";
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
import { processRhythmKey } from "./rhythmPolicy";
import type { TrainerRhythmPolicy } from "./rhythmPolicy";
import { stepTrainerPair } from "./twoHandPolicy";
import type { TrainerPairPolicy } from "./twoHandPolicy";
import { stepTrainerHeldBass, type TrainerHeldBassPolicy } from "./heldBassPolicy";
import {
  observeIndependentRhythmInput,
  stepIndependentRhythm,
  type TrainerIndependentRhythmPolicy
} from "./independentRhythmPolicy";
import { createTrainerRecorder, finishTrainerTake } from "./trainerRecording";
import {
  drawTrainerMirror,
  trainerQuarters,
  drawGuidedTrainerScene,
  trainerGrade
} from "./trainerView";
import { TrainerCoursePolicies } from "./trainerCoursePolicies";
import { processScopedInput } from "./trainerScopedInput";
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

  configureReading(policy: TrainerReadingPolicy | null): void {
    this.courses.configureReading(policy);
  }
  configureRhythm(policy: TrainerRhythmPolicy | null): void {
    this.courses.configureRhythm(policy);
  }
  configurePair(policy: TrainerPairPolicy | null): void {
    this.courses.configurePair(policy);
  }
  configureHeldBass(policy: TrainerHeldBassPolicy | null): void {
    this.courses.configureHeldBass(policy);
  }
  configureIndependentRhythm(policy: TrainerIndependentRhythmPolicy | null): void {
    this.courses.configureIndependentRhythm(policy);
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
    if (this.courses.heldBass) this.session.registerVerifiedOnsets(this.courses.heldBass.onsets);
    if (position !== undefined) this.session.seek(position, now, { leadIn: false });
    if (previous) this.session.inheritNoteResult(previous);
    this.timing = this.nextTiming;
    this.session.startClock(now);
    this.session.pauseClock(now);
    this.pitchOf = new Map(song.notes.map((note) => [note.id, note.pitch]));
    this.combo.reset();
    this.graded = [];
    this.playing = false;
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
    this.session.seek(from, now);
    this.session.pauseClock(now);
    this.combo.reset();
    this.graded = [];
    if (resume) this.setPlaying(true);
    this.publish();
  }

  setPlaying(playing: boolean): void {
    const { reading, rhythm, pair, heldBass, independentRhythm } = this.courses;
    this.resumePending = false;
    const session = this.session;
    const wasPlaying = this.playing;
    this.playing =
      playing &&
      this.canStart &&
      (session?.finished !== true || heldBass !== null || independentRhythm !== null);
    if (this.playing && !wasPlaying && !this.recorder) this.timing = this.nextTiming;
    if (session)
      session.setInputGrace(
        (independentRhythm ?? rhythm)?.inputCompensationMs() ??
          maximumInputCompensation(this.timing)
      );
    if (!this.playing) this.silence();
    const now = performance.now();
    if (session && this.playing && !wasPlaying) {
      this.run.begin(session.startedFrom);
      session.resumeClock(now);
      if (
        independentRhythm &&
        !independentRhythm.onStart(now, session.tempoClockReceipt(now), this.inputHolds.snapshot())
      ) {
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
      } else if (session.options.hands.size > 0 && !this.courses.hasDedicatedInput) {
        // A listen-through has no player: nothing to record.
        this.recorder = createTrainerRecorder(session, this.songKey, this.timing);
        this.takeTimeline.reset(now, 0, 1);
      }
    }
    if (!this.playing && wasPlaying)
      this.takeTimeline.anchor(now, this.takeTimeline.at(now) ?? 0, 0);
    if (session) reading?.onFrame(session, this.playing, now);
    if (session) rhythm?.onFrame(session, this.playing, now);
    if (session) this.apply(stepTrainerPair(pair, session, this.playing, now));
    if (session) this.apply(stepTrainerHeldBass(heldBass, session, this.playing, now));
    stepIndependentRhythm(independentRhythm, session, this.playing, now);
    this.publish();
  }

  key(event: KeyEvent): void {
    const { reading, rhythm, pair, heldBass, independentRhythm } = this.courses;
    this.inputHolds.record(event, performance.now());
    if (independentRhythm) {
      const session = this.session,
        received = performance.now();
      if (event.type === "down") this.pressed.add(event.pitch);
      else this.pressed.delete(event.pitch);
      if (session && this.playing) this.apply(session.tick(received));
      if (session)
        observeIndependentRhythmInput(independentRhythm, session, event, this.playing, received);
      this.publish();
      return;
    }
    if (!heldBass && this.onInput?.(event) && !(rhythm && event.type === "up")) return;
    if (rhythm) {
      this.apply(
        processRhythmKey(event, this.session, rhythm, this.readingGate, this.timing, this.playing)
      );
      if (this.session) rhythm.onFrame(this.session, this.playing, performance.now());
      this.publish();
      return;
    }
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
    const scoped = heldBass ?? pair;
    if (scoped) {
      if (event.type === "down") this.pressed.add(event.pitch);
      else this.pressed.delete(event.pitch);
      processScopedInput(
        event,
        this.session,
        heldBass,
        pair,
        this.playing,
        raw,
        corrected,
        received,
        (events) => {
          this.apply(events);
        }
      );
      this.publish();
      return;
    }
    const fresh = this.readingGate.accept(event);
    if (event.type === "down") this.pressed.add(event.pitch);
    else this.pressed.delete(event.pitch);
    processPianoInput(event, {
      session: this.session,
      reading: reading,
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
    if (this.courses.independentRhythm) return;
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
      this.courses.rhythm !== null ||
        this.courses.heldBass !== null ||
        this.courses.independentRhythm !== null
    );
  }

  /** Only the text mode needs note statuses in the throttled React snapshot. */
  observeTextNotes(noteIds: readonly string[]): void {
    this.textNoteIds = noteIds;
  }

  pedal(down: boolean, timestamp = performance.now(), deviceId = ""): void {
    if (this.courses.hasDedicatedInput) return;
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
    const { reading, rhythm, pair, heldBass, independentRhythm } = this.courses;
    const session = this.session;
    if (!session) return;
    const now = performance.now();
    if (this.playing) this.apply(session.tick(now));
    reading?.onFrame(session, this.playing, now);
    rhythm?.onFrame(session, this.playing, now);
    this.apply(stepTrainerPair(pair, session, this.playing, now));
    this.apply(stepTrainerHeldBass(heldBass, session, this.playing, now));
    stepIndependentRhythm(independentRhythm, session, this.playing, now);
    drawGuidedTrainerScene(
      this.view,
      session,
      {
        playing: this.playing,
        performance: this.performanceMode,
        visualOffsetMs: this.timing.visualOffsetMs,
        reading: reading,
        scoped: heldBass ?? pair,
        rhythm: rhythm !== null,
        independentRhythm: independentRhythm,
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
    const { heldBass, independentRhythm } = this.courses;
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
          if (heldBass || independentRhythm) break;
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
          if (heldBass || independentRhythm) break;
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
      this.courses.independentRhythm
    );
    this.lastBeat = state.snapshot.beat;
    this.board = state.board;
    this.onSnapshot?.(state.snapshot);
  }
}
