/**
 * What a room is doing, in a few words: the status line under a room in Apple's Home app.
 *
 * "Door Open · Occupied · 72° · 2 Lights On", worked out from whatever Home Assistant has put
 * in the area, so a room tile needs `area: kitchen` and nothing else. The tiles card's
 * `area` key draws the text; the room header card draws the same items as a row of glyphs.
 * Both read `areaSummary`, so the two can never disagree about what a room is doing.
 *
 * ## What counts as in a room
 *
 * Home Assistant's own rule: an entity's area if it has one, otherwise its device's. Hidden
 * entities and those with an `entity_category` (config, diagnostic) are left out, the same
 * entities the area card leaves out, because a firmware-update switch is not a light that is on.
 *
 * ## The order
 *
 * The Home app's: what needs attention first (a leak, an open door, an unlocked lock), then who
 * is there, then the climate, then what is merely on. The parts a summary shows, and in which
 * order, are the card's `summary` list; `DEFAULT_SUMMARY_PARTS` is the Home app's own choice.
 *
 * ## The temperature
 *
 * The tile's chosen sensor, then the one chosen in the area's own settings (`temperature_entity_id`,
 * Home Assistant 2025.5 and later), and never a guess; `climateSensor` has why. Rounded to a whole
 * degree and written `72°`, without the unit, as the Home app writes it: a room's temperature is
 * a glance, not a reading, and the unit is the same in every room of one house.
 */

import { iconFor, isUnavailable, nameFor, numberOf } from './entity-view'
import { isTemplate, truthy } from './templates'
import { colorValue, tintFor, tintVar } from './tint'
import type { HassEntity, HomeAssistant } from './types/ha'
import { isOneOf } from './one-of'

export const SUMMARY_PARTS = [
  'alerts',
  'open',
  'locks',
  'occupancy',
  'climate',
  'temperature',
  'humidity',
  'lights',
  'media',
] as const

export type SummaryPart = (typeof SUMMARY_PARTS)[number]

/** The Home app's own room line: no humidity, no media, nothing about the thermostat. */
export const DEFAULT_SUMMARY_PARTS: readonly SummaryPart[] = [
  'alerts',
  'open',
  'locks',
  'occupancy',
  'temperature',
  'lights',
]

export const SUMMARY_SEPARATOR = ' · '

/**
 * One of the user's own icons for a room (`extras`): an entity, how it looks, and when it shows.
 * Drawn after the built-in parts, in the order they are listed, wherever the summary is drawn:
 * a glyph on a room tile under `summary_style: icons`, words on its state line otherwise, a
 * pill in a room chip row and on the room card.
 */
export interface RoomExtra {
  /** What it is about: read for `state`, opened by a press on a room chip. */
  entity?: string
  icon?: string
  /** A palette name or any CSS colour. The entity's own tint when absent. */
  color?: string
  /**
   * The state, or comma-separated states, it shows in. Without one it shows while the entity is
   * active: anything but off, closed, locked, idle, standby, paused, away, unavailable, unknown.
   */
  state?: string
  /** A template, read with `show`'s rule; when given it decides alone, over `state`. */
  show?: string
  /** Its words: the summary's text and what a screen reader hears. The entity's name if absent. */
  name?: string
  /** A few characters drawn beside the glyph, where a count would go ("2h", "Low"). */
  text?: string
}

/**
 * The keys every room (tile, chip row, room card) is configured by. Each card's config extends
 * this rather than repeating it, so a room key added here reaches all three.
 */
export interface RoomKeys {
  /**
   * A Home Assistant area id. With no entity, it makes a tile a room tile and a chip a room row;
   * it is the whole point of the room card.
   */
  area?: string
  /** Which facts the room shows, in order. `DEFAULT_SUMMARY_PARTS` when absent. */
  summary?: string[]
  /** The sensor the room's temperature is read from, over the area's own choice. */
  temperature_entity?: string
  /** The same, for the humidity part. */
  humidity_entity?: string
  /** Entities in the area that never count: the garage door that is always open. */
  exclude?: string[]
  /** Entities elsewhere that count as the room's, classified by the same rules. */
  include?: string[]
  /** The user's own icons, after the built-in parts. */
  extras?: RoomExtra[]
}

