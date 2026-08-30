import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import { isTint } from '../../core/tint'
import type { HaFormSchema } from '../../core/types/ha'
import type { ChipsCardConfig } from './chips-card'
// Imported for the side effect as well as the type: the list element has to be defined by the
// time this editor renders it, and this is the only thing that reaches it.
import './chip-list-editor'
import type { ChipsChangedDetail } from './chip-list-editor'
import {
  chipConfigs,
  CHIP_CONTENTS,
  COLOR_CUSTOM,
  COLOR_SELECTOR,
  DEFAULT_CONTAINER,
  DEFAULT_CONTENT,
} from './model'

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

/**
 * The card-level fields, as a function of the current form data rather than a constant list:
 * `color_custom` is conditional on `color` reading `COLOR_CUSTOM`, exactly as the per-chip
 * panel's own custom field is — see `fields()` below for how the two stay in agreement.
 */
const fields = (data: Record<string, unknown>): readonly HaFormSchema[] => {
  const rows: HaFormSchema[] = [
    {
      name: 'content',
      selector: {
        select: {
          mode: 'dropdown',
          options: CHIP_CONTENTS.map(value => ({ value, label: CONTENT_LABELS[value] ?? value })),
        },
      },
    },
    { name: 'color', selector: COLOR_SELECTOR },
  ]
  if (data.color === COLOR_CUSTOM) {
    rows.push({ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } })
  }
  rows.push({
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
  })
  return rows
}

const LABELS: Record<string, string> = {
  content: 'Chip content',
  color: 'Row colour',
  color_custom: 'Custom colour',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  content: 'The default for every chip. A chip can say otherwise in its own panel above.',
  color: 'Tints every glyph in the row. A chip can say otherwise in its own panel above.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
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
  /**
   * Whether the card-level Colour is showing its custom text box.
   *
   * A view of the form rather than a fact about the config, for the same reason the per-chip
   * panel's own `_colorCustom` set is: selecting "Custom…" from the dropdown has nothing to
   * write into `color` until a value is typed beside it, and without holding that choice here
   * the field would vanish the instant the dropdown's own change re-rendered the form against a
   * config that still says nothing.
   */
  private _colorCustom = false

  /**
   * `fields()` takes no argument, so it cannot branch on the form's own report the way
   * `chipSchema` does. It reads `this._config` through `toForm` instead — the same data
   * `render()` is about to hand `ha-form` — so the schema and the data agree about whether
   * `color_custom` is showing.
   */
  protected override fields(): readonly HaFormSchema[] {
    return fields(this._config ? this.toForm(this._config) : {})
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
   * The dropdown holds a palette name, `''`, or the `COLOR_CUSTOM` sentinel; `color_custom`
   * holds the literal when it does. Split here rather than have `fromForm` guess: this is the
   * one place that knows both the config's `color` and the sentinel at once.
   *
   * A config naming a real palette colour clears `_colorCustom` before it is read, however
   * that config arrived — including a YAML edit, which reaches this editor only through
   * `setConfig` and never through `fromForm`. Left unclear, a card switched to `Custom…` and
   * back to a plain `color: red` in YAML would still show "Custom…" here with "red" pre-filled
   * into the text box: a valid palette name misrepresented as a custom one. So a genuine tint
   * always wins and clears the flag; only then does the flag get to speak for an otherwise
   * empty colour, which is what lets picking "Custom…" and typing nothing yet still show the
   * text box.
   */
  protected override toForm(config: ChipsCardConfig): Record<string, unknown> {
    const data: Record<string, unknown> = { ...config }
    const configured = typeof config.color === 'string' ? config.color : ''
    if (configured && isTint(configured)) {
      this._colorCustom = false
    } else if (this._colorCustom || configured) {
      data.color = COLOR_CUSTOM
      data.color_custom = configured
    }
    return data
  }

  /**
   * The two controls folded back into the one `color` key, before `applyFormData` — by way of
   * `super.fromForm` — writes it through. `chipFromForm`'s own note explains why this is a
   * rule about the config kept out of the row-level translation; the same reasoning holds here.
   */
  protected override fromForm(
    config: ChipsCardConfig,
    data: Record<string, unknown>,
    formFields: readonly string[],
  ): ChipsCardConfig {
    const folded = { ...data }
    // Remembered the same way `toForm` reads it back, and for the same reason: this is the
    // only moment the editor learns the dropdown wants the text box, and nothing about a still
    // empty `color_custom` belongs in the config.
    this._colorCustom = folded.color === COLOR_CUSTOM
    if (folded.color === COLOR_CUSTOM) folded.color = folded.color_custom
    delete folded.color_custom
    return super.fromForm(config, folded, formFields)
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
