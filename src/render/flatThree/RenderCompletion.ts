/** Only a successful visible renderer submission can complete these waiters. */
export class RenderCompletion {
  private readonly waiting = new Set<(ready: boolean) => void>();
  private disposed = false;
  wait(signal?: AbortSignal): Promise<boolean> {
    if (this.disposed || signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = (ready: boolean) => {
        this.waiting.delete(finish);
        signal?.removeEventListener("abort", cancel);
        resolve(ready);
      };
      const cancel = () => {
        finish(false);
      };
      this.waiting.add(finish);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }
  finish(ready: boolean): void {
    for (const finish of [...this.waiting]) finish(ready);
  }
  dispose(): void {
    this.disposed = true;
    this.finish(false);
  }
}
