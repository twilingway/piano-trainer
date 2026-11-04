import { describe, expect, it } from "vitest";
import { lessonPath, PATH_STEPS } from "./model";
describe("recommended lesson path", () => {
  it("starts with an introduction and keeps every later step available", () => {
    const p = lessonPath([]);
    expect(p.next?.id).toBe("right-intro");
    expect(p.steps.filter((s) => s.status === "available")).toHaveLength(16);
  });
  it("recommends the first gap, never invents an introduction from practical evidence", () => {
    const p = lessonPath(["right-notes", "right-phrases"]);
    expect(p.next?.id).toBe("right-intro");
    expect(p.completedCount).toBe(2);
    expect(lessonPath(["right-intro", "right-notes"]).next?.id).toBe("right-phrases");
  });
  it("ignores duplicate and unknown ids and handles a completed path", () => {
    expect(lessonPath(["right-intro", "right-intro", "unknown"]).completedCount).toBe(1);
    expect(lessonPath(PATH_STEPS.map((s) => s.id)).next).toBeNull();
  });
});
