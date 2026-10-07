import { DataTexture, MeshPhysicalMaterial, RepeatWrapping } from "three";

// The kit's materials from tools/hand-rig/piano_kit.py, which glTF cannot carry: there they are
// node trees (noise into a colour ramp, noise into a bump). Here the same looks are textures made
// once in code; colours are display values, as everywhere in the 3D keys.

/** Warm ivory: the white keys' colour, and the tint of their painted tops. */
export const IVORY = 0xefe6cf;

/** A tiling texture `width` × `height` from a value 0..1 per texel. */
function texture(
  width: number,
  height: number,
  value: (x: number, y: number) => readonly [number, number, number]
): DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = value(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  const map = new DataTexture(data, width, height);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

/** A repeatable hash noise, 0..1. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Ivory with faint grain lines running along the key (across `u`, constant along `v`). */
function ivoryGrain(): DataTexture {
  const width = 256;
  const lines = (x: number) => {
    const t = (2 * Math.PI * x) / width;
    // Whole periods only, so the texture tiles.
    return 0.5 + 0.22 * Math.sin(t * 7 + 1.3) + 0.16 * Math.sin(t * 23 + 0.4) + 0.12 * hash(x, 0);
  };
  // The ramp of piano_kit.py's ivory, from its dark grain to its light body.
  const dark = [0xe3, 0xd2, 0xb3] as const;
  const light = [0xf0, 0xe6, 0xcf] as const;
  return texture(width, 4, (x) => {
    const f = Math.min(1, Math.max(0, lines(x)));
    return [0, 1, 2].map((c) => (dark[c] ?? 0) + f * ((light[c] ?? 0) - (dark[c] ?? 0))) as [
      number,
      number,
      number
    ];
  });
}

/** Fine velvety grain: a height for the black keys' bump. */
function velvetGrain(): DataTexture {
  return texture(128, 128, (x, y) => {
    const v = Math.round(255 * hash(x, y));
    return [v, v, v];
  });
}

/** The white keys' sides and front: ivory with its grain. */
export function ivoryMaterial(): MeshPhysicalMaterial {
  const map = ivoryGrain();
  // The keys' UVs span the whole keyboard picture: a white key is a narrow strip of it.
  map.repeat.set(60, 1);
  return new MeshPhysicalMaterial({
    map,
    roughness: 0.36,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3
  });
}

/** The black keys: matte, a soft sheen at grazing angles and a fine grain. */
export function velvetMaterial(): MeshPhysicalMaterial {
  const bumpMap = velvetGrain();
  bumpMap.repeat.set(400, 120);
  return new MeshPhysicalMaterial({
    color: 0x1a1816,
    roughness: 0.78,
    specularIntensity: 0.15,
    sheen: 0.3,
    sheenRoughness: 0.45,
    sheenColor: 0x9a948f,
    bumpMap,
    bumpScale: 0.4
  });
}
