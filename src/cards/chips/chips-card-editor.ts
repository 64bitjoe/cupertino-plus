import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { ChipsCardConfig } from './chips-card'
// Imported for the side effect as well as the type: the list element has to be defined by the
// time this editor renders it, and this is the only thing that reaches it.
import './chip-list-editor'
import type { ChipsChangedDetail } from './chip-list-editor'
import { chipConfigs, CHIP_CONTENTS, DEFAULT_CONTAINER, DEFAULT_CONTENT } from './model'

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
  content: 'Chip content',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  content: 'The default for every chip. A chip can say otherwise in its own panel above.',
  container:
    'Glass has no card behind it, so a wallpaper shows through. Card is safer on a busy background.',
}

/**
 * The chips card's visual editor: the chip list, then the two card-level questions, then the
 * **Scale** every card shares.
 *
 * The list is a control of its own rather than an `ha-form` row, which is the whole shape of
 * this file. A chip is an entity plus four things nobody can work out from it — the content
 * mode, the glyph, the caption and what a press does — so its row wants adding, reordering,
 * deleting *and* editing, and `ha-entities-picker` can only ever report a list of ids.
 * `chip-list-editor.ts` draws it, on the model the battery card set.
 *
 * That replaces an earlier arrangement in which those four were YAML-only and `entities` was a
 * picker row kept honest by `mergeEntities` — a reduction taken because the per-chip form
 * looked like it needed two frontend APIs that could not be verified here. It needed neither:
 * `chip-list-editor.ts`'s own note has what it uses instead. YAML written against the old
 * arrangement is the same YAML, and every key of it is now reachable from this dialog.
 *
 * Two things follow from `entities` no longer being a form row. It is not in `fields()`, so
 * `applyFormData` never touches it and the `toForm`/`fromForm` pair is gone — the list reports
 * through `emitConfig` directly, exactly as the battery card's does. And the card-level
 * **Chip content** below is what a chip inherits when its own panel says "Same as the card",
 * which is why its helper points upwards.
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

  /**
   * The chip list, handed the config's rows and trusted to report the whole list back.
   *
   * `chipConfigs` is what makes the list element simple: it takes `entities` however somebody
   * wrote it (a bare id, an object, a scalar where a list was meant) and answers with
   * normalised rows, so the control only ever deals with one shape and a hand-written config
   * cannot make it throw.
   */
  protected override beforeForm(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing

    // The tag is written out rather than interpolated, because a lit template's tag names are
    // part of the template rather than values in it: `<${TAG}>` does not compile. The constant
    // beside it is what `defineElement` was given, and the two have to agree.
    return html`
      <cupertino-plus-chips-list
        .hass=${this.hass}
        .chips=${chipConfigs(this._config.entities)}
        @chips-changed=${this._chipsChanged}
      ></cupertino-plus-chips-list>
    `
  }

  /**
   * The list reported. An empty one drops the key rather than writing `entities: []`, which is
   * what `applyFormData` does for the form's own rows and means the same thing: Home Assistant
   * strips `undefined` out of a config and nothing else, so an empty list would survive into
   * somebody's YAML saying exactly what its absence says.
   */
  private readonly _chipsChanged = (event: CustomEvent<ChipsChangedDetail>): void => {
    event.stopPropagation()
    if (!this._config) return

    const next: ChipsCardConfig = { ...this._config }
    if (event.detail.chips.length === 0) delete next.entities
    else next.entities = event.detail.chips

    this.emitConfig(next)
  }
}

defineElement(CHIPS_EDITOR_TAG, CupertinoChipsCardEditor)

export { CupertinoChipsCardEditor }
