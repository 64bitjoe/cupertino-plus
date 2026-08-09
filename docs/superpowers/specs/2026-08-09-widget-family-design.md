# The widget family

Four new cards, one card extended, one style, and a third footprint underneath all of them.

This is a family spec rather than an implementation spec. It settles what each card is, what
feeds it, and what it shows at each size — the decisions that are cheaper to take once for
six cards than six times for one. Each card then gets its own implementation plan and its own
build, in the order at the end.

Written 2026-08-09, against the library as of `v1.4.0` (calendar, battery, complication).

---

## 1. What is actually being built

The request was six widget types. Two of them turn out not to be new cards:

| Asked for                          | Verdict                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| Weather                            | **New card**                                                        |
| Media / Continue Watching          | **New card**                                                        |
| Lists                              | **New card**                                                        |
| Photo                              | **New card**                                                        |
| Notes                              | **New card**, once its source is settled — see §8                   |
| Calendar month view + show time    | **Options on the existing calendar card**, not a second card        |
| Electricity Rates (the gauge tile) | **Already the complication card**, possibly plus one style — see §7 |

Everything here was checked against a real Home Assistant (2026.8.0, 3729 entities) rather
than assumed. Field names in this document are ones that installation actually reports.

## 2. The third footprint

The library knows two layouts today: `size.ts` picks `small` or `medium` from **width alone**,
and lets height feed how many rows a card draws. Every design in the reference set comes in
three sizes, so a third is needed.

**Decision: a real third `large` layout**, not a taller medium.

This is the option the codebase was already waiting for. `cards/battery/layout.ts:114` says
the six-device case exists "for a `large` footprint, which is the one that has two rows of
four to give them" — written before this spec, describing exactly this.

What changes:

- `WIDGET_LAYOUTS` becomes `['small', 'medium', 'large']`.
- `layoutFromBox` takes height as well as width. `medium` still begins at 340 design units of
  width; `large` is `medium`'s width **and** at least 380 design units of height — six grid
  rows, against the four a medium defaults to. Both compared in design units, so `scale`
  moves them, exactly as the width threshold already does.
- Height keeps feeding row budgets _within_ a layout. `large` is not "more rows of the same
  thing"; it is a different arrangement, and a card that has nothing different to say at
  `large` simply keeps its `medium` rendering. That is a legitimate answer, not a gap.

What each existing card does at `large`:

| Card         | At `large`                                                                            |
| ------------ | ------------------------------------------------------------------------------------- |
| Battery      | Two rows of four rings — the case `layout.ts` already describes and caps out of today |
| Calendar     | Its existing flow, with the extra rows the taller box affords; no new arrangement     |
| Complication | Its existing tiling; the count already drives the grid, so more room is more cells    |

Only the battery card gains a genuinely new arrangement. The other two are unchanged in
behaviour and only need to not break when the third token appears.

One mechanical consequence, because it is the kind of thing that turns a small change into a
surprising one: `cards/battery/layout.ts` keys `COLUMNS` and `MAX_ROWS` on the layout token as
`Record<WidgetLayout, number>`, so widening the union makes that file fail to typecheck until
it answers for `large`. That is the type system doing its job — it is exactly the file that
has to answer — but it means the third token is not a purely additive change, and whoever adds
it should expect to finish the battery card's `large` case in the same sitting rather than
discovering it later.

## 3. Weather

The card the reference set is clearest about, and the one with the most real data behind it.

**Source.** A `weather` entity. Current conditions are attributes; **forecasts are not** —
there is no `forecast` attribute in modern Home Assistant. They arrive over the
`weather/subscribe_forecast` websocket, one subscription per forecast type. The calendar card
already establishes how this library holds a websocket subscription and unsubscribes cleanly;
follow it.

The installation's `weather.pirateweather` reports `supported_features: 7` — daily, hourly and
twice-daily. A card must read that bitmask and ask only for what the entity offers, because
`weather.forecast_home` may support fewer.

Verified current attributes: `temperature`, `apparent_temperature`, `humidity`, `dew_point`,
`pressure`, `wind_speed`, `wind_gust_speed`, `wind_bearing`, `visibility`, `cloud_coverage`,
and a unit for each (`temperature_unit: °F` here — **never assume Celsius**).

**What it shows.**

| Size     | Content                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `small`  | Location, current temperature, condition glyph, and one line under it — the condition, or a weather alert where one exists |
| `medium` | The above, plus an hourly strip: six columns of hour, glyph, temperature                                                   |
| `large`  | The above, plus daily rows: day, glyph, low, a range bar, high                                                             |

**The daily range bar** is the one piece of real drawing here. Each row's bar spans that day's
low to high, positioned within the week's overall low-to-high range, so the bars line up
against each other and a warm day sits visibly to the right of a cold one. Without that shared
scale the bars are decoration.

**Two decisions worth stating.** The high and low shown at `small` come from the _daily_
forecast, not from attributes — so even the smallest card needs a subscription. And sunrise or
sunset appears in the hourly strip as its own column where it falls within the window, which
is what the reference does and what makes the strip read as a day rather than a list.

## 4. Media

**Source.** A `media_player` entity. Verified on a live one: `media_title`, `media_artist`,
`media_album_name`, `media_duration`, `media_position`, `media_position_updated_at`,
`entity_picture`, `app_name`, `media_content_type`.

**Progress must be interpolated.** `media_position` is a snapshot taken at
`media_position_updated_at`; a bar drawn from it directly freezes. The elapsed time is
`now - media_position_updated_at` added to the position, and only while the state is
`playing`. The calendar card already owns a ticking clock; the same idea applies.

