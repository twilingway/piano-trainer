// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedToken } from "../wordTyping/types";
import { WordTypingLane } from "./WordTypingLane";

/** Lane 300 px tall (100 px a second), keys 40 px wide at 100 and 200 px. */
const BOXES: Record<string, { left: number; width: number; height: number }> = {
  lane: { left: 0, width: 600, height: 300 },
  KeyA: { left: 100, width: 40, height: 40 },
  KeyL: { left: 200, width: 40, height: 40 }
};

function token(noteIndex: number, physicalKey: string, start: number, duration: number) {
  return {
    noteIndex,
    noteId: `n${String(noteIndex)}`,
    pitch: 60,
    start,
    duration,
    input: { physicalKey, modifier: "none", display: "a" },
    wordIndex: 0,
    isFallback: false
  } satisfies GeneratedToken;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const box = this.classList.contains("word-lane") ? BOXES.lane : BOXES[this.dataset.code ?? ""];
    return DOMRect.fromRect({
      x: box?.left ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0
    });
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WordTypingLane", () => {
  it("drops each note into its key's column with a length by its hold", async () => {
    const keyboardRef = createRef<HTMLDivElement>();
    await act(async () => {
      root.render(
        <>
          <WordTypingLane
            tokens={[token(0, "KeyA", 1, 0.5), token(1, "KeyL", 1.5, 1)]}
            liveTime={() => 0}
            keyboardRef={keyboardRef}
          />
          <div ref={keyboardRef}>
            <div data-code="KeyA" />
            <div data-code="KeyL" />
          </div>
        </>
      );
      await Promise.resolve();
    });
    const notes = [...host.querySelectorAll<HTMLElement>(".word-lane__note")];
    expect(notes.map((note) => note.style.left)).toEqual(["106px", "206px"]);
    expect(notes.map((note) => note.style.bottom)).toEqual(["100px", "150px"]);
    expect(notes.map((note) => note.style.height)).toEqual(["50px", "100px"]);
    expect(notes.map((note) => note.className)).toEqual([
      "word-lane__note word-finger-5",
      "word-lane__note word-finger-4"
    ]);
  });
});
