/**
 * What a complication draws, and how a Home Assistant state becomes one.
 *
 * The five render functions (the ring, the block, the strip and their kin) only ever see
 * a `Complication`, so this is the whole of the card's contact with Home Assistant — the
 * same idea as `battery/model.ts`, and read as the sibling of `tint.ts` and `range.ts`:
 * those two answer "what colour" and "what range", this module is where their answers get
 * folded in alongside the reading itself, the name, the icon and the value string, into
 * the one shape everything downstream trusts.
 *
 * The one decision worth stating up front, because it drives most of what follows: **an
 * unreadable entity is never dropped.** A sensor that has gone `unavailable` becomes a
 * dashed, dimmed complication rather than a missing one, for the battery card's own
 * reason — the fact that something stopped reporting is exactly what somebody puts a
 * widget on a dashboard to find out. A card that quietly showed three cells where four
 * were configured would answer the opposite question. An entity absent from `hass.states`
 * entirely (a typo'd id, an integration that has not loaded yet) gets the same treatment,
 * keyed by the id it was configured with: the row still exists, it is just permanently in
 * the state a live entity only visits sometimes.
 *
 * The other rule that runs through every field below: **per-entity config beats card
 * config beats whatever this module would derive.** A `min`/`max` or `color` set on one
 * row of `entities:` wins over the same key set once at the top of the card, which in turn
 * wins over `range.ts`/`tint.ts`'s own guess. `name` and `icon` have no card-level rung —
 * there is no sensible "every row is called X" — so those two are just per-entity-or-derived.
 */

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { fractionOf, rangeFor, type Range } from './range'
import { tintFor, type TintName } from './tint'

/**
 * One row of the card's `entities`, as the config may write it.
 *
 * A bare entity id is what the visual editor writes and what most configs hold; the
 * object is for the overrides `hass` cannot supply on its own — a name for a sensor
 * called `Kirill's Phone Battery Level`, a range for an entity `range.ts` has no honest
 * derivation for, a colour that disagrees with `tint.ts`'s guess.
 */
export interface ComplicationEntityConfig {
  entity: string
  name?: string
  icon?: string
  min?: number
  max?: number
  color?: TintName
}

/** The card-level values a row falls back to when it sets nothing of its own. */
export interface ComplicationDefaults {
  min?: number
  max?: number
  color?: TintName
}

/** One complication's worth of entity, normalised. */
export interface Complication {
  /** The entity id: the identity of the cell, and what a tap opens. */
  id: string
  name: string
  /**
   * Always an `mdi:` name, never `undefined` and never `''`, so no cell ever renders an
   * empty `<ha-icon>`. See `iconFor` for why this is resolved here rather than left to
   * `<ha-state-icon>`.
   */
  icon: string
  /** Already formatted, unit included. An em dash when there is nothing to read. */
  value: string
  /** The reading as a number, or `null` when the state is not one (including "unavailable"). */
  numeric: number | null
  range: Range | null
  /** `numeric` placed in `range`, 0–1. `null` whenever there is no gauge to draw. */
  fraction: number | null
  /** One line of context, and only where deriving one is obviously right. See `supportingFor`. */
  supporting: string | null
  tint: TintName
  unavailable: boolean
}

const UNAVAILABLE = new Set(['unavailable', 'unknown'])

/** Not localised, like the rest of the library's own marks. Matches the battery card's. */
const VALUE_DASH = '—'

/**
 * The rows the config asked for, in the order it asked for them, forgiving of every shape
 * a hand-written config can take.
 *
 * A card config is not typechecked on its way in, so `entities: sensor.phone` — a bare
 * scalar where a list was meant — is what somebody writes first, and it is worth reading
 * as `['sensor.phone']` rather than rejecting. Equally, a row with no usable `entity` (an
 * object missing it, a stray number, `null`) is worth skipping rather than crashing the
 * whole card over one bad line: a config with three good rows and one mistake should draw
 * three complications, not zero.
 */
export const entityConfigs = (entities: unknown): ComplicationEntityConfig[] => {
  if (!entities) return []
  const list = Array.isArray(entities) ? entities : [entities]

  return list.flatMap(row => {
    if (typeof row === 'string') return [{ entity: row }]
    if (
      row &&
      typeof row === 'object' &&
      typeof (row as ComplicationEntityConfig).entity === 'string'
    ) {
      return [row as ComplicationEntityConfig]
    }
    return []
  })
}

/**
 * Every entity id the card's rendering depends on: what `watchedEntities()` answers with.
 *
 * `hass` is replaced wholesale on every state change anywhere in the installation, so this
 * is what decides whether the card re-renders when the configured entity changes — getting
 * it short would be a complication that silently stops updating.
 */
export const watchedIds = (entities: unknown): string[] =>
  entityConfigs(entities).map(row => row.entity)

