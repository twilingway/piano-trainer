export interface StaffPresentation {
  readonly id: string;
  readonly onPresented: (id: string, atMs: number) => void;
  readonly onError: (id: string) => void;
}

/** Two frames allow the previous frame to paint before reporting a visible prompt. */
export function watchStaffPresentation(
  ready: () => boolean,
  shown: (atMs: number) => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
  visible: () => boolean = () => document.visibilityState !== "hidden"
): () => void {
  let frame = 0;
  let painted = false;
  const step = (atMs: number) => {
    if (ready() && visible()) {
      if (painted) {
        shown(atMs);
        return;
      }
      painted = true;
    } else painted = false;
    frame = request(step);
  };
  frame = request(step);
  return () => {
    cancel(frame);
  };
}
