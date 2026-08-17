/**
 * What the showcase knows about the widgets it shows.
 *
 * One entry per card in the library, and the sidebar is that list. A card that is not
 * in here does not exist as far as the site is concerned, so adding a widget means
 * adding an entry: the shell, the routing, the controls table and the YAML pane all
 * read from this and need no further help.
 *
 * The split that matters is between `toConfig` and `toFixture`. `toConfig` is the
 * config a real dashboard would hold, which is why the Config tab can print it
 * verbatim and tell the visitor to paste it. `toFixture` is the preview-only keys that
 * make the page show something on a machine with no Home Assistant behind it, and it is
 * applied last precisely because it must never end up in that YAML.
 */

import {
  mdiBatteryHigh,
  mdiCalendarMonth,
  mdiFormatListChecks,
  mdiGaugeLow,
  mdiRhombusOutline,
  mdiWeatherPartlyCloudy,
} from '@mdi/js'

import { DEMO_SCENARIOS, DEFAULT_DEMO_SCENARIO } from '../../src/cards/calendar/demo-data'
import {
  CHIP_CONTENTS,
  DEFAULT_CONTAINER,
  DEFAULT_CONTENT,
  type ChipContent,
  type ChipsContainer,
} from '../../src/cards/chips/model'
import {
  COMPLICATION_STYLES,
  DEFAULT_STYLE,
  STYLE_LABELS,
  type ComplicationStyle,
} from '../../src/cards/complication/style'
import {
  BATTERY_CARD_TAG,
  CALENDAR_CARD_TAG,
  CHIPS_CARD_TAG,
  COMPLICATION_CARD_TAG,
  WEATHER_CARD_TAG,
} from '../../src/index'
import { DEFAULT_DEVICE_SET, DEVICE_SETS, deviceSet } from '../battery-devices'
import { CHIP_SETS, DEFAULT_CHIP_SET, chipSet } from '../chip-fixtures'
import { DEFAULT_ENTITY_SET, ENTITY_SETS, entitySet } from '../complication-entities'
import { DEFAULT_WEATHER_SET, WEATHER_SETS, weatherEntity } from '../weather-fixtures'
import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_FIELD,
  SCALE_LABEL,
  SCALE_STEP,
} from '../../src/core/scale'
import type { LovelaceCardConfig } from '../../src/core/types/ha'

// ---- Control values ----------------------------------------------------------

export type ArgValue = string | readonly string[] | number
export type Args = Readonly<Record<string, ArgValue>>

/**
 * Which half of the controls panel a knob belongs in: the card's own options, or the
 * Home Assistant the page is standing in for. That is the only question a visitor has:
 * which of these survive installation.
 */
export type ControlGroup = 'card' | 'preview'

interface ControlBase {
  name: string
  /** First column of the controls table. */
  label: string
  /**
   * Second column: one line, in the interface's voice, about what the control does.
   *
   * Optional, for the control whose label already says it, because a line that only repeats
   * the label is noise in a table read top to bottom.
   */
  description?: string
  group: ControlGroup
  /**
   * Why this control is currently inert, if it is.
   *
   * A control that visibly does nothing is worse than one that says why; picking
   * calendars while the preview is drawing a fixture changes nothing, and a visitor
   * who does not know that concludes the picker is broken.
   */
  inert?(args: Args): string | undefined
}

export interface SelectControl extends ControlBase {
  kind: 'select'
  options: readonly { value: string; label: string }[]
  initial: string
}

export interface RangeControl extends ControlBase {
  kind: 'range'
  min: number
  max: number
  step: number
  unit: string
  initial: number
}

export type Control = SelectControl | RangeControl

export const readString = (args: Args, name: string, fallback: string): string => {
  const value = args[name]
  return typeof value === 'string' ? value : fallback
}

export const readNumber = (args: Args, name: string, fallback: number): number => {
  const value = args[name]
  return typeof value === 'number' ? value : fallback
}

export const readList = (args: Args, name: string): readonly string[] => {
  const value = args[name]
  return Array.isArray(value) ? (value as readonly string[]) : []
}

// ---- Widgets -----------------------------------------------------------------

