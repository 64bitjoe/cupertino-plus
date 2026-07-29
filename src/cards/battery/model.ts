/**
 * What the battery widget draws, and how a Home Assistant state becomes one.
 *
 * The layout layers (`layout.ts`, `ring.ts`) only ever see a `BatteryDevice`, so this is
 * the whole of the card's contact with Home Assistant — and it is a much shorter contact
 * than the calendar's: a battery level is a number sitting in `hass.states`, pushed to
 * every card on every change, so there is no subscription, no window and no wire mapper.
 * Everything below is normalisation.
 *
 * The one decision worth stating up front: **an unreadable device is not dropped.** A
 * sensor that has gone `unavailable` becomes a ring with an empty track and a dash where
 * the percentage was, because the fact that a device stopped reporting is exactly the sort
 * of thing somebody puts a battery widget on a dashboard to find out. A card that quietly
 * showed three rings where four were configured would answer the opposite question.
 */

import type { HassEntity, HomeAssistant } from '../../core/types/ha'

/**
 * One row of the card's `entities`, as the config may write it.
 *
 * Two forms, and both are load-bearing. A bare entity id is what the visual editor writes
 * and what nearly every config holds; the object is for the things Home Assistant cannot tell
 * us — which entity says whether the device is on a charger, what to call a device whose
 * sensor is named `Kirill's Phone Battery Level`, and which icon says which device it is.
 */
export interface BatteryDeviceConfig {
  entity: string
  /**
   * A `binary_sensor` that is `on` while the device is charging — the
   * `battery_charging` device class, which is what integrations that know use.
   *
   * Explicit because the alternative is guessing, and the guesses disagree: some
   * integrations put `is_charging` on the battery sensor's own attributes, some put
   * `battery_state: Charging`, and the mobile app ships a separate binary sensor. The two
   * attribute forms are read for free below; only the separate entity has to be named.
   */
  charging_entity?: string
  name?: string
  icon?: string
}

/** One ring's worth of device, normalised. */
export interface BatteryDevice {
  /** The battery entity's id — the identity of the row, and what a tap opens. */
  id: string
  /** For the tooltip and the accessible name. Never drawn: see `docs/battery-widget-rules.md`. */
  name: string
  icon: string
  /** 0–100, or `null` when the entity cannot be read as a number at all. */
  level: number | null
  charging: boolean
}

/**
 * What a battery sensor's icon is when nobody has said.
 *
 * A battery glyph, which is a placeholder and reads as one. The card cannot do better and
 * should not try: the icon's job is to say *which device*, and the only honest source for
 * that is the config — HA's icon for a `device_class: battery` sensor is computed from the
 * level, so it would draw the ring's own reading a second time in the middle of it.
 * `battery-unknown` for an entity that is missing or unreadable, which is the one case
 * where a glyph does have something to add.
 */
const fallbackIcon = (state: HassEntity | undefined): string =>
  state === undefined || !Number.isFinite(Number(state.state))
    ? 'mdi:battery-unknown'
    : 'mdi:battery'

/**
 * One config row, however it was written, or `undefined` if there is nothing usable in it.
 *
 * Forgiving on purpose, and for the reason the calendar's `configuredCalendars` is: a card
 * config is not typechecked on its way in. `entities: sensor.phone_battery` — a scalar
 * where a list is meant — is what somebody writes first, and a row that came to nothing is
 * better skipped than turned into a ring with no entity behind it.
 *
 * The domain is deliberately NOT checked. A battery percentage is a `sensor` almost always
 * and not always: an integration is free to expose one as a `number`, and rejecting that
 * would cost a working setup to enforce a convention this card has no stake in.
 */
const deviceConfig = (row: unknown): BatteryDeviceConfig | undefined => {
  if (typeof row === 'string') return row.includes('.') ? { entity: row } : undefined
  if (typeof row !== 'object' || row === null) return undefined

  const { entity, charging_entity: charging, name, icon } = row as Record<string, unknown>
  if (typeof entity !== 'string' || !entity.includes('.')) return undefined

  return {
    entity,
    ...(typeof charging === 'string' && charging.includes('.')
      ? { charging_entity: charging }
      : {}),
    ...(typeof name === 'string' && name !== '' ? { name } : {}),
    ...(typeof icon === 'string' && icon !== '' ? { icon } : {}),
  }
}

/** The rows the config asked for, in the order it asked for them. There is no sorting. */
export const deviceConfigs = (value: unknown): BatteryDeviceConfig[] => {
  const rows = Array.isArray(value) ? value : [value]
  const configs: BatteryDeviceConfig[] = []
  for (const row of rows) {
    const config = deviceConfig(row)
    if (config) configs.push(config)
  }
  return configs
}

/** The rows as a plain list of ids — what a multiple entity picker can be shown. */
export const entityIds = (value: unknown): string[] =>
  deviceConfigs(value).map(config => config.entity)

