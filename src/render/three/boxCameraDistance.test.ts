import { Box3, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { boxCameraDistance } from "./boxCameraDistance";
const direction = new Vector3(0.4, 0.55, 1).normalize();
describe("aspect-aware structural camera framing", () => {
  it.each([1366 / 768, 390 / 844, 1])("fits every union-box corner at aspect %s", (aspect) => {
    for (const bounds of [
      new Box3(new Vector3(-3000, 0, -150), new Vector3(3000, 2600, 400)),
      new Box3(new Vector3(-750, 0, -20000), new Vector3(750, 8200, 400)),
      new Box3(new Vector3(-600, -500, -200), new Vector3(600, 800, 400))
    ]) {
      const centre = bounds.getCenter(new Vector3());
      const distance = boxCameraDistance(bounds, 45, aspect, direction);
      const camera = new PerspectiveCamera(45, aspect, 0.1, 100000);
      camera.position.copy(centre).addScaledVector(direction, distance);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new Vector3(x, y, z).project(camera);
            expect(Math.abs(point.x)).toBeLessThanOrEqual(1 / 1.1 + 1e-9);
            expect(Math.abs(point.y)).toBeLessThanOrEqual(1 / 1.1 + 1e-9);
            expect(Math.abs(point.z)).toBeLessThan(1);
          }
    }
  });
  it("does not mistake a wide horizontal field for a vertical diameter", () => {
    const bounds = new Box3(new Vector3(-3000, 0, -150), new Vector3(3000, 2000, 150));
    const aspect = 1366 / 768;
    const oldDistance =
      (bounds.getSize(new Vector3()).length() /
        2 /
        Math.sin(Math.atan(Math.tan(Math.PI / 8) * Math.min(1, aspect)))) *
      1.12;
    const fitted = boxCameraDistance(bounds, 45, aspect, direction);
    expect(fitted).toBeLessThan(oldDistance * 0.7);
    expect(fitted).toBeGreaterThan(2500);
  });
});
