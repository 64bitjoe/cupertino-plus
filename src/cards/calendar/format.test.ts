import { describe, expect, it } from 'vitest'

import type { FrontendLocaleData } from '../../core/types/ha'
import { timePreferences } from './datetime'
import { TIME_DASH, itemTime, moreLabel, widgetDate, type FormatContext } from './format'

const ctx: FormatContext = { locale: 'en-GB', timeZone: 'Europe/Warsaw', hour12: true }
const ctx24: FormatContext = { ...ctx, hour12: false }

const at = (time: string): Date => new Date(`2026-07-24T${time}:00+02:00`)

/** Flattens the render tokens back into the string a reader would see. */
const render = (start: string, end?: string, context = ctx, allDay = false): string => {
  const time = itemTime(
    { start: at(start), ...(end ? { end: at(end) } : {}), ...(allDay ? { allDay } : {}) },
    context,
  )
  const token = (t: { text: string; meridiem?: string; meridiemFirst?: boolean }): string =>
    t.meridiemFirst ? `${t.meridiem ?? ''}${t.text}` : `${t.text}${t.meridiem ?? ''}`

  if (time.kind === 'none') return ''
  if (time.kind === 'point') return token(time.at)
  return `${token(time.from)} ${TIME_DASH} ${token(time.to)}`
}

describe('time ranges, 12-hour', () => {
  it('drops :00 and prints the meridiem once', () => {
    expect(render('17:00', '18:00')).toBe(`5 ${TIME_DASH} 6PM`)
  })

  it('keeps the minutes that are not zero', () => {
    expect(render('15:00', '16:30')).toBe(`3 ${TIME_DASH} 4:30PM`)
    expect(render('18:15', '19:15')).toBe(`6:15 ${TIME_DASH} 7:15PM`)
    expect(render('20:00', '21:30')).toBe(`8 ${TIME_DASH} 9:30PM`)
  })

  it('treats noon as the afternoon, like the clock does', () => {
    expect(render('12:00', '13:00')).toBe(`12 ${TIME_DASH} 1PM`)
  })

  it('prints both meridiems when the range crosses midday', () => {
    expect(render('11:00', '13:00')).toBe(`11AM ${TIME_DASH} 1PM`)
  })

  it('prints one time for something with no duration', () => {
    expect(render('10:30')).toBe('10:30AM')
    expect(render('14:00', '14:00')).toBe('2PM')
  })

  it('prints no time at all for an all-day entry', () => {
    expect(render('00:00', '23:59', ctx, true)).toBe('')
  })
})

describe('time ranges that leave the day', () => {
  it('keeps both meridiems, so a multi-day event cannot read as an hour', () => {
    const time = itemTime(
      {
        start: new Date('2026-07-24T17:00:00+02:00'),
        end: new Date('2026-07-27T18:00:00+02:00'),
      },
      ctx,
    )
    // `5 – 6PM` for a three-day trip would be a lie; `5PM – 6PM` at least is not.
    expect(time).toMatchObject({ from: { meridiem: 'PM' }, to: { meridiem: 'PM' } })
  })
})

describe('locales that put the day period first', () => {
  it('keeps the shared meridiem in front of the range, not in the middle of it', () => {
    const japanese: FormatContext = { locale: 'ja', timeZone: 'Europe/Warsaw', hour12: true }
    const time = itemTime(
      { start: new Date('2026-07-24T13:05:00+02:00'), end: new Date('2026-07-24T14:00:00+02:00') },
      japanese,
    )
    expect(time).toMatchObject({
      from: { text: '1:05', meridiemFirst: true },
      to: { text: '2' },
    })
    expect((time as { to: { meridiem?: string } }).to.meridiem).toBeUndefined()
  })
})

describe('time ranges, 24-hour', () => {
  it('keeps the minutes: "17 – 18" would read as a range of numbers', () => {
    expect(render('17:00', '18:00', ctx24)).toBe(`17:00 ${TIME_DASH} 18:00`)
  })

  it('has no meridiem to print', () => {
    expect(render('10:30', undefined, ctx24)).toBe('10:30')
  })
})

