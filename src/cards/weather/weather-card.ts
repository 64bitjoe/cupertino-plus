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
import { packFor, spanFor, weekRange, type Span } from './layout'
import { readWeather, type WeatherDay, type WeatherHour, type WeatherNow } from './model'
import { subscribeForecast, supportsForecast, type ForecastItem, type ForecastKind } from './source'

export const WEATHER_CARD_TAG = 'cupertino-plus-weather'

export interface WeatherCardConfig extends CupertinoCardConfig {
  /**
   * The weather entity to draw. Absent means the empty state: unlike the calendar or
   * battery cards, there is no "every weather entity" reading to fall back to — a
   * dashboard rarely holds more than one, and drawing an arbitrary first match would be
   * a worse guess than asking.
   */
  entity?: string
}

/**
 * Not localised, matching the rest of the library's own marks: Home Assistant has no
 * string for it, and there is nothing to translate about a picker with nothing picked.
 */
const NO_ENTITY = 'No Entity'

/** Stands in for a temperature this card cannot read, same glyph as every sibling card's own dash. */
const RANGE_DASH = '—'

/**
 * The weather widget: current conditions, the six-hour strip at `medium` and `large`, and
 * — at `large` only — the daily rows underneath it.
 *
 * `model.ts` is where a Home Assistant `weather` entity and its two forecast
 * subscriptions become the one shape this class draws (`WeatherView`); `layout.ts` prices
 * how much of that shape a `medium`/`large` box has room for and carries the range-bar
 * arithmetic (`weekRange`/`spanFor`) this class calls but does not own; `source.ts` is the
 * socket underneath. This class's own job, on top of measuring the box and drawing the
 * answer the way every sibling card does, is the one thing none of those three files can
 * own: holding the two live subscriptions open for exactly as long as this element is on
 * the dashboard pointed at exactly this entity, and not a moment longer — see
 * `_resubscribe`.
 */
