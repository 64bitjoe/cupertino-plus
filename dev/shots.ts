/**
 * The README's screenshots, as a page a camera can be pointed at.
 *
 * `dev/screenshots.mjs` serves this, freezes the clock, and clips one PNG per entry in
 * `SHOTS` below. So this file is the gallery's edit surface: to change what the README
 * shows, change the list and re-run `pnpm shots`. Nothing else needs touching, and in
 * particular the images are not hand-cropped — a hand-cropped screenshot is a screenshot
 * nobody can reproduce.
 *
 * Deliberately NOT the showcase site. That page exists to be used — sidebar, controls
 * dock, labels under every frame, four footprints of the same card in its Advanced
 * section. This one renders each card once, in a box the sections grid would have given
 * it, with a margin of dashboard around it and no chrome at all.
 *
 * Three rules for anything added here:
 *
 *  - **Only fixtures that read like somebody's real week.** Several scenarios in
 *    `demo-data.ts` exist to probe one layout branch — two events, three events, an
 *    all-day entry on its own — and a day assembled to hit a branch reads as assembled
 *    however plausible its rows are. Those are the right fixtures for the harness and the
 *    wrong ones for a shop window.
 *  - **Only behaviour that actually works.** Reminders render, but nothing feeds them
 *    yet (they want `todo` entities), so a screenshot led by reminders would be
 *    advertising a feature. Fixtures whose reminders sit below the fold are fine.
 *  - **Only the two footprints**, 6×4 and 12×4. See `Shot.columns` below.
 */

import '../src/index'
import './ha-theme.css'
import './shots.css'

import type { LitElement } from 'lit'

import { CALENDAR_CARD_TAG } from '../src/index'
import { columnsToPx, layoutFromBox, rowsToPx } from '../src/core/size'
import type { LovelaceCard } from '../src/core/types/ha'
import { defineHaStubs } from './ha-stubs'
import { createMockHass } from './mock-hass'

defineHaStubs()

/**
 * The width of the dashboard section the cards are being boxed in.
 *
 * 500 is the usual figure for a section on a desktop dashboard, and it is what makes the
 * footprints below come out at the two shapes Apple's widgets have: 12 columns of it is
 * 500px and 6 is 246px, against a 4-row height of 248px. So `medium` lands on the 2:1
 * and `small` on the square, which is the pairing the README is trying to show.
 */
const SECTION_WIDTH = 500

/** Dashboard left visible around the card, so its rounded corners have something to sit on. */
const SHOT_MARGIN = 20

interface Shot {
  /** File stem under `docs/images/`. */
  name: string
  /** Printed beside the frame on this page. Never inside it — see `shots.css`. */
  caption: string
  /** A key from `demo-data.ts`'s scenarios. */
  scenario: string
  /**
   * The footprint, in the Layout tab's own units, and **only ever 6×4 or 12×4 here.**
   *
   * Those are the two Apple shapes — the square and the 2:1 — and they are what a
   * screenshot is for. Everything between them lays out perfectly well, which is the
   * point of measuring the box rather than reading a preset, but the in-between
   * footprints are the flexibility rather than the design: shipping one in the README
   * would present a shape nobody was aiming for as the shape to aim for. Show the two,
   * and let the Layout tab be discovered as the thing that also permits the rest.
   */
  columns: 6 | 12
  rows: 4
  theme: 'light' | 'dark'
}

const SHOTS: readonly Shot[] = [
  {
    name: 'calendar-medium',
    caption: 'medium — a full day, and what follows it',
    scenario: 'default',
    columns: 12,
    rows: 4,
    theme: 'light',
  },
  {
    name: 'calendar-small',
    caption: 'small — today only, led by an all-day event',
    scenario: 'all-day-busy',
    columns: 6,
    rows: 4,
    theme: 'light',
  },
  {
    name: 'calendar-empty-today',
    caption: 'medium — nothing today, so the flow starts in the second column',
    scenario: 'today-empty',
    columns: 12,
    rows: 4,
    theme: 'light',
  },
  {
    name: 'calendar-dark',
    caption: 'medium, dark — tomorrow is empty and gets skipped',
    scenario: 'skip-empty-day',
    columns: 12,
    rows: 4,
    theme: 'dark',
  },
]

/** What `screenshots.mjs` needs to know: one entry per file it is about to write. */
export interface ShotHandle {
  name: string
  /** CSS px of the clipped frame — the `width` the README should pin the `<img>` to. */
  width: number
  height: number
}

declare global {
  interface Window {
    /** Filled as the page builds; read by `screenshots.mjs` to drive the camera. */
    __SHOTS__?: ShotHandle[]
    /** Set once every card has settled into the layout its box implies. */
    __SHOTS_READY__?: boolean
    /** Why the page gave up, if it did. Turns a camera timeout into a real message. */
    __SHOTS_ERROR__?: string
  }
}

