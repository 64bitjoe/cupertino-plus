import { describe, expect, it } from 'vitest'

import type { FlowNode } from './flow'
import { COST, geometryFor, packFlow } from './layout'
import type { CalendarItem } from './model'

const item = (title: string, location?: string): CalendarItem => ({
  id: title,
  kind: 'event',
  title,
  ...(location ? { location } : {}),
  start: new Date('2026-07-24T10:00:00Z'),
  end: new Date('2026-07-24T11:00:00Z'),
  color: 'orange',
})

const row = (title: string, location?: string): FlowNode => ({
  type: 'item',
  key: title,
  item: item(title, location),
})

const heading = (text: string): FlowNode => ({ type: 'header', key: text, text })

/** The shape a column ended up with, as the spec writes it: a list of row costs. */
const costs = (flow: FlowNode[], budgets: number[], mode: 'small' | 'medium'): number[][] =>
  packFlow(flow, budgets, mode).map(column => column.rows.map(r => r.cost))

const titles = (flow: FlowNode[], budgets: number[], mode: 'small' | 'medium'): string[][] =>
  packFlow(flow, budgets, mode).map(column =>
    column.rows.map(r => (r.node.type === 'header' ? r.node.text : r.node.item.title)),
  )

const TOMORROW = heading('TOMORROW')
const REST_OF_TOMORROW = [row('T1'), row('T2'), row('T3')]

/**
 * The four cases the rules were reconstructed from, transcribed straight out of
 * `docs/calendar-widget-rules.md`. If one of these changes, the widget stopped
 * matching the thing it is copying.
 */
describe('medium — the reference screenshots', () => {
  it('three plain events today: the third flows into the right column', () => {
    const flow = [row('A'), row('B'), row('C'), TOMORROW, ...REST_OF_TOMORROW]
    expect(costs(flow, [4, 7], 'medium')).toEqual([
      [2, 2],
      [2, 1, 2, 2],
    ])
    // The fourth item of tomorrow does not fit and is dropped, not summarised.
    expect(titles(flow, [4, 7], 'medium')).toEqual([
      ['A', 'B'],
      ['C', 'TOMORROW', 'T1', 'T2'],
    ])
  })

  it('two events today: tomorrow starts at the top of the right column', () => {
    const flow = [row('A'), row('B'), TOMORROW, ...REST_OF_TOMORROW]
    expect(costs(flow, [4, 7], 'medium')).toEqual([
      [2, 2],
      [1, 2, 2, 2],
    ])
  })

  it('one event with a location: it expands and eats the left column', () => {
    const flow = [row('A', 'Długa 36'), TOMORROW, ...REST_OF_TOMORROW]
    expect(costs(flow, [4, 7], 'medium')).toEqual([[3], [1, 2, 2, 2]])
  })

  it('a location wins even when it pushes the next event across', () => {
    const flow = [row('A', 'Długa 36'), row('B'), TOMORROW, ...REST_OF_TOMORROW]
    expect(costs(flow, [4, 7], 'medium')).toEqual([[3], [2, 1, 2, 2]])
    expect(titles(flow, [4, 7], 'medium')[1]).toEqual(['B', 'TOMORROW', 'T1', 'T2'])
  })
})

describe('medium — packing rules', () => {
  it('drops the location rather than the event when only the location will not fit', () => {
    // Two rows left, an event that wants three: the event stays, compacted.
    const flow = [row('A'), row('B', 'somewhere')]
    const columns = packFlow(flow, [4, 7], 'medium')
    expect(columns[0]!.rows.map(r => r.cost)).toEqual([2, 2])
    expect(columns[0]!.rows[1]!.expanded).toBe(false)
  })

  it('never leaves a heading alone at the bottom of a column', () => {
    // Two rows left after the events: a heading plus its first event needs three.
    const flow = [row('A'), row('B'), heading('SUNDAY, 26 JUL'), row('S1')]
    expect(titles(flow, [6, 7], 'medium')).toEqual([
      ['A', 'B'],
      ['SUNDAY, 26 JUL', 'S1'],
    ])
  })

  it('starts on the right when the left column has no budget', () => {
    const flow = [TOMORROW, ...REST_OF_TOMORROW]
    expect(titles(flow, [0, 7], 'medium')).toEqual([[], ['TOMORROW', 'T1', 'T2', 'T3']])
  })

  it('stops at the end of the last column instead of overflowing', () => {
    const flow = Array.from({ length: 20 }, (_, index) => row(`E${index}`))
    const columns = packFlow(flow, [4, 7], 'medium')
    expect(columns.every(column => column.used <= column.budget)).toBe(true)
    expect(columns.flatMap(column => column.rows)).toHaveLength(5)
  })

  it('never reserves a location row for a reminder', () => {
    const reminder: FlowNode = {
      type: 'item',
      key: 'r',
      item: { ...item('Weigh in', 'Bathroom'), kind: 'reminder' },
    }
    expect(costs([reminder], [4, 7], 'medium')).toEqual([[2], []])
  })
})