/**
 * A state string read as a finite number, or `null`.
 *
 * `Number('')` is `0`, which is a real reading and not the "not a number" this function
 * exists to catch, hence the explicit blank check ahead of it; `Number('unavailable')` and
 * `Number('unknown')` are already `NaN` and need no special-casing here at all.
 */
const numberOf = (raw: string): number | null => {
  const n = Number(raw)
  return raw.trim() !== '' && Number.isFinite(n) ? n : null
}

/**
 * `device_class` to icon, for the entities that carry one. Deliberately narrower than
 * `tint.ts`'s table: a colour only has to mean "what kind of thing", but a wrong icon
 * here is a wrong *picture*, so this only lists classes where a single glyph is the
 * obvious, undisputed choice for the whole class.
 */
const ICON_BY_DEVICE_CLASS: Record<string, string> = {
  temperature: 'mdi:thermometer',
  humidity: 'mdi:water-percent',
  moisture: 'mdi:water',
  battery: 'mdi:battery',
  power: 'mdi:flash',
  energy: 'mdi:lightning-bolt',
  illuminance: 'mdi:brightness-5',
  pressure: 'mdi:gauge',
  carbon_dioxide: 'mdi:molecule-co2',
  door: 'mdi:door',
  window: 'mdi:window-closed',
}

/** Domain to icon, for the entities `device_class` says nothing about. */
const ICON_BY_DOMAIN: Record<string, string> = {
  lock: 'mdi:lock',
  light: 'mdi:lightbulb',
  cover: 'mdi:window-shutter',
  climate: 'mdi:thermostat',
  media_player: 'mdi:play-circle',
  fan: 'mdi:fan',
  vacuum: 'mdi:robot-vacuum',
  person: 'mdi:account',
  binary_sensor: 'mdi:radiobox-blank',
  number: 'mdi:ray-vertex',
}

/**
 * A name for `<ha-icon>`, always — an `mdi:` string, chosen once, per entity, never per
 * reading.
 *
 * The obvious answer was `<ha-state-icon>`, which resolves an entity's icon exactly the
 * way the rest of the frontend does. Ruled out for two reasons, not one:
 *
 *  - It is not renderable in the one place this card gets looked at properly.
 *    `dev/ha-stubs.ts` stubs `ha-icon` and `ha-svg-icon` and has no stand-in for
 *    `ha-state-icon` at all, so the showcase would draw nothing for every complication
 *    on the page — a much worse failure than a coarse fallback icon.
 *  - It is actively wrong here even where it would render. `<ha-state-icon>`'s
 *    resolution is state-dependent — a `device_class: battery` sensor gets
 *    `mdi:battery-70`-shaped icons that step with the level — and that restates, at a
 *    coarser resolution, the exact number the ring next to it has already drawn. It is
 *    the same mistake `tint.ts` argues against for colour: a mark that moves with the
 *    reading is a second, blurrier opinion rather than decoration.
 *
 * So the icon is resolved once, here, off what does not change reading to reading: the
 * config's own `icon`, then the entity's `attributes.icon` (what the user set on the
 * entity itself, in the entity registry), then a `device_class` table, then a domain
 * table, then `mdi:eye` — "something, unspecified" — for whatever neither table knows.
 */
const iconFor = (entity: HassEntity): string => {
  const own = entity.attributes.icon
  if (typeof own === 'string' && own !== '') return own

  const deviceClass = entity.attributes.device_class
  if (typeof deviceClass === 'string' && ICON_BY_DEVICE_CLASS[deviceClass]) {
    return ICON_BY_DEVICE_CLASS[deviceClass]
  }

  const domain = entity.entity_id.split('.')[0] ?? ''
  return ICON_BY_DOMAIN[domain] ?? 'mdi:eye'
}

/**
 * The reading, formatted the way the frontend would.
 *
 * A number goes through `Intl.NumberFormat` in the user's language, honouring the
 * decimals they pinned in the entity registry (`display_precision`) when they pinned
 * any, and capped at two otherwise so a sensor reporting `21.399999999` does not spill
 * past what anyone asked to see; `%` is set tight against the numeral and every other
 * unit gets a space, which is the frontend's own rule.
 *
 * A state that is not a number (`heat`, `playing`, `locked`, …) is asked of
 * `hass.localize` under the key core's own entity-state translations live at, device
 * class first because it is the more specific string, then the domain's generic one; and
 * it falls back to the raw state, capitalised, because `localize` answers `''` for a key
 * it does not have rather than throwing. That key shape is recorded, and its verification
 * status, in `docs/ha-api-notes.md` under "Entity state strings" — read that before
 * trusting it against a state string this table has not been checked against.
 */
