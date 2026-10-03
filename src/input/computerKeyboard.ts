import { KeyboardState } from "./keyboardState";
import type { KeyboardAction } from "./keyboardState";
import { DEFAULT_KEYBOARD_PREFS, isAssignableCode, presetBindings } from "./keyboardLayouts";
import type { KeyboardBindings } from "./keyboardLayouts";
import type { MidiEvent } from "./midiInput";

export interface KeyboardInputOptions {
  readonly bindings: KeyboardBindings;
  readonly blocked?: boolean;
  readonly capture?: (code: string) => void;
  readonly cancelCapture?: () => void;
}
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false']), [data-keyboard-editor]"
      )
    )
  );
}
export function listenToComputerKeyboard(
  onEvent: (event: MidiEvent) => void,
  options: KeyboardInputOptions = { bindings: presetBindings(DEFAULT_KEYBOARD_PREFS.preset) }
): () => void {
  const state = new KeyboardState();
  const emit = (actions: KeyboardAction[], timestamp: number) => {
    for (const action of actions) {
      const metadata = { timestamp, source: "keyboard" as const, deviceId: "keyboard" };
      if (action.type === "pedal") onEvent({ ...action, ...metadata });
      else onEvent({ ...action, ...metadata, velocity: 90 });
    }
  };
  const down = (event: KeyboardEvent) => {
    if (options.capture) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape") options.cancelCapture?.();
      else if (isAssignableCode(event.code)) options.capture(event.code);
      return;
    }
    if (options.blocked || event.defaultPrevented || isTypingTarget(event.target)) return;
    const altGraph = event.getModifierState("AltGraph");
    if (event.metaKey || (event.ctrlKey && !altGraph)) return;
    // Prevent Alt from focusing the browser menu while it modifies piano notes.
    if (["AltLeft", "AltRight"].includes(event.code)) {
      event.preventDefault();
      return;
    }
    const binding = options.bindings[event.code];
    if (!binding || binding.type === "disabled") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat)
      emit(
        state.press(event.code, options.bindings, {
          shift: event.shiftKey,
          alt: event.altKey || altGraph
        }),
        event.timeStamp
      );
  };
  const up = (event: KeyboardEvent) => {
    if (options.capture) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!state.has(event.code)) return;
    event.preventDefault();
    emit(state.release(event.code), event.timeStamp);
  };
  const clear = () => {
    emit(state.clear(), performance.now());
  };
  const visibility = () => {
    if (document.hidden) clear();
  };
  window.addEventListener("keydown", down, true);
  window.addEventListener("keyup", up, true);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    clear();
    window.removeEventListener("keydown", down, true);
    window.removeEventListener("keyup", up, true);
    window.removeEventListener("blur", clear);
    document.removeEventListener("visibilitychange", visibility);
  };
}
