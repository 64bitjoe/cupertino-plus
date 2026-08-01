import { describe, expect, it } from 'vitest'

import { itemTarget, type CalendarItem } from './model'

const anEventFrom = (entityId: string): CalendarItem => ({
  id: 'e',
  entityId,
  kind: 'event',
  title: 'Design review',
  start: new Date('2026-07-24T09:00:00+02:00'),
  end: new Date('2026-07-24T10:00:00+02:00'),
  color: 'orange',
})

const aReminderFrom = (entityId: string): CalendarItem => ({
  id: 'r',
  entityId,
  kind: 'reminder',
  title: 'Pick up dry cleaning',
  start: new Date('2026-07-24T14:30:00+02:00'),
  color: 'purple',
})

describe('the page behind a row', () => {
  it('sends a reminder to its own list rather than to the to-do panel at large', () => {
    expect(itemTarget(aReminderFrom('todo.shopping'))).toEqual({
      panel: 'todo',
      path: '/todo?entity_id=todo.shopping',
    })
  })

  it('names the list even when two rows differ in nothing else', () => {
    const chores = itemTarget(aReminderFrom('todo.chores'))
    const shopping = itemTarget(aReminderFrom('todo.shopping'))
    expect(chores.path).not.toBe(shopping.path)
  })

  it('sends every event to the calendar, whichever calendar it came from', () => {
    // The panel takes no parameter for one — see `itemTarget` — so two calendars have to
    // arrive at the same page, and a test that let them differ would be describing a
    // deep link that does not exist.
    expect(itemTarget(anEventFrom('calendar.work'))).toEqual({
      panel: 'calendar',
      path: '/calendar',
    })
    expect(itemTarget(anEventFrom('calendar.personal')).path).toBe('/calendar')
  })

  it('names a panel that is the key of `hass.panels`, so its absence can be checked', () => {
    expect(itemTarget(anEventFrom('calendar.work')).panel).toBe('calendar')
    expect(itemTarget(aReminderFrom('todo.chores')).panel).toBe('todo')
  })

  it('escapes an id that would otherwise break out of the query string', () => {
    // No real entity id needs it — the domain and object id are both `[a-z0-9_]` — and the
    // encoding is here so that the day something hands this a stranger id, the worst case
    // is a list that does not open rather than a URL with somebody else's parameters on it.
    expect(itemTarget(aReminderFrom('todo.a&b=c')).path).toBe('/todo?entity_id=todo.a%26b%3Dc')
  })
})
