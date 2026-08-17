/**
 * The one piece of the editor's `entities` round trip that is not an identity function.
 *
 * `ha-entities-picker` (what the `multiple: true` entity selector renders) can only ever
 * report a bare `string[]` of ids — see `EntitySelector` in `core/types/ha.ts` — but a row
 * of this card's `entities` may be an object carrying a `name`, `icon`, `min`, `max` or
 * `color` override (`ComplicationEntityConfig`, in `model.ts`). Handing the picker's report
 * straight back to `applyFormData`, the way a plain `ha-form` field would, is data loss:
 * every override on every row would be replaced by a bare id the moment somebody so much as
 * reordered the list in the visual editor.
 *
 * This is exactly the shape `CupertinoCardEditor`'s `toForm`/`fromForm` pair exists for — "a
 * list whose rows are only slightly more than a selector can say" — rather than the
 * hand-rolled list control the battery card reaches for for its own `entities`. The battery
 * card's rows want real *editing* (an accordion of fields per device); this card's rows only
 * need to *survive* a form the visual editor never lets the user touch beyond add, remove and
 * reorder. `complication-card-editor.ts`'s `toForm` flattens `entities` to ids for the picker
 * to render; `mergeEntities` here is `fromForm`'s other half, rebuilding the object rows the
 * picker cannot express.
 */

import { entityRows } from '../../core/entity-view'
import type { ComplicationEntityConfig } from './model'

/**
 * Rebuild `entities` from the ids the picker reported, restoring each id's prior override
 * row rather than flattening every row to a bare string.
 *
 * The reported `ids` are the source of truth for *which* entities are configured and in
 * *what order* — an id missing from it was removed, one present that was not in `prior` was
 * just added, and the array's order is whatever the user left the picker in. `prior` is the
 * source of truth for *what each surviving row carried*: matched back by entity id, not by
 * position, since removing or reordering the list must not scramble what is left.
 *
 * A row that carries no override (a bare id, or an object with nothing set but `entity`,
 * which `entityConfigs` treats the same) round-trips as a bare string rather than as
 * `{ entity: id }`: a config someone hand-wrote as a plain string list should not sprout
 * objects just because it passed through the visual editor once.
 *
 * Duplicate ids in `prior` (a config can name the same entity twice, however unlikely) are
 * matched in the order they appear: the first occurrence of an id in `ids` claims the first
 * stored row for that id, the second occurrence claims the second, and so on. An occurrence
 * with no row left to claim (more copies of an id were reported than `prior` had rows for —
 * only possible if a de-duplicated picker somehow reported one id twice) falls back to a
 * bare string rather than reusing an already-claimed row, so no override is ever attributed
 * to two rows at once.
 */
export const mergeEntities = (
  prior: unknown,
  ids: readonly string[],
): (string | ComplicationEntityConfig)[] => {
  const queues = new Map<string, ComplicationEntityConfig[]>()
  for (const row of entityRows<ComplicationEntityConfig>(prior)) {
    const queue = queues.get(row.entity)
    if (queue) queue.push(row)
    else queues.set(row.entity, [row])
  }

  return ids.map(id => {
    const row = queues.get(id)?.shift()
    return row && Object.keys(row).length > 1 ? row : id
  })
}
