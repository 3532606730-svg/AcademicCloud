interface PreviewFile {
  mediaType: string | null;
  sizeBytes: number;
}

// Presentation hint matching Core's inline-preview policy. Core still checks
// authorization, source integrity, MIME type and size before issuing a URL.
const INLINE_PREVIEW_LIMITS: Readonly<Record<string, number>> = {
  "application/pdf": 512 * 1024 * 1024,
  "image/png": 128 * 1024 * 1024,
  "image/jpeg": 128 * 1024 * 1024,
  "image/gif": 128 * 1024 * 1024,
  "image/webp": 128 * 1024 * 1024,
  "text/plain": 16 * 1024 * 1024,
};

export function canPreviewFile(file: PreviewFile): boolean {
  const limit = file.mediaType ? INLINE_PREVIEW_LIMITS[file.mediaType] : undefined;
  return limit !== undefined && Number.isFinite(file.sizeBytes) && file.sizeBytes >= 0 && file.sizeBytes <= limit;
}
