// @vitest-environment happy-dom
import type { Ticker } from "./flatThree";
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

it("anchors the single meter above the workspace and returns each comparison meter to its lane", async () => {
  const workspace = document.body.appendChild(document.createElement("div"));
  workspace.className = "workspace-main";
  const lanes = workspace.appendChild(document.createElement("div"));
  lanes.className = "lanes lanes--keys";
  const host = lanes.appendChild(document.createElement("div"));
  host.className = "lane";
  const ticker = { add: vi.fn(), remove: vi.fn() };
  const meter = new FpsMeter(host, ticker as unknown as Ticker, "ru", true);
  const output = workspace.querySelector("output");
  expect(output?.parentElement).toBe(workspace);
  const mirrorHost = lanes.appendChild(document.createElement("div"));
  mirrorHost.className = "lane";
  const mirrorTicker = { add: vi.fn(), remove: vi.fn() };
  const mirror = new FpsMeter(mirrorHost, mirrorTicker as unknown as Ticker, "ru", true);
  await vi.waitFor(() => {
    expect(output?.parentElement).toBe(host);
  });
  expect(mirrorHost.querySelector("output")?.parentElement).toBe(mirrorHost);
  expect(ticker.add).toHaveBeenCalledOnce();
  expect(ticker.remove).not.toHaveBeenCalled();
  mirror.destroy();
  mirrorHost.remove();
  lanes.className = "lanes lanes--full";
  await vi.waitFor(() => {
    expect(output?.parentElement).toBe(workspace);
  });
  expect(workspace.querySelectorAll("output")).toHaveLength(1);
  expect(ticker.add).toHaveBeenCalledOnce();
  meter.destroy();
  expect(workspace.querySelector("output")).toBeNull();
  workspace.remove();
});
