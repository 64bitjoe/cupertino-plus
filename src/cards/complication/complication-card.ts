import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { registerCard } from '../../core/register'
import { RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE } from '../../core/ring'
import type { LovelaceGridOptions } from '../../core/types/ha'
import { packFor, floorsFor } from './layout'
import {
  readComplications,
  watchedIds,
  entityConfigs,
  type Complication,
  type ComplicationDefaults,
  type ComplicationEntityConfig,
} from './model'
import { DEFAULT_STYLE, type ComplicationStyle } from './style'
import { tintVar, type TintName } from './tint'

export const COMPLICATION_CARD_TAG = 'cupertino-widgets-complication'

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
  /** Which of the five faces to draw. Absent means `DEFAULT_STYLE`. */
  style?: ComplicationStyle
  /** Card-level range override, beneath a row's own `min`/`max`. See `range.ts`. */
  min?: number
  max?: number
  /** Card-level tint override, beneath a row's own `color`. See `tint.ts`. */
  color?: TintName
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
 * has five faces where a battery ring has one.
 *
 * This file draws two of the five: `circular`, the watch-face complication proper, and
 * `inline`, the single-line strip. The three rectangular chromes are Task 7's; until
 * that lands, configuring one of them falls through to `circular` rather than to nothing,
 * because a card that drew nothing for a style it does not yet know is a broken card and
 * a card that drew the nearest face it does know is a working one.
 */
