import type { LocalOcrFailure } from './local-ocr.js';
import type { OcrEngineCapabilities, OcrEnginePageResult } from './ocr-engine.js';

/** Device transport, independent from the OCR engine's image capabilities. */
export const LOCAL_OCR_BOOK_FEATURE = 'pdf_book_v1' as const;
export type LocalOcrTransportFeature = typeof LOCAL_OCR_BOOK_FEATURE;
export const LOCAL_OCR_BOOK_LIMITS = {
  maxPhysicalPages: 500,
  maxRetainedJobsPerAccount: 100,
  taskLifetimeMs: 7 * 24 * 60 * 60_000,
  leaseLifetimeMs: 90_000,
  sourceGrantSeconds: 300,
  maxSlicePages: 8,
  maxSliceStartMs: 45_000,
  sliceYieldMs: 2_000,
} as const;
export type LocalOcrBookState = 'queued' | 'running' | 'paused' | 'failed' | 'cancelled' | 'succeeded';
export interface LocalOcrBookStartInput {
  clientRequestId: string;
  deviceId: string;
  resourceId: string;
  sourceId: string;
  /** Declared by the browser; confirmed by the connector after PDF decoding. */
  pageCount: number;
}
export interface LocalOcrBookJob extends LocalOcrBookStartInput {
  id: string;
  state: LocalOcrBookState;
  errorCode: LocalOcrFailure | null;
  failedPhysicalPage: number | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  leaseExpiresAt: string | null;
  savedPhysicalPages: number[];
}
export interface LocalOcrBookClaim {
  job: LocalOcrBookJob;
  attemptId: string;
  leaseExpiresAt: string;
  pageCount: number;
  savedPhysicalPages: number[];
  capabilities: OcrEngineCapabilities;
}
export interface LocalOcrBookAttemptInput { bookId: string; attemptId: string }
export interface LocalOcrBookHeartbeatInput extends LocalOcrBookAttemptInput {
  /** Must match the frozen declaration before any page is accepted. */
  pageCount?: number;
}
export interface LocalOcrBookHeartbeat {
  active: true;
  leaseExpiresAt: string;
  savedPhysicalPages: number[];
}
export interface LocalOcrBookSourceGrant {
  resourceId: string;
  sourceId: string;
  url: string;
  expiresAt: string;
  sizeBytes: number;
  checksumAlgorithm: string;
  checksum: string;
  etag: string | null;
}
export interface LocalOcrBookPageInput extends LocalOcrBookAttemptInput {
  physicalPage: number;
  imageBase64: string;
  imageWidth: number;
  imageHeight: number;
  rotation: 0 | 90 | 180 | 270;
  /** requestId is `${bookId}-${physicalPage}`. */
  result: OcrEnginePageResult;
}
export interface LocalOcrBookPageReceipt {
  accepted: true;
  resultId: string;
  savedPhysicalPages: number[];
}
export type LocalOcrBookFinishInput = LocalOcrBookAttemptInput & (
  { pageCount: number; errorCode?: never; failedPhysicalPage?: never }
  | { errorCode: 'engine_busy' | 'engine_failed' | 'invalid_result'; failedPhysicalPage?: number; pageCount?: never }
);
export interface LocalOcrBookResumeInput { deviceId: string }
