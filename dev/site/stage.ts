/**
 * The things on the stage that outlive a render.
 *
 * The page redraws itself from scratch whenever anything changes, which is fine for
 * labels and buttons and wrong for three sorts of element: a card, which holds its own
 * subscription and its own measurement; the drag-to-resize box, whose size lives in the
 * inline style the browser's resize handle writes, so recreating it would snap it back;
 * and the visual editor, which Home Assistant's contract says is built once and kept.
 * All three are made here, cached by key, and handed to the templates as nodes:
 * lit-html plants a `Node` value where it finds one and leaves it alone on every
 * subsequent render.
 *
 * The geometry lives here too, because it is the same arithmetic the sections grid does
 * and every panel on the page needs it.
 */

import { LAYOUT_THRESHOLD, columnsToPx, rowsToPx } from '../../src/core/size'
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from '../../src/core/types/ha'
import { widgetConfig, type Args, type Widget } from './catalog'

// ---- Footprints ---------------------------------------------------------------

/** A footprint in the Layout tab's own units: columns of the 12-column grid, and rows. */
export interface Footprint {
  columns: number
  rows: number
}

/**
 * The two shapes the widgets are designed for.
 *
 * Not presets: the cards have none, and neither does their config. These are the two
 * footprints Apple's widgets come in, reached in Home Assistant by dragging in the
 * Layout tab: in a section of the usual 500px, 6 columns is 246px against a 4-row height
 * of 248px, which is the square, and 12 columns is 500px, which is the 2:1.
 */
export const SMALL: Footprint = { columns: 6, rows: 4 }
export const MEDIUM: Footprint = { columns: 12, rows: 4 }

/**
 * Everything between the two, and the edges of what may be dragged to at all.
 *
 * For the Advanced panel, where the question is whether the in-between footprints hold
 * up rather than what the widget is meant to look like. Both floors `gridOptions()` allows
 * are in here: 4 columns, and the 3-row height, which is the one worth looking at with
 * **Scale** turned up, since the date block takes the left column first, so the short
 * footprints are where a scaled-up card runs out of room.
 */
export const ODD_FOOTPRINTS: readonly Footprint[] = [
  { columns: 4, rows: 4 },
  { columns: 6, rows: 4 },
  { columns: 9, rows: 4 },
  { columns: 12, rows: 4 },
  { columns: 6, rows: 3 },
  { columns: 12, rows: 3 },
]

export interface Box {
  width: number
  height: number
}

export const footprintBox = (footprint: Footprint, sectionWidth: number): Box => ({
  width: Math.round(columnsToPx(footprint.columns, sectionWidth)),
  height: rowsToPx(footprint.rows),
})

/**
 * Where the drag box starts: eight pixels short of the threshold.
 *
 * Deliberately on the `small` side of it and only one nudge away, so the first drag
 * anybody makes crosses the line. Start it comfortably inside either layout and the
 * story reads as a third static size rather than as the one place the rule is felt.
 *
 * At 100%, that is, the threshold is compared against design units, so turning Scale down
 * moves the line out from under a box that has not moved and it begins on the wide side
 * instead. Left alone rather than recomputed, because the box's size stops being ours the
 * moment anybody drags it: snapping it back to a fresh start on an unrelated change would
 * undo their drag to preserve a first impression they have already had. The rule is still
 * demonstrable from either side, which is all the box is for.
 *
 * Set as an inline style on the element itself, once, when it is made; never from a
 * template, because the resize handle writes to the same two properties and a template
 * that also owned them would undo every drag on the next render.
 */
export const DRAG_START: Box = { width: LAYOUT_THRESHOLD - 8, height: rowsToPx(4) }

// ---- Cards --------------------------------------------------------------------

/**
 * What one slot does to the config before its card gets it.
 *
 * `props` is what the inspector's controls describe. Most slots pass it straight through and
 * differ only in the box they are drawn in; the editor panel replaces it outright,
 * because the config its card draws is the one the editor is writing.
 */
export type SlotConfig = (props: Partial<LovelaceCardConfig>) => Partial<LovelaceCardConfig>

const passThrough: SlotConfig = props => props

interface Slot {
  card: LovelaceCard
  tag: string
  config: SlotConfig
  /** The last config this card was given, so an unchanged one is not given again. */
  last?: string
}

const slots = new Map<string, Slot>()

/**
 * The card for one slot, made on first ask and kept.
 *
 * Keyed by a name the caller chooses (`story:small`, `odd:9x4`), so a template can ask
 * for the same card on every render without holding a reference to it.
 */
