import { it, expect, vi } from "vitest";
import { Group, NormalBlending } from "three";
import { PerformanceCurtain } from "./PerformanceCurtain";
it("covers shared-canvas scene colour after depth-tested effects and releases GPU ownership", () => {
  const curtain = new PerformanceCurtain(),
    owner = new Group();
  owner.add(curtain.mesh);
  expect(curtain.mesh.visible).toBe(false);
  curtain.set(0.5);
  expect(curtain.opacity).toBe(0.5);
  expect(curtain.mesh.material.uniforms.fade?.value).toBe(0.5);
  expect(curtain.mesh.material.depthTest).toBe(false);
  expect(curtain.mesh.material.depthWrite).toBe(false);
  expect(curtain.mesh.material.blending).toBe(NormalBlending);
  expect(curtain.mesh.renderOrder).toBeGreaterThan(100);
  expect(curtain.mesh.frustumCulled).toBe(false);
  curtain.set(2);
  expect(curtain.opacity).toBe(1);
  curtain.set(NaN);
  expect(curtain.opacity).toBe(0);
  const geometry = vi.spyOn(curtain.mesh.geometry, "dispose"),
    material = vi.spyOn(curtain.mesh.material, "dispose");
  curtain.dispose();
  expect(owner.children).not.toContain(curtain.mesh);
  expect(geometry).toHaveBeenCalledOnce();
  expect(material).toHaveBeenCalledOnce();
});
