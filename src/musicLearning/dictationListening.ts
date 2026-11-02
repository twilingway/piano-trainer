import type { MusicPurpose } from "./types";

export interface DictationListeningReceipt {
  readonly playbackId: string;
  readonly requestedAtMs: number;
  readonly startedAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly outcome: "pending" | "playing" | "full" | "partial" | "failed-before-start";
}
export interface DictationListeningState {
  readonly attemptId: string;
  readonly presentationId: string;
  readonly purpose: MusicPurpose;
  readonly receipts: readonly DictationListeningReceipt[];
}
export interface DictationListeningEvent {
  readonly presentationId: string;
  readonly playbackId: string;
  readonly atMs: number;
  readonly kind: "request" | "first-sound" | "complete" | "interrupt";
}
export interface DictationListeningSummary {
  readonly started: number;
  readonly full: number;
  readonly partial: number;
  readonly canListen: boolean;
  readonly canReply: boolean;
  readonly retryRequired: boolean;
}

export function createDictationListening(
  attemptId: string,
  presentationId: string,
  purpose: MusicPurpose
): DictationListeningState {
  if (!attemptId || !presentationId || !["training", "control"].includes(purpose))
    throw new RangeError("Invalid dictation listening identity");
  return { attemptId, presentationId, purpose, receipts: [] };
}

export function summarizeDictationListening(
  state: DictationListeningState
): DictationListeningSummary {
  const started = state.receipts.filter((receipt) => receipt.startedAtMs !== null).length;
  const full = state.receipts.filter((receipt) => receipt.outcome === "full").length;
  const partial = state.receipts.filter((receipt) => receipt.outcome === "partial").length;
  const active = state.receipts.some(
    (receipt) => receipt.outcome === "pending" || receipt.outcome === "playing"
  );
  const quotaAvailable = state.purpose === "training" || started < 2;
  return {
    started,
    full,
    partial,
    canListen: !active && quotaAvailable,
    canReply: full > 0 && !active,
    retryRequired: !active && !quotaAvailable && full === 0
  };
}

/** Requests reserve one playback; only the actual first sound spends control quota. */
export function reduceDictationListening(
  state: DictationListeningState,
  event: DictationListeningEvent
): DictationListeningState {
  if (
    event.presentationId !== state.presentationId ||
    !event.playbackId ||
    !Number.isFinite(event.atMs) ||
    event.atMs < 0
  )
    return state;
  const index = state.receipts.findIndex((receipt) => receipt.playbackId === event.playbackId);
  if (event.kind === "request") {
    if (index >= 0 || !summarizeDictationListening(state).canListen) return state;
    return {
      ...state,
      receipts: [
        ...state.receipts,
        {
          playbackId: event.playbackId,
          requestedAtMs: event.atMs,
          startedAtMs: null,
          endedAtMs: null,
          outcome: "pending"
        }
      ]
    };
  }
  const receipt = state.receipts[index];
  if (!receipt || event.atMs < (receipt.startedAtMs ?? receipt.requestedAtMs)) return state;
  let next: DictationListeningReceipt;
  if (event.kind === "first-sound" && receipt.outcome === "pending")
    next = { ...receipt, startedAtMs: event.atMs, outcome: "playing" };
  else if (event.kind === "complete" && receipt.outcome === "playing")
    next = { ...receipt, endedAtMs: event.atMs, outcome: "full" };
  else if (event.kind === "interrupt" && ["pending", "playing"].includes(receipt.outcome))
    next = {
      ...receipt,
      endedAtMs: event.atMs,
      outcome: receipt.startedAtMs === null ? "failed-before-start" : "partial"
    };
  else return state;
  return {
    ...state,
    receipts: state.receipts.map((value, position) => (position === index ? next : value))
  };
}

/** Retry is explicit and must get a new attempt and presentation identity. */
export function restartDictationListening(
  previous: DictationListeningState,
  attemptId: string,
  presentationId: string
): DictationListeningState {
  if (attemptId === previous.attemptId || presentationId === previous.presentationId)
    throw new RangeError("A dictation retry requires new attempt and presentation IDs");
  return createDictationListening(attemptId, presentationId, previous.purpose);
}
