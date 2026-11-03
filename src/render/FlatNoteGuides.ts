import { Container, Sprite, Texture } from "./flatThree";
import type { KeyRect } from "./keyboardLayout";

/** Flat key boundaries toggle independently of the persistent horizontal hit line. */
export class FlatNoteGuides {
  readonly container = new Container();
  private readonly vertical = new Container();
  private readonly hit = new Sprite(Texture.WHITE);

  constructor() {
    this.container.addChild(this.vertical, this.hit);
    this.vertical.visible = false;
  }

  setVisible(on: boolean): void {
    this.vertical.visible = on;
  }

  layout(keys: ReadonlyMap<number, KeyRect>, hitY: number, total: number): void {
    this.vertical.removeChildren().forEach((child) => {
      child.destroy();
    });
    for (const [pitch, key] of keys) {
      if (key.black) continue;
      const line = new Sprite(Texture.WHITE);
      line.tint = 0x008cff;
      line.alpha = pitch % 12 === 0 ? 0.5 : 0.18;
      line.x = key.x;
      line.width = 1;
      line.height = hitY;
      this.vertical.addChild(line);
    }
    this.hit.tint = 0x00e5ff;
    this.hit.y = hitY - 1;
    this.hit.width = total;
    this.hit.height = 2;
  }
}
