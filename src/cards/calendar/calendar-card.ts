import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { registerCard } from '../../core/register'
import { timePreferences } from './datetime'
import { DEFAULT_DEMO_SCENARIO, demoItems } from './demo-data'
import { buildFlow } from './flow'
import { TIME_DASH, itemTime, moreLabel, widgetDate } from './format'
import type { FormatContext, ItemTime, TimeToken } from './format'
import { geometryFor, packFlow, type LayoutColumn, type LayoutRow } from './layout'

export const CALENDAR_CARD_TAG = 'cupertino-widgets-calendar'

export interface CalendarCardConfig extends CupertinoCardConfig {
  /** Calendar entities to show. Empty/absent means "every calendar", decided at render. */
  entities?: string[]
  /**
   * TEMPORARY — which fixture from `demo-data.ts` to draw while the card has no data
   * source. Goes away with the websocket subscription.
   */
  demo_scenario?: string
}

/**
 * Not localised yet: Home Assistant has no string for this and the widget it is
 * copying says exactly this. One place to change when a translation layer exists.
 */
const NO_EVENTS_TODAY = 'No Events Today'

/**
 * The all-day badge: a filled rounded square with a calendar knocked out of it.
 *
 * It replaces the colour bar, and it has to, because an all-day row has nothing else
 * left to identify it by — no time under the title, no location. Drawn inline rather
 * than as an `<ha-icon>`: the row is priced in pixels by `layout.ts`, and an icon that
 * arrives a frame late out of Home Assistant's icon registry would be measured at the
 * wrong height. The dev harness has no registry at all.
 */
const ALL_DAY_BADGE = html`
  <svg class="badge" viewBox="0 0 16 16" aria-hidden="true">
    <rect width="16" height="16" rx="4.5" fill="var(--item-color)" />
    <g fill="#fff">
      <rect x="4.35" y="2.2" width="1.3" height="2.4" rx="0.65" />
      <rect x="10.35" y="2.2" width="1.3" height="2.4" rx="0.65" />
      <rect x="3" y="6.3" width="10" height="1.3" rx="0.65" />
      <circle cx="4.9" cy="10.5" r="0.95" />
      <circle cx="8" cy="10.5" r="0.95" />
      <circle cx="11.1" cy="10.5" r="0.95" />
    </g>
  </svg>
`

/**
 * The calendar widget.
 *
 * The interesting part is not in here — it is in `flow.ts` (what to show, in what
 * order) and `layout.ts` (how much of it fits). This class measures the card, asks
 * those two, and draws the answer. See `docs/calendar-widget-rules.md`.
 */
