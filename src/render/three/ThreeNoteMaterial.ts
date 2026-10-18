import { DoubleSide, ShaderMaterial } from "three";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import { NOTE_SLAB_ATTRIBUTES, NOTE_SLAB_VERTEX } from "./noteSlabGeometry";

const VERTEX = /* glsl */ `
${NOTE_LANE_SHADER}
${NOTE_SLAB_ATTRIBUTES}
attribute vec3 noteSize;
attribute float noteAlpha;
varying vec3 vPoint;
varying vec3 vSize;
varying vec3 vTint;
varying float vAlpha;
varying float vClipW;
varying float vNearGap;
varying float vWorldWidth;
varying float vProjectedWidth;
void main() {
  ${NOTE_SLAB_VERTEX}
  mat4 viewNote = modelViewMatrix * instanceMatrix;
  vec4 view = viewNote * vec4(slabPoint, 1.0);
  vec4 clip = projectNoteLane(projectionMatrix * view);
  vPoint = slabPoint;
  vSize = noteSize;
  vTint = instanceColor;
  vAlpha = noteAlpha;
  vClipW = clip.w;
  float depthScale = abs(projectionMatrix[2][2] + projectionMatrix[2][3]);
  vNearGap = (clip.z + clip.w) / max(depthScale, 0.000001);
  vWorldWidth = length((viewNote * vec4(noteSize.x, 0.0, 0.0, 0.0)).xyz);
  vProjectedWidth = length((projectionMatrix * vec4(vWorldWidth, 0.0, 0.0, 0.0)).xy);
  gl_Position = clip;
}
`;

const FRAGMENT = /* glsl */ `
uniform float visualTime;
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
float noteVolumeFade(float clipW, float gap, float width, float projectedWidth) {
  if (clipW <= 0.0) return 0.0;
  return smoothstep(0.0, max(width * 0.8, 0.001), gap)
    * (1.0 - smoothstep(0.8, 2.0, projectedWidth / clipW));
}
// The same radiance applies to caps, sides and bevels, independent of scene lights or facing.
float noteGlow(float rim, float flow) {
  return mix(0.88 + 0.02 * flow, 2.0, rim);
}
// A thin line along each chamfer centre leaves the rest of the bevel transparent.
// The four vertical corner lines have the same width as both rounded cap perimeters.
float noteEdgeDistance(float footprint, float qy, float qx, float qz, float radius, float bevel) {
  float radial = max(0.0, -footprint) - bevel * 0.5;
  float vertical = max(0.0, qy) - bevel * 0.5;
  float capEdge = sqrt(radial * radial + vertical * vertical);
  float corner = radius * 0.29289322;
  float dx = qx - corner;
  float dz = qz - corner;
  return min(capEdge, sqrt(dx * dx + dz * dz));
}
float noteGlassAlpha(float rim) {
  return mix(0.14, 0.94, rim);
}
void main() {
  float fade = noteVolumeFade(vClipW, vNearGap, vWorldWidth, vProjectedWidth);
  if (fade <= 0.0 || vAlpha <= 0.0) discard;
  vec3 halfSize = vSize * 0.5;
  vec3 q = halfSize - abs(vPoint);
  float radius = min(vSize.x * 0.11, vSize.z * 0.45);
  float bevel = min(vSize.x * 0.025, min(radius * 0.45, vSize.y * 0.25));
  float footprint = roundedRect(vPoint.xz, halfSize.xz, radius);
  float edgeDistance = noteEdgeDistance(footprint, q.y, q.x, q.z, radius, bevel);
  float aa = max(fwidth(edgeDistance), 0.06);
  float lineWidth = max(0.18, aa * 0.65);
  float rim = 1.0 - smoothstep(lineWidth, lineWidth + aa, edgeDistance);
  float across = abs(vPoint.x) / max(vSize.x, 0.001);
  float flow = sin(abs(vPoint.z) * 0.055 + visualTime * 1.8 + sin(across * 6.0));
  vec3 tint = mix(vTint, mix(vTint, vec3(1.0), 0.65), rim) * noteGlow(rim, flow);
  gl_FragColor = vec4(tint, vAlpha * fade * noteGlassAlpha(rim));
  #include <colorspace_fragment>
}
`;

/** Back then front surfaces expose the far outline through glass without occluding other notes. */
export function createNoteBodyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { visualTime: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
    forceSinglePass: false
  });
}
