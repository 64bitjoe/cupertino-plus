/**
 * What an editor does to a list of entities on its way back into a config.
 *
 * Two functions, and neither of them is the identity: `mergeEntities` for the list that went
 * through a picker, `moveRow` for the one that was dragged.
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
 *
 * Generic since the chips card arrived: the rule ("a row is worth keeping when it says more
 * than its own id") is about the picker, not about what any one card's rows carry, and the
 * `Object.keys(row).length > 1` test that implements it never needed to know either.
 */

import { entityRows, type EntityRow } from './entity-view'

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
export const mergeEntities = <T extends EntityRow = EntityRow>(
  prior: unknown,
  ids: readonly string[],
): (string | T)[] => {
  const queues = new Map<string, T[]>()
  for (const row of entityRows<T>(prior)) {
    const queue = queues.get(row.entity)
    if (queue) queue.push(row)
    else queues.set(row.entity, [row])
  }

  return ids.map(id => {
    const row = queues.get(id)?.shift()
    return row && Object.keys(row).length > 1 ? row : id
  })
}

/**
 * A row moved from one place in the list to another: everything about a drag except the
 * dragging, which is `ha-sortable`'s and reaches an editor as a pair of indices.
 *
 * It lived in `battery/model.ts` until the chips card grew a list control of its own, with a
 * note saying it would move the day a second card wanted one. This is that day, and here is
 * where it belongs: there is nothing about a battery or a chip in it, and this module is
 * already the place the library keeps what an editor does to a list of entities on its way
 * back into a config.
 *
 * Out-of-range indices are a no-op rather than a throw. `ha-sortable` reports what it dragged
 * and is not the only thing that could ever call this; a list editor is not a place to find
 * out about an off-by-one by having the dialog go blank.
 */
export const moveRow = <T>(rows: readonly T[], from: number, to: number): T[] => {
  const next = [...rows]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}
