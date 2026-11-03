import { expect, it, vi } from "vitest";
import { prepareRoadProjection } from "./roadFrameProjection";
import { ThreeRoadGuides } from "./ThreeRoadGuides";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import { worldCamera } from "../worldCamera";

it("retains beat guides when vertical guides are disabled and clears an absent road", () => {
  const guides = new ThreeRoadGuides();
  const update = vi.spyOn(guides, "update"),
    clear = vi.spyOn(guides, "clear");
  const camera = worldCamera(800, 600),
    frame = new ThreeRoadFrame();
  for (const enabled of [false, true, false]) {
    frame.guides = enabled;
    prepareRoadProjection(guides, [], camera, frame, "standard");
    expect(update).toHaveBeenLastCalledWith(
      [],
      camera,
      frame.beats,
      frame.beatCount,
      false,
      undefined,
      enabled
    );
  }
  clear.mockClear();
  prepareRoadProjection(guides, [], camera, undefined, "standard");
  expect(clear).toHaveBeenCalledOnce();
  guides.dispose();
});
