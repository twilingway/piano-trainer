// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  SONG_COURSE_SOURCE_KEYS,
  SONG_COURSE_SOURCES,
  findSongCourseNode,
  findSongCourseSource
} from "../songCourse/catalog";
import { messages } from "../i18n/messages";
import { translate } from "../i18n/translate";
import { SONG_COURSE_NAVIGATION_MESSAGES } from "../i18n/songCourseNavigationMessages";
import { songCourseUiMessages } from "../i18n/songCourseUiMessages";
import { songCourseMessages } from "../i18n/songCourseMessages";
import { songFromMusicXml } from "../song/musicxml";
import { songCourseMiniatureXml } from "./songCourseMiniatureXml";

describe("source-score course miniatures", () => {
  it("keeps exactly one written learner note for every catalogue miniature", () => {
    for (const source of SONG_COURSE_SOURCES) {
      for (const node of source.nodes) {
        const document = new DOMParser().parseFromString(
          songCourseMiniatureXml(source, node),
          "application/xml"
        );
        expect(document.querySelectorAll("part > measure > note"), node.id).toHaveLength(1);
        expect(document.querySelectorAll("part > measure > note > pitch"), node.id).toHaveLength(1);
      }
    }
  });
  it.each([
    ["hot-cross-buns", "notes-c", 60, "quarter", false],
    ["hot-cross-buns", "notes-d", 62, "quarter", false],
    ["hot-cross-buns", "notes-e", 64, "half", false],
    ["aunt-rhody", "notes-f", 65, "quarter", false],
    ["twinkle", "notes-a", 69, "quarter", false],
    ["hot-cross-buns", "whole", 60, "whole", false],
    ["joy-octave", "upper-c-b", 72, "half", false],
    ["joy-octave", "dotted", 71, "quarter", true],
    ["joy-octave", "eighth", 69, "eighth", false]
  ] as const)(
    "keeps the actual pitch and written duration for %s/%s",
    (songId, suffix, pitch, type, dot) => {
      const source = findSongCourseSource(songId);
      const node = findSongCourseNode(songId, `${songId}/${suffix}`);
      if (!source || !node) throw new Error("missing fixture");
      const xml = songCourseMiniatureXml(source, node);
      const document = new DOMParser().parseFromString(xml, "application/xml");
      const note = document.querySelector("note");
      if (!note) throw new Error("missing miniature note");
      expect(document.querySelectorAll("note")).toHaveLength(1);
      expect(songFromMusicXml(xml, "miniature").notes.map((value) => value.pitch)).toEqual([pitch]);
      expect(note.querySelector("type")?.textContent).toBe(type);
      expect(Boolean(note.querySelector("dot"))).toBe(dot);
      expect(note.querySelector("stem")?.textContent).toBe(
        type === "whole" ? undefined : pitch >= 71 ? "down" : "up"
      );
      const original = new DOMParser()
        .parseFromString(source.musicXml, "application/xml")
        .getElementById(note.getAttribute("id") ?? "");
      expect(original?.querySelector("duration")?.textContent).toBe(
        note.querySelector("duration")?.textContent
      );
      expect(document.querySelector("notations, lyric, direction")).toBeNull();
      expect(document.querySelectorAll("score-partwise > part")).toHaveLength(1);
      expect(document.querySelector("clef > sign")?.textContent).toBe("G");
      expect(document.querySelector("time > beats")?.textContent).toBe("4");
      expect(document.querySelector("time > beat-type")?.textContent).toBe("4");
    }
  );
});

it("registers English for every source, course UI, navigation and runtime message", () => {
  const keys = new Set([
    ...SONG_COURSE_SOURCE_KEYS,
    ...SONG_COURSE_SOURCES.flatMap((source) => [
      source.title,
      ...source.nodes.flatMap((node) => [node.title, node.instruction])
    ]),
    ...Object.keys(SONG_COURSE_NAVIGATION_MESSAGES),
    ...Object.keys(songCourseUiMessages),
    ...Object.keys(songCourseMessages)
  ]);
  for (const key of keys) {
    expect(translate("en", messages, key), key).not.toBe(key);
    expect(translate("ru", messages, key), key).toBe(key);
  }
});
