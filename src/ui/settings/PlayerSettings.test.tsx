// @vitest-environment happy-dom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComputerKeyboard } from "../../app/useComputerKeyboard";
import { useStaffPrefs } from "../../app/useStaffPrefs";
import { DEFAULT_CAMERA } from "../../render/worldCamera";
import { PlayerSettings } from "./PlayerSettings";

vi.mock("../GameDialog", () => ({
  GameDialog: ({ children }: { children: ReactNode }) => <section>{children}</section>
}));

let host: HTMLDivElement;
let root: Root;
const onMode = vi.fn();
const onRules = vi.fn();
const onRange = vi.fn();
const onTranspose = vi.fn();
const onDevice = vi.fn();
const onResetLayout = vi.fn();
const onToggleEditing = vi.fn();
const noop = () => undefined;

function Harness({ wordTyping = false }: { wordTyping?: boolean }) {
  const computerKeyboard = useComputerKeyboard();
  const { staffPrefs, updateStaffPrefs } = useStaffPrefs();
  return (
    <PlayerSettings
      open
      onClose={noop}
      wordTyping={wordTyping}
      play={{
        wordTyping,
        metronome: false,
        onMetronome: noop,
        listening: false,
        soundLoading: false,
        onListen: noop,
        stats: undefined,
        mode: "tempo",
        onMode,
        hands: "both",
        onHands: noop,
        speed: 1,
        onSpeed: noop,
        autoReview: false,
        onAutoReview: noop
      }}
      rules={{
        practiceOnly: wordTyping,
        difficulty: "normal",
        ranked: false,
        rankedReady: true,
        performance: false,
        learningWindow: true,
        stopOnError: false,
        locked: false,
        from: 0,
        to: 10,
        duration: 10,
        loop: false,
        onChange: onRules,
        onRange
      }}
      song={{
        sourceKey: { tonic: 0, mode: "major" },
        transpose: 0,
        onTranspose,
        fingersChanged: false,
        onResetFingers: noop
      }}
      staff={{ prefs: staffPrefs, hasScore: true, onChange: updateStaffPrefs }}
      keyboard={{
        keyRange: "song",
        onKeyRange: noop,
        showLabels: false,
        onShowLabels: noop,
        fps: staffPrefs.fps,
        onFps: (fps) => {
          updateStaffPrefs({ fps });
        },
        keyStyle: "classic",
        onKeyStyle: noop,
        road: { far: 0.3, horizon: 0.3 },
        onRoad: noop,
        camera: DEFAULT_CAMERA,
        onCamera: noop,
        toggles: <span>Переключатели вида</span>
      }}
      computerKeyboard={computerKeyboard}
      wordSettings={<p>Язык и партия для печати</p>}
      midi={{
        devices: [{ id: "piano", name: "USB Piano" }],
        deviceId: "all",
        onDevice,
        midiError: null
      }}
      synchronization={<p>Калибровка задержки</p>}
      onResetLayout={onResetLayout}
      editing={false}
      onToggleEditing={onToggleEditing}
    />
  );
}
async function render(wordTyping = false) {
  await act(async () => {
    await Promise.resolve();
    root.render(<Harness wordTyping={wordTyping} />);
  });
}
async function section(title: string) {
  const tab = Array.from(host.querySelectorAll<HTMLButtonElement>("[role=tab]")).find(
    (element) => element.textContent === title
  );
  if (!tab) throw new Error(`Missing section: ${title}`);
  await act(async () => {
    await Promise.resolve();
    tab.click();
  });
}
function select(label: string) {
  const result = host.querySelector<HTMLSelectElement>(`select[aria-label='${label}']`);
  if (!result) throw new Error(`Missing select: ${label}`);
  return result;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("player settings organization", () => {
  it("orders the six sections and groups game and visual controls", async () => {
    await render();
    expect(Array.from(host.querySelectorAll("[role=tab]"), (tab) => tab.textContent)).toEqual([
      "Игра",
      "Песня",
      "Вид",
      "Ввод с ПК",
      "Пианино",
      "Синхронизация"
    ]);
    expect(host.textContent).toContain("Режим и темп");
    expect(host.textContent).toContain("Правила и очки");
    expect(host.querySelector(".practice-range")).not.toBeNull();
    await section("Вид");
    expect(host.textContent).toContain("Нотная запись");
    expect(host.textContent).toContain("Клавиатура и отображение");
    expect(select("Клавиши")).toBeDefined();
    const reset = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Сбросить расположение"
    );
    await act(async () => {
      await Promise.resolve();
      reset?.click();
    });
    expect(onResetLayout).toHaveBeenCalledOnce();
    const edit = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent.includes("Редактировать интерфейс")
    );
    expect(edit?.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      await Promise.resolve();
      edit?.click();
    });
    expect(onToggleEditing).toHaveBeenCalledOnce();
    await section("Синхронизация");
    expect(host.querySelector("[role=tabpanel]")?.textContent).toContain("Калибровка задержки");
  });

  it("keeps original handlers for game rules, range, song and MIDI controls", async () => {
    await render();
    await act(async () => {
      await Promise.resolve();
      const mode = select("Режим");
      mode.value = "wait";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      const label = Array.from(host.querySelectorAll("label")).find((element) =>
        element.textContent.includes("Учебное окно")
      );
      label?.querySelector<HTMLInputElement>("input")?.click();
      const range = host.querySelector<HTMLInputElement>(".practice-range input[type=number]");
      if (!range) throw new Error("Missing range start");
      const inputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (!inputValue?.set) throw new Error("Missing native input setter");
      inputValue.set.call(range, "2");
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onMode).toHaveBeenCalledWith("wait");
    expect(onRules).toHaveBeenCalledWith({ learningWindow: false });
    expect(onRange).toHaveBeenCalledWith({ from: 2 });
    await section("Песня");
    await act(async () => {
      await Promise.resolve();
      const key = select("Тональность");
      key.value = "7";
      key.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onTranspose).toHaveBeenCalledWith(7);
    await section("Пианино");
    await act(async () => {
      await Promise.resolve();
      const midi = host.querySelector<HTMLSelectElement>("[role=tabpanel] select");
      if (!midi) throw new Error("Missing MIDI input selector");
      midi.value = "piano";
      midi.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onDevice).toHaveBeenCalledWith("piano");
  });

  it("adapts computer input for melody typing while keeping song, piano and synchronization", async () => {
    await render(true);
    expect(Array.from(host.querySelectorAll("[role=tab]"), (tab) => tab.textContent)).toContain(
      "Печатать мелодию"
    );
    await section("Печатать мелодию");
    expect(host.textContent).toContain("Язык и партия для печати");
    expect(host.textContent).not.toContain("Настроить раскладку");
    await section("Вид");
    expect(host.textContent).toContain("клавиатура автоматически подстраивается");
    expect(host.querySelector("select[aria-label='Клавиши']")).toBeNull();
    const fpsControls = Array.from(host.querySelectorAll("label")).filter((label) =>
      label.textContent.includes("Показывать FPS")
    );
    expect(fpsControls).toHaveLength(1);
    const fps = fpsControls[0]?.querySelector<HTMLInputElement>("input");
    expect(fps?.checked).toBe(false);
    await act(async () => {
      await Promise.resolve();
      fps?.click();
    });
    expect(fps?.checked).toBe(true);
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({ fps: true });
    await section("Песня");
    expect(select("Тональность")).toBeDefined();
    await section("Пианино");
    expect(host.querySelector("[role=tabpanel]")?.textContent).toContain("USB Piano");
    await section("Синхронизация");
    expect(host.querySelector("[role=tabpanel]")?.textContent).toContain("Калибровка задержки");
    await render(false);
    await section("Вид");
    const pianoFps = Array.from(host.querySelectorAll("label")).filter((label) =>
      label.textContent.includes("Показывать FPS")
    );
    expect(pianoFps).toHaveLength(1);
    expect(pianoFps[0]?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
    await section("Ввод с ПК");
    expect(host.textContent).toContain("По октавам");
  });
});
