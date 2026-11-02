import { compareDictation } from "./dictation";
import type { DictationComparison, DictationExercise, DictationReplyNote } from "./dictation";
import {
  createDictationListening,
  reduceDictationListening,
  summarizeDictationListening
} from "./dictationListening";
import type { DictationListeningEvent, DictationListeningState } from "./dictationListening";
import type { MusicHelpEvent, MusicPurpose } from "./types";

export interface DictationInputOrigin {
  readonly source: "midi" | "keyboard" | "pointer";
  readonly deviceId?: string;
  readonly channel?: number;
  readonly ownerId?: string;
}
export interface DictationInput extends DictationInputOrigin {
  readonly kind: "down" | "up";
  readonly presentationId: string;
  readonly pitch: number;
  /** Already latency-corrected by the existing timing policy in the calling shell. */
  readonly correctedAtMs: number;
  /** PracticeSession song position converted to quarter-note beats at the fixed exercise BPM. */
  readonly songBeat: number;
}
export interface DictationCapturedNote extends DictationReplyNote {
  readonly origin: DictationInputOrigin;
  readonly downAtMs: number;
  readonly upAtMs: number | null;
}
export interface DictationSessionOptions {
  readonly exercise: DictationExercise;
  readonly attemptId: string;
  readonly presentationId: string;
  readonly purpose: MusicPurpose;
  readonly input: DictationInputOrigin;
}
export interface DictationResult {
  readonly attemptId: string;
  readonly presentationId: string;
  readonly exerciseId: string;
  readonly purpose: MusicPurpose;
  readonly notes: readonly DictationCapturedNote[];
  readonly listening: DictationListeningState;
  readonly help: readonly MusicHelpEvent[];
  readonly comparison: DictationComparison;
}
export interface DictationSessionSnapshot {
  readonly status: "preparation" | "reply" | "finished" | "cancelled";
  readonly ready: boolean;
  readonly paused: boolean;
  readonly heldCount: number;
  readonly notes: readonly DictationCapturedNote[];
  readonly listening: DictationListeningState;
  readonly result: DictationResult | null;
}

function owner(input: DictationInputOrigin & { readonly pitch: number }): string {
  return JSON.stringify([
    input.source,
    input.deviceId ?? "",
    input.channel ?? null,
    input.ownerId ?? "",
    input.pitch
  ]);
}

function validInput(input: DictationInput): boolean {
  return (
    ["midi", "keyboard", "pointer"].includes(input.source) &&
    ["down", "up"].includes(input.kind) &&
    Number.isInteger(input.pitch) &&
    input.pitch >= 0 &&
    input.pitch <= 127 &&
    Number.isFinite(input.correctedAtMs) &&
    input.correctedAtMs >= 0 &&
    Number.isFinite(input.songBeat) &&
    input.songBeat >= 0 &&
    (input.channel === undefined ||
      (Number.isInteger(input.channel) && input.channel >= 1 && input.channel <= 16))
  );
}

/** Stateful pure controller: its only time is the caller's supplied PracticeSession position. */
export class DictationSession {
  private readonly options: DictationSessionOptions;
  private status: DictationSessionSnapshot["status"] = "preparation";
  private ready = false;
  private paused = false;
  private inputBoundaryAtMs = 0;
  private listening: DictationListeningState;
  private notes: DictationCapturedNote[] = [];
  private readonly held = new Map<string, { input: DictationInput; noteIndex: number | null }>();
  private readonly latest = new Map<string, number>();
  private help: MusicHelpEvent[] = [];
  private result: DictationResult | null = null;

  constructor(options: DictationSessionOptions) {
    this.options = options;
    this.listening = createDictationListening(
      options.attemptId,
      options.presentationId,
      options.purpose
    );
  }

  get noteCount(): number {
    return this.notes.length;
  }
  /** Listening reducers replace this readonly value; frame callers need no cloned session snapshot. */
  listeningState(): DictationListeningState {
    return this.listening;
  }
  snapshot(): DictationSessionSnapshot {
    return {
      status: this.status,
      ready: this.ready,
      paused: this.paused,
      heldCount: this.held.size,
      notes: this.notes.map((note) => ({ ...note, origin: { ...note.origin } })),
      listening: {
        ...this.listening,
        receipts: this.listening.receipts.map((receipt) => ({ ...receipt }))
      },
      result: this.result
    };
  }

  setReady(ready: boolean, correctedAtMs = 0): void {
    if (!Number.isFinite(correctedAtMs) || correctedAtMs < 0) return;
    this.ready = ready;
    this.inputBoundaryAtMs = Math.max(this.inputBoundaryAtMs, correctedAtMs);
  }
  setPaused(paused: boolean, correctedAtMs = 0): void {
    if (!Number.isFinite(correctedAtMs) || correctedAtMs < 0) return;
    this.paused = paused;
    this.inputBoundaryAtMs = Math.max(this.inputBoundaryAtMs, correctedAtMs);
  }

