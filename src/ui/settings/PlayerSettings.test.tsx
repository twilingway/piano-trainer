import { ViewToggles } from "../ViewToggles";
import { TimingSettings } from "../TimingSettings";
import { defaultTimingPreferences } from "../../app/timingPreferences";
import { SettingsDiagnostics } from "./SettingsDiagnostics";
import { Provider } from "react-redux";
import { createAppStore, type AppStore } from "../../app/store";
import { PlaySettings } from "./PlaySettings";
import { GameSettings } from "../GameSettings";
import { SongSettings } from "./SongSettings";
import { StaffSettings } from "./StaffSettings";
import { KeyboardSettings } from "./KeyboardSettings";
import { SettingsView } from "./SettingsView";
import { MidiSettings } from "./MidiSettings";
import { ComputerKeyboardSettings } from "./ComputerKeyboardSettings";
// @vitest-environment happy-dom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComputerKeyboard } from "../../app/useComputerKeyboard";
import { useStaffPrefs } from "../../app/useStaffPrefs";
import { LANGUAGE_STORAGE_KEY, setInterfaceLanguage } from "../../app/interfaceLanguage";
import { DEFAULT_CAMERA } from "../../render/worldCamera";
import { PlayerSettings } from "./PlayerSettings";

vi.mock("../GameDialog", () => ({
  GameDialog: ({ children }: { children: ReactNode }) => <section>{children}</section>
}));

let host: HTMLDivElement;
let root: Root;
let store: AppStore;
const onMode = vi.fn();
const onRules = vi.fn();
const onRange = vi.fn();
const onTranspose = vi.fn();
const onDevice = vi.fn();
const onMidiOutput = vi.fn();
const onMelodyOutput = vi.fn();
const onMidiTest = vi.fn();
const onOffsets = vi.fn();
const onCalibrate = vi.fn();
const onResetLayout = vi.fn();
const onToggleEditing = vi.fn();
const noop = () => undefined;

