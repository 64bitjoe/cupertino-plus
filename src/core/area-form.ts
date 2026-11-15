/**
 * The rows an editor panel draws for a room: the area, which facts to show, and the two
 * sensors. Shared by the tile panel, the chip panel and the room card, so a room is set up the
 * same way wherever it appears.
 */

import {
  areaEntityIds,
  DEFAULT_SUMMARY_PARTS,
  roomExtrasFor,
  SUMMARY_PARTS,
  summaryPartsFor,
  type RoomKeys,
  type SummaryPart,
} from './area-summary'
import { tintLabel, TINTS } from './tint'
import type { HaFormSchema, HomeAssistant, ObjectSelector } from './types/ha'

const SUMMARY_LABELS: Record<SummaryPart, string> = {
  alerts: 'Alerts: leak, smoke, a jammed lock',
  open: 'Doors and windows open',
  locks: 'Unlocked',
  occupancy: 'Occupied or motion',
  climate: 'Heating or cooling',
  temperature: 'Temperature',
  humidity: 'Humidity',
  lights: 'Lights on',
  media: 'Playing',
}

/**
 * How a room tile tells its summary (`summary_style`, `tiles/glyphs.ts`). Spelled out here
 * rather than imported, so the shared form does not reach into one card; the tiles model reads
 * the key with `summaryStyleFor`, which falls back to `words` for anything else.
 */
const STYLE_OPTIONS = [
  { value: 'words', label: 'Words' },
  { value: 'icons', label: 'Icons' },
]

/**
 * A room's own icons, as Home Assistant's object selector: one line per icon with a drag
 * handle (the order they are drawn in), each edited in a small dialog. The colour is the
 * palette with a CSS colour allowed, as everywhere else in the library.
 */
const EXTRAS_SELECTOR: ObjectSelector = {
  object: {
    multiple: true,
    label_field: 'entity',
    description_field: 'name',
    fields: {
      entity: {
        label: 'Entity',
        selector: { entity: {} },
        description: 'What it is about. A press on its chip opens it.',
      },
      icon: {
        label: 'Icon',
        selector: { icon: {} },
        description: "Leave empty for the entity's own.",
      },
      color: {
        label: 'Colour',
        selector: {
          select: {
            mode: 'dropdown',
            custom_value: true,
            options: TINTS.map(value => ({ value, label: tintLabel(value) })),
          },
        },
        description: "A colour from the list, or type any CSS colour. Empty for the entity's own.",
      },
      state: {
        label: 'Shows when the state is',
        selector: { text: { placeholder: 'open, on' } },
        description:
          'One state, or several with commas. Leave empty to show while it is on, open, unlocked or playing.',
      },
      show: {
        label: 'Or shows when (template)',
        selector: { text: { placeholder: "{{ states('sensor.a') | int > 2 }}" } },
        description: 'A template. When filled in, it decides alone.',
      },
      name: {
        label: 'Words',
        selector: { text: {} },
        description:
          "What it says in a line of words, and what VoiceOver reads. The entity's name if empty.",
      },
      text: {
        label: 'Short text',
        selector: { text: { placeholder: '2h' } },
        description: 'A few characters beside the icon, where a count would go. May be a template.',
      },
    },
  },
}

/**
 * The area, and once there is one, which facts it shows, in what order, which entities count,
 * the user's own icons, and which sensors give its climate.
 *
 * The facts are a reorderable multi-select, Home Assistant's chips with drag handles, rather
 * than the checkbox list they started as: a checkbox list reports clicks in click order and
 * shows none, so it cannot say "lights before the temperature". Alerts still go first, which
 * the helper says.
 *
 * Leave out offers only the room's own entities when `hass` is to hand, since nothing else
 * could be left out of it; Also count offers everything but them.
 *
 * `style` adds the tile's own choice between a line of words and a row of glyphs, after the
 * facts it applies to. Only the tile panel asks for it: a chip row and the room card already
 * draw each fact as a pill of its own.
 */
