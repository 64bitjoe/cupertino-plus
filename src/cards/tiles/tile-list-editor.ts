/**
 * The tiles card's tile list, as one control.
 *
 * A third copy of the chips card's list editor, adapted, and deliberately not shared with it:
 * extracting one sortable-panel-list from the battery, chips and tiles editors is a refactor of
 * two shipped editors that nothing below the DOM tests, and doing it while writing a third
 * consumer would make a bug in the extraction indistinguishable from a bug in this card. The
 * three working editors are the specification for that follow-up, which is recorded in the
 * rules doc. Until then `chips/chip-list-editor.ts` carries the long arguments (why an element
 * of its own rather than `ha-form` rows, which Home Assistant elements may be rendered and why
 * the add control waits for `ha-entity-picker`); this file says only where it differs.
 *
 * It differs by what a tile is. There is no content dropdown, because a tile always draws icon,
 * name and state, and no fill switch, because a tile grid has fixed-width cells. An entity-less
 * tile is a navigation tile rather than a spacer, so a blank tile is a real thing to add and the
 * panel opens in template mode for it.
 */

import { mdiContentCopy, mdiDrag, mdiPlus, mdiTrashCanOutline } from '@mdi/js'
import { LitElement, css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { ACTION_NAMES } from '../../core/actions'
import { moveRow } from '../../core/entities-form'
import { defineElement } from '../../core/register'
import { isTemplate } from '../../core/templates'
import { isTint } from '../../core/tint'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import { COLOR_CUSTOM, COLOR_SELECTOR, inheritedIcon, inheritedName } from '../chips/model'
import { readTile, tileFromForm, tileKeys, tileRows, tileToForm, type TileConfig } from './model'

export const TILES_LIST_TAG = 'cupertino-plus-tiles-list'

/** The event this element reports with. The detail is the whole list, in order. */
export interface TilesChangedDetail {
  tiles: (string | TileConfig)[]
}

/**
 * What a tile may point at: anything at all.
 *
 * Stated rather than left implicit, because the battery card's list filters hard and the
 * missing filter here is a decision, not an omission. A tile draws a name, a glyph and a
 * reading, and `core/entity-view.ts` has an answer for all three whatever the domain — a lock,
 * a person, a script, a sensor. There is no class of entity this card is worse at than the
 * tiles it is meant to replace, so there is none to hide.
 */
const ANY_ENTITY = { entity: {} } as const

const ACTION_LABELS: Record<string, string> = {
  'more-info': 'Open more-info',
  toggle: 'Toggle it',
  navigate: 'Go to a view',
  'call-service': 'Call a service',
  none: 'Nothing',
}

const option = (labels: Record<string, string>) => (value: string) => ({
  value,
  label: labels[value] ?? value,
})

/**
 * A dropdown rather than the radio list `select` would choose for itself.
 *
 * Under six options `ha-selector-select` renders radios, and five of them inside a panel that
 * already holds other fields is a lot of room. The mode is a statement about the room a control
 * is in, and the room here is an accordion row in a dialog.
 */
const ACTION_SELECTOR = {
  select: { mode: 'dropdown' as const, options: [...ACTION_NAMES].map(option(ACTION_LABELS)) },
}

/**
 * A text field whose placeholder is a real inherited value, or none at all.
 *
 * `exactOptionalPropertyTypes` makes `{ text: { placeholder: undefined } }` a type error — the
 * flag treats an optional property as either present with a real value or entirely absent,
 * never present-and-undefined — so a tile with nothing to inherit (no entity) gets the key left
 * out altogether. That is also the honest answer, not a workaround for the type: there IS no
 * placeholder to promise for an entity-less tile's Icon or Name, because the card draws
 * nothing for either field left empty on one, exactly as it draws nothing for the tile as a
 * whole when every field is.
 */
const textSelector = (placeholder: string | undefined): { text: { placeholder?: string } } =>
  placeholder !== undefined ? { text: { placeholder } } : { text: {} }

const iconSelector = (placeholder: string | undefined): { icon: { placeholder?: string } } =>
  placeholder !== undefined ? { icon: { placeholder } } : { icon: {} }

/**
 * One tile's fields: what the tile *is*, and then what a press *does*.
 *
 * The order is the one somebody fills a panel in: an entity, a decision about what it should
 * look like, two overrides they will usually skip, and then the interesting part.
 * The entity is not `required` any more: clearing it is how a tile becomes a navigation tile
 * or a templated one, not a mistake the form should flag.
 *
 * The two placeholders are what the card would draw if the fields were left empty, so a panel
 * reads as "this is what you will get" rather than as a blank to be guessed at. They come from
 * `model.ts` rather than from `context: { icon_entity: … }`, so that the promise the greyed-out
 * text makes is kept by the same code that would have to keep it.
 *
 * The last row is the argument the chosen action takes, and there is at most one: an action
 * that needs nothing gets no field, and a `navigation_path` is never shown beside a `toggle`
 * because a control offering an argument that will be ignored is a control that lies. Outside
 * templating mode, that one field is Home Assistant's own view picker rather than a path typed
 * by hand — `NavigationSelector` in `core/types/ha.ts` has what was checked before using it. A
 * template cannot be typed into a picker, so templating mode keeps the plain text box instead.
 *
 * `templating` swaps the Icon and Colour pickers — neither of which a template can be typed
 * into — for plain text boxes, hides the Colour dropdown's own `color_custom` field (moot once
 * `color` is text already), and appends Reading and Show when, which only ever make sense as
 * templates. The switch itself is drawn last, by the element, because it is not a fact about
 * a tile's config at all; see `_templating` on the element.
 */
const tileSchema = (
  hass: HomeAssistant | undefined,
  config: TileConfig,
  data: Record<string, unknown>,
  templating: boolean,
  first: boolean,
): readonly HaFormSchema[] => {
  const rows: HaFormSchema[] = [
    { name: 'entity', selector: ANY_ENTITY },
    templating
      ? { name: 'color', selector: { text: {} } }
      : { name: 'color', selector: COLOR_SELECTOR },
    ...(!templating && data.color === COLOR_CUSTOM
      ? [{ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } }]
      : []),
    templating
      ? { name: 'icon', selector: { text: {} } }
      : { name: 'icon', selector: iconSelector(inheritedIcon(hass, config.entity)) },
    { name: 'name', selector: textSelector(inheritedName(hass, config.entity)) },
    ...(first ? [] : [{ name: 'break', selector: { boolean: {} } as const }]),
    { name: 'action', selector: ACTION_SELECTOR },
  ]

  if (data.action === 'navigate') {
    rows.push({
      name: 'navigation_path',
      selector: templating ? { text: { placeholder: '/lovelace/0' } } : { navigation: {} },
    })
  }
  if (data.action === 'call-service') {
    rows.push({ name: 'service', selector: { text: { placeholder: 'script.goodnight' } } })
  }

  if (templating) {
    rows.push({ name: 'value', selector: { text: { placeholder: "{{ states('sensor.a') }}" } } })
    rows.push({
      name: 'show',
      selector: { text: { placeholder: "{{ is_state('light.a','on') }}" } },
    })
  }

  rows.push({ name: 'templating', selector: { boolean: {} } })

  return rows
}

