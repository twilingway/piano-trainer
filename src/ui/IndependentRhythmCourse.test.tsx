// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { summarizeIndependentRhythmOutcomes } from "../independentRhythm/progress";
import type {
  IndependentRhythmPhaseResult,
  IndependentRhythmResult,
  IndependentRhythmSummary
} from "../independentRhythm/types";
import { IndependentRhythmIntro } from "./IndependentRhythmIntro";
import {
  IndependentRhythmCourseCard,
  IndependentRhythmPracticePanel,
  type IndependentRhythmPracticeProps
} from "./IndependentRhythmCourse";
import { IndependentRhythmProgress, IndependentRhythmResults } from "./IndependentRhythmProgress";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
});
function render(node: ReactNode, locale: "ru" | "en" = "ru") {
  act(() => {
    setInterfaceLanguage(locale);
    root.render(node);
  });
}
function reveal(id: string) {
  const details = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!details) throw new Error(`Missing disclosure: ${id}`);
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

function button(label: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent === label);
}
function blankSummary(): IndependentRhythmSummary {
  return summarizeIndependentRhythmOutcomes([], []);
}
function props(): IndependentRhythmPracticeProps {
  return {
    phase: "pulse",
    status: "preparation",
    ready: true,
    allReleased: true,
    source: "keyboard",
    midiAvailable: false,
    midiChannel: null,
    showKeyHints: false,
    result: null,
    pulseSummary: null,
    bindings: [
      { pitch: 48, label: "X" },
      { pitch: 60, label: "7" }
    ],
    history: [],
    sourceFilter: "all",
    onSourceFilter: vi.fn(),
    onSource: vi.fn(),
    onShowKeyHints: vi.fn(),
    onStart: vi.fn(),
    onRepeat: vi.fn(),
    onNewSeries: vi.fn(),
    onExit: vi.fn(),
    onGoToRhythm: vi.fn(),
    onRetryStaff: vi.fn()
  };
}
// A view fixture, not a persisted proof: replay validity is tested in the pure core.
function result(source: "keyboard" | "midi", id: string): IndependentRhythmResult {
  const outcomes = Array.from({ length: 24 }, (_, index) => ({
    noteId: `${id}:${String(index)}`,
    pitch: index < 12 ? 48 : 60,
    hand: index < 12 ? ("left" as const) : ("right" as const),
    onset: index % 12,
    outcome: index < 12 ? ("miss" as const) : ("hit" as const),
    eventSequence: index < 12 ? null : index,
    deviationMs: index < 12 ? null : -25
  }));
  const summary = summarizeIndependentRhythmOutcomes(outcomes, [
    { eventSequence: 25, pitch: 36, hand: null, songTime: 2 }
  ]);
  const phase: IndependentRhythmPhaseResult = {
    phaseId: id,
    phase: "two-hands",
    config: { runId: id, presentationId: id, source, offsetMs: 0 },
    musicXml: "",
    scoreFingerprint: id,
    presentedAtMs: 0,
    startedAtMs: 0,
    finalizedAtMs: 16251,
    clock: {
      segments: [],
      atMs: 16251,
      songTime: 16,
      startPerformanceMs: 0,
      endPerformanceMs: 16000,
      ended: true
    },
    events: [],
    help: [],
    channel: null,
    outcomes,
    extras: [{ eventSequence: 25, pitch: 36, hand: null, songTime: 2 }],
    summary,
    passed: false
  };
  return {
    id,
    runId: id,
    skillId: "independent-rhythm-reading",
    task: "independent-rhythms",
    exerciseId: id,
    seed: 1,
    generatorVersion: 1,
    rulesVersion: 1,
    startedAt: 1,
    completedAt: 2,
    createdAt: 2,
    inputSource: source,
    pulse: {
      ...phase,
      phase: "pulse",
      passed: true,
      help: [{ presentationId: id, atMs: 0, pitches: [60] }]
    },
    series: phase
  };
}

