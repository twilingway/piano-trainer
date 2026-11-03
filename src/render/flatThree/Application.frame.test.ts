// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Application } from "./application";
function harness() {
  const app = new Application();
  const renderer = { render: vi.fn(), destroy: vi.fn(), gl: { isContextLost: vi.fn(() => false) } };
  Object.assign(app, { initializedRenderer: renderer });
  return { app, renderer };
}
afterEach(() => {
  vi.restoreAllMocks();
});
it("confirms an actual successful visible renderer submission, not merely a requested animation frame", async () => {
  const { app, renderer } = harness();
  const complete = vi.fn();
  void app.waitForFrame().then(complete);
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  app.render();
  await Promise.resolve();
  expect(renderer.render).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledWith(true);
  app.destroy();
});
it("waits while hidden and completes only after a visible frame", async () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const { app } = harness(),
    complete = vi.fn();
  void app.waitForFrame().then(complete);
  app.render();
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  app.render();
  await Promise.resolve();
  expect(complete).toHaveBeenCalledWith(true);
  app.destroy();
});
it("reports lost context, rendering failure, abort and destruction as not ready", async () => {
  const { app, renderer } = harness();
  renderer.gl.isContextLost.mockReturnValue(true);
  expect(await app.waitForFrame()).toBe(false);
  renderer.gl.isContextLost.mockReturnValue(false);
  const failed = app.waitForFrame();
  renderer.render.mockImplementationOnce(() => {
    throw new Error("graphics");
  });
  expect(() => {
    app.render();
  }).toThrow("graphics");
  expect(await failed).toBe(false);
  const signal = new AbortController();
  const aborted = app.waitForFrame(signal.signal);
  signal.abort();
  expect(await aborted).toBe(false);
  const destroyed = app.waitForFrame();
  app.destroy();
  expect(await destroyed).toBe(false);
});