export function slotCard(key: string, tag: string, config: SlotConfig = passThrough): LovelaceCard {
  const existing = slots.get(key)
  if (existing) return existing.card

  const card = document.createElement(tag) as LovelaceCard
  slots.set(key, { card, tag, config })
  return card
}

/** Drops every card. Called when the route changes, so a widget's cards die with it. */
export function clearStage(): void {
  slots.clear()
  drag = undefined
}

/**
 * Push the current config and `hass` into every card on the stage.
 *
 * `hass` first, then `setConfig`: the order Home Assistant uses, and the only one a
 * card that reads `hass` inside `setConfig` would survive.
 *
 * The fixture goes on last, over whatever the slot pinned down, so that changing Data in
 * the inspector still changes what the editor's preview draws. Without that the one card
 * on the page not driven by the inspector would sit there showing yesterday's choice.
 *
 * A card whose config has not actually changed is left alone. `setConfig` stores a fresh
 * object, which is a state change, which is a re-render, and this runs after every
 * render, including the sixty a second that dragging the resize corner produces. Eight
 * cards repainting on each of those for no reason is exactly the jank a page about
 * measuring things cannot afford.
 */
export function syncStage(widget: Widget, args: Args, hass: HomeAssistant): void {
  const props = widgetConfig(widget, args)
  const fixture = widget.toFixture(args)

  for (const slot of slots.values()) {
    slot.card.hass = hass

    const config = { type: slot.tag, ...slot.config(props), ...fixture }
    const stamp = JSON.stringify(config)
    if (slot.last === stamp) continue
    slot.last = stamp
    slot.card.setConfig(config)
  }
}

// ---- The drag-to-resize box ----------------------------------------------------

let drag: HTMLElement | undefined

/** How far one arrow-key press moves an edge: one gap of the sections grid. */
const KEY_STEP = 8

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

/**
 * The limits the box is actually under, read back rather than restated.
 *
 * The floor is Home Assistant's own (4 columns by 3 rows), so it moves with the section
 * width, which means it cannot be a constant here. `site.css` takes it from a custom
 * property the template sets, and this reads the same computed values, so the keyboard
 * and the mouse can never disagree about where the box stops.
 */
const limitsOf = (box: HTMLElement): { minW: number; maxW: number; minH: number; maxH: number } => {
  const style = getComputedStyle(box)
  return {
    minW: parseFloat(style.minWidth) || 0,
    maxW: parseFloat(style.maxWidth) || Number.POSITIVE_INFINITY,
    minH: parseFloat(style.minHeight) || 0,
    maxH: parseFloat(style.maxHeight) || Number.POSITIVE_INFINITY,
  }
}

/**
 * The resizable box, made once, with its card already inside it.
 *
 * `onResize` is handed the measured box on every frame of a drag, and once when the
 * observer is first attached, which is what puts a real number under the box before
 * anyone has touched it.
 */
export function dragBox(card: Node, onResize: (box: Box) => void): HTMLElement {
  if (drag) return drag

  const box = document.createElement('div')
  box.className = 'drag-box'
  box.style.width = `${DRAG_START.width}px`
  box.style.height = `${DRAG_START.height}px`
  box.tabIndex = 0
  // `role="group"` and not a bare div: ARIA forbids naming a generic element, and
  // without a role the label on the one thing this page asks a visitor to operate would
  // simply not be announced.
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', 'Resizable box. Arrow keys resize it by 8 pixels, shift for 1.')
  box.append(card)

  // `resize: both` is a mouse affordance and nothing else, and this box is the one thing
  // on the page anybody is meant to touch. Arrows move an edge by a grid gap, shift by a
  // single pixel: enough to walk up to the threshold and step over it.
  box.addEventListener('keydown', event => {
    const horizontal = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const vertical = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (horizontal === 0 && vertical === 0) return

    event.preventDefault()
    const step = event.shiftKey ? 1 : KEY_STEP
    const rect = box.getBoundingClientRect()
    const limits = limitsOf(box)
    box.style.width = `${clamp(Math.round(rect.width) + horizontal * step, limits.minW, limits.maxW)}px`
    box.style.height = `${clamp(Math.round(rect.height) + vertical * step, limits.minH, limits.maxH)}px`
  })

  new ResizeObserver(entries => {
    const rect = entries[0]?.contentRect
    // Width 0 means the box is not laid out yet; reporting it would flash a nonsense
    // reading into the label for one frame.
    if (!rect || rect.width === 0) return
    onResize({ width: Math.round(rect.width), height: Math.round(rect.height) })
  }).observe(box)

  drag = box
  return box
}