describe('small — count first, locations out of the slack', () => {
  it('shows the location of a lone event', () => {
    expect(costs([row('A', 'Długa 36')], [4], 'small')).toEqual([[COST.expanded]])
  })

  it('shows no location at all once two events fill the budget', () => {
    const columns = packFlow([row('A', 'Długa 36'), row('B')], [4], 'small')
    expect(columns[0]!.rows.map(r => r.cost)).toEqual([2, 2])
    expect(columns[0]!.rows.some(r => r.expanded)).toBe(false)
  })

  it('spends slack top-down', () => {
    // Five rows, two events, both with locations: only the first one can expand.
    const columns = packFlow([row('A', 'here'), row('B', 'there')], [5], 'small')
    expect(columns[0]!.rows.map(r => r.expanded)).toEqual([true, false])
  })
})

describe('invariants, over twenty thousand random flows', () => {
  /** Deterministic, so a failure is reproducible rather than a Tuesday thing. */
  let seed = 1
  const random = (bound: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed >>> 8) % bound
  }

  const randomFlow = (): FlowNode[] => {
    const flow: FlowNode[] = []
    const length = random(9)
    for (let i = 0; i < length; i += 1) {
      // Headings only ever arrive before an item, and never two in a row — that is
      // all `buildFlow` can produce.
      const heads = random(4) === 0 && (flow.length === 0 || flow[flow.length - 1]!.type === 'item')
      flow.push(heads ? heading(`H${i}`) : row(`I${i}`, random(2) ? 'somewhere' : undefined))
    }
    while (flow.length && flow[flow.length - 1]!.type === 'header') flow.pop()
    return flow
  }

  it('holds its budget, keeps headings company, and never reorders', () => {
    const broken: string[] = []

    for (let trial = 0; trial < 20_000 && broken.length === 0; trial += 1) {
      const flow = randomFlow()
      const mode = random(2) ? 'medium' : 'small'
      const budgets = mode === 'medium' ? [random(9), random(11)] : [random(9)]
      const columns = packFlow(flow, budgets, mode)
      const where = JSON.stringify({ mode, budgets, flow: flow.map(n => n.key) })

      for (const column of columns) {
        if (column.used > column.budget) broken.push(`over budget: ${where}`)
        if (column.rows.reduce((sum, r) => sum + r.cost, 0) !== column.used) {
          broken.push(`used does not match the rows: ${where}`)
        }
        if (column.rows[column.rows.length - 1]?.node.type === 'header') {
          broken.push(`heading left alone at the foot of a column: ${where}`)
        }
      }

      // What is drawn is always a prefix of the flow: rows are dropped off the end,
      // never skipped over in the middle.
      const placed = columns.flatMap(column => column.rows.map(r => r.node.key))
      if (
        placed.join() !==
        flow
          .slice(0, placed.length)
          .map(n => n.key)
          .join()
      ) {
        broken.push(`not a prefix of the flow: ${where}`)
      }
    }

    expect(broken).toEqual([])
  })
})

describe('geometry', () => {
  const DEFAULT_HEIGHT = 248

  it('reproduces Apple’s budgets at the default card height', () => {
    expect(geometryFor('small', DEFAULT_HEIGHT, false).budgets).toEqual([4])
    expect(geometryFor('medium', DEFAULT_HEIGHT, false).budgets).toEqual([4, 7])
  })

  it('gives the left column no budget when today is empty', () => {
    expect(geometryFor('medium', DEFAULT_HEIGHT, true).budgets).toEqual([0, 7])
  })

  it('grows with the card rather than leaving the extra height blank', () => {
    const [left, right] = geometryFor('medium', 400, false).budgets
    expect(right).toBeGreaterThan(7)
    expect(left).toBeGreaterThan(4)
  })

  it('never returns a negative budget for a card squashed flat', () => {
    expect(geometryFor('medium', 40, false).budgets).toEqual([0, 0])
  })

  /**
   * The budget is only worth anything if a full column actually fits in the box. The
   * rendered heights below are what the card's CSS produces; the tallest way to spend
   * N rows is on compact rows, which are the dearest per row.
   */
  it('never budgets more rows than the column can draw, at any height', () => {
    const INSET = 16
    const DATE_BLOCK = 84
    const GAP = 6
    const COMPACT = 56
    const HEADING = 20

    const tallestRendering = (budget: number): number => {
      if (budget <= 0) return 0
      const compacts = Math.floor(budget / 2)
      const heading = budget % 2
      const nodes = compacts + heading
      return compacts * COMPACT + heading * HEADING + (nodes - 1) * GAP
    }

    for (let height = 100; height <= 800; height += 2) {
      const content = height - 2 * INSET
      const [left, right] = geometryFor('medium', height, false).budgets
      expect(tallestRendering(right!)).toBeLessThanOrEqual(content)
      expect(tallestRendering(left!)).toBeLessThanOrEqual(Math.max(0, content - DATE_BLOCK))
      expect(geometryFor('small', height, false).budgets[0]).toBe(left)
    }
  })
})