/** `RoomKeys`'s keys, as a list: for copying a room out of a larger config. */
export const ROOM_KEYS = [
  'area',
  'summary',
  'temperature_entity',
  'humidity_entity',
  'exclude',
  'include',
  'extras',
] as const satisfies readonly (keyof RoomKeys)[]

/** Just the room keys of a config, each copied only when it is set. */
export const roomKeysOf = (config: RoomKeys): RoomKeys => {
  const room: Record<string, unknown> = {}
  for (const key of ROOM_KEYS) {
    const value = config[key]
    if (value !== undefined && value !== null && value !== '') room[key] = value
  }
  return room as RoomKeys
}

/** A built-in part, or one of the user's own icons. */
export type SummaryItemPart = SummaryPart | 'custom'

/** One fact about a room: its words, a glyph for the room header, and the entities behind it. */
export interface SummaryItem {
  part: SummaryItemPart
  text: string
  icon: string
  /** What a press on this item should open: the one entity, or the first of several. */
  entities: string[]
  /** Something to look at now (a leak, a jammed lock): drawn in red by the room header. */
  alert: boolean
  /** A user's own icon's colour, as CSS; built-in parts are tinted by the card that draws them. */
  color?: string
  /** A user's own icon's few characters, drawn where a count would go. */
  badge?: string
}

/** How a card hands a template's result to the summary; see `TemplateResolver` in chips. */
export type SummaryResolver = (template: string, entity?: string) => string | undefined

export interface AreaSummaryOptions {
  parts?: readonly SummaryPart[] | undefined
  /** Overrides the area's own chosen sensor, and the mean. */
  temperatureEntity?: string | undefined
  humidityEntity?: string | undefined
  exclude?: readonly string[] | undefined
  include?: readonly string[] | undefined
  extras?: readonly RoomExtra[] | undefined
  /** Reads an extra's templates; without one, a templated field reads as unanswered. */
  resolve?: SummaryResolver | undefined
}

const ALERT_CLASSES: Record<string, string> = {
  moisture: 'Leak',
  smoke: 'Smoke',
  gas: 'Gas',
  carbon_monoxide: 'CO',
  safety: 'Unsafe',
  tamper: 'Tampered',
}

const ALERT_ICONS: Record<string, string> = {
  moisture: 'mdi:water-alert',
  smoke: 'mdi:smoke-detector-alert',
  gas: 'mdi:gas-cylinder',
  carbon_monoxide: 'mdi:molecule-co',
  safety: 'mdi:alert',
  tamper: 'mdi:shield-alert',
}

/** Binary sensors and covers that open, by what the Home app calls them. */
const OPENING_KINDS: Record<string, string> = {
  door: 'Door',
  garage_door: 'Garage',
  garage: 'Garage',
  gate: 'Gate',
  window: 'Window',
}

const domainOf = (id: string): string => id.slice(0, id.indexOf('.'))
const deviceClass = (entity: HassEntity): string | undefined =>
  typeof entity.attributes.device_class === 'string' ? entity.attributes.device_class : undefined

type AreaMap = ReadonlyMap<string, readonly string[]>

const NO_ENTITIES = {}
/** One map per entity registry, remembered with the device registry it was built against. */
const areaMaps = new WeakMap<object, { devices: unknown; map: AreaMap }>()

/**
 * Every area's entity ids, from one pass over the entity registry, sorted. Remembered for as long
 * as the entity and device registries are the same objects: Home Assistant replaces them when
 * they change, and a state push alone leaves them be, so a dashboard of rooms reads the
 * registry once per edit rather than once per room per push.
 */
