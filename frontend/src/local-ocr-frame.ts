import type { PDFPageProxy, RenderTask } from "pdfjs-dist";
import { LOCAL_OCR_LIMITS } from "@academiccloud/compute-contracts";

export interface LocalOcrFrame { imageBase64: string; imageSha256: string; imageWidth: number; imageHeight: number; rotation: 0 | 90 | 180 | 270; previewUrl: string }
export interface PaintedOcrPage { capture(signal: AbortSignal): Promise<LocalOcrFrame>; isCurrent(): boolean }

export function boundedOcrSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("ocr_frame_unavailable");
  const scale = Math.min(LOCAL_OCR_LIMITS.maxWidth / width, LOCAL_OCR_LIMITS.maxHeight / height, Math.sqrt(LOCAL_OCR_LIMITS.maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob?.type === "image/png" ? resolve(blob) : reject(new Error("ocr_frame_unavailable")), "image/png"));
}
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ocr_frame_unavailable"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1]!) : reject(new Error("ocr_frame_unavailable"));
    reader.readAsDataURL(blob);
  });
}

const MAX_IMAGE_BUDGET_ATTEMPTS = 5;
// Even an uncompressed 8-bit RGBA bitmap plus PNG framing fits within 2 MiB.
const FALLBACK_IMAGE_PIXELS = 400_000;

/** Render a separate static PNG. Only book capture opts into fitting its encoded-byte budget. */
export async function captureOcrFrame(pdfPage: PDFPageProxy, rotation: number, isCurrent: () => boolean, signal: AbortSignal, fitImageBudget = false): Promise<LocalOcrFrame> {
  const assertCurrent = () => { if (signal.aborted || !isCurrent()) throw new Error("ocr_frame_changed"); };
  assertCurrent();
  if (![0, 90, 180, 270].includes(rotation)) throw new Error("ocr_frame_unavailable");
  const original = pdfPage.getViewport({ scale: 1, rotation });
  const target = boundedOcrSize(original.width, original.height);
  let scale = target.scale;
  const canvas = document.createElement("canvas");
  let task: RenderTask | undefined;
  const cancel = () => task?.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (let attempt = 0; attempt < (fitImageBudget ? MAX_IMAGE_BUDGET_ATTEMPTS : 1); attempt++) {
      assertCurrent();
      // Re-render vector content at the new scale; do not resample a display canvas.
      canvas.width = 0; canvas.height = 0;
      const imageWidth = Math.max(1, Math.floor(original.width * scale));
      const imageHeight = Math.max(1, Math.floor(original.height * scale));
      canvas.width = imageWidth; canvas.height = imageHeight;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("ocr_frame_unavailable");
      task = pdfPage.render({ canvas, canvasContext: context, viewport: pdfPage.getViewport({ scale, rotation }), background: "rgb(255,255,255)" });
      await task.promise;
      assertCurrent();
      let blob: Blob | null = await pngBlob(canvas);
      assertCurrent();
      task.cancel(); task = undefined; canvas.width = 0; canvas.height = 0;
      if (blob.size > LOCAL_OCR_LIMITS.maxImageBytes) {
        const encodedBytes = blob.size; blob = null;
        if (!fitImageBudget || attempt === MAX_IMAGE_BUDGET_ATTEMPTS - 1) throw new Error("ocr_image_too_large");
        const nextScale = scale * Math.min(0.85, Math.sqrt(LOCAL_OCR_LIMITS.maxImageBytes / encodedBytes) * 0.9);
        scale = attempt === MAX_IMAGE_BUDGET_ATTEMPTS - 2
          ? Math.min(nextScale, Math.sqrt(FALLBACK_IMAGE_PIXELS / (original.width * original.height)))
          : nextScale;
        continue;
      }
      const bytes = await blob.arrayBuffer();
      assertCurrent();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      assertCurrent();
      const imageSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const imageBase64 = await base64(blob);
      assertCurrent();
      return { imageBase64, imageSha256, imageWidth, imageHeight, rotation: rotation as LocalOcrFrame["rotation"], previewUrl: `data:image/png;base64,${imageBase64}` };
    }
    throw new Error("ocr_image_too_large");
  } finally {
    signal.removeEventListener("abort", cancel);
    task?.cancel(); canvas.width = 0; canvas.height = 0;
  }
}
