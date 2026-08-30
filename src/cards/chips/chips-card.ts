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
import { bandFor, floorsFor, rowHeightFor, type ChipBand } from './layout'
import {
  chipConfigs,
  chipTemplates,
  chipWatchedIds,
  DEFAULT_CONTAINER,
  DEFAULT_CONTENT,
  readChips,
  type ChipContent,
  type ChipDefaults,
  type ChipsContainer,
  type ChipView,
} from './model'
// Imported for the side effect as well as the constant: the editor tag has to be defined by
// the time getConfigElement is asked for it, and this is the only thing that reaches it.
import { CHIPS_EDITOR_TAG } from './chips-card-editor'

export const CHIPS_CARD_TAG = 'cupertino-plus-chips'

export interface ChipsCardConfig extends CupertinoCardConfig {
  entities?: unknown
  content?: ChipContent
  color?: string
  container?: ChipsContainer
}

const NO_ENTITIES = 'No Entities'

/**
 * The lock-screen chips widget: a row of small monochrome pills, each one glyph, usually a
 * reading, optionally a caption, and a tap action.
 *
 * `model.ts` is the whole of this card's contact with `hass` — it turns a config row plus an
 * entity into a `ChipView`, sharing `core/entity-view.ts`'s reading logic with every other
 * card in the library rather than re-deriving it. `layout.ts` prices the floor `getGridOptions`
 * must answer before anything is measured; this class draws the answer and owns the one thing
 * neither of those files can: the container split below.
 *
 * The container split is the one thing to get exactly right. `glass` must leave nothing opaque
 * between the pill and the dashboard, or `backdrop-filter` samples the card instead of the
 * wallpaper.
 */
