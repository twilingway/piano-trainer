import { IntegratedLesson, createIntegratedPlan } from "../musicLearning/integrated";
import type { IntegratedPhaseId } from "../musicLearning/integrated";
import { SightReadingPreview } from "../musicLearning/sightReadingPreview";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type { MusicCourseCommand } from "../ui/musicCourseTypes";
import { MusicCourseRun } from "./musicCourseRun";
import type { MusicActivity } from "./musicCourseExercise";
import type {
  MusicCourseSelection,
  MusicCourseCallbacks,
  MusicCourseConnection,
  MusicCourseSnapshot,
  MusicCourseControllerContract
} from "./musicCourseContracts";
import { defaultTimingPreferences } from "./timingPreferences";
import { musicControllerInputOffset } from "./musicCourseControllerTiming";
import { reserveMusicActivity } from "./musicCourseControllerMaterial";
import {
  createMusicControllerState,
  musicControllerOptions,
  musicControllerSnapshot,
  musicControllerFrameSignature
} from "./musicCourseControllerView";
import { MusicControllerAudio } from "./musicCourseControllerAudio";
import {
  completeMusicController,
  restoreMusicControllerBoundary,
  saveMusicControllerLesson,
  presentMusicControllerRun
} from "./musicCourseControllerCompletion";
import { prepareMusicControllerReplacement } from "./musicCourseControllerNext";
import { musicControllerCommand, musicControllerChoose } from "./musicCourseControllerActions";
import type { MusicControllerActionsHost } from "./musicCourseControllerActions";
import type { MusicPersistentState } from "./musicPersistence";

