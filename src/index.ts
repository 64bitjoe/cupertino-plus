/**
 * Bundle entry point.
 *
 * Home Assistant loads exactly one URL, so every card in the library is imported
 * here and registers itself on import. Adding a widget means adding one line.
 */
import { printBanner } from './core/register'

import './cards/battery/battery-card'
import './cards/calendar/calendar-card'
import './cards/chips/chips-card'
import './cards/complication/complication-card'
import './cards/weather/weather-card'

printBanner()

export { BATTERY_CARD_TAG } from './cards/battery/battery-card'
export { CALENDAR_CARD_TAG } from './cards/calendar/calendar-card'
export { CHIPS_CARD_TAG } from './cards/chips/chips-card'
export { COMPLICATION_CARD_TAG } from './cards/complication/complication-card'
export { WEATHER_CARD_TAG } from './cards/weather/weather-card'
export type { WidgetLayout } from './core/size'