export interface Widget {
  /** Route segment, and the key everything else is filed under. */
  id: string
  name: string
  /** One line under the name, at the top of the canvas. */
  tagline: string
  /** An MDI path, for the sidebar. The same icon set Home Assistant draws itself with. */
  icon: string
  /** The custom element the cards are made of. */
  tag: string
  /** The card's own options, as rows of the Controls table. `CARD_OPTIONS` joins them. */
  props: readonly Control[]
  /**
   * This widget's half of the config a real dashboard would hold; `widgetConfig` adds the
   * half every card shares. Goes into the Config tab as it comes.
   */
  toConfig(args: Args): Partial<LovelaceCardConfig>
  /**
   * Preview-only keys, spread last so a panel that pins its own config down still
   * draws whatever data the inspector is pointing at. Empty when the preview is live.
   */
  toFixture(args: Args): Partial<LovelaceCardConfig>
}

/**
 * The one Data option that is not a fixture.
 *
 * Every other option sets `demo_scenario`, which hands the card a ready-made
 * `CalendarItem[]` and exercises the layout rules. This one leaves the key off, which is
 * what a real dashboard looks like, so the card resolves `entities` and `todo_entities`,
 * opens both subscriptions over `mock-hass`'s websocket, and runs both wire mappers on the
 * way in. The only option that would have caught the card drawing fixtures in Home
 * Assistant, and the only one where an undated to-do can be seen not being drawn.
 */
export const LIVE_DATA = 'live'

/**
 * Readable names for the fixtures.
 *
 * `demo-data.ts` names its scenarios for the branch each one exercises, which is right
 * for a test fixture and reads like a bug tracker in a dropdown. A scenario with no
 * entry here still appears (its key is title-cased), so this can never be the reason a
 * new fixture is invisible.
 */
const SCENARIO_LABELS: Record<string, string> = {
  default: 'A normal day',
  'today-empty': 'Nothing on today',
  'today-done': 'Today is over',
  'one-event': 'A single event',
  'two-events': 'Two events',
  'three-events': 'Three events',
  'more-events': 'More than fits',
  reminders: 'Reminders and events',
  'all-day': 'An all-day event',
  'all-day-busy': 'All-day, on a busy day',
  'skip-empty-day': 'Tomorrow is empty',
  empty: 'Nothing at all',
}

const titleCase = (key: string): string =>
  key.replace(/-/g, ' ').replace(/^./, first => first.toUpperCase())

const DATA_OPTIONS = [
  { value: LIVE_DATA, label: 'Live: from Home Assistant' },
  ...DEMO_SCENARIOS.map(key => ({ value: key, label: SCENARIO_LABELS[key] ?? titleCase(key) })),
]

const calendar: Widget = {
  id: 'calendar',
  name: 'Calendar',
  tagline: 'Today at a glance, and what is coming after it.',
  icon: mdiCalendarMonth,
  tag: CALENDAR_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'data',
      label: 'Calendars',
      description: 'Chose mock calendars',
      group: 'preview',
      options: DATA_OPTIONS,
      initial: DEFAULT_DEMO_SCENARIO,
    },
  ],

  /**
   * Which calendars the card follows is not a control on this page: the card's own editor
   * asks for it, and the Advanced section runs that editor. Two pickers for one key is a
   * question a visitor should not have to answer twice.
   */
  toConfig(args) {
    const entities = readList(args, 'entities')
    return entities.length > 0 ? { entities: [...entities] } : {}
  },

  toFixture(args) {
    const data = readString(args, 'data', LIVE_DATA)
    // The key is omitted entirely rather than set to `undefined`: the card distinguishes
    // "no key" from "a key naming nothing", and so does Home Assistant.
    return data === LIVE_DATA ? {} : { demo_scenario: data }
  },
}

/**
 * Readable names for the device sets, and each one names the layout it lands on rather than
 * the devices in it, which is what a visitor is choosing between.
 */
const DEVICE_LABELS: Record<string, string> = {
  none: 'Nothing configured',
  one: 'One device',
  two: 'Two (with percentages)',
  three: 'Three',
  four: 'Four: one on a charger',
  awkward: 'Four (one not reporting)',
  overflow: 'Six: more than these sizes draw',
}

