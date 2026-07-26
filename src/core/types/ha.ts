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

// ---- The visual editor -----------------------------------------------------

/**
 * One clause of an entity selector's filter.
 *
 * Keys within a clause are ANDed; a filter given as an array is ORed across its
 * clauses. `domain`, `device_class` and `unit_of_measurement` each also accept an
 * array, which is an OR of its own. Only the keys we use are modelled.
 */
export interface EntityFilter {
  domain?: string | string[]
  device_class?: string | string[]
}

export interface EntitySelector {
  entity: {
    filter?: EntityFilter | EntityFilter[]
    /**
     * Turns the picker into a list of pickers. The value it reports is then a
     * `string[]` — and, once the user removes the last entity, an empty array rather
     * than `undefined`. See `applyFormData` in `core/card-editor.ts`.
     */
    multiple?: boolean
    /** Drag handles on a multiple picker. Off unless asked for. */
    reorder?: boolean
  }
}

export interface SelectOption {
  value: string
  label: string
  /** A second line under the label. Only `box` mode draws it. */
  description?: string
}

export interface SelectSelector {
  select: {
    options: SelectOption[]
    /**
     * Omit it and the option count decides: under six renders `list` (radio buttons),
     * six or more `dropdown`. `box` — labelled tiles — is never chosen for you.
     */
    mode?: 'dropdown' | 'list' | 'box'
    /** `box` mode only. */
    box_max_columns?: number
    multiple?: boolean
  }
}

/**
 * A selector, as `ha-selector` reads it.
 *
 * It dispatches on `Object.keys(selector)[0]`, so exactly one key is meaningful —
 * hence a union rather than a bag of optional keys. The shipped build knows 57 of
 * these; these are the two our editors ask for.
 */
export type Selector = EntitySelector | SelectSelector

/**
 * One row of an `ha-form`.
 *
 * `ha-form` also takes nodes carrying a `type` instead of a `selector` — `grid`,
 * `expandable` and nine others, whose elements it lazily imports when it sees them —
 * but a selector node is the only shape our editors need.
 */
export interface HaFormSchema {
  name: string
  selector: Selector
  /** Purely presentational here: `ha-form` marks the field, it does not enforce it. */
  required?: boolean
}

/**
 * The element a card's `static getConfigElement()` hands back.
 *
 * The contract, read out of `hui-element-editor` in the 2026.7.4 frontend rather than
 * from documentation, is written up on `CupertinoCardEditor`.
 */
export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant
  setConfig(config: LovelaceCardConfig): void
}

/**
 * The static side of a card class — what Home Assistant reaches for on the constructor
 * rather than on the element. `hui-card-element-editor` looks up exactly this, so the
 * dev harness can drive the same path the dashboard does.
 */
export interface LovelaceCardConstructor {
  getConfigElement?(): LovelaceCardEditor | Promise<LovelaceCardEditor>
  getStubConfig?(): LovelaceCardConfig
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant
  /**
   * Set by Home Assistant while the dashboard is in EDIT mode — `hui-section` assigns
   * `lovelace.editMode` to it, so it is true for every card at once. Not the same thing
   * as `CustomCardEntry.preview` below, despite the name.
   */
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
