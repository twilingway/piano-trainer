// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import type { MusicCourseView } from "../ui/musicCourseTypes";
import { useGameRuntime } from "./useGameRuntime";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import { musicClockAllowed, usePracticeDisplayPrefs } from "./useMusicTrainer";

let root: Root, host: HTMLDivElement;
const configureControls = vi.fn();
const trainerRef = { current: { configureControls } as unknown as Trainer };
function Harness({
  active,
  status,
  canStart
}: { active: boolean } & Pick<MusicCourseView, "status" | "canStart">) {
  useGameRuntime(trainerRef, true, {
    loop: false,
    ranked: false,
    stopOnError: false,
    rankedReady: false,
    deviceId: "",
    performance: false,
    canStart: musicClockAllowed(active, { status, canStart }),
    resumeWhenReady: false
  });
  return null;
}
const savedStaff = { ...DEFAULT_STAFF_PREFS, fingers: true };
function FingeringHarness({
  active,
  fingeringVisible
}: {
  active: boolean;
  fingeringVisible?: boolean;
}) {
  const prefs = usePracticeDisplayPrefs({
    practiceActive: active,
    ear: false,
    music: {
      active,
      staffVisible: true,
      keysVisible: true,
      ...(fingeringVisible === undefined ? {} : { fingeringVisible })
    },
    staffPrefs: savedStaff,
    performance: false,
    courseActive: false,
    courseView: "staff"
  });
  return <output data-fingers={prefs.fingers} data-staff={prefs.visible} />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
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
describe("music manual start versus clock permission", () => {
  it.each(["playing", "reply"] as const)(
    "keeps %s clock enabled after the manual start action closes",
    (status) => {
      act(() => {
        root.render(<Harness active status={status} canStart={false} />);
      });
      expect(configureControls).toHaveBeenLastCalledWith({
        canStart: true,
        loop: false,
        stopOnError: false,
        resumeWhenReady: false,
        performance: false
      });
    }
  );
  it.each([
    "preparation",
    "preview",
    "listening",
    "result",
    "completed",
    "paused",
    "error"
  ] as const)("blocks ordinary clock in %s without enabling auto-resume", (status) => {
    act(() => {
      root.render(<Harness active status={status} canStart={false} />);
    });
    expect(vi.mocked(configureControls).mock.lastCall?.[0]).toMatchObject({
      canStart: false,
      resumeWhenReady: false
    });
  });
  it("allows a ready explicit start and leaves inactive practice controls alone", () => {
    act(() => {
      root.render(<Harness active status="ready" canStart />);
    });
    expect(vi.mocked(configureControls).mock.lastCall?.[0]).toMatchObject({ canStart: true });
    act(() => {
      root.render(<Harness active={false} status="preparation" canStart={false} />);
    });
    expect(vi.mocked(configureControls).mock.lastCall?.[0]).toMatchObject({ canStart: true });
  });
});

describe("explicit course fingering display", () => {
  it("hides absent/control fingering even when the saved player preference is enabled", () => {
    act(() => {
      root.render(<FingeringHarness active />);
    });
    expect(host.querySelector("output")?.dataset.fingers).toBe("false");
    act(() => {
      root.render(<FingeringHarness active fingeringVisible={false} />);
    });
    expect(host.querySelector("output")?.dataset.fingers).toBe("false");
    expect(savedStaff.fingers).toBe(true);
  });
  it("enables technical fingering for explicit help and restores saved fingers after exit", () => {
    act(() => {
      root.render(<FingeringHarness active fingeringVisible />);
    });
    expect(host.querySelector("output")?.dataset.fingers).toBe("true");
    act(() => {
      root.render(<FingeringHarness active fingeringVisible={false} />);
    });
    expect(host.querySelector("output")?.dataset.fingers).toBe("false");
    act(() => {
      root.render(<FingeringHarness active={false} />);
    });
    expect(host.querySelector("output")?.dataset.fingers).toBe("true");
    expect(savedStaff.fingers).toBe(true);
  });
});
