/**
 * Stand-ins for the Home Assistant frontend elements our cards use.
 *
 * `ha-card`'s CSS is copied from the one that ships inside home-assistant 2026.7.4, so
 * the harness shows the same surface the real dashboard does — including the 1px border
 * that is easy to forget about, which `layout.ts` prices its row budget against. The one
 * departure is marked below. `ha-form` is the opposite: a working shape, not a copy. See
 * the note on it.
 */

import type {
  EntityFilter,
  HaFormSchema,
  HomeAssistant,
  NumberSelector,
  SelectOption,
} from '../src/core/types/ha'

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value as T]

const HA_CARD_CSS = `
  :host {
    background: var(--ha-card-background, var(--card-background-color, white));
    backdrop-filter: var(--ha-card-backdrop-filter, none);
    box-shadow: var(--ha-card-box-shadow, none);
    box-sizing: border-box;
    /* The real rule has no 12px here — it leans on --ha-border-radius-lg, which is set
       by a theme the harness does not load. The card overrides this anyway. */
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
    border-width: var(--ha-card-border-width, 1px);
    border-style: solid;
    border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
    color: var(--primary-text-color);
    display: block;
    position: relative;
    transition: all 0.3s ease-out 0s;
  }
`

/**
 * Not copied from anywhere — the real `ha-form` is a stack of `ha-selector`s and looks
 * nothing like this. Enough to tell the rows apart and read the helper lines.
 */
const HA_FORM_CSS = `
  :host {
    display: block;
    font: 400 14px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: var(--primary-text-color);
  }

  fieldset {
    margin: 0 0 16px;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0 0 10px;
    font-size: 13px;
    font-weight: 500;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* A plain row. The real selector draws a searchable picker with friendly names, area
     breadcrumbs and drag handles, and no amount of border-radius here would get any
     closer to it — so this stays out of the way instead of imitating a card. */
  .option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .option span {
    display: flex;
    flex-direction: column;
  }

  .option small {
    font-size: 11px;
    color: var(--secondary-text-color);
  }

  .helper {
    margin-top: 6px;
    font-size: 11px;
    color: var(--secondary-text-color);
  }

  .number {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .number input {
    flex: 1;
    min-width: 0;
  }

  .number output {
    min-width: 44px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
`

class HaCardStub extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HA_CARD_CSS
    root.append(style, document.createElement('slot'))
  }
}

/**
 * A stand-in for `ha-form`, so a card editor can be developed here too.
 *
 * It implements the API surface our editors actually touch — the `.hass` / `.data` /
 * `.schema` / `.computeLabel` / `.computeHelper` properties, and a `value-changed`
 * event whose detail carries the WHOLE data object rather than the field that moved,
 * which is the part that is easy to get wrong. Behind that it is plain form controls.
 *
 * It is emphatically **not** a replica of the widget. The real `ha-form` hands each row
 * to an `ha-selector`, which draws a searchable entity picker with friendly names, area
 * breadcrumbs and drag handles; this draws a list of checkboxes. Develop the editor's
 * behaviour here, then look at it in the dev Home Assistant (`pnpm ha:up`) before
 * believing anything about how it reads.
 *
 * Its own shadow root, like the real one — an editor puts this inside *its* shadow
 * root, where the harness stylesheet cannot reach it anyway.
 */
class HaFormStub extends HTMLElement {
  private readonly _root: ShadowRoot
  private _hass: HomeAssistant | undefined
  private _data: Record<string, unknown> = {}
  private _schema: readonly HaFormSchema[] = []
  /** Both take the same arguments the real `ha-form` passes. */
  private _computeLabel:
    ((schema: HaFormSchema, data: Record<string, unknown>) => string) | undefined
  private _computeHelper: ((schema: HaFormSchema) => string | undefined) | undefined
  private _pending = false

  constructor() {
    super()
    this._root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HA_FORM_CSS
    this._root.append(style)
  }

  public set hass(value: HomeAssistant | undefined) {
    this._hass = value
    this._invalidate()
  }

  public set data(value: Record<string, unknown> | undefined) {
    this._data = value ?? {}
    this._invalidate()
  }

  public set schema(value: readonly HaFormSchema[] | undefined) {
    this._schema = value ?? []
    this._invalidate()
  }

  public set computeLabel(
    value: ((schema: HaFormSchema, data: Record<string, unknown>) => string) | undefined,
  ) {
    this._computeLabel = value
    this._invalidate()
  }

  public set computeHelper(value: ((schema: HaFormSchema) => string | undefined) | undefined) {
    this._computeHelper = value
    this._invalidate()
  }

  /** Coalesces the five property writes one Lit render makes into a single repaint. */
  private _invalidate(): void {
    if (this._pending) return
    this._pending = true
    queueMicrotask(() => {
      this._pending = false
      this._render()
    })
  }

