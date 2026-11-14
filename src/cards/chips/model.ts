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
  serviceOf,
  type ActionConfig,
  type ActionName,
} from '../../core/actions'
import { DOUBLE_TAP_PREFIX, HOLD_PREFIX } from '../../core/action-form'
import {
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  pictureFor,
  VALUE_DASH,
} from '../../core/entity-view'
import { isTemplate, type TemplateRequest } from '../../core/templates'
import { colorValue, TINTS } from '../../core/tint'
import type { CardContainer } from '../../core/container'
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
 *
 * The type itself is `core/container.ts`'s now, re-exported under this name so nothing that
 * already says `ChipsContainer` has to change; the default stays here, because it is this
 * card's and the panel cards default the other way.
 */
export type ChipsContainer = CardContainer

export const DEFAULT_CONTAINER: ChipsContainer = 'glass'

/**
 * Where a row's chips sit along it when they do not fill it: at its start (every chips card up
 * to v1.17), centred, at its end, or spread so the first and last touch the edges (`justify`).
 *
 * Mushroom's chips card takes the same four words, and a centred row of media controls under a
 * now-playing card is the case that asked for it. A `fill` spacer still takes all the room it
 * can, so a row with one in it is laid out by the spacer and this changes nothing there.
 */
export const CHIP_ALIGNMENTS = ['start', 'center', 'end', 'justify'] as const

export type ChipAlignment = (typeof CHIP_ALIGNMENTS)[number]

export const DEFAULT_ALIGNMENT: ChipAlignment = 'start'

/** The card's `alignment`, or the default for anything else; silent, as `container` is. */
export const alignmentFor = (value: unknown): ChipAlignment =>
  (CHIP_ALIGNMENTS as readonly unknown[]).includes(value)
    ? (value as ChipAlignment)
    : DEFAULT_ALIGNMENT

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

/**
 * One configured chip. Not an `EntityRow` — `core/entity-view.ts`'s own interface of that name
 * requires an `entity`, correctly, for the cards that still need one. This card does not: a row
 * with nothing else configured either is a spacer, and one with a name, an icon or a value
 * (almost always templated, since there is no entity for a literal to describe) is a chip in
 * its own right. `readChip`'s own note has the full distinction.
 */
export interface ChipConfig {
  /** Optional. See the interface's own note, and `readChip`'s. */
  entity?: string
  name?: string
  icon?: string
  content?: ChipContent
  /** A palette name, any CSS colour, or a template resolving to either. Tints the glyph. */
  color?: string
  /** Replaces the printed reading. Almost always a template; a literal is legal and odd. */
  value?: string
  /** Whether the chip is drawn at all. Hidden until it resolves; see `truthy`. */
  show?: string
  /**
   * Start a new row at this chip. Not a template: where a row begins is a layout decision the
   * floor arithmetic has to know before `hass` exists, and a value that arrived asynchronously
   * would change the card's height a tick after it was measured.
   */
  break?: boolean
  /**
   * Expand to absorb whatever width the row has left, pushing everything after it to the far
   * edge. Meant for a spacer — a chip with content would simply be drawn stretched — and not a
   * template, for the same reason `break` is not.
   */
  fill?: boolean
  tap_action?: ActionConfig
  /** YAML only, as `data` and `target` are: see `core/gestures.ts` for how a hold is told apart. */
  hold_action?: ActionConfig
  double_tap_action?: ActionConfig
}

