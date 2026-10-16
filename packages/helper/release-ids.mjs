// Which Chrome Web Store extension ID a helper build trusts. Kept apart from build.mjs so it can be tested.
const STORE_ID = /^[a-p]{32}$/;

/**
 * Release builds trust only the store ID. PACELINE_STORE_ID (envId) exists for rehearsals before the real ID
 * is known: it may not contradict a committed ID, and it never reaches a publish.
 */
export function pickStoreId({ release, envId, committedId, publishing }) {
  if (!release) return committedId ?? null;
  if (envId) {
    if (publishing) throw new Error('PACELINE_STORE_ID is only for rehearsals. Unset it to publish.');
    if (!STORE_ID.test(envId)) throw new Error('PACELINE_STORE_ID must be 32 letters a-p (a Chrome extension ID).');
    if (committedId && envId !== committedId) {
      throw new Error(`PACELINE_STORE_ID (${envId}) differs from the committed store ID (${committedId}). Unset it.`);
    }
    return envId;
  }
  if (!committedId || !STORE_ID.test(committedId)) {
    throw new Error('Release build needs the store extension ID: set "store" in packages/shared/src/extension-ids.json.');
  }
  return committedId;
}
