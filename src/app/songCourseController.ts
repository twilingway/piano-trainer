import { emptySongCourseView, NO_SONG_COURSE_CONNECTION } from "./songCourseContracts";
import { SongCourseCharacters, songCourseCharacterContext } from "./songCourseCharacters";
import { createSongCourseCharacterPolicy } from "./songCourseCharacterPolicy";
import { createSongCourseFeedback } from "../staff/songCourseFeedback";
import * as startup from "./songCourseStartup";
import { SongCoursePlayback } from "./songCoursePlayback";
import * as guidance from "./songCourseGuidance";
import { SongCourseInput } from "./songCourseInput";
import type { PracticeOptions } from "../practice/session";
import type { SongCourseScene } from "./songCourseContracts";
import { findSongCourseNode, findSongCourseSource } from "../songCourse/catalog";
import { buildSongCourseMaterial } from "../songCourse/material";
import { SongCourseReviewFlow } from "./songCourseReviewFlow";
import { emptySongCourseProgress, mergeSongCourseProgress } from "../songCourse/progress";
import type { CourseMaterial, SongCourseProgress, SongCourseResult } from "../songCourse/model";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import { songCourseOptions } from "./songCourseOptions";
import { songCourseRepository } from "./songCourseRepository";
import type {
  SongCourseCallbacks,
  SongCourseConnection,
  SongCourseView
} from "./songCourseContracts";

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
  private readonly playback: SongCoursePlayback;
  private readonly input: SongCourseInput;
  private speed = 1;
  private readonly reviews = new SongCourseReviewFlow();
  private optionCache: PracticeOptions | undefined;
  private sceneCache: SongCourseScene | null = null;
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
    () =>
      songCourseCharacterContext(
        this.state,
        this.sceneId,
        this.playback.attempt?.config.runId ?? null,
        this.state.phase === "demo" ? this.playback.demoSong : undefined
      ),
    this.faceFeedback
  );

  constructor(
    private readonly callbacks: SongCourseCallbacks,
    private readonly repository: Repository = songCourseRepository
  ) {
    this.playback = new SongCoursePlayback({
      read: () => ({
        view: this.state,
        connection: this.connection,
        presentation: this.presentationReady,
        sceneId: this.sceneId,
        speed: this.speed,
        disposed: this.disposed
      }),
      input: () => this.input,
      feedback: this.faceFeedback,
      internal: (run) => {
        this.internalLoad = true;
        try {
          run();
        } finally {
          this.internalLoad = false;
        }
      },
      update: (patch) => {
        this.state = { ...this.state, ...patch };
        this.publish();
      },
      result: (result) => {
        this.acceptResult(result);
      },
      fail: (error) => {
        this.fail(error);
      }
    });
    this.input = new SongCourseInput(
      () => ({
        attempt: this.playback.attempt,
        material: this.state.material,
        trainer: this.connection.trainer,
        demo: this.playback.showing,
        onStarted: this.playback.attach,
        onAllReleased: this.playback.released,
        acceptsSession: this.playback.accepts
      }),
      () => {
        this.syncPhase();
      },
      this.playback.preheld,
      (notes, ordinal) => {
        if (this.playback.attempt && this.state.material)
          this.faceFeedback.update(
            {
              runId: this.playback.attempt.config.runId,
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
      this.playback.frame,
      (atMs, resetAll, reason) => {
        if (!this.internalLoad) this.playback.cancel(atMs, resetAll, reason);
      },
      (session, playing) =>
        guidance.songCourseGuidance(this.state.material, this.helped, session, playing),
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
    return startup.courseHelped(this.state.material);
  }
  get options() {
    return this.optionCache;
  }
  get scene() {
    return this.sceneCache;
  }
  get sceneId() {
    return guidance.songCourseSceneId(this.state);
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
    if (this.playback.attempt && this.playback.attempt.phase !== "complete")
      this.playback.attempt.invalidate("speed-change");
    this.speed = speed;
    if (this.state.phase === "ready" || this.state.phase === "result") this.retry();
  }
  refreshConnection(connection: SongCourseConnection): void {
    const replaced = connection.trainer !== this.connection.trainer;
    this.connection = connection;
    if ((connection.blocked || replaced) && (this.playback.busy || this.state.phase === "playing"))
      this.pause();
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
  soundInterrupted = (): void => {
    if (this.active && !this.disposed) this.playback.soundInterrupted();
  };
  start = async () => {
    await this.playback.start();
  };
  demo = async () => {
    await this.playback.preview();
  };
  pause = () => {
    this.playback.pause();
  };
  dispose(): void {
    this.disposed = true;
    this.playback.reset("dispose");
    this.resolvePresentation?.(false);
    this.faceFeedback.clear();
    this.listeners.clear();
    this.characters.dispose();
  }

  private acceptResult(result: SongCourseResult): void {
    this.progressState = mergeSongCourseProgress(this.progressState, {
      ...this.progressState,
      results: [result]
    });
    this.callbacks.onResult(result);
    void this.persist(false);
    this.publish();
  }
  private selectMaterial(material: CourseMaterial): void {
    this.playback.reset("selection");
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
  private leave(): void {
    this.reviews.clear();
    this.playback.reset("exit");
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
    const phase = this.playback.attempt?.phase;
    if (phase && phase !== "complete" && phase !== "aborted") this.state = { ...this.state, phase };
    this.publish();
  }
  private materialError(): false {
    this.fail("Не удалось открыть учебную мелодию. Выберите этап ещё раз.");
    return false;
  }
  private fail(error: string): void {
    this.playback.reset("material-error");
    this.connection.trainer?.setPlaying(false);
    this.faceFeedback.clear();
    this.state = { ...this.state, phase: "error", error, waiting: false, countdown: undefined };
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
