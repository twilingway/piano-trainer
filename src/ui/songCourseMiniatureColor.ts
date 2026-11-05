import { CLAY_NOTES, clayNoteStep } from "../song/clayNotes";

/** A miniature contains one written source note; its playback ink must use that same pitch colour. */
export function songCourseMiniatureColor(xml: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const step = clayNoteStep(
    document.querySelector("part > measure > note > pitch > step")?.textContent.trim() ?? ""
  );
  return step ? CLAY_NOTES[step].color : "#70bcef";
}
