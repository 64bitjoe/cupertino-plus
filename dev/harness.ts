import '../src/index'
import './harness.css'

import { CALENDAR_CARD_TAG } from '../src/index'
import { DEFAULT_DEMO_SCENARIO, DEMO_SCENARIOS } from '../src/cards/calendar/demo-data'
import {
  WIDGET_SIZES,
  columnsToPx,
  gridOptionsFor,
  resolveSize,
  rowsToPx,
  type WidgetSize,
} from '../src/core/size'
import type {
  FrontendLocaleData,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardConstructor,
  LovelaceCardEditor,
} from '../src/core/types/ha'
import { defineHaStubs } from './ha-stubs'
import { createMockHass } from './mock-hass'

defineHaStubs()

/**
 * `base` is what the slot itself pins down — a preset size, or the config the editor is
 * currently producing. The scenario is folded in on top, so the Data control keeps
 * working for every card on the page.
 */
const cards: { card: LovelaceCard; base: () => Partial<LovelaceCardConfig> }[] = []
let dark = false
let sectionWidth = 500

/**
 * The one Data option that is not a fixture.
 *
 * Every other option sets `demo_scenario`, which hands the card a ready-made
 * `CalendarItem[]` and exercises the layout rules. This one leaves the key off, which is
 * what a real dashboard looks like — so the card resolves `entities`, subscribes over
 * `mock-hass`'s websocket, and runs the wire mapper on the way in. The only option that
 * would have caught the card drawing fixtures in Home Assistant.
 */
const LIVE_SCENARIO = 'live (websocket)'

const DATA_OPTIONS = [LIVE_SCENARIO, ...DEMO_SCENARIOS] as const

let scenario: string = DEFAULT_DEMO_SCENARIO
let timeFormat: FrontendLocaleData['time_format'] = '12'

function makeCard(base: () => Partial<LovelaceCardConfig> = () => ({})): LovelaceCard {
  const card = document.createElement(CALENDAR_CARD_TAG) as LovelaceCard
  cards.push({ card, base })
  return card
}

function applyConfig(): void {
  for (const { card, base } of cards) {
    card.setConfig({
      type: CALENDAR_CARD_TAG,
      ...base(),
      // Omitted entirely on the live option — `undefined` would not do, because the card
      // distinguishes "no key" from "a key naming nothing", and so does Home Assistant.
      ...(scenario === LIVE_SCENARIO ? {} : { demo_scenario: scenario }),
    })
  }
}

const editors: LovelaceCardEditor[] = []

function applyHass(): void {
  const hass = createMockHass({ dark, timeFormat })
  for (const { card } of cards) card.hass = hass
  for (const editor of editors) editor.hass = hass
}

// ---- Preset sizes, boxed exactly as the sections grid would box them ----------

const presets = document.createElement('section')
const presetSlots: { slot: HTMLElement; label: HTMLElement; size: WidgetSize }[] = []

{
  const heading = document.createElement('h2')
  heading.textContent = 'Preset sizes'
  const grid = document.createElement('div')
  grid.className = 'section'

  for (const size of WIDGET_SIZES) {
    const wrapper = document.createElement('div')
    const label = document.createElement('div')
    label.className = 'slot-label'
    const slot = document.createElement('div')
    slot.append(makeCard(() => ({ size })))
    wrapper.append(slot, label)
    grid.append(wrapper)
    presetSlots.push({ slot, label, size })
  }

  presets.append(heading, grid)
}

function layoutPresets(): void {
  for (const { slot, label, size } of presetSlots) {
    const options = gridOptionsFor(size)
    const columns = options.columns as number
    const rows = options.rows as number
    const width = Math.round(columnsToPx(columns, sectionWidth))
    const height = rowsToPx(rows)
    slot.style.width = `${width}px`
    slot.style.height = `${height}px`
    label.textContent = `${size} — ${columns}×${rows} cols·rows → ${width}×${height}px`
  }
}

// ---- Free-resize box, to prove layout follows the measured box ----------------

const freeform = document.createElement('section')
const readout = document.createElement('div')

{
  const heading = document.createElement('h2')
  heading.textContent = 'Drag to resize'
  const box = document.createElement('div')
  box.className = 'resizable'
  const card = makeCard()
  box.append(card)
  readout.className = 'readout'

  const update = (): void => {
    const { width, height } = box.getBoundingClientRect()
    readout.textContent = `${Math.round(width)}×${Math.round(height)}px → layout="${
      card.getAttribute('cw-layout') ?? '—'
    }"`
  }
  new ResizeObserver(update).observe(box)
  // Lit reflects `cw-layout` on its own update cycle, a frame after the resize fires,
  // so the resize handler alone would always show the previous value.
  new MutationObserver(update).observe(card, {
    attributes: true,
    attributeFilter: ['cw-layout'],
  })

  freeform.append(heading, box, readout)
}

// ---- The visual editor, driving a live card ----------------------------------

/**
 * Reached exactly the way Home Assistant reaches it — through the card class's static
 * `getConfigElement()` — rather than by creating the editor element directly, so the
 * harness exercises the same path the dashboard does and notices if it goes missing.
 *
 * What it does NOT exercise is the widget: `ha-form` here is the stand-in from
 * `ha-stubs.ts`. This panel is for the behaviour — which keys the editor writes, which
 * it removes, what the card does with them. See it drawn properly with `pnpm ha:up`.
 */
