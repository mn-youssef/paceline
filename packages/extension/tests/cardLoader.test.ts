import { describe, expect, it } from 'vitest';
import { startCardRender, type UrlApi } from '../src/dashboard/cardLoader';

function deferred() {
  let resolve!: (b: Blob) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<Blob>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness() {
  const calls: string[] = [];
  let n = 0;
  const urls: UrlApi = {
    create: () => {
      const u = `u${++n}`;
      calls.push(`create ${u}`);
      return u;
    },
    revoke: (u) => calls.push(`revoke ${u}`),
  };
  const events: string[] = [];
  const on = { ready: (_b: Blob, u: string) => events.push(`ready ${u}`), failed: () => events.push('failed') };
  return { calls, urls, events, on };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('startCardRender', () => {
  it('hands the image over and revokes it when cancelled', async () => {
    const d = deferred();
    const h = harness();
    const cancel = startCardRender(() => d.promise, h.urls, h.on);
    d.resolve(new Blob(['png']));
    await tick();
    expect(h.events).toEqual(['ready u1']);
    cancel();
    expect(h.calls).toEqual(['create u1', 'revoke u1']);
  });

  it('drops an image that finishes after cancel', async () => {
    const d = deferred();
    const h = harness();
    startCardRender(() => d.promise, h.urls, h.on)();
    d.resolve(new Blob(['png']));
    await tick();
    expect(h.calls).toEqual([]);
    expect(h.events).toEqual([]);
  });

  it('reports a failed drawing once', async () => {
    const d = deferred();
    const h = harness();
    startCardRender(() => d.promise, h.urls, h.on);
    d.reject(new Error('no canvas'));
    await tick();
    expect(h.events).toEqual(['failed']);
  });
});