**What it shows.**

| Size     | Content                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| `small`  | Artwork filling the card, title and subtitle over a scrim at the foot                     |
| `medium` | Artwork tile at the left, title, subtitle and progress beside it                          |
| `large`  | A larger artwork panel above, then a list of the other players that are playing or paused |

`app_name` ("Plex") sits in the corner as the source badge, which is what the Apple TV logo is
doing in the reference.

**Idle is not empty.** A player that is `off` or `idle` still draws — name, and what it is,
dimmed — for the reason the battery card never drops a dead sensor. A card that vanished when
the television turned off would be a card you could not find to check.

## 5. Lists

**Source.** `todo` entities. The installation has two: Shopping List and Reminders. The
library already reads to-do items — `cards/calendar/todo-source.ts` subscribes to
`todo/item/list` — so this card reuses that layer rather than writing a second one.

**What it shows.** A tinted header with the list name and the number of items outstanding,
then the items, each with its checkbox circle. `small` fits the header and a few items;
`medium` more; `large` more still, or two lists side by side.

**Tapping an item completes it.** This is the first card in the library that writes rather
than reads, and the difference matters enough to state: everything else here is a display, and
this one changes state in Home Assistant. It calls `todo.update_item`. If that feels wrong,
the fallback is that a tap opens the more-info dialog like every other card and the card stays
read-only — see §8.

**How it differs from the calendar.** The calendar already shows to-do items that are _due_,
folded into a time flow. This shows a _list_, in list order, including items with no due date
at all. Different question, different card.

## 6. Photo

**Source.** `camera` or `image` entities. Both expose `entity_picture` — verified:
`/api/image_proxy/image.gry_avatar?token=…`. The token rotates, so the card must read the URL
off the current state each render rather than caching one.

**What it shows.** The picture, filling the card, cropped to the footprint. Optionally a
caption — the entity name — over a scrim at the foot. Given several entities it cycles between
them on an interval.

**A camera is not a photo.** `camera` entities are live and can be expensive to poll;
`image` entities are static and cheap. The card treats both the same way (it only ever reads
`entity_picture`), but the docs should say plainly that pointing it at a busy camera stream is
not what it is for.

## 7. Calendar options, and the gauge tile

**Calendar — two additions to the existing card, no new card.**

- `view: list | month`. `list` is today's behaviour and stays the default. `month` draws the
  month grid from the reference: month name, weekday initials, the dates, today marked with a
  filled circle. It uses the subscription the card already holds.
- A show-time option, so the list view can print each event's time rather than only its title.

**The gauge tile is the complication card.** Label, big value, subtitle, gauge — that is
`rectangular-header` with a gauge, which the complication card can nearly do already. Before
building anything, put an electricity-rate sensor on a complication card and see what is
actually missing. The likely answer is one style that pairs a ring with a text block; the
possible answer is nothing. **This is a spike, not a card**, and it should be timeboxed.

## 8. Assumptions flagged for review

These are decisions taken to avoid stalling. Each is cheap to reverse now and expensive later.

1. **Notes has no source in Home Assistant, so one is invented.** Nothing models a note. The
   assumption: the Notes card reads **any entity's state, or a named attribute of it**, and
   renders it as wrapped body text under a tinted header. That works with `input_text`, a
   template `sensor`, or anything else holding text, and it makes the card useful without a
   new integration. The alternative — a `todo` list rendered as notes — was rejected because a
   checklist is not a note. **If you have a different source in mind, this is the decision to
   change.**
2. **Photo cycles on a fixed interval** when given several entities, rather than following a
   sensor or an input. Simplest thing that matches the reference.
3. **Lists writes back.** Tapping completes an item. The library has been read-only until now.
4. **`large` begins at 380 design units of height.** Chosen as six grid rows against the four
   a medium defaults to; worth confirming on a real dashboard rather than by arithmetic.

## 9. Build order

Ordered by value against cost, and by what unblocks what.

1. **The `large` layout** — everything else assumes it, and the battery card gains its two
   rows of four for free. Small, and it touches `core/size.ts`, which every card reads.
2. **Weather** — the biggest visual win, the closest match to the reference, and the card most
   likely to be used daily. Also the one that proves the forecast-subscription layer.
3. **Calendar options** — cheapest of the rest, extends a card that already works.
4. **Media** — high value, artwork makes it the best-looking card of the set.
5. **Lists** — reuses the existing to-do layer, but introduces writing.
6. **Photo** — simple, and pleasant, but the least informative card here.
7. **Notes** — last, because its source is the least settled thing in this document.

The gauge-tile spike sits before or alongside any of these and takes an hour, not a day.

## 10. What this family shares

Worth building once rather than six times:

- **The forecast subscription layer** (weather) and **the picture-URL handling** (media,
  photo) are each used by more than one card.
- **A scrim-over-image treatment** appears in media and photo. One set of rules, one place.
- **The ticking clock** for media progress already exists in the calendar card and should move
  to `core/` when the second card needs it — the same argument that moved `ring.ts` there.
- Every card keeps the library's existing rules: a visual editor, no size field, `--cw-*`
  tokens only, an unreadable entity drawn rather than dropped, and no scrolling.

## 11. Out of scope

Anything needing an integration that does not exist. A photo _library_ (Home Assistant has no
concept of one; `image` and `camera` entities are the nearest thing). Writing to anything other
than to-do items. Animation beyond what the existing cards do. And the twice-daily forecast
mode, which `supported_features` offers but no design here asks for.