/**
 * The add control, as a plain field, for as long as the real picker is undefined.
 *
 * It excludes what the list already holds, the same as the picker below does. Without it the
 * control offers a tile that is already there, `_addTile` refuses it, and the only thing the
 * user sees is a field that filled itself in and did nothing.
 */
const addSchema = (taken: readonly string[]): readonly HaFormSchema[] => [
  { name: 'entity', selector: { entity: { exclude_entities: [...taken] } } },
]

const LABELS: Record<string, string> = {
  entity: 'Entity',
  color: 'Colour',
  color_custom: 'Custom colour',
  icon: 'Icon',
  name: 'Name',
  action: 'When pressed',
  navigation_path: 'Path',
  service: 'Service',
  templating: 'Use templates',
  break: 'Start a new row',
  value: 'Reading',
  show: 'Show when',
}

/**
 * Not localised, like the rest of the library's own words: Home Assistant has a translated
 * string for a list of entities and none for any of this.
 */
const HELPERS: Record<string, string> = {
  entity:
    'Leave this blank for a navigation tile: one that only goes somewhere, built from the fields below.',
  color: 'Tints this tile. Leave it empty for the colour its entity would get.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  icon: "Overrides the entity's own glyph.",
  name: 'The caption under the icon, and the screen-reader label.',
  action: 'A tile set to Nothing is not drawn as a button at all: no tab stop, no pressed state.',
  navigation_path: 'A dashboard path, as the URL bar shows it.',
  service: 'As domain.service. Its data and target stay in YAML.',
  templating:
    'Swaps the icon and colour pickers for text boxes, so you can write a template in them.',
  break: 'This tile begins a new row. A row still wraps on its own if it runs out of width.',
  value: "Replaces what the tile prints. Falls back to the entity's own reading if it is empty.",
  show: 'The tile is drawn only while this is true. Hidden until it answers.',
}

