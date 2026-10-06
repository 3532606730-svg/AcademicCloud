import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.ts";
import { LanguageProvider } from "./i18n-react.tsx";
import { CurrentPageOcr, OcrConnectionDialog } from "./local-ocr-ui.tsx";
import { OCR_DEVICE, OCR_FRAME, OCR_JOB, OCR_RESULT, ocrApi } from "./local-ocr-test-fixture.ts";
import type { LocalOcrApi } from "./local-ocr-api.ts";
import type { PaintedOcrPage } from "./local-ocr-frame.ts";

beforeEach(() => { window.localStorage.setItem("academiccloud.language", "en"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 }))); });
afterEach(() => { window.localStorage.removeItem("academiccloud.language"); vi.unstubAllGlobals(); });
const painted = { capture: async () => OCR_FRAME, isCurrent: () => true };
function panel(api: LocalOcrApi, options: { page?: number; source?: string; account?: string; painted?: PaintedOcrPage | null } = {}) {
  return <LanguageProvider><CurrentPageOcr connection={{ api, accountId: options.account ?? "member-one", resourceId: OCR_RESULT.resourceId, sourceId: options.source ?? OCR_RESULT.sourceId }} physicalPage={options.page ?? 2} painted={options.painted === undefined ? painted : options.painted} /></LanguageProvider>;
}
describe("private current-page OCR UI", () => {
  it("reloads only this page's retained private results and preserves machine text when saving a correction", async () => {
    const api = ocrApi(); const user = userEvent.setup(); const view = render(panel(api));
    await user.click(screen.getByRole("button", { name: /Private OCR results/ }));
    expect(await screen.findByRole("textbox", { name: "Corrected text" })).toHaveValue("Retained private correction");
    expect(api.results).toHaveBeenCalledWith({ resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, physicalPage: 2 }, expect.any(AbortSignal));
    await user.clear(screen.getByRole("textbox")); await user.type(screen.getByRole("textbox"), "My corrected text"); await user.click(screen.getByRole("button", { name: "Save correction" }));
    await screen.findByText("Correction saved privately"); expect(api.correct).toHaveBeenCalledWith(OCR_RESULT.id, 1, "My corrected text");
    expect(screen.getByText("Machine text")).toBeInTheDocument();
    view.unmount(); vi.mocked(api.results).mockResolvedValue([{ ...OCR_RESULT, revision: 2, correctedText: "My corrected text" }]);
    render(panel(api)); await user.click(screen.getByRole("button", { name: /Private OCR results/ }));
    expect(await screen.findByRole("textbox")).toHaveValue("My corrected text"); expect(api.create).not.toHaveBeenCalled();
  });
  it("preserves a correction draft across closing the panel and requires explicit conflict comparison before CAS retry", async () => {
    const latest = { ...OCR_RESULT, revision: 4, correctedText: "Changed elsewhere" };
    const api = ocrApi({ correct: vi.fn().mockRejectedValueOnce(new ApiError(409, "concurrent_change")).mockResolvedValue({ ...latest, revision: 5, correctedText: "My draft" }), result: vi.fn().mockResolvedValue(latest) });
    const user = userEvent.setup(); render(panel(api)); await user.click(screen.getByRole("button", { name: /Private OCR results/ }));
    const input = await screen.findByRole("textbox"); await user.clear(input); await user.type(input, "My draft");
    await user.click(screen.getByRole("button", { name: /Private OCR results/ })); await user.click(screen.getByRole("button", { name: /Private OCR results/ }));
    expect(screen.getByRole("textbox")).toHaveValue("My draft");
    await user.click(screen.getByRole("button", { name: "Save correction" })); await screen.findByText("Changed elsewhere");
    expect(screen.getByRole("textbox")).toHaveValue("My draft"); expect(screen.getByRole("button", { name: "Save correction" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reviewed: keep my draft" })); await user.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(api.correct).toHaveBeenLastCalledWith(OCR_RESULT.id, 4, "My draft"));
  });
  it("hides old private text immediately on source/account changes and ignores a late old history read", async () => {
    let finish!: (value: typeof OCR_RESULT[]) => void;
    const api = ocrApi({ results: vi.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValue([]) });
    const view = render(panel(api)); await userEvent.setup().click(screen.getByRole("button", { name: /Private OCR results/ }));
    view.rerender(panel(api, { source: "source-two" })); await act(async () => finish([OCR_RESULT]));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(screen.queryByText("Machine text")).not.toBeInTheDocument();
    vi.mocked(api.results).mockResolvedValue([OCR_RESULT]); view.rerender(panel(api, { account: "member-one" }));
    expect(await screen.findByRole("textbox")).toHaveValue(OCR_RESULT.correctedText);
    vi.mocked(api.results).mockResolvedValue([]); view.rerender(panel(api, { account: "member-two" }));
    expect(screen.queryByText("Machine text")).not.toBeInTheDocument(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("retains a draft's revision across page navigation and compares an externally changed saved correction before writing", async () => {
    const api = ocrApi(); const user = userEvent.setup(); const view = render(panel(api)); await user.click(screen.getByRole("button", { name: /Private OCR results/ }));
    const input = await screen.findByRole("textbox"); await user.clear(input); await user.type(input, "Earlier page draft");
    vi.mocked(api.results).mockResolvedValue([]); view.rerender(panel(api, { page: 3 })); await screen.findByText("No saved result for this page yet.");
    const changed = { ...OCR_RESULT, revision: 7, correctedText: "External saved version" }; vi.mocked(api.results).mockResolvedValue([changed]); view.rerender(panel(api));
    expect(await screen.findByRole("textbox")).toHaveValue("Earlier page draft"); await screen.findByText("External saved version"); expect(screen.getByRole("button", { name: "Save correction" })).toBeDisabled(); expect(api.correct).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reviewed: keep my draft" })); await user.click(screen.getByRole("button", { name: "Save correction" })); await waitFor(() => expect(api.correct).toHaveBeenCalledWith(OCR_RESULT.id, 7, "Earlier page draft"));
  });
  it("disables OCR until the actual page is painted and reports an offline device without submission", async () => {
    const api = ocrApi({ devices: vi.fn().mockResolvedValue([{ ...OCR_DEVICE, online: false }]) }); const view = render(panel(api, { painted: null }));
    expect(screen.getByRole("button", { name: "Current page OCR" })).toBeDisabled();
    view.rerender(panel(api)); await userEvent.setup().click(screen.getByRole("button", { name: /Private OCR results/ }));
    await screen.findByRole("option", { name: "My computer · Offline" }); fireEvent.change(screen.getByRole("combobox", { name: "OCR device" }), { target: { value: OCR_DEVICE.id } });
    fireEvent.click(screen.getByRole("button", { name: "Current page OCR" })); await screen.findByText("Device is offline. Start your connector first."); expect(api.create).not.toHaveBeenCalled();
  });
  it("shows quota errors and page quality statuses without retrying or treating corrections as aligned text", async () => {
    const api = ocrApi({ create: vi.fn().mockRejectedValue(new ApiError(429, "limit_exceeded")), results: vi.fn().mockResolvedValue([{ ...OCR_RESULT, machine: { ...OCR_RESULT.machine, status: "low_confidence", truncated: true } }]) }); render(panel(api));
    await waitFor(() => expect(api.devices).toHaveBeenCalled()); await userEvent.setup().click(screen.getByRole("button", { name: "Current page OCR" }));
    await screen.findByText(/Connection or OCR limit reached/); expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Low confidence; review carefully/)).toHaveTextContent("Text truncated; result incomplete");
    expect(screen.getByText("Boxes align with the original machine text.")).toBeInTheDocument();
  });
  it("shows successful machine result geometry on the exact submitted frame and removes the frame after repaint", async () => {
    const fresh = { ...OCR_RESULT, correctedText: null }; const api = ocrApi({ results: vi.fn().mockResolvedValue([]), result: vi.fn().mockResolvedValue(fresh) }); const user = userEvent.setup(); const view = render(panel(api));
    await waitFor(() => expect(api.devices).toHaveBeenCalled()); await user.click(screen.getByRole("button", { name: "Current page OCR" }));
    expect(await screen.findByRole("textbox")).toHaveValue("Machine text"); expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ resourceId: OCR_RESULT.resourceId, sourceId: OCR_RESULT.sourceId, physicalPage: 2, imageWidth: 2000, imageHeight: 2666, rotation: 0, imageBase64: OCR_FRAME.imageBase64 }));
    await user.click(screen.getByText("Original line boxes and text")); await user.click(screen.getByRole("checkbox", { name: "Show boxes on current image" }));
    expect(screen.getByAltText("Current page image submitted for OCR")).toHaveAttribute("src", OCR_FRAME.previewUrl); expect(screen.getByTitle("Machine")).toHaveStyle({ left: "10%", top: "20%", width: "40%", height: "5%" });
    view.rerender(panel(api, { painted: { ...painted } })); expect(screen.queryByAltText("Current page image submitted for OCR")).not.toBeInTheDocument(); expect(screen.getByRole("textbox")).toHaveValue("Machine text");
  });
  it("reports device busy without an automatic page retry", async () => {
    const api = ocrApi({ create: vi.fn().mockResolvedValue({ ...OCR_JOB, state: "failed", resultId: null, errorCode: "engine_busy" }) }); render(panel(api)); await waitFor(() => expect(api.devices).toHaveBeenCalled());
    await userEvent.setup().click(screen.getByRole("button", { name: "Current page OCR" })); await screen.findByText("Device is busy. Try again later."); expect(api.create).toHaveBeenCalledTimes(1); expect(api.result).not.toHaveBeenCalled();
  });
  it.each([["no_text", "No text recognized"], ["unsupported_script", "Script unsupported by this engine"]] as const)("keeps %s quality status separate from a transport failure", async (status, label) => {
    const api = ocrApi({ results: vi.fn().mockResolvedValue([{ ...OCR_RESULT, correctedText: null, machine: { ...OCR_RESULT.machine, text: null, status, lineBoxes: [] } }]) }); render(panel(api)); await userEvent.setup().click(screen.getByRole("button", { name: /Private OCR results/ }));
    await screen.findByText(new RegExp(label)); expect(screen.getByRole("textbox")).toHaveValue(""); expect(api.create).not.toHaveBeenCalled();
  });
  it("exports the selected text as a private plain-text file", async () => {
    const create = vi.fn().mockReturnValue("blob:private"); const revoke = vi.fn(); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); render(panel(ocrApi()));
    await userEvent.setup().click(screen.getByRole("button", { name: /Private OCR results/ })); await screen.findByRole("textbox");
    fireEvent.click(screen.getByRole("button", { name: "Export .txt" })); expect(create).toHaveBeenCalledWith(expect.any(Blob)); expect(click).toHaveBeenCalled();
    const anchor = click.mock.instances[0] as HTMLAnchorElement; expect(anchor.download).toBe("ocr-page-2.txt"); expect(anchor.href).toBe("blob:private");
  });
});

