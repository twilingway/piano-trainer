import type { PracticeEvent, PracticeOptions, PracticeSession } from "../practice/session";
import type { InputCancellationReason } from "../practice/inputCancellation";
import type { SongCourseAttempt } from "../songCourse/attempt";
import type { SongCourseResult, CourseMaterial } from "../songCourse/model";
import { songCourseDemoSong } from "../songCourse/demoSong";
import {
  needsCourseDemonstration,
  courseDemoHandoff,
  type CourseDemoPurpose
} from "../songCourse/listenRepeat";
import type { createSongCourseFeedback } from "../staff/songCourseFeedback";
import type { SongCourseInput } from "./songCourseInput";
import type { SongCourseConnection, SongCourseView } from "./songCourseContracts";
import { newCourseAttempt } from "./songCourseStartup";
import { songCourseOptions } from "./songCourseOptions";
import { courseCountIn, courseMelodyProgress } from "./songCourseGuidance";

const NO_EVENTS: readonly PracticeEvent[] = [];
interface PlaybackOwner {
  readonly read: () => {
    readonly view: SongCourseView;
    readonly connection: SongCourseConnection;
    readonly presentation: Promise<boolean>;
    readonly sceneId: string;
    readonly speed: number;
    readonly disposed: boolean;
  };
  readonly input: () => SongCourseInput;
  readonly feedback: ReturnType<typeof createSongCourseFeedback>;
  readonly internal: (run: () => void) => void;
  readonly update: (patch: Partial<SongCourseView>) => void;
  readonly result: (result: SongCourseResult) => void;
  readonly fail: (error: string) => void;
}

/** Transport composition only. PracticeSession remains the sole source of musical time. */
export class SongCoursePlayback {
  attempt: SongCourseAttempt | null = null;
  demoSong: CourseMaterial["song"] | undefined;
  private generation = 0;
  private purpose: CourseDemoPurpose | null = null;
  private intendedGeneration: number | null = null;
  private pendingRelease: number | null = null;
  private boundSession: PracticeSession | null = null;
  private preparing: number | null = null;

  constructor(private readonly owner: PlaybackOwner) {}
  get showing(): boolean {
    return this.purpose !== null;
  }

  get busy(): boolean {
    return (
      (this.showing && this.owner.read().view.phase === "demo") ||
      this.preparing !== null ||
      this.pendingRelease !== null
    );
  }
  readonly attach = (session: PracticeSession): boolean => {
    const material = this.owner.read().view.material;
    if (session.song !== (this.demoSong ?? material?.song)) return false;
    this.boundSession = session;
    return true;
  };
  readonly start = async (): Promise<void> => {
    const { view, connection } = this.owner.read();
    if (view.phase === "paused") {
      if (this.showing) this.owner.update({ phase: "demo" });
      connection.trainer?.setPlaying(true);
    } else if (view.material && !["demo", "playing"].includes(view.phase)) {
      await this.begin(needsCourseDemonstration(view.material.node.kind) ? "repeat" : null);
    }
  };
  readonly preview = async (): Promise<void> => {
    await this.begin("preview");
  };
  readonly pause = (): void => {
    this.generation++;
    this.intendedGeneration = this.pendingRelease = this.preparing = null;
    if (!this.attempt && !this.showing)
      this.owner.update({ phase: "ready", waiting: false, countdown: undefined });
    this.owner.read().connection.trainer?.setPlaying(false);
  };
  reset(reason: string): void {
    this.generation++;
    this.intendedGeneration = this.pendingRelease = this.preparing = null;
    this.purpose = null;
    this.demoSong = undefined;
    this.boundSession = null;
    this.attempt?.abort(reason);
    this.attempt = null;
  }
  soundInterrupted(): void {
    const { view, disposed } = this.owner.read();
    const hasAttempt = this.attempt && !["complete", "aborted"].includes(this.attempt.phase);
    if (!view.material || disposed || (!this.busy && !this.showing && !hasAttempt)) return;
    this.reset("sound-interrupted");
    this.owner.fail("Звук пока недоступен. Нажмите «Играть» ещё раз.");
  }
  readonly preheld = (): void => {
    this.reset("preheld");
    this.owner.update({
      phase: "ready",
      waiting: false,
      countdown: undefined,
      error: "Сначала отпустите все клавиши."
    });
  };
  readonly released = (): void => {
    const generation = this.pendingRelease;
    if (generation === null || generation !== this.generation || this.owner.input().hasHeldKeys)
      return;
    this.pendingRelease = null;
    void this.begin(null, true);
  };

