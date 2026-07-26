import { LitElement, css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'

import type {
  HaFormSchema,
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from './types/ha'

/**
 * A value the config is better off not carrying.
 *
 * `ha-form` reports every field it knows about on every change, including the ones the
 * user has just emptied, and a multiple entity picker says "nothing selected" with `[]`
 * rather than by dropping the key. Home Assistant strips `undefined` out of a config it
 * is handed and nothing else, so an `entities: []` would survive into the user's YAML —
 * where it means exactly what its absence means, only louder.
 */
const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/**
 * What `ha-form` is handed: the config, with the defaults showing through where it is
 * silent, and a scalar widened to a list wherever the schema says `multiple`.
 *
 * That last part is not decoration. A hand-written `entities: calendar.work` — a scalar
 * where the schema says `multiple` — reaches `ha-entities-picker`, which maps over the
 * value and throws on a string. The selector does know how to coerce, but only inside
 * `willUpdate` and only when the *selector* has changed:
 *
 *     willUpdate(changed) { changed.get('selector') && this.value !== undefined && … }
 *
 * `changed.get` answers the previous value, which on a first update is `undefined`, so
 * the one render where it matters is the one render it sits out.
 */
export const formData = <C extends LovelaceCardConfig>(
  config: C,
  defaults: Partial<C>,
  schema: readonly HaFormSchema[],
): Record<string, unknown> => {
  const data: Record<string, unknown> = { ...defaults, ...config }

  for (const node of schema) {
    const multiple =
      'entity' in node.selector ? node.selector.entity.multiple : node.selector.select.multiple
    const value = data[node.name]
    // `isBlank`, not `!== undefined`: a bare `entities:` in the YAML parses to `null`,
    // and wrapping that would show the picker one empty row it cannot fill and then
    // write `[null]` back out.
    if (multiple && !isBlank(value) && !Array.isArray(value)) data[node.name] = [value]
  }

  return data
}

/**
 * Fold what the form reported back into the card config.
 *
 * Only the `fields` the form owns are touched. The data object also carries every other
 * key of the config — because that is what we put in it — and a `grid_options` or a
 * `visibility` that came along for the ride has to come back out untouched, including
 * when it happens to be empty.
 */
export const applyFormData = <C extends LovelaceCardConfig>(
  config: C,
  data: Record<string, unknown>,
  fields: readonly string[],
): C => {
  const next: Record<string, unknown> = { ...config }

  for (const field of fields) {
    const value = data[field]
    if (isBlank(value)) delete next[field]
    else next[field] = value
  }

  return next as C
}

/**
 * Shared behaviour for the visual editor of every card in the library.
 *
 * Home Assistant's contract for the element a card's `static getConfigElement()`
 * returns is short and written down nowhere, so here it is, read out of
 * `hui-element-editor` in the 2026.7.4 frontend:
 *
 *  - the host sets `hass` first, then calls `setConfig(config)`, and calls `setConfig`
 *    again on every later change — including the ones this editor itself emitted, and
 *    including edits made in the YAML tab;
 *  - the element is built once and kept; only a change of `config.type` replaces it;
 *  - a change is reported with a `config-changed` event carrying the WHOLE config in
 *    `detail.config`, dispatched on the editor element itself — that is where the host
 *    added its listener;
 *  - keys whose value is `undefined` are stripped out of that config. Nothing else is;
 *  - throwing out of `setConfig` is how an editor says "I cannot edit this": the host
 *    catches it, shows the message, and drops the user into the YAML editor.
 *
 * Worth knowing what else this buys, beyond the fields themselves: the tab strip in the
 * edit dialog is rendered only inside the GUI branch, so a card with no config element
 * gets no **Visibility** and no **Layout** tab either — just the YAML box.
 *
 * Subclasses supply a schema and the words around it; the plumbing lives here.
 */
export abstract class CupertinoCardEditor<C extends LovelaceCardConfig = LovelaceCardConfig>
  extends LitElement
  implements LovelaceCardEditor
{
  /**
   * Deliberately none of the `--cw-*` tokens the cards use. This element is Home
   * Assistant's furniture, not ours: a widget that looks like iOS should still have a
   * config panel that looks like the dialog it is sitting in.
   */
  static override styles: CSSResultGroup = css`
    :host {
      display: block;
    }
  `

  @property({ attribute: false }) public hass?: HomeAssistant

  @state() protected _config?: C

  public setConfig(config: C): void {
    this._config = config
  }

  /** The rows of the form, in order. */
  protected abstract schema(): readonly HaFormSchema[]

  /** The label for one row. */
  protected abstract label(schema: HaFormSchema): string

  /** The grey line under one row, if it has anything to add. */
  protected helper(_schema: HaFormSchema): string | undefined {
    return undefined
  }

  /**
   * What the form should show for a field the config does not carry.
   *
   * A card that treats a missing `size` as medium should show medium in the editor
   * rather than an empty control — an unset radio group reads as broken, not as a
   * default. The first edit then writes the value through into the config, which is
   * what Home Assistant's own card editors do with theirs.
   */
  protected defaults(): Partial<C> {
    return {}
  }

  /**
   * Bound once, the way Home Assistant's own card editors bind theirs.
   *
   * Not an optimisation, and it would be wrong to describe it as one: `ha-form` compares
   * every property by identity, and the `.data` beside these is a fresh object on every
   * render, so `ha-form` updates each time this editor does either way. The reason is
   * plainer — a stable callback is one less thing changing under a component that is
   * diffing its inputs, and it is what the reference implementations do.
   */
  private readonly _computeLabel = (schema: HaFormSchema): string => this.label(schema)

  private readonly _computeHelper = (schema: HaFormSchema): string | undefined =>
    this.helper(schema)

  private readonly _valueChanged = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
  ): void => {
    // It has been folded into the `config-changed` below; nothing above us wants to see
    // the raw form value as well.
    event.stopPropagation()
    if (!this._config) return

    const fields = this.schema().map(node => node.name)
    const config = applyFormData(this._config, event.detail.value, fields)

    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config },
        // Not strictly needed — the host listens on this very element, so its handler
        // runs at the target whatever these say. They match what Home Assistant's own
        // `fireEvent` puts on this event, which is the point: an editor nested inside
        // another one, or a host that ever listens further up, keeps working.
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${formData(this._config, this.defaults(), this.schema())}
        .schema=${this.schema()}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `
  }
}
