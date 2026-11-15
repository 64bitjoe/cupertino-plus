import { describe, expect, it } from 'vitest'

import { historyMessage, historyRows, readHistoryRows } from './history'

describe('historyMessage', () => {
  it('asks for states only, between two instants', () => {
    expect(historyMessage(['sensor.a'], 0, 60_000)).toEqual({
      type: 'history/history_during_period',
      start_time: '1970-01-01T00:00:00.000Z',
      end_time: '1970-01-01T00:01:00.000Z',
      entity_ids: ['sensor.a'],
      minimal_response: true,
      no_attributes: true,
    })
  })

  it('sends an option only when it is given', () => {
    const message = historyMessage(['sensor.a'], 0, 1, {
      significantChangesOnly: false,
      includeStartTimeState: false,
    })
    expect(message).toMatchObject({
      significant_changes_only: false,
      include_start_time_state: false,
    })
    expect(historyMessage(['sensor.a'], 0, 1)).not.toHaveProperty('significant_changes_only')
  })
})

describe('historyRows', () => {
  const both = { s: 'end', lc: 100, lu: 160 }

  it('reads when a state began for `changed`, and when it was written for `updated`', () => {
    expect(readHistoryRows([both], 'changed')).toEqual([{ state: 'end', at: 100_000 }])
    expect(readHistoryRows([both], 'updated')).toEqual([{ state: 'end', at: 160_000 }])
  })

  it('falls back to the other time when its own is missing', () => {
    expect(readHistoryRows([{ s: 'on', lu: 5 }], 'changed')).toEqual([{ state: 'on', at: 5000 }])
    expect(readHistoryRows([{ s: 'on', lc: 5 }], 'updated')).toEqual([{ state: 'on', at: 5000 }])
  })

  it('reads the long shape too', () => {
    const long = {
      state: '21.5',
      last_changed: '1970-01-01T00:00:01.000Z',
      last_updated: '1970-01-01T00:00:02.000Z',
    }
    expect(readHistoryRows([long], 'changed')).toEqual([{ state: '21.5', at: 1000 }])
    expect(readHistoryRows([long], 'updated')).toEqual([{ state: '21.5', at: 2000 }])
  })

  it('sorts, turns a number into text, and skips what it cannot read', () => {
    const rows = [{ s: 'b', lu: 2 }, { s: 3, lu: 1 }, { s: 'x' }, null, { lu: 4 }]
    expect(readHistoryRows(rows, 'updated')).toEqual([
      { state: '3', at: 1000 },
      { state: 'b', at: 2000 },
    ])
  })

  it('is empty for an answer with no list for the entity', () => {
    expect(historyRows(undefined, 'sensor.a', 'changed')).toEqual([])
    expect(historyRows({ 'sensor.a': 'oops' }, 'sensor.a', 'changed')).toEqual([])
    expect(historyRows({ 'sensor.a': [{ s: 'on', lu: 1 }] }, 'sensor.a', 'changed')).toHaveLength(1)
  })
})
