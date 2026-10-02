import { Assets, NineSliceSprite, Texture } from "pixi.js";

const GLASS = new URL("../fx/hold-glass.webp", import.meta.url).href;

/** Arcadia's static glass, stretched through its centre while preserving the bevels. */
export class GlassHold {
  private texture: Texture | undefined;
  private readonly sprites = new Set<NineSliceSprite>();

  get ready(): boolean {
    return this.texture !== undefined;
  }

  create(): NineSliceSprite {
    const sprite = new NineSliceSprite({
      texture: this.texture ?? Texture.WHITE,
      leftWidth: 32,
      rightWidth: 32,
      topHeight: 36,
      bottomHeight: 38
    });
    sprite.eventMode = "none";
    sprite.blendMode = "add";
    this.sprites.add(sprite);
    return sprite;
  }

  clear(): void {
    this.sprites.clear();
  }

  async load(): Promise<void> {
    try {
      this.texture = await Assets.load<Texture>(GLASS);
      for (const sprite of this.sprites) sprite.texture = this.texture;
    } catch (error) {
      console.warn("Glass hold did not load; keeping plain duration bars", error);
    }
  }
}

export function placeGlass(
  sprite: NineSliceSprite,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const scale = width / 96;
  const cornerShare = Math.min(1, height / (74 * scale));
  sprite.topHeight = 36 * cornerShare;
  sprite.bottomHeight = 38 * cornerShare;
  sprite.scale.set(scale);
  sprite.setSize(96, height / scale);
  sprite.position.set(x, y);
}