export interface ChipView {
  /** `undefined` for a chip with no configured entity — a spacer, or a templated chip. */
  entityId: string | undefined
  /** The caption in `labeled` mode, and the accessible name in every mode. */
  name: string
  /** An `mdi:` name for `ha-icon` — never a raw path; see the card's own note. */
  icon: string
  /**
   * A URL to draw in the glyph's place: a person's photo, album art, a camera frame. Home
   * Assistant's own precedence — a picture beats the domain glyph — but a configured `icon`
   * beats both, since that one was typed on purpose.
   */
  picture: string | undefined
  /** Formatted with its unit, or the dash when there is nothing to read. */
  value: string
  content: ChipContent
  unavailable: boolean
  /** A resolved CSS value for the glyph, or `undefined` for the row's default ink. */
  color: string | undefined
  /** False only for a chip whose `show` template says so, or has not answered yet. */
  visible: boolean
  /** Carried from the config: this chip starts a new row. See `layout.ts`'s `groupRows`. */
  break: boolean
  /** Carried from the config: this chip absorbs the row's leftover width. */
  fill: boolean
  /**
   * True for an entity-less chip whose name, icon and value all resolved to nothing: an
   * intentional gap, drawn by `chips-card.ts` as one — no pill, no glyph, not a button. Always
   * false for a chip with an entity, which always has something to draw even when that
   * something is a dash.
   */
  spacer: boolean
  action: ActionConfig
  /** Only when configured: a row with no hold runs no hold timer (`core/gestures.ts`). */
  holdAction?: ActionConfig
  doubleTapAction?: ActionConfig
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

/**
 * The rows a chips config asks for, forgiving of every hand-written shape.
 *
 * Deliberately its own reader rather than `core/entity-view.ts`'s `entityRows`: that function
 * drops an object row with no usable `entity`, which is correct for the cards that still
 * require one (the battery and complication cards' rows are nothing without one) and wrong for
 * this one. A chip without an entity is a spacer, or a chip built entirely out of templates and
 * literals — either way, a row worth keeping rather than a mistake to discard.
 *
 * A bare string still means `{ entity: string }`. A blank one — `''`, whether written as a bare
 * string or found sitting in an object's `entity` key — is normalised away to no `entity` key
 * at all, rather than kept as an empty string that would mean the same thing more confusingly
 * everywhere downstream compares against `undefined`. Anything that is neither a string nor an
 * object — `null`, a stray number — is still dropped: there is nothing in it to be a chip at
 * all.
 */
export const chipConfigs = (entities: unknown): ChipConfig[] => {
  if (!entities) return []
  const list = Array.isArray(entities) ? entities : [entities]

  return list.flatMap(row => {
    if (typeof row === 'string') return row === '' ? [{}] : [{ entity: row }]
    if (row && typeof row === 'object') {
      const config = row as ChipConfig
      if (typeof config.entity === 'string' && config.entity !== '') return [config]
      // Destructured away rather than set to `undefined`: `exactOptionalPropertyTypes` treats
      // an optional property explicitly assigned `undefined` as a type error, and the honest
      // shape of "no entity" is the key being absent, not present-and-empty.
      const { entity, ...rest } = config
      void entity
      return [rest as ChipConfig]
    }
    return []
  })
}

/**
 * Every entity id this card's rendering depends on — `watchedEntities()`'s answer.
 *
 * Not `core/entity-view.ts`'s own `watchedIds`: that function reads every row as though it
 * must carry an entity, which is no longer true here. A chip with none contributes nothing to
 * watch, rather than contributing `undefined` and asking `hass.states[undefined]` on every
 * state change in the installation.
 */
export const chipWatchedIds = (entities: unknown): string[] =>
  chipConfigs(entities).flatMap(row => (row.entity !== undefined ? [row.entity] : []))

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
 * The one way a template becomes a request, for the model registering it and the card looking
 * its result up again: both call this, so the two keys cannot disagree.
 *
 * The variables are Mushroom's, so a template moved over from one of its cards reads the same
 * names: `config.entity` and `entity` are the row's entity id, and `user` is the name of whoever
 * is looking. `config.entity` came first and stays; `entity` and `user` arrived with the
 * migration, where a template written `{{ is_state(entity, 'on') }}` had nothing to read.
 *
 * Each is present only when it has a value, and with neither the request carries no `variables`
 * key at all. That is what used to be stated as "no entity means no variables" and is the same
 * rule, widened by one: a request is keyed by exactly what it was rendered with, so two ways of
 * writing nothing can never hash to two keys (`chipTemplates`' note has the bug that is about).
 */
export const templateRequest = (
  template: string,
  entity: string | undefined,
  user: string | undefined,
): TemplateRequest => {
  const variables: Record<string, unknown> = {}
  if (entity !== undefined) {
    variables.config = { entity }
    variables.entity = entity
  }
  if (user !== undefined) variables.user = user
  return Object.keys(variables).length > 0 ? { template, variables } : { template }
}

/** The action fields that are one string, any of which may be a template. */
const ACTION_TEXT_FIELDS = ['navigation_path', 'url_path', 'service', 'perform_action'] as const

/**
 * The action fields that are a tree, whose string leaves may be templates: a service's data
 * and its target, at any depth (`entity_id: ['{{ … }}', light.hall]` is a leaf in a list).
 */
const ACTION_TREE_FIELDS = ['data', 'service_data', 'target'] as const

const templatesIn = (value: unknown, out: string[]): void => {
  if (isTemplate(value)) out.push(value)
  else if (Array.isArray(value)) for (const item of value) templatesIn(item, out)
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) templatesIn(item, out)
  }
}

