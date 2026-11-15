/**
 * Rules about a card's list of rows, shared by every card whose config is a list of
 * entity-keyed objects (chips, tiles, complications, live activities).
 *
 * Born in the chips model, which every later list card then imported from; here so that a tile
 * or an activity does not depend on a chip to know how its own rows are keyed.
 */

/** An empty form field reports as an empty string; this reads it as absent. */
export const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/**
 * A stable key per row, for a list control's `repeat` and for whatever it remembers per row.
 *
 * The entity id, which is what the battery card's list uses and what makes a dragged row keep
 * its open panel — except that a config may legally name the same entity twice. The cards draw
 * both, so the editor has to render both, and two rows sharing a key is the one thing `repeat`
 * cannot be handed. Later occurrences get a `#1`, `#2` suffix, so the ordinary config is keyed
 * exactly as it was and the odd one renders instead of throwing.
 *
 * The suffix is positional, so dragging one duplicate past the other renames both keys and
 * closes their panels. That is the whole cost, it falls only on a config that names one entity
 * twice, and the alternative — an identity a row does not have — would be a worse lie.
 *
 * A row with no entity at all is keyed by its own position, `#<index>`, prefixed so it can
 * never collide with an entity id (`domain.object_id` always contains a `.` and never starts
 * with `#`) or with a `#1`-suffixed duplicate above. It pays the identical cost: dragging a
 * spacer past another entity-less row renames both and closes their panels. Converting a
 * spacer into an entity-bearing row by typing an entity into it pays the cost the other
 * direction — its key changes from positional to the entity id, so its panel closes on that
 * one edit, which is the same trade-off this function already accepts for a renamed entity.
 */
export const rowKeys = <Row extends { entity?: string | undefined }>(
  rows: readonly Row[],
): string[] => {
  const seen = new Map<string, number>()
  return rows.map((row, index) => {
    if (row.entity === undefined) return `#${index}`
    const before = seen.get(row.entity) ?? 0
    seen.set(row.entity, before + 1)
    return before === 0 ? row.entity : `${row.entity}#${before}`
  })
}

/**
 * A whole list on its way back into the config.
 *
 * Here rather than in an editor because it is a rule about the config rather than about a
 * control, and because it is the half of the editor a test can reach without a browser.
 *
 * A row with nothing but an entity in it is written back as a bare string, so a config someone
 * hand-wrote as a plain id list does not sprout objects just because they opened a panel and
 * closed it again — the same rule `mergeEntities` keeps for the cards whose lists still go
 * through a picker.
 *
 * Nothing is ever dropped here. Clearing a row's entity used to be Home Assistant's own reading
 * of "delete this row", the one it gives its own entities card — but that gesture is now how a
 * chip *becomes* a spacer or a templated chip, so a row that came in without a usable entity
 * goes back out the same way, minus the entity key itself: `entity: ''` sitting in a config
 * would mean the same thing as no key at all, just less legibly.
 */
export const configRows = <Row extends { entity?: string | undefined }>(
  rows: readonly Row[],
): (string | Row)[] =>
  rows.map(row => {
    if (typeof row.entity === 'string' && row.entity !== '') {
      return Object.keys(row).length === 1 ? row.entity : row
    }
    // Destructured away rather than deleted or set to `undefined`, for
    // `exactOptionalPropertyTypes`: the key must be absent, not present-and-undefined.
    const { entity, ...rest } = row
    void entity
    return rest as Row
  })
