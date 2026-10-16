# Releasing Paceline

A release has two parts that must match: the **extension** on the Chrome Web Store and the **helper** on npm (`paceline`). Publishing is manual; no credentials live in CI.

## Why the order matters

The helper only answers extension IDs it trusts. The Chrome Web Store gives the extension its ID when you first upload it, and you can't choose it. So the first release goes: draft upload → ID into the code → helper on npm → store review.

The published helper trusts **only** the store extension. The development key in `packages/extension/dev-key.txt` is public, so anyone could give their own extension the dev ID. Source installs (`node packages/helper/dist/paceline.cjs install`) still trust the dev ID, because they use the development build in `dist/`. The npm package is built separately into `release/`.

## First release

1. **Build the store zip:**

   ```bash
   pnpm --filter @paceline/extension zip
   ```

   It lands in `packages/extension/.output-store/`.
2. **Create the draft:** in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), choose **New item** and upload the zip. Don't submit yet. Copy the item's ID (32 letters).
3. **Put the ID in the code:** set `"store"` in `packages/shared/src/extension-ids.json`, then commit.
4. **Check everything** (on macOS or Linux):

   ```bash
   pnpm release:check
   ```

   It stops at the first problem. When it passes, it has built the zip and the release helper.
5. **Publish the helper** (needs an npm account with two-factor authentication):

   ```bash
   cd packages/helper && pnpm publish
   ```

   `prepublishOnly` rebuilds the release helper. It refuses to build if `PACELINE_STORE_ID` is set, so a rehearsal ID can't be published.
6. **Fill in the listing:** in the dashboard, upload the zip from step 4 as the package. Fill in the **Store listing** and **Privacy practices** tabs from [docs/store/listing.md](docs/store/listing.md), with the images in `docs/store/`.
7. **Submit as Unlisted:** set **Distribution** to **Unlisted** and click **Submit for review**. A draft or Unlisted item can't be installed before it's approved, so wait for the approval email. Extensions that use native messaging often take a few days.
8. **Test the real thing:** install Paceline from the Unlisted store link on a machine that has Claude Code, run `npx paceline install`, and check that the popup says **Connected**.
9. **Go public:** switch **Distribution** to **Public**. The change can go through a short review.
10. **Tag the release:**

    ```bash
    git tag v<version> && git push --tags
    ```

    Then put the store link in the README and the guide.

## Later releases

1. Bump `version` in **both** `packages/extension/package.json` and `packages/helper/package.json` (they must match).
2. Commit, then run `pnpm release:check`.
3. In the dashboard, go to **Package → Upload new package** and upload the new zip, then submit. Users get the update automatically.
4. If the helper changed, run `cd packages/helper && pnpm publish`. Users update with `npx paceline@latest install`; the popup tells them when it's needed.
5. Tag the release.

## Rehearsal

Before the store ID exists, you can rehearse every check with a made-up ID. Nothing is published, and the ID isn't saved:

```bash
PACELINE_STORE_ID=abcdefghijklmnopabcdefghijklmnop pnpm release:check
```

Afterwards, run `pnpm build` so `dist/` holds the development helper again for your own source install. The rehearsal doesn't touch `dist/`, but rebuilding is cheap.

## Manual tests

[docs/release-checklist.md](docs/release-checklist.md) lists what to try by hand on each operating system and browser before a release.
