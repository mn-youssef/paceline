export interface UrlApi {
  create(blob: Blob): string;
  revoke(url: string): void;
}

/**
 * Draws the share card and hands over the image with an object URL. The returned function cancels:
 * an image that finishes later is dropped, and a URL already handed over is revoked.
 */
export function startCardRender(render: () => Promise<Blob>, urls: UrlApi, on: { ready(blob: Blob, url: string): void; failed(): void }): () => void {
  let cancelled = false;
  let url: string | null = null;
  render().then(
    (blob) => {
      if (cancelled) return;
      url = urls.create(blob);
      on.ready(blob, url);
    },
    () => {
      if (!cancelled) on.failed();
    },
  );
  return () => {
    cancelled = true;
    if (url) urls.revoke(url);
  };
}
