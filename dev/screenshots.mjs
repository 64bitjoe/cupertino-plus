/**
 * Regenerate the README's screenshots. Run by hand, from `pnpm shots`.
 *
 * The README is the first place anyone sees the widgets (before the showcase site,
 * before installing anything), and an image in a README rots exactly as fast as a
 * comment does. This is the answer: the pictures are built from the cards themselves, by
 * the same Vite dev server the site runs on, so regenerating them is one command and
 * never a cropping session.
 *
 * What the page cannot do for itself, and this does:
 *
 *  - **Freezes the clock.** Half the calendar's rules are about `now`: which day is
 *    today, whether an event has already finished, whether the next day is `TOMORROW`.
 *    Unfrozen, every run would produce different pixels in every file and each one would
 *    turn up in `git diff`, which is how a generated gallery stops being regenerated.
 *  - **Pins the timezone and the locale**, for the same reason: the fixtures are built
 *    around local midnight, and `Europe/Warsaw` is what `dev/mock-hass.ts` says the
 *    instance is set to.
 *  - **Waits to be told.** `dev/shots.ts` reports `__SHOTS_READY__` once every card has
 *    settled into the layout its box implies, because a card guesses `medium` for its
 *    first frame and only learns better when the ResizeObserver reports.
 *
 * Chosen for the frozen instant: Friday 24 July 2026, 09:41. A Friday so that the day
 * after it is a plain weekday and the one after that is a weekend, which is what makes
 * the `TOMORROW` heading and the `SUNDAY, 26 JUL` form both appear across the set.
 * 09:41 because the fixtures anchor today's events to the next half hour, so everything
 * today starts at 10:00 and the times read as round numbers rather than as artefacts.
 */

import { mkdir, readdir, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { createServer } from 'vite'

const OUT_DIR = new URL('../docs/images/', import.meta.url)
const PAGE = 'shots.html'

const FROZEN_NOW = '2026-07-24T09:41:00+02:00'
const TIME_ZONE = 'Europe/Warsaw'
/** `en-US`, to match the `language: 'en'` that `mock-hass.ts` reports to the cards. */
const LOCALE = 'en-US'
/** Retina, so the images stay sharp when a README column scales them down. */
const SCALE = 2

const server = await createServer({ logLevel: 'warn' })
await server.listen()

const origin = server.resolvedUrls?.local?.[0]
if (!origin) {
  await server.close()
  throw new Error('Vite started without a local URL to point the browser at.')
}

const browser = await chromium.launch()
const context = await browser.newContext({
  deviceScaleFactor: SCALE,
  timezoneId: TIME_ZONE,
  locale: LOCALE,
  // Wide enough that the gallery lays out in rows rather than one very tall column;
  // irrelevant to the images themselves, since each is clipped to its own frame.
  viewport: { width: 1600, height: 1200 },
})

const page = await context.newPage()

const failures = []
page.on('pageerror', error => failures.push(`page error: ${error.message}`))
page.on('console', message => {
  if (message.type() === 'error') failures.push(`console error: ${message.text()}`)
})

try {
  await page.clock.setFixedTime(new Date(FROZEN_NOW))
  await page.goto(new URL(PAGE, origin).href, { waitUntil: 'load' })
  await page.waitForFunction(
    () => window.__SHOTS_READY__ === true || typeof window.__SHOTS_ERROR__ === 'string',
    undefined,
    { timeout: 30_000 },
  )

  const refused = await page.evaluate(() => window.__SHOTS_ERROR__)
  if (refused) throw new Error(`${PAGE} refused to be photographed:\n${refused}`)

  // `ha-card` carries `transition: all .3s` inside its own shadow root, where a style tag
  // injected into the document cannot reach it. Cheaper to outwait than to defeat.
  await page.waitForTimeout(400)

  const shots = await page.evaluate(() => window.__SHOTS__ ?? [])
  if (shots.length === 0) throw new Error(`${PAGE} produced no shots.`)

  await mkdir(OUT_DIR, { recursive: true })

  for (const shot of shots) {
    const file = new URL(`${shot.name}.png`, OUT_DIR)
    await page.locator(`#shot-${shot.name}`).screenshot({ path: fileURLToPath(file) })
    console.log(`docs/images/${shot.name}.png  ${shot.width}×${shot.height} @${SCALE}x`)
  }

  // A shot dropped from the manifest leaves a file behind, and a README still pointing at
  // it looks fine right up until the day somebody notices the card in it is two versions
  // old. Only PNGs, and only ones the manifest no longer claims.
  const claimed = new Set(shots.map(shot => `${shot.name}.png`))
  for (const entry of await readdir(OUT_DIR)) {
    if (!entry.endsWith('.png') || claimed.has(entry)) continue
    await unlink(new URL(entry, OUT_DIR))
    console.log(`removed orphan  docs/images/${entry}`)
  }

  if (failures.length > 0) {
    console.error(`\nThe page reported problems:\n${failures.map(line => `  ${line}`).join('\n')}`)
    process.exitCode = 1
  }
} finally {
  await browser.close()
  await server.close()
}
