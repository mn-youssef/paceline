# Chrome Web Store listing

Copy each part into the matching field of the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Images are in this folder: `screenshot-1-popup.png`, `screenshot-2-dashboard.png`, `screenshot-3-hidden-costs.png` (1280 × 800) and `promo-tile-440x280.png`.

## Store listing tab

**Name** (from the manifest): Paceline — usage meter for Claude Code

**Summary** (from the manifest, max. 132 characters):

> See your Claude Code limit at a glance, get alerts before you hit it, and learn which sessions burn your tokens.

**Description:**

> Paceline shows how much of your Claude Code usage limit you have used, warns you before you hit it, and tells you which sessions used your tokens and why.
>
> • A badge on your toolbar with your 5-hour or weekly limit %, in green, orange or red
> • A forecast ("full ≈ 16:20") when your current pace would run out before the reset
> • Alerts at 50 %, 80 % and 95 %, and a heads-up when you're on pace to hit the limit
> • Your most expensive sessions, with tips based on what actually happened: "This session ran 2h without /clear", "58% of tool tokens were file reads"
> • An efficiency grade (A to F) for every session
> • Hidden costs: cache misses after pauses, setup overhead from MCP servers and CLAUDE.md, subagents, long context
> • A 30-day dashboard: cost by project, model mix, tool usage and the hours you work most, with CSV export
> • A daily budget with streaks, a Monday summary, and confetti when your limit resets
>
> Paceline needs its free local helper. After adding the extension, run `npx paceline install` in a terminal (Node.js 18 or newer). The helper reads Claude Code's session logs on your computer.
>
> Privacy: Paceline has no server and collects nothing. Your prompts, Claude's replies and your code never leave your computer. The extension only receives numbers, model and tool names, and project and file paths from the helper.
>
> Open source: https://github.com/mn-youssef/paceline
>
> Independent project, not affiliated with Anthropic.

**Category:** Developer Tools

**Language:** English

## Privacy practices tab

**Single purpose:**

> Shows Claude Code usage-limit percentages and per-session token costs from the user's local Claude Code logs, with alerts and tips to reduce usage.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `nativeMessaging` | Talks to Paceline's open-source local helper (npm package `paceline`), which reads Claude Code's session logs on the user's computer. No data leaves the device. |
| `storage` | Saves the user's settings, the latest limit reading, alert history and daily budget history locally. |
| `alarms` | Refreshes the badge every minute, schedules the reset celebration and the weekly summary. |
| `notifications` | Shows usage alerts at the user's thresholds, reset celebrations and the weekly summary. |
| `https://claude.ai/*` (optional) | Off by default. If the user turns on the claude.ai fallback, it reads only their limit percentages from claude.ai with their own signed-in session, for users of the Claude desktop app. |

**Remote code:** No, I am not using remote code.

**Data usage:** don't select any data type (Paceline collects none). Tick the three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/mn-youssef/paceline/blob/main/PRIVACY.md

## Other fields

**Support / homepage:** https://github.com/mn-youssef/paceline/issues

**Distribution:** Unlisted for the first test (see RELEASING.md), then Public.
