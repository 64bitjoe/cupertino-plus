/**
 * Telling a tap from a hold and a double tap, for the cards whose rows take all three.
 *
 * Home Assistant's own cards do this with an `action-handler` directive that lives inside the
 * frontend and is not exported, so a custom card either reaches for a private element or
 * writes its own. This is the own: a few timers per pressed element, with nothing in it that
 * needs a DOM, so it runs under the node test harness like the rest of `core/`.
 *
 * ## Built on `click`, not instead of it
 *
 * A tap is still the browser's `click`, which is what it was before this existed: it is what a
 * screen reader's activation sends, what a pen and a mouse agree on, and what every test of the
 * cards already presses. The pointer events only add what a click cannot say. `down` starts the
 * hold timer, `cancel` stops it (a pointer that leaves or a touch the browser takes for a
 * scroll), and `click` decides between the three. A row configured with neither a hold nor a
 * double tap therefore runs no timer at all and taps exactly as it did, on the same event.
 *
 * ## The two timings
 *
 * Home Assistant's own: a hold is 500ms, and a second tap has 250ms to arrive. Matching them
 * matters more than tuning them, since the same dashboard has native cards on it too, and a
 * hold that fired at a different moment on the tile beside one of those would read as a fault.
 * The cost of a double tap is the same as in Home Assistant: a row that has one waits those
 * 250ms before it can know a single tap was single, so only such rows pay it.
 */

import { isPressable, type ActionConfig } from './actions'

export const HOLD_MS = 500
export const DOUBLE_TAP_MS = 250

/** The timers, injectable so the tests can drive them with vitest's fake clock or by hand. */
export interface Timers {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const defaultTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

interface PressState {
  /** The pending hold, between a pointer going down and 500ms later. */
  hold?: unknown
  /** True once the hold fired, so the click the release still raises is swallowed. */
  held: boolean
  /** The pending single tap, while a second one might still turn it into a double. */
  tap?: unknown
}

export class Gestures {
  /**
   * Keyed by the pressed element rather than by the row it draws, because a row is rebuilt as a
   * new object on every render and a state change between two taps is an ordinary thing to
   * happen. Lit keeps the element, so the element is the identity that survives.
   */
  private readonly _presses = new WeakMap<object, PressState>()

  public constructor(private readonly _timers: Timers = defaultTimers) {}

  private _state(key: object): PressState {
    let state = this._presses.get(key)
    if (!state) {
      state = { held: false }
      this._presses.set(key, state)
    }
    return state
  }

  /**
   * A pointer went down on `key`. `onHold` only when the row has a hold action: without one
   * there is no timer to start, and the press is the plain click it always was.
   *
   * `held` is cleared here rather than only in `click`, because a long press on a touch screen
   * does not always raise a click on release (the browser may treat it as a context-menu
   * gesture instead), and a flag left standing from that press would swallow the next real tap.
   */
  public down(key: object, onHold?: () => void): void {
    const state = this._state(key)
    state.held = false
    this._stopHold(state)
    if (!onHold) return
    state.hold = this._timers.set(() => {
      delete state.hold
      state.held = true
      onHold()
    }, HOLD_MS)
  }

  /** The pointer came up, left, or was taken for a scroll: a hold can no longer start. */
  public cancel(key: object): void {
    const state = this._presses.get(key)
    if (state) this._stopHold(state)
  }

  /**
   * The browser's click on `key`: a tap, unless it was the release of a hold, or one half of a
   * double tap. `onDoubleTap` only when the row has one, for `down`'s reason.
   */
  public click(key: object, onTap: () => void, onDoubleTap?: () => void): void {
    const state = this._state(key)
    this._stopHold(state)

    if (state.held) {
      state.held = false
      return
    }

    if (!onDoubleTap) {
      onTap()
      return
    }

    if (state.tap !== undefined) {
      this._timers.clear(state.tap)
      delete state.tap
      onDoubleTap()
      return
    }

    state.tap = this._timers.set(() => {
      delete state.tap
      onTap()
    }, DOUBLE_TAP_MS)
  }

  private _stopHold(state: PressState): void {
    if (state.hold === undefined) return
    this._timers.clear(state.hold)
    delete state.hold
  }
}

/** The three gestures a drawn row may answer, each present only when configured. */
export interface PressActions {
  action?: ActionConfig | undefined
  holdAction?: ActionConfig | undefined
  doubleTapAction?: ActionConfig | undefined
}

/**
 * Whether any gesture does something, which decides whether the row is drawn as a button at all:
 * a row whose tap is `none` but which holds or double-taps still is one, since a pointer can
 * press it.
 */
export const pressesAnything = (row: PressActions): boolean =>
  isPressable(row.action) || row.holdAction !== undefined || row.doubleTapAction !== undefined

/** One pressable element's listeners, for `@click`, `@pointerdown` and the rest. */
export interface PressHandlers {
  click(event: Event): void
  down(event: Event): void
  /** For `@pointerup`, `@pointerleave` and `@pointercancel` alike. */
  cancel(event: Event): void
  menu(event: Event): void
  key(event: KeyboardEvent): void
}

/**
 * Enter and Space on a focused element are a tap, which is what makes `role="button"` honest. A
 * keyboard has no hold, and its double press is two taps. Space scrolls the dashboard otherwise,
 * and Enter would submit a form the card may be sitting inside, hence the `preventDefault`.
 */
export const activationKey =
  (run: () => void) =>
  (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    run()
  }

/**
 * The listeners every card with tap, hold and double tap binds on a pressable element, so the
 * chips, tiles, complication, live-activity and badge cards cannot drift apart on them.
 *
 * `run` is the card's: it fires one action against the row's entity (`undefined` being the
 * default, more-info), and is only ever handed an action `isPressable` accepts. The handlers are bound unconditionally and guard inside, rather
 * than being bound only for a pressable row: a conditional `@click=${cond ? handler : nothing}`
 * is a different code path in lit-html from a function, and guarding inside cannot be got
 * subtly wrong.
 *
 * The click is the tap; `Gestures` holds it back only for a row with a double tap to wait for,
 * and swallows it when it was the release of a hold. A row with neither taps on the click
 * itself. A long press on a touch screen opens the context menu, unless a hold has claimed it.
 */
export const pressHandlers = (
  gestures: Gestures,
  row: PressActions,
  run: (action: ActionConfig | undefined) => void,
): PressHandlers => {
  const runner = (action: ActionConfig | undefined) => (): void => {
    if (isPressable(action)) run(action)
  }
  const tap = activationKey(runner(row.action))
  return {
    click: event => {
      const double = row.doubleTapAction
      gestures.click(
        event.currentTarget as object,
        runner(row.action),
        double ? runner(double) : undefined,
      )
    },
    down: event => {
      const hold = row.holdAction
      gestures.down(event.currentTarget as object, hold ? runner(hold) : undefined)
    },
    cancel: event => gestures.cancel(event.currentTarget as object),
    menu: event => {
      if (row.holdAction) event.preventDefault()
    },
    key: event => {
      if (!isPressable(row.action)) return
      tap(event)
    },
  }
}
