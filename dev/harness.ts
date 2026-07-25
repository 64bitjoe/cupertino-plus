import '../src/index'
import './harness.css'

import { CALENDAR_CARD_TAG } from '../src/index'
import {
  WIDGET_SIZES,
  columnsToPx,
  gridOptionsFor,
  rowsToPx,
  type WidgetSize,
} from '../src/core/size'
import type { LovelaceCard } from '../src/core/types/ha'
import { defineHaStubs } from './ha-stubs'
import { createMockHass } from './mock-hass'

defineHaStubs()

const cards: LovelaceCard[] = []
let dark = false
let sectionWidth = 500

function makeCard(size?: WidgetSize): LovelaceCard {
  const card = document.createElement(CALENDAR_CARD_TAG) as LovelaceCard
  card.setConfig({ type: CALENDAR_CARD_TAG, ...(size ? { size } : {}) })
  cards.push(card)
  return card
}

function applyHass(): void {
  const hass = createMockHass({ dark })
  for (const card of cards) card.hass = hass
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
  // Lit reflects `layout` on its own update cycle, a frame after the resize fires, so
  // the resize handler alone would always show the previous value.
  new MutationObserver(update).observe(card, {
    attributes: true,
    attributeFilter: ['cw-layout'],
  })

  freeform.append(heading, box, readout)
}

// ---- Controls ----------------------------------------------------------------

const header = document.createElement('header')

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

  header.append(title, themeLabel, widthLabel)
}

const main = document.createElement('main')
main.append(presets, freeform)

document.body.className = 'theme-light'
document.body.append(header, main)

layoutPresets()
applyHass()
