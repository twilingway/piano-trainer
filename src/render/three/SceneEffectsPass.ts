import { Matrix } from "pixi.js";
import type { Container, Renderer } from "pixi.js";

interface Layer {
  readonly container: Container;
  readonly transform: Matrix;
  savedRenderable: boolean | undefined;
}

/** Existing Pixi FX go behind opaque Three hands; ownership and visibility stay with the view. */
export class SceneEffectsPass {
  private layers: Layer[] = [];

  setLayers(containers: readonly Container[]): void {
    this.restore();
    this.layers = containers.map((container) => ({
      container,
      transform: new Matrix(),
      savedRenderable: undefined
    }));
  }

  draw(renderer: Renderer): void {
    for (const layer of this.layers) {
      if (!isVisible(layer.container)) continue;
      layer.container.getGlobalTransform(layer.transform);
      renderer.render({ container: layer.container, clear: false, transform: layer.transform });
      layer.savedRenderable = layer.container.renderable;
      layer.container.renderable = false;
    }
  }

  restore(): void {
    for (const layer of this.layers) {
      if (layer.savedRenderable === undefined) continue;
      if (!layer.container.destroyed) layer.container.renderable = layer.savedRenderable;
      layer.savedRenderable = undefined;
    }
  }

  dispose(): void {
    this.restore();
    this.layers = [];
  }
}

function isVisible(container: Container): boolean {
  let current: Container | null = container;
  while (current) {
    if (current.destroyed || !current.visible || !current.renderable || current.alpha <= 0)
      return false;
    current = current.parent;
  }
  return true;
}
