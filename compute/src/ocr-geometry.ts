import { OCR_ENGINE_MAX_LINE_BOXES, type OcrEngineLineBox } from "@academiccloud/compute-contracts";

import { SUGGESTION_LIMITS } from "./suggestion.js";

/** Image-normalized geometry only; these are never PDF page coordinates. */
export type OcrLineGeometry =
  | { status: "available" | "limited"; imageWidth: number; imageHeight: number; lineBoxes: OcrEngineLineBox[] }
  | { status: "unavailable" | "invalid" };

function clean(text: string): string {
  return text.toWellFormed().normalize("NFC").replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "");
}

function scalarBoundary(text: string, offset: number): boolean {
  return offset === 0 || offset === text.length
    || !(text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff
      && text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff);
}

/**
 * Normalize text once and remap spans through that exact transformation. If a
 * Unicode/CRLF transformation crosses a box boundary, omit all geometry rather
 * than guessing. A cut through a line drops its box, never highlights the whole
 * physical line for a partial text span. Text remains useful on geometry loss.
 */
export function prepareOcrGeometry(
  rawText: string,
  value: unknown,
  maxTextUnits: number,
  expectedImage?: { width: number; height: number },
): { text: string; truncated: boolean; geometry: OcrLineGeometry } {
  const normalized = clean(rawText);
  const cleaned = normalized.trim();
  let text = cleaned.slice(0, maxTextUnits);
  if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
  const result = { text, truncated: cleaned.length > text.length };
  const invalid = (): typeof result & { geometry: OcrLineGeometry } => ({ ...result, geometry: { status: "invalid" } });
  if (value === undefined) return { ...result, geometry: { status: "unavailable" } };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (input.status === "unavailable" || input.status === "invalid") {
    return Object.keys(input).length === 1 ? { ...result, geometry: { status: input.status } } : invalid();
  }
  if ((input.status !== "available" && input.status !== "limited")
    || Object.keys(input).some((key) => !["status", "imageWidth", "imageHeight", "lineBoxes"].includes(key))) return invalid();
  const { imageWidth, imageHeight } = input;
  if (typeof imageWidth !== "number" || !Number.isSafeInteger(imageWidth) || imageWidth < 1
    || imageWidth > SUGGESTION_LIMITS.maxRenderedPageWidthPixels
    || typeof imageHeight !== "number" || !Number.isSafeInteger(imageHeight) || imageHeight < 1
    || imageHeight > SUGGESTION_LIMITS.maxRenderedPageHeightPixels
    || imageWidth * imageHeight > SUGGESTION_LIMITS.maxRenderedPagePixels
    || (expectedImage && (imageWidth !== expectedImage.width || imageHeight !== expectedImage.height))
    || !Array.isArray(input.lineBoxes) || input.lineBoxes.length > OCR_ENGINE_MAX_LINE_BOXES) return invalid();

  const leftTrim = normalized.length - normalized.trimStart().length;
  const lineBoxes: OcrEngineLineBox[] = [];
  let previousEnd = 0;
  let normalizedPrefix = "";
  let limited = input.status === "limited";
  for (const entry of input.lineBoxes) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return invalid();
    const box = entry as Record<string, unknown>;
    if (Object.keys(box).length !== 6 || Object.keys(box).some((key) => !["start", "end", "x", "y", "width", "height"].includes(key))) return invalid();
    const { start, end, x, y, width, height } = box;
    if (typeof start !== "number" || !Number.isSafeInteger(start) || start < previousEnd
      || typeof end !== "number" || !Number.isSafeInteger(end) || end <= start || end > rawText.length
      || !scalarBoundary(rawText, start) || !scalarBoundary(rawText, end)
      || [x, y, width, height].some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1)
      || typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number"
      || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return invalid();
    normalizedPrefix += clean(rawText.slice(previousEnd, start));
    const mappedStart = normalizedPrefix.length - leftTrim;
    normalizedPrefix += clean(rawText.slice(start, end));
    const mappedEnd = normalizedPrefix.length - leftTrim;
    // Whole-result trim may discard surrounding whitespace, never recognized text.
    const clippedStart = Math.max(0, mappedStart);
    const clippedEnd = Math.min(cleaned.length, mappedEnd);
    if (clippedEnd > clippedStart && clippedEnd <= text.length) {
      lineBoxes.push({ start: clippedStart, end: clippedEnd, x, y, width, height });
    } else {
      limited = true;
    }
    previousEnd = end;
  }
  normalizedPrefix += clean(rawText.slice(previousEnd));
  if (normalizedPrefix !== normalized) return invalid();
  if (!text) return { ...result, geometry: { status: "unavailable" } };
  return { ...result, geometry: { status: limited ? "limited" : "available", imageWidth, imageHeight, lineBoxes } };
}