/** Every template one action holds, in its text fields and anywhere in its data and target. */
export const actionTemplates = (action: ActionConfig | undefined): string[] => {
  const out: string[] = []
  if (!action) return out
  for (const key of ACTION_TEXT_FIELDS) templatesIn(action[key], out)
  for (const key of ACTION_TREE_FIELDS) templatesIn(action[key], out)
  return out
}

/** The three gestures a row can configure, in the order `chipTemplates` registers them. */
const ACTION_KEYS = ['tap_action', 'hold_action', 'double_tap_action'] as const

/**
 * Every template a config asks for, ready for `TemplatePool.sync`.
 *
 * A field missed here is a field that never resolves, so this and the reading below have to
 * agree about what is templatable; the shared `TEMPLATED_FIELDS` list is what keeps them
 * honest, and the action's two argument fields are appended by hand because they live one
 * level down.
 *
 * The card-level colour has no entity, so it carries no variables at all — which also makes
 * it a different `requestKey` from the same template used on a row with one. An entity-less
 * ROW's own template is the same case, and deliberately kept that way: `variables` is included
 * only when the row actually has an entity to carry, so "no entity" means "no variables", on a
 * row or off it, every time. `chips-card.ts`'s resolver decides the very same way — off whether
 * the `entity` its callback was handed is defined — so the two sides reconstruct the identical
 * key. Splitting that agreement (say, by always including `variables` with `entity: undefined`
 * inside for a row but never for the card-level colour) would be the exact silent-miss bug a
 * prior round of this card already found and fixed once: two ways of writing "no entity" that
 * do not hash to the same `requestKey`.
 */
