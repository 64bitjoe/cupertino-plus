import { describe, expect, it } from 'vitest'

import { complicationFields, rowHelper, rowLabel, rowOverrideFields } from './fields'

const names = (data: Record<string, unknown>): string[] =>
  complicationFields(data).map(row => row.name)

describe('complicationFields', () => {
  it('offers no history rows on a circular face, which has nowhere to draw a line', () => {
    expect(names({})).toEqual(['layout', 'style', 'countdown', 'min', 'max', 'color', 'container'])
    expect(names({ style: 'gauge', sparkline: true })).not.toContain('sparkline')
  })

  it('offers the switch on the faces that can draw one, and the hours only once it is on', () => {
    expect(names({ style: 'rectangular' })).toContain('sparkline')
    expect(names({ style: 'rectangular' })).not.toContain('sparkline_hours')
    expect(names({ style: 'inline', sparkline: true })).toContain('sparkline_hours')
  })

  it('gives the graph face its hours and no switch, since it always draws its graph', () => {
    const rows = names({ style: 'rectangular-graph' })
    expect(rows).toContain('sparkline_hours')
    expect(rows).not.toContain('sparkline')
  })

  it('offers the countdown span only once counting down is on', () => {
    expect(names({})).not.toContain('countdown_hours')
    expect(names({ countdown: true })).toContain('countdown_hours')
  })
})

describe('rowOverrideFields', () => {
  const card = {
    style: 'rectangular' as const,
    sparkline: false,
    sparklineHours: 24,
    countdown: false,
  }
  const rows = (data: Record<string, unknown>, over = {}) =>
    rowOverrideFields(data, { ...card, ...over }).map(row => row.name)

  it('offers Recent history only on a face that can draw it, and Count down everywhere', () => {
    expect(rows({}, { style: 'circular' })).toEqual(['countdown'])
    expect(rows({})).toEqual(['sparkline', 'countdown'])
  })

  it('offers the row’s hours only once this row will draw a line', () => {
    expect(rows({ sparkline: 'card' })).not.toContain('sparkline_hours')
    expect(rows({ sparkline: 'on' })).toContain('sparkline_hours')
    expect(rows({ sparkline: 'card' }, { sparkline: true })).toContain('sparkline_hours')
    expect(rows({ sparkline: 'off' }, { sparkline: true })).not.toContain('sparkline_hours')
    expect(rows({}, { style: 'rectangular-graph' })).toContain('sparkline_hours')
  })

  it('says what Same as the card currently means', () => {
    const [history] = rowOverrideFields({}, { ...card, sparkline: true })
    const labels =
      history && 'select' in history.selector
        ? history.selector.select.options.map(option =>
            typeof option === 'string' ? option : option.label,
          )
        : []
    expect(labels).toEqual(['Same as the card (on)', 'On for this entity', 'Off for this entity'])
  })
})

describe('the row panel’s words', () => {
  it('calls the tap “When pressed”, as every other card’s panel does', () => {
    expect(rowLabel('action')).toBe('When pressed')
  })

  it('labels every action field the shared form draws, not only its own', () => {
    for (const name of [
      'action_target',
      'action_data',
      'action_entity',
      'confirm',
      'confirm_text',
      'pipeline_id',
      'start_listening',
      'on_hold_action',
      'on_double_tap_navigation_path',
    ]) {
      expect(rowLabel(name)).not.toBe(name)
    }
    expect(rowHelper('action_data')).toBeDefined()
    expect(rowHelper('on_hold_action')).toBeDefined()
  })

  it('keeps its own words over the shared ones, and the key for anything unknown', () => {
    expect(rowLabel('sparkline')).toBe('Recent history')
    expect(rowLabel('mystery')).toBe('mystery')
  })
})
