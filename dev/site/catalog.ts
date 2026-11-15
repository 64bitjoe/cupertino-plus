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
  mdiSofaOutline,
  mdiTimerOutline,
  mdiViewGridOutline,
  mdiWeatherPartlyCloudy,
} from '@mdi/js'

import { DEMO_SCENARIOS, DEFAULT_DEMO_SCENARIO } from '../../src/cards/calendar/demo-data'
import {
  CHIP_CONTENTS,
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
  DEFAULT_FLOW,
  DEFAULT_ORIENTATION,
  DEFAULT_WASH,
  flowFor,
  orientationFor,
  washFor,
} from '../../src/cards/tiles/model'
import { DEFAULT_SUMMARY_STYLE, summaryStyleFor } from '../../src/cards/tiles/glyphs'
import {
  PANEL_DEFAULT_CONTAINER,
  type CardContainer,
  FLOATING_DEFAULT_CONTAINER,
} from '../../src/core/container'
import {
  BATTERY_CARD_TAG,
  CALENDAR_CARD_TAG,
  CHIPS_CARD_TAG,
  COMPLICATION_CARD_TAG,
  TILES_CARD_TAG,
  WEATHER_CARD_TAG,
} from '../../src/index'
import { DEFAULT_DEVICE_SET, DEVICE_SETS, deviceSet } from '../battery-devices'
import { CHIP_SETS, DEFAULT_CHIP_SET, chipSet } from '../chip-fixtures'
import {
  DEFAULT_ENTITY_SET,
  DISHWASHER_END,
  ENTITY_SETS,
  NEXT_EVENT,
  OUTSIDE_TEMPERATURE,
  entitySet,
} from '../complication-entities'
import { DEFAULT_TILE_SET, FIXTURE_AREAS, TILE_SETS, tileSet } from '../tile-fixtures'
import { ROOM_CARD_TAG } from '../../src/cards/room/room-card'
import { LIVE_ACTIVITY_CARD_TAG } from '../../src/cards/live-activity/live-activity-card'
import {
  DEFAULT_STYLE as DEFAULT_ACTIVITY_STYLE,
  DEFAULT_TIME as DEFAULT_ACTIVITY_TIME,
  DEFAULT_SECONDS,
  DEFAULT_WHEN_IDLE,
  secondsFor,
  styleFor as activityStyleFor,
  timeFor as activityTimeFor,
  whenIdleFor,
} from '../../src/cards/live-activity/model'
import { ACTIVITY_SETS, DEFAULT_ACTIVITY_SET, activitySet } from '../live-activity-fixtures'
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
  /** Also preview it at Apple's large footprint, 12 × 8, for a card made to hold many things. */
  large?: boolean
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

/**
 * The four panel cards' **Background** select, one control rather than four copies, for the
 * reason `PANEL_CONTAINER_FIELD` is one editor row. Glass first, because it is the default and
 * the reading the chips and tiles beside it have.
 */
const PANEL_CONTAINER: Control = {
  kind: 'select',
  name: 'container',
  label: 'Background',
  description:
    'Glass is the translucent panel the chips and tiles use; card is your theme’s surface.',
  group: 'card',
  options: [
    { value: 'glass', label: 'Glass' },
    { value: 'card', label: 'Card' },
  ],
  initial: PANEL_DEFAULT_CONTAINER,
}

/**
 * Written at its default too, the rule `cardOptions` states for `scale`: a key that came and
 * went as the select moved would shift the YAML above the control out from under the cursor.
 */
