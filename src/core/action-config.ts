/**
 * An action as a card runs it: a row's configured action with every template in it resolved.
 *
 * The other half of `core/action-form.ts`, which is the action as an editor panel draws it.
 * Shared by every card whose rows carry `tap_action`, `hold_action` and `double_tap_action`.
 */

import type { ActionConfig } from './actions'
import { actionTemplates, ACTION_TEXT_FIELDS, ACTION_TREE_FIELDS, isTemplate } from './templates'

/** A row with nothing to act on defaults to doing nothing, rather than opening a more-info
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
