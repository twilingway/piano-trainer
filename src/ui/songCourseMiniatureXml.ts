import type { SongCourseNode, SongCourseSource } from "../songCourse/model";
import { buildSongCourseMaterial, learnerScoreXml } from "../songCourse/material";
import { readingPromptXml } from "../reading/prompt";

const DURATION_TYPES: Readonly<Record<string, string>> = {
  quarter: "quarter",
  half: "half",
  whole: "whole",
  eighth: "eighth"
};

/** Select a representative written note; never synthesize a duration or change its octave. */
export function songCourseMiniatureXml(source: SongCourseSource, node: SongCourseNode): string {
  const material = buildSongCourseMaterial(source, node);
  const xml = learnerScoreXml(material);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const notes = [...document.querySelectorAll("part > measure > note")];
  const suffix = node.id.split("/").at(-1) ?? "";
  const type = DURATION_TYPES[suffix];
  const highest =
    node.kind === "notes"
      ? material.expected.reduce((best, note) => (note.pitch > best.pitch ? note : best))
      : undefined;
  const xmlId = highest?.sourceNoteId.split(":").slice(1).join(":");
  let index = notes.findIndex((note) =>
    xmlId
      ? note.getAttribute("id") === xmlId
      : node.kind === "duration" && suffix === "dotted"
        ? Boolean(note.querySelector(":scope > dot"))
        : node.kind === "duration" && type
          ? note.querySelector(":scope > type")?.textContent === type
          : Boolean(note.querySelector(":scope > pitch"))
  );
  if (index < 0) index = notes.findIndex((note) => note.querySelector(":scope > pitch"));
  if (index < 0) throw new Error("song-course-no-learner-notes");
  const selected = new DOMParser().parseFromString(
    readingPromptXml(xml, "notes", index).musicXml,
    "application/xml"
  );
  for (const element of selected.querySelectorAll(
    "work, movement-title, identification, direction, print, notations, lyric"
  ))
    element.remove();
  return new XMLSerializer().serializeToString(selected);
}
