import { describe, expect, it } from "vitest";
import { courseDemoHandoff, courseLearnerMode, needsCourseDemonstration } from "./listenRepeat";
describe("listen then repeat decisions", () => {
  it.each(["notes", "duration", "guided-phrase"] as const)(
    "shows a %s teaching step first",
    (kind) => {
      expect(needsCourseDemonstration(kind)).toBe(true);
    }
  );
  it.each(["independent-phrase", "performance", "review"] as const)(
    "starts a %s answer directly",
    (kind) => {
      expect(needsCourseDemonstration(kind)).toBe(false);
    }
  );
  it("requires current repeat intent and real all-up before the learner begins", () => {
    expect(courseDemoHandoff("preview", 3, 3, false)).toBe("ready");
    expect(courseDemoHandoff("repeat", null, 3, false)).toBe("ready");
    expect(courseDemoHandoff("repeat", 2, 3, false)).toBe("ready");
    expect(courseDemoHandoff("repeat", 3, 3, true)).toBe("release");
    expect(courseDemoHandoff("repeat", 3, 3, false)).toBe("learner");
  });
});

it.each(["notes", "duration", "guided-phrase", "independent-phrase", "performance"] as const)(
  "runs the %s learner turn continuously",
  (kind) => {
    expect(courseLearnerMode(kind)).toBe("tempo");
  }
);
it("retains the isolated review note gate", () => {
  expect(courseLearnerMode("review")).toBe("wait");
});
