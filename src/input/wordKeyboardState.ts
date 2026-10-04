import type { KeyboardAction } from "./keyboardState";

/** Each physical alias attacks; only the last alias releases the shared voice. */
export class WordKeyboardState {
  private readonly held = new Map<string, number>();

  press(code: string, pitch: number): KeyboardAction[] {
    if (this.held.has(code)) return [];
    this.held.set(code, pitch);
    return [{ type: "down", pitch }];
  }

  has(code: string): boolean {
    return this.held.has(code);
  }

  release(code: string): KeyboardAction[] {
    const pitch = this.held.get(code);
    if (pitch === undefined) return [];
    this.held.delete(code);
    return [...this.held.values()].includes(pitch) ? [] : [{ type: "up", pitch }];
  }

  clear(): KeyboardAction[] {
    const actions: KeyboardAction[] = [...new Set(this.held.values())].map((pitch) => ({
      type: "up",
      pitch
    }));
    this.held.clear();
    return actions;
  }
}
