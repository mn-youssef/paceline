const FIRST_RETRY_MS = 3_000;
const MAX_RETRY_MS = 30_000;
const FAILURES_BEFORE_ERROR = 3;

/** Wait before the next attempt after `failures` failed requests in a row: 3 s, doubling, at most 30 s. */
export function retryDelayMs(failures: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, failures - 1));
}

/** One failed refresh keeps the numbers on screen; the error shows when there is nothing to show or it keeps failing. */
export function shouldShowLoadError(hasData: boolean, failures: number): boolean {
  return !hasData || failures >= FAILURES_BEFORE_ERROR;
}
