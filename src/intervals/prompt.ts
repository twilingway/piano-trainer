import type { IntervalNoteRole } from "./types";

/** A source-score pass keeps both current notes and their original IDs. */
export function intervalPromptXml(
  xml: string,
  pairIndex: number,
  noteRole: IntervalNoteRole = 0
): { readonly musicXml: string; readonly beat: number } {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid interval MusicXML");
  const part = document.querySelector("score-partwise > part");
  if (!part) throw new Error("Interval score requires a part");
  const notes = Array.from(part.querySelectorAll("measure > note"));
  const start = pairIndex * 2;
  if (
    !Number.isInteger(pairIndex) ||
    pairIndex < 0 ||
    start + 1 >= notes.length ||
    ![0, 1].includes(noteRole)
  )
    throw new RangeError("Interval prompt is outside the score");
  const attributes = part.querySelector("measure > attributes")?.cloneNode(true);
  const direction = part.querySelector("measure > direction")?.cloneNode(true);
  notes.forEach((note, index) => {
    if (index < start || index > start + 1) note.remove();
  });
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    if (!measure.querySelector(":scope > note")) measure.remove();
  }
  const first = part.querySelector(":scope > measure");
  if (first) {
    if (!first.querySelector(":scope > direction") && direction) first.prepend(direction);
    if (!first.querySelector(":scope > attributes") && attributes) first.prepend(attributes);
    first.setAttribute("implicit", "yes");
  }
  return { musicXml: new XMLSerializer().serializeToString(document), beat: noteRole };
}
