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
import { DEFAULT_STYLE, isRectangular, type ComplicationStyle } from './style'
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
 * White text over the tint, except where the tint is too light for white to sit on.
 *
 * `rectangular-header`'s strip and `rectangular-bleed`'s whole card both paint their
 * content straight onto `item.tint`, which the ring and inline faces never do — there
 * the tint is a thin arc or an icon, not the surface under a paragraph. Checked against
 * WCAG's contrast formula rather than by eye, against both the light and dark value of
 * every tint in `tokens.ts`: white on `--cw-yellow` comes out at 1.4:1 in both themes,
 * which fails even the 3:1 floor a large glyph is held to, and `--cw-orange`,
 * `--cw-green` and `--cw-teal` are not far behind at 2.0–2.6:1. The other six tints —
 * `red` clears 3:1 by a hair, `blue`/`indigo`/`purple`/`pink` clear it comfortably, and
 * `accent` is the theme's own colour and unknowable here — keep white.
 *
 * The four that don't get `#1d1d1f`, a fixed near-black, rather than `var(--cw-label)`:
 * `--cw-label` is white in dark mode, which is exactly the failure this function exists
 * to route around, and unlike the label these four tint values barely move between
 * themes (`--cw-yellow` is #ffcc00 light, #ffd60a dark) — a hue that stays light in both
 * themes needs a fix that stays dark in both themes, not one that tracks the theme.
 */
const NEEDS_DARK_ON_TINT = new Set<TintName>(['yellow', 'orange', 'green', 'teal'])
const onTintVar = (tint: TintName): string => (NEEDS_DARK_ON_TINT.has(tint) ? '#1d1d1f' : '#fff')

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
 * This file draws all five faces: `circular`, the watch-face complication proper;
 * `inline`, the single-line strip; and the three rectangular chromes — `rectangular`,
 * `rectangular-header` and `rectangular-bleed` — which share one markup shape
 * (`_renderRectangular`) and differ only in stylesheet, because they say the same
 * things in the same order and only wear a different amount of colour saying it.
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

      /* The rectangular family stacks one block per row, full width — packFor gives them
         all columns: 1, and floorsFor prices their floor the same way. */
      .grid.rectangular,
      .grid.rectangular-header,
      .grid.rectangular-bleed {
        grid-template-columns: 1fr;
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

      /* The rectangular family's shared shape: an icon-and-name head over a body carrying
         the reading, an optional supporting line, and an optional bar. rectangular wears
         this bare — tint only on the caption and the bar — and rectangular-header and
         rectangular-bleed below layer their own chrome on top of it. */
      .cell.block {
        flex-direction: column;
        align-items: stretch;
        gap: calc(4px * var(--cw-scale));
        /* Must match layout.ts's RECT_BLOCK. */
        min-height: calc(104px * var(--cw-scale));
        border-radius: var(--cw-radius-inner);
        overflow: hidden;
      }

      .cell.block .head {
        display: flex;
        align-items: center;
        gap: calc(6px * var(--cw-scale));
        min-width: 0;
      }

      .cell.block .name {
        font: var(--cw-text-caption-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cw-comp-tint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell.block .body {
        display: flex;
        flex-direction: column;
        gap: calc(3px * var(--cw-scale));
        flex: 1;
      }

      .cell.block .reading {
        font: var(--cw-text-title-1);
        letter-spacing: -0.02em;
        color: var(--cw-label);
      }

      .cell.block .support {
        font: var(--cw-text-subheadline);
        color: var(--cw-label-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell.block .bar {
        margin-top: auto;
        height: calc(5px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        background: var(--cw-track);
        overflow: hidden;
      }

      .cell.block .bar i {
        display: block;
        height: 100%;
        background: var(--cw-comp-tint);
      }

      .cell.block .glyph {
        color: var(--cw-comp-tint);
        --mdc-icon-size: calc(14px * var(--cw-scale));
      }

      /* .cell.unknown .reading above and .cell.block .reading are both three-class
         selectors, so which one wins is decided by source order rather than by meaning —
         and a rule declared later in this file would silently un-dim an unavailable
         reading again. .block.unknown is four classes, so it beats both outright,
         whatever else here gets reordered. This is what keeps model.ts's rule true on
         the two block faces that colour their reading from --cw-label (plain
         rectangular and rectangular-header): an entity that has gone unavailable is
         never dropped, it is drawn dashed and dimmed, same as circular and inline draw
         it. rectangular-bleed colours its reading from --cw-comp-on-tint instead, so it
         gets its own version of this rule further down, once on-tint is in scope. */
      .cell.block.unknown .reading {
        color: var(--cw-label-secondary);
      }

      /* The Notes treatment: the strip carries the identity, the body gets the story. */
      .cell.rectangular-header {
        gap: 0;
        background: var(--cw-fill);
      }

      .cell.rectangular-header .head {
        background: var(--cw-comp-tint);
        padding: calc(8px * var(--cw-scale)) calc(12px * var(--cw-scale));
      }

      /* var(--cw-comp-on-tint), not a bare white: see onTintVar's comment in the .ts file
         for why four of the ten tints need something other than white here. */
      .cell.rectangular-header .head .name,
      .cell.rectangular-header .head .glyph {
        color: var(--cw-comp-on-tint);
        font-size: calc(14px * var(--cw-scale));
        text-transform: none;
        letter-spacing: 0;
        font-weight: 600;
      }

      .cell.rectangular-header .head .glyph {
        --mdc-icon-size: calc(16px * var(--cw-scale));
      }

      .cell.rectangular-header .body {
        padding: calc(10px * var(--cw-scale)) calc(12px * var(--cw-scale));
      }

      .cell.rectangular-header .reading {
        font: var(--cw-text-title-3);
      }

      /* The Weather treatment: the tint IS the card. Content is drawn in
         var(--cw-comp-on-tint) in both themes, because the surface under it is the tint
         rather than the theme's, so the theme's own label colour would be unreadable half
         the time no matter which colour it read as. The overlay is what keeps the gradient
         from glowing in dark mode, and it is a card-local overlay rather than a change to
         --cw-surface: full-bleed is the one face in the library that replaces the user's
         theme surface with the tint on purpose, and that is a once-per-cell decision this
         style makes for itself, not something the rest of the card should inherit. */
      .cell.rectangular-bleed {
        background-image: linear-gradient(150deg, var(--cw-comp-tint), var(--cw-comp-tint));
        background-color: var(--cw-comp-tint);
        padding: calc(14px * var(--cw-scale));
        position: relative;
      }

      .cell.rectangular-bleed::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(150deg, rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.22));
        pointer-events: none;
      }

      :host([dark]) .cell.rectangular-bleed::after {
        background: linear-gradient(150deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.05));
      }

      .cell.rectangular-bleed .name,
      .cell.rectangular-bleed .reading,
      .cell.rectangular-bleed .glyph {
        color: var(--cw-comp-on-tint);
        position: relative;
        z-index: 1;
      }

      .cell.rectangular-bleed .name {
        text-transform: none;
        letter-spacing: 0;
        font: 600 calc(14px * var(--cw-scale)) / calc(18px * var(--cw-scale)) var(--cw-font);
      }

      .cell.rectangular-bleed .reading {
        font: 500 calc(38px * var(--cw-scale)) / calc(40px * var(--cw-scale)) var(--cw-font);
      }

      /* 92% of on-tint rather than a second colour: the same softened weight the header
         chrome gives a secondary line, whichever of the two on-tint colours this tint got. */
      .cell.rectangular-bleed .support {
        color: color-mix(in srgb, var(--cw-comp-on-tint) 92%, transparent);
        position: relative;
        z-index: 1;
      }

      /* rectangular-bleed's own version of .cell.block.unknown .reading above: that
         rule dims to --cw-label-secondary, which is picked for the surface behind
         circular/inline/the other two block faces, not for whatever --cw-comp-tint this
         card just became — grey theme text over a saturated tint reads as a colour
         clash, not as quiet. Dimmed the same way the rest of the library steps a
         primary down to a secondary instead: 60% opacity is the exact alpha
         --cw-label-secondary already carries against --cw-label in tokens.ts, in both
         themes, so this reading dims by the same ratio as every other face's — just
         applied to on-tint ink, the only ink that is ever legible on this face's
         background. Declared after .cell.rectangular-bleed .support so it also beats
         .cell.block.unknown .reading (both four classes, tie broken by source order)
         on a cell that carries both .block and .rectangular-bleed. */
      .cell.rectangular-bleed.unknown .reading {
        color: color-mix(in srgb, var(--cw-comp-on-tint) 60%, transparent);
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

  /**
   * The three rectangular faces, which differ only in how much colour they wear: a tint
   * on the caption and the bar, a tinted header strip, or the tint as the whole card. One
   * markup shape, three stylesheets, because they say the same things in the same order —
   * name and icon, reading, supporting line, bar — and only the chrome around them moves.
   *
   * The bar is suppressed on `rectangular-header`: the strip already carries the identity
   * (icon and name), which is what a fraction bar exists to summon attention toward on the
   * other two faces, so drawing one under the body as well would be repeating a cue the
   * header just gave. `item.fraction` still gates it on the other two, same as everywhere
   * else in this card — no fraction, no bar, whatever the style.
   */
  private _renderRectangular(style: ComplicationStyle, item: Complication): TemplateResult {
    const header = style === 'rectangular-header'

    return html`
      <div
        class="cell block ${style} ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}; --cw-comp-on-tint:${onTintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}, ${item.value}`}
        @click=${() => this._openMoreInfo(item.id)}
        @keydown=${this._activate(item.id)}
      >
        <div class="head">
          <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
          <span class="name">${item.name}</span>
        </div>
        <div class="body">
          <span class="reading">${item.value}</span>
          ${item.supporting ? html`<span class="support">${item.supporting}</span>` : nothing}
          ${
            item.fraction !== null && !header
              ? html`<div class="bar"><i style=${`width:${item.fraction * 100}%`}></i></div>`
              : nothing
          }
        </div>
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
   * `inline` and the rectangular family each have a face of their own; `circular` is
   * both a face and the fallback, so a style this switch does not recognise (there is
   * none today, but a future style added to `COMPLICATION_STYLES` without a branch here
   * yet) still draws something rather than nothing.
   */
  private _renderCell(
    style: ComplicationStyle,
    item: Complication,
    labels: boolean,
  ): TemplateResult {
    if (style === 'inline') return this._renderInline(item)
    if (isRectangular(style)) return this._renderRectangular(style, item)
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
