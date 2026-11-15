/**
 * The chips card's chip list, as one control.
 *
 * A chip is usually an entity plus four things nobody can work out from it — how much of it to
 * draw, which glyph, what to call it, and what a press does — and this draws each row as an
 * `ha-expansion-panel` carrying those fields, with a drag handle beside it and a delete button
 * in its summary. A picker at the bottom adds the next one, and a second, plainer button beside
 * it adds a chip with no entity at all — a spacer, or a chip built entirely from templates.
 * Clearing the Entity field on an existing row does the same thing now: it does not delete the
 * row, only the trash icon does.
 *
 * The list itself — why an element of its own rather than `ha-form` rows, what it may render,
 * why the add control waits for `ha-entity-picker` — is `SortablePanelList`'s, in
 * `core/panel-list.ts`, shared with the tiles, live-activity and complication lists. This file is
 * what a chip row is.
 *
 * ## The one thing this does that the battery card's does not
 *
 * A tap action is a nested object, and an `ha-form` row reads one key of one flat object. So
 * the action is spread across three sibling fields going in and gathered back up coming out;
 * `chipToForm` and `chipFromForm` in `model.ts` are that pair, kept there rather than here
 * because they are rules about the config and because it is the half of this editor a node
 * test can reach. Home Assistant's own `ui_action` selector would draw the whole control in
 * one row, and it is very likely present in the frontend this card requires — but "very
 * likely" is what made the per-chip form get deferred once already, so this uses only the
 * selectors `docs/ha-api-notes.md` records as checked. Swapping it in later changes this file
 * and nothing else: the config shape is Home Assistant's either way.
 */

import { allActionRows, gestureHelper, gestureLabel } from '../../core/action-form'
import { roomHelper, roomLabel, roomRows } from '../../core/area-form'
import {
  iconSelector,
  SortablePanelList,
  textSelector,
  type PanelSummary,
} from '../../core/panel-list'
import { defineElement } from '../../core/register'
import { isTemplate } from '../../core/templates'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import { rowKeys, configRows } from '../../core/rows'
import { COLOR_CUSTOM, COLOR_SELECTOR } from '../../core/color-form'
import {
  chipFromForm,
  chipToForm,
  CHIP_CONTENTS,
  CONTENT_INHERIT,
  inheritedIcon,
  inheritedName,
  readChip,
  type ChipConfig,
} from './model'

export const CHIPS_LIST_TAG = 'cupertino-plus-chips-list'

/** The event this element reports with. The detail is the whole list, in order. */
export interface ChipsChangedDetail {
  chips: (string | ChipConfig)[]
}

/**
 * What a chip may point at: anything at all.
 *
 * Stated rather than left implicit, because the battery card's list filters hard and the
 * missing filter here is a decision, not an omission. A chip draws a name, a glyph and a
 * reading, and `core/entity-view.ts` has an answer for all three whatever the domain — a lock,
 * a person, a script, a sensor. There is no class of entity this card is worse at than the
 * chips it is meant to replace, so there is none to hide.
 */
const ANY_ENTITY = { entity: {} } as const

const CONTENT_LABELS: Record<string, string> = {
  [CONTENT_INHERIT]: 'Same as the card',
  icon: 'Icon only',
  value: 'Icon and reading',
  labeled: 'Icon, name and reading',
}

const option = (labels: Record<string, string>) => (value: string) => ({
  value,
  label: labels[value] ?? value,
})

/**
 * Dropdowns rather than the radio lists `select` would choose for itself.
 *
 * Under six options `ha-selector-select` renders radios, and four of these plus five of those
 * is nine radio buttons inside a panel that already holds four other fields. The mode is a
 * statement about the room a control is in rather than about the options in it, and the room
 * here is an accordion row in a dialog.
 */
const CONTENT_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [CONTENT_INHERIT, ...CHIP_CONTENTS].map(option(CONTENT_LABELS)),
  },
}

