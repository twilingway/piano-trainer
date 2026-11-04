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
