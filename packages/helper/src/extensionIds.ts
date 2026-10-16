/**
 * The extension IDs the helper answers. A release build (published on npm) trusts only the Chrome Web Store
 * extension: the dev key is public, so anyone could give their own extension the dev ID.
 */
export function allowedExtensionIds(release: boolean, dev: string, store: string | null): string[] {
  if (release) {
    if (!store) throw new Error('A release build needs the store extension ID.');
    return [store];
  }
  return store ? [dev, store] : [dev];
}
