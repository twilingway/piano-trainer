// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { generateReadingExercise } from "../reading/generator";
import { readingPromptXml } from "../reading/prompt";

async function staffEntries(xml: string): Promise<number[]> {
  const host = document.createElement("div");
  document.body.append(host);
  try {
    const osmd = new OpenSheetMusicDisplay(host, { backend: "svg", autoResize: false });
    await osmd.load(xml);
    return osmd.Sheet.SourceMeasures.map(
      (measure) => measure.VerticalSourceStaffEntryContainers.length
    );
  } finally {
    host.remove();
  }
}

describe("reading scores in the actual OSMD reader", () => {
  it("retains all twenty source notes, including the first measure", async () => {
    const exercise = generateReadingExercise("notes", 2);
    expect(await staffEntries(exercise.musicXml)).toEqual([4, 4, 4, 4, 4]);
  });

  it.each(["notes", "phrases", "check"] as const)(
    "retains every presented note in %s",
    async (task) => {
      const exercise = generateReadingExercise(task, 2);
      const count = task === "phrases" ? 4 : 1;
      for (let index = 0; index < 20; index += count) {
        const prompt = readingPromptXml(exercise.musicXml, task, index);
        expect(await staffEntries(prompt.musicXml)).toEqual([count]);
      }
    }
  );
});
