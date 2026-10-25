import { TWO_HAND_HORIZON_MS } from "../reading/twoHandTypes";
import type { MusicNote, MusicHelpEvent } from "./types";
import type { MusicInputSource, HarmonyAnswer } from "./progress";
import type { DictationResult } from "./dictationSession";
import type { DictationListeningState } from "./dictationListening";
export { validateMusicInputJournal, validateMusicEvidence } from "./evidenceValidation";

export const MUSIC_INPUT_EVIDENCE_LIMIT = 512;
export type MusicPresentationKind = "staff" | "audio" | "ready";
interface MusicInputOriginEvidence {
  readonly source: MusicInputSource;
  readonly deviceId?: string;
  readonly channel?: number;
  readonly rawAtMs: number;
  readonly correctedAtMs: number;
  readonly receivedAtMs: number;
  readonly songBeat: number | null;
  readonly eligible: boolean;
  /** Score route, not a measured physical hand. */
  readonly hand?: MusicNote["hand"];
}
export type MusicInputEvidenceEntry = MusicInputOriginEvidence &
  (
    | { readonly kind: "down" | "up"; readonly pitch: number }
    | { readonly kind: "choice"; readonly value: string }
  );
export type MusicInputEvidence = MusicInputEvidenceEntry & {
  readonly id: string;
  readonly runId: string;
  readonly presentationId: string;
};
export interface MusicInputJournalData {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly presentationId: string;
  readonly presentedAtMs: number | null;
  readonly presentationKind: MusicPresentationKind;
  readonly valid: boolean;
  readonly droppedEvents: number;
  readonly events: readonly MusicInputEvidence[];
}
export interface EmbeddedMusicEvidence {
  readonly startedAt: number;
  readonly completedAt: number;
  readonly schemaVersion: 1;
  readonly material: {
    readonly id: string;
    readonly seed: number;
    readonly generatorVersion: 1;
    readonly bpm: number;
    readonly fingerprint: string;
    readonly notes: readonly MusicNote[];
  };
  readonly inputJournal: MusicInputJournalData;
  readonly notes: readonly MusicNote[];
  readonly answers: readonly HarmonyAnswer[];
  readonly dictation: DictationResult | null;
  readonly listening: DictationListeningState;
  readonly help: readonly MusicHelpEvent[];
}
export type P8EmbeddedMusicEvidence = EmbeddedMusicEvidence;
const time = (value: unknown, low = 0, high = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 512;
/** This checks receipt facts only. Admission decisions are supplied by the existing child core. */
export function validMusicInputEntry(entry: MusicInputEvidenceEntry): boolean {
  return (
    ["midi", "keyboard", "pointer"].includes(entry.source) &&
    (entry.deviceId === undefined || text(entry.deviceId)) &&
    (entry.channel === undefined ||
      (Number.isInteger(entry.channel) && entry.channel >= 1 && entry.channel <= 16)) &&
    (entry.source !== "midi" || (text(entry.deviceId) && entry.channel !== undefined)) &&
    time(entry.rawAtMs) &&
    time(entry.correctedAtMs, -60000) &&
    time(entry.receivedAtMs) &&
    entry.receivedAtMs >= entry.rawAtMs &&
    (entry.songBeat === null || time(entry.songBeat, -Number.MAX_SAFE_INTEGER)) &&
    typeof entry.eligible === "boolean" &&
    (!entry.eligible || entry.receivedAtMs - entry.rawAtMs <= TWO_HAND_HORIZON_MS) &&
    (entry.hand === undefined || ["left", "right"].includes(entry.hand)) &&
    (entry.kind === "choice"
      ? entry.source !== "midi" && text(entry.value)
      : ["down", "up"].includes(entry.kind) &&
        Number.isInteger(entry.pitch) &&
        entry.pitch >= 0 &&
        entry.pitch <= 127)
  );
}
/** Records actual observed receipts without a clock, storage, pitch filtering or synthetic attacks. */
export class MusicInputJournal {
  private readonly events: MusicInputEvidence[] = [];
  private presentedAtMs: number | null = null;
  private presentationKind: MusicPresentationKind = "ready";
  private intact = true;
  private dropped = 0;
  constructor(
    private readonly identity: { readonly runId: string; readonly presentationId: string }
  ) {
    if (!text(identity.runId) || !text(identity.presentationId))
      throw new RangeError("Invalid music input journal identity");
    this.identity = { runId: identity.runId, presentationId: identity.presentationId };
  }
  get valid(): boolean {
    return this.intact;
  }
  present(atMs: number, kind: MusicPresentationKind): boolean {
    if (!time(atMs) || !["staff", "audio", "ready"].includes(kind)) return false;
    if (this.presentedAtMs !== null)
      return this.presentedAtMs === atMs && this.presentationKind === kind;
    this.presentedAtMs = atMs;
    this.presentationKind = kind;
    return true;
  }
  record(entry: MusicInputEvidenceEntry): boolean {
    if (
      this.events.length >= MUSIC_INPUT_EVIDENCE_LIMIT ||
      !validMusicInputEntry(entry) ||
      entry.receivedAtMs < (this.events.at(-1)?.receivedAtMs ?? 0)
    ) {
      this.intact = false;
      this.dropped++;
      return false;
    }
    this.events.push({
      ...entry,
      id: `${this.identity.runId}:input:${String(this.events.length + 1)}`,
      runId: this.identity.runId,
      presentationId: this.identity.presentationId
    });
    return true;
  }
  snapshot(): MusicInputJournalData {
    return {
      schemaVersion: 1,
      ...this.identity,
      presentedAtMs: this.presentedAtMs,
      presentationKind: this.presentationKind,
      valid: this.intact,
      droppedEvents: this.dropped,
      events: this.events.map((event) => ({ ...event }))
    };
  }
}
export function cloneMusicEvidence(value: EmbeddedMusicEvidence): EmbeddedMusicEvidence {
  return JSON.parse(JSON.stringify(value)) as EmbeddedMusicEvidence;
}
