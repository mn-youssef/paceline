// Fake native host for e2e tests: answers snapshot requests with the snapshot file passed as argv[2]
// (stamped with fresh capture and reset times) and dashboard requests with its "dashboard" field.
// Speaks Chrome's length-prefixed JSON framing.
import { readFileSync } from 'node:fs';

const snapshotPath = process.argv[2];
let buf = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (buf.length < 4) return;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return;
  const req = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
  const now = Date.now();
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const capture = snapshot.live.capture;
  if (capture) {
    capture.capturedAt = now;
    if (capture.fiveHour) capture.fiveHour.resetsAt = now + 2 * 3_600_000;
    if (capture.sevenDay) capture.sevenDay.resetsAt = now + 72 * 3_600_000;
  }
  snapshot.live.lastSeenAt = now;
  const data =
    req.type === 'ping'
      ? { helperVersion: '0.0.0-e2e', protocol: 1, statusLineInstalled: true, lastStatusLineAt: now }
      : req.type === 'dashboard'
        ? { ...snapshot.dashboard, range: req.range }
        : snapshot;
  const body = Buffer.from(JSON.stringify({ v: 1, id: req.id, ok: true, data }));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]), () => process.exit(0));
});