describe('the timezone is the display one', () => {
  it('formats an evening event as the small hours in a zone further east', () => {
    expect(render('23:00', '23:30', { ...ctx, timeZone: 'Asia/Tokyo' })).toBe(
      `6 ${TIME_DASH} 6:30AM`,
    )
  })
})

describe('the tail indicator', () => {
  it('agrees with itself about the number', () => {
    expect(moreLabel(1)).toBe('1 more event')
    expect(moreLabel(2)).toBe('2 more events')
    expect(moreLabel(11)).toBe('11 more events')
  })
})

describe('the widget’s own date block', () => {
  it('is the weekday in capitals and the bare day number', () => {
    expect(widgetDate(at('12:00'), ctx)).toEqual({ weekday: 'FRIDAY', day: '24' })
  })
})

describe('clock preference', () => {
  it('follows an explicit setting', () => {
    expect(
      timePreferences({ language: 'en', time_format: '12', first_weekday: 'monday' }).hour12,
    ).toBe(true)
    expect(
      timePreferences({ language: 'en', time_format: '24', first_weekday: 'monday' }).hour12,
    ).toBe(false)
  })

  it('follows the language when told to', () => {
    expect(
      timePreferences({ language: 'en-US', time_format: 'language', first_weekday: 'monday' })
        .hour12,
    ).toBe(true)
    expect(
      timePreferences({ language: 'pl', time_format: 'language', first_weekday: 'monday' }).hour12,
    ).toBe(false)
  })

  /**
   * The card's own `time_format`, which exists because the profile's `system` cannot see
   * macOS's 24-hour switch through any browser API — see `TIME_FORMAT_OPTIONS`.
   */
  describe("a card's own override", () => {
    const profile24: FrontendLocaleData = {
      language: 'en',
      time_format: '24',
      first_weekday: 'monday',
    }
    const profile12: FrontendLocaleData = {
      language: 'en',
      time_format: '12',
      first_weekday: 'monday',
    }

    it('beats the profile in both directions', () => {
      expect(timePreferences(profile24, '12').hour12).toBe(true)
      expect(timePreferences(profile12, '24').hour12).toBe(false)
    })

    it('defers to the profile on `system`, which is the default', () => {
      expect(timePreferences(profile24, 'system').hour12).toBe(false)
      expect(timePreferences(profile12, 'system').hour12).toBe(true)
    })

    it('defers to the profile when the key is absent', () => {
      expect(timePreferences(profile24).hour12).toBe(false)
      expect(timePreferences(profile12).hour12).toBe(true)
    })

    /**
     * `time_format: 24` without quotes is a NUMBER in YAML, and it is what anybody copying
     * the option out of the README would write.
     */
    it('accepts the number YAML gives an unquoted value', () => {
      expect(timePreferences(profile24, 12).hour12).toBe(true)
      expect(timePreferences(profile12, 24).hour12).toBe(false)
    })

    it('ignores a value it does not know rather than guessing', () => {
      expect(timePreferences(profile24, 'am_pm').hour12).toBe(false)
      expect(timePreferences(profile24, null).hour12).toBe(false)
      expect(timePreferences(profile12, '').hour12).toBe(true)
    })

    /**
     * An override pins the clock and nothing else. Dropping the language with it would
     * hand `Intl` the browser's locale and change the separator and the digits along with
     * the hour cycle, which is not what "12-hour" asks for.
     */
    it('keeps the language it was formatting with', () => {
      expect(timePreferences({ ...profile24, language: 'pl' }, '12').locale).toBe('pl')
    })

    /** A profile set to `system` still drops the language, override or not. */
    it('leaves the browser in charge of the locale under `system`', () => {
      expect(
        timePreferences({ language: 'en', time_format: 'system', first_weekday: 'monday' }).locale,
      ).toBeUndefined()
    })
  })
})
