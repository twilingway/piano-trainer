import { runInNewContext } from "node:vm";
import { DoubleSide, FrontSide, NormalBlending } from "three";
import { expect, it } from "vitest";
import { createFilledNoteBodyMaterial } from "./FilledNoteMaterial";
import { createNoteBodyMaterial } from "./ThreeNoteMaterial";

it("keeps an opaque depth-writing core on the same closed-slab vertex transform", () => {
  const filled = createFilledNoteBodyMaterial();
  const glass = createNoteBodyMaterial();
  expect(filled.vertexShader).toBe(glass.vertexShader);
  expect(filled.transparent).toBe(false);
  expect(filled.depthTest).toBe(true);
  expect(filled.depthWrite).toBe(true);
  expect(filled.blending).toBe(NormalBlending);
  expect(filled.lights).toBe(false);
  // The facing side wins by winding, whatever depth order the docked keyboard gives the faces.
  expect(filled.side).toBe(FrontSide);
  expect(glass.side).toBe(DoubleSide);
  expect(filled.fragmentShader).toContain("gl_FragColor = vec4(tint, filledNoteAlpha())");
  const body = /float filledNoteAlpha\(\)\s*\{([^}]+)\}/.exec(filled.fragmentShader)?.[1];
  if (!body) throw new Error("Missing solid core alpha");
  const alpha = runInNewContext(`(function(){${body}})()`) as unknown;
  expect(alpha).toBe(1);
  expect(glass.transparent).toBe(true);
  expect(glass.depthWrite).toBe(false);
  filled.dispose();
  glass.dispose();
});
