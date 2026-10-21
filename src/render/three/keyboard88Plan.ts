import {
  indexKeyboard88Atlas,
  selectKeyboard88Frame,
  selectKeyboard88Rest
} from "./keyboard88Atlas";
import type {
  Keyboard88Atlas,
  Keyboard88Hand,
  Keyboard88Index,
  Keyboard88RequestedNote,
  Keyboard88Selection
} from "./keyboard88Atlas";
import { createKeyboard88HandSample, sampleKeyboard88HandLayer } from "./keyboard88Sample";
import { createKeyboard88FingerPlans, keyboard88FingerNumber } from "./keyboard88Fingers";
import type { Keyboard88FingerPlan } from "./keyboard88Fingers";
import {
  KEYBOARD88_EVENT_TIME_EPSILON as EVENT_TIME_EPSILON,
  KEYBOARD88_HAND_APPROACH_SECONDS,
  KEYBOARD88_HAND_RELEASE_SECONDS
} from "./keyboard88Motion";

export interface Keyboard88Note extends Keyboard88RequestedNote {
  readonly start: number;
  readonly duration: number;
}

export interface Keyboard88PlanEvent {
  readonly time: number;
  readonly kind: "release" | "onset";
  readonly held: readonly Keyboard88Note[];
  readonly selection: Keyboard88Selection;
}

export interface Keyboard88Transition {
  readonly start: number;
  readonly end: number;
  readonly fromRotations: Float32Array;
  readonly fromRoot: Float32Array;
  readonly fromFrameId: number;
  readonly targetRotations: Float32Array;
  readonly selection: Keyboard88Selection;
}

export interface Keyboard88HandPlan {
  readonly initial: Keyboard88Selection;
  readonly events: readonly Keyboard88PlanEvent[];
  readonly transitions: readonly Keyboard88Transition[];
  readonly fingers: readonly Keyboard88FingerPlan[];
  readonly pinCapacity: number;
}

export interface Keyboard88Plan {
  readonly right: Keyboard88HandPlan;
  readonly left: Keyboard88HandPlan;
}

function compareNotes(a: Keyboard88Note, b: Keyboard88Note): number {
  const keyA = `${typeof a.id}:${String(a.id)}`,
    keyB = `${typeof b.id}:${String(b.id)}`;
  return (
    a.midi - b.midi ||
    (a.finger ?? 0) - (b.finger ?? 0) ||
    (keyA < keyB ? -1 : keyA > keyB ? 1 : 0) ||
    a.start - b.start ||
    a.duration - b.duration
  );
}

function handEvents(
  index: Keyboard88Index,
  input: readonly Keyboard88Note[],
  hand: Keyboard88Hand
): Keyboard88PlanEvent[] {
  const groups = new Map<number, { release: number[]; onset: number[] }>();
  const notes = [...input].sort(compareNotes);
  notes.forEach((note, id) => {
    if (
      ![note.start, note.duration, note.midi, note.start + note.duration].every(Number.isFinite) ||
      note.duration < 0
    ) {
      throw new Error("Invalid keyboard88 song note");
    }
    // A zero-length interval holds no key and cannot remain stuck after its timestamp.
    if (note.duration === 0) return;
    for (const [time, kind] of [
      [note.start, "onset"],
      [note.start + note.duration, "release"]
    ] as const) {
      const group = groups.get(time) ?? { release: [], onset: [] };
      group[kind].push(id);
      groups.set(time, group);
    }
  });
  const held = new Map<number, Keyboard88Note>();
  const events: Keyboard88PlanEvent[] = [];
  let previous = undefined as Keyboard88Selection | undefined;
  const boundaries: { time: number; origin: number; release: number[]; onset: number[] }[] = [];
  for (const [time, group] of [...groups].sort(([a], [b]) => a - b)) {
    const previous = boundaries.at(-1);
    if (previous && time - previous.origin < EVENT_TIME_EPSILON) {
      // Use the onset timestamp for a touching boundary, retaining release-before-onset ordering.
      if (!previous.onset.length && group.onset.length) previous.time = time;
      previous.release.push(...group.release);
      previous.onset.push(...group.onset);
    } else boundaries.push({ time, origin: time, ...group });
  }
  for (const group of boundaries) {
    const time = group.time;
    for (const kind of ["release", "onset"] as const) {
      // An interval collapsed into one boundary is already over, so it cannot become held.
      const ids =
        kind === "onset" ? group.onset.filter((id) => !group.release.includes(id)) : group.release;
      if (!ids.length) continue;
      for (const id of ids) {
        const note = notes[id];
        if (kind === "release") held.delete(id);
        else if (note) held.set(id, note);
      }
      const active = [...held.values()].sort(compareNotes);
      const selection = selectKeyboard88Frame(index, active, hand, previous?.assignment);
      events.push({ time, kind, held: active, selection });
      previous = selection;
    }
  }
  return events;
}

