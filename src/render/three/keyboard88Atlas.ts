/** Pure atlas data. Quaternion components are local glTF xyzw, frame/bone/component order. */
export type Keyboard88Assignment = readonly [number, number, number, number, number];
export type Keyboard88Hand = "right" | "left";

export interface Keyboard88Frame {
  readonly id: number;
  readonly assignment: Keyboard88Assignment;
  readonly pressedMask: number;
  readonly audit?: unknown;
}

export interface Keyboard88Atlas {
  readonly frames: readonly Keyboard88Frame[];
  readonly boneNames: readonly string[];
  readonly rotations: Float32Array;
  /** Optional per-frame root translation, xyz. Otherwise the GLB root is unchanged. */
  readonly roots?: Float32Array;
}

export interface Keyboard88Index {
  readonly atlas: Keyboard88Atlas;
  readonly restIndices: readonly number[];
  readonly hands: Readonly<Record<Keyboard88Hand, Keyboard88HandIndex>>;
}

interface Keyboard88Candidate {
  readonly frameIndex: number;
  readonly requestedMask: number;
  readonly distance: number;
}

interface Keyboard88HandIndex {
  readonly assignments: readonly Keyboard88Assignment[];
  readonly pressedMidi: ReadonlyMap<string, readonly number[]>;
  readonly masks: readonly (readonly number[])[];
  readonly requests: Map<string, readonly Keyboard88Candidate[]>;
}

export interface Keyboard88RequestedNote {
  readonly id: string | number;
  readonly midi: number;
  readonly finger?: number | undefined;
}

export interface Keyboard88Selection {
  readonly frameIndex: number;
  readonly frameId: number;
  /** Assignment in the requested hand's MIDI space; left uses 100 - right. */
  readonly assignment: Keyboard88Assignment;
  readonly pressedMask: number;
  readonly requestedMask: number;
  readonly distance: number;
  readonly exact: boolean;
  readonly notes: readonly { readonly id: string | number; readonly finger: number }[];
}

export function validateKeyboard88Atlas(atlas: Keyboard88Atlas): void {
  const count = atlas.frames.length,
    bones = atlas.boneNames.length;
  if (!count || !bones || new Set(atlas.boneNames).size !== bones) {
    throw new Error("Invalid keyboard88 frame/bone index");
  }
  if (
    atlas.rotations.length !== count * bones * 4 ||
    (atlas.roots?.length !== undefined && atlas.roots.length !== count * 3)
  ) {
    throw new Error("Invalid keyboard88 pose buffer length");
  }
  const ids = new Set<number>();
  for (const frame of atlas.frames) {
    if (
      !Number.isInteger(frame.id) ||
      ids.has(frame.id) ||
      (frame.assignment as readonly number[]).length !== 5 ||
      frame.assignment.some((midi) => !Number.isInteger(midi) || midi < 0 || midi > 127) ||
      !Number.isInteger(frame.pressedMask) ||
      frame.pressedMask < 0 ||
      frame.pressedMask > 31
    ) {
      throw new Error("Invalid keyboard88 frame assignment");
    }
    ids.add(frame.id);
  }
  for (let i = 0; i < atlas.rotations.length; i += 4) {
    let norm = 0;
    for (let j = 0; j < 4; j++) norm += (atlas.rotations[i + j] ?? NaN) ** 2;
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.002) {
      throw new Error("Invalid keyboard88 quaternion");
    }
  }
  if (atlas.roots?.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid keyboard88 root translation");
  }
  if (!atlas.frames.some((frame) => frame.pressedMask === 0)) {
    throw new Error("Keyboard88 has no recorded rest frame");
  }
}

export function indexKeyboard88Atlas(atlas: Keyboard88Atlas): Keyboard88Index {
  validateKeyboard88Atlas(atlas);
  return {
    atlas,
    restIndices: atlas.frames.flatMap((frame, i) => (frame.pressedMask === 0 ? [i] : [])),
    hands: { right: indexHand(atlas, "right"), left: indexHand(atlas, "left") }
  };
}

function midiKey(midis: readonly number[]): string {
  return [...new Set(midis)].sort((a, b) => a - b).join(",");
}

function indexHand(atlas: Keyboard88Atlas, hand: Keyboard88Hand): Keyboard88HandIndex {
  const assignments = atlas.frames.map((frame) => keyboard88Assignment(frame, hand));
  const pressedMidi = new Map<string, number[]>();
  const masks = Array.from({ length: 32 }, () => [] as number[]);
  for (let i = 0; i < atlas.frames.length; i++) {
    const frame = atlas.frames[i];
    const assignment = assignments[i];
    if (!frame || !assignment) continue;
    masks[frame.pressedMask]?.push(i);
    const key = midiKey(assignment.filter((_, finger) => frame.pressedMask & (1 << finger)));
    const bucket = pressedMidi.get(key) ?? [];
    bucket.push(i);
    pressedMidi.set(key, bucket);
  }
  return { assignments, pressedMidi, masks, requests: new Map() };
}

export function keyboard88Assignment(
  frame: Keyboard88Frame,
  hand: Keyboard88Hand
): Keyboard88Assignment {
  if (hand === "right") return frame.assignment;
  const [a, b, c, d, e] = frame.assignment;
  return [100 - a, 100 - b, 100 - c, 100 - d, 100 - e];
}

function sameAssignment(a: readonly number[], b: readonly number[]): boolean {
  return a.every((midi, i) => midi === b[i]);
}

function lowerRank(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return (a[i] ?? Infinity) < (b[i] ?? Infinity);
  }
  return false;
}

