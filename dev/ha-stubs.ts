/**
 * Stand-ins for the Home Assistant frontend elements our cards use.
 *
 * `ha-card`'s CSS is copied from the one that ships inside home-assistant 2026.7.4, so
 * the harness shows the same surface the real dashboard does — including the 1px border
 * that is easy to forget about, which `layout.ts` prices its row budget against. The one
 * departure is marked below. `ha-form` and `ha-icon` are the opposite: a working shape,
 * not a copy. See the notes on them.
 */

import {
  mdiBattery,
  mdiBatteryUnknown,
  mdiCellphone,
  mdiDoorbellVideo,
  mdiHeadphones,
  mdiHelpCircleOutline,
  mdiLaptop,
  mdiTablet,
  mdiWatch,
} from '@mdi/js'

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

  .text {
    width: 100%;
    box-sizing: border-box;
  }

  /* An expandable node. The real one is an ha-expansion-panel with the device's icon in
     its summary; a details element collapses and expands, which is the behaviour being
     developed here. */
  details {
    margin: 0 0 12px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 6px;
    padding: 0 10px;
  }

  summary {
    padding: 10px 0;
    font-weight: 500;
    cursor: pointer;
  }

  details[open] summary {
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    margin-bottom: 12px;
  }

  details fieldset:last-child {
    margin-bottom: 12px;
  }
