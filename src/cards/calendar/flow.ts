/**
 * Step one of the widget's layout: turn a pile of items into the single ordered
 * stream that both sizes render — Apple's widget is one flow of rows, and the medium
 * layout just pours that flow through two columns.
 *
 * The rules, in order:
 *
 *  1. today and forwards only, out to `LOOKAHEAD_DAYS`;
 *  2. anything already finished is dropped, anything running now stays;
 *  3. inside a day: all-day first, then by start time — reminders and events share
 *     one stream rather than being separated;
 *  4. days with nothing in them vanish completely, headings and all, so an empty
 *     Saturday is not a gap between Friday and Sunday;
 *  5. today gets no heading — the widget's own date block already says which day it is.
 */

import { dayNumber } from './datetime'
import { sectionHeading, type FormatContext } from './format'
import { isOver, type CalendarItem } from './model'

export type FlowNode =
  { type: 'header'; key: string; text: string } | { type: 'item'; key: string; item: CalendarItem }

/**
 * Two weeks is comfortably more than any widget can show, and it bounds the window
 * the data source has to subscribe to.
 */
export const LOOKAHEAD_DAYS = 14

export interface FlowOptions {
  now: Date
  ctx: FormatContext
  /** Small never leaves today, no matter what tomorrow holds. */
  todayOnly?: boolean
  horizonDays?: number
}

export interface Flow {
  nodes: FlowNode[]
  /**
   * Today has nothing in it. The widget says so out loud rather than silently
   * starting with tomorrow, which would read as though tomorrow were today.
   */
  todayEmpty: boolean
}

interface Placed {
  item: CalendarItem
  day: number
}

export function buildFlow(items: readonly CalendarItem[], options: FlowOptions): Flow {
  const { now, ctx, todayOnly = false, horizonDays = LOOKAHEAD_DAYS } = options
  const today = dayNumber(now, ctx.timeZone)
  const horizon = today + horizonDays

  const placed: Placed[] = []
  for (const item of items) {
    if (isOver(item, now)) continue

    const startDay = dayNumber(item.start, ctx.timeZone)
    // Something with a duration that began before today and has not ended is still
    // happening, so it belongs to today rather than to the day it started on — else it
    // would fall off the back of the widget while it was going on. Something without a
    // duration gets no such reprieve: yesterday's reminder was for yesterday.
    const day = item.end && startDay < today ? today : startDay

    if (day < today || day > horizon) continue
    if (todayOnly && day !== today) continue
    placed.push({ item, day })
  }

  placed.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    const allDay = Number(b.item.allDay ?? false) - Number(a.item.allDay ?? false)
    if (allDay !== 0) return allDay
    const start = a.item.start.getTime() - b.item.start.getTime()
    if (start !== 0) return start
    // Only to keep the order stable when two things start at the same minute.
    return a.item.title.localeCompare(b.item.title, ctx.locale)
  })

  const nodes: FlowNode[] = []
  let currentDay: number | undefined
  for (const { item, day } of placed) {
    if (day !== currentDay) {
      currentDay = day
      if (day !== today) {
        nodes.push({
          type: 'header',
          key: `day-${day}`,
          text: sectionHeading(item.start, now, ctx),
        })
      }
    }
    nodes.push({ type: 'item', key: item.id, item })
  }

  return { nodes, todayEmpty: placed.length === 0 || placed[0].day !== today }
}