export const roomRows = (
  data: Record<string, unknown>,
  { style = false, hass }: { style?: boolean; hass?: HomeAssistant | undefined } = {},
): HaFormSchema[] => {
  const area = typeof data.area === 'string' && data.area !== '' ? data.area : undefined
  if (area === undefined) return [{ name: 'area', selector: { area: {} } }]
  const own = hass ? areaEntityIds(hass, area) : undefined
  return [
    { name: 'area', selector: { area: {} } },
    {
      name: 'summary',
      selector: {
        select: {
          multiple: true,
          reorder: true,
          options: SUMMARY_PARTS.map(value => ({ value, label: SUMMARY_LABELS[value] })),
        },
      },
    },
    ...(style
      ? [
          {
            name: 'summary_style',
            selector: { select: { mode: 'dropdown' as const, options: STYLE_OPTIONS } },
          },
        ]
      : []),
    { name: 'extras', selector: EXTRAS_SELECTOR },
    {
      name: 'exclude',
      selector: {
        entity: { multiple: true, ...(own !== undefined ? { include_entities: own } : {}) },
      },
    },
    {
      name: 'include',
      selector: {
        entity: { multiple: true, ...(own !== undefined ? { exclude_entities: own } : {}) },
      },
    },
    {
      name: 'temperature_entity',
      selector: { entity: { filter: { domain: 'sensor', device_class: 'temperature' } } },
    },
    {
      name: 'humidity_entity',
      selector: { entity: { filter: { domain: 'sensor', device_class: 'humidity' } } },
    },
  ]
}

const LABELS: Record<string, string> = {
  area: 'Room',
  summary: 'Show',
  summary_style: 'Show them as',
  extras: 'Your own icons',
  exclude: 'Leave out',
  include: 'Also count',
  temperature_entity: 'Temperature sensor',
  humidity_entity: 'Humidity sensor',
}

export const roomLabel = (name: string): string | undefined => LABELS[name]

/**
 * Helper text, worded for what the room is drawn as: a tile's one state line, or a row of chips.
 */
export const roomHelper = (name: string, as: 'tile' | 'chips'): string | undefined => {
  switch (name) {
    case 'area':
      return as === 'tile'
        ? 'Makes this a room tile: its name, icon and state line come from the room. For a tile with no entity.'
        : 'Makes this a room row: one chip for each thing the room has to say. For a chip with no entity.'
    case 'summary':
      return as === 'tile'
        ? 'Each is shown only while it has something to say, in the order here: drag to reorder. Alerts always come first. A Reading, under Use templates, is added after them.'
        : 'Each is a chip, shown only while it has something to say, in the order here: drag to reorder. Alerts always come first. Pressing one opens what it is about.'
    case 'extras':
      return as === 'tile'
        ? 'Icons of your own, after the ones above: an entity, an icon and a colour, shown in a state you choose. Written as words when Show them as is Words.'
        : 'Chips of your own, after the ones above: an entity, an icon and a colour, shown in a state you choose.'
    case 'exclude':
      return "Things in this room that should never count, like a garage door that is always open. Only the room's own are offered."
    case 'include':
      return 'Things in other rooms that should count as this one, like the hall lock for the entrance. Counted by the same rules.'
    case 'summary_style':
      return 'Words puts everything on the state line. Icons keeps temperature, humidity and the Reading there, and draws the rest as small status icons under it, with a count where there is more than one.'
    case 'temperature_entity':
      return "Leave empty to use the one chosen in the area's settings in Home Assistant. With neither, temperature is left out."
    case 'humidity_entity':
      return 'The same for humidity, which is only shown when it is ticked above.'
    default:
      return undefined
  }
}

/** The room's fields, as a panel shows them: the default facts ticked for a room never changed. */
export const roomToForm = (config: RoomKeys): Record<string, unknown> => ({
  area: config.area,
  summary: config.summary ?? (config.area !== undefined ? [...DEFAULT_SUMMARY_PARTS] : undefined),
  extras: config.extras,
  exclude: config.exclude,
  include: config.include,
  temperature_entity: config.temperature_entity,
  humidity_entity: config.humidity_entity,
})

const idsOf = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
  return ids.length > 0 ? ids : undefined
}

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const sameParts = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((part, index) => part === b[index])

/**
 * The room's keys from a panel's answer, each written only when it says something: no `summary`
 * while it is the default list, so a room left alone carries no key for it. The parts keep the
 * order the panel reports, which is the order the user dragged them into.
 */
export const roomFromForm = (data: Record<string, unknown>): RoomKeys => {
  const next: RoomKeys = {}
  const area = textOf(data.area)
  if (area === undefined) return next
  next.area = area
  const parts = summaryPartsFor(data.summary)
  if (parts !== undefined && !sameParts(parts, DEFAULT_SUMMARY_PARTS)) next.summary = parts
  const extras = roomExtrasFor(data.extras)
  if (extras !== undefined && extras.length > 0) next.extras = extras
  const exclude = idsOf(data.exclude)
  if (exclude !== undefined) next.exclude = exclude
  const include = idsOf(data.include)
  if (include !== undefined) next.include = include
  const temperature = textOf(data.temperature_entity)
  if (temperature !== undefined) next.temperature_entity = temperature
  const humidity = textOf(data.humidity_entity)
  if (humidity !== undefined) next.humidity_entity = humidity
  return next
}
