// @vitest-environment happy-dom
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { PlayerTopBar } from "./PlayerTopBar";
import { CourseLessonBar } from "./CourseLessonBar";

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
const defaults: ComponentProps<typeof PlayerTopBar> = {
  title: "Song",
  playing: false,
  soundLoading: false,
  mode: "wait",
  hands: "both",
  speed: 1,
  midi: undefined,
  settingsOpen: false,
  fullscreen: false,
  onFullscreen: noop,
  toggles: null,
  editing: false,
  onToggleEditing: noop,
  onLibrary: noop,
  onRestart: noop,
  onTogglePlay: noop,
  onMode: noop,
  onHands: noop,
  onSpeed: noop,
  onSettings: noop
};

function render(props: Partial<ComponentProps<typeof PlayerTopBar>> = {}) {
  act(() => {
    root.render(<PlayerTopBar {...defaults} {...props} />);
  });
}
const difficultySelect = () =>
  host.querySelector<HTMLSelectElement>("select[aria-label='Сложность']");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("PlayerTopBar difficulty", () => {
  it("keeps one phrase selector in the toolbar or compact menu across viewport changes", () => {
    let compact = false;
    let notify: (() => void) | undefined;
    const remove = vi.fn();
    const media = {
      get matches() {
        return compact;
      },
      addEventListener: (_type: string, listener: () => void) => {
        notify = listener;
      },
      removeEventListener: remove
    } as unknown as MediaQueryList;
    const mock = vi.spyOn(window, "matchMedia").mockReturnValue(media);
    const onPhrase = vi.fn();
    const course = (
      <CourseLessonBar
        title="Synthetic lesson"
        phrases={[
          { id: "first", title: "Координация", completed: false },
          { id: "second", completed: false }
        ]}
        phraseId="second"
        completed={false}
        onPhrase={onPhrase}
      />
    );
    try {
      render({ course });
      const selector = () =>
        host.querySelector<HTMLSelectElement>('select[aria-label="Выбрать фразу"]');
      expect(host.querySelectorAll('select[aria-label="Выбрать фразу"]')).toHaveLength(1);
      expect(selector()?.closest(".compact-controls__menu")).toBeNull();
      expect(selector()?.value).toBe("second");
      act(() => {
        compact = true;
        notify?.();
      });
      expect(host.querySelectorAll('select[aria-label="Выбрать фразу"]')).toHaveLength(1);
      expect(selector()?.closest(".compact-controls__menu")).not.toBeNull();
      expect(selector()?.value).toBe("second");
      expect(onPhrase).not.toHaveBeenCalled();
      act(() => {
        const select = selector();
        if (!select) throw new Error("Phrase selector not mounted");
        select.value = "first";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(onPhrase).toHaveBeenCalledExactlyOnceWith("first");
      act(() => {
        compact = false;
        notify?.();
      });
      expect(selector()?.closest(".compact-controls__menu")).toBeNull();
      expect(host.querySelectorAll('select[aria-label="Выбрать фразу"]')).toHaveLength(1);
      expect(host.querySelector(".course-lesson-bar > strong")).toBeNull();
    } finally {
      mock.mockRestore();
    }
  });

  it("shows a MIDI song's version by the hands and switches it", () => {
    const onSimplified = vi.fn();
    render({ difficulty: { simplified: false, onSimplified } });
    const select = difficultySelect();
    expect(select?.selectedOptions[0]?.textContent).toBe("Полная");
    act(() => {
      if (!select) return;
      select.value = "simplified";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSimplified).toHaveBeenCalledWith(true);
  });

  it("explains the version in a tooltip and on the phone's menu", () => {
    const onSimplified = vi.fn();
    render({ difficulty: { simplified: true, onSimplified } });
    expect(difficultySelect()?.title).toBe(
      "Сложность: Мелодия в правой руке, слева бас и до двух нот аккорда."
    );
    const phone = host.querySelector(
      ".compact-controls [role='radiogroup'][aria-label='Сложность']"
    );
    expect(phone?.querySelector("[aria-checked='true']")?.textContent).toBe("Упрощённая");
    expect(phone?.parentElement?.textContent).toContain("Мелодия в правой руке");
    const full = phone?.querySelector<HTMLButtonElement>("[aria-checked='false']");
    act(() => {
      full?.click();
    });
    expect(onSimplified).toHaveBeenCalledWith(false);
  });

  it("has no version choice for a score", () => {
    render();
    expect(difficultySelect()).toBeNull();
    expect(host.querySelector("[role='radiogroup'][aria-label='Сложность']")).toBeNull();
  });
});
