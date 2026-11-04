/** Lifecycle provenance arrives before any cleanup-generated releases. */
export type InputCancellationReason =
  "pause" | "load" | "seek" | "restart" | "disconnect" | "cleanup" | "configure" | "destroy";
