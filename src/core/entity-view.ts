/**
 * Reading one Home Assistant entity the way every card in this library reads one.
 *
 * These started life inside `complication/model.ts` and moved here the moment a second card
 * needed them, which is the same test §10 of the family spec sets and the same one that moved
 * `ring.ts`. What stayed behind is what is genuinely about complications: ranges, tints, and
 * the supporting line. What came here is the part any card asking "what does this entity look
 * like" needs — and it is worth one module rather than two copies, because the copies would
 * drift on exactly the details nobody re-derives: which icon a `device_class` deserves, and
 * whether a unit takes a space.
 */

import type { HassEntity, HomeAssistant } from './types/ha'

/**
 * The least a configured row can be: an entity id, and the two overrides every card offers.
 * Cards extend it with their own (`ComplicationEntityConfig` adds a range and a colour;
 * `ChipConfig` adds a content mode and a tap action), which is why `entityRows` is generic.
 */
export interface EntityRow {
  entity: string
  name?: string
  icon?: string
}

export const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown'])

/** Not localised, like the rest of the library's own marks. */
export const VALUE_DASH = '—'

/** Whether an entity is present but not currently reporting. */
export const isUnavailable = (entity: HassEntity): boolean => UNAVAILABLE_STATES.has(entity.state)

/**
 * The rows the config asked for, in the order it asked for them, forgiving of every shape a
 * hand-written config can take. (Moved from `complication/model.ts`'s `entityConfigs`; see
 * that function's original reasoning, preserved below.)
 *
 * A card config is not typechecked on its way in, so `entities: sensor.phone` — a bare scalar
 * where a list was meant — is what somebody writes first, and it is worth reading as
 * `['sensor.phone']` rather than rejecting. Equally, a row with no usable `entity` is worth
 * skipping rather than crashing the whole card over one bad line.
 *
 * Generic in the row type, and unchecked beyond `entity`: the cast is the same trust the
 * original made, and each card's own reader is what decides whether the rest of a row means
 * anything.
 */
export const entityRows = <T extends EntityRow = EntityRow>(entities: unknown): T[] => {
  if (!entities) return []
  const list = Array.isArray(entities) ? entities : [entities]

  return list.flatMap(row => {
    if (typeof row === 'string') return [{ entity: row } as T]
    if (row && typeof row === 'object' && typeof (row as EntityRow).entity === 'string') {
      return [row as T]
    }
    return []
  })
}

/** Every entity id a card's rendering depends on: what `watchedEntities()` answers with. */
export const watchedIds = (entities: unknown): string[] =>
  entityRows(entities).map(row => row.entity)

/** The name to draw and to announce: the entity's own, falling back to its id. */
export const nameFor = (entity: HassEntity): string => {
  const friendly = entity.attributes.friendly_name
  return typeof friendly === 'string' && friendly !== '' ? friendly : entity.entity_id
}

/**
 * A state string read as a finite number, or `null`.
 *
 * `Number('')` is `0`, which is a real reading and not the "not a number" this function
 * exists to catch, hence the explicit blank check ahead of it; `Number('unavailable')` and
 * `Number('unknown')` are already `NaN` and need no special-casing here at all.
 */
export const numberOf = (raw: string): number | null => {
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
export const iconFor = (entity: HassEntity): string => {
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
 * The units that sit tight against the numeral rather than a space away from it.
 *
 * The frontend's own rule, and it is about the glyph rather than about the dimension: `%` and
 * the degree sign are read as part of the number, where `W` or `hPa` are a separate word. The
 * original of this function tested `unit === '%'` alone, so every temperature in the library
 * rendered as `21.4 °C` — a review finding deferred on the complication card, fixed here
 * rather than copied into a second one. Anchored at the start because a unit is `°C`, `°F`
 * or a bare `°`, never something ending in one.
 */
const TIGHT_UNITS = /^[%°]/

/**
 * The reading, formatted the way the frontend would.
 *
 * A number goes through `Intl.NumberFormat` in the user's language, honouring the
 * decimals they pinned in the entity registry (`display_precision`) when they pinned
 * any, and capped at two otherwise so a sensor reporting `21.399999999` does not spill
 * past what anyone asked to see; `%` and the degree sign are set tight against the
 * numeral and every other unit gets a space, which is the frontend's own rule.
 *
 * A state that is not a number (`heat`, `playing`, `locked`, …) is asked of
 * `hass.localize` under the key core's own entity-state translations live at, device
 * class first because it is the more specific string, then the domain's generic one; and
 * it falls back to the raw state, capitalised, because `localize` answers `''` for a key
 * it does not have rather than throwing. That key shape is recorded, and its verification
 * status, in `docs/ha-api-notes.md` under "Entity state strings" — read that before
 * trusting it against a state string this table has not been checked against.
 */
export const formatValue = (hass: HomeAssistant, entity: HassEntity): string => {
  const numeric = numberOf(entity.state)
  const unit = entity.attributes.unit_of_measurement

  if (numeric !== null) {
    const precision = hass.entities?.[entity.entity_id]?.display_precision
    const formatted = new Intl.NumberFormat(hass.locale?.language, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision ?? 2,
    }).format(numeric)

    if (typeof unit !== 'string' || unit === '') return formatted
    return TIGHT_UNITS.test(unit) ? `${formatted}${unit}` : `${formatted} ${unit}`
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

  // The raw state, readably: HA's state strings are snake_case (`not_home`, `cleaning`,
  // …), and this is the fallback for whenever the localize key above misses — plausibly
  // the path most users actually see it on, since the key shape is recorded as unverified
  // (see the comment above). Capitalising alone leaves the underscores in, so `not_home`
  // — exactly what a `person`/`device_tracker` away from home reads, one of the more
  // common states to land here — rendered as `Not_home` rather than `Not home`.
  const readable = entity.state.replace(/_/g, ' ')
  return readable.charAt(0).toUpperCase() + readable.slice(1)
}
