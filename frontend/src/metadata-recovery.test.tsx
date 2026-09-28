import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type {
  AcademicCloudApi, DerivedMetadataJob, LibraryHolding, LibrarySummary, MetadataRecoveryItem, MetadataRecoveryResult,
} from "./api.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import { MetadataRecoveryDialog } from "./metadata-recovery.tsx";

const LIBRARY: LibrarySummary = {
  id: "library-1", name: "Library", role: "manager", isDefault: true, createdAt: "2026-09-01T00:00:00.000Z",
};
function holding(id: string): LibraryHolding {
  return {
    recordId: `record-${id}`, recordLabel: `${id}.pdf`, canonicalTitle: null, authorLabels: [],
    artifactId: `artifact-${id}`, versionId: `version-${id}`, version: "v".repeat(43),
    file: { id, displayName: `${id}.pdf`, mediaType: "application/pdf", sizeBytes: 10, updatedAt: "2026-09-01T00:00:00.000Z" },
  };
}
function job(id: string, state: DerivedMetadataJob["state"] = "failed"): DerivedMetadataJob {
  return {
    id: `job-${id}`, kind: "metadata_suggestion", resourceId: id, state, progress: 0, attempts: 2,
    resultRef: null, errorCode: state === "failed" ? "compute_source_unavailable" : null,
    createdAt: "2026-09-01T00:00:00.000Z", startedAt: null, finishedAt: null, deadlineAt: "2026-09-30T00:00:00.000Z",
  };
}
function item(id: string, status: MetadataRecoveryItem["status"] = "missing"): MetadataRecoveryItem {
  return { fileId: id, sourceVersion: `source-${id}`, status, job: status === "missing" ? null : job(id) };
}
function props(api: AcademicCloudApi, holdings = [holding("one")]) {
  return { api, library: LIBRARY, holdings, onClose: vi.fn(), onSettled: vi.fn() };
}
function surface(input: ReturnType<typeof props>) {
  return <LanguageProvider><MetadataRecoveryDialog {...input} /></LanguageProvider>;
}
beforeEach(() => {
  window.localStorage.setItem("academiccloud.language", "en");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value: function close(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});
afterEach(() => { window.localStorage.removeItem("academiccloud.language"); vi.restoreAllMocks(); });

it("checks only the explicit selection and submits eligible reviewed snapshots once", async () => {
  const states = [item("missing"), item("retry", "retryable"), item("done", "succeeded"), item("text", "unsupported")];
  const get = vi.fn().mockResolvedValue(states);
  const results: MetadataRecoveryResult[] = [
    { fileId: "missing", status: "queued", job: job("missing", "queued") },
    { fileId: "retry", status: "retried", job: job("retry", "queued") },
  ];
  const recover = vi.fn().mockResolvedValue(results);
  const list = vi.fn();
  const input = props({ getLibraryMetadataRecovery: get, recoverLibraryMetadata: recover, listLibraryHoldings: list } as unknown as AcademicCloudApi,
    states.map((state) => holding(state.fileId)));
  render(surface(input));
  const submit = await screen.findByRole("button", { name: "Queue 2 tasks" });
  expect(get).toHaveBeenCalledWith(LIBRARY.id, ["missing", "retry", "done", "text"], expect.any(AbortSignal));
  expect(list).not.toHaveBeenCalled();
  expect(recover).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: "Select done.pdf" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Select text.pdf" })).toBeDisabled();
  expect(screen.getByText("Completed — existing result retained")).toBeInTheDocument();
  expect(screen.getByText("AI cataloguing is available for PDFs")).toBeInTheDocument();
  await userEvent.setup().dblClick(submit);
  expect(recover).toHaveBeenCalledTimes(1);
  expect(recover).toHaveBeenCalledWith(LIBRARY.id, [
    { fileId: "missing", sourceVersion: "source-missing", expectedJobId: null, expectedAttempts: null },
    { fileId: "retry", sourceVersion: "source-retry", expectedJobId: "job-retry", expectedAttempts: 2 },
  ]);
  expect(await screen.findByText("Added to queue")).toBeInTheDocument();
  expect(screen.getByText("Retry added to queue")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Queue/ })).not.toBeInTheDocument();
  expect(input.onSettled).toHaveBeenCalledWith(results);
});

it("honors deselection and keeps the original selection and result after parent rerenders", async () => {
  const get = vi.fn().mockResolvedValue([item("one"), item("two")]);
  const recover = vi.fn().mockResolvedValue([{ fileId: "one", status: "queued", job: job("one", "queued") }]);
  const input = props({ getLibraryMetadataRecovery: get, recoverLibraryMetadata: recover } as unknown as AcademicCloudApi, [holding("one"), holding("two")]);
  const view = render(surface(input));
  await screen.findByRole("button", { name: "Queue 2 tasks" });
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Select two.pdf" }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Queue 1 tasks" }));
  await screen.findByText("Added to queue");
  view.rerender(surface({ ...input, holdings: [holding("replacement")] }));
  expect(screen.getByText("one.pdf")).toBeInTheDocument();
  expect(screen.getByText("Added to queue")).toBeInTheDocument();
  expect(screen.queryByText("replacement.pdf")).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
  expect(recover.mock.calls[0]![1]).toHaveLength(1);
});

