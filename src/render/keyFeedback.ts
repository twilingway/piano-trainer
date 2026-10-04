import type { SongNote } from "../song/song";

const APPROACH_MS = 300;
const FLASH_MS = 80;
const PENDING_STRENGTH = 0.75;

/** A pending key brightens in real playback time, independent of the visual offset. */
export function keyHintStrength(
  note: SongNote | undefined,
  hintTime: number,
  speed: number,
  hints = true,
  waiting = false
): number {
  if (!hints || !note) return 0;
  const deltaMs = ((hintTime - note.start) / (speed > 0 ? speed : 1)) * 1000;
  if (deltaMs < 0) return Math.max(0, 1 + deltaMs / APPROACH_MS) * PENDING_STRENGTH;
  // A frozen wait-mode clock must not keep the brief arrival flash alive forever.
  if (waiting || deltaMs >= FLASH_MS) return PENDING_STRENGTH;
  return 1 - (deltaMs / FLASH_MS) * (1 - PENDING_STRENGTH);
}

/** Repeated notes on one physical key must still flash when the newer attack arrives. */
export function strongestKeyHint(
  notes: readonly SongNote[],
  pitch: number | undefined,
  hintTime: number,
  speed: number,
  hints = true,
  waiting = false
): SongNote | undefined {
  let strongest: SongNote | undefined;
  let strength = 0;
  for (const note of notes) {
    if (note.pitch !== pitch) continue;
    const candidate = keyHintStrength(note, hintTime, speed, hints, waiting);
    if (candidate > strength) {
      strongest = note;
      strength = candidate;
    }
  }
  return strongest;
}

/** A written duration alone must not keep a released key's finger hint or colour alive. */
export function keyHintNote(
  due: SongNote | undefined,
  playing: SongNote | undefined,
  sounding: boolean
): SongNote | undefined {
  return due ?? (sounding ? playing : undefined);
}