function closestFinger(midi: number, assignment: Keyboard88Assignment): number {
  let finger = 1,
    distance = Infinity;
  for (let i = 0; i < 5; i++) {
    const next = Math.abs(midi - (assignment[i] ?? NaN));
    if (next < distance) {
      finger = i + 1;
      distance = next;
    }
  }
  return finger;
}

function explicitFinger(note: Keyboard88RequestedNote): number {
  return note.finger !== undefined &&
    Number.isInteger(note.finger) &&
    note.finger >= 1 &&
    note.finger <= 5
    ? note.finger
    : 0;
}

/** Cache musical candidates only; chronological assignment ties and note IDs remain per event. */
function requestCandidates(
  index: Keyboard88Index,
  notes: readonly Keyboard88RequestedNote[],
  hand: Keyboard88Hand
): readonly Keyboard88Candidate[] {
  const data = index.hands[hand];
  const key = notes.map((note) => `${String(note.midi)}:${String(explicitFinger(note))}`).join(";");
  const cached = data.requests.get(key);
  if (cached) return cached;
  let candidates: Keyboard88Candidate[] = [];
  let bestMismatch = Infinity,
    bestDistance = Infinity;
  const score = (indices: readonly number[], exactOnly: boolean) => {
    for (const frameIndex of indices) {
      const assignment = data.assignments[frameIndex];
      const frame = index.atlas.frames[frameIndex];
      if (!assignment || !frame) continue;
      let requestedMask = 0,
        distance = 0;
      for (const note of notes) {
        const finger = explicitFinger(note) || closestFinger(note.midi, assignment);
        requestedMask |= 1 << (finger - 1);
        distance += Math.abs(note.midi - (assignment[finger - 1] ?? NaN));
      }
      const mismatch = Number(frame.pressedMask !== requestedMask);
      if (exactOnly && (mismatch || distance !== 0)) continue;
      if (mismatch > bestMismatch || (mismatch === bestMismatch && distance > bestDistance)) {
        continue;
      }
      if (mismatch < bestMismatch || distance < bestDistance) candidates = [];
      candidates.push({ frameIndex, requestedMask, distance });
      bestMismatch = mismatch;
      bestDistance = distance;
    }
  };
  // Exact candidates are indexed by the actual pressed MIDI set, not the whole assignment.
  const exact = data.pressedMidi.get(midiKey(notes.map((note) => note.midi)));
  if (exact) score(exact, true);
  if (!candidates.length) {
    let mask = 0;
    const explicit = notes.every((note) => {
      const finger = explicitFinger(note);
      mask |= 1 << (finger - 1);
      return finger !== 0;
    });
    const matching = explicit ? data.masks[mask] : undefined;
    score(matching?.length ? matching : data.assignments.map((_, i) => i), false);
  }
  data.requests.set(key, candidates);
  return candidates;
}

/** Audit never participates. Every request, including conflicts/out-of-range keys, gets a frame. */
export function selectKeyboard88Frame(
  index: Keyboard88Index,
  notes: readonly Keyboard88RequestedNote[],
  hand: Keyboard88Hand,
  previous?: Keyboard88Assignment
): Keyboard88Selection {
  if (!notes.length) return selectKeyboard88Rest(index, previous, hand);
  let best: Keyboard88Candidate | undefined,
    bestPrevious = Infinity,
    bestId = Infinity;
  const candidates = requestCandidates(index, notes, hand);
  for (const candidate of candidates) {
    const assignment = index.hands[hand].assignments[candidate.frameIndex];
    const frame = index.atlas.frames[candidate.frameIndex];
    if (!assignment || !frame) continue;
    const id = frame.id;
    const previousRank = Number(!previous || !sameAssignment(assignment, previous));
    if (previousRank < bestPrevious || (previousRank === bestPrevious && id < bestId)) {
      best = candidate;
      bestPrevious = previousRank;
      bestId = id;
    }
  }
  if (!best) throw new Error("Keyboard88 selection has no finite candidate");
  const frame = index.atlas.frames[best.frameIndex];
  const assignment = index.hands[hand].assignments[best.frameIndex];
  if (!frame || !assignment) throw new Error("Keyboard88 selection has no finite candidate");
  return {
    frameIndex: best.frameIndex,
    frameId: frame.id,
    assignment,
    pressedMask: frame.pressedMask,
    requestedMask: best.requestedMask,
    distance: best.distance,
    exact: frame.pressedMask === best.requestedMask && best.distance === 0,
    notes: notes.map((note) => ({
      id: note.id,
      finger: explicitFinger(note) || closestFinger(note.midi, assignment)
    }))
  };
}

/** Missing recorded mask0 uses the nearest complete five-finger assignment, never a synthetic pose. */
export function selectKeyboard88Rest(
  index: Keyboard88Index,
  previous: Keyboard88Assignment | undefined,
  hand: Keyboard88Hand
): Keyboard88Selection {
  let best: Keyboard88Selection | undefined,
    bestRank: readonly number[] = [Infinity];
  for (const frameIndex of index.restIndices) {
    const frame = index.atlas.frames[frameIndex];
    if (!frame) continue;
    const assignment = keyboard88Assignment(frame, hand);
    const distance = previous
      ? assignment.reduce((sum, midi, i) => sum + Math.abs(midi - (previous[i] ?? NaN)), 0)
      : 0;
    const rank = [distance, Number(!previous || !sameAssignment(assignment, previous)), frame.id];
    if (lowerRank(rank, bestRank)) {
      bestRank = rank;
      best = {
        frameIndex,
        frameId: frame.id,
        assignment,
        pressedMask: 0,
        requestedMask: 0,
        distance,
        exact: distance === 0,
        notes: []
      };
    }
  }
  if (!best) throw new Error("Keyboard88 selection has no rest candidate");
  return best;
}