const areaMapFor = (hass: HomeAssistant): AreaMap => {
  const entities = hass.entities ?? NO_ENTITIES
  const devices = hass.devices
  const cached = areaMaps.get(entities)
  if (cached && cached.devices === devices) return cached.map
  const map = new Map<string, string[]>()
  for (const [id, entry] of Object.entries(hass.entities ?? {})) {
    if (entry.hidden || entry.entity_category) continue
    const deviceArea =
      entry.device_id !== undefined && entry.device_id !== null
        ? devices?.[entry.device_id]?.area_id
        : undefined
    const area = entry.area_id ?? deviceArea
    if (area === undefined || area === null) continue
    const list = map.get(area)
    if (list) list.push(id)
    else map.set(area, [id])
  }
  for (const list of map.values()) list.sort()
  areaMaps.set(entities, { devices, map })
  return map
}

/**
 * Every entity id in an area, by Home Assistant's own rule: the entity's area, or its device's
 * when it has none of its own. Sorted, so the order of a mean or of "the first one" is stable.
 * Only entities with a state: the registry part is remembered (`areaMapFor`), this part is not.
 */
export const areaEntityIds = (hass: HomeAssistant, areaId: string): string[] =>
  areaRegistryIds(hass, areaId).filter(id => hass.states[id] !== undefined)

/**
 * The same, with or without a state: what a card watches. One with no state yet is watched
 * all the same, so its first state repaints the room, and the list depends on the registries
 * alone, which lets a card remember it until they change (`Memo`).
 */
export const areaRegistryIds = (hass: HomeAssistant, areaId: string): readonly string[] =>
  areaMapFor(hass).get(areaId) ?? []

/**
 * One value, remembered for as long as every key it was computed from is the same object.
 * What a card keeps its watched ids and its floor key in, keyed on its config and on the
 * registries, so neither is rebuilt on a state push that changes neither.
 */
export class Memo<T> {
  private _keys: readonly unknown[] | undefined
  private _value: T | undefined

  public get(keys: readonly unknown[], compute: () => T): T {
    const last = this._keys
    if (
      last !== undefined &&
      last.length === keys.length &&
      last.every((key, index) => key === keys[index])
    ) {
      return this._value as T
    }
    const value = compute()
    this._keys = keys
    this._value = value
    return value
  }
}

/** The registries a room is read against: the keys a room card's `Memo` includes. */
export const registriesOf = (hass: HomeAssistant | undefined): readonly unknown[] => [
  hass === undefined,
  hass?.entities,
  hass?.devices,
  hass?.areas,
]

/** "Light On", "2 Lights On": the Home app's count, title case like the rest of its labels. */
const counted = (count: number, noun: string, tail: string): string =>
  count === 1 ? `${noun} ${tail}` : `${count} ${noun}s ${tail}`

/**
 * The one sensor a room's temperature or humidity comes from: the tile's choice, then the area's
 * own (its settings in Home Assistant, 2025.5 and later), and nothing else.
 *
 * Not a guess from the room's sensors. Tried, against a real house: a kitchen holds the fridge
 * and the freezer, a den holds a PC's and a router's chip temperatures, a mud room holds the
 * litter robot, and neither the mean nor the median of those is a room. A summary that says
 * nothing about the temperature is better than one that says 32° in a heated room.
 */
const climateSensor = (hass: HomeAssistant, chosen: string | null | undefined) => {
  const pick = chosen ? hass.states[chosen] : undefined
  if (!pick || isUnavailable(pick)) return undefined
  const value = numberOf(pick.state)
  return value === null ? undefined : { entity: pick, value }
}

const ids = (entities: readonly HassEntity[]): string[] => entities.map(entity => entity.entity_id)

