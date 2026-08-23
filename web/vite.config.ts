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
  };
});
