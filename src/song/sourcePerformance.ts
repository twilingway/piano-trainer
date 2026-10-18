import type { Finger } from "../fingering/fingering";
import type { Song } from "./song";
import type { SourceEvidence, SourceFinger } from "./sourceFingering";
import { readSourceMotion, type PrecomputedHandTracks } from "./sourceMotion";

export interface SourcePerformanceIdentity {
  readonly id: string;
  readonly midiSha256: string;
  readonly sourceSha256: string;
  readonly noteCount: number;
  readonly timeOriginSeconds: number;
  readonly motion?: PrecomputedHandTracks;
  /** Trusted runtime duration comes from the bound MIDI song, never the external package. */
  readonly durationSeconds?: number;
}
export interface BoundSourceFinger extends SourceFinger {
  readonly midiId: string;
}
export interface SourcePerformancePackage extends SourcePerformanceIdentity {
  readonly schemaVersion: 1;
  readonly notes: readonly BoundSourceFinger[];
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const finger = (value: unknown): value is Finger =>
  finite(value) && Number.isInteger(value) && value >= 1 && value <= 5;
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const invalid = (): never => {
  throw new Error("Invalid local source-performance package");
};

/** Validate external local data before it can become an authoritative fingering source. */
export function readSourcePerformance(value: unknown): SourcePerformancePackage {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !text(value.id) ||
    !hash(value.midiSha256) ||
    !hash(value.sourceSha256) ||
    !finite(value.timeOriginSeconds) ||
    !Array.isArray(value.notes) ||
    value.noteCount !== value.notes.length ||
    value.notes.length === 0
  )
    return invalid();
  const motion = value.motion === undefined ? undefined : readSourceMotion(value.motion);
  if (
    motion &&
    (motion.midiSha256 !== value.midiSha256 || motion.sourceSha256 !== value.sourceSha256)
  )
    return invalid();
  const midiIds = new Set<string>(),
    sourceIds = new Set<string>();
  const notes = value.notes.map((row): BoundSourceFinger => {
    if (
      !object(row) ||
      !text(row.midiId) ||
      !text(row.sourceId) ||
      !finite(row.pitch) ||
      !Number.isInteger(row.pitch) ||
      row.pitch < 0 ||
      row.pitch > 127 ||
      !finite(row.onset) ||
      row.onset < 0 ||
      (row.hand !== "left" && row.hand !== "right") ||
      (row.finger !== null && !finger(row.finger)) ||
      (row.candidateFinger !== null && !finger(row.candidateFinger)) ||
      !["teacher", "video-auto", "source-decision", "unknown"].includes(String(row.origin)) ||
      !["decision", "candidate", "unknown"].includes(String(row.selectedFrom)) ||
      (row.finger === null) !== (row.origin === "unknown") ||
      (row.conflict !== undefined && row.conflict !== "duplicate-finger-group") ||
      midiIds.has(row.midiId) ||
      sourceIds.has(row.sourceId)
    )
      return invalid();
    midiIds.add(row.midiId);
    sourceIds.add(row.sourceId);
    let evidence: SourceEvidence | undefined;
    if (row.evidence !== undefined) {
      if (
        !object(row.evidence) ||
        (row.evidence.by !== undefined && !text(row.evidence.by)) ||
        (row.evidence.frame !== undefined && !finite(row.evidence.frame)) ||
        (row.evidence.time !== undefined && !finite(row.evidence.time))
      )
        return invalid();
      evidence = {
        ...(row.evidence.by === undefined ? {} : { by: row.evidence.by }),
        ...(row.evidence.frame === undefined ? {} : { frame: row.evidence.frame }),
        ...(row.evidence.time === undefined ? {} : { time: row.evidence.time })
      };
    }
    if (
      row.estimatedContactEnd !== undefined &&
      row.estimatedContactEnd !== null &&
      !finite(row.estimatedContactEnd)
    )
      return invalid();
    return {
      midiId: row.midiId,
      sourceId: row.sourceId,
      pitch: row.pitch,
      hand: row.hand,
      onset: row.onset,
      finger: row.finger,
      candidateFinger: row.candidateFinger,
      origin: row.origin as SourceFinger["origin"],
      selectedFrom: row.selectedFrom as SourceFinger["selectedFrom"],
      ...(evidence ? { evidence } : {}),
      ...(row.conflict === undefined ? {} : { conflict: row.conflict }),
      ...(row.estimatedContactEnd === undefined
        ? {}
        : {
            estimatedContactEnd: row.estimatedContactEnd
          })
    };
  });
  if (
    motion &&
    notes.some((note) => note.finger !== null && motion.tracks[note.hand].keys.length === 0)
  )
    return invalid();
  return {
    schemaVersion: 1,
    id: value.id,
    midiSha256: value.midiSha256,
    sourceSha256: value.sourceSha256,
    noteCount: notes.length,
    timeOriginSeconds: value.timeOriginSeconds,
    notes,
    ...(motion ? { motion } : {})
  };
}

const sameEvent = (note: Song["notes"][number], source: SourceFinger) =>
  note.pitch === source.pitch &&
  note.hand === source.hand &&
  Math.abs(note.start - source.onset) < 0.001;

/** Hash matching is mandatory; title and file name never select a source performance. */
export function bindSourcePerformance(
  song: Song,
  performance: SourcePerformancePackage,
  midiSha256: string
): Song {
  if (song.source !== "midi" || midiSha256 !== performance.midiSha256) return song;
  if (
    song.notes.length !== performance.noteCount ||
    (performance.motion && performance.motion.duration + 1e-7 < song.duration)
  )
    return invalid();
  const byId = new Map(performance.notes.map((note) => [note.midiId, note]));
  const notes = song.notes.map((note) => {
    const source = byId.get(note.id);
    if (!source || !sameEvent(note, source)) return invalid();
    const { finger: _finger, transition: _transition, ...rest } = note;
    return {
      ...rest,
      sourceFinger: source,
      ...(source.finger === null ? {} : { finger: source.finger })
    };
  });
  const { notes: _notes, schemaVersion: _version, ...identity } = performance;
  return { ...song, notes, sourcePerformance: { ...identity, durationSeconds: song.duration } };
}

/** A transformed arrangement cannot retain the exact-file claim of its original performance. */
export function hasSourcePerformance(song: Song): boolean {
  return (
    song.sourcePerformance !== undefined &&
    !song.simplified &&
    !song.asWritten &&
    song.notes.length === song.sourcePerformance.noteCount &&
    song.notes.every(
      (note) => note.sourceFinger !== undefined && sameEvent(note, note.sourceFinger)
    )
  );
}
export function withoutSourcePerformance(song: Song): Song {
  const { sourcePerformance: _source, ...rest } = song;
  return { ...rest, notes: song.notes.map(({ sourceFinger: _finger, ...note }) => note) };
}
