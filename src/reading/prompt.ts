import type { ReadingTask } from "./types";

export interface ReadingPrompt {
  readonly musicXml: string;
  /** Cursor position inside the prompt, not a replacement for song time. */
  readonly beat: number;
}

/** Select a source note or its four-note phrase without changing source note ids. */
export function readingPromptXml(xml: string, task: ReadingTask, index: number): ReadingPrompt {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid reading MusicXML");
  const part = document.querySelector("score-partwise > part");
  if (!part) throw new Error("Reading score requires a part");
  const notes = Array.from(part.querySelectorAll("measure > note"));
  if (!Number.isInteger(index) || index < 0 || index >= notes.length) {
    throw new RangeError("Reading prompt index is outside the score");
  }
  const count = task === "phrases" ? 4 : 1;
  const start = task === "phrases" ? Math.floor(index / 4) * 4 : index;
  const firstAttributes = part.querySelector("measure > attributes")?.cloneNode(true);
  const firstDirection = part.querySelector("measure > direction")?.cloneNode(true);
  notes.forEach((note, noteIndex) => {
    if (noteIndex < start || noteIndex >= start + count) note.remove();
  });
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    if (!measure.querySelector(":scope > note")) measure.remove();
  }
  const firstMeasure = part.querySelector(":scope > measure");
  if (firstMeasure) {
    if (!firstMeasure.querySelector(":scope > direction") && firstDirection) {
      firstMeasure.prepend(firstDirection);
    }
    if (!firstMeasure.querySelector(":scope > attributes") && firstAttributes) {
      firstMeasure.prepend(firstAttributes);
    }
    if (count === 1) firstMeasure.setAttribute("implicit", "yes");
  }
  return { musicXml: new XMLSerializer().serializeToString(document), beat: index - start };
}
