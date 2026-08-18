import { describe, expect, it } from 'vitest'

import { mergeEntities } from './entities-form'

describe('mergeEntities', () => {
  it('round-trips a plain string list unchanged', () => {
    expect(mergeEntities(['sensor.a', 'sensor.b'], ['sensor.a', 'sensor.b'])).toEqual([
      'sensor.a',
      'sensor.b',
    ])
  })

  it('keeps an object row that survives an unrelated addition', () => {
    const prior = [{ entity: 'sensor.a', name: 'Kitchen' }, 'sensor.b']
    expect(mergeEntities(prior, ['sensor.a', 'sensor.b', 'sensor.c'])).toEqual([
      { entity: 'sensor.a', name: 'Kitchen' },
      'sensor.b',
      'sensor.c',
    ])
  })

  it('keeps an object row that survives a reorder', () => {
    const prior = [{ entity: 'sensor.a', name: 'Kitchen' }, 'sensor.b']
    expect(mergeEntities(prior, ['sensor.b', 'sensor.a'])).toEqual([
      'sensor.b',
      { entity: 'sensor.a', name: 'Kitchen' },
    ])
  })

  it('drops an object row along with its entity when it is removed', () => {
    const prior = [{ entity: 'sensor.a', name: 'Kitchen' }, 'sensor.b']
    expect(mergeEntities(prior, ['sensor.b'])).toEqual(['sensor.b'])
  })

  it('reports a newly added id as a bare string', () => {
    expect(mergeEntities(['sensor.a'], ['sensor.a', 'sensor.b'])).toEqual(['sensor.a', 'sensor.b'])
  })

  it('treats an object row with nothing but `entity` set the same as a bare string', () => {
    expect(mergeEntities([{ entity: 'sensor.a' }], ['sensor.a'])).toEqual(['sensor.a'])
  })

  it('matches duplicate ids in prior in the order they appear, oldest claim first', () => {
    const prior = [
      { entity: 'sensor.a', name: 'First' },
      { entity: 'sensor.a', name: 'Second' },
    ]
    expect(mergeEntities(prior, ['sensor.a', 'sensor.a'])).toEqual(prior)
    // Removing one occurrence claims the first-stored row, not the second.
    expect(mergeEntities(prior, ['sensor.a'])).toEqual([{ entity: 'sensor.a', name: 'First' }])
  })

  it('falls back to a bare id when a duplicate is reported more times than prior had rows', () => {
    const prior = [{ entity: 'sensor.a', name: 'First' }]
    expect(mergeEntities(prior, ['sensor.a', 'sensor.a'])).toEqual([
      { entity: 'sensor.a', name: 'First' },
      'sensor.a',
    ])
  })

  it('answers with nothing for nothing, rather than throwing', () => {
    expect(mergeEntities(undefined, [])).toEqual([])
    expect(mergeEntities(undefined, ['sensor.a'])).toEqual(['sensor.a'])
  })

  it('carries an override this module has never heard of', () => {
    const prior = [{ entity: 'light.hall', tap_action: { action: 'toggle' } }]
    expect(mergeEntities(prior, ['light.hall'])).toEqual(prior)
  })
})
