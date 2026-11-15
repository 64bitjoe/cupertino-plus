/**
 * What a complication draws, and how a Home Assistant state becomes one.
 *
 * The render functions (the ring, the block, the strip and their kin) only ever see
 * a `Complication`, so this is the whole of the card's contact with Home Assistant — the
 * same idea as `battery/model.ts`, and read as the sibling of `tint.ts` and `range.ts`:
 * those two answer "what colour" and "what range", this module is where their answers get
 * folded in alongside the reading itself, the name, the icon and the value string, into
 * the one shape everything downstream trusts.
 *
 * The one decision worth stating up front, because it drives most of what follows: **an
 * unreadable entity is never dropped.** A sensor that has gone `unavailable` becomes a
 * dashed, dimmed complication rather than a missing one, for the battery card's own
 * reason — the fact that something stopped reporting is exactly what somebody puts a
 * widget on a dashboard to find out. A card that quietly showed three cells where four
 * were configured would answer the opposite question. An entity absent from `hass.states`
 * entirely (a typo'd id, an integration that has not loaded yet) gets the same treatment,
 * keyed by the id it was configured with: the row still exists, it is just permanently in
 * the state a live entity only visits sometimes.
 *
 * The other rule that runs through every field below: **per-entity config beats card
 * config beats whatever this module would derive.** A `min`/`max` or `color` set on one
 * row of `entities:` wins over the same key set once at the top of the card, which in turn
 * wins over `range.ts`/`tint.ts`'s own guess. `name` and `icon` have no card-level rung —
 * there is no sensible "every row is called X" — so those two are just per-entity-or-derived.
 */

import { readAction, readGestures } from '../../core/action-config'
import { rowKeys, text } from '../../core/rows'
import { DEFAULT_ACTION, type ActionConfig } from '../../core/actions'
import {
  isTemplate,
  type TemplateRequest,
  ACTION_KEYS,
  actionTemplates,
  hasRowTemplates,
  templateRequest,
  type TemplateResolver,
} from '../../core/templates'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import {
  entityRows,
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  numberOf,
  VALUE_DASH,
  watchedIds,
} from '../../core/entity-view'
import {
  actionFromForm,
  actionToForm,
  gesturesFromForm,
  gesturesToForm,
} from '../../core/action-form'
import {
  countdownFor,
  countdownText,
  formatTarget,
  isTicking,
  nextTickIn,
  shortRemaining,
  type CountdownPhase,
} from './countdown'
import { sparklineHoursFor } from './history'
import { isBentoSize, type BentoSize } from './bento'
import { COMPLICATION_STYLES, drawsSparkline, type ComplicationStyle } from './style'
import { fractionOf, rangeFor, type Range } from './range'
import { TINTS, tintFor, type TintName } from './tint'
import { isOneOf, oneOf } from '../../core/one-of'

export type { TemplateResolver }

export { watchedIds }

/**
 * One row of the card's `entities`, as the config may write it.
 *
 * A bare entity id is what the visual editor writes and what most configs hold; the
 * object is for the overrides `hass` cannot supply on its own — a name for a sensor
 * called `Kirill's Phone Battery Level`, a range for an entity `range.ts` has no honest
 * derivation for, a colour that disagrees with `tint.ts`'s guess.
 */
export interface ComplicationEntityConfig {
  entity: string
  /** The label. A literal, or a Jinja template (see `TEMPLATE_SLOTS`). */
  name?: string
  /** An `mdi:` name, or a template answering one. */
  icon?: string
  min?: number
  max?: number
  color?: TintName
  /**
   * What the face prints in place of the entity's own reading: a literal, or a template. A
   * template that answers a plain number also drives the gauge, against the row's range.
   */
  value?: string
  /** The one line of context under the reading on the rectangular faces, over `supportingFor`. */
  supporting?: string
  /** A press. Absent means more-info, which is what every cell did before this key existed. */
  tap_action?: ActionConfig
  hold_action?: ActionConfig
  double_tap_action?: ActionConfig
  /**
   * This entity's own answer to the card's `sparkline`: `true` or `false` overrules it, absent
   * follows it. On the graph face, `false` swaps the graph for the bar.
   */
  sparkline?: boolean
  /** This entity's own history window, 1–48 hours, over the card's `sparkline_hours`. */
  sparkline_hours?: number
  /** This entity's own answer to the card's `countdown`: absent follows the card. */
  countdown?: boolean
  /** Bento only: the cell's size. Absent means automatic (see `bento.ts`'s `bentoSizes`). */
  size?: BentoSize
  /** Bento only: this cell's own face. Absent means automatic, chosen for its size. */
  style?: ComplicationStyle
}

