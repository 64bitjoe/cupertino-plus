/**
 * How much of the box the three sizes draw, and the arithmetic behind the one piece of
 * real drawing in this card: the daily range bar.
 *
 * **The bars share one scale across the whole week, and that is the decision this module
 * exists to carry.** Each day's bar spans that day's own low to high, but it is positioned
 * against the week's overall low-to-high range, not against itself — so a 90° day sits
 * visibly to the right of a 67° one, and the seven rows can be read against each other at
 * a glance the way a real 10-day forecast rewards. A bar scaled to its own day's range
 * would always run edge to edge: every row identical, telling you nothing but that each day
 * has a low and a high, which you already knew. `weekRange` computes the one shared scale;
 * `spanFor` is the only thing allowed to turn a day into a fraction of it, and it always
 * takes that scale as an argument rather than deriving one of its own — there is no
 * "per-day" overload to reach for by mistake.
 *
 * Two guards ride along with that decision, and both are real rather than defensive
 * padding:
 *
 *   - **A flat day** (`high === low`, a day the forecast reports as one steady reading)
 *     would compute a zero-width bar and vanish from a row that otherwise looks just like
 *     its neighbours. `spanFor` floors the width instead, so the day still draws a mark.
 *   - **A flat week** (every day the same, or a single day handed to `weekRange` alone)
 *     has a spread of zero, and dividing by it is `NaN`, not a small number. `spanFor`
 *     checks for that before it divides and answers a mark at the one point the week
 *     actually has, rather than a bar that silently disappears from every row at once.
 *
 * `packFor` answers the other question the box asks: how much content fits it at all.
 * `small` and `medium` are fixed by the spec's own table (spec §3) — the hourly strip is
 * always six columns once it is drawn at all, never fewer for a narrower card — so only
 * `large`'s daily list is actually priced against the height. See `packFor`'s own comment
 * for the one thing its signature does not do: know how many days were actually forecast.
 *
 * Every number below is in **design units**, pixels at `scale: 1`, exactly as in the
 * battery and complication cards' own geometry sections: the measured box is divided by
 * the scale factor once, at the top, and everything after that is priced against the CSS
 * as written. Each constant mirroring a real length names its twin — either an existing
 * `--cw-*` token, or the rule Task 6/7 have yet to write. Where it is the latter, the
 * comment says so plainly: those two numbers (`HEADER`, `DAY_ROW`) are built from the type
 * scale the spec's own content table implies, in the same position `calendar/layout.ts`'s
 * `DATE_BLOCK` was in before the calendar card existed to measure — and whichever of Task 6
 * or 7 draws to a different total owes this file the correction, not a silent mismatch.
 */

import type { WeatherDay } from './model'
import type { WidgetLayout } from '../../core/size'

export interface Box {
  width: number
  height: number
}

export interface WeatherPack {
  /** Hourly strip columns. 0 when the strip is not drawn at all. */
  hours: number
  /** Daily rows. 0 when the daily list is not drawn at all. */
  days: number
}

// ---- Geometry, in design units. Each names its twin. ---------------------------------

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/**
 * The border `ha-card` draws, top and bottom, left and right.
 *
 * Taken off in real pixels before the box is divided by the scale, for the reason the
 * battery card's own `BORDER` gives: Home Assistant draws it at 1px whatever the widget
 * inside is scaled to, so it is not one of the lengths the factor moves.
 */
const BORDER = 1

/**
 * Must match `--cw-space-3` (12px unscaled): the gap between the card's stacked sections
 * — current conditions, the hourly strip, the daily list — and, doing double duty, the
 * gap between one daily row and the next. One constant for both rather than two, because
 * both are the same visual rhythm: a section break reads the same whether the two things
 * either side of it are "the header and the list" or "Tuesday and Wednesday".
 */
const GAP = 12

/**
 * Hourly columns once the strip is drawn at all — always six, at both `medium` and
 * `large`. Not computed from the box's width the way the battery ring's column count is:
 * spec §3's own table fixes it ("six columns of hour, glyph, temperature"), so widening
 * the card gives each column more room rather than adding a seventh. `packFor` still takes
 * `box`, because `large`'s day count needs it; `hours` simply never reads it.
 */
const HOURS = 6

/**
 * Everything `large` draws above the daily list: the small-size content (a location line,
 * the big current temperature, one line of condition text) plus the medium-size hourly
 * strip beneath it. Nothing has rendered either of those yet — Task 6 writes that markup
 * after this module exists — so, unlike the battery card's `LABEL_WIDTH`, this is not a
 * number pulled off a running card in a harness. It is added up from the type styles the
 * content is specified to use, the same position `calendar/layout.ts`'s `DATE_BLOCK` was
 * in and the same kind of answer:
 *
 *   current conditions   `--cw-text-footnote` (18) + `--cw-text-large-title` (41) +
 *                         `--cw-text-footnote` (18), with two `--cw-space-1` (4) gaps
 *                         between the three stacked lines               = 85
 *   the hourly strip     `--cw-text-caption-2` (13) + a 24-unit glyph — roughly `mdi`'s
 *                         own default icon size, plainly legible across six columns —
 *                         + `--cw-text-footnote` (18), with two more `--cw-space-1` (4)
 *                         gaps                                          = 63
 *   between the two      `GAP`                                         = 12
 *                                                                  total = 160
 *
 * Task 6 and 7 draw to this total or come back and raise or lower it; either is a one-line
 * fix here, and the alternative — a card whose daily rows are priced against a header that
 * does not match the one actually drawn — is the silent-mismatch bug the module comment
 * warns about.
 */
const HEADER = 160

