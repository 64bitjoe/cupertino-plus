import '../src/index'
import './harness.css'

import { CALENDAR_CARD_TAG } from '../src/index'
import { DEFAULT_DEMO_SCENARIO, DEMO_SCENARIOS } from '../src/cards/calendar/demo-data'
import {
  WIDGET_SIZES,
  columnsToPx,
  gridOptionsFor,
  rowsToPx,
  type WidgetSize,
} from '../src/core/size'
import type { FrontendLocaleData, LovelaceCard } from '../src/core/types/ha'
import { defineHaStubs } from './ha-stubs'
import { createMockHass } from './mock-hass'

defineHaStubs()

const cards: { card: LovelaceCard; size?: WidgetSize }[] = []
let dark = false
let sectionWidth = 500
let scenario = DEFAULT_DEMO_SCENARIO
let timeFormat: FrontendLocaleData['time_format'] = '12'

function makeCard(size?: WidgetSize): LovelaceCard {
  const card = document.createElement(CALENDAR_CARD_TAG) as LovelaceCard
  cards.push({ card, ...(size ? { size } : {}) })
  return card
}

function applyConfig(): void {
  for (const { card, size } of cards) {
    card.setConfig({
      type: CALENDAR_CARD_TAG,
      ...(size ? { size } : {}),
      demo_scenario: scenario,
    })
  }
}

function applyHass(): void {
  const hass = createMockHass({ dark, timeFormat })
  for (const { card } of cards) card.hass = hass
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
    slot.append(makeCard(size))
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

  // Every branch of the layout rules has a fixture; this is how you see them.
  const scenarioLabel = makeSelect('Data', DEMO_SCENARIOS, scenario, value => {
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
  })
  widthLabel.append(document.createTextNode('Section width'), widthSlider, widthOutput)

  header.append(title, scenarioLabel, clockLabel, themeLabel, widthLabel)
}

const main = document.createElement('main')
main.append(presets, freeform)

document.body.className = 'theme-light'
document.body.append(header, main)

layoutPresets()
applyConfig()
applyHass()
