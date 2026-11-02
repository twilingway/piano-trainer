// @vitest-environment happy-dom
import { act, useState } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import { ReadingProgress } from "./ReadingProgress";
import { LibraryDialog } from "./LibraryDialog";
import { WindowViewMemory } from "./windowViewMemory";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    // A hidden native dialog has no layout: a premature restore would incorrectly clamp to zero.
    if (!this.closest("dialog")?.open) return 0;
    return this.querySelector("details[open]") ? 1600 : 400;
  });
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function props(): ComponentProps<typeof LibraryDialog> {
  return {
    open: true,
    onClose: vi.fn(),
    lessons: [
      { id: "fixture", title: "Lesson fixture", levels: [{ id: "easy", title: "Level fixture" }] }
    ],
    current: null,
    currentSource: null,
    onLesson: vi.fn(),
    onExportLesson: vi.fn(),
    mySongs: [],
    onMySong: vi.fn(),
    onDeleteMySong: vi.fn(),
    folder: undefined,
    foldersSupported: false,
    onFolderSong: vi.fn(),
    onChooseFolder: vi.fn(),
    onGrantFolder: vi.fn(),
    onForgetFolder: vi.fn(),
    onOpenFile: vi.fn()
  };
}
function body() {
  const element = host.querySelector<HTMLDivElement>(".game-dialog__body");
  if (!element) throw new Error("Missing library body");
  return element;
}
function detail() {
  const element = body().querySelector("details");
  if (!element) throw new Error("Missing progress disclosure");
  return element;
}

describe("library window presentation memory", () => {
  it("remembers the selected lesson area after full content unmount without selecting it again", async () => {
    const callbacks = props(),
      built = vi.fn(),
      sourceChanged = vi.fn();
    function Course({
      filter,
      onFilter
    }: {
      filter: ReadingSourceFilter;
      onFilter: (source: ReadingSourceFilter) => void;
    }) {
      built();
      return <ReadingProgress history={[]} sourceFilter={filter} onSourceFilter={onFilter} />;
    }
    function Shell() {
      const [open, setOpen] = useState(true),
        [memory] = useState(() => new WindowViewMemory());
      const [filter, setFilter] = useState<ReadingSourceFilter>("all");
      return (
        <>
          <button
            data-reopen
            onClick={() => {
              setOpen(true);
            }}
          >
            Open library
          </button>
          {open && (
            <LibraryDialog
              {...callbacks}
              viewMemory={memory}
              onClose={() => {
                setOpen(false);
              }}
              course={
                <Course
                  filter={filter}
                  onFilter={(source) => {
                    sourceChanged(source);
                    setFilter(source);
                  }}
                />
              }
            />
          )}
        </>
      );
    }
    await act(async () => {
      await Promise.resolve();
      root.render(<Shell />);
    });
    detail().open = true;
    const select = body().querySelector("select");
    if (!select) throw new Error("Missing source filter");
    await act(async () => {
      await Promise.resolve();
      select.value = "midi";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    body().scrollTop = 900;
    const level = body().querySelector<HTMLButtonElement>(".level-chip");
    await act(async () => {
      await Promise.resolve();
      level?.click();
    });
    expect(callbacks.onLesson).toHaveBeenCalledExactlyOnceWith("fixture", "easy");
    expect(host.querySelector("dialog")).toBeNull();
    const closedBuilds = built.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
      root.render(<Shell />);
    });
    expect(built).toHaveBeenCalledTimes(closedBuilds);
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[data-reopen]")?.click();
    });
    expect(detail().open).toBe(true);
    expect(body().scrollTop).toBe(900);
    expect(body().querySelector("select")?.value).toBe("midi");
    expect(sourceChanged).toHaveBeenCalledExactlyOnceWith("midi");
    expect(callbacks.onLesson).toHaveBeenCalledTimes(1);
    expect(callbacks.onMySong).not.toHaveBeenCalled();
    expect(callbacks.onFolderSong).not.toHaveBeenCalled();
  });

  it("restores only remaining stable IDs, clamps shortened content and preserves the access message", async () => {
    const callbacks = props();
    const render = async (open: boolean, missing: boolean) => {
      await act(async () => {
        await Promise.resolve();
        root.render(
          <LibraryDialog
            {...callbacks}
            open={open}
            folder={{ name: "Folder", needsAccess: missing, songs: [] }}
            course={
              missing ? (
                <details data-window-detail="new-card">
                  <summary>Replacement card</summary>
                </details>
              ) : (
                <details data-window-detail="removed-card">
                  <summary>Old card</summary>
                </details>
              )
            }
          />
        );
      });
    };
    await render(true, false);
    detail().open = true;
    body().scrollTop = 1100;
    await render(false, true);
    expect(host.querySelector("dialog")).toBeNull();
    await render(true, true);
    expect(detail().open).toBe(false);
    expect(body().scrollTop).toBe(200);
    expect(body().textContent).toContain("Дать доступ к папке");
    expect(callbacks.onGrantFolder).not.toHaveBeenCalled();
    expect(callbacks.onFolderSong).not.toHaveBeenCalled();
  });

  it("does not transfer remembered disclosures or scrolling to a new library instance", async () => {
    const callbacks = props();
    const render = async (key: string) => {
      await act(async () => {
        await Promise.resolve();
        root.render(
          <LibraryDialog
            key={key}
            {...callbacks}
            course={
              <details data-window-detail="card">
                <summary>Card</summary>
              </details>
            }
          />
        );
      });
    };
    await render("first");
    detail().open = true;
    body().scrollTop = 500;
    await render("second");
    expect(detail().open).toBe(false);
    expect(body().scrollTop).toBe(0);
  });
});