const editorPanel = document.createElement('section')

/** Re-boxes the edited card when the section-width slider moves. Set up below. */
let layoutEditorPreview = (): void => {}

{
  const heading = document.createElement('h2')
  heading.textContent = 'Visual editor'

  const cardClass = customElements.get(CALENDAR_CARD_TAG) as unknown as LovelaceCardConstructor
  const stub = cardClass.getStubConfig?.() ?? { type: CALENDAR_CARD_TAG }
  // Awaited, because Home Assistant awaits it: a card that code-splits its editor
  // returns a promise here, and a harness that could not tell the difference would
  // report the one thing this panel exists to report.
  const configured = await cardClass.getConfigElement?.()

  const row = document.createElement('div')
  row.className = 'editor-row'

  const yaml = document.createElement('pre')
  yaml.className = 'editor-config'

  if (configured instanceof HTMLElement) {
    const editor = configured as LovelaceCardEditor
    editors.push(editor)

    let edited: LovelaceCardConfig = stub

    // Boxed the way the sections grid would box the size that was picked. A dashboard
    // does this for the user; without it the size control would look like it does
    // nothing, because the card's layout follows its measured width and the slot's
    // width would never move.
    const slot = document.createElement('div')
    const slotLabel = document.createElement('div')
    slotLabel.className = 'slot-label'
    const preview = document.createElement('div')
    preview.append(makeCard(() => edited))
    slot.append(preview, slotLabel)

    layoutEditorPreview = (): void => {
      const size = resolveSize(edited.size)
      const options = gridOptionsFor(size)
      const width = Math.round(columnsToPx(options.columns as number, sectionWidth))
      const height = rowsToPx(options.rows as number)
      preview.style.width = `${width}px`
      preview.style.height = `${height}px`
      slotLabel.textContent = `${size} — ${width}×${height}px`
    }

    const draw = (): void => {
      yaml.textContent = JSON.stringify(edited, null, 2)
      layoutEditorPreview()
      applyConfig()
    }

    editor.addEventListener('config-changed', event => {
      edited = (event as CustomEvent<{ config: LovelaceCardConfig }>).detail.config
      // Home Assistant hands the config straight back to the editor after every change,
      // and an editor that only looked right until it was told its own answer would be
      // broken in the dashboard and fine here.
      editor.setConfig(edited)
      draw()
    })

    // `hass` first, then `setConfig` — the order Home Assistant uses, and the only one
    // an editor that reads `hass` inside `setConfig` would survive.
    applyHass()
    editor.setConfig(edited)

    const pane = document.createElement('div')
    pane.className = 'editor-pane'
    pane.append(editor, yaml)
    row.append(pane, slot)
    draw()
  } else {
    yaml.textContent = `${CALENDAR_CARD_TAG} has no getConfigElement() — Home Assistant would show the YAML editor.`
    row.append(yaml)
  }

  editorPanel.append(heading, row)
}

// ---- Controls ----------------------------------------------------------------

const header = document.createElement('header')

function makeSelect<T extends string>(
  text: string,
  values: readonly T[],
  initial: T,
  onChange: (value: T) => void,
): HTMLLabelElement {
  const label = document.createElement('label')
  const select = document.createElement('select')
  for (const value of values) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    select.append(option)
  }
  select.value = initial
  select.addEventListener('change', () => onChange(select.value as T))
  label.append(document.createTextNode(text), select)
  return label
}

{
  const title = document.createElement('h1')
  title.textContent = 'Cupertino Widgets — dev harness'

  const themeLabel = document.createElement('label')
  const themeToggle = document.createElement('input')
  themeToggle.type = 'checkbox'
  themeToggle.addEventListener('change', () => {
    dark = themeToggle.checked
    document.body.className = dark ? 'theme-dark' : 'theme-light'
    applyHass()
  })
  themeLabel.append(themeToggle, document.createTextNode('Dark theme'))

  // Every branch of the layout rules has a fixture; this is how you see them. The first
  // option is the real data path — see LIVE_SCENARIO.
  const scenarioLabel = makeSelect('Data', DATA_OPTIONS, scenario, value => {
    scenario = value
    applyConfig()
    applyHass()
  })

  const clockLabel = makeSelect(
    'Clock',
    ['12', '24', 'language', 'system'] as const,
    timeFormat,
    value => {
      timeFormat = value
      applyHass()
    },
  )

  const widthLabel = document.createElement('label')
  const widthSlider = document.createElement('input')
  widthSlider.type = 'range'
  widthSlider.min = '260'
  widthSlider.max = '760'
  widthSlider.step = '10'
  widthSlider.value = String(sectionWidth)
  const widthOutput = document.createElement('output')
  widthOutput.textContent = `${sectionWidth}px`
  widthSlider.addEventListener('input', () => {
    sectionWidth = Number(widthSlider.value)
    widthOutput.textContent = `${sectionWidth}px`
    layoutPresets()
    layoutEditorPreview()
  })
  widthLabel.append(document.createTextNode('Section width'), widthSlider, widthOutput)

  header.append(title, scenarioLabel, clockLabel, themeLabel, widthLabel)
}

const main = document.createElement('main')
main.append(presets, freeform, editorPanel)

document.body.className = 'theme-light'
document.body.append(header, main)

layoutPresets()
applyConfig()
applyHass()
