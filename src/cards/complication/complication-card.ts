import { html, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { runAction } from '../../core/actions'
import { panelClass, type CardContainer } from '../../core/container'
import { ClockController } from '../../core/clock'
import { Gestures, pressesAnything, pressHandlers, type PressHandlers } from '../../core/gestures'
import { registerCard } from '../../core/register'
import { TemplatePool } from '../../core/templates'
import type { LovelaceCardEditor, LovelaceGridOptions } from '../../core/types/ha'
import { timePreferences } from '../../core/time-preferences'
// Imported for the side effect as well as the constant: the editor tag has to be
// defined by the time getConfigElement is asked for it, and this is the only thing
// that reaches it.
import { COMPLICATION_EDITOR_TAG } from './complication-card-editor'
import { renderCell, renderCorner, type FaceContext } from './faces-render'
import { decimalsOf, formatExtreme, sparklineHoursFor, type SparklineGeometry } from './history'
import { HistoryFeed } from './history-feed'
import {
  bentoFace,
  bentoGrid,
  bentoSizes,
  BENTO_GAP,
  isBentoSize,
  layoutFor,
  packBento,
  type BentoPlacement,
  type ComplicationLayout,
} from './bento'
import { bentoFloors, packFor, floorsFor, withFloors } from './layout'
import {
  complicationTemplates,
  historyFor,
  readComplications,
  validStyle,
  watchedIds,
  entityConfigs,
  type Complication,
  type ComplicationDefaults,
  type ComplicationEntityConfig,
} from './model'
import { DEFAULT_STYLE, type ComplicationStyle } from './style'
import { complicationStyles } from './styles'
import { onTintVar, tintVar, type TintName } from './tint'

export const COMPLICATION_CARD_TAG = 'cupertino-plus-complication'

/**
 * What one update draws, worked out once in `willUpdate` and read by `render`, the history sync
 * and the countdown wake alike, so the rows are read (and the bento packed) once per update
 * against one clock rather than once per reader against several.
 */
interface Frame {
  /** Every configured row, read against `hass` and the templates' answers. */
  items: Complication[]
  /** The bento cells, when the layout is bento; empty otherwise. */
  bento: BentoCell[]
  /** The items actually drawn: in bento, only the cells that fit, with their faces. */
  drawn: Complication[]
  /** The clock the frame was read at. */
  now: number
}

const EMPTY_FRAME: Frame = { items: [], bento: [], drawn: [], now: 0 }

/** One bento cell as drawn: where it sits, the face it wears, its box in design units. */
interface BentoCell extends BentoPlacement {
  face: ComplicationStyle
  box: { width: number; height: number }
  item: Complication
}

export interface ComplicationCardConfig extends CupertinoCardConfig {
  /**
   * The entities to draw, in the order they are drawn.
   *
   * A row is a bare entity id, or an object when it needs a name, icon, range or colour
   * of its own — see `ComplicationEntityConfig`. Unlike the battery card, an empty list
   * here is not a question this card is unwilling to answer without: there is no "every
   * complication in the installation" reading to protect against, since a complication
   * says nothing at all about what it draws without an entity behind it. Empty just means
   * the empty state.
   */
  entities?: (string | ComplicationEntityConfig)[]
  /** Which of the eight faces to draw (see `style.ts`). Absent means `DEFAULT_STYLE`. */
  style?: ComplicationStyle
  /** Card-level range override, beneath a row's own `min`/`max`. See `range.ts`. */
  min?: number
  max?: number
  /** Card-level tint override, beneath a row's own `color`. See `tint.ts`. */
  color?: TintName
  /**
   * Draw a line of the reading's recent history beside it, on the rectangular and inline faces.
   * Numeric readings only; off by default, so a card written before it existed draws as it did.
   * The graph face draws its graph whatever this says.
   */
  sparkline?: boolean
  /** How far back the sparkline reaches, in hours, 1–48. Absent means 24. */
  sparkline_hours?: number
  /**
   * Count down to the moment a timer, a timestamp sensor, an `input_datetime` or a calendar's
   * next event holds, with the gauge draining as it goes — the Timer complication. Other
   * entities in the card are untouched. Off by default.
   */
  countdown?: boolean
  /**
   * The span, in hours, a countdown with no length of its own drains its ring over. Absent means
   * since the entity last changed (when the moment was set); a timer always uses its duration.
   */
  countdown_hours?: number
  /**
   * `glass`, the default, or the theme's `card`; see `core/container.ts`. The bleed face fills the
   * card with its own tint either way, so on it the choice shows only at the corners.
   */
  container?: CardContainer
  /**
   * `panel`, the default: one card, its entities in equal cells. `bento`: each entity its own
   * rounded cell of a size of its own, packed into a grid (`bento.ts`).
   */
  layout?: ComplicationLayout
}

/** Not localised: HA has no string for it, and the library's own words are its own. */
const NO_ENTITIES = 'No Entities'

/**
 * The complication card: any entity, drawn as a watch complication.
 *
 * `model.ts` turns a Home Assistant state into the one shape every face reads
 * (`Complication`), `range.ts` and `tint.ts` decide whether it gets a gauge and what
 * colour it tints, and `layout.ts` prices the grid the faces sit in. This class measures
 * the box, asks `layout.ts` how the count fits it, and draws the answer — the same
 * division of labour as the battery card, with one extra layer because a complication
 * has eight faces where a battery ring has one.
 *
 * `faces-render.ts` draws the faces, one function each, and `styles.ts` holds their stylesheet:
 * `circular`, the watch-face complication proper, with its open `gauge` and graphic `bezel`
 * relatives (`faces.ts` has their geometry); `inline`, the single-line strip; the three
 * rectangular chromes — `rectangular`, `rectangular-header` and `rectangular-bleed` — which share
 * one markup shape (`renderRectangular`) and differ only in stylesheet; `rectangular-graph`,
 * which trades the bar for the history graph; and `corner`. This class owns what the faces
 * cannot: the cell's gestures, the history feed and the clock (`FaceContext`).
 *
 * Beyond the faces it owns three clocks of its own, each idle unless asked for: the template
 * pool (`core/templates.ts`), the history feed (`history-feed.ts`) and the countdown wake
 * (`_ticker`, a `ClockController`), which sleeps while the card is off screen or the tab is hidden.
 */
class CupertinoComplicationCard extends CupertinoCard<ComplicationCardConfig> {
  static override styles: CSSResultGroup = [CupertinoCard.styles, complicationStyles]

  /** The `custom:` prefix is load-bearing (see the calendar card's note on it). */
  public static getStubConfig(): ComplicationCardConfig {
    return { type: `custom:${COMPLICATION_CARD_TAG}` }
  }

  /**
   * A card with no editor loses its **Visibility** and **Layout** tabs too — the tab strip
   * is rendered only inside the GUI branch. See the contract on `CupertinoCardEditor`.
   */
  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(COMPLICATION_EDITOR_TAG) as LovelaceCardEditor
  }

  /**
   * Every entity the rendering reads.
   *
   * Derived on each call rather than cached, the same reasoning as the battery card's
   * own `watchedEntities`: `setConfig` and this are the only two things that know the
   * config changed, and a stale list would filter out the state of an entity the user
   * has just added.
   */
  protected override watchedEntities(): string[] {
    return watchedIds(this._config?.entities)
  }

  /**
   * The defaults `core/size.ts` gives every card, raised to this card's own floors where
   * the defaults would sit below them.
   *
   * `super.getGridOptions()` returns a flat `rows: 4` — it has no idea this card exists,
   * let alone how many entities it holds — so spreading the floors on top of it (the
   * original shape here) only ever raised `min_rows`/`min_columns`, never the `rows`/
   * `columns` HA actually renders at before anyone touches the Layout tab. A three-entity
   * `rectangular` card floors at `min_rows: 6` but was still handed a default `rows: 4`:
   * below its own floor, and silently below it, because `ha-card` clips overflow
   * (`theme/base-styles.ts`) rather than spilling it — the third entity was not drawn
   * smaller or truncated, it was simply gone. Raising the default to the floor (never
   * lowering it, in case a future default grows past what this card needs) is what
   * closes that gap; the floors are the overflow design, see `floorsFor`, and a default
   * that starts under its own floor defeats it before the user ever drags anything.
   *
   * Recomputed on every call rather than cached, because both halves depend on the
   * config and a stale value is a card that can render, or be dragged, smaller than it
   * fits.
   */
  public override getGridOptions(): LovelaceGridOptions {
    const style = this._config?.style ?? DEFAULT_STYLE
    const count = entityConfigs(this._config?.entities).length

    // The merge lives in `layout.ts` beside the floors it folds in, and the literal
    // handling is documented there. It is a function rather than three lines here so the
    // test suite can call the same code this method does: an element cannot be built in
    // this project's node test environment, and a test that reimplemented the merge would
    // have passed against the broken version too.
    const floors =
      layoutFor(this._config?.layout) === 'bento' ? bentoFloors(count) : floorsFor(style, count)
    return withFloors(super.getGridOptions(), floors)
  }

  /** The card's template subscriptions; see `core/templates.ts`. */
  private readonly _templates = new TemplatePool(() => this.requestUpdate())

  /** The sparkline's history, shared with every other complication card on the page. */
  private readonly _history = new HistoryFeed(() => this.requestUpdate())

  /** Hold and double tap, for the cells that configure them; see `core/gestures.ts`. */
  private readonly _gestures = new Gestures()

  /** Who is looking, for a template's `user` variable. */
  private get _user(): string | undefined {
    return this.hass?.user?.name
  }

  /**
   * Wakes exactly when the soonest countdown's printed value next changes — by the second under
   * an hour, by the minute above it — and never while the card is off screen or the tab is in the
   * background. A card with no running countdown sets no timer at all. See `core/clock.ts`.
   */
  protected readonly _ticker = new ClockController(this, () => {
    const waits = this._frame.drawn.flatMap(item =>
      item.countdown?.nextTick != null ? [item.countdown.nextTick] : [],
    )
    return waits.length === 0 ? undefined : Math.min(...waits)
  })

  /** This update's rows; see `Frame`. */
  private _frame: Frame = EMPTY_FRAME

  public override disconnectedCallback(): void {
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  /**
   * Kept in step with the config on every update; `sync` is a diff, so this is cheap. The frame
   * is read here, once, before the template pool or the history feed is asked about it.
   */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this.hass || !this._config) {
      this._frame = EMPTY_FRAME
      return
    }
    this._templates.sync(this.hass, complicationTemplates(this._config.entities, this._user))

    const now = Date.now()
    const items = this._readItems(now)
    const bento = layoutFor(this._config.layout) === 'bento' ? this._packBento(items) : []
    const drawn = layoutFor(this._config.layout) === 'bento' ? bento.map(cell => cell.item) : items
    this._frame = { items, bento, drawn, now }

    // Only for the rows that draw a line, which `historyFor` decides from the row's own
    // override, the card's switch and the face; grouped by window, one sync per window.
    const windows = new Map<number, string[]>()
    for (const item of drawn) {
      if (item.history === null) continue
      windows.set(item.history, [...(windows.get(item.history) ?? []), item.id])
    }
    for (const [hours, ids] of windows) this._history.sync(this.hass, ids, hours, now)
  }

  /**
   * Every configured row, read against the current `hass` and the templates' answers.
   *
   * Times follow the profile: the clock format and language through `timePreferences` (the
   * calendar card's reading of `time_format`), and the zone — a naive date-time from Home
   * Assistant is read in the server's zone, and printed in it only when the profile pins the
   * frontend there (`locale.time_zone: server`).
   */
  private _readItems(now: number): Complication[] {
    if (!this.hass || !this._config) return []
    const user = this._user
    const hours = this._config.countdown_hours
    const { locale, hour12 } = timePreferences(this.hass.locale)
    const serverZone = this.hass.config?.time_zone
    const displayZone = this.hass.locale?.time_zone === 'server' ? serverZone : undefined
    return readComplications(this.hass, this._config.entities, this._defaults, {
      now,
      // Always passed, with the card's switch as `enabled`, so a row can turn a countdown on
      // that the card leaves off.
      countdown: {
        enabled: this._config.countdown === true,
        ...(hours !== undefined ? { hours } : {}),
      },
      sparkline: {
        enabled: this._config.sparkline === true,
        hours: sparklineHoursFor(this._config.sparkline_hours),
        style: this._config.style ?? DEFAULT_STYLE,
      },
      ...(locale ? { locale } : {}),
      hour12,
      ...(serverZone ? { serverZone } : {}),
      ...(displayZone ? { displayZone } : {}),
      // Rebuilt with the same `templateRequest` the registration used, so the keys agree.
      resolve: this._templates.resolver(user),
    })
  }

  /** One item's line, or `null` when there is none to draw (yet); memoised by the feed. */
  private _geometry(item: Complication): SparklineGeometry | null {
    if (item.history === null || item.numeric === null) return null
    return this._history.geometry(item.id, item.history, item.numeric, this._frame.now)
  }

  /** "between 19.2°C and 22.1°C over 24 hours", in the entity's own precision and unit. */
  private _extremes(
    item: Complication,
    geometry: SparklineGeometry,
  ): { low: string; high: string } {
    const entity = this.hass?.states[item.id]
    const decimals = entity ? decimalsOf(entity.state) : 0
    const unit = entity?.attributes.unit_of_measurement
    const locale = this.hass?.locale?.language
    const unitText = typeof unit === 'string' ? unit : undefined
    return {
      low: formatExtreme(geometry.low, decimals, unitText, locale),
      high: formatExtreme(geometry.high, decimals, unitText, locale),
    }
  }

  /** The item's press listeners: `pressHandlers`, firing against its entity. */
  private _press(item: Complication): PressHandlers {
    return pressHandlers(this._gestures, item, action => {
      if (this.hass) runAction(this.hass, this, action, item.id)
    })
  }

  /**
   * The cell every face draws inside: one element carrying the tint, the press handlers and the
   * VoiceOver label, so no face can forget one of them.
   *
   * A cell with nothing to do on any gesture is not a button: no role and no tab stop, the tiles
   * card's rule. A cell whose tap is `none` but which holds or double-taps still is one.
   *
   * The label spells "unavailable" out rather than reading `item.value` straight: an unreadable
   * entity's value is an em dash, and an em dash read aloud is silence, not a warning.
   */
  private _cell(
    item: Complication,
    classes: string,
    content: TemplateResult,
    spoken?: string,
  ): TemplateResult {
    const pressable = pressesAnything(item)
    const press = this._press(item)
    const reading = item.unavailable ? 'unavailable' : (spoken ?? item.value)

    return html`
      <div
        class="cell ${classes} ${item.unavailable ? 'unknown' : ''} ${
          item.countdown?.ticking ? 'counting' : ''
        } ${pressable ? 'cw-pressable' : 'inert'}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}; --cw-comp-on-tint:${onTintVar(item.tint)}`}
        role=${pressable ? 'button' : 'group'}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${`${item.name}: ${reading}`}
        @click=${press.click}
        @pointerdown=${press.down}
        @pointerup=${press.cancel}
        @pointerleave=${press.cancel}
        @pointercancel=${press.cancel}
        @contextmenu=${press.menu}
        @keydown=${press.key}
      >
        ${content}
      </div>
    `
  }

  /** What the faces in `faces-render.ts` need from the card: its cell, line and labels. */
  private readonly _faces: FaceContext = {
    cell: (item, classes, content, spoken) => this._cell(item, classes, content, spoken),
    geometry: item => this._geometry(item),
    extremes: (item, geometry) => this._extremes(item, geometry),
  }

  /**
   * The card-level `min`/`max`/`color` as `ComplicationDefaults`, built by conditional
   * spread rather than passed straight through.
   *
   * `exactOptionalPropertyTypes` is on, and `ComplicationDefaults`'s keys are optional
   * numbers and a `TintName` — not `number | undefined`. Reading `this._config.min`
   * straight into the object would hand `readComplications` an explicit `undefined` for
   * every key an unset config leaves absent, which the type system treats as a different,
   * disallowed shape from the key simply not being there.
   */
  private get _defaults(): ComplicationDefaults {
    const { min, max, color } = this._config ?? {}
    return {
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(color !== undefined ? { color } : {}),
    }
  }

  /**
   * The bento cells for the box the card is in: the grid it affords, each row's size and face
   * (its own or the automatic one), and the dense packing — all `bento.ts`. A cell's history is
   * worked out again for its own face, since the card's face is not the one it wears.
   */
  private _packBento(items: Complication[]): BentoCell[] {
    if (!this._config) return []
    const scale = this.scaleFactor
    const width = Math.max(0, (this.boxWidth - 2) / scale)
    const height = Math.max(0, (this.boxHeight - 2) / scale)
    const grid = bentoGrid(width, height)
    const rows = entityConfigs(this._config.entities)
    const sizes = bentoSizes(
      rows.map(row => (isBentoSize(row.size) ? row.size : undefined)),
      grid,
    )
    const pack = packBento(sizes, grid)
    const cardStyle = this._config.style ?? DEFAULT_STYLE
    const unitWidth = (width - (grid.columns - 1) * BENTO_GAP) / grid.columns
    const unitHeight = (height - (pack.rows - 1) * BENTO_GAP) / pack.rows
    const sparkline = {
      enabled: this._config.sparkline === true,
      hours: sparklineHoursFor(this._config.sparkline_hours),
    }

    return pack.placements.flatMap(placement => {
      const item = items[placement.index]
      const row = rows[placement.index]
      if (!item || !row) return []
      const face = bentoFace(placement.size, cardStyle, validStyle(row.style), {
        numeric: item.numeric !== null,
        gauge: item.range !== null || item.countdown !== null,
      })
      const history = item.numeric === null ? null : historyFor(row, { ...sparkline, style: face })
      const box = {
        width: placement.columns * unitWidth + (placement.columns - 1) * BENTO_GAP,
        height: placement.rows * unitHeight + (placement.rows - 1) * BENTO_GAP,
      }
      return [{ ...placement, face, box, item: { ...item, history } }]
    })
  }

  /**
   * The bento layout: no panel of its own, each entity a rounded cell on the `container`'s
   * surface, in the face chosen for its size, laid out on the grid `packBento` decided. A face is
   * sized to its own cell exactly as it would be to a card of that size: `packFor` is asked about
   * one entity in the cell's box.
   */
  private _renderBento(): TemplateResult {
    const cells = this._frame.bento
    const rows = cells.reduce((most, cell) => Math.max(most, cell.row + cell.rows), 1)
    const columns = bentoGrid(
      (this.boxWidth - 2) / this.scaleFactor,
      (this.boxHeight - 2) / this.scaleFactor,
    ).columns
    const surface = panelClass(this._config?.container) === 'cw-glass' ? 'glass' : 'solid'

    return html`
      <ha-card class="bento">
        <div class="grid bento" style=${`--cw-bento-columns:${columns}; --cw-bento-rows:${rows}`}>
          ${cells.map(cell => {
            // packFor takes a card's box in pixels and removes the border and the inset; the
            // cell pads by the same inset, so this hands it the cell's own inner size.
            const pack = packFor(
              cell.face,
              1,
              {
                width: cell.box.width * this.scaleFactor + 2,
                height: cell.box.height * this.scaleFactor + 2,
              },
              this.scaleFactor,
            )
            const ring = `calc(${pack.ring}px * var(--cw-scale))`
            return html`
              <div
                class="bento-cell ${surface} ${cell.face === 'rectangular-bleed' ? 'bleed' : ''}"
                style=${`grid-column:${cell.column + 1} / span ${cell.columns}; grid-row:${cell.row + 1} / span ${cell.rows}`}
              >
                <div
                  class="grid ${cell.face} ${pack.compact ? 'compact' : ''}"
                  style=${`--cw-comp-columns:1; --cw-comp-ring:${ring}`}
                >
                  ${
                    cell.face === 'corner'
                      ? renderCorner(cell.item, 'top-left', this._faces)
                      : renderCell(cell.face, cell.item, pack, cell.index, this._faces)
                  }
                </div>
              </div>
            `
          })}
        </div>
      </ha-card>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const style = this._config.style ?? DEFAULT_STYLE
    const items = this._frame.items

    if (items.length > 0 && layoutFor(this._config.layout) === 'bento') return this._renderBento()

    if (items.length === 0) {
      return html`<ha-card class=${panelClass(this._config.container)}
        ><div class="empty">${NO_ENTITIES}</div></ha-card
      >`
    }

    const pack = packFor(
      style,
      items.length,
      { width: this.boxWidth, height: this.boxHeight },
      this.scaleFactor,
    )

    // pack.ring arrives in design units, like every other number packFor returns; scaled
    // here, once, into the one custom property this stylesheet reads pre-multiplied. See
    // the styles' own top-of-file comment for why that is the one length that crosses the
    // scale boundary raw instead of restating "* var(--cw-scale)" at each rule below.
    const ring = `calc(${pack.ring}px * var(--cw-scale))`

    return html`
      <ha-card class="${style} ${panelClass(this._config.container)}">
        <div
          class="grid ${style} ${pack.compact ? 'compact' : ''}"
          style=${`--cw-comp-columns:${pack.columns}; --cw-comp-ring:${ring}`}
        >
          ${items
            .slice(0, pack.shown)
            .map((item, index) => renderCell(style, item, pack, index, this._faces))}
        </div>
      </ha-card>
    `
  }
}

registerCard(COMPLICATION_CARD_TAG, CupertinoComplicationCard, {
  name: 'Cupertino Complication',
  description:
    'Any entity, drawn as a watch complication: a ring, a gauge, a block with a graph, or a single line.',
})

export { CupertinoComplicationCard }
