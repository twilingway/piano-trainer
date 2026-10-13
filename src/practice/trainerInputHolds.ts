import type { KeyEvent } from "../input/midiInput";

/** Initial ownership only: pair assessment still orders its own complete event journal. */
export class TrainerInputHolds {
  private readonly held = new Map<string, KeyEvent>();

  record(event: KeyEvent, received: number): void {
    const raw = event.timestamp ?? received;
    if (!Number.isFinite(raw) || raw > received || received - raw > 250) return;
    const id = JSON.stringify([
      event.source ?? "pointer",
      event.deviceId ?? "",
      event.channel ?? 0,
      event.pitch
    ]);
    const previous = this.held.get(id);
    if (event.type === "down") {
      if (!previous) this.held.set(id, { ...event, timestamp: raw });
    } else if (previous && raw >= (previous.timestamp ?? raw)) this.held.delete(id);
  }

  snapshot(): readonly KeyEvent[] {
    return [...this.held.values()];
  }

  clear(): void {
    this.held.clear();
  }
}