const panelContainer = (args: Args): { container: CardContainer } => ({
  container: readString(args, 'container', PANEL_DEFAULT_CONTAINER) as CardContainer,
})

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
    PANEL_CONTAINER,
  ],

  /**
   * Which calendars the card follows is not a control on this page: the card's own editor
   * asks for it, and the Advanced section runs that editor. Two pickers for one key is a
   * question a visitor should not have to answer twice.
   */
  toConfig(args) {
    const entities = readList(args, 'entities')
    return { ...(entities.length > 0 ? { entities: [...entities] } : {}), ...panelContainer(args) }
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
    PANEL_CONTAINER,
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
    return { ...(rows.length > 0 ? { entities: [...rows] } : {}), ...panelContainer(args) }
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
  countdowns: 'Countdowns: a timer, a finish time, an alarm, an event',
  bento: 'Bento: a hero graph, a wide one, timers and rings',
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
      description: 'Which face to draw (in bento, the face small cells wear).',
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
    {
      kind: 'select',
      name: 'sparkline',
      label: 'History',
      description: 'A sparkline of recent history, on the faces that draw one.',
      group: 'card',
      options: [
        { value: 'off', label: 'Off' },
        { value: '6', label: 'Last 6 hours' },
        { value: '24', label: 'Last 24 hours' },
      ],
      initial: 'off',
    },
    {
      kind: 'select',
      name: 'countdown',
      label: 'Countdown',
      description: 'Count down to the times timers, timestamps and calendars hold.',
      group: 'card',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ],
      initial: 'off',
    },
    {
      kind: 'select',
      name: 'layout',
      label: 'Layout',
      description: 'One panel, or bento: a rounded cell each, in sizes of their own.',
      group: 'card',
      options: [
        { value: 'panel', label: 'One panel' },
        { value: 'bento', label: 'Bento' },
      ],
      initial: 'panel',
    },
    PANEL_CONTAINER,
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
    const history = readString(args, 'sparkline', 'off')
    const countdown = readString(args, 'countdown', 'off') === 'on'
    const bento = readString(args, 'layout', 'panel') === 'bento'
    return {
      // The timer in the bento set counts down on its own row, whatever the card's switch says:
      // the per-entity override, shown in the Config pane where a visitor can see it.
      entities: rows.map(id => {
        if (!bento) return id
        if (id.startsWith('timer.')) return { entity: id, countdown: true }
        // A second shape beside the automatic large one, so the grid is not all squares.
        if (id === OUTSIDE_TEMPERATURE) return { entity: id, size: 'wide' }
        if (id === DISHWASHER_END || id === NEXT_EVENT) return { entity: id, countdown: true }
        return id
      }),
      style,
      ...(bento ? { layout: 'bento' } : {}),
      ...(history !== 'off' ? { sparkline: true, sparkline_hours: Number(history) } : {}),
      ...(countdown ? { countdown: true } : {}),
      ...panelContainer(args),
    }
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
    PANEL_CONTAINER,
  ],

  /**
   * In the **Card** group and printed in the Config pane, the same reasoning as the
   * battery and complication cards' own `toConfig`: this card has no fixtures either —
   * everything it draws comes off `hass.states` and a live forecast subscription, so the
   * YAML above the control is the config that produced what is on screen. `entity` is the
   * mock installation's, which is the one thing a visitor has to substitute for their own.
   */
  toConfig(args) {
    return {
      entity: weatherEntity(readString(args, 'set', DEFAULT_WEATHER_SET)),
      ...panelContainer(args),
    }
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
      initial: FLOATING_DEFAULT_CONTAINER,
    },
  ],

  /**
   * In the **Card** group and printed in the Config pane, the same reasoning as the three
   * cards above: this card has no fixtures either, so the YAML above the control is the config
   * that produced what is on screen — including the `actions` set's per-chip `tap_action`
   * rows, which the editor's panels also show, one chip at a time.
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
      container: readString(args, 'container', FLOATING_DEFAULT_CONTAINER) as ChipsContainer,
    }
  },

  toFixture() {
    return {}
  },
}

/** Readable names for the tile sets, by the same rule as `CHIP_SET_LABELS`. */
const TILE_SET_LABELS: Record<string, string> = {
  shortcuts: 'Shortcuts: the four cards this replaces',
  entities: 'Entities: every tint automatic',
  unavailable: 'Not reporting',
  rooms: 'Rooms: summarised from their areas',
}

