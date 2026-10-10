// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { musicXmlWithNoteNames, songFromMusicXml } from "../song/musicxml";
import { READING_INTRO_NOTES, READING_INTRO_XML } from "./introduction";

describe("five-note introduction score", () => {
  it("connects the keyboard and cursor to the five real source pitches", () => {
    const song = songFromMusicXml(READING_INTRO_XML, "");
    expect(song.notes.map((note) => note.pitch)).toEqual([60, 62, 64, 65, 67]);
    expect(song.notes.map((note) => note.start * 2)).toEqual(
      READING_INTRO_NOTES.map((note) => note.beat)
    );
    expect(song.notes.map((note) => note.pitch)).toEqual(
      READING_INTRO_NOTES.map((note) => note.pitch)
    );
    expect(song.notes.every((note) => note.hand === "right" && note.duration === 0.5)).toBe(true);
    expect(READING_INTRO_NOTES.map((note) => note.notation)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4"
    ]);
    expect(READING_INTRO_NOTES.map((note) => note.finger)).toEqual([1, 2, 3, 4, 5]);
  });

  it("retains all five notes in the actual OSMD reader", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const osmd = new OpenSheetMusicDisplay(host, { backend: "svg", autoResize: false });
    try {
      await osmd.load(READING_INTRO_XML);
      expect(
        osmd.Sheet.SourceMeasures.map(
          (measure) => measure.VerticalSourceStaffEntryContainers.length
        )
      ).toEqual([4, 1]);
    } finally {
      osmd.clear();
      host.remove();
    }
  });

  it.each(["ru", "en"] as const)("adds %s names without changing source pitches", (locale) => {
    const xml = musicXmlWithNoteNames(READING_INTRO_XML, locale);
    expect(songFromMusicXml(xml, "").notes.map((note) => note.pitch)).toEqual([60, 62, 64, 65, 67]);
    const document = new DOMParser().parseFromString(xml, "application/xml");
    expect([...document.querySelectorAll("lyric text")].map((node) => node.textContent)).toEqual(
      locale === "ru" ? ["до", "ре", "ми", "фа", "соль"] : ["C", "D", "E", "F", "G"]
    );
  });
});