/**
 * The rows the config should carry after an edit: the ids the picker reported, in the order
 * it reported them, each dressed with whatever its own panel in the editor says about it.
 *
 * Here rather than in the editor because it is a rule about the config rather than about a
 * form, and because it is the one part of the editor a test can reach without a browser.
 * The picker is the authority on *which* devices and in *what order* — a row is built from
 * the id it reported, never from a panel that happens to still be in the form's data — and
 * the panel is the authority on everything else.
 *
 * Two things it is careful about, both of them about not churning somebody's YAML:
 *
 *  - an `{ entity: … }` and its bare id mean the same thing, so a row with nothing to add
 *    is written back as the plain string it arrived as;
 *  - the panel's answer goes through `deviceConfig`, so a field the user emptied is dropped
 *    rather than written as `icon: ''` — which would shadow the entity's own icon with
 *    nothing.
 */
export const writeDeviceRows = (
  reported: unknown,
  panelFor: (entity: string) => unknown,
): (string | BatteryDeviceConfig)[] =>
  deviceConfigs(reported).map(({ entity }) => {
    const panel = panelFor(entity)
    // The id is the picker's and only the picker's — a panel is asked what to add to a row,
    // never which row it is. Spread first so it cannot answer the second question either.
    const row = deviceConfig({ ...(typeof panel === 'object' ? panel : {}), entity })
    return row === undefined || Object.keys(row).length === 1 ? entity : row
  })

/**
 * Every entity id the card's rendering depends on.
 *
 * This is what `watchedEntities()` answers with, and getting it short would be the quiet
 * kind of bug: `hass` is replaced on every state change anywhere in the installation, so a
 * charging entity left off this list means the bolt appears whenever some unrelated sensor
 * happens to twitch, and not when the phone is plugged in.
 */
export const watchedIds = (value: unknown): string[] =>
  deviceConfigs(value).flatMap(config =>
    config.charging_entity === undefined
      ? [config.entity]
      : [config.entity, config.charging_entity],
  )

/**
 * The level, clamped to the range a ring can draw.
 *
 * `unavailable` and `unknown` are `NaN` through `Number`, which is the whole test — there
 * is no need to name them. The clamp is for the sensor that reports 105 after a firmware
 * update, or −1 while it works out what it has: an arc longer than the circle wraps back
 * over itself and reads as nearly empty.
 */
const readLevel = (state: HassEntity | undefined): number | null => {
  if (state === undefined) return null
  const value = Number(state.state)
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null
}

/**
 * Whether the device is on a charger.
 *
 * A named entity wins outright — somebody who has said where to look has said it. Failing
 * that, the two attribute conventions that travel on the battery sensor itself, and
 * `battery_state` is compared lower-cased because integrations write `Charging`, `charging`
 * and `CHARGING` between them.
 *
 * Everything else is "no", including a charging entity that does not exist. An absent bolt
 * is a widget that has not been told; a bolt on a device sitting on a desk is a widget
 * that is wrong.
 */
export const readCharging = (
  hass: HomeAssistant | undefined,
  config: BatteryDeviceConfig,
  state: HassEntity | undefined,
): boolean => {
  if (config.charging_entity !== undefined) {
    return hass?.states[config.charging_entity]?.state === 'on'
  }

  const attributes = state?.attributes ?? {}
  if (attributes.is_charging === true) return true
  return String(attributes.battery_state ?? '').toLowerCase() === 'charging'
}

/**
 * What the card would call this entity, and what glyph it would give it, if the config
 * overrode neither.
 *
 * Exported because the editor shows exactly these two as the placeholders in the two fields
 * that override them — a placeholder is a promise about what happens when the field is left
 * empty, so it has to be read off the same expression that keeps the promise. The entity id
 * as the last resort for the name rather than an empty string: it is what the user typed,
 * so it is the one name that always identifies the row they meant.
 */
export const inheritedName = (hass: HomeAssistant | undefined, entity: string): string =>
  hass?.states[entity]?.attributes.friendly_name ?? entity

export const inheritedIcon = (hass: HomeAssistant | undefined, entity: string): string => {
  const state = hass?.states[entity]
  return state?.attributes.icon ?? fallbackIcon(state)
}

export const readDevice = (
  hass: HomeAssistant | undefined,
  config: BatteryDeviceConfig,
): BatteryDevice => {
  const state = hass?.states[config.entity]

  return {
    id: config.entity,
    name: config.name ?? inheritedName(hass, config.entity),
    icon: config.icon ?? inheritedIcon(hass, config.entity),
    level: readLevel(state),
    charging: readCharging(hass, config, state),
  }
}

export const readDevices = (hass: HomeAssistant | undefined, value: unknown): BatteryDevice[] =>
  deviceConfigs(value).map(config => readDevice(hass, config))
