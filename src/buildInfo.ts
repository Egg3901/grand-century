/**
 * Build stamp, injected by `define` in vite.config.ts.
 *
 * `typeof` guards keep this safe anywhere the define is not applied (plain
 * `tsx` scripts, the season-report CLI), where the identifiers simply do not
 * exist. Never read these through `import.meta.env` — the 1.0.0 build proved
 * that an env var the deploy command forgets to set silently becomes 'dev'.
 */

declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __APP_RELEASE__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'nogit';

/** What GlitchTip groups events by — `<version>+<sha>`. */
export const APP_RELEASE: string =
  typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : `${APP_VERSION}+${BUILD_SHA}`;

/** Short human-facing label, e.g. `v1.1.0 (9329cde59def)`. */
export const VERSION_LABEL = `v${APP_VERSION} (${BUILD_SHA})`;
