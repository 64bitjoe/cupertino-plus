import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HomeAssistant } from '../../core/types/ha'
import {
  bucketMsFor,
  decimalsOf,
  DEFAULT_SPARKLINE_HOURS,
  formatExtreme,
  hasStatistics,
  historyRequest,
  mergeHistory,
  normalise,
  parseHistory,
  parseStatistics,
  reducePoints,
  refreshMsFor,
  resample,
  sparklineFor,
  sparklineGeometry,
  sparklineHoursFor,
  statisticsPeriodFor,
  statisticsRequest,
  withLive,
  type HistoryPoint,
} from './history'
import { clearHistoryCache, HistoryFeed, historyCacheSize, MAX_ENTRIES } from './history-feed'

const HOUR = 3_600_000
const NOW = Date.parse('2026-11-14T12:00:00Z')

describe('sparklineHoursFor', () => {
  it('clamps to one to forty-eight whole hours, and defaults anything unreadable', () => {
    expect(sparklineHoursFor(undefined)).toBe(DEFAULT_SPARKLINE_HOURS)
    expect(sparklineHoursFor('six')).toBe(DEFAULT_SPARKLINE_HOURS)
    expect(sparklineHoursFor(0)).toBe(1)
    expect(sparklineHoursFor(100)).toBe(48)
    expect(sparklineHoursFor('6')).toBe(6)
    expect(sparklineHoursFor(2.6)).toBe(3)
  })
})

describe('refreshMsFor', () => {
  it('refetches about once a sample, between a minute and a quarter of an hour', () => {
    expect(refreshMsFor(1)).toBe(75_000)
    expect(refreshMsFor(48)).toBe(15 * 60_000)
    expect(refreshMsFor(0.1)).toBe(60_000)
  })
})

describe('historyRequest', () => {
  it('asks for the window, minimally and without attributes', () => {
    expect(historyRequest(['sensor.a'], 2, NOW)).toEqual({
      type: 'history/history_during_period',
      start_time: '2026-11-14T10:00:00.000Z',
      end_time: '2026-11-14T12:00:00.000Z',
      entity_ids: ['sensor.a'],
      minimal_response: true,
      no_attributes: true,
    })
  })
})

describe('parseHistory', () => {
  it('reads the compressed shape, in seconds, oldest first', () => {
    const response = {
      'sensor.a': [
        { s: '21.5', lu: NOW / 1000 - 60 },
        { s: '21.0', lu: NOW / 1000 - 120 },
      ],
    }
    expect(parseHistory(response, 'sensor.a')).toEqual([
      { t: NOW - 120_000, v: 21 },
      { t: NOW - 60_000, v: 21.5 },
    ])
  })

  it('reads the long shape too, and lc when there is no lu', () => {
    const response = {
      'sensor.a': [
        { state: '3', last_changed: '2026-11-14T11:00:00Z' },
        { s: '4', lc: NOW / 1000 },
      ],
    }
    expect(parseHistory(response, 'sensor.a')).toEqual([
      { t: NOW - HOUR, v: 3 },
      { t: NOW, v: 4 },
    ])
  })

  it('skips what is not a number rather than drawing it as zero', () => {
    const response = {
      'sensor.a': [
        { s: 'unavailable', lu: 1 },
        { s: '', lu: 2 },
        { s: '5', lu: 3 },
        { s: '6' },
        null,
      ],
    }
    expect(parseHistory(response, 'sensor.a')).toEqual([{ t: 3000, v: 5 }])
  })

  it('answers nothing for nothing', () => {
    expect(parseHistory(undefined, 'sensor.a')).toEqual([])
    expect(parseHistory({}, 'sensor.a')).toEqual([])
    expect(parseHistory({ 'sensor.a': 'oops' }, 'sensor.a')).toEqual([])
  })
})

describe('withLive', () => {
  it('ends the line on the live reading, and drops anything from the future', () => {
    expect(
      withLive(
        [
          { t: NOW - 10, v: 1 },
          { t: NOW + 10, v: 9 },
        ],
        2,
        NOW,
      ),
    ).toEqual([
      { t: NOW - 10, v: 1 },
      { t: NOW, v: 2 },
    ])
    expect(withLive([{ t: NOW - 10, v: 1 }], null, NOW)).toEqual([{ t: NOW - 10, v: 1 }])
  })
})

