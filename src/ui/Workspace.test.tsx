import { renderToStaticMarkup } from "react-dom/server";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import { StaffWorldSource } from "../staff/staffWorldSnapshot";
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
          prefs={{ ...DEFAULT_STAFF_PREFS, visible: staff, keyStyle: "3d", road: true }}
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
    expect(host.querySelector(".workspace-main--overlay")).toBeNull();
    const score = host.querySelector(".workspace-main > .staves");
    const lanes = host.querySelector(".lanes");
    expect(score?.compareDocumentPosition(lanes as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

it.each(["loading", "error", "ready"] as const)(
  "shows native hand status %s only beside visible 3D hands",
  async (handStatus) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    const noop = () => undefined;
    const render = async (keyStyle: "classic" | "3d", hands: boolean) => {
      await act(async () => {
        await Promise.resolve();
        root.render(
          <Workspace
            staffXml={undefined}
            prefs={{ ...DEFAULT_STAFF_PREFS, keyStyle, hands }}
            fixedLines={false}
            beat={0}
            liveBeat={() => 0}
            onSeek={noop}
            reviewMarks={undefined}
            transcription={undefined}
            takeStaff="row"
            splitDirection="row"
            comparing={false}
            waiting={false}
            hostRef={{ current: null }}
            mirrorHostRef={{ current: null }}
            layout={DEFAULT_SCREEN_LAYOUT}
            onLayout={noop}
            onZoom={noop}
            layoutMoved={false}
            onResetLayout={noop}
            editing={false}
            handStatus={handStatus}
          />
        );
      });
    };
    try {
      await render("3d", true);
      expect(host.querySelector(".hands-status") !== null).toBe(handStatus !== "ready");
      if (handStatus !== "ready")
        expect(host.querySelector(".hands-status")?.getAttribute("role")).toBe("status");
      await render("classic", true);
      expect(host.querySelector(".hands-status")).toBeNull();
      await render("3d", false);
      expect(host.querySelector(".hands-status")).toBeNull();
    } finally {
      await act(async () => {
        await Promise.resolve();
        root.unmount();
      });
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

it.each(["ru", "en"] as const)(
  "announces count-in and pending audio in %s without a zero digit",
  (language) => {
    setInterfaceLanguage(language);
    const noop = () => undefined;
    const markup = (countdown: number | null) =>
      renderToStaticMarkup(
        <Workspace
          staffXml={undefined}
          prefs={DEFAULT_STAFF_PREFS}
          fixedLines={false}
          beat={0}
          liveBeat={() => 0}
          onSeek={noop}
          reviewMarks={undefined}
          transcription={undefined}
          takeStaff="row"
          splitDirection="row"
          comparing={false}
          waiting={false}
          hostRef={{ current: null }}
          mirrorHostRef={{ current: null }}
          layout={DEFAULT_SCREEN_LAYOUT}
          onLayout={noop}
          onZoom={noop}
          layoutMoved={false}
          onResetLayout={noop}
          editing={false}
          countdown={countdown}
        />
      );
    const count = markup(3);
    expect(count).toContain('class="play-countdown" role="status"');
    expect(count).toContain(language === "ru" ? "Приготовьтесь" : "Get ready");
    expect(count).toContain("<strong>3</strong>");
    const preparing = markup(0);
    expect(preparing).toContain(language === "ru" ? "Готовим звук…" : "Preparing sound…");
    expect(preparing).not.toContain("<strong>0</strong>");
    expect(markup(null)).not.toContain('class="play-countdown"');
    setInterfaceLanguage("ru");
  }
);

it("leaves native 3D keys in front of their rail while flat views keep the screen boundary", () => {
  const noop = () => undefined;
  const markup = (keyStyle: "classic" | "arcade" | "3d", keys: boolean) =>
    renderToStaticMarkup(
      <Workspace
        staffXml={undefined}
        prefs={{ ...DEFAULT_STAFF_PREFS, keyStyle, keys }}
        fixedLines={false}
        beat={0}
        liveBeat={() => 0}
        onSeek={noop}
        reviewMarks={undefined}
        transcription={undefined}
        takeStaff="row"
        splitDirection="row"
        comparing={false}
        waiting={false}
        hostRef={{ current: null }}
        mirrorHostRef={{ current: null }}
        layout={DEFAULT_SCREEN_LAYOUT}
        onLayout={noop}
        onZoom={noop}
        layoutMoved={false}
        onResetLayout={noop}
        editing={false}
      />
    );
  expect(markup("3d", true)).not.toContain("lane-neon-edge--hit");
  expect(markup("3d", false)).toContain("lane-neon-edge--hit");
  expect(markup("classic", true)).toContain("lane-neon-edge--hit");
  expect(markup("arcade", true)).toContain("lane-neon-edge--hit");
});

it("keeps the measured DOM score mounted and restores it on poster failure", () => {
  const source = new StaffWorldSource();
  const props = {
    staffXml: "<score-partwise/>",
    prefs: DEFAULT_STAFF_PREFS,
    fixedLines: false,
    beat: 0,
    liveBeat: () => 0,
    onSeek: () => undefined,
    reviewMarks: undefined,
    transcription: undefined,
    takeStaff: "row" as const,
    splitDirection: "row" as const,
    comparing: false,
    waiting: false,
    hostRef: { current: null },
    mirrorHostRef: { current: null },
    layout: DEFAULT_SCREEN_LAYOUT,
    onLayout: () => undefined,
    onZoom: () => undefined,
    layoutMoved: false,
    onResetLayout: () => undefined,
    editing: false
  };
  const hidden = renderToStaticMarkup(
    <Workspace {...props} worldScore={{ source, hidden: true, error: false }} />
  );
  expect(hidden).toContain("visibility:hidden");
  expect(hidden).toContain('class="staff"');
  expect(hidden).not.toContain("display:none");
  setInterfaceLanguage("en");
  try {
    const fallback = renderToStaticMarkup(
      <Workspace {...props} worldScore={{ source, hidden: false, error: true }} />
    );
    expect(fallback).not.toContain("visibility:hidden");
    expect(fallback).toContain("Could not show the score in 3D");
  } finally {
    setInterfaceLanguage("ru");
  }
});
