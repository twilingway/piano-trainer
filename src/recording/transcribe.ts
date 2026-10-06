import { DIVISIONS, measuresUntil, writeScore } from "../song/scoreWriter";
import type { WrittenNote } from "../song/scoreWriter";
import { handByPitch, quartersAt } from "../song/song";
import type { Song } from "../song/song";
import type { Grade, TakeReview } from "./compare";
import type { PlayedNote, Take } from "./take";

/*
 * A take written out as a score: every key where it fell on the song's beat
 * grid and for as long as it was held, rounded to sixteenths, laid out in the
 * original's measures so the two staves can be read against each other.
 * One voice per hand: a key held into the next onset is shown up to it.
 */

export type TranscribedGrade = Grade | "extra";

export interface Transcription {
  readonly musicXml: string;
  /** Grade of each written note by `${quarters}:${pitch}` of its first head. */
  readonly grades: ReadonlyMap<string, TranscribedGrade>;
}

interface Placed extends WrittenNote {
  readonly grade: TranscribedGrade;
}

/** Where each key goes on the grid, and which staff and grade it gets. */
function place(song: Song, take: Take, review: TakeReview): Placed[] {
  const owedBy = new Map<PlayedNote, TakeReview["notes"][number]>();
  for (const item of review.notes) if (item.played) owedBy.set(item.played, item);
  return take.notes.map((played) => {
    const owed = owedBy.get(played);
    let startQ = quartersAt(song, played.start);
    let endQ = quartersAt(song, played.end);
    if (take.mode === "wait") {
      // The song stood still while the key was found: its place is the note it answered,
      // its length the time the finger really held it, at the song's tempo there.
      if (owed) startQ = owed.note.startBeat;
      const perSecond = quartersAt(song, played.start + 1) - quartersAt(song, played.start);
      endQ = startQ + (played.realEnd - played.realStart) * take.speed * perSecond;
    }
    const start = Math.round(startQ * DIVISIONS);
    const end = Math.max(start + 1, Math.round(endQ * DIVISIONS));
    const hand = owed?.note.hand ?? handByPitch(played.pitch);
    return {
      pitch: played.pitch,
      start,
      end,
      staff: hand === "right" ? 1 : 2,
      grade: owed ? owed.grade : "extra"
    };
  });
}

export function transcribeTake(song: Song, take: Take, review: TakeReview): Transcription {
  const placed = place(song, take, review);
  const lastEnd = placed.reduce((end, note) => Math.max(end, note.end), 0);
  const grades = new Map<string, TranscribedGrade>();
  for (const note of placed) {
    // Of a chord cut short to one voice, every key keeps its own grade under its own pitch.
    grades.set(`${String(note.start / DIVISIONS)}:${String(note.pitch)}`, note.grade);
  }
  const { musicXml } = writeScore(placed, {
    title: `${song.title} — дубль`,
    measures: measuresUntil(song.measures, lastEnd),
    fifths: 0
  });
  return { musicXml, grades };
}
