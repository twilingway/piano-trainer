// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "../songCourse/catalog";
import {
  buildSongCourseMaterial,
  buildSongCourseReviewMaterial,
  learnerScoreXml
} from "../songCourse/material";
import { musicXmlWithNoteNames, songFromMusicXml } from "../song/musicxml";
import { NOTE_NAME_VERSE_PREFIX } from "../song/noteNameMarker";
import { songCourseStaffXml } from "./songCourseStaffXml";

const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("missing source");
const source = fixture;
const names = (xml: string) =>
  [
    ...new DOMParser()
      .parseFromString(xml, "application/xml")
      .querySelectorAll(`lyric[number^="${NOTE_NAME_VERSE_PREFIX}"] > text`)
  ].map((text) => text.textContent);
const ids = (xml: string) =>
  [...new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("note")].map(
    (note) => note.getAttribute("id")
  );

describe("course-only displayed note names", () => {
  it.each(["notes-c", "half", "guided-1"])(
    "names every learner note on the helped %s stage without changing its identity or music",
    (suffix) => {
      const material = buildSongCourseMaterial(source, `${source.id}/${suffix}`);
      const baseline = learnerScoreXml(material);
      const xml = songCourseStaffXml(material, "ru");
      expect(names(xml)).toHaveLength(material.expected.length);
      expect(names(xml).every((name) => ["до", "ре", "ми"].includes(name))).toBe(true);
      expect(ids(xml)).toEqual(ids(baseline));
      expect(songFromMusicXml(xml, "test").notes).toEqual(songFromMusicXml(baseline, "test").notes);
      expect(xml).not.toContain('<part id="accompaniment"');
    }
  );

  it("uses the current interface locale and adds a single label rather than stacking stale generated names", () => {
    const material = buildSongCourseMaterial(source, `${source.id}/notes-c`);
    expect(names(songCourseStaffXml(material, "ru"))).toEqual(["до", "до", "до", "до"]);
    expect(names(songCourseStaffXml(material, "en"))).toEqual(["C", "C", "C", "C"]);
    const stale = { ...material, musicXml: musicXmlWithNoteNames(material.musicXml, "ru") };
    expect(names(songCourseStaffXml(stale, "en"))).toEqual(["C", "C", "C", "C"]);
  });

  it.each(["independent-1", "performance"])(
    "removes stale generated hints on %s even when the source already carries them",
    (suffix) => {
      const material = buildSongCourseMaterial(source, `${source.id}/${suffix}`);
      const stale = { ...material, musicXml: musicXmlWithNoteNames(material.musicXml, "ru") };
      const xml = songCourseStaffXml(stale, "en");
      expect(names(xml)).toEqual([]);
      expect(ids(xml)).toEqual(ids(learnerScoreXml(material)));
      expect(songFromMusicXml(xml, "test").notes).toEqual(
        songFromMusicXml(learnerScoreXml(material), "test").notes
      );
    }
  );

  it("helps an error review with the same source-note names and IDs", () => {
    const material = buildSongCourseReviewMaterial(
      source,
      { fromMeasure: 4, toMeasure: 6, phraseIds: ["hot-cross-buns/phrase-3"] },
      "names-review"
    );
    const xml = songCourseStaffXml(material, "en");
    expect(names(xml)).toEqual(["C", "C", "C", "C", "D", "D", "D", "D"]);
    expect(ids(xml)).toEqual(ids(learnerScoreXml(material)));
  });
});
