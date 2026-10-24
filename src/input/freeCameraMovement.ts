import { isTypingTarget } from "./computerKeyboard";

export const FREE_CAMERA_CODES: ReadonlySet<string> = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

/** Camera-only input; never emits piano events or advances practice time. */
export class FreeCameraMovement {
  private readonly held = new Set<string>();
  private enabled = false;

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.clear();
    if (on) {
      window.addEventListener("keydown", this.down);
      window.addEventListener("keyup", this.up);
      window.addEventListener("blur", this.clear);
      document.addEventListener("visibilitychange", this.clear);
      document.addEventListener("focusin", this.focus);
    } else {
      window.removeEventListener("keydown", this.down);
      window.removeEventListener("keyup", this.up);
      window.removeEventListener("blur", this.clear);
      document.removeEventListener("visibilitychange", this.clear);
      document.removeEventListener("focusin", this.focus);
    }
  }

  readonly clear = (): void => {
    this.held.clear();
  };
  private readonly focus = (event: Event): void => {
    if (isTypingTarget(event.target)) this.clear();
  };
  private readonly down = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      isTypingTarget(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !FREE_CAMERA_CODES.has(event.code)
    )
      return;
    event.preventDefault();
    this.held.add(event.code);
  };
  private readonly up = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  get axes(): { forward: number; right: number } {
    return {
      forward: Number(this.held.has("KeyW")) - Number(this.held.has("KeyS")),
      right: Number(this.held.has("KeyD")) - Number(this.held.has("KeyA"))
    };
  }

  dispose(): void {
    this.setEnabled(false);
  }
}
