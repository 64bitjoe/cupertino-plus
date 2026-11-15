/**
 * A room tile's status glyphs: the little tinted pills under a room's name in Apple's Home app.
 *
 * `summary_style: icons` splits a room's summary in two. What is a value (the temperature, the
 * humidity, a template's Reading) stays words on the state line, because "21°" is already as
 * short as a glyph and a number with no unit beside a thermometer says no more. What is a status
 * or a count (a window open, three lights on, a lock unlocked, a leak) becomes a glyph in a row
 * under the text, with its count beside it when there is more than one: a bulb and a 3.
 *
 * Pure: which glyphs, in what order, with what count, and how many fit a tile of a given width.
 * The element draws the answer and does no arithmetic of its own, so a tile cannot clip a glyph
 * in half: this file decides what is drawn whole and what is folded into a "+2".
 *
 * Every width is a design unit, pixels at `scale: 1`, matching the stylesheet in
 * `tiles-card.ts`, which multiplies each by `var(--cw-scale)`.
 */

import type { SummaryItem, SummaryItemPart } from '../../core/area-summary'
import { tintVar, type TintName } from '../../core/tint'
import { PART_TINTS } from '../chips/model'
import type { TileOrientation } from './model'
import { oneOf } from '../../core/one-of'

/**
 * How a room tile tells its summary: as one line of words (`words`, every room tile before this
 * key, and the default so no config changes under anybody), or as a row of glyphs under a state
 * line that keeps only the values (`icons`).
 */
export const SUMMARY_STYLES = ['words', 'icons'] as const

export type SummaryStyle = (typeof SUMMARY_STYLES)[number]

export const DEFAULT_SUMMARY_STYLE: SummaryStyle = 'words'

/** The tile's `summary_style`, or the default for anything else; silent, as `washFor` is. */
export const summaryStyleFor = (value: unknown): SummaryStyle =>
  oneOf(SUMMARY_STYLES, value, DEFAULT_SUMMARY_STYLE)

/**
 * The parts that stay words under `icons`: readings, which a glyph would only repeat. Every
 * other part is a status, and becomes a glyph.
 */
export const WORD_PARTS: readonly SummaryItemPart[] = ['temperature', 'humidity']

/** The parts that can be counted: a glyph carries its count once there is more than one. */
const COUNTED_PARTS: readonly SummaryItemPart[] = ['alerts', 'open', 'locks', 'lights', 'media']

/** One glyph, ready to draw. */
export interface TileGlyph {
  part: SummaryItemPart
  icon: string
  /** Drawn beside the glyph; absent for one of a thing, where the glyph alone says it. */
  count?: number
  /** A user's own icon's few characters, drawn where a count would go. */
  text?: string
  /** A CSS colour: the part's tint, red for an alert. */
  tint: string
  alert: boolean
  /** The summary's own words for it ("2 Windows Open"), for the tile's accessible name. */
  label: string
}

/**
 * The tint of a glyph. The Home app's colours, which the room chips already use: a thermostat
 * that is cooling is the one departure, blue rather than climate's orange, because a snowflake
 * drawn orange reads as a fault.
 */
const glyphTint = (item: SummaryItem): string => {
  if (item.alert) return tintVar('red')
  if (item.color !== undefined) return item.color
  const tint: TintName =
    item.part === 'climate' && item.icon === 'mdi:snowflake' ? 'blue' : PART_TINTS[item.part]
  return tintVar(tint)
}

/**
 * A room's summary, split: the words that stay on the state line, and the glyphs under it. The
 * summary is already in the Home app's order, which puts alerts first, so the glyphs are too.
 */
export const splitSummary = (
  items: readonly SummaryItem[],
): { words: SummaryItem[]; glyphs: TileGlyph[] } => {
  const words: SummaryItem[] = []
  const glyphs: TileGlyph[] = []
  for (const item of items) {
    if (WORD_PARTS.includes(item.part)) {
      words.push(item)
      continue
    }
    const count = item.entities.length
    glyphs.push({
      part: item.part,
      icon: item.icon,
      ...(COUNTED_PARTS.includes(item.part) && count > 1 ? { count } : {}),
      ...(item.badge !== undefined ? { text: item.badge } : {}),
      tint: glyphTint(item),
      alert: item.alert,
      label: item.text,
    })
  }
  return { words, glyphs }
}

