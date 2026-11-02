// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { createAppStore, type AppStore } from "../app/store";
import { withTestStore } from "../app/storeTestSupport";
import { generateRhythmExercise } from "../rhythm/generator";
import { RhythmSession } from "../rhythm/session";
import type { RhythmResult } from "../rhythm/types";
import { RhythmCourseCard, RhythmPanel, type RhythmPanelProps } from "./RhythmCourse";
import { RhythmMetrics, RhythmProgress } from "./RhythmProgress";

let host: HTMLDivElement;
let root: Root;
let store: AppStore;
const noop = () => undefined;

async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(withTestStore(node, store));
  });
}

async function reveal(id: string, open = true) {
  const details = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!details) throw new Error(`Missing disclosure: ${id}`);
  await act(async () => {
    await Promise.resolve();
    details.open = open;
    details.dispatchEvent(new Event("toggle"));
  });
}

function button(text: string) {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function dispatch(target: HTMLElement, event: Event) {
  await act(async () => {
    await Promise.resolve();
    target.dispatchEvent(event);
  });
}

function keyboard(type: "keydown" | "keyup", key: string, code: string, repeat = false) {
  return new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code, repeat });
}

function props(): RhythmPanelProps {
  return {
    bpm: 60,
    source: "keyboard",
    status: "running",
    ready: true,
    midiAvailable: false,
    compensated: false,
    effectiveOffsetMs: 0,
    onBpm: noop,
    onSource: noop,
    onStart: noop,
    onRepeat: noop,
    onNewSeries: noop,
    onExit: noop,
    onCalibrate: noop,
    onRetryStaff: noop,
    onTapDown: noop,
    onTapUp: noop
  };
}

function missedRun(runId: string, bpm: 60 | 80 | 100 = 60): RhythmResult {
  const exercise = generateRhythmExercise(42, bpm);
  const session = new RhythmSession(exercise, {
    runId,
    source: "keyboard",
    startedAt: 1000,
    startedAtMs: 0,
    offsets: {
      inputOffsetMs: 0,
      manualInputOffsetMs: 0,
      audioOutputOffsetMs: 0,
      visualOffsetMs: 0,
      status: "uncalibrated"
    }
  });
  session.advance(exercise.durationS + 1);
  const result = session.result(2000);
  if (!result) throw new Error("Missing completed result");
  return result;
}

