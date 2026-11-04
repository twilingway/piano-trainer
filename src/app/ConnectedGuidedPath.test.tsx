// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ConnectedGuidedPath } from "./ConnectedGuidedPath";
import { PATH_STEPS, type PathStep } from "../learningPath/model";
const mock = vi.hoisted(() => ({
  start: vi.fn(),
  beginner: vi.fn(),
  intro: vi.fn(),
  bassIntro: vi.fn(),
  music: vi.fn(),
  bass: vi.fn(),
  interval: vi.fn(),
  rhythm: vi.fn(),
  twoHand: vi.fn(),
  heldBass: vi.fn(),
  independent: vi.fn()
}));
vi.mock("./PlayerRuntimeProvider", () => ({
  useRuntimeSelector: () => ({ completed: [] }),
  useRuntimeSource: () => ({
    getSnapshot: () => ({
      beginner: { start: mock.beginner },
      reading: {
        start: mock.start,
        setIntro: mock.intro,
        openBassIntro: mock.bassIntro,
        startBass: mock.bass
      },
      music: { open: mock.music },
      intervals: { start: mock.interval },
      rhythm: { start: mock.rhythm },
      twoHand: { start: mock.twoHand },
      heldBass: { start: mock.heldBass },
      independentRhythm: { start: mock.independent }
    })
  })
}));
vi.mock("./GuidedProgressProvider", () => ({
  useGuidedProgress: () => ({ completed: [], error: false })
}));
vi.mock("../ui/GuidedLessonPath", () => ({
  GuidedLessonPath: ({
    onChoose,
    error,
    pending
  }: {
    onChoose: (step: PathStep) => void;
    error: string | null;
    pending: boolean;
  }) => (
    <div>
      {PATH_STEPS.map((s) => (
        <button
          key={s.id}
          data-step={s.id}
          disabled={pending}
          onClick={() => {
            onChoose(s);
          }}
        />
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}));
let host: HTMLDivElement, root: Root;
const close = vi.fn();
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.start.mockResolvedValue(true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    root.render(<ConnectedGuidedPath onChoose={close} />);
  });
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});
const click = async (id: string) => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>(`[data-step="${id}"]`)?.click();
  });
};
describe("guided commands", () => {
  it("opens the first small stage without giving completion", async () => {
    await click("beginner-v1-right-1");
    expect(mock.beginner).toHaveBeenCalledWith("beginner-v1-right-1");
    expect(close).toHaveBeenCalledOnce();
  });
  it("waits for reading selection and leaves the library open on failure", async () => {
    mock.start.mockResolvedValue(false);
    await click("right-check");
    expect(mock.start).toHaveBeenCalledWith("check");
    expect(close).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    mock.start.mockResolvedValue(true);
    await click("right-check");
    expect(close).toHaveBeenCalledOnce();
  });
  it("opens each hand's introduction without fabricating completion", async () => {
    await click("right-intro");
    expect(mock.intro).toHaveBeenCalledWith(true);
    await click("left-intro");
    expect(mock.bassIntro).toHaveBeenCalledOnce();
  });
  it("routes basic practice to the corresponding existing mode", async () => {
    await click("left-phrases");
    expect(mock.bass).toHaveBeenCalledWith("phrases");
    await click("interval-hear");
    expect(mock.interval).toHaveBeenCalledWith("hear-and-choose");
    await click("two-rhythms");
    expect(mock.independent).toHaveBeenCalledOnce();
  });
  it("opens broad musical topics without silently changing settings", async () => {
    await click("harmony");
    expect(mock.music).toHaveBeenCalledExactlyOnceWith("harmony");
  });
});
