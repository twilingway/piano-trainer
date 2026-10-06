import whiteUrl from "../keys-arcade/white.webp";
import blackUrl from "../keys-arcade/black.webp";
import railUrl from "../keys-arcade/case-rail.webp";
import originalUrl from "../hands/five.webp";
import { FINGER_COLOR } from "../fingerColors";
import type { StudyFinger, StudyPose } from "./poses";

export type HandTreatment = "glass" | "outline" | "warm" | "original";
export interface DrawingOptions {
  readonly treatment: HandTreatment;
  readonly hands: "both" | "right" | "left";
  readonly opacity: number;
  readonly markers: boolean;
}
interface Point {
  readonly x: number;
  readonly y: number;
}
const WHITE = 50;
const TOP = 96;
const KEY_HEIGHT = 180;
const BASES: readonly Point[] = [
  { x: -50, y: 337 },
  { x: -49, y: 301 },
  { x: -13, y: 292 },
  { x: 23, y: 301 },
  { x: 55, y: 320 }
];
const WIDTHS = [22, 20, 21, 20, 17];
const REST_Y = [247, 184, 169, 183, 209];
const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

function tips(pose: StudyPose): readonly Point[] {
  const spread = pose.reach - 4;
  const offsets = [-2 - Math.floor(spread / 2), -1, 0, 1, 2 + Math.ceil(spread / 2)];
  if (pose.id === "chord7") offsets.splice(0, 5, -3, -1, 1, 1.8, 3);
  if (pose.id === "inversion") {
    offsets[1] = 0;
    offsets[2] = 0.6;
  }
  return offsets.map((offset, i) => {
    const finger = (i + 1) as StudyFinger;
    const down = pose.down.includes(finger);
    const black = pose.black?.includes(finger) ?? false;
    const x = pose.tucked && finger === 1 ? 0 : offset * WHITE;
    return { x: black ? x - 25 : x, y: down ? (black ? 180 : 238) : (REST_Y[i] ?? 185) };
  });
}

function fingerPath(base: Point, tip: Point, width: number): string {
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const length = Math.hypot(dx, dy);
  const nx = -dy / length;
  const ny = dx / length;
  const r = width * 0.78;
  const point = (p: Point, distance: number) =>
    `${String(p.x + nx * distance)},${String(p.y + ny * distance)}`;
  const mid = { x: base.x + dx * 0.48, y: base.y + dy * 0.46 };
  const cap = { x: tip.x + (dx / length) * r, y: tip.y + (dy / length) * r };
  return `M${point(base, width)} Q${point(mid, width * 1.03)} ${point(tip, r)}
    Q${String(cap.x + nx * r)},${String(cap.y + ny * r)} ${String(cap.x)},${String(cap.y)}
    Q${String(cap.x - nx * r)},${String(cap.y - ny * r)} ${point(tip, -r)}
    Q${point(mid, -width * 1.03)} ${point(base, -width)} Z`;
}

function vectorHand(pose: StudyPose, options: DrawingOptions, id: string): string {
  const positions = tips(pose);
  const warm = options.treatment === "warm";
  const outline = options.treatment === "outline";
  const fill = outline ? "#5ba4c929" : `url(#${id}-skin)`;
  const stroke = warm ? "#eecbb9" : "#d6efff";
  const paths = positions
    .map((tip, i) => {
      const base = BASES[i];
      if (!base) return "";
      return `<path d="${fingerPath(base, tip, WIDTHS[i] ?? 20)}" fill="${fill}"
      stroke="${stroke}" stroke-width="${String(outline ? 1.8 : 1.2)}"/>`;
    })
    .join("");
  const palm = `<path d="M-65,302 Q-26,278 28,295 Q68,310 72,343
    Q77,370 52,402 L45,478 L-44,478 L-41,408 Q-73,382 -77,351 Q-87,329 -65,302 Z"
    fill="${fill}" stroke="${stroke}" stroke-width="${String(outline ? 1.8 : 1.2)}"/>`;
  const details = positions
    .map((tip, i) => {
      const base = BASES[i];
      if (!base) return "";
      const angle = (Math.atan2(tip.x - base.x, base.y - tip.y) * 180) / Math.PI;
      const width = WIDTHS[i] ?? 20;
      return `<g transform="translate(${String(tip.x)} ${String(tip.y)}) rotate(${String(angle)})">
      <path d="M${String(-width * 0.57)},3 Q${String(-width * 0.65)},${String(-width * 0.65)} 0,${String(-width * 0.7)}
        Q${String(width * 0.65)},${String(-width * 0.65)} ${String(width * 0.57)},3 Q0,8 ${String(-width * 0.57)},3 Z"
        fill="${warm ? "#f5d9cb" : "#c4e1f61c"}" stroke="${stroke}" stroke-width="1.3"/>
      <path d="M-10,43 Q0,39 10,43 M-8,47 Q0,44 8,47" fill="none"
        stroke="${warm ? "#996d59" : "#d6efff"}" opacity=".36" stroke-width="1"/>
      </g>`;
    })
    .join("");
  const tendons = `<path d="M-34,407 Q-47,365 -40,334 M-8,420 Q-12,361 -12,322
    M16,415 Q25,367 28,332 M37,403 Q56,373 54,350" fill="none"
    stroke="${warm ? "#9b6a55" : "#eefaff"}" opacity=".18" stroke-width="2"/>`;
  return `<g mask="url(#${id}-fade)" opacity="${String(options.opacity)}">${paths}${palm}${details}${tendons}</g>`;
}

