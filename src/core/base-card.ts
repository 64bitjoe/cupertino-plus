import { LitElement, type CSSResultGroup, type PropertyValues } from 'lit'
import { property, state } from 'lit/decorators.js'

import { baseStyles } from '../theme/base-styles'
import { tokens } from '../theme/tokens'
import {
  DEFAULT_SIZE,
  cardSizeFor,
  gridOptionsFor,
  layoutFromBox,
  resolveSize,
  rowsToPx,
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

  /** Set by Home Assistant while the card is shown in the card picker. */
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

  private _resizeObserver?: ResizeObserver

  /** The configured size, before measurement talks us out of it. */
  protected get configuredSize(): WidgetSize {
    return resolveSize(this._config?.size)
  }

  public setConfig(config: C): void {
    if (!config) {
      throw new Error('Invalid configuration')
    }
    this._config = config
    this.cwLayout = this.configuredSize
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
      this.cwLayout = layoutFromBox(box.width, box.height)
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
      const rows = gridOptionsFor(this.configuredSize).rows
      if (typeof rows === 'number') {
        this.style.setProperty('--cw-min-height', `${rowsToPx(rows)}px`)
      }
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
