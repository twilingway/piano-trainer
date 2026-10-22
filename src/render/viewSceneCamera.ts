import type { RoadLayer } from "./RoadLayer";

/** Transient view switches never rewrite the player's stored camera pose. */
export class ViewSceneCamera {
  private free = false;
  performance = false;
  constructor(
    private readonly road: () => RoadLayer | undefined,
    private readonly enabled: () => boolean,
    private readonly changed: (on: boolean) => void
  ) {}

  setFree = (on: boolean): void => {
    this.free = on;
    this.apply();
  };
  setPerformance = (on: boolean): void => {
    this.performance = on;
    this.apply();
  };

  get active(): boolean {
    return this.performance && this.enabled();
  }

  frame(time: number): void {
    const road = this.road();
    road?.setSongTime(time);
    road?.setPerformanceScene(this.active);
  }

  apply = (): void => {
    const road = this.road(),
      enabled = this.enabled();
    road?.setPerformanceScene(this.performance && enabled);
    road?.setFreeCamera(this.free && !this.performance && enabled, this.changed);
  };
}
