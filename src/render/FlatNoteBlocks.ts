import { Container, NineSliceSprite, Texture } from "pixi.js";
import { bakeNoteMaterial, NOTE_BLOOM_MARGIN } from "./bakeNoteMaterial";

interface NoteBlock {
  fill: NineSliceSprite;
  emission: NineSliceSprite;
  bloom: NineSliceSprite;
  bevel: NineSliceSprite;
}

/** Glass colour, luminous core and bloom are independent baked layers. */
export class FlatNoteBlocks {
  readonly container = new Container({ sortableChildren: true });
  private readonly textures: Record<keyof NoteBlock, Texture>;
  private readonly pool: NoteBlock[] = [];
  private used = 0;

  constructor() {
    const material = bakeNoteMaterial((width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    });
    this.textures = {
      fill: Texture.from(material.face),
      emission: Texture.from(material.emission),
      bloom: Texture.from(material.bloom),
      bevel: Texture.from(material.bevel)
    };
    this.container.eventMode = "none";
  }

  begin(): void {
    this.used = 0;
  }

  draw(x: number, top: number, width: number, height: number, tint: number, alpha: number): void {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return;
    let item = this.pool[this.used++];
    if (!item) {
      const layer = (texture: Texture, zIndex: number, margin = 0) => {
        const sprite = new NineSliceSprite({
          texture,
          leftWidth: 12 + margin,
          rightWidth: 12 + margin,
          topHeight: 12 + margin,
          bottomHeight: 12 + margin
        });
        sprite.zIndex = zIndex;
        if (zIndex !== 1) sprite.blendMode = "add";
        return sprite;
      };
      item = {
        fill: layer(this.textures.fill, 1),
        emission: layer(this.textures.emission, 2),
        bloom: layer(this.textures.bloom, 0, NOTE_BLOOM_MARGIN),
        bevel: layer(this.textures.bevel, 3)
      };
      this.pool.push(item);
      // Every halo stays below every face, including neighbouring and repeated notes.
      this.container.addChild(item.fill, item.emission, item.bloom, item.bevel);
    }
    const scale = Math.min(1, width / 64, height / 24);
    // Reuse each layer without allocations in the animation loop.
    this.placeFace(item.fill, x, top, width, height, scale, tint, alpha);
    this.placeFace(item.emission, x, top, width, height, scale, tint, alpha);
    this.placeFace(item.bevel, x, top, width, height, scale, 0xffffff, alpha);
    // A short note still emits a halo of the same radius as its key's other notes.
    const bloomScale = Math.min(1, width / 64);
    const margin = NOTE_BLOOM_MARGIN * bloomScale;
    item.bloom.visible = true;
    item.bloom.tint = tint;
    item.bloom.alpha = alpha;
    item.bloom.scale.set(bloomScale);
    item.bloom.position.set(x - width / 2 - margin, top - margin);
    item.bloom.setSize(
      width / bloomScale + NOTE_BLOOM_MARGIN * 2,
      height / bloomScale + NOTE_BLOOM_MARGIN * 2
    );
  }

  end(): void {
    for (let index = this.used; index < this.pool.length; index++) {
      const item = this.pool[index];
      if (item)
        item.fill.visible = item.emission.visible = item.bloom.visible = item.bevel.visible = false;
    }
  }

  private placeFace(
    sprite: NineSliceSprite,
    x: number,
    top: number,
    width: number,
    height: number,
    scale: number,
    tint: number,
    alpha: number
  ): void {
    sprite.visible = true;
    sprite.tint = tint;
    sprite.alpha = alpha;
    sprite.scale.set(scale);
    sprite.position.set(x - width / 2, top);
    sprite.setSize(width / scale, height / scale);
  }

  destroy(): void {
    this.container.destroy({ children: true });
    for (const texture of Object.values(this.textures)) texture.destroy(true);
  }
}
