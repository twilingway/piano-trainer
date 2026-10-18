import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLessons } from "./localLessons";

const files = {
  "/local-lessons/Sample/1 First.musicxml": "<first/>",
  "/local-lessons/Sample/2 Second.xml": "<second/>"
};
afterEach(() => {
  vi.restoreAllMocks();
});

describe("local lesson stage files", () => {
  it("attaches a stage file to the level with the same name only", () => {
    const [lesson] = buildLessons(files, {
      "/local-lessons/Sample/1 First.stage.json": '{ "sign": "Sample sign" }',
      "/local-lessons/Other/1 First.stage.json": '{ "sign": "Elsewhere" }'
    });
    expect(lesson?.levels.map((level) => level.stage)).toEqual([
      { sign: "Sample sign" },
      undefined
    ]);
    expect(lesson?.levels[1]).not.toHaveProperty("stage");
  });
  it("ignores an invalid stage file with a warning and keeps the level", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const [lesson] = buildLessons(files, {
      "/local-lessons/Sample/2 Second.stage.json": '{ "sign": "Sample", "extra": true }'
    });
    expect(lesson?.levels).toHaveLength(2);
    expect(lesson?.levels[1]).not.toHaveProperty("stage");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("/local-lessons/Sample/2 Second.stage.json");
  });
});
