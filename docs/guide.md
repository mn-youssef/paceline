# Paceline user guide

Paceline is a browser extension that shows how much of your Claude Code usage limit you have used, warns you before you hit it, and shows which sessions used your tokens and why. A small helper program on your computer reads Claude Code's local logs, and the extension shows the results.

This guide covers installing Paceline, what each part does, every setting, troubleshooting, updating and uninstalling.

## Contents

1. [What you need](#1-what-you-need)
2. [Install](#2-install)
3. [What the install changes on your computer](#3-what-the-install-changes-on-your-computer)
4. [Using Paceline](#4-using-paceline)
5. [Options reference](#5-options-reference)
6. [The claude.ai fallback](#6-the-claudeai-fallback)
7. [Troubleshooting](#7-troubleshooting)
8. [Updating](#8-updating)
9. [Uninstalling](#9-uninstalling)
10. [Privacy](#10-privacy)
11. [FAQ](#11-faq)

---

## 1. What you need

| Requirement | Details |
|---|---|
| **Claude Code** | Installed and used at least once, so that `~/.claude/projects/` exists. |
| **A Pro or Max plan** | Claude Code only reports the 5-hour and weekly limit percentages on these plans. On an API key, session costs, tips and the dashboard still work, but the badge has no limit % to show. |
| **Node.js 18 or newer** | The helper runs on Node.js. Check with `node --version`. Get it from [nodejs.org](https://nodejs.org). |
| **A Chromium browser** | Chrome, Chrome Beta, Chromium, Edge or Brave. Arc too, on macOS. |
| **Operating system** | macOS and Linux are tested. Windows is supported by the code, for Chrome, Edge and Brave, but not tested yet. |

## 2. Install

There are two parts: the **extension** in your browser, and the **helper** (`paceline`) on your computer. Install the extension first, then the helper.

### 2.1 From the Chrome Web Store and npm

> Paceline is not published yet. Until it is, use [2.2 From source](#22-from-source).

1. Add **Paceline** to your browser from the Chrome Web Store. Edge and Brave can install from the Chrome Web Store too.
2. Open a terminal and run:

   ```bash
   npx paceline install
   ```

3. Click the Paceline icon in the toolbar. It should say **Connected**.

### 2.2 From source

Use this before Paceline is published, or if you want to run your own build.

**Build tools:** Git, Node.js 22.12 or newer, and pnpm 10. The easiest way to get pnpm is Corepack, which comes with Node.js:

```bash
corepack enable
```

**1. Get the code and build it**

```bash
git clone https://github.com/mn-youssef/paceline.git
cd paceline
pnpm install
pnpm build
```

This creates two things:
- the extension, in `packages/extension/.output/chrome-mv3/`;
- the helper, in `packages/helper/dist/paceline.cjs`.

**2. Load the extension**

1. Open your browser's extensions page:
   - Chrome, Brave, Arc and Chromium: `chrome://extensions`
   - Edge: `edge://extensions`
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder `packages/extension/.output/chrome-mv3`.
4. Pin Paceline to the toolbar: click the puzzle icon, then the pin next to Paceline.

This build always gets the same extension ID, `cchmkmfoocjlfkogepngoklnehiofpco`. The key in `packages/extension/dev-key.txt` sets it, and the helper trusts this ID automatically.

**3. Install the helper**

From the repository folder:

```bash
node packages/helper/dist/paceline.cjs install
```

When it finishes, the helper is copied to `~/.paceline/`, so it keeps working if you move or delete the repository later.

### 2.3 Check that it works

1. **Run the doctor:**

   ```bash
   npx paceline doctor
   ```

   From source, use `node packages/helper/dist/paceline.cjs doctor` instead. Every line should start with ✓, for example:

   ```text
   ✓ helper           /Users/you/.paceline/paceline.cjs
   ✓ node             /usr/local/bin/node
   ✓ browsers         Registered for Chrome, Edge
   ✓ statusline       Installed in ~/.claude/settings.json
   ✓ statusline-seen  Last ran 2 min ago
   ✓ rate-limits      5h 15% · 7d 20%, captured 2 min ago
   ✓ logs             /Users/you/.claude/projects
   ✓ index            720 log files indexed, 0 unreadable lines skipped
   ```

   `statusline-seen` and `rate-limits` stay ✗ until Claude Code has answered at least one message in a terminal after the install.
2. **Send any message in Claude Code, in a terminal.** Within a minute, the Paceline badge shows your limit %.
3. **Open the popup.** The bottom line says **Connected**, and your recent sessions are listed.

The first time, the helper reads all your session logs from the last 35 days. With a lot of history this takes a minute or two. Until it finishes, the popup says "Indexing your Claude Code history".

### 2.4 Using the Claude desktop app or an IDE

Paceline learns your limit % from Claude Code's **status line**, and Claude Code only runs the status line in the **terminal**. If you mostly use the Claude desktop app or an IDE extension, turn on the claude.ai fallback (see [section 6](#6-the-claudeai-fallback)):

1. Open Paceline **Options**.
2. Under **claude.ai fallback**, tick **Use my claude.ai session**.
3. Approve the browser's request for access to claude.ai.
4. Stay signed in to claude.ai in this browser.

Sessions, tips, the dashboard and the digest come from your log files, so they work whichever app you use.

## 3. What the install changes on your computer

`install` is safe to run more than once. `uninstall` undoes everything listed here.

**The `~/.paceline/` folder**

| Path | What it is |
|---|---|
| `paceline.cjs` | The helper itself |
| `bin/paceline-host` (`paceline-host.bat` on Windows) | The small launcher the browser starts |
| `config.json` | Install record: the Node.js path and your previous status line |
| `live.json` | The latest limit % reported by Claude Code |
| `cache/` | The log index, so later reads are fast |
| `backups/` | A copy of `~/.claude/settings.json`, taken before the helper changed it |
| `logs/` | Helper error logs |

**Browser registration**

The helper registers itself as `com.paceline.host` with every supported browser it finds. Browsers that aren't installed are skipped.

| OS | Where |
|---|---|
| macOS | `~/Library/Application Support/<browser>/NativeMessagingHosts/com.paceline.host.json` |
| Linux | `~/.config/<browser>/NativeMessagingHosts/com.paceline.host.json` |
| Windows | `%LOCALAPPDATA%\paceline\com.paceline.host.json`, plus one registry key per browser under `HKCU\Software\<browser>\NativeMessagingHosts\com.paceline.host` |

This file lists the only extension IDs allowed to talk to the helper.

**Claude Code status line**

The helper sets `statusLine` in `~/.claude/settings.json` to its own command. Each time Claude Code refreshes the status line, the helper saves the 5-hour and weekly limit % to `live.json`. Then:
- if you already had a status line, it prints that one (it still works as before);
- if you didn't, it prints a short line such as `5h 15% · 7d 20%`.

Nothing else in your Claude Code settings changes. The helper never changes your model, sessions or other settings.

## 4. Using Paceline

### 4.1 The badge

The toolbar icon shows the % of your limit used:

| Badge | Meaning |
|---|---|
| Green number | Under 50 % |
| Orange number | 50 % to 79 % |
| Red number | 80 % and above |
| Grey `—` | No limit reading yet |
| Grey `!` | The extension can't reach the helper; click it to set up |
| Green **NEW** | A limit reset in the last 30 minutes |

By default the badge shows whichever limit is higher, the 5-hour or the weekly one. You can change this in Options. Hover the icon to see both limits, when they reset, and how old the reading is when it isn't live.

### 4.2 The popup

Click the icon to open it.

- **Gauges.** One for the 5-hour limit and one for the weekly limit, each with the % used and the time until it resets. Under each gauge:
  - **forecast:**
    - `learning your pace…`: Paceline needs about 10 minutes of readings for the 5-hour limit, and a few hours for the weekly one.
    - `steady`: you are not using it right now.
    - `on pace ✓`: at the current pace you will not reach 100 % before the reset.
    - `full ≈ 15:10 ⚠`: at the current pace you will reach 100 % at that time, before the reset.
    - `limit reached`
  - **safe pace:** for example `1.8× safe pace` means you are using it 1.8 times faster than the pace that would last until the reset.
- **Habit line.** `Today: 9% of 14% · 🔥 5-day streak`. See [4.6](#46-daily-budget-and-streak).
- **Sessions** and **Hidden costs** switch the list below them.
- **5h / 24h / 7d** choose the time window for the list.
- **Sessions list.** Your most expensive sessions in that window. Each one shows:
  - the project, how long ago, how long it ran and how many turns;
  - its API value in the window, then its grade;
  - a bar for its share of the window's cost, and a coloured bar for the model mix (Opus, Sonnet, Haiku, Fable);
  - up to three **tips** for that session.

  Click a session for the evidence behind each tip and the estimated saving.
- **Hidden costs.** Four cards for the selected window. Each card shows the cost, what to do about it, and which projects cause it:
  - **Cache misses:** pauses long enough that the prompt cache expired, so the whole context was sent again.
  - **Setup overhead:** MCP servers and CLAUDE.md files that load into every message, per project.
  - **Subagents:** the share of spend that went to subagents.
  - **Long context:** turns above 150k tokens of context.
- **Footer.** **Dashboard**, **Options** and the connection status: Connected, Helper not found, Helper needs an update, or Helper error.

### 4.3 Tips

Tips come only from what is in your own logs. Each tip shows the numbers it is based on and an estimated saving. The savings for one session are capped at 60 % of that session's cost. A tip worth less than $0.10 is not shown.

| Tip | Shown when | What to do |
|---|---|---|
| Long session without /clear | A session ran for hours at a large context | `/clear` between tasks |
| Large file reads | File reads are a big share of the session's tool output | Point Claude at specific files or line ranges |
| Opus on routine edits | Opus did many small edits | Use Sonnet for routine edits (`/model sonnet`) |
| Heavy MCP tool output | One MCP server returned a lot of tokens | Disable servers you don't need in that project |
| Cache expired during pauses | You paused past the cache lifetime several times | `/clear` before long breaks, or keep pauses short |
| Heavy setup on every message | MCP servers and CLAUDE.md add many tokens to each message | Trim CLAUDE.md, turn off unused MCP servers |
| Subagents dominate | Subagents used most of the session | Give subagents narrower tasks and ask for shorter reports |
| Noisy command output | Commands printed very long output | Pipe long logs through `tail` or `grep` |
| Same file read repeatedly | One file was read many times | Ask Claude to keep a summary, or point at exact lines |
| Running at very long context | Many turns ran above 150k tokens of context | Run `/compact` earlier |

### 4.4 Efficiency grades

Each session gets a score from 0 to 100: `100 × (1 − avoidable cost ÷ session cost)`. "Avoidable cost" is the sum of all of that session's tip savings, not only the three shown.

| Grade | Score |
|---|---|
| A | 85 and above |
| B | 70 to 84 |
| C | 55 to 69 |
| D | 40 to 54 |
| F | below 40 |

Because savings are capped at 60 % of the cost, the lowest possible score is 40, so in practice the lowest grade is D. Sessions that cost less than $0.10 always score 100. Hover a grade to see the score.

### 4.5 Alerts

| Notification | When |
|---|---|
| **Threshold** | Your limit crosses 50 %, 80 % and 95 %, once per limit cycle; you can change the levels. The message includes when the limit resets and, when Paceline has a forecast, when you will reach 100 % at your current pace. |
| **On pace to hit your limit** | At most once per cycle, when your current pace reaches 100 % before the reset: within the next 90 minutes for the 5-hour limit, or the next 24 hours for the weekly one. Not sent when a threshold alert for that limit went out at the same moment. |
| **Fresh limit! 🎉** | A limit you had been using (at least 50 % by default) resets. Click it for confetti. |
| **Your week with Claude Code** | The weekly digest; see [4.8](#48-weekly-digest). |

**Show notifications** in Options turns all of these off. **Quiet hours** hold them back during the hours you choose.

### 4.6 Daily budget and streak

The daily budget is a share of your **weekly** limit you want to use per day. The default is 14 %, which is about 100 % over seven days. Each time the weekly % goes up, Paceline adds the rise to today's total.

- The popup shows `Today: 9% of 14%`. The figure turns red when you go over.
- The **streak** counts days at or under budget, going back from today. Days you didn't use Claude Code are skipped and don't break it. The first day over budget ends it.
- Paceline keeps 120 days of this history in the browser. History starts the day you install this version; there is nothing to recover from earlier.
- Usage while the browser was closed is counted on the day of the next reading.

### 4.7 Dashboard

Open it with **Dashboard** in the popup footer. Switch between **Last 7 days** and **Last 30 days**.

- **Value:** "This month: $412 of API value on your $100 plan (4.1×)". Pick your plan in Options. On the API plan, the comparison is hidden.
- **Daily budget:** today against your budget, your streak, and one cell per day for 30 days. Green means within budget, red means over, grey means no usage recorded.
- **Daily API value by project:** stacked bars. The top five projects get their own colour and everything else is grouped as "Other". The legend shows each project's total. Hover a bar segment for the exact value.
- **Models:** API value by model family.
- **Tool output:** tokens returned by each kind of tool (read, edit, bash, search, web, MCP, agent, other).
- **When you use Claude Code:** a weekday × hour heatmap, in your local time. Darker means more.
- **Sessions:** every session in the range, with project, start, duration, turns, API value, grade and tips. Sort by date, duration, API value or grade by clicking the column header. At most the 500 most expensive sessions are listed.
- **Export CSV:** downloads the rows as shown, in the order shown.

### 4.8 Weekly digest

Every Monday at 09:00 local time you get a notification summing up the week before (Monday to Sunday). For example: "$412 of API value across 23 sessions (+18% vs the week before). Top project: my-app. Most common tip: Running at very long context. 🔥 5-day streak."

- If your browser was closed on Monday morning, you get it the next time it runs, once.
- It is not sent during quiet hours, when notifications are off, or while the helper is still indexing. It waits and goes out later.
- A week without any usage sends nothing.
- Click it to open the dashboard.
- Turn it off in Options.

### 4.9 Share card

On the dashboard, **Share card** draws a 1200 × 630 image of the selected range. It shows:
- the range's API value;
- the number of sessions;
- your average grade, weighted by cost;
- your streak;
- your most used tool.

**Download PNG** saves it, and **Copy image** puts it on the clipboard. Project names are left off unless you turn on **Show my top project's name on share cards** in Options.

### 4.10 What "API value" means

Dollar amounts in Paceline are **API value**: what the same tokens would cost at Anthropic's public API prices, including prompt-cache writes and reads. On a Pro or Max plan, this is **not** what you pay. It is a way to compare sessions and to see how much use you get from your plan. Prices for models Paceline does not know are estimated from the model family, and those amounts are marked with ≈.

## 5. Options reference

Open Options from the popup footer, or right-click the Paceline icon and choose **Options**.

| Setting | Default | What it does |
|---|---|---|
| **Notify me at** | 50, 80, 95 | Limit % levels for threshold alerts, comma-separated |
| **Show notifications** | On | Turns off every notification when unticked |
| **Warn me when I'm on pace to hit a limit** | On | The on-pace alert |
| **Send me a weekly digest on Monday morning** | On | The Monday digest |
| **Quiet hours** | Off, 22:00 to 08:00 | Holds back notifications during these hours |
| **Celebrate a reset when I had used at least** | 50 % | Minimum use before a reset is celebrated |
| **The badge shows** | Whichever limit is higher | Or always the 5-hour limit, or always the weekly one |
| **Use my claude.ai session** | Off | The fallback in [section 6](#6-the-claudeai-fallback) |
| **Daily budget** | 14 % of the weekly limit | Used for the habit line, the streak and the habits strip |
| **My plan** | Max 5x ($100/month) | Pro ($20), Max 5x ($100), Max 20x ($200) or API. Used for the value card |
| **Show my top project's name on share cards** | Off | Adds the top project to the share card |

## 6. The claude.ai fallback

The fallback is **unofficial** and off by default. It reads your limit % from claude.ai using your signed-in session in this browser. It uses an undocumented claude.ai endpoint that may change without notice.

- **When it is used:** only when Claude Code's status line hasn't reported limits for 15 minutes. The popup then says "from claude.ai (unofficial)".
- **How often:** at most once every 5 minutes.
- **What it reads:** only your limit percentages and reset times. No conversations, no account details.
- **When it fails** (signed out, endpoint changed): Options shows the reason, and Paceline waits an hour before trying again.
- **To turn it off:** untick the box. You can also remove the claude.ai permission on the browser's extension details page.

## 7. Troubleshooting

Start with `npx paceline doctor` (from source: `node packages/helper/dist/paceline.cjs doctor`). Every ✗ line says what is wrong.

| What you see | Why | What to do |
|---|---|---|
| Popup says **Connect Claude Code** and waits | The extension can't reach the helper | Run the install command, then reopen the popup. If it still waits, check that `doctor` lists your browser under `browsers`, and restart the browser. |
| `doctor`: `browsers ✗ No browser registration found` | Your browser's profile folder wasn't found at install time | Open the browser once, then run install again. |
| Popup footer: **Helper needs an update** | The extension is newer than the helper | Run `npx paceline@latest install`. From source: `git pull`, `pnpm build`, run the helper's `install` again. |
| Popup footer: **Helper error** | The helper hit a problem | Check `~/.paceline/logs/`, then run `doctor`. |
| "No limit reading yet" | Claude Code hasn't run the status line since the install | Send a message in Claude Code in a terminal, or turn on the claude.ai fallback. |
| "Limits refresh when Claude Code runs in a terminal" and the % looks old | You're using the desktop app or an IDE | Turn on the claude.ai fallback ([2.4](#24-using-the-claude-desktop-app-or-an-ide)). |
| `doctor`: `statusline ✗` | Another tool replaced the status line in `~/.claude/settings.json` | Run install again. Your other status line is kept and still runs. |
| `doctor`: `rate-limits ✗` | Claude Code hasn't reported limits yet; it only does so on Pro and Max plans | Send a message in a terminal. On an API key this check stays ✗, which is expected. |
| "Indexing your Claude Code history" | The first read of your logs is in progress | Wait; the popup and dashboard update every few seconds. |
| Forecast says `learning your pace…` | Not enough readings yet | Keep working; it appears after about 10 minutes (5-hour) or a few hours (weekly). |
| `Could not read Claude Code settings (…). Nothing was changed.` | `~/.claude/settings.json` isn't valid JSON | Fix the file, then run install again. |
| No notifications at all | Notifications are off in Options, in the browser, or in the OS | Check Options, then your OS notification settings for the browser. |
| The badge shows a grey `—` | No limit reading yet | See the two "limit" rows above. |
| The badge shows a grey `!` | The extension can't reach the helper | See the first row of this table. |
| You use several browser profiles | The helper is registered per browser, not per profile; every profile of a registered browser can use it | Install the extension in each profile you use. |

For the full details, `npx paceline doctor --json` prints the checks, versions and platform as JSON. Include it when you report a problem.

## 8. Updating

| You installed from | To update |
|---|---|
| The store and npm | The browser updates the extension on its own. Update the helper with `npx paceline@latest install` when the popup says **Helper needs an update**. |
| Source | `git pull`, `pnpm install`, `pnpm build`. Then click the reload icon on Paceline in `chrome://extensions`, and run `node packages/helper/dist/paceline.cjs install` again. |

Running install again keeps your settings, your status line and the log index.

## 9. Uninstalling

1. Remove the helper:

   ```bash
   npx paceline uninstall
   ```

   From source: `node packages/helper/dist/paceline.cjs uninstall`. This:
   - restores the status line you had before, or removes Paceline's if you had none;
   - unregisters the helper from every browser;
   - removes the helper files, keeping the settings backups in `~/.paceline/backups/`.

   To delete `~/.paceline/` completely, including the backups and the index, add `--purge`.
2. Remove the extension: right-click the Paceline icon, then **Remove from Chrome** (or your browser's equivalent). This deletes its settings and history.

Your Claude Code logs are never changed, so there is nothing to clean up there.

## 10. Privacy

Paceline has no servers and collects nothing.

- The helper reads your Claude Code logs on your computer and makes no network requests.
- It sends the extension only numbers, model names, tool and MCP server names, and project and file paths. Never your prompts, Claude's replies or file contents.
- The extension stores your settings and its history in the browser's local extension storage.
- The only network request the extension can make is the optional claude.ai fallback, to claude.ai, with your own session.

The full policy is in [PRIVACY.md](../PRIVACY.md).

## 11. FAQ

**Does Paceline change how Claude Code behaves?**
No. It only adds a status line command, and your previous status line keeps working. It never changes your model, settings or sessions.

**Does it read my Claude login or API key?**
No. It never reads Claude Code credentials or keychain entries. The claude.ai fallback uses the session that is already signed in to your browser, and only if you turn it on.

**Why is the dollar amount so much higher than my plan price?**
It is API value: what the same tokens would cost at API prices. See [4.10](#410-what-api-value-means).

**Why don't my numbers match claude.ai exactly?**
The limit % comes straight from Claude Code or claude.ai. Session costs come from your local logs at public API prices, so they are an estimate of value, not a bill.

**Does it work with Claude Code in an IDE or the desktop app?**
Sessions, tips and the dashboard do, because they read the logs. The live limit % needs either the terminal CLI or the claude.ai fallback ([2.4](#24-using-the-claude-desktop-app-or-an-ide)).

**Can I use it on several computers?**
Yes. Install the helper on each computer; each one shows that computer's sessions. The limit % is account-wide, so it matches everywhere.

**Is Windows supported?**
The helper registers with Chrome, Edge and Brave on Windows through the registry, but this hasn't been tested on a real Windows machine yet. Please report what you find.

**How do I see the helper's version?**
`npx paceline --version`.
