import type { RoadLayer } from "./RoadLayer";
import { DEFAULT_FREE_DIRECT_FIELD, type FreeRoadLayout } from "./freeRoadLayout";

/** Transient view switches never rewrite the player's stored camera pose. */
export class ViewSceneCamera {
  private free = false;
  private movement = false;
  private layout: FreeRoadLayout = DEFAULT_FREE_DIRECT_FIELD;
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
  setMovement = (on: boolean): void => {
    this.movement = on;
    this.apply();
  };
  setRoadLayout = (layout: FreeRoadLayout): void => {
    this.layout = layout;
    this.road()?.setFreeRoadLayout(layout);
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
    road?.setFreeRoadLayout(this.layout);
    road?.setPerformanceScene(this.performance && enabled);
    road?.setFreeCamera(this.free && !this.performance && enabled, this.changed);
    road?.setFreeCameraMovement(this.movement && this.free && !this.performance && enabled);
  };
}
