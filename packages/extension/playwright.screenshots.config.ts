import { defineConfig } from '@playwright/test';

// Renders the README screenshots from the built extension with made-up data (not part of the e2e suite).
export default defineConfig({ testDir: './screenshots', timeout: 60_000, workers: 1, reporter: 'list' });
