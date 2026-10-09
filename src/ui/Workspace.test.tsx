// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import { Workspace } from "./Workspace";

vi.mock("../staff/Staff", () => ({
  Staff: ({ beat, liveBeat }: { beat: number; liveBeat: () => number }) => (
    <div className="staff" data-beat={beat} data-live-beat={liveBeat()} />
  )
}));

it("shares the score area while keeping the trainer host and supplied song clock", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const trainerHost = createRef<HTMLDivElement>();
  const noop = () => undefined;
  const render = async (tabs: boolean, staff: boolean, scoreFirst: "tabs" | "staff" = "tabs") => {
    await act(async () => {
      await Promise.resolve();
      root.render(
        <Workspace
          staffXml="<score-partwise/>"
          prefs={{ ...DEFAULT_STAFF_PREFS, visible: staff, keyStyle: "perspective", road: true }}
          fixedLines={false}
          beat={2}
          liveBeat={() => 2.5}
          onSeek={noop}
          reviewMarks={undefined}
          transcription={undefined}
          takeStaff="row"
          splitDirection="row"
          comparing={false}
          waiting={false}
          hostRef={trainerHost}
          mirrorHostRef={{ current: null }}
          scoreBoard={tabs ? <div data-testid="tabs">Tabs</div> : undefined}
          scoreFirst={scoreFirst}
          layout={DEFAULT_SCREEN_LAYOUT}
          onLayout={noop}
          onZoom={noop}
          layoutMoved={false}
          onResetLayout={noop}
          editing={false}
        />
      );
    });
  };
  try {
    await render(true, false);
    const lane = trainerHost.current;
    const canvas = lane?.appendChild(document.createElement("canvas"));
    await render(true, true);
    expect(host.querySelector(".course-score-stack [data-testid=tabs]")).not.toBeNull();
    expect(host.querySelector(".course-score-stack .staff")?.getAttribute("data-beat")).toBe("2");
    expect(host.querySelector(".staff")?.getAttribute("data-live-beat")).toBe("2.5");
    expect(host.querySelector(".workspace-main--overlay")).toBeNull();
    expect(host.querySelector(".course-score-stack")?.firstElementChild?.className).toBe(
      "course-score-slot"
    );
    const assertTrainer = () => {
      expect(trainerHost.current).toBe(lane);
      expect(trainerHost.current?.querySelector("canvas")).toBe(canvas);
    };
    assertTrainer();
    const staffElement = host.querySelector(".staff");
    await render(true, true, "staff");
    expect(host.querySelector(".course-score-stack")?.firstElementChild?.className).toBe(
      "staves staves--single"
    );
    expect(host.querySelector(".staff")).toBe(staffElement);
    assertTrainer();
    await render(false, true);
    expect(host.querySelector(".course-score-stack")).toBeNull();
    expect(host.querySelector(".workspace-main > .staves .staff")).not.toBeNull();
    assertTrainer();
    await render(false, false);
    expect(host.querySelector(".staff")).toBeNull();
    expect(host.querySelector("[data-testid=tabs]")).toBeNull();
    assertTrainer();
  } finally {
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  }
});