/** One part's item, or nothing when the room has nothing to say about it. */
const itemFor = (
  hass: HomeAssistant,
  part: SummaryPart,
  entities: readonly HassEntity[],
  areaId: string,
  options: AreaSummaryOptions,
): SummaryItem | undefined => {
  const live = entities.filter(entity => !isUnavailable(entity))
  const binary = (classes: readonly string[]) =>
    live.filter(
      entity =>
        domainOf(entity.entity_id) === 'binary_sensor' &&
        entity.state === 'on' &&
        classes.includes(deviceClass(entity) ?? ''),
    )

  switch (part) {
    case 'alerts': {
      const firing = binary(Object.keys(ALERT_CLASSES))
      const jammed = live.filter(e => domainOf(e.entity_id) === 'lock' && e.state === 'jammed')
      if (firing.length === 0 && jammed.length === 0) return undefined
      const words = [
        ...new Set(firing.map(entity => ALERT_CLASSES[deviceClass(entity) ?? ''] ?? 'Alert')),
        ...(jammed.length > 0 ? ['Lock Jammed'] : []),
      ]
      const first = firing[0]
      return {
        part,
        text: words.join(SUMMARY_SEPARATOR),
        icon: first ? (ALERT_ICONS[deviceClass(first) ?? ''] ?? 'mdi:alert') : 'mdi:lock-alert',
        entities: ids([...firing, ...jammed]),
        alert: true,
      }
    }

    case 'open': {
      const open = [
        // `opening` is the generic class many window and door contacts report: counted, but
        // with no noun of its own, so a room of them reads "Open" rather than "Opening Open".
        ...binary([...Object.keys(OPENING_KINDS), 'opening']),
        ...live.filter(
          entity =>
            domainOf(entity.entity_id) === 'cover' &&
            (entity.state === 'open' || entity.state === 'opening') &&
            OPENING_KINDS[deviceClass(entity) ?? ''] !== undefined,
        ),
      ]
      if (open.length === 0) return undefined
      // `undefined` stands for the nounless `opening` class, and is a kind of its own.
      const kinds = new Set(open.map(entity => OPENING_KINDS[deviceClass(entity) ?? '']))
      const [kind] = kinds
      const text =
        kinds.size === 1 && kind !== undefined
          ? counted(open.length, kind, 'Open')
          : open.length === 1
            ? 'Open'
            : `${open.length} Open`
      return {
        part,
        text,
        icon: kinds.size === 1 && kind === 'Window' ? 'mdi:window-open-variant' : 'mdi:door-open',
        entities: ids(open),
        alert: false,
      }
    }

    case 'locks': {
      const unlocked = live.filter(
        entity =>
          domainOf(entity.entity_id) === 'lock' &&
          (entity.state === 'unlocked' || entity.state === 'open' || entity.state === 'opening'),
      )
      if (unlocked.length === 0) return undefined
      return {
        part,
        text: unlocked.length === 1 ? 'Unlocked' : `${unlocked.length} Unlocked`,
        icon: 'mdi:lock-open-variant',
        entities: ids(unlocked),
        alert: false,
      }
    }

    case 'occupancy': {
      const present = binary(['occupancy', 'presence'])
      const motion = binary(['motion'])
      if (present.length === 0 && motion.length === 0) return undefined
      return {
        part,
        text: present.length > 0 ? 'Occupied' : 'Motion',
        icon: present.length > 0 ? 'mdi:account' : 'mdi:motion-sensor',
        entities: ids(present.length > 0 ? present : motion),
        alert: false,
      }
    }

    case 'climate': {
      const running = live.filter(
        entity =>
          domainOf(entity.entity_id) === 'climate' &&
          ['heating', 'cooling', 'drying', 'fan'].includes(String(entity.attributes.hvac_action)),
      )
      const first = running[0]
      if (!first) return undefined
      const action = String(first.attributes.hvac_action)
      const target = numberOf(String(first.attributes.temperature ?? ''))
      const verb = { heating: 'Heating', cooling: 'Cooling', drying: 'Drying', fan: 'Fan' }[action]
      return {
        part,
        text:
          target !== null && (action === 'heating' || action === 'cooling')
            ? `${verb} to ${Math.round(target)}°`
            : (verb ?? 'On'),
        icon:
          action === 'cooling' ? 'mdi:snowflake' : action === 'heating' ? 'mdi:fire' : 'mdi:fan',
        entities: ids(running),
        alert: false,
      }
    }

    case 'temperature':
    case 'humidity': {
      const override = part === 'temperature' ? options.temperatureEntity : options.humidityEntity
      const area = hass.areas?.[areaId]
      const chosen =
        override ??
        (part === 'temperature' ? area?.temperature_entity_id : area?.humidity_entity_id)
      const reading = climateSensor(hass, chosen)
      if (!reading) return undefined
      const rounded = Math.round(reading.value)
      return {
        part,
        text: part === 'temperature' ? `${rounded}°` : `${rounded}%`,
        icon: part === 'temperature' ? 'mdi:thermometer' : 'mdi:water-percent',
        entities: [reading.entity.entity_id],
        alert: false,
      }
    }

    case 'lights': {
      const on = live.filter(
        entity => domainOf(entity.entity_id) === 'light' && entity.state === 'on',
      )
      if (on.length === 0) return undefined
      return {
        part,
        text: counted(on.length, 'Light', 'On'),
        icon: 'mdi:lightbulb-on',
        entities: ids(on),
        alert: false,
      }
    }

    case 'media': {
      const playing = live.filter(
        entity => domainOf(entity.entity_id) === 'media_player' && entity.state === 'playing',
      )
      if (playing.length === 0) return undefined
      return { part, text: 'Playing', icon: 'mdi:play', entities: ids(playing), alert: false }
    }
  }
}

