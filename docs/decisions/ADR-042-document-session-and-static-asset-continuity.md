# ADR-042 — Document sessions and public asset continuity

Date: 2026-09-09
Status: Accepted for the Owner-authorized reassessment charter

Preview opens its shell before authorization completes. Source URLs remain memory-only, are obtained through the existing authorized endpoint, and never enter history or durable view preferences. Failed or closed requests cannot reopen a stale document. A temporary Details or Citation panel retains the current native reader instance; closing the document releases it. This preserves in-session page/zoom state without claiming native iframe load equals first-page paint or creating durable page identities.

Details, Citation, Catalog and Batch Naming are optional chunks. Their loading failure is isolated, recoverable and must not discard the Library or underlying reader. A resolved lazy component is reused so reopening does not show an unnecessary loading dialog.

Because open tabs may request older chunks after a release, nginx serves content-hashed public assets from /opt/academiccloud/public-assets/assets. The release operation publishes previous and candidate assets using each immutable artifact manifest before switching the application. Publication verifies hashes, rejects symlinks/unsafe names/collisions, never overwrites and never prunes. Only public build assets are eligible; source objects, credentials and private data remain outside this directory. Cache/security headers remain intact and gzip is scoped to this public route.

There is no database migration. Publish and validate the retained asset route before switching the application. If that static transition fails, restore its prior nginx configuration before exposing candidate HTML. Once the static transition succeeds, application rollback keeps the retained asset route so both previous and candidate pages can still load their chunks. Immutable caching applies to successful assets, not missing-asset error responses. Asset garbage collection is a separate measured maintenance decision: do not remove prior chunks merely because the current selector changed.

This does not solve durable reading positions, page notes or source replacement. Those require a separate source-generation/page-identity contract before implementation.
