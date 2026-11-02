// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import type { PianoSampleProgress, SampleGroupProgress } from "../audio/pianoSamples";
import { RuntimePreparation, type RuntimePreparationProps } from "./RuntimePreparation";

const critical: SampleGroupProgress = {
  status: "idle",
  loadedBytes: 0,
  totalBytes: 2_926_230,
  completedFiles: 0,
  totalFiles: 30
};
const background: SampleGroupProgress = {
  status: "idle",
  loadedBytes: 0,
  totalBytes: 8_537_867,
  completedFiles: 0,
  totalFiles: 90
};
const progress = (change: Partial<PianoSampleProgress> = {}): PianoSampleProgress => ({
  critical,
  background,
  ...change
});
const ready: SampleGroupProgress = {
  ...critical,
  status: "ready",
  loadedBytes: critical.totalBytes,
  completedFiles: 30
};
let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
const render = (props: Partial<RuntimePreparationProps> = {}) => {
  act(() => {
    root.render(
      <RuntimePreparation
        party="idle"
        audioForeground={false}
        sound="off"
        progress={progress()}
        onCancel={noop}
        onRetry={noop}
        {...props}
      />
    );
  });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.setAttribute("open", "");
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("late preparation feedback", () => {
  it("does not show an artificial wait for idle or fully ready resources", () => {
    render();
    expect(host.querySelector("dialog[open], .runtime-sound-status")).toBeNull();
    render({
      progress: progress({ critical: ready, background: { ...background, status: "ready" } })
    });
    expect(host.querySelector("dialog[open], .runtime-sound-status")).toBeNull();
  });

  it("keeps the automatic first-gesture warm-up nonmodal and does not move focus", () => {
    const initiating = document.body.appendChild(document.createElement("button"));
    initiating.focus();
    render({
      progress: progress({ critical: { ...critical, status: "loading", loadedBytes: 1_110_000 } })
    });
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement).toBe(initiating);
    expect(host.textContent).toContain("1,11/2,93 МБ · ещё 1,82");
    initiating.remove();
  });

  it("shows the known download size and a cancel action when audio is awaited", () => {
    const cancel = vi.fn();
    render({ audioForeground: true, sound: "loading", onCancel: cancel });
    expect(host.querySelector("dialog[open]")?.getAttribute("aria-label")).toBe(
      "Подготовка пианино"
    );
    expect(host.textContent).toContain("Получено 0,00 из 2,93 МБ");
    expect(host.textContent).toContain("Ещё 2,93 МБ");
    act(() =>
      host.querySelector<HTMLButtonElement>(".runtime-preparation__actions button")?.click()
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("still says decoding after all bytes have arrived", () => {
    render({
      audioForeground: true,
      sound: "loading",
      progress: progress({
        critical: { ...critical, status: "decoding", loadedBytes: critical.totalBytes }
      })
    });
    const bar = host.querySelector("progress");
    expect(bar?.value).toBe(critical.totalBytes);
    expect(host.textContent).toContain("Обрабатываем звук");
    expect(host.textContent).toContain("Ещё 0,00 МБ");
  });

  it("shows CPU and frame stages without invented byte or percent progress", () => {
    for (const party of ["preparing", "waiting-frame"] as const) {
      render({ party });
      expect(host.querySelector("progress")).toBeNull();
      expect(host.textContent).not.toContain("МБ");
      expect(host.textContent).not.toContain("%");
      expect(host.textContent).toContain(
        party === "preparing" ? "Готовим партию" : "Готовим изображение"
      );
    }
  });

  it("does not turn a failed optional layer into a blocking party error", () => {
    const p = progress({ critical: ready, background: { ...background, status: "error" } });
    render({ sound: "ready", progress: p });
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(host.textContent).toContain("Не удалось загрузить дополнительный звук");
    render({ party: "preparing", sound: "ready", progress: p });
    expect(host.textContent).toContain("Готовим партию");
    expect(host.querySelector("[data-error]")).toBeNull();
  });

  it("retries only through an explicit action after a mandatory failure", () => {
    const retry = vi.fn();
    render({
      audioForeground: true,
      sound: "error",
      onRetry: retry,
      progress: progress({ critical: { ...critical, status: "error" } })
    });
    expect(retry).not.toHaveBeenCalled();
    act(() =>
      host.querySelector<HTMLButtonElement>(".runtime-preparation__actions button")?.click()
    );
    expect(retry).toHaveBeenCalledOnce();
  });

  it("localizes the stage, error and byte counters in English", () => {
    setInterfaceLanguage("en");
    render({ audioForeground: true, sound: "loading" });
    expect(host.textContent).toContain("Loading piano sounds");
    expect(host.textContent).toContain("Received 0.00 of 2.93 MB");
    expect(host.textContent).toContain("2.93 MB remaining");
    render({ party: "error" });
    expect(host.textContent).toContain("Couldn't prepare your part");
    expect(host.textContent).toContain("Retry part preparation");
  });
});