/** The states an extra without a `state` of its own does not show in. */
const QUIET_STATES = new Set([
  'closed',
  'locked',
  'idle',
  'standby',
  'paused',
  'not_home',
  'away',
  'docked',
  'none',
])

/** One of the user's own icons, or nothing while it has nothing to say. */
const extraItem = (
  hass: HomeAssistant,
  extra: RoomExtra,
  resolve: SummaryResolver,
): SummaryItem | undefined => {
  const field = (raw: string | undefined): string | undefined => {
    if (!isTemplate(raw)) return raw
    const result = resolve(raw, extra.entity)
    return result === undefined || result === '' ? undefined : result
  }
  const entity = extra.entity ? hass.states[extra.entity] : undefined
  const shows = (): boolean => {
    if (extra.show !== undefined && extra.show !== '') return truthy(field(extra.show))
    if (!entity) return false
    const wanted = (extra.state ?? '')
      .split(',')
      .map(state => state.trim())
      .filter(state => state !== '')
    return wanted.length > 0
      ? wanted.includes(entity.state)
      : truthy(entity.state) && !QUIET_STATES.has(entity.state)
  }
  if (!shows()) return undefined
  const name = field(extra.name) ?? (entity ? nameFor(entity) : extra.entity) ?? ''
  const badge = field(extra.text)
  const color = colorValue(field(extra.color)) ?? (entity ? tintVar(tintFor(entity)) : undefined)
  return {
    part: 'custom',
    text: badge !== undefined && name !== '' ? `${name} ${badge}` : (badge ?? name),
    icon: field(extra.icon) ?? (entity ? iconFor(entity) : 'mdi:star-four-points'),
    entities: extra.entity ? [extra.entity] : [],
    alert: false,
    ...(color !== undefined ? { color } : {}),
    ...(badge !== undefined ? { badge } : {}),
  }
}

/**
 * Every part that has something to say, in the order the card asked for them, then the user's
 * own icons in theirs. Alerts are moved to the front whatever the order: a leak is the one thing
 * a room says that must never be the last word, or the one folded into a "+2".
 */
