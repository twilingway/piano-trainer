import { createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import { createLessonStaffFeedback } from "../staff/lessonStaffFeedback";
import { StaffWorldSource } from "../staff/staffWorldSnapshot";
import { Workspace } from "./Workspace";

const captured = vi.hoisted(() => [] as unknown[]);
vi.mock("../staff/Staff", () => ({
  Staff: (props: { lessonStaffFeedback?: unknown }) => {
    captured.push(props.lessonStaffFeedback);
    return null;
  }
}));
const feedback = createLessonStaffFeedback();
const noop = () => undefined;
const base: ComponentProps<typeof Workspace> = {
  staffXml: "<score-partwise/>",
  prefs: { ...DEFAULT_STAFF_PREFS, visible: true },
  fixedLines: false,
  beat: 0,
  liveBeat: () => 0,
  onSeek: noop,
  reviewMarks: undefined,
  transcription: undefined,
  takeStaff: "off",
  splitDirection: "row",
  comparing: false,
  waiting: false,
  hostRef: createRef<HTMLDivElement>(),
  mirrorHostRef: createRef<HTMLDivElement>(),
  layout: DEFAULT_SCREEN_LAYOUT,
  onLayout: noop,
  onZoom: noop,
  layoutMoved: false,
  onResetLayout: noop,
  editing: false,
  course: true,
  lessonStaffFeedback: feedback
};
beforeEach(() => captured.splice(0));

describe("lesson feedback destination", () => {
  it("delivers feedback to the original course staff only", () => {
    renderToStaticMarkup(
      <Workspace
        {...base}
        transcription={{ musicXml: "<take/>", marks: new Map() }}
        takeStaff="row"
      />
    );
    expect(captured).toEqual([feedback, undefined]);
  });
  it.each([
    { course: false },
    { comparing: true },
    { worldScore: { source: new StaffWorldSource(), hidden: true, error: false } },
    { worldScore: { source: new StaffWorldSource(), hidden: false, error: true } }
  ])("does not deliver lesson feedback to a non-course, review or hidden staff: %j", (change) => {
    renderToStaticMarkup(<Workspace {...base} {...change} />);
    expect(captured.every((source) => source === undefined)).toBe(true);
  });
  it("does not mount a feedback consumer while the staff preference is off", () => {
    renderToStaticMarkup(<Workspace {...base} prefs={{ ...base.prefs, visible: false }} />);
    expect(captured).toEqual([]);
  });
});
