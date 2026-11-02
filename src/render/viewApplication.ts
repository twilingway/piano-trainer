import { bindKeyboardPointer } from "./bindKeyboardPointer";
import type { Application, Container } from "./flatThree";

/** Initialize the one graphics owner at the display's pixel density. */
export async function initializeViewApplication(
  app: Application,
  host: HTMLElement
): Promise<void> {
  await app.init({
    resizeTo: host,
    background: 0x020c18,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true
  });
}

/** Detached roots and a partially mounted view retain the same explicit owner. */
export function destroyViewContainers(containers: readonly (Container | undefined)[]): void {
  for (const container of containers) container?.destroy({ children: true });
}

/** Input becomes interactive only after the view's startup assets have settled. */
export function bindViewKeyboardPointer(
  app: Application,
  onPointer: Parameters<typeof bindKeyboardPointer>[2],
  onRelease: Parameters<typeof bindKeyboardPointer>[3]
): () => void {
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  return bindKeyboardPointer(app.stage, app.canvas, onPointer, onRelease);
}
