// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { BeginnerIntro, BeginnerPracticePanel } from "./BeginnerCourse";
import type { StaffProps } from "../staff/staffProps";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
let staffPresentation: StaffProps["presentation"];
vi.mock("../staff/Staff", () => ({
  Staff: ({ presentation }: StaffProps) => {
    staffPresentation = presentation;
    return null;
  }
}));
let host: HTMLDivElement, root: Root;
const noop = () => undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  setInterfaceLanguage("ru");
});
function render(phase: "guided" | "independent") {
  act(() => {
    root.render(
      <BeginnerPracticePanel
        selection={{ stageId: "beginner-v1-right-2", phase, seed: 1 }}
        answers={[]}
        pitch={62}
        helped
        ready
        completed={false}
        renderError={false}
        storageError={false}
        onRetry={noop}
        onRetrySave={noop}
        onHint={noop}
        onRepeat={noop}
        onExit={noop}
        onIndependent={noop}
        onNext={noop}
      />
    );
  });
}
it("shows a named colour character only in guided work, and a dynamic six-answer count", () => {
  render("guided");
  expect(host.querySelectorAll(".note-character")).toHaveLength(1);
  expect(host.textContent).toContain("Ответов: 0 из 6");
  render("independent");
  expect(host.querySelector(".note-character")).toBeNull();
  expect(host.textContent).not.toContain("Показать клавишу и палец");
  expect(host.textContent).toContain("без имени и цвета");
});
it("translates the complete small-step panel", () => {
  setInterfaceLanguage("en");
  render("guided");
  expect(host.textContent).toContain("Answers: 0 of 6");
  expect(host.textContent).not.toMatch(/[А-Яа-яЁё]/);
});

it("starts only after the current staff presentation and retries rendering failures", () => {
  const onStart = vi.fn();
  act(() => {
    root.render(
      <BeginnerIntro
        selection={{ stageId: "beginner-v1-right-1", phase: "intro", seed: 1 }}
        onStart={onStart}
        onClose={noop}
      />
    );
  });
  const startButton = () =>
    [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Сыграть с помощником")
    );
  expect(startButton()?.disabled).toBe(true);
  const failedPresentation = staffPresentation;
  expect(failedPresentation).toBeDefined();
  if (!failedPresentation) throw new Error("Expected staff presentation");
  act(() => {
    failedPresentation.onError(failedPresentation.id);
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось показать ноты.");
  expect(startButton()?.disabled).toBe(true);
  const retry = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Повторить показ нот")
  );
  expect(retry).toBeDefined();
  act(() => {
    retry?.click();
  });
  const current = staffPresentation;
  if (!current) throw new Error("Expected replacement presentation");
  expect(current.id).not.toBe(failedPresentation.id);
  act(() => {
    failedPresentation.onPresented(failedPresentation.id, 100);
    failedPresentation.onError(failedPresentation.id);
  });
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(startButton()?.disabled).toBe(true);
  act(() => {
    current.onPresented(current.id, 200);
  });
  expect(startButton()?.disabled).toBe(false);
  act(() => {
    startButton()?.click();
  });
  expect(onStart).toHaveBeenCalledOnce();
});