function Harness({
  wordTyping = false,
  melodyMode = "midi"
}: {
  wordTyping?: boolean;
  melodyMode?: "browser" | "midi";
}) {
  const computerKeyboard = useComputerKeyboard();
  const { staffPrefs, updateStaffPrefs } = useStaffPrefs();
  return (
    <PlayerSettings
      open
      onClose={noop}
      wordTyping={wordTyping}
      diagnostics={
        <SettingsDiagnostics
          fps={staffPrefs.fps}
          onFps={(fps) => {
            updateStaffPrefs({ fps });
          }}
        />
      }
      play={
        <PlaySettings
          {...{
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
        />
      }
      rules={
        <GameSettings
          {...{
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
        />
      }
      song={
        <SongSettings
          {...{
            sourceKey: { tonic: 0, mode: "major" },
            transpose: 0,
            onTranspose,
            octave: 0,
            onOctave: noop,
            outside: 0,
            bestOctave: 0,
            fingersChanged: false,
            onResetFingers: noop
          }}
        />
      }
      view={
        <SettingsView
          wordTyping={wordTyping}
          staff={
            <StaffSettings {...{ prefs: staffPrefs, hasScore: true, onChange: updateStaffPrefs }} />
          }
          keyboard={
            <KeyboardSettings
              {...{
                keyRange: "song",
                onKeyRange: noop,
                showLabels: false,
                onShowLabels: noop,
                keyStyle: staffPrefs.keyStyle,
                onKeyStyle: (keyStyle) => {
                  updateStaffPrefs({ keyStyle });
                },
                notesPerspective: staffPrefs.road,
                onNotesPerspective: (road) => {
                  updateStaffPrefs({ road });
                },
                handStyle: staffPrefs.handStyle,
                flatNoteBurning: staffPrefs.flatNoteBurning,
                onFlatNoteBurning: noop,
                flatPressEffects: staffPrefs.flatPressEffects,
                onFlatPressEffects: noop,
                keyboardDim: staffPrefs.keyboardDim,
                onKeyboardDim: (keyboardDim) => {
                  updateStaffPrefs({ keyboardDim });
                },
                roadGuides: staffPrefs.roadGuides,
                onRoadGuides: (roadGuides) => {
                  updateStaffPrefs({ roadGuides });
                },
                onHandStyle: (handStyle) => {
                  updateStaffPrefs({ handStyle });
                },
                road: { far: 0.3, horizon: 0.3 },
                onRoad: noop,
                camera: DEFAULT_CAMERA,
                onCamera: noop
              }}
            />
          }
          toggles={
            <>
              <span>Переключатели вида</span>
              <ViewToggles prefs={staffPrefs} hasScore onChange={updateStaffPrefs} />
            </>
          }
          editing={false}
          onToggleEditing={onToggleEditing}
          onResetLayout={onResetLayout}
        />
      }
      computer={
        wordTyping ? (
          <p>Язык и партия для печати</p>
        ) : (
          <ComputerKeyboardSettings controls={computerKeyboard} />
        )
      }
      midi={
        <MidiSettings
          {...{
            devices: [{ id: "piano", name: "USB Piano" }],
            deviceId: "all",
            onDevice,
            midiError: null,
            output: {
              devices: [{ id: "piano", name: "USB Piano" }],
              choice: { id: "piano", name: "USB Piano" },
              connected: true,
              selectedId: "piano",
              onSelect: onMidiOutput,
              onTest: onMidiTest,
              lights: { enabled: false, channel: 1, velocity: 50 },
              onLights: noop,
              melody: { mode: melodyMode, channel: 1 },
              onMelody: onMelodyOutput
            },
            keyboard: {
              range: { preset: "88" },
              onRange: noop,
              capture: null,
              onCapture: noop,
              onCancelCapture: noop
            }
          }}
        />
      }
      synchronization={
        <TimingSettings
          preferences={defaultTimingPreferences()}
          deviceId="piano"
          deviceName="USB Piano"
          transport="usb"
          progress={null}
          running={false}
          onTransport={noop}
          onOffsets={onOffsets}
          onStart={onCalibrate}
          onCancel={noop}
        />
      }
    />
  );
}
async function render(wordTyping = false, melodyMode: "browser" | "midi" = "midi") {
  await act(async () => {
    await Promise.resolve();
    root.render(
      <Provider store={store}>
        <Harness wordTyping={wordTyping} melodyMode={melodyMode} />
      </Provider>
    );
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
  setInterfaceLanguage("ru");
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  store = createAppStore();
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("player settings organization", () => {
  it("switches the open interface to English while preserving tab and preferences", async () => {
    await render();
    await section("О программе");
    const fps = Array.from(host.querySelectorAll("label"))
      .find((label) => label.textContent.includes("Показывать FPS"))
      ?.querySelector<HTMLInputElement>("input");
    await act(async () => {
      await Promise.resolve();
      fps?.click();
    });
    const staffBefore = localStorage.getItem("staff-prefs");
    await section("О программе");
    await act(async () => {
      await Promise.resolve();
      const language = select("Язык интерфейса");
      language.value = "en";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("About");
    expect(select("Interface language").value).toBe("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(localStorage.getItem("staff-prefs")).toBe(staffBefore);
    expect(host.querySelector("[role=tabpanel]")?.textContent.replace("Русский", "")).not.toMatch(
      /[А-Яа-яЁё]/
    );
    expect(document.documentElement.lang).toBe("en");
    await section("Song");
    expect(select("Key signature").options[0]?.textContent).toContain("C major");
    await section("About");
    expect(host.textContent).toContain("Show FPS");
    expect(
      Array.from(host.querySelectorAll("label"))
        .find((label) => label.textContent.includes("Show FPS"))
        ?.querySelector<HTMLInputElement>("input")?.checked
    ).toBe(true);
    await section("Computer input");
    expect(select("Computer keyboard layout").value).toBe("octave_layout");
    expect(host.textContent).toContain("By octave");
    expect(onRules).not.toHaveBeenCalled();
    expect(onTranspose).not.toHaveBeenCalled();
  });

  it("orders the eight sections and groups game and visual controls", async () => {
    await render();
    expect(Array.from(host.querySelectorAll("[role=tab]"), (tab) => tab.textContent)).toEqual([
      "Игра",
      "Песня",
      "Вид",
      "Ввод с ПК",
      "Пианино",
      "Синхронизация",
      "Помощь",
      "О программе"
    ]);
    expect(host.textContent).toContain("Режим и темп");
    expect(host.textContent).toContain("Правила и очки");
    expect(host.querySelector(".practice-range")).not.toBeNull();
    await section("Вид");
    expect(host.textContent).toContain("Нотная запись");
    expect(host.textContent).toContain("Падающие ноты и эффекты");
    expect(host.querySelector("[role=tabpanel] .settings-group")?.getAttribute("aria-label")).toBe(
      "Что показывать"
    );
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
    expect(host.querySelector("[role=tabpanel]")?.textContent).toContain("Калибровать C4");
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
    expect(host.textContent).toContain("клавиатура сама подстраивается");
    expect(host.querySelector("select[aria-label='Клавиши']")).toBeNull();
    expect(host.textContent).toContain("Переключатели вида");
    expect(host.textContent).not.toContain("Показывать FPS");
    await section("О программе");
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
    expect(host.querySelector("[role=tabpanel]")?.textContent).toContain("Калибровать C4");
    await render(false);
    await section("Вид");
    expect(host.textContent).not.toContain("Показывать FPS");
    await section("О программе");
    const pianoFps = Array.from(host.querySelectorAll("label")).filter((label) =>
      label.textContent.includes("Показывать FPS")
    );
    expect(pianoFps).toHaveLength(1);
    expect(pianoFps[0]?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
    await section("Ввод с ПК");
    expect(host.textContent).toContain("По октавам");
  });

  it("offers the hand look next to the key look, 3D by default", async () => {
    await render(false);
    await section("Вид");
    const hands = select("Вид рук");
    expect(hands.value).toBe("rendered");
    await act(async () => {
      await Promise.resolve();
      hands.value = "drawn";
      hands.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select("Вид рук").value).toBe("drawn");
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      handStyle: "drawn"
    });
  });

  it("offers the 3D key style with the camera settings", async () => {
    await render(false);
    await section("Вид");
    const keys = select("Вид клавиш");
    expect(Array.from(keys.options, (option) => option.value)).toEqual(["classic", "arcade", "3d"]);
    expect(keys.value).toBe("3d");
    expect(host.querySelector("input[aria-label='Угол обзора']")).not.toBeNull();
    await act(async () => {
      await Promise.resolve();
      keys.value = "arcade";
      keys.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector("input[aria-label='Угол обзора']")).toBeNull();
    await act(async () => {
      await Promise.resolve();
      keys.value = "3d";
      keys.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select("Вид клавиш").value).toBe("3d");
    expect(host.textContent).not.toContain("Клавиатура сверху");
    expect(host.querySelector("input[aria-label='Угол обзора']")).not.toBeNull();
    expect(host.querySelector("[aria-label='Ракурс пианино']")?.textContent).toContain("Сверху");
    await act(async () => {
      await Promise.resolve();
      const projection = select("Проекция нот");
      projection.value = "perspective";
      projection.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector("input[aria-label='Угол обзора']")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("input[aria-label='Наклон камеры']")?.max).toBe(
      "90"
    );
    expect(
      Array.from(host.querySelectorAll("button")).some((button) => button.textContent === "Сверху")
    ).toBe(true);
  });

  it("keeps the keyboard bright by default and persists optional dimming across projection changes", async () => {
    await render(false);
    await section("Вид");
    await act(async () => {
      await Promise.resolve();
      const keys = select("Вид клавиш");
      keys.value = "3d";
      keys.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const dim = () =>
      Array.from(host.querySelectorAll("label"))
        .find((label) => label.textContent.includes("Приглушить клавиатуру"))
        ?.querySelector<HTMLInputElement>("input");
    expect(dim()?.checked).toBe(false);
    await act(async () => {
      await Promise.resolve();
      dim()?.click();
    });
    expect(dim()?.checked).toBe(true);
    await act(async () => {
      await Promise.resolve();
      const projection = select("Проекция нот");
      projection.value = "perspective";
      projection.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(dim()?.checked).toBe(true);
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      keyboardDim: true
    });
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    root = createRoot(host);
    store = createAppStore();
    await render(false);
    await section("Вид");
    expect(dim()?.checked).toBe(true);
  });

  it("offers optional road guides disabled by default and keeps the choice after reload", async () => {
    await render(false);
    await section("Вид");
    await act(async () => {
      await Promise.resolve();
      const keys = select("Вид клавиш");
      keys.value = "3d";
      keys.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const guides = () =>
      Array.from(host.querySelectorAll("label"))
        .find((label) => label.textContent.includes("Линии перспективы"))
        ?.querySelector<HTMLInputElement>("input");
    expect(guides()?.checked).toBe(false);
    await act(async () => {
      guides()?.click();
      await Promise.resolve();
    });
    expect(guides()?.checked).toBe(true);
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      roadGuides: true
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    store = createAppStore();
    await render(false);
    await section("Вид");
    expect(guides()?.checked).toBe(true);
    await act(async () => {
      setInterfaceLanguage("en");
      await Promise.resolve();
    });
    expect(host.textContent).toContain("Perspective guide lines");
    expect(onMode).not.toHaveBeenCalled();
    expect(onRules).not.toHaveBeenCalled();
  });
});

it.each(["ru", "en"] as const)(
  "navigates from Help to exact controls without changing preferences in %s",
  async (language) => {
    setInterfaceLanguage(language);
    await render();
    const before = JSON.stringify(store.getState().preferences);
    const scroll = vi.fn();
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(scroll);
    for (const target of [
      "key-style",
      "notes-projection",
      "note-color",
      "played-note-color",
      "fps",
      "play-mode",
      "piano-range",
      "midi-output",
      "melody-output",
      "melody-channel",
      "connection-type",
      "audio-offset",
      "calibration"
    ] as const) {
      await section(language === "ru" ? "Помощь" : "Help");
      expect(host.querySelectorAll(".settings-help__guide button")).toHaveLength(7);
      if (language === "en")
        expect(host.querySelector("[role=tabpanel]")?.textContent).not.toMatch(/[А-Яа-яЁё]/);
      const link = host.querySelector<HTMLButtonElement>(`button[data-help-target="${target}"]`);
      expect(link).not.toBeNull();
      const detail = link?.closest("details");
      if (detail) detail.open = true;
      await act(async () => {
        link?.click();
        await Promise.resolve();
      });
      const control = host.querySelector<HTMLElement>(`[data-setting-target="${target}"]`);
      expect(control).not.toBeNull();
      expect(document.activeElement).toBe(control);
      expect(control?.getAttribute("data-setting-highlight")).toBe("true");
      expect(scroll).toHaveBeenLastCalledWith({ block: "center", behavior: "auto" });
      expect(JSON.stringify(store.getState().preferences)).toBe(before);
    }
    expect(onMode).not.toHaveBeenCalled();
    expect(onRules).not.toHaveBeenCalled();
    expect(onTranspose).not.toHaveBeenCalled();
    expect(onDevice).not.toHaveBeenCalled();
    expect(onMidiOutput).not.toHaveBeenCalled();
    expect(onMelodyOutput).not.toHaveBeenCalled();
    expect(onMidiTest).not.toHaveBeenCalled();
    expect(onOffsets).not.toHaveBeenCalled();
    expect(onCalibrate).not.toHaveBeenCalled();
  }
);

it.each(["ru", "en"] as const)(
  "targets the unavailable key style and the working projection in typing mode in %s",
  async (language) => {
    setInterfaceLanguage(language);
    await render(true);
    const before = JSON.stringify(store.getState().preferences);
    for (const target of ["key-style", "shared-notes-projection"] as const) {
      await section(language === "ru" ? "Помощь" : "Help");
      const link = host.querySelector<HTMLButtonElement>(`[data-help-target="${target}"]`);
      const details = link?.closest("details");
      if (details) details.open = true;
      await act(async () => {
        link?.click();
        await Promise.resolve();
      });
      const destination = host.querySelector<HTMLElement>(`[data-setting-target="${target}"]`);
      expect(destination).not.toBeNull();
      expect(document.activeElement).toBe(destination);
      expect(destination?.getAttribute("data-setting-highlight")).toBe("true");
      expect(destination).not.toBe(host.querySelector("[role=tabpanel]"));
      if (target === "key-style") {
        expect(destination?.getAttribute("aria-disabled")).toBe("true");
        expect(destination?.textContent).toContain(
          language === "ru" ? "клавиатура сама подстраивается" : "keyboard fits the selected part"
        );
      } else {
        expect(destination?.tagName).toBe("BUTTON");
        expect(destination?.getAttribute("aria-pressed")).toBe("false");
      }
      expect(JSON.stringify(store.getState().preferences)).toBe(before);
    }
    expect(onMode).not.toHaveBeenCalled();
  }
);

it.each(["ru", "en"] as const)(
  "targets the explained unavailable MIDI channel in browser-only mode in %s",
  async (language) => {
    setInterfaceLanguage(language);
    await render(false, "browser");
    const before = JSON.stringify(store.getState().preferences);
    await section(language === "ru" ? "Помощь" : "Help");
    const link = host.querySelector<HTMLButtonElement>("[data-help-target=melody-channel]");
    const details = link?.closest("details");
    if (details) details.open = true;
    await act(async () => {
      link?.click();
      await Promise.resolve();
    });
    const destination = host.querySelector<HTMLElement>("[data-setting-target=melody-channel]");
    expect(destination).not.toBeNull();
    expect(document.activeElement).toBe(destination);
    expect(destination?.getAttribute("aria-disabled")).toBe("true");
    expect(destination?.getAttribute("data-setting-highlight")).toBe("true");
    expect(destination?.textContent).toContain(
      language === "ru" ? "Канал MIDI недоступен" : "MIDI channel is unavailable"
    );
    expect(
      host.querySelector<HTMLSelectElement>("[data-setting-target=melody-output]")?.value
    ).toBe("browser");
    expect(host.querySelector("select[data-setting-target=melody-channel]")).toBeNull();
    expect(JSON.stringify(store.getState().preferences)).toBe(before);
    expect(onMelodyOutput).not.toHaveBeenCalled();
    expect(onMidiOutput).not.toHaveBeenCalled();
    expect(onMidiTest).not.toHaveBeenCalled();
  }
);
