import type { KeyboardLayer } from "./KeyboardLayer";
import type { HandsLayer } from "./HandsLayer";
import type { RoadLayer } from "./RoadLayer";
import { UPDATE_PRIORITY, type Ticker } from "./flatThree";

/** First presentation follows the saved settings and the renderer's LOW-priority frame. */
export class ViewStartupPresentation {
  private drawn = false;
  private presented = false;
  private keyboard: KeyboardLayer | undefined;
  private hands: HandsLayer | undefined;
  private road: RoadLayer | undefined;

  setSources(keyboard: KeyboardLayer, hands: HandsLayer, road: RoadLayer): void {
    this.keyboard = keyboard;
    this.hands = hands;
    this.road = road;
  }

  constructor(
    private readonly ticker: Pick<Ticker, "add" | "remove">,
    private readonly resourcesSettled: () => boolean = () =>
      this.keyboard !== undefined &&
      !this.keyboard.paintLoading &&
      (!this.hands?.container.visible || this.hands.startupSettled) &&
      this.road?.startupStatus() !== "loading"
  ) {}

  begin(): void {
    this.drawn = this.presented = false;
    this.ticker.remove(this.present);
    this.ticker.add(this.present, undefined, UPDATE_PRIORITY.UTILITY);
  }

  markDrawn(): void {
    this.drawn = true;
  }

  get status(): "loading" | "ready" {
    return this.presented && this.resourcesSettled() ? "ready" : "loading";
  }

  private readonly present = (): void => {
    if (!this.drawn || !this.resourcesSettled()) return;
    this.presented = true;
    this.ticker.remove(this.present);
  };
}
