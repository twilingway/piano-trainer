// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listenToComputerKeyboard, type KeyboardInputOptions } from "./computerKeyboard";
import { presetBindings } from "./keyboardLayouts";
import type { MidiEvent } from "./midiInput";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const stop of disposers.splice(0)) stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function start(options: Partial<KeyboardInputOptions> = {}) {
  const events: MidiEvent[] = [];
  disposers.push(
    listenToComputerKeyboard((event) => events.push(event), {
      bindings: presetBindings("extended_range"),
      ...options
    })
  );
  return events;
}
function send(
  type: "keydown" | "keyup",
  code: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window
) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("browser computer keyboard input", () => {
  it("uses physical codes for Russian input and emits keyboard metadata", () => {
    const events = start();
    const attack = send("keydown", "KeyQ", { key: "й" });
    send("keyup", "KeyQ", { key: "й" });
    expect(attack.defaultPrevented).toBe(true);
    expect(events).toEqual([
      {
        type: "down",
        pitch: 71,
        velocity: 90,
        timestamp: attack.timeStamp,
        source: "keyboard",
        deviceId: "keyboard"
      },
      expect.objectContaining({ type: "up", pitch: 71, source: "keyboard", deviceId: "keyboard" })
    ]);
  });

  it.each(["input", "textarea", "select", "editable", "editable-child"])(
    "leaves typing in %s unclaimed",
    (kind) => {
      const events = start();
      const parent = document.createElement(kind.startsWith("editable") ? "div" : kind);
      if (kind.startsWith("editable")) parent.setAttribute("contenteditable", "true");
      const target =
        kind === "editable-child" ? parent.appendChild(document.createElement("span")) : parent;
      document.body.appendChild(parent);
      expect(send("keydown", "KeyG", {}, target).defaultPrevented).toBe(false);
      expect(events).toEqual([]);
    }
  );

  it("releases the attacked note after focus moves into a typing target and modifiers change", () => {
    const events = start({ bindings: presetBindings("bass_chords") });
    send("keydown", "Comma", { altKey: true });
    send("keyup", "AltLeft");
    const input = document.body.appendChild(document.createElement("input"));
    send("keyup", "Comma", { ctrlKey: true }, input);
    expect(
      events.map((event) => (event.type === "pedal" ? event : [event.type, event.pitch]))
    ).toEqual([
      ["down", 63],
      ["up", 63]
    ]);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, altKey: true }])(
    "does not play regular Ctrl/Meta combinations %j",
    (modifiers) => {
      const events = start();
      const event = new KeyboardEvent("keydown", {
        code: "KeyG",
        cancelable: true,
        ...modifiers
      });
      // Happy DOM infers AltGraph from Ctrl+Alt; model a browser's explicit false state.
      vi.spyOn(event, "getModifierState").mockReturnValue(false);
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(events).toEqual([]);
    }
  );

  it("supports AltGraph flats despite the synthetic Ctrl modifier", () => {
    const events = start();
    const event = new KeyboardEvent("keydown", {
      code: "KeyG",
      ctrlKey: true,
      altKey: true,
      cancelable: true
    });
    vi.spyOn(event, "getModifierState").mockImplementation((modifier) => modifier === "AltGraph");
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(events).toEqual([expect.objectContaining({ type: "down", pitch: 59 })]);
  });

  it.each(["KeyP", "KeyR", "KeyL"])("claims Alt+%s before player shortcuts", (code) => {
    const events = start();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    try {
      expect(send("keydown", code, { altKey: true }).defaultPrevented).toBe(true);
      expect(events).toHaveLength(1);
      expect(shortcut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", shortcut);
    }
  });

  it.each(["AltLeft", "AltRight"])("prevents browser menu activation with %s", (code) => {
    const events = start();
    expect(send("keydown", code, { altKey: true }).defaultPrevented).toBe(true);
    expect(events).toEqual([]);
  });

  it("ignores repeats and releases only the last shared-pitch hold", () => {
    const events = start({ bindings: presetBindings("octave_layout") });
    send("keydown", "KeyA");
    send("keydown", "KeyA", { repeat: true, shiftKey: true });
    send("keydown", "Comma");
    send("keyup", "KeyA");
    expect(events).toEqual([expect.objectContaining({ type: "down", pitch: 60 })]);
    send("keyup", "Comma");
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: "up", pitch: 60 });
  });

  it.each(["blur", "hidden", "dispose"])("clears notes and pedal on %s", (trigger) => {
    const events = start();
    send("keydown", "KeyG");
    send("keydown", "Space");
    if (trigger === "blur") window.dispatchEvent(new Event("blur"));
    else if (trigger === "hidden") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    } else disposers.pop()?.();
    expect(events).toEqual([
      expect.objectContaining({ type: "down", pitch: 60 }),
      expect.objectContaining({ type: "pedal", down: true }),
      expect.objectContaining({ type: "up", pitch: 60 }),
      expect.objectContaining({ type: "pedal", down: false })
    ]);
    send("keyup", "KeyG");
    expect(events).toHaveLength(4);
  });

  it("does not clear held notes on visibilitychange while visible", () => {
    const events = start();
    send("keydown", "KeyG");
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(events).toHaveLength(1);
  });

  it("does not intercept blocked, disabled or already-prevented input", () => {
    const events = start({ blocked: true });
    expect(send("keydown", "KeyG").defaultPrevented).toBe(false);
    expect(events).toEqual([]);
    disposers.pop()?.();
    const enabled = start({ bindings: { KeyG: { type: "disabled" } } });
    expect(send("keydown", "KeyG").defaultPrevented).toBe(false);
    expect(enabled).toEqual([]);
    disposers.pop()?.();
    const normal = start();
    const event = new KeyboardEvent("keydown", { code: "KeyG", cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(normal).toEqual([]);
  });

  it("captures assignable codes exclusively, ignores repeats and modifiers, and cancels on Escape", () => {
    const capture = vi.fn();
    const cancelCapture = vi.fn();
    const events = start({ capture, cancelCapture });
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    try {
      const input = document.body.appendChild(document.createElement("input"));
      expect(send("keydown", "KeyG", { ctrlKey: true }, input).defaultPrevented).toBe(true);
      send("keydown", "KeyG", { repeat: true });
      send("keydown", "ShiftLeft");
      send("keydown", "Escape");
      expect(send("keyup", "KeyG").defaultPrevented).toBe(true);
      expect(capture).toHaveBeenCalledExactlyOnceWith("KeyG");
      expect(cancelCapture).toHaveBeenCalledOnce();
      expect(shortcut).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    } finally {
      window.removeEventListener("keydown", shortcut);
    }
  });
});
