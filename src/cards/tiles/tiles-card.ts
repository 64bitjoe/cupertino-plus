import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit'

import { Memo, registriesOf } from '../../core/area-summary'
import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { runAction } from '../../core/actions'
import { Gestures, pressesAnything, pressHandlers, type PressHandlers } from '../../core/gestures'
import { contentCardSize, contentGridOptions, type Floors } from '../../core/floors'
import { registerCard } from '../../core/register'
import { TemplatePool } from '../../core/templates'
import type { CardSizing } from '../../core/size'
import type { LovelaceCardEditor, LovelaceGridOptions } from '../../core/types/ha'
import type { CardContainer } from '../../core/container'
import { FLOATING_DEFAULT_CONTAINER } from '../../core/container'
import { TILES_EDITOR_TAG } from './tiles-card-editor'
import { fitGlyphs, glyphBudget, glyphLabel } from './glyphs'
import { floorsFor, groupRows, INSET, tileMetrics, tileWidthFor, type TileBand } from './layout'
import {
  flowFor,
  orientationFor,
  readTiles,
  stateLinesFor,
  tileConfigs,
  tileLabel,
  tilesHaveGlyphs,
  tileTemplates,
  tileWatchedIds,
  washFor,
  type TileFlow,
  type TileOrientation,
  type TilesDefaults,
  type TileView,
  type TileWash,
} from './model'

export const TILES_CARD_TAG = 'cupertino-plus-tiles'

export interface TilesCardConfig extends CupertinoCardConfig {
  tiles?: unknown
  color?: string
  container?: CardContainer
  wash?: TileWash
  flow?: TileFlow
  orientation?: TileOrientation
  state_lines?: number
}

const NO_TILES = 'No Tiles'

/**
 * What an empty state line draws: a no-break space, so the line keeps its line box and a tile
 * with nothing to say under its name stays aligned with its neighbour that has. The tile spaces
 * glyph and text apart with space-between, so a line that collapsed would drop the name to the
 * bottom edge, a few pixels below every other name in the row. Not part of the accessible name:
 * `_renderTile` builds that from `tile.value`, where it is empty and filtered out.
 */
const NO_STATE = '\u00a0'

/**
 * A wrapping grid of tiles that share each row equally, each one glyph, a name and a state
 * line, and a tap action. The chips card's sibling: `model.ts` reads the entities, `layout.ts`
 * prices the floor, and this class draws the answer and owns the glass/card container split.
 */
