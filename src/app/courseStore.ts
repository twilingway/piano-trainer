import type { ReadingSourceFilter } from "../reading/progressTypes";
import type { ReadingInputSource } from "../reading/types";

/** Each course keeps this many runs, or this many per group. */
const HISTORY_LIMIT = 20;

export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const seed = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export const inputSource = (value: unknown): value is ReadingInputSource =>
  value === "midi" || value === "keyboard" || value === "pointer";
export const sourceFilter = (value: unknown): value is ReadingSourceFilter =>
  value === "all" || inputSource(value);

/** Undefined marks the stored value invalid; the field then keeps its empty default. */
export type CourseFieldParsers<S> = {
  readonly [K in keyof S]?: (value: unknown, row: Record<string, unknown>) => S[K] | undefined;
};

/** A parser that keeps a value its guard accepts. */
export const accept =
  <T>(guard: (value: unknown) => value is T) =>
  (value: unknown): T | undefined =>
    guard(value) ? value : undefined;

/**
 * One course's stored sibling: a malformed field or run marks the row invalid, and only the
 * valid parts survive.
 */
export function normalizeCourseState<S extends { history: unknown[] }, R>(
  value: unknown,
  spec: {
    readonly empty: () => S;
    readonly fields: CourseFieldParsers<Omit<S, "generatorVersion" | "history">>;
    readonly validate: (value: unknown) => R | null;
    readonly merge: (saved: readonly R[], incoming: readonly R[]) => S["history"];
  }
): { state: S; invalid: boolean } {
  const state = spec.empty();
  if (value === undefined) return { state, invalid: false };
  const row = object(value);
  const history: unknown[] = Array.isArray(row.history) ? row.history : [];
  const valid = history.flatMap((item) => {
    const result = spec.validate(item);
    return result === null ? [] : [result];
  });
  let invalid =
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    row.generatorVersion !== 1 ||
    !Array.isArray(row.history) ||
    valid.length !== history.length;
  const fields = spec.fields as CourseFieldParsers<Record<string, unknown>>;
  for (const [key, parse] of Object.entries(fields)) {
    const parsed = parse?.(row[key], row);
    if (parsed === undefined) invalid = true;
    else (state as Record<string, unknown>)[key] = parsed;
  }
  state.history = spec.merge([], valid);
  return { state, invalid };
}

interface CourseRun {
  readonly id: string;
  readonly runId: string;
  readonly completedAt: number;
}

/** A committed run wins over a stale or edited copy of it from another tab. */
export function mergeCourseHistory<R extends CourseRun, C>(
  saved: readonly R[],
  incoming: readonly R[],
  options: {
    readonly copy: (result: R) => C;
    readonly validate?: (value: R) => R | null;
    /** A result id may also belong to one run only. */
    readonly distinctIds?: boolean;
    /** The limit applies per group, in this order. */
    readonly groups?: { readonly of: (result: R) => string; readonly order: readonly string[] };
  }
): C[] {
  const unique = new Map<string, R>();
  const ids = new Set<string>();
  for (const value of [...saved, ...incoming]) {
    const result = options.validate ? options.validate(value) : value;
    if (!result || unique.has(result.runId) || (options.distinctIds && ids.has(result.id)))
      continue;
    unique.set(result.runId, result);
    ids.add(result.id);
  }
  const sorted = [...unique.values()].sort(
    (a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId)
  );
  const groups = options.groups;
  const kept = groups
    ? groups.order.flatMap((group) =>
        sorted.filter((result) => groups.of(result) === group).slice(-HISTORY_LIMIT)
      )
    : sorted.slice(-HISTORY_LIMIT);
  return kept.map(options.copy);
}
