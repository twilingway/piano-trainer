import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

/** Later tempo marks share the vertical shift but not the horizontal one, so keep them above. */
export function hasCompactInitialTempo(musicXml: string): boolean {
  const doc = new DOMParser().parseFromString(musicXml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return false;
  const marks = [...doc.querySelectorAll("*")].filter(
    (element) => element.localName === "metronome"
  );
  if (marks.length !== 1) return false;
  let direction = marks[0]?.parentElement ?? null;
  while (direction && direction.localName !== "direction") direction = direction.parentElement;
  if (!direction) return false;
  const measure = direction.parentElement;
  if (measure?.localName !== "measure") return false;
  const offset = [...direction.children].find((element) => element.localName === "offset");
  if (offset && Number(offset.textContent) !== 0) return false;
  // Be conservative when a voice has already advanced, even if a later backup returns to zero.
  for (const element of measure.children) {
    if (element === direction) break;
    if (["note", "forward"].includes(element.localName)) return false;
  }
  const part = measure.parentElement;
  return (
    part?.localName === "part" &&
    [...part.children].find((element) => element.localName === "measure") === measure
  );
}

/** Native engraving keeps beat units and dots and also removes the unused space above. */
export function setStaffTempoLayout(osmd: OpenSheetMusicDisplay, musicXml: string): void {
  const compact = hasCompactInitialTempo(musicXml);
  osmd.EngravingRules.MetronomeMarkXShift = compact ? -13 : -6;
  osmd.EngravingRules.MetronomeMarkYShift = compact ? 4 : -1;
  if (compact) osmd.EngravingRules.PageLeftMargin += 2;
}
