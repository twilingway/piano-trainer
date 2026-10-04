import type { Song, SongNote } from "../song/song";
import { keyColumn } from "./keyboardRows";
import { typingFinger } from "./touchTyping";
import type { GeneratedToken } from "./types";

export interface LaneSong {
  /** The line with each note's pitch standing for its computer key's column. */
  readonly song: Song;
  /** Each note's real pitch, by note id: what the keys and the grades speak in. */
  readonly realPitch: ReadonlyMap<string, number>;
}

/**
 * The line as the falling notes draw it, one column a computer key: a note keeps its timing,
 * its pitch becomes its key's column, its finger and hand the touch-typing ones. Notes without
 * a token (the accompaniment) are left out. Several keys may play one pitch, so the real pitch
 * cannot be the column; it is kept by note, and the score stays for the notes' written places.
 */
export function laneSong(song: Song, tokens: readonly GeneratedToken[]): LaneSong {
  const byNote = new Map(tokens.map((token) => [token.noteId, token]));
  const notes: SongNote[] = [];
  const realPitch = new Map<string, number>();
  for (const note of song.notes) {
    const token = byNote.get(note.id);
    const key = token?.input.physicalKey ?? "";
    const pitch = keyColumn(key);
    if (pitch === undefined) continue;
    realPitch.set(note.id, note.pitch);
    const typing = typingFinger(key);
    notes.push({
      id: note.id,
      pitch,
      start: note.start,
      duration: note.duration,
      startBeat: note.startBeat,
      ...(note.sourceIndex === undefined ? {} : { sourceIndex: note.sourceIndex }),
      hand: typing?.hand ?? note.hand,
      ...(typing ? { finger: typing.finger } : {})
    });
  }
  return {
    song: { ...song, notes },
    realPitch
  };
}
