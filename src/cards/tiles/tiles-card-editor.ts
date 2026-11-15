import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import {
  FLOATING_CONTAINER_FIELD,
  FLOATING_CONTAINER_HELPER,
  FLOATING_DEFAULT_CONTAINER,
} from '../../core/container'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { TilesCardConfig } from './tiles-card'
import { COLOR_CUSTOM, COLOR_SELECTOR, foldColor, splitColor } from '../../core/color-form'
// Imported for the side effect as well as the type: the list element has to be defined by the
// time this editor renders it, and this is the only thing that reaches it.
import './tile-list-editor'
import type { TilesChangedDetail } from './tile-list-editor'
import {
  DEFAULT_FLOW,
  DEFAULT_ORIENTATION,
  DEFAULT_WASH,
  MAX_STATE_LINES,
  TILE_FLOWS,
  TILE_ORIENTATIONS,
  TILE_WASHES,
  tileConfigs,
} from './model'

export const TILES_EDITOR_TAG = 'cupertino-plus-tiles-editor'

const FLOW_LABELS: Record<string, string> = {
  wrap: 'Wrap onto more lines',
  row: 'One line per row',
}

const ORIENTATION_LABELS: Record<string, string> = {
  vertical: 'Icon above the name',
  horizontal: 'Icon beside the name',
}

const WASH_LABELS: Record<string, string> = {
  hover: 'On hover or press',
  always: 'Always',
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
  rows.push(FLOATING_CONTAINER_FIELD)
  // Directly under Background, because the two are one question in practice: how much a tile
  // paints behind its content.
  rows.push({
    name: 'wash',
    selector: {
      select: {
        mode: 'dropdown',
        options: TILE_WASHES.map(value => ({ value, label: WASH_LABELS[value] ?? value })),
      },
    },
  })
  // The shape of a tile, and then how many lines its state may take, which is the one thing
  // about a tile's height a user decides.
  rows.push({
    name: 'orientation',
    selector: {
      select: {
        mode: 'dropdown',
        options: TILE_ORIENTATIONS.map(value => ({
          value,
          label: ORIENTATION_LABELS[value] ?? value,
        })),
      },
    },
  })
  rows.push({
    name: 'state_lines',
    selector: { number: { min: 1, max: MAX_STATE_LINES, step: 1, mode: 'slider' } },
  })
  // Last, because it is the one question that is not about the tile itself.
  rows.push({
    name: 'flow',
    selector: {
      select: {
        mode: 'dropdown',
        options: TILE_FLOWS.map(value => ({ value, label: FLOW_LABELS[value] ?? value })),
      },
    },
  })
  return rows
}

const LABELS: Record<string, string> = {
  color: 'Tile colour',
  color_custom: 'Custom colour',
  container: 'Background',
  wash: 'Colour wash',
  orientation: 'Tile shape',
  state_lines: 'Lines of state',
  flow: 'Rows',
}

const HELPERS: Record<string, string> = {
  color: 'Tints every tile in the card. A tile can say otherwise in its own panel above.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  container: FLOATING_CONTAINER_HELPER,
  wash: 'When a tile fills with its colour. Its glyph always carries the colour either way.',
  orientation:
    'Beside the name is a shorter, wider tile: one grid row tall, for a column of status rows.',
  state_lines:
    'How many lines the state may wrap onto before it is cut short. Every tile grows to fit.',
  flow: 'What a row too long for the card does. One line per row narrows its tiles to fit instead; a break still starts a new row.',
}

/**
 * The tiles card's visual editor: the tile list, then the four card-level questions, then the
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

  /**
   * Shown rather than blank: an unset dropdown reads as broken, not as a default. Both written
   * through on the first edit, as Home Assistant's own editors do with theirs.
   */
  protected override defaults(): Partial<TilesCardConfig> {
    return {
      container: FLOATING_DEFAULT_CONTAINER,
      wash: DEFAULT_WASH,
      orientation: DEFAULT_ORIENTATION,
      state_lines: 1,
      flow: DEFAULT_FLOW,
    }
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
   * `splitColor` has why a genuine tint clears the remembered flag.
   */
  protected override toForm(config: TilesCardConfig): Record<string, unknown> {
    const data: Record<string, unknown> = { ...config }
    this._colorCustom = splitColor(data, this._colorCustom)
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
    this._colorCustom = foldColor(folded)
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
        .rows=${tileConfigs(this._config.tiles)}
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
