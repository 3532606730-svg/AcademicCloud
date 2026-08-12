import SparkMD5 from "spark-md5";

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

export interface Md5Options {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  chunkSize?: number;
}

export async function calculateFileMd5(file: Blob, options: Md5Options = {}): Promise<string> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("MD5 chunk size must be a positive safe integer");
  }

  const spark = new SparkMD5.ArrayBuffer();
  const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));

  for (let index = 0; index < chunkCount; index += 1) {
    throwIfAborted(options.signal);
    const start = index * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    spark.append(await file.slice(start, end).arrayBuffer());
    options.onProgress?.((index + 1) / chunkCount);
  }

  throwIfAborted(options.signal);
  return hexToBase64(spark.end());
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
}

export function hexToBase64(hex: string): string {
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new TypeError("Expected a 16-byte hexadecimal MD5 digest");
  }

  let binary = "";
  for (let index = 0; index < hex.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return btoa(binary);
}
