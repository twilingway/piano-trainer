import type { Finger, Hand } from "../fingering/fingering";
import { withFingering, type Song, type SongNote } from "../song/song";

/** A recommendation, never a measurement of the player's physical finger. */
export interface LessonFingerCue {
  readonly noteId: string;
  readonly pitch: number;
  readonly hand: Hand;
  readonly recommendedFinger: Finger;
}

const FIVE_NOTES = [0, 2, 4, 5, 7];
const cachedCues = new WeakMap<SongNote, LessonFingerCue>();
export const NO_FINGER_CUES: readonly LessonFingerCue[] = [];

/** Prepare once: accepted five-note positions pin the existing fingering solver. */
export function withLessonFingering(song: Song): Song {
  const fixed = new Map<string, Finger>();
  for (const note of song.notes) {
    const index = FIVE_NOTES.indexOf(note.pitch - (note.hand === "left" ? 48 : 60));
    if (index >= 0 && note.scoreFinger === undefined)
      fixed.set(note.id, (note.hand === "left" ? 5 - index : index + 1) as Finger);
  }
  return withFingering(song, fixed);
}

/** The caller supplies only already-authorized notes; pitch never replaces note identity. */
export function lessonFingerCues(notes: readonly SongNote[]): readonly LessonFingerCue[] {
  if (notes.length === 0) return NO_FINGER_CUES;
  const cues: LessonFingerCue[] = [];
  for (const note of notes) {
    if (note.finger === undefined) continue;
    let cue = cachedCues.get(note);
    if (!cue) {
      cue = { noteId: note.id, pitch: note.pitch, hand: note.hand, recommendedFinger: note.finger };
      cachedCues.set(note, cue);
    }
    cues.push(cue);
  }
  return cues;
}

/** A display-only pass on the complete source, before a prompt removes unrelated notes. */
export function musicXmlWithLessonFingerCues(
  xml: string,
  cues: readonly LessonFingerCue[],
  sourceNotes: readonly SongNote[],
  label: (cue: LessonFingerCue) => string
): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid lesson MusicXML");
  const elements = Array.from(document.querySelectorAll("part > measure > note"));
  for (const previous of document.querySelectorAll('[data-lesson-finger-cue="true"]'))
    previous.remove();
  for (const cue of cues) {
    const source = sourceNotes.find((note) => note.id === cue.noteId && note.hand === cue.hand);
    const element =
      elements.find((note) => note.getAttribute("id") === cue.noteId) ??
      (source?.sourceIndex === undefined ? undefined : elements[source.sourceIndex]);
    if (!element || source?.pitch !== cue.pitch || element.getAttribute("print-object") === "no")
      continue;
    const lyric = document.createElement("lyric");
    lyric.setAttribute("number", "lesson-finger");
    lyric.setAttribute("data-lesson-finger-cue", "true");
    const text = document.createElement("text");
    text.textContent = label(cue);
    lyric.append(text);
    element.append(lyric);
  }
  return new XMLSerializer().serializeToString(document);
}