const handles: ShotHandle[] = []
const settling: {
  card: LitElement
  layout: string
  name: string
  /** The box the card is supposed to end up filling, exactly. */
  box: { width: number; height: number }
}[] = []

for (const shot of SHOTS) {
  const width = Math.round(columnsToPx(shot.columns, SECTION_WIDTH))
  const height = rowsToPx(shot.rows)

  const figure = document.createElement('div')
  figure.className = 'shot'

  const frame = document.createElement('div')
  frame.className = `frame theme-${shot.theme}`
  frame.id = `shot-${shot.name}`
  frame.style.setProperty('--shot-margin', `${SHOT_MARGIN}px`)

  const slot = document.createElement('div')
  slot.className = 'slot'
  slot.style.width = `${width}px`
  slot.style.height = `${height}px`

  const card = document.createElement(CALENDAR_CARD_TAG) as LovelaceCard
  // `hass` first, then `setConfig` — the order Home Assistant uses.
  card.hass = createMockHass({ dark: shot.theme === 'dark', timeFormat: '12' })
  card.setConfig({ type: CALENDAR_CARD_TAG, demo_scenario: shot.scenario })

  const caption = document.createElement('div')
  caption.className = 'caption'
  caption.textContent = `${shot.name} — ${shot.caption} · ${width}×${height}`

  slot.append(card)
  frame.append(slot)
  figure.append(frame, caption)
  document.body.append(figure)

  handles.push({
    name: shot.name,
    width: width + 2 * SHOT_MARGIN,
    height: height + 2 * SHOT_MARGIN,
  })
  settling.push({
    card: card as unknown as LitElement,
    // Stated rather than read back, so a card that never reaches it is a failed run
    // instead of a screenshot of the wrong layout. `layoutFromBox` is pure, so the
    // answer is knowable before the card has measured anything.
    layout: layoutFromBox(width),
    name: shot.name,
    box: { width, height },
  })
}

window.__SHOTS__ = handles

const nextFrame = (): Promise<void> =>
  new Promise(resolve => {
    requestAnimationFrame(() => resolve())
  })

/**
 * Wait until every card is drawing the layout its box implies, and until the fonts it is
 * measured in have arrived.
 *
 * Both matter, and for the same reason: a card starts at `DEFAULT_LAYOUT` and only learns
 * its real shape when the ResizeObserver reports, a frame later. A camera that fired on
 * `load` would catch the medium layout inside a small box — reliably, and only in the
 * one place nobody looks before committing. So the page says when it is ready rather
 * than the script guessing with a sleep.
 */
const settle = async (): Promise<void> => {
  await document.fonts.ready

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await nextFrame()
    await Promise.all(settling.map(({ card }) => card.updateComplete))

    const pending = settling.filter(({ card, layout }) => card.getAttribute('cw-layout') !== layout)
    if (pending.length === 0) return
    if (attempt === 119) {
      throw new Error(
        `never settled: ${pending.map(({ name, layout }) => `${name} wanted ${layout}`).join(', ')}`,
      )
    }
  }
}

/**
 * The card must have ended up filling its slot exactly.
 *
 * Worth asserting rather than trusting, because the way this goes wrong is silent and
 * plausible: the card declares no width of its own and stretches only because a block
 * child does, so one `display: flex` on the slot shrinks it to its content and the
 * screenshot is simply a bit narrow. It still shows the right layout, the right fixtures
 * and the right theme, which is exactly why nobody notices — the wide footprint hides it
 * completely, since its content fills the space anyway.
 */
const checkBoxes = (): void => {
  const wrong = settling
    .map(({ card, name, box }) => {
      const actual = card.getBoundingClientRect()
      const off = Math.abs(actual.width - box.width) > 1 || Math.abs(actual.height - box.height) > 1
      return off
        ? `${name}: wanted ${box.width}×${box.height}, filled ` +
            `${Math.round(actual.width)}×${Math.round(actual.height)}`
        : undefined
    })
    .filter(line => line !== undefined)

  if (wrong.length > 0) {
    throw new Error(`cards did not fill their slots:\n  ${wrong.join('\n  ')}`)
  }
}

try {
  await settle()
  checkBoxes()
  window.__SHOTS_READY__ = true
} catch (error) {
  // Reported rather than only thrown, so the run fails with the reason instead of with
  // `screenshots.mjs` timing out on a flag that was never going to arrive.
  window.__SHOTS_ERROR__ = error instanceof Error ? error.message : String(error)
  throw error
}
