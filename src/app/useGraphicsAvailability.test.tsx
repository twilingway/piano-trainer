// @vitest-environment happy-dom
import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import { GraphicsInitializationError } from "../render/graphicsFailure";
import { useGraphicsAvailability } from "./useGraphicsAvailability";

afterEach(() => vi.unstubAllGlobals());

it("distinguishes initialization failures, retries and receives non-bubbling canvas loss", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const trainer = { setGraphicsAvailable: vi.fn() };
  let graphics!: ReturnType<typeof useGraphicsAvailability>;
  function Harness() {
    const host = useRef<HTMLDivElement>(null);
    const trainerRef = useRef(trainer as unknown as Trainer);
    graphics = useGraphicsAvailability(trainerRef);
    const attach = graphics.attach;
    useEffect(() => {
      if (host.current) return attach(host.current);
    }, [attach]);
    return (
      <div ref={host}>
        <canvas />
      </div>
    );
  }
  act(() => {
    root.render(<Harness />);
  });
  act(() => {
    graphics.fail(new GraphicsInitializationError("unsupported"));
  });
  expect(graphics.failure).toBe("unsupported");
  act(() => {
    graphics.dismiss();
  });
  expect(graphics.open).toBe(false);
  act(() => {
    graphics.retry();
  });
  expect(graphics.generation).toBe(1);
  expect(graphics.failure).toBeNull();
  const loss = new Event("webglcontextlost", { cancelable: true });
  act(() => {
    container.querySelector("canvas")?.dispatchEvent(loss);
  });
  expect(loss.defaultPrevented).toBe(true);
  expect(trainer.setGraphicsAvailable).toHaveBeenLastCalledWith(false);
  expect(graphics.failure).toBe("lost");
  expect(graphics.available()).toBe(false);
  act(() => {
    container.querySelector("canvas")?.dispatchEvent(new Event("webglcontextrestored"));
  });
  expect(trainer.setGraphicsAvailable).toHaveBeenLastCalledWith(true);
  expect(graphics.available()).toBe(true);
  expect(graphics.failure).toBeNull();
  act(() => {
    graphics.fail(new Error("Context refused"));
  });
  expect(graphics.failure).toBe("unavailable");
  act(() => {
    root.unmount();
  });
  container.remove();
});
