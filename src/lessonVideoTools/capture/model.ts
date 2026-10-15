/** Rig-independent observations. Model predictions are never silently promoted to facts. */
export type Side = "left" | "right";
export type Finger = 1 | 2 | 3 | 4 | 5;
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Landmark extends Point {
  readonly z: number;
}
export interface Calibration {
  readonly schemaVersion: 1;
  readonly sourceSha256: string;
  readonly mirrored: boolean;
  readonly roi?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly keys: readonly { readonly pitch: number; readonly polygon: readonly Point[] }[];
}
export interface DetectedHand {
  readonly trackId: string;
  readonly side: Side | null;
  readonly handednessScore: number;
  readonly landmarks: readonly Landmark[];
  readonly worldLandmarks: readonly Landmark[];
  readonly worldIsEstimate: true;
}
export interface HandFrame {
  readonly frameIndex: number;
  readonly pts: string;
  readonly timeBase: string;
  readonly time: number;
  readonly hands: readonly DetectedHand[];
  readonly diagnostics: readonly string[];
}
export interface RawNote {
  readonly id: string;
  readonly pitch: number;
  readonly onset: number;
  readonly offset: number;
  readonly velocity: number;
}
export interface MusicPrediction {
  readonly schemaVersion: 1;
  readonly backend: Readonly<Record<string, unknown>>;
  readonly notes: readonly RawNote[];
  readonly warnings: readonly string[];
}
export interface FingerCandidate {
  readonly frameIndex: number;
  readonly trackId: string;
  readonly hand: Side | null;
  readonly finger: Finger;
  readonly distance: number;
}
export interface CapturedNote extends RawNote {
  readonly estimatedOffset: number;
  readonly keyRelease: number | null;
  readonly acousticEnd: number | null;
  readonly hand: Side | null;
  readonly teacherFinger: Finger | null;
  readonly writtenFinger: Finger | null;
  readonly computedFinger: Finger | null;
  readonly candidates: readonly FingerCandidate[];
  readonly evidence: readonly string[];
  readonly review: { readonly notes: boolean; readonly finger: boolean };
}
export interface NoteCorrection {
  readonly eventId: string;
  readonly pitch?: number;
  readonly onset?: number;
  readonly keyRelease?: number | null;
  readonly hand?: Side | null;
  readonly teacherFinger?: Finger | null;
  readonly writtenFinger?: Finger | null;
  readonly computedFinger?: Finger | null;
  readonly reviewNotes?: boolean;
  readonly reviewFinger?: boolean;
  readonly evidence: readonly string[];
  readonly reason: string;
}
export interface Review {
  readonly schemaVersion: 1;
  readonly sourceSha256: string;
  readonly inputs: { readonly music: string | null; readonly hands: string | null };
  readonly notes: readonly NoteCorrection[];
  readonly hands: {
    readonly reviewedRanges: readonly {
      readonly start: number;
      readonly end: number;
      readonly evidence: readonly string[];
    }[];
    readonly issues: readonly string[];
  };
}

export function bindReview(review: Review, inputs: Review["inputs"]): void {
  if (review.inputs.music !== inputs.music || review.inputs.hands !== inputs.hands)
    throw new Error(
      "Review относится к другим результатам распознавания. Сверьте новый вывод отдельно."
    );
}

export function inside(point: Point, polygon: readonly Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (!a || !b) continue;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}

/** A nearby fingertip is a candidate, not proof of a pressed key. */
export function fingerCandidates(
  note: RawNote,
  frames: readonly HandFrame[],
  calibration: Calibration
): FingerCandidate[] {
  const key = calibration.keys.find((entry) => entry.pitch === note.pitch);
  if (!key) return [];
  const candidates: FingerCandidate[] = [];
  for (const frame of frames) {
    if (Math.abs(frame.time - note.onset) > 0.08) continue;
    for (const hand of frame.hands) {
      for (const finger of [1, 2, 3, 4, 5] as const) {
        const point = hand.landmarks[finger * 4];
        if (point && inside(point, key.polygon))
          candidates.push({
            frameIndex: frame.frameIndex,
            trackId: hand.trackId,
            hand: hand.side,
            finger,
            distance: Math.abs(frame.time - note.onset)
          });
      }
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance || a.frameIndex - b.frameIndex);
}

export function captureNotes(
  raw: readonly RawNote[],
  frames: readonly HandFrame[],
  calibration: Calibration
): CapturedNote[] {
  return raw.map((note) => ({
    ...note,
    estimatedOffset: note.offset,
    keyRelease: null,
    acousticEnd: null,
    hand: null,
    teacherFinger: null,
    writtenFinger: null,
    computedFinger: null,
    candidates: fingerCandidates(note, frames, calibration),
    evidence: [],
    review: { notes: false, finger: false }
  }));
}

export function applyReview(notes: readonly CapturedNote[], review: Review): CapturedNote[] {
  const patches = new Map(review.notes.map((patch) => [patch.eventId, patch]));
  if (
    patches.size !== review.notes.length ||
    review.notes.some((patch) => !notes.some((note) => note.id === patch.eventId))
  )
    throw new Error("Исправления содержат повторный или неизвестный eventId.");
  return notes.map((note) => {
    const patch = patches.get(note.id);
    if (!patch) return note;
    if (!patch.reason.trim() || patch.evidence.length === 0)
      throw new Error("Исправление требует основания и ссылок на кадры.");
    const { eventId: _id, reason: _reason, evidence, reviewNotes, reviewFinger, ...values } = patch;
    const result = {
      ...note,
      ...values,
      evidence,
      review: {
        notes: reviewNotes ?? note.review.notes,
        finger: reviewFinger ?? note.review.finger
      }
    };
    if (
      !Number.isInteger(result.pitch) ||
      result.pitch < 0 ||
      result.pitch > 127 ||
      !Number.isFinite(result.onset) ||
      (result.keyRelease !== null && result.keyRelease <= result.onset)
    )
      throw new Error("Неверная высота или длительность исправленной ноты.");
    if (result.review.finger && (result.teacherFinger === null || result.hand === null))
      throw new Error("Подтверждённый палец требует руки и наблюдения teacherFinger.");
    return result;
  });
}
