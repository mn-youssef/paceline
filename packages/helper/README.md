# paceline

Local helper for **Paceline, the usage meter for Claude Code** (a browser extension).

    npx paceline install

This connects Claude Code to the extension:

- registers a Native Messaging host with Chrome, Edge, Brave, Arc, Chromium and Vivaldi (the browser starts it on demand; nothing runs in the background and no port is opened);
- adds a status line to Claude Code that records the 5-hour and weekly limit % Claude Code reports. If you already had a status line, it keeps running;
- indexes your Claude Code session logs locally so the extension can show your heaviest sessions with tips.

Nothing leaves your machine: the helper makes no network requests and sends the extension only numbers, model names, tool names and file paths, never your prompts or code.

    npx paceline doctor      # check the connection
    npx paceline uninstall   # restore your status line and remove everything

Requires Node.js 18 or newer.
