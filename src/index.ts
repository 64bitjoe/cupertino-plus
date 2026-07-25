/**
 * Bundle entry point.
 *
 * Home Assistant loads exactly one URL, so every card in the library is imported
 * here and registers itself on import. Adding a widget means adding one line.
 */
import { printBanner } from './core/register'

import './cards/calendar/calendar-card'

printBanner()

export { CALENDAR_CARD_TAG } from './cards/calendar/calendar-card'
export type { WidgetSize } from './core/size'