/**
 * One daily row: day label, glyph, low reading, the range bar, high reading, all on one
 * line. Sized to the same 24-unit glyph `HEADER`'s hourly strip uses, plus two design
 * units of breathing room above and below it — a list of six or more of these rows reads
 * as cramped without it, where the hourly strip gets away with none because it is a single
 * row rather than a stack of them.
 *
 * **Reconciled against real CSS, unlike when this comment was first written** (see the
 * module comment's own note on `HEADER`/`DAY_ROW` being reasoned estimates until Task 6/7
 * existed to check them against): `weather-card.ts`'s `.daily > *` rule gives every cell
 * in a row `min-height: calc(28px * var(--cw-scale))`, so the 24-unit glyph centred inside
 * it by `align-items: center` gets exactly the two units of breathing room above and below
 * this comment already claimed — 24 + 2 + 2 = 28, built to match rather than measured
 * after the fact, and correct for the same reason `HEADER`'s reconciliation was: nothing
 * in that row is taller than the glyph, so the row's content never asks for more than the
 * height this constant already promises `packFor` it would take.
 */
const DAY_ROW = 28

// ---- Packing --------------------------------------------------------------------------

/**
 * How much of the box each size actually draws.
 *
 * `small` and `medium` are fixed by the spec's table and need no geometry at all. `large`
 * prices its daily list against whatever height is left once `HEADER` is spent, the same
 * "how many rows fit" arithmetic `calendar/layout.ts`'s `rowsIn` and the battery card's own
 * row cap use, floored at 0 rather than going negative for a box too short to hold `HEADER`
 * in the first place.
 *
 * **`days` is not bounded by how many days were actually forecast, and that is a decision,
 * not an oversight.** This function's signature — `packFor(layout, box, scale?)` — carries
 * no forecast count, on purpose: how much *room* there is and how much *content* there is
 * to fill it are two different questions, and folding the second into this one would mean
 * every future caller of `packFor` has to have a forecast in hand just to ask about the
 * box. The element (Task 6/7) is the one holding `WeatherDay[]`, and it is the one that
 * clamps: `Math.min(pack.days, daily.length)`. A `large` card in a very tall section and an
 * entity that only forecasts five days out is exactly the case that split answers for —
 * this function says the box could hold eight, the element still draws five.
 */
export const packFor = (layout: WidgetLayout, box: Box, scale = 1): WeatherPack => {
  if (layout === 'small') return { hours: 0, days: 0 }
  if (layout === 'medium') return { hours: HOURS, days: 0 }

  const height = Math.max(0, (box.height - 2 * BORDER) / scale - 2 * INSET)
  const remaining = Math.max(0, height - HEADER)
  // The last row has no gap under it, hence the `+ GAP` — the same shape as the
  // calendar's own `rowsIn` and the battery card's row cap.
  const days = Math.max(0, Math.floor((remaining + GAP) / (DAY_ROW + GAP)))
  return { hours: HOURS, days }
}

// ---- The range bar ---------------------------------------------------------------------

export interface Span {
  /** Fraction of the track, 0 to 1, from its left edge. */
  start: number
  /** Fraction of the track, 0 to 1. */
  width: number
}

/**
 * The floor a bar's width is never drawn under, as a fraction of the track rather than of
 * the week's degree spread. It has to be a track fraction: `spanFor` never learns how many
 * pixels the track actually rendered at, only the element measuring the card does, so a
 * pixel-sized floor is not a number this function could compute. 4% of a `large` card's
 * typical ~250-unit bar is 10 units — a rounded pill wide enough to read as a mark, not a
 * hairline that a 1px border would round away.
 */
const FLOOR_WIDTH = 0.04

/**
 * The week's overall low and high, across every day handed to it — the one shared scale
 * every day's bar is positioned against. See the module comment for why sharing it is the
 * entire point of the range bar.
 *
 * An empty list answers a zero-width week rather than the `Infinity`/`-Infinity` a naive
 * `Math.min`/`Math.max` over nothing would produce: `spanFor`'s own zero-spread guard
 * then takes over for whatever gets called against it, the same as a real flat week does.
 */
export const weekRange = (days: WeatherDay[]): { min: number; max: number } => {
  if (days.length === 0) return { min: 0, max: 0 }
  let min = Infinity
  let max = -Infinity
  for (const day of days) {
    min = Math.min(min, day.low)
    max = Math.max(max, day.high)
  }
  return { min, max }
}

/**
 * Where `day`'s bar sits on `week`'s shared scale, as fractions of the track — 0 to 1, so
 * the element multiplies by 100 for a CSS percentage and this module never knows about
 * pixels.
 *
 * The two guards from the module comment live here, because this is the only place either
 * one can bite:
 *
 *   - `week.max === week.min` (a flat week, or `weekRange` handed nothing) means dividing
 *     by the spread is dividing by zero. Answered with a floor-width mark at the track's
 *     one meaningful point (its start) rather than `NaN` leaking into a CSS `left`/`width`
 *     and drawing nothing at all.
 *   - A width under `FLOOR_WIDTH` (including exactly 0, a day whose `high` equals its
 *     `low`) is raised to it, so a steady day still draws a visible mark instead of
 *     vanishing from its own row.
 *
 * Raising the width can push `start + width` past the track's right edge — a day pinned to
 * the top of the week's range has nowhere to grow but left — so the start is pulled back
 * just far enough to keep the whole mark on the track, never past 0 the other way.
 */
export const spanFor = (day: WeatherDay, week: { min: number; max: number }): Span => {
  const spread = week.max - week.min
  if (spread <= 0) return { start: 0, width: FLOOR_WIDTH }

  const start = (day.low - week.min) / spread
  const width = Math.max((day.high - day.low) / spread, FLOOR_WIDTH)
  return { start: Math.max(0, Math.min(start, 1 - width)), width }
}
