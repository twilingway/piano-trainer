export type HandModelStatus = "idle" | "loading" | "ready" | "error";

/** Only changed renderer status crosses into the UI; frames never trigger repeated updates. */
export class HandStatusSignal {
  private previous: HandModelStatus | undefined;
  private listener: ((status: HandModelStatus) => void) | undefined;
  update(status: HandModelStatus, notify: ((status: HandModelStatus) => void) | undefined): void {
    if (status === this.previous && notify === this.listener) return;
    this.previous = status;
    this.listener = notify;
    notify?.(status);
  }
}
