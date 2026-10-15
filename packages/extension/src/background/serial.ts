/**
 * Runs tasks one at a time, in call order. Refreshes read, then write, extension storage; two
 * overlapping runs (startup plus an overdue alarm) would otherwise announce the same thing twice.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}