  /**
   * The real one merges the changed field into its data and re-fires the lot. Editors
   * are written against that, so the stub has to do it too.
   */
  private _emit(name: string, value: unknown): void {
    this.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...this._data, [name]: value } },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private _render(): void {
    // Rebuilding the DOM drops the focus ring mid-keyboard-navigation; put it back.
    const active = this._root.activeElement
    const focused = active instanceof HTMLElement ? active.id : ''

    const style = this._root.firstElementChild as HTMLStyleElement
    this._root.replaceChildren(style, ...this._schema.map(node => this._renderRow(node)))

    if (focused) this._root.getElementById(focused)?.focus()
  }

  private _renderRow(node: HaFormSchema): HTMLElement {
    const row = document.createElement('fieldset')

    const legend = document.createElement('legend')
    legend.textContent = this._computeLabel?.(node, this._data) ?? node.name
    row.append(legend)

    if ('select' in node.selector) {
      row.append(this._renderSelect(node, node.selector.select.options))
    } else if ('number' in node.selector) {
      row.append(this._renderNumber(node, node.selector.number))
    } else if (node.selector.entity.multiple) {
      row.append(this._renderEntities(node, node.selector.entity.filter))
    } else {
      // Nothing in the library asks for one yet, and a silently blank row is worse
      // than a loud one.
      const unsupported = document.createElement('div')
      unsupported.textContent = `[ha-form stub] no control for ${JSON.stringify(node.selector)}`
      row.append(unsupported)
    }

    const helper = this._computeHelper?.(node)
    if (helper) {
      const hint = document.createElement('div')
      hint.className = 'helper'
      hint.textContent = helper
      row.append(hint)
    }

    return row
  }

  private _renderSelect(node: HaFormSchema, options: readonly SelectOption[]): HTMLElement {
    const list = document.createElement('div')
    list.className = 'options'

    for (const option of options) {
      const id = `${node.name}-${option.value}`
      const label = document.createElement('label')
      label.className = 'option'

      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.id = id
      radio.name = node.name
      radio.value = option.value
      radio.checked = this._data[node.name] === option.value
      radio.addEventListener('change', () => this._emit(node.name, option.value))

      const text = document.createElement('span')
      text.append(option.label)
      if (option.description) {
        const description = document.createElement('small')
        description.textContent = option.description
        text.append(description)
      }

      label.append(radio, text)
      list.append(label)
    }

    return list
  }

  /**
   * A slider and its reading, which is the shape the real selector settles on too once it
   * has been given a `min` and a `max`.
   *
   * The one thing worth copying exactly is the type of the value it reports: `ha-form`
   * hands back a **number**, and an editor that folded a string into the config would put
   * `scale: "110"` in somebody's YAML and look fine doing it here.
   */
  private _renderNumber(node: HaFormSchema, number: NumberSelector['number']): HTMLElement {
    const min = number.min ?? 0
    const max = number.max ?? 100
    const value = this._data[node.name]
    const current = typeof value === 'number' ? value : min

    const wrap = document.createElement('div')
    wrap.className = 'number'

    const input = document.createElement('input')
    input.type = 'range'
    input.id = `${node.name}-range`
    input.min = String(min)
    input.max = String(max)
    input.step = String(number.step ?? 1)
    input.value = String(current)

    const readout = document.createElement('output')
    readout.textContent = `${current}${number.unit_of_measurement ?? ''}`

    input.addEventListener('input', () => this._emit(node.name, Number(input.value)))

    wrap.append(input, readout)
    return wrap
  }

  private _renderEntities(
    node: HaFormSchema,
    filter: EntityFilter | readonly EntityFilter[] | undefined,
  ): HTMLElement {
    const list = document.createElement('div')
    list.className = 'options'

    // The real selector ORs the clauses and ANDs the keys inside one; the stub only
    // knows how to read `domain`, which is all our schemas use.
    const domains = new Set(asArray(filter).flatMap(clause => asArray(clause.domain)))
    const selected = Array.isArray(this._data[node.name]) ? (this._data[node.name] as string[]) : []
    const candidates = Object.keys(this._hass?.states ?? {}).filter(
      id => domains.size === 0 || domains.has(id.split('.')[0] ?? ''),
    )

    for (const entityId of candidates) {
      const id = `${node.name}-${entityId}`
      const label = document.createElement('label')
      label.className = 'option'

      const box = document.createElement('input')
      box.type = 'checkbox'
      box.id = id
      box.checked = selected.includes(entityId)
      box.addEventListener('change', () => {
        const next = box.checked
          ? [...selected, entityId]
          : selected.filter(current => current !== entityId)
        this._emit(node.name, next)
      })

      const text = document.createElement('span')
      text.append(this._hass?.states[entityId]?.attributes.friendly_name ?? entityId)
      const raw = document.createElement('small')
      raw.textContent = entityId
      text.append(raw)

      label.append(box, text)
      list.append(label)
    }

    if (!candidates.length) {
      const empty = document.createElement('div')
      empty.className = 'helper'
      empty.textContent = 'No matching entities in the mock hass.'
      list.append(empty)
    }

    return list
  }
}

export function defineHaStubs(): void {
  if (!customElements.get('ha-card')) {
    customElements.define('ha-card', HaCardStub)
  }
  if (!customElements.get('ha-form')) {
    customElements.define('ha-form', HaFormStub)
  }
}
