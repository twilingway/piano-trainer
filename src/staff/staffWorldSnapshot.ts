import type { BeatSpot } from "./liveCursor";
import type { LineBox } from "./staffViewport";

export interface StaffWorldSnapshot {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly spots: readonly BeatSpot[];
  readonly lines: readonly LineBox[];
}
export type StaffWorldStatus = "idle" | "loading" | "ready" | "error";

/** Owned by one Workspace; no global bus and no second musical clock. */
export class StaffWorldSource {
  snapshot: StaffWorldSnapshot | undefined;
  enabled = false;
  readBeat: () => number = () => 0;
  private status: StaffWorldStatus = "idle";
  private readonly changes = new Set<() => void>();
  private readonly statuses = new Set<() => void>();
  publish = (snapshot: StaffWorldSnapshot | undefined): void => {
    this.snapshot = snapshot;
    this.setStatus(this.enabled && snapshot ? "loading" : "idle");
    this.changes.forEach((listener) => {
      listener();
    });
  };
  configure(enabled: boolean, readBeat: () => number): void {
    this.readBeat = readBeat;
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.setStatus(enabled && this.snapshot ? "loading" : "idle");
    this.changes.forEach((listener) => {
      listener();
    });
  }
  subscribe = (listener: () => void): (() => void) => {
    this.changes.add(listener);
    return () => this.changes.delete(listener);
  };
  subscribeStatus = (listener: () => void): (() => void) => {
    this.statuses.add(listener);
    return () => this.statuses.delete(listener);
  };
  getStatus = (): StaffWorldStatus => this.status;
  setStatus(status: StaffWorldStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.statuses.forEach((listener) => {
      listener();
    });
  }
}
