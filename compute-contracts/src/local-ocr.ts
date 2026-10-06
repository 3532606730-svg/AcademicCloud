import type { OcrEngineCapabilities, OcrEnginePageResult } from "./ocr-engine.js";
import type { LocalOcrTransportFeature } from './local-ocr-book.js';

/** Account-private, explicitly paired device transport. Not the Catalog worker protocol. */
export const LOCAL_OCR_ROOT = "/api/reader/local-ocr";
export const LOCAL_OCR_PROBE_REQUEST_ID = "academiccloud-local-ocr-probe";
export const LOCAL_OCR_PROBE_TEXT = "AcademicCloud OCR 2026";
export const LOCAL_OCR_LIMITS = {
  maxImageBytes: 2 * 1024 * 1024,
  maxWidth: 2000,
  maxHeight: 2800,
  maxPixels: 5_600_000,
  maxDevicesPerAccount: 3,
  maxResultsPerAccount: 500,
  maxActiveRequests: 8,
  maxActiveRequestsPerAccount: 1,
  pairingLifetimeMs: 10 * 60_000,
  tokenLifetimeMs: 30 * 24 * 60 * 60_000,
  requestLifetimeMs: 5 * 60_000,
  claimLifetimeMs: 90_000,
  onlineWindowMs: 30_000,
} as const;

export interface LocalOcrDevice {
  id: string;
  label: string;
  capabilities: OcrEngineCapabilities;
  transportFeatures: LocalOcrTransportFeature[];
  createdAt: string;
  lastSeenAt: string | null;
  tokenExpiresAt: string;
  revokedAt: string | null;
  online: boolean;
}
export interface LocalOcrPairing { pairingCode: string; expiresAt: string }
export interface LocalOcrConnectInput {
  pairingCode: string;
  capabilities: OcrEngineCapabilities;
  transportFeatures?: LocalOcrTransportFeature[];
  /** Engine-reported test, not a trusted identity or accuracy certification. */
  probeResult: OcrEnginePageResult;
}
export interface LocalOcrConnection {
  deviceToken: string;
  tokenExpiresAt: string;
  device: LocalOcrDevice;
}
export interface LocalOcrRequestInput {
  clientRequestId: string;
  deviceId: string;
  resourceId: string;
  sourceId: string;
  physicalPage: number;
  imageBase64: string;
  imageWidth: number;
  imageHeight: number;
  rotation: 0 | 90 | 180 | 270;
}
export type LocalOcrJobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type LocalOcrFailure = "expired" | "engine_busy" | "engine_failed" | "invalid_result"
  | "source_changed" | "access_revoked" | "cancelled";
export interface LocalOcrJob {
  id: string;
  clientRequestId: string;
  deviceId: string;
  resourceId: string;
  sourceId: string;
  physicalPage: number;
  state: LocalOcrJobState;
  errorCode: LocalOcrFailure | null;
  resultId: string | null;
  createdAt: string;
  expiresAt: string;
}
export interface LocalOcrDeviceJob {
  id: string;
  attemptId: string;
  leaseExpiresAt: string;
  resourceId: string;
  sourceId: string;
  physicalPage: number;
  imageBase64: string;
  imageSha256: string;
  imageWidth: number;
  imageHeight: number;
  rotation: 0 | 90 | 180 | 270;
  capabilities: OcrEngineCapabilities;
}
export type LocalOcrCompletion = { jobId: string; attemptId: string } & (
  { result: OcrEnginePageResult; errorCode?: never }
  | { errorCode: "engine_busy" | "engine_failed" | "invalid_result"; result?: never }
);
export interface LocalOcrResult {
  id: string;
  deviceId: string;
  resourceId: string;
  sourceId: string;
  physicalPage: number;
  imageWidth: number;
  imageHeight: number;
  rotation: 0 | 90 | 180 | 270;
  imageSha256: string;
  /** Declared client-rendered source/page; bytes are not independently PDF-verified. */
  origin: "client_rendered_unverified";
  machine: OcrEnginePageResult;
  correctedText: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** Browser-declared book extent; Core does not decode or certify the PDF page count. */
export interface LocalOcrBookQuery {
  resourceId: string;
  sourceId: string;
  pageCount: number;
}
/** Latest retained machine result per physical page, without private text or image bytes. */
export interface LocalOcrBookPage {
  physicalPage: number;
  resultId: string;
  rotation: 0 | 90 | 180 | 270;
  status: LocalOcrResult['machine']['status'];
  truncated: boolean;
  hasCorrection: boolean;
  createdAt: string;
}
export interface LocalOcrBookProgress extends LocalOcrBookQuery {
  pages: LocalOcrBookPage[];
  quota: { used: number; limit: number; remaining: number };
  /** Only the requesting account's active request for this exact source. */
  activeJob: LocalOcrJob | null;
  accountBusy: boolean;
}
