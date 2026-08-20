# FE-DECOMP01 — Behavior-Preserving Frontend Decomposition

## Goal
Reduce the concentration of orchestration in `frontend/src/App.tsx` / `App.test.tsx` before Personal Research Workspace features substantially increase state complexity.

## Scope
Extract coherent boundaries such as:

- AuthShell;
- Navigation/AppShell;
- LibraryWorkspace;
- UploadManager;
- ActivityCenter;
- PreviewController;
- AdminShell;

using existing React/context/hooks patterns.

## Non-goals
No React rewrite, router migration, Redux/state-library introduction, design-system rewrite, visual redesign, API behavior change or backend change.

## Acceptance
Existing browser/component behavior remains identical; focused modules have clear ownership; `App.tsx` becomes orchestration rather than implementation; tests are redistributed without reducing real coverage.
