import { expect, it, vi } from "vitest";
import { ViewNoteSettings } from "./ViewNoteSettings";

it("applies pre-mount preferences once a target exists and sends later changes live", () => {
  const target = { setFallingNoteStyle: vi.fn() };
  const mounted: { current: typeof target | undefined } = { current: undefined };
  const settings = new ViewNoteSettings(() => mounted.current);
  settings.setStyle("glass");
  expect(target.setFallingNoteStyle).not.toHaveBeenCalled();
  mounted.current = target;
  settings.apply();
  expect(target.setFallingNoteStyle).toHaveBeenLastCalledWith("glass");
  settings.setStyle("flat");
  expect(target.setFallingNoteStyle).toHaveBeenLastCalledWith("flat");
});
