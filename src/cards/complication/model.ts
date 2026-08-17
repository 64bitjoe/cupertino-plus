/**
 * What a complication draws, and how a Home Assistant state becomes one.
 *
 * The five render functions (the ring, the block, the strip and their kin) only ever see
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
import { fractionOf, rangeFor, type Range } from './range'
import { TINTS, tintFor, type TintName } from './tint'

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
  name?: string
  icon?: string
  min?: number
  max?: number
  color?: TintName
}

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
  color !== undefined && (TINTS as readonly string[]).includes(color) ? color : undefined

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
): Complication[] =>
  entityConfigs(entities).map(row => {
    const entity = hass.states[row.entity]

    if (!entity) {
      return {
        id: row.entity,
        name: row.name ?? row.entity,
        icon: row.icon ?? 'mdi:eye',
        value: VALUE_DASH,
        numeric: null,
        range: null,
        fraction: null,
        supporting: null,
        tint: validTint(row.color) ?? validTint(defaults.color) ?? 'accent',
        unavailable: true,
      }
    }

    const unavailable = isUnavailable(entity)
    const numeric = unavailable ? null : numberOf(entity.state)
    const range = unavailable ? null : rangeFor(entity, rangeOverride(row, defaults))

    return {
      id: entity.entity_id,
      name: row.name ?? nameFor(entity),
      icon: row.icon ?? iconFor(entity),
      value: unavailable ? VALUE_DASH : formatValue(hass, entity),
      numeric,
      range,
      fraction: range && numeric !== null ? fractionOf(numeric, range) : null,
      supporting: unavailable ? null : supportingFor(entity),
      tint: validTint(row.color) ?? validTint(defaults.color) ?? tintFor(entity),
      unavailable,
    }
  })
