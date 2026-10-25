// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { MusicCourseProgress } from "./MusicCourseProgress";
import type { MusicCourseProgressProps } from "./MusicCourseProgress";

let host: HTMLDivElement, root: Root;
async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(node);
  });
}
function props(): MusicCourseProgressProps {
  return {
    filters: { course: "all", source: "all", purpose: "all" },
    onFilters: vi.fn(),
    cohorts: [
      {
        id: "dictation:keyboard:training:aural",
        course: "dictation",
        source: "keyboard",
        purpose: "training",
        evidence: "aural",
        metrics: [{ labelKey: "Сохранено музыкальных ответов", value: 1 }]
      }
    ],
    rows: [
      {
        id: "saved-run",
        course: "dictation",
        source: "keyboard",
        purpose: "training",
        evidence: "aural",
        completedAt: Date.UTC(2026, 9, 26, 10),
        result: {
          helped: true,
          newMaterial: false,
          metrics: [
            { labelKey: "Среднее отклонение ритма, доли", value: 0.25 },
            { labelKey: "Ошибки удержания", value: null }
          ]
        },
        children: []
      }
    ]
  };
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
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  setInterfaceLanguage("ru");
  vi.unstubAllGlobals();
});

describe("pure music progress presentation", () => {
  it("keeps standalone saved reference and actual reply note lists available after practice closes", async () => {
    const current = props();
    const saved = current.rows[0];
    if (!saved) throw new Error("Missing saved row");
    await render(
      <MusicCourseProgress
        {...current}
        rows={[
          {
            ...saved,
            result: {
              ...saved.result,
              notes: {
                expectedNotes: [{ pitch: 65, startBeat: 1.5, durationBeats: 0.25, hand: "right" }],
                playedNotes: [{ pitch: 66, startBeat: 1.75, durationBeats: 0.125, hand: "right" }]
              }
            }
          }
        ]}
      />
    );
    const savedRow = host.querySelector('[data-run="saved-run"]');
    expect(savedRow?.querySelectorAll(".music-course-notes li")).toHaveLength(2);
    expect(savedRow?.querySelector('[data-notes="expected"]')?.textContent).toContain(
      "Нота фа4: начало 1,5, удержание 0,25 доли"
    );
    expect(savedRow?.querySelector('[data-notes="played"]')?.textContent).toContain(
      "начало 1,75, удержание 0,125 доли"
    );
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(savedRow?.textContent).toContain("Reference notes");
    expect(savedRow?.textContent).toContain("Note F4: starts at 1.5, held for 0.25 beats");
    expect(savedRow?.textContent).not.toMatch(/[А-Яа-яЁё]/);
    expect(current.onFilters).not.toHaveBeenCalled();
  });
  it("shows saved rows and separate metrics in Russian and English without inventing absent measurements", async () => {
    await render(<MusicCourseProgress {...props()} />);
    expect(host.textContent).toContain("0,25");
    expect(host.textContent).toContain("Музыкальный показатель не измерялся");
    expect(host.textContent).toContain("Проход с музыкальной подсказкой");
    expect(host.textContent).toContain("2026");
    const row = host.querySelector<HTMLDetailsElement>('[data-run="saved-run"] > details');
    expect(row?.open).toBe(false);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("My music progress");
    expect(host.textContent).toContain("0.25");
    expect(host.textContent).toContain("This music measure was not recorded");
    expect(host.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
  it("sends only filter patches and presents an explicit empty history", async () => {
    const current = { ...props(), cohorts: [], rows: [] };
    await render(<MusicCourseProgress {...current} />);
    expect(host.textContent).toContain("Для этих фильтров пока нет сохранённых занятий");
    const select = host.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("Missing course filter");
    await act(async () => {
      await Promise.resolve();
      select.value = "harmony";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(current.onFilters).toHaveBeenCalledExactlyOnceWith({ course: "harmony" });
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });
  it("shows actual native child dates and saved notes while legacy dates remain unknown", async () => {
    const current = props();
    await render(
      <MusicCourseProgress
        {...current}
        pendingChildren={[
          {
            id: "native-child",
            skillKey: "Поиск клавиш",
            source: "keyboard",
            purpose: "training",
            status: "completed",
            performedUnits: 1,
            auditoryVerified: false,
            visualAlternative: false,
            helped: false,
            metrics: [{ labelKey: "Ошибки высоты", value: 1 }],
            completedAt: Date.UTC(2026, 9, 26, 12),
            body: {
              expectedNotes: [{ pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" }],
              playedNotes: [{ pitch: 62, startBeat: 0.25, durationBeats: 0.75, hand: "right" }],
              chords: [],
              answers: [],
              metrics: [{ labelKey: "Темп сохранённого задания, BPM", value: 72 }]
            }
          }
        ]}
      />
    );
    const child = host.querySelector('[data-child="native-child"]');
    expect(child?.textContent).toContain("2026");
    expect(child?.textContent).toContain("до4");
    expect(child?.textContent).toContain("ре4");
    expect(child?.textContent).not.toContain("Дата этого задания не записана");
    expect(child?.querySelector<HTMLDetailsElement>(".music-progress-evidence")?.open).toBe(false);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(child?.textContent).toContain("Note C4");
    expect(child?.textContent).toContain("Note D4");
  });
  it("keeps mini-lesson skill/source errors and visual alternatives distinct", async () => {
    const current = props();
    const row = current.rows[0];
    if (!row) throw new Error("Missing saved row");
    await render(
      <MusicCourseProgress
        {...current}
        rows={[
          {
            ...row,
            course: "integrated",
            evidence: "combined",
            children: [
              {
                id: "child-harmony",
                skillKey: "Построение аккордов",
                source: "pointer",
                purpose: "training",
                auditoryVerified: false,
                visualAlternative: true,
                helped: true,
                status: "completed",
                performedUnits: 3,
                metrics: [
                  { labelKey: "Ошибки баса", value: 2 },
                  { labelKey: "Ошибки одновременности", value: 1 }
                ]
              }
            ]
          }
        ]}
      />
    );
    const child = host.querySelector('[data-child="child-harmony"]');
    expect(child?.textContent).toContain("Построение аккордов");
    expect(child?.textContent).toContain("Клавиши на экране");
    expect(child?.textContent).toContain("Зрительная замена");
    expect(child?.querySelectorAll("dt")).toHaveLength(2);
  });
});
