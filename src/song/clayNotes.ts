export const CLAY_NOTES = {
  C: { name: "до", asset: "do", color: "#ff7b80" },
  D: { name: "ре", asset: "re", color: "#ffb84d" },
  E: { name: "ми", asset: "mi", color: "#bfdc59" },
  F: { name: "фа", asset: "fa", color: "#64cfc3" },
  G: { name: "соль", asset: "sol", color: "#70bcef" },
  A: { name: "ля", asset: "la", color: "#c58ee7" },
  B: { name: "си", asset: "si", color: "#ed83b8" }
} as const;
export type ClayNoteStep = keyof typeof CLAY_NOTES;
export function clayNoteStep(value: string): ClayNoteStep | undefined {
  return Object.hasOwn(CLAY_NOTES, value) ? (value as ClayNoteStep) : undefined;
}
export function clayStepForPitch(pitch: number): ClayNoteStep | undefined {
  return ({ 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" } as const)[
    (((pitch % 12) + 12) % 12) as 0 | 2 | 4 | 5 | 7 | 9 | 11
  ];
}
/** Map the parser's full-score source index to an unambiguous XML id, not a runtime song id. */
export function claySourceNoteIds(xml: string | undefined): ReadonlyMap<number, string> {
  const result = new Map<number, string>();
  if (!xml) return result;
  try {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (
      document.querySelector("parsererror") ||
      document.documentElement.localName !== "score-partwise"
    )
      return result;
    const notes = [...document.querySelectorAll("note")];
    const counts = new Map<string, number>();
    for (const note of notes) {
      if (note.id) counts.set(note.id, (counts.get(note.id) ?? 0) + 1);
    }
    notes.forEach((note, index) => {
      if (note.id && counts.get(note.id) === 1) result.set(index, note.id);
    });
  } catch {
    // Malformed inputs cannot grant a colour hint.
  }
  return result;
}
/** A display-only pass; a named hint may colour only its explicitly revealed source note. */
export function musicXmlWithClayColors(xml: string, noteId?: string): string {
  try {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (
      document.querySelector("parsererror") ||
      document.documentElement.localName !== "score-partwise"
    )
      return xml;
    for (const note of document.querySelectorAll("note")) {
      if (noteId !== undefined && note.id !== noteId) continue;
      const step = clayNoteStep(note.querySelector("pitch > step")?.textContent.trim() ?? "");
      if (!step || note.querySelector("rest")) continue;
      const color = CLAY_NOTES[step].color;
      note.setAttribute("color", color);
      const head = note.querySelector("notehead");
      if (head) head.setAttribute("color", color);
    }
    return new XMLSerializer().serializeToString(document);
  } catch {
    return xml;
  }
}
