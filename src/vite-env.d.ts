/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Injected at build time from package.json — see vite.config.ts. */
declare const __APP_VERSION__: string;
/** Short commit SHA when built on Vercel; empty locally. */
declare const __BUILD_SHA__: string;
