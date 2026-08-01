import { mdiCalendarMonth } from '@mdi/js'
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit'
import { state } from 'lit/decorators.js'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { registerCard } from '../../core/register'
import type { HomeAssistant, LovelaceCardEditor } from '../../core/types/ha'
import { CALENDAR_EDITOR_TAG } from './calendar-card-editor'
import { timePreferences, type TimeFormatOption } from './datetime'
import { demoItems } from './demo-data'
import { LOOKAHEAD_DAYS, buildFlow } from './flow'
import { TIME_DASH, itemTime, moreLabel, widgetDate } from './format'
import type { FormatContext, ItemTime, TimeToken } from './format'
import { geometryFor, packFlow, type LayoutColumn, type LayoutRow } from './layout'
import type { CalendarItem } from './model'
import { CalendarFeed, calendarsFor, subscriptionWindow } from './source'
import { TodoFeed, remindersEnabled, todoListsFor } from './todo-source'

export const CALENDAR_CARD_TAG = 'cupertino-widgets-calendar'

export interface CalendarCardConfig extends CupertinoCardConfig {
  /** Calendar entities to show. Empty/absent means "every calendar", decided at render. */
  entities?: string[]
  /**
   * Whether to draw reminders — the to-do items that carry a due date — beside the events.
   *
   * Absent means yes, so the to-do lists behave like the calendars: say nothing and you
   * get all of them. `false` is the one thing the entity picker below cannot express, since
   * an emptied picker and an untouched one report the same `[]`. See `remindersEnabled`.
   */
  show_reminders?: boolean
  /**
   * To-do lists to read reminders from. Empty/absent means "every list", decided at render,
   * exactly as `entities` does for the calendars.
   */
  todo_entities?: string[]
  /**
   * The clock this card prints times in, over the top of the Home Assistant profile.
   *
   * Absent or `system` means the profile decides, which is what the card has always done.
   * See `TIME_FORMAT_OPTIONS` in `datetime.ts` for why the two explicit values are worth
   * having at all.
   */
  time_format?: TimeFormatOption
  /**
   * Which fixture from `demo-data.ts` to draw INSTEAD of the user's calendars.
   *
   * For the dev harness, and nothing else. Absent — which is what every dashboard has,
   * in edit mode as much as out of it — means live data, and there is no other way to
   * reach a fixture: this key quietly defaulting to one is exactly how the card came to
   * show strangers' lunch plans in a real Home Assistant.
   */
  demo_scenario?: string
}

/**
 * Not localised yet: Home Assistant has no string for either and the widget being copied
 * says exactly these. One place to change when a translation layer exists.
 *
 * Two of them, because "nothing left" and "nothing at all" are different days and a
 * widget that cannot tell them apart is one the user has to check the calendar behind.
 * `No Events Today` at seven in the evening, after a day of meetings, reads as data
 * missing rather than as a day finished.
 */
const NO_EVENTS_TODAY = 'No Events Today'
const NO_MORE_EVENTS_TODAY = 'No More Events Today'

/**
 * How the MDI glyph is centred in the badge.
 *
 * `mdiCalendarMonth` inks x 3–21 and y 1–21, so (12, 11) is its centre and 18 is its
 * width. The transform lands it 10 units wide on a badge whose viewBox is 1:1 with CSS
 * pixels at `scale: 100`, so the calendar draws 10px there — half the disc, and set by
 * what survives being drawn that small rather than by any ratio. Above and below 100% the
 * whole badge is one length like any other and takes the glyph with it; what stays fixed
 * is the proportion, which is what the choice of 10 was about.
 */
const GLYPH = 'translate(10 10) scale(0.5556) translate(-12 -11)'

