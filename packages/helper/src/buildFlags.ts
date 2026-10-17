import { STORE_EXTENSION_ID } from '@paceline/shared';

declare const __PACELINE_RELEASE__: boolean | undefined;
declare const __PACELINE_DEV_ID__: string | undefined;
declare const __PACELINE_STORE_ID__: string | null | undefined;

/** Replaced at bundle time by build.mjs (`--release` for the npm package); a development build otherwise. */
export const RELEASE_BUILD: boolean = typeof __PACELINE_RELEASE__ === 'boolean' ? __PACELINE_RELEASE__ : false;
export const BUILD_DEV_ID: string | null = typeof __PACELINE_DEV_ID__ === 'string' ? __PACELINE_DEV_ID__ : null;
export const BUILD_STORE_ID: string | null = typeof __PACELINE_STORE_ID__ === 'string' ? __PACELINE_STORE_ID__ : STORE_EXTENSION_ID;