`

/**
 * A stand-in for the Home Assistant icon registry, which is a much bigger thing than this.
 *
 * The real `ha-icon` resolves any of the ~7500 `mdi:` names — and a custom icon set, and an
 * entity's computed icon — out of an IndexedDB cache it fills over the network. Here it is a
 * lookup table, deliberately: importing all of `@mdi/js` would put a megabyte of path strings
 * into the showcase that GitHub Pages then serves to every visitor, for the sake of icons only
 * this file's own mock devices ever ask for.
 *
 * So: add an entry when `battery-devices.ts` grows one. A name with no entry draws the
 * question mark rather than nothing, on the same grounds as the `ha-form` stub's unsupported
 * row — a silently blank icon reads as a broken card, and the cards are what this page is for.
 */
const ICONS: Record<string, string> = {
  'mdi:battery': mdiBattery,
  'mdi:battery-unknown': mdiBatteryUnknown,
  'mdi:cellphone': mdiCellphone,
  'mdi:doorbell-video': mdiDoorbellVideo,
  'mdi:headphones': mdiHeadphones,
  'mdi:laptop': mdiLaptop,
  'mdi:tablet': mdiTablet,
  'mdi:watch': mdiWatch,
}

/**
 * The `:host` rule is the real one's, and it is the part worth copying exactly: a card sizes
 * an icon by setting `--mdc-icon-size` and by nothing else, so a stub that took its size from
 * the glyph would draw every icon at the same size however the card scaled.
 */
const HA_ICON_CSS = `
  :host {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    vertical-align: middle;
    fill: currentcolor;
    width: var(--mdc-icon-size, 24px);
    height: var(--mdc-icon-size, 24px);
  }

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
`

const SVG_NS = 'http://www.w3.org/2000/svg'

class HaIconStub extends HTMLElement {
  private readonly _root: ShadowRoot
  private _icon = ''

  public constructor() {
    super()
    this._root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HA_ICON_CSS
    this._root.append(style)
  }

  /** Both a property and an attribute, because the real one is — cards use either. */
  public static get observedAttributes(): string[] {
    return ['icon']
  }

  public attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
    this.icon = value ?? ''
  }

  public set icon(value: string) {
    if (this._icon === value) return
    this._icon = value
    this._render()
  }

  public get icon(): string {
    return this._icon
  }

  private _render(): void {
    const style = this._root.firstElementChild as HTMLStyleElement
    const path = ICONS[this._icon] ?? mdiHelpCircleOutline

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    const shape = document.createElementNS(SVG_NS, 'path')
    shape.setAttribute('d', path)
    svg.append(shape)

    this._root.replaceChildren(style, svg)
  }
}

class HaCardStub extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HA_CARD_CSS
    root.append(style, document.createElement('slot'))
  }
}

/** Where one row of the form reads its value and where its answer goes. */
interface FormScope {
  data: Record<string, unknown>
  /** Prefixed onto every control's id, so nested rows cannot collide. */
  prefix: string
  emit(name: string, value: unknown): void
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
  /** Which panels the visitor has opened — see `_renderPanel`. */
  private readonly _open = new Set<string>()

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
  private _emit(data: Record<string, unknown>): void {
    this.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: data },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * Where one row reads its value and where its answer goes.
   *
   * The real `ha-form` splits this for us: a node with a `name` is handed `data[name]` and
   * its answer is merged back under the same key, so the rows inside a named `expandable`
   * read and write an object of their own. That nesting is the thing a card editor with a
   * panel per row depends on, so the stub reproduces it rather than flattening — an editor
   * developed against a flat stub would write every panel's fields into the top level and
   * only fail in Home Assistant.
   */
  private _scope(): FormScope {
    return {
      data: this._data,
      prefix: '',
      emit: (name, value) => this._emit({ ...this._data, [name]: value }),
    }
  }

  private _nested(name: string): FormScope {
    const data = (this._data[name] as Record<string, unknown> | undefined) ?? {}
    return {
      data,
      // Ids stay unique across panels, so the focus restore below cannot put the caret in
      // another device's field.
      prefix: `${name}--`,
      emit: (field, value) => this._emit({ ...this._data, [name]: { ...data, [field]: value } }),
    }
  }

  private _render(): void {
    // Rebuilding the DOM drops the focus ring mid-keyboard-navigation; put it back.
    const active = this._root.activeElement
    const focused = active instanceof HTMLElement ? active.id : ''

    const style = this._root.firstElementChild as HTMLStyleElement
    const scope = this._scope()
    this._root.replaceChildren(style, ...this._schema.map(node => this._renderRow(node, scope)))

    if (focused) this._root.getElementById(focused)?.focus()
  }

  private _renderRow(node: HaFormSchema, scope: FormScope): HTMLElement {
    if (!('selector' in node)) return this._renderPanel(node)

    const row = document.createElement('fieldset')
    const id = `${scope.prefix}${node.name}`
    const value = scope.data[node.name]

    const legend = document.createElement('legend')
    legend.textContent = this._computeLabel?.(node, scope.data) ?? node.name
    row.append(legend)

    if ('select' in node.selector) {
      row.append(this._renderSelect(node, node.selector.select.options, scope))
    } else if ('number' in node.selector) {
      row.append(this._renderNumber(id, value, node.selector.number, node.name, scope))
    } else if ('icon' in node.selector) {
      row.append(this._renderText(id, value, node.selector.icon.placeholder, node.name, scope))
    } else if ('text' in node.selector) {
      row.append(this._renderText(id, value, node.selector.text.placeholder, node.name, scope))
    } else if (node.selector.entity.multiple) {
      row.append(this._renderEntities(node, node.selector.entity.filter, scope))
    } else {
      row.append(this._renderEntity(id, value, node.selector.entity.filter, node.name, scope))
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

  /**
   * A panel of rows over a nested object.
   *
   * Open state is held on the element rather than left to the `details`, because every
   * keystroke rebuilds this DOM: without it, typing one character into a device's icon
   * would collapse the panel it was typed into.
   */
  private _renderPanel(node: Extract<HaFormSchema, { type: 'expandable' }>): HTMLElement {
    const panel = document.createElement('details')
    panel.open = this._open.has(node.name)
    panel.addEventListener('toggle', () => {
      if (panel.open) this._open.add(node.name)
      else this._open.delete(node.name)
    })

    const summary = document.createElement('summary')
    if (node.icon) {
      const icon = document.createElement('ha-icon')
      icon.setAttribute('icon', node.icon)
      summary.append(icon, ' ')
    }
    summary.append(node.title ?? this._computeLabel?.(node, this._data) ?? node.name)

    const scope = this._nested(node.name)
    panel.append(summary, ...node.schema.map(row => this._renderRow(row, scope)))
    return panel
  }

  private _renderSelect(
    node: HaFormSchema,
    options: readonly SelectOption[],
    scope: FormScope,
  ): HTMLElement {
    const list = document.createElement('div')
    list.className = 'options'

    for (const option of options) {
      const id = `${scope.prefix}${node.name}-${option.value}`
      const label = document.createElement('label')
      label.className = 'option'

      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.id = id
      radio.name = node.name
      radio.value = option.value
      radio.checked = scope.data[node.name] === option.value
      radio.addEventListener('change', () => scope.emit(node.name, option.value))

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
  private _renderNumber(
    id: string,
    value: unknown,
    number: NumberSelector['number'],
    name: string,
    scope: FormScope,
  ): HTMLElement {
    const min = number.min ?? 0
    const max = number.max ?? 100
    const current = typeof value === 'number' ? value : min

    const wrap = document.createElement('div')
    wrap.className = 'number'

    const input = document.createElement('input')
    input.type = 'range'
    input.id = `${id}-range`
    input.min = String(min)
    input.max = String(max)
    input.step = String(number.step ?? 1)
    input.value = String(current)

    const readout = document.createElement('output')
    readout.textContent = `${current}${number.unit_of_measurement ?? ''}`

    input.addEventListener('input', () => scope.emit(name, Number(input.value)))

    wrap.append(input, readout)
    return wrap
  }

  /**
   * A text box, standing in for both the icon picker and the text selector.
   *
   * The real icon picker is a searchable combo box over the whole MDI set and this is a
   * field you type `mdi:watch` into, which is the one thing worth having here: the value
   * the editor writes. Both report `undefined` rather than `''` for an emptied field —
   * that is what makes an override disappear from the config instead of shadowing the
   * entity's own value with nothing, so the stub reports it the same way.
   */
  private _renderText(
    id: string,
    value: unknown,
    placeholder: string | undefined,
    name: string,
    scope: FormScope,
  ): HTMLElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'text'
    input.id = id
    input.value = typeof value === 'string' ? value : ''
    input.placeholder = placeholder ?? ''
    input.addEventListener('input', () => scope.emit(name, input.value || undefined))
    return input
  }

  /**
   * The candidates a filter allows, as ids.
   *
   * The real selector ORs the clauses and ANDs the keys inside one. Both keys our schemas
   * use are read, `device_class` included — the battery card's pickers are filtered on it,
   * and a stub that ignored it would offer every binary sensor in the mock installation
   * where Home Assistant offers one.
   */
  private _candidates(filter: EntityFilter | readonly EntityFilter[] | undefined): string[] {
    const clauses = asArray(filter)
    const states = this._hass?.states ?? {}

    return Object.keys(states).filter(id => {
      if (!clauses.length) return true
      return clauses.some(clause => {
        const domains = asArray(clause.domain)
        const classes = asArray(clause.device_class)
        if (domains.length && !domains.includes(id.split('.')[0] ?? '')) return false
        return !classes.length || classes.includes(String(states[id]?.attributes.device_class))
      })
    })
  }

  private _name(entityId: string): string {
    return this._hass?.states[entityId]?.attributes.friendly_name ?? entityId
  }

  private _renderEntities(
    node: HaFormSchema,
    filter: EntityFilter | readonly EntityFilter[] | undefined,
    scope: FormScope,
  ): HTMLElement {
    const list = document.createElement('div')
    list.className = 'options'

    const selected = Array.isArray(scope.data[node.name]) ? (scope.data[node.name] as string[]) : []
    const candidates = this._candidates(filter)

    for (const entityId of candidates) {
      const id = `${scope.prefix}${node.name}-${entityId}`
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
        scope.emit(node.name, next)
      })

      const text = document.createElement('span')
      text.append(this._name(entityId))
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

  /**
   * One entity, or none. A blank option rather than a required choice, because that is what
   * clearing the real picker does — and an editor is judged as much on what it removes from
   * a config as on what it puts there.
   */
  private _renderEntity(
    id: string,
    value: unknown,
    filter: EntityFilter | readonly EntityFilter[] | undefined,
    name: string,
    scope: FormScope,
  ): HTMLElement {
    const select = document.createElement('select')
    select.id = id

    const blank = document.createElement('option')
    blank.value = ''
    blank.textContent = '—'
    select.append(blank)

    for (const entityId of this._candidates(filter)) {
      const option = document.createElement('option')
      option.value = entityId
      option.textContent = this._name(entityId)
      select.append(option)
    }

    select.value = typeof value === 'string' ? value : ''
    select.addEventListener('change', () => scope.emit(name, select.value || undefined))
    return select
  }
}

export function defineHaStubs(): void {
  if (!customElements.get('ha-card')) {
    customElements.define('ha-card', HaCardStub)
  }
  if (!customElements.get('ha-form')) {
    customElements.define('ha-form', HaFormStub)
  }
  if (!customElements.get('ha-icon')) {
    customElements.define('ha-icon', HaIconStub)
  }
}
