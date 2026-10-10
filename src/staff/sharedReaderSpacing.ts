/** Russian solfege labels need room in the same engraving grid as the score's noteheads. */
export function sharedReaderSpacing(base: number, names: "off" | "ru" | "en" | undefined): number {
  return names === "ru" ? base * 4 : base;
}
