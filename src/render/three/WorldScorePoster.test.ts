import { CanvasTexture, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { StaffWorldSource, type StaffWorldSnapshot } from "../../staff/staffWorldSnapshot";
import { WorldScorePoster } from "./WorldScorePoster";
import type { ScoreTile } from "./worldScoreTile";
import { worldScoreTile } from "./worldScoreTile";
const snapshot: StaffWorldSnapshot = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  width: 100000,
  height: 300,
  viewportWidth: 1200,
  viewportHeight: 300,
  spots: [
    { beat: 0, x: 100, line: 0 },
    { beat: 100, x: 99900, line: 0 }
  ],
  lines: [{ top: 0, bottom: 280 }]
};
const texture = () => new CanvasTexture({ width: 2400, height: 300 } as HTMLCanvasElement);
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function material(poster: WorldScorePoster) {
  const mesh = poster.group.children[0];
  if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshBasicMaterial))
    throw new Error("Missing score plane");
  return mesh.material;
}
describe("bounded world score poster", () => {
  it("bounds even a 100000px score and scrolls UV/cursor from the session beat without raster per frame", async () => {
    let beat = 0;
    const source = new StaffWorldSource();
    source.configure(true, () => beat);
    source.publish(snapshot);
    const raster = vi.fn<(snapshot: StaffWorldSnapshot, tile: ScoreTile) => Promise<CanvasTexture>>(
      () => Promise.resolve(texture())
    );
    const poster = new WorldScorePoster(2048, vi.fn(), raster);
    poster.setSource(source);
    poster.update(true, true, 50);
    await settle();
    expect(source.getStatus()).toBe("ready");
    expect(raster.mock.calls[0]?.[1]?.pixelsWide).toBeLessThanOrEqual(2048);
    const before = poster.group.children[1]?.position.x;
    for (let frame = 0; frame < 300; frame++) {
      beat = frame / 10000;
      poster.update(true, true, 50);
    }
    expect(raster).toHaveBeenCalledTimes(1);
    expect(poster.group.children[1]?.position.x).not.toBe(before);
    expect(poster.group.position.y).toBeGreaterThan(2200);
    beat = 70;
    poster.update(true, true);
    await settle();
    expect(raster).toHaveBeenCalledTimes(2);
    poster.update(false, true);
    expect(source.getStatus()).toBe("idle");
    expect(poster.group.visible).toBe(false);
    poster.dispose();
  });
  it("rejects late results after a new engraving and disposes only owned textures", async () => {
    const pending: ((value: CanvasTexture) => void)[] = [];
    const source = new StaffWorldSource();
    source.configure(true, () => 0);
    source.publish(snapshot);
    const poster = new WorldScorePoster(
      4096,
      vi.fn(),
      () => new Promise((resolve) => pending.push(resolve))
    );
    poster.setSource(source);
    poster.update(true, false);
    source.publish({ ...snapshot, svg: '<svg id="new"/>' });
    poster.update(true, false);
    const old = texture(),
      fresh = texture(),
      oldDisposed = vi.spyOn(old, "dispose"),
      freshDisposed = vi.spyOn(fresh, "dispose");
    pending[0]?.(old);
    await settle();
    expect(oldDisposed).toHaveBeenCalledOnce();
    expect(source.getStatus()).toBe("loading");
    pending[1]?.(fresh);
    await settle();
    expect(source.getStatus()).toBe("ready");
    expect(material(poster).map).toBe(fresh);
    poster.dispose();
    expect(freshDisposed).toHaveBeenCalledOnce();
    expect(source.getStatus()).toBe("idle");
  });
  it("keeps DOM fallback available on raster failure and cancels work after leaving free camera", async () => {
    const source = new StaffWorldSource();
    source.configure(true, () => 0);
    source.publish(snapshot);
    const poster = new WorldScorePoster(4096, vi.fn(), () => Promise.reject(new Error("decode")));
    poster.setSource(source);
    poster.update(true, false);
    await settle();
    expect(source.getStatus()).toBe("error");
    expect(material(poster).visible).toBe(false);
    poster.dispose();
    let finish: ((value: CanvasTexture) => void) | undefined;
    const delayed = new WorldScorePoster(
      4096,
      vi.fn(),
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    delayed.setSource(source);
    delayed.update(true, false);
    delayed.update(false, false);
    const late = texture(),
      dispose = vi.spyOn(late, "dispose");
    finish?.(late);
    await settle();
    expect(dispose).toHaveBeenCalledOnce();
    expect(source.getStatus()).toBe("idle");
    delayed.dispose();
  });
  it("keeps the scrolling viewport inside bounded tiles at the beginning, middle and end", () => {
    for (const x of [0, 100, 1400, 12000, 99999]) {
      const tile = worldScoreTile(snapshot, x, 0, 1024);
      expect(tile.pixelsWide).toBeLessThanOrEqual(1024);
      expect(tile.pixelsHigh).toBeLessThanOrEqual(1024);
      expect(tile.viewLeft).toBeGreaterThanOrEqual(tile.left);
      expect(tile.viewLeft + tile.viewWidth).toBeLessThanOrEqual(tile.left + tile.width);
      expect(tile.left + tile.width).toBeLessThanOrEqual(snapshot.width);
    }
  });
});

it("uses a uniform raster scale when only one tile dimension exceeds the GPU limit", () => {
  const tile = worldScoreTile(snapshot, 100, 0, 2048);
  expect(tile.width).toBe(2400);
  expect(tile.height).toBe(300);
  expect(tile.pixelsWide).toBe(2048);
  expect(tile.pixelsHigh).toBe(256);
  expect(tile.pixelsWide / tile.pixelsHigh).toBe(tile.width / tile.height);
});