class CupertinoTilesCard extends CupertinoCard<TilesCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      /* Glass also lets its tiles out, because ha-card clips (base-styles.ts gives every card
         overflow: hidden and the outer radius, 22 or the theme's own, 24 on a stock 2026
         frontend), and a glass card has no inset to keep its tiles off that clip. So the
         three tile corners that touched a corner of the card, top left, top right and the
         first tile of the last line, were cut to the card's wider curve, with their ring
         sliced away along it, while every other corner kept its own 20: the live dashboard's
         "clipped corners", which measure pixel for pixel like a render at the card's radius.
         The focus ring, two units outside the tile, was cut off along every outer edge too.
         Changing the radius would fix the corners and still cut the ring, and a glass card
         paints nothing for a clip to tidy: its height is the floor's exact count of lines
         (layout.ts), so there is nothing below the last line to hide. The card container
         keeps its clip, where an inset holds the tiles well clear of it.

         No blur on ha-card either, for the chips card's reason: a theme's
         --ha-card-backdrop-filter would make this one a backdrop root and flatten every tile. */
      ha-card.glass {
        background: none;
        border: none;
        box-shadow: none;
        overflow: visible;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
      }

      .tiles {
        display: flex;
        flex-direction: column;
        gap: var(--cw-space-2);
        padding: var(--cw-inset);
        align-content: flex-start;
        min-width: 0;
      }

      /* Glass paints no surface, so an inset is padding inside a box nobody can see: across it
         misaligns the grid from every other card in the column, and down it buys empty grid
         rows. The chips card lost a release to each half of this. */
      .glass .tiles {
        padding: 0;
      }

      /* One configured row, laid out as columns of equal width that share the line and wrap
         only below a tile's minimum. 96 must match TILE_MIN_WIDTH in layout.ts, whose floor
         counts lines by the same rule: CSS cannot read the constant.

         auto-fill rather than auto-fit, and a second term in the track minimum, because each
         of the plain choices fails one case in the render. auto-fit collapses the tracks a row
         does not fill, so a forced row of one tile under a row of four stretched across the
         whole card, and a row of two under four drew tiles twice as wide as their neighbours.
         Plain auto-fill keeps every row on one column grid, but leaves empty tracks when the
         card is wider than its tiles need: four tiles in a 640 column filled four of six
         columns and left a hole down the right, which is the thing this layout exists to stop.

         So the track minimum is the larger of the tile minimum and an Nth of the line, where N
         is the longest row in the card (set on the stack as --cw-tile-columns). That caps the
         grid at N columns, so the longest row always fills the line edge to edge, and it keeps
         auto-fill's tracks, so a shorter row and the last line of a wrapped one keep the
         columns of the rows above them instead of stretching to fill. */
      .row {
        display: grid;
        grid-template-columns: repeat(
          auto-fill,
          minmax(
            max(
              calc(var(--cw-tile-min, 96) * 1px * var(--cw-scale)),
              calc(
                (100% - (var(--cw-tile-columns, 1) - 1) * var(--cw-space-2)) /
                  var(--cw-tile-columns, 1)
              )
            ),
            1fr
          )
        );
        gap: var(--cw-space-2);
        min-width: 0;
      }

      /* flow: row. Exactly N columns and no minimum, N being the longest row, so no row can
         wrap: its tiles narrow instead, however narrow the card.

         The longest row's N rather than each row's own count, for the reason the wrapping
         grid above gives. Rendered both ways with a break making rows of four and two at 396:
         each row's own count drew the two half the card wide each, twice the width of the
         four above them, which is the ragged grid auto-fit was rejected for. The shared count
         keeps one column grid, and it buys something more: wherever the longest row fits at
         96, this draws exactly what wrap does, so the option changes nothing until a line is
         too narrow to hold its row.

         minmax(0, 1fr) rather than 1fr, whose minimum is the tile's content: a long name
         would hold its column open and push the last tile off the card. The name and state
         ellipsize instead (they already do), and the tile clips its own content, so below the
         48 at which its glyph and paddings stop fitting the glyph is cut at the tile's edge,
         not drawn over the next tile. The width floor (TILE_ROW_MIN_WIDTH in layout.ts) is
         what keeps a user from dragging the card that narrow on a typical section. */
      .flow-row .row {
        grid-template-columns: repeat(var(--cw-tile-columns, 1), minmax(0, 1fr));
      }

      .flow-row .tile {
        overflow: hidden;
      }

      /* The height is tileMetrics' in layout.ts, handed over as --cw-tile-height on the stack
         (88 for a vertical tile at one state line). The width is the grid track's. */
      .tile {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-width: 0;
        height: calc(var(--cw-tile-height, 88) * 1px * var(--cw-scale));
        padding: calc(12px * var(--cw-scale));
        border-radius: calc(20px * var(--cw-scale));
        box-sizing: border-box;
        transition: opacity var(--cw-duration-fast) var(--cw-ease);
      }

      /* The chips card's glass, less its specular line. The pill lights its top edge with an
         offset-only inset shadow (0 1px 0), and on a pill that reads as light. On a tile it
         reads as a fault: an offset shadow on a 20-unit rounded rect draws a crescent that is
         thickest along the top, hugs the two top corners and tapers to nothing down the sides,
         so on the live dashboard the top corners looked a different radius from the bottom
         ones. What replaces it is a one-pixel ring at low alpha, the same weight on all four
         sides and so on all four corners, which still separates a tile from a wallpaper of
         its own colour. Lighter than the line it replaces (6 against 8, 12 against 20 in
         dark), because a ring is drawn four times as long and reads that much heavier. */
      .glass .tile {
        color: var(--cw-label);
        -webkit-backdrop-filter: var(--cw-glass-filter);
        backdrop-filter: var(--cw-glass-filter);
      }

      .surface .tile {
        color: var(--cw-label);
      }

      /* Two layers under the content rather than one background, so the wash can fade. A
         gradient is not interpolable, so swapping the tile's own background on hover would
         snap; two stacked layers crossfading their opacity animate in any engine. The tile
         isolates so the layers' negative z-index stays inside it, and the layers inherit the
         radius so the ring follows the corner. Neither layer is blurred: the tile's own
         backdrop-filter still does that, and the layers composite over it as a background
         would. ::before is the plain tile, ::after the wash; at rest only ::before shows, so a
         tinted tile at rest is the plain tile with its glyph coloured. */
      .tile {
        position: relative;
        isolation: isolate;
      }

      .tile::before,
      .tile::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        pointer-events: none;
        transition: opacity var(--cw-duration-fast) var(--cw-ease);
      }

      .tile::after {
        opacity: 0;
      }

      /* The library's glass (tokens.ts), whose ring is this tile's own: the weights argued
         above live there now, dark variant and all, so the panel cards' glass matches. */
      .glass .tile::before {
        background: var(--cw-glass-fill);
        box-shadow: inset 0 0 0 1px var(--cw-glass-ring);
      }

      .surface .tile::before {
        background: var(--cw-track);
      }

      /* The wash, in the tinted chip's three cases but lighter. The chip's weights were tuned
         for a small pill, and at a tile's six times the area they made a grid of eight a wall
         of pastel in light and of brown and olive slabs in dark, with the ground competing
         with the glyph for the colour. About two thirds of the chip's alpha keeps every tile
         identifiable at a glance and leaves the glyph to carry the hue. */
      .glass .tile.tinted::after {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-tile-tint) 11%, transparent),
          color-mix(in srgb, var(--cw-tile-tint) 17%, transparent)
        );
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cw-tile-tint) 12%, transparent);
      }

      :host([dark]) .glass .tile.tinted::after {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-tile-tint) 22%, transparent),
          color-mix(in srgb, var(--cw-tile-tint) 14%, transparent)
        );
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cw-tile-tint) 20%, transparent);
      }

      .surface .tile.tinted::after {
        background: color-mix(in srgb, var(--cw-tile-tint) 16%, var(--cw-track));
      }

      /* When the wash shows. wash: always is v1.13.0's tile, washed at rest. wash: hover, the
         default, washes a tile while it is pressed or keyboard-focused, and while a pointer is
         over it, but only where the device can hover: on a touch screen a tap leaves :hover
         stuck on the last tile touched until the next tap lands somewhere else. Pressed and
         hovered both need cw-pressable, because a tile whose action is none is not a button
         and should not answer a pointer as if it were; a focus-visible tile is a button by
         definition, since nothing else has a tab stop. An unavailable tile never has a colour
         to wash with (model.ts drops it), so none of these can reach one. */
      .wash-always .tile.tinted::after,
      .tile.tinted.selected::after,
      .tile.tinted.cw-pressable:active::after,
      .tile.tinted:focus-visible::after {
        opacity: 1;
      }

      .wash-always .tile.tinted::before,
      .tile.tinted.selected::before,
      .tile.tinted.cw-pressable:active::before,
      .tile.tinted:focus-visible::before {
        opacity: 0;
      }

      /* A selected tile is washed at rest, which under wash: always is what every tile is, so a
         wash alone would select nothing there. It also takes a ring in its own colour, in place
         of the wash's faint one, and its name in the heavier weight a chosen segment has: a
         preset row reads as one chosen tile among plain ones in either wash. Repeated under the
         dark host so it outranks the dark wash's own ring. */
      .glass .tile.tinted.selected::after,
      .surface .tile.tinted.selected::after,
      :host([dark]) .glass .tile.tinted.selected::after {
        box-shadow: inset 0 0 0 calc(1.5px * var(--cw-scale))
          color-mix(in srgb, var(--cw-tile-tint) 60%, transparent);
      }

      .tile.selected .name {
        font-weight: 600;
      }

      @media (hover: hover) {
        .tile.tinted.cw-pressable:hover::after {
          opacity: 1;
        }

        .tile.tinted.cw-pressable:hover::before {
          opacity: 0;
        }
      }

      /* Sized outright, for the chips card's reason (see its .glyph): Home Assistant's ha-icon
         lays its inner icon on a line box taller than the glyph, which pushed the glyph down
         and the tile's glyph box past 24. */
      .glyph {
        --mdc-icon-size: calc(24px * var(--cw-scale));
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--mdc-icon-size);
        height: var(--mdc-icon-size);
        flex: none;
        color: var(--cw-tile-tint, inherit);
      }

      .portrait {
        width: calc(26px * var(--cw-scale));
        height: calc(26px * var(--cw-scale));
        border-radius: 50%;
        object-fit: cover;
      }

      .name {
        font: var(--cw-text-footnote);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .state {
        font: var(--cw-text-caption-2);
        color: var(--cw-label-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* state_lines above one: the state wraps, and clamps with an ellipsis at the count. A
         line break in the text is kept (pre-line), so a template can say where a line ends;
         runs of spaces still collapse, as they do in the one-line state. The tile is taller by
         a caption line per extra line (tileMetrics), so the clamp is what keeps a longer text
         inside it. */
      .lines .state {
        white-space: pre-line;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: var(--cw-state-lines);
        line-clamp: var(--cw-state-lines);
        overflow-wrap: anywhere;
      }

      /* Every tile reserves all its state lines, used or not. A vertical tile spaces glyph and
         text apart, so a one-line state beside a two-line one would otherwise drop its name a
         line lower than its neighbour's, and a row's names would stop lining up. 13 is
         STATE_LINE_HEIGHT in layout.ts. */
      .lines:not(.horizontal) .state {
        min-height: calc(var(--cw-state-lines) * 13px * var(--cw-scale));
      }

      /* orientation: horizontal. The glyph beside the text rather than above it, centred on
         the tile's height, and the text taking what is left of the width. 10 is the gap
         layout.ts prices in HORIZONTAL_TILE_MIN_WIDTH. The text is a column of its own so the
         name and the state stay together as one block, whatever the height. */
      .horizontal .tile {
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: calc(10px * var(--cw-scale));
      }

      .horizontal .text {
        flex: 1;
        min-width: 0;
      }

      .horizontal .glyph.portrait {
        width: calc(28px * var(--cw-scale));
        height: calc(28px * var(--cw-scale));
      }

      /* A room's status glyphs (summary_style: icons), under the state line: the small
         tinted pills under a room in the Home app. Every number is glyphs.ts', which prices
         each pill before it is drawn and folds what will not fit into a "+N", so nothing here
         decides what fits. The row's own height is fixed, and its pills wrap rather than
         shrink, so a pill the arithmetic got wrong drops whole onto a hidden second line
         instead of being cut in half at the tile's edge. A tile with no glyphs in a card that
         has them keeps the empty row, so names line up across a line of tiles. */
      .glyphs {
        display: flex;
        flex-wrap: wrap;
        gap: calc(4px * var(--cw-scale));
        height: calc(18px * var(--cw-scale));
        margin-top: calc(4px * var(--cw-scale));
        overflow: hidden;
      }

      /* Icon-only, the pill is a circle round its 12 icon (3 + 12 + 3); with a count it is
         4 + icon + 2 + figures + 6. Tinted at the Home app's low alpha so the hue is in the
         icon and the pill only gathers it; the figure is the label colour, for a figure in
         yellow on a light wallpaper does not read. Tabular, so a 2 becoming a 3 moves nothing. */
      .pill {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        gap: calc(2px * var(--cw-scale));
        box-sizing: border-box;
        min-width: calc(18px * var(--cw-scale));
        height: calc(18px * var(--cw-scale));
        padding: 0 calc(3px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        background: color-mix(in srgb, var(--cw-pill-tint) 14%, transparent);
        color: var(--cw-pill-tint);
        font: var(--cw-text-caption-2);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      :host([dark]) .pill {
        background: color-mix(in srgb, var(--cw-pill-tint) 22%, transparent);
      }

      .pill ha-icon {
        --mdc-icon-size: calc(12px * var(--cw-scale));
        display: inline-flex;
        width: var(--mdc-icon-size);
        height: var(--mdc-icon-size);
      }

      .pill.counted {
        padding: 0 calc(6px * var(--cw-scale)) 0 calc(4px * var(--cw-scale));
      }

      .pill .count {
        color: var(--cw-label);
      }

      /* An alert keeps its figure red too: it is the one pill that must not read as calm. */
      .pill.alert .count {
        color: inherit;
      }

      .pill.more {
        padding: 0 calc(6px * var(--cw-scale));
        background: var(--cw-fill);
        color: var(--cw-label-secondary);
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      .tile.unknown {
        opacity: 0.55;
      }
      .tile.cw-pressable:active {
        opacity: 0.8;
      }
      .tile.unknown.cw-pressable:active {
        opacity: 0.44;
      }
      .tile[role='button']:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
      }

      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
      }

      @media (prefers-reduced-motion: reduce) {
        .tile,
        .tile::before,
        .tile::after {
          transition: none;
        }
      }
    `,
  ]

  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(TILES_EDITOR_TAG) as LovelaceCardEditor
  }

  public static getStubConfig(): TilesCardConfig {
    return { type: `custom:${TILES_CARD_TAG}` }
  }

  /** The card's template subscriptions; see the chips card for why `requestUpdate`. */
  private readonly _templates = new TemplatePool(() => this.requestUpdate())

  /** A room tile changes when an entity or device moves room; see `base-card.ts`. */
  protected override readonly watchesRegistries: boolean = true

  /** Hold and double tap, for the tiles that configure them; see `core/gestures.ts`. */
  private readonly _gestures = new Gestures()

  /** Who is looking, for a template's `user`; see `templateRequest`. */
  private get _user(): string | undefined {
    return this.hass?.user?.name
  }

  /** Reopens the template subscriptions on re-attach; see the chips card. */
  public override connectedCallback(): void {
    super.connectedCallback()
    this.requestUpdate()
  }

  public override disconnectedCallback(): void {
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  /** Kept in step with the config on every update; `sync` is a diff, so this is cheap. */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this.hass || !this._config) return
    this._templates.sync(this.hass, tileTemplates(this._config.tiles, this._defaults, this._user))
    this._views = { config: this._config, tiles: this._readTiles() }
  }

  /** The watched ids, rebuilt only when the tiles or the registries change. */
  private readonly _watched = new Memo<string[]>()

  protected override watchedEntities(): string[] {
    const tiles = this._config?.tiles
    return this._watched.get([tiles, ...registriesOf(this.hass)], () =>
      tileWatchedIds(tiles, this.hass),
    )
  }

  /** The card-level defaults every row inherits from. */
  private get _defaults(): TilesDefaults {
    const color = this._config?.color
    return { ...(color ? { color } : {}) }
  }

  /**
   * The reconstructed key here has to agree with `tileTemplates`' own (which is `chipTemplates`'),
   * byte for byte, or the lookup silently misses and the field falls back forever. Both build it
   * with `templateRequest`, which is what makes that agreement structural rather than careful.
   */
  private _readTiles(): TileView[] {
    if (!this.hass || !this._config) return []
    return readTiles(
      this.hass,
      this._config.tiles,
      this._defaults,
      this._templates.resolver(this._user),
    )
  }

  /**
   * The tiles the last update read, for the config they were read against, so `getGridOptions`
   * and `getCardSize` (asked on every render of the section) reuse them; see the chips card.
   */
  private _views: { config: TilesCardConfig; tiles: TileView[] } | undefined

  private get _tiles(): TileView[] {
    if (!this.hass || !this._config) return []
    if (this._views?.config === this._config) return this._views.tiles
    return this._readTiles()
  }

  /** The footprint this config draws at, for the floor and the stylesheet alike. */
  private get _metrics() {
    return tileMetrics(
      orientationFor(this._config?.orientation),
      stateLinesFor(this._config?.state_lines),
      tilesHaveGlyphs(this._config?.tiles),
    )
  }

  /**
   * The floor's own view of the grid. Before `hass` exists every configured row counts, the
   * generous default; afterwards only what is going to be drawn does, and `_floorFor` keeps that
   * honesty from ever shrinking the box below what has already been shown.
   */
  private get _floorBand(): TileBand[] {
    if (!this.hass) {
      return tileConfigs(this._config?.tiles).map(row => ({ break: row.break === true }))
    }
    return this._tiles.filter(tile => tile.visible).map(tile => ({ break: tile.break }))
  }

  /**
   * The highest floor this card has actually needed, keyed to the tiles so a genuine edit
   * re-baselines. A `show` template that has not resolved yet reads as hidden, so the first
   * tick's true count is usually too small; tracking a maximum lets the floor grow to the real
   * count within a render or two and hold there.
   */
  private _floorMax: { key: string; floors: Floors } | undefined

  /** The config's part of `_floorMax`'s key, stringified once per config rather than per ask. */
  private readonly _configKey = new Memo<string>()

  /** The card's own width in design units once measured, else undefined (assume narrow). */
  private get _floorWidth(): number | undefined {
    return this.isMeasured ? this.boxWidth / this.scaleFactor : undefined
  }

  /** What the card actually pads by: glass insets by nothing, card by the shared inset. */
  private get _floorInset(): number {
    return (this._config?.container ?? FLOATING_DEFAULT_CONTAINER) === 'glass' ? 0 : INSET
  }

  private _floorFor(band: TileBand[]): Floors {
    const width = this._floorWidth
    const inset = this._floorInset
    const flow = flowFor(this._config?.flow)
    const metrics = this._metrics
    const floors = floorsFor(band, width, inset, flow, metrics)
    // The measured width is part of the identity, or the high-water mark would hold the
    // pre-measurement estimate and the card would never shrink to the width it actually got.
    // The metrics are too: a card switched to horizontal must be allowed to get shorter.
    const config = this._configKey.get([this._config], () =>
      JSON.stringify([this._config?.tiles ?? null, metrics]),
    )
    const key = `${config}|${width === undefined ? '' : Math.round(width)}|${inset}|${flow}`

    if (!this._floorMax || this._floorMax.key !== key) {
      this._floorMax = { key, floors }
      return floors
    }

    const merged: Floors = {
      min_columns: Math.max(this._floorMax.floors.min_columns, floors.min_columns),
      min_rows: Math.max(this._floorMax.floors.min_rows, floors.min_rows),
    }
    this._floorMax = { key, floors: merged }
    return merged
  }

  /**
   * As tall as the tiles, for the chips card's reason: `rows: 'auto'`, no 248 floor, and a
   * row count the user drags in the Layout tab still wins. See `contentGridOptions`.
   */
  protected override get sizing(): CardSizing {
    return 'content'
  }

  public override getGridOptions(): LovelaceGridOptions {
    return contentGridOptions(super.getGridOptions(), this._floorFor(this._floorBand))
  }

  public override getCardSize(): number {
    return contentCardSize(this._floorFor(this._floorBand))
  }

  /** The tile's press listeners: `pressHandlers`, firing against its entity. */
  private _press(tile: TileView): PressHandlers {
    return pressHandlers(this._gestures, tile, action => {
      if (this.hass) runAction(this.hass, this, action, tile.entityId)
    })
  }

  /**
   * One tile. A tile with nothing to do on any gesture is not a button: no role, no tab stop. A
   * tile whose tap is `none` but which holds or double-taps is still one, since a pointer can
   * press it; its Enter key does nothing, as its tap does.
   */
  private _renderTile(tile: TileView, glyphs: number | undefined): TemplateResult {
    const pressable = pressesAnything(tile)
    const press = this._press(tile)
    const label = tileLabel(tile)

    return html`
      <div
        class="tile ${tile.color ? 'tinted' : ''} ${tile.unavailable ? 'unknown' : ''} ${
          tile.selected ? 'selected' : ''
        } ${pressable ? 'cw-pressable' : ''}"
        style=${tile.color ? `--cw-tile-tint:${tile.color}` : nothing}
        role=${pressable ? 'button' : nothing}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${pressable ? label : nothing}
        aria-pressed=${pressable && tile.selected ? 'true' : nothing}
        title=${tile.name}
        @click=${press.click}
        @pointerdown=${press.down}
        @pointerup=${press.cancel}
        @pointerleave=${press.cancel}
        @pointercancel=${press.cancel}
        @contextmenu=${press.menu}
        @keydown=${press.key}
      >
        ${
          tile.picture
            ? // Empty alt: the tile's own aria-label already names it.
              html`<img class="glyph portrait" src=${tile.picture} alt="" />`
            : html`<ha-icon class="glyph" .icon=${tile.icon}></ha-icon>`
        }
        <div class="text">
          <div class="name">${tile.name}</div>
          <div class="state">${tile.value || NO_STATE}</div>
          ${glyphs === undefined ? nothing : this._renderGlyphs(tile, glyphs)}
        </div>
      </div>
    `
  }

  /**
   * The glyph row, fitted to `budget` by `fitGlyphs`. Hidden from a screen reader, which hears
   * what each glyph means instead: in the tile's label when it is a button, and otherwise in
   * a visually hidden line, since a tile that is not a button is read from its text.
   */
  private _renderGlyphs(tile: TileView, budget: number): TemplateResult {
    const { shown, more } = fitGlyphs(tile.glyphs, budget)
    const spoken = glyphLabel(tile.glyphs)
    return html`
      <div class="glyphs" aria-hidden="true">
        ${shown.map(
          glyph => html`
            <span
              class="pill ${glyph.count !== undefined || glyph.text !== undefined ? 'counted' : ''} ${
                glyph.alert ? 'alert' : ''
              }"
              style=${`--cw-pill-tint:${glyph.tint}`}
              ><ha-icon .icon=${glyph.icon}></ha-icon>${
                (glyph.text ?? glyph.count) !== undefined
                  ? html`<span class="count">${glyph.text ?? glyph.count}</span>`
                  : nothing
              }</span
            >
          `,
        )}
        ${more > 0 ? html`<span class="pill more">+${more}</span>` : nothing}
      </div>
      ${spoken !== '' ? html`<span class="visually-hidden">${spoken}</span>` : nothing}
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const tiles = this._tiles.filter(tile => tile.visible)
    const container = this._config.container ?? FLOATING_DEFAULT_CONTAINER
    const klass = container === 'glass' ? 'glass' : 'surface'

    if (tiles.length === 0) {
      return html`<ha-card class=${klass}><div class="empty">${NO_TILES}</div></ha-card>`
    }

    // Real row containers rather than a break spacer, for the chips card's reason: a spacer
    // would take the gap on both sides and push forced rows further apart than wrapped ones.
    // The longest row sets the column count every row shares; see .row in the styles.
    const rows = groupRows(tiles)
    const columns = Math.max(...rows.map(row => row.length))
    const orientation = orientationFor(this._config.orientation)
    const lines = stateLinesFor(this._config.state_lines)
    const metrics = this._metrics
    const { minWidth, height } = metrics
    // The glyph row's budget, from the width a tile is actually drawn at: the card's measured
    // line, shared out by the stylesheet's own rule. Undefined when no tile draws glyphs, so
    // the other cards draw no empty row.
    const width = this._floorWidth
    const glyphs = tilesHaveGlyphs(this._config.tiles)
      ? glyphBudget(
          tileWidthFor(
            width === undefined ? undefined : width - 2 * this._floorInset,
            columns,
            flowFor(this._config.flow),
            metrics,
          ),
          orientation,
        )
      : undefined
    return html`
      <ha-card class=${klass} aria-label=${`${tiles.length} tiles`}>
        <div
          class="tiles wash-${washFor(this._config.wash)} flow-${flowFor(this._config.flow)} ${
            orientation
          } ${lines > 1 ? 'lines' : ''}"
          style=${`--cw-tile-columns:${columns};--cw-tile-min:${minWidth};--cw-tile-height:${
            height
          };--cw-state-lines:${lines}`}
        >
          ${rows.map(
            row => html`<div class="row">${row.map(tile => this._renderTile(tile, glyphs))}</div>`,
          )}
        </div>
      </ha-card>
    `
  }
}

registerCard(TILES_CARD_TAG, CupertinoTilesCard, {
  name: 'Cupertino Tiles',
  description: 'A grid of shortcut tiles for your dashboard.',
})

export { CupertinoTilesCard }
