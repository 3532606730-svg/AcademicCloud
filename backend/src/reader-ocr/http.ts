import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { OCR_CONTRACT_VERSION, OCR_MAX_PAGE_SPAN, OCR_PAGE_MAX, OCR_PAGE_MIN, parseOcrRequest, type OcrRequest } from "@academiccloud/compute-contracts";
import type { ReaderOcrBackend } from "./port.js";

const id = { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" } as const;
const page = { type: "integer", minimum: OCR_PAGE_MIN, maximum: OCR_PAGE_MAX } as const;
const selection = {
  type: "object", additionalProperties: false, required: ["kind"],
  properties: { kind: { enum: ["single", "range"] }, physicalPage: page, startPhysicalPage: page, endPhysicalPage: page },
} as const;

async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") await reply.code(415).send({ error: "unsupported_media_type" });
}

export async function registerReaderOcrHttp(app: FastifyInstance, backend: ReaderOcrBackend): Promise<void> {
  app.get("/api/reader/ocr/capabilities", { preHandler: app.authenticate }, async () => ({
    contractVersion: OCR_CONTRACT_VERSION,
    enabled: false,
    state: "disabled" as const,
    errorCode: "ocr_deferred" as const,
    selections: ["single", "range"],
    maxPageSpan: OCR_MAX_PAGE_SPAN,
    pageAddress: "physical-one-based",
  }));

  app.post<{ Body: OcrRequest }>("/api/reader/ocr/requests", {
    preHandler: app.authenticate,
    preValidation: requireJson,
    bodyLimit: 16 * 1024,
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["resourceId", "sourceId", "selection"],
        properties: { resourceId: id, sourceId: id, selection, languageHints: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 64 } } },
      },
    },
  }, async (request, reply) => {
    // Keep the endpoint reserved and fail closed until an authorized source
    // resolver and OCR provider are approved. No request is dispatched here.
    let parsed: OcrRequest;
    try {
      parsed = parseOcrRequest(request.body);
    } catch {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const response = await backend.recognize({ requestId: `deferred-${Date.now().toString(36)}`, request: parsed });
    return reply.code(503).send(response);
  });
}