const formatValue = (hass: HomeAssistant, entity: HassEntity): string => {
  const numeric = numberOf(entity.state)
  const unit = entity.attributes.unit_of_measurement

  if (numeric !== null) {
    const precision = hass.entities?.[entity.entity_id]?.display_precision
    const formatted = new Intl.NumberFormat(hass.locale?.language, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision ?? 2,
    }).format(numeric)

    if (typeof unit !== 'string' || unit === '') return formatted
    return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`
  }

  const domain = entity.entity_id.split('.')[0] ?? ''
  const deviceClass = entity.attributes.device_class
  const keys = [
    typeof deviceClass === 'string'
      ? `component.${domain}.entity_component.${deviceClass}.state.${entity.state}`
      : '',
    `component.${domain}.entity_component._.state.${entity.state}`,
  ].filter(Boolean)

  for (const key of keys) {
    const translated = hass.localize(key)
    if (translated) return translated
  }

  return entity.state.charAt(0).toUpperCase() + entity.state.slice(1)
}

/**
 * One line of context, and only where one is obviously right.
 *
 * Deliberately not a general-purpose attribute reader: this is the one place the card
 * could easily turn noisy, and a line reading `state_class: measurement` is worse than
 * no line at all, because it looks like it means something and does not. So this names
 * exactly the domains where a single attribute reads as a sentence on its own — a
 * thermostat's setpoint, a track title, a cover's position — and answers `null` for
 * everything else, including a domain listed here whose one attribute happens to be
 * unset. Growing this table is a judgement call each time, not a mechanical addition.
 */
const supportingFor = (entity: HassEntity): string | null => {
  const domain = entity.entity_id.split('.')[0] ?? ''

  if (domain === 'climate') {
    const target = entity.attributes.temperature
    if (typeof target === 'number') {
      const verb = entity.state === 'cool' ? 'Cooling' : 'Heating'
      return `${verb} to ${target}°`
    }
    return null
  }

  if (domain === 'media_player') {
    const title = entity.attributes.media_title
    return typeof title === 'string' && title !== '' ? title : null
  }

  if (domain === 'cover') {
    const position = entity.attributes.current_position
    return typeof position === 'number' ? `${position}% open` : null
  }

  return null
}

/**
 * A `{min, max}` pair with only the halves that are actually set, never a key holding an
 * explicit `undefined` — `exactOptionalPropertyTypes` treats those as different things,
 * and `Partial<Range>` promises the honest one: a key that is simply not there.
 */
const pairOf = (min: number | undefined, max: number | undefined): Partial<Range> => ({
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
})

/**
 * A row's `min`/`max` override for `rangeFor`, worked out from the precedence this whole
 * module follows: the row's own values win outright if it set either; failing that, the
 * card's own defaults; failing that, `undefined`, which tells `rangeFor` there is no
 * override at all and to derive a range off the entity itself.
 *
 * Not "does the row have a `min`", checked separately from "does it have a `max`": a
 * `min` with no `max` is exactly the "one end invented" shape `rangeFor` already refuses,
 * so the two are read as one pair, taken entirely from whichever of row-then-defaults set
 * either half, and left to `rangeFor` to accept or reject together.
 */
const rangeOverride = (
  row: ComplicationEntityConfig,
  defaults: ComplicationDefaults,
): Partial<Range> | undefined => {
  if (row.min !== undefined || row.max !== undefined) return pairOf(row.min, row.max)
  if (defaults.min !== undefined || defaults.max !== undefined) {
    return pairOf(defaults.min, defaults.max)
  }
  return undefined
}

/**
 * Every configured row, turned into what the render functions draw.
 *
 * The whole of the card's contact with `hass`: everything past this function reads a
 * `Complication` and nothing else, the same shape whether the entity behind it is a
 * cheerful battery reading 72% or a sensor that has not reported since last Tuesday.
 */
export const readComplications = (
  hass: HomeAssistant,
  entities: unknown,
  defaults: ComplicationDefaults,
): Complication[] =>
  entityConfigs(entities).map(row => {
    const entity = hass.states[row.entity]

    if (!entity) {
      return {
        id: row.entity,
        name: row.name ?? row.entity,
        icon: row.icon ?? 'mdi:eye',
        value: VALUE_DASH,
        numeric: null,
        range: null,
        fraction: null,
        supporting: null,
        tint: row.color ?? defaults.color ?? 'accent',
        unavailable: true,
      }
    }

    const unavailable = UNAVAILABLE.has(entity.state)
    const numeric = unavailable ? null : numberOf(entity.state)
    const range = unavailable ? null : rangeFor(entity, rangeOverride(row, defaults))

    return {
      id: entity.entity_id,
      name: row.name ?? entity.attributes.friendly_name ?? entity.entity_id,
      icon: row.icon ?? iconFor(entity),
      value: unavailable ? VALUE_DASH : formatValue(hass, entity),
      numeric,
      range,
      fraction: range && numeric !== null ? fractionOf(numeric, range) : null,
      supporting: unavailable ? null : supportingFor(entity),
      tint: row.color ?? defaults.color ?? tintFor(entity),
      unavailable,
    }
  })
