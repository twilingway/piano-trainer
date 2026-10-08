// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildCourseCatalog } from "./catalog";

const XML = `<score-partwise><part-list><score-part id="p"><part-name>Piano</part-name></score-part></part-list><part id="p"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note></measure></part></score-partwise>`;
const files = { "/local-lessons/.course/prepared/phrase.musicxml": XML };
const lesson = {
  id: "stable-01",
  number: 1,
  title: "Synthetic",
  goal: "Synthetic goal",
  reviewed: true,
  stages: ["right", "both"],
  phrases: [{ id: "phrase-a", version: "1", musicXml: ".course/prepared/phrase.musicxml" }]
};
const catalog = (entry: unknown = lesson, source = files) =>
  buildCourseCatalog(JSON.stringify({ lessons: [entry] }), source);

describe("reviewed local course catalog", () => {
  it("keeps ten coming-soon cards when there is no manifest or invalid JSON", () => {
    for (const raw of [null, "{", "[]"]) {
      const lessons = buildCourseCatalog(raw, files);
      expect(lessons).toHaveLength(10);
      expect(lessons.every((item) => item.phrases.length === 0)).toBe(true);
    }
  });
  it("opens only the reviewed lesson and keeps its order and stable ids", () => {
    const lessons = catalog();
    expect(lessons[0]).toMatchObject({
      id: "stable-01",
      stages: ["right", "both"],
      phrases: [{ id: "phrase-a", musicXml: XML }]
    });
    expect(lessons.slice(1).every((item) => item.phrases.length === 0)).toBe(true);
  });
  it("does not infer readiness from a legacy title or unreviewed data", () => {
    expect(catalog({ ...lesson, reviewed: false })[0]?.phrases).toEqual([]);
    expect(buildCourseCatalog(null, files, { 1: "Legacy" })[0]).toMatchObject({
      title: "Legacy",
      phrases: []
    });
  });
  it("uses source lesson titles for coming-soon cards without enabling tasks", () => {
    const result = buildCourseCatalog(
      JSON.stringify({ lessonTitles: { "1": "  Урок 1. Вводный  " } }),
      files,
      { 1: "Legacy song" }
    );
    expect(result[0]).toMatchObject({
      id: "course-lesson-01",
      number: 1,
      title: "Урок 1. Вводный",
      stages: ["right", "left", "both"],
      phrases: []
    });
  });
  it("ignores invalid pending titles and prefers a reviewed lesson title", () => {
    const raw = JSON.stringify({
      lessonTitles: { "1": "Pending", "2": "", "3": 12, "4": null, "11": "Extra" },
      lessons: [lesson]
    });
    const result = buildCourseCatalog(raw, files, { 2: "Legacy two", 3: "Legacy three" });
    expect(result).toHaveLength(10);
    expect(result[0]?.title).toBe("Synthetic");
    expect(result[1]?.title).toBe("Legacy two");
    expect(result[2]?.title).toBe("Legacy three");
    expect(result[3]?.title).toBe("Урок {number}");
    expect(buildCourseCatalog('{"lessonTitles":[]}', files)[0]?.title).toBe("Урок {number}");
  });
  it.each([
    "../phrase.musicxml",
    "/.course/prepared/phrase.musicxml",
    "C:/phrase.musicxml",
    "prepared\\phrase.musicxml",
    "prepared/./phrase.musicxml",
    "missing.musicxml",
    "https://site/phrase.musicxml"
  ])("rejects an unsafe or absent path: %s", (musicXml) => {
    expect(
      catalog({ ...lesson, phrases: [{ ...lesson.phrases[0], musicXml }] })[0]?.phrases
    ).toEqual([]);
  });
  it.each([
    "<broken>",
    "<score-partwise><part-list/></score-partwise>",
    XML.replaceAll("<pitch>", "<rest/><unused>").replaceAll("</pitch>", "</unused>")
  ])("rejects unreadable or empty music", (musicXml) => {
    expect(
      catalog(lesson, { "/local-lessons/.course/prepared/phrase.musicxml": musicXml })[0]?.phrases
    ).toEqual([]);
  });
  it("rejects duplicated ids/numbers, phrase ids and wrong stage orders", () => {
    expect(
      buildCourseCatalog(
        JSON.stringify({ lessons: [lesson, { ...lesson, id: "other" }] }),
        files
      )[0]?.phrases
    ).toEqual([]);
    expect(
      catalog({ ...lesson, phrases: [lesson.phrases[0], lesson.phrases[0]] })[0]?.phrases
    ).toEqual([]);
    expect(catalog({ ...lesson, stages: ["both", "right"] })[0]?.phrases).toEqual([]);
  });
  it("rejects a stage whose required hand is absent", () => {
    expect(
      catalog(lesson, {
        "/local-lessons/.course/prepared/phrase.musicxml": XML.replace(
          "<staff>2</staff>",
          "<staff>1</staff>"
        )
      })[0]?.phrases
    ).toEqual([]);
  });
});
