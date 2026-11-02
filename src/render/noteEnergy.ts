import type { SongNote } from "../song/song";
import type { FrameState } from "./frameState";
import { boundedLookAhead } from "./noteSpeed";

export interface EnergySource {
  readonly id: string;
  readonly pitch: number;
  readonly color: number;
  readonly strength: number;
  readonly progress: number;
  readonly sounding: boolean;
  /** Written duration in song seconds, used only to size visual embers. */
  readonly duration?: number;
}

/** Visual energy follows score notes; a held key alone never accepts a player note. */
export function energySources(
  notes: readonly SongNote[],
  frame: FrameState,
  colorOf: (note: SongNote) => number
): EnergySource[] {
  const sources: EnergySource[] = [];
  const lookAhead = boundedLookAhead(frame.lookAhead);
  for (const note of notes) {
    if (note.start > frame.time + lookAhead || note.start + note.duration < frame.time) continue;
    const progress =
      lookAhead > 0 ? Math.min(1, Math.max(0, 1 - (note.start - frame.time) / lookAhead)) : 1;
    const sounding = frame.owns(note)
      ? frame.statusOf(note.id) === "hit" && frame.pressed.has(note.pitch)
      : note.start <= frame.time && frame.sounding.has(note.pitch);
    sources.push({
      id: note.id,
      pitch: note.pitch,
      color: colorOf(note),
      strength: sounding ? 1 : 0.04 + 0.24 * progress * progress,
      progress,
      sounding,
      duration: note.duration
    });
  }
  return sources;
}

/** Each score note emits one attack, including distinct notes sharing a pitch. */
export class EnergyAttacks {
  private readonly emitted = new Set<string>();

  update(sources: readonly EnergySource[]): readonly EnergySource[] {
    const attacks: EnergySource[] = [];
    for (const source of sources) {
      if (!source.sounding || this.emitted.has(source.id)) continue;
      this.emitted.add(source.id);
      attacks.push(source);
    }
    return attacks;
  }

  clear(): void {
    this.emitted.clear();
  }
}