describe("independent rhythm interface", () => {
  it("offers pulse as primary, keeps intro secondary and mounts history on demand", () => {
    const current = props();
    const onStart = vi.fn(),
      onIntro = vi.fn();
    render(
      <IndependentRhythmCourseCard
        {...current}
        history={[result("keyboard", "saved")]}
        onStart={onStart}
        onIntro={onIntro}
      />
    );
    const actions = host.querySelectorAll(".reading-actions > button");
    expect(actions[0]?.textContent).toBe("Открыть проверку пульса");
    expect(button("Знакомство с двумя ритмами")).toBeUndefined();
    reveal("two-rhythms:catalog:more");
    expect(
      button("Знакомство с двумя ритмами")?.classList.contains("lesson-secondary-action")
    ).toBe(true);
    expect(host.querySelector('[data-window-detail="independent-rhythm:history"]')).toBeNull();
    act(() => {
      button("Открыть проверку пульса")?.click();
      button("Знакомство с двумя ритмами")?.click();
    });
    expect(onStart).toHaveBeenCalledOnce();
    expect(onIntro).toHaveBeenCalledOnce();
    reveal("independent-rhythm:catalog:progress");
    expect(host.querySelector('[data-window-detail="independent-rhythm:history"]')).not.toBeNull();
    expect(current.onSourceFilter).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledOnce();
  });
  it("keeps a completed result visible without mounting history or issuing commands from guidance", () => {
    const current = props();
    render(
      <IndependentRhythmPracticePanel
        {...current}
        status="completed"
        result={result("keyboard", "current")}
        history={[result("keyboard", "old")]}
      />
    );
    expect(host.querySelector('[aria-label="Результат двух ритмов"]')).not.toBeNull();
    expect(host.querySelector('[data-window-detail="independent-rhythm:history"]')).toBeNull();
    reveal("independent-rhythm:practice:guide");
    expect(host.textContent).toContain("Одной мышью");
    expect(current.onShowKeyHints).not.toHaveBeenCalled();
    expect(current.onStart).not.toHaveBeenCalled();
    expect(current.onRepeat).not.toHaveBeenCalled();
    expect(current.onNewSeries).not.toHaveBeenCalled();
    reveal("independent-rhythm:practice:progress");
    expect(host.querySelector('[data-window-detail="independent-rhythm:history"]')).not.toBeNull();
  });
  it("explains both phases, onset limits, physical limitations and actual two-key bindings", () => {
    render(
      <IndependentRhythmIntro bindings={props().bindings} onStart={vi.fn()} onClose={vi.fn()} />
    );
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("C3");
    expect(rows[0]?.textContent).toContain("X");
    expect(rows[1]?.textContent).toContain("C4");
    expect(rows[1]?.textContent).toContain("7");
    expect(host.textContent).toContain("восемь четвертей C4");
    expect(host.textContent).toContain("без дополнительного порога 200 мс");
    expect(host.textContent).toContain("Длительность удержания, легато и педаль не оцениваются");
    expect(host.textContent).toContain("не видит ваши руки и пальцы");
    expect(host.textContent).toContain("Одной мышью");
    expect(host.textContent).toContain("передавать обе клавиши одновременно");
  });
  it("blocks manual start while any key is held and reveals preparation hints only when ready", () => {
    const value = props();
    render(<IndependentRhythmPracticePanel {...value} ready={false} allReleased={false} />);
    expect(button("Начать проверку пульса")?.disabled).toBe(true);
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    reveal("independent-rhythm:practice:settings");
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
    expect(host.textContent).toContain("Отпустите все нажатые клавиши");
    render(<IndependentRhythmPracticePanel {...value} />);
    expect(button("Начать проверку пульса")?.disabled).toBe(false);
    act(() => {
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
      button("Начать проверку пульса")?.click();
    });
    expect(value.onShowKeyHints).toHaveBeenCalledWith(true);
    expect(value.onStart).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("Название ноты через");
  });
  it("shows a localized count-in without an enabled phase start or wait hints", () => {
    render(
      <IndependentRhythmPracticePanel
        {...props()}
        status="count-in"
        countInBeat={3}
        showKeyHints
      />,
      "en"
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain("four count-in beats");
    expect(host.textContent).toContain("Count-in beat: 3 of 4");
    expect(host.textContent).toContain("Play two rhythms");
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button("Start the pulse check")).toBeUndefined();
    expect(host.querySelector("select")).toBeNull();
    reveal("independent-rhythm:practice:settings");
    expect(host.querySelector("select")?.disabled).toBe(true);
  });
  it("does not let eight provisional hits or previous history bypass pulse finalization", () => {
    const value = props();
    const summary = blankSummary();
    render(
      <IndependentRhythmPracticePanel
        {...value}
        status="finalizing"
        history={[result("keyboard", "old")]}
        pulseSummary={{ ...summary, right: { ...summary.right, expected: 8, hits: 8 } }}
      />
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Дождитесь итогового допуска"
    );
    expect(button("Начать два ритма")).toBeUndefined();
    expect(button("Начать проверку пульса")).toBeUndefined();
    expect(value.onStart).not.toHaveBeenCalled();
  });
  it("offers failed-pulse retry and the rhythm course without exposing main phase start", () => {
    const value = props();
    render(
      <IndependentRhythmPracticePanel {...value} status="failed" pulseSummary={blankSummary()} />
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "нужны 8 попаданий и 0 лишних"
    );
    expect(button("Начать два ритма")).toBeUndefined();
    act(() => {
      button("Повторить с проверки пульса")?.click();
      button("Перейти к курсу «Ритм»")?.click();
    });
    expect(value.onRepeat).toHaveBeenCalledOnce();
    expect(value.onGoToRhythm).toHaveBeenCalledOnce();
  });
  it("starts the main phase only by explicit action after full release", () => {
    const value = props();
    render(
      <IndependentRhythmPracticePanel
        {...value}
        phase="two-hands"
        status="passed"
        allReleased={false}
      />
    );
    expect(button("Начать два ритма")?.disabled).toBe(true);
    expect(value.onStart).not.toHaveBeenCalled();
    render(<IndependentRhythmPracticePanel {...value} phase="two-hands" status="passed" />);
    expect(button("Начать два ритма")?.disabled).toBe(false);
    act(() => {
      button("Начать два ритма")?.click();
    });
    expect(value.onStart).toHaveBeenCalledOnce();
  });
  it("shows cancellation and staff retry without reusing a pulse permit", () => {
    const value = props();
    render(<IndependentRhythmPracticePanel {...value} status="cancelled" />);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Повтор начинается с проверки пульса"
    );
    expect(button("Начать два ритма")).toBeUndefined();
    render(<IndependentRhythmPracticePanel {...value} status="error" error="staff" />);
    act(() => {
      button("Повторить загрузку стана")?.click();
    });
    expect(value.onRetryStaff).toHaveBeenCalledOnce();
  });
  it("requires an available MIDI device and shows the selected channel", () => {
    render(<IndependentRhythmPracticePanel {...props()} source="midi" />);
    expect(button("Начать проверку пульса")?.disabled).toBe(true);
    expect(host.textContent).toContain("Подключите и выберите MIDI-устройство");
    render(
      <IndependentRhythmPracticePanel {...props()} source="midi" midiAvailable midiChannel={2} />
    );
    reveal("independent-rhythm:practice:settings");
    expect(host.textContent).toContain("Канал двух ритмов: 2");
    expect(button("Начать проверку пульса")?.disabled).toBe(false);
  });
  it("keeps hand metrics separate, unknown extras unassigned and empty medians unknown", () => {
    render(<IndependentRhythmResults result={result("keyboard", "keys")} />);
    const left = host.querySelector('[aria-label="Левая партия C3"]');
    const right = host.querySelector('[aria-label="Правая партия C4"]');
    expect(left?.textContent).toContain("Пропуски ритма12");
    expect(left?.textContent).toContain("Попадания ритма0");
    expect(left?.querySelectorAll('[aria-label="Нет данных о двух ритмах"]')).toHaveLength(2);
    expect(right?.textContent).toContain("Попадания ритма12");
    expect(right?.textContent).toContain("Медиана отклонения, мс-25");
    expect(host.textContent).toContain("Лишние атаки неизвестной партии1");
    expect(host.textContent).toContain("Подсветка клавиш показана при подготовке");
  });
  it("filters whole history runs by source and forwards filter choices", () => {
    const onSourceFilter = vi.fn();
    render(
      <IndependentRhythmProgress
        history={[result("keyboard", "keys"), result("midi", "midi")]}
        sourceFilter="keyboard"
        onSourceFilter={onSourceFilter}
      />,
      "en"
    );
    expect(host.textContent).toContain("Completed two-rhythm series: 1");
    expect(host.querySelectorAll('[aria-label="Two-rhythm result"]')).toHaveLength(1);
    expect(host.textContent).toContain("Extra attacks with unknown part1");
    act(() => {
      const select = host.querySelector("select");
      if (select) {
        select.value = "midi";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(onSourceFilter).toHaveBeenCalledWith("midi");
  });
});
