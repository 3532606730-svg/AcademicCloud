# Layer 1 Frontend

The Layer 1 interface is a static React/Vite application that talks only to the same-origin AcademicCloud API. It never receives an account owner ID from user input, stores no session token, and does not bundle object-storage credentials.

## Local workflow

Install dependencies and start both workspaces from the repository root:

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Fastify process on port 3000. The backend development default uses `InMemoryStorageAdapter`; its `memory://` authorizations are deterministic test values rather than a browser-accessible byte service. Browser-direct upload success is therefore exercised with an injected/mock authorization in local UI tests, while real uploads require the configured private OSS adapter and its exact-origin CORS policy.

## Browser data flow

Authentication uses the server-managed `HttpOnly` session cookie. The application recovers `/api/auth/session` on startup, uses `credentials: same-origin`, and returns to the login view on a stable authentication error. It does not write account, session, signed URL, object key, upload policy, or file metadata to browser storage.

For each selected non-empty file, the browser:

1. calculates MD5 incrementally in 4 MiB slices and converts the 16-byte digest to canonical Base64;
2. reserves the display name and expected metadata through `POST /api/drive/uploads`;
3. appends every returned policy field, then the file, to `FormData`;
4. sends the multipart body directly to object storage with `XMLHttpRequest`, accepting only the policy-bound `201` response and reporting progress;
5. calls the completion route, which verifies storage metadata before activating the file.

An interrupted pending upload remains visible. The user can select the same local file to recompute and compare its metadata, renew the short-lived authorization, and retry, or retry completion after the bytes already reached storage. Dismissing a local progress card does not claim to cancel the durable pending reservation.

## File access and safety

Downloads and previews request short-lived signed URLs only when the user asks for them. Inline authorization is limited server-side and client-side to PDF, plain text, PNG, JPEG, GIF, and WebP. HTML, SVG, and unknown formats remain downloads. Preview elements use a no-referrer policy, and signed URLs are held only in component memory.

Rename and move change logical metadata only. The destination picker browses active folders without exposing or asking users to copy internal IDs. Ordinary delete is recoverable; permanent file deletion is available only from the recycle bin and requires confirmation.

## Verification

Run the frontend checks from the repository root:

```powershell
npm.cmd test --workspace @academiccloud/frontend
npm.cmd run typecheck --workspace @academiccloud/frontend
npm.cmd run build --workspace @academiccloud/frontend
```

Vitest/jsdom covers API error mapping, session/login behavior, folder navigation, direct-upload state and protocol details, MD5 chunking/cancellation, move selection, and recoverable deletion without contacting a network or cloud account.
