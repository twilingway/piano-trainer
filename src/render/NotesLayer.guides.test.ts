// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { FlatNoteGuides } from "./FlatNoteGuides";
import { NotesLayer } from "./NotesLayer";
import { FallingNotesView } from "./FallingNotesView";
import { layoutKeyboard } from "./keyboardLayout";

describe("flat vertical guides", () => {
  it("toggles every white-key boundary without hiding or rebuilding the hit line", () => {
    const guideLayout = new FlatNoteGuides(),
      guides = guideLayout.container;
    const [verticalGuides, hitLine] = guides.children;
    if (!verticalGuides || !hitLine) throw new Error("Missing guide layers");
    expect(verticalGuides.visible).toBe(false);
    const layer = Object.assign(Object.create(NotesLayer.prototype) as object, {
      guideLayout
    }) as unknown as NotesLayer;
    const keys = layoutKeyboard(800, 48, 72);
    layer.layout(keys, 400, 800);
    expect(verticalGuides.children).toHaveLength(
      [...keys.values()].filter((key) => !key.black).length
    );
    for (const on of [false, true, false]) {
      layer.setRoadGuides(on);
      expect(verticalGuides.visible).toBe(on);
      expect(hitLine.visible).toBe(true);
      expect(hitLine.y).toBe(399);
      expect(guides.children).toEqual([verticalGuides, hitLine]);
    }
    layer.layout(keys, 175, 800);
    expect(verticalGuides.visible).toBe(false);
    expect(hitLine.y).toBe(174);
  });

  it("routes the same saved preference to the flat and native renderers", () => {
    const flat = vi.fn(),
      native = vi.fn();
    const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
      notesLayer: { setRoadGuides: flat },
      road: { setRoadGuides: native }
    }) as unknown as FallingNotesView;
    for (const on of [true, false]) {
      view.setRoadGuides(on);
      expect(flat).toHaveBeenLastCalledWith(on);
      expect(native).toHaveBeenLastCalledWith(on);
    }
  });
});
