// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedReadingPractice } from "./ConnectedReading";

const reading = vi.hoisted(() => ({ intro: true, task: null, setIntro: vi.fn(), start: vi.fn() }));

vi.mock("./PlayerRuntimeProvider", () => ({
  useRuntimeSelector: (select: (runtime: { reading: typeof reading }) => unknown) =>
    select({ reading })
}));
vi.mock("../ui/ReadingCourse", () => ({
  ReadingCourseCard: () => null,
  ReadingPracticePanel: () => null
}));
vi.mock("../ui/ReadingIntro", () => ({
  ReadingIntro: ({ onStart, onClose }: { onStart: () => void; onClose: () => void }) => (
    <>
      <button onClick={onStart} data-start />
      <button onClick={onClose} data-close />
    </>
  )
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => {
    await Promise.resolve();
    root.render(<ConnectedReadingPractice />);
  });
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("reading introduction integration", () => {
  it("closes the introduction and begins a new single-note exercise", async () => {
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[data-start]")?.click();
    });
    expect(reading.setIntro).toHaveBeenCalledWith(false);
    expect(reading.start).toHaveBeenCalledExactlyOnceWith("notes");
  });
  it("closes without starting or changing the existing exercise", async () => {
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[data-close]")?.click();
    });
    expect(reading.setIntro).toHaveBeenCalledExactlyOnceWith(false);
    expect(reading.start).not.toHaveBeenCalled();
  });
});