function handPlan(
  index: Keyboard88Index,
  notes: readonly Keyboard88Note[],
  hand: Keyboard88Hand
): Keyboard88HandPlan {
  const events = handEvents(index, notes, hand);
  const initial = selectKeyboard88Rest(index, events[0]?.selection.assignment, hand);
  const transitions: Keyboard88Transition[] = [];
  const plan: Keyboard88HandPlan = {
    initial,
    events,
    transitions,
    fingers: [],
    pinCapacity: 0
  };
  const source = createKeyboard88HandSample(index.atlas);
  events.forEach((event, i) => {
    let previousIndex = i - 1;
    while (
      previousIndex >= 0 &&
      event.time - (events[previousIndex]?.time ?? -Infinity) < EVENT_TIME_EPSILON
    ) {
      previousIndex--;
    }
    const previous = events[previousIndex],
      next = events[i + 1];
    if (event.kind === "release" && event.held.length) return;
    const start =
      event.kind === "onset"
        ? Math.max(
            previous?.time ?? event.time - KEYBOARD88_HAND_APPROACH_SECONDS,
            event.time - KEYBOARD88_HAND_APPROACH_SECONDS
          )
        : event.time;
    const end = event.kind === "onset" ? event.time : event.time + KEYBOARD88_HAND_RELEASE_SECONDS;
    if (event.kind === "release" && next) {
      const boundary =
        next.kind === "onset"
          ? Math.max(event.time, next.time - KEYBOARD88_HAND_APPROACH_SECONDS)
          : next.time;
      // Only rest when the entire move finishes before the next preparation starts.
      if (end > boundary) return;
    }
    sampleKeyboard88HandLayer(index.atlas, plan, start, source);
    const rest = selectKeyboard88Rest(index, event.selection.assignment, hand);
    const size = index.atlas.boneNames.length * 4;
    const targetRotations = index.atlas.rotations.slice(
      event.selection.frameIndex * size,
      (event.selection.frameIndex + 1) * size
    );
    index.atlas.boneNames.forEach((name, bone) => {
      if (!keyboard88FingerNumber(name)) return;
      for (let j = 0; j < 4; j++) {
        targetRotations[bone * 4 + j] =
          index.atlas.rotations[rest.frameIndex * size + bone * 4 + j] ?? 0;
      }
    });
    transitions.push({
      start,
      end,
      fromRotations: source.rotations.slice(),
      fromRoot: source.root.slice(),
      fromFrameId: source.frameId,
      targetRotations,
      selection: event.selection
    });
  });
  return { ...plan, ...createKeyboard88FingerPlans(index.atlas, events, transitions) };
}

/** Built once in chronological order, so seeking never depends on previously drawn frames. */
export function createKeyboard88Plan(
  atlas: Keyboard88Atlas,
  notes: Readonly<Record<Keyboard88Hand, readonly Keyboard88Note[]>>,
  index: Keyboard88Index = indexKeyboard88Atlas(atlas)
): Keyboard88Plan {
  return {
    right: handPlan(index, notes.right, "right"),
    left: handPlan(index, notes.left, "left")
  };
}
