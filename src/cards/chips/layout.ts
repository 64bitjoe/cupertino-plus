/**
 * How tall a row of chips is, and how much box the card must be allowed to have.
 *
 * Deliberately small next to the other cards' layout modules, because this card gives most of
 * the job away: chips are content-width and CSS `flex-wrap` decides which of them lands on
 * which line, against text metrics no module running in node can see. Guessing at those and
 * then rendering with `flex-wrap` anyway would produce two answers that disagree, and the one
 * the user sees would be the CSS.
 *
 * What cannot be given away is the floor. `getGridOptions()` is answered before anything is
 * measured, and if it under-reports, Home Assistant hands the card a box too short for its own
 * content and `ha-card` clips the overflow — the failure the complication card's §5 exists to
 * prevent, where a chip is not drawn small, it is simply not drawn. So this module prices the
 * floor against a nominal chip width and errs generous.
 *
 * Every number is a design unit: pixels at `scale: 1`, matching the stylesheet in
 * `chips-card.ts` multiplied by `var(--cw-scale)`.
 */

import { columnsFor, gridColumnsToPx, rowsFor, type Floors } from '../../core/floors'
import { DEFAULT_CONTENT, type ChipContent, type ChipView } from './model'

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/** The gap between one chip and the next, both across and down. Must match `--cw-space-2`. */
const GAP = 8

/**
 * A one-line chip's row height.
 *
 * The pill itself draws at 30 units, and this is 44, which is not a mistake: a press can now
 * toggle a light, so the chip is a real touch target and 44 is the floor for one. The extra
 * 14 units are hit box, not paint — see `.chip` in the card's stylesheet, where the pill is
 * centred inside a taller pressable box. Pricing the row at the target rather than at the
 * pill is what stops two lines of chips from overlapping each other's targets.
 */
export const ROW_SINGLE = 44

/**
 * A `labeled` chip's row height: caption (11) over reading (17) with a 2-unit gap, plus the
 * pill's own vertical padding, comes to 48 — past the tap-target floor on its own.
 */
export const ROW_LABELED = 48

/**
 * A nominal chip width per content mode, for the floor arithmetic only.
 *
 * Not measured and not measurable here: a chip is as wide as its name and reading, which
 * depend on the font, the locale and the entity. These are the widths of a typical chip of
 * each kind at `scale: 1` — a glyph and a short reading — and they are used for one purpose,
 * to estimate how many chips share a line. A real row that runs wider than the estimate wraps
 * one chip earlier than the floor predicted, which costs a line of height the floor already
 * allowed for elsewhere; the error is bounded and it points the safe way.
 */
const NOMINAL_WIDTH: Record<ChipContent, number> = {
  icon: 52,
  value: 96,
  labeled: 128,
}

/**
 * The tallest content mode in the card, which every chip in it draws at.
 *
 * One `labeled` chip promotes the whole row rather than standing a head above its neighbours
 * — the same instinct as the battery card refusing to draw a full row with a stub beneath it.
 * An empty card answers the default rather than throwing, because `getGridOptions()` is called
 * on a card with no entities yet, the moment it is dropped from the picker.
 */
export const bandFor = (chips: readonly ChipView[]): ChipContent => {
  if (chips.some(chip => chip.content === 'labeled')) return 'labeled'
  if (chips.some(chip => chip.content === 'value')) return 'value'
  return chips.length === 0 ? DEFAULT_CONTENT : 'icon'
}

export const rowHeightFor = (band: ChipContent): number =>
  band === 'labeled' ? ROW_LABELED : ROW_SINGLE

/**
 * The widest the floor pretends a card is: three nominal chips side by side.
 *
 * This is the number that makes the whole floor honest, and getting it wrong breaks the
 * guarantee in both directions, so it is worth spelling out.
 *
 * The row floor has to be computed against the *narrowest* box the user can reach, because
 * that is the box that wraps onto the most lines — price the height against a wide card and a
 * user who drags it narrow gets more lines than the floor allowed and `ha-card` clips them,
 * which is the exact failure §5 exists to prevent. But "narrowest reachable" is itself set by
 * `min_columns`, which this function also chooses, so a floor computed against a one-chip
 * width would be self-fulfilling: twelve chips at one per line is ten grid rows of height, and
 * because `withFloors` raises the *default* rows to the floor, a freshly dropped card would
 * arrive as a tall column nobody asked for.
 *
 * Three is the resolution. A multi-chip card cannot be dragged narrower than three chips
 * across, and the height is priced at exactly that width — so the floors are reachable, the
 * card cannot be narrowed into clipping, and a twelve-chip row lands at four rows rather than
 * ten. A card with one or two chips floors at its own width, since there is nothing to wrap.
 */
const FLOOR_CHIPS_ACROSS = 3

/**
 * The floor: wide enough that the chips cannot be crushed into a column, and tall enough for
 * every line they wrap onto at exactly that width.
 */
export const floorsFor = (chips: readonly ChipView[]): Floors => {
  const band = bandFor(chips)
  const width = NOMINAL_WIDTH[band]

  const across = Math.min(Math.max(chips.length, 1), FLOOR_CHIPS_ACROSS)
  const min_columns = columnsFor(across * width + (across - 1) * GAP + 2 * INSET)

  if (chips.length === 0) return { min_columns, min_rows: 1 }

  const usable = Math.max(width, gridColumnsToPx(min_columns) - 2 * INSET)
  const perLine = Math.max(1, Math.floor((usable + GAP) / (width + GAP)))
  const lines = Math.ceil(chips.length / perLine)
  const content = lines * rowHeightFor(band) + (lines - 1) * GAP + 2 * INSET

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}
