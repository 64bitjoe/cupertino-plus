# Large Layout + Weather Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `large` layout token to the library, and a weather card that draws current conditions, an hourly strip and daily forecast rows.

**Architecture:** The same three-layer shape the other three cards use. `source.ts` holds the websocket forecast subscriptions and is the only thing that touches `hass.connection`; `model.ts` normalises current conditions and forecasts into view models; `layout.ts` prices content against the measured box in design units; the element renders and owns nothing but markup and CSS. Pure layers are unit-tested; the element is not.

**Tech Stack:** TypeScript 7, Lit 3, Vite 8 (Rolldown), Vitest 4, `@mdi/js`. No runtime dependencies beyond Lit. pnpm.

**Spec:** `docs/superpowers/specs/2026-08-09-widget-family-design.md` (§2 for the layout, §3 for weather)

## Global Constraints

- **Home Assistant 2026.7+.** No compatibility shims.
- **Zero runtime dependencies beyond Lit and `@mdi/js`.**
- **Cards read `--cw-*` tokens only.** Never HA theme variables directly; `src/theme/tokens.ts` is the single bridge.
- **Dark mode is `:host([dark])`**, never `prefers-color-scheme`.
- **Layout arithmetic is in design units** — pixels at `scale: 100`. Divide the measured box by the scale factor once at the top. Every constant mirroring a CSS length names its twin in a comment.
- **No `size` config key.** The Layout tab owns the footprint.
- **Never assume Celsius.** The reference installation reports `temperature_unit: °F`. Units come off the entity.
- **A backtick inside a comment in a `css` tagged template terminates the template early.** This has bitten three implementers.
- **`exactOptionalPropertyTypes` is on.** Build objects by conditional spread, never assign `undefined` to an optional property.
- **House comment style.** This codebase documents _why_, at length, in prose. `src/cards/battery/layout.ts` and `src/core/size.ts` are the register. Thin comments fail review.
- **Formatting:** `pnpm format` before every commit. `pnpm typecheck` and `pnpm build` must pass.
- **Commit style:** Conventional Commits.
- **Element tags are `cupertino-plus-*`** — the library was renamed at v1.4.0.

## Verified facts (checked against a live Home Assistant, do not re-derive)

