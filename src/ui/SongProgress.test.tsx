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
      timeAtShare={(share) => share * duration}
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
          <SongProgress
            progress={0.99}
            time={137}
            duration={138}
            ticks={[]}
            timeAtShare={(share) => share * 138}
            onSeek={onSeek}
          />
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

  it("previews the mapped seek time, clamps both edges and leaves the current time untouched", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSeek = vi.fn();
    // Two equal beat spans with different tempos: halfway is not half the duration.
    const timeAtShare = vi.fn((share: number) =>
      share <= 0.5 ? share * 60 : 30 + (share - 0.5) * 180
    );
    try {
      act(() => {
        root.render(
          <SongProgress
            progress={0.2}
            time={12}
            duration={120}
            ticks={[]}
            timeAtShare={timeAtShare}
            onSeek={onSeek}
          />
        );
      });
      const slider = host.querySelector<HTMLDivElement>('[role="slider"]');
      if (!slider) throw new Error("Missing progress controls");
      vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 100,
        width: 200
      } as DOMRect);
      const move = (clientX: number, pointerType = "mouse") => {
        act(() => {
          slider.dispatchEvent(
            new PointerEvent("pointermove", { bubbles: true, clientX, pointerType })
          );
        });
        return host.querySelector<HTMLElement>(".song-progress__preview");
      };
      expect(move(200)?.textContent).toBe("00:30");
      expect(timeAtShare).toHaveBeenLastCalledWith(0.5);
      expect(host.querySelector(".song-progress__time")?.textContent).toBe("00:12 / 02:00");
      expect(onSeek).not.toHaveBeenCalled();
      act(() => {
        slider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 200 }));
      });
      expect(onSeek).toHaveBeenLastCalledWith(0.5);
      const start = move(50);
      expect(start?.textContent).toBe("00:00");
      expect(start?.style.left).toBe("0%");
      expect(start?.style.transform).toBe("translateX(-0%)");
      const end = move(350);
      expect(end?.textContent).toBe("02:00");
      expect(end?.style.left).toBe("100%");
      expect(end?.style.transform).toBe("translateX(-100%)");
      act(() => {
        slider.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
      });
      expect(host.querySelector(".song-progress__preview")).toBeNull();
      move(200);
      act(() => {
        slider.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });
      expect(host.querySelector(".song-progress__preview")).toBeNull();
      expect(move(200, "touch")).toBeNull();
      move(200);
      act(() => {
        slider.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            clientX: 250,
            pointerType: "touch"
          })
        );
      });
      expect(host.querySelector(".song-progress__preview")).toBeNull();
      expect(onSeek).toHaveBeenLastCalledWith(0.75);
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
    }
  });
});