  /** Return whether a receipt was accepted, so the shell starts audio only on accepted requests. */
  receiveListening(event: DictationListeningEvent): boolean {
    if (
      this.status === "finished" ||
      this.status === "cancelled" ||
      (event.kind === "request" && this.status === "reply" && this.held.size > 0)
    )
      return false;
    const next = reduceDictationListening(this.listening, event);
    if (next === this.listening) return false;
    this.listening = next;
    return true;
  }

  openReply(correctedAtMs = 0): boolean {
    if (
      this.status !== "preparation" ||
      !Number.isFinite(correctedAtMs) ||
      correctedAtMs < 0 ||
      !this.ready ||
      this.paused ||
      this.held.size ||
      !summarizeDictationListening(this.listening).canReply
    )
      return false;
    this.inputBoundaryAtMs = Math.max(this.inputBoundaryAtMs, correctedAtMs);
    this.status = "reply";
    return true;
  }

  /** Call for physical events even during preparation/pause, so held keys never become new attacks. */
  receiveInput(event: DictationInput): boolean {
    if (
      this.status === "finished" ||
      this.status === "cancelled" ||
      event.presentationId !== this.options.presentationId ||
      !validInput(event)
    )
      return false;
    const selection = this.options.input;
    if (
      event.source !== selection.source ||
      (selection.deviceId !== undefined && event.deviceId !== selection.deviceId) ||
      (selection.channel !== undefined && event.channel !== selection.channel) ||
      (selection.ownerId !== undefined && event.ownerId !== selection.ownerId)
    )
      return false;
    const key = owner(event);
    const latest = this.latest.get(key);
    if (latest !== undefined && event.correctedAtMs < latest) return false;
    const held = this.held.get(key);
    if (event.kind === "up") {
      this.latest.set(key, event.correctedAtMs);
      if (!held || event.songBeat < held.input.songBeat) return false;
      this.held.delete(key);
      if (held.noteIndex === null) return false;
      const note = this.notes[held.noteIndex];
      if (!note) return false;
      this.notes[held.noteIndex] = {
        ...note,
        durationBeats: event.songBeat - note.startBeat,
        upAtMs: event.correctedAtMs
      };
      return true;
    }
    if (held) return false;
    this.latest.set(key, event.correctedAtMs);
    const lastNote = this.notes.at(-1);
    const accepted =
      this.status === "reply" &&
      event.correctedAtMs >= this.inputBoundaryAtMs &&
      summarizeDictationListening(this.listening).canReply &&
      this.ready &&
      !this.paused &&
      (!lastNote ||
        (event.songBeat >= lastNote.startBeat && event.correctedAtMs >= lastNote.downAtMs));
    this.held.set(key, { input: { ...event }, noteIndex: accepted ? this.notes.length : null });
    if (!accepted) return false;
    const { source, deviceId, channel, ownerId } = event;
    const origin: DictationInputOrigin = {
      source,
      ...(deviceId === undefined ? {} : { deviceId }),
      ...(channel === undefined ? {} : { channel }),
      ...(ownerId === undefined ? {} : { ownerId })
    };
    this.notes.push({
      pitch: event.pitch,
      startBeat: event.songBeat,
      durationBeats: 0,
      downAtMs: event.correctedAtMs,
      upAtMs: null,
      origin
    });
    return true;
  }

  /** Training analysis is evidence of help; a control answer cannot expose this assistance. */
  addHelp(event: MusicHelpEvent): boolean {
    if (
      this.options.purpose !== "training" ||
      this.status === "finished" ||
      this.status === "cancelled" ||
      !Number.isFinite(event.atMs) ||
      event.atMs < 0
    )
      return false;
    this.help.push({ ...event });
    return true;
  }

  finish(): DictationResult | null {
    if (
      this.status !== "reply" ||
      this.held.size ||
      !this.ready ||
      this.paused ||
      !summarizeDictationListening(this.listening).canReply
    )
      return null;
    this.status = "finished";
    this.result = {
      attemptId: this.options.attemptId,
      presentationId: this.options.presentationId,
      exerciseId: this.options.exercise.id,
      purpose: this.options.purpose,
      notes: this.notes.map((note) => ({ ...note, origin: { ...note.origin } })),
      listening: this.snapshot().listening,
      help: this.help.map((event) => ({ ...event })),
      comparison: compareDictation(this.options.exercise, this.notes)
    };
    return this.result;
  }

  /** The shell also stops owned voices. This core only closes evidence and invalidates callbacks. */
  cancel(atMs: number): void {
    if (
      this.status === "finished" ||
      this.status === "cancelled" ||
      !Number.isFinite(atMs) ||
      atMs < 0
    )
      return;
    for (const receipt of this.listening.receipts) {
      this.listening = reduceDictationListening(this.listening, {
        kind: "interrupt",
        presentationId: this.options.presentationId,
        playbackId: receipt.playbackId,
        atMs: Math.max(atMs, receipt.startedAtMs ?? receipt.requestedAtMs)
      });
    }
    this.status = "cancelled";
    this.held.clear();
  }
}