/**
 * The four text slots a row may fill with a template, in the order the editor shows them. One
 * list for registering the subscriptions and for reading their answers, so the two cannot
 * disagree about what is templatable.
 */
export const TEMPLATE_SLOTS = ['name', 'icon', 'value', 'supporting'] as const

/** The card-level values a row falls back to when it sets nothing of its own. */
export interface ComplicationDefaults {
  min?: number
  max?: number
  color?: TintName
}

/** One complication's worth of entity, normalised. */
export interface Complication {
  /** The entity id: the identity of the cell, and what a tap opens. */
  id: string
  name: string
  /**
   * Always an `mdi:` name, never `undefined` and never `''`, so no cell ever renders an
   * empty `<ha-icon>`. See `iconFor` for why this is resolved here rather than left to
   * `<ha-state-icon>`.
   */
  icon: string
  /** Already formatted, unit included. An em dash when there is nothing to read. */
  value: string
  /** The reading as a number, or `null` when the state is not one (including "unavailable"). */
  numeric: number | null
  range: Range | null
  /** `numeric` placed in `range`, 0–1. `null` whenever there is no gauge to draw. */
  fraction: number | null
  /** One line of context, and only where deriving one is obviously right. See `supportingFor`. */
  supporting: string | null
  tint: TintName
  unavailable: boolean
  /** Present only while the card counts down and this entity holds a moment to count to. */
  countdown: CountdownView | null
  /** The window, in hours, this entity's history line is drawn over; `null` for no line. */
  history: number | null
  /** The tap, resolved; more-info unless the row says otherwise. */
  action: ActionConfig
  /** Present only when configured to do something, so a cell without one runs no hold timer. */
  holdAction?: ActionConfig
  doubleTapAction?: ActionConfig
}

/** The glyph a countdown gets when its entity has no better one. */
const COUNTDOWN_ICONS: Record<string, string> = {
  timer: 'mdi:timer-outline',
  calendar: 'mdi:calendar',
  input_datetime: 'mdi:calendar-clock',
  sensor: 'mdi:clock-outline',
}

const domainOf = (entity: HassEntity): string => entity.entity_id.split('.')[0] ?? ''

/** What a face needs to know about a countdown beyond its value and fraction. */
export interface CountdownView {
  phase: CountdownPhase
  /** Whether it moves on its own, and so whether the card needs its clock. */
  ticking: boolean
  /** Milliseconds until the printed value next changes; `null` when it will not. */
  nextTick: number | null
  /** What VoiceOver says in place of the printed value: "12 minutes 5 seconds left". */
  spoken: string
  /**
   * The value as a ring prints it — `4:18` over `HR` — or `null` when a reading template has
   * taken the value over, which a ring then prints as written. See `shortRemaining`.
   */
  short: { main: string; unit: string | null } | null
}

/** What a read needs beyond the config. */
export interface ReadContext {
  /** Looks up a template's last answer; see `complicationTemplates`. */
  resolve?: TemplateResolver
  /** The clock, epoch ms. Only countdowns read it. */
  now?: number
  /**
   * Present when the card counts down to times (`countdown: true`); `hours` is the span a
   * countdown without a length of its own drains over. See `countdown.ts`.
   */
  countdown?: { hours?: number; enabled?: boolean }
  /**
   * The card's sparkline settings and face, so each row's own override can be folded in here:
   * `enabled` is the card's switch, `hours` its window. Absent means no sparkline anywhere.
   */
  sparkline?: { enabled: boolean; hours: number; style: ComplicationStyle }
  /** For the supporting line's "at 14:30". */
  locale?: string
  hour12?: boolean
  /**
   * The server's zone (`hass.config.time_zone`): the zone a naive date-time from Home Assistant
   * — an `input_datetime`, a calendar's `start_time` — is a wall clock in. Absent, the browser's.
   */
  serverZone?: string
  /**
   * The zone the "at 14:30" is printed in: the server's when the profile pins the frontend to it
   * (`hass.locale.time_zone: server`), otherwise absent, the browser's.
   */
  displayZone?: string
}