class CupertinoWeatherCard extends CupertinoCard<WeatherCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      /* Every px below is a design unit multiplied by --cw-scale, and layout.ts holds the
         same numbers unscaled: it divides the measured box by the factor instead, so the
         two sides of the arithmetic never restate each other. This stylesheet is what
         turns layout.ts's HEADER (160) from a reasoned estimate into a real number: the
         'now' block below sums to 85 design units (footnote 18 + a 4 gap + large-title 41
         + a 4 gap + footnote 18) and the hourly strip to 63 (caption-2 13 + a 4 gap + a
         24-unit glyph + a 4 gap + footnote 18), with the --cw-space-3 gap between the two
         sections making the third term — 85 + 12 + 63 is exactly 160, so HEADER needed no
         correction once this file existed to check it against. */
      ha-card {
        box-sizing: border-box;
      }

      .widget {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        /* Must match layout.ts's GAP: the same rhythm separates the current-conditions
           block from the hourly strip here as separates one daily row from the next
           there, and both read it off --cw-space-3 rather than restating 12. */
        gap: var(--cw-space-3);
        padding: var(--cw-inset);
        min-width: 0;
      }

      /* The tap target is the whole widget, not a cell inside it: a weather card draws
         exactly one entity, so unlike the battery and complication grids there is no
         second subject a press on empty space could be mistaken for. */
      .widget:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
        border-radius: var(--cw-radius-inner);
      }

      /* ---- Current conditions ------------------------------------------------------ */

      .now {
        position: relative;
        display: flex;
        flex-direction: column;
        /* Must match the HEADER comment above: two of these between three stacked
           lines is what the 85-unit sum assumes. */
        gap: var(--cw-space-1);
        min-width: 0;
      }

      .now .location {
        font: var(--cw-text-footnote);
        color: var(--cw-label-secondary);
        /* Room is left on the right for the glyph, which floats over this line and the
           top of the temperature below rather than taking a row of its own — see .glyph. */
        padding-right: calc(40px * var(--cw-scale));
      }

      .now .temperature {
        font: var(--cw-text-large-title);
        color: var(--cw-label);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }

      .now .detail {
        font: var(--cw-text-footnote);
        color: var(--cw-label-secondary);
      }

      /* Absolutely positioned, and that is load-bearing rather than a styling choice: it
         is what keeps the glyph from costing the 'now' block a fourth line, which would
         put this stylesheet's total past the 160 the comment above claims for it. Top
         right, the way Apple's own small and medium weather widgets place it. */
      .now .glyph {
        position: absolute;
        top: 0;
        right: 0;
        --mdc-icon-size: calc(32px * var(--cw-scale));
        color: var(--cw-label-secondary);
      }

      /* An entity that has gone unavailable is still drawn, dimmed, the same call the
         battery and complication cards make for a dead sensor rather than dropping it. */
      .now.unknown .glyph {
        opacity: 0.4;
      }

      .now.unknown .temperature {
        color: var(--cw-label-secondary);
      }

      /* ---- Hourly strip: medium and large only -------------------------------------- */

      .hourly {
        display: flex;
        /* space-between rather than a fixed column width: HOURS is a count, not a width,
           and spec §3 lets a wider card give each column more room instead of adding a
           seventh — this is what lets the row simply stretch to fill it. */
        justify-content: space-between;
        gap: var(--cw-space-2);
        min-width: 0;
      }

      .hour {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Must match the HEADER comment's two 4-unit gaps for this block. */
        gap: var(--cw-space-1);
      }

      .hour .hour-label {
        font: var(--cw-text-caption-2);
        color: var(--cw-label-secondary);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .hour .hour-glyph {
        --mdc-icon-size: calc(24px * var(--cw-scale));
        color: var(--cw-label);
      }

      .hour .hour-temp {
        font: var(--cw-text-footnote);
        color: var(--cw-label);
        font-variant-numeric: tabular-nums;
      }

      /* ---- Daily rows: large only ---------------------------------------------------- */

      /* One CSS grid rather than a stack of five-column flex rows: a grid's column tracks
         are sized once, across every row that feeds into them, so "Wed"/"Today"'s label
         column and the low/high columns line up down the whole list for free. Each day
         below contributes five direct children (label, glyph, low, bar, high) rather than
         one wrapper element per row — 'display: contents' would do the same, but skipping
         the wrapper entirely means there is no extra box whose own margins or line-height
         could quietly add height DAY_ROW doesn't know about. 'auto' on every column but
         the bar's lets the grid size label/glyph/low/high to their own content instead of
         a guessed pixel width, which is one fewer number this file has to keep in sync
         with layout.ts; only the bar column, '1fr', has to be told to take what's left,
         since it is the one column with no intrinsic content width of its own to measure.
         'align-items: center' centres every cell — text and icon alike — within whatever
         height 'min-height' below gives its row. */
      .daily {
        display: grid;
        grid-template-columns: auto auto auto 1fr auto;
        column-gap: var(--cw-space-2);
        /* Matches layout.ts's GAP (12, same constant the module comment says this rhythm
           and the section-to-section gap above share) — the space between one day and
           the next, not a number restated here. */
        row-gap: var(--cw-space-3);
        align-items: center;
        min-width: 0;
      }

      /* Every direct child of .daily is one of the five per-row cells, so a single rule
         here is what turns layout.ts's DAY_ROW (28) from an estimate into the row height
         this stylesheet actually draws: a 24-unit glyph (.day-glyph below) centred by
         'align-items: center' inside a 28-unit-tall track leaves exactly two units of
         breathing room above and below it, which is the arithmetic DAY_ROW's own comment
         already gives. Every other cell in the row (label, low, bar, high) is shorter than
         24 units at --cw-text-footnote's 18px line-height, so the glyph — not the text —
         is what actually sets the row's height; giving every cell the same 'min-height'
         rather than only the glyph's is what makes that height computed and not depend on
         the accident of the icon being the tallest cell. */
      .daily > * {
        min-height: calc(28px * var(--cw-scale));
      }

      .day-label {
        font: var(--cw-text-footnote);
        color: var(--cw-label);
      }

      .day-glyph {
        --mdc-icon-size: calc(24px * var(--cw-scale));
        color: var(--cw-label-secondary);
        justify-self: center;
      }

      .day-low {
        font: var(--cw-text-footnote);
        color: var(--cw-label-secondary);
        font-variant-numeric: tabular-nums;
        /* Right-aligned so the reading sits flush against the bar's cold end, the way the
           reference does — "L" and the bar's own left edge read as one unit. */
        text-align: right;
      }

      .day-high {
        font: var(--cw-text-footnote);
        color: var(--cw-label);
        font-variant-numeric: tabular-nums;
        text-align: left;
      }

      .day-bar {
        position: relative;
        height: calc(6px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        background: var(--cw-track);
        /* A floor under the one column with no content of its own to hold it open: the
           four 'auto' columns beside it are sized by their text/icon, but the track is
           '1fr' and would go to 0 rather than negative if a narrow card and a long
           locale's weekday name both crowded it at once. A judgement call, the same kind
           layout.ts's own FLOOR_WIDTH is, not a number with a --cw-* twin. */
        min-width: calc(40px * var(--cw-scale));
      }

      .day-bar-fill {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: var(--cw-radius-pill);
        /* A gradient, not a solid tint, because this bar is the one place in the card that
           encodes two numbers at once rather than one: its left end is the day's low, its
           right end is the day's high, and only a colour that itself changes across the
           span can carry both without a second glance at the numerals either side of it.
           Cool to warm — --cw-blue through --cw-yellow to --cw-orange — reads the
           same way a real thermometer does, and reuses the palette every other card in
           this library already draws from rather than adding a token that exists solely
           for this one bar. */
        background: linear-gradient(to right, var(--cw-blue), var(--cw-yellow), var(--cw-orange));
      }

      /* Today's current reading, placed on the same week-wide scale the bar itself is —
         see the class comment on _dailyDot. Centred on its 'left' percentage by a
         negative margin equal to half its own size rather than 'transform:
         translateX(-50%)', so it composes with the 'left' percentage _renderDaily already
         sets inline without a second transform fighting it. The ring is the card's own
         surface colour rather than a plain border, which is what keeps the dot legible
         sitting on top of every colour the gradient underneath it passes through, warm or
         cool. */
      .day-bar-dot {
        position: absolute;
        top: 50%;
        width: calc(8px * var(--cw-scale));
        height: calc(8px * var(--cw-scale));
        margin-top: calc(-4px * var(--cw-scale));
        margin-left: calc(-4px * var(--cw-scale));
        border-radius: 50%;
        background: var(--cw-label);
        border: calc(2px * var(--cw-scale)) solid var(--cw-surface);
        box-sizing: border-box;
      }

      /* Secondary, not tertiary: with no entity configured this line is the entire
         card, the same call the battery and complication cards make for their own
         empty states. */
      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
      }
    `,
  ]

  /** The `custom:` prefix is load-bearing (see the calendar card's note on it). */
  public static getStubConfig(): WeatherCardConfig {
    return { type: `custom:${WEATHER_CARD_TAG}` }
  }

  // getConfigElement arrives in Task 8. A card with none loses its Visibility and
  // Layout tabs too (see the calendar card's note on that contract), so the interim
  // cost is real, but a stub editor standing in for one that does not exist yet would
  // be dead code wearing the shape of a later task — the same call the complication
  // card's brief made before its own editor existed.

  /** The two live forecast pushes, kept as plain arrays for `readWeather` to fold in. */
  @state() private _daily: ForecastItem[] = []
  @state() private _hourly: ForecastItem[] = []

  /**
   * The live subscriptions, keyed by kind, and the entity they belong to.
   *
   * The entity is held alongside them because the teardown is not triggered by the
   * subscription itself but by the config changing under it: a card repointed from one
   * weather entity to another must drop the old socket before raising the new one, or two
   * subscriptions deliver into the same fields and whichever message arrives last wins.
   * That failure is intermittent, which is the worst kind — it looks like a flickering
   * forecast rather than like a bug.
   *
   * Each slot carries a `token` alongside the eventual `stop`, and that is what closes a
   * second failure mode the entity check above does not: two `_resubscribe` calls racing
   * each other — a config edit that leaves the entity unchanged, a rapid layout flip, or a
   * disconnect immediately followed by a reconnect when the card is moved rather than
   * removed (`calendar-card.ts`'s own `connectedCallback` documents that move as a real
   * occurrence, not a hypothetical). `_subscriptions.has(kind)` is the only signal
   * `_resubscribe` has for "already subscribing", and if that check only went true once
   * `subscribeForecast` resolved, two overlapping calls would both pass it and both open a
   * live subscription to the same kind. The token is set synchronously, before that await,
   * so the second call sees the kind as claimed and skips it — the same reservation
   * `CalendarFeed._live` makes per calendar in `calendar/source.ts`, and the shape this
   * follows rather than reinventing. `stop` starts absent and is filled in once the
   * subscribe resolves; see `_resubscribe`'s own comments for what happens to a slot
   * that is superseded before or after that point.
   */
  private _subscriptions = new Map<ForecastKind, { token: object; stop?: () => Promise<void> }>()
  // `string | undefined` rather than the bare `?: string` shorthand: `exactOptionalPropertyTypes`
  // treats those as different types, and `_resubscribe` below assigns `entityId` — itself
  // `string | undefined` — straight into this field rather than only ever omitting it.
  private _subscribedTo: string | undefined

  private async _resubscribe(): Promise<void> {
    const entityId = this._config?.entity
    const entity = entityId ? this.hass?.states[entityId] : undefined

    if (entityId !== this._subscribedTo) await this._unsubscribeAll()
    this._subscribedTo = entityId
    if (!this.hass || !entity) return

    // Daily is not optional even at `small`: the high and low under the temperature come
    // from the forecast rather than from attributes, so the smallest card still needs it.
    const wanted: ForecastKind[] = ['daily']
    if (this.cwLayout !== 'small') wanted.push('hourly')

    for (const kind of wanted) {
      if (this._subscriptions.has(kind)) continue
      if (!supportsForecast(entity, kind)) continue

      // Reserved before the subscribe below is awaited, not after — see the class
      // comment on `_subscriptions` for why the order matters. A second `_resubscribe`
      // racing this one now finds `has(kind)` true and skips it, the same claim
      // `CalendarFeed.reconcile` makes on `_live` before its own subscribe calls.
      const token = {}
      this._subscriptions.set(kind, { token })

      let stop: () => Promise<void>
      try {
        stop = await subscribeForecast(this.hass, entity.entity_id, kind, forecast => {
          // A push arriving for a slot this token no longer owns — superseded by a
          // later `_resubscribe`, or the card has moved on to a different entity — is
          // dropped rather than applied. Without this, two live subscriptions to the
          // same kind (an old one on its way out, a new one just opened) would both
          // write into `_daily`/`_hourly`, and whichever push happened to arrive last
          // would win: the exact flicker the class comment above warns about. Checked
          // by identity against the map's current entry rather than against
          // `_subscribedTo`, because a kind-level race (two calls for the SAME entity)
          // never touches `_subscribedTo` at all — only the per-kind token moves.
          if (this._subscriptions.get(kind)?.token !== token) return
          if (kind === 'daily') this._daily = forecast
          else this._hourly = forecast
        })
      } catch (error) {
        // Home Assistant refusing the command outright (an entity that stopped
        // existing between `supportsForecast` and this call, say), not this slot being
        // superseded — that case is handled below, once there is a `stop` to close.
        // The reservation still has to be let go here, or a kind that failed once would
        // read as permanently claimed and never be retried.
        if (this._subscriptions.get(kind)?.token === token) this._subscriptions.delete(kind)
        console.warn(
          `[cupertino-plus] cannot read the ${kind} forecast for ${entity.entity_id}`,
          error,
        )
        continue
      }

      // The await above is a window: the card can be torn down, repointed at another
      // entity, or asked to resubscribe again for the same one, while it is open. Any of
      // those clears or replaces this slot, so if the token reserved above is no longer
      // the one sitting in the map, this subscription is already orphaned — close it
      // rather than filing it under a card that has moved on.
      const slot = this._subscriptions.get(kind)
      if (slot?.token !== token || !this.isConnected) {
        void stop()
        continue
      }
      slot.stop = stop
    }
  }

  private async _unsubscribeAll(): Promise<void> {
    // Reset before anything below awaits: a reconnect immediately following a
    // disconnect (the card moved in the DOM rather than removed — see the class comment
    // on `_subscriptions`) runs its own `_resubscribe` before the `stop()` calls below
    // have settled, and that call must not read the entity it is tearing down as the one
    // it is still subscribed to and skip its own teardown on that account.
    this._subscribedTo = undefined
    // Captured into a plain array, and only then cleared — a slot still in its
    // reservation gap (claimed by `_resubscribe` but not yet resolved to a real `stop`)
    // has nothing here to close; that attempt finds its token missing from the map once
    // its own await resolves and closes itself then, the same self-check `_resubscribe`
    // makes for every other way a slot can be superseded.
    const slots = [...this._subscriptions.values()]
    this._subscriptions.clear()
    this._daily = []
    this._hourly = []
    await Promise.all(slots.map(slot => slot.stop?.()))
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    void this._resubscribe()
  }

  public override disconnectedCallback(): void {
    // Nothing awaits this, deliberately: a lifecycle callback cannot be async, and
    // there is nothing useful to do with a failure to unsubscribe from a socket that is
    // already going away along with the element.
    void this._unsubscribeAll()
    super.disconnectedCallback()
  }

  public override setConfig(config: WeatherCardConfig): void {
    super.setConfig(config)
    // Also deliberately unawaited — see the comment on disconnectedCallback above;
    // setConfig is synchronous by contract, and this call is what notices an entity
    // swap and tears down the old socket before raising the new one.
    void this._resubscribe()
  }

  /**
   * The hourly subscription is gated on `cwLayout` (see `_resubscribe`), and a resize
   * that crosses the small/medium threshold is not a config change — nothing else calls
   * `_resubscribe` for it. `willUpdate` is where the base card already watches
   * `cwLayout` for exactly this kind of consequence.
   */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (changed.has('cwLayout')) void this._resubscribe()
  }

  /**
   * The entity plus `sun.sun`, whenever there is an entity configured at all — `sun.sun`
   * only matters to what `readWeather` computes (`isNightNow`, see its own comment), and
   * nothing renders that computation without an entity to draw it for.
   */
  protected override watchedEntities(): string[] {
    const entityId = this._config?.entity
    return entityId ? [entityId, 'sun.sun'] : []
  }

  /**
   * Open the entity's own more-info dialog.
   *
   * `hass-more-info` with an `entityId`: the same event every other card in this
   * library fires, verified against the 2026.7.4 bundle at the battery card.
   */
  private _openMoreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }),
    )
  }

  /** Enter and Space on the focused widget, the same arrangement every sibling card uses. */
  private _activate(entityId: string) {
    return (event: KeyboardEvent): void => {
      // Space scrolls the dashboard otherwise, and Enter would submit a form the card
      // may be sitting inside.
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this._openMoreInfo(entityId)
    }
  }

  /**
   * The line under the temperature: the day's high and low where the forecast has them,
   * falling back to the condition text where it does not.
   *
   * `now.high`/`now.low` can be independently null — a daily entry can arrive with a
   * `temperature` but no `templow` (see `source.ts`'s comment on `ForecastItem`) — so a
   * missing side draws `RANGE_DASH` rather than silently dropping half the line. Only
   * when both are absent (no daily forecast reached this card at all: an entity that does
   * not support it, or one that has not pushed yet) does the line give up on numbers
   * altogether and print the condition instead, so the card never renders an empty line
   * where the spec asks for one.
   */
  private _detailLine(now: WeatherNow): string {
    if (now.high === null && now.low === null) return now.condition
    return `H:${now.high ?? RANGE_DASH}  L:${now.low ?? RANGE_DASH}`
  }

  private _renderHourly(hours: WeatherHour[]): TemplateResult {
    return html`
      <div class="hourly">
        ${hours.map(
          hour => html`
            <div class="hour">
              <span class="hour-label">${hour.label}</span>
              <ha-icon class="hour-glyph" .icon=${hour.icon}></ha-icon>
              <span class="hour-temp">${hour.temperature}</span>
            </div>
          `,
        )}
      </div>
    `
  }

  /**
   * Where today's live reading sits on `week`'s shared scale — the same 0-to-1 track
   * fraction `spanFor`'s own `start`/`width` are, so `_renderDaily` can position it with
   * the identical `left: N%` it gives the bar.
   *
   * Deliberately not a call into `spanFor`: that function answers a *span* — a width to
   * floor and a start to pull back from the track's far edge so the floored width still
   * fits — and a single point has neither. Writing this out separately means the floor
   * and clamp logic that exists only for a range's own failure modes never has to be
   * explained away for a call site that has no width to floor in the first place.
   *
   * A flat week (`spread <= 0`, `spanFor`'s own zero-spread guard) resolves to the same
   * point `spanFor` draws its own floor-width mark at — the track's start — rather than a
   * hidden dot, so the two marks read as one row making one honest claim: "everything was
   * this temperature," not "the bar knows something the dot doesn't." A live reading
   * outside today's forecast low/high (`attributes.temperature` and the daily forecast are
   * two independent reports and can disagree by a degree) is clamped to the track's own
   * ends rather than drawn off it.
   */
  private _dailyDot(value: number, week: { min: number; max: number }): number {
    const spread = week.max - week.min
    if (spread <= 0) return 0
    return Math.max(0, Math.min(1, (value - week.min) / spread))
  }

  /**
   * The daily list: one row per day, all seven (or however many `days` holds) sharing one
   * scale.
   *
   * `weekRange` is called exactly once, here, for the whole list handed in — never inside
   * the `map` below, and never per day. That is the one thing this method exists to get
   * right: a `weekRange` call per day would hand `spanFor` a week of exactly one day every
   * time, and every bar would come back full-width and identical — each individually
   * "correct" by `spanFor`'s own math, and together telling the reader nothing, which is
   * the failure `layout.ts`'s module comment names directly. `week` is computed once and
   * the same object flows into every `spanFor` call below instead.
   *
   * Each day contributes five direct children — label, glyph, low, the bar, high — rather
   * than one wrapping row element; see `.daily`'s own stylesheet comment for why the grid
   * this renders into depends on that shape.
   */
  private _renderDaily(days: WeatherDay[], now: WeatherNow): TemplateResult {
    const week = weekRange(days)
    return html`
      <div class="daily">
        ${days.map(day => {
          const span: Span = spanFor(day, week)
          // Only today's row carries a dot — see the class comment on `_dailyDot` — and
          // only when there is a live reading to place: an entity that has never posted
          // `attributes.temperature` has nothing here to draw.
          const dot =
            day.label === 'Today' && now.temperatureValue !== null
              ? this._dailyDot(now.temperatureValue, week)
              : null
          return html`
            <span class="day-label">${day.label}</span>
            <ha-icon class="day-glyph" .icon=${day.icon}></ha-icon>
            <span class="day-low">${day.lowLabel}</span>
            <div class="day-bar">
              <div
                class="day-bar-fill"
                style=${`left:${span.start * 100}%;width:${span.width * 100}%`}
              ></div>
              ${
                dot !== null
                  ? html`<div class="day-bar-dot" style=${`left:${dot * 100}%`}></div>`
                  : nothing
              }
            </div>
            <span class="day-high">${day.highLabel}</span>
          `
        })}
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const entityId = this._config.entity
    if (!entityId) return html`<ha-card><div class="empty">${NO_ENTITY}</div></ha-card>`

    const view = readWeather(this.hass, entityId, this._daily, this._hourly)
    if (!view) return html`<ha-card><div class="empty">${NO_ENTITY}</div></ha-card>`

    // `medium` and `large` share the header block and the hourly strip; only `large`
    // grows the daily list underneath them, the same two-way split `calendar-card.ts`'s
    // own render() makes between its shared flow and a size-specific addition.
    const wide = this.cwLayout !== 'small'
    const large = this.cwLayout === 'large'

    const pack = packFor(
      this.cwLayout,
      { width: this.boxWidth, height: this.boxHeight },
      this.scaleFactor,
    )
    const hours = wide ? view.hours.slice(0, pack.hours) : []
    // `packFor`'s `days` prices only the box, never the forecast (see its own doc
    // comment) — this `Math.min` is the clamp that comment hands to this card: a tall
    // `large` box asking for eight rows from an entity that only forecasts five gets
    // five, not three undefined ones.
    const days = large ? view.days.slice(0, Math.min(pack.days, view.days.length)) : []

    const label = `${view.now.location}: ${
      view.unavailable ? 'unavailable' : `${view.now.condition}, ${view.now.temperature}`
    }`

    return html`
      <ha-card>
        <div
          class="widget cw-pressable"
          role="button"
          tabindex="0"
          aria-label=${label}
          @click=${() => this._openMoreInfo(entityId)}
          @keydown=${this._activate(entityId)}
        >
          <div class="now ${view.unavailable ? 'unknown' : ''}">
            <ha-icon class="glyph" .icon=${view.now.icon}></ha-icon>
            <div class="location cw-truncate">${view.now.location}</div>
            <div class="temperature">${view.now.temperature}</div>
            <div class="detail cw-truncate">${this._detailLine(view.now)}</div>
          </div>
          ${wide ? this._renderHourly(hours) : nothing}
          ${large ? this._renderDaily(days, view.now) : nothing}
        </div>
      </ha-card>
    `
  }
}

registerCard(WEATHER_CARD_TAG, CupertinoWeatherCard, {
  name: 'Cupertino Weather',
  description: 'A Cupertino-style weather widget for your dashboard.',
})

export { CupertinoWeatherCard }
