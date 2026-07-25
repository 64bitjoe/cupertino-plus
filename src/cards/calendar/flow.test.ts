import { describe, expect, it } from 'vitest'

import { buildFlow } from './flow'
import type { FormatContext } from './format'
import type { CalendarItem } from './model'

/** Friday, 24 July 2026, midday in Warsaw — the day the rules were reconstructed on. */
const NOW = new Date('2026-07-24T12:00:00+02:00')

const ctx: FormatContext = { locale: 'en-GB', timeZone: 'Europe/Warsaw', hour12: true }

let counter = 0
const event = (title: string, start: string, end?: string): CalendarItem => ({
  id: `${title}-${(counter += 1)}`,
  kind: 'event',
  title,
  start: new Date(start),
  ...(end ? { end: new Date(end) } : {}),
  color: 'orange',
})

const labels = (items: CalendarItem[], todayOnly = false): string[] =>
  buildFlow(items, { now: NOW, ctx, todayOnly }).nodes.map(node =>
    node.type === 'header' ? `# ${node.text}` : node.item.title,
  )

describe('selection', () => {
  it('drops what has finished and keeps what is still running', () => {
    const items = [
      event('Over', '2026-07-24T09:00:00+02:00', '2026-07-24T10:00:00+02:00'),
      event('Running', '2026-07-24T11:30:00+02:00', '2026-07-24T13:00:00+02:00'),
      event('Later', '2026-07-24T15:00:00+02:00', '2026-07-24T16:00:00+02:00'),
    ]
    expect(labels(items)).toEqual(['Running', 'Later'])
  })

  it('keeps a reminder whose moment has passed — it is still a thing to do', () => {
    const overdue: CalendarItem = {
      id: 'r',
      kind: 'reminder',
      title: 'Weigh in',
      start: new Date('2026-07-24T10:30:00+02:00'),
      color: 'purple',
    }
    expect(labels([overdue])).toEqual(['Weigh in'])
  })

  it('leaves yesterday behind', () => {
    const items = [event('Yesterday', '2026-07-23T15:00:00+02:00', '2026-07-23T16:00:00+02:00')]
    expect(labels(items)).toEqual([])
  })

  it('carries a multi-day event that is already under way into today', () => {
    const items = [event('Trip', '2026-07-22T08:00:00+02:00', '2026-07-27T20:00:00+02:00')]
    // Grouped under today, so it is not filed under a day that has already gone.
    expect(labels(items)).toEqual(['Trip'])
  })

  it('does not carry yesterday’s reminder forward for want of an end time', () => {
    const stale: CalendarItem = {
      id: 'r',
      kind: 'reminder',
      title: 'Yesterday’s reminder',
      start: new Date('2026-07-23T10:30:00+02:00'),
      color: 'purple',
    }
    const staleAllDay: CalendarItem = {
      id: 'a',
      kind: 'event',
      title: 'Yesterday all day',
      allDay: true,
      start: new Date('2026-07-23T00:00:00+02:00'),
      color: 'blue',
    }
    expect(labels([stale, staleAllDay])).toEqual([])
  })

  it('stops at the horizon', () => {
    const far = event('Far off', '2026-09-01T10:00:00+02:00', '2026-09-01T11:00:00+02:00')
    expect(labels([far])).toEqual([])
  })

  it('groups by the display timezone, not the browser’s', () => {
    // 00:30 on the 25th in Warsaw is still the 24th in UTC.
    const item = event('Late', '2026-07-25T00:30:00+02:00', '2026-07-25T01:30:00+02:00')
    const warsaw = buildFlow([item], { now: NOW, ctx }).nodes
    const utc = buildFlow([item], { now: NOW, ctx: { ...ctx, timeZone: 'UTC' } }).nodes

    expect(warsaw[0]).toMatchObject({ type: 'header', text: 'TOMORROW' })
    // In UTC it lands on today, which has no heading at all.
    expect(utc[0]).toMatchObject({ type: 'item' })
  })
})

describe('order', () => {
  it('puts all-day entries first, then sorts by start time', () => {
    const allDay: CalendarItem = {
      id: 'a',
      kind: 'event',
      title: 'Kraków trip',
      allDay: true,
      start: new Date('2026-07-24T00:00:00+02:00'),
      color: 'blue',
    }
    const items = [
      event('Late', '2026-07-24T18:00:00+02:00', '2026-07-24T19:00:00+02:00'),
      event('Early', '2026-07-24T14:00:00+02:00', '2026-07-24T15:00:00+02:00'),
      allDay,
    ]
    expect(labels(items)).toEqual(['Kraków trip', 'Early', 'Late'])
  })

  it('interleaves reminders with events instead of grouping them', () => {
    const reminder: CalendarItem = {
      id: 'r',
      kind: 'reminder',
      title: 'Weigh in',
      start: new Date('2026-07-24T14:30:00+02:00'),
      color: 'purple',
    }
    const items = [
      event('Lessons', '2026-07-24T16:00:00+02:00', '2026-07-24T17:00:00+02:00'),
      reminder,
    ]
    expect(labels(items)).toEqual(['Weigh in', 'Lessons'])
  })
})

describe('headings', () => {
  const tomorrow = event('Tomorrow item', '2026-07-25T10:00:00+02:00', '2026-07-25T11:00:00+02:00')
  const sunday = event('Sunday item', '2026-07-26T10:00:00+02:00', '2026-07-26T11:00:00+02:00')

  it('gives today no heading of its own', () => {
    const today = event('Today item', '2026-07-24T14:00:00+02:00', '2026-07-24T15:00:00+02:00')
    expect(labels([today])).toEqual(['Today item'])
  })

  it('says TOMORROW only when the section really is tomorrow', () => {
    expect(labels([tomorrow])).toEqual(['# TOMORROW', 'Tomorrow item'])
  })

  it('skips an empty day completely, heading and all', () => {
    // Nothing on Saturday, so Sunday gets a date rather than inheriting `TOMORROW`.
    expect(labels([sunday])).toEqual(['# SUNDAY, 26 JUL', 'Sunday item'])
  })

  it('follows the locale’s own day/month order', () => {
    const american = buildFlow([sunday], { now: NOW, ctx: { ...ctx, locale: 'en-US' } })
    expect(american.nodes[0]).toMatchObject({ text: 'SUNDAY, JUL 26' })
  })

  it('reports an empty today so the card can say so', () => {
    expect(buildFlow([tomorrow], { now: NOW, ctx }).todayEmpty).toBe(true)
    const today = event('Today item', '2026-07-24T14:00:00+02:00', '2026-07-24T15:00:00+02:00')
    expect(buildFlow([today, tomorrow], { now: NOW, ctx }).todayEmpty).toBe(false)
  })
})

describe('small', () => {
  it('never leaves today', () => {
    const items = [
      event('Today item', '2026-07-24T14:00:00+02:00', '2026-07-24T15:00:00+02:00'),
      event('Tomorrow item', '2026-07-25T10:00:00+02:00', '2026-07-25T11:00:00+02:00'),
    ]
    expect(labels(items, true)).toEqual(['Today item'])
  })

  it('has nothing to show when today is empty, however busy tomorrow is', () => {
    const items = [event('Tomorrow item', '2026-07-25T10:00:00+02:00', '2026-07-25T11:00:00+02:00')]
    expect(labels(items, true)).toEqual([])
  })
})
