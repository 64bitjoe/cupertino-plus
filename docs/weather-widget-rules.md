# Weather widget: the rules

Current conditions, a six-hour strip, and — at `large` — a week of daily rows with a range bar
under each one. This is the specification the card implements; the code follows it module by
module, and `src/cards/weather/*.test.ts` pins the worked cases below. Read
[`complication-widget-rules.md`](complication-widget-rules.md) first for the library's stance
on drawing an unavailable entity rather than dropping it, which this card follows without
restating the argument.

What makes this card different from its three siblings is not the layout, it is the data: the
calendar, battery and complication cards all read `hass.states` and are done. This one also
holds open a live websocket subscription for as long as it is on the dashboard, because the
one number the design leans on hardest — the day's high and low — does not live on the entity
at all. Most of what follows is the shape of that difference.

---

## 1. `temperature` is the high, `templow` is the low

The single easiest mistake this card can make, stated as plainly as `source.ts` and `model.ts`
both state it: a daily forecast entry's `temperature` field is **that day's HIGH**, and
`templow` is **the low**. There is no `temphigh` — Home Assistant simply reuses the same key
current-conditions attributes use for "the temperature", and repurposes it on a daily forecast
entry to mean the ceiling of the day rather than a single reading. An hourly entry does not
have this problem, and does not have `templow` at all: it is one instant, not a day, so it
carries only `temperature` — reading `templow` off an hourly item does not fail, it silently
returns `undefined` forever, which is worse than a crash because nothing about the resulting
card looks wrong. `ForecastItem` (`source.ts`) makes `templow` optional for this reason and
documents which shape does and does not carry it; `model.ts`'s reads of `today.temperature` and
`today.templow` are annotated the same way at the point they happen, and
`model.test.ts`, `"reads a daily entry's temperature as the HIGH and templow as the LOW"`, pins
the case a swapped pair of variable names would break silently rather than loudly.

## 2. Why the daily bars share one scale

`layout.ts`'s `weekRange` computes a single `{ min, max }` across every day handed to it, once,
and `spanFor` takes that shared range as an argument rather than ever deriving one of its own —
there is no per-day overload to reach for by mistake. That is the whole of §5 in
`docs/complication-widget-rules.md`'s design vocabulary applied to a strip of seven bars instead
of one ring: a number only means something in relation to the other numbers around it, and a
week of forecasts is exactly the kind of data where the relation is the entire point.

**What a per-day scale would look like, concretely:** each bar spans its own day's low to its
own day's high, always. Scale that day against itself and the bar runs edge to edge every time,
because a day's low is always the left end of its own range and its high is always the right
end — the fraction is 0 to 1 by construction, whatever the actual numbers are. Every row would
look "correct" in isolation (a bar from the low to the high, exactly as specified) and the whole
list would be uniformly, plausibly, meaninglessly identical: seven full-width bars telling you
that every day has a low and a high, which you already knew before looking. The bug would not
throw, would not fail a type check, and would not look wrong to anyone who only ever looked at
one row at a time — it is only visible by comparing rows, which is exactly the review this
card's screenshots exist to force. `_renderDaily` calls `weekRange` exactly once, outside the
per-day `.map`, and the class comment on it says so in those terms.

## 3. Why the card asks `supported_features` before it subscribes

