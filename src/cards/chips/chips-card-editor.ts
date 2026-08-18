import { CupertinoCardEditor } from '../../core/card-editor'
import { mergeEntities } from '../../core/entities-form'
import { watchedIds } from '../../core/entity-view'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { ChipsCardConfig } from './chips-card'
import { CHIP_CONTENTS, DEFAULT_CONTAINER, DEFAULT_CONTENT, type ChipConfig } from './model'

export const CHIPS_EDITOR_TAG = 'cupertino-plus-chips-editor'

const CONTENT_LABELS: Record<string, string> = {
  icon: 'Icon only',
  value: 'Icon and reading',
  labeled: 'Icon, name and reading',
}

const CONTAINER_LABELS: Record<string, string> = {
  glass: 'Glass — floats on the dashboard',
  card: 'Card — draws its own surface',
}

const FIELDS: readonly HaFormSchema[] = [
  { name: 'entities', selector: { entity: { multiple: true, reorder: true } }, required: true },
  {
    name: 'content',
    selector: {
      select: {
        mode: 'dropdown',
        options: CHIP_CONTENTS.map(value => ({ value, label: CONTENT_LABELS[value] ?? value })),
      },
    },
  },
  {
    name: 'container',
    selector: {
      select: {
        mode: 'dropdown',
        options: ['glass', 'card'].map(value => ({
          value,
          label: CONTAINER_LABELS[value] ?? value,
        })),
      },
    },
  },
]

const LABELS: Record<string, string> = {
  entities: 'Entities',
  content: 'Chip content',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  entities: 'One chip each, in this order. The row wraps when it runs out of width.',
  content: 'The default for every chip. A single chip can override it in YAML.',
  container:
    'Glass has no card behind it, so a wallpaper shows through. Card is safer on a busy background.',
}

/**
 * The chips card's visual editor.
 *
 * Three rows and the shared scale. Per-chip overrides — a name, an icon, a content mode, a tap
 * action — are YAML, exactly as the complication card's per-row overrides are, and they survive
 * a trip through this form for the same reason: `toForm` flattens `entities` to the bare ids
 * `ha-entities-picker` can render, and `fromForm` puts the rows back with `mergeEntities`
 * rather than letting the picker's report overwrite them.
 */
class CupertinoChipsCardEditor extends CupertinoCardEditor<ChipsCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return FIELDS
  }

  /** Shown rather than blank: an unset dropdown reads as broken, not as a default. */
  protected override defaults(): Partial<ChipsCardConfig> {
    return { content: DEFAULT_CONTENT, container: DEFAULT_CONTAINER }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }

  protected override toForm(config: ChipsCardConfig): Record<string, unknown> {
    return { ...config, entities: watchedIds(config.entities) }
  }

  protected override fromForm(
    config: ChipsCardConfig,
    data: Record<string, unknown>,
    fields: readonly string[],
  ): ChipsCardConfig {
    const next = super.fromForm(config, data, fields)
    const merged = mergeEntities<ChipConfig>(config.entities, watchedIds(next.entities))

    const withEntities: ChipsCardConfig = { ...next }
    if (merged.length === 0) delete withEntities.entities
    else withEntities.entities = merged

    return withEntities
  }
}

defineElement(CHIPS_EDITOR_TAG, CupertinoChipsCardEditor)

export { CupertinoChipsCardEditor }
