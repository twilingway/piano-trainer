import { DoubleSide, MeshStandardMaterial, ShaderMaterial, Vector2 } from "three";

import { createNoteHaloMaterial } from "./noteHaloMaterial";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import { NOTE_SLAB_ATTRIBUTES, NOTE_SLAB_VERTEX } from "./noteSlabGeometry";

const BODY_DECLARATIONS = /* glsl */ `
attribute vec3 noteSize;
attribute float noteAlpha;
${NOTE_SLAB_ATTRIBUTES}
${NOTE_LANE_SHADER}
varying vec3 vNoteTint;
varying vec3 vNoteNormal;
varying float vNoteAlpha;
`;

/** Each ring retains its world-space corner radius and narrow vertical chamfer. */
const BODY_VERTEX = /* glsl */ `
${NOTE_SLAB_VERTEX}
vec3 transformed = slabPoint;
vNoteTint = instanceColor;
vNoteNormal = normal;
vNoteAlpha = noteAlpha;
`;

export function createNoteBodyMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0x969696,
    emissive: 0x8a8a8a,
    roughness: 0.18,
    flatShading: true,
    metalness: 0.16,
    transparent: true,
    opacity: 0.94,
    depthWrite: true
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `${BODY_DECLARATIONS}\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", BODY_VERTEX)
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\ngl_Position = projectNoteLane(gl_Position);"
      );
    shader.fragmentShader = /* glsl */ `
varying vec3 vNoteTint;
varying vec3 vNoteNormal;
varying float vNoteAlpha;
${shader.fragmentShader}`
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.a *= vNoteAlpha;"
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
vec3 noteNormal = normalize(vNoteNormal);
float noteFront = max(noteNormal.z, 0.0);
float noteTop = max(noteNormal.y, 0.0);
float noteVertical = abs(noteNormal.y);
float noteBevel = noteVertical * (1.0 - noteVertical) * 4.0;
vec3 noteEdgeTint = mix(vNoteTint, vec3(1.0), noteBevel * 0.40);
totalEmissiveRadiance *= noteEdgeTint * (0.48 + 0.20 * noteFront + 0.30 * noteTop + 0.35 * noteBevel);`
      );
  };
  material.customProgramCacheKey = () => "three-road-note-slab-lane-v2";
  return material;
}

const SURFACE_VERTEX = /* glsl */ `
${NOTE_LANE_SHADER}
attribute vec3 noteSize;
attribute float noteAlpha;
uniform float halo;
varying vec2 vPoint;
varying vec3 vSize;
varying vec3 vTint;
varying float vAlpha;
void main() {
  float margin = halo * noteSize.x * 0.65;
  vec2 span = noteSize.xz + vec2(margin * 2.0);
  vPoint = position.xy * span;
  vSize = noteSize;
  vTint = instanceColor;
  vAlpha = noteAlpha;
  vec3 point = vec3(vPoint.x, noteSize.y * 0.5 + noteSize.x * 0.003, -vPoint.y);
  gl_Position = projectNoteLane(projectionMatrix * modelViewMatrix * instanceMatrix * vec4(point, 1.0));
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
uniform float halo;
uniform float visualTime;
varying vec2 vPoint;
varying vec3 vSize;
varying vec3 vTint;
varying float vAlpha;
float roundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + vec2(radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
void main() {
  float radius = min(vSize.x * 0.11, vSize.z * 0.45);
  float bevel = min(vSize.x * 0.025, min(radius * 0.45, vSize.y * 0.25));
  float distance = roundedRect(vPoint, vSize.xz * 0.5 - vec2(bevel), radius - bevel);
  float aa = max(fwidth(distance), 0.08);
  if (halo > 0.5) {
    float outside = max(distance, 0.0);
    float inside = min(distance, 0.0);
    float spread = max(vSize.x * 0.28, 0.3);
    float glow = exp(-outside * outside / (2.0 * spread * spread));
    glow *= exp(-inside * inside / (2.0 * spread * spread * 0.15));
    float opacity = glow * vAlpha * 0.68;
    if (opacity < 0.002) discard;
    gl_FragColor = vec4(vTint * 1.08, opacity);
  } else {
    float coverage = 1.0 - smoothstep(-aa, aa, distance);
    if (coverage < 0.002) discard;
    float lineWidth = clamp(vSize.x * 0.045, 0.35, 1.25);
    float rim = 1.0 - smoothstep(lineWidth - aa, lineWidth + aa, -distance);
    float across = vPoint.x / max(vSize.x, 0.001);
    float flow = sin(vPoint.y * 0.055 + visualTime * 1.8 + sin(across * 6.0 + visualTime * 0.7));
    float reflectionPosition = (across + 0.2) / 0.14;
    float reflection = exp(-reflectionPosition * reflectionPosition);
    float highlightPosition = (across + 0.32) / 0.035;
    float highlight = exp(-highlightPosition * highlightPosition);
    float along = clamp(vPoint.y / max(vSize.z, 0.001) + 0.5, 0.0, 1.0);
    float front = (1.0 - along) * (1.0 - along) * (1.0 - along);
    float side = across * across * 4.0;
    float glass = 0.43 + side * 0.13 + front * 0.22 + flow * 0.045 + reflection * 0.14;
    vec3 face = vTint * glass + vec3(highlight * 0.025);
    vec3 edge = vTint * (1.15 + front * 0.15 + reflection * 0.12) + vec3(0.018);
    vec3 tint = mix(face, edge, rim);
    float tubeWidth = max(aa * 0.55, vSize.x * 0.014);
    float tube = 1.0 - smoothstep(tubeWidth, tubeWidth + aa, abs(distance + lineWidth * 0.32));
    tint = mix(tint * 1.22, mix(vTint, vec3(1.0), 0.74) * 1.35, tube);
    gl_FragColor = vec4(tint, coverage * vAlpha * mix(0.9, 1.0, rim));
  }
}
`;

/** A continuous neon face and its separate hue-preserving halo share the same world footprint. */
export function createNoteSurfaceMaterial(halo: boolean): ShaderMaterial {
  if (halo) return createNoteHaloMaterial();
  return new ShaderMaterial({
    uniforms: {
      halo: { value: 0 },
      visualTime: { value: 0 },
      viewport: { value: new Vector2(1440, 900) }
    },
    vertexShader: SURFACE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: !halo,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    side: DoubleSide
  });
}
