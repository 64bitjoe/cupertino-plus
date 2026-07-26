/**
 * Bump the `?v=` on the dashboard resource in `dev/ha-config/configuration.yaml`.
 *
 * Not a nicety — it is the only thing that reliably defeats the two caches sitting
 * between a fresh build and the browser, and neither of them is obvious:
 *
 *  1. Home Assistant serves `/local/` with `Cache-Control: public, max-age=2678400`.
 *     Thirty-one days.
 *  2. The frontend registers a service worker whose LAST route is a catch-all, reached by
 *     anything the earlier routes do not claim — `/local/` included:
 *
 *       registerRoute(/\/.*​/, new StaleWhileRevalidate({
 *         cacheName: 'file-cache',
 *         plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400 })],
 *       }))
 *
 *     Stale-while-revalidate answers from cache and refreshes behind you, so a plain
 *     reload shows the PREVIOUS build and the current one arrives on the reload after
 *     that. This is the one that makes a dev loop feel haunted: the code does turn up,
 *     one step late, so it reads as flaky rather than as cached.
 *
 * Both are keyed on the full URL including the query string — that catch-all route has no
 * `ignoreSearch`, unlike the `/static/` one above it — so a new `?v=` is a new cache entry
 * for both and no reload trickery is needed. The resource list is read at startup under
 * `resource_mode: yaml`, hence the restart that follows this in `pnpm ha:verify`.
 */

import { readFile, writeFile } from 'node:fs/promises'

const CONFIG = new URL('./ha-config/configuration.yaml', import.meta.url)
const RESOURCE = /(cupertino-widgets\.js\?v=)(\d+)/

const yaml = await readFile(CONFIG, 'utf8')
const match = RESOURCE.exec(yaml)

if (!match) {
  console.error(
    'Could not find `cupertino-widgets.js?v=<n>` in dev/ha-config/configuration.yaml.\n' +
      'If the resource URL was reshaped, teach this script the new form — silently not\n' +
      'bumping would hand you a stale card with nothing to say so.',
  )
  process.exit(1)
}

const next = Number(match[2]) + 1
await writeFile(CONFIG, yaml.replace(RESOURCE, `$1${next}`))
console.log(`resource -> ?v=${next}`)
