declare const __PACELINE_VERSION__: string | undefined;

/** Replaced at bundle time by build.mjs; "0.0.0-dev" when running from source (tests). */
export const HELPER_VERSION: string = typeof __PACELINE_VERSION__ === 'string' ? __PACELINE_VERSION__ : '0.0.0-dev';
