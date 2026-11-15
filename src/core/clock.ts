/**
 * A card's clock: one wake-up, at the next moment something it prints changes.
 *
 * The complication's countdowns and the live activity's remaining times both move with the
 * clock, and both wanted the same thing from it: sleep until the next boundary, never tick while
 * nobody can see the card, and catch up at once when somebody can again. This is that, as a Lit
 * `ReactiveController`, so neither card writes the observer and the listener out by hand.
 *
 *  - **One pending wake.** Re-armed after every update from `nextIn`, which answers how many
 *    milliseconds until the next printed change, or `undefined` when nothing on the card moves
 *    with the clock (and then no timer is set at all).
 *  - **Five milliseconds of slack**, so the repaint lands on the far side of the boundary rather
 *    than a hair before it and drawing the old value again.
 *  - **Capped at a minute**, so a machine that slept through a timer catches up within one.
 *  - **Asleep off screen and in a background tab.** An IntersectionObserver and the page's
 *    `visibilitychange` stop the timer; coming back redraws at once, with the time as it now is,
 *    rather than waiting out a wake that was cancelled while hidden.
 */

import type { ReactiveController, ReactiveControllerHost } from 'lit'

/** Past the boundary, so the repaint lands on its far side. */
export const CLOCK_SLACK_MS = 5

/** The longest single sleep, so a suspended machine catches up within a minute. */
export const CLOCK_CAP_MS = 60_000

/** How long to sleep for a wait of `ms`: the slack added, the cap applied. */
export const clockDelay = (ms: number): number => Math.min(ms + CLOCK_SLACK_MS, CLOCK_CAP_MS)

export class ClockController implements ReactiveController {
  private _timer: ReturnType<typeof setTimeout> | undefined

  /** Whether any of the card is in the viewport, as the IntersectionObserver last said. */
  private _onScreen = true

  private _observer: IntersectionObserver | undefined

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
    private readonly _nextIn: () => number | undefined,
  ) {
    _host.addController(this)
  }

  public hostConnected(): void {
    document.addEventListener('visibilitychange', this._visibilityChanged)
    if (typeof IntersectionObserver !== 'undefined') {
      this._observer ??= new IntersectionObserver(entries => {
        const onScreen = entries.some(entry => entry.isIntersecting)
        if (onScreen === this._onScreen) return
        this._onScreen = onScreen
        if (onScreen) this._host.requestUpdate()
        else this.stop()
      })
      this._observer.observe(this._host)
    }
  }

  public hostDisconnected(): void {
    this.stop()
    this._observer?.disconnect()
    document.removeEventListener('visibilitychange', this._visibilityChanged)
  }

  /** Every update re-arms the one wake, from the state the update just drew. */
  public hostUpdated(): void {
    this._schedule()
  }

  /** Cancel the pending wake, if one is set. */
  public stop(): void {
    if (this._timer !== undefined) clearTimeout(this._timer)
    this._timer = undefined
  }

  /** A hidden tab runs no timer; coming back repaints at once. */
  private readonly _visibilityChanged = (): void => {
    if (document.hidden) this.stop()
    else this._host.requestUpdate()
  }

  private _schedule(): void {
    this.stop()
    if (!this._host.isConnected || document.hidden || !this._onScreen) return
    const wait = this._nextIn()
    if (wait === undefined) return
    this._timer = setTimeout(() => {
      this._timer = undefined
      this._host.requestUpdate()
    }, clockDelay(wait))
  }
}
