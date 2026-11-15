import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit'
import { repeat } from 'lit/directives/repeat.js'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { runAction } from '../../core/actions'
import { containerFor, type CardContainer } from '../../core/container'
import { columnsFor, contentCardSize, contentGridOptions, rowsFor } from '../../core/floors'
import { ClockController } from '../../core/clock'
import { Gestures, pressesAnything, pressHandlers, type PressHandlers } from '../../core/gestures'
import { registerCard } from '../../core/register'
import { arcFor, RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE } from '../../core/ring'
import type { CardSizing } from '../../core/size'
import { TemplatePool } from '../../core/templates'
import type {
  HassEntity,
  HomeAssistant,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from '../../core/types/ha'
import { timePreferences } from '../../core/time-preferences'
import {
  historyKey,
  historyRequest,
  historyVerdict,
  settleVerdict,
  needsHistory,
  type HistoryVerdict,
} from './history'
import { LIVE_ACTIVITY_EDITOR_TAG } from './live-activity-card-editor'
import {
  activityConfigs,
  activityKeys,
  activityTemplates,
  activityWatchedIds,
  lingerMsFor,
  nextTickIn,
  secondsFor,
  secondsThreshold,
  type ActivityConfig,
  type SecondsMode,
  DEFAULT_IDLE_MESSAGE,
  formatClock,
  formatRemaining,
  rawKind,
  readActivity,
  remainingParts,
  spokenLabel,
  styleFor,
  timeFor,
  trackActivity,
  whenIdleFor,
  type ActivityDefaults,
  type ActivityStyle,
  type ActivityTime,
  type ActivityTrack,
  type ActivityView,
  type WhenIdle,
} from './model'

export const LIVE_ACTIVITY_CARD_TAG = 'cupertino-plus-live-activity'

export interface LiveActivityCardConfig extends CupertinoCardConfig {
  activities?: unknown
  style?: ActivityStyle
  time?: ActivityTime
  seconds?: SecondsMode
  when_idle?: WhenIdle
  idle_message?: string
  done_minutes?: number
  color?: string
  container?: CardContainer
}

/** As long as the exit fade in the stylesheet, so the element goes when its fade has finished. */
const LEAVE_MS = 320

/** How long to wait before asking the recorder again when its answer had not caught up. */
const HISTORY_RETRY_MS = 3000

/**
 * The narrowest the card is useful at, in design units: a name, a phase and "1 hr 5 min" side
 * by side. Floors the Layout tab's column count, not the content, which truncates below it.
 */
const MIN_WIDTH = 260

/** Design heights, for `getCardSize` alone: the sections grid sizes the card to its content. */
const EXPANDED_HEIGHT = 92
const COMPACT_HEIGHT = 44
const GAP = 8

const NO_ACTIVITIES = 'No activities yet'

/**
 * Apple's Live Activities, on a dashboard: one glass panel per job that is running (a wash, a
 * print, a litter box cycling), with what it is doing, how far along, and how long is left;
 * "Done" for a few minutes once it ends; and nothing at all while nothing is happening.
 *
 * `model.ts` decides what each activity says. This class keeps the two things that need state
 * across renders, the memory of which jobs were running (`_tracks`, see `ActivityTrack`) and
 * the activities fading out (`_leaving`), and runs the clock that moves the countdowns.
 */
class CupertinoLiveActivityCard extends CupertinoCard<LiveActivityCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      :host([hidden]) {
        display: none;
      }

      /* The tiles card's glass: ha-card paints nothing, and each activity is the glass. See the
         tiles card for why overflow is let out and why ha-card takes no blur. */
      ha-card.glass {
        background: none;
        border: none;
        box-shadow: none;
        overflow: visible;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
      }

      .stack {
        display: flex;
        flex-direction: column;
        gap: calc(${GAP}px * var(--cw-scale));
        padding: var(--cw-inset);
        min-width: 0;
      }

      .glass .stack {
        padding: 0;
      }

      /* One activity. The two layers under it are the tiles card's, for its reason: the glass
         and its ring sit in ::before, so the content composites over them unblurred. */
      .activity {
        position: relative;
        isolation: isolate;
        display: flex;
        flex-direction: column;
        gap: calc(10px * var(--cw-scale));
        min-width: 0;
        min-height: calc(44px * var(--cw-scale));
        padding: calc(14px * var(--cw-scale)) calc(16px * var(--cw-scale));
        border-radius: calc(24px * var(--cw-scale));
        box-sizing: border-box;
        color: var(--cw-label);
        animation: cw-activity-in var(--cw-duration) var(--cw-ease) both;
        transition: opacity var(--cw-duration) var(--cw-ease);
      }

      .glass .activity {
        -webkit-backdrop-filter: var(--cw-glass-filter);
        backdrop-filter: var(--cw-glass-filter);
      }

      .activity::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        pointer-events: none;
      }

      .glass .activity::before {
        background: var(--cw-glass-fill);
        box-shadow: inset 0 0 0 1px var(--cw-glass-ring);
      }

      .surface .activity::before {
        background: var(--cw-track);
      }

      /* An idle activity a user asked to keep: there, but plainly not the news. */
      .activity.idle {
        opacity: 0.55;
      }

      .activity.leaving {
        animation: cw-activity-out ${LEAVE_MS}ms var(--cw-ease) both;
        pointer-events: none;
      }

      @keyframes cw-activity-in {
        from {
          opacity: 0;
          transform: translateY(calc(-6px * var(--cw-scale))) scale(0.97);
        }
      }

      @keyframes cw-activity-out {
        to {
          opacity: 0;
          transform: scale(0.97);
        }
      }

      .activity[role='button']:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
        border-radius: calc(24px * var(--cw-scale));
      }

      .top {
        display: flex;
        align-items: center;
        gap: calc(12px * var(--cw-scale));
        min-width: 0;
      }

      /* The app icon of a Live Activity: the glyph in its colour, on a disc of the same colour
         at low alpha, so it is identifiable without a block of saturated paint. */
      .badge {
        --mdc-icon-size: calc(22px * var(--cw-scale));
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: calc(40px * var(--cw-scale));
        height: calc(40px * var(--cw-scale));
        border-radius: 50%;
        color: var(--cw-activity-tint);
        background: color-mix(in srgb, var(--cw-activity-tint) 16%, transparent);
      }

      :host([dark]) .badge {
        background: color-mix(in srgb, var(--cw-activity-tint) 24%, transparent);
      }

      .badge ha-icon {
        display: inline-flex;
        width: var(--mdc-icon-size);
        height: var(--mdc-icon-size);
      }

      .text {
        flex: 1;
        min-width: 0;
      }

      .name {
        font: var(--cw-text-subheadline);
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .phase {
        font: var(--cw-text-footnote);
        color: var(--cw-label-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }

      /* The ending's word takes its colour: green Done, red Failed. */
      .done .phase,
      .failed .phase {
        color: var(--cw-activity-tint);
        font-weight: 600;
      }

      /* The trailing edge. Tabular numerals throughout, so a countdown ticking from 10 to 9
         does not shuffle the name beside it. */
      .time {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        font-variant-numeric: tabular-nums;
        text-align: end;
      }

      /* A template's words in the countdown's place are cut short rather than allowed to push
         the name off the panel. */
      .time {
        max-width: 45%;
      }

      .time .clock,
      .compact .trail {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .compact .trail {
        max-width: 45%;
      }

      .count {
        display: flex;
        align-items: baseline;
        gap: calc(3px * var(--cw-scale));
        white-space: nowrap;
      }

      .count .value {
        font: var(--cw-text-title-2);
        letter-spacing: -0.01em;
      }

      .count .unit {
        font: var(--cw-text-footnote);
        font-weight: 600;
        color: var(--cw-label-secondary);
      }

      .count .unit + .value {
        margin-inline-start: calc(4px * var(--cw-scale));
      }

      .clock {
        font: var(--cw-text-subheadline);
        font-weight: 600;
        white-space: nowrap;
      }

      .sub {
        font: var(--cw-text-caption-1);
        color: var(--cw-label-secondary);
        white-space: nowrap;
      }

      .bar {
        height: calc(6px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        background: var(--cw-track);
        overflow: hidden;
      }

      .fill {
        height: 100%;
        border-radius: inherit;
        background: var(--cw-activity-tint);
        transition: width 600ms var(--cw-ease);
      }

      /* style: compact. The Dynamic Island's pill: one line, the progress as a ring round the
         glyph, the time tinted on the trailing edge. 44 tall, which is the hit target. */
      .compact .activity {
        flex-direction: row;
        align-items: center;
        gap: calc(10px * var(--cw-scale));
        padding: calc(6px * var(--cw-scale)) calc(16px * var(--cw-scale))
          calc(6px * var(--cw-scale)) calc(6px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
      }

      .compact .activity[role='button']:focus-visible {
        border-radius: var(--cw-radius-pill);
      }

      .compact .badge {
        --mdc-icon-size: calc(17px * var(--cw-scale));
        width: calc(32px * var(--cw-scale));
        height: calc(32px * var(--cw-scale));
        position: relative;
      }

      /* With a ring, the disc goes: the ring is the frame, and both together are too much. */
      .compact .badge.ringed {
        background: none;
      }

      .ring {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .ring .track {
        stroke: var(--cw-track);
      }

      .ring .arc {
        stroke: var(--cw-activity-tint);
        transition: stroke-dasharray 600ms var(--cw-ease);
      }

      .compact .line {
        flex: 1;
        min-width: 0;
        font: var(--cw-text-footnote);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .compact .line .name {
        display: inline;
        font: inherit;
        font-weight: 600;
      }

      .compact .line .phase {
        display: inline;
      }

      .compact .trail {
        flex: none;
        display: flex;
        align-items: center;
        gap: calc(4px * var(--cw-scale));
        font: var(--cw-text-subheadline);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--cw-activity-tint);
        white-space: nowrap;
      }

      .compact .trail .soft {
        font: var(--cw-text-footnote);
        color: var(--cw-label-secondary);
      }

      /* when_idle: message. A quiet line in the same glass, so it reads as the card at rest
         rather than as text that has lost its panel. */
      .message {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: calc(6px * var(--cw-scale));
        min-height: calc(44px * var(--cw-scale));
        font: var(--cw-text-footnote);
        color: var(--cw-label-secondary);
        flex-direction: row;
        padding-block: 0;
      }

      .message ha-icon {
        --mdc-icon-size: calc(16px * var(--cw-scale));
        display: inline-flex;
      }

      .activity.cw-pressable:active {
        opacity: 0.8;
      }

      .activity.idle.cw-pressable:active {
        opacity: 0.44;
      }

      @media (prefers-reduced-motion: reduce) {
        .activity,
        .activity.leaving {
          animation: none;
          transition: none;
        }
        .fill,
        .ring .arc {
          transition: none;
        }
      }
    `,
  ]

  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(LIVE_ACTIVITY_EDITOR_TAG) as LovelaceCardEditor
  }

  /**
   * The picker's preview: the appliances that look like they have a status sensor, so the card
   * the user drops in already points at something. Two at most, and none is fine.
   */
  public static getStubConfig(hass?: HomeAssistant): LiveActivityCardConfig {
    const candidates = Object.keys(hass?.states ?? {})
      .filter(id => /^sensor\..*_(current_status|print_status|run_state|operation_state)$/.test(id))
      .slice(0, 2)
    return {
      type: `custom:${LIVE_ACTIVITY_CARD_TAG}`,
      ...(candidates.length > 0 ? { activities: candidates } : {}),
    }
  }

  /**
   * Sleeps until the next moment something printed changes (`nextTickIn`): the next second of a
   * countdown in its last hour, the next minute otherwise, or the end of a Done. Nothing at all
   * while the card is off screen, the tab is hidden, or nothing on the card moves with the clock.
   * See `core/clock.ts`.
   */
  protected readonly _ticker = new ClockController(this, () =>
    this._config
      ? nextTickIn(
          this._views.map(({ view }) => view),
          Date.now(),
          this._threshold,
          timeFor(this._config.time),
        )
      : undefined,
  )

  private readonly _gestures = new Gestures()

  /** The card's template subscriptions; see the tiles card. */
  private readonly _templates = new TemplatePool(() => this.requestUpdate())

  /** Which jobs this card has seen running; see `ActivityTrack`. By row key. */
  private readonly _tracks = new Map<string, ActivityTrack>()

  /**
   * What the recorder said about each recent ending, by `historyKey` (entity and the change it
   * is about), so one state change costs one query however often the card repaints.
   */
  private readonly _history = new Map<string, HistoryVerdict>()

  /** The views drawn last time, by key, so a view that disappears can fade out as it was. */
  private _shown = new Map<string, ActivityView>()

  /** Activities on their way out: their last visible view, drawn fading. */
  private readonly _leaving = new Map<string, ActivityView>()

  /** One-off timeouts (the end of a fade-out, a history retry), cleared on disconnect. */
  private readonly _timeouts = new Set<ReturnType<typeof setTimeout>>()

  /** History keys already asked a second time after an answer that had not caught up. */
  private readonly _retried = new Set<string>()

  /** This render's views, computed once in `willUpdate`. */
  private _views: { key: string; view: ActivityView }[] = []

  public override connectedCallback(): void {
    super.connectedCallback()
    this.requestUpdate()
  }

  public override disconnectedCallback(): void {
    for (const timeout of this._timeouts) clearTimeout(timeout)
    this._timeouts.clear()
    // A fade that will never finish is dropped, and a question whose answer or retry was cut
    // short is asked again on the way back.
    this._leaving.clear()
    for (const [key, verdict] of this._history) {
      if (verdict.status === 'pending') this._history.delete(key)
    }
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  private _later(run: () => void, ms: number): void {
    const timeout = setTimeout(() => {
      this._timeouts.delete(timeout)
      run()
    }, ms)
    this._timeouts.add(timeout)
  }

  /** Below this much time left, countdowns are `m:ss`. */
  private get _threshold(): number {
    return secondsThreshold(secondsFor(this._config?.seconds))
  }

  protected override watchedEntities(): string[] {
    return activityWatchedIds(this._config?.activities)
  }

  private get _defaults(): ActivityDefaults {
    return {
      color: this._config?.color,
      done_minutes: this._config?.done_minutes,
      when_idle: whenIdleFor(this._config?.when_idle),
    }
  }

  private get _reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  private get _user(): string | undefined {
    return this.hass?.user?.name
  }

  /**
   * Ask the recorder whether a job the card did not see stop was running just before; see
   * `history.ts`. Once per state change. A failed call is `unknown`, which falls back to the
   * state alone rather than leaving the answer pending for ever.
   */
  private _askHistory(
    entity: HassEntity,
    row: ActivityConfig,
    now: number,
    lingerMs: number,
  ): HistoryVerdict {
    const key = historyKey(entity)
    const known = this._history.get(key)
    if (known) return known
    const pending: HistoryVerdict = { status: 'pending' }
    this._history.set(key, pending)
    const hass = this.hass
    if (!hass) return pending
    hass
      .callWS<unknown>(historyRequest(entity, now, lingerMs))
      .then(
        response => historyVerdict(response, entity.entity_id, row, entity.state),
        (): HistoryVerdict => ({ status: 'unknown' }),
      )
      .then(answer => {
        if (this._history.get(key) !== pending) return
        const verdict = settleVerdict(answer, this._retried.has(key))
        if (verdict === 'retry') {
          // The answer has not caught up with the state (a browser clock behind the server's):
          // ask once more shortly, leaving it pending meanwhile.
          this._retried.add(key)
          this._later(() => {
            if (this._history.get(key) !== pending) return
            this._history.delete(key)
            this.requestUpdate()
          }, HISTORY_RETRY_MS)
          return
        }
        this._history.set(key, verdict)
        this.requestUpdate()
      })
    return pending
  }

  /**
   * The views, the memory and the exits, once per update. Here rather than in `render`
   * because the memory has to move exactly once per state the card is shown, and `render` is
   * not a place to change state from.
   */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this._config) return

    // The clock is read afresh on every update, never kept: an update can come from `hass` after
    // the timer has slept an hour off screen, and a kept clock would draw that hour-old countdown.
    // The timer itself only asks for a repaint.
    const now = Date.now()
    const rows = activityConfigs(this._config.activities)
    const keys = activityKeys(rows)
    const defaults = this._defaults
    const user = this._user
    if (this.hass) this._templates.sync(this.hass, activityTemplates(this._config.activities, user))
    const resolve = this._templates.resolver(user)
    const asked = new Set<string>()

    this._views = rows.map((row, index) => {
      const key = keys[index] as string
      const entity = row.entity !== undefined ? this.hass?.states[row.entity] : undefined
      const raw = rawKind(entity, row)
      const track = this.hass
        ? trackActivity(this._tracks.get(key), raw, entity)
        : this._tracks.get(key)
      if (track) this._tracks.set(key, track)
      const lingerMs = lingerMsFor(row, defaults)
      let history: HistoryVerdict | undefined
      if (needsHistory(raw, entity, now, lingerMs, track)) {
        asked.add(historyKey(entity))
        history = this._askHistory(entity, row, now, lingerMs)
      }
      return { key, view: readActivity(this.hass, row, { now, defaults, track, history, resolve }) }
    })

    // A row removed from the config takes its memory with it, and an answer about a state the
    // entity has since left is no use to anyone.
    const live = new Set(keys)
    for (const key of this._tracks.keys()) if (!live.has(key)) this._tracks.delete(key)
    for (const key of this._history.keys()) if (!asked.has(key)) this._history.delete(key)
    for (const key of this._retried) if (!asked.has(key)) this._retried.delete(key)

    const shown = new Map(
      this._views.filter(({ view }) => view.visible).map(({ key, view }) => [key, view]),
    )
    for (const key of shown.keys()) this._leaving.delete(key)
    if (!this._reducedMotion) {
      for (const [key, view] of this._shown) {
        if (shown.has(key) || !live.has(key) || this._leaving.has(key)) continue
        this._leaving.set(key, view)
        this._later(() => {
          if (this._leaving.delete(key)) this.requestUpdate()
        }, LEAVE_MS)
      }
    }
    this._shown = shown
  }

  /**
   * Hide the whole card when it has nothing to say and was told to, and tell the wrapper.
   *
   * `hui-card` only collapses a card that is `hidden` and has said so with
   * `card-visibility-changed`; one that merely rendered nothing would leave its grid cell. The
   * badge does the same thing for the same reason. Never while editing (`preview`): a card that
   * vanished from under the pencil could not be found to be edited.
   */
  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    const hidden = !this.preview && this._nothingToSay && this._whenIdle === 'hide'
    if (this.hidden === hidden) return
    this.hidden = hidden
    this.dispatchEvent(
      new CustomEvent('card-visibility-changed', {
        detail: { value: !hidden },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** Activities are configured, and none of them is showing or on its way out. */
  private get _nothingToSay(): boolean {
    return (
      this._views.length > 0 &&
      this._views.every(({ view }) => !view.visible) &&
      this._leaving.size === 0
    )
  }

  private get _whenIdle(): WhenIdle {
    return whenIdleFor(this._config?.when_idle)
  }

  /** As tall as its activities, like the chips and tiles cards. See `contentGridOptions`. */
  protected override get sizing(): CardSizing {
    return 'content'
  }

  public override getGridOptions(): LovelaceGridOptions {
    return contentGridOptions(super.getGridOptions(), {
      min_columns: columnsFor(MIN_WIDTH * this.scaleFactor),
      min_rows: 1,
    })
  }

  public override getCardSize(): number {
    const count = Math.max(1, this._views.filter(({ view }) => view.visible).length)
    const each = styleFor(this._config?.style) === 'compact' ? COMPACT_HEIGHT : EXPANDED_HEIGHT
    const px = (count * each + (count - 1) * GAP) * this.scaleFactor
    return contentCardSize({ min_columns: 1, min_rows: rowsFor(px) })
  }

  /** A clock time in the user's own format and zone, as the calendar card prints them. */
  private _clock = (at: number): string => {
    const { locale, hour12 } = timePreferences(this.hass?.locale)
    const timeZone =
      this.hass?.locale?.time_zone === 'server' ? this.hass.config?.time_zone : undefined
    return formatClock(at, { locale, hour12, timeZone })
  }

  // ---- Pressing ----------------------------------------------------------------
  // The tiles card's wiring, unchanged: see it for why each handler is what it is.

  /** The view's press listeners: `pressHandlers`, firing against its entity. */
  private _press(view: ActivityView): PressHandlers {
    return pressHandlers(this._gestures, view, action => {
      if (this.hass) runAction(this.hass, this, action, view.entityId)
    })
  }

  // ---- Drawing -------------------------------------------------------------------

  /** "1 hr 5 min" with the numerals large and the units small, the Clock app's countdown. */
  private _renderCount(ms: number): TemplateResult {
    return html`<span class="count"
      >${remainingParts(ms, this._threshold).map(
        part =>
          html`<span class="value">${part.value}</span>${
              part.unit ? html`<span class="unit">${part.unit}</span>` : nothing
            }`,
      )}</span
    >`
  }

  /** The expanded panel's trailing edge. */
  private _renderTime(view: ActivityView, time: ActivityTime): TemplateResult | typeof nothing {
    // An ending says when, quietly: the green or red word on the left already says what, and a
    // tick on the right as well was the same news three times in one colour.
    if (view.kind === 'done' || view.kind === 'failed') {
      return view.finishAt !== undefined
        ? html`<div class="time"><span class="sub">${this._clock(view.finishAt)}</span></div>`
        : nothing
    }
    if (view.timeText !== undefined) {
      return html`<div class="time"><span class="clock">${view.timeText}</span></div>`
    }
    if (view.kind !== 'active') return nothing
    const { remainingMs, finishAt } = view
    if (time === 'finish' || remainingMs === undefined) {
      return finishAt !== undefined
        ? html`<div class="time">
            <span class="clock">${this._clock(finishAt)}</span>
            <span class="sub">Finishes</span>
          </div>`
        : nothing
    }
    return html`<div class="time">
      ${this._renderCount(remainingMs)}
      ${
        time === 'both' && finishAt !== undefined
          ? html`<span class="sub">Ends ${this._clock(finishAt)}</span>`
          : nothing
      }
    </div>`
  }

  private _renderPhase(view: ActivityView): string {
    return view.detail ? `${view.phase} · ${view.detail}` : view.phase
  }

  private _renderExpanded(view: ActivityView, time: ActivityTime): TemplateResult {
    return html`
      <div class="top">
        <span class="badge"><ha-icon .icon=${view.icon}></ha-icon></span>
        <div class="text">
          <div class="name">${view.name}</div>
          <div class="phase">${this._renderPhase(view)}</div>
        </div>
        ${this._renderTime(view, time)}
      </div>
      ${
        view.progress !== undefined
          ? html`<div class="bar">
              <div class="fill" style=${`width:${(view.progress * 100).toFixed(1)}%`}></div>
            </div>`
          : nothing
      }
    `
  }

  /** The compact pill's trailing edge: the countdown or the clock, tinted, on one line. */
  private _renderTrail(view: ActivityView, time: ActivityTime): TemplateResult | typeof nothing {
    if (view.kind === 'done' || view.kind === 'failed') {
      return view.finishAt !== undefined
        ? html`<span class="trail"><span class="soft">${this._clock(view.finishAt)}</span></span>`
        : nothing
    }
    if (view.timeText !== undefined) return html`<span class="trail">${view.timeText}</span>`
    if (view.kind !== 'active') return nothing
    const { remainingMs, finishAt } = view
    const clock = finishAt !== undefined ? this._clock(finishAt) : undefined
    if (time === 'finish' || remainingMs === undefined) {
      return clock !== undefined ? html`<span class="trail">${clock}</span>` : nothing
    }
    const left = formatRemaining(remainingMs, this._threshold)
    return html`<span class="trail"
      >${left}${
        time === 'both' && clock !== undefined
          ? html`<span class="soft">· ${clock}</span>`
          : nothing
      }</span
    >`
  }

  private _renderCompact(view: ActivityView, time: ActivityTime): TemplateResult {
    const ringed = view.progress !== undefined
    return html`
      <span class="badge ${ringed ? 'ringed' : ''}">
        ${
          ringed
            ? svg`<svg class="ring" viewBox="0 0 ${RING_BOX} ${RING_BOX}" aria-hidden="true">
              <circle class="track" cx="50" cy="50" r=${RING_RADIUS} fill="none"
                stroke-width=${RING_STROKE}></circle>
              <circle class="arc" cx="50" cy="50" r=${RING_RADIUS} fill="none"
                stroke-width=${RING_STROKE} stroke-linecap="round"
                stroke-dasharray=${`${arcFor((view.progress ?? 0) * 100)} ${RING_CIRCUMFERENCE}`}></circle>
            </svg>`
            : nothing
        }
        <ha-icon .icon=${view.icon}></ha-icon>
      </span>
      <div class="line">
        <span class="name">${view.name}</span>
        <span class="phase"> · ${this._renderPhase(view)}</span>
      </div>
      ${this._renderTrail(view, time)}
    `
  }

  /**
   * One activity. A button only when some gesture does something, as a tile is; its label is
   * everything the panel says, so VoiceOver reads the job in one stop.
   */
  private _renderActivity(
    view: ActivityView,
    style: ActivityStyle,
    time: ActivityTime,
    leaving: boolean,
  ): TemplateResult {
    const pressable = !leaving && pressesAnything(view)
    const press = this._press(view)
    const label = spokenLabel(view, time, this._clock, this._threshold)
    return html`
      <div
        class="activity ${view.kind} ${leaving ? 'leaving' : ''} ${pressable ? 'cw-pressable' : ''}"
        style=${`--cw-activity-tint:${view.color}`}
        role=${pressable ? 'button' : 'group'}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${label}
        aria-hidden=${leaving ? 'true' : nothing}
        @click=${press.click}
        @pointerdown=${press.down}
        @pointerup=${press.cancel}
        @pointerleave=${press.cancel}
        @pointercancel=${press.cancel}
        @contextmenu=${press.menu}
        @keydown=${press.key}
      >
        ${style === 'compact' ? this._renderCompact(view, time) : this._renderExpanded(view, time)}
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const klass = containerFor(this._config.container, 'glass') === 'glass' ? 'glass' : 'surface'
    const style = styleFor(this._config.style)
    const time = timeFor(this._config.time)

    if (this._views.length === 0) {
      return html`<ha-card class=${klass}>
        <div class="stack">
          <div class="activity message">${NO_ACTIVITIES}</div>
        </div>
      </ha-card>`
    }

    const drawn = this._views.flatMap(({ key, view }) => {
      if (view.visible) return [{ key, view, leaving: false }]
      const last = this._leaving.get(key)
      return last ? [{ key, view: last, leaving: true }] : []
    })

    // Nothing running. `message` says so; `hide` hides the card in `updated` and draws the
    // same line only while editing, where a vanished card could not be found.
    if (drawn.length === 0) {
      const message =
        this._whenIdle === 'message' || this.preview
          ? (this._config.idle_message ?? DEFAULT_IDLE_MESSAGE)
          : undefined
      return message !== undefined
        ? html`<ha-card class=${klass}>
            <div class="stack">
              <div class="activity message" role="status">
                <ha-icon icon="mdi:check-circle-outline"></ha-icon>${message}
              </div>
            </div>
          </ha-card>`
        : html`<ha-card class=${klass}></ha-card>`
    }

    const live = drawn.filter(one => !one.leaving).length
    return html`
      <ha-card class=${klass} aria-label=${`${live} ${live === 1 ? 'activity' : 'activities'}`}>
        <div class="stack ${style}">
          ${repeat(
            drawn,
            one => one.key,
            one => this._renderActivity(one.view, style, time, one.leaving),
          )}
        </div>
      </ha-card>
    `
  }
}

registerCard(LIVE_ACTIVITY_CARD_TAG, CupertinoLiveActivityCard, {
  name: 'Cupertino Live Activity',
  description:
    'Appliances and jobs while they run: phase, progress and time left, the way a Live Activity shows them.',
})

export { CupertinoLiveActivityCard }
