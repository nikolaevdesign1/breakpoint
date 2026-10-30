import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { fillTokens } from './src/js/shared/club-facts.js';

const PAGES = ['index', 'about', 'tournaments', 'contacts', 'booking', 'coaches', 'memberships', 'privacy', 'terms', 'cookies', '404'];
const INCLUDE = /<!--\s*include:([\w./-]+)\s*-->/g;

// Static HTML partials: <!-- include:partials/nav.html --> is replaced at dev and build time.
// {{fact:key}} tokens are filled from src/js/shared/club-facts.js (phone, hours, plan perks, cancellation).
function htmlPartials() {
  const inline = (html, depth = 0) =>
    depth > 5 ? html : html.replace(INCLUDE, (_, file) => inline(readFileSync(resolve(__dirname, file), 'utf8'), depth + 1));
  return {
    name: 'html-partials',
    transformIndexHtml: { order: 'pre', handler: (html) => fillTokens(inline(html)) },
    handleHotUpdate({ file, server }) {
      if (file.includes('/partials/')) server.ws.send({ type: 'full-reload' });
    },
  };
}

// Blender sources, render frames, pipeline scripts and docs are not part of the site: keep the dev
// server from crawling and watching them (they are large and slowed start-up to ~50 s).
const NOT_SITE = ['**/blender/**', '**/scripts/**', '**/docs/**', '**/dist/**'];

export default defineConfig({
  plugins: [htmlPartials()],
  server: { watch: { ignored: NOT_SITE } },
  optimizeDeps: { entries: PAGES.map((p) => `${p}.html`) },
  build: {
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((p) => [p, resolve(__dirname, `${p}.html`)])),
    },
  },
});
