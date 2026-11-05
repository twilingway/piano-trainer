import { emptySongCourseView, NO_SONG_COURSE_CONNECTION } from "./songCourseContracts";
import { SongCourseCharacters, songCourseCharacterContext } from "./songCourseCharacters";
import { createSongCourseCharacterPolicy } from "./songCourseCharacterPolicy";
import { createSongCourseFeedback } from "../staff/songCourseFeedback";
import * as startup from "./songCourseStartup";
import { courseMelodyProgress, songCourseSceneId, songCourseGuidance } from "./songCourseGuidance";
import { SongCourseInput } from "./songCourseInput";
import type { PracticeEvent, PracticeOptions, PracticeSession } from "../practice/session";
import type { SongCourseScene } from "./songCourseContracts";
import { SongCourseAttempt } from "../songCourse/attempt";
import { findSongCourseNode, findSongCourseSource } from "../songCourse/catalog";
import { buildSongCourseMaterial } from "../songCourse/material";
import { SongCourseReviewFlow } from "./songCourseReviewFlow";
import { emptySongCourseProgress, mergeSongCourseProgress } from "../songCourse/progress";
import type { CourseMaterial, SongCourseProgress } from "../songCourse/model";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type { InputCancellationReason } from "../practice/inputCancellation";
import { songCourseOptions } from "./songCourseOptions";
import { songCourseRepository } from "./songCourseRepository";
import type {
  SongCourseCallbacks,
  SongCourseConnection,
  SongCourseView
} from "./songCourseContracts";

const NO_EVENTS: readonly PracticeEvent[] = [];
type Repository = typeof songCourseRepository;
export type SongCourseSnapshot = SongCourseView & {
  readonly progressState: SongCourseProgress;
  readonly loaded: boolean;
  readonly storageError: boolean;
};

/** Thin transport adapter. Evidence and every musical decision belong to the pure attempt. */
export class SongCourseController {
  private listeners = new Set<() => void>();
  private connection = NO_SONG_COURSE_CONNECTION;
  private progressState = emptySongCourseProgress();
  private loaded = false;
  private storageError = false;
  private state: SongCourseView = emptySongCourseView();
  private snapshot: SongCourseSnapshot = {
    ...this.state,
    progressState: this.progressState,
    loaded: false,
    storageError: false
  };
  private attempt: SongCourseAttempt | null = null;
  private readonly input: SongCourseInput;
  private speed = 1;
  private readonly reviews = new SongCourseReviewFlow();
  private optionCache: PracticeOptions | undefined;
  private sceneCache: SongCourseScene | null = null;
  private generation = 0;
  private selectionEpoch = 0;
  private restoreEpoch = 0;
  private restored = false;
  private internalLoad = false;
  private choosing = false;
  private disposed = false;
  private presentationSettled = false;
  private resolvePresentation: ((ready: boolean) => void) | null = null;
  private presentationReady: Promise<boolean> = Promise.resolve(false);
  readonly policy: TrainerMusicPolicy;
  readonly faceFeedback = createSongCourseFeedback();
  readonly characters = new SongCourseCharacters(
    () => songCourseCharacterContext(this.state, this.sceneId, this.attempt?.config.runId ?? null),
    this.faceFeedback
  );

