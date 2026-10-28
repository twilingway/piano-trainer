import { createNoteBodyMaterial } from "./ThreeNoteMaterial";
import { FrontSide, type ShaderMaterial } from "three";

const FRAGMENT = /* glsl */ `
varying vec3 vPoint;
varying vec3 vSize;
varying vec3 vTint;
varying float vAlpha;
varying float vClipW;
varying float vNearGap;
varying float vWorldWidth;
varying float vProjectedWidth;
float roundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + vec2(radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
float edgeCoverage(float distance, float pixelWidth) {
  float aa = max(pixelWidth, 0.06);
  float width = max(0.18, aa * 0.65);
  return 1.0 - smoothstep(width, width + aa, distance);
}
float filledNoteAlpha() { return 1.0; }
float filledNoteGradient(float across) {
  return mix(0.86, 0.98, clamp(abs(across - 0.5) * 2.0, 0.0, 1.0));
}
void main() {
  if (vAlpha <= 0.0 || vClipW <= 0.0) discard;
  float nearFade = smoothstep(0.0, max(vWorldWidth * 0.8, 0.001), vNearGap);
  float sizeFade = 1.0 - smoothstep(0.8, 2.0, vProjectedWidth / vClipW);
  if (nearFade * sizeFade < 0.01) discard;
  vec3 halfSize = vSize * 0.5;
  vec3 q = halfSize - abs(vPoint);
  float radius = min(vSize.x * 0.11, vSize.z * 0.45);
  float bevel = min(vSize.x * 0.025, min(radius * 0.45, vSize.y * 0.25));
  float footprint = roundedRect(vPoint.xz, halfSize.xz, radius);
  vec2 capOffset = vec2(max(0.0, -footprint), max(0.0, q.y)) - bevel * 0.5;
  vec2 cornerOffset = q.xz - radius * 0.29289322;
  float rim = max(edgeCoverage(length(capOffset), length(fwidth(capOffset))),
                  edgeCoverage(length(cornerOffset), length(fwidth(cornerOffset))));
  float across = vPoint.x / max(vSize.x, 0.001) + 0.5;
  float topFace = smoothstep(-vSize.y * 0.1, vSize.y * 0.45, vPoint.y);
  vec3 tint = vTint * filledNoteGradient(across) * mix(0.58, 1.0, topFace);
  // Muted score hints retain an opaque surface instead of revealing notes behind them.
  tint *= mix(0.6, 1.0, clamp(vAlpha, 0.0, 1.0));
  float foot = 1.0 - smoothstep(0.0, vSize.x * 0.6, halfSize.z - vPoint.z);
  tint = mix(tint, vec3(1.0), foot * topFace * 0.1);
  tint = mix(tint, vec3(1.0), rim * 0.94);
  gl_FragColor = vec4(tint, filledNoteAlpha());
  #include <colorspace_fragment>
}
`;

/** The accepted closed rounded slab gains a solid face; the legacy glass shader stays separate. */
export function createFilledNoteBodyMaterial(): ShaderMaterial {
  const material = createNoteBodyMaterial();
  material.fragmentShader = FRAGMENT;
  material.transparent = false;
  material.depthWrite = true;
  material.forceSinglePass = true;
  // Opaque: the facing side wins by winding. Docked depth mixes in the keyboard camera, whose
  // order of a direct note's faces can differ from the world's and would show the dark back.
  material.side = FrontSide;
  return material;
}
