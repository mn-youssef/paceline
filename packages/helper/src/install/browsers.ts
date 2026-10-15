import path from 'node:path';
import { HOST_NAME } from '@paceline/shared';

export type OS = 'darwin' | 'linux' | 'win32';

export interface BrowserTarget {
  name: string;
  profileDir: string;
  hostsDir: string;
  registryKey: string | null;
}

type Env = Record<string, string | undefined>;

const DARWIN: [string, string[]][] = [
  ['Chrome', ['Google', 'Chrome']],
  ['Chrome Beta', ['Google', 'Chrome Beta']],
  ['Chromium', ['Chromium']],
  ['Edge', ['Microsoft Edge']],
  ['Brave', ['BraveSoftware', 'Brave-Browser']],
  ['Arc', ['Arc', 'User Data']],
];

const LINUX: [string, string[]][] = [
  ['Chrome', ['google-chrome']],
  ['Chrome Beta', ['google-chrome-beta']],
  ['Chromium', ['chromium']],
  ['Edge', ['microsoft-edge']],
  ['Brave', ['BraveSoftware', 'Brave-Browser']],
];

const WINDOWS: [string, string[], string][] = [
  ['Chrome', ['Google', 'Chrome', 'User Data'], 'Google\\Chrome'],
  ['Edge', ['Microsoft', 'Edge', 'User Data'], 'Microsoft\\Edge'],
  ['Brave', ['BraveSoftware', 'Brave-Browser', 'User Data'], 'BraveSoftware\\Brave-Browser'],
];

function localAppData(home: string, env: Env): string {
  return env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local');
}

export function windowsManifestPath(home: string, env: Env): string {
  return path.win32.join(localAppData(home, env), 'paceline', `${HOST_NAME}.json`);
}

export function browserTargets(os: OS, home: string, env: Env): BrowserTarget[] {
  if (os === 'win32') {
    const base = localAppData(home, env);
    const hostsDir = path.win32.dirname(windowsManifestPath(home, env));
    return WINDOWS.map(([name, dirs, reg]) => ({
      name,
      profileDir: path.win32.join(base, ...dirs),
      hostsDir,
      registryKey: `HKCU\\Software\\${reg}\\NativeMessagingHosts\\${HOST_NAME}`,
    }));
  }
  const base = os === 'darwin' ? path.posix.join(home, 'Library', 'Application Support') : path.posix.join(home, '.config');
  return (os === 'darwin' ? DARWIN : LINUX).map(([name, dirs]) => {
    const profileDir = path.posix.join(base, ...dirs);
    return { name, profileDir, hostsDir: path.posix.join(profileDir, 'NativeMessagingHosts'), registryKey: null };
  });
}
