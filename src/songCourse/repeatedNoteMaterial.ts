import { quartersAt } from "../song/song";
import type { CourseMaterial, SongCourseNode, SongCourseSource } from "./model";
import { loadSongCourseSource } from "./loader";
import { fragmentCourseXml } from "./sourceFragment";
import { parseCourseXml } from "./sourceIdentity";
import { expectedNodeRawIds } from "./nodeIdentity";

/** A bounded source-derived exercise; full source XML and its provenance are never rewritten. */
export function buildRepeatedNoteMaterial(
  source: SongCourseSource,
  node: SongCourseNode
): CourseMaterial {
  if (!node.repeat) throw new Error("song-course-missing-repeat-definition");
  const full = loadSongCourseSource(source);
  const origin = full.identities.find(
    (entry) =>
      entry.xmlId === node.repeat?.originNoteId && source.learnerPartIds.includes(entry.partId)
  );
  const note =
    origin &&
    full.song.notes.find((entry) => full.runtimeToSource.get(entry.id) === origin.canonicalId);
  const measure = origin && full.song.measures[origin.measureIndex];
  const phrase =
    origin && source.phrases.find((entry) => entry.sourceNoteIds.includes(origin.xmlId));
  if (
    !origin ||
    !note ||
    !measure ||
    !phrase ||
    Math.abs(quartersAt(full.song, note.start + note.duration) - note.startBeat - 2) > 1e-7 ||
    measure.length !== 4
  )
    throw new Error("song-course-invalid-repeat-origin");
  const ids = expectedNodeRawIds(node);
  if (ids.some((id) => full.identities.some((entry) => entry.xmlId === id)))
    throw new Error("song-course-repeat-id-collision");
  const offset = note.startBeat - measure.start;
  const document = parseCourseXml(
    fragmentCourseXml(
      source,
      new Set([origin.xmlId]),
      origin.measureIndex,
      origin.measureIndex + 1,
      offset,
      offset + 2
    )
  );
  const original = document.getElementById(origin.xmlId);
  if (!original || original.querySelector("type")?.textContent !== "half")
    throw new Error("song-course-invalid-repeat-shape");
  for (const part of Array.from(document.querySelectorAll("score-partwise > part"))) {
    const first = part.querySelector(":scope > measure");
    if (!first) throw new Error("song-course-missing-repeat-measure");
    const learner = part.getAttribute("id") === origin.partId;
    const divisions = Number(first.querySelector("attributes > divisions")?.textContent ?? 1);
    const measures = Array.from({ length: 2 }, (_, measureIndex) => {
      const copy = first.cloneNode(true) as Element;
      copy.setAttribute("number", String(measureIndex + 1));
      for (const child of Array.from(copy.children))
        if (["note", "backup", "forward", "barline"].includes(child.tagName)) child.remove();
      if (learner) {
        for (let position = 0; position < 2; position++) {
          const clone = original.cloneNode(true) as Element;
          clone.setAttribute("id", ids[measureIndex * 2 + position] ?? "");
          copy.append(clone);
        }
      } else {
        const rest = document.createElement("note");
        for (const [tag, text] of [
          ["rest", ""],
          ["duration", String(divisions * 4)],
          ["voice", "1"],
          ["type", "whole"],
          ["staff", "1"]
        ]) {
          const child = document.createElement(tag ?? "rest");
          child.textContent = text ?? "";
          rest.append(child);
        }
        copy.append(rest);
      }
      return copy;
    });
    part.replaceChildren(...measures);
  }
  const musicXml = new XMLSerializer().serializeToString(document);
  const loaded = loadSongCourseSource(source, musicXml);
  const identities = new Map(loaded.identities.map((entry) => [entry.canonicalId, entry]));
  const expected = loaded.song.notes
    .filter((entry) => entry.part === origin.partId)
    .map((entry) => {
      const sourceNoteId = loaded.runtimeToSource.get(entry.id) ?? "";
      const identity = identities.get(sourceNoteId);
      if (!identity || !ids.includes(identity.xmlId))
        throw new Error("song-course-invalid-repeat-map");
      return {
        sourceNoteId,
        runtimeNoteId: entry.id,
        pitch: entry.pitch,
        start: entry.start,
        duration: entry.duration,
        startBeat: entry.startBeat,
        phraseId: phrase.id,
        measureIndex: identity.measureIndex
      };
    });
  if (expected.length !== ids.length) throw new Error("song-course-incomplete-repeat-material");
  return {
    source,
    node,
    song: loaded.song,
    musicXml,
    expected,
    runtimeToSource: loaded.runtimeToSource,
    sourceToRuntime: loaded.sourceToRuntime
  };
}
