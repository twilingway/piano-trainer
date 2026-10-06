import whiteUrl from "../keys-arcade/white.webp";
import blackUrl from "../keys-arcade/black.webp";
import railUrl from "../keys-arcade/case-rail.webp";
import { FINGER_COLOR } from "../fingerColors";
import type { StudyFinger } from "./poses";

const WHITE = 50;
const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

// The Blender render over a keyboard drawn to its real proportions: 50 units a white key (23.5 mm),
// so a white key is 319 units long and a black one 202.
// Pressed keys are semitones from C4, which is white key 7 here, as in the solver.
const MM = WHITE / 23.5;
const REAL_WHITE = 150 * MM;
const REAL_BLACK = 95 * MM;
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
// Where the 320 x 379 webp lies: render frame 0.30 m centred 2.5 white keys right of C4 and 30 mm
// in front of the keys' front edge, cropped to x 160..1024 of its 1024 px.
const RENDER = {
  x: 375 - 44.38 * MM,
  y: 30 * MM,
  width: ((864 * 300) / 1024) * MM,
  height: 300 * MM
};

export function drawRenderScene(
  url: string,
  keys: Readonly<Record<string, number>> | undefined,
  label: string
): string {
  const pressed = Object.entries(keys ?? {}).map(([finger, semitone]) => {
    const octave = Math.floor(semitone / 12);
    const pc = semitone - octave * 12;
    const black = !WHITE_PCS.includes(pc);
    const white = 7 + octave * 7 + WHITE_PCS.indexOf(black ? pc - 1 : pc);
    return { white, black, color: hex(FINGER_COLOR[Number(finger) as StudyFinger]) };
  });
  const light = (white: number, black: boolean) =>
    pressed.find((p) => p.white === white && p.black === black);
  const whites = Array.from({ length: 21 }, (_, i) => {
    const lit = light(i, false);
    return `<image href="${whiteUrl}" x="${String(i * WHITE + 0.2)}" y="0" width="49.6" height="${String(REAL_WHITE)}" preserveAspectRatio="none"/>
      ${lit ? `<rect x="${String(i * WHITE + 2)}" y="3" width="46" height="${String(REAL_WHITE - 7)}" rx="5" fill="${lit.color}" fill-opacity=".24" stroke="${lit.color}" stroke-opacity=".8" stroke-width="2"/>` : ""}`;
  }).join("");
  const blacks = Array.from({ length: 20 }, (_, i) => {
    if ([2, 6].includes(i % 7)) return "";
    const x = (i + 1) * WHITE - 15;
    const lit = light(i, true);
    return `<image href="${blackUrl}" x="${String(x)}" y="0" width="30" height="${String(REAL_BLACK)}" preserveAspectRatio="none"/>
      ${lit ? `<rect x="${String(x + 1)}" y="2" width="28" height="${String(REAL_BLACK - 4)}" rx="4" fill="${lit.color}" fill-opacity=".5" stroke="${lit.color}"/>` : ""}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="240 0 560 560" role="img" aria-label="${label}">
    <rect x="240" width="560" height="560" fill="#020c18"/>
    ${whites}${blacks}
    <image href="${railUrl}" x="0" y="${String(REAL_WHITE)}" width="1050" height="10" preserveAspectRatio="none"/>
    <image href="${url}" x="${String(RENDER.x)}" y="${String(RENDER.y)}" width="${String(RENDER.width)}" height="${String(RENDER.height)}"/>
  </svg>`;
}
