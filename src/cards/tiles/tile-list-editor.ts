/**
 * The tiles card's tile list, as one control: a `SortablePanelList` (`core/panel-list.ts`, which
 * has the long arguments) of tile rows.
 *
 * A tile row differs from a chip's by what a tile is. There is no content dropdown, because a tile always draws icon,
 * name and state, and no fill switch, because a tile grid already shares each row. An entity-less
 * tile is a navigation tile rather than a spacer, so a blank tile is a real thing to add and the
 * panel opens in template mode for it.
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
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import { COLOR_CUSTOM, COLOR_SELECTOR } from '../../core/color-form'
import { inheritedIcon, inheritedName } from '../chips/model'
import {
  readTile,
  tileFromForm,
  tileHasTemplates,
  tileKeys,
  tileRows,
  tileToForm,
  type TileConfig,
} from './model'

export const TILES_LIST_TAG = 'cupertino-plus-tiles-list'

/** The event this element reports with. The detail is the whole list, in order. */
export interface TilesChangedDetail {
  tiles: (string | TileConfig)[]
}

/**
 * What a tile may point at: anything at all.
 *
 * Stated rather than left implicit, because the battery card's list filters hard and the
 * missing filter here is a decision, not an omission. A tile draws a name, a glyph and a
 * reading, and `core/entity-view.ts` has an answer for all three whatever the domain — a lock,
 * a person, a script, a sensor. There is no class of entity this card is worse at than the
 * tiles it is meant to replace, so there is none to hide.
 */
const ANY_ENTITY = { entity: {} } as const

/**
 * One tile's fields: what the tile *is*, and then what a press *does*.
 *
 * The order is the one somebody fills a panel in: an entity, a decision about what it should
 * look like, two overrides they will usually skip, and then the interesting part.
 * The entity is not `required` any more: clearing it is how a tile becomes a navigation tile
 * or a templated one, not a mistake the form should flag.
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
 * a tile's config at all; see `_templating` on the element.
 */
const tileSchema = (
  hass: HomeAssistant | undefined,
  config: TileConfig,
  data: Record<string, unknown>,
  templating: boolean,
  first: boolean,
): readonly HaFormSchema[] => {
  const rows: HaFormSchema[] = [
    { name: 'entity', selector: ANY_ENTITY },
    // A room is a tile with no entity, so the area row is offered only to one: on an entity
    // tile it would be a field that does nothing.
    ...(config.entity === undefined ? roomRows(data, { style: true, hass }) : []),
    templating
      ? { name: 'color', selector: { text: {} } }
      : { name: 'color', selector: COLOR_SELECTOR },
    ...(!templating && data.color === COLOR_CUSTOM
      ? [{ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } }]
      : []),
    templating
      ? { name: 'icon', selector: { text: {} } }
      : { name: 'icon', selector: iconSelector(inheritedIcon(hass, config.entity)) },
    { name: 'name', selector: textSelector(inheritedName(hass, config.entity)) },
    ...(first ? [] : [{ name: 'break', selector: { boolean: {} } as const }]),
    ...allActionRows(data, templating),
  ]

  if (templating) {
    rows.push({ name: 'value', selector: { text: { placeholder: "{{ states('sensor.a') }}" } } })
    rows.push({
      name: 'show',
      selector: { text: { placeholder: "{{ is_state('light.a','on') }}" } },
    })
    rows.push({
      name: 'selected',
      selector: { text: { placeholder: "{{ is_state('input_select.a','200') }}" } },
    })
  }

  rows.push({ name: 'templating', selector: { boolean: {} } })

  return rows
}

const LABELS: Record<string, string> = {
  entity: 'Entity',
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
  value: 'Reading',
  show: 'Show when',
  selected: 'Selected when',
}

/**
 * Not localised, like the rest of the library's own words: Home Assistant has a translated
 * string for a list of entities and none for any of this.
 */
const HELPERS: Record<string, string> = {
  entity:
    'Leave this blank for a navigation tile: one that only goes somewhere, built from the fields below.',
  color: 'Tints this tile. Leave it empty for the colour its entity would get.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  icon: "Overrides the entity's own glyph.",
  name: 'The caption under the icon, and the screen-reader label.',
  action: 'A tile set to Nothing is not drawn as a button at all: no tab stop, no pressed state.',
  navigation_path: 'A dashboard path, as the URL bar shows it.',
  url_path: 'Opens in a new tab, or the browser on the companion app.',
  service:
    'As domain.service. Its target and data have their own rows below; either may be a template.',
  templating:
    'Swaps the icon and colour pickers for text boxes, so you can write a template in them.',
  break: 'This tile begins a new row. A row still wraps on its own if it runs out of width.',
  value: "Replaces what the tile prints. Falls back to the entity's own reading if it is empty.",
  show: 'The tile is drawn only while this is true. Hidden until it answers.',
  selected:
    'The tile is drawn filled with its colour while this is true, to mark the current choice.',
}

const ADD_LABEL = 'Add a tile'
const ADD_BLANK_LABEL = 'Add a blank tile'

const ADD_HELPER =
  'Any entity at all: a tile has a name, a glyph and a reading for whatever you point it at. ' +
  'One already in the list is not offered again. A blank tile needs no entity — give it a ' +
  'name, icon or reading of its own below, with a template or a plain one, to make a ' +
  'shortcut that only goes somewhere.'

class CupertinoTilesList extends SortablePanelList<TileConfig> {
  protected readonly eventName = 'tiles-changed'
  protected readonly detailKey = 'tiles'
  protected readonly addLabel = ADD_LABEL
  protected override readonly addBlankLabel = ADD_BLANK_LABEL
  protected readonly addHint = ADD_HELPER
  protected readonly emptyText = 'No tiles yet. The card will say so too.'

  protected keysFor(rows: readonly TileConfig[]): string[] {
    return tileKeys(rows)
  }

  protected configRows(rows: readonly TileConfig[]): (string | TileConfig)[] {
    return tileRows(rows)
  }

  /** Any templated field or action; see `tileHasTemplates`. */
  protected hasTemplates(config: TileConfig): boolean {
    return tileHasTemplates(config)
  }

  protected toForm(config: TileConfig): Record<string, unknown> {
    return tileToForm(config)
  }

  protected fromForm(prior: TileConfig, value: Record<string, unknown>): TileConfig {
    return tileFromForm(prior, value)
  }

  protected formSchema(
    config: TileConfig,
    data: Record<string, unknown>,
    templating: boolean,
    index: number,
  ): readonly HaFormSchema[] {
    return tileSchema(this.hass, config, data, templating, index === 0)
  }

  /**
   * Name and glyph as the card is drawing them right now, so a row is recognisable by the same
   * two things it has on the dashboard. `tile.name` is only ever blank for an entity-less row,
   * and `readTile` always has a glyph (`TILE_FALLBACK_ICON`).
   */
  protected panelSummary(config: TileConfig): PanelSummary {
    const tile = readTile(this.hass, config)
    return {
      header: tile.name !== '' ? tile.name : 'Blank tile',
      secondary: config.entity ?? 'No entity',
      icon: tile.icon,
    }
  }

  protected fieldLabel(name: string): string {
    return LABELS[name] ?? roomLabel(name) ?? gestureLabel(name) ?? name
  }

  protected fieldHelper(name: string): string | undefined {
    return HELPERS[name] ?? roomHelper(name, 'tile') ?? gestureHelper(name)
  }
}

defineElement(TILES_LIST_TAG, CupertinoTilesList)

export { CupertinoTilesList }
