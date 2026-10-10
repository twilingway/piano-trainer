// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { DEFAULT_STAFF_PREFS, type StaffPrefs } from "../app/staffPreferences";
import type { Song } from "../song/song";
import { PianoTabs } from "./PianoTabs";

let host: HTMLDivElement;
let root: Root;
let viewport: number;
let now: number;
let resize: () => void;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;

function song(
  notes: readonly { start: number; duration: number; pitch?: number; finger?: 1 | 2 | 3 | 4 | 5 }[],
  measures = 1
): Song {
  return {
    title: "Synthetic",
    source: "musicxml",
    notes: notes.map((note, index) => ({
      id: `note-${String(index)}`,
      hand: "right",
      pitch: note.pitch ?? 60,
      start: note.start,
      duration: note.duration,
      startBeat: note.start,
      scoreFinger: note.finger ?? 1
    })),
    beats: [
      { time: 0, position: 0, downbeat: true },
      { time: 1, position: 1, downbeat: false }
    ],
    measures: Array.from({ length: measures }, (_, index) => ({
      start: index * 4,
      length: 4,
      beats: 4,
      beatType: 4
    })),
    duration: measures * 4
  };
}

const short = song([
  { start: 0, duration: 1, pitch: 64 },
  { start: 1, duration: 3, pitch: 67 }
]);
const long = song([{ start: 0, duration: 16 }], 4);
const preferences = (patch: Partial<StaffPrefs>): StaffPrefs => ({
  ...DEFAULT_STAFF_PREFS,
  ...patch
});

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
}

function draw(time: number) {
  now = time;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(now);
}

function scrollHost(): HTMLElement {
  const result = host.querySelector<HTMLElement>(".piano-tabs__scroll");
  if (!result) throw new Error("Tabs scroll viewport not rendered");
  return result;
}

