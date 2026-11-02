import type { KeyboardLayer } from "./KeyboardLayer";
import type { HandsLayer } from "./HandsLayer";
import type { RoadLayer } from "./RoadLayer";
import { describe, expect, it, vi } from "vitest";
import { Ticker, UPDATE_PRIORITY } from "./flatThree";
import { ViewStartupPresentation } from "./viewStartupPresentation";

describe("first saved-view presentation", () => {
  it("requires a drawn view and runs after the actual renderer frame", () => {
    const ticker = new Ticker();
    const startup = new ViewStartupPresentation(ticker, () => true);
    const render = vi.fn(() => {
      expect(startup.status).toBe("loading");
    });
    ticker.add(render, undefined, UPDATE_PRIORITY.LOW);
    startup.begin();
    ticker.update(10);
    expect(startup.status).toBe("loading");
    startup.markDrawn();
    expect(startup.status).toBe("loading");
    ticker.update(20);
    expect(startup.status).toBe("ready");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous frame covered until the requested resources settle", () => {
    const ticker = new Ticker();
    let settled = false;
    const startup = new ViewStartupPresentation(ticker, () => settled);
    startup.begin();
    startup.markDrawn();
    ticker.update(10);
    expect(startup.status).toBe("loading");
    settled = true;
    expect(startup.status).toBe("loading");
    ticker.update(20);
    expect(startup.status).toBe("ready");
    startup.begin();
    ticker.update(30);
    expect(startup.status).toBe("loading");
    startup.markDrawn();
    ticker.update(40);
    expect(startup.status).toBe("ready");
  });
});

it("keeps temporary paint and hands hidden until all selected resources have settled", () => {
  const ticker = new Ticker();
  const startup = new ViewStartupPresentation(ticker);
  const keyboard = { paintLoading: true };
  const hands = { container: { visible: true }, startupSettled: false };
  let nativeStatus: "loading" | "ready" = "loading";
  const road = { startupStatus: () => nativeStatus };
  startup.setSources(keyboard as KeyboardLayer, hands as HandsLayer, road as RoadLayer);
  startup.begin();
  startup.markDrawn();
  ticker.update(10);
  expect(startup.status).toBe("loading");
  keyboard.paintLoading = false;
  ticker.update(20);
  expect(startup.status).toBe("loading");
  hands.startupSettled = true;
  ticker.update(30);
  expect(startup.status).toBe("loading");
  nativeStatus = "ready";
  ticker.update(40);
  expect(startup.status).toBe("ready");
});
