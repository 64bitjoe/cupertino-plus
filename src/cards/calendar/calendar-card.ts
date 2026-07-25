import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { VERSION, registerCard } from '../../core/register'

export const CALENDAR_CARD_TAG = 'cupertino-widgets-calendar'

export interface CalendarCardConfig extends CupertinoCardConfig {
  /** Calendar entities to show. Empty/absent means "every calendar", decided at render. */
  entities?: string[]
}

/**
 * SCAFFOLDING STAGE — the content below is hardcoded on purpose.
 * Real data lands via the `calendar/event/subscribe` websocket subscription; this
 * version exists to prove the toolchain, the sizing and the token layer.
 */
interface StubEvent {
  title: string
  time: string
  color: string
  calendar: string
}

const STUB_DATE = { weekday: 'Friday', day: '25', month: 'July' }

const STUB_EVENTS: StubEvent[] = [
  { title: 'Design review', time: '09:30', color: 'var(--cw-red)', calendar: 'Work' },
  { title: 'Lunch with Anna', time: '12:00', color: 'var(--cw-orange)', calendar: 'Personal' },
  { title: 'Dentist', time: '15:15', color: 'var(--cw-blue)', calendar: 'Personal' },
  { title: 'Standup notes', time: '17:00', color: 'var(--cw-green)', calendar: 'Work' },
  { title: 'Flight to Berlin', time: '20:40', color: 'var(--cw-indigo)', calendar: 'Travel' },
]

/** How many events each layout has room for without crowding. */
const EVENT_BUDGET = { small: 2, medium: 3, large: 5 } as const

class CupertinoCalendarCard extends CupertinoCard<CalendarCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      .widget {
        flex: 1;
        display: flex;
        min-height: 0;
        padding: var(--cw-inset);
        gap: var(--cw-space-3);
      }

      /* Small and large stack the date above the list; medium puts them side by side. */
      :host([cw-layout='small']) .widget,
      :host([cw-layout='large']) .widget {
        flex-direction: column;
      }

      :host([cw-layout='medium']) .widget {
        flex-direction: row;
        align-items: flex-start;
      }

      .date {
        flex: none;
      }

      :host([cw-layout='medium']) .date {
        /* Fixed gutter so event titles line up regardless of the numeral's width. */
        width: 68px;
      }

      .weekday {
        font: var(--cw-text-caption-2);
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--cw-red);
      }

      .day {
        font: var(--cw-text-large-title);
        /* Tabular figures keep the numeral from shifting between the 1st and the 30th. */
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
        color: var(--cw-label);
        margin-top: -2px;
      }

      :host([cw-layout='small']) .day {
        font: var(--cw-text-title-1);
      }

      .month {
        font: var(--cw-text-caption-1);
        color: var(--cw-label-secondary);
      }

      .events {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: var(--cw-space-2);
        overflow: hidden;
      }

      .event {
        display: flex;
        gap: var(--cw-space-2);
        min-width: 0;
        align-items: stretch;
      }

      /* The coloured rail that identifies the calendar, as in Apple's widget. */
      .rail {
        flex: none;
        width: 3px;
        border-radius: var(--cw-radius-pill);
        background: var(--event-color);
      }

      .event-body {
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .event-title {
        font: var(--cw-text-footnote);
        font-weight: 600;
        color: var(--cw-label);
      }

      .event-meta {
        font: var(--cw-text-caption-2);
        color: var(--cw-label-secondary);
      }

      :host([cw-layout='large']) .event-title {
        font: var(--cw-text-subheadline);
        font-weight: 600;
      }

      :host([cw-layout='large']) .event-meta {
        font: var(--cw-text-caption-1);
      }

      .empty {
        font: var(--cw-text-footnote);
        color: var(--cw-label-tertiary);
        margin: auto 0;
      }

      /* Temporary: makes it obvious at a glance that this build is the stub.
         Delete together with STUB_EVENTS once real data is wired. */
      .stub-badge {
        margin-top: auto;
        padding-top: var(--cw-space-1);
        font: var(--cw-text-caption-2);
        color: var(--cw-label-tertiary);
      }
    `,
  ]

  public static getStubConfig(): CalendarCardConfig {
    return { type: CALENDAR_CARD_TAG, size: 'medium' }
  }

  private _renderEvent(event: StubEvent): TemplateResult {
    const meta = this.cwLayout === 'small' ? event.time : `${event.time} · ${event.calendar}`
    return html`
      <div class="event" style="--event-color: ${event.color}">
        <div class="rail"></div>
        <div class="event-body">
          <div class="event-title cw-truncate">${event.title}</div>
          <div class="event-meta cw-truncate">${meta}</div>
        </div>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing

    const events = STUB_EVENTS.slice(0, EVENT_BUDGET[this.cwLayout])

    return html`
      <ha-card class="cw-pressable">
        <div class="widget">
          <div class="date">
            <div class="weekday">${STUB_DATE.weekday}</div>
            <div class="day">${STUB_DATE.day}</div>
            ${this.cwLayout === 'small' ? nothing : html`<div class="month">${STUB_DATE.month}</div>`}
          </div>
          <div class="events">
            ${
              events.length
                ? events.map(event => this._renderEvent(event))
                : html`<div class="empty">Nothing scheduled</div>`
            }
            ${
              this.cwLayout === 'large'
                ? html`<div class="stub-badge">hardcoded preview · v${VERSION}</div>`
                : nothing
            }
          </div>
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