class CupertinoCalendarCard extends CupertinoCard<CalendarCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      .widget {
        /* layout.ts prices its row budget in pixels off this and off the height of a
           compact row (its GAP and COMPACT_PX). Change either here and the budget
           stops describing what actually gets drawn. */
        --cw-flow-gap: 6px;

        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--cw-space-4);
        padding: var(--cw-inset);
      }

      /* Medium is one flow of content poured through two columns, not two lists. */
      :host([cw-layout='medium']) .widget {
        grid-template-columns: 1fr 1fr;
      }

      .column {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        /* The budget keeps content inside the box; this catches the rounding. */
        overflow: hidden;
      }

      /* ---- The date, always today, always top left ------------------------- */

      .date {
        flex: none;
        /* Part of layout.ts's DATE_BLOCK. */
        margin-bottom: var(--cw-space-3);
      }

      .weekday {
        font: 600 13px/16px var(--cw-font);
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--cw-red);
      }

      .day {
        font: 700 52px/56px var(--cw-font);
        /* Tabular figures keep the numeral from shifting between the 1st and the 30th. */
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.03em;
        color: var(--cw-label);
      }

      /* ---- The flow -------------------------------------------------------- */

      .flow {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: var(--cw-flow-gap);
        overflow: hidden;
      }

      .heading {
        flex: none;
        padding-top: 4px;
        font: 600 13px/16px var(--cw-font);
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
      }

      /* What did not fit: "2 more events".

         A caption, not a card. It borrows the event rail to say which calendar you are
         missing, and pointedly not the tint behind it — a tinted row would read as one
         more event, when the whole point of the line is that those did not fit. The
         10px of padding lines its bar up with the bars of the rows above; the 22px it
         comes to is the second of the two one-row heights layout.ts prices ROW against
         (a heading is 20px), so this must stay short. */
      .more {
        flex: none;
        min-width: 0;
        display: flex;
        align-items: stretch;
        gap: var(--cw-space-2);
        padding: 2px 10px 0;
        font: var(--cw-text-subheadline);
        color: var(--cw-label-secondary);
      }

      /* Title line (22px) + time line (20px) + this padding = the 56px that layout.ts
         calls COMPACT_PX and prices two budget rows at. */
      .row {
        flex: none;
        min-width: 0;
        display: flex;
        align-items: stretch;
        gap: var(--cw-space-2);
        padding: 7px 10px;
        border-radius: var(--cw-radius-inner);
      }

      .row.event {
        --item-text: var(--item-color);
        background: color-mix(in srgb, var(--item-color) 14%, transparent);
      }

      /* A saturated calendar colour goes muddy on a dark surface; lift it instead. */
      :host([dark]) .row.event {
        --item-text: color-mix(in srgb, var(--item-color) 74%, white);
      }

      .row.reminder {
        background: var(--cw-fill);
      }

      /* An all-day entry keeps the tint of an event and loses everything else: no time
         under the title, so the chip closes up around the one line it has. 22px of title
         inside 1px of padding is the 24px that layout.ts prices a single budget row at
         (its ROW, less the gap) — this is the tallest one-row node there is, so it must
         not grow. */
      .row.allday {
        align-items: center;
        padding: 1px 10px;
      }

      .badge {
        flex: none;
        width: 16px;
        height: 16px;
      }

      /* The colour bar that says which calendar an event belongs to. */
      .rail {
        flex: none;
        width: 3px;
        border-radius: var(--cw-radius-pill);
        background: var(--item-color);
      }

      /* A reminder is a thing you tick off, so it gets a tickable-looking circle. */
      .bullet {
        flex: none;
        align-self: center;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        border: 1.5px solid var(--item-color);
      }

      .body {
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .title {
        font: var(--cw-text-headline);
      }

      .location,
      .time {
        font: var(--cw-text-subheadline);
      }

      .row.event .title {
        color: var(--item-text);
      }

      .row.event .location,
      .row.event .time {
        color: color-mix(in srgb, var(--item-text) 72%, transparent);
      }

      .row.reminder .title {
        color: var(--cw-label);
      }

      .row.reminder .location,
      .row.reminder .time {
        color: var(--cw-label-secondary);
      }

      /* AM/PM rides smaller than the digits, the way iOS sets it. */
      .meridiem {
        font-size: 0.82em;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      /* Secondary, not tertiary: this line is the card's entire message on a quiet
         day, so it has to be as readable as the section headings beside it. */
      .empty {
        font: var(--cw-text-subheadline);
        color: var(--cw-label-secondary);
      }
    `,
  ]

  /**
   * The `custom:` prefix is load-bearing. The card picker builds `{ type: 'custom:…' }`
   * and then spreads this on top of it, so returning the bare tag here overwrites the
   * type with something Lovelace cannot resolve and the picker hands the user a broken
   * card.
   */
  public static getStubConfig(): CalendarCardConfig {
    return { type: `custom:${CALENDAR_CARD_TAG}`, size: 'medium' }
  }

  /**
   * The clock the card is drawn against.
   *
   * Kept in state and advanced on the minute, because half the rules are about now:
   * an event that has just finished has to leave, midnight has to turn `TOMORROW`
   * into today. Nothing else would repaint the card — Home Assistant pushes entity
   * states, not the passage of time.
   */
  @state() private _now = new Date()

  private _tick: ReturnType<typeof setTimeout> | undefined

  public override connectedCallback(): void {
    super.connectedCallback()
    this._scheduleTick()
  }

  public override disconnectedCallback(): void {
    clearTimeout(this._tick)
    this._tick = undefined
    super.disconnectedCallback()
  }

  /** Wakes on the minute rather than every 60s, so the card and the clock agree. */
  private _scheduleTick(): void {
    // Moving a card in the DOM reconnects it; without this that would leave two
    // timers running.
    clearTimeout(this._tick)
    const untilNextMinute = 60_000 - (Date.now() % 60_000)
    this._tick = setTimeout(() => {
      this._now = new Date()
      this._scheduleTick()
    }, untilNextMinute + 100)
  }

  /**
   * The zone the user reads the dashboard in.
   *
   * Home Assistant lets a profile follow the server's timezone instead of the
   * browser's, and "is that tomorrow" is a different question in each.
   */
  private get _timeZone(): string | undefined {
    return this.hass?.locale?.time_zone === 'server' ? this.hass.config?.time_zone : undefined
  }

  private _renderToken(token: TimeToken): TemplateResult {
    if (!token.meridiem) return html`${token.text}`
    const meridiem = html`<span class="meridiem">${token.meridiem}</span>`
    return token.meridiemFirst ? html`${meridiem}${token.text}` : html`${token.text}${meridiem}`
  }

  private _renderTime(time: ItemTime): TemplateResult | typeof nothing {
    if (time.kind === 'none') return nothing
    if (time.kind === 'point') return html`${this._renderToken(time.at)}`
    return html`${this._renderToken(time.from)} ${TIME_DASH} ${this._renderToken(time.to)}`
  }

  private _renderRow(row: LayoutRow, ctx: FormatContext): TemplateResult {
    if (row.node.type === 'header') {
      return html`<div class="heading cw-truncate">${row.node.text}</div>`
    }

    if (row.node.type === 'more') {
      return html`
        <div class="more" style="--item-color: ${row.node.color}">
          <div class="rail"></div>
          <div class="cw-truncate">${moreLabel(row.node.count)}</div>
        </div>
      `
    }

    const item = row.node.item

    if (item.allDay) {
      return html`
        <div class="row ${item.kind} allday" style="--item-color: ${item.color}">
          ${ALL_DAY_BADGE}
          <div class="title cw-truncate">${item.title}</div>
        </div>
      `
    }

    const time = itemTime(item, ctx)

    return html`
      <div class="row ${item.kind}" style="--item-color: ${item.color}">
        ${item.kind === 'event' ? html`<div class="rail"></div>` : html`<div class="bullet"></div>`}
        <div class="body">
          <div class="title cw-truncate">${item.title}</div>
          ${
            row.expanded && item.location
              ? html`<div class="location cw-truncate">${item.location}</div>`
              : nothing
          }
          ${
            time.kind === 'none'
              ? nothing
              : html`<div class="time cw-truncate">${this._renderTime(time)}</div>`
          }
        </div>
      </div>
    `
  }

  private _renderColumn(
    column: LayoutColumn | undefined,
    ctx: FormatContext,
  ): TemplateResult | typeof nothing {
    if (!column?.rows.length) return nothing
    return html` <div class="flow">${column.rows.map(row => this._renderRow(row, ctx))}</div> `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing

    const now = this._now
    const { locale, hour12 } = timePreferences(this.hass?.locale)
    const ctx: FormatContext = { locale, timeZone: this._timeZone, hour12 }

    const mode = this.cwLayout
    const items = demoItems(this._config.demo_scenario ?? DEFAULT_DEMO_SCENARIO, now)

    // Small is today and nothing else, however busy tomorrow looks.
    const flow = buildFlow(items, { now, ctx, todayOnly: mode === 'small' })
    const { budgets } = geometryFor(mode, this.boxHeight, flow.todayEmpty)
    const columns = packFlow(flow.nodes, budgets, mode)
    const date = widgetDate(now, ctx)

    return html`
      <ha-card class="cw-pressable">
        <div class="widget">
          <div class="column">
            <div class="date">
              <div class="weekday">${date.weekday}</div>
              <div class="day">${date.day}</div>
            </div>
            ${
              flow.todayEmpty
                ? html`<div class="empty">${NO_EVENTS_TODAY}</div>`
                : this._renderColumn(columns[0], ctx)
            }
          </div>
          ${
            mode === 'medium'
              ? html`<div class="column">${this._renderColumn(columns[1], ctx)}</div>`
              : nothing
          }
        </div>
      </ha-card>
    `
  }
}

registerCard(CALENDAR_CARD_TAG, CupertinoCalendarCard, {
  name: 'Cupertino Calendar',
  description: 'An iOS-style calendar widget for your dashboard.',
})

export { CupertinoCalendarCard }
