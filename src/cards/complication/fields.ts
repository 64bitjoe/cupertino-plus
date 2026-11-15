/**
 * The complication editor's card-level rows, as a pure function of the config, so the tests can
 * pin which rows show when without a browser. The card-level element
 * (`complication-card-editor.ts`) owns its words; the row panel's words are at the bottom here.
 */

import { gestureHelper, gestureLabel } from '../../core/action-form'
import { PANEL_CONTAINER_FIELD } from '../../core/container'
import type { HaFormSchema } from '../../core/types/ha'
import { SPARKLINE_HOURS_MAX, SPARKLINE_HOURS_MIN } from './history'
import {
  COMPLICATION_STYLES,
  DEFAULT_STYLE,
  drawsSparkline,
  SPARKLINE_STYLES,
  STYLE_LABELS,
  type ComplicationStyle,
} from './style'
import { TINTS } from './tint'
import {
  BENTO_SIZE_LABELS,
  BENTO_SIZES,
  COMPLICATION_LAYOUTS,
  type ComplicationLayout,
} from './bento'
import { BENTO_AUTOMATIC, historyFor, OVERRIDE_CARD, OVERRIDE_CHOICES } from './model'

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * Five rows, three of which say "Automatic".
 *
 * That ratio is the card's whole premise: everything derivable is derived, and the fields
 * exist for the cases where the derivation cannot know what somebody meant. A card with
 * only `entities` filled in is already a working card.
 */
const STYLE_FIELD: HaFormSchema = {
  name: 'style',
  selector: {
    select: {
      mode: 'dropdown',
      options: COMPLICATION_STYLES.map(style => ({ value: style, label: STYLE_LABELS[style] })),
    },
  },
}

const LAYOUT_LABELS: Record<ComplicationLayout, string> = {
  panel: 'One panel — every entity the same size',
  bento: 'Bento — a cell each, in sizes of their own',
}

const LAYOUT_FIELD: HaFormSchema = {
  name: 'layout',
  selector: {
    select: {
      mode: 'dropdown',
      options: COMPLICATION_LAYOUTS.map(value => ({ value, label: LAYOUT_LABELS[value] })),
    },
  },
}

const COLOR_FIELD: HaFormSchema = {
  name: 'color',
  selector: {
    select: {
      mode: 'dropdown',
      options: TINTS.map(tint => ({ value: tint, label: capitalise(tint) })),
    },
  },
}

/**
 * The card's own rows, shown only where they do something: the sparkline switch on the faces
 * that can draw one, its hours wherever a line is actually drawn (the graph face always draws
 * one, so it gets the hours and no switch).
 *
 * Exported for the tests, which is the only way to pin "shown only when" without a browser.
 */
export const complicationFields = (data: Record<string, unknown>): readonly HaFormSchema[] => {
  const style = (data.style ?? DEFAULT_STYLE) as ComplicationStyle
  const rows: HaFormSchema[] = [LAYOUT_FIELD, STYLE_FIELD]

  const bento = data.layout === 'bento'
  if (bento || SPARKLINE_STYLES.includes(style)) {
    rows.push({ name: 'sparkline', selector: { boolean: {} } })
  }
  if (bento ? data.sparkline === true : drawsSparkline(style, data.sparkline === true)) {
    rows.push({
      name: 'sparkline_hours',
      selector: {
        number: {
          min: SPARKLINE_HOURS_MIN,
          max: SPARKLINE_HOURS_MAX,
          step: 1,
          mode: 'slider',
          unit_of_measurement: 'h',
        },
      },
    })
  }

  rows.push({ name: 'countdown', selector: { boolean: {} } })
  if (data.countdown === true) {
    rows.push({
      name: 'countdown_hours',
      selector: { number: { min: 1, max: 168, step: 1, mode: 'box', unit_of_measurement: 'h' } },
    })
  }

  rows.push(
    { name: 'min', selector: { number: { mode: 'box' } } },
    { name: 'max', selector: { number: { mode: 'box' } } },
    COLOR_FIELD,
    PANEL_CONTAINER_FIELD,
  )
  return rows
}

/** What a row panel needs to know about the card to decide which of its rows apply. */
export interface CardContext {
  layout?: ComplicationLayout
  style: ComplicationStyle
  sparkline: boolean
  sparklineHours: number
  countdown: boolean
}

const choiceSelector = (card: boolean, what: string) => ({
  select: {
    mode: 'dropdown' as const,
    options: OVERRIDE_CHOICES.map(value => ({
      value,
      label:
        value === OVERRIDE_CARD
          ? `Same as the card (${card ? 'on' : 'off'})`
          : value === 'on'
            ? `On for this ${what}`
            : `Off for this ${what}`,
    })),
  },
})

const HOURS_FIELD: HaFormSchema = {
  name: 'sparkline_hours',
  selector: {
    number: {
      min: SPARKLINE_HOURS_MIN,
      max: SPARKLINE_HOURS_MAX,
      step: 1,
      mode: 'box',
      unit_of_measurement: 'h',
    },
  },
}

