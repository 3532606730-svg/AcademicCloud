import {
  OCR_CONTRACT_VERSION,
  type OcrRequest,
  type OcrResponse,
} from "@academiccloud/compute-contracts";

export interface ReaderOcrBackendRequest {
  requestId: string;
  request: OcrRequest;
}

/**
 * Future OCR implementations must be injected behind this port. The Core
 * layer owns authorization and source-generation checks; an adapter never
 * receives a browser URL, object key, or storage credential.
 */
export interface ReaderOcrBackend {
  recognize(input: ReaderOcrBackendRequest): Promise<OcrResponse>;
}

/** Current fail-closed implementation: no bytes are read and no work is queued. */
export class UnavailableReaderOcrBackend implements ReaderOcrBackend {
  async recognize({ requestId, request }: ReaderOcrBackendRequest): Promise<OcrResponse> {
    return {
      contractVersion: OCR_CONTRACT_VERSION,
      requestId,
      source: { resourceId: request.resourceId, sourceId: request.sourceId },
      state: "disabled",
      pages: [],
      truncated: false,
      limits: { maxPages: 64, maxCharsPerPage: 0, maxTotalChars: 0 },
      errorCode: "ocr_deferred",
    };
  }
}
