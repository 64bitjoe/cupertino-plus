import { describe, expect, it } from 'vitest'

import {
  clamp01,
  dateFormat,
  DAY,
  HOUR,
  MINUTE,
  minutesSeconds,
  parseDuration,
  plural,
  SECOND,
  secondsLeft,
} from './duration'

describe('parseDuration', () => {
  it('reads two parts as the caller says', () => {
    expect(parseDuration('1:05', 'hours-minutes')).toBe(HOUR + 5 * MINUTE)
    expect(parseDuration('1:05', 'minutes-seconds')).toBe(MINUTE + 5 * SECOND)
  })

  it('reads three parts as H:MM:SS either way', () => {
    for (const pair of ['hours-minutes', 'minutes-seconds'] as const) {
      expect(parseDuration('1:02:03', pair)).toBe(HOUR + 2 * MINUTE + 3 * SECOND)
    }
  })

  it("reads Python's timedelta and ISO 8601", () => {
    expect(parseDuration('1 day, 2:00:00', 'hours-minutes')).toBe(DAY + 2 * HOUR)
    expect(parseDuration('PT1H5M', 'minutes-seconds')).toBe(HOUR + 5 * MINUTE)
    expect(parseDuration('P1D', 'hours-minutes')).toBe(DAY)
  })

  it('allows a fraction only on the seconds', () => {
    expect(parseDuration('0:04:30.5', 'hours-minutes')).toBe(4 * MINUTE + 30_500)
    expect(parseDuration('4:30.5', 'minutes-seconds')).toBe(4 * MINUTE + 30_500)
    expect(parseDuration('4:30.5', 'hours-minutes')).toBeUndefined()
  })

  it('refuses what is not a duration', () => {
    for (const raw of ['running', 'PT', 'P', '', '5', '-1:05']) {
      expect(parseDuration(raw, 'hours-minutes')).toBeUndefined()
    }
  })
})

describe('the small helpers', () => {
  it('rounds seconds up and never below zero', () => {
    expect(secondsLeft(400)).toBe(1)
    expect(secondsLeft(1000)).toBe(1)
    expect(secondsLeft(-5)).toBe(0)
  })

  it('prints m:ss', () => {
    expect(minutesSeconds(65)).toBe('1:05')
    expect(minutesSeconds(3599)).toBe('59:59')
  })

  it('clamps and pluralises', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.25)).toBe(0.25)
    expect(plural(1, 'minute')).toBe('1 minute')
    expect(plural(2, 'minute')).toBe('2 minutes')
  })

  it('keeps one formatter per locale and options', () => {
    expect(dateFormat('en-US', { hour: 'numeric' })).toBe(dateFormat('en-US', { hour: 'numeric' }))
    expect(dateFormat('en-US', { hour: 'numeric' })).not.toBe(dateFormat('pl', { hour: 'numeric' }))
  })
})