/**
 * Every template the config asks for, ready for `TemplatePool.sync`.
 *
 * Built with the chips card's `templateRequest`, so the variables are the same Mushroom-shaped
 * ones (`config.entity`, `entity`, `user`) and the card's lookup rebuilds the identical key.
 */
export const complicationTemplates = (entities: unknown, user?: string): TemplateRequest[] =>
  entityConfigs(entities).flatMap(row => {
    const templates: string[] = []
    for (const slot of TEMPLATE_SLOTS) {
      const raw = row[slot]
      if (isTemplate(raw)) templates.push(raw)
    }
    for (const key of ACTION_KEYS) templates.push(...actionTemplates(row[key]))
    return templates.map(template => templateRequest(template, row.entity, user))
  })

/**
 * A slot's text: a literal as written, a template's answer once it has one, and `undefined`
 * while it has none (or answered with nothing), so the derived value shows through rather than
 * a blank. The tiles card's rule for the same fields.
 */
const slotReader =
  (resolve: TemplateResolver) =>
  (raw: string | undefined, entity: string | undefined): string | undefined => {
    if (raw === undefined || raw === '') return undefined
    if (!isTemplate(raw)) return raw
    const result = resolve(raw, entity)
    return result === undefined || result.trim() === '' ? undefined : result
  }

/**
 * This card's rows, typed. `entityRows` is the shared reader; the type argument is what says
 * a complication row may also carry `min`, `max` and `color`.
 */
export const entityConfigs = (entities: unknown): ComplicationEntityConfig[] =>
  entityRows<ComplicationEntityConfig>(entities)

/**
 * The verb a thermostat's `temperature` attribute deserves, keyed by `hvac_mode` (which
 * is what a climate entity's bare `state` is), or no entry at all where none is honest.
 *
 * `temperature` (the setpoint) sits on the entity in every mode, `off` included — it is
 * what the thermostat is *set to*, not proof of what it is *doing*. A single equality
 * test against `'cool'` therefore mislabels every other mode "Heating", `off` among
 * them: a thermostat sitting off at 22° would read "Heating to 22°", which is the exact
 * failure `supportingFor`'s own comment below warns against, only worse than opaque —
 * it is false. `heat_cool` and `auto` span two setpoints under one number here, so
 * "Set to" rather than a verb that picks a direction the entity has not picked; every
 * mode with no entry (`off`, `dry`, `fan_only`, and anything `isUnavailable` catches
 * before this is ever reached) falls through to no line at all.
 */
const CLIMATE_VERB: Record<string, string> = {
  heat: 'Heating',
  cool: 'Cooling',
  heat_cool: 'Set',
  auto: 'Set',
}

/**
 * One line of context, and only where one is obviously right.
 *
 * Deliberately not a general-purpose attribute reader: this is the one place the card
 * could easily turn noisy, and a line reading `state_class: measurement` is worse than
 * no line at all, because it looks like it means something and does not. So this names
 * exactly the domains where a single attribute reads as a sentence on its own — a
 * thermostat's setpoint, a track title, a cover's position — and answers `null` for
 * everything else, including a domain listed here whose one attribute happens to be
 * unset. Growing this table is a judgement call each time, not a mechanical addition.
 */
const supportingFor = (entity: HassEntity): string | null => {
  const domain = entity.entity_id.split('.')[0] ?? ''

  if (domain === 'climate') {
    const target = entity.attributes.temperature
    if (typeof target === 'number') {
      const verb = CLIMATE_VERB[entity.state]
      return verb ? `${verb} to ${target}°` : null
    }
    return null
  }

  if (domain === 'media_player') {
    const title = entity.attributes.media_title
    return typeof title === 'string' && title !== '' ? title : null
  }

  if (domain === 'cover') {
    const position = entity.attributes.current_position
    return typeof position === 'number' ? `${position}% open` : null
  }

  return null
}

/**
 * A `row.color`/`defaults.color` value, kept only if it is one of `TINTS`.
 *
 * `entityConfigs` is deliberately forgiving of a hand-written config's shape everywhere
 * else — a bad row is skipped rather than crashing the card, a scalar is read as a
 * one-item list — but `color` is typed as `TintName` on `ComplicationEntityConfig` and
 * `ComplicationDefaults` only at compile time; nothing checks it at the boundary where a
 * config actually enters (`entityConfigs` above validates `entity` alone). A YAML
 * `color: burgundy` reaches `tintVar` unchanged and comes out `var(--cw-burgundy)`, a
 * custom property nothing defines — invalid at computed-value time, so the browser falls
 * back to the property's initial value instead of erroring, and the arc or glyph that was
 * meant to be burgundy is drawn in no colour at all with nothing in the render to say why.
 * That is exactly the silent failure this card's forgiveness is supposed to avoid
 * everywhere else, so this is the one place forgiveness has to mean "fall back", not
 * "pass through unchecked" — the same precedence chain `readComplications` already runs,
 * just with an invalid value treated as though it were never set.
 */
