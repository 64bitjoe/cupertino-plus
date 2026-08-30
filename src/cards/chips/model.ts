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

import {
  ACTION_NAMES,
  DEFAULT_ACTION,
  type ActionConfig,
  type ActionName,
} from '../../core/actions'
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

/**
 * The glyph for a chip whose entity Home Assistant knows nothing about.
 *
 * An eye rather than a question mark or an alert: the chip is still drawn, dashed, and what
 * it is saying is "this is configured and I cannot see it", not "something is wrong with your
 * dashboard". Named because the editor greys the same glyph into an empty Icon field, and a
 * placeholder that disagreed with what the card actually draws is a promise broken.
 */
export const FALLBACK_ICON = 'mdi:eye'

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
): ChipView[] => chipConfigs(entities).map(row => readChip(hass, row, defaults))

/**
 * One row, drawn.
 *
 * Split out of `readChips` for the editor's sake: a chip's panel is headed by the name and
 * the glyph the card is drawing for it right now, overrides included, so a row is
 * recognisable in the dialog by the same two things it has on the dashboard. That is the same
 * job `readDevice` does for the battery card's list, and doing it any other way would be a
 * second opinion about a chip's identity kept in the editor.
 *
 * `hass` may be missing here where it cannot be on the card: an editor renders before Home
 * Assistant has necessarily handed one over. A chip with no `hass` reads exactly like a chip
 * whose entity is not in it, which is the honest answer and needs no separate branch.
 */
