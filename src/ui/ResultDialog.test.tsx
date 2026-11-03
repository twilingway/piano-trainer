// @vitest-environment happy-dom
import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { GameScore } from "../practice/gameScore";
import { ResultDialog } from "./ResultDialog";

let host: HTMLDivElement, root: Root;
const score = new GameScore(1);
score.hit("note", 0, 0);
const stats = {
  hits: 1,
  misses: 0,
  wrong: 0,
  meanOffset: 0,
  troubleSpots: [{ pitch: 60, errors: 2 }],
  game: score.snapshot(1)
};
const callbacks = () => ({
  onClose: vi.fn(),
  onAgain: vi.fn(),
  onReview: vi.fn(),
  onStats: vi.fn(),
  onNext: vi.fn()
});
async function render(props: Partial<ComponentProps<typeof ResultDialog>> = {}, strict = false) {
  await act(async () => {
    const view = (
      <ResultDialog
        open
        stats={stats}
        canReview
        onClose={vi.fn()}
        onAgain={vi.fn()}
        onReview={vi.fn()}
        onStats={vi.fn()}
        {...props}
      />
    );
    root.render(strict ? <StrictMode>{view}</StrictMode> : view);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setInterfaceLanguage("ru");
});

describe("compact practice result", () => {
  it.each(["ru", "en"] as const)(
    "keeps its accessible native modal name and five action callbacks in %s",
    async (locale) => {
      setInterfaceLanguage(locale);
      const actions = callbacks();
      await render(actions, true);
      const dialog = host.querySelector("dialog");
      expect(dialog?.open).toBe(true);
      expect(dialog?.getAttribute("aria-label")).toBe(locale === "ru" ? "Готово" : "Done");
      const body = dialog?.querySelector(".game-dialog__body"),
        content = body?.querySelector(".result-content"),
        footer = body?.querySelector(".result-actions");
      expect(content?.parentElement).toBe(body);
      expect(footer?.parentElement).toBe(body);
      expect(content?.contains(footer ?? null)).toBe(false);
      expect(content?.querySelector(".result-summary")).not.toBeNull();
      expect(content?.querySelector(".result-details")?.textContent).toContain(
        locale === "ru" ? "Трудные ноты:" : "Trouble notes:"
      );
      const buttons = [...(footer?.querySelectorAll("button") ?? [])];
      expect(buttons).toHaveLength(5);
      for (const button of buttons)
        act(() => {
          button.click();
        });
      expect(actions.onNext).toHaveBeenCalledOnce();
      expect(actions.onAgain).toHaveBeenCalledOnce();
      expect(actions.onReview).toHaveBeenCalledOnce();
      expect(actions.onStats).toHaveBeenCalledExactlyOnceWith(stats);
      expect(actions.onClose).toHaveBeenCalledOnce();
    }
  );

  it("forwards native Escape cancellation once without issuing an extra close", async () => {
    const actions = callbacks();
    await render(actions);
    const dialog = host.querySelector("dialog");
    if (!dialog) throw new Error("Missing result dialog");
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(actions.onClose).toHaveBeenCalledOnce();
    const close = vi.spyOn(dialog, "close");
    await render({ ...actions, open: false });
    expect(close).not.toHaveBeenCalled();
    expect(actions.onClose).toHaveBeenCalledOnce();
    expect(host.querySelector("dialog")).toBeNull();
  });

  it("returns focus after owner unmount without adding close callbacks in StrictMode", async () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.focus();
    const actions = callbacks();
    await render(actions, true);
    const dialog = host.querySelector("dialog");
    if (!dialog) throw new Error("Missing result dialog");
    const close = vi.spyOn(dialog, "close");
    expect(actions.onClose).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>(".result-actions button")?.focus();
    await act(async () => {
      root.render(null);
      await Promise.resolve();
    });
    expect(close).not.toHaveBeenCalled();
    expect(actions.onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("keeps unrated accuracy without auxiliary labels and leaves an empty result ungraded", async () => {
    await render({
      stats: { hits: 1, misses: 1, wrong: 0, meanOffset: 0, troubleSpots: [] },
      canReview: false
    });
    expect(host.querySelector(".result-score")?.textContent).toContain("50,0%");
    expect(host.textContent).not.toContain("без рейтинга");
    await render({
      stats: {
        hits: 0,
        misses: 0,
        wrong: 0,
        meanOffset: 0,
        troubleSpots: [],
        game: new GameScore(0).snapshot(0)
      },
      canReview: false
    });
    expect(host.querySelector(".result-score")).toBeNull();
    expect(host.querySelector(".result-stars")).toBeNull();
    expect(host.textContent).not.toContain("Нет нот для оценки");
    expect(host.textContent).not.toContain("без рейтинга");
    expect(host.querySelectorAll(".result-actions button")).toHaveLength(2);
  });
});