describe('resample', () => {
  it('averages the points in a sample and holds the last reading through an empty one', () => {
    const points = [
      { t: 0, v: 10 },
      { t: 5, v: 20 },
      { t: 35, v: 40 },
    ]
    // Four samples of 10 across [0, 40].
    expect(resample(points, 0, 40, 4)).toEqual([15, 20, 20, 40])
  })

  it('starts from whatever was in force when the window opened', () => {
    expect(resample([{ t: -100, v: 7 }], 0, 40, 4)).toEqual([7, 7, 7, 7])
  })

  it('leaves the samples before the first reading empty', () => {
    expect(resample([{ t: 25, v: 3 }], 0, 40, 4)).toEqual([null, null, 3, 3])
  })
})

describe('normalise', () => {
  it('places each value between the low and the high', () => {
    expect(normalise([10, 15, 20, null])).toEqual([0, 0.5, 1, null])
  })

  it('puts a flat line in the middle rather than on the floor', () => {
    expect(normalise([4, 4, 4])).toEqual([0.5, 0.5, 0.5])
    expect(normalise([null])).toEqual([null])
  })
})

describe('sparklineGeometry', () => {
  it('needs two readings to draw a line', () => {
    expect(sparklineGeometry([null, 3], 100, 32)).toBeNull()
    expect(sparklineGeometry([], 100, 32)).toBeNull()
  })

  it('runs edge to edge, high at the top, inset off the edges, and reports the extremes', () => {
    const geometry = sparklineGeometry([0, 10], 100, 32, 2)
    expect(geometry?.line).toBe('M0 30 L100 2')
    expect(geometry?.area).toBe('M0 30 L100 2 L100 32 L0 32 Z')
    expect(geometry?.end).toEqual({ x: 1, y: 2 / 32 })
    expect(geometry?.low).toBe(0)
    expect(geometry?.high).toBe(10)
  })

  it('smooths through midpoints, so the curve never passes a real reading', () => {
    const geometry = sparklineGeometry([0, 10, 0], 100, 32, 2)
    expect(geometry?.line).toBe('M0 30 Q50 2 75 16 L100 30')
  })

  it('starts where the data does', () => {
    const geometry = sparklineGeometry([null, null, 1, 2], 90, 32, 2)
    expect(geometry?.line.startsWith('M60 ')).toBe(true)
  })
})

describe('sparklineFor', () => {
  it('draws nothing before the first fetch', () => {
    expect(sparklineFor(undefined, 5, NOW, 24)).toBeNull()
  })

  it('draws the window with the live reading on the end', () => {
    const points = [{ t: NOW - 23 * HOUR, v: 10 }]
    const geometry = sparklineFor(points, 20, NOW, 24)
    expect(geometry?.high).toBe(20)
    expect(geometry?.low).toBe(10)
    expect(geometry?.end.x).toBe(1)
  })
})

describe('formatExtreme', () => {
  it('prints at the entity’s own precision, with a tight or spaced unit', () => {
    expect(formatExtreme(22.083, 1, '°C', 'en')).toBe('22.1°C')
    expect(formatExtreme(1013, 0, 'hPa', 'en')).toBe('1,013 hPa')
    expect(formatExtreme(46, 0, '%', 'en')).toBe('46%')
    expect(formatExtreme(4.5, 5, undefined, 'en')).toBe('4.50')
  })

  it('counts the decimals a state carries', () => {
    expect(decimalsOf('21.40')).toBe(2)
    expect(decimalsOf('72')).toBe(0)
  })
})

