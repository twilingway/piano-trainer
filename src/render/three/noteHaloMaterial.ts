import { AdditiveBlending, ShaderMaterial, Vector2 } from "three";

const VERTEX = /* glsl */ `
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
void main() {
  mat4 projectNote = projectionMatrix * modelViewMatrix * instanceMatrix;
  vec3 halfSize = noteSize * 0.5;
  vec4 c0 = projectNote * vec4(-halfSize.x, halfSize.y, -halfSize.z, 1.0);
  vec4 c1 = projectNote * vec4(halfSize.x, halfSize.y, -halfSize.z, 1.0);
  vec4 c2 = projectNote * vec4(halfSize.x, -halfSize.y, halfSize.z, 1.0);
  vec4 c3 = projectNote * vec4(-halfSize.x, -halfSize.y, halfSize.z, 1.0);
  vec4 centre = projectNote * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 screen = max(viewport, vec2(1.0));
  vQ0 = c0.xy / max(c0.w, 0.001) * screen;
  vQ1 = c1.xy / max(c1.w, 0.001) * screen;
  vQ2 = c2.xy / max(c2.w, 0.001) * screen;
  vQ3 = c3.xy / max(c3.w, 0.001) * screen;
  float width = max(length(vQ1 - vQ0), length(vQ2 - vQ3));
  float margin = max(width * 0.6, 2.0);
  vec2 lower = min(min(vQ0, vQ1), min(vQ2, vQ3)) - vec2(margin);
  vec2 upper = max(max(vQ0, vQ1), max(vQ2, vQ3)) + vec2(margin);
  vPoint = mix(lower, upper, position.xy + vec2(0.5));
  vRadius = max(width * 0.20, 0.75);
  vTint = instanceColor;
  vAlpha = noteAlpha;
  if (min(min(c0.w, c1.w), min(c2.w, c3.w)) <= 0.001 || centre.w <= 0.001) {
    vAlpha = 0.0;
    gl_Position = vec4(2.0, 2.0, 1.0, 1.0);
  } else {
    gl_Position = vec4(vPoint / screen, centre.z / centre.w, 1.0);
  }
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
  float radius = inside ? vRadius * 0.4 : vRadius;
  float glow = exp(-distance * distance / (2.0 * radius * radius));
  float alpha = min(0.5, glow * vAlpha * 0.5);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vTint, alpha);
}
`;

/** An isotropic screen-space aura around the actual projected note, including both end caps. */
export function createNoteHaloMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      viewport: { value: new Vector2(1, 1) },
      visualTime: { value: 0 }
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false
  });
}
