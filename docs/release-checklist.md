# Release checklist

Run on each OS: macOS, Windows, Linux. Browsers: Chrome, Edge, Brave (plus Arc on macOS).

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm --filter @paceline/extension e2e` pass.
- [ ] Fresh machine: extension popup shows "Connect Claude Code".
- [ ] `npx paceline install` lists the installed browsers and adds the status line; popup turns to Connected within 2 s.
- [ ] Existing custom status line: still renders inside Claude Code after install; `uninstall` restores it exactly.
- [ ] After one Claude Code response in the terminal, the badge shows the 5-hour % within 60 s.
- [ ] Set alert thresholds to `1` in Options: a notification appears on the next refresh, and only once.
- [ ] Popup lists real sessions with tips; the 5h / 24h / 7d tabs switch.
- [ ] Celebration: in the service worker console run `chrome.storage.local.set({ tracker: { '5h': { pct: 90, resetsAt: Date.now() - 1000 }, '7d': null } })`, wait for the next tick: the notification shows, clicking it opens the confetti window, and the badge says NEW.
- [ ] claude.ai fallback: enable it, stop Claude Code for 15 min, and the badge source says claude.ai. Confirm `utilization` is a 0–100 percentage, not a 0–1 fraction.
- [ ] Status line speed: `time (echo '{}' | node ~/.paceline/paceline.cjs statusline)` reports under 80 ms of real time with no previous status line chained.
- [ ] `npx paceline doctor` is all ✓ on a working setup.
- [ ] `npx paceline uninstall --purge` leaves no `~/.paceline`, no host manifests, no registry keys (Windows).
- [ ] Store build: `pnpm --filter @paceline/extension zip`; the zipped manifest has no `key`. After the first store upload, put the store id in `packages/shared/src/extension-ids.json` and publish a helper release.
- [ ] Before the first public release, publish the helper with only the Web Store extension id in `allowed_origins` (drop the dev id): anyone can load an unpacked extension with the committed dev key.
- [ ] Windows: settings and cache writes succeed while Claude Code has the files open (no leftover `.tmp` files), and a chained status line that relies on Git Bash still renders.
