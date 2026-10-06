import type { Ticker } from "pixi.js";

const SAMPLE_MS = 1000;

import type { Locale } from "../i18n/locales";
import { appMessages } from "../i18n/appMessages";
import { translate } from "../i18n/translate";

/** A low-cost display of the actual Pixi frame cadence, independent of song time. */
export class FpsMeter {
  private readonly element = document.createElement("output");
  private sampleStart = 0;
  private frames = 0;
  private visible = false;

  constructor(
    host: HTMLElement,
    private readonly ticker: Ticker,
    locale: Locale = "ru",
    visible = false
  ) {
    this.element.className = "lane-fps";
    this.element.title = "Кадров в секунду";
    this.element.textContent = "FPS —";
    this.element.hidden = true;
    host.appendChild(this.element);
    this.setLocale(locale);
    this.setVisible(visible);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.element.hidden = !visible;
    this.sampleStart = 0;
    this.frames = 0;
    this.element.textContent = "FPS —";
    if (visible) this.ticker.add(this.onFrame);
    else this.ticker.remove(this.onFrame);
  }

  destroy(): void {
    this.ticker.remove(this.onFrame);
    this.element.remove();
  }

  setLocale(locale: Locale): void {
    this.element.title = translate(locale, appMessages, "Кадров в секунду");
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
