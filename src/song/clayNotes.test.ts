// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { CLAY_NOTES, musicXmlWithClayColors } from "./clayNotes";
import { READING_INTRO_XML } from "../reading/introduction";
import { songFromMusicXml } from "./musicxml";
const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
describe("clay notation palette", () => {
  it("preserves all musical events and source notation fields", () => {
    const after = musicXmlWithClayColors(READING_INTRO_XML);
    expect(songFromMusicXml(after, "").notes).toEqual(
      songFromMusicXml(READING_INTRO_XML, "").notes
    );
    const beforeDoc = parse(READING_INTRO_XML),
      afterDoc = parse(after);
    for (const node of afterDoc.querySelectorAll("[color]")) node.removeAttribute("color");
    expect(afterDoc.documentElement.outerHTML).toBe(beforeDoc.documentElement.outerHTML);
    expect(READING_INTRO_XML).not.toContain("color=");
  });
  it("uses the written step across octaves and accidentals, without colouring rests", () => {
    const xml = `<score-partwise><part><measure>${["C", "D", "E", "F", "G", "A", "B", "C", "D"].map((step, i) => `<note id="n${String(i)}">${i === 2 ? "<chord/>" : ""}<pitch><step>${step}</step><alter>${i === 7 ? "1" : i === 8 ? "-1" : "0"}</alter><octave>${i > 6 ? "5" : "4"}</octave></pitch><duration>2</duration><type>half</type><stem>down</stem><notehead>normal</notehead></note>`).join("")}<note><rest/><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
    const doc = parse(musicXmlWithClayColors(xml));
    const notes = [...doc.querySelectorAll("note")];
    expect(notes.map((n) => n.getAttribute("color"))).toEqual([
      ...Object.values(CLAY_NOTES).map((n) => n.color),
      CLAY_NOTES.C.color,
      CLAY_NOTES.D.color,
      null
    ]);
    expect(notes[0]?.querySelector("type")?.textContent).toBe("half");
    expect(notes[0]?.querySelector("stem")?.textContent).toBe("down");
    expect(notes[2]?.querySelector("chord")).not.toBeNull();
  });
  it("colours only the explicitly revealed note of a visible phrase", () => {
    const doc = parse(musicXmlWithClayColors(READING_INTRO_XML, "intro-E4"));
    expect([...doc.querySelectorAll("note[color]")].map((n) => n.id)).toEqual(["intro-E4"]);
  });
  it("leaves malformed or non-score input untouched", () => {
    for (const value of ["plain text", "<broken>", "<not-a-score/>"])
      expect(musicXmlWithClayColors(value)).toBe(value);
  });
});
