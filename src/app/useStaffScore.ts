import { useCallback, useMemo } from "react";

import { detectChords, musicXmlWithChords } from "../song/harmony";
import {
  musicXmlWithFingering,
  musicXmlWithLineBreaks,
  musicXmlWithNoteNames
} from "../song/musicxml";
import type { Song } from "../song/song";
import type { StaffPrefs } from "./useStaffPrefs";

/**
 * The score the staff draws: the song's MusicXML with its fingers, names,
 * chords and line breaks as the prefs ask.
 */
export function useStaffScore(song: Song, baseSong: Song, staffPrefs: StaffPrefs) {
  const fixedLines = !staffPrefs.singleLine && staffPrefs.measuresPerLine > 0;
  // Harmony of the song as written: the chords over the staff and its key.
  const chords = useMemo(() => detectChords(baseSong), [baseSong]);
  const nameStyle = staffPrefs.noteNames === "off" ? undefined : staffPrefs.noteNames;
  const withNames = useCallback(
    (xml: string) => (nameStyle ? musicXmlWithNoteNames(xml, nameStyle) : xml),
    [nameStyle]
  );
  // The staff shows the same fingers as the falling notes, corrections included.
  const staffXml = useMemo(() => {
    if (!song.musicXml) return undefined;
    const named = withNames(musicXmlWithFingering(song.musicXml, song.notes));
    const fingered = staffPrefs.chords ? musicXmlWithChords(named, chords) : named;
    return fixedLines ? musicXmlWithLineBreaks(fingered, staffPrefs.measuresPerLine) : fingered;
  }, [song, fixedLines, staffPrefs.measuresPerLine, withNames, staffPrefs.chords, chords]);
  return { staffXml, fixedLines, nameStyle, withNames };
}