const validTint = (color: TintName | undefined): TintName | undefined =>
  color !== undefined && isOneOf(TINTS, color) ? color : undefined

/**
 * A `{min, max}` pair with only the halves that are actually set, never a key holding an
 * explicit `undefined` — `exactOptionalPropertyTypes` treats those as different things,
 * and `Partial<Range>` promises the honest one: a key that is simply not there.
 */
const pairOf = (min: number | undefined, max: number | undefined): Partial<Range> => ({
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
})

/**
 * A row's `min`/`max` override for `rangeFor`, worked out from the precedence the module
 * comment above promises: per-entity beats card beats derivation, **per key** — a row
 * that sets only `min` still gets the card's `max`, rather than losing the gauge outright.
 *
 * Each half is resolved on its own (`row.min ?? defaults.min`, independently for `max`),
 * not as a pair taken wholesale from whichever of row-then-defaults set anything: the
 * earlier version of this function read "sets either" as "supplies both", so a row
 * narrowing just its floor (`{min: 0}` under a card `{min: 16, max: 24}`) discarded the
 * card's `max` along with it and produced `undefined` for that half — which `rangeFor`
 * then read as "no override", except `min` disagreed with that, so it fell to `rangeFor`'s
 * own half-specified refusal and the gauge vanished, silently, on a row that had every
 * intention of drawing one. Resolving per key is what actually delivers what the module
 * doc comment already promised.
 *
 * The result can still come out half-specified — a row `{min: 0}` with no card default
 * for `max` either, say — and that is fine: `rangeFor`'s own refusal of a `min` with no
 * `max` is the safety rule this function defers to rather than duplicates.
 */
const rangeOverride = (
  row: ComplicationEntityConfig,
  defaults: ComplicationDefaults,
): Partial<Range> | undefined => {
  const min = row.min ?? defaults.min
  const max = row.max ?? defaults.max
  return min === undefined && max === undefined ? undefined : pairOf(min, max)
}

/**
 * Every configured row, turned into what the render functions draw.
 *
 * The whole of the card's contact with `hass`: everything past this function reads a
 * `Complication` and nothing else, the same shape whether the entity behind it is a
 * cheerful battery reading 72% or a sensor that has not reported since last Tuesday.
 */
