import type { Locale } from "../i18n/locales";
import { messages } from "../i18n/messages";
import { translate } from "../i18n/translate";

/** An on-view legend: no per-frame text layout or React subscriptions. */
export class FreeCameraLegend {
  private readonly element = document.createElement("aside");
  private readonly lines = Array.from({ length: 3 }, () => document.createElement("span"));
  private readonly reset = document.createElement("button");

  constructor(host: HTMLElement, onReset: () => void, locale: Locale) {
    this.element.className = "free-camera-legend";
    this.element.hidden = true;
    this.reset.type = "button";
    this.reset.className = "game-button";
    this.reset.onclick = onReset;
    this.element.append(...this.lines, this.reset);
    host.append(this.element);
    this.setLocale(locale);
  }

  setVisible(on: boolean): void {
    this.element.hidden = !on;
  }

  setLocale(locale: Locale): void {
    const t = (key: string) => translate(locale, messages, key);
    this.element.setAttribute("aria-label", t("Свободная камера"));
    ["СКМ — вращать", "Shift + СКМ — перемещать", "Колесо — масштаб"].forEach((key, index) => {
      const line = this.lines[index];
      if (line) line.textContent = t(key);
    });
    this.reset.textContent = t("Сбросить камеру");
  }

  destroy(): void {
    this.reset.onclick = null;
    this.element.remove();
  }
}
