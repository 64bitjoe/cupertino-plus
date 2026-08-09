/**
 * Everything the page is currently showing, in one object.
 *
 * The site draws itself as a function of this: change a field, and the whole page is
 * re-rendered from it. That is affordable because lit-html diffs, and it is worth it
 * because the alternative (a dozen little update functions, each responsible for
 * remembering which labels its control also changes) is how the old harness ended up
 * with a `layoutPresets()` that had to be called by hand from four places.
 *
 * Nothing here reaches into the DOM. `stage.ts` owns the elements that outlive a render,
 * and the templates own everything else.
 */

import type { HomeAssistant, TimeFormat } from '../../src/core/types/ha'
import { createMockHass } from '../mock-hass'
import {
  CARD_OPTIONS,
  CLOCK,
  ENVIRONMENT,
  SECTION_WIDTH,
  WIDGETS,
  readNumber,
  readString,
  type ArgValue,
  type Args,
  type Control,
  type Widget,
} from './catalog'
import { DRAG_START, type Box } from './stage'

export type Theme = 'light' | 'dark'

interface SiteState {
  theme: Theme
  widget: Widget
  /** Whether the Advanced section is open. Shut on arrival; see `views/canvas.ts`. */
  advanced: boolean
  /** The dashboard knobs, shared by every widget. */
  env: Record<string, ArgValue>
  /**
   * The card options, per widget, so switching routes does not lose them. Both the
   * widget's own and the ones every card has: one record, because they end up in one
   * config and are edited in one group of the panel.
   */
  args: Record<string, Record<string, ArgValue>>
  /** The drag box, as last measured. */
  drag: Box
}

const seed = (controls: readonly Control[]): Record<string, ArgValue> =>
  Object.fromEntries(controls.map(control => [control.name, control.initial]))

// ---- Theme ---------------------------------------------------------------------

const THEME_KEY = 'cupertino-plus:theme'

/**
 * Whatever the visitor chose last time, or what their system is set to.
 *
 * Wrapped, because reading `localStorage` throws outright in a browser that has blocked
 * storage for the origin, and a page that will not load because it could not remember a
 * colour scheme is a poor trade.
 */
const initialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // No stored preference to be had. Fall through to the system one.
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const rememberTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Not worth telling anyone about: the page works, it just forgets.
  }
}

// ---- The state itself ------------------------------------------------------------

const state: SiteState = {
  theme: initialTheme(),
  widget: WIDGETS[0] as Widget,
  advanced: false,
  env: seed(ENVIRONMENT),
  args: Object.fromEntries(
    WIDGETS.map(widget => [widget.id, seed([...widget.props, ...CARD_OPTIONS])]),
  ),
  drag: { ...DRAG_START },
}

export const site = (): Readonly<SiteState> => state

export const currentArgs = (): Args => state.args[state.widget.id] ?? {}

export const envArgs = (): Args => state.env

/**
 * The wire values of `TimeFormat`, which are not its member names; see `types/ha.ts`.
 *
 * Only the three the Clock control offers. `language` is a real profile value and the card
 * handles it; it is simply not one this page lets anybody pick, so a value claiming to be
 * it could only have come from somewhere that no longer exists.
 */
const TIME_FORMATS: readonly TimeFormat[] = ['system', '12', '24']

/** `system` on both sides, so a value that fails the guard lands on the same default. */
const clock = (): TimeFormat => {
  const value = readString(state.env, CLOCK, 'system')
  return TIME_FORMATS.includes(value as TimeFormat) ? (value as TimeFormat) : 'system'
}

export const sectionWidth = (): number => readNumber(state.env, SECTION_WIDTH, 500)

let cachedHass: HomeAssistant | undefined
let cachedFor = ''

/**
 * The `hass` the cards are given.
 *
 * A whole new object whenever the theme or the clock moves, exactly as Home Assistant
 * does it: `hass` is replaced rather than mutated, which is the entire reason cards
 * filter their own updates, and a page that edited one in place would let a broken
 * filter through.
 *
 * Kept between those moves, though. This is read on every render, and a render happens
 * on every frame of a drag; handing eight cards a new `hass` sixty times a second to say
 * nothing has changed is work for its own sake.
 */
export const hass = (): HomeAssistant => {
  const key = `${state.theme}|${clock()}`
  if (!cachedHass || cachedFor !== key) {
    cachedFor = key
    cachedHass = createMockHass({ dark: state.theme === 'dark', timeFormat: clock() })
  }
  return cachedHass
}

// ---- Changes ---------------------------------------------------------------------

let listener: () => void = () => {}
let queued = false

/** Runs after every change, once, however many fields moved. */
export function onChange(fn: () => void): void {
  listener = fn
}

export function changed(): void {
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    listener()
  })
}

export function setTheme(theme: Theme): void {
  if (state.theme === theme) return
  state.theme = theme
  rememberTheme(theme)
  changed()
}

export function setWidget(widget: Widget): void {
  if (state.widget === widget) return
  state.widget = widget
  changed()
}

export function setAdvanced(open: boolean): void {
  if (state.advanced === open) return
  state.advanced = open
  changed()
}

export function setArg(name: string, value: ArgValue): void {
  const args = (state.args[state.widget.id] ??= {})
  args[name] = value
  changed()
}

export function setEnv(name: string, value: ArgValue): void {
  state.env[name] = value
  changed()
}

export function setDrag(box: Box): void {
  // The observer reports every frame of a drag, and a drag that has stopped moving
  // vertically still reports its height. Nothing to redraw if nothing moved.
  if (state.drag.width === box.width && state.drag.height === box.height) return
  state.drag = box
  changed()
}
