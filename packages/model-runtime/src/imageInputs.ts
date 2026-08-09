import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { AgentImageInput } from "./index.js";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function detectedMimeType(bytes: Buffer): AgentImageInput["mimeType"] | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

export async function verifiedImageDataUrl(input: AgentImageInput): Promise<string> {
  if (!input.path || input.byteLength <= 0 || input.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image input has an invalid declared size");
  }
  const bytes = await readFile(input.path);
  if (bytes.byteLength !== input.byteLength) {
    throw new Error("Image input changed after approval (size mismatch)");
  }
  const mimeType = detectedMimeType(bytes);
  if (!mimeType || mimeType !== input.mimeType) {
    throw new Error("Image input content does not match its declared MIME type");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== input.sha256.toLowerCase()) {
    throw new Error("Image input changed after approval (digest mismatch)");
  }
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
