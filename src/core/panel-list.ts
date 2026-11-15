/**
 * A card's list of rows in its visual editor: one `ha-expansion-panel` per row, with a drag
 * handle beside it, duplicate and delete buttons in its summary, and an add control below.
 *
 * The chips, tiles, live-activity and complication editors were four copies of this, adapted by
 * hand (the battery card's `device-list-editor.ts` is the older original). What each card's row
 * IS — its fields, its form translation, its header — stays in its own subclass; what a list of
 * rows DOES is here, once.
 *
 * ## Why an element of its own rather than `ha-form` rows
 *
 * `ha-form` has no way to hang a drag handle or a bin off a panel, so its `expandable` node can
 * group fields but can never be the list itself. `battery/device-list-editor.ts` has the long
 * version. The pieces are Home Assistant's own `hui-entities-card-row-editor`'s: `ha-sortable`
 * around a wrapper, an `item-moved` event carrying two indices, a picker as the add control.
 *
 * ## What it may render
 *
 * `ha-sortable`, `ha-expansion-panel`, `ha-icon-button`, `ha-svg-icon`, `ha-icon` and `ha-form`
 * are defined by the time an editor is open; `ha-entity-picker` is not, and an undefined element
 * renders as nothing at all. `addButton` is a property of the picker rather than something a
 * selector can ask for, so `_pickerReady` waits for the definition and renders a plain `ha-form`
 * field until it arrives — which is also the thing that causes it to arrive.
 *
 * ## The views of a row that are not config
 *
 * Which panels are open, which rows show their template fields, and which show the custom colour
 * box are held here by row key, never written to the config: each is a view of a row, and the
 * form reports the two switches as fields that are read and then removed before the row's own
 * `fromForm` sees them.
 */