/**
 * The all-day badge: a filled circle with a calendar knocked out of it.
 *
 * It replaces the colour bar, and it has to, because an all-day row has nothing else
 * left to identify it by — no time under the title, no location.
 *
 * The path comes from `@mdi/js` — the same icon set Home Assistant draws the rest of
 * the dashboard from, so the badge belongs to the surrounding UI rather than to this
 * card. It is a bare path string and tree-shakes down to that one string, which is why
 * the package can be a dependency without the bundle noticing.
 *
 * Inlined rather than handed to `<ha-icon>` though, and that part is not incidental:
 * the row is priced in pixels by `layout.ts`, and an icon arriving a frame late out of
 * HA's icon registry would be measured at the wrong height. The dev harness has no
 * registry at all — `dev/ha-stubs.ts` does not stub one — so `<ha-icon>` there is an
 * empty box, and the README screenshots are taken in that harness.
 */
const ALL_DAY_BADGE = html`
  <svg class="badge" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="10" fill="var(--item-accent)" />
    <path d=${mdiCalendarMonth} transform=${GLYPH} fill="#fff" />
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
      /* Every px in this stylesheet is a design unit multiplied by --cw-scale, and
         layout.ts holds the same numbers unscaled — it divides the measured box by the
         factor instead. So the comments below go on naming the sizes the card is drawn at
         at 100%, which are the sizes the budget is priced in. */
      .widget {
        /* layout.ts prices its row budget in pixels off this and off the height of a
           compact row (its GAP and COMPACT_PX). Change either here and the budget
           stops describing what actually gets drawn. */
        --cw-flow-gap: calc(6px * var(--cw-scale));

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
        font: 600 calc(13px * var(--cw-scale)) / calc(16px * var(--cw-scale)) var(--cw-font);
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--cw-red);
      }

      .day {
        font: 700 calc(52px * var(--cw-scale)) / calc(56px * var(--cw-scale)) var(--cw-font);
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
        padding-top: calc(4px * var(--cw-scale));
        font: 600 calc(13px * var(--cw-scale)) / calc(16px * var(--cw-scale)) var(--cw-font);
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
      }

      /* What did not fit: "2 more events".

         A caption, not a card. It borrows the event rail to say which calendar you are
         missing, and pointedly not the tint behind it — a tinted row would read as one
         more event, when the whole point of the line is that those did not fit. The
         10px of padding lines its bar up with the bars of the rows above, and the 22px it
         comes to is one of the three one-row heights layout.ts prices ROW against — a
         heading is 20px, an all-day chip 24px — so this must stay short. */
      .more {
        flex: none;
        min-width: 0;
        display: flex;
        align-items: stretch;
        gap: var(--cw-space-2);
        padding: calc(2px * var(--cw-scale)) calc(10px * var(--cw-scale)) 0;
        font: var(--cw-text-subheadline);
        color: var(--cw-label-secondary);
      }

      /* ---- What a calendar's colour is worth -------------------------------- */

      /* Four roles out of the one hex Home Assistant holds for a calendar — bar, title,
         time, chip background — and the hue is the one thing that never moves. Only L and
         C do, which is what makes the four read as one colour at four strengths.
         docs/calendar-widget-rules.md §1 has the table, the guards and the values these
         were checked against.

         In CSS rather than in TypeScript because of what the input can be: Home
         Assistant's colour picker writes a token, so --item-color is as often
         var(--red-color) as it is a hex out of the registry, and only the cascade can say
         what a theme's token is worth. Deriving it in source.ts would mean either
         resolving that through getComputedStyle on every render or refusing the tokens,
         and a card that ignored the user's own theme to keep its arithmetic in one
         language would be taking the wrong thing seriously.

         It hands the sRGB clamp to the browser too, which is not a theoretical tidiness:
         oklch() is gamut-mapped at paint, and lifting --cw-blue to the dark floor below
         costs it 0.034 of chroma it has nowhere else to put. */
      .row,
      .more {
        --item-accent: oklch(from var(--item-color) l c h);
        --item-title: oklch(
          from var(--item-color) clamp(0.26, calc(l - 0.29), 0.48) calc(c * 0.52) h
        );
        --item-time: oklch(
          from var(--item-color) clamp(0.38, calc(l - 0.135), 0.62) calc(c * 0.66) h
        );
        --item-bg: oklch(from var(--item-color) 0.97 calc(c * 0.08) h);
      }

      /* Dark is not light with the numbers nudged, and two of these say so. The bar takes
         the title's job as well — one lifted colour for both, where the light theme drops
         the title 0.29 below the bar — and the chip background is a lightness of its own
         rather than the base at low alpha over the surface. It cannot be that: an orange
         event's chip comes out #362714 against a widget on #1C1C1E, so its blue channel
         has to go BELOW the surface's, which no tint of a colour laid over it can do. */
      :host([dark]) .row,
      :host([dark]) .more {
        --item-accent: oklch(from var(--item-color) max(l, 0.68) c h);
        --item-title: var(--item-accent);
        --item-time: oklch(from var(--item-color) calc(max(l, 0.68) - 0.11) calc(c * 0.85) h);
        --item-bg: oklch(from var(--item-color) 0.28 calc(c * 0.25) h);
      }

      /* Title line (22px) + time line (20px) + this padding = the 56px that layout.ts
         calls COMPACT_PX and prices two budget rows at. */
      .row {
        flex: none;
        min-width: 0;
        display: flex;
        align-items: stretch;
        gap: var(--cw-space-2);
        padding: calc(7px * var(--cw-scale)) calc(10px * var(--cw-scale));
        border-radius: var(--cw-radius-inner);
      }

      .row.event {
        background: var(--item-bg);
      }

      .row.reminder {
        background: var(--cw-fill);
      }

      /* An all-day entry keeps the tint of an event and loses everything else: no time
         under the title, so the chip closes up around the one line it has. 22px of title
         inside 1px of padding is the 24px that layout.ts prices a single budget row at
         (its ROW, less the gap) — this is the tallest one-row node there is, so it must
         not grow.

         A reminder reaches this rule too, when its to-do is due on a date with no time on
         it. It keeps the bullet and the 10px inset the two-line rows use — the badge below
         is a calendar, which is not what a to-do is — and comes to the same 24px, so the
         budget does not have to know the difference. */
      .row.allday {
        align-items: center;
        padding: calc(1px * var(--cw-scale)) calc(10px * var(--cw-scale));
      }

      /* The 2px on the left is the badge's inset, not a spacing step. A 24px chip with a
         12px inner radius ends in a semicircle of r=12; the badge is r=10 on the same
         centre, so it clears the chip by 2px right around that arc rather than only at the
         sides. It is the smallest inset that still reads as one shape nested in another —
         flush, the two rims merge into a single edge and the badge stops looking like a
         badge. Both radii and both insets move together or not at all. */
      .row.allday.event {
        padding-left: calc(2px * var(--cw-scale));
      }

      /* 20px inside a 24px chip, so the badge clears the chip's edge by 2px on every
         side — the row's own 1px of padding plus the 1px that centring 20 in 22 leaves
         over. Nothing here forces the vertical gap; it falls out of those two, which is
         why the width and the row's padding have to move together. */
      .badge {
        flex: none;
        width: calc(20px * var(--cw-scale));
        height: calc(20px * var(--cw-scale));
      }

      /* The colour bar that says which calendar an event belongs to. */
      .rail {
        flex: none;
        width: calc(3px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        background: var(--item-accent);
      }

      /* A reminder is a thing you tick off, so it gets a tickable-looking circle. */
      .bullet {
        flex: none;
        align-self: center;
        width: calc(13px * var(--cw-scale));
        height: calc(13px * var(--cw-scale));
        border-radius: 50%;
        border: calc(1.5px * var(--cw-scale)) solid var(--item-accent);
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
        color: var(--item-title);
      }

      /* The location rides with the time rather than with the title: it is the same size
         and the same afterthought, and a third weight between the two would read as a
         third kind of information. */
      .row.event .location,
      .row.event .time {
        color: var(--item-time);
      }

      .row.reminder .title {
        color: var(--cw-label);
      }

      .row.reminder .location,
      .row.reminder .time {
        color: var(--cw-label-secondary);
      }

      /* AM/PM rides smaller than the digits, the way the phone sets it.

         The zero line-height is load-bearing, not decoration. A smaller font in the same
         line box gets a bigger half-leading, so its inline box hangs below the parent's
         strut and grows the line: the time line measures 22px with an AM/PM in it and
         20px without, which made a compact row 58px on a 12-hour clock and 56px on a
         24-hour one. layout.ts prices the row budget off that 56px, so the meridiem was
         quietly buying two pixels the budget had not sold it. Zeroing the line-height
         takes this box out of the line-box calculation and leaves the glyphs exactly
         where they were. */
      .meridiem {
        font-size: 0.82em;
        font-weight: 600;
        letter-spacing: 0.01em;
        line-height: 0;
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
    return { type: `custom:${CALENDAR_CARD_TAG}` }
  }

  /**
   * The visual editor, which is worth more than the one field inside it.
   *
   * `hui-element-editor` renders its tab strip only inside the GUI branch, so a card
   * that does not answer this gets no **Visibility** tab and no **Layout** tab either —
   * the user is handed a raw YAML box and nothing else.
   *
   * Home Assistant awaits this, so a plain element is as good as a promise. There is no
   * waiting on the other side though — the deadline it does enforce is on resolving the
   * *card* tag out of `custom:…`, long before this runs, and whatever comes back here is
   * used as-is. So the editor tag has to be defined already: it is, because importing
   * this module imports the one that defines it.
   */
  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(CALENDAR_EDITOR_TAG) as LovelaceCardEditor
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

  /**
   * The rows Home Assistant has pushed, from every subscribed calendar at once.
   *
   * A `@state()` field written by a callback, the same shape as `_now`, and it needs no
   * help from `watchedEntities()` to be seen: `shouldUpdate` waves through anything that
   * is not solely a `hass` swap, and this is not one.
   */
  @state() private _items: readonly CalendarItem[] = []

  /** The same, from the to-do lists. Kept apart only because two feeds report separately. */
  @state() private _reminders: readonly CalendarItem[] = []

  private readonly _feed = new CalendarFeed(items => {
    this._items = items
  })

  private readonly _todos = new TodoFeed(items => {
    this._reminders = items
  })

  /**
   * Whether this card is drawing fixtures rather than the user's calendars.
   *
   * Exactly one way in: the config asks for one by name, which only the dev harness
   * does. Nothing infers it, and in particular NOT from `preview`.
   *
   * That is worth spelling out, because `preview` reads like the place for it and is not.
   * `hui-section` assigns `preview = lovelace.editMode` to every card it holds, so it is
   * true for the whole dashboard the moment the pencil is pressed — it means "the user is
   * editing", not "this is a thumbnail". Keying fixtures off it turned every calendar on
   * the board into strangers' lunch plans on entering edit mode, which is the one moment
   * the user most needs to see which calendars they actually picked. HA's own cards use
   * it to stay visible and to size differently while editing, never to invent data.
   */
  private get _fixtures(): string | undefined {
    return this._config?.demo_scenario
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    this._scheduleTick()
    // A move in the DOM disconnects and reconnects the card without changing a single
    // reactive property, so no update runs and `willUpdate` never fires. This is the
    // only hook that sees it.
    void this._reconcileFeed()
  }

  public override disconnectedCallback(): void {
    clearTimeout(this._tick)
    this._tick = undefined
    this._feed.stop()
    this._todos.stop()
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    // `_now` is in here for the midnight rollover: the subscription window is keyed on
    // the day, so ticking through midnight is what moves it on. Every other tick finds
    // the key unchanged and costs nothing.
    if (changed.has('hass') || changed.has('_config') || changed.has('_now')) {
      void this._reconcileFeed()
    }
  }

  /**
   * Entity ids whose state changes have to reach this card.
   *
   * Overridden for the zero-config case, where the card follows whatever calendars and
   * to-do lists exist and a filter that let a bare `hass` swap through unnoticed would
   * never find out about a new one. Derived from `hass` on every call rather than cached,
   * because that is what puts a newly-appeared entity in the list at the moment its state
   * first differs from `undefined`.
   *
   * An entity that goes away is the one case this cannot catch — it drops out of the
   * list before anything compares it. `hass` swaps often enough for another reason that
   * this has never been visible, and a subscription to a deleted entity is closed by
   * Home Assistant regardless.
   */
  protected override watchedEntities(): string[] {
    const calendars = calendarsFor(this._config?.entities, this.hass)
    if (!remindersEnabled(this._config?.show_reminders)) return calendars
    return [...calendars, ...todoListsFor(this._config?.todo_entities, this.hass)]
  }

  private async _reconcileFeed(): Promise<void> {
    if (!this.isConnected) return

    const hass = this.hass
    if (this._fixtures !== undefined || !hass?.connection) {
      this._feed.stop()
      this._todos.stop()
      return
    }

    // Both, and neither waits for the other: they are separate subscriptions over one
    // socket, and a slow calendar must not hold the reminders back.
    await Promise.all([
      this._feed.reconcile(
        hass,
        calendarsFor(this._config?.entities, hass),
        subscriptionWindow(this._now, LOOKAHEAD_DAYS),
        this._timeZone,
      ),
      this._reconcileTodos(hass),
    ])
  }

  /**
   * The to-do half, which has one question in front of it the calendars do not.
   *
   * Switched off means not subscribed at all rather than subscribed and filtered: the
   * cheapest way to draw no reminders is to not ask Home Assistant for them, and `stop`
   * is what takes the rows already on screen away with it.
   */
  private async _reconcileTodos(hass: HomeAssistant): Promise<void> {
    if (!remindersEnabled(this._config?.show_reminders)) {
      this._todos.stop()
      return
    }

    await this._todos.reconcile(
      hass,
      todoListsFor(this._config?.todo_entities, hass),
      this._timeZone,
    )
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
          ${item.kind === 'event' ? ALL_DAY_BADGE : html`<div class="bullet"></div>`}
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
    const { locale, hour12 } = timePreferences(this.hass?.locale, this._config.time_format)
    const ctx: FormatContext = { locale, timeZone: this._timeZone, hour12 }

    const mode = this.cwLayout
    const fixtures = this._fixtures
    // One pile, and `buildFlow` sorts it: events and reminders share a stream rather than
    // being drawn in sections of their own (§2). The fixtures already hold both.
    const items =
      fixtures === undefined ? [...this._items, ...this._reminders] : demoItems(fixtures, now)

    // Small is today and nothing else, however busy tomorrow looks.
    const flow = buildFlow(items, { now, ctx, todayOnly: mode === 'small' })
    // The scale goes in as a factor, not as scaled constants: `layout.ts` prices rows in
    // design units and divides the box it was handed, so the budget shrinks as the type
    // grows without either side restating the other's numbers.
    const { budgets } = geometryFor(mode, this.boxHeight, flow.todayEmpty, this.scaleFactor)
    const columns = packFlow(flow.nodes, budgets, mode)
    const date = widgetDate(now, ctx)
    const emptyLabel = flow.todayDone ? NO_MORE_EVENTS_TODAY : NO_EVENTS_TODAY

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
                ? html`<div class="empty">${emptyLabel}</div>`
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
  description: 'A Cupertino-style calendar widget for your dashboard.',
})

export { CupertinoCalendarCard }
