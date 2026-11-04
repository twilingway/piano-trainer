import type { CourseMaterial } from "../songCourse/model";
import { learnerScoreXml } from "../songCourse/material";
import { musicXmlWithNoteNames, type NoteNameStyle } from "../song/musicxml";
import { NOTE_NAME_VERSE_PREFIX } from "../song/noteNameMarker";

/** Display only: guided stages use locale names; independent stages cannot inherit stale labels. */
export function songCourseStaffXml(material: CourseMaterial, locale: NoteNameStyle): string {
  const document = new DOMParser().parseFromString(learnerScoreXml(material), "application/xml");
  for (const lyric of document.querySelectorAll(`lyric[number^="${NOTE_NAME_VERSE_PREFIX}"]`))
    lyric.remove();
  const xml = new XMLSerializer().serializeToString(document);
  const kind = material.node.kind;
  return kind === "independent-phrase" || kind === "performance"
    ? xml
    : musicXmlWithNoteNames(xml, locale);
}