export const areaSummary = (
  hass: HomeAssistant | undefined,
  areaId: string,
  options: AreaSummaryOptions = {},
): SummaryItem[] => {
  if (!hass) return []
  const excluded = new Set(options.exclude ?? [])
  // Groups left out: a light group and the lights in it are one lamp counted twice, and a
  // "windows" group sensor is every window it holds opened a second time. The room's own,
  // less what it leaves out, and what it borrows from elsewhere, each once.
  const ids = [...new Set([...areaEntityIds(hass, areaId), ...(options.include ?? [])])]
  const entities = ids.flatMap(id => {
    const entity = excluded.has(id) ? undefined : hass.states[id]
    return entity && !Array.isArray(entity.attributes.entity_id) ? [entity] : []
  })
  const parts = options.parts ?? DEFAULT_SUMMARY_PARTS
  const items = parts.flatMap(part => {
    const item = itemFor(hass, part, entities, areaId, options)
    return item ? [item] : []
  })
  const resolve = options.resolve ?? (() => undefined)
  const extras = (options.extras ?? []).flatMap(extra => {
    const item = extraItem(hass, extra, resolve)
    return item ? [item] : []
  })
  return [
    ...items.filter(item => item.part === 'alerts'),
    ...items.filter(item => item.part !== 'alerts'),
    ...extras,
  ]
}

/** A room's keys as the summary's options, the one translation every room card shares. */
export const roomSummaryOptions = (
  room: RoomKeys,
  resolve?: SummaryResolver,
): AreaSummaryOptions => ({
  parts: summaryPartsFor(room.summary),
  temperatureEntity: room.temperature_entity,
  humidityEntity: room.humidity_entity,
  exclude: entityList(room.exclude),
  include: entityList(room.include),
  extras: roomExtrasFor(room.extras),
  resolve,
})

const entityList = (raw: unknown): string[] | undefined =>
  Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && id.includes('.'))
    : undefined

/** The `extras` list from config: objects only, each field a string or left out. */
export const roomExtrasFor = (raw: unknown): RoomExtra[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const keys = ['entity', 'icon', 'color', 'state', 'show', 'name', 'text'] as const
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const extra: RoomExtra = {}
    for (const key of keys) {
      const value = (item as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.trim() !== '') extra[key] = value.trim()
    }
    return extra.entity !== undefined || extra.show !== undefined ? [extra] : []
  })
}

/** Every template a room's own icons hold, each with the entity it is about. */
export const roomTemplates = (room: RoomKeys): { template: string; entity?: string }[] =>
  (roomExtrasFor(room.extras) ?? []).flatMap(extra =>
    (['icon', 'color', 'show', 'name', 'text'] as const).flatMap(key => {
      const raw = extra[key]
      return isTemplate(raw)
        ? [{ template: raw, ...(extra.entity !== undefined ? { entity: extra.entity } : {}) }]
        : []
    }),
  )

/** The summary as one line, the way a tile's state line draws it. */
export const areaSummaryText = (items: readonly SummaryItem[]): string =>
  items.map(item => item.text).join(SUMMARY_SEPARATOR)

/** A part name from config, or undefined for anything this version does not know. */
export const summaryPartsFor = (raw: unknown): SummaryPart[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  return raw.filter((part): part is SummaryPart => isOneOf(SUMMARY_PARTS, String(part)))
}

/**
 * Every entity a summary of this area reads: the room's own, and the chosen climate sensors,
 * which may sit in another room (a thermostat in the hall that is the bedroom's reading).
 */
export const areaWatchedIds = (
  hass: HomeAssistant,
  areaId: string,
  chosen: readonly (string | undefined)[] = [],
): string[] => {
  const area = hass.areas?.[areaId]
  return [
    ...areaRegistryIds(hass, areaId),
    ...[...chosen, area?.temperature_entity_id, area?.humidity_entity_id].flatMap(id =>
      id ? [id] : [],
    ),
  ]
}

/** What a room reads, its borrowed entities and its own icons' included: what repaints it. */
export const roomWatchedIds = (hass: HomeAssistant, room: RoomKeys): string[] =>
  room.area === undefined
    ? []
    : areaWatchedIds(hass, room.area, [
        room.temperature_entity,
        room.humidity_entity,
        ...(entityList(room.include) ?? []),
        ...(roomExtrasFor(room.extras) ?? []).map(extra => extra.entity),
      ])
