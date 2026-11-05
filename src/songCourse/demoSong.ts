import type { Song } from "../song/song";
import type { CourseMaterial } from "./model";

/** An isolated introductory example sounds exactly the learner notes, at their written octave. */
export function songCourseDemoSong(material: CourseMaterial): Song {
  if (material.node.kind !== "notes" && material.node.kind !== "duration") return material.song;
  const wanted = new Set(material.expected.map((note) => note.runtimeNoteId));
  return { ...material.song, notes: material.song.notes.filter((note) => wanted.has(note.id)) };
}
