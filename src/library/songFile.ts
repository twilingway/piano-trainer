import { songFromMidi } from "../song/midi";
import { musicXmlFromMxl, songFromMusicXml } from "../song/musicxml";
import type { Song } from "../song/song";

/** File names the trainer can read as a song. */
export const SONG_FILE_PATTERN = /\.(mid|midi|musicxml|xml|mxl)$/i;

export function isSongFile(fileName: string): boolean {
  return SONG_FILE_PATTERN.test(fileName);
}

/** "My Song.musicxml" -> "My Song": the title a song gets when its score names none. */
export function titleOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

/** A song from a file's bytes, by its extension: MIDI, compressed MusicXML, or MusicXML. */
export function songFromFileData(fileName: string, data: ArrayBuffer): Song {
  const name = fileName.toLowerCase();
  const title = titleOf(fileName);
  if (name.endsWith(".mid") || name.endsWith(".midi")) return songFromMidi(data, title);
  if (name.endsWith(".mxl")) return songFromMusicXml(musicXmlFromMxl(data), title);
  if (name.endsWith(".xml") || name.endsWith(".musicxml")) {
    return songFromMusicXml(new TextDecoder().decode(data), title);
  }
  throw new Error("Нужен файл .mid, .musicxml, .xml или .mxl");
}
