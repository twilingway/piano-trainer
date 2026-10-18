import type { Finger, Hand } from "../fingering/fingering";

export interface SourceEvidence {
  readonly by?: string;
  readonly frame?: number;
  readonly time?: number;
}
export interface SourceEvent {
  readonly id: string;
  readonly pitch: number;
  readonly hand: Hand;
  readonly onset: number;
  readonly estimatedContactEnd?: number | null;
}
export interface VideoFingerCandidate {
  readonly note: string;
  readonly pick: Finger | null;
}
export interface SourceFingerDecision {
  readonly finger: Finger;
  readonly origin?: string;
  readonly evidence?: SourceEvidence;
}
export interface SourceFinger {
  readonly sourceId: string;
  readonly pitch: number;
  readonly hand: Hand;
  readonly onset: number;
  readonly finger: Finger | null;
  readonly origin: "teacher" | "video-auto" | "source-decision" | "unknown";
  readonly selectedFrom: "decision" | "candidate" | "unknown";
  readonly candidateFinger: Finger | null;
  readonly conflict?: "duplicate-finger-group";
  readonly evidence?: SourceEvidence;
  readonly estimatedContactEnd?: number | null;
}

/** Reuses saved video decisions; no new fingering or interpretation of a missing observation. */
export function resolveSourceFingering(
  events: readonly SourceEvent[],
  candidates: readonly VideoFingerCandidate[],
  decisions: Readonly<Record<string, SourceFingerDecision>>
): SourceFinger[] {
  const byNote = new Map(candidates.map((candidate) => [candidate.note, candidate.pick]));
  return events.map((event) => {
    const decision = decisions[event.id];
    const candidateFinger = byNote.get(event.id) ?? null;
    const finger = decision?.finger ?? candidateFinger;
    const origin: SourceFinger["origin"] = decision
      ? decision.evidence?.by === "auto"
        ? "video-auto"
        : decision.origin === "teacher"
          ? "teacher"
          : "source-decision"
      : finger === null
        ? "unknown"
        : "video-auto";
    return {
      sourceId: event.id,
      pitch: event.pitch,
      hand: event.hand,
      onset: event.onset,
      finger,
      origin,
      selectedFrom: decision ? "decision" : finger === null ? "unknown" : "candidate",
      candidateFinger,
      ...(decision?.evidence ? { evidence: decision.evidence } : {}),
      ...(event.estimatedContactEnd === undefined
        ? {}
        : { estimatedContactEnd: event.estimatedContactEnd })
    };
  });
}
