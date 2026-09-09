# Batch Cataloguing: local evidence and v2 review

The evidence ZIP remains v1. Results v2 and immutable review plans follow [ADR-041](../decisions/ADR-041-vnext-review-plans-and-search-projection.md); legacy v1 results remain accepted conservatively.

Batch Cataloguing is an Owner-only, human-mediated roundtrip. AcademicCloud does not call an external AI service and remains usable without one.

```text
Library resources
  -> private local-export request
  -> bounded native-text/selective-PaddleOCR ZIP
  -> external review
  -> strict results JSON
  -> preview
  -> explicit Owner selection
  -> canonical metadata/display-filename apply
```

## Export

In the Library, select PDFs, choose **Batch Cataloguing**, and start local evidence export. The browser obtains a private export request from Core and sends it to the Catalog Bridge on this computer. The bridge exports bounded evidence independently of the main inference worker; do not activate inference merely to export. The bridge must be running and the browser must permit the site's connection to loopback. Progress, cancellation and the finished ZIP are available in the dialog.

For the explicit manual CLI fallback, retain the private request locally as:

```text
academiccloud-catalog-export-request-<batch-id>.json
```

This request contains a 24-hour, in-memory, exact-resource read capability. It is private: do not send it to an external reviewer. A Core restart invalidates it. It authorizes only the listed `resourceId`/`sourceIdentity` pairs; every per-resource source authorization is rechecked against live state and lasts at most 15 minutes.

Run the Local Compute exporter without enabling the main AI worker:

```bash
npm run catalog:export --workspace @academiccloud/compute -- \
  --request /path/academiccloud-catalog-export-request-<batch-id>.json \
  --output /path/academiccloud-catalog-batch-<batch-id>.zip
```

An immutable Compute release can use its compiled entry point instead:

```bash
node dist/catalog-batch-export.js --request /path/request.json --output /path/academiccloud-catalog-batch-<batch-id>.zip
```

The output path must not already exist. The exporter never overwrites it.

## Evidence package contract

The ZIP contains only JSON:

```text
manifest.json
review-contract.json
resources/<resource-id>.json
```

It contains no PDF bytes or rendered page images. V1 inspects at most the first 15 and last 5 pages (20 pages total), keeps at most 16,384 text characters per page and 262,144 characters per resource, uses native PDF text when usable, and invokes selective PaddleOCR only for inspected pages without usable native text. It never performs whole-document OCR.

`manifest.json` is `academiccloud.catalog-batch.v1`. Each resource is bound by:

- immutable `resourceId`;
- the existing source identity (`sourceFingerprint`, file revision, stored checksum identity);
- current display filename;
- media type and byte size;
- page count and exact evidence JSON path.

`review-contract.json` supplies the exact `sourceManifestSha256` that the results file must echo. The digest is over the canonical manifest representation; do not recalculate it from pretty-printed file bytes.

## Rules for the external reviewer

1. Never modify `resourceId` or any `sourceIdentity` field.
2. Identify bibliography only from the supplied evidence.
3. Return `disposition: "unknown"` and `bibliographic: null` when evidence is insufficient.
4. Preserve contributor roles and their literal responsibility wording (`roleLabel`).
5. Do not invent authors, dates, editions, publishers, languages, identifiers, or responsibility roles.
6. Do not provide a target filename. AcademicCloud applies `academiccloud.filename.v1` server-side.
7. Results remain untrusted suggestions until the Owner previews, selects, and confirms them.
8. Copy the complete `manifest.json` object into `sourceManifest`; do not reorder resources by title or filename and do not omit a resource result.

The external reviewer must return exactly one JSON document named:

```text
academiccloud-catalog-results-<batch-id>.json
```

Example (abbreviated to one resource):

```json
{
  "schemaVersion": "academiccloud.catalog-results.v1",
  "batchId": "COPY_FROM_MANIFEST",
  "sourceManifestSha256": "COPY_FROM_REVIEW_CONTRACT",
  "sourceManifest": {
    "schemaVersion": "academiccloud.catalog-batch.v1",
    "batchId": "COPY_FROM_MANIFEST",
    "createdAt": "COPY_FROM_MANIFEST",
    "namingPolicyVersion": "academiccloud.filename.v1",
    "evidencePolicy": {
      "firstPages": 15,
      "lastPages": 5,
      "maxPages": 20,
      "maxCharactersPerPage": 16384,
      "maxCharactersPerResource": 262144,
      "selectiveOcr": true,
      "includesSourceBytes": false
    },
    "resources": ["COPY THE COMPLETE RESOURCE OBJECT FROM manifest.json"]
  },
  "results": [
    {
      "resourceId": "COPY_FROM_MANIFEST",
      "sourceIdentity": "COPY THE COMPLETE sourceIdentity OBJECT",
      "disposition": "review",
      "bibliographic": {
        "canonicalTitle": "蒙古秘史",
        "materialClass": "primary_source_modern_edition",
        "contributors": [
          { "label": "余大钧", "role": "annotator", "roleLabel": "译注" }
        ],
        "publication": { "publicationDate": "2005" },
        "carrierEdition": {},
        "sourceEdition": {},
        "responsibilityStatement": "余大钧译注",
        "filenameStyle": "cjk_book"
      },
      "confidence": 96,
      "notes": null
    }
  ]
}
```

