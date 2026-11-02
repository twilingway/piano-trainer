export type GraphicsFailureKind = "unsupported" | "unavailable" | "lost";

/** A capability failure is distinct from a temporarily refused graphics context. */
export class GraphicsInitializationError extends Error {
  constructor(readonly kind: Exclude<GraphicsFailureKind, "lost">) {
    super(`Graphics ${kind}`);
    this.name = "GraphicsInitializationError";
  }
}

export function graphicsFailureKind(error: unknown): GraphicsFailureKind {
  return error instanceof GraphicsInitializationError ? error.kind : "unavailable";
}