beforeEach(() => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  store = createAppStore();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
  localStorage.removeItem("interface-language-v1");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("rhythm input button", () => {
  it("keeps the same held tap mounted across guidance and settings toggles", async () => {
    const current = {
      ...props(),
      source: "pointer" as const,
      onTapDown: vi.fn(),
      onTapUp: vi.fn(),
      onStart: vi.fn(),
      onBpm: vi.fn(),
      onSource: vi.fn()
    };
    await render(<RhythmPanel {...current} />);
    const tap = button("Ударить");
    Object.defineProperty(tap, "setPointerCapture", { value: vi.fn(), configurable: true });
    await dispatch(
      tap,
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 7 })
    );
    await reveal("rhythm:practice:guide");
    await reveal("rhythm:practice:settings");
    await reveal("rhythm:practice:guide", false);
    await reveal("rhythm:practice:settings", false);
    expect(button("Ударить")).toBe(tap);
    await dispatch(tap, new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
    expect(current.onTapDown).toHaveBeenCalledOnce();
    expect(current.onTapUp).toHaveBeenCalledExactlyOnceWith("pointer", "pointer:7");
    expect(current.onStart).not.toHaveBeenCalled();
    expect(current.onBpm).not.toHaveBeenCalled();
    expect(current.onSource).not.toHaveBeenCalled();
  });
  it("keeps current rhythm metrics visible while old history remains unmounted", async () => {
    const result = missedRun("current");
    await render(
      <RhythmPanel
        {...props()}
        status="completed"
        progress={<RhythmProgress history={[result]} result={result} />}
      />
    );
    expect(host.querySelector('[aria-label="Результат ритма"]')).not.toBeNull();
    expect(host.querySelector('[data-window-detail="rhythm:history"]')).toBeNull();
    expect(button("Ударить").closest("details")).toBeNull();
    await reveal("rhythm:practice:progress");
    expect(host.querySelector('[data-window-detail="rhythm:history"]')).not.toBeNull();
    expect(host.querySelector('[data-window-detail="rhythm:progress"]')).not.toBeNull();
  });
  it("records the keydown timestamp once and preserves keyboard activation source", async () => {
    const current = { ...props(), onTapDown: vi.fn(), onTapUp: vi.fn() };
    await render(<RhythmPanel {...current} />);
    const tap = button("Ударить");
    const down = keyboard("keydown", " ", "Space");
    Object.defineProperty(down, "timeStamp", { value: 1234 });
    const propagated = vi.fn();
    document.addEventListener("keydown", propagated);
    await dispatch(tap, down);
    await dispatch(tap, keyboard("keydown", " ", "Space", true));
    await dispatch(tap, keyboard("keyup", " ", "Space"));
    await dispatch(tap, new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(current.onTapDown.mock.calls).toEqual([["keyboard", 1234, "key:Space"]]);
    expect(current.onTapUp).toHaveBeenCalledWith("keyboard", "key:Space");
    expect(propagated).not.toHaveBeenCalled();
    document.removeEventListener("keydown", propagated);
    expect(down.defaultPrevented).toBe(true);
    const enter = keyboard("keydown", "Enter", "Enter");
    Object.defineProperty(enter, "timeStamp", { value: 1300 });
    await dispatch(tap, enter);
    expect(current.onTapDown).toHaveBeenLastCalledWith("keyboard", 1300, "key:Enter");
  });

  it("ignores keyboard activation in a pointer series and allows release after interruption", async () => {
    const current = {
      ...props(),
      source: "pointer" as const,
      onTapDown: vi.fn(),
      onTapUp: vi.fn()
    };
    await render(<RhythmPanel {...current} />);
    const tap = button("Ударить");
    await dispatch(tap, keyboard("keydown", "Enter", "Enter"));
    await dispatch(tap, new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(current.onTapDown).not.toHaveBeenCalled();
    await render(<RhythmPanel {...current} status="cancelled" />);
    expect(tap.disabled).toBe(false);
    expect(tap.getAttribute("aria-disabled")).toBe("true");
    await dispatch(tap, keyboard("keyup", " ", "Space"));
    expect(current.onTapUp).toHaveBeenCalledWith("keyboard", "key:Space");
  });

  it("records pointerdown time, captures release and ignores the later click", async () => {
    const current = {
      ...props(),
      source: "pointer" as const,
      onTapDown: vi.fn(),
      onTapUp: vi.fn()
    };
    await render(<RhythmPanel {...current} />);
    const tap = button("Ударить");
    const capture = vi.fn();
    Object.defineProperty(tap, "setPointerCapture", { value: capture, configurable: true });
    const down = new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 3 });
    Object.defineProperty(down, "timeStamp", { value: 9876 });
    await dispatch(tap, down);
    await dispatch(tap, new PointerEvent("pointerup", { bubbles: true, pointerId: 3 }));
    await dispatch(tap, new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(current.onTapDown.mock.calls).toEqual([["pointer", 9876, "pointer:3"]]);
    expect(capture).toHaveBeenCalledWith(3);
    expect(current.onTapUp).toHaveBeenCalledWith("pointer", "pointer:3");
  });

  it("does not turn source selection or other commands into taps", async () => {
    const current = {
      ...props(),
      status: "idle" as const,
      onTapDown: vi.fn(),
      onStart: vi.fn(),
      onBpm: vi.fn(),
      onSource: vi.fn()
    };
    await render(<RhythmPanel {...current} />);
    await dispatch(button("Начать ритм"), keyboard("keydown", " ", "Space"));
    await dispatch(button("Начать ритм"), new MouseEvent("click", { bubbles: true }));
    expect(current.onStart).toHaveBeenCalledOnce();
    expect(current.onTapDown).not.toHaveBeenCalled();
    expect(host.querySelector("select")).toBeNull();
    await reveal("rhythm:practice:settings");
    const selects = host.querySelectorAll("select");
    const bpm = selects[0];
    const source = selects[1];
    if (!bpm || !source) throw new Error("Missing rhythm selectors");
    expect([...bpm.options].map((option) => option.value)).toEqual(["60", "80", "100"]);
    bpm.value = "100";
    await dispatch(bpm, new Event("change", { bubbles: true }));
    source.value = "midi";
    await dispatch(source, new Event("change", { bubbles: true }));
    expect(current.onBpm).toHaveBeenCalledWith(100);
    expect(current.onSource).toHaveBeenCalledWith("midi");
  });
});

describe("rhythm course and progress", () => {
  it("offers the course without progression and translates readiness and source failures", async () => {
    const start = vi.fn();
    await render(<RhythmCourseCard onStart={start} />);
    await dispatch(button("Читать и отбивать ритм"), new MouseEvent("click", { bubbles: true }));
    expect(start).toHaveBeenCalledOnce();
    await render(<RhythmPanel {...props()} source="midi" status="error" error="audio" />);
    expect(button("Начать ритм").disabled).toBe(true);
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Connect and select a MIDI device");
    expect(host.textContent).toContain("Couldn't start the metronome");
    expect(button("Tap").getAttribute("aria-disabled")).toBe("true");
    await reveal("rhythm:practice:settings");
    expect(host.textContent).toContain("No calibration profile: input compensation is 0 ms.");
  });

  it("shows no data instead of zero deviation when every onset is missed", async () => {
    const result = missedRun("missing");
    await render(<RhythmMetrics summary={result.summary} />);
    expect(host.textContent).toContain("Попадания: 0 из 10 (0%).");
    expect(host.querySelectorAll('[aria-label="Нет данных об отклонении ритма"]')).toHaveLength(2);
    expect(host.textContent).toContain("Пропуски ритма10");
  });

  it("keeps different BPM, source, rules and offsets in separate progress groups", async () => {
    const first = missedRun("first");
    const history: RhythmResult[] = [
      first,
      missedRun("tempo", 100),
      { ...first, runId: "source", source: "pointer" },
      { ...first, runId: "rules", rulesVersion: 2 },
      { ...first, runId: "offset", offsets: { ...first.offsets, manualInputOffsetMs: 25 } }
    ];
    await render(<RhythmProgress history={history} result={null} />);
    expect(host.querySelector(".rhythm-progress-group")).toBeNull();
    await reveal("rhythm:practice:progress");
    const progress = host.querySelector('[data-window-detail="rhythm:progress"]');
    expect(progress?.querySelectorAll(".rhythm-progress-group")).toHaveLength(5);
    expect(
      host.querySelector('[data-window-detail="rhythm:history"]')?.querySelector("summary")
        ?.textContent
    ).toBe("История ритма: 5");
    expect(progress?.textContent).toContain("вручную 25");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Rhythm history: 5");
    expect(host.textContent).toContain("Median absolute deviation, ms");
    expect(host.textContent).toContain("no data");
  });
});
