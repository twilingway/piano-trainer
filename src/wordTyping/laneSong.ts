import type { Song, SongNote } from "../song/song";
import { typingFinger } from "./touchTyping";
import type { GeneratedToken } from "./types";

/** The first column's stand-in pitch; the lane only draws, it never sounds. */
const FIRST_COLUMN = 36;

export interface LaneSong {
  /** The line with each note's pitch standing for its computer key's column. */
  readonly song: Song;
  /** The stand-in pitch of each physical key the line uses. */
  readonly columns: ReadonlyMap<string, number>;
  /** Each note's real pitch, by note id: what the keys and the grades speak in. */
  readonly realPitch: ReadonlyMap<string, number>;
}

/**
 * The line as the piano lane draws it, one column a computer key: a note keeps its timing,
 * its pitch becomes its key's column, its finger and hand the touch-typing ones. Notes without
 * a token are left out. Several keys may play one pitch, so the real pitch cannot be the column.
 */
export function laneSong(song: Song, tokens: readonly GeneratedToken[]): LaneSong {
  const byNote = new Map(tokens.map((token) => [token.noteId, token]));
  const columns = new Map<string, number>();
  const notes: SongNote[] = [];
  const realPitch = new Map<string, number>();
  for (const note of song.notes) {
    const token = byNote.get(note.id);
    if (!token) continue;
    const key = token.input.physicalKey;
    const pitch = columns.get(key) ?? FIRST_COLUMN + columns.size;
    columns.set(key, pitch);
    realPitch.set(note.id, note.pitch);
    const typing = typingFinger(key);
    notes.push({
      id: note.id,
      pitch,
      start: note.start,
      duration: note.duration,
      startBeat: note.startBeat,
      hand: typing?.hand ?? note.hand,
      ...(typing ? { finger: typing.finger } : {})
    });
  }
  return {
    song: {
      title: song.title,
      source: "midi",
      notes,
      beats: song.beats,
      measures: song.measures,
      duration: song.duration
    },
    columns,
    realPitch
  };
}