let controllerSequence = 0;
/** One presentation owns callbacks, readiness and evidence; the Trainer owns the musical clock. */
export class MusicCourseController implements MusicCourseControllerContract {
  private readonly state = createMusicControllerState();
  private readonly listeners = new Set<() => void>();
  private readonly audio = new MusicControllerAudio();
  private readonly owner = `music-controller-${String(++controllerSequence)}-${crypto.randomUUID()}`;
  private connection: MusicCourseConnection = {
    trainer: null,
    blocked: true,
    deviceId: undefined,
    timing: defaultTimingPreferences()
  };
  private snapshot: MusicCourseSnapshot;
  private active = false;
  private generation = 0;
  private sequence = 0;
  private expectedStop = false;
  private menuPause = false;
  private hidden = false;
  private loading = false;
  private frameVersion = "";
  private operation = 0;
  private saved: MusicPersistentState;
  constructor(
    readonly selection: MusicCourseSelection,
    private readonly callbacks: MusicCourseCallbacks
  ) {
    this.saved = selection.saved;
    this.snapshot = musicControllerSnapshot(this.state, selection.saved, true);
  }
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = (): MusicCourseSnapshot => this.snapshot;
  private publish(): void {
    this.snapshot = musicControllerSnapshot(
      this.state,
      this.saved,
      this.connection.blocked || this.hidden || !this.active
    );
    this.frameVersion = musicControllerFrameSignature(this.state);
    for (const listener of this.listeners) listener();
  }
  private valid(generation: number, id = this.state.identity?.presentationId): boolean {
    return (
      this.active && generation === this.generation && id === this.state.identity?.presentationId
    );
  }
  private offset(): number {
    return musicControllerInputOffset(this.saved.inputSource, this.connection);
  }
  readonly activate = (): void => {
    if (this.active || !this.selection.active) return;
    this.active = true;
    if (this.state.lesson?.snapshot().status === "running")
      this.state.lesson.repeat(this.state.lesson.snapshot().phaseId);
    this.audio.activate(this.owner);
    this.hidden = typeof document !== "undefined" && document.hidden;
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibility);
    void this.prepare();
  };
  readonly dispose = (): void => {
    if (!this.active) return;
    this.active = false;
    this.operation++;
    this.generation++;
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibility);
    this.audio.dispose();
    this.state.preview?.cancel();
    this.state.run?.cancel(performance.now());
    this.stop();
  };
  private readonly visibility = (): void => {
    this.hidden = document.hidden;
    const now = performance.now();
    this.state.preview?.setActive(!this.hidden && !this.connection.blocked, now);
    if (this.hidden && this.state.run?.snapshot().started && !this.state.savedResult) this.cancel();
    this.publish();
  };
  readonly refreshConnection = (connection: MusicCourseConnection): void => {
    const previous = this.connection;
    const changed =
      previous.deviceId !== connection.deviceId ||
      JSON.stringify(previous.timing) !== JSON.stringify(connection.timing) ||
      (previous.trainer !== null && previous.trainer !== connection.trainer);
    this.connection = connection;
    const now = performance.now();
    this.state.preview?.setActive(!connection.blocked && !this.hidden, now);
    if (changed && this.state.run?.snapshot().started && !this.state.savedResult) this.cancel();
    else if (changed && this.state.run && !this.state.savedResult) {
      this.state.lesson?.repeat(this.state.lesson.snapshot().phaseId);
      void this.prepare();
    }
    if (
      connection.blocked &&
      !previous.blocked &&
      this.state.run?.snapshot().started &&
      !this.state.savedResult
    ) {
      this.menuPause = true;
      this.state.run.pause(true, Math.max(0, now - this.offset()));
      this.stop();
      this.state.status = "paused";
    }
    if (!connection.blocked) this.menuPause = false;
    this.publish();
  };
  private stop(): void {
    this.expectedStop = true;
    try {
      this.connection.trainer?.setPlaying(false);
    } finally {
      this.expectedStop = false;
    }
  }
  private async prepare(): Promise<void> {
    this.operation++;
    const generation = ++this.generation;
    this.loading = true;
    this.stop();
    this.audio.cancel();
    this.state.run?.cancel(performance.now());
    this.state.status = "preparation";
    this.state.error = undefined;
    this.state.presented = false;
    this.publish();
    try {
      const saved = this.saved;
      if (saved.course === "integrated" && !this.state.lesson) {
        const prior = saved.integrated?.plan.seed === saved.seed ? saved.integrated : null;
        const plan = createIntegratedPlan(prior?.plan ?? { seed: saved.seed });
        this.state.plan = plan;
        this.state.lesson = new IntegratedLesson({
          lessonId: prior?.state.lessonId ?? `${this.owner}:lesson`,
          plan,
          ...(prior ? { saved: prior.state } : {})
        });
      }
      const lesson = this.state.lesson;
      if (
        lesson &&
        ["child-complete", "phase-complete", "lesson-complete"].includes(lesson.snapshot().status)
      ) {
        restoreMusicControllerBoundary(this.state, saved);
        this.loading = false;
        this.publish();
        return;
      }
      const found = await reserveMusicActivity(
        saved,
        lesson,
        this.callbacks,
        () => this.active && generation === this.generation
      );
      if (!found || !this.active || generation !== this.generation) return;
      this.state.newMaterial = found.newMaterial;
      this.installRun(found.activity);
      if (lesson) this.saveLesson();
    } catch {
      if (this.active && generation === this.generation) {
        this.state.status = "error";
        this.state.error = { key: "Не удалось подготовить новый материал. Повторите попытку." };
      }
    } finally {
      if (this.active && generation === this.generation) {
        this.loading = false;
        this.publish();
      }
    }
  }
  private installRun(activity: MusicActivity | null): void {
    if (!activity) return;
    const s = this.state;
    const identity = s.lesson?.snapshot().identity ?? {
      runId: `${this.owner}:${String(++this.sequence)}:run`,
      presentationId: `${this.owner}:${String(this.sequence)}:presentation`
    };
    s.identity = identity;
    s.activity = activity;
    s.scene = { ...activity.exercise, id: identity.presentationId };
    s.run = new MusicCourseRun(activity, this.saved, identity, this.connection.deviceId);
    s.session = null;
    s.preview = null;
    s.presented = false;
    s.status = "preparation";
    s.error = undefined;
    s.result = undefined;
    s.savedResult = false;
    s.startedAt = 0;
    s.choiceSource = undefined;
    s.visualAlternative = false;
    s.staffRequired = !activity.auditory;
    s.policyAttached = false;
    s.canNext = false;
    s.helpShown = false;
    s.hint = false;
    s.feedback = undefined;
    s.groupAnswers = [];
    s.controlGroup = null;
    s.positionReady = !activity.sight || activity.purpose === "control";
    s.groupReady =
      !activity.sight ||
      activity.purpose === "control" ||
      !["steps", "triads"].includes(activity.sight.level);
    s.positionLowPitch = undefined;
    s.fingeringSource = undefined;
    s.fingeringXml = undefined;
    s.aheadIndex = -2;
    s.aheadXml = undefined;
    s.options = musicControllerOptions(activity);
  }
  readonly present = (id: string, atMs: number): void => {
    if (!this.active || this.loading || this.state.savedResult) return;
    if (
      id !== this.state.identity?.presentationId ||
      this.state.presented ||
      !Number.isFinite(atMs) ||
      this.state.error
    )
      return;
    this.state.presented = true;
    const activity = this.state.activity;
    if (activity?.sight) {
      this.state.preview = new SightReadingPreview(atMs, this.saved.sightPreviewSeconds);
      this.state.preview.setActive(!this.connection.blocked && !this.hidden, atMs);
      this.state.status = "preview";
    } else this.state.status = "ready";
    presentMusicControllerRun(this.state, atMs, this.offset());
    const lesson = this.state.lesson;
    if (lesson && activity)
      lesson.setReady(lesson.snapshot().identity, {
        reservedFingerprint: activity.exercise.fingerprint
      });
    this.publish();
  };
  readonly staffError = (id: string): void => {
    if (id !== this.state.identity?.presentationId) return;
    this.cancel();
    this.state.error = { key: "Не удалось показать ноты. Повторите загрузку задания." };
    this.publish();
  };
  private policyReady(atMs: number): void {
    this.state.policyAttached = true;
    if (this.state.staffRequired || this.state.status !== "preparation") return;
    this.state.status = "ready";
    this.state.run?.setReady(true, Math.max(0, atMs - this.offset()));
    if (this.state.lesson && this.state.activity)
      this.state.lesson.setReady(this.state.lesson.snapshot().identity, {
        reservedFingerprint: this.state.activity.exercise.fingerprint
      });
  }
  readonly policy = (id: string): TrainerMusicPolicy => {
    const generation = this.generation;
    const current = () => this.valid(generation, id);
    return {
      inputCompensationMs: () => this.offset(),
      seedHeld: (held, atMs) => {
        if (current()) {
          this.policyReady(atMs);
          this.state.run?.seed(held, atMs, this.offset());
          this.publish();
        }
      },
      onStart: (session, atMs, held) => {
        if (
          !current() ||
          !this.snapshot.view.canStart ||
          held.some(
            (event) =>
              event.source === this.saved.inputSource &&
              (event.source !== "midi" ||
                !this.connection.deviceId ||
                event.deviceId === this.connection.deviceId)
          ) ||
          !this.state.run
        )
          return false;
        const wasStarted = this.state.run.snapshot().started;
        if (!wasStarted && this.state.preview && !this.state.preview.start(atMs, true))
          return false;
        if (!this.state.run.start(session, atMs, this.offset())) return false;
        if (
          !wasStarted &&
          this.state.lesson &&
          !this.state.lesson.start(this.state.lesson.snapshot().identity)
        )
          return false;
        this.state.session = session;
        this.state.startedAt ||= Date.now();
        this.state.status = this.state.activity?.auditory ? "reply" : "playing";
        this.publish();
        return true;
      },
      onFrame: (session, playing, atMs) => {
        if (!current()) return [];
        this.policyReady(atMs);
        this.state.session = session;
        const old = this.frameVersion;
        this.state.preview?.step(atMs);
        if (this.state.status === "preview" && this.state.preview?.snapshot().phase === "ready")
          this.state.status = "ready";
        this.state.run?.frame(session, playing, atMs, this.offset());
        if (
          this.state.run?.snapshot().finished &&
          !this.state.savedResult &&
          !this.state.activity?.dictation
        )
          this.complete();
        if (musicControllerFrameSignature(this.state) !== old) this.publish();
        return [];
      },
      onInput: (event, session, playing, times) => {
        if (!current() || !this.state.run) return [];
        this.state.session = session;
        const events = this.state.run.input(event, session, playing, times);
        this.publish();
        return events;
      },
      cancel: (atMs, resetAll) => {
        if (!current() || this.expectedStop || this.menuPause || this.state.savedResult) return;
        if (resetAll || this.state.run?.snapshot().started) {
          this.state.run?.cancel(atMs);
          this.state.status = "error";
          this.state.error = { key: "Ответ прерван. Начните новую попытку." };
          this.publish();
        }
      },
      guidance: (session) => {
        const lights =
          current() && this.state.hint && this.state.activity?.purpose === "training"
            ? session.nextDue().map((note) => note.pitch)
            : [];
        return {
          lights,
          frame: { hintNotes: [], due: [], waitingFor: [], hints: false, neutralKeys: true }
        };
      }
    };
  };
  private saveLesson(): void {
    saveMusicControllerLesson(this.state, this.callbacks);
  }
  private complete(): void {
    completeMusicController(
      this.state,
      this.saved,
      this.callbacks,
      () => {
        this.stop();
      },
      () => {
        this.publish();
      }
    );
  }
  private async prepareNext(advance: boolean, phase?: IntegratedPhaseId): Promise<void> {
    if (!this.state.activity && !this.state.lesson) {
      void this.prepare();
      return;
    }
    const operation = ++this.operation;
    try {
      const latest = this.callbacks.readSelection?.() ?? this.saved;
      const replacement = await prepareMusicControllerReplacement(
        latest,
        this.state.lesson,
        this.state.plan,
        advance,
        this.callbacks,
        () => this.active && operation === this.operation,
        phase
      );
      if (!replacement || !this.active || operation !== this.operation) return;
      this.stop();
      this.audio.cancel();
      this.state.run?.cancel(performance.now());
      this.generation++;
      this.saved = replacement.saved;
      this.state.lesson = replacement.lesson;
      this.state.newMaterial = replacement.newMaterial;
      this.installRun(replacement.activity);
      if (phase)
        this.state.previousRecommendations = [...this.state.previousRecommendations, phase].slice(
          -12
        );
      if (replacement.lesson) this.saveLesson();
      else this.callbacks.rememberSeed(replacement.activity.exercise.seed);
      this.publish();
    } catch {
      if (this.active && operation === this.operation) {
        this.state.feedback = "Новый материал пока недоступен. Текущее задание сохранено.";
        this.publish();
      }
    }
  }
  private actions(): MusicControllerActionsHost {
    return {
      state: this.state,
      selection: { ...this.selection, saved: this.saved },
      callbacks: this.callbacks,
      audio: this.audio,
      active: () => this.active,
      snapshot: () => this.snapshot,
      generation: () => this.generation,
      valid: (generation, id) => this.valid(generation, id),
      connection: () => this.connection,
      offset: () => this.offset(),
      publish: () => {
        this.publish();
      },
      stop: () => {
        this.stop();
      },
      prepare: () => {
        void this.prepare();
      },
      complete: () => {
        this.complete();
      },
      cancel: () => {
        this.cancel();
      },
      saveLesson: () => {
        this.saveLesson();
      },
      install: (activity) => {
        this.installRun(activity);
      },
      retry: () => {
        void this.prepareNext(false);
      },
      next: () => {
        void this.prepareNext(true);
      },
      repeat: (phase) => {
        void this.prepareNext(false, phase);
      }
    };
  }
  readonly command = (command: MusicCourseCommand): void => {
    musicControllerCommand(this.actions(), command);
  };
  readonly choose = (value: string, source: "keyboard" | "pointer"): void => {
    musicControllerChoose(this.actions(), value, source);
  };
  readonly cancel = (): void => {
    this.operation++;
    this.generation++;
    this.audio.cancel();
    this.state.preview?.cancel();
    this.state.run?.cancel(performance.now());
    this.stop();
    if (!this.state.savedResult) {
      this.state.status = "error";
      this.state.error = { key: "Ответ прерван. Начните новую попытку." };
    }
    this.publish();
  };
}
