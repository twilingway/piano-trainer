// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryDialog } from "./LibraryDialog";
import { ResultDialog } from "./ResultDialog";
import type { PracticeStats } from "../practice/session";

vi.mock("./GameDialog", () => ({
  GameDialog: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("closed dialog content", () => {
  it("does not enumerate a closed library and restores its export controls when opened", async () => {
    const readTitle = vi.fn(() => "Урок");
    const lesson = {
      id: "lesson",
      get title() {
        return readTitle();
      },
      levels: [{ id: "easy", title: "Легко" }]
    };
    const onExportLesson = vi.fn();
    const props = {
      onClose: noop,
      lessons: [lesson],
      current: null,
      currentSource: null,
      onLesson: noop,
      onExportLesson,
      mySongs: [],
      onMySong: noop,
      onDeleteMySong: noop,
      folder: undefined,
      foldersSupported: false,
      onFolderSong: noop,
      onChooseFolder: noop,
      onGrantFolder: noop,
      onForgetFolder: noop,
      onOpenFile: noop
    };
    await act(async () => {
      await Promise.resolve();
      root.render(<LibraryDialog {...props} open={false} />);
    });
    expect(readTitle).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
    await act(async () => {
      await Promise.resolve();
      root.render(<LibraryDialog {...props} open />);
    });
    const exportButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "MIDI"
    );
    expect(exportButton).toBeDefined();
    await act(async () => {
      await Promise.resolve();
      exportButton?.click();
    });
    expect(onExportLesson).toHaveBeenCalledWith("lesson", "easy", "midi");
    readTitle.mockClear();
    await act(async () => {
      await Promise.resolve();
      root.render(<LibraryDialog {...props} open={false} />);
    });
    expect(readTitle).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
  });

  it("does not read result details while the result window is closed", async () => {
    const readDetails = vi.fn(() => []);
    const stats = {
      hits: 1,
      misses: 0,
      wrong: 0,
      meanOffset: 0,
      get troubleSpots() {
        return readDetails();
      }
    } satisfies PracticeStats;
    await act(async () => {
      await Promise.resolve();
      root.render(
        <ResultDialog
          open={false}
          stats={stats}
          canReview={false}
          onClose={noop}
          onAgain={noop}
          onReview={noop}
        />
      );
    });
    expect(readDetails).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
  });
});