const battery: Widget = {
  id: 'battery',
  name: 'Batteries',
  tagline: 'What is left in everything you have to charge.',
  icon: mdiBatteryHigh,
  tag: BATTERY_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'devices',
      label: 'Devices',
      description: 'Mock devices, in the order the rings follow them.',
      group: 'card',
      options: Object.keys(DEVICE_SETS).map(value => ({
        value,
        label: DEVICE_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_DEVICE_SET,
    },
  ],

  /**
   * In the **Card** group and printed in the Config pane, unlike the calendar's Data knob,
   * because there is nothing preview-only about it. This card has no fixtures: it reads
   * `hass.states` like it would on a dashboard, and the only thing the harness supplies is
   * which entities to point it at. So the YAML above the control is the config that produced
   * what is on screen, per-device overrides and all. The entity ids are the mock
   * installation's, which is the one thing a visitor has to substitute.
   */
  toConfig(args) {
    const rows = deviceSet(readString(args, 'devices', DEFAULT_DEVICE_SET))
    return rows.length > 0 ? { entities: [...rows] } : {}
  },

  toFixture() {
    return {}
  },
}

/**
 * Readable names for the entity sets, and each one names the branch it lands on rather than
 * the entities in it, which is what a visitor is choosing between.
 */
const ENTITY_LABELS: Record<string, string> = {
  gauge: 'One entity: a derived range',
  'no-range': 'One entity: no range to gauge',
  four: 'Four: mixed ranges and tints',
  six: 'Six: more than either footprint’s one row',
  word: 'One entity: a word, not a number',
  'long-name': 'One entity: a name too long to caption',
  unavailable: 'One entity: not reporting',
  yellow: 'One entity: the worst-case tint contrast',
}

const complication: Widget = {
  id: 'complication',
  name: 'Complication',
  tagline: 'Any entity, drawn as a ring, a block, or a single line.',
  icon: mdiGaugeLow,
  tag: COMPLICATION_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'style',
      label: 'Style',
      description: 'Which of the five faces to draw.',
      group: 'card',
      options: COMPLICATION_STYLES.map(value => ({ value, label: STYLE_LABELS[value] })),
      initial: DEFAULT_STYLE,
    },
    {
      kind: 'select',
      name: 'entities',
      label: 'Entities',
      description: 'Mock entities, chosen for the branch each set lands on.',
      group: 'card',
      options: Object.keys(ENTITY_SETS).map(value => ({
        value,
        label: ENTITY_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_ENTITY_SET,
    },
  ],

  /**
   * In the **Card** group and printed in the Config pane, the same reasoning as the battery
   * card's own `toConfig`: this card has no fixtures either, so the YAML above the control is
   * the config that produced what is on screen. The entity ids are the mock installation's,
   * which is the one thing a visitor has to substitute for their own.
   *
   * `style` is written whether or not it sits at `DEFAULT_STYLE`, the same rule
   * `cardOptions` states for `scale` and for the same reason: a key that appears and
   * disappears as the Style select moves shifts the height of the YAML above it, which
   * moves the control itself out from under the cursor.
   */
  toConfig(args) {
    const rows = entitySet(readString(args, 'entities', DEFAULT_ENTITY_SET))
    const style = readString(args, 'style', DEFAULT_STYLE) as ComplicationStyle
    return { entities: [...rows], style }
  },

  toFixture() {
    return {}
  },
}

/**
 * Readable names for the weather sets, each naming the branch it lands on rather than
 * the place it pretends to be — the same rule `ENTITY_LABELS`/`DEVICE_LABELS` follow.
 */
const WEATHER_LABELS: Record<string, string> = {
  'full-week': 'A full week: real spread across the bars',
  'flat-week': 'A flat week: same low and high, every day',
  'daily-only': 'Daily forecast only: no hourly strip',
  night: 'A night-time reading',
  unavailable: 'Not reporting',
}

const weather: Widget = {
  id: 'weather',
  name: 'Weather',
  tagline: 'Now, the next few hours, and the week that follows them.',
  icon: mdiWeatherPartlyCloudy,
  tag: WEATHER_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'set',
      label: 'Forecast',
      description: 'A mock weather entity, chosen for the branch each one lands on.',
      group: 'card',
      options: Object.keys(WEATHER_SETS).map(value => ({
        value,
        label: WEATHER_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_WEATHER_SET,
    },
  ],

  /**
   * In the **Card** group and printed in the Config pane, the same reasoning as the
   * battery and complication cards' own `toConfig`: this card has no fixtures either —
   * everything it draws comes off `hass.states` and a live forecast subscription, so the
   * YAML above the control is the config that produced what is on screen. `entity` is the
   * mock installation's, which is the one thing a visitor has to substitute for their own.
   */
  toConfig(args) {
    return { entity: weatherEntity(readString(args, 'set', DEFAULT_WEATHER_SET)) }
  },

  toFixture() {
    return {}
  },
}

/**
 * Readable names for the chip sets, each naming the branch it lands on rather than the
 * entities in it — the same rule `ENTITY_LABELS`/`DEVICE_LABELS`/`WEATHER_LABELS` follow.
 */
const CHIP_SET_LABELS: Record<string, string> = {
  mixed: 'A mixed row',
  one: 'A single chip',
  many: 'Twelve chips: the row wraps',
  actions: 'Tap actions: toggle, more-info, and one that does nothing',
  unavailable: 'Not reporting',
}

const chips: Widget = {
  id: 'chips',
  name: 'Chips',
  tagline: 'A row of small things, each one tappable.',
  icon: mdiRhombusOutline,
  tag: CHIPS_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'set',
      label: 'Entities',
      description: 'A mock set, chosen for the branch each one lands on.',
      group: 'card',
      options: Object.keys(CHIP_SETS).map(value => ({
        value,
        label: CHIP_SET_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_CHIP_SET,
    },
    {
      kind: 'select',
      name: 'content',
      label: 'Chip content',
      description: 'The default for every chip in the card.',
      group: 'card',
      options: CHIP_CONTENTS.map(value => ({ value, label: titleCase(value) })),
      initial: DEFAULT_CONTENT,
    },
    {
      kind: 'select',
      name: 'container',
      label: 'Background',
      description: 'Glass floats on the dashboard; card draws its own surface.',
      group: 'card',
      options: [
        { value: 'glass', label: 'Glass' },
        { value: 'card', label: 'Card' },
      ],
      initial: DEFAULT_CONTAINER,
    },
  ],

  /**
   * In the **Card** group and printed in the Config pane, the same reasoning as the three
   * cards above: this card has no fixtures either, so the YAML above the control is the config
   * that produced what is on screen — including the `actions` set's per-chip `tap_action`
   * rows, which are YAML-only in this release and have nowhere else to be seen.
   *
   * `content` and `container` are written whether or not they sit at their defaults, the rule
   * `cardOptions` states for `scale`: a key that appears and disappears as a select moves
   * changes the height of the YAML above the controls, which moves the control itself out from
   * under the cursor.
   */
  toConfig(args) {
    return {
      entities: [...chipSet(readString(args, 'set', DEFAULT_CHIP_SET))],
      content: readString(args, 'content', DEFAULT_CONTENT) as ChipContent,
      container: readString(args, 'container', DEFAULT_CONTAINER) as ChipsContainer,
    }
  },

  toFixture() {
    return {}
  },
}

export const WIDGETS: readonly Widget[] = [calendar, battery, complication, weather, chips]

export const widgetById = (id: string): Widget | undefined => WIDGETS.find(w => w.id === id)

/**
 * The rest of the library, as the README's table has it.
 *
 * Listed but not linked; a route to a page saying "not built yet" is a worse answer
 * than a greyed row that already says it. They are here because the first question a
 * visitor asks a two-widget library is whether there will be more.
 */
export const PLANNED: readonly { name: string; icon: string }[] = [
  { name: 'To-do lists', icon: mdiFormatListChecks },
]

// ---- Options every card has --------------------------------------------------

/**
 * The knobs that belong to `CupertinoCardConfig` rather than to one widget's config.
 *
 * In the **Card** group with a widget's own props, and rightly: unlike the Demo knobs
 * these do survive installation, and the Config pane above prints them. Kept as a separate
 * list only because the card that has none of its own still has these.
 */
export const CARD_OPTIONS: readonly Control[] = [
  {
    kind: 'range',
    name: SCALE_FIELD,
    label: SCALE_LABEL,
    description: 'Type, rows and spacing together. 100% is the design size.',
    group: 'card',
    min: MIN_SCALE,
    max: MAX_SCALE,
    step: SCALE_STEP,
    unit: '%',
    initial: DEFAULT_SCALE,
  },
]

/**
 * What `CARD_OPTIONS` came to, as config (every key, always, including one sitting at its
 * default).
 *
 * It dropped the defaults at first, on the grounds that a `scale: 100` says exactly what
 * its absence says and the pane is a thing to paste. What that overlooked is where the pane
 * is: directly above the controls. A key appearing and disappearing changes the height of
 * the YAML, which moves every control below it, so dragging the Scale slider off 100
 * pushed the slider itself down a line, out from under the cursor, and back up again on the
 * way home. Tidy output is not worth a control that flinches when you use it.
 *
 * So the rule for this panel is that the set of keys it writes never changes: whatever it
 * prints, it prints at every setting. Which is honest about the config anyway; Home
 * Assistant's own editor writes `scale` into the YAML the moment anything in the form is
 * touched, default or not.
 */
export const cardOptions = (args: Args): Partial<LovelaceCardConfig> => ({
  [SCALE_FIELD]: readNumber(args, SCALE_FIELD, DEFAULT_SCALE),
})

/** One widget's whole config: its own options, then the ones every card has. */
export const widgetConfig = (widget: Widget, args: Args): Partial<LovelaceCardConfig> => ({
  ...widget.toConfig(args),
  ...cardOptions(args),
})

// ---- The dashboard the widgets are shown in ----------------------------------

export const CONTROL_GROUPS: readonly { id: ControlGroup; name: string }[] = [
  { id: 'card', name: 'Card' },
  { id: 'preview', name: 'Demo' },
]

/**
 * Knobs that belong to the fake dashboard rather than to any one card, so they are the
 * same list whichever widget is on screen.
 *
 * The theme is deliberately not among them. It is the one setting that changes the whole
 * page, so it lives in the header where it can be seen from anywhere rather than a
 * scroll-length down in a panel about the card.
 */
export const CLOCK = 'clock'
export const SECTION_WIDTH = 'sectionWidth'

export const ENVIRONMENT: readonly Control[] = [
  {
    kind: 'select',
    name: CLOCK,
    label: 'Clock',
    group: 'preview',
    /**
     * The three Home Assistant's own profile offers that anybody reasons about. Its fourth,
     * `language`, follows the Home Assistant language rather than the browser and differs
     * from `system` only for a user whose two settings disagree, a distinction with no
     * place on a page about widgets.
     */
    options: [
      { value: 'system', label: 'System' },
      { value: '12', label: '12-hour' },
      { value: '24', label: '24-hour' },
    ],
    /**
     * The browser's own convention, which is very likely the one the visitor reads times
     * in, so the cards arrive already speaking their clock. The other three are here to
     * be switched to; this one is here to be right without being touched.
     */
    initial: 'system',
  },
  {
    kind: 'range',
    name: SECTION_WIDTH,
    label: 'Section width',
    group: 'preview',
    min: 260,
    max: 760,
    step: 10,
    unit: 'px',
    initial: 500,
  },
]

// ---- YAML --------------------------------------------------------------------

const yamlScalar = (value: unknown): string => {
  const text = String(value)
  // Quote only what would otherwise change meaning. A dashboard config is read by
  // people as often as by machines, and `type: custom:…` unquoted is what every
  // Home Assistant doc shows.
  return /^[\w.:/-]+$/.test(text) ? text : JSON.stringify(text)
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A mapping's lines, one key each, a nested mapping indented one level under its own key.
 *
 * The nesting is not decoration: the chips card's `tap_action` is an object sitting on an
 * entity row (`{ entity: light.kitchen, tap_action: { action: toggle } }`), and a printer that
 * stringified it would put `[object Object]` in a pane whose entire purpose is being pasted
 * into somebody's dashboard.
 */
const yamlMapping = (map: Record<string, unknown>, indent: string): string[] =>
  Object.entries(map).flatMap(([key, value]) =>
    isMapping(value)
      ? [`${indent}${key}:`, ...yamlMapping(value, `${indent}  `)]
      : [`${indent}${key}: ${yamlScalar(value)}`],
  )

/**
 * One item of a list: a scalar, or a mapping whose first key rides on the dash.
 *
 * The mapping form is here for the battery card's `entities`, whose rows carry a
 * `charging_entity` when the device's own state cannot say, so a config the visitor is
 * invited to paste has to be able to print one. Two spaces of indent and the dash, exactly
 * as every Home Assistant document writes it.
 */
const yamlItem = (item: unknown): string => {
  if (!isMapping(item)) return `  - ${yamlScalar(item)}`

  const lines = yamlMapping(item, '    ')
  return [`  - ${(lines[0] ?? '').trimStart()}`, ...lines.slice(1)].join('\n')
}

/** Just enough YAML for a card config: scalars, and lists of scalars or nested mappings. */
export const configToYaml = (config: LovelaceCardConfig): string =>
  Object.entries(config)
    .map(([key, value]) =>
      Array.isArray(value)
        ? [`${key}:`, ...value.map(item => yamlItem(item))].join('\n')
        : `${key}: ${yamlScalar(value)}`,
    )
    .join('\n')

/**
 * The config a visitor can paste, which is `toConfig` and nothing else.
 *
 * `custom:` is load-bearing: it is how Lovelace resolves a card that is not one of its
 * own, and a config without it fails to render with a message about an unknown card.
 */
export const widgetYaml = (widget: Widget, args: Args): string =>
  configToYaml({ type: `custom:${widget.tag}`, ...widgetConfig(widget, args) })
