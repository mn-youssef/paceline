// Pre-publication audit: lists tracked files that contain personal paths, email addresses, keys, tokens,
// or any of the private names you pass. Usage: node scripts/audit.mjs [--names name1,name2]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIP = /\.(png|ico|jpe?g|gif|zip)$|(^|\/)pnpm-lock\.yaml$/;
// Sample users that tests and docs use on purpose.
const SAMPLE_USERS = new Set(['dev', 'you', 'me']);

const namesArg = process.argv.indexOf('--names');
const names = namesArg > -1 ? (process.argv[namesArg + 1] ?? '').split(',').map((n) => n.trim()).filter(Boolean) : [];

const RULES = [
  { rule: 'home folder', re: /(?:\/Users\/|\/home\/|[A-Za-z]:\\{1,2}Users\\{1,2})([A-Za-z0-9._-]+)/g, keep: (m) => !SAMPLE_USERS.has(m[1]) },
  { rule: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { rule: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { rule: 'token', re: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|npm_[A-Za-z0-9]{36}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g },
  ...names.map((name) => ({ rule: `name "${name}"`, re: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') })),
];

const files = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter((f) => f && !SKIP.test(f));
const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const { rule, re, keep } of RULES) {
      for (const m of line.matchAll(re)) if (!keep || keep(m)) findings.push(`${file}:${i + 1}  ${rule}  ${m[0]}`);
    }
  });
}

if (findings.length > 0) {
  console.log(findings.join('\n'));
  console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'} in ${files.length} tracked files.`);
  process.exit(1);
}
console.log(`No findings in ${files.length} tracked files.`);
