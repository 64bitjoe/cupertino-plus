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
import { packFor } from './layout'
import { readWeather, type WeatherHour, type WeatherNow } from './model'
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
 * The weather widget: current conditions, and — at `medium` and `large` — the six-hour
 * strip beneath it.
 *
 * `model.ts` is where a Home Assistant `weather` entity and its two forecast
 * subscriptions become the one shape this class draws (`WeatherView`); `layout.ts` prices
 * how much of that shape a `medium`/`large` box has room for; `source.ts` is the socket
 * underneath. This class's own job, on top of measuring the box and drawing the answer
 * the way every sibling card does, is the one thing none of those three files can own:
 * holding the two live subscriptions open for exactly as long as this element is on the
 * dashboard pointed at exactly this entity, and not a moment longer — see `_resubscribe`.
 *
 * **`small` and `medium` only.** The daily list `large` grows into is Task 7's markup, and
 * this class's `render` simply does not call it yet: at `large` today it draws the same
 * header block `medium` does, the way `calendar-card.ts`'s own `render` folds `large`
 * into `medium`'s two-column flow rather than giving it a third arrangement of its own.
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

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const entityId = this._config.entity
    if (!entityId) return html`<ha-card><div class="empty">${NO_ENTITY}</div></ha-card>`

    const view = readWeather(this.hass, entityId, this._daily, this._hourly)
    if (!view) return html`<ha-card><div class="empty">${NO_ENTITY}</div></ha-card>`

    // `large` is not its own arrangement yet — Task 7 draws the daily list beneath this
    // block — so it gets exactly what `medium` draws, the same fold `calendar-card.ts`'s
    // own render() makes for the same reason: a large card should not sit on a blank
    // space where its header ought to be while its own markup is still unwritten.
    const wide = this.cwLayout !== 'small'

    // `packFor`'s `hours` is fixed at 6 for both `medium` and `large`; its `days` is
    // Task 7's to read and clamp against `daily.length`, so it is not asked for here —
    // this card never touches it, at any layout.
    const pack = packFor(
      this.cwLayout,
      { width: this.boxWidth, height: this.boxHeight },
      this.scaleFactor,
    )
    const hours = wide ? view.hours.slice(0, pack.hours) : []

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