beforeEach(() => {
  setInterfaceLanguage("ru");
  viewport = 800;
  now = 0;
  nextFrame = 0;
  frames = new Map();
  resize = () => undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }
  );
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    return this.classList.contains("piano-tabs__scroll") ? viewport : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const scroller = this.closest<HTMLElement>(".piano-tabs__scroll");
    const system = this.closest<HTMLElement>(".piano-tabs__system");
    const content = this.closest<HTMLElement>(".piano-tabs__content");
    const isGrid = this.classList.contains("piano-tabs__grid");
    const left = isGrid
      ? Number.parseFloat(content?.style.paddingInline ?? "0") +
        Number.parseFloat(system?.style.marginLeft ?? "0") +
        Number.parseFloat(
          system?.querySelector<HTMLElement>(".piano-tabs__labels")?.style.width ?? "0"
        ) -
        (scroller?.scrollLeft ?? 0)
      : 0;
    const top = this.classList.contains("piano-tabs__system")
      ? Number(this.dataset.tabRow) * 120 - (scroller?.scrollTop ?? 0)
      : 0;
    return new DOMRect(left, top, viewport, 100);
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  expect(frames.size).toBe(0);
  host.remove();
  setInterfaceLanguage("ru");
  localStorage.removeItem("interface-language-v1");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("piano tabs reader", () => {
  it("keeps a short musical grid compact as the viewport grows and centers it with padding", async () => {
    await render(<PianoTabs song={short} stage="both" time={0} />);
    const grid = host.querySelector<HTMLElement>(".piano-tabs__grid");
    const content = host.querySelector<HTMLElement>(".piano-tabs__content");
    expect(grid?.style.width).toBe("272px");
    expect(content?.style.paddingInline).toBe("214px");
    viewport = 3440;
    await act(async () => {
      resize();
      await Promise.resolve();
    });
    expect(grid?.style.width).toBe("272px");
    expect(content?.style.paddingInline).toBe("1534px");
    draw(100);
    expect(scrollHost().scrollLeft).toBe(0);
  });

  it("applies zoom, Russian names, hiding fingers and palette changes during the same song", async () => {
    await render(<PianoTabs song={short} stage="right" time={0} />);
    const viewportNode = scrollHost();
    expect(host.querySelector('[aria-label="Таб E, палец 1"]')).not.toBeNull();
    await render(
      <PianoTabs
        song={short}
        stage="right"
        time={0}
        prefs={preferences({
          zoom: 2,
          fingers: false,
          noteNames: "ru",
          noteColor: "#123456",
          scoreColor: "#abcdef"
        })}
      />
    );
    expect(scrollHost()).toBe(viewportNode);
    expect(host.querySelector(".piano-tabs__finger")).toBeNull();
    expect(host.querySelector('[aria-label="Таб ми"]')).not.toBeNull();
    expect(host.querySelector<HTMLElement>(".piano-tabs__grid")?.style.width).toBe("584px");
    const section = host.querySelector<HTMLElement>(".piano-tabs");
    expect(section?.style.getPropertyValue("--tabs-notes")).toBe("#123456");
    expect(section?.style.getPropertyValue("--tabs-score")).toBe("#abcdef");
    await render(
      <PianoTabs song={short} stage="right" time={0} prefs={preferences({ noteNames: "off" })} />
    );
    expect(host.querySelector('[aria-label="Таб E, палец 1"]')).not.toBeNull();
  });

  it("uses the shared finger palette or the configured score color", async () => {
    await render(
      <PianoTabs
        song={short}
        stage="both"
        time={0}
        prefs={preferences({ fingerColors: "fingers" })}
      />
    );
    const finger = host.querySelector<HTMLElement>(".piano-tabs__finger");
    expect(finger?.style.color).toBe("#c528f5");
    await render(
      <PianoTabs
        song={short}
        stage="both"
        time={0}
        prefs={preferences({ fingerColors: "mono", scoreColor: "#123456" })}
      />
    );
    expect(finger?.style.color).toBe("#123456");
  });

  it("shows harmony from the original song and hides symbols without hiding its sounds", async () => {
    const harmony = song([
      { start: 0, duration: 4, pitch: 60 },
      { start: 0, duration: 4, pitch: 64 },
      { start: 0, duration: 4, pitch: 67 }
    ]);
    await render(
      <PianoTabs
        song={short}
        baseSong={harmony}
        stage="both"
        time={0}
        prefs={preferences({ chords: true })}
      />
    );
    expect(host.querySelector(".piano-tabs__harmony")?.textContent).toBe("C");
    expect(host.querySelectorAll(".piano-tabs__note")).toHaveLength(2);
    await render(
      <PianoTabs
        song={short}
        baseSong={harmony}
        stage="both"
        time={0}
        prefs={preferences({ chords: false })}
      />
    );
    expect(host.querySelector(".piano-tabs__harmony")).toBeNull();
    expect(host.querySelectorAll(".piano-tabs__note")).toHaveLength(2);
  });

  it("draws each chord note with its own release rather than the longest chord duration", async () => {
    const unequal = song([
      { start: 0, duration: 1, pitch: 64 },
      { start: 0, duration: 3, pitch: 67 }
    ]);
    await render(<PianoTabs song={unequal} stage="both" time={0} />);
    expect(
      host.querySelector('[aria-label="Таб E, палец 1"]')?.closest<HTMLElement>(".piano-tabs__tone")
        ?.style.width
    ).toBe("68px");
    expect(
      host.querySelector('[aria-label="Таб G, палец 1"]')?.closest<HTMLElement>(".piano-tabs__tone")
        ?.style.width
    ).toBe("204px");
  });

  it("continues holds over shared row breaks without repeating names or fingers", async () => {
    const crossing = song([{ start: 7, duration: 3 }], 5);
    await render(
      <PianoTabs
        song={crossing}
        stage="both"
        time={8}
        prefs={preferences({ singleLine: false, measuresPerLine: 2 })}
      />
    );
    expect(host.querySelectorAll(".piano-tabs__system")).toHaveLength(3);
    expect(host.querySelectorAll(".piano-tabs__note")).toHaveLength(1);
    const continuation = host.querySelector<HTMLElement>('[data-tab-row="1"] .piano-tabs__tone');
    expect(continuation?.style.width).toBe("136px");
    expect(continuation?.querySelector(".piano-tabs__note")).toBeNull();
    expect(continuation?.querySelector<HTMLElement>(".piano-tabs__sustain")?.style.left).toBe(
      "0px"
    );
    draw(0);
    expect(
      host.querySelector<HTMLElement>('[data-tab-row="0"] .piano-tabs__cursor')?.style.visibility
    ).toBe("hidden");
    expect(
      host.querySelector<HTMLElement>('[data-tab-row="1"] .piano-tabs__cursor')?.style.transform
    ).toBe("translateX(0px)");
  });

  it("centers a shorter last row independently of the full rows", async () => {
    const fiveBars = song([{ start: 0, duration: 20 }], 5);
    await render(
      <PianoTabs
        song={fiveBars}
        stage="both"
        time={0}
        prefs={preferences({ singleLine: false, measuresPerLine: 2 })}
      />
    );
    const systems = [...host.querySelectorAll<HTMLElement>(".piano-tabs__system")];
    expect(systems).toHaveLength(3);
    expect(systems[0]?.style.marginLeft).toBe("0px");
    expect(systems[1]?.style.marginLeft).toBe("0px");
    expect(systems[2]?.style.marginLeft).toBe("136px");
    const centers = systems.map((system) => {
      const grid = system.querySelector<HTMLElement>(".piano-tabs__grid");
      const labels = system.querySelector<HTMLElement>(".piano-tabs__labels");
      return (
        Number.parseFloat(system.style.marginLeft) +
        (Number.parseFloat(grid?.style.width ?? "0") +
          Number.parseFloat(labels?.style.width ?? "0")) /
          2
      );
    });
    expect(centers).toEqual([322, 322, 322]);
  });

  it("reads the live clock between static snapshots, freezes on pause and follows seeks and the end", async () => {
    let beat = 0;
    await render(<PianoTabs song={short} stage="both" time={0} liveBeat={() => beat} />);
    const cursor = host.querySelector<HTMLElement>(".piano-tabs__cursor");
    beat = 0.5;
    draw(16);
    expect(cursor?.style.transform).toBe("translateX(34px)");
    beat = 1.5;
    draw(32);
    expect(cursor?.style.transform).toBe("translateX(102px)");
    expect(host.querySelector('[aria-label="Таб E, палец 1"]')?.getAttribute("data-current")).toBe(
      "false"
    );
    draw(1000);
    expect(cursor?.style.transform).toBe("translateX(102px)");
    beat = 0.25;
    draw(1016);
    expect(cursor?.style.transform).toBe("translateX(17px)");
    beat = 4;
    draw(1032);
    expect(cursor?.style.transform).toBe("translateX(272px)");
    expect(host.querySelectorAll('.piano-tabs__note[data-current="true"]')).toHaveLength(0);
  });

  it("preserves manual horizontal and vertical scroll with follow switched off", async () => {
    viewport = 100;
    let beat = 0;
    await render(
      <PianoTabs
        song={long}
        stage="both"
        time={0}
        liveBeat={() => beat}
        prefs={preferences({ follow: false })}
      />
    );
    const scroll = scrollHost();
    scroll.scrollLeft = 123;
    scroll.scrollTop = 45;
    beat = 6;
    draw(100);
    expect(scroll.scrollLeft).toBe(123);
    expect(scroll.scrollTop).toBe(45);
    expect(host.querySelector<HTMLElement>(".piano-tabs__cursor")?.style.transform).toBe(
      "translateX(408px)"
    );
  });

  it.each(["wheel", "pointerdown", "touchstart", "keydown"])(
    "smoothly follows overflow and temporarily yields to a manual %s gesture",
    async (gesture) => {
      viewport = 100;
      let beat = 0;
      await render(<PianoTabs song={long} stage="both" time={0} liveBeat={() => beat} />);
      const scroll = scrollHost();
      draw(0);
      expect(scroll.scrollLeft).toBe(70);
      beat = 0.25;
      draw(100);
      expect(scroll.scrollLeft).toBeGreaterThan(70);
      expect(scroll.scrollLeft).toBeLessThan(87);
      scroll.dispatchEvent(new Event(gesture));
      if (gesture === "pointerdown") window.dispatchEvent(new Event("pointerup"));
      scroll.scrollLeft = 120;
      beat = 0.5;
      draw(200);
      expect(scroll.scrollLeft).toBe(120);
      beat = 0.75;
      draw(2599);
      expect(scroll.scrollLeft).toBe(120);
      beat = 1;
      draw(2700);
      expect(scroll.scrollLeft).toBeGreaterThan(120);
      expect(scroll.scrollLeft).toBeLessThan(138);
    }
  );

  it.each(["pointerup", "pointercancel"])(
    "yields throughout a long pointer drag and resumes 2.5 seconds after %s",
    async (release) => {
      viewport = 100;
      let beat = 0;
      await render(<PianoTabs song={long} stage="both" time={0} liveBeat={() => beat} />);
      const scroll = scrollHost();
      draw(0);
      scroll.dispatchEvent(new Event("pointerdown"));
      scroll.scrollLeft = 120;
      beat = 0.25;
      draw(5000);
      expect(scroll.scrollLeft).toBe(120);
      expect(host.querySelector<HTMLElement>(".piano-tabs__cursor")?.style.transform).toBe(
        "translateX(17px)"
      );
      window.dispatchEvent(new Event(release));
      beat = 0.5;
      draw(7499);
      expect(scroll.scrollLeft).toBe(120);
      beat = 1;
      draw(7516);
      expect(scroll.scrollLeft).toBeGreaterThan(120);
      expect(scroll.scrollLeft).toBeLessThan(138);
    }
  );

  it("removes window pointer release listeners and cancels animation when the reader closes", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    await render(<PianoTabs song={long} stage="both" time={0} />);
    await render(<div />);
    for (const event of ["pointerup", "pointercancel"]) {
      const registrations = added.mock.calls.filter(([type]) => type === event);
      expect(registrations.length).toBeGreaterThan(0);
      for (const [, listener] of registrations) {
        expect(
          removed.mock.calls.some(([type, handler]) => type === event && handler === listener)
        ).toBe(true);
      }
    }
    expect(frames.size).toBe(0);
  });
});
