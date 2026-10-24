import { expect, it, vi } from "vitest";
import { HandStatusSignal } from "./handStatusSignal";

it("notifies initial and changed model states without repeated frame updates", () => {
  const signal = new HandStatusSignal();
  const notify = vi.fn();
  signal.update("loading", notify);
  signal.update("loading", notify);
  signal.update("ready", notify);
  signal.update("ready", notify);
  signal.update("error", notify);
  expect(notify.mock.calls).toEqual([["loading"], ["ready"], ["error"]]);
});

it("sends the current state to a listener registered after the first draw", () => {
  const signal = new HandStatusSignal();
  signal.update("ready", undefined);
  const first = vi.fn();
  signal.update("ready", first);
  signal.update("ready", first);
  expect(first).toHaveBeenCalledExactlyOnceWith("ready");
  const replacement = vi.fn();
  signal.update("ready", replacement);
  expect(replacement).toHaveBeenCalledExactlyOnceWith("ready");
});