  constructor(
    private readonly callbacks: SongCourseCallbacks,
    private readonly repository: Repository = songCourseRepository
  ) {
    this.input = new SongCourseInput(
      () => ({
        attempt: this.attempt,
        material: this.state.material,
        trainer: this.connection.trainer,
        demo: this.state.phase === "demo"
      }),
      () => {
        this.syncPhase();
      },
      () => {
        this.state = { ...this.state, phase: "ready", error: "Сначала отпустите все клавиши." };
        this.publish();
      },
      (notes, ordinal) => {
        if (this.attempt && this.state.material)
          this.faceFeedback.update(
            {
              runId: this.attempt.config.runId,
              presentationId: this.sceneId,
              sourceHash: this.state.material.source.sourceHash
            },
            notes,
            ordinal
          );
      }
    );
    this.policy = createSongCourseCharacterPolicy(
      this.input,
      this.onFrame.bind(this),
      this.onCancel.bind(this),
      (session, playing) => songCourseGuidance(this.state.material, this.helped, session, playing),
      this.characters
    );
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.snapshot;
  get isChoosing() {
    return this.choosing;
  }
  get active() {
    return this.state.material !== null;
  }
  get helped() {
    return (
      this.state.material?.node.kind !== "independent-phrase" &&
      this.state.material?.node.kind !== "performance"
    );
  }
  get options() {
    return this.optionCache;
  }
  get scene() {
    return this.sceneCache;
  }
  get sceneId() {
    return songCourseSceneId(this.state);
  }
  get hasNext() {
    return (
      this.reviews.hasPending ||
      (this.reviews.returnTo ?? startup.nextCourseSelection(this.state.material)) !== null
    );
  }
  get canReview() {
    return this.reviews.canReview(this.state.material, this.state.result);
  }

  async loadProgress(): Promise<void> {
    this.disposed = false;
    this.restoreEpoch = this.selectionEpoch;
    try {
      this.progressState = await startup.loadCourseProgress(
        this.repository,
        () => this.progressState,
        () => this.selectionEpoch,
        this.restoreEpoch
      );
    } catch {
      this.storageError = true;
    }
    this.loaded = true;
    this.publish();
  }
  restoreInitial(legacyActive: boolean): void {
    if (!this.loaded || this.restored || this.disposed) return;
    this.restored = true;
    if (this.selectionEpoch !== this.restoreEpoch) return;
    const selected = startup.initialCourseSelection(this.progressState, legacyActive);
    if (selected) this.choose(selected.songId, selected.nodeId, false);
  }
  choose(songId: string, nodeId: string, explicit = true): boolean {
    this.reviews.clear();
    const source = findSongCourseSource(songId);
    const node = findSongCourseNode(songId, nodeId);
    if (!source || !node) return this.materialError();
    let material: CourseMaterial;
    try {
      material = buildSongCourseMaterial(source, node);
    } catch {
      return this.materialError();
    }
    this.choosing = true;
    try {
      if (explicit) this.selectionEpoch++;
      this.callbacks.onSelection({
        songId,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId
      });
      this.progressState = {
        ...this.progressState,
        selection: {
          songId,
          sourceRevision: source.revision,
          sourceHash: source.sourceHash,
          nodeId
        }
      };
      this.selectMaterial(material);
      void this.persist(true);
    } finally {
      this.choosing = false;
    }
    return true;
  }
  externalSelection(legacy: boolean): void {
    this.selectionEpoch++;
    if (this.choosing) return;
    this.leave();
    if (legacy && this.progressState.selection) {
      this.progressState = { ...this.progressState, selection: null };
      void this.persist(true);
    }
  }
  exit = () => {
    this.selectionEpoch++;
    this.leave();
  };
  retry = () => {
    if (this.state.material) this.selectMaterial(this.state.material);
  };
  retrySave = () => {
    void this.persist(false);
  };
  next = () => {
    const review = this.reviews.takeNext();
    if (review) {
      this.selectMaterial(review);
      return;
    }
    const value = this.reviews.returnTo ?? startup.nextCourseSelection(this.state.material);
    if (value) this.choose(value.songId, value.nodeId);
  };
  review = () => {
    const material = this.state.material,
      result = this.state.result;
    if (!material || !result) return;
    const review = this.reviews.start(material, result, this.progressState.selection);
    if (review) this.selectMaterial(review);
  };
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 1) return;
    if (this.attempt && this.attempt.phase !== "complete") this.attempt.invalidate("speed-change");
    this.speed = speed;
    if (this.state.phase === "ready" || this.state.phase === "result") this.retry();
  }
  refreshConnection(connection: SongCourseConnection): void {
    this.connection = connection;
    if (connection.blocked && ["playing", "demo"].includes(this.state.phase)) this.pause();
  }
  present(id: string): void {
    if (id !== this.sceneId || this.presentationSettled) return;
    this.presentationSettled = true;
    this.resolvePresentation?.(true);
    this.resolvePresentation = null;
  }
  staffError(id: string): void {
    if (id === this.sceneId) {
      this.presentationReady = Promise.resolve(false);
      this.resolvePresentation?.(false);
      this.fail("Не удалось открыть учебную мелодию. Выберите этап ещё раз.");
    }
  }
  start = async () => {
    if (this.state.phase === "paused") {
      this.connection.trainer?.setPlaying(true);
      return;
    }
    await this.begin(false);
  };
  demo = async () => {
    await this.begin(true);
  };
  pause = () => {
    if (this.state.phase === "demo") this.retry();
    else this.connection.trainer?.setPlaying(false);
  };
  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.attempt?.abort("dispose");
    this.resolvePresentation?.(false);
    this.faceFeedback.clear();
    this.listeners.clear();
    this.characters.dispose();
  }

  private async begin(demo: boolean): Promise<void> {
    const material = this.state.material,
      connection = this.connection;
    if (!material || !connection.trainer || connection.blocked) return;
    const generation = ++this.generation;
    const sound = connection.prepare();
    const [ready, presented] = await Promise.all([sound, this.presentationReady]);
    if (
      this.disposed ||
      generation !== this.generation ||
      connection.trainer !== this.connection.trainer ||
      this.connection.blocked
    )
      return;
    if (!ready || !presented) {
      this.fail(
        ready
          ? "Не удалось открыть учебную мелодию. Выберите этап ещё раз."
          : "Звук пока недоступен. Нажмите «Играть» ещё раз."
      );
      return;
    }
    this.attempt = demo
      ? null
      : new SongCourseAttempt({
          runId: crypto.randomUUID(),
          songId: material.source.id,
          sourceRevision: material.source.revision,
          sourceHash: material.source.sourceHash,
          nodeId: material.node.id,
          mode: material.node.kind === "performance" ? "tempo" : "wait",
          speed: this.speed,
          expected: material.expected,
          learnerPartIds: material.source.learnerPartIds,
          ...(material.node.kind === "review" ? { rubricVariant: "learning-review" as const } : {})
        });
    this.faceFeedback.reset(material, this.sceneId, this.attempt?.config.runId ?? null);
    this.input.reset();
    this.state = {
      ...this.state,
      phase: demo ? "demo" : "playing",
      progress: 0,
      result: null,
      error: null
    };
    this.internalLoad = true;
    const options = songCourseOptions(material, this.speed);
    connection.trainer.load(
      material.song,
      demo ? { ...options, mode: "tempo", hands: new Set(), countInBeats: 0 } : options,
      this.sceneId
    );
    this.internalLoad = false;
    connection.trainer.setPlaying(true);
    this.publish();
  }
  private onFrame(
    session: PracticeSession,
    playing: boolean,
    atMs: number
  ): readonly PracticeEvent[] {
    const material = this.state.material;
    if (!material) return NO_EVENTS;
    if (this.state.phase === "demo" && session.finished) {
      this.attempt = null;
      this.state = { ...this.state, phase: "ready", progress: 0, waiting: false };
      this.restoreLearnerSession();
      this.publish();
      return NO_EVENTS;
    }
    const attempt = this.attempt;
    if (!attempt || attempt.phase === "aborted" || attempt.phase === "complete") return NO_EVENTS;
    this.input.present(session, atMs);
    if (session.finished) attempt.finish(atMs);
    const result = attempt.tick(atMs, Date.now());
    if (result) {
      this.state = { ...this.state, phase: "result", progress: 1, waiting: false, result };
      this.progressState = mergeSongCourseProgress(this.progressState, {
        ...this.progressState,
        results: [result]
      });
      this.connection.trainer?.setPlaying(false);
      this.callbacks.onResult(result);
      void this.persist(false);
      this.publish();
      return NO_EVENTS;
    }
    const progress = courseMelodyProgress(material, session.time);
    const phase = attempt.phase;
    if (
      Math.floor(progress * 100) !== Math.floor(this.state.progress * 100) ||
      phase !== this.state.phase ||
      this.state.waiting !== (playing && session.waiting)
    ) {
      this.state = { ...this.state, phase, progress, waiting: playing && session.waiting };
      this.publish();
    }
    return NO_EVENTS;
  }
  private onCancel(
    atMs: number,
    resetAll = false,
    reason: InputCancellationReason = "cleanup"
  ): void {
    if (this.internalLoad || !this.attempt || ["complete", "aborted"].includes(this.attempt.phase))
      return;
    if (reason === "pause") this.attempt.pause(atMs, this.input.nextOrdinal());
    else {
      this.attempt.abort(reason);
      this.state = {
        ...this.state,
        phase: "error",
        error: "Попытка остановлена. Начните этот этап ещё раз."
      };
    }
    if (reason !== "pause") this.faceFeedback.clear();
    if (resetAll) this.input.clear();
    this.syncPhase();
  }
  private selectMaterial(material: CourseMaterial): void {
    this.generation++;
    this.attempt?.abort("selection");
    this.attempt = null;
    this.internalLoad = true;
    this.connection.trainer?.setPlaying(false);
    this.internalLoad = false;
    this.resolvePresentation?.(false);
    this.presentationSettled = false;
    this.presentationReady = new Promise<boolean>((resolve) => {
      this.resolvePresentation = resolve;
    });
    this.state = {
      material,
      phase: "ready",
      progress: 0,
      waiting: false,
      result: null,
      error: null,
      revision: this.state.revision + 1
    };
    this.faceFeedback.reset(material, this.sceneId, null);
    this.optionCache = songCourseOptions(material, this.speed);
    this.sceneCache = { id: this.sceneId, song: material.song, musicXml: material.musicXml };
    this.publish();
  }
  private restoreLearnerSession(): void {
    const material = this.state.material;
    if (!material || !this.connection.trainer) return;
    this.internalLoad = true;
    this.connection.trainer.setPlaying(false);
    this.connection.trainer.load(
      material.song,
      songCourseOptions(material, this.speed),
      this.sceneId
    );
    this.internalLoad = false;
  }
  private leave(): void {
    this.reviews.clear();
    this.generation++;
    this.attempt?.abort("exit");
    this.attempt = null;
    this.internalLoad = true;
    this.connection.trainer?.setPlaying(false);
    this.internalLoad = false;
    this.resolvePresentation?.(false);
    this.state = {
      ...this.state,
      material: null,
      phase: "ready",
      result: null,
      progress: 0,
      waiting: false
    };
    this.faceFeedback.clear();
    this.optionCache = undefined;
    this.sceneCache = null;
    this.publish();
  }
  private syncPhase(): void {
    const phase = this.attempt?.phase;
    if (phase && phase !== "complete" && phase !== "aborted") this.state = { ...this.state, phase };
    this.publish();
  }
  private materialError(): false {
    this.fail("Не удалось открыть учебную мелодию. Выберите этап ещё раз.");
    return false;
  }
  private fail(error: string): void {
    this.generation++;
    this.attempt?.abort("material-error");
    this.attempt = null;
    this.connection.trainer?.setPlaying(false);
    this.faceFeedback.clear();
    this.state = { ...this.state, phase: "error", error, waiting: false };
    this.publish();
  }
  private async persist(selectionChanged: boolean): Promise<void> {
    try {
      await this.repository.save(this.progressState, selectionChanged);
      if (!this.disposed) this.storageError = false;
    } catch {
      if (!this.disposed) this.storageError = true;
    }
    if (!this.disposed) this.publish();
  }
  private publish(): void {
    if (this.disposed) return;
    this.snapshot = {
      ...this.state,
      progressState: this.progressState,
      loaded: this.loaded,
      storageError: this.storageError
    };
    this.characters.syncContext();
    for (const listener of this.listeners) listener();
  }
}
