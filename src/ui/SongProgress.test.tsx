// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { SongProgress } from "./SongProgress";

beforeEach(() => {
  setInterfaceLanguage("ru");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function render(time: number, duration = 138) {
  return renderToStaticMarkup(
    <SongProgress
      progress={duration > 0 ? time / duration : 0}
      time={time}
      duration={duration}
      ticks={[]}
      onSeek={vi.fn()}
    />
  );
}

describe("song progress time", () => {
  it("shows song seconds and a localized accessible duration", () => {
    expect(render(24.9)).toContain("00:24 / 02:18");
    expect(render(24.9)).toContain('aria-valuetext="00:24 из 02:18"');
    setInterfaceLanguage("en");
    expect(render(24.9)).toContain('aria-valuetext="00:24 of 02:18"');
  });

  it("clamps count-in and the final release tail to the song bounds", () => {
    expect(render(-2)).toContain("00:00 / 02:18");
    expect(render(-2)).toContain('aria-valuenow="0"');
    expect(render(150)).toContain("02:18 / 02:18");
    expect(render(150)).toContain('aria-valuenow="100"');
    expect(render(0, 0)).toContain("00:00 / 00:00");
    expect(render(3661, 3661)).toContain("61:01 / 61:01");
  });

  it("keeps pointer seeking through the central label and bounded keyboard seeking", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSeek = vi.fn();
    try {
      act(() => {
        root.render(
          <SongProgress progress={0.99} time={137} duration={138} ticks={[]} onSeek={onSeek} />
        );
      });
      const slider = host.querySelector<HTMLDivElement>('[role="slider"]');
      const label = host.querySelector(".song-progress__time");
      if (!slider || !label) throw new Error("Missing progress controls");
      vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, width: 200 } as DOMRect);
      act(() => {
        label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100 }));
        slider.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
      });
      expect(onSeek.mock.calls).toEqual([[0.5], [1]]);
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
    }
  });
});
