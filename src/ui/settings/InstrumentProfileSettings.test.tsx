// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import {
  InstrumentProfileSettings,
  type InstrumentPreviewControls,
  type InstrumentProfileControls
} from "./InstrumentProfileSettings";
import { GRACE_BP300, type PianoProfile } from "../../input/instrumentProfiles";

const profile: PianoProfile = {
  id: "piano",
  name: "My Piano",
  instruments: [
    { id: "pan", name: "Pan Flute", group: "Pipe", panelNumber: 75, program: 75 },
    { id: "pan2", name: "Pan Flute 2", group: "Pipe", panelNumber: 176, program: null }
  ]
};
let host: HTMLDivElement;
let root: Root;
let controls: InstrumentProfileControls;
let preview: InstrumentPreviewControls;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  controls = {
    profiles: [profile],
    profile,
    profileId: profile.id,
    instrumentId: null,
    error: null,
    importing: false,
    onProfile: vi.fn(),
    onName: vi.fn(),
    onInstrument: vi.fn(),
    onImport: vi.fn(() => Promise.resolve())
  };
  preview = { available: false, playing: false, onPlay: vi.fn(), onStop: vi.fn() };
});
afterEach(() => {
  act(() => {
    root.unmount();
    setInterfaceLanguage("ru");
  });
  host.remove();
  vi.unstubAllGlobals();
});
const render = () => {
  act(() => {
    root.render(<InstrumentProfileSettings controls={controls} preview={preview} />);
  });
};
function select(label: string) {
  const element = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing select: ${label}`);
  return element;
}
function button(text: string) {
  const element = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
}

it("shows the named grouped catalog and leaves unknown MIDI mappings visible but disabled", () => {
  render();
  expect(select("Профиль пианино").selectedOptions[0]?.textContent).toBe("My Piano");
  const instruments = select("Тембр MIDI-пианино");
  expect(instruments.value).toBe("");
  expect(instruments.querySelector("optgroup")?.label).toBe("Pipe");
  expect(instruments.options[1]?.textContent).toBe("VOI075 · Pan Flute");
  expect(instruments.options[2]?.disabled).toBe(true);
  expect(instruments.options[2]?.textContent).toContain("нет MIDI-команды");
  act(() => {
    instruments.value = "pan";
    instruments.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(controls.onInstrument).toHaveBeenCalledWith("pan");
});

it("enables all 238 captured Grace voices including Hu Ensemble", () => {
  controls = {
    ...controls,
    profiles: [GRACE_BP300],
    profile: GRACE_BP300,
    profileId: GRACE_BP300.id
  };
  render();
  const instruments = select("Тембр MIDI-пианино");
  expect(instruments.options).toHaveLength(239);
  expect([...instruments.options].every((option) => !option.disabled)).toBe(true);
  act(() => {
    instruments.value = "voice-237";
    instruments.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(controls.onInstrument).toHaveBeenCalledWith("voice-237");
  expect(host.textContent).not.toContain("нет MIDI-команды");
});

it("shows why preview is unavailable, starts it when allowed and keeps Stop enabled", () => {
  preview = { ...preview, reason: "Connect a MIDI output" };
  render();
  expect(button("Прослушать тембр").disabled).toBe(true);
  expect(host.textContent).toContain("Connect a MIDI output");
  preview = { ...preview, available: true, reason: undefined };
  render();
  act(() => {
    button("Прослушать тембр").click();
  });
  expect(preview.onPlay).toHaveBeenCalledOnce();
  preview = { ...preview, playing: true, available: false };
  render();
  expect(button("Остановить прослушивание").disabled).toBe(false);
  act(() => {
    button("Остановить прослушивание").click();
  });
  expect(preview.onStop).toHaveBeenCalledOnce();
});

it("stops preview when its settings content is closed", () => {
  render();
  act(() => {
    root.unmount();
  });
  expect(preview.onStop).toHaveBeenCalledOnce();
});

it("allows no piano profile while keeping import and its example available", () => {
  render();
  const profiles = select("Профиль пианино");
  expect(profiles.options[0]?.textContent).toBe("Не выбран");
  act(() => {
    profiles.value = "";
    profiles.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(controls.onProfile).toHaveBeenCalledWith(null);
  controls = { ...controls, profile: undefined, profileId: null, instrumentId: null };
  preview = { ...preview, available: true };
  render();
  expect(select("Профиль пианино").value).toBe("");
  expect(select("Тембр MIDI-пианино").disabled).toBe(true);
  expect(host.querySelector("input[type=text]")).toBeNull();
  expect(host.textContent).not.toContain("Тембров в профиле:");
  expect(button("Прослушать тембр").disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>("input[type=file]")?.disabled).toBe(false);
  expect(host.querySelector("a[download]")).not.toBeNull();
});

it("passes an imported file and clears the input so the same file can be imported again", () => {
  render();
  const input = host.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("Missing file input");
  const file = new File(["{}"], "profile.json", { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file] });
  Object.defineProperty(input, "value", { value: "profile.json", writable: true });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(controls.onImport).toHaveBeenCalledExactlyOnceWith(file);
  expect(input.value).toBe("");
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(controls.onImport).toHaveBeenCalledTimes(2);
});

it("shows localized import help, its downloadable example and import errors", () => {
  act(() => {
    setInterfaceLanguage("en");
  });
  controls = { ...controls, error: "Invalid JSON" };
  render();
  expect(host.querySelector("[role=alert]")?.textContent).toBe("Invalid JSON");
  expect(host.querySelector("summary")?.textContent).toBe("Piano import format");
  expect(host.querySelector("a[download]")?.getAttribute("href")).toBe(
    "/examples/piano-instruments.json"
  );
  expect(host.querySelector("pre")?.textContent).toContain('"program": null');
  expect(host.textContent).not.toMatch(/[А-Яа-яЁё]/);
});

it("commits a renamed piano on blur rather than on each keystroke", () => {
  render();
  const input = host.querySelector<HTMLInputElement>("input[type=text]");
  if (!input) throw new Error("Missing name input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.bind(
    input
  );
  if (!setter) throw new Error("Missing native value setter");
  act(() => {
    setter("My Grace");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(controls.onName).not.toHaveBeenCalled();
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(controls.onName).toHaveBeenCalledExactlyOnceWith("My Grace");
});