function markers(pose: StudyPose, options: DrawingOptions, center: number, mirror: number): string {
  if (!options.markers) return "";
  return tips(pose)
    .map((tip, i) => {
      const finger = (i + 1) as StudyFinger;
      if (!pose.down.includes(finger)) return "";
      const color = hex(FINGER_COLOR[finger]);
      return `<g transform="translate(${String(center + tip.x * mirror)} ${String(tip.y)})">
      <circle r="14" fill="${color}" fill-opacity=".22" stroke="${color}" stroke-width="2"/>
      <text y="5" text-anchor="middle" fill="#fff" font-size="14" font-weight="700">${String(finger)}</text></g>`;
    })
    .join("");
}

export function drawScene(pose: StudyPose, options: DrawingOptions, id: string): string {
  const handSides = options.hands === "both" ? [-1, 1] : [options.hands === "left" ? -1 : 1];
  const centers = (side: number) => (options.hands === "both" ? (side === -1 ? 275 : 775) : 575);
  const lights = handSides.flatMap((side) =>
    tips(pose).flatMap((tip, i) => {
      const finger = (i + 1) as StudyFinger;
      if (!pose.down.includes(finger)) return [];
      return [
        {
          x: centers(side) + tip.x * side,
          black: pose.black?.includes(finger),
          color: hex(FINGER_COLOR[finger])
        }
      ];
    })
  );
  const whiteKeys = Array.from(
    { length: 21 },
    (_, i) => `<image href="${whiteUrl}"
    x="${String(i * WHITE + 0.2)}" y="${String(TOP)}" width="49.6" height="${String(KEY_HEIGHT)}" preserveAspectRatio="none"/>`
  ).join("");
  const keyLights = lights
    .filter((light) => !light.black)
    .map(
      (light) =>
        `<rect x="${String(Math.floor(light.x / WHITE) * WHITE + 2)}" y="${String(TOP + 3)}" width="46" height="${String(KEY_HEIGHT - 7)}"
      rx="5" fill="${light.color}" fill-opacity=".24" stroke="${light.color}" stroke-opacity=".8" stroke-width="2"/>`
    )
    .join("");
  const blackKeys = Array.from({ length: 20 }, (_, i) => {
    if ([2, 6].includes(i % 7)) return "";
    const x = (i + 1) * WHITE - 15;
    const light = lights.find((entry) => entry.black && Math.abs(entry.x - (x + 15)) < 2);
    return `<image href="${blackUrl}" x="${String(x)}" y="${String(TOP)}" width="30" height="112" preserveAspectRatio="none"/>
      ${light ? `<rect x="${String(x + 1)}" y="${String(TOP + 2)}" width="28" height="108" rx="4" fill="${light.color}" fill-opacity=".5" stroke="${light.color}"/>` : ""}`;
  }).join("");
  const noteLabels = Array.from(
    { length: 21 },
    (_, i) => `<text x="${String(i * WHITE + 25)}" y="${String(TOP + KEY_HEIGHT - 17)}"
    text-anchor="middle" fill="#37404b" font-size="11">${["C", "D", "E", "F", "G", "A", "B"][i % 7] ?? ""}${String(3 + Math.floor(i / 7))}</text>`
  ).join("");
  const hands = handSides
    .map((side) => {
      const center = centers(side);
      const hand =
        options.treatment === "original"
          ? `<image href="${originalUrl}" x="-158" y="127" width="320" height="320" opacity="${String(options.opacity)}"/>`
          : vectorHand(pose, options, id);
      return `<g transform="translate(${String(center)} 0) scale(${String(side)} 1)">${hand}</g>${markers(pose, options, center, side)}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1050 480" role="img">
    <defs>
      <linearGradient id="${id}-skin" x1="-70" y1="150" x2="90" y2="430" gradientUnits="userSpaceOnUse">
        <stop stop-color="${options.treatment === "warm" ? "#edc6ad" : "#bddbf0"}"/>
        <stop offset=".48" stop-color="${options.treatment === "warm" ? "#c99072" : "#7f9bb8"}"/>
        <stop offset="1" stop-color="${options.treatment === "warm" ? "#94634f" : "#49617e"}"/>
      </linearGradient>
      <linearGradient id="${id}-wrist" x2="0" y2="1"><stop offset=".72" stop-color="white"/>
        <stop offset="1" stop-color="black"/></linearGradient>
      <mask id="${id}-fade" maskUnits="userSpaceOnUse" x="-260" y="120" width="520" height="360">
        <rect x="-260" y="120" width="520" height="360" fill="url(#${id}-wrist)"/></mask>
      <radialGradient id="${id}-background"><stop stop-color="#10334a"/><stop offset="1" stop-color="#020c18"/></radialGradient>
    </defs>
    <rect width="1050" height="480" fill="#020c18"/>
    <rect width="1050" height="96" fill="url(#${id}-background)"/>
    ${Array.from({ length: 22 }, (_, i) => `<path d="M${String(i * WHITE)},0 V94" stroke="#1a718a" stroke-opacity=".18"/>`).join("")}
    <rect y="85" width="1050" height="11" fill="#003b62"/>
    <path d="M0,86 H1050" stroke="#00e5ff" stroke-width="2"/>
    ${whiteKeys}${keyLights}${blackKeys}${noteLabels}
    <image href="${railUrl}" x="0" y="276" width="1050" height="10" preserveAspectRatio="none"/>
    ${hands}</svg>`;
}
