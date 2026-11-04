// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { claySourceNoteIds, musicXmlWithClayColors, CLAY_NOTES } from "./clayNotes";
import { generateReadingExercise } from "../reading/generator";
import { generateBassReadingExercise } from "../reading/bassGenerator";
import { generateBeginnerExercise } from "../beginner/generator";
import { readingPromptXml } from "../reading/prompt";

describe("reading clay source ids", () => {
  it.each([
    generateReadingExercise("phrases", 42),
    generateBassReadingExercise("phrases", 42),
    generateBeginnerExercise({ stageId: "beginner-v1-right-3", phase: "guided", seed: 1 })
  ])(
    "reveals the actual source note of later prompt groups without changing runtime ids",
    (exercise) => {
      const ids = claySourceNoteIds(exercise.musicXml);
      const note = exercise.song.notes[4];
      expect(note).toBeDefined();
      if (!note) throw new Error("Expected a fifth source note");
      const sourceId = ids.get(note.sourceIndex ?? -1);
      expect(sourceId).toBeDefined();
      expect(sourceId).not.toBe(note.id);
      const prompt = readingPromptXml(exercise.musicXml, "phrases", 4);
      const colored = musicXmlWithClayColors(prompt.musicXml, sourceId);
      const doc = new DOMParser().parseFromString(colored, "application/xml");
      expect([...doc.querySelectorAll("note[color]")].map((n) => n.id)).toEqual([sourceId]);
      const step = doc.querySelector("note[color] pitch > step")?.textContent;
      expect(doc.querySelector("note[color]")?.getAttribute("color")).toBe(
        CLAY_NOTES[step as keyof typeof CLAY_NOTES].color
      );
    }
  );
  it("counts rests and all parts exactly like MusicXML sourceIndex and rejects ambiguous ids", () => {
    const xml =
      '<score-partwise><part><measure><note id="rest"><rest/></note><note id="a"><pitch/></note><note id="dup"/></measure></part><part><measure><note id="b"/><note id="dup"/><note/></measure></part></score-partwise>';
    expect([...claySourceNoteIds(xml)]).toEqual([
      [0, "rest"],
      [1, "a"],
      [3, "b"]
    ]);
  });
  it("fails closed for missing, malformed or non-score input", () => {
    for (const xml of [undefined, "plain", "<broken>", "<other/>"])
      expect(claySourceNoteIds(xml).size).toBe(0);
  });
});
