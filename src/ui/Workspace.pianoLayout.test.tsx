// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import { Workspace } from "./Workspace";

vi.mock("../staff/Staff", () => ({
  Staff: ({ zoom }: { zoom: number }) => <div className="staff" data-zoom={zoom} />
}));
const noop = () => undefined;
const base: Parameters<typeof Workspace>[0] = {
  staffXml: "<score-partwise/>",
  prefs: { ...DEFAULT_STAFF_PREFS, lane: false },
  fixedLines: false,
  beat: 0,
  liveBeat: () => 0,
  onSeek: noop,
  reviewMarks: undefined,
  transcription: undefined,
  takeStaff: "row",
  splitDirection: "row",
  comparing: false,
  waiting: false,
  hostRef: createRef<HTMLDivElement>(),
  mirrorHostRef: createRef<HTMLDivElement>(),
  layout: { ...DEFAULT_SCREEN_LAYOUT, staffShare: 0.7 },
  onLayout: noop,
  onZoom: noop,
  layoutMoved: false,
  onResetLayout: noop,
  editing: false
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerHeight", 1000);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});
async function render(changes: Partial<Parameters<typeof Workspace>[0]> = {}) {
  await act(async () => {
    root.render(<Workspace {...base} {...changes} />);
    await Promise.resolve();
  });
}
it("keeps the canonical keyboard reservation while staff zoom uses its natural height", async () => {
  await render();
  const workspace = host.querySelector<HTMLElement>(".workspace-main");
  const lanes = host.querySelector<HTMLElement>(".lanes");
  if (!workspace || !lanes) throw new Error("Missing piano workspace");
  workspace.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
  lanes.style.setProperty("--piano-required-height", "220px");
  await act(async () => {
    lanes.dispatchEvent(new CustomEvent("piano-layout-footprint", { bubbles: true }));
    await Promise.resolve();
  });
  expect(workspace.dataset.pianoLayoutReference).toBe("true");
  expect(workspace.dataset.pianoStaffRegion).toBe("true");
  expect(workspace.style.getPropertyValue("--piano-staff-room")).toBe("580px");
  expect(host.querySelector(".staff")?.getAttribute("data-zoom")).toBe("1");
  lanes.style.setProperty("--piano-required-height", "300px");
  await act(async () => {
    lanes.dispatchEvent(new CustomEvent("piano-layout-footprint", { bubbles: true }));
    await Promise.resolve();
  });
  expect(workspace.style.getPropertyValue("--piano-staff-room")).toBe("500px");
  await render({ prefs: { ...base.prefs, zoom: 1.5 } });
  expect(workspace.style.getPropertyValue("--piano-staff-room")).toBe("500px");
  expect(host.querySelector(".staff")?.getAttribute("data-zoom")).toBe("1.5");
  await render({ prefs: { ...base.prefs, lane: true } });
  expect(workspace.dataset.pianoStaffRegion).toBeUndefined();
  expect(lanes.style.getPropertyValue("--piano-required-height")).toBe("300px");
});

it("uses only the independent lesson size in the lesson room and retains song zoom on exit", async () => {
  const prefs = { ...base.prefs, zoom: 0.75, lessonZoom: 1.75 };
  await render({ prefs, course: true, lessonBoard: (score) => <section>{score}</section> });
  expect(host.querySelector(".staff")?.getAttribute("data-zoom")).toBe("1.75");
  await render({ prefs });
  expect(host.querySelector(".staff")?.getAttribute("data-zoom")).toBe("0.75");
  await render({ prefs, course: true });
  expect(host.querySelector(".staff")?.getAttribute("data-zoom")).toBe("1");
});
it.each([
  "course",
  "comparing",
  "wordBoard",
  "scoreBoard",
  "lessonBoard",
  "transcription"
] as const)("keeps %s outside the ordinary piano layout", async (mode) => {
  const changes: Partial<Parameters<typeof Workspace>[0]> =
    mode === "course" || mode === "comparing"
      ? { [mode]: true }
      : mode === "lessonBoard"
        ? { lessonBoard: (score) => score }
        : mode === "transcription"
          ? { transcription: { musicXml: "<score-partwise/>", marks: new Map() } }
          : { [mode]: <div /> };
  await render(changes);
  expect(host.querySelector(".workspace-main")?.hasAttribute("data-piano-layout-reference")).toBe(
    false
  );
  expect(host.querySelector(".workspace-main")?.hasAttribute("data-piano-staff-region")).toBe(
    false
  );
});

it.each(["freeCamera", "performanceScene"] as const)(
  "preserves the legacy %s world layout",
  async (mode) => {
    await render({ prefs: { ...base.prefs, [mode]: true } });
    expect(host.querySelector(".workspace-main")?.hasAttribute("data-piano-layout-reference")).toBe(
      false
    );
    expect(host.querySelector(".workspace-main")?.hasAttribute("data-piano-staff-region")).toBe(
      false
    );
  }
);
