/** Replaced at build time with the "version" field of package.json (vite.config.ts `define`). */
declare const __APP_VERSION__: string;

/** emu8086-web version, from package.json. Use this instead of writing the version anywhere else. */
export const APP_VERSION: string = __APP_VERSION__;

/** The project's GitHub repository (source code, issues, releases). */
export const REPO_URL = 'https://github.com/sergiulefter/emu8086-web';
