import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import { isTint } from '../../core/tint'
import type { HaFormSchema } from '../../core/types/ha'
import type { TilesCardConfig } from './tiles-card'
import { COLOR_CUSTOM, COLOR_SELECTOR, DEFAULT_CONTAINER } from '../chips/model'
// Imported for the side effect as well as the type: the list element has to be defined by the
// time this editor renders it, and this is the only thing that reaches it.
import './tile-list-editor'
import type { TilesChangedDetail } from './tile-list-editor'
import { tileConfigs } from './model'

export const TILES_EDITOR_TAG = 'cupertino-plus-tiles-editor'

const CONTAINER_LABELS: Record<string, string> = {
  glass: 'Glass — floats on the dashboard',
  card: 'Card — draws its own surface',
}

/**
 * The card-level fields, as a function of the current form data rather than a constant list:
 * `color_custom` is conditional on `color` reading `COLOR_CUSTOM`, exactly as the per-tile
 * panel's own custom field is — see `fields()` below for how the two stay in agreement.
 */
const fields = (data: Record<string, unknown>): readonly HaFormSchema[] => {
  const rows: HaFormSchema[] = [{ name: 'color', selector: COLOR_SELECTOR }]
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
  color: 'Tile colour',
  color_custom: 'Custom colour',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  color: 'Tints every tile in the card. A tile can say otherwise in its own panel above.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  container:
    'Glass has no card behind it, so a wallpaper shows through. Card is safer on a busy background.',
}

/**
 * The tiles card's visual editor: the tile list, then the two card-level questions, then the
 * **Scale** every card shares.
 *
 * The chips card's editor, adapted: the list is a control of its own (`tile-list-editor.ts`)
 * rather than an `ha-form` row, so `tiles` is not in `fields()` and the list reports through
 * `emitConfig` directly. There is no content row, because a tile always draws icon, name and
 * state. **Tile colour** is what a tile inherits when its own panel leaves Colour empty, which
 * is why its helper points upwards.
 */
class CupertinoTilesCardEditor extends CupertinoCardEditor<TilesCardConfig> {
  /**
   * Whether the card-level Colour is showing its custom text box.
   *
   * A view of the form rather than a fact about the config, for the same reason the per-tile
   * panel's own `_colorCustom` set is: selecting "Custom…" from the dropdown has nothing to
   * write into `color` until a value is typed beside it, and without holding that choice here
   * the field would vanish the instant the dropdown's own change re-rendered the form against a
   * config that still says nothing.
   */
  private _colorCustom = false

  /**
   * `fields()` takes no argument, so it cannot branch on the form's own report the way
   * `tileSchema` does. It reads `this._config` through `toForm` instead — the same data
   * `render()` is about to hand `ha-form` — so the schema and the data agree about whether
   * `color_custom` is showing.
   */
  protected override fields(): readonly HaFormSchema[] {
    return fields(this._config ? this.toForm(this._config) : {})
  }

  /** Shown rather than blank: an unset dropdown reads as broken, not as a default. */
  protected override defaults(): Partial<TilesCardConfig> {
    return { container: DEFAULT_CONTAINER }
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
  protected override toForm(config: TilesCardConfig): Record<string, unknown> {
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
   * `super.fromForm` — writes it through. `tileFromForm` is a rule about the config and is kept
   * ignorant of the two controls; the same reasoning holds here.
   */
  protected override fromForm(
    config: TilesCardConfig,
    data: Record<string, unknown>,
    formFields: readonly string[],
  ): TilesCardConfig {
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
   * The tile list, handed the config's rows and trusted to report the whole list back.
   *
   * `tileConfigs` takes `tiles` however somebody wrote it (a bare id, an object, a scalar where
   * a list was meant) and answers with normalised rows, so the control only ever deals with one
   * shape and a hand-written config cannot make it throw.
   */
  protected override beforeForm(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing

    // The tag is written out rather than interpolated, because a lit template's tag names are
    // part of the template rather than values in it: `<${TAG}>` does not compile. The constant
    // beside it is what `defineElement` was given, and the two have to agree.
    return html`
      <cupertino-plus-tiles-list
        .hass=${this.hass}
        .tiles=${tileConfigs(this._config.tiles)}
        @tiles-changed=${this._tilesChanged}
      ></cupertino-plus-tiles-list>
    `
  }

  /** The list reported. An empty one drops the key rather than writing `tiles: []`. */
  private readonly _tilesChanged = (event: CustomEvent<TilesChangedDetail>): void => {
    event.stopPropagation()
    if (!this._config) return

    const next: TilesCardConfig = { ...this._config }
    if (event.detail.tiles.length === 0) delete next.tiles
    else next.tiles = event.detail.tiles

    this.emitConfig(next)
  }
}

defineElement(TILES_EDITOR_TAG, CupertinoTilesCardEditor)

export { CupertinoTilesCardEditor }