const tiles: Widget = {
  id: 'tiles',
  name: 'Tiles',
  tagline: 'A grid of shortcuts, each one coloured for what it is.',
  icon: mdiViewGridOutline,
  tag: TILES_CARD_TAG,

  /**
   * The chips entry's props less its `content` select: a tile always draws a glyph, a name and
   * a state line, so there is no card-level content mode to choose. The shared scale joins
   * these from `CARD_OPTIONS`, as it does for every card.
   */
  props: [
    {
      kind: 'select',
      name: 'set',
      label: 'Tiles',
      description: 'A mock set: the shortcuts being replaced, plain entities, or a dead sensor.',
      group: 'card',
      options: Object.keys(TILE_SETS).map(value => ({
        value,
        label: TILE_SET_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_TILE_SET,
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
      initial: FLOATING_DEFAULT_CONTAINER,
    },
    {
      kind: 'select',
      name: 'wash',
      label: 'Colour wash',
      description:
        'When a tile fills with its colour: on hover or press, or always. Hover a tile to see it.',
      group: 'card',
      options: [
        { value: 'hover', label: 'On hover or press' },
        { value: 'always', label: 'Always' },
      ],
      initial: DEFAULT_WASH,
    },
    {
      kind: 'select',
      name: 'flow',
      label: 'Rows',
      description:
        'Whether a row too long for the card wraps onto more lines, or stays one line and narrows its tiles.',
      group: 'card',
      options: [
        { value: 'wrap', label: 'Wrap onto more lines' },
        { value: 'row', label: 'One line per row' },
      ],
      initial: DEFAULT_FLOW,
    },
    {
      kind: 'select',
      name: 'orientation',
      label: 'Tile shape',
      description: 'The glyph above the name, or beside it.',
      group: 'card',
      options: [
        { value: 'vertical', label: 'Square' },
        { value: 'horizontal', label: 'Wide' },
      ],
      initial: DEFAULT_ORIENTATION,
    },
    {
      kind: 'select',
      name: 'summary_style',
      label: 'Room summary',
      description:
        'For the Rooms set: one line of words, or a row of status icons under the name with the temperature left as words.',
      group: 'card',
      options: [
        { value: 'words', label: 'Words' },
        { value: 'icons', label: 'Icons' },
      ],
      initial: DEFAULT_SUMMARY_STYLE,
    },
  ],

  /**
   * The chips entry's reasoning, unchanged: no fixtures, so the YAML printed above the controls
   * is the config that drew the card, the shortcuts set's `navigate` rows included; and
   * `container`, `wash` and `flow` are written at their defaults too, so the pane never changes height
   * under a select.
   */
  toConfig(args) {
    return {
      // A room row takes the style only when it is not the default, as the editor writes it.
      tiles: tileSet(readString(args, 'set', DEFAULT_TILE_SET)).map(row =>
        summaryStyleFor(readString(args, 'summary_style', DEFAULT_SUMMARY_STYLE)) === 'icons' &&
        typeof row === 'object' &&
        row !== null &&
        'area' in row
          ? { ...row, summary_style: 'icons' }
          : row,
      ),
      container: readString(args, 'container', FLOATING_DEFAULT_CONTAINER) as ChipsContainer,
      wash: washFor(readString(args, 'wash', DEFAULT_WASH)),
      flow: flowFor(readString(args, 'flow', DEFAULT_FLOW)),
      orientation: orientationFor(readString(args, 'orientation', DEFAULT_ORIENTATION)),
    }
  },

  toFixture() {
    return {}
  },
}

/**
 * The room card against the tile fixtures' three rooms: the Den has the most to say, which is
 * why it is the default.
 */
const room: Widget = {
  id: 'room',
  name: 'Room',
  tagline: "A room's name over what it is doing.",
  icon: mdiSofaOutline,
  tag: ROOM_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'area',
      label: 'Room',
      description: 'One of the mock rooms the tiles card summarises too.',
      group: 'card',
      options: Object.values(FIXTURE_AREAS).map(area => ({
        value: area.area_id,
        label: area.name,
      })),
      initial: 'den',
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
      initial: FLOATING_DEFAULT_CONTAINER,
    },
  ],

  toConfig(args) {
    return {
      area: readString(args, 'area', 'den'),
      summary: ['alerts', 'open', 'locks', 'occupancy', 'temperature', 'lights', 'media'],
      container: readString(args, 'container', FLOATING_DEFAULT_CONTAINER) as ChipsContainer,
    }
  },

  toFixture() {
    return {}
  },
}

/** Readable names for the activity sets, by the same rule as `TILE_SET_LABELS`. */
const ACTIVITY_SET_LABELS: Record<string, string> = {
  running: 'Running: a wash and a print',
  finished: 'Finished: Done, and a failed print',
  idle: 'Idle: nothing on',
  templates: 'Templates: a delayed start, forced into view',
}

/**
 * The Live Activity card against the user's own appliances, mocked: a wash and a print running,
 * a dryer just done, and a quiet house. No fixtures, as for the tiles: the YAML is the config.
 */
const liveActivity: Widget = {
  id: 'live-activity',
  name: 'Live Activity',
  tagline: 'Appliances while they run, and for a moment after.',
  icon: mdiTimerOutline,
  tag: LIVE_ACTIVITY_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'set',
      label: 'Activities',
      description: 'A mock household: things running, things just finished, or nothing on.',
      group: 'card',
      options: Object.keys(ACTIVITY_SETS).map(value => ({
        value,
        label: ACTIVITY_SET_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_ACTIVITY_SET,
    },
    {
      kind: 'select',
      name: 'style',
      label: 'Style',
      description: 'A Lock Screen panel per job, or a Dynamic Island pill.',
      group: 'card',
      options: [
        { value: 'expanded', label: 'Lock Screen' },
        { value: 'compact', label: 'Dynamic Island' },
      ],
      initial: DEFAULT_ACTIVITY_STYLE,
    },
    {
      kind: 'select',
      name: 'time',
      label: 'Show',
      description: 'The time left, the time it finishes, or both.',
      group: 'card',
      options: [
        { value: 'remaining', label: 'Time left' },
        { value: 'finish', label: 'Time it finishes' },
        { value: 'both', label: 'Both' },
      ],
      initial: DEFAULT_ACTIVITY_TIME,
    },
    {
      kind: 'select',
      name: 'seconds',
      label: 'Show seconds',
      description: 'When the countdown turns to m:ss and ticks each second, like the Timer.',
      group: 'card',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'hour', label: 'In the last hour' },
        { value: 'ten_minutes', label: 'In the last 10 minutes' },
      ],
      initial: DEFAULT_SECONDS,
    },
    {
      kind: 'select',
      name: 'when_idle',
      label: 'When nothing is running',
      description: 'Hide the card, say so, or show every activity dimmed. Try it on the Idle set.',
      group: 'card',
      options: [
        { value: 'hide', label: 'Hide the card' },
        { value: 'message', label: 'Say nothing is running' },
        { value: 'show', label: 'Show every activity, dimmed' },
      ],
      initial: DEFAULT_WHEN_IDLE,
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
      initial: FLOATING_DEFAULT_CONTAINER,
    },
  ],

  toConfig(args) {
    return {
      activities: [...activitySet(readString(args, 'set', DEFAULT_ACTIVITY_SET))],
      style: activityStyleFor(readString(args, 'style', DEFAULT_ACTIVITY_STYLE)),
      time: activityTimeFor(readString(args, 'time', DEFAULT_ACTIVITY_TIME)),
      seconds: secondsFor(readString(args, 'seconds', DEFAULT_SECONDS)),
      when_idle: whenIdleFor(readString(args, 'when_idle', DEFAULT_WHEN_IDLE)),
      container: readString(args, 'container', FLOATING_DEFAULT_CONTAINER) as ChipsContainer,
    }
  },

  toFixture() {
    return {}
  },
}

