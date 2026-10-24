import { expect, it, vi } from "vitest";
import { ViewNoteSettings } from "./ViewNoteSettings";
import { DEFAULT_PROJECTION_PARAMETERS } from "./stylizedProjection";

it("applies pre-mount preferences once a target exists and sends later changes live", () => {
  const target = { setFallingNoteStyle: vi.fn(), setNoteProjection: vi.fn() };
  const mounted: { current: typeof target | undefined } = { current: undefined };
  const settings = new ViewNoteSettings(() => mounted.current);
  const projection = { ...DEFAULT_PROJECTION_PARAMETERS, mode: "stylizedProjection" as const };
  settings.setStyle("glass");
  settings.setProjection(projection);
  expect(target.setNoteProjection).not.toHaveBeenCalled();
  mounted.current = target;
  settings.apply();
  expect(target.setFallingNoteStyle).toHaveBeenLastCalledWith("glass");
  expect(target.setNoteProjection).toHaveBeenLastCalledWith(projection);
  settings.setProjection(DEFAULT_PROJECTION_PARAMETERS);
  expect(target.setNoteProjection).toHaveBeenLastCalledWith(DEFAULT_PROJECTION_PARAMETERS);
});