The actual `sourceManifest.resources` value must be the array of resource objects, not the explanatory string shown in this abbreviated example.

Allowed external dispositions are `auto`, `review`, and `unknown`. External `auto` becomes REVIEW: it conveys no selection or write authority. Nothing is preselected. UNKNOWN has no applicable proposal unless the Owner supplies an explicit corrected proposal with evidence and reviews it. Stale identities, internal test resources and collisions are excluded. Confidence is the external producer's uncalibrated self-rating; it is neither a probability nor permission to apply.

Prefer `academiccloud.catalog-results.v2`. Each resource carries allowlisted field operations: set replaces an explicit value, clear intentionally removes an optional value, and an omitted field preserves current data. Preview shows before/after values and authority changes for every operation. Acknowledging evidence is mandatory; overwriting existing human facts and clearing values require their respective acknowledgements. Legacy v1 is translated conservatively and cannot silently clear omitted fields. Use the exported review contract and the strict shared schema for complete field names and shapes.

## Filename policy

AcademicCloud deterministically projects display filenames and never changes `objectKey`:

- CJK modern monograph: `《书名》（作者，年份）.pdf`
- historical source/modern edition: `《书名》（责任者+责任方式，年份）.pdf`
- CJK article/chapter-like work: `作者：《论文名》（年份）.pdf`
- foreign-language book: `Title (Author, Year).pdf`

For historical sources, modern publication and historical source edition are separate. Source-edition publisher/imprint information has priority over a holding institution in source naming. Verbose provenance and edition narratives stay in details instead of being copied into filenames. The server uses the merged post-review metadata to derive a name, so omitted fields retain the same meaning in Preview and Apply.

Missing title, responsibility, or date yields `NO_RENAME`; there are no invented placeholders. Invalid filesystem punctuation is conservatively mapped to Unicode full-width equivalents. AcademicCloud never adds `_2`, `_3`, `_final`, or similar suffixes.

Within the same folder, same-name/same-content is `EXACT_DUPLICATE`; same-name/different-content is `NAME_COLLISION`. ASCII case variants collide. Neither overwrites the existing resource; another folder does not cause a false collision.

## Import and apply

The results file is strict untrusted input. Core rejects unknown keys where specified, wrong schema/batch/digest, duplicate IDs, path traversal, uncontrolled enum values, excessive arrays/text, internal contributor/authority IDs, and any resource/source identity mismatch.

Preview performs no persistent mutation. It shows current/proposed filenames, every field operation, evidence, confidence, identity/collision status and required acknowledgements in pages of 25 items. Core retains an immutable, actor/Library-bound plan for at most 30 minutes. A restart, expiry or eviction requires a fresh Preview; no stale plan can apply.

The Preview body is limited to 8 MiB. Apply sends the plan ID, at most 500 selected item versions and acknowledgements, with a separate 256 KiB limit; it never resends the results document. Core holds at most four plans within a conservative 32 MiB memory budget. An oversized plan requires a smaller batch.

Apply revalidates source, metadata, authority, folder and collisions in each selected item's transaction. It preserves object keys and stable identities, records normal `libraries.metadata_update` audit activity, and establishes explicitly adopted fields as human authority. Migration036 adds human contributor-collection authority, so clearing/removing/reordering a list cannot be undone by a later AI retry. Existing contributor identities and authority links are preserved where applicable.

Completed items remain completed during retries; replay of a completed item returns its original result without another write. Partial failure leaves remaining items visible for review. Refresh expired/stale plans and inspect the changed values before trying again.

If an existing canonical record has material-type-specific fields, an incompatible external `materialType` proposal cannot discard them. AcademicCloud preserves the current material type and its type-specific fields while still allowing separately safe, explicitly selected bibliographic changes.
