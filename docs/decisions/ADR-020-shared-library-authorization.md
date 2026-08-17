# ADR-020 — Shared Library Authorization and Membership

**Date:** 2026-08-18  
**Status:** Accepted

## Context

AcademicCloud now has explicit `account` and reserved `library` ownership domains, but a Library must not be implemented as a shared folder or as a contributor-account alias. Shared scholarly holdings need a separate authority boundary while Personal Research Overlay state remains private to each account.

## Decision

RF-LIBRARY01 introduces a concrete `libraries` entity backed by one immutable `library:<id>` ownership-domain row and an append-only `library_memberships` relation.

- Membership roles are exactly `manager | member` and are resolved from the authenticated server session plus the requested Library. Clients cannot set actor, role, owner domain, creator, uploader, or account authority.
- A Library creator is transactionally added as its initial manager. Creating a Library grants no access to any account-private Drive or Personal Research Overlay resource.
- Managers may add active accounts, change roles, and remove memberships through transactional service operations. SQLite guards protect the last effective active manager. Disabled/archived memberships remain durable but have no effective access; account state transitions that would remove a Library's last effective manager are rejected.
- Library read authority is membership-scoped. Global `owner` status is not a browse-all grant. Nonmembers, disabled members, nonexistent Libraries, and nonexistent/foreign holdings receive the same non-disclosing `not_found` behavior on Library content and membership reads.
- Holdings are read only when the scholarly Record/Artifact/Version and physical file are owned by the Library domain, the Artifact is attached, and the file is active. Responses omit domain IDs, object keys, provider details, uploader provenance, and Personal Research Overlay fields.
- Preview/download authorization reuses the existing storage adapter and Drive inline-preview policy only after the Library membership and Library-owned holding checks succeed. No object bytes are copied, moved, or deleted.

Library governance mutations use the existing fixed-column audit substrate with credential/content-free `libraries.*` events. Reading a shared holding is not turned into administrative research surveillance.

## Migration and rollback

Migration 014 is append-only. It adds Library metadata, memberships, indexes, membership/account-state guards, and the `library` audit vocabulary. It does not backfill resources, transfer ownership, modify object bytes, or alter production. Repository rollback is an ordinary code checkpoint against an untouched production schema; any future production migration must use a verified backup and an explicitly approved release window.

## Non-goals

This decision does not implement contribution/review, ownership promotion from account to Library, Trusted Contributor roles, shared catalog metadata, Library Tags, public/external membership, OCR, embeddings, retrieval, RAG, or global Owner access to private research state. Those remain separately scoped.
