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
import { isTemplate, type TemplateRequest } from '../../core/templates'
import { colorValue, TINTS } from '../../core/tint'
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
  /** A palette name, any CSS colour, or a template resolving to either. Tints the glyph. */
  color?: string
  /** Replaces the printed reading. Almost always a template; a literal is legal and odd. */
  value?: string
  /** Whether the chip is drawn at all. Hidden until it resolves; see `truthy`. */
  show?: string
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
  /** A resolved CSS value for the glyph, or `undefined` for the row's default ink. */
  color: string | undefined
  /** False only for a chip whose `show` template says so, or has not answered yet. */
  visible: boolean
  action: ActionConfig
}

export interface ChipDefaults {
  content?: ChipContent
  /** The card-level colour. A row's own `color` beats it, exactly as `content` works. */
  color?: string
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
 * How a template's result reaches the model.
 *
 * A function rather than a pool, so this module stays pure and node-testable: the card owns
 * the subscription and passes its `read` in. `entity` is the row the template belongs to,
 * which has to be part of the lookup for the same reason it is part of `requestKey` — two rows
 * sharing `{{ states(config.entity) }}` have two different answers.
 */
export type TemplateResolver = (template: string, entity?: string) => string | undefined

/** Every field of a chip that may hold a template, in the order the editor shows them. */
const TEMPLATED_FIELDS = ['name', 'icon', 'color', 'value', 'show'] as const

/**
 * Every template a config asks for, ready for `TemplatePool.sync`.
 *
 * A field missed here is a field that never resolves, so this and the reading below have to
 * agree about what is templatable; the shared `TEMPLATED_FIELDS` list is what keeps them
 * honest, and the action's two argument fields are appended by hand because they live one
 * level down.
 *
 * The card-level colour has no entity, so it carries no variables at all — which also makes
 * it a different `requestKey` from the same template used on a row, correctly: they are two
 * questions with two answers.
 */
export const chipTemplates = (entities: unknown, defaults: ChipDefaults): TemplateRequest[] => {
  const requests: TemplateRequest[] = []

  if (isTemplate(defaults.color)) requests.push({ template: defaults.color })

  for (const row of chipConfigs(entities)) {
    const variables = { config: { entity: row.entity } }

    for (const field of TEMPLATED_FIELDS) {
      const raw = row[field]
      if (isTemplate(raw)) requests.push({ template: raw, variables })
    }

    // Bound first rather than reached through `row.tap_action?.…`: a type predicate narrows
    // the expression it was handed, not the object behind it, so the optional-chain version
    // passes `isTemplate` and then fails to compile on `action.navigation_path`.
    const action = row.tap_action
    if (action) {
      if (isTemplate(action.navigation_path)) {
        requests.push({ template: action.navigation_path, variables })
      }
      if (isTemplate(action.service)) requests.push({ template: action.service, variables })
    }
  }

  return requests
}

/**
 * What a rendered `show` means.
 *
 * Home Assistant may hand back a real boolean or Python's `True`/`False` as a string,
 * depending on the template; `String()` in the pool makes both arrive here as text. The falsy
 * set is deliberately generous — a user writing `{{ 'off' }}` means off — and `undefined` is
 * false, which is the "hidden until it answers" rule: a chip that flashes *in* reads as a
 * dashboard loading, a chip that flashes *out* reads as a bug.
 */
const FALSY = new Set(['', 'false', 'none', 'null', '0', 'off', 'unavailable', 'unknown'])

export const truthy = (result: string | undefined): boolean =>
  result !== undefined && !FALSY.has(result.trim().toLowerCase())

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
  resolve?: TemplateResolver,
): ChipView[] => chipConfigs(entities).map(row => readChip(hass, row, defaults, resolve))

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
  resolve: TemplateResolver = () => undefined,
): ChipView => {
  // A field is its template's result when it has one, its literal otherwise, and `undefined`
  // when a template has not answered yet — which every caller below treats as "fall back",
  // so nothing is ever blank while a template resolves.
  //
  // `entity` is explicit rather than closed over, because one caller — the card-level colour
  // — has to resolve with none at all, exactly as `chipTemplates` registered it. A default
  // parameter cannot do that job: JS substitutes a default for an *explicit* `undefined`
  // argument exactly as it does for an omitted one, so `field(defaults.color, undefined)` would
  // silently mean `field(defaults.color, row.entity)`. Every other call below passes
  // `row.entity` by hand for the same reason.
  const field = (raw: string | undefined, entity: string | undefined): string | undefined => {
    if (!isTemplate(raw)) return raw
    const result = resolve(raw, entity)
    return result === undefined || result === '' ? undefined : result
  }

  const entity = hass?.states[row.entity]
  const content = row.content ?? defaults.content ?? DEFAULT_CONTENT
  const visible = row.show === undefined ? true : truthy(field(row.show, row.entity))
  const name = field(row.name, row.entity)
  const icon = field(row.icon, row.entity)

  const action = readAction(row.tap_action, field, row.entity)

  if (!hass || !entity) {
    return {
      entityId: row.entity,
      name: name ?? row.entity,
      icon: icon ?? FALLBACK_ICON,
      value: VALUE_DASH,
      content,
      unavailable: true,
      // A chip that cannot be read is dimmed to say so; a dimmed orange chip says two things.
      color: undefined,
      visible,
      action,
    }
  }

  const unavailable = isUnavailable(entity)
  return {
    entityId: row.entity,
    name: name ?? nameFor(entity),
    icon: icon ?? iconFor(entity),
    value: unavailable ? VALUE_DASH : (field(row.value, row.entity) ?? formatValue(hass, entity)),
    content,
    unavailable,
    // The row's own colour resolves against its own entity, exactly like every other field;
    // the card-level fallback resolves with no entity at all, exactly as `chipTemplates`
    // registered it — see the note on `field` above for why that has to be spelled out.
    color: unavailable
      ? undefined
      : colorValue(field(row.color, row.entity) ?? field(defaults.color, undefined)),
    visible,
    action,
  }
}

