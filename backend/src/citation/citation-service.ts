import type { AuthenticatedAccount } from "../auth/auth-service.js";
import type { CanonicalMetadataService } from "../metadata/metadata-service.js";
import { metadataDetailToCsl } from "./csl-mapping.js";
import { normalizeCitationRequest, type CitationResult } from "./citation.js";
import { renderCitation } from "./processor.js";

export class CitationService {
  constructor(private readonly metadata: Pick<CanonicalMetadataService, "getDetails">) {}

  generate(actor: AuthenticatedAccount, libraryId: string, fileId: string, value: unknown): CitationResult {
    const input = normalizeCitationRequest(value);
    // CanonicalMetadataService resolves effective active membership and holding
    // authority before any metadata reaches the formatter.
    const detail = this.metadata.getDetails(actor, libraryId, fileId);
    const normalized = metadataDetailToCsl(detail);
    const rendered = renderCitation(input.style, normalized.item, input.locators);
    return {
      ...rendered,
      completeness: normalized.completeness,
      materialClass: normalized.materialClass,
      locators: input.locators,
      cslItem: normalized.item,
    };
  }
}
