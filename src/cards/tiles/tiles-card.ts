import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { isPressable, runAction } from '../../core/actions'
import { withFloors, type Floors } from '../../core/floors'
import { registerCard } from '../../core/register'
import { requestKey, TemplatePool } from '../../core/templates'
import type { LovelaceCardEditor, LovelaceGridOptions } from '../../core/types/ha'
import { DEFAULT_CONTAINER, type ChipsContainer } from '../chips/model'
import { TILES_EDITOR_TAG } from './tiles-card-editor'
import { floorsFor, groupRows, INSET, type TileBand } from './layout'
import {
  readTiles,
  tileConfigs,
  tileTemplates,
  tileWatchedIds,
  washFor,
  type TilesDefaults,
  type TileView,
  type TileWash,
} from './model'

export const TILES_CARD_TAG = 'cupertino-plus-tiles'

export interface TilesCardConfig extends CupertinoCardConfig {
  tiles?: unknown
  color?: string
  container?: ChipsContainer
  wash?: TileWash
}

const NO_TILES = 'No Tiles'

/**
 * A wrapping grid of tiles that share each row equally, each one glyph, a name and a state
 * line, and a tap action. The chips card's sibling: `model.ts` reads the entities, `layout.ts`
 * prices the floor, and this class draws the answer and owns the glass/card container split.
 */
class CupertinoTilesCard extends CupertinoCard<TilesCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      ha-card.glass {
        background: none;
        border: none;
        box-shadow: none;
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
              calc(96px * var(--cw-scale)),
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

      /* 88 must match TILE_HEIGHT in layout.ts. The width is the grid track's. */
      .tile {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-width: 0;
        height: calc(88px * var(--cw-scale));
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
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
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

      .glass .tile::before {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-label) 10%, transparent),
          color-mix(in srgb, var(--cw-label) 18%, transparent)
        );
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cw-label) 6%, transparent);
      }

      :host([dark]) .glass .tile::before {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-label) 16%, transparent),
          color-mix(in srgb, var(--cw-label) 9%, transparent)
        );
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cw-label) 12%, transparent);
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
      .tile.tinted.cw-pressable:active::after,
      .tile.tinted:focus-visible::after {
        opacity: 1;
      }

      .wash-always .tile.tinted::before,
      .tile.tinted.cw-pressable:active::before,
      .tile.tinted:focus-visible::before {
        opacity: 0;
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

  public override disconnectedCallback(): void {
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  /** Kept in step with the config on every update; `sync` is a diff, so this is cheap. */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this.hass || !this._config) return
    this._templates.sync(this.hass, tileTemplates(this._config.tiles, this._defaults))
  }

  protected override watchedEntities(): string[] {
    return tileWatchedIds(this._config?.tiles)
  }

  /** The card-level defaults every row inherits from. */
  private get _defaults(): TilesDefaults {
    const color = this._config?.color
    return { ...(color ? { color } : {}) }
  }

  /**
   * The reconstructed key here has to agree with `tileTemplates`' own (which is `chipTemplates`'),
   * byte for byte, or the lookup silently misses and the field falls back forever. "No entity"
   * means no `variables` key at all, on a row or off it.
   */
  private get _tiles(): TileView[] {
    if (!this.hass || !this._config) return []
    return readTiles(this.hass, this._config.tiles, this._defaults, (template, entity) =>
      this._templates.read(
        requestKey(
          entity === undefined ? { template } : { template, variables: { config: { entity } } },
        ),
      ),
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

  /** The card's own width in design units once measured, else undefined (assume narrow). */
  private get _floorWidth(): number | undefined {
    return this.isMeasured ? this.boxWidth / this.scaleFactor : undefined
  }

  /** What the card actually pads by: glass insets by nothing, card by the shared inset. */
  private get _floorInset(): number {
    return (this._config?.container ?? DEFAULT_CONTAINER) === 'glass' ? 0 : INSET
  }

  private _floorFor(band: TileBand[]): Floors {
    const width = this._floorWidth
    const inset = this._floorInset
    const floors = floorsFor(band, width, inset)
    // The measured width is part of the identity, or the high-water mark would hold the
    // pre-measurement estimate and the card would never shrink to the width it actually got.
    const key = JSON.stringify([
      this._config?.tiles ?? null,
      width === undefined ? null : Math.round(width),
      inset,
    ])

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
   * `rows` is this card's own content height rather than the shared footprint, for the reason
   * the chips card gives: a grid asks for exactly its content, and is still free to be dragged
   * taller through the card's own `grid_options`.
   */
  public override getGridOptions(): LovelaceGridOptions {
    const floors = this._floorFor(this._floorBand)
    return { ...withFloors(super.getGridOptions(), floors), rows: floors.min_rows }
  }

  /** Bound unconditionally and guarded inside; see the chips card for why. */
  private _press(tile: TileView) {
    return (): void => {
      if (!this.hass || !isPressable(tile.action)) return
      runAction(this.hass, this, tile.action, tile.entityId)
    }
  }

  private _key(tile: TileView) {
    return (event: KeyboardEvent): void => {
      if (!isPressable(tile.action)) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this._press(tile)()
    }
  }

  /** One tile. A tile whose action is `none` is not a button: no role, no tab stop. */
  private _renderTile(tile: TileView): TemplateResult {
    const pressable = isPressable(tile.action)
    const readable = tile.unavailable ? 'unavailable' : tile.value
    const label = [tile.name, readable].filter(part => part !== '').join(', ') || 'Tile'

    return html`
      <div
        class="tile ${tile.color ? 'tinted' : ''} ${tile.unavailable ? 'unknown' : ''} ${
          pressable ? 'cw-pressable' : ''
        }"
        style=${tile.color ? `--cw-tile-tint:${tile.color}` : nothing}
        role=${pressable ? 'button' : nothing}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${pressable ? label : nothing}
        title=${tile.name}
        @click=${this._press(tile)}
        @keydown=${this._key(tile)}
      >
        ${
          tile.picture
            ? // Empty alt: the tile's own aria-label already names it.
              html`<img class="glyph portrait" src=${tile.picture} alt="" />`
            : html`<ha-icon class="glyph" .icon=${tile.icon}></ha-icon>`
        }
        <div class="text">
          <div class="name">${tile.name}</div>
          <div class="state">${tile.value}</div>
        </div>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const tiles = this._tiles.filter(tile => tile.visible)
    const container = this._config.container ?? DEFAULT_CONTAINER
    const klass = container === 'glass' ? 'glass' : 'surface'

    if (tiles.length === 0) {
      return html`<ha-card class=${klass}><div class="empty">${NO_TILES}</div></ha-card>`
    }

    // Real row containers rather than a break spacer, for the chips card's reason: a spacer
    // would take the gap on both sides and push forced rows further apart than wrapped ones.
    // The longest row sets the column count every row shares; see .row in the styles.
    const rows = groupRows(tiles)
    const columns = Math.max(...rows.map(row => row.length))
    return html`
      <ha-card class=${klass} aria-label=${`${tiles.length} tiles`}>
        <div
          class="tiles wash-${washFor(this._config.wash)}"
          style=${`--cw-tile-columns:${columns}`}
        >
          ${rows.map(
            row => html`<div class="row">${row.map(tile => this._renderTile(tile))}</div>`,
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