/**
 * The action, with its one argument resolved if it was a template.
 *
 * Rebuilt rather than mutated: `row.tap_action` is the user's config object, and a card that
 * wrote a rendered path back into it would persist a template's output as though somebody had
 * typed it.
 */
const readAction = (
  action: ActionConfig | undefined,
  field: (raw: string | undefined, entity: string | undefined) => string | undefined,
  entity: string | undefined,
): ActionConfig => {
  if (!action) return DEFAULT_ACTION
  if (!isTemplate(action.navigation_path) && !isTemplate(action.service)) return action

  const next: ActionConfig = { ...action }
  const path = field(action.navigation_path, entity)
  const service = field(action.service, entity)
  if (path === undefined) delete next.navigation_path
  else next.navigation_path = path
  if (service === undefined) delete next.service
  else next.service = service
  return next
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
 * The sentinel the colour dropdown uses for "type a CSS colour instead". Never a config value:
 * `chipFromForm` and `CupertinoChipsCardEditor.fromForm` both fold it away into `color_custom`
 * before a config is ever written.
 *
 * Declared here, alongside `TINT_LABELS`, `titleCase` and `COLOR_SELECTOR` below, rather than
 * inside either editor, because both the chip panel and the card-level form need the same
 * dropdown: one editor's copy and another's would drift the moment a tint was renamed. The same
 * reason `DEFAULT_CONTAINER` lives here rather than in `chips-card.ts`.
 */
export const COLOR_CUSTOM = 'custom'

/** `accent` reads as a word rather than a colour, so it is spelt out rather than capitalised. */
export const TINT_LABELS: Record<string, string> = {
  accent: 'Accent — your theme own',
}

export const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * The Colour dropdown both editors draw: the closed palette, plus "none" and "type your own".
 * `color_custom`, a sibling text row shown only when this reads `COLOR_CUSTOM`, is where the
 * literal actually lives; see the note on `COLOR_CUSTOM` above.
 */
export const COLOR_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [
      { value: '', label: 'None — the row default' },
      ...TINTS.map(value => ({ value, label: TINT_LABELS[value] ?? titleCase(value) })),
      { value: COLOR_CUSTOM, label: 'Custom…' },
    ],
  },
}

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
  color: config.color,
  value: config.value,
  show: config.show,
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

  const color = text(data.color)
  if (color !== undefined) next.color = color

  const value = text(data.value)
  if (value !== undefined) next.value = value

  const show = text(data.show)
  if (show !== undefined) next.show = show

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