describe('HistoryFeed', () => {
  afterEach(() => clearHistoryCache())

  const hassAnswering = (answer: () => Promise<unknown>) => {
    const callWS = vi.fn(answer)
    return { hass: { callWS } as unknown as HomeAssistant, callWS }
  }

  it('fetches once, shares the answer, and tells every waiting card', async () => {
    const { hass, callWS } = hassAnswering(async () => ({ 'sensor.a': [{ s: '1', lu: 1 }] }))
    const first = vi.fn()
    const second = vi.fn()
    const a = new HistoryFeed(first)
    const b = new HistoryFeed(second)

    a.sync(hass, ['sensor.a'], 24, NOW)
    b.sync(hass, ['sensor.a'], 24, NOW)
    await vi.waitFor(() => expect(first).toHaveBeenCalled())

    expect(callWS).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalled()
    expect(b.read('sensor.a', 24)).toEqual([{ t: 1000, v: 1 }])
  })

  it('asks again only once the entry is stale', async () => {
    const { hass, callWS } = hassAnswering(async () => ({}))
    const feed = new HistoryFeed(() => {})
    feed.sync(hass, ['sensor.a'], 1, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.a', 1)).toEqual([]))

    feed.sync(hass, ['sensor.a'], 1, NOW + 1000)
    expect(callWS).toHaveBeenCalledTimes(1)
    feed.sync(hass, ['sensor.a'], 1, NOW + refreshMsFor(1))
    expect(callWS).toHaveBeenCalledTimes(2)
  })

  it('remembers a failed fetch as empty rather than asking on every render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { hass, callWS } = hassAnswering(async () => {
      throw new Error('no history')
    })
    const feed = new HistoryFeed(() => {})
    feed.sync(hass, ['sensor.a'], 24, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.a', 24)).toEqual([]))
    feed.sync(hass, ['sensor.a'], 24, NOW + 1)
    expect(callWS).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('statistics', () => {
  it('asks for five-minute rows up to a day and hourly beyond', () => {
    expect(statisticsPeriodFor(1)).toBe('5minute')
    expect(statisticsPeriodFor(24)).toBe('5minute')
    expect(statisticsPeriodFor(48)).toBe('hour')
    expect(statisticsRequest(['sensor.p'], 2, NOW)).toEqual({
      type: 'recorder/statistics_during_period',
      start_time: new Date(NOW - 2 * HOUR).toISOString(),
      end_time: new Date(NOW).toISOString(),
      statistic_ids: ['sensor.p'],
      period: '5minute',
      types: ['mean', 'state'],
    })
  })

  it('is used for an entity with a state_class, and nothing else', () => {
    expect(hasStatistics({ state_class: 'measurement' })).toBe(true)
    expect(hasStatistics({ state_class: 'total_increasing' })).toBe(true)
    expect(hasStatistics({ unit_of_measurement: 'W' })).toBe(false)
    expect(hasStatistics(undefined)).toBe(false)
  })

  it('reads each period at its middle, in either time shape, mean before state', () => {
    const start = NOW - HOUR
    const response = {
      'sensor.p': [
        { start: start + 5 * 60_000, end: start + 10 * 60_000, mean: 2 },
        { start, end: start + 5 * 60_000, mean: 1 },
        { start: new Date(start + 600_000).toISOString(), mean: null, state: 30 },
        { start: start + 900_000, mean: null, state: null },
      ],
    }
    expect(parseStatistics(response, 'sensor.p', 1)).toEqual([
      { t: start + 150_000, v: 1 },
      { t: start + 450_000, v: 2 },
      { t: start + 750_000, v: 30 },
    ])
    expect(parseStatistics({}, 'sensor.p', 1)).toEqual([])
  })
})

describe('incremental history', () => {
  it('asks only for what changed since, without the state at the start', () => {
    expect(historyRequest(['sensor.a'], 2, NOW, NOW - 60_000)).toMatchObject({
      start_time: new Date(NOW - 60_000).toISOString(),
      include_start_time_state: false,
    })
    expect(historyRequest(['sensor.a'], 2, NOW)).not.toHaveProperty('include_start_time_state')
  })

  it('pools readings into buckets, keeping a lone reading as it is', () => {
    const lone = { t: 5, v: 9 }
    const pooled = reducePoints([{ t: 0, v: 1 }, { t: 2, v: 3 }, lone], 4)
    expect(pooled).toEqual([{ t: 1, v: 2, n: 2, last: 3 }, lone])
    expect(pooled[1]).toBe(lone)
    // Pooling pooled points weighs them by how many readings each stands for.
    expect(
      reducePoints(
        [
          { t: 0, v: 1, n: 3, last: 1 },
          { t: 1, v: 5 },
        ],
        4,
      ),
    ).toEqual([{ t: 0.25, v: 2, n: 4, last: 5 }])
  })

  it('appends what is new and trims what slid out, keeping the reading in force', () => {
    const held: HistoryPoint[] = [
      { t: 10, v: 1 },
      { t: 20, v: 2 },
      { t: 40, v: 3 },
    ]
    const fresh: HistoryPoint[] = [
      { t: 40, v: 3 },
      { t: 60, v: 4 },
    ]
    expect(mergeHistory(held, fresh, 30, 1)).toEqual([
      { t: 20, v: 2 },
      { t: 40, v: 3 },
      { t: 60, v: 4 },
    ])
  })

  it('draws a pooled history exactly as the raw readings it came from', () => {
    // A reading every 10 s over a day: 8,640 points, pooled into ~190.
    const raw: HistoryPoint[] = []
    for (let t = NOW - 24 * HOUR; t <= NOW - 10_000; t += 10_000) {
      raw.push({ t, v: Math.round(Math.sin(t / 3_000_000) * 100) })
    }
    const pooled = reducePoints(raw, bucketMsFor(24))
    expect(pooled.length).toBeLessThan(200)
    const rawLine = resample(withLive(raw, 50, NOW), NOW - 24 * HOUR, NOW)
    const pooledLine = resample(withLive(pooled, 50, NOW), NOW - 24 * HOUR, NOW)
    pooledLine.forEach((value, i) => expect(value).toBeCloseTo(rawLine[i] as number, 6))
  })

  it('carries a pooled bucket’s newest reading forward, not its mean', () => {
    const pooled = reducePoints(
      [
        { t: 0, v: 0 },
        { t: 1, v: 1000 },
      ],
      10,
    )
    expect(resample(pooled, 0, 40, 4)).toEqual([500, 1000, 1000, 1000])
  })

  it('splices the live reading on without copying, as withLive would', () => {
    const points: HistoryPoint[] = [
      { t: NOW - 20 * HOUR, v: 18 },
      { t: NOW - 6 * HOUR, v: 21 },
      { t: NOW + HOUR, v: 99 },
    ]
    const start = NOW - 24 * HOUR
    expect(resample(points, start, NOW, 48, { t: NOW, v: 20 })).toEqual(
      resample(withLive(points, 20, NOW), start, NOW),
    )
  })
})

describe('HistoryFeed, the cost of a busy sensor', () => {
  afterEach(() => clearHistoryCache())

  const busy = { 'sensor.p': { attributes: { state_class: 'measurement' } } }

  it('asks the statistics for an entity with a state_class', async () => {
    const callWS = vi.fn(async (message: Record<string, unknown>) =>
      message.type === 'recorder/statistics_during_period'
        ? {
            'sensor.p': [
              { start: NOW - 2 * HOUR, end: NOW - HOUR, mean: 1 },
              { start: NOW - HOUR, end: NOW, mean: 2 },
            ],
          }
        : {},
    )
    const hass = { callWS, states: busy } as unknown as HomeAssistant
    const feed = new HistoryFeed(() => {})
    feed.sync(hass, ['sensor.p'], 48, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.p', 48)).toHaveLength(2))
    expect(callWS).toHaveBeenCalledTimes(1)
    expect(callWS.mock.calls[0]?.[0]).toMatchObject({ period: 'hour' })
  })

  it('falls back to the history when the statistics have nothing', async () => {
    const callWS = vi.fn(async (message: Record<string, unknown>) =>
      message.type === 'history/history_during_period' ? { 'sensor.p': [{ s: '5', lu: 1 }] } : {},
    )
    const hass = { callWS, states: busy } as unknown as HomeAssistant
    const feed = new HistoryFeed(() => {})
    feed.sync(hass, ['sensor.p'], 24, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.p', 24)).toEqual([{ t: 1000, v: 5 }]))
    expect(callWS.mock.calls.map(([message]) => message.type)).toEqual([
      'recorder/statistics_during_period',
      'history/history_during_period',
    ])
  })

  it('refreshes raw history with only what changed since the last fetch', async () => {
    const callWS = vi.fn(async (message: Record<string, unknown>) =>
      message.include_start_time_state === false
        ? { 'sensor.a': [{ s: '2', lu: (NOW + 60_000) / 1000 }] }
        : { 'sensor.a': [{ s: '1', lu: (NOW - HOUR) / 1000 }] },
    )
    const hass = { callWS } as unknown as HomeAssistant
    const feed = new HistoryFeed(() => {})
    feed.sync(hass, ['sensor.a'], 24, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.a', 24, NOW)).toHaveLength(1))

    const later = NOW + refreshMsFor(24)
    feed.sync(hass, ['sensor.a'], 24, later)
    await vi.waitFor(() => expect(feed.read('sensor.a', 24, later)).toHaveLength(2))
    expect(callWS.mock.calls[1]?.[0]).toMatchObject({
      start_time: new Date(NOW).toISOString(),
      end_time: new Date(later).toISOString(),
      include_start_time_state: false,
    })
  })

  it('draws the geometry once per points, live reading and minute', async () => {
    const callWS = vi.fn(async () => ({
      'sensor.a': [
        { s: '1', lu: (NOW - 3 * HOUR) / 1000 },
        { s: '3', lu: (NOW - HOUR) / 1000 },
      ],
    }))
    const hass = { callWS } as unknown as HomeAssistant
    const feed = new HistoryFeed(() => {})
    expect(feed.geometry('sensor.a', 24, 2, NOW)).toBeNull()
    feed.sync(hass, ['sensor.a'], 24, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.a', 24)).toBeDefined())

    const first = feed.geometry('sensor.a', 24, 2, NOW)
    expect(first).not.toBeNull()
    expect(feed.geometry('sensor.a', 24, 2, NOW + 1000)).toBe(first)
    expect(feed.geometry('sensor.a', 24, 2.5, NOW + 1000)).not.toBe(first)
    expect(feed.geometry('sensor.a', 24, 2.5, NOW + 61_000)).not.toBe(
      feed.geometry('sensor.a', 24, 2.5, NOW + 1000),
    )
    expect(first).toEqual(sparklineFor(feed.read('sensor.a', 24), 2, NOW, 24))
  })

  it('drops an entry nobody has read for two refresh periods', async () => {
    const hass = { callWS: vi.fn(async () => ({})) } as unknown as HomeAssistant
    const feed = new HistoryFeed(() => {})
    feed.sync(hass, ['sensor.a', 'sensor.b'], 1, NOW)
    await vi.waitFor(() => expect(feed.read('sensor.a', 1, NOW)).toEqual([]))

    // sensor.a is still being read; sensor.b went away with its card.
    const later = NOW + 2 * refreshMsFor(1) + 1
    feed.read('sensor.a', 1, later)
    feed.sync(hass, [], 1, later)
    expect(feed.read('sensor.b', 1, later)).toBeUndefined()
    expect(feed.read('sensor.a', 1, later)).toEqual([])
  })

  it('never holds more than its cap, dropping the least recently read', async () => {
    const hass = { callWS: vi.fn(async () => ({})) } as unknown as HomeAssistant
    const feed = new HistoryFeed(() => {})
    const ids = Array.from({ length: MAX_ENTRIES + 10 }, (_, i) => `sensor.n${i}`)
    feed.sync(hass, ids, 24, NOW)
    await vi.waitFor(() => expect(feed.read(ids[ids.length - 1] as string, 24, NOW)).toEqual([]))
    ids.slice(10).forEach(id => feed.read(id, 24, NOW + 1))
    feed.sync(hass, [], 24, NOW + 2)
    expect(historyCacheSize()).toBe(MAX_ENTRIES)
    expect(feed.read('sensor.n0', 24, NOW + 2)).toBeUndefined()
    expect(feed.read(ids[ids.length - 1] as string, 24, NOW + 2)).toEqual([])
  })
})
