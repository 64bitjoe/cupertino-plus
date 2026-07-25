import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

/**
 * Kept in the shipped file on purpose. The bundle is served to every dashboard
 * visitor's browser, which is distribution, and the AGPL wants the notice and a route
 * to the source to travel with it. `/*!` marks it a legal comment so minifiers keep it.
 */
const LICENCE_BANNER = `/*! cupertino-widgets v${version} | Copyright (C) 2026 Kirill Verenih | AGPL-3.0-only | Source: https://github.com/sabbaken/cupertino-widgets */`

/**
 * Two modes, one config:
 *
 *   `vite`         -> dev harness. Serves dev/index.html, which renders the cards
 *                     against a mock `hass` object. Full HMR, no Home Assistant needed.
 *   `vite build`   -> the shippable artifact: a single self-contained ES module that
 *                     Home Assistant loads as a dashboard resource.
 */
export default defineConfig(({ command }) => ({
  define: {
    __CW_VERSION__: JSON.stringify(version),
  },

  // Dev-harness settings. Ignored by `vite build`.
  ...(command === 'serve' ? { root: 'dev' } : {}),
  server: {
    port: 5173,
    // dev/ imports from ../src, which lives outside the serve root.
    fs: { allow: ['..'] },
  },

  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      // Fixed name: it is baked into every user's dashboard resource URL.
      fileName: () => 'cupertino-widgets.js',
    },
    rollupOptions: {
      output: { banner: LICENCE_BANNER },
    },
    // Vite 8 replaced `rollupOptions.output.inlineDynamicImports` with this.
    // Home Assistant loads one URL, so the bundle must not be split.
    codeSplitting: false,
    // Vite 8 dropped the bundled esbuild; `'esbuild'` here throws at build time.
    minify: 'oxc',
    target: 'es2022',
    sourcemap: true,
    // MUST stay false. Emptying the directory recreates it with a new inode, which
    // silently detaches docker-compose's bind mount of ./dist -- the dev Home
    // Assistant then serves 404 for a bundle that is sitting right there on the host.
    // Output filenames are fixed anyway, so there is nothing to clean.
    emptyOutDir: false,
  },
}))
