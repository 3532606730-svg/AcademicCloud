import { LOCAL_OCR_ROOT, type LocalOcrDevice, type LocalOcrJob, type LocalOcrPairing, type LocalOcrRequestInput, type LocalOcrResult } from "@academiccloud/compute-contracts";

export type { LocalOcrDevice, LocalOcrJob, LocalOcrResult } from "@academiccloud/compute-contracts";
export interface LocalOcrPage { resourceId: string; sourceId: string; physicalPage: number }
export interface LocalOcrApi {
  devices(signal?: AbortSignal): Promise<LocalOcrDevice[]>;
  pairing(label: string): Promise<LocalOcrPairing>;
  revoke(id: string): Promise<LocalOcrDevice>;
  create(input: LocalOcrRequestInput): Promise<LocalOcrJob>;
  status(id: string, signal?: AbortSignal): Promise<LocalOcrJob>;
  cancel(id: string): Promise<LocalOcrJob>;
  results(page: LocalOcrPage, signal?: AbortSignal): Promise<LocalOcrResult[]>;
  result(id: string, signal?: AbortSignal): Promise<LocalOcrResult>;
  correct(id: string, revision: number, correctedText: string): Promise<LocalOcrResult>;
}

export function createLocalOcrApi(request: <T>(path: string, init?: RequestInit) => Promise<T>): LocalOcrApi {
  const enc = encodeURIComponent;
  const get = <T>(path: string, signal?: AbortSignal) => request<T>(LOCAL_OCR_ROOT + path, signal ? { signal } : {});
  const write = <T>(path: string, method: string, input: unknown) => request<T>(LOCAL_OCR_ROOT + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return {
    devices: (signal) => get<{ devices: LocalOcrDevice[] }>("/devices", signal).then((r) => r.devices),
    pairing: (label) => write<LocalOcrPairing>("/pairing", "POST", { label }),
    revoke: (id) => write<{ device: LocalOcrDevice }>(`/devices/${enc(id)}/revoke`, "POST", {}).then((r) => r.device),
    create: (input) => write<{ job: LocalOcrJob }>("/requests", "POST", input).then((r) => r.job),
    status: (id, signal) => get<{ job: LocalOcrJob }>(`/requests/${enc(id)}`, signal).then((r) => r.job),
    cancel: (id) => write<{ job: LocalOcrJob }>(`/requests/${enc(id)}/cancel`, "POST", {}).then((r) => r.job),
    results: (page, signal) => get<{ items: LocalOcrResult[] }>(`/results?${new URLSearchParams({ resourceId: page.resourceId, sourceId: page.sourceId, physicalPage: String(page.physicalPage) })}`, signal).then((r) => r.items),
    result: (id, signal) => get<{ result: LocalOcrResult }>(`/results/${enc(id)}`, signal).then((r) => r.result),
    correct: (id, revision, correctedText) => write<{ result: LocalOcrResult }>(`/results/${enc(id)}`, "PATCH", { revision, correctedText }).then((r) => r.result),
  };
}
