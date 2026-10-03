import type { KeyBinding, KeyboardBindings } from "./keyboardLayouts";
export type KeyboardAction =
  | { readonly type: "down" | "up"; readonly pitch: number }
  | { readonly type: "pedal"; readonly down: boolean };
export interface KeyboardModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
}

/** Pure ownership of physical holds; only the first attack and last release reach the piano. */
export class KeyboardState {
  private held = new Map<string, KeyBinding>();
  private notes = new Map<number, number>();
  private pedals = 0;
  private octave = 0;

  press(code: string, bindings: KeyboardBindings, modifiers: KeyboardModifiers): KeyboardAction[] {
    if (this.held.has(code)) return [];
    const binding = bindings[code];
    if (!binding || binding.type === "disabled") return [];
    if (binding.type === "note") {
      const pitch = binding.pitch + Number(modifiers.shift) - Number(modifiers.alt) + this.octave;
      if (pitch < 0 || pitch > 127) return [];
      this.held.set(code, { type: "note", pitch });
      const count = this.notes.get(pitch) ?? 0;
      this.notes.set(pitch, count + 1);
      return count === 0 ? [{ type: "down", pitch }] : [];
    }
    this.held.set(code, binding);
    if (binding.type === "sustain")
      return ++this.pedals === 1 ? [{ type: "pedal", down: true }] : [];
    this.octave = Math.max(
      -120,
      Math.min(120, this.octave + (binding.type === "octaveUp" ? 12 : -12))
    );
    return [];
  }

  has(code: string): boolean {
    return this.held.has(code);
  }

  release(code: string): KeyboardAction[] {
    const binding = this.held.get(code);
    if (!binding) return [];
    this.held.delete(code);
    if (binding.type === "note") {
      const remaining = (this.notes.get(binding.pitch) ?? 1) - 1;
      if (remaining > 0) {
        this.notes.set(binding.pitch, remaining);
        return [];
      }
      this.notes.delete(binding.pitch);
      return [{ type: "up", pitch: binding.pitch }];
    }
    if (binding.type === "sustain")
      return --this.pedals === 0 ? [{ type: "pedal", down: false }] : [];
    return [];
  }

  clear(): KeyboardAction[] {
    const actions: KeyboardAction[] = [...this.notes.keys()].map((pitch) => ({
      type: "up",
      pitch
    }));
    if (this.pedals > 0) actions.push({ type: "pedal", down: false });
    this.held.clear();
    this.notes.clear();
    this.pedals = 0;
    this.octave = 0;
    return actions;
  }
}
