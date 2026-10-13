export function sessionErrorStats(
  wrong: readonly number[],
  missed: readonly number[],
  offsets: readonly number[]
) {
  const errors = new Map<number, number>();
  for (const pitch of [...wrong, ...missed]) errors.set(pitch, (errors.get(pitch) ?? 0) + 1);
  return {
    troubleSpots: [...errors]
      .map(([pitch, count]) => ({ pitch, errors: count }))
      .sort((a, b) => b.errors - a.errors || a.pitch - b.pitch)
      .slice(0, 5),
    meanOffset:
      offsets.length === 0 ? 0 : offsets.reduce((sum, value) => sum + value, 0) / offsets.length
  };
}