- `weather.pirateweather` has **no `forecast` attribute**. Forecasts arrive over `weather/subscribe_forecast`.
- `supported_features` is a bitmask: **1 = daily, 2 = hourly, 4 = twice-daily.** The reference entity reports `7`.
- **Daily** forecast items carry `temperature` (the day's **high**) and `templow` (the low).
- **Hourly** forecast items carry `temperature` only — **no `templow`.** Getting these two confused is the single easiest mistake in this plan.
- Both carry: `datetime` (ISO with offset), `condition`, `precipitation_probability`, `precipitation`, `humidity`, `cloud_coverage`, `uv_index`, `wind_speed`, `wind_gust_speed`, `wind_bearing`, `dew_point`, `pressure`.
- Current attributes: `temperature`, `apparent_temperature`, `humidity`, `dew_point`, `pressure`, `wind_speed`, `wind_gust_speed`, `wind_bearing`, `visibility`, `cloud_coverage`, plus `temperature_unit`, `wind_speed_unit`, `pressure_unit`, `visibility_unit`, `precipitation_unit`.
- These `@mdi/js` exports all exist (verified): `mdiWeatherSunny`, `mdiWeatherNight`, `mdiWeatherPartlyCloudy`, `mdiWeatherNightPartlyCloudy`, `mdiWeatherCloudy`, `mdiWeatherFog`, `mdiWeatherHail`, `mdiWeatherLightning`, `mdiWeatherLightningRainy`, `mdiWeatherPouring`, `mdiWeatherRainy`, `mdiWeatherSnowy`, `mdiWeatherSnowyRainy`, `mdiWeatherWindy`, `mdiWeatherWindyVariant`, `mdiAlertCircleOutline`, `mdiWeatherSunsetUp`, `mdiWeatherSunsetDown`.

## File Structure

**Created**

| File                                       | Responsibility                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `src/cards/weather/condition.ts`           | Home Assistant condition string → an MDI path and a plain-English label    |
| `src/cards/weather/source.ts`              | The forecast subscriptions. The only file touching `hass.connection`       |
| `src/cards/weather/model.ts`               | `hass` + forecasts → `WeatherView`. The card's whole contact with HA state |
| `src/cards/weather/layout.ts`              | How many hourly columns and daily rows fit; the range-bar arithmetic       |
| `src/cards/weather/weather-card.ts`        | The element                                                                |
| `src/cards/weather/weather-card-editor.ts` | The visual editor                                                          |
| `dev/weather-fixtures.ts`                  | Mock entity and forecasts for the showcase                                 |
| `docs/weather-widget-rules.md`             | The card's rules                                                           |

**Modified**

| File                                                      | Change                                         |
| --------------------------------------------------------- | ---------------------------------------------- |
| `src/core/size.ts`                                        | `large` token, `layoutFromBox` takes height    |
| `src/cards/battery/layout.ts`                             | Its `large` case — forced by the widened union |
| `src/index.ts`                                            | Import and re-export the card                  |
| `dev/site/catalog.ts`, `dev/mock-hass.ts`, `dev/shots.ts` | Showcase wiring                                |
| `README.md`                                               | A section for the card                         |

---

### Task 1: The `large` layout token

**Files:**

- Modify: `src/core/size.ts`
- Modify: `src/cards/battery/layout.ts`
- Test: `src/core/scale.test.ts` is unrelated; add cases to `src/cards/battery/layout.test.ts`, and create `src/core/size.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `WIDGET_LAYOUTS = ['small','medium','large']`, `type WidgetLayout`, `layoutFromBox(width: number, height: number, scale?: number): WidgetLayout`, `LARGE_HEIGHT_THRESHOLD = 380` from `src/core/size.ts`.

**This task is not additive.** `battery/layout.ts:102,120` declare `COLUMNS` and `MAX_ROWS` as `Record<WidgetLayout, number>`, so widening the union breaks typecheck until the battery card answers for `large`. That is the point — it is the file that has to answer. Finish both halves in this task.

Two further files fail to typecheck for the same reason and are **not** listed above, because this plan missed them: `src/cards/calendar/calendar-card.ts` and `dev/shots.ts`. The calendar has no third arrangement in this plan (spec §2 says so outright), so it folds `large` into its `medium` rendering — but make that fold **visible and commented**, so the next reader knows the calendar deliberately has no large form rather than finding a silent coercion. `dev/shots.ts` simply needs the new `height` argument.

- [ ] **Step 1: Write the failing test for the layout threshold**

Create `src/core/size.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { LARGE_HEIGHT_THRESHOLD, LAYOUT_THRESHOLD, layoutFromBox } from './size'

/** A section of the usual ~500px: the small square, the 2:1 medium, and the tall large. */
const SMALL = { width: 246, height: 248 }
const MEDIUM = { width: 500, height: 248 }
const LARGE = { width: 500, height: 512 }

describe('layoutFromBox', () => {
  it('still picks small and medium on width alone', () => {
    expect(layoutFromBox(SMALL.width, SMALL.height)).toBe('small')
    expect(layoutFromBox(MEDIUM.width, MEDIUM.height)).toBe('medium')
  })

  it('picks large only when the card is both wide enough and tall enough', () => {
    expect(layoutFromBox(LARGE.width, LARGE.height)).toBe('large')
    // Tall but narrow is not large: large is a medium that grew downwards, and a narrow
    // column of content is a different shape rather than a bigger one.
    expect(layoutFromBox(SMALL.width, LARGE.height)).toBe('small')
    // Wide but short stays medium.
    expect(layoutFromBox(LARGE.width, LARGE_HEIGHT_THRESHOLD - 1)).toBe('medium')
    expect(layoutFromBox(LARGE.width, LARGE_HEIGHT_THRESHOLD)).toBe('large')
  })

  it('compares in design units, so scale moves both thresholds', () => {
    // The type grew, the box did not, so there is less room in the units that matter —
    // and each threshold gives way at its own scale rather than both at once.
    //
    // The large box is 512 tall, so it stays large until the scale passes 512/380 = 1.35;
    // at 1.4 there are only 366 design units of height and it drops to medium. The medium
    // box is 500 wide, so it stays medium until the scale passes 500/340 = 1.47; at 1.5
    // there are only 333 design units of width and it drops to small.
    expect(layoutFromBox(LARGE.width, LARGE.height, 1.3)).toBe('large')
    expect(layoutFromBox(LARGE.width, LARGE.height, 1.4)).toBe('medium')
    expect(layoutFromBox(MEDIUM.width, MEDIUM.height, 1.3)).toBe('medium')
    expect(layoutFromBox(MEDIUM.width, MEDIUM.height, 1.5)).toBe('small')
  })

  it('agrees with the constants it is documented against', () => {
    expect(LAYOUT_THRESHOLD).toBe(340)
    expect(LARGE_HEIGHT_THRESHOLD).toBe(380)
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/core/size.test.ts`
Expected: FAIL — `layoutFromBox` takes one argument, and `LARGE_HEIGHT_THRESHOLD` does not exist.

- [ ] **Step 3: Widen the union and the threshold in `src/core/size.ts`**

Change `WIDGET_LAYOUTS` to `['small', 'medium', 'large'] as const`, and add beside `LAYOUT_THRESHOLD`:

```ts
/**
 * The measured height, in design units, at which a wide card becomes `large`.
 *
 * 380 is six grid rows (`rowsToPx(6)` is 376, and a card is never asked to be exact),
 * against the four a card defaults to. That gap is the point: `large` has to be a size
 * somebody deliberately dragged to, not one they land in by nudging an edge, or every
 * medium card in a roomy section would quietly become a different card.
 *
 * Height only decides `large`. It does not decide `small` versus `medium`, which stays a
 * question about width for the reason `LAYOUT_THRESHOLD` gives: two columns of content
 * need width before their type stops truncating, and no amount of height supplies it.
 */
export const LARGE_HEIGHT_THRESHOLD = 380
```

and replace `layoutFromBox`:

```ts
/**
 * Which layout to render, given the box the card actually ended up in.
 *
 * Width still decides `small` from `medium`, and height is what promotes a `medium` to
 * `large`. Both are compared in design units rather than pixels, for the reason the width
 * threshold already gives: draw the type 30% larger and a box that was just big enough is
 * not any more.
 *
 * `large` is deliberately not reachable from a narrow box however tall it is. A tall
 * narrow card is a column, which is a different shape rather than a bigger one, and a card
 * that answered `large` there would be asked to draw a wide arrangement in a space that
 * cannot hold it.
 */
export const layoutFromBox = (width: number, height: number, scale = 1): WidgetLayout => {
  if (width / scale < LAYOUT_THRESHOLD) return 'small'
  return height / scale >= LARGE_HEIGHT_THRESHOLD ? 'large' : 'medium'
}
```

- [ ] **Step 4: Fix the one caller**

`src/core/base-card.ts`'s `_applyLayout` calls `layoutFromBox(this._measuredWidth, this.scaleFactor)`. It must now pass the measured height as the second argument and the scale as the third. The card already stores `_measuredHeight`; use it, and guard the same way the existing code guards on `_measuredWidth`.

- [ ] **Step 5: Answer for `large` in the battery card**

`src/cards/battery/layout.ts:102,120`:

```ts
const COLUMNS: Record<WidgetLayout, number> = { small: 2, medium: 4, large: 4 }
const MAX_ROWS: Record<WidgetLayout, number> = { small: 2, medium: 1, large: 2 }
```

Comment it in house style: this is the case the file's own §"four and no more" note already describes — the six devices somebody configured finally have two rows of four to sit in, and `large` is the footprint that was always meant to hold them. Update that existing note so it no longer says the case is unreachable.

- [ ] **Step 6: Add the battery test for it**

In `src/cards/battery/layout.test.ts`, beside the existing reference table:

```ts
const LARGE: Box = { width: 500, height: 512 }

it('gives the large footprint two rows of four, which is what six devices were waiting for', () => {
  expect(shape('large', 5, LARGE)).toBe('compact 4×2, 5 of 5')
  expect(shape('large', 6, LARGE)).toBe('compact 4×2, 6 of 6')
  expect(shape('large', 8, LARGE)).toBe('compact 4×2, 8 of 8')
  // Still capped: nine devices is not a reason to grow a third row.
  expect(shape('large', 9, LARGE)).toBe('compact 4×2, 8 of 9')
})
```

If `labeled` rather than `compact` comes back, work out which is right before changing either — a captioned row is defined as `visible <= columns`, and eight rings over two rows is not one row. Leave a comment in the test recording the number you settled on and why, in the style of the file's existing reference-table block.

- [ ] **Step 7: Verify**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all PASS, including the existing 291 tests.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add -A
git commit -m "feat: a large layout, and the battery card's two rows of four"
```

---

### Task 2: Conditions to glyphs

**Files:**

- Create: `src/cards/weather/condition.ts`
- Create: `src/cards/weather/condition.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type WeatherCondition`, `CONDITIONS: readonly WeatherCondition[]`, `conditionIcon(condition: string, isNight?: boolean): string`, `conditionLabel(condition: string): string` from `condition.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherNightPartlyCloudy,
  mdiWeatherSunny,
  mdiAlertCircleOutline,
} from '@mdi/js'

import { conditionIcon, conditionLabel } from './condition'

describe('conditionIcon', () => {
  it('maps the conditions Home Assistant actually emits', () => {
    expect(conditionIcon('sunny')).toBe(mdiWeatherSunny)
    expect(conditionIcon('clear-night')).toBe(mdiWeatherNight)
    expect(conditionIcon('partlycloudy')).toBe(mdiWeatherPartlyCloudy)
  })

  /**
   * `clear-night` is the only condition Home Assistant makes night-specific. Every other
   * one is emitted the same by day and by night, so the card supplies the distinction the
   * data does not: a partly cloudy midnight gets the moon behind its cloud.
   */
  it('swaps in the night glyph where one exists and it is dark', () => {
    expect(conditionIcon('partlycloudy', true)).toBe(mdiWeatherNightPartlyCloudy)
    expect(conditionIcon('sunny', true)).toBe(mdiWeatherNight)
    expect(conditionIcon('rainy', true)).toBe(conditionIcon('rainy', false))
  })

  it('answers something for a condition it does not know, rather than nothing', () => {
    expect(conditionIcon('invented-by-an-integration')).toBe(mdiAlertCircleOutline)
  })
})

describe('conditionLabel', () => {
  it('reads as English rather than as an enum', () => {
    expect(conditionLabel('partlycloudy')).toBe('Partly Cloudy')
    expect(conditionLabel('clear-night')).toBe('Clear')
    expect(conditionLabel('lightning-rainy')).toBe('Thunderstorms')
  })

  it('falls back to the raw value made readable', () => {
    expect(conditionLabel('some_new_thing')).toBe('Some new thing')
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/cards/weather/condition.test.ts`
Expected: FAIL — cannot resolve `./condition`.

- [ ] **Step 3: Write `condition.ts`**

Two lookup tables and two functions. The fifteen conditions Home Assistant defines are `clear-night`, `cloudy`, `exceptional`, `fog`, `hail`, `lightning`, `lightning-rainy`, `partlycloudy`, `pouring`, `rainy`, `snowy`, `snowy-rainy`, `sunny`, `windy`, `windy-variant`.

Map each to its `@mdi/js` export (all verified to exist — see the facts block). A second, much smaller table maps only the conditions that have a night form: `sunny` → `mdiWeatherNight`, `partlycloudy` → `mdiWeatherNightPartlyCloudy`. `exceptional` and any unknown string get `mdiAlertCircleOutline`.

`conditionLabel` maps to the words Apple uses — "Partly Cloudy", "Clear", "Thunderstorms", "Heavy Rain" for `pouring` — and falls back to the raw string with hyphens and underscores turned to spaces and the first letter capitalised.

Comment in house style. The load-bearing note is the night one: explain that Home Assistant only distinguishes `clear-night`, so the day/night split for everything else is the card's own inference from the sun, and say where that inference comes from.

- [ ] **Step 4: Run the test again**

Run: `pnpm test -- src/cards/weather/condition.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/weather/condition.ts src/cards/weather/condition.test.ts
git commit -m "feat: weather conditions to glyphs and words"
```

---

### Task 3: The forecast subscriptions

**Files:**

- Create: `src/cards/weather/source.ts`
- Create: `src/cards/weather/source.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `interface ForecastItem`, `type ForecastKind = 'daily' | 'hourly'`, `supportsForecast(entity: HassEntity, kind: ForecastKind): boolean`, `subscribeForecast(hass, entityId, kind, onUpdate): Promise<() => Promise<void>>` from `source.ts`.

**Read `src/cards/calendar/source.ts` first.** It establishes how this library holds a websocket subscription, what it does when one fails, and how it unsubscribes without leaking. Follow it rather than inventing a second pattern. `docs/ha-api-notes.md`'s calendar section documents the shape of `hass.connection.subscribeMessage`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { subscribeForecast, supportsForecast } from './source'

const entity = (supported: number): HassEntity => ({
  entity_id: 'weather.test',
  state: 'sunny',
  attributes: { supported_features: supported },
  last_changed: '',
  last_updated: '',
})

describe('supportsForecast', () => {
  /**
   * The bitmask, read off a real installation: 1 daily, 2 hourly, 4 twice-daily. An entity
   * asked for a forecast it does not publish never answers, so the card would sit on an
   * empty strip forever rather than fall back — hence asking first.
   */
  it('reads the bitmask rather than assuming', () => {
    expect(supportsForecast(entity(7), 'daily')).toBe(true)
    expect(supportsForecast(entity(7), 'hourly')).toBe(true)
    expect(supportsForecast(entity(1), 'daily')).toBe(true)
    expect(supportsForecast(entity(1), 'hourly')).toBe(false)
    expect(supportsForecast(entity(2), 'daily')).toBe(false)
    expect(supportsForecast(entity(4), 'daily')).toBe(false)
  })

  it('treats a missing bitmask as supporting nothing', () => {
    const bare = { ...entity(0), attributes: {} }
    expect(supportsForecast(bare, 'daily')).toBe(false)
  })
})

describe('subscribeForecast', () => {
  it('asks for the right message and hands the forecast on', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined)
    const subscribeMessage = vi.fn().mockImplementation((callback: (m: unknown) => void) => {
      callback({
        type: 'daily',
        forecast: [
          {
            datetime: '2026-08-09T04:00:00+00:00',
            condition: 'sunny',
            temperature: 90,
            templow: 67,
          },
        ],
      })
      return Promise.resolve(unsubscribe)
    })
    const hass = { connection: { subscribeMessage } } as unknown as HomeAssistant

    const seen: unknown[] = []
    const stop = await subscribeForecast(hass, 'weather.test', 'daily', f => seen.push(f))

    expect(subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'weather/subscribe_forecast',
      forecast_type: 'daily',
      entity_id: 'weather.test',
    })
    expect(seen).toHaveLength(1)

    await stop()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/cards/weather/source.test.ts`
Expected: FAIL — cannot resolve `./source`.

- [ ] **Step 3: Write `source.ts`**

`ForecastItem` types the fields the facts block lists, with `templow` optional — **that optionality is the daily/hourly difference and the comment must say so.**

```ts
const FORECAST_DAILY = 1
const FORECAST_HOURLY = 2
```

`supportsForecast` reads `attributes.supported_features`, narrows it to a number, and tests the bit for the kind asked for.

`subscribeForecast` calls `hass.connection.subscribeMessage` with `{ type: 'weather/subscribe_forecast', forecast_type: kind, entity_id: entityId }` and forwards `message.forecast` to the callback.

**Verify the message shape before trusting this plan on it.** The `forecast_type` key is the one thing here not confirmed against a live socket. Confirm it with the docker grep pattern `docs/ha-api-notes.md` uses for the calendar's subscription, or by watching the frontend's own weather card in a browser's network tab. Then record what you found in `docs/ha-api-notes.md` under a new `### Weather forecasts` heading — that file's whole purpose is separating verified from assumed. If the key turns out to be `type` nested differently, fix the code and the test together.

- [ ] **Step 4: Run the test again**

Run: `pnpm test -- src/cards/weather/source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/weather/source.ts src/cards/weather/source.test.ts docs/ha-api-notes.md
git commit -m "feat: subscribe to weather forecasts"
```

---

### Task 4: The model

**Files:**

- Create: `src/cards/weather/model.ts`
- Create: `src/cards/weather/model.test.ts`

**Interfaces:**

- Consumes: `ForecastItem` (Task 3); `conditionIcon`, `conditionLabel` (Task 2).
- Produces: `interface WeatherNow`, `interface WeatherHour`, `interface WeatherDay`, `interface WeatherView`, `readWeather(hass, entityId, daily, hourly): WeatherView | null` from `model.ts`.

- [ ] **Step 1: Write the failing test**

Cover, at minimum:

- current conditions read off attributes, with the entity's own `temperature_unit` rather than an assumed one — assert a `°F` entity renders `75°` and not a converted value;
- **`temperature` is the high and `templow` the low on a daily item** — build a day from the real sample (`temperature: 90, templow: 67`) and assert `high` is 90, `low` is 67. This is the trap the facts block names;
- an hourly item having no `templow` produces an hour with a single temperature and no range;
- the high and low shown for _today_ come from the daily forecast's first entry, not from attributes;
- an entity missing from `hass.states` returns `null` rather than throwing;
- forecast entries in the past are dropped, so the hourly strip starts at the current hour rather than at midnight;
- `isNight` is derived and passed to `conditionIcon`, so a `partlycloudy` hour at 02:00 gets the night glyph.

For the night derivation, prefer `sun.sun` when it exists in `hass.states` (`state` is `above_horizon` / `below_horizon`) and fall back to the hour of day. Test both paths.

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/cards/weather/model.test.ts`
Expected: FAIL — cannot resolve `./model`.

- [ ] **Step 3: Write `model.ts`**

The whole of the card's contact with `hass`, in the shape `src/cards/complication/model.ts` established. Everything downstream sees a `WeatherView`:

```ts
export interface WeatherNow {
  location: string
  temperature: string // formatted, unit included
  condition: string // the label
  icon: string // an MDI path
  high: string | null // from the daily forecast, not attributes
  low: string | null
}

export interface WeatherHour {
  label: string // "4AM", or "Now" for the first
  icon: string
  temperature: string
}

export interface WeatherDay {
  label: string // "Mon", or "Today"
  icon: string
  low: number // raw, because layout.ts needs to compare them
  high: number
  lowLabel: string
  highLabel: string
}

export interface WeatherView {
  now: WeatherNow
  hours: WeatherHour[]
  days: WeatherDay[]
  unavailable: boolean
}
```

`low` and `high` on a day are raw numbers as well as labels, deliberately: the range bar has to place them on a shared scale, and a layout module parsing a formatted string back into a number would be the kind of thing that breaks the first time somebody's locale uses a comma.

Format numbers through `Intl.NumberFormat` on `hass.locale.language`, as `complication/model.ts` does, and append the entity's own unit. Times go through the library's existing `Intl.DateTimeFormat` helpers in `src/cards/calendar/format.ts` where they fit — read that file before writing a third date formatter.

- [ ] **Step 4: Run the test again**

Run: `pnpm test -- src/cards/weather/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/weather/model.ts src/cards/weather/model.test.ts
git commit -m "feat: turn weather states and forecasts into a view"
```

---

### Task 5: Layout and the range bar

**Files:**

- Create: `src/cards/weather/layout.ts`
- Create: `src/cards/weather/layout.test.ts`

**Interfaces:**

- Consumes: `WeatherDay` (Task 4); `WidgetLayout` (Task 1).
- Produces: `interface Box`, `interface WeatherPack { hours: number; days: number }`, `packFor(layout: WidgetLayout, box: Box, scale?: number): WeatherPack`, `interface Span { start: number; width: number }`, `spanFor(day: WeatherDay, week: { min: number; max: number }): Span`, `weekRange(days: WeatherDay[]): { min: number; max: number }` from `layout.ts`.

- [ ] **Step 1: Write the failing test**

The load-bearing case is the range bar. Cover:

```ts
/**
 * The bars share one scale across the whole week, which is the entire point of them: a
 * warm day has to sit visibly to the right of a cold one. A bar scaled to its own day
 * would make every row identical and say nothing.
 */
it('places each day on the week-wide scale', () => {
  const days = [day(67, 90), day(72, 87), day(59, 79)]
  const week = weekRange(days) // min 59, max 90 — a span of 31
  expect(week).toEqual({ min: 59, max: 90 })

  const cold = spanFor(days[2], week) // 59..79
  expect(cold.start).toBeCloseTo(0)
  expect(cold.width).toBeCloseTo(20 / 31)

  const warm = spanFor(days[1], week) // 72..87
  expect(warm.start).toBeCloseTo(13 / 31)
  expect(warm.width).toBeCloseTo(15 / 31)
})

it('gives a flat day a visible mark rather than a zero-width one', () => {
  const days = [day(70, 70), day(60, 80)]
  const span = spanFor(days[0], weekRange(days))
  expect(span.width).toBeGreaterThan(0)
})

it('survives a week with no spread at all, rather than dividing by zero', () => {
  const days = [day(70, 70), day(70, 70)]
  const span = spanFor(days[0], weekRange(days))
  expect(Number.isFinite(span.start)).toBe(true)
  expect(Number.isFinite(span.width)).toBe(true)
})
```

Plus `packFor`: `small` returns no hours and no days; `medium` returns six hours and no days; `large` returns six hours and as many days as the height holds, bounded by what was forecast.

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/cards/weather/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Write `layout.ts`**

Design units throughout, each constant naming its CSS twin, as `battery/layout.ts` does. `spanFor` returns fractions of the bar's track (0–1), so the element multiplies by 100 for a percentage and the module never knows about pixels.

The flat-day floor and the zero-spread guard are both real: a day whose high equals its low would otherwise draw nothing, and a week with no spread would divide by zero.

- [ ] **Step 4: Run the test again**

Run: `pnpm test -- src/cards/weather/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/weather/layout.ts src/cards/weather/layout.test.ts
git commit -m "feat: weather packing, and the shared scale behind the range bars"
```

---

### Task 6: The card element — small and medium

**Files:**

- Create: `src/cards/weather/weather-card.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces: `WEATHER_CARD_TAG = 'cupertino-plus-weather'`, `interface WeatherCardConfig` from `weather-card.ts`.

Follow `src/cards/complication/complication-card.ts` and `src/cards/calendar/calendar-card.ts` closely — the latter because it is the other card holding a websocket subscription, and its `connectedCallback` / `disconnectedCallback` handling is what you must mirror so a card removed from a dashboard does not leak a subscription.

**Scope: `small` and `medium` only.** The daily rows are Task 7. Do not write a `_renderDays` that returns something else in the meantime; `render` simply does not call it yet.

- [ ] **Step 1: The shell**

Config is `{ entity?: string, scale?: number }` extending `CupertinoCardConfig`. `getStubConfig` returns the type. `watchedEntities` returns the configured entity plus `sun.sun` where the model uses it. `getConfigElement` arrives in Task 8 — omit it for now, as the complication card did.

- [ ] **Step 2: Subscription lifecycle**

This is the part most likely to go wrong, so it is written out rather than described.

```ts
  @state() private _daily: ForecastItem[] = []
  @state() private _hourly: ForecastItem[] = []

  /**
   * The live subscriptions, keyed by kind, and the entity they belong to.
   *
   * The entity is held alongside them because the teardown is not triggered by the
   * subscription itself but by the config changing under it: a card repointed from one
   * weather entity to another must drop the old socket before raising the new one, or two
   * subscriptions deliver into the same fields and whichever message arrives last wins.
   * That failure is intermittent, which is the worst kind — it looks like a flickering
   * forecast rather than like a bug.
   */
  private _subscriptions = new Map<ForecastKind, () => Promise<void>>()
  private _subscribedTo?: string

  private async _resubscribe(): Promise<void> {
    const entityId = this._config?.entity
    const entity = entityId ? this.hass?.states[entityId] : undefined

    if (entityId !== this._subscribedTo) await this._unsubscribeAll()
    this._subscribedTo = entityId
    if (!this.hass || !entity) return

    // Daily is not optional even at `small`: the high and low under the temperature come
    // from the forecast rather than from attributes, so the smallest card still needs it.
    const wanted: ForecastKind[] = ['daily']
    if (this.cwLayout !== 'small') wanted.push('hourly')

    for (const kind of wanted) {
      if (this._subscriptions.has(kind)) continue
      if (!supportsForecast(entity, kind)) continue

      const stop = await subscribeForecast(this.hass, entity.entity_id, kind, forecast => {
        if (kind === 'daily') this._daily = forecast
        else this._hourly = forecast
      })

      // The await above is a window: the card can be torn down, or repointed, while it is
      // open. If that happened, this subscription is already orphaned — close it rather
      // than filing it under a card that has moved on.
      if (this._subscribedTo !== entityId || !this.isConnected) {
        void stop()
        return
      }
      this._subscriptions.set(kind, stop)
    }
  }

  private async _unsubscribeAll(): Promise<void> {
    const stops = [...this._subscriptions.values()]
    this._subscriptions.clear()
    this._daily = []
    this._hourly = []
    await Promise.all(stops.map(stop => stop()))
  }
```

Call `_resubscribe` from `connectedCallback` and from `setConfig`; call `_unsubscribeAll` from `disconnectedCallback`. Because the hourly subscription depends on `cwLayout`, also call `_resubscribe` when that property changes — `willUpdate` is where the base class already watches for such things.

Both methods return promises that nothing awaits, which is deliberate and worth a comment: a lifecycle callback cannot be async, and there is nothing useful to do with a failure to unsubscribe from a socket that is already going away.

**The sample above guards one race and not another, and the second one is real.** The map is the only "already subscribing" signal, but it is populated _after_ `subscribeForecast` resolves and cleared _before_ `stop()` resolves — so two overlapping calls to `_resubscribe` both see `has(kind)` as false, both open a live subscription, and the second `set` orphans the first for the life of the element. The route that makes this concrete is a DOM move: `disconnectedCallback` clears the map synchronously while leaving the `stop()` promises pending and never resets `_subscribedTo`, so an immediate reconnect skips its own teardown and subscribes again over the top. `calendar-card.ts:472-476` documents DOM moves as a real occurrence in this codebase rather than a hypothetical.

Close it. A generation counter incremented on entry, checked after every await, is the cheapest shape and composes with the torn-down check already there; reserving the map slot with a pending marker before awaiting also works. `_unsubscribeAll` must additionally reset `_subscribedTo`, or a reconnect mistakes itself for an unchanged entity. `CalendarFeed` solved this same problem in this codebase — it is described as built to "survive a reconcile racing its own in-flight subscribe call" — so the answer should read as its sibling rather than as a new invention.

- [ ] **Step 3: Render small**

Location, temperature at `--cw-text-large-title`, the condition glyph, and one line under it. Tap opens the more-info dialog, via the same `hass-more-info` event the other cards fire.

- [ ] **Step 4: Render medium**

The above, plus the hourly strip: a row of `pack.hours` columns, each hour label, glyph, temperature. `Now` for the first column.

- [ ] **Step 5: Styles**

Every px a design unit times `var(--cw-scale)`. Reuse `--cw-*` tokens; add none. The card is dark-theme-aware through the tokens rather than through its own rules.

- [ ] **Step 6: Register and bundle**

`registerCard(WEATHER_CARD_TAG, …)` with a name and description, then add the import and re-export to `src/index.ts`.

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS. No element tests — `vitest.config.ts` runs in node with no DOM, and cards are deliberately not unit-tested here. Say so in the report rather than inventing them.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add src/cards/weather/weather-card.ts src/index.ts
git commit -m "feat: the weather card, current conditions and the hourly strip"
```

---

### Task 7: The daily rows

**Files:**

- Modify: `src/cards/weather/weather-card.ts`

**Interfaces:**

- Consumes: `spanFor`, `weekRange` (Task 5).
- Produces: no new exports.

- [ ] **Step 1: Render the daily rows at `large`**

One row per day: label, glyph, low, the range bar, high. The bar is a track with a filled span positioned by `spanFor` — `left: ${start * 100}%; width: ${width * 100}%`.

- [ ] **Step 2: The bar's colour**

A gradient from cool to warm across the span, which is what the reference does and what makes the bars readable at a glance. Use the existing palette tokens rather than new colours; `--cw-blue` to `--cw-orange` through `--cw-yellow` is the obvious reading. Comment why it is a gradient rather than a solid: the bar encodes two numbers and its ends are what carry them.

- [ ] **Step 3: Today's row**

Marked — label reads `Today`, and the bar carries a dot at the current temperature's position on the same scale, which is the detail that makes the row mean something beyond a forecast.

- [ ] **Step 4: Verify by eye**

Run `pnpm dev` once Task 9 has wired the showcase, or defer this check to Task 9 and say so. Confirm the bars line up against each other and that a warm day sits right of a cold one — if every bar is the same width, the shared scale is not being applied and `spanFor` is being called per-day rather than per-week.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/cards/weather/weather-card.ts
git commit -m "feat: the weather card's daily rows"
```

---

### Task 8: The visual editor

**Files:**

- Create: `src/cards/weather/weather-card-editor.ts`
- Modify: `src/cards/weather/weather-card.ts`

**Interfaces:**

- Consumes: `CupertinoCardEditor`, `defineElement`, `HaFormSchema`.
- Produces: `WEATHER_EDITOR_TAG = 'cupertino-plus-weather-editor'`.

Read `src/cards/complication/complication-card-editor.ts` — it is the most recent and the closest in shape.

- [ ] **Step 1: The schema**

```ts
/**
 * One row, plus the scale every card in the library shares.
 *
 * There is nothing else to ask. The location, the units, the condition words, the glyphs
 * and the forecast all come off the entity, and the footprint belongs to the Layout tab.
 * A weather card that asked which units you wanted would be asking you to repeat something
 * Home Assistant already knows and can change under it.
 */
const FIELDS: readonly HaFormSchema[] = [
  {
    name: 'entity',
    selector: { entity: { filter: { domain: 'weather' } } },
    required: true,
  },
]

const LABELS: Record<string, string> = { entity: 'Weather entity' }

const HELPERS: Record<string, string> = {
  entity: 'Everything else — the place, the units, the forecast — comes from this entity.',
}
```

The class extends `CupertinoCardEditor<WeatherCardConfig>`, returns `FIELDS` from `fields()`, and overrides `label` and `helper` to read those records with a fallback to `super`. It needs no `defaults()`: there is no field whose absence would render as a broken empty control.

- [ ] **Step 2: Wire `getConfigElement`**

Typed as `LovelaceCardEditor`, importing the editor module for its registration side effect, exactly as the battery and complication cards do.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS.

**Docker is unavailable in this environment**, so `pnpm verify` cannot run and nothing here can be seen in a real Home Assistant. Do not treat that as a blocker; instead list explicitly in your report what remains unverified — the rows rendering, the entity picker's domain filter actually filtering, and the card redrawing live as the entity changes.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/cards/weather/weather-card-editor.ts src/cards/weather/weather-card.ts
git commit -m "feat: visual editor for the weather card"
```

---

### Task 9: Showcase and docs

**Files:**

- Create: `dev/weather-fixtures.ts`, `docs/weather-widget-rules.md`
- Modify: `dev/site/catalog.ts`, `dev/mock-hass.ts`, `dev/shots.ts`, `README.md`

- [ ] **Step 1: Fixtures**

Follow `dev/complication-entities.ts`: mock states and named sets in one file, wired into `dev/mock-hass.ts` the way the others are.

The forecast fixtures should be the **real shape** — copy the field names from the facts block at the top of this plan. Provide named sets that hit each branch: a full week with real spread; a flat week (every day the same, exercising the range-bar floor); an entity supporting daily only (`supported_features: 1`, so the hourly strip has to be absent rather than empty); a night-time reading; and an unavailable entity.

The mock `hass.connection.subscribeMessage` must answer weather subscriptions — check how `dev/mock-hass.ts` already fakes the calendar's subscription and extend the same mechanism rather than adding a second.

- [ ] **Step 2: Catalog entry**

Controls: entity set, and scale. `toConfig` emits only `{ type, entity, scale }` so the Config tab prints something pasteable.

- [ ] **Step 3: Screenshots, and look at them**

Add entries to `dev/shots.ts` for small, medium, large and dark, then run `pnpm shots` and **read the generated PNGs** — you can view images. Judge specifically: do the daily bars line up on a shared scale, does the hourly strip start at "Now", is the large card legible in dark, and does the flat week still draw visible bars. Fix what the images show.

- [ ] **Step 4: The rules document**

`docs/weather-widget-rules.md`, in the register of `docs/complication-widget-rules.md`. It must record with reasoning: why the bars share one scale; that daily `temperature` is the high and `templow` the low; why the card asks `supported_features` before subscribing; why even the small card needs a subscription; and how night is inferred when Home Assistant only marks `clear-night`.

- [ ] **Step 5: README**

A section in the README's existing voice — prose about what the card decides, not a feature list. Add it to the card table and the top link list.

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm build:site && pnpm format:check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: showcase, screenshots and docs for the weather card"
```

---

## Deliberately deferred

**The sunrise/sunset column in the hourly strip.** Spec §3 asks for it — the reference
shows a `5:54AM` column with a sunrise glyph sitting between the hours. It is not in this
plan, and that is a decision rather than an oversight: it needs `sun.sun`'s `next_rising`
and `next_setting` attributes threaded into the hourly model, a rule for where a non-hour
column sorts among hours, and a layout that stops assuming every column is one hour wide.
That is a task's worth of work on top of a nine-task plan, for a detail nobody will miss on
first use.

Add it as its own small plan once the card is real and you have looked at the strip without
it. If it is still wanted then, it will be cheap; if the strip already reads as a day, it
was never needed.

## Verification checklist

- [ ] `pnpm test` passes, with new tests for `size`, `condition`, `source`, `model` and `layout`
- [ ] `pnpm typecheck`, `pnpm build`, `pnpm build:site`, `pnpm format:check` all clean
- [ ] The calendar, battery and complication cards still work — `size.ts` changed under all three
- [ ] The battery card draws two rows of four at `large`
- [ ] Weather renders at all three sizes, in both themes, in `pnpm dev`
- [ ] The daily bars share one scale — a warm day sits visibly right of a cold one
- [ ] An entity supporting only daily forecasts draws no hourly strip, rather than an empty one
- [ ] Removing the card from a dashboard unsubscribes; adding it twice does not double-subscribe
- [ ] `README.md` and `docs/weather-widget-rules.md` describe what shipped
