import { strFromU8, unzipSync } from "fflate";

import type { Finger, Hand } from "../fingering/fingering";
import { handByPitch, sortNotes } from "./song";
import type { Song, SongNote } from "./song";

const DEFAULT_TEMPO_BPM = 120;

const STEP_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

/** `.mxl` is a zip whose container.xml names the score inside it. */
export function musicXmlFromMxl(data: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(data));
  const container = files["META-INF/container.xml"];
  const rootPath = container
    ? /full-path="([^"]+)"/.exec(strFromU8(container))?.[1]
    : Object.keys(files).find(
        (path) => !path.startsWith("META-INF/") && /\.(xml|musicxml)$/.test(path)
      );
  const root = rootPath ? files[rootPath] : undefined;
  if (!root) throw new Error("В архиве .mxl не найдена партитура");
  return strFromU8(root);
}

function childText(element: Element, selector: string): string | undefined {
  return element.querySelector(`:scope > ${selector}`)?.textContent.trim() ?? undefined;
}

function childNumber(element: Element, selector: string): number | undefined {
  const text = childText(element, selector);
  if (text === undefined || text === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function pitchOf(note: Element): number | undefined {
  const pitch = note.querySelector(":scope > pitch");
  if (!pitch) return undefined;
  const step = STEP_SEMITONES[childText(pitch, "step") ?? ""];
  const octave = childNumber(pitch, "octave");
  if (step === undefined || octave === undefined) return undefined;
  return (octave + 1) * 12 + step + Math.round(childNumber(pitch, "alter") ?? 0);
}

function fingerOf(note: Element): Finger | undefined {
  // "3-1" is a finger substitution; the note is struck with the first one.
  const text = note.querySelector(":scope > notations > technical > fingering")?.textContent ?? "";
  const digit = Number(/[1-5]/.exec(text)?.[0]);
  return digit >= 1 && digit <= 5 ? (digit as Finger) : undefined;
}

interface TempoMark {
  readonly beat: number;
  readonly bpm: number;
}

/** Seconds at a beat, walking the tempo marks in order. */
function beatToSeconds(beat: number, marks: readonly TempoMark[]): number {
  let seconds = 0;
  let fromBeat = 0;
  let bpm = DEFAULT_TEMPO_BPM;
  for (const mark of marks) {
    if (mark.beat >= beat) break;
    seconds += ((mark.beat - fromBeat) * 60) / bpm;
    fromBeat = mark.beat;
    bpm = mark.bpm;
  }
  return seconds + ((beat - fromBeat) * 60) / bpm;
}

interface RawNote {
  id: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  hand: Hand;
  scoreFinger?: Finger;
}

/**
 * Reads a partwise MusicXML score into notes. Repeats are played once, as
 * written; grace and cue notes are skipped, tied notes are merged.
 */
export function songFromMusicXml(xml: string, fallbackTitle: string): Song {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Файл не похож на MusicXML");
  const score = document.querySelector("score-partwise");
  if (!score) throw new Error("Поддерживается только MusicXML в виде score-partwise");

  const title =
    score.querySelector(":scope > work > work-title")?.textContent.trim() ??
    score.querySelector(":scope > movement-title")?.textContent.trim() ??
    fallbackTitle;

  const parts = Array.from(score.querySelectorAll(":scope > part"));
  const tempoMarks: TempoMark[] = [];
  const raw: RawNote[] = [];

  parts.forEach((part, partIndex) => {
    let divisions = 1;
    let staves = 1;
    let measureStart = 0;
    let lastChordStart = 0;
    // Open ties by staff and pitch: the next note with a tie stop extends them.
    const openTies = new Map<string, RawNote>();

    const handFor = (staff: number, pitch: number): Hand => {
      if (staves >= 2) return staff >= 2 ? "left" : "right";
      if (parts.length >= 2) return partIndex === 0 ? "right" : "left";
      return handByPitch(pitch);
    };

    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      let position = 0;
      let measureLength = 0;
      for (const element of Array.from(measure.children)) {
        switch (element.tagName) {
          case "attributes": {
            divisions = childNumber(element, "divisions") ?? divisions;
            staves = childNumber(element, "staves") ?? staves;
            break;
          }
          case "backup": {
            position -= childNumber(element, "duration") ?? 0;
            break;
          }
          case "forward": {
            position += childNumber(element, "duration") ?? 0;
            break;
          }
          case "direction":
          case "sound": {
            const sound = element.tagName === "sound" ? element : element.querySelector("sound");
            const tempo = Number(sound?.getAttribute("tempo"));
            if (partIndex === 0 && tempo > 0) {
              tempoMarks.push({ beat: measureStart + position / divisions, bpm: tempo });
            }
            break;
          }
          case "note": {
            if (element.querySelector(":scope > grace, :scope > cue")) break;
            const duration = childNumber(element, "duration") ?? 0;
            const isChord = element.querySelector(":scope > chord") !== null;
            const start = isChord ? lastChordStart : position;
            if (!isChord) {
              lastChordStart = position;
              position += duration;
            }
            const pitch = pitchOf(element);
            if (pitch !== undefined) {
              const staff = childNumber(element, "staff") ?? 1;
              const tieKey = `${String(staff)}:${String(pitch)}`;
              const ties = Array.from(element.querySelectorAll(":scope > tie")).map((tie) =>
                tie.getAttribute("type")
              );
              const continued = ties.includes("stop") ? openTies.get(tieKey) : undefined;
              if (continued) {
                continued.durationBeats += duration / divisions;
                if (!ties.includes("start")) openTies.delete(tieKey);
              } else {
                const scoreFinger = fingerOf(element);
                const note: RawNote = {
                  id: `p${String(partIndex)}n${String(raw.length)}`,
                  pitch,
                  startBeat: measureStart + start / divisions,
                  durationBeats: duration / divisions,
                  hand: handFor(staff, pitch),
                  ...(scoreFinger === undefined ? {} : { scoreFinger })
                };
                raw.push(note);
                if (ties.includes("start")) openTies.set(tieKey, note);
              }
            }
            break;
          }
          default:
            break;
        }
        measureLength = Math.max(measureLength, position);
      }
      measureStart += measureLength / divisions;
    }
  });

  tempoMarks.sort((a, b) => a.beat - b.beat);
  const notes: SongNote[] = raw.map((note) => {
    const start = beatToSeconds(note.startBeat, tempoMarks);
    return {
      id: note.id,
      pitch: note.pitch,
      start,
      duration: beatToSeconds(note.startBeat + note.durationBeats, tempoMarks) - start,
      startBeat: note.startBeat,
      hand: note.hand,
      ...(note.scoreFinger === undefined ? {} : { scoreFinger: note.scoreFinger })
    };
  });
  sortNotes(notes);
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return { title: title || fallbackTitle, source: "musicxml", notes, duration, musicXml: xml };
}
