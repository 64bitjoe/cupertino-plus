import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { isPressable, runAction } from '../../core/actions'
import { watchedIds } from '../../core/entity-view'
import { withFloors } from '../../core/floors'
import { registerCard } from '../../core/register'
import type { LovelaceCardEditor, LovelaceGridOptions } from '../../core/types/ha'
import { bandFor, floorsFor, rowHeightFor } from './layout'
import {
  DEFAULT_CONTAINER,
  readChips,
  type ChipContent,
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
         inside it is smaller. */
      .chip {
        display: inline-flex;
        align-items: center;
        min-height: calc(var(--cw-chip-row) * 1px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: calc(6px * var(--cw-scale));
        padding: calc(7px * var(--cw-scale)) calc(13px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        min-width: 0;
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
         §4 of its rules and the whole difference between a Lock Screen accessory and the
         Home Screen widget the complication card draws. */
      .glass .pill {
        color: var(--cw-label);
        background: color-mix(in srgb, var(--cw-label) 14%, transparent);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
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

      .chip[role='button']:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
      }

      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
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

  protected override watchedEntities(): string[] {
    return watchedIds(this._config?.entities)
  }

  private get _chips(): ChipView[] {
    if (!this.hass || !this._config) return []
    const content = this._config.content
    return readChips(this.hass, this._config.entities, content ? { content } : {})
  }

  /**
   * The floors, recomputed on every call: both halves depend on a config that changes under
   * the card, exactly as the complication card's own `getGridOptions` does.
   */
  public override getGridOptions(): LovelaceGridOptions {
    return withFloors(super.getGridOptions(), floorsFor(this._chips))
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
   */
  private _renderChip(chip: ChipView, band: ChipContent): TemplateResult {
    const pressable = isPressable(chip.action)
    const label = `${chip.name}, ${chip.value}`

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
          <ha-icon class="glyph" .icon=${chip.icon}></ha-icon>
          ${body}
        </span>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const chips = this._chips
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