/**
 * One chip's fields: what the chip *is*, and then what a press *does*.
 *
 * The order is the rules document's own — identity (§1), how much of it to draw (§2), then the
 * press (§7) — and it is the order somebody fills a panel in: an entity, a decision about what
 * it should look like, two overrides they will usually skip, and then the interesting part.
 * The entity is not `required` any more: clearing it is how a chip becomes a spacer or a
 * templated chip, not a mistake the form should flag.
 *
 * The two placeholders are what the card would draw if the fields were left empty, so a panel
 * reads as "this is what you will get" rather than as a blank to be guessed at. They come from
 * `model.ts` rather than from `context: { icon_entity: … }`, so that the promise the greyed-out
 * text makes is kept by the same code that would have to keep it.
 *
 * The press comes last: three dropdowns (tap, hold, double tap), each followed by the one
 * argument its chosen action takes, if any — `actionRows` in `core/action-form.ts`. Outside
 * templating mode, a path is Home Assistant's own view picker rather than a path typed
 * by hand — `NavigationSelector` in `core/types/ha.ts` has what was checked before using it. A
 * template cannot be typed into a picker, so templating mode keeps the plain text box instead.
 *
 * `templating` swaps the Icon and Colour pickers — neither of which a template can be typed
 * into — for plain text boxes, hides the Colour dropdown's own `color_custom` field (moot once
 * `color` is text already), and appends Reading and Show when, which only ever make sense as
 * templates. The switch itself is drawn last, by the element, because it is not a fact about
 * a chip's config at all; see `_templating` on the element.
 */
/** A chip with no entity and an area: a room row, drawn by `roomChips`. */
export const isRoomRow = (config: ChipConfig, data: Record<string, unknown>): boolean =>
  config.entity === undefined && typeof data.area === 'string' && data.area !== ''

export const chipSchema = (
  hass: HomeAssistant | undefined,
  config: ChipConfig,
  data: Record<string, unknown>,
  templating: boolean,
  first: boolean,
): readonly HaFormSchema[] => {
  // A room row draws a chip per fact, each with the fact's own words and glyph, so it is offered
  // no Icon, Name or Reading: `roomChips` would have nothing to draw them on.
  const room = isRoomRow(config, data)
  const rows: HaFormSchema[] = [
    { name: 'entity', selector: ANY_ENTITY },
    // A room is a chip with no entity, so the area rows are offered only to one.
    ...(config.entity === undefined ? roomRows(data, { hass }) : []),
    { name: 'content', selector: CONTENT_SELECTOR },
    templating
      ? { name: 'color', selector: { text: {} } }
      : { name: 'color', selector: COLOR_SELECTOR },
    ...(!templating && data.color === COLOR_CUSTOM
      ? [{ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } }]
      : []),
    ...(room
      ? []
      : [
          templating
            ? { name: 'icon', selector: { text: {} } }
            : { name: 'icon', selector: iconSelector(inheritedIcon(hass, config.entity)) },
          { name: 'name', selector: textSelector(inheritedName(hass, config.entity)) },
        ]),
    ...(first ? [] : [{ name: 'break', selector: { boolean: {} } as const }]),
    { name: 'fill', selector: { boolean: {} } },
    ...allActionRows(data, templating),
  ]

  if (templating) {
    if (!room) {
      rows.push({ name: 'value', selector: { text: { placeholder: "{{ states('sensor.a') }}" } } })
    }
    rows.push({
      name: 'show',
      selector: { text: { placeholder: "{{ is_state('light.a','on') }}" } },
    })
  }

  rows.push({ name: 'templating', selector: { boolean: {} } })

  return rows
}

const LABELS: Record<string, string> = {
  entity: 'Entity',
  content: 'Content',
  color: 'Colour',
  color_custom: 'Custom colour',
  icon: 'Icon',
  name: 'Name',
  action: 'When pressed',
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
  templating: 'Use templates',
  break: 'Start a new row',
  fill: 'Push the rest to the far edge',
  value: 'Reading',
  show: 'Show when',
}

/**
 * Not localised, like the rest of the library's own words: Home Assistant has a translated
 * string for a list of entities and none for any of this.
 */
