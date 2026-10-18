import type { WorldRoadNote } from "./roadNoteGeometry";

export interface RingFire {
  readonly pitch: number;
  readonly color: number;
  readonly strength: number;
}

/** Visible notes add energy to their own octave position and spill into adjacent semitones. */
export function performanceRingField(
  notes: readonly WorldRoadNote[],
  count: number
): readonly RingFire[] {
  const field = new Map<string, RingFire>();
  for (let i = 0; i < Math.min(count, notes.length); i++) {
    const note = notes[i];
    if (!note || !Number.isInteger(note.pitch) || !Number.isFinite(note.alpha) || note.alpha <= 0)
      continue;
    const pitch = note.pitch;
    if (pitch === undefined || pitch < 21 || pitch > 108) continue;
    for (const [offset, weight] of [
      [-2, 0.15],
      [-1, 0.4],
      [0, 1],
      [1, 0.4],
      [2, 0.15]
    ] as const) {
      const target = pitch + offset;
      if (target < 21 || target > 108) continue;
      const id = String(target) + ":" + String(note.color);
      field.set(id, {
        pitch: target,
        color: note.color,
        strength: (field.get(id)?.strength ?? 0) + Math.min(1, note.alpha) * weight
      });
    }
  }
  return [...field.values()];
}
