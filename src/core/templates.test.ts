import { describe, expect, it, vi } from 'vitest'

import type { HomeAssistant } from './types/ha'
import { isTemplate, requestKey, TemplatePool } from './templates'

/**
 * A connection that records every subscribe and hands back the push callback, so a test can
 * drive a result in at the moment it chooses. Modelled on `weather/source.test.ts`'s fake,
 * which is the only other place in this repo that tests a subscription without a browser.
 */
const fakeHass = () => {
  const opened: { message: Record<string, unknown>; push: (m: unknown) => void }[] = []
  const stops: ReturnType<typeof vi.fn>[] = []

  const subscribeMessage = vi.fn((push: (m: unknown) => void, message: Record<string, unknown>) => {
    const stop = vi.fn().mockResolvedValue(undefined)
    stops.push(stop)
    opened.push({ message, push })
    return Promise.resolve(stop)
  })

  return {
    hass: { connection: { subscribeMessage } } as unknown as HomeAssistant,
    opened,
    stops,
    subscribeMessage,
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('isTemplate', () => {
  it('recognises both delimiters and nothing else', () => {
    expect(isTemplate("{{ states('sensor.a') }}")).toBe(true)
    expect(isTemplate('{% if true %}yes{% endif %}')).toBe(true)
    expect(isTemplate('Front door')).toBe(false)
    expect(isTemplate('')).toBe(false)
    expect(isTemplate(undefined)).toBe(false)
    expect(isTemplate(42)).toBe(false)
  })
})

describe('requestKey', () => {
  /**
   * Variables are part of the identity, and leaving them out is the bug this asserts against:
   * two chips using `{{ states(config.entity) }}` would share one subscription and both read
   * the first chip's answer.
   */
  it('separates the same template used with different variables', () => {
    const a = { template: 'T', variables: { config: { entity: 'light.a' } } }
    const b = { template: 'T', variables: { config: { entity: 'light.b' } } }
    expect(requestKey(a)).not.toBe(requestKey(b))
  })

  it('is stable for the same request', () => {
    const one = { template: 'T', variables: { config: { entity: 'light.a' } } }
    const two = { template: 'T', variables: { config: { entity: 'light.a' } } }
    expect(requestKey(one)).toBe(requestKey(two))
  })

  it('treats an absent variables map as its own identity', () => {
    expect(requestKey({ template: 'T' })).toBe(requestKey({ template: 'T' }))
    expect(requestKey({ template: 'T' })).not.toBe(requestKey({ template: 'T', variables: {} }))
  })
})

describe('TemplatePool', () => {
  it('subscribes with the message Home Assistant expects', async () => {
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T', variables: { config: { entity: 'light.a' } } }])
    await flush()

    expect(opened[0]?.message).toEqual({
      type: 'render_template',
      template: 'T',
      variables: { config: { entity: 'light.a' } },
      report_errors: true,
    })
  })

  it('omits variables entirely when there are none', async () => {
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }])
    await flush()

    expect(opened[0]?.message).toEqual({
      type: 'render_template',
      template: 'T',
      report_errors: true,
    })
  })

  it('caches a pushed result and reports the change once', async () => {
    const { hass, opened } = fakeHass()
    const changes = vi.fn()
    const pool = new TemplatePool(changes)
    const key = requestKey({ template: 'T' })

    pool.sync(hass, [{ template: 'T' }])
    await flush()
    expect(pool.read(key)).toBeUndefined()

    opened[0]?.push({ result: 'Hall' })
    expect(pool.read(key)).toBe('Hall')
    expect(changes).toHaveBeenCalledTimes(1)

    // The same result again is not a change, and must not repaint the card.
    opened[0]?.push({ result: 'Hall' })
    expect(changes).toHaveBeenCalledTimes(1)
  })

  it('opens one subscription for a template two rows share', async () => {
    const { hass, subscribeMessage } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }, { template: 'T' }])
    await flush()

    expect(subscribeMessage).toHaveBeenCalledTimes(1)
  })

  /**
   * The prune, and the whole reason this is a pool rather than a subscribe helper. The weather
   * card shipped without one: an hourly forecast subscription stayed live at a layout that no
   * longer drew it, pushing into a field nothing read.
   */
  it('closes a subscription the card no longer wants', async () => {
    const { hass, stops } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'A' }, { template: 'B' }])
    await flush()

    pool.sync(hass, [{ template: 'A' }])
    await flush()

    expect(stops[1]).toHaveBeenCalled()
    expect(stops[0]).not.toHaveBeenCalled()
    expect(pool.read(requestKey({ template: 'B' }))).toBeUndefined()
  })

  it('does not resubscribe a template it already holds', async () => {
    const { hass, subscribeMessage } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'A' }])
    await flush()
    pool.sync(hass, [{ template: 'A' }])
    await flush()

    expect(subscribeMessage).toHaveBeenCalledTimes(1)
  })

  it('closes everything on disconnect', async () => {
    const { hass, stops } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'A' }, { template: 'B' }])
    await flush()
    pool.disconnect()

    expect(stops[0]).toHaveBeenCalled()
    expect(stops[1]).toHaveBeenCalled()
    expect(pool.read(requestKey({ template: 'A' }))).toBeUndefined()
  })

  it('warns on a reported error and leaves the field unresolved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'BAD' }])
    await flush()
    opened[0]?.push({ error: 'UndefinedError', level: 'ERROR' })

    expect(pool.read(requestKey({ template: 'BAD' }))).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('warns and forgets the slot when the subscribe itself is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subscribeMessage = vi.fn().mockRejectedValue(new Error('nope'))
    const hass = { connection: { subscribeMessage } } as unknown as HomeAssistant
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }])
    await flush()

    // Forgotten rather than left claimed, so a later sync can try again.
    pool.sync(hass, [{ template: 'T' }])
    await flush()

    expect(subscribeMessage).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  /**
   * Home Assistant parses a render's output before sending it, so `result` is a native JSON
   * type — a real boolean for `{{ is_state(…) }}`, a real null for `{{ none }}`. Verified
   * against the handler; `docs/ha-api-notes.md` has the table.
   */
  it('renders a non-string result as a string', async () => {
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }])
    await flush()
    opened[0]?.push({ result: 42 })
    expect(pool.read(requestKey({ template: 'T' }))).toBe('42')

    opened[0]?.push({ result: false })
    expect(pool.read(requestKey({ template: 'T' }))).toBe('false')
  })

  it('treats a null result as no result, not as the word null', () => {
    return (async () => {
      const { hass, opened } = fakeHass()
      const pool = new TemplatePool(() => {})

      pool.sync(hass, [{ template: 'T' }])
      await flush()
      opened[0]?.push({ result: null })

      expect(pool.read(requestKey({ template: 'T' }))).toBeUndefined()
    })()
  })
})
