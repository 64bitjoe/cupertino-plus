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
import { DEFAULT_CONTENT, type ChipContent } from './model'

/**
 * The one thing `bandFor`/`floorsFor` actually read off a chip: its content mode. Both a
 * full `ChipView` and a bare config row satisfy this, and that is the point of stating it
 * narrowly — the floor arithmetic below prices only `.content` and the array's own
 * `.length`, neither of which depends on `hass`, and the parameter type says so rather than
 * merely happening to be true of whatever `ChipView[]` was passed historically.
 */
export interface ChipBand {
  content: ChipContent
  /** True for a chip that starts a new row. See `groupRows`. */
  break?: boolean
  /** True for a chip that absorbs the row's leftover width rather than claiming a width. */
  fill?: boolean
}

/**
 * The chips split into the rows they were asked to be drawn on.
 *
 * A chip carrying `break` starts a new row; everything else joins the row before it. The card
 * renders one flex container per group and the floor below prices each group's own wrapping,
 * so the two agree about how many lines there are — which they must, or a card with forced
 * rows would be handed a box too short and clip the difference.
 *
 * A `break` on the very first chip is ignored rather than honoured into a leading empty row:
 * every chip starts a row when it is the first one, so the flag says nothing there. That
 * matters more than it sounds, because dragging a chip to the top is how a config acquires
 * one, and an empty row would be 44 units of unexplained gap above the card's content.
 */
export const groupRows = <T extends ChipBand>(chips: readonly T[]): T[][] => {
  const rows: T[][] = []
  for (const chip of chips) {
    if (chip.break === true && rows.length > 0) rows.push([chip])
    else if (rows.length === 0) rows.push([chip])
    else (rows[rows.length - 1] as T[]).push(chip)
  }
  return rows
}

/**
 * Must match `--cw-inset`, the padding inside the card — in `card` mode.
 *
 * `glass` paints no surface, so it insets by nothing at all and passes `0` here: there is no
 * edge for the content to be held away from, and the 32 units this would otherwise add
 * vertically are the difference between a single row of chips fitting in one grid row (44 of
 * 56) and needing two (76). A card padded away from a box nobody can see is just a taller card.
 */
export const INSET = 16

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
export const bandFor = (chips: readonly ChipBand[]): ChipContent => {
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
 * every line they wrap onto.
 *
 * `measured` is the card's own rendered width in design units, once the ResizeObserver has
 * reported one. Passing it is what stops this from over-reporting, and the difference is not
 * marginal: without it the lines are counted against `ASSUMED_SECTION_WIDTH`'s idea of the box
 * — a 9-column card in a 500px section, 341 units of usable width — and a card sitting in a
 * genuinely wider section is handed an empty grid row for every line that estimate invented.
 * Five chips that visibly share one line were being priced at two.
 *
 * The trade this accepts, stated plainly because the previous version accepted the opposite
 * one: pricing against the real width means a card dragged NARROWER than it was measured at
 * wraps onto more lines than the floor allowed, and clips until the observer reports and this
 * recomputes. That window is one frame of a deliberate resize. The window it replaces was
 * permanent, visible on first paint, and is what somebody actually reported.
 */
export const floorsFor = (
  chips: readonly ChipBand[],
  measured?: number,
  inset: number = INSET,
): Floors => {
  const band = bandFor(chips)

  const across = Math.min(Math.max(chips.length, 1), FLOOR_CHIPS_ACROSS)
  const min_columns = columnsFor(across * NOMINAL_WIDTH[band] + (across - 1) * GAP + 2 * inset)

  if (chips.length === 0) return { min_columns, min_rows: 1 }

  const usable = Math.max(
    NOMINAL_WIDTH.icon,
    (measured ?? gridColumnsToPx(min_columns)) - 2 * inset,
  )

  // Each configured row wraps on its own, so the lines are the sum of each row's own wrapping
  // rather than of the whole list's — a card using `break` split one-and-two is two lines, not
  // one, and an under-reported floor is the clipping this module exists to prevent.
  //
  // Within a row the chips are packed at their OWN nominal widths rather than all at the
  // band's. The band is the tallest mode present, so pricing every chip at it charged an
  // icon-only chip 96 units for the 52 it takes — and now that a chip actually draws its own
  // content (rather than the band's, which was a bug), that overcharge has no excuse left.
  const lines = groupRows(chips).reduce((total, row) => {
    let used = 0
    let rowLines = 1
    for (const chip of row) {
      // A filling chip is elastic: it takes what is left over and collapses when there is
      // nothing to take, so it can never be the thing that pushes a line onto the next one.
      // Charging it a nominal width would invent a line the browser will not draw.
      if (chip.fill === true) continue
      const width = NOMINAL_WIDTH[chip.content]
      const need = used === 0 ? width : used + GAP + width
      if (need > usable && used > 0) {
        rowLines += 1
        used = width
      } else {
        used = need
      }
    }
    return total + rowLines
  }, 0)

  const content = lines * rowHeightFor(band) + (lines - 1) * GAP + 2 * inset

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}
