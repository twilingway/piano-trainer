import type { Song } from "../song/song";
import type { CourseMaterial } from "./model";

/** Every example sounds exactly the displayed learner notes, at their written octave. */
export function songCourseDemoSong(material: CourseMaterial): Song {
  const wanted = new Set(material.expected.map((note) => note.runtimeNoteId));
  return { ...material.song, notes: material.song.notes.filter((note) => wanted.has(note.id)) };
}
