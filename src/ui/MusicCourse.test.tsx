// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { messages } from "../i18n/messages";
import { guidedLessonMessages } from "../i18n/guidedLessonMessages";
import { translate } from "../i18n/translate";
import { MusicCourseCatalog, MusicCoursePractice } from "./MusicCourse";
import { LessonWindowContext } from "./LessonWorkspace";
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
      canStart: false,
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
      harmonyTonePitchSet: "white",
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
function required<Value>(value: Value | null | undefined): Value {
  if (value == null) throw new Error("Missing test element");
  return value;
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
  vi.unstubAllGlobals();
});

it("keeps four course IDs, original progress and one primary entry per card", async () => {
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
  expect(host.querySelectorAll("h3")).toHaveLength(4);
  expect(host.querySelectorAll("button")).toHaveLength(4);
  await click(required(host.querySelectorAll("button")[2]));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("dictation");
  await act(async () => {
    await Promise.resolve();
    setInterfaceLanguage("en");
  });
  expect(host.textContent).toContain("Music sessions completed: 12");
  expect(host.textContent).toContain("Continue music course");
});

describe("phase actions and real response modality", () => {
  it("starts a dictation with listening, then an explicit answer and finish", async () => {
    const current = { ...props(), onCommand: vi.fn() };
    await render(<MusicCoursePractice {...current} />);
    expect(
      [...host.querySelectorAll("button")].some((node) => node.textContent === "Начать мой ответ")
    ).toBe(false);
    await click(button("Послушать образец"));
    expect(current.onCommand).toHaveBeenLastCalledWith("listen");
    await render(<MusicCoursePractice {...current} view={{ ...current.view, canStart: true }} />);
    await click(button("Начать мой ответ"));
    expect(current.onCommand).toHaveBeenLastCalledWith("start");
    await render(
      <MusicCoursePractice
        {...current}
        view={{
          ...current.view,
          status: "reply",
          canListen: false,
          canFinish: false,
          allReleased: false
        }}
      />
    );
    expect(button("Завершить ответ").disabled).toBe(true);
    expect(host.textContent).toContain("Отпустите все клавиши");
    await render(
      <MusicCoursePractice
        {...current}
        view={{
          ...current.view,
          status: "reply",
          canListen: false,
          canFinish: true,
          allReleased: true
        }}
      />
    );
    await click(button("Завершить ответ"));
    expect(current.onCommand).toHaveBeenLastCalledWith("finish");
  });

  it("never starts before controller readiness", async () => {
    await render(
      <MusicCoursePractice {...props({ ready: false, canStart: true, allReleased: false })} />
    );
    expect(button("Начать мой ответ").disabled).toBe(true);
  });

  it.each([
    ["group", "Поступенное движение", "scalar"],
    ["auditory-interval", "Слышу квинту", "5"],
    ["name-chord", "Мажорное трезвучие", "major"],
    ["tone-semitone", "Между нотами полутон", "semitone"],
    ["function", "Доминантовая функция", "dominant"]
  ] as const)(
    "uses native %s buttons even when musical input is MIDI",
    async (taskKind, label, value) => {
      const current = {
        ...props({ taskKind, status: "reply", canAnswer: true }),
        onChoose: vi.fn()
      };
      await render(
        <MusicCoursePractice
          {...current}
          preferences={{ ...current.preferences, inputSource: "midi" }}
        />
      );
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

  it("keeps preparation choices available without starting a preview on its own", async () => {
    const current = {
      ...props({
        course: "sight-reading",
        status: "preflight",
        taskKind: "position",
        canAnswer: true,
        choices: [{ value: "position:60", labelKey: "Позиция руки от ноты {note}", pitch: 60 }]
      }),
      onChoose: vi.fn(),
      onCommand: vi.fn()
    };
    await render(<MusicCoursePractice {...current} />);
    await click(button("Позиция руки от ноты до4"));
    expect(current.onChoose).toHaveBeenCalledExactlyOnceWith("position:60", "keyboard");
    expect(current.onCommand).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.querySelector(".music-course-choices button")?.textContent).toContain("C4");
  });

  it("keeps captured repeat separate from a new exercise and exit", async () => {
    const current = { ...props({ canRetry: true }), onCommand: vi.fn() };
    await render(<MusicCoursePractice {...current} />);
    await click(button("Повторить текущее"));
    await click(button("Новое задание"));
    await click(button("Выйти"));
    expect(current.onCommand.mock.calls).toEqual([["retry"], ["new"], ["exit"]]);
  });
});

describe("references, blocking windows and compact results", () => {
  it("opens generic theory without a hint command or blocking musical input", async () => {
    const current = {
      ...props({ course: "harmony", taskKind: "tone-semitone", status: "reply" }),
      onCommand: vi.fn()
    };
    const onOpen = vi.fn();
    await render(
      <LessonWindowContext value={{ open: null, onOpen, interruptsAttempt: true }}>
        <MusicCoursePractice {...current} />
      </LessonWindowContext>
    );
    await click(button("Как это работает"));
    const panel = host.querySelector<HTMLDialogElement>(".lesson-theory-panel");
    expect(panel?.open).toBe(true);
    expect(panel?.textContent).toContain("Тон состоит из двух полутонов");
    expect(current.onCommand).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(host.querySelector(".music-course-help")).toBeNull();
  });

  it("owns settings in the app window state, warns about interruption, closes without starting", async () => {
    const current = { ...props({ status: "reply" }), onCommand: vi.fn(), onPreferences: vi.fn() };
    const changes = vi.fn();
    function Harness() {
      const [open, setOpen] = useState<string | null>(null);
      return (
        <LessonWindowContext
          value={{
            open,
            interruptsAttempt: true,
            onOpen: (id) => {
              changes(id);
              setOpen(id);
            }
          }}
        >
          <MusicCoursePractice {...current} />
        </LessonWindowContext>
      );
    }
    await render(<Harness />);
    expect(host.querySelector("fieldset")).toBeNull();
    const settings = required(
      [...host.querySelectorAll("button")].find((item) =>
        item.textContent.startsWith("Параметры и ввод")
      )
    );
    expect(settings.textContent).toContain("остановит попытку");
    await click(settings);
    expect(changes).toHaveBeenLastCalledWith("music-settings");
    expect(host.querySelector(".lesson-settings-dialog")?.hasAttribute("open")).toBe(true);
    await change(select("Ввод в музыкальном курсе"), "midi");
    expect(current.onPreferences).toHaveBeenCalledExactlyOnceWith({ inputSource: "midi" });
    const dialog = required(host.querySelector<HTMLDialogElement>(".lesson-settings-dialog"));
    await act(async () => {
      await Promise.resolve();
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(changes).toHaveBeenLastCalledWith(null);
    expect(host.querySelector("fieldset")).toBeNull();
    expect(current.onCommand).not.toHaveBeenCalled();
  });

  it("keeps detailed notes and metrics lazy and preserves recorded values in RU and EN", async () => {
    await render(
      <MusicCoursePractice
        {...props({
          status: "result",
          canNext: true,
          result: {
            helped: false,
            newMaterial: true,
            metrics: [
              { labelKey: "Интервалы между атаками", value: 0.25 },
              { labelKey: "Длительности удержания", value: null }
            ],
            notes: {
              expectedNotes: [{ pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" }],
              playedNotes: [{ pitch: 62, startBeat: 0.125, durationBeats: 0.0625, hand: "right" }]
            }
          }
        })}
      />
    );
    expect(host.querySelector("dt, .music-course-notes")).toBeNull();
    await click(button("Подробнее"));
    expect(host.querySelectorAll('[data-notes="expected"] li')).toHaveLength(1);
    expect(host.querySelector('[data-notes="played"]')?.textContent).toContain("начало 0,125");
    expect(host.querySelectorAll("dt")).toHaveLength(2);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.querySelector(".music-course-result")?.textContent).toContain(
      "Note D4: starts at 0.125"
    );
    expect(host.querySelector(".music-course-result")?.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("keeps control's hidden result and hints absent while allowing generic reference", async () => {
    const current = props({
      status: "reply",
      canHelp: false,
      result: {
        helped: false,
        newMaterial: true,
        metrics: [],
        notes: { expectedNotes: [], playedNotes: [] }
      }
    });
    await render(
      <MusicCoursePractice
        {...current}
        preferences={{ ...current.preferences, purpose: "control" }}
      />
    );
    expect(host.querySelector(".music-course-result, .music-course-help")).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some((node) => node.textContent === "Подсказка")
    ).toBe(false);
    await click(button("Как это работает"));
    expect(host.querySelector(".lesson-theory-panel")?.hasAttribute("open")).toBe(true);
  });

  it("offers the white-key preference only for tone exercises without an inactive root", async () => {
    const current = {
      ...props({ course: "harmony", taskKind: "tone-semitone" }),
      onPreferences: vi.fn()
    };
    await render(
      <MusicCoursePractice
        {...current}
        preferences={{ ...current.preferences, harmonyLesson: "tone-semitone" }}
      />
    );
    await click(button("Параметры и ввод"));
    expect(select("Клавиши для тона и полутона").value).toBe("white");
    expect(
      [...host.querySelectorAll("label")].some((node) =>
        node.textContent.startsWith("Основной звук аккорда")
      )
    ).toBe(false);
    await change(select("Клавиши для тона и полутона"), "all");
    expect(current.onPreferences).toHaveBeenCalledExactlyOnceWith({ harmonyTonePitchSet: "all" });
  });

  it("keeps all advanced harmony fields and the P2-like history filter separate", async () => {
    const current = {
      ...props({ course: "harmony", taskKind: "build-chord" }),
      onPreferences: vi.fn()
    };
    await render(<MusicCoursePractice {...current} />);
    await click(button("Параметры и ввод"));
    expect(select("Тема урока гармонии").options).toHaveLength(7);
    await change(select("Основной звук аккорда"), "65");
    await change(select("Лад трезвучия"), "minor");
    await change(select("Расположение аккорда"), "2");
    await change(select("План аккордовой последовательности"), "I-V-vi-IV");
    await change(select("История музыкального курса"), "midi");
    expect(current.onPreferences.mock.calls).toEqual([
      [{ harmonyRoot: 65 }],
      [{ harmonyQuality: "minor" }],
      [{ harmonyInversion: 2 }],
      [{ harmonyProgression: "I-V-vi-IV" }],
      [{ sourceFilter: "midi" }]
    ]);
  });

  it("localizes every new message and retains interpolation variables", () => {
    for (const [key, entry] of Object.entries(guidedLessonMessages)) {
      expect(translate("en", messages, key)).toBe(entry.en);
      expect(entry.en.match(/\{[^}]+\}/g) ?? []).toEqual(key.match(/\{[^}]+\}/g) ?? []);
    }
  });
});

it.each([0, 1])("shows actual harmony correctness %s/1 before opening details", async (correct) => {
  await render(
    <MusicCoursePractice
      {...props({
        course: "harmony",
        taskKind: "tone-semitone",
        status: "result",
        result: {
          helped: false,
          newMaterial: true,
          metrics: [
            { labelKey: "Ответов на задания", value: 1 },
            { labelKey: "Верных ответов", value: correct },
            { labelKey: "Ошибки определения", value: 1 - correct }
          ]
        }
      })}
    />
  );
  expect(host.querySelector(".lesson-result__summary")?.textContent).toContain(
    `Верно: ${String(correct)}/1`
  );
  expect(host.querySelector("dt")).toBeNull();
  await act(async () => {
    await Promise.resolve();
    setInterfaceLanguage("en");
  });
  expect(host.querySelector(".lesson-result__summary")?.textContent).toContain(
    `Correct: ${String(correct)}/1`
  );
});

it("prioritizes actual reading errors over note counts in the compact musical result", async () => {
  await render(
    <MusicCoursePractice
      {...props({
        course: "sight-reading",
        taskKind: "sight-reading",
        status: "result",
        result: {
          helped: true,
          newMaterial: true,
          metrics: [
            { labelKey: "Нот в партитуре", value: 8 },
            { labelKey: "Нот в ответе", value: 8 },
            { labelKey: "Ошибки высоты", value: 2 },
            { labelKey: "Ошибки ритма", value: null },
            { labelKey: "Пропущенные ноты", value: 1 }
          ]
        }
      })}
    />
  );
  const summary = host.querySelector(".lesson-result__summary")?.textContent;
  expect(summary).toContain("Ошибки высоты: 2");
  expect(summary).toContain("Пропущенные ноты: 1");
  expect(summary).toContain("Проход с музыкальной подсказкой");
  expect(summary).not.toContain("Нот в партитуре");
  expect(summary).not.toContain("Ошибки ритма");
  expect(host.querySelector("dt")).toBeNull();
});
