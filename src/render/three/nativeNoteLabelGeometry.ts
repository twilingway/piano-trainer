import { BufferGeometry, Float32BufferAttribute } from "three";
import { createNoteSlabGeometry } from "./noteSlabGeometry";

/** Exact top triangles preserve the opaque body's raster depth through nonlinear dock projection. */
export function createNativeNoteLabelGeometry(): BufferGeometry {
  const source = createNoteSlabGeometry();
  const target = new BufferGeometry();
  const selected: number[] = [];
  try {
    const profiles = source.getAttribute("slabProfile");
    for (let vertex = 0; vertex < profiles.count; vertex += 3) {
      let top = true;
      for (let corner = 0; corner < 3; corner++)
        if (
          profiles.getX(vertex + corner) !== 0.5 ||
          profiles.getY(vertex + corner) !== 0 ||
          profiles.getZ(vertex + corner) !== 1
        )
          top = false;
      if (top) selected.push(vertex, vertex + 1, vertex + 2);
    }
    for (const name of ["position", "slabCorner", "slabArc", "slabProfile"]) {
      const attribute = source.getAttribute(name);
      const values: number[] = [];
      for (const vertex of selected)
        for (let component = 0; component < attribute.itemSize; component++)
          values.push(attribute.getComponent(vertex, component));
      target.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
    }
    target.name = "native-note-caption-top";
    return target;
  } finally {
    source.dispose();
  }
}
