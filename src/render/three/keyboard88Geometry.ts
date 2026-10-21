import { Float32BufferAttribute } from "three";
import type { BufferGeometry, MeshStandardMaterial, Texture } from "three";
import type { KeyBox } from "./keyBoxes";

/** Preserve baked UV0 and stable top/body groups; UV1 alone locates the player's paint. */
export function keyboard88Geometry(source: BufferGeometry, box: KeyBox): BufferGeometry {
  const geometry = source.clone();
  if (!source.hasAttribute("uv1"))
    throw new Error(`keyboard88 key ${String(box.pitch)} has no painted UV1`);
  const local = source.getAttribute("uv1");
  const values = new Float32Array(local.count * 2);
  const rim = (box.uv.u1 - box.uv.u0) * (box.black ? 0.08 : 0.07);
  for (let vertex = 0; vertex < local.count; vertex++) {
    values[vertex * 2] = box.uv.u0 + rim + local.getX(vertex) * (box.uv.u1 - box.uv.u0 - 2 * rim);
    values[vertex * 2 + 1] = box.uv.v1 - local.getY(vertex) * (box.uv.v1 - box.uv.v0);
  }
  geometry.setAttribute("keyPaintUv", new Float32BufferAttribute(values, 2));
  return geometry;
}

/** Keep the ivory's baked finish underneath colour, finger digits and key-name stickers. */
export function paintedKeyboardTop(
  source: MeshStandardMaterial,
  picture: Texture,
  black: boolean,
  painted: boolean
): MeshStandardMaterial {
  const material = source.clone();
  if (!painted) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.keyPicture = { value: picture };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 keyPaintUv;\nvarying vec2 vKeyPaintUv;"
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKeyPaintUv = keyPaintUv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D keyPicture;\nvarying vec2 vKeyPaintUv;"
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
       vec3 keyPaint = texture2D(keyPicture, vKeyPaintUv).rgb;
       vec3 keyBase = ${black ? "vec3(26.0,24.0,22.0)" : "vec3(248.0,244.0,232.0)"} / 255.0;
       diffuseColor.rgb = clamp(diffuseColor.rgb + keyPaint - keyBase, 0.0, 1.0);`
      );
  };
  material.customProgramCacheKey = () => `keyboard88-painted-${black ? "black" : "white"}`;
  return material;
}
