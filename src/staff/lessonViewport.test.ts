// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { revealLessonEntry } from "./lessonViewport";

function fixture(height = 120) {
  const body = document.createElement("div");
  body.className = "lesson-workspace__body";
  Object.defineProperty(body, "clientHeight", { value: height });
  body.getBoundingClientRect = () => new DOMRect(0, 50, 600, height);
  const host = body.appendChild(document.createElement("div"));
  const head = (top: number, size = 16) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.getBoundingClientRect = () => new DOMRect(200, top - body.scrollTop, 24, size);
    return node;
  };
  return { body, host, head };
}

describe("the current lesson entry above fixed actions", () => {
  it("scrolls a low ledger note completely above the action boundary without scaling it", () => {
    const { body, host, head } = fixture();
    const note = head(162, 20);
    revealLessonEntry(host, new Map([[note, 0]]), 0);
    expect(body.scrollTop).toBe(20);
    expect(note.getBoundingClientRect().bottom).toBe(162);
  });

  it("reveals the current beat only, including both voices, on a short screen", () => {
    const { body, host, head } = fixture(80);
    const previous = head(75);
    const upper = head(146);
    const lower = head(174);
    revealLessonEntry(
      host,
      new Map([
        [previous, 0],
        [upper, 1],
        [lower, 1]
      ]),
      1.5
    );
    expect(body.scrollTop).toBe(68);
    expect(upper.getBoundingClientRect().top).toBeGreaterThanOrEqual(58);
    expect(lower.getBoundingClientRect().bottom).toBeLessThanOrEqual(122);
  });

  it("restores an upper note after the prompt changes and preserves a useful manual scroll", () => {
    const { body, host, head } = fixture();
    body.scrollTop = 80;
    const upper = head(75);
    revealLessonEntry(host, new Map([[upper, 0]]), 0);
    expect(body.scrollTop).toBe(17);
    revealLessonEntry(host, new Map([[upper, 0]]), 0);
    expect(body.scrollTop).toBe(17);
  });

  it("does not steer ordinary songs or an empty lesson", () => {
    const { body, head } = fixture();
    body.scrollTop = 20;
    revealLessonEntry(document.createElement("div"), new Map([[head(200), 0]]), 0);
    revealLessonEntry(body, new Map(), 0);
    expect(body.scrollTop).toBe(20);
  });

  it("includes every chord head when the cursor indexes only the first one", () => {
    const { body, host, head } = fixture();
    const upper = head(140);
    const lower = head(172);
    revealLessonEntry(
      host,
      new Map([[upper, 0]]),
      0,
      new Map([
        ["0:60", [upper]],
        ["0:64", [lower]]
      ])
    );
    expect(body.scrollTop).toBe(26);
    expect(lower.getBoundingClientRect().bottom).toBe(162);
  });

  it("uses the same beat grid for raw tuplets and exact chord head keys", () => {
    const { body, host, head } = fixture();
    const previous = head(75);
    const upper = head(200);
    const lower = head(230);
    revealLessonEntry(
      host,
      new Map([
        [previous, 0],
        [upper, 2 / 3]
      ]),
      2 / 3,
      new Map([
        ["0.667:60", [upper]],
        ["0.667:64", [lower]]
      ])
    );
    expect(body.scrollTop).toBe(84);
    expect(upper.getBoundingClientRect().top).toBeGreaterThanOrEqual(58);
    expect(lower.getBoundingClientRect().bottom).toBeLessThanOrEqual(162);
  });
});
