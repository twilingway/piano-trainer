import type { SongNote } from "../song/song";

/** A written duration alone must not keep a released key's finger hint or colour alive. */
export function keyHintNote(
  due: SongNote | undefined,
  playing: SongNote | undefined,
  sounding: boolean
): SongNote | undefined {
  return due ?? (sounding ? playing : undefined);
}
