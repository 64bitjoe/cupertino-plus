import { DEFAULT_ACTION, type ActionConfig, type ActionName } from '../../core/actions'
import {
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  pictureFor,
  VALUE_DASH,
} from '../../core/entity-view'
import { isTemplate, type TemplateRequest } from '../../core/templates'
import { colorValue, tintFor, tintVar } from '../../core/tint'
import type { HomeAssistant } from '../../core/types/ha'
import {
  actionFromForm,
  chipConfigs,
  chipKeys,
  chipRows,
  chipTemplates,
  chipWatchedIds,
  NO_TARGET_ACTION,
  readAction,
  text,
  truthy,
  type TemplateResolver,
} from '../chips/model'

/**
 * What a tile is, and how a config row becomes one.
 *
 * Deliberately the chips model's sibling rather than a copy of it. What a row IS (entity or
 * none, bare string or object, templates in the same five fields) is the same question, so the
 * row-reading, the template request, the keys and the action form are the chips model's own
 * functions, imported. What differs is what a tile draws: always icon, name and state, so no
 * `content`; a fixed-width grid, so no `fill`; and an entity-less tile is a navigation tile,
 * never a spacer.
 */

/** One tile's configuration: a chip's, less `content` and `fill`. */
export interface TileConfig {
  entity?: string
  name?: string
  icon?: string
  color?: string
  value?: string
  show?: string
  break?: boolean
  tap_action?: ActionConfig
}

/** One tile, resolved against `hass` and ready to draw. */
export interface TileView {
  entityId: string | undefined
  name: string
  icon: string
  picture: string | undefined
  value: string
  color: string | undefined
  unavailable: boolean
  visible: boolean
  break: boolean
  action: ActionConfig
}

export interface TilesDefaults {
  color?: string
}

/** A tile with no icon is a shortcut, not an unreadable sensor, so it is not an eye. */
export const TILE_FALLBACK_ICON = 'mdi:apps'

/** Rows are read exactly as chips are; the extra keys a chip may carry are simply never read. */
export const tileConfigs = (tiles: unknown): TileConfig[] => chipConfigs(tiles)

/** Every entity id this card depends on; an entity-less tile contributes nothing. */
export const tileWatchedIds = (tiles: unknown): string[] => chipWatchedIds(tiles)

/**
 * Every template a config asks for. The rule (`variables` only when the row has an entity, none
 * at all otherwise) is the chips model's, kept in one place because the element rebuilds the
 * identical `requestKey` from it; a second copy is where the two would drift.
 */
export const tileTemplates = (tiles: unknown, defaults: TilesDefaults): TemplateRequest[] =>
  chipTemplates(tiles, defaults)

export const readTiles = (
  hass: HomeAssistant,
  tiles: unknown,
  defaults: TilesDefaults,
  resolve?: TemplateResolver,
): TileView[] => tileConfigs(tiles).map(row => readTile(hass, row, defaults, resolve))

export const readTile = (
  hass: HomeAssistant | undefined,
  row: TileConfig,
  defaults: TilesDefaults = {},
  resolve: TemplateResolver = () => undefined,
): TileView => {
  const field = (raw: string | undefined, entity: string | undefined): string | undefined => {
    if (!isTemplate(raw)) return raw
    const result = resolve(raw, entity)
    return result === undefined || result === '' ? undefined : result
  }

  const visible = row.show === undefined ? true : truthy(field(row.show, row.entity))
  const name = field(row.name, row.entity)
  const icon = field(row.icon, row.entity)
  const configured = (): string | undefined =>
    colorValue(field(row.color, row.entity) ?? field(defaults.color, undefined))

  // A navigation tile: it draws what it was given, and a dash where the state would be so the
  // grid stays regular.
  if (row.entity === undefined) {
    return {
      entityId: undefined,
      name: name ?? '',
      icon: icon ?? TILE_FALLBACK_ICON,
      picture: undefined,
      value: field(row.value, row.entity) ?? VALUE_DASH,
      color: configured(),
      unavailable: false,
      visible,
      break: row.break === true,
      action: readAction(row.tap_action, field, row.entity, NO_TARGET_ACTION),
    }
  }

  const action = readAction(row.tap_action, field, row.entity, DEFAULT_ACTION)
  const entity = hass?.states[row.entity]

  if (!hass || !entity) {
    return {
      entityId: row.entity,
      name: name ?? row.entity,
      icon: icon ?? TILE_FALLBACK_ICON,
      picture: undefined,
      value: VALUE_DASH,
      color: undefined,
      unavailable: true,
      visible,
      break: row.break === true,
      action,
    }
  }

  const unavailable = isUnavailable(entity)
  return {
    entityId: row.entity,
    name: name ?? nameFor(entity),
    icon: icon ?? iconFor(entity),
    picture: icon === undefined && !unavailable ? pictureFor(entity) : undefined,
    value: unavailable ? VALUE_DASH : (field(row.value, row.entity) ?? formatValue(hass, entity)),
    // Configured, then card default, then what the entity is. The dim is the signal that a tile
    // is not reporting, so an unavailable tile gets no tint at all.
    color: unavailable ? undefined : (configured() ?? tintVar(tintFor(entity))),
    unavailable,
    visible,
    break: row.break === true,
    action,
  }
}

/** Stable per-row keys for the editor's list. */
export const tileKeys = (rows: readonly TileConfig[]): string[] => chipKeys(rows)

/** Rows as they should be written back: a row saying nothing beyond its id flattens to the id. */
export const tileRows = (rows: readonly TileConfig[]): (string | TileConfig)[] => chipRows(rows)

export const tileToForm = (config: TileConfig): Record<string, unknown> => ({
  entity: config.entity,
  name: config.name,
  icon: config.icon,
  color: config.color,
  value: config.value,
  show: config.show,
  break: config.break === true,
  action:
    config.tap_action?.action ?? (config.entity === undefined ? 'none' : DEFAULT_ACTION.action),
  navigation_path: config.tap_action?.navigation_path,
  service: config.tap_action?.service,
})

/** The inverse, dropping every empty value rather than writing it. */
export const tileFromForm = (prior: TileConfig, data: Record<string, unknown>): TileConfig => {
  const next: TileConfig = {}

  const entity = text(data.entity)
  if (entity !== undefined) next.entity = entity

  for (const key of ['name', 'icon', 'color', 'value', 'show'] as const) {
    const value = text(data[key])
    if (value !== undefined) next[key] = value
  }

  if (data.break === true) next.break = true

  const bareDefault: ActionName = entity === undefined ? 'none' : DEFAULT_ACTION.action

  // Clearing the entity of an untouched tile must not strand its implicit more-info as an
  // explicit action on a tile that now has no entity to show one for.
  const staleDefault =
    entity === undefined && prior.entity !== undefined && prior.tap_action === undefined
  const tapAction = staleDefault ? undefined : actionFromForm(prior.tap_action, data, bareDefault)
  if (tapAction !== undefined) next.tap_action = tapAction

  return next
}
