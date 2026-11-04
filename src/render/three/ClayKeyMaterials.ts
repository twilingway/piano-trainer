import { DataTexture, LinearFilter, MeshStandardMaterial, RepeatWrapping } from "three";

/** Small deterministic relief, baked once; no noise or new texture work in the frame loop. */
export function clayReliefMap(): DataTexture {
  const size = 64,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x * Math.PI * 2) / size,
        v = (y * Math.PI * 2) / size;
      const value = Math.round(
        128 +
          21 * Math.sin(u * 3 + Math.sin(v * 2)) * Math.cos(v * 4) +
          5 * Math.sin(u * 13 + v * 17)
      );
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  const texture = new DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Shared matte templates own the relief; individual key clones only borrow it. */
export class ClayKeyMaterials {
  readonly relief = clayReliefMap();
  readonly white = new MeshStandardMaterial({
    color: 0xffefdb,
    roughness: 0.91,
    metalness: 0,
    bumpMap: this.relief,
    bumpScale: 0.12
  });
  readonly black = new MeshStandardMaterial({
    color: 0x34383d,
    roughness: 0.94,
    metalness: 0,
    bumpMap: this.relief,
    bumpScale: 0.1
  });
  readonly case = new MeshStandardMaterial({
    color: 0x28505a,
    roughness: 0.94,
    metalness: 0,
    bumpMap: this.relief,
    bumpScale: 0.0002
  });
  private disposed = false;
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.white.dispose();
    this.black.dispose();
    this.case.dispose();
    this.relief.dispose();
  }
}
