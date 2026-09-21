import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { clearViewPreferences, readViewPreference, useHistoryDialog, useWorkspaceLocation, writeViewPreference } from "./view-context.ts";
import type { FolderEntry } from "./api.ts";

afterEach(() => { window.sessionStorage.clear(); window.history.replaceState(null, "", "/"); });
const folder: FolderEntry = { id: "folder-a", name: "资料", parentId: null, state: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null, version: "v".repeat(43) };

it("restores folder/view on remount without putting research context in the URL", () => {
  const first = renderHook(() => useWorkspaceLocation("owner"));
  act(() => { first.result.current.setPath([folder]); first.result.current.setView("pending"); });
  first.unmount();
  const second = renderHook(() => useWorkspaceLocation("owner"));
  expect(second.result.current.view).toBe("pending");
  expect(second.result.current.path.map((entry) => entry.id)).toEqual(["folder-a"]);
  expect(window.location.search + window.location.hash).toBe("");
});

it("restores browser Back navigation and continues recording forward navigation", async () => {
  const { result } = renderHook(() => useWorkspaceLocation("owner"));
  act(() => result.current.setView("favorites"));
  act(() => window.history.back());
  await waitFor(() => expect(result.current.view).toBe("library"));
  act(() => result.current.setView("recycle"));
  act(() => window.history.back());
  await waitFor(() => expect(result.current.view).toBe("library"));
});

it("isolates saved search/preferences by account and clears them on sign-out", () => {
  writeViewPreference("owner", "search:library", { query: "私人研究问题" });
  expect(readViewPreference("member", "search:library", {})).toEqual({});
  expect(readViewPreference("owner", "search:library", {})).toEqual({ query: "私人研究问题" });
  clearViewPreferences("owner");
  expect(readViewPreference("owner", "search:library", {})).toEqual({});
  expect(window.location.href).not.toContain("私人");
});

it("ignores malformed storage and invalid workspace locations", () => {
  window.sessionStorage.setItem("academiccloud.view.v1:owner:workspace", "{broken");
  const { result } = renderHook(() => useWorkspaceLocation("owner"));
  expect(result.current.view).toBe("library");
  expect(result.current.path).toEqual([]);
});

it("a reading dialog consumes one Back step under StrictMode without persisting source URLs", async () => {
  window.history.replaceState({ academiccloudView: { accountId: "owner", view: "favorites", path: [] } }, "");
  const close = vi.fn();
  const hook = renderHook(() => useHistoryDialog(close), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
  expect(window.history.state.academiccloudDialog).toBeTypeOf("string");
  expect(JSON.stringify(window.history.state)).not.toContain("http");
  act(() => window.history.back());
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(window.history.state.academiccloudView.view).toBe("favorites");
  expect(window.history.state.academiccloudDialog).toBeUndefined();
  hook.unmount();
});

it("closing a reading dialog returns to its list context without an extra Back entry", async () => {
  window.history.replaceState({ academiccloudView: { accountId: "owner", view: "library", path: [folder] } }, "");
  const close = vi.fn();
  const hook = renderHook(() => useHistoryDialog(close));
  act(() => hook.result.current());
  hook.unmount();
  await waitFor(() => expect(window.history.state.academiccloudDialog).toBeUndefined());
  expect(close).toHaveBeenCalledTimes(1);
  expect(window.history.state.academiccloudView.path[0].id).toBe("folder-a");
});

it("blocks Back for a nested draft, then closes research and Preview in separate steps", async () => {
  const closePreview = vi.fn();
  const preview = renderHook(() => useHistoryDialog(closePreview));
  const previewId = window.history.state.academiccloudDialog;
  const closeResearch = vi.fn();
  const guard = vi.fn(() => false);
  const research = renderHook(() => useHistoryDialog(closeResearch, { canClose: guard }));
  const researchId = window.history.state.academiccloudDialog;
  const initialLength = window.history.length;
  for (let attempt = 1; attempt <= 2; attempt++) {
    act(() => window.history.back());
    await waitFor(() => expect(guard).toHaveBeenCalledTimes(attempt));
    expect(window.history.state.academiccloudDialog).toBe(researchId);
    expect(window.history.length).toBe(initialLength);
    expect(closeResearch).not.toHaveBeenCalled();
    expect(closePreview).not.toHaveBeenCalled();
  }
  guard.mockReturnValue(true);
  act(() => window.history.back());
  await waitFor(() => expect(closeResearch).toHaveBeenCalledTimes(1));
  expect(closePreview).not.toHaveBeenCalled();
  expect(window.history.state.academiccloudDialog).toBe(previewId);
  research.unmount();
  act(() => window.history.back());
  await waitFor(() => expect(closePreview).toHaveBeenCalledTimes(1));
  expect(window.history.state?.academiccloudDialog).toBeUndefined();
  preview.unmount();
});

it("consumes research history before a prepared Preview transition commits", async () => {
  const closeResearch = vi.fn();
  const research = renderHook(() => useHistoryDialog(closeResearch));
  const commit = vi.fn(() => expect(window.history.state?.academiccloudDialog).toBeUndefined());
  act(() => research.result.current.replaceWith(commit));
  expect(commit).not.toHaveBeenCalled();
  await waitFor(() => expect(closeResearch).toHaveBeenCalledTimes(1));
  expect(commit).toHaveBeenCalledTimes(1);
  research.unmount();
  const closePreview = vi.fn();
  const preview = renderHook(() => useHistoryDialog(closePreview));
  act(() => window.history.back());
  await waitFor(() => expect(closePreview).toHaveBeenCalledTimes(1));
  expect(window.history.state?.academiccloudDialog).toBeUndefined();
  preview.unmount();
});

it("reuses the underlying Preview step when opening a document from its research panel", async () => {
  const closePreview = vi.fn();
  const preview = renderHook(() => useHistoryDialog(closePreview));
  const previewId = window.history.state.academiccloudDialog;
  const closeResearch = vi.fn();
  const research = renderHook(() => useHistoryDialog(closeResearch));
  const commit = vi.fn(() => expect(window.history.state.academiccloudDialog).toBe(previewId));
  act(() => research.result.current.replaceWith(commit));
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  expect(closeResearch).toHaveBeenCalledOnce();
  expect(closePreview).not.toHaveBeenCalled();
  research.unmount();
  act(() => window.history.back());
  await waitFor(() => expect(closePreview).toHaveBeenCalledOnce());
  expect(window.history.state?.academiccloudDialog).toBeUndefined();
  preview.unmount();
});
