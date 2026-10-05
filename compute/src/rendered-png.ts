import { inflateSync } from "node:zlib";
import { SUGGESTION_LIMITS } from "./suggestion.js";
export class RenderedPngError extends Error { constructor(readonly code: "input_invalid" | "input_limit") { super(code); } }

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

/** Rendered non-indexed, static, non-interlaced PNG only, with at most 8 bits per channel. */
export function inspectRenderedPng(image: Uint8Array): { width: number; height: number } {
  const bytes = Buffer.from(image.buffer, image.byteOffset, image.byteLength);
  const fail = (): never => { throw new RenderedPngError("input_invalid"); };
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail();
  let offset = 8;
  let width = 0;
  let height = 0;
  let rowBytes = 0;
  let color = 0;
  const compressed: Uint8Array[] = [];
  let hasData = false;
  let dataEnded = false;
  const seen = new Set<string>();
  const ancillaryLengths: Readonly<Record<string, number>> = { sRGB: 1, gAMA: 4, cHRM: 32, pHYs: 9, sBIT: 4, bKGD: 6, tRNS: 256 };
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail();
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail();
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/u.test(type)
      || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) fail();
    if (offset === 8 && type !== "IHDR") fail();
    if (["acTL", "fcTL", "fdAT"].includes(type)) fail();
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) fail();
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      if (width < 15 || height < 15) fail();
      if (width > SUGGESTION_LIMITS.maxRenderedPageWidthPixels
        || height > SUGGESTION_LIMITS.maxRenderedPageHeightPixels
        || width * height > SUGGESTION_LIMITS.maxRenderedPagePixels
        || width * height * 4 > SUGGESTION_LIMITS.maxRenderedBitmapBytes) {
        throw new RenderedPngError("input_limit");
      }
      const depth = bytes[offset + 16]!;
      color = bytes[offset + 17]!;
      // Indexed PNG needs palette-index validation after reversing filters. Keep
      // this first rendered-page adapter outside that general-decoder scope.
      if (!({ 0: [1, 2, 4, 8], 2: [8], 4: [8], 6: [8] } as Record<number, number[]>)[color]?.includes(depth)
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) fail();
      const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[color]!;
      rowBytes = 1 + Math.ceil(width * channels * depth / 8);
    } else if (type === "IDAT") {
      if (dataEnded) fail();
      hasData ||= length > 0;
      compressed.push(bytes.subarray(offset + 8, end - 4));
    } else if (type === "IEND") {
      if (length !== 0 || !hasData || end !== bytes.length) fail();
      // Canvas's decoder can tolerate truncated/corrupt pixels. Validate the
      // non-interlaced rendered scanlines with a bounded inflate before native.
      const encoded = Buffer.concat(compressed);
      // Node's info option returns buffer + engine (its TS declaration currently
      // describes only the default Buffer return). bytesWritten is consumed input.
      const inflated = inflateSync(encoded, { info: true, maxOutputLength: rowBytes * height }) as unknown as {
        buffer: Buffer; engine: { bytesWritten: number };
      };
      if (inflated.engine.bytesWritten !== encoded.length) fail();
      const pixels = inflated.buffer;
      if (pixels.length !== rowBytes * height) fail();
      for (let row = 0; row < height; row += 1) if (pixels[row * rowBytes]! > 4) fail();
      return { width, height };
    } else {
      // Compressed metadata and EXIF are outside rendered-page input: no hidden
      // orientation or independently expanding native metadata allocations.
      if (hasData || seen.has(type)) fail();
      if (type === "PLTE") {
        if (length === 0 || length > 768 || length % 3 !== 0) fail();
      } else if (!(type in ancillaryLengths) || length === 0 || length > ancillaryLengths[type]!) fail();
    }
    if (type !== "IDAT" && hasData) dataEnded = true;
    seen.add(type);
    offset = end;
  }
  return fail();
}
