import ids from './extension-ids.json';

export const HOST_NAME = 'com.paceline.host';
export const PROTOCOL_VERSION = 1;
export const CLAUDE_AI_ORIGIN = 'https://claude.ai/*';

export const DEV_EXTENSION_ID: string = ids.dev;
export const STORE_EXTENSION_ID: string | null = ids.store;
export const KNOWN_EXTENSION_IDS: string[] = STORE_EXTENSION_ID ? [DEV_EXTENSION_ID, STORE_EXTENSION_ID] : [DEV_EXTENSION_ID];
