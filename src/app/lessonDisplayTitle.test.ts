import { describe, expect, it } from "vitest";
import { lessonDisplayTitle } from "./lessonDisplayTitle";

describe("localized bundled lesson titles", () => {
  const choice = { exerciseId: "anthem-ru", levelId: "easy" };
  const t = (message: string) =>
    ({
      "Гимн России": "Russian anthem",
      "Лёгкий — бас одной нотой": "Easy — single-note bass"
    })[message] ?? message;

  it("localizes the display including a transposition while leaving the canonical title intact", () => {
    const title = "Гимн России · Лёгкий — бас одной нотой (+2)";
    expect(lessonDisplayTitle(title, choice, t)).toBe(
      "Russian anthem · Easy — single-note bass (+2)"
    );
    expect(title).toBe("Гимн России · Лёгкий — бас одной нотой (+2)");
  });

  it("does not translate a user's or local lesson's title even when it matches a catalog entry", () => {
    expect(lessonDisplayTitle("Гимн России", null, t)).toBe("Гимн России");
    expect(
      lessonDisplayTitle("Гимн России", { exerciseId: "local-score", levelId: "easy" }, t)
    ).toBe("Гимн России");
  });
});
