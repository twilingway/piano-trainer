import { startupProgress } from "./bridge";

/** Read the existing response once; the manifest's decoded byte size is compression independent. */
export async function readStartupResponse(
  response: Response,
  url: string,
  maximum: number,
  expected?: number
): Promise<Uint8Array> {
  startupProgress(url, 0, expected);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maximum) throw new Error("keyboard88 response exceeds budget");
    startupProgress(url, bytes.length, expected);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new Error("keyboard88 response exceeds budget");
      }
      chunks.push(value);
      startupProgress(url, length, expected);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