describe("OCR connection tutorial and focus", () => {
  function Connection({ api }: { api: LocalOcrApi }) {
    const [open, setOpen] = useState(false); const [trigger, setTrigger] = useState<HTMLElement | null>(null);
    return <LanguageProvider><button type="button" onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>Connect</button>{open && trigger && <OcrConnectionDialog api={api} returnFocus={trigger} onClose={() => setOpen(false)} />}</LanguageProvider>;
  }
  it("creates a one-time code, explains stdin/config and hides a nonexistent download", async () => {
    const api = ocrApi(); const user = userEvent.setup(); render(<Connection api={api} />); await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument(); await screen.findByText("The connector package is not available on this site yet."); expect(screen.queryByRole("link", { name: "Download local connector" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Device name" }), "My laptop"); await user.click(screen.getByRole("button", { name: "Generate pairing code" }));
    await screen.findByText("one-time-code"); expect(api.pairing).toHaveBeenCalledWith("My laptop"); expect(screen.getAllByText(/npm start/)[0]).toHaveTextContent(`npm start -- --core ${window.location.origin} --pair --detect-installed`); expect(screen.getAllByText(/npm start/)[1]).toHaveTextContent(`npm start -- --core ${window.location.origin} --pair --config /absolute/member-ocr.json`);
    await user.click(screen.getByRole("button", { name: "My online account" })); expect(screen.getByText(/Online account connection is not available yet/)).toBeInTheDocument(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Connect" })).toHaveFocus();
  });
  it("shows device engine and online state and revokes only the selected own device", async () => {
    const api = ocrApi(); const user = userEvent.setup(); render(<Connection api={api} />); await user.click(screen.getByRole("button", { name: "Connect" }));
    const device = await screen.findByText("My computer"); const row = device.closest("li")!;
    expect(within(row).getByText("Online")).toBeInTheDocument(); expect(within(row).getByText(`${OCR_DEVICE.capabilities.engineId} ${OCR_DEVICE.capabilities.engineVersion}`)).toBeInTheDocument();
    vi.mocked(api.devices).mockResolvedValue([{ ...OCR_DEVICE, revokedAt: "2026-10-01T00:00:00Z", online: false }]); await user.click(within(row).getByRole("button", { name: "Revoke" }));
    expect(api.revoke).toHaveBeenCalledWith(OCR_DEVICE.id); await screen.findByText("Revoked");
  });
  it("shows a download only for an actual nonempty archive response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200, headers: { "Content-Type": "application/zip", "Content-Length": "512" } })); render(<Connection api={ocrApi()} />); await userEvent.setup().click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("link", { name: "Download local connector" })).toHaveAttribute("href", "/local-ocr-connector.zip");
  });
  it("keeps keyboard focus within the dialog and restores it when returning", async () => {
    render(<Connection api={ocrApi()} />); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Connect" }));
    const dialog = screen.getByRole("dialog"); const first = within(dialog).getByRole("button", { name: "Back to reading" }); const input = within(dialog).getByRole("textbox"); expect(input).toHaveFocus();
    const focusable = dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"); focusable[focusable.length - 1]!.focus(); await user.tab(); expect(first).toHaveFocus();
    await user.click(first); expect(screen.getByRole("button", { name: "Connect" })).toHaveFocus();
  });
});
