import type { Keyboard88Atlas } from "./keyboard88Atlas";
import type { Keyboard88PlanEvent } from "./keyboard88Plan";
import {
  KEYBOARD88_FINGER_PRESS_SECONDS,
  KEYBOARD88_FINGER_RELEASE_SECONDS,
  KEYBOARD88_REPEAT_GAP_SECONDS,
  KEYBOARD88_REPEAT_SCALE_SECONDS,
  keyboard88MinJerk
} from "./keyboard88Motion";

export interface Keyboard88Envelope {
  readonly onset: number;
  readonly release: number;
  readonly frameIndex: number;
  readonly finger: number;
  readonly midi: number;
  readonly pressSeconds: number;
  readonly releaseSeconds: number;
}

type MutableEnvelope = { -readonly [K in keyof Keyboard88Envelope]: Keyboard88Envelope[K] };

/** Shorten only visual intervals. Score events, key lighting and musical releases stay intact. */
function prepareRepeats(envelopes: MutableEnvelope[]): void {
  const fingers = new Map<number, MutableEnvelope[]>();
  const keys = new Map<number, MutableEnvelope[]>();
  for (const envelope of envelopes) {
    const fingerNotes = fingers.get(envelope.finger) ?? [];
    const keyNotes = keys.get(envelope.midi) ?? [];
    fingerNotes.push(envelope);
    keyNotes.push(envelope);
    fingers.set(envelope.finger, fingerNotes);
    keys.set(envelope.midi, keyNotes);
  }
  for (const group of [...fingers.values(), ...keys.values()]) {
    let start = 0;
    while (start < group.length) {
      let end = start + 1;
      while (end < group.length && group[end]?.onset === group[start]?.onset) end++;
      const next = group[end];
      if (next) {
        const interval = next.onset - (group[start]?.onset ?? next.onset);
        const scale = Math.min(1, interval / KEYBOARD88_REPEAT_SCALE_SECONDS);
        for (let i = start; i < end; i++) {
          const previous = group[i];
          if (!previous) continue;
          previous.release = Math.min(
            previous.release,
            next.onset - Math.min(KEYBOARD88_REPEAT_GAP_SECONDS, interval / 2)
          );
          previous.releaseSeconds = Math.min(
            previous.releaseSeconds,
            KEYBOARD88_FINGER_RELEASE_SECONDS * scale
          );
        }
        for (let i = end; group[i]?.onset === next.onset; i++) {
          const incoming = group[i];
          if (incoming)
            incoming.pressSeconds = Math.min(
              incoming.pressSeconds,
              KEYBOARD88_FINGER_PRESS_SECONDS * scale
            );
        }
      }
      start = end;
    }
  }
}

export interface Keyboard88FingerSpan {
  readonly start: number;
  readonly envelopes: readonly Keyboard88Envelope[];
}

export interface Keyboard88FingerPlan {
  readonly bones: readonly number[];
  readonly spans: readonly Keyboard88FingerSpan[];
}

const FINGER_NAMES = ["thumb", "index", "middle", "ring", "pinky"];

export function keyboard88FingerNumber(name: string): number {
  const match = /^m_avg_[rl](thumb|index|middle|ring|pinky)[012]$/.exec(name);
  return match ? FINGER_NAMES.indexOf(match[1] ?? "") + 1 : 0;
}

/** Sweep once at song setup; frame sampling only searches spans and their active overlaps. */
export function createKeyboard88FingerPlans(
  atlas: Keyboard88Atlas,
  events: readonly Keyboard88PlanEvent[]
): { fingers: Keyboard88FingerPlan[]; pinCapacity: number } {
  const envelopes: MutableEnvelope[] = [];
  let previousHeld = new Set<object>();
  for (const event of events) {
    if (event.kind === "onset") {
      event.held.forEach((note, i) => {
        if (previousHeld.has(note)) return;
        const finger = event.selection.notes[i]?.finger;
        if (!finger) return;
        envelopes.push({
          onset: event.time,
          release: note.start + note.duration,
          frameIndex: event.selection.frameIndex,
          finger,
          midi: note.midi,
          pressSeconds: KEYBOARD88_FINGER_PRESS_SECONDS,
          releaseSeconds: KEYBOARD88_FINGER_RELEASE_SECONDS
        });
      });
    }
    previousHeld = new Set(event.held);
  }
  prepareRepeats(envelopes);
  const fingers = FINGER_NAMES.map((_, i) => {
    const changes = new Map<number, { add: Keyboard88Envelope[]; remove: Keyboard88Envelope[] }>();
    for (const envelope of envelopes) {
      if (envelope.finger !== i + 1) continue;
      for (const [time, kind] of [
        [envelope.onset - envelope.pressSeconds, "add"],
        [envelope.release + envelope.releaseSeconds, "remove"]
      ] as const) {
        const change = changes.get(time) ?? { add: [], remove: [] };
        change[kind].push(envelope);
        changes.set(time, change);
      }
    }
    const active = new Set<Keyboard88Envelope>();
    const spans: Keyboard88FingerSpan[] = [];
    for (const [start, change] of [...changes].sort(([a], [b]) => a - b)) {
      for (const envelope of change.remove) active.delete(envelope);
      for (const envelope of change.add) active.add(envelope);
      spans.push({ start, envelopes: [...active] });
    }
    return {
      bones: atlas.boneNames.flatMap((name, bone) =>
        keyboard88FingerNumber(name) === i + 1 ? [bone] : []
      ),
      spans
    };
  });
  const pinEdges = envelopes
    .flatMap((envelope) => [
      { time: envelope.onset, delta: 1 },
      { time: envelope.release, delta: -1 }
    ])
    .sort((a, b) => a.time - b.time || a.delta - b.delta);
  let activePins = 0,
    pinCapacity = 0;
  for (const edge of pinEdges) {
    activePins += edge.delta;
    pinCapacity = Math.max(pinCapacity, activePins);
  }
  return { fingers, pinCapacity };
}

export function keyboard88PressWeight(envelope: Keyboard88Envelope, time: number): number {
  return time < envelope.onset
    ? keyboard88MinJerk(1 + (time - envelope.onset) / envelope.pressSeconds)
    : time <= envelope.release
      ? 1
      : 1 - keyboard88MinJerk((time - envelope.release) / envelope.releaseSeconds);
}