const ADD_LABEL = 'Add a tile'
const ADD_BLANK_LABEL = 'Add a blank tile'

const ADD_HELPER =
  'Any entity at all: a tile has a name, a glyph and a reading for whatever you point it at. ' +
  'One already in the list is not offered again. A blank tile needs no entity — give it a ' +
  'name, icon or reading of its own below, with a template or a plain one, to make a ' +
  'shortcut that only goes somewhere.'

class CupertinoTilesList extends LitElement {
  /**
   * Home Assistant's own furniture, not ours: no `--cw-*` token appears here, for the reason
   * `CupertinoCardEditor` gives — a widget that looks like a phone's should still have a config
   * panel that looks like the dialog it is sitting in. The rules below are the battery list's,
   * kept identical on purpose: two list controls in one library that were spaced differently
   * would read as two libraries.
   */
  static override styles: CSSResultGroup = css`
    :host {
      display: block;
    }

    .tiles {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Aligned to the top rather than centred: the panel grows downwards when it is opened,
       and a handle that centred itself against an expanded panel would drift away from the row
       it drags. 48px is ha-expansion-panel's own summary height. */
    .tile {
      display: flex;
      align-items: flex-start;
    }

    .handle {
      display: flex;
      align-items: center;
      height: 48px;
      padding-inline-end: 8px;
      color: var(--secondary-text-color);
      cursor: grab;
    }

    /* Otherwise a drag that starts on the glyph is a drag of the glyph, and the row stays
       where it is. */
    .handle > * {
      pointer-events: none;
    }

    ha-expansion-panel {
      flex: 1;
      min-width: 0;
    }

    ha-expansion-panel ha-icon {
      color: var(--secondary-text-color);
    }

    .remove {
      --ha-icon-button-size: 36px;
      color: var(--secondary-text-color);
    }

    .fields {
      display: block;
      padding: 8px 0 16px;
    }

    .add {
      margin-top: 16px;
    }

    /* A plain element rather than an HA custom one: unlike ha-entity-picker, whose fallback
       while undefined is documented at the top of this file, nothing else here needs this
       button to exist before it can be pressed, so there is no reason to risk it rendering as
       nothing during the same window ha-entity-picker sometimes does.

       Drawn as a real outlined button on its own line rather than the bare text link this was
       first shipped as. Sitting inline beside the picker's own solid button, a borderless link
       read as that button's caption rather than as the second of two ways to add a tile, and
       the feature was reported missing twice by somebody looking straight at it. Outlined
       rather than solid keeps the ordinary path visually primary. */
    .blank {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-top: 8px;
      padding: 0 16px;
      height: 40px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4));
      border-radius: 9999px;
      background: none;
      color: var(--primary-color);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .blank:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    }

    .blank:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }

    /* The add control's own line rather than the helper of whichever of the two controls is
       standing there: the button mode draws no helper, and a hint that came and went with the
       control would be a hint nobody reads. */
    .hint {
      margin: 6px 0 0;
      color: var(--secondary-text-color);
      font-size: 12px;
    }

    .empty {
      margin: 0 0 16px;
      color: var(--secondary-text-color);
      font-size: 13px;
    }
  `

