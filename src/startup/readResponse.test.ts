import { afterEach, expect, it, vi } from "vitest";
import { readStartupResponse } from "./readResponse";

afterEach(() => vi.unstubAllGlobals());

it("reports decoded streaming bytes against the manifest even with a compressed length header", async () => {
  const progress = vi.fn();
  vi.stubGlobal("window", { pianoStartup: { progress } });
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4, 5]));
        controller.close();
      }
    }),
    { headers: { "Content-Length": "2", "Content-Encoding": "gzip" } }
  );
  expect(await readStartupResponse(response, "/model", 5, 5)).toEqual(
    new Uint8Array([1, 2, 3, 4, 5])
  );
  expect(progress.mock.calls).toEqual([
    ["/model", 0, 5],
    ["/model", 2, 5],
    ["/model", 5, 5]
  ]);
});

it("cancels an oversized response before retaining its offending chunk", async () => {
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(6));
      },
      cancel
    })
  );
  await expect(readStartupResponse(response, "/model", 5, 5)).rejects.toThrow("exceeds budget");
  expect(cancel).toHaveBeenCalledOnce();
});
