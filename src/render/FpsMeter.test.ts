// @vitest-environment happy-dom
import type { Ticker } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { FpsMeter } from "./FpsMeter";

describe("optional FPS diagnostics", () => {
  it("starts hidden, subscribes once when enabled, and stops sampling when disabled", () => {
    const host = document.createElement("div");
    const ticker = { add: vi.fn(), remove: vi.fn() };
    const meter = new FpsMeter(host, ticker as unknown as Ticker);
    const output = host.querySelector("output");
    expect(output?.hidden).toBe(true);
    expect(ticker.add).not.toHaveBeenCalled();
    meter.setVisible(true);
    meter.setVisible(true);
    expect(output?.hidden).toBe(false);
    expect(ticker.add).toHaveBeenCalledTimes(1);
    meter.setVisible(false);
    expect(output?.hidden).toBe(true);
    expect(ticker.remove).toHaveBeenCalledWith(ticker.add.mock.calls[0]?.[0]);
    meter.setVisible(true);
    expect(output?.textContent).toBe("FPS —");
    expect(ticker.add).toHaveBeenCalledTimes(2);
    meter.destroy();
    expect(host.querySelector("output")).toBeNull();
  });
});