  @property({ attribute: false }) public hass?: HomeAssistant

  /** Normalised by the editor into config objects. A row may have no entity: a blank tile is a navigation shortcut. */
  @property({ attribute: false }) public tiles: readonly TileConfig[] = []

  /**
   * Whether `ha-entity-picker` has been defined yet, and so whether the add control can be
   * the button. It resolves itself; see the note at the top of the file.
   */
  @state() private _pickerReady = customElements.get('ha-entity-picker') !== undefined

  /**
   * Which panels are open, by row key.
   *
   * Held here rather than left to each `ha-expansion-panel`, because this element re-renders
   * from the config on every keystroke: an `expanded` that only lived in the panel would be
   * whatever the recycled DOM node happened to have. By key and not by position so a dragged
   * row keeps its panel open, which is also why the rows are keyed below.
   */
  private readonly _open = new Set<string>()

  /**
   * Which tiles are showing their template fields, by row key.
   *
   * A view of a row rather than a property of one, so it writes no config key — the same
   * arrangement `_open` already uses for which panels are expanded. `icon` is an icon picker
   * and `color` is a dropdown, and a template cannot be typed into either; this switch swaps
   * both for plain text boxes and reveals the two fields that only make sense as templates.
   */
  private readonly _templating = new Set<string>()

  /**
   * On by default for a tile whose config already holds a template, so a config written in
   * YAML opens showing what it actually says rather than a picker that cannot represent it.
   * `_addBlank` seeds this set for the same reason on a freshly added blank tile — templates
   * and literals are the only way an entity-less row ever gets content, so it opens ready for
   * one — but it is a starting point rather than a rule: the switch can still be turned off
   * afterwards for a tile that only ever wanted a plain icon and name.
   */
  private _isTemplating(config: TileConfig, key: string): boolean {
    if (this._templating.has(key)) return true
    return [config.name, config.icon, config.color, config.value, config.show].some(isTemplate)
  }

  /**
   * Which tiles are showing the custom-colour text box, by row key.
   *
   * A view of a row, exactly like `_templating` above: selecting "Custom…" from the Colour
   * dropdown has nothing to write into the config until a value is typed into the field beside
   * it. Without holding that choice somewhere of its own, the very re-render the dropdown's own
   * change causes would find `color` still unset, decide the row was never in custom mode, and
   * the field the user just asked for would never appear.
   */
  private readonly _colorCustom = new Set<string>()

  private readonly _computeLabel = (schema: HaFormSchema): string =>
    LABELS[schema.name] ?? schema.name

  private readonly _computeHelper = (schema: HaFormSchema): string | undefined =>
    HELPERS[schema.name]

  private readonly _computeAddLabel = (): string => ADD_LABEL

  public override connectedCallback(): void {
    super.connectedCallback()
    if (this._pickerReady) return
    void customElements.whenDefined('ha-entity-picker').then(() => {
      this._pickerReady = true
    })
  }

