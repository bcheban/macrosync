import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { seo } from './vite/seo';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

export default defineConfig(({ mode }) => {
  // `loadEnv` so the SEO plugin sees the same values the client bundle does.
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [
      react(),
      tailwindcss(),
      seo({
        siteUrl: env.VITE_SITE_URL ?? 'https://macrosync.io',
        locales: ['en', 'uk'],
        defaultLocale: 'en',
        langParam: 'lang',
        gaId: env.VITE_GA_MEASUREMENT_ID,
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          /*
           * Stable vendor chunks for code that changes far less often than the
           * app, so it stays cached across deploys.
           *
           * framer-motion is deliberately NOT listed: it is loaded through
           * `LazyMotion`, and naming it here would pull the whole library back
           * into an eagerly-fetched chunk, undoing the split.
           */
          manualChunks: {
            react: ['react', 'react-dom'],
            i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
      },
    },
    // `vite preview` serves the real production bundle; proxying the API too
    // means a Lighthouse run measures the page as users actually get it.
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
      },
    },
  };
});