  private current(session: PracticeSession): boolean {
    const { view } = this.owner.read();
    return session === this.boundSession && session.song === (this.demoSong ?? view.material?.song);
  }
  readonly accepts = (session: PracticeSession): boolean => {
    if (!this.attempt && (this.pendingRelease !== null || this.preparing !== null))
      return session.song === this.owner.read().view.material?.song;
    return this.current(session);
  };
  private load(song: CourseMaterial["song"], options: PracticeOptions, playing: boolean): void {
    const { connection, sceneId } = this.owner.read();
    this.owner.internal(() => {
      connection.trainer?.setPlaying(false);
      connection.trainer?.load(song, options, sceneId);
    });
    if (playing) connection.trainer?.setPlaying(true);
  }
  private async begin(purpose: CourseDemoPurpose | null, automatic = false): Promise<void> {
    const initial = this.owner.read();
    const { material } = initial.view;
    const { connection } = initial;
    if (!material || !connection.trainer || connection.blocked || initial.disposed) return;
    const generation = ++this.generation;
    this.intendedGeneration = this.pendingRelease = this.preparing = null;
    this.boundSession = null;
    this.attempt?.abort("new-start");
    this.attempt = null;
    this.preparing = generation;
    let ready = false,
      presented = false;
    try {
      [ready, presented] = await Promise.all([connection.prepare(), initial.presentation]);
    } catch {
      /* The current owner receives a controlled preparation error below. */
    }
    if (this.preparing === generation) this.preparing = null;
    const current = this.owner.read();
    if (
      current.disposed ||
      generation !== this.generation ||
      current.view.material !== material ||
      current.sceneId !== initial.sceneId ||
      current.connection.trainer !== connection.trainer ||
      current.connection.blocked
    )
      return;
    if (!ready || !presented) {
      this.owner.fail(
        ready
          ? "Не удалось открыть учебную мелодию. Выберите этап ещё раз."
          : "Звук пока недоступен. Нажмите «Играть» ещё раз."
      );
      return;
    }
    if (purpose === null && automatic && this.owner.input().hasHeldKeys) {
      this.pendingRelease = generation;
      this.owner.update({ phase: "awaiting-keys-up", countdown: undefined, waiting: false });
      return;
    }
    this.purpose = purpose;
    this.intendedGeneration = purpose === "repeat" ? generation : null;
    this.demoSong = purpose ? songCourseDemoSong(material) : undefined;
    this.attempt = purpose ? null : newCourseAttempt(material, current.speed, crypto.randomUUID());
    this.owner.feedback.reset(material, initial.sceneId, this.attempt?.config.runId ?? null);
    this.owner.input().reset();
    const options = songCourseOptions(material, current.speed);
    this.owner.update({
      phase: purpose ? "demo" : "playing",
      progress: 0,
      waiting: false,
      countdown: purpose ? undefined : options.countInBeats,
      result: null,
      error: null
    });
    this.load(
      this.demoSong ?? material.song,
      purpose
        ? {
            ...options,
            mode: "tempo",
            hands: new Set(),
            countInBeats: 0,
            audibleCountIn: false
          }
        : options,
      true
    );
  }
  private finishDemo(material: CourseMaterial): void {
    const purpose = this.purpose;
    if (!purpose) return;
    const next = courseDemoHandoff(
      purpose,
      this.intendedGeneration,
      this.generation,
      this.owner.input().hasHeldKeys
    );
    this.purpose = null;
    this.intendedGeneration = null;
    this.boundSession = null;
    this.demoSong = undefined;
    this.owner.update({
      phase: next === "release" ? "awaiting-keys-up" : "ready",
      progress: 0,
      waiting: false,
      countdown: undefined
    });
    const { speed } = this.owner.read();
    this.load(material.song, songCourseOptions(material, speed), false);
    if (next === "release") this.pendingRelease = this.generation;
    else if (next === "learner") void this.begin(null, true);
  }
  readonly frame = (
    session: PracticeSession,
    playing: boolean,
    atMs: number
  ): readonly PracticeEvent[] => {
    const { view } = this.owner.read();
    const material = view.material;
    if (!material || !this.current(session)) return NO_EVENTS;
    if (this.showing) {
      if (view.phase !== "demo" || !playing) return NO_EVENTS;
      if (session.finished) this.finishDemo(material);
      else {
        const countdown = courseCountIn(material, session.time);
        if (view.progress !== 0 || countdown !== view.countdown)
          this.owner.update({ progress: 0, countdown });
      }
      return NO_EVENTS;
    }
    const attempt = this.attempt;
    if (!attempt || attempt.phase === "aborted" || attempt.phase === "complete") return NO_EVENTS;
    this.owner.input().present(session, atMs);
    if (session.finished) attempt.finish(atMs);
    const result = attempt.tick(atMs, Date.now());
    if (result) {
      this.owner.update({
        phase: "result",
        progress: 1,
        waiting: false,
        countdown: undefined,
        result
      });
      this.owner.read().connection.trainer?.setPlaying(false);
      this.owner.result(result);
      return NO_EVENTS;
    }
    const progress = courseMelodyProgress(material, session.time);
    const countdown = courseCountIn(material, session.time);
    if (
      Math.floor(progress * 100) !== Math.floor(view.progress * 100) ||
      attempt.phase !== view.phase ||
      countdown !== view.countdown ||
      view.waiting !== (playing && session.waiting)
    )
      this.owner.update({
        phase: attempt.phase,
        progress,
        countdown,
        waiting: playing && session.waiting
      });
    return NO_EVENTS;
  };
  readonly cancel = (
    atMs: number,
    resetAll = false,
    reason: InputCancellationReason = "cleanup"
  ): void => {
    this.generation++;
    this.intendedGeneration = this.pendingRelease = this.preparing = null;
    if (this.showing) {
      if (reason === "pause") this.owner.update({ phase: "paused" });
      else {
        this.reset(reason);
        this.owner.feedback.clear();
        this.owner.update({
          phase: "error",
          countdown: undefined,
          error: "Попытка остановлена. Начните этот этап ещё раз."
        });
      }
    } else if (this.attempt && !["complete", "aborted"].includes(this.attempt.phase)) {
      if (reason === "pause") {
        this.attempt.pause(atMs, this.owner.input().nextOrdinal());
        this.owner.update({ phase: "paused" });
      } else {
        this.attempt.abort(reason);
        this.owner.feedback.clear();
        this.owner.update({
          phase: "error",
          countdown: undefined,
          error: "Попытка остановлена. Начните этот этап ещё раз."
        });
      }
    } else if (this.owner.read().view.phase === "awaiting-keys-up") {
      this.owner.update({ phase: "ready", countdown: undefined, waiting: false });
    }
    if (resetAll) this.owner.input().clear();
  };
}