export const chipTemplates = (
  entities: unknown,
  defaults: ChipDefaults,
  user?: string,
): TemplateRequest[] => {
  const requests: TemplateRequest[] = []

  if (isTemplate(defaults.color)) requests.push(templateRequest(defaults.color, undefined, user))

  for (const row of chipConfigs(entities)) {
    const push = (template: string): void => {
      requests.push(templateRequest(template, row.entity, user))
    }

    for (const field of TEMPLATED_FIELDS) {
      const raw = row[field]
      if (isTemplate(raw)) push(raw)
    }

    for (const key of ACTION_KEYS) for (const template of actionTemplates(row[key])) push(template)
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
 *
 * A chip with no `entity` at all is a third case, checked first, and it does not share the
 * "not in it" branch's dashed, dimmed treatment: that treatment says "this was configured and
 * cannot be read", and an entity-less chip was never configured to read one. It is either a
 * spacer — nothing resolved for name, icon or value either — or a chip whose whole content
 * comes from templates and literals. Both draw at full opacity, never `unavailable`.
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

  const content = row.content ?? defaults.content ?? DEFAULT_CONTENT
  const visible = row.show === undefined ? true : truthy(field(row.show, row.entity))
  const name = field(row.name, row.entity)
  const icon = field(row.icon, row.entity)

  if (row.entity === undefined) {
    const value = field(row.value, row.entity)
    const color = colorValue(field(row.color, row.entity) ?? field(defaults.color, undefined))
    return {
      entityId: undefined,
      name: name ?? '',
      icon: icon ?? '',
      picture: undefined,
      value: value ?? '',
      content,
      unavailable: false,
      color,
      visible,
      break: row.break === true,
      fill: row.fill === true,
      // A field mid-resolution reads exactly like an absent one (this function's own `field`
      // contract), so a chip that will have content once its template answers draws as a
      // spacer until then — the same "hidden until it answers" rule `show` already keeps,
      // extended here to a chip's whole content rather than only its visibility.
      spacer: name === undefined && icon === undefined && value === undefined,
      action: readAction(row.tap_action, field, row.entity, NO_TARGET_ACTION),
      ...readGestures(row, field),
    }
  }

  const action = readAction(row.tap_action, field, row.entity, DEFAULT_ACTION)
  const gestures = readGestures(row, field)
  const entity = hass?.states[row.entity]

  if (!hass || !entity) {
    return {
      entityId: row.entity,
      name: name ?? row.entity,
      icon: icon ?? FALLBACK_ICON,
      picture: undefined,
      value: VALUE_DASH,
      content,
      unavailable: true,
      // A chip that cannot be read is dimmed to say so; a dimmed orange chip says two things.
      color: undefined,
      visible,
      break: row.break === true,
      fill: row.fill === true,
      spacer: false,
      action,
      ...gestures,
    }
  }

  const unavailable = isUnavailable(entity)
  return {
    entityId: row.entity,
    name: name ?? nameFor(entity),
    icon: icon ?? iconFor(entity),
    // Only when the row did not name an icon of its own: an `icon:` in the config was typed on
    // purpose and outranks whatever the entity happens to publish. An unavailable entity keeps
    // its glyph rather than its photo, for the reason its colour is dropped — the dimming is
    // the signal, and a crisp portrait undercuts it.
    picture: icon === undefined && !unavailable ? pictureFor(entity) : undefined,
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
    break: row.break === true,
    fill: row.fill === true,
    spacer: false,
    action,
    ...gestures,
  }
}

/** A chip with nothing to act on defaults to doing nothing, rather than opening a more-info
 *  dialog — or, worse, a service call — against an entity that was never configured. */
export const NO_TARGET_ACTION: ActionConfig = { action: 'none' }

/**
 * The action, with every template in it resolved.
 *
 * Rebuilt rather than mutated: `row.tap_action` is the user's config object, and a card that
 * wrote a rendered path back into it would persist a template's output as though somebody had
 * typed it.
 *
 * Every string field (the path, the URL, the service under either name) and every string leaf
 * of `data` and `target`, however deep. A leaf whose template has not answered yet is left out
 * rather than sent as written, because a service handed `'{{ states(…) }}'` as a brightness is
 * a failed call where one without the key is the service's default; the same rule a field that
 * is mid-resolution keeps everywhere else in this file. A leaf arrives as text, as every result
 * does (see `TemplatePool`), and Home Assistant's service schemas coerce a number written as
 * text, so `brightness_pct: '{{ 40 }}'` works.
 *
 * `fallback` is what a row with no `tap_action` at all gets: `DEFAULT_ACTION` (more-info) for
 * an entity-bearing chip, exactly as before, and `NO_TARGET_ACTION` (none) for an entity-less
 * one, whose default press would otherwise open a more-info dialog for nothing.
 */
export function readAction(
  action: ActionConfig | undefined,
  field: (raw: string | undefined, entity: string | undefined) => string | undefined,
  entity: string | undefined,
  fallback: ActionConfig,
): ActionConfig
export function readAction(
  action: ActionConfig | undefined,
  field: (raw: string | undefined, entity: string | undefined) => string | undefined,
  entity: string | undefined,
  fallback: undefined,
): ActionConfig | undefined
export function readAction(
  action: ActionConfig | undefined,
  field: (raw: string | undefined, entity: string | undefined) => string | undefined,
  entity: string | undefined,
  fallback: ActionConfig | undefined,
): ActionConfig | undefined {
  if (!action) return fallback
  if (actionTemplates(action).length === 0) return action

  const next: ActionConfig = { ...action }
  for (const key of ACTION_TEXT_FIELDS) {
    const raw = action[key]
    if (!isTemplate(raw)) continue
    const result = field(raw, entity)
    if (result === undefined) delete next[key]
    else next[key] = result
  }
  for (const key of ACTION_TREE_FIELDS) {
    const tree = action[key]
    if (tree !== undefined) next[key] = resolveTree(tree, raw => field(raw, entity)) as typeof tree
  }
  return next
}

/** Left out of an object or a list; see `readAction` on a leaf that has not answered. */
const UNRESOLVED = Symbol('unresolved')

const resolveTree = (value: unknown, resolve: (raw: string) => string | undefined): unknown => {
  if (isTemplate(value)) return resolve(value) ?? UNRESOLVED
  if (Array.isArray(value)) {
    return value.map(item => resolveTree(item, resolve)).filter(item => item !== UNRESOLVED)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const resolved = resolveTree(item, resolve)
      if (resolved !== UNRESOLVED) out[key] = resolved
    }
    return out
  }
  return value
}

