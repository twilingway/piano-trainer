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
