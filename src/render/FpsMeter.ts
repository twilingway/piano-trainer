import type { Ticker } from "pixi.js";

const SAMPLE_MS = 1000;

/** A low-cost display of the actual Pixi frame cadence, independent of song time. */
export class FpsMeter {
  private readonly element = document.createElement("output");
  private sampleStart = 0;
  private frames = 0;

  constructor(
    host: HTMLElement,
    private readonly ticker: Ticker
  ) {
    this.element.className = "lane-fps";
    this.element.title = "Частота отрисовки игры";
    this.element.textContent = "FPS —";
    host.appendChild(this.element);
    ticker.add(this.onFrame);
  }

  destroy(): void {
    this.ticker.remove(this.onFrame);
    this.element.remove();
  }

  private readonly onFrame = (): void => {
    const now = performance.now();
    const elapsed = now - this.sampleStart;
    if (this.sampleStart === 0 || elapsed > SAMPLE_MS * 3) {
      this.sampleStart = now;
      this.frames = 0;
      this.element.textContent = "FPS —";
      return;
    }
    this.frames++;
    if (elapsed < SAMPLE_MS) return;
    const fps = Math.round((this.frames * 1000) / elapsed);
    this.element.textContent = `FPS ${String(fps)}`;
    this.element.dataset.level = fps < 30 ? "low" : fps < 50 ? "mid" : "ok";
    this.sampleStart = now;
    this.frames = 0;
  };
}