/**
 * A widget again under its own name, with some of its controls starting elsewhere: a new
 * feature that sits behind a select is invisible to somebody who doesn't know to move it, so the
 * sidebar gets an entry that opens on it. Every control still moves.
 */
const preset = (
  base: Widget,
  id: string,
  name: string,
  tagline: string,
  initials: Record<string, string>,
): Widget => ({
  ...base,
  id,
  name,
  tagline,
  props: base.props.map(control =>
    control.name in initials
      ? ({ ...control, initial: initials[control.name] } as Control)
      : control,
  ),
})

const roomTiles = preset(
  tiles,
  'room-tiles',
  'Room tiles',
  'A tile per room, with a row of status icons under its name.',
  { set: 'rooms', summary_style: 'icons' },
)

const bento: Widget = {
  ...preset(
    complication,
    'bento',
    'Bento',
    'Complications as a bento grid: a cell each, in sizes of their own.',
    { entities: 'bento', layout: 'bento' },
  ),
  large: true,
}

const countdowns = preset(
  complication,
  'countdowns',
  'Countdowns',
  'Timers, finish times and the next event, with a ring that drains.',
  { entities: 'countdowns', countdown: 'on', style: 'gauge' },
)

const corners = preset(
  complication,
  'corners',
  'Corners',
  'Four readings, one in each corner, like the Infograph face.',
  { entities: 'four', style: 'corner' },
)

const history = preset(
  complication,
  'history',
  'History graph',
  'A reading with its recent history filling the block.',
  { entities: 'four', style: 'rectangular-graph', sparkline: '24' },
)

export const WIDGETS: readonly Widget[] = [
  calendar,
  battery,
  complication,
  bento,
  corners,
  history,
  countdowns,
  weather,
  chips,
  tiles,
  roomTiles,
  room,
  liveActivity,
]

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