class CupertinoComplicationCard extends CupertinoCard<ComplicationCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      /* Every px below is a design unit multiplied by --cw-scale, and layout.ts holds the
         same numbers unscaled: it divides the measured box by the factor instead, so the
         two sides of the arithmetic never restate each other. The lengths each price a
         twin in layout.ts are called out below, next to that twin's name there. */
      ha-card {
        height: 100%;
        box-sizing: border-box;
        padding: var(--cw-inset);
        display: flex;
      }

      .grid {
        flex: 1;
        display: grid;
        gap: var(--cw-comp-gap);
        min-width: 0;
      }

      /* Must match layout.ts's GAP. */
      :host {
        --cw-comp-gap: calc(14px * var(--cw-scale));
      }

      .grid.circular {
        grid-template-columns: repeat(var(--cw-comp-columns), 1fr);
        place-items: center;
      }

      /* One column, no track gap: the inline style separates its strips with a hairline
         border instead (see .cell.inline below), the same way layout.ts's floorsFor
         charges it no GAP term for the inline case. */
      .grid.inline {
        grid-template-columns: 1fr;
        gap: 0;
      }

      .cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Must match layout.ts's LABEL_GAP. */
        gap: calc(6px * var(--cw-scale));
        cursor: pointer;
        min-width: 0;
      }

      /* The cell is the tap target, not the card: a card of six complications has no
         single subject for a click on empty grid space to open, and the battery card
         makes the same call for the same reason. */
      .cell:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
        border-radius: var(--cw-radius-inner);
      }

      .ring {
        position: relative;
        width: var(--cw-comp-ring);
        height: var(--cw-comp-ring);
        display: grid;
        place-items: center;
      }

      .gauge {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .track {
        fill: none;
        stroke: var(--cw-track);
      }

      /* The tint, and it does not move with the reading: tint.ts's argument is that a
         complication's colour says what kind of thing it is, not how the reading is
         doing, so it is fixed per entity rather than stepped like a battery ring. */
      .arc {
        fill: none;
        stroke: var(--cw-comp-tint);
        stroke-linecap: round;
      }

      .reading {
        font: 600 calc(17px * var(--cw-scale)) / calc(22px * var(--cw-scale)) var(--cw-font);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
        color: var(--cw-label);
        z-index: 1;
      }

      /* var(--cw-text-caption-2), not a --cw-comp-label of its own: its 11px/13px is the
         LABEL layout.ts prices a captioned cell's height against, so the two already
         agree without this stylesheet inventing a second name for the same number. */
      .caption {
        font: var(--cw-text-caption-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glyph {
        color: var(--cw-comp-tint);
        --mdc-icon-size: calc(24px * var(--cw-scale));
      }

      /* Inline: one strip, hairline-separated when they stack. */
      .cell.inline {
        flex-direction: row;
        align-items: center;
        gap: calc(10px * var(--cw-scale));
        /* Must match layout.ts's INLINE_ROW. */
        min-height: calc(44px * var(--cw-scale));
      }

      .cell.inline + .cell.inline {
        border-top: 1px solid var(--cw-separator);
      }

      .cell.inline .name {
        font: 600 calc(15px * var(--cw-scale)) / calc(20px * var(--cw-scale)) var(--cw-font);
        color: var(--cw-label);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell.inline .reading {
        margin-left: auto;
        color: var(--cw-label-secondary);
        font-weight: 400;
      }

      /* Nothing to say, said quietly — the battery card's rule for a dead sensor. */
      .cell.unknown .glyph {
        opacity: 0.4;
      }

      .cell.unknown .reading {
        color: var(--cw-label-secondary);
      }

      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
      }
    `,
  ]

  /** The `custom:` prefix is load-bearing (see the calendar card's note on it). */
  public static getStubConfig(): ComplicationCardConfig {
    return { type: `custom:${COMPLICATION_CARD_TAG}` }
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
   * The defaults `core/size.ts` gives every card, with this card's own floors over the
   * top.
   *
   * The floors are the overflow design; see `floorsFor`. Recomputed on every call rather
   * than cached, because they depend on the config and a stale floor is a card that can
   * be dragged smaller than it fits.
   */
  public override getGridOptions(): LovelaceGridOptions {
    const style = this._config?.style ?? DEFAULT_STYLE
    const count = entityConfigs(this._config?.entities).length

    return { ...super.getGridOptions(), ...floorsFor(style, count) }
  }

  /**
   * Open the entity's own more-info dialog.
   *
   * `hass-more-info` with an `entityId`: the same event the battery card fires, verified
   * against the 2026.7.4 bundle there, and `bubbles`/`composed` carry it out of this
   * shadow root to the dashboard listening for it.
   */
  private _openMoreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }),
    )
  }

  /**
   * Enter and Space on a focused cell, which is what makes `role="button"` honest.
   *
   * One helper rather than the same lines inlined into each face: a keyboard handler
   * that only some of the faces carried is the kind of gap nobody notices until somebody
   * who navigates by keyboard finds it.
   */
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
   * The gauge, in the ring's own coordinate space; `ring.ts` has the arithmetic.
   *
   * Drawn with lit's **`svg`** tag for the arc circle, not `html`. A nested lit template
   * is parsed on its own, so an `html` one would create that circle in the HTML
   * namespace: it would still land in the DOM with every attribute set, but every
   * *presentation* attribute would be silently ignored — `stroke-width` reading back as
   * 1px, `stroke-dasharray` as `none` — and the card would draw a bare track at every
   * level with nothing anywhere to say why. The battery card hits the same trap and
   * explains it the same way.
   *
   * The group is turned −90° because an SVG circle starts at three o'clock; from there
   * the dash runs clockwise, the direction the watch face fills in.
   */
  private _renderRing(item: Complication): TemplateResult {
    const centre = RING_BOX / 2
    const arc = item.fraction === null ? 0 : item.fraction * RING_CIRCUMFERENCE

    return html`
      <svg class="gauge" viewBox="0 0 ${RING_BOX} ${RING_BOX}" aria-hidden="true">
        <g transform="rotate(-90 ${centre} ${centre})">
          <circle
            class="track"
            cx=${centre}
            cy=${centre}
            r=${RING_RADIUS}
            stroke-width=${RING_STROKE}
          />
          ${
            arc > 0
              ? svg`<circle
                  class="arc"
                  cx=${centre}
                  cy=${centre}
                  r=${RING_RADIUS}
                  stroke-width=${RING_STROKE}
                  stroke-dasharray=${`${arc} ${RING_CIRCUMFERENCE}`}
                />`
              : nothing
          }
        </g>
      </svg>
    `
  }

  /**
   * The circular face: a ring around a reading, or an icon beside one when there is no
   * range to draw the ring against.
   *
   * `range.ts` returns `null` for most entities — a temperature has no ceiling to gauge
   * against — and drawing an empty ring in that case would be a fraction of nothing,
   * which reads worse than no gauge at all. So the icon takes the ring's place instead:
   * the same style showing what the data supports, rather than a sixth style for entities
   * with no range.
   */
  private _renderCircular(item: Complication, labels: boolean): TemplateResult {
    const gauge = item.range !== null

    return html`
      <div
        class="cell circular ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}, ${item.value}`}
        @click=${() => this._openMoreInfo(item.id)}
        @keydown=${this._activate(item.id)}
      >
        <div class="ring">
          ${gauge ? this._renderRing(item) : nothing}
          ${
            gauge
              ? html`<span class="reading">${item.value}</span>`
              : html`
                  <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
                  <span class="reading">${item.value}</span>
                `
          }
        </div>
        ${labels ? html`<span class="caption">${item.name}</span>` : nothing}
      </div>
    `
  }

  /** The inline face: one line, an icon, a name and a reading, meant to sit among other
   * inline complications rather than to occupy a cell of its own. */
  private _renderInline(item: Complication): TemplateResult {
    return html`
      <div
        class="cell inline ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}, ${item.value}`}
        @click=${() => this._openMoreInfo(item.id)}
        @keydown=${this._activate(item.id)}
      >
        <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
        <span class="name">${item.name}</span>
        <span class="reading">${item.value}</span>
      </div>
    `
  }

  /**
   * One entity, in whichever of the five faces `style` names.
   *
   * Only `inline` has a face of its own here; everything else falls through to
   * `circular`. That is deliberate, not a gap: the three rectangular chromes are Task 7's,
   * and `isRectangular` is imported there, alongside the branch that reads it, rather than
   * here — see the module comment on why circular is the right fallback for a style this
   * file does not yet know how to draw.
   */
  private _renderCell(
    style: ComplicationStyle,
    item: Complication,
    labels: boolean,
  ): TemplateResult {
    if (style === 'inline') return this._renderInline(item)
    return this._renderCircular(item, labels)
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

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const style = this._config.style ?? DEFAULT_STYLE
    const items = readComplications(this.hass, this._config.entities, this._defaults)

    if (items.length === 0) {
      return html`<ha-card><div class="empty">${NO_ENTITIES}</div></ha-card>`
    }

    const pack = packFor(
      style,
      items.length,
      { width: this.boxWidth, height: this.boxHeight },
      this.scaleFactor,
    )

    return html`
      <ha-card>
        <div
          class="grid ${style}"
          style=${`--cw-comp-columns:${pack.columns}; --cw-comp-ring:${pack.ring}px`}
        >
          ${items.map(item => this._renderCell(style, item, pack.labels))}
        </div>
      </ha-card>
    `
  }
}

registerCard(COMPLICATION_CARD_TAG, CupertinoComplicationCard, {
  name: 'Cupertino Complication',
  description: 'Any entity, drawn as a watch complication: a ring, a block, or a single line.',
})

export { CupertinoComplicationCard }