/**
 * A row's hold and double tap, resolved, and present only when configured: a view with no
 * `holdAction` key is a row whose press runs no hold timer at all.
 */
export const readGestures = (
  row: { entity?: string; hold_action?: ActionConfig; double_tap_action?: ActionConfig },
  field: (raw: string | undefined, entity: string | undefined) => string | undefined,
): { holdAction?: ActionConfig; doubleTapAction?: ActionConfig } => {
  const hold = readAction(row.hold_action, field, row.entity, undefined)
  const double = readAction(row.double_tap_action, field, row.entity, undefined)
  return {
    ...(hold && hold.action !== 'none' ? { holdAction: hold } : {}),
    ...(double && double.action !== 'none' ? { doubleTapAction: double } : {}),
  }
}

/**
 * The two values the editor greys into a chip's Icon and Name fields.
 *
 * A placeholder is a promise about what happens when a field is left empty, so it has to be
 * made by whoever keeps it: these are `readChip`'s own fallbacks, read out of the same place,
 * rather than a second guess at them written in the editor.
 *
 * `undefined` for a chip with no entity, on purpose: there is nothing inherited to promise,
 * because an entity-less chip left empty draws nothing at all (it is a spacer). Greying in a
 * fake name or a fallback glyph would be exactly the broken promise `FALLBACK_ICON`'s own note
 * warns against — a placeholder that disagrees with what the card actually draws.
 */
export const inheritedName = (
  hass: HomeAssistant | undefined,
  entity: string | undefined,
): string | undefined => {
  if (entity === undefined) return undefined
  const state = hass?.states[entity]
  return state ? nameFor(state) : entity
}

export const inheritedIcon = (
  hass: HomeAssistant | undefined,
  entity: string | undefined,
): string | undefined => {
  if (entity === undefined) return undefined
  const state = hass?.states[entity]
  return state ? iconFor(state) : FALLBACK_ICON
}

/**
 * A whole list on its way back into the config.
 *
 * Here rather than in the editor because it is a rule about the config rather than about a
 * control, and because it is the half of the editor a test can reach without a browser.
 *
 * A row with nothing but an entity in it is written back as a bare string, so a config someone
 * hand-wrote as a plain id list does not sprout objects just because they opened a panel and
 * closed it again — the same rule `mergeEntities` keeps for the cards whose lists still go
 * through a picker.
 *
 * Nothing is ever dropped here any more. Clearing a chip's entity used to be Home Assistant's
 * own reading of "delete this row", the one it gives its own entities card — but that gesture
 * is now how a chip *becomes* a spacer or a templated chip, so a row that came in without a
 * usable entity goes back out the same way, minus the entity key itself: `entity: ''` sitting
 * in a config would mean the same thing as no key at all, just less legibly.
 */
export const chipRows = (rows: readonly ChipConfig[]): (string | ChipConfig)[] =>
  rows.map(row => {
    if (typeof row.entity === 'string' && row.entity !== '') {
      return Object.keys(row).length === 1 ? row.entity : row
    }
    // Destructured away rather than deleted or set to `undefined`, for the same
    // `exactOptionalPropertyTypes` reason `chipConfigs` gives.
    const { entity, ...rest } = row
    void entity
    return rest as ChipConfig
  })

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

/** An empty form field reports as an empty string; this reads it as absent. Shared with the tiles model. */
export const text = (value: unknown): string | undefined =>
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
 *
 * `action` shows `none` rather than `more-info` for a row with no entity and no `tap_action` —
 * `readAction`'s own real default for that case — so the dropdown never claims a chip opens a
 * more-info dialog it cannot actually open.
 */
export const chipToForm = (config: ChipConfig): Record<string, unknown> => ({
  entity: config.entity,
  name: config.name,
  icon: config.icon,
  content: config.content ?? CONTENT_INHERIT,
  color: config.color,
  value: config.value,
  show: config.show,
  break: config.break === true,
  fill: config.fill === true,
  ...actionToForm(config.tap_action, config.entity),
  ...gesturesToForm(config),
})

