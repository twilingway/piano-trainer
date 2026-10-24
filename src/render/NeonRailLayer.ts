import { Assets, Container, Rectangle, Sprite, Texture } from "./flatThree";

const ATLAS = new URL("../fx/neon-rail.webp", import.meta.url).href;
const FRAMES = 48;
const COLUMNS = 8;
const CELL_WIDTH = 512;
const CELL_HEIGHT = 32;
const FPS = 4;

/** The exported twelve-second animation follows decorative time, without another timer. */
export function neonRailFrame(time: number): number {
  return Number.isFinite(time) ? ((Math.floor(time * FPS) % FRAMES) + FRAMES) % FRAMES : 0;
}

/** A single pre-key sprite lets opaque 3D keys naturally cover the accepted neon rail. */
export class NeonRailLayer {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private frames: Texture[] = [];
  private loading: Promise<void> | undefined;
  private disposed = false;

  constructor() {
    this.container.eventMode = "none";
    this.sprite.anchor.set(0, 0.5);
    this.container.addChild(this.sprite);
    this.container.visible = false;
  }

  load(): Promise<void> {
    this.loading ??= this.loadAtlas();
    return this.loading;
  }

  private async loadAtlas(): Promise<void> {
    try {
      const atlas = await Assets.load(ATLAS);
      if (this.disposed) return;
      this.frames = Array.from(
        { length: FRAMES },
        (_, index) =>
          new Texture({
            source: atlas.source,
            frame: new Rectangle(
              (index % COLUMNS) * CELL_WIDTH,
              Math.floor(index / COLUMNS) * CELL_HEIGHT,
              CELL_WIDTH,
              CELL_HEIGHT
            )
          })
      );
    } catch (error) {
      console.warn("Neon rail unavailable; playing without the keyboard boundary animation", error);
    }
  }

  draw(time: number, width: number, hitY: number, visible: boolean): void {
    const frame = this.frames[neonRailFrame(time)];
    this.container.visible =
      !this.disposed &&
      visible &&
      frame !== undefined &&
      Number.isFinite(width) &&
      width > 0 &&
      Number.isFinite(hitY);
    if (!this.container.visible || !frame) return;
    this.sprite.texture = frame;
    this.sprite.position.set(0, hitY);
    this.sprite.width = width;
    this.sprite.height = 16;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.container.destroy({ children: true });
    for (const frame of this.frames) frame.destroy(false);
    this.frames = [];
  }
}
