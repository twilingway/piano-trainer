import { KeyboardState } from "./keyboardState";
import type { KeyboardAction } from "./keyboardState";
import { DEFAULT_KEYBOARD_PREFS, isAssignableCode, presetBindings } from "./keyboardLayouts";
import type { KeyboardBindings } from "./keyboardLayouts";
import type { MidiEvent } from "./midiInput";
import { WordKeyboardState } from "./wordKeyboardState";
import { OVERDRIVE_KEY } from "../wordTyping/inputTokens";

export interface KeyboardInputOptions {
  readonly bindings: KeyboardBindings;
  readonly blocked?: boolean;
  readonly capture?: (code: string) => void;
  readonly cancelCapture?: () => void;
  /**
   * The pitch of a word-mode token ("modifier:code") while the player owes `owedNoteId`; bypasses
   * all piano bindings and modifiers. Undefined = the key plays nothing.
   */
  readonly wordPitch?: (tokenId: string, owedNoteId: string | undefined) => number | undefined;
  /** The note the player owes now, for a per-word layout. */
  readonly owedNoteId?: () => string | undefined;
  /** The Overdrive key was pressed: in both games, unless the player gave it a piano note. */
  readonly onOverdrive?: () => void;
}
/** A key event as a word-mode token ("modifier:code"); Shift with Alt types nothing. */
export function wordTokenId(event: KeyboardEvent): string | undefined {
  const alt = event.altKey || event.getModifierState("AltGraph");
  if (event.shiftKey && alt) return undefined;
  return `${alt ? "alt" : event.shiftKey ? "shift" : "none"}:${event.code}`;
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
  const pianoState = new KeyboardState();
  const wordState = new WordKeyboardState();
  const state = options.wordPitch ? wordState : pianoState;
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
    if (
      event.code === OVERDRIVE_KEY &&
      (options.wordPitch || !binding || binding.type === "disabled")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) options.onOverdrive?.();
      return;
    }
    if (options.wordPitch) {
      const tokenId = wordTokenId(event);
      if (tokenId === undefined) return;
      const pitch = options.wordPitch(tokenId, options.owedNoteId?.());
      if (pitch === undefined) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) emit(wordState.press(event.code, pitch), event.timeStamp);
      return;
    }
    if (!binding || binding.type === "disabled") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat)
      emit(
        pianoState.press(event.code, options.bindings, {
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