export const readComplications = (
  hass: HomeAssistant,
  entities: unknown,
  defaults: ComplicationDefaults,
  context: ReadContext = {},
): Complication[] => {
  const field = slotReader(context.resolve ?? (() => undefined))

  return entityConfigs(entities).map(row => {
    const entity = hass.states[row.entity]
    const name = field(row.name, row.entity)
    const icon = field(row.icon, row.entity)
    const presses = {
      action: readAction(row.tap_action, field, row.entity, DEFAULT_ACTION),
      ...readGestures(row, field),
    }

    if (!entity) {
      return {
        id: row.entity,
        name: name ?? row.entity,
        icon: icon ?? 'mdi:eye',
        value: VALUE_DASH,
        numeric: null,
        range: null,
        fraction: null,
        supporting: null,
        tint: validTint(row.color) ?? validTint(defaults.color) ?? 'accent',
        unavailable: true,
        countdown: null,
        history: null,
        ...presses,
      }
    }

    const unavailable = isUnavailable(entity)
    const written = unavailable ? undefined : field(row.value, row.entity)
    const supporting = unavailable ? undefined : field(row.supporting, row.entity)
    const base = {
      id: entity.entity_id,
      name: name ?? nameFor(entity),
      icon: icon ?? iconFor(entity),
      tint: validTint(row.color) ?? validTint(defaults.color) ?? tintFor(entity),
      unavailable,
      ...presses,
    }

    // A countdown takes the reading and the gauge over: the value is the time left, the ring
    // drains with it. A reading template still wins the printed value, as it does everywhere.
    const now = context.now ?? Date.now()
    const counting =
      row.countdown ?? (context.countdown !== undefined && context.countdown.enabled !== false)
    const countdown =
      counting && !unavailable
        ? countdownFor(entity, now, context.countdown?.hours, context.serverZone)
        : null
    if (countdown) {
      const words = countdownText(countdown)
      // The Timer complication is orange and the Calendar one red; a countdown whose entity has
      // no colour of its own (most land on `accent`) takes its Apple counterpart's.
      const derived = tintFor(entity)
      const tint =
        validTint(row.color) ??
        validTint(defaults.color) ??
        (derived === 'accent'
          ? entity.entity_id.startsWith('calendar.')
            ? 'red'
            : 'orange'
          : derived)
      const when =
        countdown.target !== null && countdown.phase === 'running'
          ? formatTarget(countdown.target, now, context.locale, context.hour12, context.displayZone)
          : null
      const context_ = [words.phase, countdown.title ?? when].filter(Boolean).join(' · ')
      // `iconFor` has nothing for these domains but its generic eye; a countdown deserves the
      // glyph of what it is counting to.
      const glyph =
        base.icon === 'mdi:eye'
          ? (COUNTDOWN_ICONS[domainOf(entity)] ?? 'mdi:timer-outline')
          : base.icon
      return {
        ...base,
        icon: glyph,
        tint,
        value: written ?? words.value,
        numeric: null,
        range: null,
        fraction: countdown.fraction,
        supporting: supporting ?? (context_ === '' ? null : context_),
        countdown: {
          phase: countdown.phase,
          ticking: isTicking(countdown),
          nextTick: nextTickIn(countdown),
          spoken: written ?? words.spoken,
          short:
            written !== undefined
              ? null
              : countdown.phase === 'done'
                ? { main: words.value, unit: null }
                : shortRemaining(countdown.remaining),
        },
        history: null,
      }
    }

    const range = unavailable ? null : rangeFor(entity, rangeOverride(row, defaults))
    // A templated reading that answers a bare number drives the gauge too: that is how a
    // template computing, say, a percentage of two sensors gets a ring.
    const fromTemplate = written === undefined ? null : numberOf(written)
    const numeric = unavailable
      ? null
      : (fromTemplate ?? (written === undefined ? numberOf(entity.state) : null))

    return {
      ...base,
      value: unavailable ? VALUE_DASH : (written ?? formatValue(hass, entity)),
      numeric,
      range,
      fraction: range && numeric !== null ? fractionOf(numeric, range) : null,
      supporting: unavailable ? null : (supporting ?? supportingFor(entity)),
      countdown: null,
      history: numeric === null ? null : historyFor(row, context.sparkline),
    }
  })
}

/**
 * Whether a row draws a history line, and over how many hours: the row's own `sparkline` over
 * the card's, on a face that can draw one, and the row's own `sparkline_hours` over the card's.
 * The graph face draws one unless the row says `false`, whatever the card switch says.
 */
export const historyFor = (
  row: Pick<ComplicationEntityConfig, 'sparkline' | 'sparkline_hours'>,
  card: ReadContext['sparkline'],
): number | null => {
  if (!card) return null
  const on =
    card.style === 'rectangular-graph'
      ? row.sparkline !== false
      : drawsSparkline(card.style, row.sparkline ?? card.enabled)
  if (!on) return null
  return row.sparkline_hours !== undefined ? sparklineHoursFor(row.sparkline_hours) : card.hours
}

// ---- The editor's row panel ---------------------------------------------------------

/**
 * What the Colour dropdown shows for "no override": a sentinel rather than `''`, for the chips
 * card's `CONTENT_INHERIT` reason (a select cannot be un-picked, and an empty value renders as a
 * blank line). It never reaches a config.
 */
export const COLOR_AUTOMATIC = 'auto'

/**
 * The three answers a row's Recent history and Count down give: follow the card, or overrule it
 * either way. The first is a sentinel that never reaches a config — a row that follows the card
 * carries no key — for `COLOR_AUTOMATIC`'s reason.
 */
export const OVERRIDE_CARD = 'card'

/** The Size and Face dropdowns' "decide for me", a sentinel like `OVERRIDE_CARD`. */
export const BENTO_AUTOMATIC = 'auto'

/** A row's `style`, kept only if it is a face this card draws. */
export const validStyle = (value: unknown): ComplicationStyle | undefined =>
  oneOf(COMPLICATION_STYLES, value)
