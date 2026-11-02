import { SettingsPanel } from "../SettingsPanel";
import { HelpSettings } from "./HelpSettings";
// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import {
  InstrumentProfileSettings,
  type InstrumentPreviewControls,
  type InstrumentProfileControls
} from "./InstrumentProfileSettings";
import { GRACE_BP300, type PianoProfile } from "../../input/instrumentProfiles";

vi.mock("../GameDialog", () => ({
  GameDialog: ({ children }: { children: ReactNode }) => <section>{children}</section>
}));

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

function chooser() {
  const element = host.querySelector<HTMLButtonElement>("[role=combobox]");
  if (!element) throw new Error("Missing instrument chooser");
  return element;
}
function openChooser() {
  act(() => {
    chooser().click();
  });
}
function options() {
  return [...document.querySelectorAll<HTMLElement>("[role=option]")];
}
function key(value: string) {
  act(() => {
    chooser().dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })
    );
  });
}

it("shows the named grouped catalog and keeps unknown MIDI mappings disabled", () => {
  render();
  expect(select("Профиль пианино").selectedOptions[0]?.textContent).toBe("My Piano");
  expect(chooser().textContent).toContain("Не менять тембр");
  openChooser();
  expect(document.querySelector("[role=group]")?.getAttribute("aria-label")).toBe("Pipe");
  expect(options()[1]?.textContent).toBe("VOI075 · Pan Flute");
  expect(options()[2]?.getAttribute("aria-disabled")).toBe("true");
  expect(options()[2]?.textContent).toContain("нет MIDI-команды");
  act(() => {
    options()[2]?.click();
  });
  expect(controls.onInstrument).not.toHaveBeenCalled();
  act(() => {
    options()[1]?.click();
  });
  expect(controls.onInstrument).toHaveBeenCalledExactlyOnceWith("pan");
  expect(document.querySelector("[role=listbox]")).toBeNull();
  expect(document.activeElement).toBe(chooser());
});

it("enables all captured Grace voices and chooses Hu Ensemble explicitly", () => {
  controls = {
    ...controls,
    profiles: [GRACE_BP300],
    profile: GRACE_BP300,
    profileId: GRACE_BP300.id
  };
  render();
  openChooser();
  expect(options()).toHaveLength(239);
  expect(options().every((option) => option.getAttribute("aria-disabled") !== "true")).toBe(true);
  const hu = options().find((option) => option.textContent.includes("Hu Ensemble"));
  act(() => {
    hu?.click();
  });
  expect(controls.onInstrument).toHaveBeenCalledExactlyOnceWith("voice-237");
});

it("reopens on the selected voice after navigation and scrolls it into view each time", () => {
  const scroll = vi.fn();
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  HTMLElement.prototype.scrollIntoView = scroll;
  try {
    controls = {
      ...controls,
      profiles: [GRACE_BP300],
      profile: GRACE_BP300,
      profileId: GRACE_BP300.id,
      instrumentId: "voice-233"
    };
    render();
    openChooser();
    const selected = document.querySelector<HTMLElement>("[role=option][aria-selected=true]");
    expect(selected?.textContent).toContain("VOI233");
    expect(chooser().getAttribute("aria-activedescendant")).toBe(selected?.id);
    expect(scroll.mock.instances.at(-1)).toBe(selected);
    key("ArrowUp");
    expect(chooser().getAttribute("aria-activedescendant")).not.toBe(selected?.id);
    expect(controls.onInstrument).not.toHaveBeenCalled();
    key("Escape");
    expect(document.querySelector("[role=listbox]")).toBeNull();
    openChooser();
    expect(chooser().getAttribute("aria-activedescendant")).toBe(selected?.id);
    expect(scroll.mock.instances.at(-1)).toBe(
      document.querySelector("[role=option][aria-selected=true]")
    );
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(3);
    key("Enter");
    expect(controls.onInstrument).not.toHaveBeenCalled();
  } finally {
    if (previous) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previous);
  }
});

it("skips disabled voices, commits only on Enter and supports Home, End and no change", () => {
  render();
  key("ArrowDown");
  key("End");
  expect(chooser().getAttribute("aria-activedescendant")).toBe(options()[1]?.id);
  expect(controls.onInstrument).not.toHaveBeenCalled();
  key("Enter");
  expect(controls.onInstrument).toHaveBeenCalledExactlyOnceWith("pan");
  controls = { ...controls, instrumentId: "pan" };
  render();
  openChooser();
  key("Home");
  key("Enter");
  expect(controls.onInstrument).toHaveBeenLastCalledWith(null);
});

it("closes on outside pointer, Tab and focus leaving without selecting", () => {
  render();
  openChooser();
  act(() => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  expect(document.querySelector("[role=listbox]")).toBeNull();
  openChooser();
  key("Tab");
  expect(document.querySelector("[role=listbox]")).toBeNull();
  openChooser();
  act(() => {
    chooser().dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body })
    );
  });
  expect(document.querySelector("[role=listbox]")).toBeNull();
  expect(controls.onInstrument).not.toHaveBeenCalled();
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
  expect(chooser().disabled).toBe(true);
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

it("keeps imported voice IDs with spaces valid in aria-activedescendant", () => {
  const spacedProfile = {
    ...profile,
    instruments: [{ id: "grand piano", name: "Grand", program: 0 }]
  };
  controls = {
    ...controls,
    profiles: [spacedProfile],
    profile: spacedProfile,
    instrumentId: "grand piano"
  };
  render();
  openChooser();
  const activeId = chooser().getAttribute("aria-activedescendant");
  expect(activeId).not.toMatch(/\s/);
  expect(activeId).toContain("grand%20piano");
  expect(document.getElementById(activeId ?? "")?.getAttribute("aria-selected")).toBe("true");
  key("Home");
  key("ArrowDown");
  key("Enter");
  expect(controls.onInstrument).not.toHaveBeenCalled();
});

it.each(["ru", "en"] as const)(
  "focuses the exact piano profile and voice controls from Help in %s without sending MIDI",
  (language) => {
    setInterfaceLanguage(language);
    act(() => {
      root.render(
        <SettingsPanel
          open
          onClose={() => undefined}
          tabs={[
            {
              id: "help",
              title: "Help",
              render: (navigate) => (
                <HelpSettings
                  wordTyping={false}
                  onNavigate={(target) => {
                    navigate("midi", target);
                  }}
                />
              )
            },
            {
              id: "midi",
              title: "Piano",
              content: <InstrumentProfileSettings controls={controls} preview={preview} />
            }
          ]}
        />
      );
    });
    for (const target of ["instrument-profile", "instrument-voice"] as const) {
      act(() => {
        host.querySelector<HTMLButtonElement>("[role=tab]")?.click();
      });
      const link = host.querySelector<HTMLButtonElement>(`[data-help-target="${target}"]`);
      const details = link?.closest("details");
      if (details) details.open = true;
      act(() => {
        link?.click();
      });
      const control = host.querySelector<HTMLElement>(`[data-setting-target="${target}"]`);
      expect(control).not.toBeNull();
      expect(document.activeElement).toBe(control);
      expect(control?.getAttribute("data-setting-highlight")).toBe("true");
      expect(host.querySelector("[role=listbox]")).toBeNull();
    }
    expect(controls.onProfile).not.toHaveBeenCalled();
    expect(controls.onInstrument).not.toHaveBeenCalled();
    expect(preview.onPlay).not.toHaveBeenCalled();
  }
);