/**
 * The glyph row's numbers. A pill is 18 tall, its icon 12, set in caption 2 (11 units) at a
 * semibold weight with tabular figures, so every digit is the same width and a 1 becoming a 2
 * never nudges the pills after it. The stylesheet in `tiles-card.ts` draws these exact sizes.
 */
export const GLYPH_HEIGHT = 18
/** A glyph with no count: a circle around its icon. */
export const GLYPH_ICON_WIDTH = 18
/** The icon, its 2 gap to the figure, and the pill's 4 and 6 sides. */
const GLYPH_COUNTED_BASE = 4 + 12 + 2 + 6
/** One tabular figure of semibold caption 2, rounded up. "+" is priced as a figure too. */
export const GLYPH_DIGIT = 7
/** Between two pills. */
export const GLYPH_GAP = 4
/** What the row adds to a tile: the pills, and the space between them and the state line. */
export const GLYPH_ROW_HEIGHT = GLYPH_HEIGHT + 4

const digits = (count: number): number => String(count).length

/** One glyph's width, as the stylesheet draws it. */
export const glyphWidth = (glyph: Pick<TileGlyph, 'count' | 'text'>): number =>
  glyph.text !== undefined
    ? GLYPH_COUNTED_BASE + [...glyph.text].length * GLYPH_DIGIT
    : glyph.count === undefined
      ? GLYPH_ICON_WIDTH
      : GLYPH_COUNTED_BASE + digits(glyph.count) * GLYPH_DIGIT

/** The "+2" pill: a plus and the figures, in a pill of the same sides. */
export const moreWidth = (hidden: number): number => 6 + 6 + (1 + digits(hidden)) * GLYPH_DIGIT

/** The glyphs drawn, and how many are folded into the "+N" after them (0 for none). */
export interface FittedGlyphs {
  shown: TileGlyph[]
  more: number
}

/**
 * As many glyphs as fit `budget` whole, from the front, and a "+N" for the rest.
 *
 * From the front because the order is the Home app's, most urgent first: a leak is never the
 * glyph folded away. A "+N" takes its own room, so once anything is hidden the row is fitted
 * again with that pill priced in, which may fold one more. Never clips: when not even one glyph
 * and the pill fit, the pill alone says there is something, and the tile's label says what.
 */
export const fitGlyphs = (glyphs: readonly TileGlyph[], budget: number): FittedGlyphs => {
  const widthOf = (list: readonly TileGlyph[]): number =>
    list.reduce((sum, glyph, index) => sum + glyphWidth(glyph) + (index > 0 ? GLYPH_GAP : 0), 0)
  if (widthOf(glyphs) <= budget) return { shown: [...glyphs], more: 0 }
  for (let keep = glyphs.length - 1; keep > 0; keep -= 1) {
    const shown = glyphs.slice(0, keep)
    const hidden = glyphs.length - keep
    if (widthOf(shown) + GLYPH_GAP + moreWidth(hidden) <= budget) return { shown, more: hidden }
  }
  return { shown: [], more: glyphs.length }
}

/**
 * How wide the glyph row may be in a tile of `width`: the tile less its two 12 paddings, and in
 * a horizontal tile less the glyph and its 10 gap as well, since the row sits under the text.
 */
export const glyphBudget = (width: number, orientation: TileOrientation): number =>
  width - 2 * 12 - (orientation === 'horizontal' ? 24 + 10 : 0)

/** The whole room, in words, for a tile's accessible name: every glyph says what it means. */
export const glyphLabel = (glyphs: readonly TileGlyph[]): string =>
  glyphs.map(glyph => glyph.label).join(', ')