it("handles an unknown submission outcome with read-only refresh and no raw error leak", async () => {
  const get = vi.fn().mockResolvedValueOnce([item("one")]).mockResolvedValueOnce([{ ...item("one", "active"), job: job("one", "queued") }]);
  const recover = vi.fn().mockRejectedValue(new Error("SECRET signed capability raw failure"));
  const input = props({ getLibraryMetadataRecovery: get, recoverLibraryMetadata: recover } as unknown as AcademicCloudApi);
  render(surface(input));
  await userEvent.setup().click(await screen.findByRole("button", { name: "Queue 1 tasks" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Submission could not be confirmed");
  expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh status" }));
  expect(await screen.findByText("Already queued — retained")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Queue/ })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Select one.pdf" })).toBeDisabled();
  expect(recover).toHaveBeenCalledTimes(1);
  expect(input.onSettled).toHaveBeenCalledWith(null);
});

it("fails closed on a status read error and permits a new read without writing", async () => {
  const get = vi.fn().mockRejectedValueOnce(new Error("SECRET infrastructure error")).mockResolvedValueOnce([item("one")]);
  const recover = vi.fn();
  render(surface(props({ getLibraryMetadataRecovery: get, recoverLibraryMetadata: recover } as unknown as AcademicCloudApi)));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be checked");
  expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Queue 0 tasks" })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh status" }));
  expect(await screen.findByRole("button", { name: "Queue 1 tasks" })).toBeEnabled();
  expect(recover).not.toHaveBeenCalled();
});

it("rejects incomplete preflight responses without authorizing a partial submission", async () => {
  const get = vi.fn().mockResolvedValue([item("one")]);
  const recover = vi.fn();
  render(surface(props({ getLibraryMetadataRecovery: get, recoverLibraryMetadata: recover } as unknown as AcademicCloudApi, [holding("one"), holding("two")])));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be checked");
  expect(screen.getByRole("button", { name: "Queue 0 tasks" })).toBeDisabled();
  expect(recover).not.toHaveBeenCalled();
});

it("retains and explains every ineligible result without scheduling work", async () => {
  const states: MetadataRecoveryItem[] = [
    item("active", "active"), item("success", "succeeded"), item("review", "review_available"),
    item("changed", "source_changed"), item("failed", "not_retryable"), item("other", "requester_changed"), item("excluded", "excluded"),
  ];
  const recover = vi.fn();
  render(surface(props({ getLibraryMetadataRecovery: vi.fn().mockResolvedValue(states), recoverLibraryMetadata: recover } as unknown as AcademicCloudApi,
    states.map((state) => holding(state.fileId)))));
  expect(await screen.findByText("No tasks are selected for recovery. Check the status shown for each resource.")).toBeInTheDocument();
  expect(screen.getByText("Information available for review — retained")).toBeInTheDocument();
  expect(screen.getByText("Source changed — open resource details to review")).toBeInTheDocument();
  expect(screen.getByText("This failure needs review in resource details")).toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
  expect(recover).not.toHaveBeenCalled();
});

it("reconciles an accepted job after the window closes during submission", async () => {
  let resolve!: (results: MetadataRecoveryResult[]) => void;
  const recover = vi.fn().mockReturnValue(new Promise<MetadataRecoveryResult[]>((done) => { resolve = done; }));
  const input = props({ getLibraryMetadataRecovery: vi.fn().mockResolvedValue([item("one")]), recoverLibraryMetadata: recover } as unknown as AcademicCloudApi);
  const view = render(surface(input));
  await userEvent.setup().click(await screen.findByRole("button", { name: "Queue 1 tasks" }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Close" }));
  expect(input.onClose).toHaveBeenCalledOnce();
  view.unmount();
  const results: MetadataRecoveryResult[] = [{ fileId: "one", status: "queued", job: job("one", "queued") }];
  await act(async () => resolve(results));
  expect(input.onSettled).toHaveBeenCalledWith(results);
  expect(recover).toHaveBeenCalledOnce();
});

it("cannot request or submit more than 100 holdings", async () => {
  const get = vi.fn();
  const recover = vi.fn();
  render(surface(props({ getLibraryMetadataRecovery: get, recoverLibraryMetadata: recover } as unknown as AcademicCloudApi,
    Array.from({ length: 101 }, (_, index) => holding(String(index))))));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be checked"));
  expect(screen.getByRole("button", { name: "Queue 0 tasks" })).toBeDisabled();
  expect(get).not.toHaveBeenCalled();
  expect(recover).not.toHaveBeenCalled();
});
