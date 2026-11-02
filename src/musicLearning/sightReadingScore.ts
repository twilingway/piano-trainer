import type { SightReadingExercise } from "./sightReading";
import { sightReadingAhead } from "./sightReading";

/** Display-only XML pass. The authoritative Song and its musical clock are never replaced. */
export function sightReadingAheadXml(exercise: SightReadingExercise, songBeat: number): string {
  const document = new DOMParser().parseFromString(exercise.musicXml, "application/xml");
  if (document.querySelector("parsererror")) return exercise.musicXml;
  const groups = sightReadingAhead(exercise, songBeat);
  const visible = new Set(groups.map((group) => group.index));
  const sourceGroups = new Map(
    exercise.song.notes.flatMap((note) => {
      const group = exercise.groups.find(
        (value) => note.startBeat >= value.startBeat && note.startBeat < value.endBeat
      );
      return note.sourceIndex === undefined || !group
        ? []
        : [[note.sourceIndex, group.index] as const];
    })
  );
  const tiedGroups = new Map<string, number>();
  Array.from(document.querySelectorAll("note")).forEach((note, index) => {
    const pitch = note.querySelector(":scope > pitch");
    if (!pitch) return;
    const key = `${note.querySelector(":scope > staff")?.textContent ?? ""}:${note.querySelector(":scope > voice")?.textContent ?? ""}:${pitch.textContent}`;
    const group = sourceGroups.get(index) ?? tiedGroups.get(key);
    if (note.querySelector('tie[type="start"]') && group !== undefined) tiedGroups.set(key, group);
    if (note.querySelector('tie[type="stop"]') && !note.querySelector('tie[type="start"]'))
      tiedGroups.delete(key);
    if (group === undefined || !visible.has(group)) {
      note.setAttribute("print-object", "no");
      note.setAttribute("print-spacing", "yes");
    }
  });
  return new XMLSerializer().serializeToString(document);
}
