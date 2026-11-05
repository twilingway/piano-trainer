const decoded = new Map<string, HTMLImageElement>();
export const isLessonImageDecoded = (url: string): boolean => decoded.has(url);

/** Browser resource readiness only: it never measures or advances musical time. */
export function decodeLessonImage(url: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (decoded.has(url)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      image.onload = image.onerror = null;
      signal.removeEventListener("abort", cancel);
      if (ready) decoded.set(url, image);
      resolve(ready);
    };
    const cancel = () => {
      finish(false);
      image.removeAttribute("src");
    };
    signal.addEventListener("abort", cancel, { once: true });
    image.decoding = "async";
    image.onerror = () => {
      finish(false);
    };
    image.onload = () => {
      void image.decode().then(
        () => {
          finish(!signal.aborted && image.naturalWidth > 0);
        },
        () => {
          finish(false);
        }
      );
    };
    image.src = url;
  });
}
