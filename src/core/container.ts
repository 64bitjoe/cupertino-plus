import type { HaFormSchema } from './types/ha'

/**
 * Whether a card paints its theme's opaque surface or a translucent glass one.
 *
 * Born in the chips card as `ChipsContainer`, borrowed by the tiles card, and moved here when
 * the four panel cards (calendar, battery, complication, weather) took the same option: six
 * cards naming one vocabulary from another card's model was a dependency nobody would guess.
 *
 * The vocabulary is shared and the default is not, which is why `containerFor` takes the
 * fallback as an argument rather than exporting one. Chips and tiles default to `glass`, the
 * Lock Screen reading they were designed for. The four panels default to `card`, because that
 * is what every existing dashboard already shows, and an upgrade that repainted a user's
 * calendar translucent would be a change of look nobody asked for.
 *
 * What glass means differs by shape, and that difference is deliberate. A chip or a tile is the
 * glass, and its card paints nothing at all. A panel card keeps its panel: glass there is the
 * same translucent gradient and hairline as a tile's, drawn on `ha-card` itself, with the
 * content still inset from the edge (`.cw-glass` in `theme/base-styles.ts`).
 */
export type CardContainer = 'glass' | 'card'

/** In the order the editors list them. */
export const CARD_CONTAINERS: readonly CardContainer[] = ['glass', 'card']

/**
 * The container a config asks for, or the card's own default when it asks for nothing usable.
 *
 * Exact strings only, so `Glass` falls back rather than guessing: the editor never writes
 * anything else, and a hand-written near miss reading as the default is the quieter failure.
 */
export const containerFor = (raw: unknown, fallback: CardContainer): CardContainer =>
  (CARD_CONTAINERS as readonly unknown[]).includes(raw) ? (raw as CardContainer) : fallback

/**
 * The panel cards' **Background** row, shared by the four editors so they cannot drift.
 *
 * Its own labels rather than the chips and tiles editors' "floats on the dashboard" and
 * "draws its own surface": on a panel both options draw a surface, and what the user is
 * choosing between is a translucent one and their theme's. A dropdown, as theirs is, with the
 * default shown rather than blank (each editor's `defaults()` supplies `card`).
 */
export const PANEL_CONTAINER_FIELD: HaFormSchema = {
  name: 'container',
  selector: {
    select: {
      mode: 'dropdown',
      options: [
        { value: 'glass', label: 'Glass — a translucent panel' },
        { value: 'card', label: 'Card — your theme’s card' },
      ],
    },
  },
}

/** The four panel cards' default: what every dashboard drew before the option existed. */
export const PANEL_DEFAULT_CONTAINER: CardContainer = 'card'

/**
 * The class a panel card puts on its `ha-card`: `cw-glass` for glass, nothing for its theme's
 * card. Every `ha-card` the card renders takes it, the empty and not-configured states included,
 * so a glass card does not flash opaque while it waits for an entity.
 */
export const panelClass = (raw: unknown): string =>
  containerFor(raw, PANEL_DEFAULT_CONTAINER) === 'glass' ? 'cw-glass' : ''
