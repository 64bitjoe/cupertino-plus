/**
 * What a chip is, and how a config row plus `hass` becomes one.
 *
 * The whole of this card's contact with `hass`. Everything past it draws a `ChipView` and
 * knows nothing about entities — the same split `complication/model.ts` and `weather/model.ts`
 * make, and for the same reason.
 *
 * Almost every line of the actual reading is `core/entity-view.ts`'s, which is the point of
 * that module existing: a chip and a complication should never disagree about what a
 * thermostat's reading looks like. What is this card's own is the content mode, the tap
 * action, and the decision to draw an entity that is not there.
 */

import { DEFAULT_ACTION, type ActionConfig } from '../../core/actions'
import {
  entityRows,
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  VALUE_DASH,
  type EntityRow,
} from '../../core/entity-view'
import type { HomeAssistant } from '../../core/types/ha'

/**
 * Whether the card paints a surface at all.
 *
 * `glass` is the Lock Screen reading and the default: no `ha-card` chrome, each pill carrying
 * its own translucent scrim so the dashboard shows through. `card` is the escape hatch for a
 * busy wallpaper, and the answer to the contrast limitation the rules document records.
 *
 * Declared here rather than beside the element that reads it, because the editor needs the
 * default as a *value* and the element imports the editor's tag — putting it in `chips-card.ts`
 * would close a runtime import cycle. `complication/style.ts` holds its card's style constants
 * for the same reason.
 */
export type ChipsContainer = 'glass' | 'card'

export const DEFAULT_CONTAINER: ChipsContainer = 'glass'

/**
 * How much of a chip is drawn. `icon` is the glyph alone; `value` adds the reading; `labeled`
 * stacks a small caption over the reading. Three flat strings rather than a pair of booleans,
 * because they are three designs rather than two independent switches — there is no
 * "caption but no reading" chip.
 */
export const CHIP_CONTENTS = ['icon', 'value', 'labeled'] as const

export type ChipContent = (typeof CHIP_CONTENTS)[number]

/** Glyph and reading: the one that says something without a caption to explain it. */
export const DEFAULT_CONTENT: ChipContent = 'value'

export interface ChipConfig extends EntityRow {
  content?: ChipContent
  tap_action?: ActionConfig
}

export interface ChipView {
  entityId: string
  /** The caption in `labeled` mode, and the accessible name in every mode. */
  name: string
  /** An `mdi:` name for `ha-icon` — never a raw path; see the card's own note. */
  icon: string
  /** Formatted with its unit, or the dash when there is nothing to read. */
  value: string
  content: ChipContent
  unavailable: boolean
  action: ActionConfig
}

export interface ChipDefaults {
  content?: ChipContent
}

export const chipConfigs = (entities: unknown): ChipConfig[] => entityRows<ChipConfig>(entities)

/**
 * Every configured row, in order, as something drawable.
 *
 * Nothing is ever dropped. A row whose entity is missing from `hass.states` entirely still
 * produces a chip — dashed, flagged unavailable, named from the row or from the id it asked
 * for. That follows the complication card rather than the weather card: a chip has a
 * configured identity of its own to draw, where a weather card without its entity has no
 * location, no unit and nothing honest to put on the screen. It also means a typo in a config
 * shows up as a dashed chip you can see rather than as a row that silently is not there.
 */
export const readChips = (
  hass: HomeAssistant,
  entities: unknown,
  defaults: ChipDefaults,
): ChipView[] =>
  chipConfigs(entities).map(row => {
    const entity = hass.states[row.entity]
    const content = row.content ?? defaults.content ?? DEFAULT_CONTENT
    const action = row.tap_action ?? DEFAULT_ACTION

    if (!entity) {
      return {
        entityId: row.entity,
        name: row.name ?? row.entity,
        icon: row.icon ?? 'mdi:eye',
        value: VALUE_DASH,
        content,
        unavailable: true,
        action,
      }
    }

    const unavailable = isUnavailable(entity)
    return {
      entityId: row.entity,
      name: row.name ?? nameFor(entity),
      icon: row.icon ?? iconFor(entity),
      value: unavailable ? VALUE_DASH : formatValue(hass, entity),
      content,
      unavailable,
      action,
    }
  })
