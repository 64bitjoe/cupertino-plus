/**
 * Where the strip and the day/hour rows get their forecast data: `weather.*`'s own
 * websocket subscription, not the `forecast` attribute.
 *
 * On a real installation (`weather.pirateweather`, checked directly) the entity carries
 * no `forecast` attribute at all. Modern Home Assistant moved forecasts to
 * `weather/subscribe_forecast` some releases back — a card that read `state.attributes`
 * the way tutorials still show would draw nothing and never know why. This file is the
 * only one in the card that touches `hass.connection`; everything downstream of it
 * (`model.ts` and up) sees a plain `ForecastItem[]` and knows nothing about the socket,
 * the same split `calendar/source.ts` uses for the same reason: one file per protocol,
 * because a subscription's failure modes have nothing in common with a render's.
 *
 * The message shape mirrors `calendar/source.ts`'s `calendar/event/subscribe`, but it is
 * NOT verified the same way. That file's shape came from reading
 * `homeassistant/components/calendar/__init__.py` and the frontend bundle inside a real
 * `home-assistant:stable` image; this one is carried over from the frontend's structure
 * by analogy, because this environment has no `docker` binary to grep a live bundle with
 * (see `docs/ha-api-notes.md`'s "Weather forecasts" entry for the exact command to re-run
 * once one is available). `subscribeMessage`'s reject-on-failure and resolve-before-first-
 * push behaviour is shared machinery proven by the calendar subscription, so that part is
 * trusted; only the literal keys of the outgoing message (`forecast_type` in particular)
 * are the guess.
 */

import type { HassEntity, HomeAssistant } from '../../core/types/ha'

/**
 * The two forecast lengths a `weather` entity may publish. Twice-daily forecasts exist on
 * the wire (bit `4`) but no task in this plan draws one, so it has no `ForecastKind` of
 * its own; adding it later is one more bit test and one more literal, not a redesign.
 */
export type ForecastKind = 'daily' | 'hourly'

const FORECAST_DAILY = 1
const FORECAST_HOURLY = 2

const BITS: Record<ForecastKind, number> = {
  daily: FORECAST_DAILY,
  hourly: FORECAST_HOURLY,
}

/**
 * One forecast entry, as `weather/subscribe_forecast` pushes it. `templow` is optional
 * because it is a DAILY field, not an integration quirk: a daily entry has a high
 * (`temperature`) and a low (`templow`) for the day, while an hourly entry is one instant
 * and therefore only has `temperature`. Treating the two as the same shape and reading
 * `templow` off an hourly item would silently read `undefined` forever rather than fail
 * loudly, which is exactly the kind of bug this comment exists to head off.
 */
export interface ForecastItem {
  datetime: string
  condition: string
  temperature?: number
  /** The day's low. Present on daily entries only — see the interface comment above. */
  templow?: number
  precipitation_probability?: number
  precipitation?: number
  humidity?: number
  cloud_coverage?: number
  uv_index?: number
  wind_speed?: number
  wind_gust_speed?: number
  wind_bearing?: number
  dew_point?: number
  pressure?: number
}

/** What the subscription pushes: the forecast type it answers for, and the entries. */
interface ForecastPush {
  type?: string
  forecast?: ForecastItem[] | null
}

/**
 * Whether `entity` has said it publishes `kind` at all, so the card can choose not to ask
 * for a forecast that will never answer. `supported_features` is a bitmask read off a real
 * installation (`weather.pirateweather` reports `7`: every bit set), and an integration is
 * free to report fewer — a card that subscribed unconditionally to a kind an integration
 * does not support would not get an error back, it would just sit on an empty strip
 * forever, because there is nothing on the wire that says "no" to a subscribe request for
 * a kind nobody publishes. Hence asking first rather than trying and falling back.
 *
 * A missing or non-numeric `supported_features` reads as "supports nothing" rather than
 * "supports everything": an entity that has not said what it supports has not promised a
 * forecast subscription will ever answer, and a card that guessed optimistically there
 * would be the one sitting on the empty strip.
 */
export const supportsForecast = (entity: HassEntity, kind: ForecastKind): boolean => {
  const supported = entity.attributes.supported_features
  if (typeof supported !== 'number') return false
  return (supported & BITS[kind]) !== 0
}

/**
 * Opens one `weather/subscribe_forecast` subscription and forwards every push's
 * `forecast` array to `onUpdate`, returning the unsubscribe.
 *
 * Deliberately thin next to `calendar/source.ts`'s `CalendarFeed`: that class exists to
 * hold several concurrent subscriptions (one per calendar), reconcile them against a
 * moving window, and survive a reconcile racing its own in-flight subscribe call. A
 * weather card has exactly one entity and one forecast kind at a time, so none of that
 * machinery earns its keep here — Task 6 is the one that holds the returned unsubscribe
 * and decides when to call it, the same role `CalendarFeed._live` plays for calendars.
 *
 * Not caught here: a rejected `subscribeMessage` (an unknown entity, a kind the entity
 * does not publish, or the schema refusing the request) propagates to the caller. Task 6
 * is where `supportsForecast` is meant to have already ruled out the "wrong kind" case,
 * and where a rejection for any other reason has an entity id and a kind to report
 * against; failing silently in here would just turn a real error into a quietly empty
 * strip, which is the exact failure `supportsForecast` exists to prevent when it can and
 * that a caller still needs to see when it can't.
 */
export const subscribeForecast = async (
  hass: HomeAssistant,
  entityId: string,
  kind: ForecastKind,
  onUpdate: (forecast: ForecastItem[]) => void,
): Promise<() => Promise<void>> => {
  const unsubscribe = await hass.connection.subscribeMessage<ForecastPush>(
    push => onUpdate(push?.forecast ?? []),
    {
      type: 'weather/subscribe_forecast',
      forecast_type: kind,
      entity_id: entityId,
    },
  )

  // `calendar/source.ts` leaves this swallow to each call site (`_close`'s
  // `.catch(() => {})`), because `CalendarFeed` is the only caller and it always goes
  // through that one method. This function has no such chokepoint — Task 6 is a plain map
  // of these closures awaited individually on teardown — so the promise this hands back
  // guarantees its own safety instead of trusting every future call site to remember the
  // catch. A rejection here means the socket is already gone, which is exactly the state
  // teardown is trying to reach, not a failure worth surfacing.
  return () => unsubscribe().catch(() => {})
}
