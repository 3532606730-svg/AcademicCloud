# File Management API

All routes are under `/api/drive` and require the existing session cookie. Unsafe requests also require the exact configured `Origin`. The server always derives the account ID from the authenticated session; request schemas reject additional properties such as a client-supplied `ownerId`.

Resource JSON deliberately omits `ownerId`, `storageProvider`, and `objectKey`. The one exception is the opaque `key` inside a pending upload's signed form fields, because the browser must submit it to object storage.

## Routes

| Method and path | Request | Success |
| --- | --- | --- |
| `POST /api/drive/folders` | `{ name, parentId?: string \| null }` | `201 { folder }` |
| `GET /api/drive/entries?folderId=` | optional active folder ID; omitted means root | `{ folder, folders, files }` containing active direct children |
| `PATCH /api/drive/folders/:folderId` | at least one of `{ name, parentId }` | `{ folder }` |
| `DELETE /api/drive/folders/:folderId` | empty active folder only | `204` |
| `POST /api/drive/folders/:folderId/restore` | no body | `{ folder }` |
| `POST /api/drive/uploads` | `{ folderId?, displayName, mediaType, sizeBytes, checksum: { algorithm: "md5", value } }` | `201 { file, upload }` |
| `GET /api/drive/uploads?folderId=` | optional active folder ID; pending uploads only | `{ files }` |
| `POST /api/drive/uploads/:fileId/authorization` | no body; pending upload only | `{ upload }` |
| `POST /api/drive/uploads/:fileId/complete` | no body | `{ file }` |
| `GET /api/drive/files/:fileId/download?disposition=` | active file; `attachment` default or `inline` for safe preview types | `{ download }` |
| `PATCH /api/drive/files/:fileId` | at least one of `{ displayName, folderId }` | `{ file }` |
| `DELETE /api/drive/files/:fileId` | active file only | `204` (recycle bin) |
| `POST /api/drive/files/:fileId/restore` | deleted file only | `{ file }` |
| `GET /api/drive/recycle` | no body | `{ folders, files }` |
| `DELETE /api/drive/files/:fileId/permanent` | deleted or recoverable `purging` file only | `204` |

Folder and file IDs use 1-128 URL-safe characters. Names are NFC-normalized and trimmed, limited to 255 characters, and reject control characters, slash, backslash, `.` and `..`. MIME types have no parameters. Browser POST uploads are limited to 1 byte through 5 GiB. The checksum value is the canonical Base64 encoding of a 16-byte MD5 digest.

## Upload lifecycle

1. The browser computes the file MD5, then requests `POST /uploads`.
2. The server validates the active target folder and atomically creates a `pending_upload` record. This reserves the case-insensitive display name and stores the expected byte length, MIME type, and MD5.
3. The server returns a short-lived POST policy for one generated opaque key. The signed policy binds the key, exact byte length, MIME type, expected `Content-MD5`, private bucket, and `x-oss-forbid-overwrite=true`.
4. The browser submits all returned fields followed by the file field directly to OSS. The application server never buffers file bytes.
5. The browser calls `/complete`. The server uses provider `HEAD` metadata and activates the file only when size, MIME type, checksum algorithm, and checksum exactly match the pending record.

A missing object returns `upload_incomplete`; mismatched metadata returns `upload_metadata_mismatch`. Both leave the record pending. An expired authorization can be renewed for the same pending record and opaque key. Renewal first advances the record's durable revision and `updated_at`, then signs the new authorization. This prevents stale maintenance from removing a record while a fresh authorization is valid. If initial signing fails before an authorization is returned, the just-created pending reservation is synchronously removed.

The no-overwrite control assumes OSS bucket versioning is **not enabled or suspended**, because OSS documents that `x-oss-forbid-overwrite` is ignored when versioning is enabled or suspended. Production setup must verify this bucket property before accepting uploads.

## Delete and restore lifecycle

Soft deletion changes only logical metadata and preserves the object. Rename and move are also metadata-only. File restore checks that the target folder is active and re-verifies provider metadata before returning to active state.

Permanent deletion uses the durable transition `deleted → purging → purged`:

1. atomically record `purging` so restore can no longer race the provider request;
2. read provider metadata outside the SQLite transaction;
3. if the object exists, require its key, size, MIME type, checksum algorithm, and checksum to match before idempotently deleting the exact stored key;
4. mark `purged` only after confirmed deletion, or after a provider `HEAD` confirms that the object is already absent.

Provider failure or an unknown delete result leaves the record in `purging` and returns `storage_unavailable`; it never reopens restore after the remote result becomes uncertain. A process crash can also leave `purging`. Retrying the same endpoint or running the explicit reliability maintenance command resumes the state machine. Metadata mismatch preserves both object and record and returns `upload_metadata_mismatch`. Active files cannot be permanently deleted.

Every file write uses the persisted `(state, revision)` pair as a compare-and-swap token. Storage calls never run inside a SQLite transaction.

Folder deletion is deliberately non-recursive. Any active child folder or active/pending direct file causes `folder_not_empty`. Deleted descendants remain independently recoverable in the recycle bin, and restore requires the original parent to be active.

## Errors

Errors use `{ "error": "stable_code" }`:

- `400 invalid_request`
- `401 authentication_required`
- `403 invalid_origin`
- `404 not_found` (also used for cross-owner references to prevent enumeration)
- `409 name_conflict`, `folder_not_empty`, `invalid_move`, `invalid_state`, `upload_incomplete`, or `upload_metadata_mismatch`
- `413 payload_too_large`
- `415 unsupported_media_type`
- `429 rate_limit_exceeded`
- `503 storage_unavailable`
- `500 internal_error`

Provider and database error details are not returned to clients.

All API responses include `Cache-Control: no-store`, a deny-by-default API CSP, anti-framing, MIME-sniffing, referrer, permissions, and cross-origin isolation headers. `GET /api/health` is process liveness; `GET /api/ready` checks SQLite only and deliberately does not call object storage.