  private _emit(rows: readonly TileConfig[]): void {
    this.dispatchEvent(
      new CustomEvent<TilesChangedDetail>('tiles-changed', {
        detail: { tiles: tileRows(rows) },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * One row's form reported. It carries the whole row, so it replaces the whole row.
   *
   * `tileFromForm` never drops a row any more — clearing the Entity field turns a tile into a
   * navigation or templated tile rather than deleting it, so every edit here replaces the row in
   * place. The trash icon (`_remove`) is the only way this control removes one.
   */
  private readonly _rowChanged = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
    index: number,
    key: string,
  ): void => {
    event.stopPropagation()

    const prior = this.tiles[index]
    if (!prior) return

    // The switch is a view of the row, not a fact about its config: read it into `_templating`
    // and then remove it, so it never reaches `tileFromForm` or the config beyond it.
    const value = { ...event.detail.value }
    if (typeof value.templating === 'boolean') {
      if (value.templating) this._templating.add(key)
      else this._templating.delete(key)
    }
    delete value.templating

    // Remembered the same way as the switch above, and for the same reason: the dropdown
    // reporting `COLOR_CUSTOM` is the only moment this editor learns the row wants the text
    // box, and nothing about a still-empty `color_custom` belongs in the config.
    if (value.color === COLOR_CUSTOM) this._colorCustom.add(key)
    else this._colorCustom.delete(key)

    // The dropdown and its custom field are two controls for one key. Folded here rather than
    // in `tileFromForm`, which is a rule about the config and should not know that the editor
    // draws this as two things.
    if (value.color === COLOR_CUSTOM) value.color = value.color_custom
    delete value.color_custom

    const row = tileFromForm(prior, value)
    const next = [...this.tiles]
    next[index] = row

    // The panel stays open across the rename that a changed entity amounts to. Only for a row
    // whose key is its own entity id: a `#1` suffix or a `#<index>` blank-tile key is positional
    // (see `tileKeys`), and the new one is not this row's to guess — the same cost that
    // function's own note already accepts for a dragged duplicate, extended here to a blank tile
    // that gains or loses its entity.
    if (
      prior.entity !== undefined &&
      key === prior.entity &&
      prior.entity !== row.entity &&
      row.entity !== undefined &&
      this._open.delete(key)
    ) {
      this._open.add(row.entity)
    }

    this._emit(next)
  }

  private readonly _remove = (event: Event, index: number, key: string): void => {
    // `ha-expansion-panel` toggles on any click inside its summary unless the event has been
    // defaulted away: `_toggleContainer` opens with `if (e.defaultPrevented) return`. Without
    // this the row would be deleted and the panel above it would open.
    event.preventDefault()
    event.stopPropagation()

    this._open.delete(key)
    const next = [...this.tiles]
    next.splice(index, 1)
    this._emit(next)
  }

  /**
   * A copy of one tile, inserted directly below it.
   *
   * Deliberately allowed to produce two tiles pointing at one entity, which is the one thing
   * the add picker refuses: that refusal is about a picker offering a candidate it would then
   * reject, not about the config being invalid. `tileKeys` has always keyed the second
   * occurrence positionally, and the rules doc has always said such a config draws both tiles
   * and is fully editable — this is the button that makes it reachable without the YAML tab.
   *
   * The clone is deep enough for the one nested object a tile has (`tap_action`), so editing
   * the copy's action cannot reach back and rewrite the original's.
   */
  private readonly _duplicate = (event: Event, index: number): void => {
    // `ha-expansion-panel` opens on any click in its summary that has not been defaulted away
    // -- the same reason `_remove` starts with these two lines.
    event.preventDefault()
    event.stopPropagation()

    const source = this.tiles[index]
    if (!source) return

    const copy: TileConfig = { ...source }
    if (source.tap_action) copy.tap_action = { ...source.tap_action }

    const next = [...this.tiles]
    next.splice(index + 1, 0, copy)
    this._emit(next)
  }

  private readonly _moved = (event: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    event.stopPropagation()
    this._emit(moveRow(this.tiles, event.detail.oldIndex, event.detail.newIndex))
  }

  /**
   * The native picker in `addButton` mode reports the id it was given, as a bare string.
   *
   * Nothing to reset afterwards: in that mode the picker passes `undefined` down as its value
   * whatever it holds, so it goes back to being a button by itself.
   */
  private readonly _addPicked = (event: CustomEvent<{ value?: string }>): void => {
    event.stopPropagation()
    this._addTile(event.detail.value)
  }

  /** The same thing through the `ha-form` field, which reports the row as an object. */
  private readonly _addFromField = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
  ): void => {
    event.stopPropagation()
    const entity = event.detail.value.entity
    this._addTile(typeof entity === 'string' ? entity : undefined)
  }

  /**
   * Nothing happens for the empty value a cleared picker reports, and a duplicate is refused.
   *
   * Refused rather than allowed, even though the card itself draws a config that names one
   * entity twice and `tileKeys` keeps this control working on one: neither control offers a
   * candidate that is already in the list, and adding it anyway would produce a row whose
   * panel closes when its twin is dragged past it. Somebody who genuinely wants two tiles for
   * one entity can write the second in YAML, and everything here still edits it.
   *
   * The new tile's panel opens itself, because a tile that has just been added is the one
   * whose press somebody is most likely about to set.
   */
  private _addTile(entity: string | undefined): void {
    if (entity === undefined || entity === '') return
    if (this.tiles.some(tile => tile.entity === entity)) return

    this._open.add(entity)
    this._emit([...this.tiles, { entity }])
  }

  /**
   * A tile with nothing selected: a navigation tile, drawn with a dash for its reading. Opened
   * straight into template mode (`_templating`'s own note has why) and expanded immediately,
   * for the same reason `_addTile` opens an entity-bearing tile's panel: the row just added is
   * the one somebody is most likely about to fill in.
   *
   * The key it seeds both sets with has to be the one `tileKeys` will actually give this row
   * once it renders: a fresh entity-less row is keyed by its own index (see `tileKeys`), and
   * appending to the end means that index is exactly the list's current length.
   */
  private readonly _addBlank = (): void => {
    const key = `#${this.tiles.length}`
    this._open.add(key)
    this._templating.add(key)
    this._emit([...this.tiles, {}])
  }

  private readonly _toggled = (event: CustomEvent<{ expanded: boolean }>, key: string): void => {
    if (event.detail.expanded) this._open.add(key)
    else this._open.delete(key)
  }

  private _renderTile(config: TileConfig, index: number, key: string): TemplateResult {
    // Name and glyph as the card is drawing them right now, overrides included, so a row is
    // recognisable in the editor by the same two things it has on the dashboard.
    const tile = readTile(this.hass, config)
    const templating = this._isTemplating(config, key)
    const data = tileToForm(config)

    // Split on the way in, undone in `_rowChanged`: the dropdown holds a palette name, `''`,
    // or the `COLOR_CUSTOM` sentinel, and `color_custom` holds the literal. Moot in templating
    // mode, where `color` is already a plain text box showing the config's raw value.
    //
    // `_colorCustom.has(key)` alone carries a row that has just been switched into custom mode
    // but has nothing typed into it yet — the config has no colour to show, so the value-based
    // check below cannot see it. But a config that now names a real palette colour is never
    // "type your own" mode, however it got there: `setConfig` is called again for every later
    // change, including one made in the YAML tab that never goes through `_rowChanged` at all.
    // Left uncleared, a tile switched to `Custom…` and back to a plain `color: red` in YAML
    // would still show "Custom…" here with "red" pre-filled into the text box — a valid
    // palette name misrepresented as a custom one. So a genuine tint always wins and clears
    // the flag; only then does the flag get to speak for an otherwise-empty colour.
    if (!templating) {
      const configured = typeof data.color === 'string' ? data.color : ''
      if (configured && isTint(configured)) {
        this._colorCustom.delete(key)
      } else if (this._colorCustom.has(key) || configured) {
        data.color = COLOR_CUSTOM
        data.color_custom = configured
      }
    }
    data.templating = templating

    // `tile.name` is only ever blank for an entity-less row — an entity-bearing one always has
    // at least its own id to fall back on (`readTile`'s own contract) — so these two fallbacks
    // only ever fire there, and only until something is configured.
    const header = tile.name !== '' ? tile.name : 'Blank tile'
    const secondary = config.entity ?? 'No entity'
    // `readTile` always has a glyph: a tile with no icon of its own draws `TILE_FALLBACK_ICON`.
    const icon = tile.icon

    return html`
      <div class="tile">
        <div class="handle">
          <ha-svg-icon .path=${mdiDrag}></ha-svg-icon>
        </div>
        <ha-expansion-panel
          outlined
          .header=${header}
          .secondary=${secondary}
          .expanded=${this._open.has(key)}
          @expanded-changed=${(event: CustomEvent<{ expanded: boolean }>) =>
            this._toggled(event, key)}
        >
          <ha-icon slot="leading-icon" .icon=${icon}></ha-icon>
          <ha-icon-button
            slot="icons"
            class="remove"
            .path=${mdiContentCopy}
            .label=${`Duplicate ${header}`}
            @click=${(event: Event) => this._duplicate(event, index)}
          ></ha-icon-button>
          <ha-icon-button
            slot="icons"
            class="remove"
            .path=${mdiTrashCanOutline}
            .label=${`Remove ${header}`}
            @click=${(event: Event) => this._remove(event, index, key)}
          ></ha-icon-button>
          <ha-form
            class="fields"
            .hass=${this.hass}
            .data=${data}
            .schema=${tileSchema(this.hass, config, data, templating, index === 0)}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) =>
              this._rowChanged(event, index, key)}
          ></ha-form>
        </ha-expansion-panel>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing

    // Only the tiles that actually have one: excluding `undefined` from the picker's exclusion
    // list would be harmless (nothing in an installation is ever named "undefined"), but it is
    // one more reason not to bother reasoning about, and the type is honest either way.
    const taken = this.tiles.flatMap(tile => (tile.entity !== undefined ? [tile.entity] : []))
    const keys = tileKeys(this.tiles)

    return html`
      ${
        this.tiles.length === 0
          ? html`<p class="empty">No tiles yet. The card will say so too.</p>`
          : nothing
      }
      <!-- The wrapper is required rather than tidy: ha-sortable makes its FIRST child
           sortable, so without one the rows would not be the things being dragged. The rows
           are keyed so that a drag moves the row rather than rewriting every row's contents,
           which is what keeps an open panel open and the caret where it was. ha-sortable rolls
           its own DOM change back on drop and leaves the reordering to this render, so the key
           is the whole of what makes a drag land. -->
      <ha-sortable handle-selector=".handle" @item-moved=${this._moved}>
        <div class="tiles">
          ${repeat(
            this.tiles,
            (_tile, index) => keys[index] as string,
            (tile, index) => this._renderTile(tile, index, keys[index] as string),
          )}
        </div>
      </ha-sortable>
      <div class="add">
        ${
          this._pickerReady
            ? // Home Assistant's own add control, and the reason for the wait above: with
              // `add-button` the picker renders as a button whose press opens the list, all
              // inside the one element. No domain list is passed, because this card takes any
              // entity there is.
              html`
                <ha-entity-picker
                  add-button
                  .hass=${this.hass}
                  .addButtonLabel=${ADD_LABEL}
                  .excludeEntities=${taken}
                  @value-changed=${this._addPicked}
                ></ha-entity-picker>
              `
            : html`
                <ha-form
                  .hass=${this.hass}
                  .data=${{}}
                  .schema=${addSchema(taken)}
                  .computeLabel=${this._computeAddLabel}
                  @value-changed=${this._addFromField}
                ></ha-form>
              `
        }
        <button type="button" class="blank" @click=${this._addBlank}>
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>${ADD_BLANK_LABEL}
        </button>
        <p class="hint">${ADD_HELPER}</p>
      </div>
    `
  }
}

defineElement(TILES_LIST_TAG, CupertinoTilesList)

export { CupertinoTilesList }
