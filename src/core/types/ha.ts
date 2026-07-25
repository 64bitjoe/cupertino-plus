/**
 * The slice of the Home Assistant frontend API these cards actually touch.
 *
 * Hand-rolled on purpose: `custom-card-helpers` exists but always trails the real
 * frontend, and we want zero runtime dependencies beyond Lit. Everything here was
 * checked against the bundle that ships inside home-assistant 2026.7.4.
 */

export interface HassEntityAttributes {
  friendly_name?: string
  icon?: string
  device_class?: string
  supported_features?: number
  [key: string]: unknown
}

export interface HassEntity {
  entity_id: string
  state: string
  attributes: HassEntityAttributes
  last_changed: string
  last_updated: string
}

/** Entity-registry display entry, exposed to cards as `hass.entities`. */
export interface HassEntityRegistryDisplayEntry {
  entity_id: string
  name?: string
  hidden?: boolean
  entity_category?: string
  translation_key?: string
}

/**
 * Note the wire values. The frontend's enum reads
 * `am_pm="12", twenty_four="24"` — the member names never travel, and a card
 * comparing against `"am_pm"` silently never matches.
 */
export type TimeFormat = 'language' | 'system' | '12' | '24'
export type FirstWeekday =
  'language' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
/**
 * Whether the frontend shows times in the browser's zone or the server's. Verified in
 * the 2026.7.4 bundle: `local="local", server="server"`, and `local` is the default.
 */
export type TimeZoneSetting = 'local' | 'server'

export interface FrontendLocaleData {
  language: string
  time_format: TimeFormat
  first_weekday: FirstWeekday
  /** Absent on older cores, which had no such setting — treat that as `local`. */
  time_zone?: TimeZoneSetting
}

export interface HassConfig {
  time_zone: string
  country?: string | null
  currency?: string
  version?: string
}

export interface HassThemes {
  /** Whether the active theme is dark. The only reliable dark-mode signal for a card. */
  darkMode: boolean
  theme: string
}

export interface HassConnection {
  subscribeMessage<T>(
    callback: (message: T) => void,
    subscribeMessage: Record<string, unknown>,
  ): Promise<() => Promise<void>>
}

export interface HomeAssistant {
  states: Record<string, HassEntity>
  entities: Record<string, HassEntityRegistryDisplayEntry>
  config: HassConfig
  themes: HassThemes
  locale: FrontendLocaleData
  language: string
  connection: HassConnection
  localize(key: string, ...args: unknown[]): string
  callWS<T>(msg: Record<string, unknown>): Promise<T>
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>
  callApi<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    parameters?: unknown,
  ): Promise<T>
}

export interface LovelaceCardConfig {
  type: string
  [key: string]: unknown
}

/**
 * Sizing hints for the sections layout. Read out of the shipped frontend:
 * the grid is 12 columns, `columns` accepts the literal `"full"`, and `rows`
 * accepts the literal `"auto"`.
 */
export interface LovelaceGridOptions {
  columns?: number | 'full'
  rows?: number | 'auto'
  min_columns?: number
  max_columns?: number
  min_rows?: number
  max_rows?: number
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant
  /** Set by Home Assistant when the card is rendered inside the card picker. */
  preview?: boolean
  /**
   * The view's layout type (`"grid"`, `"panel"`, …), set by Home Assistant. Wrapper
   * cards forward it to their child card, so this name is NOT available for a card's
   * own use — see the note on `CupertinoCard.cwLayout`.
   */
  layout?: string
  setConfig(config: LovelaceCardConfig): void
  /** Legacy masonry layout sizing, in ~50px units. */
  getCardSize?(): number | Promise<number>
  /** Sections layout sizing. The current API; `getLayoutOptions` is its predecessor. */
  getGridOptions?(): LovelaceGridOptions
}

/** One entry in `window.customCards`, which feeds the dashboard card picker. */
export interface CustomCardEntry {
  type: string
  name: string
  description?: string
  /** Render a live instance of the card in the picker instead of a generic tile. */
  preview?: boolean
  documentationURL?: string
}
