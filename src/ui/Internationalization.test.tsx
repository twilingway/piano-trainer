// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { EXERCISES } from "../song/exercises";
import { GameScore } from "../practice/gameScore";
import { LibraryDialog } from "./LibraryDialog";
import { GameBoard } from "./GameBoard";
import { GameModeSegment } from "./GameModeSwitch";
import { PracticeTimingStatus } from "./PracticeTimingStatus";
import { ResultDialog } from "./ResultDialog";

vi.mock("../i18n/messages", async () => {
  const { uiMessages } = await import("../i18n/uiMessages");
  const { uiMessagesExtra } = await import("../i18n/uiMessagesExtra");
  return { messages: { ...uiMessages, ...uiMessagesExtra } };
});
vi.mock("./GameDialog", () => ({
  GameDialog: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));

beforeEach(() => {
  setInterfaceLanguage("ru");
});

afterEach(() => {
  setInterfaceLanguage("ru");
  localStorage.removeItem("interface-language-v1");
  vi.unstubAllGlobals();
});

describe("translated player interface", () => {
  it("updates an open library immediately while preserving local and user song titles", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    const onLesson = vi.fn();
    const onExportLesson = vi.fn();
    const localLesson = {
      id: "local",
      title: "Гимн России",
      levels: [{ id: "easy", title: "Лёгкий — медленно" }]
    };
    await act(async () => {
      await Promise.resolve();
      root.render(
        <LibraryDialog
          open
          onClose={vi.fn()}
          lessons={[...EXERCISES, localLesson]}
          current={{ exerciseId: "five-finger-c", levelId: "easy" }}
          currentSource={null}
          onLesson={onLesson}
          onExportLesson={onExportLesson}
          mySongs={[{ id: "user", title: "Пианино" }]}
          onMySong={vi.fn()}
          onDeleteMySong={vi.fn()}
          folder={undefined}
          foldersSupported={false}
          onFolderSong={vi.fn()}
          onChooseFolder={vi.fn()}
          onGrantFolder={vi.fn()}
          onForgetFolder={vi.fn()}
          onOpenFile={vi.fn()}
        />
      );
    });
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("Библиотека");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("Library");
    expect(host.textContent).toContain("Open file");
    expect(host.textContent).toContain("C position: five fingers");
    expect(host.textContent).toContain("Easy — slow");
    expect(host.textContent).toContain("Гимн России");
    expect(host.textContent).toContain("Лёгкий — медленно");
    expect(host.textContent).toContain("Пианино");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Easy — slow");
    const download = host.querySelector<HTMLButtonElement>(
      '[aria-label="Download “C position: five fingers · Easy — slow” as MIDI"]'
    );
    expect(download).not.toBeNull();
    await act(async () => {
      await Promise.resolve();
      download?.click();
    });
    expect(onExportLesson).toHaveBeenCalledWith("five-finger-c", "easy", "midi");
    expect(onLesson).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    host.remove();
  });

  it("translates game labels, timing hints and result controls with English numbers", () => {
    setInterfaceLanguage("en");
    const score = new GameScore(2, { targetScore: 200 });
    score.hit("first", 0, 0);
    score.hit("second", 90, 1);
    const game = { ...score.snapshot(1), score: 12345 };
    const hud = renderToStaticMarkup(
      <GameBoard game={game} mode="tempo" playing onOverdrive={vi.fn()} />
    );
    expect(hud).toContain('aria-label="Game score"');
    expect(hud).toContain("12,345");
    expect(hud).toContain("75.0%");
    expect(hud).not.toMatch(/[А-Яа-яЁё]/);
    const timing = renderToStaticMarkup(<PracticeTimingStatus policy="learning" ranked={false} />);
    expect(timing).toContain("Learning mode · +300 ms");
    expect(timing).toContain("OK for 25 points");
    const mode = renderToStaticMarkup(<GameModeSegment wordTyping locked onChange={vi.fn()} />);
    expect(mode).toContain("Type the Melody — pause to change the game");
    const results = renderToStaticMarkup(
      <ResultDialog
        open
        stats={{ hits: 2, misses: 0, wrong: 0, meanOffset: 0, troubleSpots: [], game }}
        canReview
        onClose={vi.fn()}
        onAgain={vi.fn()}
        onReview={vi.fn()}
      />
    );
    expect(results).toContain("weighted accuracy");
    expect(results).toContain("12,345");
    expect(results).toContain("75.0%");
    expect(results).toContain("Review take");
    expect(results).toContain("Try again");
    expect(results).not.toMatch(/[А-Яа-яЁё]/);
  });
});
