import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  Mesh,
  PlaneGeometry
} from "three";
import type { Object3D } from "three";

interface Vertex {
  value: number;
  data: number[][];
}
const variants = new WeakMap<BufferGeometry, BufferGeometry>();
const originals = new WeakMap<Object3D, BufferGeometry>();
/** Clip the fixed slab tessellation into longitudinal strips without changing its profiles. */
function subdivide(source: BufferGeometry): BufferGeometry {
  const result = new BufferGeometry();
  const names = Object.keys(source.attributes).filter(
    (name) => !(source.getAttribute(name) instanceof InstancedBufferAttribute)
  );
  const output = names.map((): number[] => []);
  const cornerIndex = names.indexOf("slabCorner");
  const positions = source.getAttribute("position");
  const attributes = names.map((name) => source.getAttribute(name));
  const vertex = (index: number): Vertex => {
    const data = attributes.map((attribute) =>
      Array.from({ length: attribute.itemSize }, (_, j) => attribute.getComponent(index, j))
    );
    return {
      value: cornerIndex >= 0 ? (data[cornerIndex]?.[1] ?? 0) : positions.getY(index) * 2,
      data
    };
  };
  const clip = (polygon: Vertex[], limit: number, keepAbove: boolean): Vertex[] => {
    const clipped: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      if (!a || !b) continue;
      const aInside = keepAbove ? a.value >= limit : a.value <= limit;
      const bInside = keepAbove ? b.value >= limit : b.value <= limit;
      if (aInside) clipped.push(a);
      if (aInside !== bInside) {
        const t = (limit - a.value) / (b.value - a.value);
        clipped.push({
          value: limit,
          data: a.data.map((values, j) => values.map((v, k) => v + ((b.data[j]?.[k] ?? v) - v) * t))
        });
      }
    }
    return clipped;
  };
  for (let i = 0; i < (source.index?.count ?? positions.count); i += 3) {
    const triangle = [
      vertex(source.index?.getX(i) ?? i),
      vertex(source.index?.getX(i + 1) ?? i + 1),
      vertex(source.index?.getX(i + 2) ?? i + 2)
    ];
    const low = Math.min(...triangle.map((v) => v.value)),
      high = Math.max(...triangle.map((v) => v.value));
    const strips = low === high ? 1 : 12;
    for (let strip = 0; strip < strips; strip++) {
      const polygon =
        strips === 1
          ? triangle
          : clip(clip(triangle, -1 + strip / 6, true), -1 + (strip + 1) / 6, false);
      for (let j = 1; j < polygon.length - 1; j++)
        for (const v of [polygon[0], polygon[j], polygon[j + 1]])
          if (v) for (let k = 0; k < names.length; k++) output[k]?.push(...(v.data[k] ?? []));
    }
  }
  names.forEach((name, i) =>
    result.setAttribute(
      name,
      new BufferAttribute(new Float32Array(output[i] ?? []), attributes[i]?.itemSize ?? 3)
    )
  );
  for (const [name, attribute] of Object.entries(source.attributes))
    if (attribute instanceof InstancedBufferAttribute) result.setAttribute(name, attribute);
  return result;
}
/** Variants share all instance buffers and are disposed with their owning base geometry. */
export function configureSegmentedRoad(root: Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    if (!mesh.geometry.hasAttribute("noteContact")) return;
    const base = originals.get(object) ?? mesh.geometry;
    originals.set(object, base);
    if (!enabled) {
      mesh.geometry = base;
      return;
    }
    let variant = variants.get(base);
    if (!variant) {
      if (base.hasAttribute("slabCorner") || base.hasAttribute("noteShape"))
        variant = subdivide(base);
      else if (base instanceof PlaneGeometry && !base.hasAttribute("noteShape")) {
        variant = new PlaneGeometry(1, 1, 1, 32);
        for (const [name, attribute] of Object.entries(base.attributes))
          if (attribute instanceof InstancedBufferAttribute) variant.setAttribute(name, attribute);
      } else return;
      variants.set(base, variant);
      const owned = variant;
      base.addEventListener("dispose", () => {
        owned.dispose();
        variants.delete(base);
      });
    }
    mesh.geometry = variant;
  });
}
