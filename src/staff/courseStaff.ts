/**
 * Largest and smallest course zoom relative to the staff's ordinary size: never smaller than
 * ordinary, so a long exercise on a phone scrolls with the cursor instead of shrinking away.
 */
const MAX_COURSE_ZOOM = 3;
const MIN_COURSE_ZOOM = 1;
/** Half a notehead plus a gap, in OSMD units: the cursor stands left of the note it marks. */
const CURSOR_LEAD_UNITS = 1.4;

/**
 * The exercise as a course shows it: no tempo mark (the course sets and names its own tempo),
 * and an implicit (incomplete) measure prints no time signature. Display only — the song and
 * the session keep the source XML.
 */
export function courseStaffXml(xml: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) return xml;
  const marks = Array.from(document.querySelectorAll("direction > direction-type > metronome"));
  const implicit = document.querySelector('measure[implicit="yes"]') !== null;
  if (marks.length === 0 && !implicit) return xml;
  for (const mark of marks) {
    const direction = mark.parentElement?.parentElement;
    mark.parentElement?.remove();
    // A direction must keep a direction-type; one left with only its sound goes too.
    if (direction && !direction.querySelector(":scope > direction-type")) direction.remove();
  }
  if (implicit) {
    for (const time of Array.from(document.querySelectorAll("attributes > time"))) {
      time.setAttribute("print-object", "no");
    }
  }
  return new XMLSerializer().serializeToString(document);
}

/** The zoom factor that makes a line fill the room it is given without scrolling sideways. */
export function courseStaffZoom(
  line: { readonly width: number; readonly height: number },
  room: { readonly width: number; readonly height: number }
): number {
  if (!(line.width > 0 && line.height > 0 && room.width > 0 && room.height > 0)) return 1;
  const fit = Math.min(room.width / line.width, room.height / line.height);
  return Math.min(MAX_COURSE_ZOOM, Math.max(MIN_COURSE_ZOOM, fit));
}

/** One position needs no cursor; otherwise the cursor leads the notehead by `offsetX` pixels. */
export function courseCursor(
  positions: number,
  unitPx: number
): { readonly hidden: boolean; readonly offsetX: number } {
  return { hidden: positions <= 1, offsetX: -CURSOR_LEAD_UNITS * unitPx };
}
