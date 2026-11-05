// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { decodeLessonImage, isLessonImageDecoded } from "./lessonImageDecode";
afterEach(() => {
  vi.unstubAllGlobals();
});
function imageFixture() {
  const images: HTMLImageElement[] = [];
  const decodes: { resolve: () => void; reject: () => void }[] = [];
  vi.stubGlobal("Image", function MockImage() {
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: 512 });
    img.decode = () =>
      new Promise<void>((resolve, reject) => {
        decodes.push({
          resolve,
          reject: () => {
            reject(new Error("decode"));
          }
        });
      });
    images.push(img);
    return img;
  });
  return { images, decodes };
}
it("waits for actual decode after load and reuses only successful decoded images", async () => {
  const h = imageFixture(),
    abort = new AbortController();
  let done = false;
  const result = decodeLessonImage("decoded-one.webp", abort.signal).then((ok) => {
    done = true;
    return ok;
  });
  h.images[0]?.dispatchEvent(new Event("load"));
  await Promise.resolve();
  expect(done).toBe(false);
  h.decodes[0]?.resolve();
  expect(await result).toBe(true);
  expect(isLessonImageDecoded("decoded-one.webp")).toBe(true);
  expect(await decodeLessonImage("decoded-one.webp", abort.signal)).toBe(true);
  expect(h.images).toHaveLength(1);
});
it("does not cache failed decoding and permits a real retry", async () => {
  const h = imageFixture(),
    abort = new AbortController();
  const failed = decodeLessonImage("retry-image.webp", abort.signal);
  h.images[0]?.dispatchEvent(new Event("load"));
  h.decodes[0]?.reject();
  expect(await failed).toBe(false);
  expect(isLessonImageDecoded("retry-image.webp")).toBe(false);
  const retried = decodeLessonImage("retry-image.webp", abort.signal);
  h.images[1]?.dispatchEvent(new Event("load"));
  h.decodes[1]?.resolve();
  expect(await retried).toBe(true);
});
it("cleans pending network handlers on exit and ignores a late decode", async () => {
  const h = imageFixture(),
    abort = new AbortController();
  const result = decodeLessonImage("cancel-image.webp", abort.signal);
  h.images[0]?.dispatchEvent(new Event("load"));
  abort.abort();
  expect(await result).toBe(false);
  h.decodes[0]?.resolve();
  await Promise.resolve();
  expect(isLessonImageDecoded("cancel-image.webp")).toBe(false);
  expect(h.images[0]?.onerror).toBeNull();
  expect(h.images[0]?.onload).toBeNull();
  expect(h.images[0]?.hasAttribute("src")).toBe(false);
});
it("reports missing essential art rather than treating the error as ready", async () => {
  const h = imageFixture(),
    abort = new AbortController();
  const result = decodeLessonImage("missing-essential.webp", abort.signal);
  h.images[0]?.dispatchEvent(new Event("error"));
  expect(await result).toBe(false);
});
