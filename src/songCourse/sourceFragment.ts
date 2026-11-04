import { parseCourseXml } from "./sourceIdentity";
import type { SongCourseSource } from "./model";

interface XmlEvent {
  readonly note: Element;
  readonly start: number;
  readonly duration: number;
  readonly chord: boolean;
}
const textNumber = (element: Element, tag: string, fallback: number) =>
  Number(element.querySelector(`:scope > ${tag}`)?.textContent ?? fallback);

function eventsOf(measure: Element, divisions: number): readonly XmlEvent[] {
  const events: XmlEvent[] = [];
  let position = 0;
  let chordStart = 0;
  for (const child of Array.from(measure.children)) {
    if (child.tagName === "backup") position -= textNumber(child, "duration", 0) / divisions;
    if (child.tagName === "forward") position += textNumber(child, "duration", 0) / divisions;
    if (child.tagName !== "note") continue;
    const duration = textNumber(child, "duration", 0) / divisions;
    const chord = !!child.querySelector(":scope > chord");
    const start = chord ? chordStart : position;
    if (!chord) {
      chordStart = start;
      position += duration;
    }
    events.push({ note: child, start, duration, chord });
  }
  return events;
}

function makeRest(document: Document, note: Element): void {
  for (const child of Array.from(note.children)) {
    if (
      ["pitch", "chord", "notations", "tie", "stem", "accidental", "beam", "lyric"].includes(
        child.tagName
      )
    )
      child.remove();
  }
  note.insertBefore(document.createElement("rest"), note.firstChild);
}

function setDuration(document: Document, note: Element, beats: number, divisions: number): void {
  const duration = note.querySelector(":scope > duration");
  if (duration) duration.textContent = String(Math.round(beats * divisions));
  const shapes: Readonly<Record<string, readonly [string, boolean]>> = {
    "4": ["whole", false],
    "3": ["half", true],
    "2": ["half", false],
    "1.5": ["quarter", true],
    "1": ["quarter", false],
    "0.5": ["eighth", false],
    "0.25": ["16th", false]
  };
  const shape = shapes[String(beats)];
  if (!shape) throw new Error("song-course-unsupported-cut-duration");
  const type = note.querySelector(":scope > type");
  if (type) type.textContent = shape[0];
  for (const dot of Array.from(note.querySelectorAll(":scope > dot"))) dot.remove();
  if (shape[1]) note.insertBefore(document.createElement("dot"), type?.nextSibling ?? null);
  if (beats === 4) note.querySelector(":scope > stem")?.remove();
}

/** Rebuilds timing commands from the XML events; pitches/fingers/IDs remain score-owned. */
export function fragmentCourseXml(
  source: SongCourseSource,
  selected: ReadonlySet<string>,
  fromMeasure: number,
  toMeasure: number,
  firstOffset: number,
  lastEnd: number
): string {
  const document = parseCourseXml(source.musicXml);
  for (const part of Array.from(document.querySelectorAll("score-partwise > part"))) {
    const learner = source.learnerPartIds.includes(part.getAttribute("id") ?? "");
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    let divisions = 1;
    let inherited: Element | undefined;
    let tempo: Element | undefined;
    let localIndex = 0;
    for (const [index, measure] of measures.entries()) {
      const attributes = measure.querySelector(":scope > attributes");
      if (attributes) {
        inherited = attributes.cloneNode(true) as Element;
        divisions = textNumber(attributes, "divisions", divisions);
      }
      const direction = Array.from(measure.querySelectorAll(":scope > direction")).find((value) =>
        value.querySelector("sound[tempo]")
      );
      if (direction) tempo = direction.cloneNode(true) as Element;
      if (index < fromMeasure || index >= toMeasure) {
        measure.remove();
        continue;
      }
      const low = index === fromMeasure ? firstOffset : 0;
      const high = index === toMeasure - 1 ? lastEnd : Infinity;
      const events = eventsOf(measure, divisions);
      const headers = Array.from(measure.children).filter(
        (child) => !["note", "backup", "forward", "barline"].includes(child.tagName)
      );
      measure.replaceChildren(...headers);
      if (localIndex === 0) {
        if (!attributes && inherited)
          measure.insertBefore(inherited.cloneNode(true), measure.firstChild);
        if (!direction && tempo) measure.appendChild(tempo.cloneNode(true));
      }
      measure.setAttribute("number", String(++localIndex));
      let cursor = 0;
      let chordStart = -Infinity;
      for (const event of events) {
        const start = Math.max(low, event.start);
        const end = Math.min(high, event.start + event.duration);
        if (end <= start + 1e-9) continue;
        const note = event.note.cloneNode(true) as Element;
        if (
          learner &&
          !selected.has(note.getAttribute("id") ?? "") &&
          note.querySelector(":scope > pitch")
        )
          makeRest(document, note);
        const relativeStart = start - low;
        const attachChord =
          event.chord &&
          Math.abs(chordStart - relativeStart) < 1e-9 &&
          !!note.querySelector(":scope > chord");
        if (!attachChord) {
          note.querySelector(":scope > chord")?.remove();
          const delta = relativeStart - cursor;
          if (Math.abs(delta) > 1e-9) {
            const move = document.createElement(delta > 0 ? "forward" : "backup");
            const duration = document.createElement("duration");
            duration.textContent = String(Math.round(Math.abs(delta) * divisions));
            move.appendChild(duration);
            measure.appendChild(move);
          }
          cursor = relativeStart + end - start;
          chordStart = relativeStart;
        }
        if (Math.abs(end - start - event.duration) > 1e-9)
          setDuration(document, note, end - start, divisions);
        measure.appendChild(note);
      }
      if (index === toMeasure - 1) {
        const barline = document.createElement("barline");
        barline.setAttribute("location", "right");
        const style = document.createElement("bar-style");
        style.textContent = "light-heavy";
        barline.appendChild(style);
        measure.appendChild(barline);
      }
    }
  }
  return new XMLSerializer().serializeToString(document);
}