`weather/subscribe_forecast` has no way to say no. Subscribe to `forecast_type: 'hourly'`
against an entity whose integration never publishes hourly forecasts, and nothing comes back —
not an error, not an empty acknowledgement, nothing at all — because there is no code path on
the other end that would ever push to that subscription. A card that subscribed unconditionally
would not fail; it would sit forever on a strip with no data, indistinguishable from a slow
network, and there is no timeout that could tell the two apart because the "slow" case can be
legitimately slow. `source.ts`'s `supportsForecast` reads the entity's own `supported_features`
bitmask (`1` for daily, `2` for hourly — verified against a live installation, see
`docs/ha-api-notes.md`) and the card asks it before ever calling `subscribeForecast`
(`weather-card.ts`'s `_resubscribe`). A missing or non-numeric `supported_features` reads as
"supports nothing" rather than "supports everything", for the same reason: an entity that has
not said what it supports has not promised anything will ever answer either.

## 4. Why even the smallest card needs a subscription

`small` draws nothing but current conditions and one line underneath it reading `H:90°F L:67°F`
— no hourly strip, no daily list, seemingly the least data-hungry of the three sizes. It still
opens the daily forecast subscription, unconditionally, because that high and low are not
attributes: a `weather` entity's own state carries `temperature` (right now), `humidity`, wind
figures and the rest, but nothing that means "today's ceiling" or "today's floor" — those two
numbers exist nowhere except `daily[0]`, the first entry of the same forecast the large card's
whole list is built from. `_resubscribe`'s own comment states this outright: daily is not
gated behind `cwLayout !== 'small'` the way hourly is, because the smallest card still needs it.
Take the subscription away and `small` does not degrade gracefully to "no high/low shown" — it
falls back to `_detailLine`'s other branch, printing the condition word a second time
(`now.condition`, already shown as the glyph above it) in place of the numbers the design asks
for.

## 5. How night is inferred

Home Assistant's fifteen weather conditions are not fifteen day-or-night pairs. `clear-night`
is the **only** string the platform emits specifically for after dark — every other condition
(`sunny`, `cloudy`, `rainy`, all the rest) is reported identically whether the integration last
updated at 2pm or 2am, because the concept of "it is currently dark" is not something
`condition` encodes at all. `condition.ts`'s `NIGHT_ICONS` table is deliberately tiny — only
`sunny`→moon and `partlycloudy`→cloud-with-moon — because those are the only two glyphs where a
day and a night version are visibly different pictures; a rainy cloud looks like a rainy cloud
at any hour, so `rainy` has no night entry and needs none.

Which means "is it night" has to come from somewhere else, and `model.ts` uses two different
somewhere-elses depending on which instant is being asked about:

- **Right now**, `isNightNow` prefers `sun.sun`'s own `state`
  (`above_horizon`/`below_horizon`) when the entity exists in `hass.states`, because it is Home
  Assistant's own answer to exactly this question and is correct at every latitude and season —
  a fixed clock window is only ever an approximation. This is the value the current-conditions
  glyph uses, and — this is the part worth stating plainly — it is the exact same boolean the
  hourly strip's first ("Now") column uses too, computed once and shared, specifically so the
  two can never disagree about what is, on the dashboard, the same instant. An earlier version
  of this file computed the first hourly column separately and could show a sun in "Now" and a
  moon three inches to its left; `model.test.ts`, `'agrees with the hourly strip's "Now"
column, even where sun.sun disagrees with the clock'`, pins that they cannot drift apart
  again.
- **Every hour after that**, and every daily row, has no `sun.sun` opinion to lean on:
  `sun.sun`'s `state` is a snapshot of right now, with no forecast of its own, so it cannot
  answer "will 2pm tomorrow be light or dark". Those columns fall back to a plain clock
  heuristic (`isNightAt`, a fixed 6am–8pm window in the display timezone) — approximate near
  the summer/winter extremes of a high latitude, and the only signal available at all for a
  timestamp that has not happened yet. Absent `sun.sun` altogether (not every installation runs
  the integration), the current-conditions reading falls back to the same clock heuristic too.
- **Daily rows never show the moon at all**, on purpose: `readWeather` always calls
  `conditionIcon(item.condition, false)` for a day, whatever hour its `datetime` happens to be
  stamped at. A daily entry summarises the whole day; drawing the moon on it because the
  timestamp underneath happened to land at midnight would read as "this day is dark", not
  "here is Tuesday's forecast".

## 6. Weather alerts are not implemented

The design this card is reconstructed from includes an alert line — a warning banner above or
alongside current conditions for a weather advisory in effect. It is not here, and that is
worth saying outright rather than leaving a reader to notice the gap by its absence: no task in
this plan wired an alert source in, and Home Assistant has no standard weather-alert entity to
read one off. Some integrations expose their own `sensor`/`binary_sensor` for advisories (a
particular weather service's own alert feed, say), but there is nothing at the `weather` domain
level the way `forecast` was standardised into `weather/subscribe_forecast` — building this
would mean picking one integration's shape to support and leaving every other installation
without it, which is a different kind of feature than the rest of this card, not a missing
line of code inside it.
