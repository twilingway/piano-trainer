import { roadWidthUniforms } from "./roadWidthUniforms";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import { AdditiveBlending, ShaderMaterial, Vector2 } from "three";

const VERTEX = /* glsl */ `
${NOTE_LANE_SHADER}
attribute vec3 noteSize;
attribute float noteAlpha;
uniform vec2 viewport;
varying vec2 vPoint;
varying vec2 vQ0;
varying vec2 vQ1;
varying vec2 vQ2;
varying vec2 vQ3;
varying vec3 vTint;
varying float vAlpha;
varying float vRadius;
// Homogeneous z + w is zero on the actual near plane, including oblique views.
float haloNearFade(float clipZ, float clipW, float worldWidth, float depthScale) {
  float gap = (clipZ + clipW) / max(depthScale, 0.000001);
  return smoothstep(0.0, max(worldWidth * 2.0, 0.001), gap);
}
float haloSizeFade(float width, float screenShort) {
  return 1.0 - smoothstep(screenShort * 0.5, screenShort, width);
}
float haloRadius(float width, float screenShort) {
  return min(max(width * 0.2, 1.0), max(1.0, screenShort * 0.06));
}
float haloMargin(float width, float screenShort) {
  return min(max(width * 1.0, 4.0), max(2.0, screenShort * 0.18));
}
void main() {
  vec3 halfSize = noteSize * 0.5;
  vec4 c0 = projectNoteLane(projectRoadPoint(vec4(-halfSize.x, halfSize.y, -halfSize.z, 1.0)));
  vec4 c1 = projectNoteLane(projectRoadPoint(vec4(halfSize.x, halfSize.y, -halfSize.z, 1.0)));
  vec4 c2 = projectNoteLane(projectRoadPoint(vec4(halfSize.x, -halfSize.y, halfSize.z, 1.0)));
  vec4 c3 = projectNoteLane(projectRoadPoint(vec4(-halfSize.x, -halfSize.y, halfSize.z, 1.0)));
  vec4 centre = projectNoteLane(projectRoadPoint(vec4(0.0, 0.0, 0.0, 1.0)));
  float worldWidth = length((modelViewMatrix * instanceMatrix * vec4(noteSize.x, 0.0, 0.0, 0.0)).xyz);
  float depthScale = abs(projectionMatrix[2][2] + projectionMatrix[2][3]);
  float nearFade = min(min(haloNearFade(c0.z, c0.w, worldWidth, depthScale), haloNearFade(c1.z, c1.w, worldWidth, depthScale)),
                       min(haloNearFade(c2.z, c2.w, worldWidth, depthScale), haloNearFade(c3.z, c3.w, worldWidth, depthScale)));
  // Reject before perspective division: crossing the camera must not inflate a screen quad.
  vAlpha = 0.0;
  if (min(min(c0.w, c1.w), min(c2.w, c3.w)) <= 0.0 || centre.w <= 0.0 || nearFade <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 1.0, 1.0);
    return;
  }
  vec2 screen = max(viewport, vec2(1.0));
  float screenShort = min(screen.x, screen.y);
  vQ0 = c0.xy / c0.w * screen;
  vQ1 = c1.xy / c1.w * screen;
  vQ2 = c2.xy / c2.w * screen;
  vQ3 = c3.xy / c3.w * screen;
  float width = max(length(vQ1 - vQ0), length(vQ2 - vQ3));
  float margin = haloMargin(width, screenShort);
  vec2 lower = min(min(vQ0, vQ1), min(vQ2, vQ3)) - vec2(margin);
  vec2 upper = max(max(vQ0, vQ1), max(vQ2, vQ3)) + vec2(margin);
  lower = clamp(lower, -screen, screen);
  upper = clamp(upper, -screen, screen);
  vPoint = mix(lower, upper, position.xy + vec2(0.5));
  vRadius = haloRadius(width, screenShort);
  vTint = instanceColor;
  vAlpha = noteAlpha * nearFade * haloSizeFade(width, screenShort);
  gl_Position = vec4(vPoint / screen, centre.z / centre.w, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vPoint;
varying vec2 vQ0;
varying vec2 vQ1;
varying vec2 vQ2;
varying vec2 vQ3;
varying vec3 vTint;
varying float vAlpha;
varying float vRadius;
float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}
float segmentDistance(vec2 point, vec2 a, vec2 b) {
  vec2 edge = b - a;
  float along = clamp(dot(point - a, edge) / max(dot(edge, edge), 0.00001), 0.0, 1.0);
  return length(point - a - edge * along);
}
void main() {
  if (vAlpha <= 0.0) discard;
  float distance = min(
    min(segmentDistance(vPoint, vQ0, vQ1), segmentDistance(vPoint, vQ1, vQ2)),
    min(segmentDistance(vPoint, vQ2, vQ3), segmentDistance(vPoint, vQ3, vQ0))
  );
  float orientation = cross2(vQ1 - vQ0, vQ3 - vQ0) < 0.0 ? -1.0 : 1.0;
  bool inside =
    cross2(vQ1 - vQ0, vPoint - vQ0) * orientation >= 0.0 &&
    cross2(vQ2 - vQ1, vPoint - vQ1) * orientation >= 0.0 &&
    cross2(vQ3 - vQ2, vPoint - vQ2) * orientation >= 0.0 &&
    cross2(vQ0 - vQ3, vPoint - vQ3) * orientation >= 0.0;
  #ifdef FILLED_NOTE_HALO
    if (inside) discard;
  #endif
  float radius = inside ? vRadius * 0.4 : vRadius;
  float glow = exp(-distance * distance / (2.0 * radius * radius));
  float alpha = min(0.8, glow * vAlpha * 0.8);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vTint, alpha);
}
`;

/** An isotropic screen-space aura around the actual projected note, including both end caps. */
export function createNoteHaloMaterial(exteriorOnly = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...roadWidthUniforms,
      viewport: { value: new Vector2(1, 1) },
      visualTime: { value: 0 }
    },
    defines: exteriorOnly ? { FILLED_NOTE_HALO: 1 } : {},
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: !exteriorOnly,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false
  });
}
