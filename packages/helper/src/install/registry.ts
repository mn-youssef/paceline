import { execFileSync } from 'node:child_process';

export interface Registry {
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const windowsRegistry: Registry = {
  set(key, value) {
    execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', value, '/f'], { stdio: 'ignore' });
  },
  remove(key) {
    try {
      execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' });
    } catch {
      // Key was not there.
    }
  },
};

export const noRegistry: Registry = { set() {}, remove() {} };
