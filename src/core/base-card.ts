import { LitElement, type CSSResultGroup, type PropertyValues } from 'lit'
import { property, state } from 'lit/decorators.js'

import { baseStyles } from '../theme/base-styles'
import { tokens } from '../theme/tokens'
import {
  DEFAULT_SIZE,
  cardSizeFor,
  gridOptionsFor,
  heightFor,
  layoutFromBox,
  resolveSize,
  type WidgetSize,
} from './size'
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceGridOptions,
} from './types/ha'

export interface CupertinoCardConfig extends LovelaceCardConfig {
  /** Widget footprint. Anything unrecognised falls back to the default. */
  size?: WidgetSize
}

/**
 * Shared behaviour for every card in the library:
 *
 *  - the `hass` / `setConfig` contract Home Assistant expects
 *  - sizing: `size` config -> grid defaults, plus a measured `cw-layout` attribute
 *  - `dark` reflected from the active Home Assistant theme
 *  - a re-render filter, so a card does not repaint on every unrelated state change
 *
 * Subclasses implement `render()` and, when they read entities, `watchedEntities()`.
 */
export abstract class CupertinoCard<C extends CupertinoCardConfig = CupertinoCardConfig>
  extends LitElement
  implements LovelaceCard
{
  static override styles: CSSResultGroup = [tokens, baseStyles]

  @property({ attribute: false }) public hass?: HomeAssistant

  /**
   * Set by Home Assistant while the user is EDITING, not while the card is a thumbnail.
   *
   * The name invites the wrong reading. `hui-section` does
   * `card.preview = this.lovelace.editMode`, so this goes true for every card on the
   * dashboard the moment the pencil is pressed, and wrapper cards forward it down. Home
   * Assistant's own cards use it to keep themselves visible when their condition is false
   * and to size differently in the editor — never to draw something other than the real
   * thing. A card that showed sample data on this would replace the whole dashboard's
   * contents with samples as soon as the user went to edit it.
   */
  @property({ type: Boolean }) public preview = false

  @state() protected _config?: C

  /**
   * The layout actually being rendered, derived from the card's measured box rather
   * than from `config.size` — Home Assistant lets the user's `grid_options` override
   * whatever we asked for, so the configured size is only a starting point.
   * Reflected so CSS can select on it.
   *
   * Deliberately NOT called `layout`: Home Assistant already owns that name on a card
   * element. Wrapper cards forward it down verbatim —
   * `this._element.layout = this.layout` in `hui-entity-filter-card.shouldUpdate` — so
   * a card nested in `conditional` or `entity-filter` would silently have this
   * overwritten with the view's layout type (`"grid"`, `"panel"`) and every
   * `:host([cw-layout=…])` rule would stop matching.
   */
  @property({ reflect: true, attribute: 'cw-layout' })
  protected cwLayout: WidgetSize = DEFAULT_SIZE

  /**
   * Set by Home Assistant to the view's layout type. We do not use it yet, but it is
   * declared so nothing here accidentally reuses the name.
   */
  @property({ attribute: false }) public layout?: string

  /** Reflected from `hass.themes.darkMode`; drives the dark token set. */
  @property({ type: Boolean, reflect: true }) protected dark = false

  /** Measured box of the card, or 0 before the first measurement. */
  @state() private _measuredHeight = 0
  private _measuredWidth = 0

  private _resizeObserver?: ResizeObserver

  /** The configured size, before measurement talks us out of it. */
  protected get configuredSize(): WidgetSize {
    return resolveSize(this._config?.size)
  }

  /**
   * How tall the card actually is, in px.
   *
   * Cards that fit content to their box (the calendar's row budgets) read this rather
   * than assuming the preset height, because the user's `grid_options` win. Until the
   * first measurement lands it answers with the configured size's height, so the very
   * first paint is already right in the common case.
   */
  protected get boxHeight(): number {
    return this._measuredHeight || heightFor(this.configuredSize)
  }

  public setConfig(config: C): void {
    if (!config) {
      throw new Error('Invalid configuration')
    }
    this._config = config
    this._applyLayout()
  }

  /**
   * Measurement beats configuration, and the measurement outlives a config change.
   *
   * `setConfig` runs again whenever the card is edited — and a config edit does not
   * resize anything, so the ResizeObserver will not fire to put things right. Reading
   * back the last measured width instead of resetting to the configured size is what
   * stops an edit from leaving a narrow card rendering the two-column layout.
   */
  private _applyLayout(): void {
    this.cwLayout = this._measuredWidth ? layoutFromBox(this._measuredWidth) : this.configuredSize
  }

  // ---- Sizing -------------------------------------------------------------

  public getGridOptions(): LovelaceGridOptions {
    return gridOptionsFor(this.configuredSize)
  }

  public getCardSize(): number {
    return cardSizeFor(this.configuredSize)
  }

  // ---- Lifecycle ----------------------------------------------------------

  public override connectedCallback(): void {
    super.connectedCallback()
    this._resizeObserver ??= new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      // Width 0 means we are not laid out yet; measuring then would flip the card to
      // the smallest layout for a frame.
      if (!box || box.width === 0) return
      // Rounded so that a sub-pixel box does not repaint the card on every frame of a
      // dashboard resize.
      this._measuredWidth = Math.round(box.width)
      this._measuredHeight = Math.round(box.height)
      this._applyLayout()
    })
    this._resizeObserver.observe(this)
  }

  public override disconnectedCallback(): void {
    this._resizeObserver?.disconnect()
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('hass')) {
      this.dark = this.hass?.themes?.darkMode ?? false
    }
    if (changed.has('_config')) {
      // Gives the card a height in the masonry layout, where the cell does not
      // impose one. Derived from the *configured* size, so it is stable.
      this.style.setProperty('--cw-min-height', `${heightFor(this.configuredSize)}px`)
    }
  }

  /**
   * Entity ids whose state changes should repaint this card. Everything else in
   * `hass` is ignored, which matters: `hass` is replaced on every state change
   * anywhere in the installation.
   */
  protected watchedEntities(): string[] {
    return []
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false
    // Anything other than a plain `hass` swap is a real change.
    if (changed.size > 1 || !changed.has('hass')) return true

    const previous = changed.get('hass') as HomeAssistant | undefined
    if (!previous || !this.hass) return true
    if (previous.themes?.darkMode !== this.hass.themes?.darkMode) return true
    if (previous.locale !== this.hass.locale) return true

    return this.watchedEntities().some(id => previous.states[id] !== this.hass?.states[id])
  }
}