class CupertinoChipsCard extends CupertinoCard<ChipsCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      /* The glass container is the reason this card exists, and it is the first card in the
         library that must not paint a surface: backdrop-filter samples whatever is behind the
         element, so an opaque ha-card between the pill and the dashboard means the blur
         samples the card and achieves nothing but cost. */
      ha-card.glass {
        background: none;
        border: none;
        box-shadow: none;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cw-space-2);
        padding: var(--cw-inset);
        align-content: flex-start;
        min-width: 0;
      }

      /* The pressable box, not the pill. layout.ts prices the row at 44 units for this: a
         press can toggle a light now, so the target is a real one even though the paint
         inside it is smaller.

         The min-width is the same 44 in the other direction, and it is not redundant: an
         icon-only pill is 13 + 17 + 13 = 43 units across, one short of the target the row
         is being priced at, and a row of them was measured at exactly that in
         docs/images/chips-icons.png. It cannot widen a chip that is already wider than 44,
         so no other content mode notices, and it stays under layout.ts's NOMINAL_WIDTH.icon
         of 52 — the floor arithmetic still errs generous. */
      .chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: calc(var(--cw-chip-row) * 1px * var(--cw-scale));
        min-width: calc(44px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: calc(6px * var(--cw-scale));
        padding: calc(7px * var(--cw-scale)) calc(13px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        min-width: 0;
        /* The other half of the press dip below: the chip keeps the transform and hands the
           opacity down here, so the fade needs the same easing the chip's own transition has. */
        transition: opacity var(--cw-duration-fast) var(--cw-ease);
      }

      .chip.labeled .pill {
        align-items: center;
      }

      .stack {
        display: flex;
        flex-direction: column;
        gap: calc(2px * var(--cw-scale));
        min-width: 0;
      }

      /* One ink for the whole row: this card has no per-entity colour at all, which is
         §3 of its rules and the whole difference between a Lock Screen accessory and the
         Home Screen widget the complication card draws. */
      /* The scrim is a gradient rather than a flat wash, which is how both iOS glass and
         Material surfaces are actually lit: denser at the bottom, with a bright hairline along
         the top edge for the specular line. It is a BACKGROUND layer, so it composites over
         backdrop-filter rather than replacing it — the blur still samples the dashboard — and
         it stays low-alpha for exactly that reason: a dense scrim is a translucent pill that
         has stopped being translucent. */
      .glass .pill {
        color: var(--cw-label);
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-label) 10%, transparent),
          color-mix(in srgb, var(--cw-label) 18%, transparent)
        );
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 8%, transparent);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
      }

      /* Not the same gradient inverted. The light still comes from above, but the surface is
         dark: the top edge gets BRIGHTER relative to the body and the body gets LESS dense,
         where the light-mode version gets denser downward. Flipping one gradient would light
         the pill from underneath. */
      :host([dark]) .glass .pill {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-label) 16%, transparent),
          color-mix(in srgb, var(--cw-label) 9%, transparent)
        );
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 20%, transparent);
      }

      /* No blur in card mode: blurring against an opaque surface samples the surface. */
      .surface .pill {
        color: var(--cw-label);
        background: var(--cw-track);
      }

      .glyph {
        --mdc-icon-size: calc(17px * var(--cw-scale));
        flex: none;
      }

      /* The tint paints the glyph and nothing else: the reading, the caption and the pill stay
         one ink, so a row of six chips still reads as one band rather than as six competing
         highlights. §4 of the spec has the argument, and core/ring.ts has the older version of
         it — a coloured number is a second, blurrier opinion about a number already printed.
         The fallback is the row's own ink, so a chip with no colour is untouched. */
      .glyph {
        color: var(--cw-chip-tint, inherit);
      }

      .value {
        font: var(--cw-text-footnote);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(140px * var(--cw-scale));
      }

      .caption {
        font: var(--cw-text-caption-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(140px * var(--cw-scale));
      }

      /* Dashed and dimmed, the library's contract for an entity that is not reporting. */
      .chip.unknown .pill {
        opacity: 0.55;
      }

      /* The press dip moves off the chip and onto the pill, and it has to. The shared
         .cw-pressable:active rule (base-styles.ts) sets opacity 0.8 on this element, and an
         element with opacity below 1 is a backdrop root: the pill inside it then has nothing
         behind it to sample, so the glass goes flat for as long as a finger is down — on the
         one card in the library whose whole point is the blur. Checked in Chromium rather than
         reasoned about: over a striped background, opacity on the PARENT killed the blur
         outright, opacity on the blurred element itself only dimmed it. The scale(0.97) stays
         where it is, on the whole chip, because a transformed ancestor is not a backdrop
         root. */
      .chip.cw-pressable:active {
        opacity: 1;
      }

      .chip.cw-pressable:active .pill {
        opacity: 0.8;
      }

      /* .chip.unknown .pill above is three classes (0,3,0); this is four (0,4,0) and has
         to be, or the press rule above outranks it on specificity alone and a dimmed chip
         goes 0.55 -> 0.8 on press instead of dimming further. Every dead chip is still
         pressable — more-info is the default action — so this fires on every press of one.
         0.44 is 0.55 * 0.8: the same press dip the rest of the row gets, applied on top of
         the dim rather than overriding it. */
      .chip.unknown.cw-pressable:active .pill {
        opacity: 0.44;
      }

      .chip[role='button']:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
      }

      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
      }

      /* base-styles.ts's own prefers-reduced-motion block silences .cw-pressable's
         transition; .pill's is a separate declaration (above) and needs the same
         treatment, or the opacity fade it drives still animates with motion reduced. */
      @media (prefers-reduced-motion: reduce) {
        .pill {
          transition: none;
        }
      }
    `,
  ]

  public static getStubConfig(): ChipsCardConfig {
    return { type: `custom:${CHIPS_CARD_TAG}` }
  }

  /**
   * A card with no editor loses its **Visibility** and **Layout** tabs too — the tab strip is
   * rendered only inside the GUI branch. See the contract on `CupertinoCardEditor`.
   */
  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(CHIPS_EDITOR_TAG) as LovelaceCardEditor
  }

  /**
   * The card's template subscriptions.
   *
   * `requestUpdate` rather than a state field: a resolved template changes what `_chips`
   * computes, and `_chips` is a getter reading `this._config` and the pool. `shouldUpdate`
   * would otherwise swallow the repaint, because nothing in `hass` changed.
   */
  private readonly _templates = new TemplatePool(() => this.requestUpdate())

  public override disconnectedCallback(): void {
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  /**
   * Kept in step with the config on every update, not only on `setConfig`: the set of
   * templates changes when the config does, and `sync` is a diff, so calling it when nothing
   * moved costs a `Set` build and closes nothing.
   */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this.hass || !this._config) return
    this._templates.sync(this.hass, chipTemplates(this._config.entities, this._defaults))
  }

  protected override watchedEntities(): string[] {
    return chipWatchedIds(this._config?.entities)
  }

  /** The card-level defaults every row inherits from. */
  private get _defaults(): ChipDefaults {
    const content = this._config?.content
    const color = this._config?.color
    return { ...(content ? { content } : {}), ...(color ? { color } : {}) }
  }

  /**
   * The reconstructed key here has to agree with `chipTemplates`' own, byte for byte, or the
   * lookup silently misses and the field falls back forever. The one thing worth restating:
   * "no entity" means no `variables` key at all, on a row or off it — `chipTemplates`'s own
   * note has the reasoning, and a mismatch here was exactly the class of bug that note exists
   * to prevent.
   */
  private get _chips(): ChipView[] {
    if (!this.hass || !this._config) return []
    return readChips(this.hass, this._config.entities, this._defaults, (template, entity) =>
      this._templates.read(
        requestKey(
          entity === undefined ? { template } : { template, variables: { config: { entity } } },
        ),
      ),
    )
  }

  /**
   * The floor's own view of the row.
   *
   * Before `hass` exists — Home Assistant asks for `getGridOptions()` the moment a card is
   * dropped from the picker, well before that — visibility cannot be known at all, so every
   * configured row counts: the same generous default this always had, from before `show`
   * existed to override it.
   *
   * Once `hass` exists, only what is actually going to be drawn counts: a chip whose `show`
   * resolved false takes no room, which is what stops a card built mostly of hidden chips from
   * reserving space for all of them anyway. `_floorFor` below is what stops that honesty from
   * ever shrinking the box below what has already been shown.
   */
  private get _floorBand(): ChipBand[] {
    const defaultContent = this._config?.content ?? DEFAULT_CONTENT
    if (!this.hass) {
      return chipConfigs(this._config?.entities).map(row => ({
        content: row.content ?? defaultContent,
      }))
    }
    return this._chips.filter(chip => chip.visible).map(chip => ({ content: chip.content }))
  }

  /**
   * The highest floor this card has actually needed, keyed to the entities and the card-level
   * content default so a genuine edit re-baselines rather than carrying a stale high-water
   * mark forward.
   *
   * `_floorBand` reads real visibility once `hass` exists, and a chip whose `show` template
   * has not resolved yet reads as hidden — `readChip`'s own "hidden until it answers"
   * contract — so the very FIRST tick's true count is usually too small, not too large.
   * Answering with it verbatim would fix an oversized card built from mostly-hidden chips by
   * overcorrecting into a worse failure: a floor frozen before any `show` template has had its
   * first push, clipping every chip that resolves visible a moment later.
   *
   * Tracking a maximum instead means the floor grows to the true visible count within the
   * first couple of renders and holds there. That convergence is not a hope: `getGridOptions()`
   * is called by the sections grid on every render of its section (`hui-grid-section.ts`,
   * checked directly against `home-assistant/frontend`), and `TemplatePool`'s first results
   * land within a render or two of `hass` arriving, each one calling `requestUpdate()` and so
   * triggering exactly the render this needs.
   */
  private _floorMax: { key: string; floors: Floors } | undefined

  private _floorFor(band: ChipBand[]): Floors {
    const floors = floorsFor(band)
    const key = JSON.stringify([this._config?.entities ?? null, this._config?.content ?? null])

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
   * The floors, recomputed on every call: both halves depend on a config — and, past the
   * first tick, on live visibility — that changes under the card, exactly as the complication
   * card's own `getGridOptions` does.
   */
  public override getGridOptions(): LovelaceGridOptions {
    return withFloors(super.getGridOptions(), this._floorFor(this._floorBand))
  }

  /**
   * The handlers are bound unconditionally and guard inside, rather than being bound only for
   * a pressable chip. A conditional `@click=${cond ? handler : nothing}` is the shape that
   * reads better and the one to avoid here: an event binding is not an attribute binding, and
   * feeding it a sentinel is a different code path in lit-html from feeding it a function.
   * Guarding inside is one branch either way and cannot be got subtly wrong.
   */
  private _press(chip: ChipView) {
    return (): void => {
      if (!this.hass || !isPressable(chip.action)) return
      runAction(this.hass, this, chip.action, chip.entityId)
    }
  }

  private _key(chip: ChipView) {
    return (event: KeyboardEvent): void => {
      if (!isPressable(chip.action)) return
      // Space scrolls the dashboard otherwise, and Enter would submit a form the card may be
      // sitting inside.
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this._press(chip)()
    }
  }

  /**
   * One chip. A chip whose action is `none` is not a button: no role, no tab stop, no pressed
   * state — an affordance that lies about being interactive is worse than none, and eight of
   * them in a keyboard user's tab order is the concrete version of that.
   *
   * A spacer is drawn first and returns early: no pill, no glyph, not a button, nothing a
   * screen reader announces — `aria-hidden` rather than a divider mark, so a row of chips
   * groups by whitespace alone. `.chip`'s own `min-width`/`min-height` still apply, which is
   * what makes it a gap the width of one chip rather than nothing at all.
   */
  private _renderChip(chip: ChipView, band: ChipContent): TemplateResult {
    if (chip.spacer) return html`<div class="chip ${band}" aria-hidden="true"></div>`

    const pressable = isPressable(chip.action)
    // Ordinary entity-bearing chips always have both a name and a reading, so this produces
    // the exact same string it always did for them: `${chip.name}, ${...}`. The `filter` and
    // fallback only matter for an entity-less chip, where either half can resolve empty — an
    // icon-only nav chip with no name and no value would otherwise announce a bare ", " to
    // whoever is listening.
    const readable = chip.unavailable ? 'unavailable' : chip.value
    const label = [chip.name, readable].filter(part => part !== '').join(', ') || 'Chip'

    const body =
      band === 'labeled'
        ? html`<span class="stack"
            ><span class="caption">${chip.name}</span><span class="value">${chip.value}</span></span
          >`
        : band === 'value'
          ? html`<span class="value">${chip.value}</span>`
          : nothing

    return html`
      <div
        class="chip ${band} ${chip.unavailable ? 'unknown' : ''} ${pressable ? 'cw-pressable' : ''}"
        role=${pressable ? 'button' : nothing}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${pressable ? label : nothing}
        title=${chip.name}
        @click=${this._press(chip)}
        @keydown=${this._key(chip)}
      >
        <span class="pill">
          <ha-icon
            class="glyph"
            style=${chip.color ? `--cw-chip-tint:${chip.color}` : nothing}
            .icon=${chip.icon}
          ></ha-icon>
          ${body}
        </span>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const chips = this._chips.filter(chip => chip.visible)
    const container = this._config.container ?? DEFAULT_CONTAINER
    const klass = container === 'glass' ? 'glass' : 'surface'

    if (chips.length === 0) {
      return html`<ha-card class=${klass}><div class="empty">${NO_ENTITIES}</div></ha-card>`
    }

    const band = bandFor(chips)
    return html`
      <ha-card
        class=${klass}
        style=${`--cw-chip-row:${rowHeightFor(band)}`}
        aria-label=${`${chips.length} chips`}
      >
        <div class="chips">${chips.map(chip => this._renderChip(chip, band))}</div>
      </ha-card>
    `
  }
}

registerCard(CHIPS_CARD_TAG, CupertinoChipsCard, {
  name: 'Cupertino Chips',
  description: 'A row of lock-screen-style chips for your dashboard.',
})

export { CupertinoChipsCard }