import { mdiContentCopy, mdiDrag, mdiPlus, mdiTrashCanOutline } from '@mdi/js'
import { LitElement, css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { foldColor, splitColor } from './color-form'
import { moveRow } from './entities-form'
import type { HaFormSchema, HomeAssistant } from './types/ha'

/**
 * A text field whose placeholder is a real inherited value, or none at all.
 *
 * `exactOptionalPropertyTypes` makes `{ text: { placeholder: undefined } }` a type error, so a
 * row with nothing to inherit gets the key left out altogether. That is also the honest answer:
 * there is no placeholder to promise for a field the card draws nothing for when left empty.
 */
export const textSelector = (
  placeholder: string | undefined,
): { text: { placeholder?: string } } =>
  placeholder !== undefined ? { text: { placeholder } } : { text: {} }

/** The icon picker's version of `textSelector`. */
export const iconSelector = (
  placeholder: string | undefined,
): { icon: { placeholder?: string } } =>
  placeholder !== undefined ? { icon: { placeholder } } : { icon: {} }

/**
 * The add control, as a plain field, for as long as the real picker is undefined. It excludes
 * what the list already holds, as the picker does: without it the control offers a row that is
 * already there, `_add` refuses it, and the user sees a field that filled itself in and did
 * nothing.
 */
const addSchema = (taken: readonly string[]): readonly HaFormSchema[] => [
  { name: 'entity', selector: { entity: { exclude_entities: [...taken] } } },
]

/** What a panel's summary shows: the row as the card draws it, so it is recognisable. */
export interface PanelSummary {
  header: string
  secondary: string
  icon: string | undefined
}

/** A row of any list: keyed by its entity, which some lists allow it to be without. */
export interface PanelRow {
  entity?: string | undefined
  tap_action?: object | undefined
  hold_action?: object | undefined
  double_tap_action?: object | undefined
}

export abstract class SortablePanelList<Row extends PanelRow> extends LitElement {
  /**
   * Home Assistant's own furniture, not ours: no `--cw-*` token appears here, for the reason
   * `CupertinoCardEditor` gives — a widget that looks like a phone's should still have a config
   * panel that looks like the dialog it is sitting in. One set of rules for every list, on
   * purpose: two list controls in one library that were spaced differently would read as two
   * libraries.
   */
  static override styles: CSSResultGroup = css`
    :host {
      display: block;
    }

    .rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Aligned to the top rather than centred: the panel grows downwards when it is opened,
       and a handle that centred itself against an expanded panel would drift away from the row
       it drags. 48px is ha-expansion-panel's own summary height. */
    .row {
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

    /* A plain element rather than an HA custom one: nothing else here needs this button to
       exist before it can be pressed, so there is no reason to risk it rendering as nothing
       during the window ha-entity-picker sometimes does.

       A real outlined button on its own line rather than a bare text link: sitting inline
       beside the picker's own solid button, a borderless link read as that button's caption
       rather than as the second of two ways to add a row, and the feature was reported missing
       twice by somebody looking straight at it. Outlined rather than solid keeps the ordinary
       path visually primary. */
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

  /** Normalised by the card editor into config objects. */
  @property({ attribute: false }) public rows: readonly Row[] = []

  /** Whether `ha-entity-picker` has been defined yet, and so whether the add control can be it. */
  @state() protected _pickerReady = customElements.get('ha-entity-picker') !== undefined

  /**
   * Which panels are open, by row key. Held here rather than left to each panel, because this
   * element re-renders from the config on every keystroke: an `expanded` that only lived in the
   * panel would be whatever the recycled DOM node happened to have. By key and not by position
   * so a dragged row keeps its panel open, which is also why the rows are keyed.
   */
  protected readonly _open = new Set<string>()

  /**
   * Which rows show their template fields, by row key. Pickers cannot hold a template, so the
   * switch swaps them for text boxes and reveals the fields that only make sense as templates.
   * On by default for a row whose config already holds one (`hasTemplates`), so a config written
   * in YAML opens showing what it says; a blank row added with `_addBlank` is seeded on.
   */
  protected readonly _templating = new Set<string>()

  /**
   * Which rows show the custom-colour text box, by row key. Selecting "Custom…" has nothing to
   * write into the config until a value is typed beside it; without holding the choice here, the
   * very re-render the dropdown's change causes would find `color` still unset and the field the
   * user just asked for would never appear. See `splitColor`.
   */
  protected readonly _colorCustom = new Set<string>()

  // ---- What a subclass says about its rows ---------------------------------------------

  /** The event the list reports with, and the key its detail carries the whole list under. */
  protected abstract readonly eventName: string
  protected abstract readonly detailKey: string

  /** The add picker's label, the line under it, and what an empty list says. */
  protected abstract readonly addLabel: string
  protected abstract readonly addHint: string
  protected abstract readonly emptyText: string

  /** When set, a second button below the picker adds a row with no entity. */
  protected readonly addBlankLabel: string | undefined = undefined

  /** Whether each row has a Duplicate button beside its Remove. */
  protected readonly duplicable: boolean = true

  /** Whether a newly added row opens its panel, ready for whatever is set next. */
  protected readonly openAdded: boolean = true

  /** Whether the rows' Colour is a dropdown with a custom box beside it (`core/color-form.ts`). */
  protected readonly customColor: boolean = true

  protected abstract keysFor(rows: readonly Row[]): string[]
  protected abstract configRows(rows: readonly Row[]): (string | Row)[]
  protected abstract hasTemplates(row: Row): boolean
  protected abstract toForm(row: Row): Record<string, unknown>
  protected abstract fromForm(prior: Row, value: Record<string, unknown>): Row
  protected abstract formSchema(
    row: Row,
    data: Record<string, unknown>,
    templating: boolean,
    index: number,
  ): readonly HaFormSchema[]
  protected abstract panelSummary(row: Row): PanelSummary
  protected abstract fieldLabel(name: string): string
  protected abstract fieldHelper(name: string): string | undefined

  /** Fields other than `templating` that are a view of a row, read from the form; none here. */
  protected readViewFields(_value: Record<string, unknown>, _key: string): void {}

  /** Adds this list's other row views to a form's data before it is drawn; none here. */
  protected decorateForm(_data: Record<string, unknown>, _row: Row, _key: string): void {}

  /** A row's key changed from `from` to `to` (its entity was renamed) with its panel open. */
  protected renamed(_from: string, _to: string): void {}

  /**
   * A copy of a row for Duplicate, deep enough for the nested objects every row has (its three
   * actions), so editing the copy cannot reach back and rewrite the original.
   */
  protected clone(source: Row): Row {
    const copy: Row = { ...source }
    if (source.tap_action) copy.tap_action = { ...source.tap_action }
    if (source.hold_action) copy.hold_action = { ...source.hold_action }
    if (source.double_tap_action) copy.double_tap_action = { ...source.double_tap_action }
    return copy
  }

  // ---- The list ------------------------------------------------------------------------

  protected _isTemplating(row: Row, key: string): boolean {
    return this._templating.has(key) || this.hasTemplates(row)
  }

  private readonly _computeLabel = (schema: HaFormSchema): string => this.fieldLabel(schema.name)

  private readonly _computeHelper = (schema: HaFormSchema): string | undefined =>
    this.fieldHelper(schema.name)

  private readonly _computeAddLabel = (): string => this.addLabel

  public override connectedCallback(): void {
    super.connectedCallback()
    if (this._pickerReady) return
    void customElements.whenDefined('ha-entity-picker').then(() => {
      this._pickerReady = true
    })
  }

  protected _emit(rows: readonly Row[]): void {
    this.dispatchEvent(
      new CustomEvent(this.eventName, {
        detail: { [this.detailKey]: this.configRows(rows) },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * One row's form reported. It carries the whole row, so it replaces the whole row. Nothing
   * here drops a row: the trash icon (`_remove`) is the only way this control removes one.
   */
  private readonly _rowChanged = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
    index: number,
    key: string,
  ): void => {
    event.stopPropagation()
    const prior = this.rows[index]
    if (!prior) return

    // The switches are views of the row, not facts about its config: read, then removed, so
    // they never reach `fromForm` or the config beyond it.
    const value = { ...event.detail.value }
    this.readViewFields(value, key)
    if (typeof value.templating === 'boolean') {
      if (value.templating) this._templating.add(key)
      else this._templating.delete(key)
    }
    delete value.templating

    if (this.customColor) {
      if (foldColor(value)) this._colorCustom.add(key)
      else this._colorCustom.delete(key)
    }

    const row = this.fromForm(prior, value)
    const next = [...this.rows]
    next[index] = row

    // The panel stays open across the rename that a changed entity amounts to. Only for a row
    // whose key is its own entity id: a `#1` suffix or a `#<index>` key is positional (see
    // `rowKeys`), and the new one is not this row's to guess.
    if (
      prior.entity !== undefined &&
      key === prior.entity &&
      row.entity !== undefined &&
      prior.entity !== row.entity &&
      this._open.delete(key)
    ) {
      this._open.add(row.entity)
      this.renamed(key, row.entity)
    }

    this._emit(next)
  }

  private readonly _remove = (event: Event, index: number, key: string): void => {
    // `ha-expansion-panel` toggles on any click inside its summary unless the event has been
    // defaulted away: without this the row would be deleted and the panel above it would open.
    event.preventDefault()
    event.stopPropagation()
    this._open.delete(key)
    const next = [...this.rows]
    next.splice(index, 1)
    this._emit(next)
  }

  /**
   * A copy of one row, inserted directly below it. Deliberately allowed to produce two rows
   * pointing at one entity, which the add picker refuses: that refusal is about a picker
   * offering a candidate it would then reject, not about the config being invalid. `rowKeys`
   * keys the second occurrence positionally, and the card draws both.
   */
  private readonly _duplicate = (event: Event, index: number): void => {
    // The same reason `_remove` starts with these two lines.
    event.preventDefault()
    event.stopPropagation()
    const source = this.rows[index]
    if (!source) return
    const next = [...this.rows]
    next.splice(index + 1, 0, this.clone(source))
    this._emit(next)
  }

  private readonly _moved = (event: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    event.stopPropagation()
    this._emit(moveRow(this.rows, event.detail.oldIndex, event.detail.newIndex))
  }

  /**
   * The native picker in `addButton` mode reports the id it was given, as a bare string. Nothing
   * to reset afterwards: in that mode the picker goes back to being a button by itself.
   */
  private readonly _addPicked = (event: CustomEvent<{ value?: string }>): void => {
    event.stopPropagation()
    this._add(event.detail.value)
  }

  /** The same thing through the `ha-form` field, which reports the row as an object. */
  private readonly _addFromField = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
  ): void => {
    event.stopPropagation()
    const entity = event.detail.value.entity
    this._add(typeof entity === 'string' ? entity : undefined)
  }

  /**
   * Nothing happens for the empty value a cleared picker reports, and a duplicate is refused:
   * neither control offers a candidate already in the list, and adding it anyway would produce a
   * row whose panel closes when its twin is dragged past it. A config can still name one entity
   * twice in YAML (or through Duplicate), and everything here still edits it.
   */
  private _add(entity: string | undefined): void {
    if (entity === undefined || entity === '') return
    if (this.rows.some(row => row.entity === entity)) return
    if (this.openAdded) this._open.add(entity)
    this._emit([...this.rows, { entity } as Row])
  }

  /**
   * A row with no entity, opened straight into template mode and expanded. The key it seeds both
   * sets with is the one `rowKeys` will give it: an entity-less row is keyed by its own index,
   * and appending to the end means that index is the list's current length.
   */
  private readonly _addBlank = (): void => {
    const key = `#${this.rows.length}`
    this._open.add(key)
    this._templating.add(key)
    this._emit([...this.rows, {} as Row])
  }

  private readonly _toggled = (event: CustomEvent<{ expanded: boolean }>, key: string): void => {
    if (event.detail.expanded) this._open.add(key)
    else this._open.delete(key)
  }

  private _renderRow(row: Row, index: number, key: string): TemplateResult {
    const templating = this._isTemplating(row, key)
    const data = this.toForm(row)

    // Split on the way in, folded back in `_rowChanged`. Moot in templating mode, where the
    // colour is already a plain text box showing the config's raw value.
    if (this.customColor && !templating && !splitColor(data, this._colorCustom.has(key))) {
      this._colorCustom.delete(key)
    }
    this.decorateForm(data, row, key)
    data.templating = templating

    const { header, secondary, icon } = this.panelSummary(row)

    return html`
      <div class="row">
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
          ${
            this.duplicable
              ? html`<ha-icon-button
                  slot="icons"
                  class="remove"
                  .path=${mdiContentCopy}
                  .label=${`Duplicate ${header}`}
                  @click=${(event: Event) => this._duplicate(event, index)}
                ></ha-icon-button>`
              : nothing
          }
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
            .schema=${this.formSchema(row, data, templating, index)}
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

    const taken = this.rows.flatMap(row => (row.entity !== undefined ? [row.entity] : []))
    const keys = this.keysFor(this.rows)

    return html`
      ${this.rows.length === 0 ? html`<p class="empty">${this.emptyText}</p>` : nothing}
      <!-- The wrapper is required rather than tidy: ha-sortable makes its FIRST child
           sortable, so without one the rows would not be the things being dragged. The rows
           are keyed so that a drag moves the row rather than rewriting every row's contents,
           which is what keeps an open panel open and the caret where it was. ha-sortable rolls
           its own DOM change back on drop and leaves the reordering to this render, so the key
           is the whole of what makes a drag land. -->
      <ha-sortable handle-selector=".handle" @item-moved=${this._moved}>
        <div class="rows">
          ${repeat(
            this.rows,
            (_row, index) => keys[index] as string,
            (row, index) => this._renderRow(row, index, keys[index] as string),
          )}
        </div>
      </ha-sortable>
      <div class="add">
        ${
          this._pickerReady
            ? // Home Assistant's own add control, and the reason for the wait above: with
              // `add-button` the picker renders as a button whose press opens the list.
              html`
                <ha-entity-picker
                  add-button
                  .hass=${this.hass}
                  .addButtonLabel=${this.addLabel}
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
        ${
          this.addBlankLabel !== undefined
            ? html`<button type="button" class="blank" @click=${this._addBlank}>
                <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>${this.addBlankLabel}
              </button>`
            : nothing
        }
        <p class="hint">${this.addHint}</p>
      </div>
    `
  }
}