const HELPERS: Record<string, string> = {
  entity: 'Leave this blank for a spacer, or a chip built entirely from templates below.',
  content: 'Overrides the card for this one chip. Every chip still draws at the same height.',
  color: 'Tints the glyph only. The reading and the pill stay one ink.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  icon: "Overrides the entity's own glyph.",
  name: 'The caption in the third content mode, and the screen-reader label in all of them.',
  action: 'A chip set to Nothing is not drawn as a button at all: no tab stop, no pressed state.',
  navigation_path: 'A dashboard path, as the URL bar shows it.',
  url_path: 'Opens in a new tab, or the browser on the companion app.',
  service:
    'As domain.service. Its target and data have their own rows below; either may be a template.',
  templating:
    'Swaps the icon and colour pickers for text boxes, so you can write a template in them.',
  break: 'This chip begins a new row. A row still wraps on its own if it runs out of width.',
  fill:
    'This chip stretches to take whatever width is left, pushing every chip after it to the ' +
    'right-hand edge. Usually wanted on a blank chip.',
  value: "Replaces what the chip prints. Falls back to the entity's own reading if it is empty.",
  show: 'The chip is drawn only while this is true. Hidden until it answers.',
}

const ADD_LABEL = 'Add a chip'
const ADD_BLANK_LABEL = 'Add a blank chip'

const ADD_HELPER =
  'Any entity at all: a chip has a name, a glyph and a reading for whatever you point it at. ' +
  'One already in the list is not offered again. A blank chip needs no entity — give it a ' +
  'name, icon or reading of its own below, with a template or a plain one, or leave it empty ' +
  'as a spacer.'

class CupertinoChipsList extends SortablePanelList<ChipConfig> {
  protected readonly eventName = 'chips-changed'
  protected readonly detailKey = 'chips'
  protected readonly addLabel = ADD_LABEL
  protected override readonly addBlankLabel = ADD_BLANK_LABEL
  protected readonly addHint = ADD_HELPER
  protected readonly emptyText = 'No chips yet. The card will say so too.'

  protected keysFor(rows: readonly ChipConfig[]): string[] {
    return rowKeys(rows)
  }

  protected configRows(rows: readonly ChipConfig[]): (string | ChipConfig)[] {
    return configRows(rows)
  }

  /** A chip's templated fields; its actions are not counted, as they never were. */
  protected hasTemplates(config: ChipConfig): boolean {
    return [config.name, config.icon, config.color, config.value, config.show].some(isTemplate)
  }

  protected toForm(config: ChipConfig): Record<string, unknown> {
    return chipToForm(config)
  }

  protected fromForm(prior: ChipConfig, value: Record<string, unknown>): ChipConfig {
    return chipFromForm(prior, value)
  }

  protected formSchema(
    config: ChipConfig,
    data: Record<string, unknown>,
    templating: boolean,
    index: number,
  ): readonly HaFormSchema[] {
    return chipSchema(this.hass, config, data, templating, index === 0)
  }

  /**
   * Name and glyph as the card is drawing them right now, overrides included, so a row is
   * recognisable in the editor by the same two things it has on the dashboard. `chip.name` is
   * only ever blank for an entity-less row, so the fallbacks only fire there.
   */
  protected panelSummary(config: ChipConfig): PanelSummary {
    const chip = readChip(this.hass, config)
    return {
      header: chip.name !== '' ? chip.name : chip.spacer ? 'Blank chip' : 'Chip',
      secondary: config.entity ?? (chip.spacer ? 'Spacer — no entity' : 'No entity'),
      icon: chip.icon !== '' ? chip.icon : chip.spacer ? 'mdi:minus' : 'mdi:code-braces',
    }
  }

  protected fieldLabel(name: string): string {
    return LABELS[name] ?? roomLabel(name) ?? gestureLabel(name) ?? name
  }

  protected fieldHelper(name: string): string | undefined {
    return HELPERS[name] ?? roomHelper(name, 'chips') ?? gestureHelper(name)
  }
}

defineElement(CHIPS_LIST_TAG, CupertinoChipsList)

export { CupertinoChipsList }
