import { musicXmlWithFingering } from "../song/musicxml";
import { withFingering } from "../song/song";
import { songToMidi } from "../song/songMidi";
import { lessonSong } from "./lessons";
import type { LessonChoice } from "./lessons";
import { loadOverrides } from "./useSong";

export type LessonExportFormat = "musicxml" | "midi";

const EXTENSIONS: Readonly<Record<LessonExportFormat, string>> = {
  musicxml: ".musicxml",
  midi: ".mid"
};

/** Characters no file system takes in a name, and control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * A lesson level as a file to save: the score with the fingers the trainer
 * shows for it, the player's corrections included, or its notes as MIDI.
 * The level is taken in the key it is written in.
 */
export function lessonExportFile(
  choice: LessonChoice,
  format: LessonExportFormat
): { name: string; data: string | Uint8Array } {
  const song = lessonSong(choice);
  const fingered = withFingering(song, loadOverrides(song));
  const name = song.title.replace(UNSAFE_NAME, "-") + EXTENSIONS[format];
  if (format === "midi") return { name, data: songToMidi(fingered) };
  return { name, data: musicXmlWithFingering(song.musicXml ?? "", fingered.notes) };
}
