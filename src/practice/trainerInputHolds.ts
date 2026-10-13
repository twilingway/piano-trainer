import type { KeyEvent } from "../input/midiInput";

/** Initial ownership only: pair assessment still orders its own complete event journal. */
export class TrainerInputHolds {
  private readonly held = new Map<string, KeyEvent>();
  private readonly releases = new Map<string, number>();

  record(event: KeyEvent, received: number): void {
    const raw = event.timestamp ?? received;
    if (!Number.isFinite(raw) || raw > received) return;
    for (const [key, released] of this.releases)
      if (released < received - 250) this.releases.delete(key);
    const id = JSON.stringify([
      event.source ?? "pointer",
      event.deviceId ?? "",
      event.channel ?? 0,
      event.pitch
    ]);
    const previous = this.held.get(id);
    if (received - raw > 250) {
      if (event.type === "up" && previous && raw >= (previous.timestamp ?? raw))
        this.held.delete(id);
      return;
    }
    if (event.type === "down") {
      const release = this.releases.get(id);
      if (release !== undefined && raw < release) return;
      if (!previous) this.held.set(id, { ...event, timestamp: raw });
    } else {
      this.releases.set(id, Math.max(raw, this.releases.get(id) ?? raw));
      if (previous && raw >= (previous.timestamp ?? raw)) this.held.delete(id);
    }
  }

  snapshot(): readonly KeyEvent[] {
    return [...this.held.values()];
  }

  clear(): void {
    this.held.clear();
    this.releases.clear();
  }
}
