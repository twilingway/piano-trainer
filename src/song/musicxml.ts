import { strFromU8, unzipSync } from "fflate";

import type { Finger, Hand } from "../fingering/fingering";
import { handByPitch, sortNotes } from "./song";
import type { Song, SongBeat, SongNote } from "./song";

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

interface MeasureInfo {
  /** Quarter notes from the start. */
  readonly start: number;
  readonly length: number;
  readonly beats: number;
  readonly beatType: number;
}

/**
 * Metronome clicks, one per beat of the time signature. A measure shorter
 * than its signature is a pickup: its clicks are counted back from its end,
 * so an eighth-note upbeat gets no click of its own.
 */
function beatGrid(measures: readonly MeasureInfo[]): { beat: number; downbeat: boolean }[] {
  const grid: { beat: number; downbeat: boolean }[] = [];
  for (const measure of measures) {
    const unit = 4 / measure.beatType;
    const nominal = unit * measure.beats;
    const end = measure.start + measure.length;
    if (measure.length + 1e-9 < nominal) {
      for (let beat = end - unit; beat >= measure.start - 1e-9; beat -= unit) {
        grid.push({ beat, downbeat: false });
      }
      continue;
    }
    for (let index = 0; measure.start + index * unit < end - 1e-9; index++) {
      grid.push({ beat: measure.start + index * unit, downbeat: index % measure.beats === 0 });
    }
  }
  return grid.sort((a, b) => a.beat - b.beat);
}

interface RawNote {
  id: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  hand: Hand;
  scoreFinger?: Finger;
  sourceIndex: number;
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
  // Every <note> by document order: how a solved finger finds its way back into the score.
  const noteOrder = new Map(Array.from(document.querySelectorAll("note")).map((el, i) => [el, i]));
  const tempoMarks: TempoMark[] = [];
  const raw: RawNote[] = [];
  const measures: MeasureInfo[] = [];

  parts.forEach((part, partIndex) => {
    let divisions = 1;
    let staves = 1;
    let measureStart = 0;
    let lastChordStart = 0;
    let timeBeats = 4;
    let beatType = 4;
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
            const time = element.querySelector(":scope > time");
            if (time) {
              timeBeats = childNumber(time, "beats") ?? timeBeats;
              beatType = childNumber(time, "beat-type") ?? beatType;
            }
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
                  sourceIndex: noteOrder.get(element) ?? -1,
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
      if (partIndex === 0) {
        measures.push({
          start: measureStart,
          length: measureLength / divisions,
          beats: timeBeats,
          beatType
        });
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
      sourceIndex: note.sourceIndex,
      ...(note.scoreFinger === undefined ? {} : { scoreFinger: note.scoreFinger })
    };
  });
  sortNotes(notes);
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  const beats: SongBeat[] = beatGrid(measures).map(({ beat, downbeat }) => ({
    time: beatToSeconds(beat, tempoMarks),
    position: beat,
    downbeat
  }));
  return {
    title: title || fallbackTitle,
    source: "musicxml",
    notes,
    beats,
    measures,
    duration,
    musicXml: xml
  };
}

/**
 * The score with every solved finger written into it as MusicXML fingering,
 * so the staff shows the same fingers as the falling notes. Fingers already
 * in the score are replaced by the solved ones, which include them anyway.
 */
export function musicXmlWithFingering(xml: string, notes: readonly SongNote[]): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const elements = Array.from(document.querySelectorAll("note"));
  for (const note of notes) {
    const element = note.sourceIndex === undefined ? undefined : elements[note.sourceIndex];
    if (!element || note.finger === undefined) continue;
    let notations = element.querySelector(":scope > notations");
    if (!notations) {
      notations = document.createElement("notations");
      // MusicXML wants <notations> before <lyric>; everything else it follows.
      element.insertBefore(notations, element.querySelector(":scope > lyric"));
    }
    let technical = notations.querySelector(":scope > technical");
    if (!technical) {
      technical = document.createElement("technical");
      notations.appendChild(technical);
    }
    technical.querySelectorAll(":scope > fingering").forEach((old) => {
      old.remove();
    });
    const fingering = document.createElement("fingering");
    fingering.textContent = String(note.finger);
    technical.appendChild(fingering);
  }
  return new XMLSerializer().serializeToString(document);
}

/**
 * The score with a new line forced every `perLine` measures, so lines hold
 * a fixed count (2, 4, 8) instead of whatever fits. A pickup measure does not
 * count: it rides on the first line in front of the first full measure.
 */
export function musicXmlWithLineBreaks(xml: string, perLine: number): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  for (const part of Array.from(document.querySelectorAll("part"))) {
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    const pickup = measures[0]?.getAttribute("implicit") === "yes" ? 1 : 0;
    measures.forEach((measure, index) => {
      const counted = index - pickup;
      if (counted <= 0 || counted % perLine !== 0) return;
      const print = document.createElement("print");
      print.setAttribute("new-system", "yes");
      measure.insertBefore(print, measure.firstChild);
    });
  }
  return new XMLSerializer().serializeToString(document);
}

export type NoteNameStyle = "ru" | "en";

const NAMES: Readonly<Record<NoteNameStyle, Readonly<Record<string, string>>>> = {
  ru: { C: "до", D: "ре", E: "ми", F: "фа", G: "соль", A: "ля", B: "си" },
  en: { C: "C", D: "D", E: "E", F: "F", G: "G", A: "A", B: "B" }
};

const ACCIDENTALS: Readonly<Record<string, string>> = { "-2": "𝄫", "-1": "♭", "1": "♯", "2": "𝄪" };

/**
 * The score with every note's name written under it as a lyric, spelled as
 * the score spells it (B flat stays B flat). Chord notes stack their names.
 */
export function musicXmlWithNoteNames(xml: string, style: NoteNameStyle): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  let stack = 0;
  for (const note of Array.from(document.querySelectorAll("note"))) {
    const pitch = note.querySelector(":scope > pitch");
    if (!pitch) continue;
    stack = note.querySelector(":scope > chord") ? stack + 1 : 1;
    const step = pitch.querySelector(":scope > step")?.textContent.trim() ?? "";
    const alter = pitch.querySelector(":scope > alter")?.textContent.trim() ?? "0";
    const name = `${NAMES[style][step] ?? step}${ACCIDENTALS[alter] ?? ""}`;
    const lyric = document.createElement("lyric");
    lyric.setAttribute("number", String(stack));
    lyric.setAttribute("placement", "below");
    const syllabic = document.createElement("syllabic");
    syllabic.textContent = "single";
    const text = document.createElement("text");
    text.textContent = name;
    lyric.append(syllabic, text);
    note.appendChild(lyric);
  }
  return new XMLSerializer().serializeToString(document);
}

export { transposeFifths } from "./keySignature";
export { transposeMusicXml } from "./transposeMusicXml";