/**
 * The tap action's three form fields, from the config. Shared with the tiles model.
 *
 * `perform-action` shows as Call a service, the same action under Home Assistant's newer name,
 * with its `perform_action` in the Service field; `actionFromForm` writes it back under the name
 * it came in with, so opening the panel does not rename a key nobody touched.
 */
export const actionToForm = (
  action: ActionConfig | undefined,
  entity: string | undefined,
  prefix = '',
): Record<string, unknown> => ({
  [`${prefix}action`]:
    action?.action === 'perform-action'
      ? 'call-service'
      : (action?.action ?? (entity === undefined ? 'none' : DEFAULT_ACTION.action)),
  [`${prefix}navigation_path`]: action?.navigation_path,
  [`${prefix}url_path`]: action?.url_path,
  [`${prefix}service`]: action ? serviceOf(action) : undefined,
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
 * Never answers `undefined` any more. It used to, for a row whose entity had been cleared —
 * `chipRows` treated that as a delete, matching Home Assistant's own entities-card gesture —
 * but clearing the Entity field is now how a chip becomes a spacer or a templated chip instead
 * of a deletion, so the row survives with no `entity` key rather than vanishing. The trash icon
 * in `chip-list-editor.ts` is the only way to remove a row now.
 */
export const chipFromForm = (prior: ChipConfig, data: Record<string, unknown>): ChipConfig => {
  const next: ChipConfig = {}

  const entity = text(data.entity)
  if (entity !== undefined) next.entity = entity

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

  // A boolean rather than a string, so `text` is the wrong reader: `ha-form`'s boolean selector
  // reports a real `false` for an off switch, and only `true` is worth writing — `break: false`
  // in a config says exactly what its absence says.
  if (data.break === true) next.break = true
  if (data.fill === true) next.fill = true

  // `readAction`'s own real default: `none` for a row this edit leaves with no entity, so a
  // chip left at "Nothing" in the dropdown does not sprout an explicit `tap_action` the moment
  // its name is edited, matching the "bare default writes nothing" rule below.
  const bareDefault: ActionName = entity === undefined ? 'none' : DEFAULT_ACTION.action

  // `data.action` reflects the panel's last render, which happened before this edit — so the
  // very edit that clears `entity` still reports `more-info`, `chipToForm`'s own cosmetic
  // default for the entity-bearing row this used to be, never a value anybody chose. Written
  // through as a real `tap_action`, it would both misfire at runtime (nothing to open) and
  // disagree with what the panel shows the next time it renders (`chipToForm` would grey in
  // "Nothing", not "Open more-info", for the same row). Only skipped when there was nothing
  // explicit stored already — a chip with a real `tap_action.entity` override keeps it
  // regardless of what its own `entity` field says, because that override is what makes an
  // entity-less row's press meaningful in the first place.
  const staleDefault =
    entity === undefined && prior.entity !== undefined && prior.tap_action === undefined
  const tapAction = staleDefault ? undefined : actionFromForm(prior.tap_action, data, bareDefault)
  if (tapAction !== undefined) next.tap_action = tapAction

  return { ...next, ...gesturesFromForm(prior, data) }
}

/**
 * The hold and double tap, as the panel's fields. Both default to Nothing whatever the entity,
 * because that is what an unconfigured gesture does: neither has a more-info fallback.
 */
export const gesturesToForm = (row: {
  hold_action?: ActionConfig
  double_tap_action?: ActionConfig
}): Record<string, unknown> => ({
  ...actionToForm(row.hold_action, undefined, HOLD_PREFIX),
  ...actionToForm(row.double_tap_action, undefined, DOUBLE_TAP_PREFIX),
})

/**
 * The hold and double tap, folded back. A gesture whose dropdown the form did not draw at all
 * keeps what it had, so a caller passing a partial answer (a test, or an editor without the
 * fields) cannot drop a gesture written in YAML. One left at Nothing writes no key.
 */
export const gesturesFromForm = (
  prior: { hold_action?: ActionConfig; double_tap_action?: ActionConfig },
  data: Record<string, unknown>,
): { hold_action?: ActionConfig; double_tap_action?: ActionConfig } => {
  const gesture = (action: ActionConfig | undefined, prefix: string) =>
    data[`${prefix}action`] === undefined ? action : actionFromForm(action, data, 'none', prefix)
  const hold = gesture(prior.hold_action, HOLD_PREFIX)
  const doubleTap = gesture(prior.double_tap_action, DOUBLE_TAP_PREFIX)
  return {
    ...(hold !== undefined ? { hold_action: hold } : {}),
    ...(doubleTap !== undefined ? { double_tap_action: doubleTap } : {}),
  }
}

/**
 * The three action fields, gathered back into one `tap_action` — or into nothing at all.
 *
 * Two decisions worth stating. **The argument fields are read only for the action that owns
 * them**: a `navigation_path` left over from a row that used to navigate does not ride along
 * inside a `toggle`, because a config carrying an argument its action cannot use is a config
 * that reads as a bug the next time somebody opens the YAML tab.
 *
 * And **a bare action matching `bareDefault` is written as no `tap_action` at all**, because
 * that is what leaving the row unconfigured already means — `DEFAULT_ACTION` (more-info) for a
 * chip with an entity, `NO_TARGET_ACTION` (none, via `chipFromForm`'s own `bareDefault`) for
 * one without. The alternative — showing that default in the dropdown, as we must, and then
 * writing it through on the first unrelated edit — would put a `tap_action` on every chip in a
 * config the moment its owner touched one name.
 */
export const actionFromForm = (
  prior: ActionConfig | undefined,
  data: Record<string, unknown>,
  bareDefault: ActionName,
  prefix = '',
): ActionConfig | undefined => {
  const field = (name: string) => text(data[`${prefix}${name}`])
  const named = field('action')
  // An action the dropdown does not offer (`fire-dom-event`, or one a later Home Assistant adds)
  // shows as itself and comes back as itself: the panel cannot edit it, so it must not replace it.
  if (prior && named === prior.action && !(ACTION_NAMES as readonly string[]).includes(named)) {
    return prior
  }
  const action: ActionName = (ACTION_NAMES as readonly string[]).includes(named ?? '')
    ? (named as ActionName)
    : bareDefault

  // Written back under the name it came in with: see `actionToForm`.
  const renamed = action === 'call-service' && prior?.action === 'perform-action'
  const next: ActionConfig = { action: renamed ? 'perform-action' : action }

  // Carried through every action, because they are the overrides that apply to all of them.
  if (prior?.entity !== undefined) next.entity = prior.entity
  if (prior?.confirmation !== undefined) next.confirmation = prior.confirmation

  if (action === 'navigate') {
    const path = field('navigation_path')
    if (path !== undefined) next.navigation_path = path
  }

  if (action === 'url') {
    const url = field('url_path')
    if (url !== undefined) next.url_path = url
  }

  if (action === 'call-service') {
    const service = field('service')
    if (service !== undefined) {
      if (renamed) next.perform_action = service
      else next.service = service
    }
    if (prior?.data !== undefined) next.data = prior.data
    if (prior?.service_data !== undefined) next.service_data = prior.service_data
    if (prior?.target !== undefined) next.target = prior.target
  }

  if (action === 'assist' && prior?.action === 'assist') {
    if (prior.pipeline_id !== undefined) next.pipeline_id = prior.pipeline_id
    if (prior.start_listening !== undefined) next.start_listening = prior.start_listening
  }

  return action === bareDefault && Object.keys(next).length === 1 ? undefined : next
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
 *
 * A row with no entity at all is keyed by its own position, `#<index>`, prefixed so it can
 * never collide with an entity id (`domain.object_id` always contains a `.` and never starts
 * with `#`) or with a `#1`-suffixed duplicate above. It pays the identical cost: dragging a
 * spacer past another entity-less row renames both and closes their panels. Converting a
 * spacer into an entity-bearing chip by typing an entity into it pays the cost the other
 * direction — its key changes from positional to the entity id, so its panel closes on that
 * one edit, which is the same trade-off this function already accepts for a renamed entity.
 */
export const chipKeys = (rows: readonly ChipConfig[]): string[] => {
  const seen = new Map<string, number>()
  return rows.map((row, index) => {
    if (row.entity === undefined) return `#${index}`
    const before = seen.get(row.entity) ?? 0
    seen.set(row.entity, before + 1)
    return before === 0 ? row.entity : `${row.entity}#${before}`
  })
}
