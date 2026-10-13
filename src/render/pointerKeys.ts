import type { KeyEvent } from "../input/midiInput";

export interface KeyPointer {
  readonly pointerId: number;
  readonly pointerType?: string | undefined;
  readonly timeStamp?: number | undefined;
}

/** Physical ownership is per pointer; the input stream changes only at pitch transitions. */
export class PointerKeys {
  private readonly held = new Map<number, number>();
  constructor(private readonly emit: (event: KeyEvent) => void) {}

  press(pitch: number, pointer: KeyPointer): void {
    if (this.held.get(pointer.pointerId) === pitch) return;
    this.release(pointer);
    const sounding = [...this.held.values()].includes(pitch);
    this.held.set(pointer.pointerId, pitch);
    if (!sounding) this.event("down", pitch, pointer);
  }

  release(pointer: KeyPointer): void {
    const pitch = this.held.get(pointer.pointerId);
    if (pitch === undefined) return;
    this.held.delete(pointer.pointerId);
    if (![...this.held.values()].includes(pitch)) this.event("up", pitch, pointer);
  }

  clear(): void {
    for (const pointerId of [...this.held.keys()])
      this.release({ pointerId, timeStamp: performance.now() });
  }

  private event(type: "down" | "up", pitch: number, pointer: KeyPointer): void {
    this.emit({
      type,
      pitch,
      velocity: type === "down" ? 90 : 0,
      timestamp: pointer.timeStamp ?? performance.now(),
      source: "pointer",
      deviceId: "pointer",
      pointerType: pointer.pointerType
    });
  }
}
