/**
 * The panel down the right-hand side: what to paste, and every knob that changes it.
 *
 * One narrow column, because the widgets themselves are narrow and tall — reading them
 * beside their settings works, reading them above their settings means scrolling past the
 * thing you are adjusting.
 *
 * The config comes first and is the subset a visitor can actually use: `widgetYaml` builds
 * it from `toConfig` alone, so a preview-only key cannot reach it even by accident. The
 * controls under it include the ones that only stand in for Home Assistant, which is what
 * the group headings are for.
 */

import { html, nothing, type TemplateResult } from 'lit'
import { mdiCheck, mdiContentCopy } from '@mdi/js'

import type { HomeAssistant } from '../../src/core/types/ha'
import {
  CONTROL_GROUPS,
  widgetYaml,
  type ArgValue,
  type Args,
  type Control,
  type RangeControl,
  type SelectControl,
  type Widget,
} from './catalog'
import { icon } from './icon'

// ---- One control at a time -------------------------------------------------------

interface ControlContext {
  value: ArgValue
  disabled: boolean
  hass: HomeAssistant
  onInput: (value: ArgValue) => void
}

const selectInput = (control: SelectControl, ctx: ControlContext): TemplateResult => {
  const value = typeof ctx.value === 'string' ? ctx.value : control.initial
  // A native `select` cannot carry a pseudo-element, so the chevron is drawn on the
  // wrapper. Everything else is the browser's own menu, which is the one control here
  // worth not reinventing.
  return html`
    <div class="field-menu">
      <select
        class="field-select"
        .value=${value}
        ?disabled=${ctx.disabled}
        aria-label=${control.label}
        @change=${(event: Event) => ctx.onInput((event.target as HTMLSelectElement).value)}
      >
        ${control.options.map(
          option =>
            html`<option value=${option.value} ?selected=${option.value === value}>
              ${option.label}
            </option>`,
        )}
      </select>
      <span class="menu-mark" aria-hidden="true"></span>
    </div>
  `
}

const rangeInput = (control: RangeControl, ctx: ControlContext): TemplateResult => {
  const value = typeof ctx.value === 'number' ? ctx.value : control.initial
  return html`
    <div class="field-range">
      <input
        type="range"
        min=${control.min}
        max=${control.max}
        step=${control.step}
        .value=${String(value)}
        ?disabled=${ctx.disabled}
        aria-label=${control.label}
        @input=${(event: Event) => ctx.onInput(Number((event.target as HTMLInputElement).value))}
      />
      <output class="field-readout">${value}${control.unit}</output>
    </div>
  `
}

const controlInput = (control: Control, ctx: ControlContext): TemplateResult => {
  switch (control.kind) {
    case 'select':
      return selectInput(control, ctx)
    case 'range':
      return rangeInput(control, ctx)
  }
}

// ---- The list --------------------------------------------------------------------

/**
 * One control, wired to wherever its value lives.
 *
 * The card's options and the page's own knobs are kept in separate records — they have
 * different lifetimes, and one of them is per widget — but the panel shows them together,
 * grouped by whether they belong to the card. A binding is what lets it do that without
 * knowing about either record.
 */
export interface ControlBinding {
  control: Control
  args: Args
  onInput: (name: string, value: ArgValue) => void
}

const controlRow = (binding: ControlBinding, hass: HomeAssistant): TemplateResult => {
  const { control, args } = binding
  const reason = control.inert?.(args)
  const disabled = reason !== undefined
  // A control may carry no description, and an inert one always has a reason worth more
  // than the description it replaces. Only the empty case drops the line entirely.
  const hint = reason ?? control.description

  return html`
    <div class=${disabled ? 'control is-inert' : 'control'}>
      <div class="control-label">
        <span class="control-name">${control.label}</span>
        ${hint === undefined ? nothing : html`<span class="control-hint">${hint}</span>`}
      </div>
      <div class="control-field">
        ${controlInput(control, {
          value: args[control.name] ?? '',
          disabled,
          hass,
          onInput: value => binding.onInput(control.name, value),
        })}
      </div>
    </div>
  `
}

export const controlsPanel = (
  bindings: readonly ControlBinding[],
  hass: HomeAssistant,
): TemplateResult => html`
  <div class="controls">
    ${CONTROL_GROUPS.map(group => {
      const rows = bindings.filter(binding => binding.control.group === group.id)
      if (rows.length === 0) return nothing
      return html`
        <p class="controls-group">${group.name}</p>
        ${rows.map(binding => controlRow(binding, hass))}
      `
    })}
  </div>
`

// ---- The YAML --------------------------------------------------------------------

export const configPanel = (
  widget: Widget,
  props: Args,
  copied: boolean,
  onCopy: (text: string) => void,
): TemplateResult => {
  const yaml = widgetYaml(widget, props)

  return html`
    <div class="config">
      <div class="config-head">
        <p class="config-title">Config</p>
        ${
          navigator.clipboard
            ? html`<button class="button" type="button" @click=${() => onCopy(yaml)}>
                ${icon(copied ? mdiCheck : mdiContentCopy)}<span
                  >${copied ? 'Copied' : 'Copy'}</span
                >
              </button>`
            : nothing
        }
      </div>
      <pre class="config-yaml"><code>${yaml}</code></pre>
      <p class="config-note">Paste into a manual card.</p>
    </div>
  `
}
