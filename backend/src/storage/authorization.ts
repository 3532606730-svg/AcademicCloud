const MIN_AUTHORIZATION_SECONDS = 30;
const MAX_AUTHORIZATION_SECONDS = 900;

export function assertAuthorizationDuration(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < MIN_AUTHORIZATION_SECONDS || seconds > MAX_AUTHORIZATION_SECONDS) {
    throw new Error(
      `authorization duration must be an integer from ${MIN_AUTHORIZATION_SECONDS} to ${MAX_AUTHORIZATION_SECONDS} seconds`,
    );
  }
}

export function assertContentLength(contentLength: number): void {
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new Error("contentLength must be a positive safe integer");
  }
}

export function assertMediaType(mediaType: string): void {
  if (
    mediaType.length < 3 ||
    mediaType.length > 255 ||
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(mediaType)
  ) {
    throw new Error("mediaType must be a valid MIME type without parameters");
  }
}

export function createContentDisposition(filename: string): string {
  const normalized = filename.normalize("NFC").trim();

  if (!normalized || normalized.length > 255 || /[\x00-\x1f\x7f]/.test(normalized)) {
    throw new Error("downloadFilename must be a non-empty safe filename of at most 255 characters");
  }

  const safeFilename = normalized.replace(/[\\/]/g, "_");
  const asciiFallback = safeFilename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/;/g, "_");
  const encoded = encodeURIComponent(safeFilename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
