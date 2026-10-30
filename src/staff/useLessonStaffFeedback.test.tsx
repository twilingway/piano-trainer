// @vitest-environment happy-dom
import { act, useLayoutEffect, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLessonStaffFeedback, type LessonStaffFeedbackSource } from "./lessonStaffFeedback";
import type { LessonStaffFeedbackOverlay } from "./lessonStaffFeedbackOverlay";
import type { NoteIndex } from "./staffNoteIndex";
import { useLessonStaffFeedback } from "./useLessonStaffFeedback";

let root: Root, rootHost: HTMLDivElement, staffHost: HTMLDivElement;
let hostRef: RefObject<HTMLElement | null>, indexRef: RefObject<NoteIndex>;
let owner: LessonStaffFeedbackOverlay | null;

function Harness({ source }: { source: LessonStaffFeedbackSource | undefined }) {
  const current = useLessonStaffFeedback(source, hostRef, indexRef);
  useLayoutEffect(() => {
    owner = current.current;
  });
  return null;
}
function publish(source: ReturnType<typeof createLessonStaffFeedback>, noteId = "note") {
  source.publish({
    runId: "run",
    presentationId: "presentation",
    receiptId: noteId,
    notes: [{ noteId, staffBeat: 0, pitch: 60 }]
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  rootHost = document.createElement("div");
  staffHost = document.createElement("div");
  staffHost.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  const head = document.createElementNS("http://www.w3.org/2000/svg", "g");
  head.getBoundingClientRect = () => new DOMRect(50, 50, 10, 10);
  staffHost.append(head);
  document.body.append(rootHost, staffHost);
  hostRef = { current: staffHost };
  indexRef = {
    current: { heads: new Map([["0:60", [head]]]), beats: new Map(), cursorBeats: new Map() }
  };
  owner = null;
  root = createRoot(rootHost);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("has no subscription/replay while disabled, retains its owner on ordinary rerender, and disposes on unmount", () => {
  const source = createLessonStaffFeedback();
  act(() => {
    root.render(<Harness source={undefined} />);
  });
  publish(source);
  expect(staffHost.querySelector(".staff-feedback")).toBeNull();
  act(() => {
    root.render(<Harness source={source} />);
  });
  const mounted = owner;
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(0);
  owner?.ready("presentation");
  publish(source);
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(1);
  act(() => {
    root.render(<Harness source={source} />);
  });
  expect(owner).toBe(mounted);
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(1);
  act(() => {
    root.render(null);
  });
  publish(source, "after-unmount");
  expect(staffHost.querySelector(".staff-feedback")).toBeNull();
});

it("unsubscribes the previous source before enabling its replacement", () => {
  const first = createLessonStaffFeedback(),
    second = createLessonStaffFeedback();
  act(() => {
    root.render(<Harness source={first} />);
  });
  owner?.ready("presentation");
  publish(first);
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(1);
  act(() => {
    root.render(<Harness source={second} />);
  });
  expect(staffHost.querySelectorAll(".staff-feedback")).toHaveLength(1);
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(0);
  owner?.ready("presentation");
  publish(first, "old-source");
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(0);
  publish(second, "new-source");
  expect(staffHost.querySelectorAll(".staff-feedback__pulse")).toHaveLength(1);
});
