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
import { createKeyboard88HandSample, sampleKeyboard88Hand } from "./keyboard88Sample";

export const KEYBOARD88_TRANSITION_SECONDS = 0.08;

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
  readonly selection: Keyboard88Selection;
}

export interface Keyboard88HandPlan {
  readonly initial: Keyboard88Selection;
  readonly events: readonly Keyboard88PlanEvent[];
  readonly transitions: readonly Keyboard88Transition[];
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
  for (const [time, group] of [...groups].sort(([a], [b]) => a - b)) {
    for (const kind of ["release", "onset"] as const) {
      if (!group[kind].length) continue;
      for (const id of group[kind]) {
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
  const plan = { initial, events, transitions };
  const source = createKeyboard88HandSample(index.atlas);
  events.forEach((event, i) => {
    const previous = events[i - 1],
      next = events[i + 1];
    const start =
      event.kind === "onset"
        ? Math.max(
            previous?.time ?? event.time - KEYBOARD88_TRANSITION_SECONDS,
            event.time - KEYBOARD88_TRANSITION_SECONDS
          )
        : event.time;
    let end = event.kind === "onset" ? event.time : event.time + KEYBOARD88_TRANSITION_SECONDS;
    if (event.kind === "release" && next) {
      const boundary =
        next.kind === "onset"
          ? Math.max(event.time, next.time - KEYBOARD88_TRANSITION_SECONDS)
          : next.time;
      end = Math.min(end, boundary);
      // A touching onset supersedes release: never insert an artificial mask0 endpoint.
      if (end <= start) return;
    }
    sampleKeyboard88Hand(index.atlas, plan, start, source);
    transitions.push({
      start,
      end,
      fromRotations: source.rotations.slice(),
      fromRoot: source.root.slice(),
      fromFrameId: source.frameId,
      selection: event.selection
    });
  });
  return plan;
}

/** Built once in chronological order, so seeking never depends on previously drawn frames. */
export function createKeyboard88Plan(
  atlas: Keyboard88Atlas,
  notes: Readonly<Record<Keyboard88Hand, readonly Keyboard88Note[]>>
): Keyboard88Plan {
  const index = indexKeyboard88Atlas(atlas);
  return {
    right: handPlan(index, notes.right, "right"),
    left: handPlan(index, notes.left, "left")
  };
}
