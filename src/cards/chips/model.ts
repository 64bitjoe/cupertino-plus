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

import { DEFAULT_ACTION, type ActionConfig, type ActionName } from '../../core/actions'
import { NO_TARGET_ACTION, readAction, readGestures } from '../../core/action-config'
import {
  actionFromForm,
  actionToForm,
  gesturesFromForm,
  gesturesToForm,
} from '../../core/action-form'
import { roomFromForm, roomToForm } from '../../core/area-form'
import {
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  pictureFor,
  VALUE_DASH,
} from '../../core/entity-view'
import { text } from '../../core/rows'
import {
  ACTION_KEYS,
  actionTemplates,
  isTemplate,
  templateRequest,
  truthy,
  type TemplateRequest,
  type TemplateResolver,
} from '../../core/templates'
import { colorValue, tintVar, type TintName } from '../../core/tint'
import {
  areaSummary,
  roomSummaryOptions,
  roomTemplates,
  roomWatchedIds,
  type RoomKeys,
  type SummaryItemPart,
} from '../../core/area-summary'
import type { CardContainer } from '../../core/container'
import type { HomeAssistant } from '../../core/types/ha'
import { isOneOf, oneOf } from '../../core/one-of'

/**
 * Whether the card paints a surface at all.
 *
 * `glass` is the Lock Screen reading and the default: no `ha-card` chrome, each pill carrying
 * its own translucent scrim so the dashboard shows through. `card` is the escape hatch for a
 * busy wallpaper, and the answer to the contrast limitation the rules document records.
 *
 * The type is `core/container.ts`'s, re-exported under this name so nothing that already says
 * `ChipsContainer` has to change; the default is `FLOATING_DEFAULT_CONTAINER`, shared with every
 * floating card (tiles, room, live activity).
 */
export type ChipsContainer = CardContainer

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
  oneOf(CHIP_ALIGNMENTS, value, DEFAULT_ALIGNMENT)

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
export interface ChipConfig extends RoomKeys {
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
  /** See `core/gestures.ts` for how a hold is told apart from a tap. */
  hold_action?: ActionConfig
  double_tap_action?: ActionConfig
}

export interface ChipView {
  /**
   * `undefined` for a chip with no configured entity — a spacer, or a templated chip. A room
   * row's chip carries the first entity behind its fact, which its gestures act on.
   */
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

/** The same, with every room row's whole room in it, which only `hass` can say. */
export const chipsCardWatchedIds = (
  entities: unknown,
  hass: HomeAssistant | undefined,
): string[] => {
  const rooms = hass
    ? chipConfigs(entities).flatMap(row =>
        row.entity === undefined && row.area !== undefined ? roomWatchedIds(hass, row) : [],
      )
    : []
  return [...new Set([...chipWatchedIds(entities), ...rooms])]
}

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

    // A room's own icons, each keyed to the entity it is about rather than the row's (a room
    // row has none), so `{{ states(entity) }}` in one reads that icon's entity.
    if (row.entity === undefined && row.area !== undefined) {
      for (const { template, entity } of roomTemplates(row)) {
        requests.push(templateRequest(template, entity, user))
      }
    }
  }

  return requests
}

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
): ChipView[] =>
  chipConfigs(entities).flatMap(row =>
    row.entity === undefined && row.area !== undefined
      ? roomChips(hass, row, defaults, resolve)
      : [readChip(hass, row, defaults, resolve)],
  )

/**
 * The colour of each fact, the Home app's: what needs you in red, what is open or unlocked in
 * orange, then each kind in the colour its accessories have everywhere else in this library.
 */
export const PART_TINTS: Record<SummaryItemPart, TintName> = {
  alerts: 'red',
  open: 'orange',
  locks: 'orange',
  occupancy: 'blue',
  climate: 'orange',
  temperature: 'orange',
  humidity: 'teal',
  lights: 'yellow',
  media: 'indigo',
  // A user's own icon carries its colour; this is only for one whose entity is missing.
  custom: 'grey',
}

/**
 * A room row, as the chips it draws: one per fact the room has to say, none for a quiet room.
 * The row's own `color` replaces every fact's but an alert's, which stays red: a leak drawn in
 * the row's calm blue would be the one chip that must not blend in, blending in.
 *
 * The rest of the row's keys apply to the row as a whole, as a chip's apply to the chip:
 *
 * - `show` hides every one of its chips while it answers false, and until it answers at all,
 *   `readChip`'s "hidden until it answers" rule.
 * - A press opens the fact's own device unless the row says otherwise with a `tap_action`; a
 *   hold and a double tap are the row's, each taking the fact's first entity as its own, so a
 *   hold set to toggle on "2 Lights On" toggles a light of that room, not nothing.
 * - `break` starts the row's first chip on a new line, and `fill` stretches its last one, so
 *   whatever follows the room is pushed to the far edge, as it would be after a filling chip.
 *
 * Its `name`, `icon` and `value` are not drawn: each chip is a fact, with the fact's own words
 * and glyph, and the editor does not offer them on a room row.
 */
export const roomChips = (
  hass: HomeAssistant | undefined,
  row: ChipConfig,
  defaults: ChipDefaults = {},
  resolve: TemplateResolver = () => undefined,
): ChipView[] => {
  if (row.area === undefined) return []
  // A room row has no entity, so each of its own templates is keyed with none, exactly as
  // `chipTemplates` registered it.
  const field = (raw: string | undefined): string | undefined => {
    if (!isTemplate(raw)) return raw
    const result = resolve(raw, undefined)
    return result === undefined || result === '' ? undefined : result
  }
  const items = areaSummary(hass, row.area, roomSummaryOptions(row, resolve))
  const configured = colorValue(field(row.color))
  const visible = row.show === undefined ? true : truthy(field(row.show))
  const tap = row.tap_action ? readAction(row.tap_action, field, undefined, undefined) : undefined
  const gestures = readGestures(row, field)
  return items.map((item, index) => {
    const [first] = item.entities
    return {
      entityId: first,
      name: item.text,
      icon: item.icon,
      picture: undefined,
      value: item.text,
      // Its name and its reading are the same words, so `labeled` would print them twice; it
      // reads as `value`. Icon-only stays available, the words kept as the accessible name.
      content: (row.content ?? defaults.content) === 'icon' ? 'icon' : 'value',
      unavailable: false,
      // A user's own icon keeps the colour it was given, over the row's.
      color: item.alert
        ? tintVar('red')
        : (item.color ?? configured ?? tintVar(PART_TINTS[item.part])),
      visible,
      break: index === 0 && row.break === true,
      fill: index === items.length - 1 && row.fill === true,
      spacer: false,
      action: tap ?? (first ? { action: 'more-info', entity: first } : { action: 'none' }),
      ...gestures,
    }
  })
}

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
    // A room row's own name and icon are its area's, for the editor's panel header: on the
    // card it is drawn by `roomChips` instead, as one chip per fact.
    const area = row.area !== undefined ? hass?.areas?.[row.area] : undefined
    return {
      entityId: undefined,
      name: name ?? area?.name ?? '',
      icon: icon ?? area?.icon ?? (row.area !== undefined ? 'mdi:sofa' : ''),
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
  ...roomToForm(config),
  ...actionToForm(config.tap_action, config.entity),
  ...gesturesToForm(config),
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
 * `configRows` treated that as a delete, matching Home Assistant's own entities-card gesture —
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
  if (content !== undefined && isOneOf(CHIP_CONTENTS, content)) {
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

  Object.assign(next, roomFromForm(data))

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