export const readChip = (
  hass: HomeAssistant | undefined,
  row: ChipConfig,
  defaults: ChipDefaults = {},
): ChipView => {
  const entity = hass?.states[row.entity]
  const content = row.content ?? defaults.content ?? DEFAULT_CONTENT
  const action = row.tap_action ?? DEFAULT_ACTION

  if (!hass || !entity) {
    return {
      entityId: row.entity,
      name: row.name ?? row.entity,
      icon: row.icon ?? FALLBACK_ICON,
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
}

/**
 * The two values the editor greys into a chip's Icon and Name fields.
 *
 * A placeholder is a promise about what happens when a field is left empty, so it has to be
 * made by whoever keeps it: these are `readChip`'s own fallbacks, read out of the same place,
 * rather than a second guess at them written in the editor.
 */
export const inheritedName = (hass: HomeAssistant | undefined, entity: string): string => {
  const state = hass?.states[entity]
  return state ? nameFor(state) : entity
}

export const inheritedIcon = (hass: HomeAssistant | undefined, entity: string): string => {
  const state = hass?.states[entity]
  return state ? iconFor(state) : FALLBACK_ICON
}

/**
 * A whole list on its way back into the config.
 *
 * Here rather than in the editor because it is a rule about the config rather than about a
 * control, and because it is the half of the editor a test can reach without a browser.
 *
 * Two things happen. A row with nothing but an entity in it is written back as a bare string,
 * so a config someone hand-wrote as a plain id list does not sprout objects just because they
 * opened a panel and closed it again — the same rule `mergeEntities` keeps for the cards whose
 * lists still go through a picker. And a row whose entity has been cleared is dropped, which
 * is Home Assistant's own reading of that gesture on its entities card, and the only one
 * available here: a chip with no entity has no identity, no reading and nothing to press.
 */
export const chipRows = (rows: readonly ChipConfig[]): (string | ChipConfig)[] =>
  rows
    .filter(row => typeof row.entity === 'string' && row.entity !== '')
    .map(row => (Object.keys(row).length === 1 ? row.entity : row))

/**
 * What a chip's content dropdown says for "whatever the card is set to".
 *
 * A sentinel rather than an empty value, and it never reaches a config. `select` renders
 * radios under six options and a dropdown when asked, and neither has a way to be un-picked
 * once it has been picked; an option that says the thing out loud is the only version of
 * "no override" a user can actually get back to. `inherit` rather than `''` because an empty
 * string is what several of Home Assistant's own controls use to mean "nothing selected", and
 * an option whose value is indistinguishable from no value renders as a blank line.
 */
export const CONTENT_INHERIT = 'inherit'

/** Not exported: `chipFromForm` is the only thing that should ever read a form's report. */
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/**
 * One chip as its panel's `ha-form` wants it: flat.
 *
 * The nesting is the whole reason this exists. A chip's config carries `tap_action` as an
 * object, and an `ha-form` row reads and writes one key of one flat object — Home Assistant's
 * `expandable` node can nest, but it draws a panel of its own, and the panel here is already
 * ours (see `chip-list-editor.ts` on why it has to be). So the action is spread across three
 * sibling fields on the way in and gathered back up on the way out, and `chipFromForm` is the
 * other half of this function rather than a separate idea.
 *
 * `content` shows the sentinel rather than the card's default when the row does not override
 * it, so that a panel opened and closed writes nothing: a dropdown parked on `Icon and reading`
 * because that is what the card does would turn into a per-chip override the first time
 * somebody edited the name beside it.
 */
export const chipToForm = (config: ChipConfig): Record<string, unknown> => ({
  entity: config.entity,
  name: config.name,
  icon: config.icon,
  content: config.content ?? CONTENT_INHERIT,
  action: config.tap_action?.action ?? DEFAULT_ACTION.action,
  navigation_path: config.tap_action?.navigation_path,
  service: config.tap_action?.service,
})

/**
 * The panel's report, folded back into a config row.
 *
 * `prior` is not decoration. The form draws five of a tap action's seven keys; `data` and
 * `target` on a `call-service`, and the `entity` override on any of them, are YAML this
 * editor deliberately does not offer (§7 of the rules has all three), and losing them the
 * moment somebody renamed the chip beside them would be the exact data loss `mergeEntities`
 * exists to prevent on the cards whose lists still go through a picker.
 *
 * Answers `undefined` for a row whose entity has been cleared, which `chipRows` would drop
 * anyway; doing it here as well is what keeps the control from holding an id nothing renders.
 */
export const chipFromForm = (
  prior: ChipConfig,
  data: Record<string, unknown>,
): ChipConfig | undefined => {
  const entity = text(data.entity)
  if (entity === undefined) return undefined

  const next: ChipConfig = { entity }

  const name = text(data.name)
  if (name !== undefined) next.name = name

  const icon = text(data.icon)
  if (icon !== undefined) next.icon = icon

  const content = text(data.content)
  if (content !== undefined && (CHIP_CONTENTS as readonly string[]).includes(content)) {
    next.content = content as ChipContent
  }

  const tapAction = actionFromForm(prior.tap_action, data)
  if (tapAction !== undefined) next.tap_action = tapAction

  return next
}

/**
 * The three action fields, gathered back into one `tap_action` — or into nothing at all.
 *
 * Two decisions worth stating. **The argument fields are read only for the action that owns
 * them**: a `navigation_path` left over from a row that used to navigate does not ride along
 * inside a `toggle`, because a config carrying an argument its action cannot use is a config
 * that reads as a bug the next time somebody opens the YAML tab.
 *
 * And **a bare `more-info` is written as no `tap_action` at all**, because that is what
 * `DEFAULT_ACTION` already means. The alternative — showing more-info in the dropdown, as we
 * must, and then writing it through on the first unrelated edit — would put a `tap_action` on
 * every chip in a config the moment its owner touched one name.
 */
const actionFromForm = (
  prior: ActionConfig | undefined,
  data: Record<string, unknown>,
): ActionConfig | undefined => {
  const named = text(data.action)
  const action: ActionName = (ACTION_NAMES as readonly string[]).includes(named ?? '')
    ? (named as ActionName)
    : DEFAULT_ACTION.action

  const next: ActionConfig = { action }

  // Carried through every action, because it is the one override that applies to all of them.
  if (prior?.entity !== undefined) next.entity = prior.entity

  if (action === 'navigate') {
    const path = text(data.navigation_path)
    if (path !== undefined) next.navigation_path = path
  }

  if (action === 'call-service') {
    const service = text(data.service)
    if (service !== undefined) next.service = service
    if (prior?.data !== undefined) next.data = prior.data
    if (prior?.target !== undefined) next.target = prior.target
  }

  return action === DEFAULT_ACTION.action && Object.keys(next).length === 1 ? undefined : next
}

/**
 * A stable key per row, for a list control's `repeat` and for whatever it remembers per row.
 *
 * The entity id, which is what the battery card's list uses and what makes a dragged row keep
 * its open panel — except that this card's config may legally name the same entity twice.
 * `readChips` draws both, so the editor has to render both, and two rows sharing a key is the
 * one thing `repeat` cannot be handed. Later occurrences get a `#1`, `#2` suffix, so the
 * ordinary config is keyed exactly as it was and the odd one renders instead of throwing.
 *
 * The suffix is positional, so dragging one duplicate past the other renames both keys and
 * closes their panels. That is the whole cost, it falls only on a config that names one entity
 * twice, and the alternative — an identity a chip does not have — would be a worse lie.
 */
export const chipKeys = (rows: readonly ChipConfig[]): string[] => {
  const seen = new Map<string, number>()
  return rows.map(row => {
    const before = seen.get(row.entity) ?? 0
    seen.set(row.entity, before + 1)
    return before === 0 ? row.entity : `${row.entity}#${before}`
  })
}
