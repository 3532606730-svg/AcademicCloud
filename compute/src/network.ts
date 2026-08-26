export function boundedNetworkSignal(parent: AbortSignal | undefined, timeoutMilliseconds: number): AbortSignal {
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > 10 * 60_000) {
    throw new RangeError("network timeout is invalid");
  }
  const timeout = AbortSignal.timeout(timeoutMilliseconds);
  return parent === undefined ? timeout : AbortSignal.any([parent, timeout]);
}

export function cancelledBy(parent: AbortSignal | undefined): DOMException {
  if (!parent?.aborted) throw new Error("network operation was not cancelled by its parent");
  return new DOMException("The network operation was cancelled.", "AbortError");
}