const fromChoice = (value: unknown): boolean | undefined =>
  value === 'on' ? true : value === 'off' ? false : undefined

/**
 * A row panel's own Recent history and Count down rows, shown only where they do something:
 * Recent history only on a face that can draw a line, and its hours only once this row will
 * actually draw one. Count down is always offered, since any face can count down.
 */
export const rowOverrideFields = (
  data: Record<string, unknown>,
  card: CardContext,
): HaFormSchema[] => {
  const rows: HaFormSchema[] = []
  // In bento each cell picks its own size and face, so they come first: they decide whether
  // the history rows below apply at all.
  if (card.layout === 'bento') {
    rows.push(
      {
        name: 'size',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: BENTO_AUTOMATIC, label: 'Automatic — the first is large, the rest small' },
              ...BENTO_SIZES.map(value => ({ value, label: BENTO_SIZE_LABELS[value] })),
            ],
          },
        },
      },
      {
        name: 'style',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: BENTO_AUTOMATIC, label: 'Automatic — chosen for its size' },
              ...COMPLICATION_STYLES.map(value => ({ value, label: STYLE_LABELS[value] })),
            ],
          },
        },
      },
    )
    // History can apply on any face a bento cell may wear, so the row is always offered; its
    // hours appear once it is switched on here or on the card.
    rows.push({ name: 'sparkline', selector: choiceSelector(card.sparkline, 'entity') })
    const choice = fromChoice(data.sparkline)
    if (choice ?? card.sparkline) rows.push(HOURS_FIELD)
    rows.push({ name: 'countdown', selector: choiceSelector(card.countdown, 'entity') })
    return rows
  }
  const graph = card.style === 'rectangular-graph'
  if (graph || SPARKLINE_STYLES.includes(card.style)) {
    rows.push({ name: 'sparkline', selector: choiceSelector(graph || card.sparkline, 'entity') })
    const sparkline = fromChoice(data.sparkline)
    const drawn = historyFor(sparkline !== undefined ? { sparkline } : {}, {
      enabled: card.sparkline,
      hours: card.sparklineHours,
      style: card.style,
    })
    if (drawn !== null) rows.push(HOURS_FIELD)
  }
  rows.push({ name: 'countdown', selector: choiceSelector(card.countdown, 'entity') })
  return rows
}

// ---- The row panel's words ---------------------------------------------------------
//
// Here rather than in `complication-list-editor.ts` so the tests can read them. Anything this
// table does not name falls through to `core/action-form.ts`, which labels every action field
// the panel draws — the gestures and the tap's own target, data, entity, confirmation and
// assistant rows — the same way in every card's editor.

const ROW_LABELS: Record<string, string> = {
  entity: 'Entity',
  name: 'Name',
  icon: 'Icon',
  color: 'Colour',
  min: 'Minimum',
  max: 'Maximum',
  action: 'When pressed',
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
  size: 'Size',
  style: 'Face',
  sparkline: 'Recent history',
  sparkline_hours: 'History to show',
  countdown: 'Count down',
  value: 'Reading',
  supporting: 'Supporting line',
  templating: 'Use templates',
}

const ROW_HELPERS: Record<string, string> = {
  name: 'The caption, and what VoiceOver reads first. Leave it blank for the entity’s own name.',
  icon: 'Shown where a face has no ring to draw.',
  color: 'From what the entity measures. Set one only to overrule it.',
  min: 'Fill in both Minimum and Maximum to draw a gauge for a reading with no natural range.',
  max: 'Overrides the card’s own Minimum and Maximum for this entity.',
  action: 'Opens the entity’s details unless you choose otherwise.',
  navigation_path: 'A dashboard path, as the URL bar shows it.',
  url_path: 'Opens in a new tab, or the browser on the companion app.',
  service:
    'As domain.service. Its target and data have their own rows below; either may be a template.',
  size: 'How much of the bento grid this entity takes. A size that does not fit shrinks before the entity is left out.',
  style:
    'Which face this cell wears. Automatic picks a ring for a square, a graph for a number in a large cell.',
  sparkline: 'A small line of how this reading has moved. Only for readings that are numbers.',
  sparkline_hours: 'How far back this entity’s line reaches, in hours. Leave blank for the card’s.',
  countdown:
    'For a timer, a time, a date-and-time helper or a calendar: show the time left, with a ring that drains.',
  value:
    'Printed in place of the entity’s reading. A template that answers a plain number moves the gauge too.',
  supporting: 'One line under the reading on the rectangular faces.',
  templating:
    'Lets the name, icon and actions take a Jinja template, and adds Reading and Supporting line.',
}

/** A row panel field's label: this card's own word, else the shared action field's, else its key. */
export const rowLabel = (name: string): string => ROW_LABELS[name] ?? gestureLabel(name) ?? name

/** A row panel field's helper text, likewise. */
export const rowHelper = (name: string): string | undefined =>
  ROW_HELPERS[name] ?? gestureHelper(name)
