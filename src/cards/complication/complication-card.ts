import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { registerCard } from '../../core/register'
import { RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE } from '../../core/ring'
import type { LovelaceCardEditor, LovelaceGridOptions } from '../../core/types/ha'
// Imported for the side effect as well as the constant: the editor tag has to be
// defined by the time getConfigElement is asked for it, and this is the only thing
// that reaches it.
import { COMPLICATION_EDITOR_TAG } from './complication-card-editor'
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
import { onTintVar, tintVar, type TintName } from './tint'

export const COMPLICATION_CARD_TAG = 'cupertino-plus-complication'

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
         twin in layout.ts are called out below, next to that twin's name there. The one
         exception is --cw-comp-ring: packFor answers it in the same design units as
         everything else, but the template sets it as a custom property CSS consumes
         directly, so it is scaled once, there, rather than restated as calc(var(--cw-
         comp-ring) * var(--cw-scale)) at every rule below that reads it -- the battery
         card's --cw-ring-size crosses the same boundary the same way, with the same
         comment, at battery-card.ts. */
      ha-card {
        height: 100%;
        box-sizing: border-box;
        padding: var(--cw-inset);
        display: flex;
      }

      /* rectangular-bleed only: the tint has to reach the card's own rounded corners, the
         way the Weather complication it copies does, so this is the one style that draws
         outside the padding every other style sits inside. The class comes off style
         itself, same as .grid's own class -- see .cell.rectangular-bleed below for why its
         border-radius has to change to match once the padding that used to hold it away
         from the corner is gone.

         layout.ts's floorsFor still charges 2*INSET for every rectangular style, bleed
         included -- it has no reason to special-case this one. That makes the floor it
         returns for a bleed card larger than what the CSS actually needs by 2*INSET, the
         same direction ASSUMED_SECTION_WIDTH already errs in: a generous floor, not a
         wrong one, so the Layout tab still never offers a box the card does not fit. */
      ha-card.rectangular-bleed {
        padding: 0;
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

      /* justify-items: stretch, not place-items: center's shrink-to-content: a grid item
         sized to its own max-content can run wider than its 1fr track with nothing to
         clip it against, since grid does not reflow a track to make room for an
         overflowing neighbour — the visible symptom was a long caption overlapping the
         cell beside it rather than eliding. Stretching the cell to its column and
         centring within it via the flex column below (.cell's own align-items) gives the
         caption's overflow:hidden something the width of the actual column to truncate
         against. */
      .grid.circular {
        grid-template-columns: repeat(var(--cw-comp-columns), 1fr);
        align-items: center;
        justify-items: stretch;
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
        font-family: var(--cw-font);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
        color: var(--cw-label);
        z-index: 1;
      }

      /* The ring's own reading, sized off the ring it actually landed in rather than off
         --cw-scale alone. A fixed 17px * scale read fine at packFor's default RING_MAX
         (96 design units) but not at RING_MIN (40): a 46% would touch the track on both
         sides, and a longer value like 21.4°C would wrap onto a second line the .ring box
         has no height budgeted for, spilling out of it and breaking the row beside it --
         both visible in docs/images/complication-small.png before this rule existed.
         white-space: nowrap is what .cell.inline .reading already carries for the same
         reason (see its own comment below): with the default 'normal' the reading wraps
         at its internal space rather than growing past its box, and a wrapped ring
         reading has nowhere to grow into. The clamp: a floor that stays legible at
         RING_MIN, a preferred size proportional to the ring's own diameter rather than a
         flat multiple of scale, and a ceiling at the 17px this rule always drew, so a
         ring at or above RING_MAX looks exactly as it did before this change. */
      .ring .reading {
        font-size: clamp(
          calc(11px * var(--cw-scale)),
          calc(var(--cw-comp-ring) * 0.2),
          calc(17px * var(--cw-scale))
        );
        line-height: 1.15;
        white-space: nowrap;
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

      /* white-space: nowrap for the same reason .name gets it: with the default 'normal',
         a narrow column does not overflow the reading, it wraps it at the space before
         the unit ('21.4' over '°C'), which grows the row past the 44px INLINE_ROW
         layout.ts charged for it. A reading is short enough that nowrap alone is enough
         room in practice; .name's ellipsis is what actually gives ground when a row is
         tight. */
      .cell.inline .reading {
        margin-left: auto;
        color: var(--cw-label-secondary);
        font-weight: 400;
        white-space: nowrap;
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
         style makes for itself, not something the rest of the card should inherit.

         border-radius: var(--cw-radius), not the inner radius .cell.block set above (this
         rule wins the tie: same two-class specificity, later in the sheet). --cw-radius-
         inner is right for a panel that sits inside the card's own padding, which is what
         every other rectangular face still is; with ha-card's padding removed above, this
         one block IS the card's face, so its corners have to agree with the outer radius
         ha-card itself draws with, or the two curves show as a mismatched notch at every
         corner. Stacked blocks each keep all four corners rounded and stay separated by
         the grid's own gap between cells (unchanged, still var(--cw-comp-gap)) rather than
         a card-coloured margin of their own: every block spans full width, so its left and
         right edges always meet ha-card's, while only the first block's top edge and the
         last block's bottom edge meet ha-card's top and bottom -- an interior block floats
         between two gaps, rounded on all four corners like the single-entity case. */
      .cell.rectangular-bleed {
        background-image: linear-gradient(150deg, var(--cw-comp-tint), var(--cw-comp-tint));
        background-color: var(--cw-comp-tint);
        padding: calc(14px * var(--cw-scale));
        border-radius: var(--cw-radius);
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
    const floors = floorsFor(style, count)
    const base = super.getGridOptions()

    return {
      ...base,
      ...floors,
      // `columns`/`rows` are `number | 'full'` and `number | 'auto'` (`core/types/ha.ts`)
      // because Home Assistant's own grid accepts those literals as "as wide/tall as the
      // grid allows" — and `super.getGridOptions()` could in principle return one, even
      // though `core/size.ts`'s `gridOptions()` happens to return plain numbers today.
      // `Number('full')` is `NaN`, so a blind `Math.max` would silently turn a deliberate
      // literal into a broken grid option instead of leaving it alone; a literal is also
      // already at least as generous as any floor this card could ask for, so there is
      // nothing to raise. Only the number case is coerced; either literal, or an absent
      // default, passes straight to the floor itself.
      columns:
        typeof base.columns === 'number'
          ? Math.max(base.columns, floors.min_columns)
          : (base.columns ?? floors.min_columns),
      rows:
        typeof base.rows === 'number'
          ? Math.max(base.rows, floors.min_rows)
          : (base.rows ?? floors.min_rows),
    }
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
   *
   * The `aria-label` here, and on the other two faces below, spells "unavailable" out
   * rather than reading `item.value` straight: `model.ts` already turns an unreadable
   * entity's value into an em dash for the dashed, dimmed cell decision 4 draws visually,
   * but an em dash read aloud by a screen reader is silence, not a dash — "Lounge
   * Humidity, —" tells nobody anything went wrong. `battery-card.ts`'s cells make the
   * same call the same way, off the same `unknown`/`unavailable` flag.
   */
  private _renderCircular(item: Complication, labels: boolean): TemplateResult {
    const gauge = item.range !== null

    return html`
      <div
        class="cell circular ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}: ${item.unavailable ? 'unavailable' : item.value}`}
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
        aria-label=${`${item.name}: ${item.unavailable ? 'unavailable' : item.value}`}
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
        aria-label=${`${item.name}: ${item.unavailable ? 'unavailable' : item.value}`}
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

    // pack.ring arrives in design units, like every other number packFor returns; scaled
    // here, once, into the one custom property this stylesheet reads pre-multiplied. See
    // the styles' own top-of-file comment for why that is the one length that crosses the
    // scale boundary raw instead of restating "* var(--cw-scale)" at each rule below.
    const ring = `calc(${pack.ring}px * var(--cw-scale))`

    return html`
      <ha-card class=${style}>
        <div
          class="grid ${style}"
          style=${`--cw-comp-columns:${pack.columns}; --cw-comp-ring:${ring}`}
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
