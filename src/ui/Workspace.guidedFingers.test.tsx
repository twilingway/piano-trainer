// @vitest-environment happy-dom
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import { Workspace } from "./Workspace";

vi.mock("../staff/Staff", () => ({
  Staff: ({ fingers, musicXml }: { fingers: boolean; musicXml: string }) => (
    <div className="staff" data-fingers={String(fingers)} data-xml={musicXml} />
  )
}));
const xml =
  '<score-partwise><part id="learner"><measure><note id="written-C"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><notations><technical><fingering>1</fingering></technical></notations></note></measure></part></score-partwise>';
const noop = () => undefined;
function props(fingers: boolean): ComponentProps<typeof Workspace> {
  return {
    staffXml: xml,
    prefs: { ...DEFAULT_STAFF_PREFS, visible: true, fingers },
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
    hostRef: { current: null },
    mirrorHostRef: { current: null },
    layout: DEFAULT_SCREEN_LAYOUT,
    onLayout: noop,
    onZoom: noop,
    layoutMoved: false,
    onResetLayout: noop,
    editing: false
  };
}
describe("temporary course fingering display", () => {
  it.each([
    [false, true],
    [true, false],
    [true, undefined],
    [false, undefined]
  ] as const)(
    "renders saved=%s override=%s without changing source fingerings or preferences",
    (saved, override) => {
      const input = props(saved);
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(<Workspace {...input} staffFingers={override} />);
      const staff = host.querySelector(".staff");
      expect(staff?.getAttribute("data-fingers")).toBe(String(override ?? saved));
      expect(staff?.getAttribute("data-xml")).toBe(xml);
      expect(input.prefs.fingers).toBe(saved);
    }
  );
});
