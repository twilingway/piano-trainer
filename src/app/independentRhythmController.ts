import type { LessonStaffFeedbackSink } from "../staff/lessonStaffFeedback";
import { publishIndependentStaffFeedback } from "./independentStaffFeedback";
import {
  ensureMetronomeSound,
  metronomeSoundReady,
  pianoSoundReady,
  startPianoSound
} from "../audio/pianoSound";
import { generateIndependentRhythmExercise } from "../independentRhythm/generator";
import { createIndependentRhythmResult } from "../independentRhythm/result";
import { IndependentRhythmPhaseSession } from "../independentRhythm/session";
import type {
  IndependentRhythmConfig,
  IndependentRhythmPhaseResult,
  IndependentRhythmResult,
  IndependentRhythmSnapshot,
  IndependentRhythmSummary
} from "../independentRhythm/types";
import type { KeyEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import type { TrainerIndependentRhythmPolicy } from "../practice/independentRhythmPolicy";
import type { NoteStatus } from "../practice/session";
import type { ReadingInputSource } from "../reading/types";
import { recordHeldBassOwner } from "../reading/heldBassOwnership";
import type { HeldBassInput } from "../reading/heldBassTypes";
import type { TimingPreferences } from "./timingPreferences";
import { getTimingProfile } from "./timingPreferences";

export type IndependentRhythmPanelStatus =
  | "preparation"
  | "count-in"
  | "playing"
  | "finalizing"
  | "failed"
  | "passed"
  | "completed"
  | "empty"
  | "cancelled"
  | "error";
export interface IndependentRhythmConnection {
  trainer: Trainer | null;
  blocked: boolean;
  deviceId?: string | undefined;
  timing: TimingPreferences;
}
export interface IndependentRhythmSelection {
  active: boolean;
  seed: number;
  version: number;
  source: ReadingInputSource;
  revision: number;
}
function sceneFor(input: {
  phase: ReturnType<typeof generateIndependentRhythmExercise>["pulse"];
  id: string;
}) {
  return { ...input.phase, song: { ...input.phase.song }, id: input.id };
}
function inputFor(event: KeyEvent, now: number): HeldBassInput {
  return {
    kind: event.type,
    pitch: event.pitch,
    source: event.source ?? "pointer",
    atMs: event.timestamp ?? now,
    ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
    ...(event.channel === undefined ? {} : { channel: event.channel })
  };
}
function hidden(): boolean {
  return document.visibilityState === "hidden";
}
async function ensureCourseSound(): Promise<boolean> {
  try {
    const ready = await ensureMetronomeSound();
    await startPianoSound();
    return ready && metronomeSoundReady() && pianoSoundReady([48, 60]);
  } catch {
    return false;
  }
}
export class IndependentRhythmController {
  readonly exercise;
  private runId = crypto.randomUUID();
  private generation = 0;
  private phase: "pulse" | "two-hands" = "pulse";
  private phaseSession: IndependentRhythmPhaseSession | null = null;
  private phaseSnapshot: IndependentRhythmSnapshot | null = null;
  private noteStatuses = new Map<string, NoteStatus>();
  private settledSession: IndependentRhythmPhaseSession | null = null;
  private pulse: IndependentRhythmPhaseResult | null = null;
  private fixed: IndependentRhythmConfig | null = null;
  private startedAt = 0;
  private presentedAt: number | null = null;
  private audioPending = false;
  private expectedStop = false;
  private disposed = false;
  private showHints = false;
  private hintReceipts: { pitches: readonly number[]; at: number }[] = [];
  private held = new Map<string, HeldBassInput>();
  private releases = new Map<string, number>();
  private connection: IndependentRhythmConnection | null = null;
  private listeners = new Set<() => void>();
  private state;
  constructor(
    readonly selection: IndependentRhythmSelection,
    private readonly save: (result: IndependentRhythmResult) => void,
    private readonly feedback?: LessonStaffFeedbackSink
  ) {
    this.exercise = generateIndependentRhythmExercise(selection.seed, selection.version);
    this.state = this.freshState("preparation");
  }
  private freshState(status: IndependentRhythmPanelStatus) {
    const id = `${this.runId}:presentation:${String(this.generation)}`;
    return {
      scene: sceneFor({
        phase: this.phase === "pulse" ? this.exercise.pulse : this.exercise.series,
        id
      }),
      phase: this.phase,
      status,
      ready: false,
      allReleased: this.held.size === 0,
      midiAvailable: !!this.connection?.deviceId,
      midiChannel: this.pulse?.channel ?? null,
      countInBeat: undefined as number | undefined,
      error: null as "audio" | "staff" | "midi" | null,
      result: null as IndependentRhythmResult | null,
      pulseSummary: this.pulse?.summary ?? (null as IndependentRhythmSummary | null)
    };
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.state;
  private update(patch: Partial<typeof this.state>): void {
    const next = { ...this.state, ...patch };
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          JSON.stringify(value) === JSON.stringify(this.state[key as keyof typeof this.state])
      )
    )
      return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  private publish(): void {
    const snapshot = this.phaseSnapshot;
    const status = snapshot?.status;
    if (status === "cancelled" || status === "overflow") {
      this.cancel();
      return;
    }
    this.update({
      allReleased: this.held.size === 0,
      midiChannel: snapshot?.channel ?? this.pulse?.channel ?? null,
      countInBeat: snapshot?.countInBeat ?? undefined,
      ...(status === "count-in" || status === "playing" || status === "finalizing"
        ? { status }
        : {}),
      ...(this.phase === "pulse" && snapshot ? { pulseSummary: snapshot.summary } : {})
    });
  }
  private cachePhase(snapshot: IndependentRhythmSnapshot | null): void {
    publishIndependentStaffFeedback(
      this.feedback,
      this.runId,
      this.state.scene.id,
      this.phase === "pulse" ? this.exercise.pulse : this.exercise.series,
      this.phaseSnapshot,
      snapshot
    );
    this.phaseSnapshot = snapshot;
    this.noteStatuses = new Map(
      snapshot?.outcomes.map((note) => [
        note.noteId,
        note.outcome === "hit" ? "hit" : note.outcome === "miss" ? "missed" : "pending"
      ]) ?? []
    );
  }
  private live(id: string): boolean {
    return !this.disposed && this.state.scene.id === id;
  }
  private stop(): void {
    this.expectedStop = true;
    try {
      this.connection?.trainer?.setPlaying(false);
    } finally {
      this.expectedStop = false;
    }
  }
  readonly cancel = (): void => {
    if (this.disposed || this.expectedStop || this.state.status === "completed") return;
    this.feedback?.clear();
    this.generation++;
    this.audioPending = false;
    this.phaseSession?.cancel(performance.now());
    this.phaseSession = null;
    this.cachePhase(null);
    this.pulse = null;
    this.fixed = null;
    this.phase = "pulse";
    this.runId = crypto.randomUUID();
    this.presentedAt = null;
    this.hintReceipts = [];
    this.stop();
    this.state = this.freshState("cancelled");
    for (const listener of this.listeners) listener();
  };
  readonly repeat = (): void => {
    this.cancel();
    if (this.state.status === "completed") {
      this.feedback?.clear();
      this.generation++;
      this.runId = crypto.randomUUID();
      this.phase = "pulse";
      this.phaseSession = null;
      this.cachePhase(null);
      this.pulse = null;
      this.fixed = null;
      this.presentedAt = null;
      this.hintReceipts = [];
      this.state = this.freshState("preparation");
      for (const listener of this.listeners) listener();
    } else this.update({ status: "preparation", error: null });
  };
  readonly refreshConnection = (connection: IndependentRhythmConnection): void => {
    const prior = this.connection;
    this.connection = connection;
    if (
      prior &&
      (this.phaseSession !== null || this.pulse !== null || this.audioPending) &&
      (connection.blocked ||
        connection.trainer !== prior.trainer ||
        connection.deviceId !== prior.deviceId ||
        JSON.stringify(connection.timing) !== JSON.stringify(prior.timing))
    )
      this.cancel();
    this.update({ midiAvailable: !!connection.deviceId });
  };
  readonly configureHints = (enabled: boolean): void => {
    if (this.showHints !== enabled && this.phaseSnapshot?.active) this.cancel();
    this.showHints = enabled;
  };
  readonly present = (id: string, at: number): void => {
    if (!this.live(id) || document.visibilityState === "hidden" || this.presentedAt !== null)
      return;
    this.presentedAt = Math.max(at, performance.now());
    this.update({ ready: true, error: null });
  };
  readonly staffError = (id: string): void => {
    if (!this.live(id)) return;
    this.cancel();
    this.update({ status: "error", error: "staff" });
  };
  readonly retryStaff = (): void => {
    this.repeat();
  };
  private offsets(connection: IndependentRhythmConnection): number {
    const device = this.selection.source === "midi" ? (connection.deviceId ?? "") : "keyboard";
    const transport =
      this.selection.source === "midi" ? (connection.timing.transports[device] ?? "usb") : "local";
    return (
      (getTimingProfile(connection.timing, device, transport)?.inputOffsetMs ?? 0) +
      connection.timing.manualOffsetMs
    );
  }
  private connectionLive(connection: IndependentRhythmConnection): boolean {
    return this.connection === connection && !connection.blocked && !hidden();
  }
  readonly start = async (): Promise<void> => {
    const connection = this.connection;
    const scene = this.state.scene;
    if (
      !connection?.trainer ||
      connection.blocked ||
      document.visibilityState === "hidden" ||
      !this.state.ready ||
      !this.state.allReleased ||
      !["preparation", "passed"].includes(this.state.status) ||
      this.audioPending
    )
      return;
    if (this.selection.source === "midi" && !connection.deviceId) {
      this.update({ status: "error", error: "midi" });
      return;
    }
    const token = this.generation;
    this.audioPending = true;
    this.update({ error: null });
    const audio = await ensureCourseSound();
    if (!this.live(scene.id) || token !== this.generation || !this.connectionLive(connection))
      return;
    this.audioPending = false;
    if (!audio) {
      this.cancel();
      this.update({ status: "error", error: "audio" });
      return;
    }
    const config = this.fixed ?? {
      runId: this.runId,
      presentationId: scene.id,
      source: this.selection.source,
      offsetMs: this.offsets(connection),
      ...(this.selection.source === "midi" ? { deviceId: connection.deviceId ?? "" } : {})
    };
    this.fixed = config;
    this.phaseSession = new IndependentRhythmPhaseSession(
      this.phase === "pulse" ? this.exercise.pulse : this.exercise.series,
      {
        ...config,
        presentationId: scene.id,
        ...(this.phase === "two-hands" &&
        this.pulse?.channel !== null &&
        this.pulse?.channel !== undefined
          ? { channel: this.pulse.channel }
          : {})
      }
    );
    this.phaseSession.present(this.presentedAt ?? performance.now());
    for (const receipt of this.hintReceipts)
      this.phaseSession.showKeys(receipt.pitches, receipt.at);
    this.cachePhase(this.phaseSession.snapshot());
    if (this.phase === "pulse") this.startedAt = Date.now();
    connection.trainer.setPlaying(true);
  };
  private complete(): void {
    if (this.phaseSession === this.settledSession) return;
    const proof = this.phaseSession?.result();
    if (!proof) return;
    this.settledSession = this.phaseSession;
    this.stop();
    if (this.phase === "pulse") {
      this.pulse = proof;
      if (!proof.passed) {
        this.update({ status: "failed", pulseSummary: proof.summary });
        return;
      }
      this.phase = "two-hands";
      this.generation++;
      this.phaseSession = null;
      this.cachePhase(null);
      this.presentedAt = null;
      this.hintReceipts = [];
      this.state = this.freshState("passed");
      for (const listener of this.listeners) listener();
    } else if (
      this.pulse &&
      !proof.extras.length &&
      !proof.outcomes.some((note) => note.outcome === "hit")
    ) {
      // Not a single attack in the series: start over from the pulse without a result.
      this.cancel();
      this.update({ status: "empty" });
    } else if (this.pulse && !this.state.result) {
      const result = createIndependentRhythmResult(this.exercise, this.pulse, proof, {
        startedAt: this.startedAt,
        completedAt: Date.now()
      });
      if (!result) {
        this.cancel();
        return;
      }
      this.update({ status: "completed", result });
      this.save(result);
    }
  }
  policy(id: string): TrainerIndependentRhythmPolicy {
    return {
      inputCompensationMs: () =>
        this.fixed?.offsetMs ?? (this.connection ? this.offsets(this.connection) : 0),
      onStart: (at, receipt, held) => {
        if (!this.live(id) || !this.phaseSession || this.connection?.blocked) return false;
        this.held.clear();
        this.releases.clear();
        for (const event of held)
          recordHeldBassOwner(this.held, this.releases, inputFor(event, at), at);
        this.phaseSession.seedHeld(
          held.map((event) => inputFor(event, at)),
          at
        );
        const started = this.phaseSession.start(at);
        this.cachePhase(
          started ? this.phaseSession.tick(at, receipt) : this.phaseSession.snapshot()
        );
        this.publish();
        return started;
      },
      onFrame: (_practice, playing, now, receipt) => {
        if (!this.live(id) || !this.phaseSession) return;
        if (this.phaseSnapshot?.finished) {
          this.complete();
          return;
        }
        if (
          this.phaseSnapshot?.active &&
          (!playing ||
            this.connection?.blocked ||
            document.visibilityState === "hidden" ||
            !metronomeSoundReady() ||
            !pianoSoundReady([48, 60]))
        ) {
          this.cancel();
          return;
        }
        this.cachePhase(this.phaseSession.tick(now, receipt));
        this.publish();
        this.complete();
      },
      onInput: (event, _practice, _playing, raw, corrected, received, receipt) => {
        if (!this.live(id)) return;
        const input = inputFor(event, raw);
        if (received >= raw && received - raw <= 250)
          recordHeldBassOwner(this.held, this.releases, input, received);
        if (this.phaseSession)
          this.cachePhase(
            this.phaseSession.input({ ...input, offsetMs: raw - corrected }, received, receipt)
          );
        this.publish();
        this.complete();
      },
      cancel: (_at, resetAll) => {
        if (!this.live(id) || this.expectedStop || this.phaseSnapshot?.finished) return;
        if (resetAll) {
          this.held.clear();
          this.releases.clear();
        }
        this.cancel();
      },
      seedHeld: (events, at) => {
        if (!this.live(id)) return;
        this.held.clear();
        this.releases.clear();
        for (const event of events)
          recordHeldBassOwner(this.held, this.releases, inputFor(event, at), at);
        this.publish();
      },
      cuePitches: () =>
        this.live(id) &&
        this.showHints &&
        this.state.ready &&
        !this.phaseSnapshot?.active &&
        ["preparation", "passed"].includes(this.state.status)
          ? [48, 60]
          : [],
      onCuePresented: (pitches, at) => {
        if (
          !this.live(id) ||
          !this.state.ready ||
          this.phaseSnapshot?.active ||
          !pitches.includes(48) ||
          !pitches.includes(60) ||
          this.hintReceipts.length
        )
          return;
        this.hintReceipts.push({ pitches: [48, 60], at });
      },
      statusOf: (noteId) =>
        this.live(id) ? (this.noteStatuses.get(noteId) ?? "pending") : undefined,
      stats: () => {
        const summary = this.phaseSnapshot?.summary;
        return {
          hits: (summary?.left.hits ?? 0) + (summary?.right.hits ?? 0),
          misses: (summary?.left.misses ?? 0) + (summary?.right.misses ?? 0),
          wrong: summary?.extras ?? 0,
          meanOffset: 0,
          troubleSpots: []
        };
      }
    };
  }
  readonly dispose = (): void => {
    this.feedback?.clear();
    this.disposed = true;
    this.generation++;
    this.phaseSession?.cancel(performance.now());
    this.cachePhase(null);
    this.listeners.clear();
  };
  readonly activate = (): void => {
    this.disposed = false;
  };
}
