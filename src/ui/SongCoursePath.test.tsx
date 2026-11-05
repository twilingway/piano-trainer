// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { findSongCourseSource } from "../songCourse/catalog";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { coursePath } from "../songCourse/path";
import { SongCoursePath } from "./SongCoursePath";

vi.mock("../staff/Staff", () => ({ Staff: () => <div data-score /> }));
const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("missing fixture");
const source = fixture;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
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
it("shows unique motifs, retains every repeat behind a disclosure and chooses its original ID", async () => {
  const choose = vi.fn();
  await act(async () => {
    await Promise.resolve();
    root.render(
      <SongCoursePath sources={[source]} selection={null} results={[]} onChoose={choose} />
    );
  });
  const path = coursePath(source);
  expect(host.querySelectorAll(".song-course-path__node")).toHaveLength(path.nodes.length);
  const repeats = host.querySelector<HTMLDetailsElement>(".song-course-path__repeats");
  expect(repeats?.textContent).toContain("Другие повторы");
  expect(repeats?.querySelector("button")).toBeNull();
  expect(host.querySelector("progress")?.max).toBe(path.nodes.length);
  await act(async () => {
    await Promise.resolve();
    if (!repeats) throw new Error("missing repeats");
    repeats.open = true;
    repeats.dispatchEvent(new Event("toggle"));
  });
  const buttons = repeats?.querySelectorAll<HTMLButtonElement>("button");
  expect(buttons).toHaveLength(path.repeats.length);
  await act(async () => {
    await Promise.resolve();
    buttons?.[0]?.click();
  });
  expect(choose).toHaveBeenCalledWith(source.id, "hot-cross-buns/guided-2");
});
it("highlights the visible representative of an explicitly selected legacy repeat", async () => {
  await act(async () => {
    await Promise.resolve();
    root.render(
      <SongCoursePath
        sources={[source]}
        selection={{
          songId: source.id,
          sourceRevision: source.revision,
          sourceHash: source.sourceHash,
          nodeId: "hot-cross-buns/guided-4"
        }}
        results={[]}
        onChoose={vi.fn()}
      />
    );
  });
  expect(host.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain("Фраза с помощником");
});
