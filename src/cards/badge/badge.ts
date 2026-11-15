import {
  css,
  html,
  LitElement,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit'
import { property, state } from 'lit/decorators.js'

import { runAction } from '../../core/actions'
import { Gestures, pressesAnything, pressHandlers, type PressHandlers } from '../../core/gestures'
import { defineElement } from '../../core/register'
import { scaleFactor } from '../../core/scale'
import { TemplatePool } from '../../core/templates'
import type { HomeAssistant, LovelaceCardEditor } from '../../core/types/ha'
import { baseStyles } from '../../theme/base-styles'
import { tokens } from '../../theme/tokens'
import { chipTemplates, readChip, type ChipConfig, type ChipView } from '../chips/model'
import { BADGE_EDITOR_TAG } from './badge-editor'

export const BADGE_TAG = 'cupertino-plus-badge'

/**
 * A badge's config is one chip's, less the two keys that only mean something in a row of them
 * (`break` and `fill`), plus what every element in the library takes. One chip because a badge
 * IS one: a glyph, a reading, an optional caption over it, a colour, a press. Mushroom's
 * template badge is the same five things under other names (`content` is our `value`, `label`
 * our `name`), so a migrated badge moves its templates over field by field.
 */
export interface BadgeConfig extends Omit<ChipConfig, 'break' | 'fill'> {
  type: string
  scale?: number
  /** Home Assistant's own keys, `visibility` among them, which the editor carries through. */
  [key: string]: unknown
}

declare global {
  interface Window {
    customBadges?: { type: string; name: string; description?: string; preview?: boolean }[]
  }
}

/**
 * A Home Assistant badge drawn as one of this library's chips: the glass pill, at the 36-unit
 * height the frontend gives its own badges so it sits in the same row as theirs.
 *
 * A badge is not a card, and that is the whole shape of this file. There is no `ha-card`, no
 * grid box to measure and no floor to price: the view's badge row lays badges out itself and
 * asks each one for nothing. So this is a plain element rather than a `CupertinoCard`, and what
 * it shares with the chips card is the model (`readChip`, `chipTemplates`) and the tokens.
 *
 * `show` hides the badge outright, which for a badge has to be said to the frontend: its
 * `hui-badge` wrapper only collapses a badge that is `hidden` and has told it so with
 * `badge-visibility-changed`; a badge that merely rendered nothing would leave its gap in the row.
 */
class CupertinoBadge extends LitElement {
  static override styles: CSSResultGroup = [
    tokens,
    baseStyles,
    css`
      :host {
        display: inline-block;
        -webkit-tap-highlight-color: transparent;
      }

      :host([hidden]) {
        display: none;
      }

      /* 36 is Home Assistant's own --ha-badge-size, read first, so a theme that resizes its
         badges resizes this one with them. Scaled, as every length in the library is. */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: calc(6px * var(--cw-scale));
        height: calc(var(--ha-badge-size, 36px) * var(--cw-scale));
        min-width: calc(var(--ha-badge-size, 36px) * var(--cw-scale));
        padding: 0 calc(12px * var(--cw-scale));
        box-sizing: border-box;
        border-radius: var(--cw-radius-pill);
        color: var(--cw-label);
        background: var(--cw-glass-fill);
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 8%, transparent);
        -webkit-backdrop-filter: var(--cw-glass-filter);
        backdrop-filter: var(--cw-glass-filter);
        transition: opacity var(--cw-duration-fast) var(--cw-ease);
      }

      :host([dark]) .badge {
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 20%, transparent);
      }

      /* The tinted chip's wash, at its weights: the badge is the same size as a pill. */
      .badge.tinted {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-badge-tint) 16%, transparent),
          color-mix(in srgb, var(--cw-badge-tint) 24%, transparent)
        );
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-badge-tint) 22%, transparent);
      }

      :host([dark]) .badge.tinted {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--cw-badge-tint) 30%, transparent),
          color-mix(in srgb, var(--cw-badge-tint) 20%, transparent)
        );
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-badge-tint) 38%, transparent);
      }

      /* An icon-only badge is a circle, as the frontend's own is. */
      .badge.icon {
        padding: 0;
        justify-content: center;
      }

      .glyph {
        --mdc-icon-size: calc(18px * var(--cw-scale));
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--mdc-icon-size);
        height: var(--mdc-icon-size);
        flex: none;
        color: var(--cw-badge-tint, inherit);
      }

      .portrait {
        width: calc(22px * var(--cw-scale));
        height: calc(22px * var(--cw-scale));
        border-radius: 50%;
        object-fit: cover;
      }

      .stack {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .value {
        font: var(--cw-text-footnote);
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(160px * var(--cw-scale));
      }

      .caption {
        font: var(--cw-text-caption-2);
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(160px * var(--cw-scale));
      }

      .badge.unknown {
        opacity: 0.55;
      }

      .badge.cw-pressable {
        cursor: pointer;
      }

      .badge.cw-pressable:active {
        opacity: 0.8;
      }

      .badge[role='button']:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .badge {
          transition: none;
        }
      }
    `,
  ]

  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(BADGE_EDITOR_TAG) as LovelaceCardEditor
  }

  /** The first light, or nothing: a badge with no entity draws a blank pill until given one. */
  public static getStubConfig(hass?: HomeAssistant): BadgeConfig {
    const light = Object.keys(hass?.states ?? {}).find(id => id.startsWith('light.'))
    return { type: `custom:${BADGE_TAG}`, ...(light ? { entity: light } : {}) }
  }

  @property({ attribute: false }) public hass?: HomeAssistant

  /** Reflected from `hass.themes.darkMode`, as the cards' is; drives the dark token set. */
  @property({ type: Boolean, reflect: true }) protected dark = false

  /**
   * Set by `hui-badge` in the edit dialog's preview, where a badge hidden by its own `show` would
   * leave the user editing nothing they can see. Shown there regardless, as the frontend shows a
   * badge whose visibility conditions fail.
   */
  @property({ type: Boolean }) public preview = false

  /**
   * Read by `hui-badge`, which otherwise takes a hidden badge out of the DOM. Ours has to stay in
   * it: disconnecting closes the template subscriptions (`disconnectedCallback`), and the `show`
   * template that hid the badge is the one that has to answer for it to come back.
   */
  public readonly connectedWhileHidden = true

  @state() private _config?: BadgeConfig

  private readonly _templates = new TemplatePool(() => this.requestUpdate())
  private readonly _gestures = new Gestures()

  public setConfig(config: BadgeConfig): void {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration')
    this._config = config
    this.style.setProperty('--cw-scale', String(scaleFactor(config.scale)))
  }

  /**
   * Reopens the template subscriptions on the way back in: `willUpdate` is the only thing that
   * opens them, and a badge re-attached on a view switch would otherwise wait for its entity.
   */
  public override connectedCallback(): void {
    super.connectedCallback()
    this.requestUpdate()
  }

  public override disconnectedCallback(): void {
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  private get _user(): string | undefined {
    return this.hass?.user?.name
  }

  /** The same repaint rule as the cards': the badge's own entity, the theme, or the config. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has('hass') || changed.size > 1) return true
    const previous = changed.get('hass') as HomeAssistant | undefined
    if (!previous || !this.hass) return true
    if (previous.themes?.darkMode !== this.hass.themes?.darkMode) return true
    const id = this._config?.entity
    return id !== undefined && previous.states[id] !== this.hass.states[id]
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('hass')) this.dark = this.hass?.themes?.darkMode ?? false
    if (!this.hass || !this._config) return
    this._templates.sync(this.hass, chipTemplates([this._config], {}, this._user))
  }

  private get _chip(): ChipView | undefined {
    if (!this.hass || !this._config) return undefined
    return readChip(this.hass, this._config, {}, this._templates.resolver(this._user))
  }

  /** Hidden, and the wrapper told, only when the answer changes: see the class note. */
  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    const hidden = !this.preview && this._chip?.visible === false
    if (this.hidden === hidden) return
    this.hidden = hidden
    this.dispatchEvent(
      new CustomEvent('badge-visibility-changed', {
        detail: { value: !hidden },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** The badge's press listeners: `pressHandlers`, firing against its entity. */
  private _press(chip: ChipView): PressHandlers {
    return pressHandlers(this._gestures, chip, action => {
      if (this.hass) runAction(this.hass, this, action, chip.entityId)
    })
  }

  protected override render(): TemplateResult | typeof nothing {
    const chip = this._chip
    if (!chip || (!chip.visible && !this.preview)) return nothing

    const pressable = pressesAnything(chip)
    const press = this._press(chip)
    const readable = chip.unavailable ? 'unavailable' : chip.value
    const label = [chip.name, readable].filter(part => part !== '').join(', ') || 'Badge'

    const value = chip.value !== '' ? html`<span class="value">${chip.value}</span>` : nothing
    const body =
      chip.content === 'labeled'
        ? html`<span class="stack">
            ${chip.name !== '' ? html`<span class="caption">${chip.name}</span>` : nothing}${value}
          </span>`
        : chip.content === 'value'
          ? value
          : nothing

    return html`
      <div
        class="badge ${chip.content} ${chip.color ? 'tinted' : ''} ${
          chip.unavailable ? 'unknown' : ''
        } ${pressable ? 'cw-pressable' : ''}"
        style=${chip.color ? `--cw-badge-tint:${chip.color}` : nothing}
        role=${pressable ? 'button' : nothing}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${label}
        title=${chip.name}
        @click=${press.click}
        @pointerdown=${press.down}
        @pointerup=${press.cancel}
        @pointerleave=${press.cancel}
        @pointercancel=${press.cancel}
        @contextmenu=${press.menu}
        @keydown=${press.key}
      >
        ${
          chip.picture
            ? html`<img class="glyph portrait" src=${chip.picture} alt="" />`
            : chip.icon !== ''
              ? html`<ha-icon class="glyph" .icon=${chip.icon}></ha-icon>`
              : nothing
        }
        ${body}
      </div>
    `
  }
}

/**
 * Registered with `window.customBadges`, the badge picker's list, which Home Assistant has read
 * since 2024.8 alongside `customCards`. Its own list rather than `registerCard`'s: the card
 * picker and the badge picker are two dialogs, and a badge in the card picker would add a card
 * that is a 36-unit pill.
 */
if (defineElement(BADGE_TAG, CupertinoBadge)) {
  ;(window.customBadges ??= []).push({
    type: BADGE_TAG,
    name: 'Cupertino Badge',
    description: 'A glass badge: an icon, a reading and a caption, any of them a template.',
    preview: true,
  })
}

export { CupertinoBadge }
