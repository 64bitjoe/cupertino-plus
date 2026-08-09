import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { ComplicationCardConfig } from './complication-card'
import { COMPLICATION_STYLES, DEFAULT_STYLE, STYLE_LABELS } from './style'
import { TINTS } from './tint'

export const COMPLICATION_EDITOR_TAG = 'cupertino-widgets-complication-editor'

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * Five rows, three of which say "Automatic".
 *
 * That ratio is the card's whole premise: everything derivable is derived, and the fields
 * exist for the cases where the derivation cannot know what somebody meant. A card with
 * only `entities` filled in is already a working card.
 */
const FIELDS: readonly HaFormSchema[] = [
  { name: 'entities', selector: { entity: { multiple: true, reorder: true } }, required: true },
  {
    name: 'style',
    selector: {
      select: {
        mode: 'dropdown',
        options: COMPLICATION_STYLES.map(style => ({ value: style, label: STYLE_LABELS[style] })),
      },
    },
  },
  { name: 'min', selector: { number: { mode: 'box' } } },
  { name: 'max', selector: { number: { mode: 'box' } } },
  {
    name: 'color',
    selector: {
      select: {
        mode: 'dropdown',
        options: TINTS.map(tint => ({ value: tint, label: capitalise(tint) })),
      },
    },
  },
]

const LABELS: Record<string, string> = {
  entities: 'Entities',
  style: 'Style',
  min: 'Minimum',
  max: 'Maximum',
  color: 'Colour',
}

const HELPERS: Record<string, string> = {
  entities: 'One or several. The card lays out however many you give it.',
  min: 'Leave blank and the range comes from the entity. Fill both in to gauge something with no natural range, like room temperature.',
  max: 'Leave blank and the range comes from the entity. Fill both in to gauge something with no natural range, like room temperature.',
  color: 'From what the entity measures. Set one only to overrule it.',
}

/**
 * The complication card's visual editor.
 *
 * Five rows of the card's own — which entities, which of the five faces, an optional
 * range override and an optional colour override — plus the library-wide **Scale** the
 * base class appends. There is deliberately no `size` row: the Layout tab already sets
 * any footprint by dragging, with the card redrawing as you go and `getGridOptions()`
 * setting the floor beneath it, which is the same reasoning the calendar card's editor
 * gives at length for dropping its own preset.
 *
 * `min`/`max`/`color` are card-level overrides beneath a row's own — see
 * `ComplicationEntityConfig` and `range.ts`/`tint.ts` — and read as "Automatic" the
 * moment they are left blank, which is what `helper` says rather than what a bare label
 * would only imply.
 */
class CupertinoComplicationCardEditor extends CupertinoCardEditor<ComplicationCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return FIELDS
  }

  /**
   * A style shown rather than an empty dropdown: an unset control reads as broken, not as a
   * default. The first edit writes it through, which is what HA's own editors do.
   */
  protected override defaults(): Partial<ComplicationCardConfig> {
    return { style: DEFAULT_STYLE }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }
}

defineElement(COMPLICATION_EDITOR_TAG, CupertinoComplicationCardEditor)

export { CupertinoComplicationCardEditor }