export const OVERRIDE_CHOICES = [OVERRIDE_CARD, 'on', 'off'] as const

const toChoice = (value: boolean | undefined): string =>
  value === undefined ? OVERRIDE_CARD : value ? 'on' : 'off'

const fromChoice = (value: unknown): boolean | undefined =>
  value === 'on' ? true : value === 'off' ? false : undefined

/** Whether a row holds a template anywhere a template can go, so its panel opens in that mode. */
export const rowHasTemplates = (row: ComplicationEntityConfig): boolean =>
  hasRowTemplates(row, TEMPLATE_SLOTS)

/**
 * One row as its panel's `ha-form` wants it: flat. The three actions are spread over the shared
 * action fields (`core/action-form.ts`) and gathered back by `complicationFromForm`.
 */
export const complicationToForm = (row: ComplicationEntityConfig): Record<string, unknown> => ({
  entity: row.entity,
  name: row.name,
  icon: row.icon,
  color: validTint(row.color) ?? COLOR_AUTOMATIC,
  min: row.min,
  max: row.max,
  value: row.value,
  supporting: row.supporting,
  sparkline: toChoice(row.sparkline),
  sparkline_hours: row.sparkline_hours,
  countdown: toChoice(row.countdown),
  size: isBentoSize(row.size) ? row.size : BENTO_AUTOMATIC,
  style: validStyle(row.style) ?? BENTO_AUTOMATIC,
  ...actionToForm(row.tap_action, row.entity),
  ...gesturesToForm(row),
})

const numberField = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * The panel's report, folded back into a row. Empty fields write nothing, an action left at its
 * default writes no key (`actionFromForm`'s rule), and `prior` is what keeps any part of an action
 * the panel does not draw a field for alive across an unrelated edit — the target, data,
 * confirmation and assistant rows are all in the panel now, but a key Home Assistant adds later
 * would not be.
 *
 * An emptied Entity keeps the prior one: a complication has no entity-less form, so clearing the
 * picker is read as a slip rather than as a request to break the row. The trash button deletes.
 */
export const complicationFromForm = (
  prior: ComplicationEntityConfig,
  data: Record<string, unknown>,
): ComplicationEntityConfig => {
  const next: ComplicationEntityConfig = { entity: text(data.entity) ?? prior.entity }

  for (const key of ['name', 'icon', 'value', 'supporting'] as const) {
    const value = text(data[key])
    if (value !== undefined) next[key] = value
  }

  const color = text(data.color)
  if (color !== undefined && color !== COLOR_AUTOMATIC) {
    const tint = validTint(color as TintName)
    if (tint !== undefined) next.color = tint
  }

  const min = numberField(data.min)
  if (min !== undefined) next.min = min
  const max = numberField(data.max)
  if (max !== undefined) next.max = max

  // A field the form did not draw keeps what the row had, so a panel showing no history rows
  // (a circular face) cannot drop a `sparkline` written for another face.
  const sparkline = 'sparkline' in data ? fromChoice(data.sparkline) : prior.sparkline
  if (sparkline !== undefined) next.sparkline = sparkline
  const hours =
    'sparkline_hours' in data ? numberField(data.sparkline_hours) : prior.sparkline_hours
  if (hours !== undefined) next.sparkline_hours = sparklineHoursFor(hours)
  const countdown = 'countdown' in data ? fromChoice(data.countdown) : prior.countdown
  if (countdown !== undefined) next.countdown = countdown
  const size = 'size' in data ? data.size : prior.size
  if (isBentoSize(size)) next.size = size
  const style = validStyle('style' in data ? data.style : prior.style)
  if (style !== undefined) next.style = style

  const tap = actionFromForm(prior.tap_action, data, DEFAULT_ACTION.action)
  if (tap !== undefined) next.tap_action = tap

  return { ...next, ...gesturesFromForm(prior, data) }
}

/** Rows on their way back into the config: one that says nothing but its id is the bare id. */
export const complicationRows = (
  rows: readonly ComplicationEntityConfig[],
): (string | ComplicationEntityConfig)[] =>
  rows.map(row => (Object.keys(row).length === 1 ? row.entity : row))

/** Stable per-row keys for the editor's list: the entity id, with a suffix for a repeat. */
export const complicationKeys = (rows: readonly ComplicationEntityConfig[]): string[] =>
  rowKeys(rows)
