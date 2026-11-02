/** Observe the external workspace, never a canvas whose height depends on keyboard reservation. */
export function observePianoPaneReference(
  host: HTMLElement,
  publish: (height: number | undefined) => void
): () => void {
  const workspace = host.closest<HTMLElement>(".workspace-main");
  if (!workspace) return () => undefined;
  const update = () => {
    const height = workspace.clientHeight;
    publish(workspace.dataset.pianoLayoutReference === "true" && height > 0 ? height : undefined);
  };
  const resize = new ResizeObserver(update);
  const attributes = new MutationObserver(update);
  resize.observe(workspace);
  attributes.observe(workspace, {
    attributes: true,
    attributeFilter: ["data-piano-layout-reference"]
  });
  update();
  return () => {
    resize.disconnect();
    attributes.disconnect();
  };
}
import { fitPianoKeys, type FittedRange } from "./viewGeometry";

/** One owner for measured reference state, its invalidation and the external DOM subscriptions. */
export class PianoPaneReference {
  height: number | undefined;
  private stop: (() => void) | undefined;
  constructor(private readonly changed: () => void) {}
  setHeight(height?: number): void {
    const next = height !== undefined && Number.isFinite(height) && height > 0 ? height : undefined;
    if (next === this.height) return;
    this.height = next;
    this.changed();
  }
  observe(host: HTMLElement): void {
    this.stop?.();
    this.stop = observePianoPaneReference(host, this.setHeight.bind(this));
  }
  destroy(): void {
    this.stop?.();
    this.stop = undefined;
  }
}

/** Keep browser-dependent compact detection in the layout shell. */
export function fitPianoViewport(
  width: number,
  range: Pick<FittedRange, "low" | "high">,
  song: boolean,
  viewport: boolean
) {
  const compact = width <= 900 || window.matchMedia("(height <= 500px), (pointer: coarse)").matches;
  return fitPianoKeys(width, range, song, viewport, compact);
}
