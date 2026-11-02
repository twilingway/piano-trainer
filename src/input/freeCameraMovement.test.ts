// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { listenToComputerKeyboard } from "./computerKeyboard";
import { FREE_CAMERA_CODES, FreeCameraMovement } from "./freeCameraMovement";
import { presetBindings } from "./keyboardLayouts";
import type { MidiEvent } from "./midiInput";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
  document.body.replaceChildren();
});
function send(type: "keydown" | "keyup", code: string, target: EventTarget = window) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}
function setup(enabled = true) {
  const input = new FreeCameraMovement();
  input.setEnabled(enabled);
  cleanups.push(() => {
    input.dispose();
  });
  return input;
}
describe("free camera keyboard input", () => {
  it("reserves camera keys before the piano capture listener, leaving other notes playable", () => {
    const events: MidiEvent[] = [];
    cleanups.push(
      listenToComputerKeyboard((event) => events.push(event), {
        bindings: presetBindings("extended_range"),
        reservedCodes: FREE_CAMERA_CODES
      })
    );
    const input = setup();
    expect(send("keydown", "KeyW").defaultPrevented).toBe(true);
    expect(input.axes).toEqual({ forward: 1, right: 0 });
    expect(events).toHaveLength(0);
    send("keyup", "KeyW");
    expect(input.axes.forward).toBe(0);
    send("keydown", "KeyF");
    send("keyup", "KeyF");
    expect(events.map((event) => event.type)).toEqual(["down", "up"]);
  });
  it("keeps WASD as ordinary piano bindings when disabled", () => {
    const input = setup(false);
    const events: MidiEvent[] = [];
    cleanups.push(
      listenToComputerKeyboard((event) => events.push(event), {
        bindings: presetBindings("extended_range")
      })
    );
    send("keydown", "KeyA");
    send("keyup", "KeyA");
    expect(events.map((event) => event.type)).toEqual(["down", "up"]);
    expect(input.axes).toEqual({ forward: 0, right: 0 });
  });
  it.each(["blur", "visibilitychange", "disable", "focus"])(
    "clears held keys on %s without resuming them",
    (action) => {
      const input = setup();
      send("keydown", "KeyW");
      send("keydown", "KeyD");
      if (action === "blur") window.dispatchEvent(new Event("blur"));
      if (action === "visibilitychange") document.dispatchEvent(new Event("visibilitychange"));
      if (action === "disable") {
        input.setEnabled(false);
        input.setEnabled(true);
      }
      if (action === "focus") {
        const field = document.createElement("input");
        document.body.append(field);
        field.focus();
        expect(send("keydown", "KeyW", field).defaultPrevented).toBe(false);
      }
      expect(input.axes).toEqual({ forward: 0, right: 0 });
    }
  );
  it("gives keyboard assignment capture priority over camera keys", () => {
    const codes: string[] = [];
    cleanups.push(
      listenToComputerKeyboard(() => undefined, {
        bindings: {},
        reservedCodes: FREE_CAMERA_CODES,
        capture: (code) => codes.push(code)
      })
    );
    const input = setup();
    send("keydown", "KeyW");
    expect(codes).toEqual(["KeyW"]);
    expect(input.axes.forward).toBe(0);
  });
});
