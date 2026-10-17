/**
 * The extension IDs the helper answers. Development IDs are derived from a per-checkout key and release
 * builds trust only the Chrome Web Store extension.
 */
export function allowedExtensionIds(release: boolean, dev: string | null, store: string | null): string[] {
  if (release) {
    if (!store) throw new Error('A release build needs the store extension ID.');
    return [store];
  }
  if (!dev) throw new Error('A development build needs a local extension key. Run pnpm gen:dev-key first.');
  return store ? [dev, store] : [dev];
}
