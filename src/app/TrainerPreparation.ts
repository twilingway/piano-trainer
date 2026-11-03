export type PreparationStatus = "idle" | "preparing" | "waiting-frame" | "error";

export function waitForVisiblePaint(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let frame = 0;
    const finish = (ready: boolean) => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visible);
      signal.removeEventListener("abort", abort);
      resolve(ready);
    };
    const abort = () => {
      finish(false);
    };
    const visible = () => {
      if (document.hidden || signal.aborted || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (document.hidden) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!document.hidden) finish(true);
        });
      });
    };
    if (signal.aborted) {
      finish(false);
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    document.addEventListener("visibilitychange", visible);
    visible();
  });
}
interface Job {
  readonly playing: boolean;
  readonly foreground?: boolean;
  readonly prepareSound?: () => Promise<boolean>;
  readonly pause: () => void;
  readonly release: () => void;
  readonly apply: () => { preserve: boolean; autostart: boolean };
  readonly frame: (signal: AbortSignal) => Promise<boolean>;
  readonly resume: () => void;
}
interface Request {
  readonly abort: AbortController;
  readonly promise: Promise<boolean>;
  readonly finish: (ready: boolean) => void;
  readonly release: () => void;
  resume: boolean;
  cancelled: boolean;
}
/** One generation owns the visible request and its original playback intention. */
export class TrainerPreparation {
  private status: PreparationStatus = "idle";
  private current: Request | undefined;
  private ready = true;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly paint = waitForVisiblePaint) {}
  getSnapshot = (): PreparationStatus => this.status;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(status: PreparationStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }
  start(job: Job): void {
    const resume = this.current?.resume ?? job.playing;
    this.stop();
    let finish!: (ready: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const request: Request = {
      abort: new AbortController(),
      promise,
      finish,
      release: job.release,
      resume,
      cancelled: false
    };
    this.current = request;
    this.ready = false;
    job.pause();
    this.publish(job.foreground === false ? "idle" : "preparing");
    void (async () => {
      if (!(await this.paint(request.abort.signal)) || this.current !== request) return;
      const next = job.apply();
      if (!request.cancelled && job.foreground !== false) this.publish("waiting-frame");
      const ready = await job.frame(request.abort.signal);
      if (this.current !== request) return;
      this.ready = ready;
      this.publish(!ready && !request.cancelled && job.foreground !== false ? "error" : "idle");
      const start =
        ready && !request.cancelled && (next.autostart || (next.preserve && request.resume));
      const sound = start ? await (job.prepareSound?.() ?? Promise.resolve(true)) : true;
      if (this.current !== request) return;
      this.current = undefined;
      job.release();
      if (start && sound && !request.cancelled) job.resume();
      request.finish(ready && sound && !request.cancelled);
    })().catch(() => {
      if (this.current !== request) return;
      this.current = undefined;
      job.release();
      this.ready = false;
      this.publish(request.cancelled || job.foreground === false ? "idle" : "error");
      request.finish(false);
    });
  }
  wait = (): Promise<boolean> => {
    if (this.current) return this.current.promise;
    if (!this.ready) this.publish("error");
    return Promise.resolve(this.ready);
  };
  wantsResume = (): boolean => this.current?.resume === true && !this.current.cancelled;
  cancel = (): void => {
    if (this.current) {
      this.current.resume = false;
      this.current.cancelled = true;
      this.current.finish(false);
    }
    this.publish("idle");
  };
  stop = (): void => {
    this.current?.abort.abort();
    this.current?.release();
    this.current?.finish(false);
    this.current = undefined;
    this.publish("idle");
  };
}
