// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { messages } from "../i18n/messages";
import { musicCourseMessages } from "../i18n/musicCourseMessages";
import { translate } from "../i18n/translate";
import { MusicCourseCatalog, MusicCoursePractice } from "./MusicCourse";
import type { MusicCoursePracticeProps, MusicCourseView } from "./musicCourseTypes";

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
function props(patch: Partial<MusicCourseView> = {}): MusicCoursePracticeProps {
  return {
    view: {
      course: "dictation",
      taskKind: "dictation",
      status: "ready",
      ready: true,
      allReleased: true,
      canStart: true,
      canListen: true,
      canFinish: false,
      canNext: false,
      canHelp: true,
      showHelp: false,
      ...patch
    },
    preferences: {
      purpose: "training",
      inputSource: "keyboard",
      sourceFilter: "all",
      sightPreviewSeconds: 10,
      sightLevel: "notes",
      harmonyLesson: "triads",
      harmonyMode: "build-chord",
      harmonyAural: false,
      harmonyRoot: 60,
      harmonyQuality: "major",
      harmonyInversion: 0,
      harmonyProgression: "I-IV-V-I",
      dictationLength: 3,
      dictationStartMode: "known"
    },
    onPreferences: noop,
    onCommand: noop,
    onChoose: noop
  };
}
async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(node);
  });
}
function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(node: HTMLElement, detail = 0) {
  await act(async () => {
    await Promise.resolve();
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
  });
}
function select(label: string): HTMLSelectElement {
  const found = [...host.querySelectorAll("label")]
    .find((node) => node.firstChild?.textContent === label)
    ?.querySelector("select");
  if (!found) throw new Error(`Missing select: ${label}`);
  return found;
}
async function change(node: HTMLSelectElement, value: string) {
  await act(async () => {
    await Promise.resolve();
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
  vi.unstubAllGlobals();
});

describe("compact music course catalog", () => {
  it("shows four short cards with one entry command each and localized progress", async () => {
    const onOpen = vi.fn();
    await render(
      <MusicCourseCatalog
        cards={[
          { course: "sight-reading", completedRuns: 12, resumable: false },
          { course: "harmony", completedRuns: 0, resumable: false },
          { course: "dictation", completedRuns: 3, resumable: true },
          { course: "integrated", completedRuns: 1, resumable: true }
        ]}
        onOpen={onOpen}
      />
    );
    expect([...host.querySelectorAll("h3")].map((node) => node.textContent)).toEqual([
      "Чтение с листа",
      "Гармония",
      "Диктанты",
      "Мини-уроки"
    ]);
    expect(host.querySelectorAll("button")).toHaveLength(4);
    expect(host.querySelectorAll("table, canvas, svg")).toHaveLength(0);
    const dictationButton = host.querySelectorAll("button")[2];
    if (!dictationButton) throw new Error("Missing dictation card action");
    await click(dictationButton);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("dictation");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Sight-reading");
    expect(host.textContent).toContain("Music sessions completed: 12");
    expect(host.textContent).toContain("Continue music course");
  });
});

describe("one active music task", () => {
  it("shows the exact reference and played pitches and beat timings only inside completed review", async () => {
    const current = props({
      status: "result",
      result: {
        helped: false,
        newMaterial: true,
        metrics: [],
        notes: {
          expectedNotes: [
            { pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" },
            { pitch: 64, startBeat: 1, durationBeats: 0.25, hand: "right" }
          ],
          playedNotes: [{ pitch: 62, startBeat: 0.125, durationBeats: 0.0625, hand: "right" }]
        }
      }
    });
    await render(<MusicCoursePractice {...current} />);
    const review = host.querySelector<HTMLDetailsElement>(".music-course-result details");
    expect(review?.open).toBe(false);
    expect(review?.querySelectorAll('[data-notes="expected"] li')).toHaveLength(2);
    expect(review?.querySelectorAll('[data-notes="played"] li')).toHaveLength(1);
    expect(review?.querySelector('[data-notes="played"]')?.textContent).toContain(
      "Нота ре4: начало 0,125, удержание 0,063 доли"
    );
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(review?.textContent).toContain("Reference notes");
    expect(review?.textContent).toContain("Note C4: starts at 0, held for 1 beats");
    expect(review?.textContent).toContain("Note D4: starts at 0.125, held for 0.063 beats");
    expect(review?.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
  it("makes an empty played response explicit without substituting reference notes", async () => {
    await render(
      <MusicCoursePractice
        {...props({
          status: "result",
          result: {
            helped: false,
            newMaterial: true,
            metrics: [],
            notes: {
              expectedNotes: [{ pitch: 67, startBeat: 0, durationBeats: 1, hand: "right" }],
              playedNotes: []
            }
          }
        })}
      />
    );
    const played = host.querySelector('[data-notes="played"]');
    expect(played?.textContent).toContain("Сыгранных нот нет.");
    expect(played?.querySelectorAll("li")).toHaveLength(0);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(played?.textContent).toContain("No notes were played.");
  });
  it.each(["ready", "playing", "listening", "reply", "paused"] as const)(
    "does not reveal result notes or theory before finish during %s control",
    async (status) => {
      const current = props({
        status,
        canHelp: false,
        result: {
          helped: false,
          newMaterial: true,
          metrics: [],
          notes: {
            expectedNotes: [{ pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" }],
            playedNotes: []
          }
        }
      });
      await render(
        <MusicCoursePractice
          {...current}
          preferences={{ ...current.preferences, purpose: "control" }}
        />
      );
      expect(host.querySelector(".music-course-result")).toBeNull();
      expect(host.querySelector(".music-course-notes")).toBeNull();
      expect(host.querySelector(".music-course-theory")).toBeNull();
    }
  );
  it("routes start/listen/exit and gates start by readiness and released keys", async () => {
    const current = { ...props(), onCommand: vi.fn() };
    await render(<MusicCoursePractice {...current} />);
    await click(button("Начать музыкальное задание"));
    await click(button("Прослушать музыкальный эталон"));
    await click(button("Выйти из музыкального урока"));
    expect(current.onCommand.mock.calls).toEqual([["start"], ["listen"], ["exit"]]);
    await render(
      <MusicCoursePractice
        {...current}
        view={{ ...current.view, ready: false, allReleased: false }}
      />
    );
    expect(button("Начать музыкальное задание").disabled).toBe(true);
    expect(button("Прослушать музыкальный эталон").disabled).toBe(true);
    expect(host.textContent).toContain("Отпустите все клавиши");
  });
  it("keeps finish explicit and disabled until every key is released", async () => {
    const current = {
      ...props({ status: "reply", canStart: false, canFinish: true, allReleased: false }),
      onCommand: vi.fn()
    };
    await render(<MusicCoursePractice {...current} />);
    expect(button("Завершить музыкальный ответ").disabled).toBe(true);
    await render(
      <MusicCoursePractice {...current} view={{ ...current.view, allReleased: true }} />
    );
    await click(button("Завершить музыкальный ответ"));
    expect(current.onCommand).toHaveBeenCalledExactlyOnceWith("finish");
    expect(
      [...host.querySelectorAll("button")].some(
        (node) => node.textContent === "Начать музыкальное задание"
      )
    ).toBe(false);
  });
  it("routes next/retry and translates a presentation error", async () => {
    const current = {
      ...props({
        status: "error",
        canRetry: true,
        canNext: true,
        error: { key: "Задание недоступно" }
      }),
      onCommand: vi.fn()
    };
    await render(<MusicCoursePractice {...current} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Задание недоступно");
    await click(button("Повторить музыкальное задание"));
    await click(button("К следующему музыкальному заданию"));
    expect(current.onCommand.mock.calls).toEqual([["retry"], ["next"]]);
  });
  it("shows help only after its command and keeps theory folded until requested", async () => {
    const current = { ...props({ helpKeys: ["Между нотами полутон"] }), onCommand: vi.fn() };
    await render(<MusicCoursePractice {...current} />);
    expect(host.querySelector(".music-course-help")).toBeNull();
    const theory = host.querySelector<HTMLDetailsElement>(".music-course-theory");
    if (!theory) throw new Error("Missing theory disclosure");
    expect(theory.open).toBe(false);
    await click(button("Подсказка к музыкальному заданию"));
    expect(current.onCommand).toHaveBeenCalledWith("hint");
    await render(<MusicCoursePractice {...current} view={{ ...current.view, showHelp: true }} />);
    expect(host.querySelector<HTMLDetailsElement>(".music-course-help")?.open).toBe(true);
    expect(host.textContent).toContain("этот проход остаётся обучением");
    await act(async () => {
      await Promise.resolve();
      theory.open = true;
      theory.dispatchEvent(new Event("toggle"));
    });
    expect(current.onCommand).toHaveBeenCalledWith("theory");
  });
  it("does not reveal hints or theory during independent control", async () => {
    const current = props({ canHelp: false });
    await render(
      <MusicCoursePractice
        {...current}
        preferences={{ ...current.preferences, purpose: "control" }}
      />
    );
    expect(host.querySelector(".music-course-theory")).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some(
        (node) => node.textContent === "Подсказка к музыкальному заданию"
      )
    ).toBe(false);
  });
  it("does not reveal active-control theory after changing next-run purpose to training", async () => {
    const current = props({ canHelp: false });
    await render(
      <MusicCoursePractice
        {...current}
        preferences={{ ...current.preferences, purpose: "training" }}
      />
    );
    expect(host.querySelector(".music-course-theory")).toBeNull();
    expect(host.querySelector(".music-course-help")).toBeNull();
  });
  it("keeps active-training help available when next-run purpose is control", async () => {
    const current = { ...props({ canHelp: true }), onCommand: vi.fn() };
    await render(
      <MusicCoursePractice
        {...current}
        preferences={{ ...current.preferences, purpose: "control" }}
      />
    );
    const hint = host.querySelector(".music-course-actions button:last-child");
    if (!(hint instanceof HTMLButtonElement)) throw new Error("Missing current-training hint");
    await click(hint);
    expect(current.onCommand).toHaveBeenCalledWith("hint");
    expect(host.querySelector(".music-course-theory")).not.toBeNull();
  });
  it("shows distinct supplied metrics in a collapsed review without universal accuracy", async () => {
    const current = props({
      status: "result",
      canNext: true,
      result: {
        helped: true,
        newMaterial: false,
        metrics: [
          { labelKey: "Ошибки высоты в задании", value: 2 },
          { labelKey: "Интервалы между атаками", value: 0.25 },
          { labelKey: "Длительности удержания", value: null }
        ]
      }
    });
    await render(<MusicCoursePractice {...current} />);
    const review = host.querySelector<HTMLDetailsElement>(".music-course-result details");
    if (!review) throw new Error("Missing result disclosure");
    expect(review.open).toBe(false);
    expect(host.querySelectorAll("dt")).toHaveLength(3);
    expect(host.textContent).toContain("Повтор знакомого материала");
    expect(host.textContent).toContain("0,25");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("0.25");
    expect(host.textContent).toContain("Key-holding durations");
    expect(host.textContent).toContain("This music measure was not recorded");
  });
  it.each([
    ["group", "Поступенное движение", "scalar"],
    ["auditory-interval", "Слышу квинту", "5"],
    ["name-chord", "Мажорное трезвучие", "major"],
    ["tone-semitone", "Между нотами полутон", "semitone"],
    ["function", "Доминантовая функция", "dominant"]
  ] as const)(
    "routes %s keyboard and pointer choices with provenance",
    async (taskKind, label, value) => {
      const current = {
        ...props({ taskKind, status: "reply", canAnswer: true }),
        onChoose: vi.fn()
      };
      await render(<MusicCoursePractice {...current} />);
      await click(button(label));
      await click(button(label), 1);
      expect(current.onChoose.mock.calls).toEqual([
        [value, "keyboard"],
        [value, "pointer"]
      ]);
      await render(<MusicCoursePractice {...current} view={{ ...current.view, ready: false }} />);
      expect(button(label).disabled).toBe(true);
    }
  );
  it("formats position choices as localized note names instead of MIDI numbers", async () => {
    const current = props({
      taskKind: "position",
      status: "preview",
      canAnswer: true,
      choices: [{ value: "position:60", labelKey: "Позиция руки от ноты {note}", pitch: 60 }]
    });
    await render(<MusicCoursePractice {...current} />);
    expect(host.querySelector(".music-course-choices button")?.textContent).toContain("до4");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.querySelector(".music-course-choices button")?.textContent).toContain("C4");
    expect(host.querySelector(".music-course-choices button")?.textContent).not.toContain("60");
  });
  it("shows only the actual known starting note, localized in Russian and English", async () => {
    const current = props({ startPitch: 65 });
    await render(<MusicCoursePractice {...current} />);
    expect(host.querySelector(".music-course-anchor")?.textContent).toBe("Начните с фа4.");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.querySelector(".music-course-anchor")?.textContent).toBe("Start on F4.");
    const relative = props();
    await render(
      <MusicCoursePractice
        {...relative}
        preferences={{ ...relative.preferences, dictationStartMode: "relative" }}
      />
    );
    expect(host.querySelector(".music-course-anchor")).toBeNull();
  });
  it("translates a recommended skill inside an enabled result choice", async () => {
    const current = props({
      course: "integrated",
      taskKind: "integrated",
      status: "result",
      canAnswer: true,
      choices: [
        {
          value: "repeat:heard-rhythm",
          labelKey: "Рекомендуем повторить: {skill}",
          params: { skill: "Ритм на слух" }
        }
      ]
    });
    await render(<MusicCoursePractice {...current} />);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    const choice = host.querySelector<HTMLButtonElement>(".music-course-choices button");
    expect(choice?.textContent).toBe("Suggested review: Rhythm by ear");
    expect(choice?.disabled).toBe(false);
  });
  it("shows preparation/preview choices when the active controller explicitly allows them", async () => {
    const current = {
      ...props({ taskKind: "group", status: "preview", canAnswer: true }),
      onChoose: vi.fn()
    };
    await render(<MusicCoursePractice {...current} />);
    const choice = host.querySelector(".music-course-choices button");
    if (!(choice instanceof HTMLButtonElement)) throw new Error("Missing preparation choice");
    expect(choice.disabled).toBe(false);
    await click(choice);
    expect(current.onChoose).toHaveBeenCalledWith("scalar", "keyboard");
  });
  it("shows the task counter and actual hand position without creating a staff", async () => {
    await render(
      <MusicCoursePractice
        {...props({
          taskKind: "position",
          positionLowPitch: 60,
          counter: { current: 2, total: 7 },
          previewSeconds: 5
        })}
      />
    );
    expect(host.textContent).toContain("Задание 2 из 7");
    expect(host.textContent).toContain("Позиция руки от ноты до4");
    expect(host.querySelectorAll("canvas, svg, table")).toHaveLength(0);
  });
});

describe("folded course preferences", () => {
  it("offers every harmony lesson and applies typed root, quality, inversion and progression changes", async () => {
    const current = {
      ...props({ course: "harmony", taskKind: "build-chord" }),
      onPreferences: vi.fn()
    };
    await render(<MusicCoursePractice {...current} />);
    expect(host.querySelector<HTMLDetailsElement>(".music-course-settings")?.open).toBe(false);
    expect(select("Тема урока гармонии").options).toHaveLength(7);
    await change(select("Тема урока гармонии"), "voice-leading");
    await change(select("Основной звук аккорда"), "65");
    await change(select("Лад трезвучия"), "minor");
    await change(select("Расположение аккорда"), "2");
    await change(select("План аккордовой последовательности"), "I-V-vi-IV");
    expect(current.onPreferences.mock.calls).toEqual([
      [{ harmonyLesson: "voice-leading" }],
      [{ harmonyRoot: 65 }],
      [{ harmonyQuality: "minor" }],
      [{ harmonyInversion: 2 }],
      [{ harmonyProgression: "I-V-vi-IV" }]
    ]);
  });
  it("keeps next-run preferences editable during an active answer without issuing task commands", async () => {
    const current = { ...props({ status: "reply" }), onPreferences: vi.fn(), onCommand: vi.fn() };
    await render(<MusicCoursePractice {...current} />);
    expect(host.querySelector("fieldset")?.disabled).toBe(false);
    expect(select("История музыкального курса").disabled).toBe(false);
    await render(<MusicCoursePractice {...current} view={{ ...current.view, status: "ready" }} />);
    await change(select("История музыкального курса"), "midi");
    expect(current.onPreferences).toHaveBeenCalledExactlyOnceWith({ sourceFilter: "midi" });
    expect(current.onCommand).not.toHaveBeenCalled();
  });
  it("keeps every added catalog message available in English without losing parameters", () => {
    for (const [key, entry] of Object.entries(musicCourseMessages)) {
      expect(translate("en", messages, key)).toBe(entry.en);
      const placeholders = key.match(/\{[^}]+\}/g) ?? [];
      expect(entry.en.match(/\{[^}]+\}/g) ?? []).toEqual(placeholders);
    }
  });
});
