# Complication Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third card to the library — one card type that draws any Home Assistant entity in one of five faces borrowed from watchOS complications, deriving everything it can from the entity itself.

**Architecture:** The same three-layer shape both existing cards use. A pure model layer turns `hass` states into a normalised `Complication[]`; a pure layout layer prices the content against the measured box in design units; a Lit element renders one of five faces and owns nothing but markup and CSS. Pure layers are unit-tested; the element is not. Overflow is made unreachable by returning per-config `min_rows` / `min_columns` from `getGridOptions()` rather than by handling it.

**Tech Stack:** TypeScript 7, Lit 3, Vite 8 (Rolldown), Vitest 4, `@mdi/js`. No runtime dependencies beyond Lit. pnpm.

**Spec:** `docs/superpowers/specs/2026-08-08-complication-card-design.md`

## Global Constraints

- **Home Assistant 2026.7+.** No compatibility shims for older cores.
- **Zero runtime dependencies beyond Lit and `@mdi/js`.** Never add `custom-card-helpers`.
- **Cards read `--cw-*` tokens only.** Never `--primary-text-color` or any other HA theme variable directly; `src/theme/tokens.ts` is the single bridge.
- **Dark mode is `:host([dark])`**, reflected from `hass.themes.darkMode`. Never `prefers-color-scheme`.
- **No `size` config key.** Home Assistant's Layout tab owns the footprint. See `src/core/size.ts`.
- **Layout arithmetic is in design units** — pixels at `scale: 100`. Divide the measured box by the scale factor once, at the top, then price everything against the CSS as written. Every constant that mirrors a CSS length must name its twin in a comment.
- **House comment style.** This codebase documents _why_, at length, in prose. Every non-obvious constant and decision carries a comment explaining the reasoning, not the mechanics. Code below is correct but under-commented; the implementer must bring it up to the density of `src/cards/battery/layout.ts`.
- **Formatting:** `pnpm format` (Prettier) before every commit. `pnpm typecheck` must pass.
- **Commit style:** Conventional Commits (`feat:`, `refactor:`, `docs:`, `test:`).

## File Structure

**Created**

| File                                                 | Responsibility                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `src/core/ring.ts`                                   | Ring arithmetic, moved from the battery card so both cards share it |
| `src/cards/complication/style.ts`                    | The `ComplicationStyle` vocabulary and its labels                   |
| `src/cards/complication/tint.ts`                     | `device_class`/domain → a named colour from the existing palette    |
| `src/cards/complication/range.ts`                    | Whether an entity has a gauge range, and what it is                 |
| `src/cards/complication/model.ts`                    | The whole of the card's contact with `hass`                         |
| `src/cards/complication/layout.ts`                   | Packing and the size floors                                         |
| `src/cards/complication/complication-card.ts`        | The element: five render functions, CSS, registration               |
| `src/cards/complication/complication-card-editor.ts` | The visual editor                                                   |
| `dev/complication-entities.ts`                       | Mock entities and named sets for the showcase                       |
| `docs/complication-widget-rules.md`                  | The card's rules, as `battery-widget-rules.md` does for its card    |

**Modified**

| File                                                       | Change                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `src/cards/battery/battery-card.ts`                        | Import ring arithmetic from `core/ring`                     |
| `src/cards/battery/ring.test.ts` → `src/core/ring.test.ts` | Moves with the module                                       |
| `src/theme/tokens.ts`                                      | Add `--cw-teal` (light and dark) — the only palette gap     |
| `src/core/types/ha.ts`                                     | Add `display_precision` to `HassEntityRegistryDisplayEntry` |
| `src/index.ts`                                             | Import and re-export the new card                           |
| `dev/site/catalog.ts`                                      | A showcase entry with controls and fixtures                 |
| `README.md`                                                | A section for the card                                      |

---

### Task 1: Move the ring arithmetic into `core`

Both cards draw a ring, so the arithmetic stops belonging to the battery card. Pure move, no behaviour change — the existing tests are the proof.

**Files:**

- Create: `src/core/ring.ts` (moved from `src/cards/battery/ring.ts`)
- Create: `src/core/ring.test.ts` (moved from `src/cards/battery/ring.test.ts`)
- Delete: `src/cards/battery/ring.ts`, `src/cards/battery/ring.test.ts`
- Modify: `src/cards/battery/battery-card.ts` (the import)

**Interfaces:**

- Consumes: nothing.
- Produces: `RING_BOX`, `RING_STROKE`, `RING_RADIUS`, `RING_CIRCUMFERENCE`, `arcFor(level: number | null): number` from `src/core/ring.ts`, all unchanged.

- [ ] **Step 1: Run the existing ring tests so you know the baseline is green**

Run: `pnpm test -- src/cards/battery/ring.test.ts`
Expected: PASS.

- [ ] **Step 2: Move both files with git so history follows**

```bash
git mv src/cards/battery/ring.ts src/core/ring.ts
git mv src/cards/battery/ring.test.ts src/core/ring.test.ts
```

- [ ] **Step 3: Fix the test's import**

In `src/core/ring.test.ts`, the import already reads `from './ring'` and stays correct after the move. Confirm by opening the file; change nothing if it is already relative to the same directory.

- [ ] **Step 4: Fix the battery card's import**

In `src/cards/battery/battery-card.ts`, replace:

```ts
import { RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE, arcFor } from './ring'
```

with:

```ts
import { RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE, arcFor } from '../../core/ring'
```

- [ ] **Step 5: Check nothing else referenced the old path**

Run: `grep -rn "battery/ring\|from './ring'" src/ dev/`
Expected: only `src/core/ring.test.ts` matches.

- [ ] **Step 6: Add a note to the moved module saying why it is in `core`**

At the top of `src/core/ring.ts`, above the existing block comment, add a paragraph in house voice explaining that this is shared between the battery card and the complication card, that it is in the ring's own coordinate space so neither card's pixels enter into it, and that the battery card's "always green" argument lives with the _card_ rather than here — this module has no opinion about colour.

- [ ] **Step 7: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add -A
git commit -m "refactor: move ring arithmetic to core so both cards share it"
```

---

### Task 2: The style vocabulary and the tint palette

**Files:**

- Create: `src/cards/complication/style.ts`
- Create: `src/cards/complication/tint.ts`
- Create: `src/cards/complication/tint.test.ts`
- Modify: `src/theme/tokens.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `COMPLICATION_STYLES: readonly ComplicationStyle[]`, `type ComplicationStyle`, `DEFAULT_STYLE: ComplicationStyle`, `STYLE_LABELS: Record<ComplicationStyle, string>`, `isRectangular(style): boolean` from `style.ts`
  - `type TintName`, `TINTS: readonly TintName[]`, `tintFor(entity: HassEntity): TintName`, `tintVar(tint: TintName): string` from `tint.ts`

- [ ] **Step 1: Add the one missing palette colour**

`tokens.ts` already carries `--cw-red`, `--cw-orange`, `--cw-yellow`, `--cw-green`, `--cw-blue`, `--cw-indigo`, `--cw-purple`, `--cw-pink` and `--cw-accent`. Only teal is missing. In the `:host` block, after `--cw-blue`, add:

```css
--cw-teal: #30b0c7;
```

and in the `:host([dark])` block, after its `--cw-blue`:

```css
--cw-teal: #40c8e0;
```

Add a comment saying these are Apple's `systemTeal` in each appearance, and that the palette is now the closed set the complication card's `color:` option chooses from.

- [ ] **Step 2: Write `style.ts`**

```ts
export const COMPLICATION_STYLES = [
  'circular',
  'rectangular',
  'rectangular-header',
  'rectangular-bleed',
  'inline',
] as const

export type ComplicationStyle = (typeof COMPLICATION_STYLES)[number]

export const DEFAULT_STYLE: ComplicationStyle = 'circular'

export const STYLE_LABELS: Record<ComplicationStyle, string> = {
  circular: 'Circular',
  rectangular: 'Rectangular',
  'rectangular-header': 'Rectangular with header',
  'rectangular-bleed': 'Rectangular, full-bleed',
  inline: 'Inline',
}

/** The three that stack full-width rather than tiling. */
export const isRectangular = (style: ComplicationStyle): boolean => style.startsWith('rectangular')
```

- [ ] **Step 3: Write the failing tint test**

Create `src/cards/complication/tint.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { HassEntity } from '../../core/types/ha'
import { tintFor, tintVar } from './tint'

const entity = (entity_id: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id,
  state: '1',
  attributes,
  last_changed: '',
  last_updated: '',
})

describe('tintFor', () => {
  it('reads device_class before anything else', () => {
    expect(tintFor(entity('sensor.a', { device_class: 'temperature' }))).toBe('orange')
    expect(tintFor(entity('sensor.b', { device_class: 'humidity' }))).toBe('blue')
    expect(tintFor(entity('sensor.c', { device_class: 'moisture' }))).toBe('blue')
    expect(tintFor(entity('sensor.d', { device_class: 'battery' }))).toBe('green')
    expect(tintFor(entity('sensor.e', { device_class: 'power' }))).toBe('yellow')
    expect(tintFor(entity('sensor.f', { device_class: 'illuminance' }))).toBe('yellow')
    expect(tintFor(entity('sensor.g', { device_class: 'pressure' }))).toBe('teal')
    expect(tintFor(entity('sensor.h', { device_class: 'carbon_dioxide' }))).toBe('indigo')
  })

  it('falls back to the domain when there is no device class', () => {
    expect(tintFor(entity('lock.front_door'))).toBe('red')
    expect(tintFor(entity('media_player.kitchen'))).toBe('pink')
    expect(tintFor(entity('light.hall'))).toBe('yellow')
    expect(tintFor(entity('cover.garage'))).toBe('indigo')
  })

  it('answers accent for anything it does not recognise', () => {
    expect(tintFor(entity('sensor.unknowable'))).toBe('accent')
    expect(tintFor(entity('weird.thing', { device_class: 'invented' }))).toBe('accent')
  })

  it('prefers the device class over the domain when they disagree', () => {
    expect(tintFor(entity('light.grow_lamp', { device_class: 'temperature' }))).toBe('orange')
  })
})

describe('tintVar', () => {
  it('names the token, so a card never writes a colour of its own', () => {
    expect(tintVar('orange')).toBe('var(--cw-orange)')
    expect(tintVar('accent')).toBe('var(--cw-accent)')
  })
})
```

- [ ] **Step 4: Run it to watch it fail**

Run: `pnpm test -- src/cards/complication/tint.test.ts`
Expected: FAIL — `Failed to resolve import "./tint"`.

- [ ] **Step 5: Write `tint.ts`**

```ts
import type { HassEntity } from '../../core/types/ha'

export const TINTS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'accent',
] as const

export type TintName = (typeof TINTS)[number]

const BY_DEVICE_CLASS: Record<string, TintName> = {
  temperature: 'orange',
  humidity: 'blue',
  moisture: 'blue',
  water: 'blue',
  precipitation: 'blue',
  battery: 'green',
  energy: 'green',
  power: 'yellow',
  current: 'yellow',
  voltage: 'yellow',
  illuminance: 'yellow',
  pressure: 'teal',
  atmospheric_pressure: 'teal',
  carbon_dioxide: 'indigo',
  carbon_monoxide: 'indigo',
  aqi: 'indigo',
  door: 'red',
  window: 'red',
  safety: 'red',
  problem: 'red',
}

const BY_DOMAIN: Record<string, TintName> = {
  lock: 'red',
  media_player: 'pink',
  light: 'yellow',
  cover: 'indigo',
  climate: 'orange',
  fan: 'teal',
  vacuum: 'purple',
  person: 'blue',
}

/**
 * Constant per entity, and never a function of the reading. See the spec's decision 4 and
 * the argument in `core/ring.ts`'s host card.
 */
export const tintFor = (entity: HassEntity): TintName => {
  const deviceClass = entity.attributes.device_class
  if (typeof deviceClass === 'string' && BY_DEVICE_CLASS[deviceClass]) {
    return BY_DEVICE_CLASS[deviceClass]
  }

  const domain = entity.entity_id.split('.')[0] ?? ''
  return BY_DOMAIN[domain] ?? 'accent'
}

/** The token, never a literal: a card must not carry a colour a theme cannot restyle. */
export const tintVar = (tint: TintName): string => `var(--cw-${tint})`
```

- [ ] **Step 6: Run the test again**

Run: `pnpm test -- src/cards/complication/tint.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add src/cards/complication/style.ts src/cards/complication/tint.ts src/cards/complication/tint.test.ts src/theme/tokens.ts
git commit -m "feat: complication style vocabulary and tint derivation"
```

---

### Task 3: The gauge range

An arc is a fraction, so it needs a floor and a ceiling. Most entities have none, and the card must say so rather than invent one.

**Files:**

- Create: `src/cards/complication/range.ts`
- Create: `src/cards/complication/range.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `interface Range { min: number; max: number }`, `rangeFor(entity: HassEntity, override?: Partial<Range>): Range | null`, `fractionOf(value: number, range: Range): number` from `range.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/cards/complication/range.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { HassEntity } from '../../core/types/ha'
import { fractionOf, rangeFor } from './range'

const entity = (
  entity_id: string,
  state = '50',
  attributes: Record<string, unknown> = {},
): HassEntity => ({ entity_id, state, attributes, last_changed: '', last_updated: '' })

describe('rangeFor', () => {
  it('gives a percentage anything measured in percent', () => {
    expect(rangeFor(entity('sensor.a', '72', { unit_of_measurement: '%' }))).toEqual({
      min: 0,
      max: 100,
    })
    expect(rangeFor(entity('sensor.b', '72', { device_class: 'battery' }))).toEqual({
      min: 0,
      max: 100,
    })
    expect(rangeFor(entity('sensor.c', '40', { device_class: 'humidity' }))).toEqual({
      min: 0,
      max: 100,
    })
  })

  it('reads a cover off its position and a light off its brightness', () => {
    expect(rangeFor(entity('cover.garage', 'open', { current_position: 40 }))).toEqual({
      min: 0,
      max: 100,
    })
    expect(rangeFor(entity('light.hall', 'on', { brightness: 128 }))).toEqual({ min: 0, max: 255 })
  })

  it('takes a number entity at its own word', () => {
    expect(rangeFor(entity('number.target', '5', { min: 1, max: 10 }))).toEqual({ min: 1, max: 10 })
    expect(rangeFor(entity('input_number.x', '5', { min: -20, max: 20 }))).toEqual({
      min: -20,
      max: 20,
    })
  })

  /**
   * The decision recorded in the spec's §10.1: a current temperature drawn against a
   * thermostat's own limits is an arc that sits mid-scale and barely moves, which is a
   * gauge that says nothing. `min`/`max` are how somebody who disagrees gets one.
   */
  it('gives a climate entity no range of its own', () => {
    expect(
      rangeFor(
        entity('climate.lounge', 'heat', { min_temp: 7, max_temp: 35, current_temperature: 21 }),
      ),
    ).toBeNull()
  })

  it('gives an ordinary sensor no range at all', () => {
    expect(
      rangeFor(
        entity('sensor.lounge_temp', '21.4', {
          device_class: 'temperature',
          unit_of_measurement: '°C',
        }),
      ),
    ).toBeNull()
    expect(rangeFor(entity('sensor.text', 'Idle'))).toBeNull()
  })

  it('lets an override win, and needs both halves of one', () => {
    const temp = entity('sensor.t', '21', { device_class: 'temperature' })
    expect(rangeFor(temp, { min: 16, max: 24 })).toEqual({ min: 16, max: 24 })
    expect(rangeFor(temp, { min: 16 })).toBeNull()
    expect(rangeFor(temp, { max: 24 })).toBeNull()
  })

  it('refuses a range that is empty or backwards, rather than dividing by zero', () => {
    const temp = entity('sensor.t', '21')
    expect(rangeFor(temp, { min: 20, max: 20 })).toBeNull()
    expect(rangeFor(temp, { min: 24, max: 16 })).toBeNull()
  })
})

describe('fractionOf', () => {
  it('is the position in the range, clamped to it', () => {
    expect(fractionOf(50, { min: 0, max: 100 })).toBe(0.5)
    expect(fractionOf(20, { min: 16, max: 24 })).toBe(0.5)
    expect(fractionOf(-5, { min: 0, max: 100 })).toBe(0)
    expect(fractionOf(140, { min: 0, max: 100 })).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/cards/complication/range.test.ts`
Expected: FAIL — cannot resolve `./range`.

- [ ] **Step 3: Write `range.ts`**

```ts
import type { HassEntity } from '../../core/types/ha'

export interface Range {
  min: number
  max: number
}

const PERCENT_DEVICE_CLASSES = new Set(['battery', 'humidity', 'moisture', 'power_factor'])

const asNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** A range has to have room in it, or the arc is a division by zero. */
const valid = (range: Range | null): Range | null => (range && range.max > range.min ? range : null)

/**
 * The range to draw an arc against, or `null` for "draw no gauge".
 *
 * `null` is the common answer and it is the honest one: a room at 21.4°C has no ceiling,
 * and an arc against an invented 0–100 would be a fraction of nothing.
 */
export const rangeFor = (entity: HassEntity, override?: Partial<Range>): Range | null => {
  // Both halves or neither: half an override is a range whose other end would have to be
  // invented, which is the thing this module exists not to do.
  if (override?.min !== undefined || override?.max !== undefined) {
    if (override.min === undefined || override.max === undefined) return null
    return valid({ min: override.min, max: override.max })
  }

  const { attributes } = entity
  const domain = entity.entity_id.split('.')[0] ?? ''
  const deviceClass = attributes.device_class

  if (domain === 'number' || domain === 'input_number') {
    const min = asNumber(attributes.min)
    const max = asNumber(attributes.max)
    return min === null || max === null ? null : valid({ min, max })
  }

  if (domain === 'light') return valid({ min: 0, max: 255 })
  if (domain === 'cover') return valid({ min: 0, max: 100 })

  if (typeof deviceClass === 'string' && PERCENT_DEVICE_CLASSES.has(deviceClass)) {
    return valid({ min: 0, max: 100 })
  }

  if (attributes.unit_of_measurement === '%') return valid({ min: 0, max: 100 })

  return null
}

export const fractionOf = (value: number, range: Range): number => {
  const span = range.max - range.min
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (value - range.min) / span))
}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test -- src/cards/complication/range.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/complication/range.ts src/cards/complication/range.test.ts
git commit -m "feat: derive a complication's gauge range, or refuse to"
```

---

### Task 4: The model

The whole of the card's contact with `hass`. Everything downstream sees a `Complication` and nothing else.

**Files:**

- Create: `src/cards/complication/model.ts`
- Create: `src/cards/complication/model.test.ts`
- Modify: `src/core/types/ha.ts`

**Interfaces:**

- Consumes: `tintFor`, `TintName` (Task 2); `rangeFor`, `fractionOf`, `Range` (Task 3).
- Produces: `interface ComplicationEntityConfig`, `interface Complication`, `entityConfigs(entities): ComplicationEntityConfig[]`, `watchedIds(entities): string[]`, `readComplications(hass, entities, cardDefaults): Complication[]` from `model.ts`.

- [ ] **Step 1: Add the registry field the value formatter needs**

In `src/core/types/ha.ts`, add to `HassEntityRegistryDisplayEntry`:

```ts
  /**
   * Decimal places the user pinned for this entity in the entity registry, if any.
   * Absent means "however the integration reports it", which is what the raw state says.
   */
  display_precision?: number
```

- [ ] **Step 2: Write the failing test**

Create `src/cards/complication/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { entityConfigs, readComplications, watchedIds } from './model'

const state = (
  entity_id: string,
  value: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({ entity_id, state: value, attributes, last_changed: '', last_updated: '' })

const hassWith = (...states: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(states.map(s => [s.entity_id, s])),
    entities: {},
    locale: { language: 'en', time_format: '24', first_weekday: 'monday' },
    localize: () => '',
  }) as unknown as HomeAssistant

describe('entityConfigs', () => {
  it('takes a bare id, an object, or a scalar written where a list was meant', () => {
    expect(entityConfigs('sensor.a')).toEqual([{ entity: 'sensor.a' }])
    expect(entityConfigs(['sensor.a', { entity: 'sensor.b', name: 'B' }])).toEqual([
      { entity: 'sensor.a' },
      { entity: 'sensor.b', name: 'B' },
    ])
  })

  it('answers with nothing for nothing, rather than throwing', () => {
    expect(entityConfigs(undefined)).toEqual([])
    expect(entityConfigs([])).toEqual([])
    expect(entityConfigs(null as never)).toEqual([])
  })
})

describe('watchedIds', () => {
  it('is every id the rendering reads', () => {
    expect(watchedIds(['sensor.a', { entity: 'sensor.b' }])).toEqual(['sensor.a', 'sensor.b'])
  })
})

describe('readComplications', () => {
  it('formats a reading with its unit and carries the derived range and tint', () => {
    const hass = hassWith(
      state('sensor.phone', '72', {
        friendly_name: 'Phone',
        device_class: 'battery',
        unit_of_measurement: '%',
      }),
    )

    const [phone] = readComplications(hass, ['sensor.phone'], {})

    expect(phone.name).toBe('Phone')
    expect(phone.value).toBe('72%')
    expect(phone.numeric).toBe(72)
    expect(phone.range).toEqual({ min: 0, max: 100 })
    expect(phone.fraction).toBe(0.72)
    expect(phone.tint).toBe('green')
    expect(phone.unavailable).toBe(false)
  })

  it('draws no gauge for a reading with no range, and still shows the value', () => {
    const hass = hassWith(
      state('sensor.lounge', '21.4', {
        friendly_name: 'Lounge',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
    )

    const [lounge] = readComplications(hass, ['sensor.lounge'], {})

    expect(lounge.value).toBe('21.4 °C')
    expect(lounge.range).toBeNull()
    expect(lounge.fraction).toBeNull()
    expect(lounge.tint).toBe('orange')
  })

  /**
   * The battery card's rule, for the battery card's reason: an entity that stopped
   * reporting is exactly what somebody puts a widget on a dashboard to find out.
   */
  it('keeps an unavailable entity, dashed and flagged', () => {
    const hass = hassWith(state('sensor.gone', 'unavailable', { friendly_name: 'Gone' }))

    const [gone] = readComplications(hass, ['sensor.gone'], {})

    expect(gone.value).toBe('—')
    expect(gone.numeric).toBeNull()
    expect(gone.unavailable).toBe(true)
  })

  it('keeps an entity that is not in hass at all', () => {
    const [missing] = readComplications(hassWith(), ['sensor.never_existed'], {})

    expect(missing.id).toBe('sensor.never_existed')
    expect(missing.name).toBe('sensor.never_existed')
    expect(missing.unavailable).toBe(true)
  })

  it('lets a per-entity setting beat the card, and the card beat the derivation', () => {
    const hass = hassWith(
      state('sensor.t', '20', { friendly_name: 'T', device_class: 'temperature' }),
    )

    const [derived] = readComplications(hass, ['sensor.t'], {})
    expect(derived.range).toBeNull()
    expect(derived.tint).toBe('orange')

    const [carded] = readComplications(hass, ['sensor.t'], { min: 16, max: 24, color: 'blue' })
    expect(carded.range).toEqual({ min: 16, max: 24 })
    expect(carded.fraction).toBe(0.5)
    expect(carded.tint).toBe('blue')

    const [rowed] = readComplications(
      hass,
      [{ entity: 'sensor.t', min: 0, max: 40, color: 'pink', name: 'Mine' }],
      { min: 16, max: 24, color: 'blue' },
    )
    expect(rowed.range).toEqual({ min: 0, max: 40 })
    expect(rowed.tint).toBe('pink')
    expect(rowed.name).toBe('Mine')
  })

  it('always answers with an icon, so no cell renders an empty one', () => {
    const hass = hassWith(
      state('sensor.a', '1', { icon: 'mdi:duck' }),
      state('sensor.b', '1', { device_class: 'temperature' }),
      state('lock.c', 'locked'),
      state('sensor.d', '1'),
    )

    const [own, byClass, byDomain, fallback] = readComplications(
      hass,
      ['sensor.a', 'sensor.b', 'lock.c', 'sensor.d'],
      {},
    )

    expect(own.icon).toBe('mdi:duck')
    expect(byClass.icon).toBe('mdi:thermometer')
    expect(byDomain.icon).toBe('mdi:lock')
    expect(fallback.icon).toBe('mdi:eye')
  })

  it('carries a supporting line only where one is obviously right', () => {
    const hass = hassWith(
      state('climate.lounge', 'heat', { friendly_name: 'Lounge', temperature: 22 }),
      state('media_player.kitchen', 'playing', {
        friendly_name: 'Kitchen',
        media_title: 'Weightless',
      }),
      state('sensor.plain', '5', { friendly_name: 'Plain' }),
    )

    const [climate, media, plain] = readComplications(
      hass,
      ['climate.lounge', 'media_player.kitchen', 'sensor.plain'],
      {},
    )

    expect(climate.supporting).toBe('Heating to 22°')
    expect(media.supporting).toBe('Weightless')
    expect(plain.supporting).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to watch it fail**

Run: `pnpm test -- src/cards/complication/model.test.ts`
Expected: FAIL — cannot resolve `./model`.

- [ ] **Step 4: Write `model.ts`**

```ts
import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { fractionOf, rangeFor, type Range } from './range'
import { tintFor, type TintName } from './tint'

export interface ComplicationEntityConfig {
  entity: string
  name?: string
  icon?: string
  min?: number
  max?: number
  color?: TintName
}

/** The card-level values a row falls back to. */
export interface ComplicationDefaults {
  min?: number
  max?: number
  color?: TintName
}

export interface Complication {
  /** The entity id: the identity of the cell, and what a tap opens. */
  id: string
  name: string
  /** Always an `mdi:` name, so the element never renders an empty `<ha-icon>`. */
  icon: string
  /** Already formatted, unit included. An em dash when there is nothing to read. */
  value: string
  /** The reading as a number, or `null` when the state is not one. */
  numeric: number | null
  range: Range | null
  /** `numeric` placed in `range`, 0–1. `null` whenever there is no gauge to draw. */
  fraction: number | null
  supporting: string | null
  tint: TintName
  unavailable: boolean
}

const UNAVAILABLE = new Set(['unavailable', 'unknown'])

/** Not localised, like the rest of the library's own marks. Matches the battery card's. */
const VALUE_DASH = '—'

export const entityConfigs = (entities: unknown): ComplicationEntityConfig[] => {
  if (!entities) return []
  const list = Array.isArray(entities) ? entities : [entities]

  return list.flatMap(row => {
    if (typeof row === 'string') return [{ entity: row }]
    if (
      row &&
      typeof row === 'object' &&
      typeof (row as ComplicationEntityConfig).entity === 'string'
    ) {
      return [row as ComplicationEntityConfig]
    }
    return []
  })
}

export const watchedIds = (entities: unknown): string[] =>
  entityConfigs(entities).map(row => row.entity)

const numberOf = (raw: string): number | null => {
  const n = Number(raw)
  return raw.trim() !== '' && Number.isFinite(n) ? n : null
}

const ICON_BY_DEVICE_CLASS: Record<string, string> = {
  temperature: 'mdi:thermometer',
  humidity: 'mdi:water-percent',
  moisture: 'mdi:water',
  battery: 'mdi:battery',
  power: 'mdi:flash',
  energy: 'mdi:lightning-bolt',
  illuminance: 'mdi:brightness-5',
  pressure: 'mdi:gauge',
  carbon_dioxide: 'mdi:molecule-co2',
  door: 'mdi:door',
  window: 'mdi:window-closed',
}

const ICON_BY_DOMAIN: Record<string, string> = {
  lock: 'mdi:lock',
  light: 'mdi:lightbulb',
  cover: 'mdi:window-shutter',
  climate: 'mdi:thermostat',
  media_player: 'mdi:play-circle',
  fan: 'mdi:fan',
  vacuum: 'mdi:robot-vacuum',
  person: 'mdi:account',
  binary_sensor: 'mdi:radiobox-blank',
  number: 'mdi:ray-vertex',
}

/**
 * A name for `<ha-icon>`, always.
 *
 * `<ha-state-icon>` would resolve this the way the rest of the frontend does, including a
 * domain's state-dependent icon — and it was the first answer. Two things against it: the
 * dev harness stubs `ha-icon` and has no `ha-state-icon` at all (`dev/ha-stubs.ts`), so the
 * showcase would draw nothing; and a state-dependent icon is the wrong behaviour here for
 * the reason the battery card's own note gives, that `mdi:battery-70` restates the number
 * the ring has already drawn. So: what the user asked for, then what the entity carries,
 * then a table, then a mark that means "something, unspecified".
 */
const iconFor = (entity: HassEntity): string => {
  const own = entity.attributes.icon
  if (typeof own === 'string' && own !== '') return own

  const deviceClass = entity.attributes.device_class
  if (typeof deviceClass === 'string' && ICON_BY_DEVICE_CLASS[deviceClass]) {
    return ICON_BY_DEVICE_CLASS[deviceClass]
  }

  const domain = entity.entity_id.split('.')[0] ?? ''
  return ICON_BY_DOMAIN[domain] ?? 'mdi:eye'
}

/**
 * The reading, formatted the way the frontend would.
 *
 * A number goes through `Intl.NumberFormat` in the user's language, honouring the decimals
 * they pinned in the entity registry when they pinned any; `%` is set tight against the
 * numeral and every other unit gets a space, which is the frontend's own rule. A state that
 * is not a number is asked of `hass.localize` under the key core files translations at, and
 * falls back to the raw string, because `localize` answers `''` for a key it does not have.
 */
const formatValue = (hass: HomeAssistant, entity: HassEntity): string => {
  const numeric = numberOf(entity.state)
  const unit = entity.attributes.unit_of_measurement

  if (numeric !== null) {
    const precision = hass.entities?.[entity.entity_id]?.display_precision
    const formatted = new Intl.NumberFormat(hass.locale?.language, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision ?? 2,
    }).format(numeric)

    if (typeof unit !== 'string' || unit === '') return formatted
    return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`
  }

  const domain = entity.entity_id.split('.')[0] ?? ''
  const deviceClass = entity.attributes.device_class
  const keys = [
    typeof deviceClass === 'string'
      ? `component.${domain}.entity_component.${deviceClass}.state.${entity.state}`
      : '',
    `component.${domain}.entity_component._.state.${entity.state}`,
  ].filter(Boolean)

  for (const key of keys) {
    const translated = hass.localize(key)
    if (translated) return translated
  }

  return entity.state.charAt(0).toUpperCase() + entity.state.slice(1)
}

/**
 * One line of context, and only where one is obviously right.
 *
 * Deliberately not a dump of attributes: a line reading `state_class: measurement` is worse
 * than no line, and this is the one place the card could easily become noisy.
 */
const supportingFor = (entity: HassEntity): string | null => {
  const domain = entity.entity_id.split('.')[0] ?? ''

  if (domain === 'climate') {
    const target = entity.attributes.temperature
    if (typeof target === 'number') {
      const verb = entity.state === 'cool' ? 'Cooling' : 'Heating'
      return `${verb} to ${target}°`
    }
    return null
  }

  if (domain === 'media_player') {
    const title = entity.attributes.media_title
    return typeof title === 'string' && title !== '' ? title : null
  }

  if (domain === 'cover') {
    const position = entity.attributes.current_position
    return typeof position === 'number' ? `${position}% open` : null
  }

  return null
}

export const readComplications = (
  hass: HomeAssistant,
  entities: unknown,
  defaults: ComplicationDefaults,
): Complication[] =>
  entityConfigs(entities).map(row => {
    const entity = hass.states[row.entity]

    if (!entity) {
      return {
        id: row.entity,
        name: row.name ?? row.entity,
        icon: row.icon ?? 'mdi:eye',
        value: VALUE_DASH,
        numeric: null,
        range: null,
        fraction: null,
        supporting: null,
        tint: row.color ?? defaults.color ?? 'accent',
        unavailable: true,
      }
    }

    const unavailable = UNAVAILABLE.has(entity.state)
    const numeric = unavailable ? null : numberOf(entity.state)

    const override =
      row.min !== undefined || row.max !== undefined
        ? { min: row.min, max: row.max }
        : defaults.min !== undefined || defaults.max !== undefined
          ? { min: defaults.min, max: defaults.max }
          : undefined

    const range = unavailable ? null : rangeFor(entity, override)

    return {
      id: entity.entity_id,
      name: row.name ?? (entity.attributes.friendly_name as string | undefined) ?? entity.entity_id,
      icon: row.icon ?? iconFor(entity),
      value: unavailable ? VALUE_DASH : formatValue(hass, entity),
      numeric,
      range,
      fraction: range && numeric !== null ? fractionOf(numeric, range) : null,
      supporting: unavailable ? null : supportingFor(entity),
      tint: row.color ?? defaults.color ?? tintFor(entity),
      unavailable,
    }
  })
```

- [ ] **Step 5: Run the test again**

Run: `pnpm test -- src/cards/complication/model.test.ts`
Expected: PASS. If the `21.4 °C` case fails on decimals, the `maximumFractionDigits` default is the cause — fix the implementation, not the expectation.

- [ ] **Step 6: Verify the localize key shape against a real core**

The state-translation key is the one thing here taken from the frontend's structure rather than proven. Confirm it:

```bash
docker run --rm --entrypoint bash ghcr.io/home-assistant/home-assistant:stable -c \
  'grep -roh -E "entity_component\.[_a-z]+\.state" /usr/local/lib/python3.*/site-packages/hass_frontend/frontend_latest/*.js | sort -u | head'
```

Expected: keys of the shape `entity_component._.state`. If the shape differs, correct `formatValue` and append the finding to `docs/ha-api-notes.md` under a new `### Entity state strings` heading — that file is where this project records what it has verified rather than assumed.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add src/cards/complication/model.ts src/cards/complication/model.test.ts src/core/types/ha.ts docs/ha-api-notes.md
git commit -m "feat: turn hass states into complications"
```

---

### Task 5: Packing and the size floors

Two questions: how the faces sit in the box that was dragged, and what footprint the card refuses to go below. The second is what makes overflow unreachable, so there is no overflow state anywhere in this plan.

**Files:**

- Create: `src/cards/complication/layout.ts`
- Create: `src/cards/complication/layout.test.ts`

**Interfaces:**

- Consumes: `ComplicationStyle`, `isRectangular` (Task 2); `RING_MIN`-equivalent constants are defined here, not imported — the battery card's are its own.
- Produces: `interface Box { width: number; height: number }`, `interface Pack { columns: number; rows: number; ring: number; labels: boolean }`, `packFor(style, count, box, scale?): Pack`, `interface Floors { min_columns: number; min_rows: number }`, `floorsFor(style, count): Floors` from `layout.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/cards/complication/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { floorsFor, packFor, type Box } from './layout'

/** The two footprints the library designs for, in a section of the usual ~500px. */
const SMALL: Box = { width: 246, height: 248 }
const MEDIUM: Box = { width: 500, height: 248 }
const TALL: Box = { width: 500, height: 456 }

const shape = (style: Parameters<typeof packFor>[0], count: number, box: Box): string => {
  const pack = packFor(style, count, box)
  return `${pack.columns}×${pack.rows}, ring ${pack.ring}, ${pack.labels ? 'labelled' : 'bare'}`
}

describe('packFor, circular', () => {
  it('gives one entity the whole card, named', () => {
    expect(shape('circular', 1, SMALL)).toBe('1×1, ring 96, labelled')
  })

  it('puts them across before it puts them down', () => {
    expect(packFor('circular', 2, MEDIUM).columns).toBe(2)
    expect(packFor('circular', 3, MEDIUM).columns).toBe(3)
    expect(packFor('circular', 4, MEDIUM).columns).toBe(4)
  })

  it('wraps once a row would take the rings under the minimum', () => {
    const pack = packFor('circular', 6, SMALL)
    expect(pack.columns * pack.rows).toBeGreaterThanOrEqual(6)
    expect(pack.ring).toBeGreaterThanOrEqual(40)
  })

  it('drops the names when a cell is too narrow to caption', () => {
    expect(packFor('circular', 4, SMALL).labels).toBe(false)
    expect(packFor('circular', 2, MEDIUM).labels).toBe(true)
  })

  it('never draws a ring outside its bounds', () => {
    for (const count of [1, 2, 3, 4, 6, 8]) {
      for (const box of [SMALL, MEDIUM, TALL]) {
        const { ring } = packFor('circular', count, box)
        expect(ring).toBeGreaterThanOrEqual(40)
        expect(ring).toBeLessThanOrEqual(96)
      }
    }
  })

  it('prices the box in design units, so scale moves the answer', () => {
    expect(packFor('circular', 4, MEDIUM, 1).labels).toBe(true)
    expect(packFor('circular', 4, MEDIUM, 1.6).labels).toBe(false)
  })
})

describe('packFor, the stacking styles', () => {
  it('stacks rectangular one per row, full width, with no ring', () => {
    expect(shape('rectangular', 3, MEDIUM)).toBe('1×3, ring 0, labelled')
    expect(shape('rectangular-header', 2, MEDIUM)).toBe('1×2, ring 0, labelled')
    expect(shape('rectangular-bleed', 1, MEDIUM)).toBe('1×1, ring 0, labelled')
  })

  it('stacks inline the same way', () => {
    expect(shape('inline', 4, MEDIUM)).toBe('1×4, ring 0, labelled')
  })
})

/**
 * The floors are the whole of the overflow story: the Layout tab clamps its sliders to
 * these, so a card cannot be dragged smaller than the entities it was given.
 */
describe('floorsFor', () => {
  it('asks for more height as the entities pile up', () => {
    expect(floorsFor('circular', 1)).toEqual({ min_columns: 4, min_rows: 3 })
    expect(floorsFor('circular', 4)).toEqual({ min_columns: 6, min_rows: 3 })
    expect(floorsFor('circular', 8)).toEqual({ min_columns: 6, min_rows: 3 })
    expect(floorsFor('circular', 12)).toEqual({ min_columns: 6, min_rows: 4 })
  })

  it('gives the stacking styles a floor per entity', () => {
    expect(floorsFor('rectangular', 1)).toEqual({ min_columns: 6, min_rows: 3 })
    expect(floorsFor('rectangular', 2)).toEqual({ min_columns: 6, min_rows: 5 })
    expect(floorsFor('rectangular', 3)).toEqual({ min_columns: 6, min_rows: 6 })
  })

  it('lets inline be the shortest card in the library', () => {
    expect(floorsFor('inline', 1)).toEqual({ min_columns: 6, min_rows: 2 })
    expect(floorsFor('inline', 2)).toEqual({ min_columns: 6, min_rows: 2 })
    expect(floorsFor('inline', 4)).toEqual({ min_columns: 6, min_rows: 4 })
  })

  it('treats no entities as one, so an unconfigured card still has a shape', () => {
    expect(floorsFor('circular', 0)).toEqual(floorsFor('circular', 1))
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm test -- src/cards/complication/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Write `layout.ts`**

```ts
import { rowsToPx } from '../../core/size'
import { isRectangular, type ComplicationStyle } from './style'

export interface Box {
  width: number
  height: number
}

export interface Pack {
  columns: number
  rows: number
  /** Ring diameter in design units. 0 for the styles that draw no ring. */
  ring: number
  /** Whether each cell has room for its name. */
  labels: boolean
}

export interface Floors {
  min_columns: number
  min_rows: number
}

// ---- Geometry, in design units. Each names its twin in the stylesheet. ------

/** Must match `--cw-inset`. */
const INSET = 16
/** `ha-card`'s border, top and bottom: real pixels, taken off before the scale divide. */
const BORDER = 1
/** Must match `--cw-comp-gap`. */
const GAP = 14
/** Must match `--cw-comp-label` line-height, plus the gap above it. */
const LABEL = 20
const LABEL_GAP = 6
/** The widest name worth captioning: measured, as the battery card's LABEL_WIDTH was. */
const LABEL_WIDTH = 64

const RING_MIN = 40
const RING_MAX = 96

/** Must match the `.row` height in the inline style. */
const INLINE_ROW = 44
/** Must match the `.block` min-height in the rectangular styles. */
const RECT_BLOCK = 104

/** The width a stacking style needs before its type starts truncating. */
const STACK_MIN_WIDTH = 220

/**
 * The section width the floors are computed against.
 *
 * `getGridOptions()` is answered before anything is measured and cannot know how wide the
 * user's section is, so the floors assume the usual one — the same ~500px `core/size.ts`
 * calls typical and `DEFAULT_WIDTH` hard-codes. A narrower section makes the floors
 * slightly generous, which errs the safe way: generous floors mean a card that fits.
 */
const ASSUMED_SECTION_WIDTH = 500
const GRID_COLUMNS = 12
const GRID_GAP = 8

/**
 * Named `grid…` rather than `columnsToPx` on purpose: `core/size.ts` exports a function of
 * that name taking the real section width, and this one assumes it. Two functions with one
 * name and different signatures is how the wrong one gets imported.
 */
const gridColumnsToPx = (columns: number): number => {
  const columnWidth = (ASSUMED_SECTION_WIDTH - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS
  return columns * columnWidth + (columns - 1) * GRID_GAP
}

/** The fewest whole grid columns whose width covers `px`, floored at the library's 4. */
const columnsFor = (px: number): number => {
  for (let c = 4; c < GRID_COLUMNS; c++) if (gridColumnsToPx(c) >= px) return c
  return GRID_COLUMNS
}

/** The fewest whole grid rows whose height covers `px`, floored at 1. */
const rowsFor = (px: number): number => {
  for (let r = 1; r < 12; r++) if (rowsToPx(r) >= px) return r
  return 12
}

// ---- Packing ----------------------------------------------------------------

/**
 * How the faces sit in the box the card was actually dragged to.
 *
 * The count decides the grid, the grid decides the cell, the face fits the cell — the
 * battery card's priority, for the battery card's reason: a face is never the reason an
 * entity is not drawn. Nothing here can drop an entity, because the floors made a box too
 * small to hold them all unreachable.
 */
export const packFor = (style: ComplicationStyle, count: number, box: Box, scale = 1): Pack => {
  const n = Math.max(1, count)
  const width = Math.max(0, (box.width - 2 * BORDER) / scale - 2 * INSET)
  const height = Math.max(0, (box.height - 2 * BORDER) / scale - 2 * INSET)

  if (isRectangular(style) || style === 'inline') {
    return { columns: 1, rows: n, ring: 0, labels: true }
  }

  // Across before down: the widest row the box can hold at the minimum ring, capped by the
  // count, because two rings in a wide card should not be spread to four columns.
  const fits = Math.max(1, Math.floor((width + GAP) / (RING_MIN + GAP)))
  const columns = Math.min(n, fits)
  const rows = Math.ceil(n / columns)

  const cellWidth = (width - (columns - 1) * GAP) / columns
  const cellHeight = (height - (rows - 1) * GAP) / rows

  // Same both-halves test the battery card makes: a name needs a cell wide enough to hold
  // it, and a cell tall enough to have somewhere to put it under the ring.
  const labels = cellWidth >= LABEL_WIDTH && cellHeight >= RING_MIN + LABEL_GAP + LABEL
  const caption = labels ? LABEL_GAP + LABEL : 0

  const ring = Math.max(RING_MIN, Math.floor(Math.min(RING_MAX, cellWidth, cellHeight - caption)))

  return { columns, rows, ring, labels }
}

// ---- Floors -----------------------------------------------------------------

/**
 * The smallest footprint the card will admit to, given what it was asked to draw.
 *
 * This is the whole of the overflow design. Home Assistant's Layout tab clamps its own
 * sliders to `min_rows` / `min_columns`, so a card holding six rings simply cannot be
 * dragged down to a box that holds four, and there is no `+2 more`, no scroller and no
 * truncated state to design, document or test. The cost is a card that sometimes insists
 * on being bigger than the user first reached for, which is the honest cost: it is how
 * much room the content needs.
 */
export const floorsFor = (style: ComplicationStyle, count: number): Floors => {
  const n = Math.max(1, count)

  if (isRectangular(style)) {
    const content = n * RECT_BLOCK + (n - 1) * GAP + 2 * INSET
    return { min_columns: columnsFor(STACK_MIN_WIDTH), min_rows: Math.max(3, rowsFor(content)) }
  }

  if (style === 'inline') {
    const content = n * INLINE_ROW + 2 * INSET
    // No floor of 3 here: the whole point of this style is to be the shortest card in the
    // library, and one strip has no business asking for 184px.
    return { min_columns: columnsFor(STACK_MIN_WIDTH), min_rows: Math.max(1, rowsFor(content)) }
  }

  // Circular: lay them out at most four across, which is the widest row that still reads as
  // a widget, then ask for the height that many rows need at the minimum ring.
  const across = Math.min(n, 4)
  const rows = Math.ceil(n / across)
  const neededWidth = across * RING_MIN + (across - 1) * GAP + 2 * INSET
  const neededHeight = rows * RING_MIN + (rows - 1) * GAP + 2 * INSET

  return {
    min_columns: columnsFor(neededWidth),
    min_rows: Math.max(3, rowsFor(neededHeight)),
  }
}
```

- [ ] **Step 4: Run the test and reconcile the table**

Run: `pnpm test -- src/cards/complication/layout.test.ts`

The `floorsFor` expectations were computed by hand from the constants above. If a case disagrees, work out which is right before changing either: the arithmetic is `columnsToPx(c) = c * 34.33 + (c - 1) * 8` and `rowsToPx(r) = r * 56 + (r - 1) * 8`. Fix whichever is genuinely wrong and leave a comment in the test explaining the number, in the style of `battery/layout.test.ts`'s "reference table" block.

Expected when reconciled: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/complication/layout.ts src/cards/complication/layout.test.ts
git commit -m "feat: complication packing, and the floors that make overflow unreachable"
```

---

### Task 6: The card element — circular and inline

**Files:**

- Create: `src/cards/complication/complication-card.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `CupertinoCard`, `CupertinoCardConfig` (`core/base-card`); `registerCard` (`core/register`); `RING_BOX`, `RING_RADIUS`, `RING_STROKE`, `RING_CIRCUMFERENCE` (`core/ring`, Task 1); `ComplicationStyle`, `DEFAULT_STYLE`, `isRectangular` (Task 2); `TintName`, `tintVar` (Task 2); `Complication`, `ComplicationEntityConfig`, `readComplications`, `watchedIds` (Task 4); `packFor`, `floorsFor` (Task 5).
- Produces: `COMPLICATION_CARD_TAG = 'cupertino-widgets-complication'`, `interface ComplicationCardConfig` from `complication-card.ts`.

- [ ] **Step 1: Write the card's shell — config, sizing, tap, watched entities**

Create `src/cards/complication/complication-card.ts`. Follow `battery-card.ts` closely; it is the nearest sibling.

```ts
import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { registerCard } from '../../core/register'
import { RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE } from '../../core/ring'
import type { LovelaceGridOptions } from '../../core/types/ha'
import { packFor, floorsFor } from './layout'
import {
  readComplications,
  watchedIds,
  entityConfigs,
  type Complication,
  type ComplicationEntityConfig,
} from './model'
import { DEFAULT_STYLE, isRectangular, type ComplicationStyle } from './style'
import { tintVar, type TintName } from './tint'

export const COMPLICATION_CARD_TAG = 'cupertino-widgets-complication'

export interface ComplicationCardConfig extends CupertinoCardConfig {
  entities?: (string | ComplicationEntityConfig)[]
  style?: ComplicationStyle
  min?: number
  max?: number
  color?: TintName
}

/** Not localised: HA has no string for it, and the library's own words are its own. */
const NO_ENTITIES = 'No Entities'

class CupertinoComplicationCard extends CupertinoCard<ComplicationCardConfig> {
  public static getStubConfig(): ComplicationCardConfig {
    return { type: `custom:${COMPLICATION_CARD_TAG}` }
  }

  protected override watchedEntities(): string[] {
    return watchedIds(this._config?.entities)
  }

  /**
   * The defaults `core/size.ts` gives every card, with this card's own floors over the top.
   *
   * The floors are the overflow design; see `floorsFor`. Recomputed on every call rather
   * than cached, because they depend on the config and a stale floor is a card that can be
   * dragged smaller than it fits.
   */
  public override getGridOptions(): LovelaceGridOptions {
    const style = this._config?.style ?? DEFAULT_STYLE
    const count = entityConfigs(this._config?.entities).length

    return { ...super.getGridOptions(), ...floorsFor(style, count) }
  }

  private _openMoreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }),
    )
  }
}
```

There is deliberately no `getConfigElement` yet — Task 8 adds it along with the editor it returns. A card without one is valid: Home Assistant simply drops the user into the YAML editor, which is the correct intermediate state rather than a stub to remember to delete.

- [ ] **Step 2: Add the render entry point and the empty state**

```ts
  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const style = this._config.style ?? DEFAULT_STYLE
    const items = readComplications(this.hass, this._config.entities, {
      min: this._config.min,
      max: this._config.max,
      color: this._config.color,
    })

    if (items.length === 0) {
      return html`<ha-card><div class="empty">${NO_ENTITIES}</div></ha-card>`
    }

    const pack = packFor(
      style,
      items.length,
      { width: this.boxWidth, height: this.boxHeight },
      this.scaleFactor,
    )

    return html`
      <ha-card>
        <div
          class="grid ${style}"
          style=${`--cw-comp-columns:${pack.columns}; --cw-comp-ring:${pack.ring}px`}
        >
          ${items.map(item => this._renderCell(style, item, pack.labels))}
        </div>
      </ha-card>
    `
  }
```

- [ ] **Step 3: Render the circular face**

```ts
  private _renderRing(item: Complication): TemplateResult {
    const centre = RING_BOX / 2
    const arc = item.fraction === null ? 0 : item.fraction * RING_CIRCUMFERENCE

    return html`
      <svg class="gauge" viewBox="0 0 ${RING_BOX} ${RING_BOX}" aria-hidden="true">
        <g transform="rotate(-90 ${centre} ${centre})">
          <circle class="track" cx=${centre} cy=${centre} r=${RING_RADIUS} stroke-width=${RING_STROKE} />
          ${
            arc > 0
              ? svg`<circle
                  class="arc"
                  cx=${centre}
                  cy=${centre}
                  r=${RING_RADIUS}
                  stroke-width=${RING_STROKE}
                  stroke-dasharray=${`${arc} ${RING_CIRCUMFERENCE}`}
                />`
              : nothing
          }
        </g>
      </svg>
    `
  }

  private _renderCircular(item: Complication, labels: boolean): TemplateResult {
    // No range means no arc, and then the icon takes the middle instead: the same style
    // showing what the data supports, rather than a sixth style.
    const gauge = item.range !== null

    return html`
      <div
        class="cell circular ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}, ${item.value}`}
        @click=${() => this._openMoreInfo(item.id)}
        @keydown=${this._activate(item.id)}
      >
        <div class="ring">
          ${gauge ? this._renderRing(item) : nothing}
          ${
            gauge
              ? html`<span class="reading">${item.value}</span>`
              : html`
                  <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
                  <span class="reading">${item.value}</span>
                `
          }
        </div>
        ${labels ? html`<span class="caption">${item.name}</span>` : nothing}
      </div>
    `
  }
```

- [ ] **Step 4: Render the inline face**

```ts
  private _renderInline(item: Complication): TemplateResult {
    return html`
      <div
        class="cell inline ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}, ${item.value}`}
        @click=${() => this._openMoreInfo(item.id)}
        @keydown=${this._activate(item.id)}
      >
        <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
        <span class="name">${item.name}</span>
        <span class="reading">${item.value}</span>
      </div>
    `
  }

  /**
   * Enter and Space on a focused cell, which is what makes `role="button"` honest.
   *
   * One helper rather than the same four lines inlined into each of the three faces: a
   * keyboard handler that only two of them carry is the kind of gap nobody notices until
   * somebody who navigates by keyboard finds it.
   */
  private _activate(entityId: string) {
    return (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this._openMoreInfo(entityId)
    }
  }

  private _renderCell(
    style: ComplicationStyle,
    item: Complication,
    labels: boolean,
  ): TemplateResult {
    if (style === 'inline') return this._renderInline(item)
    if (isRectangular(style)) return this._renderRectangular(style, item)
    return this._renderCircular(item, labels)
  }
```

`_renderRectangular` arrives in Task 7. Until then, have it return `this._renderInline(item)` so the file compiles; Task 7 replaces the body.

- [ ] **Step 5: Write the styles for these two faces**

```ts
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      ha-card {
        height: 100%;
        box-sizing: border-box;
        padding: var(--cw-inset);
        display: flex;
      }

      .grid {
        flex: 1;
        display: grid;
        gap: var(--cw-comp-gap);
        min-width: 0;
      }

      /* Must match layout.ts's GAP. */
      :host {
        --cw-comp-gap: calc(14px * var(--cw-scale));
      }

      .grid.circular {
        grid-template-columns: repeat(var(--cw-comp-columns), 1fr);
        place-items: center;
      }

      .grid.inline {
        grid-template-columns: 1fr;
        gap: 0;
      }

      .cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(6px * var(--cw-scale));
        cursor: pointer;
        min-width: 0;
      }

      .cell:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
        border-radius: var(--cw-radius-inner);
      }

      .ring {
        position: relative;
        width: var(--cw-comp-ring);
        height: var(--cw-comp-ring);
        display: grid;
        place-items: center;
      }

      .gauge {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .track {
        fill: none;
        stroke: var(--cw-track);
      }

      /* The tint, and it does not move with the reading: see tint.ts. */
      .arc {
        fill: none;
        stroke: var(--cw-comp-tint);
        stroke-linecap: round;
      }

      .reading {
        font: 600 calc(17px * var(--cw-scale)) / calc(22px * var(--cw-scale)) var(--cw-font);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
        color: var(--cw-label);
        z-index: 1;
      }

      .caption {
        font: var(--cw-text-caption-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glyph {
        color: var(--cw-comp-tint);
        --mdc-icon-size: calc(24px * var(--cw-scale));
      }

      /* Inline: one strip, hairline-separated when they stack. */
      .cell.inline {
        flex-direction: row;
        align-items: center;
        gap: calc(10px * var(--cw-scale));
        /* Must match layout.ts's INLINE_ROW. */
        min-height: calc(44px * var(--cw-scale));
      }

      .cell.inline + .cell.inline {
        border-top: 1px solid var(--cw-separator);
      }

      .cell.inline .name {
        font: 600 calc(15px * var(--cw-scale)) / calc(20px * var(--cw-scale)) var(--cw-font);
        color: var(--cw-label);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell.inline .reading {
        margin-left: auto;
        color: var(--cw-label-secondary);
        font-weight: 400;
      }

      /* Nothing to say, said quietly — the battery card's rule for a dead sensor. */
      .cell.unknown .glyph {
        opacity: 0.4;
      }

      .cell.unknown .reading {
        color: var(--cw-label-secondary);
      }

      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
      }
    `,
  ]
```

- [ ] **Step 6: Register the card**

At the bottom of the file:

```ts
registerCard(COMPLICATION_CARD_TAG, CupertinoComplicationCard, {
  name: 'Cupertino Complication',
  description: 'Any entity, drawn as a watch complication: a ring, a block, or a single line.',
})

export { CupertinoComplicationCard }
```

- [ ] **Step 7: Add it to the bundle**

In `src/index.ts`, after the battery import:

```ts
import './cards/complication/complication-card'
```

and to the exports:

```ts
export { COMPLICATION_CARD_TAG } from './cards/complication/complication-card'
```

- [ ] **Step 8: Verify it builds and looks right**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS.

Then run `pnpm dev` and check the card by hand once Task 9 has put it in the showcase — or temporarily add it to a dashboard via `pnpm verify`. Confirm: a single battery sensor draws a green ring with its percentage; a temperature sensor draws an icon and a value with no ring; four sensors tile and lose their captions.

- [ ] **Step 9: Commit**

```bash
pnpm format
git add src/cards/complication/complication-card.ts src/index.ts
git commit -m "feat: the complication card, circular and inline"
```

---

### Task 7: The three rectangular faces

**Files:**

- Modify: `src/cards/complication/complication-card.ts`

**Interfaces:**

- Consumes: everything Task 6 established.
- Produces: no new exports; replaces the `_renderRectangular` stub.

- [ ] **Step 1: Replace the `_renderRectangular` stub**

```ts
  /**
   * The three rectangular faces, which differ only in how much colour they wear: a tint on
   * the caption and the bar, a tinted header strip, or the tint as the whole card. One
   * markup shape, three stylesheets, because they say the same things in the same order.
   */
  private _renderRectangular(style: ComplicationStyle, item: Complication): TemplateResult {
    const header = style === 'rectangular-header'

    return html`
      <div
        class="cell block ${style} ${item.unavailable ? 'unknown' : ''}"
        style=${`--cw-comp-tint:${tintVar(item.tint)}`}
        role="button"
        tabindex="0"
        aria-label=${`${item.name}, ${item.value}`}
        @click=${() => this._openMoreInfo(item.id)}
        @keydown=${this._activate(item.id)}
      >
        <div class="head">
          <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
          <span class="name">${item.name}</span>
        </div>
        <div class="body">
          <span class="reading">${item.value}</span>
          ${item.supporting ? html`<span class="support">${item.supporting}</span>` : nothing}
          ${
            item.fraction !== null && !header
              ? html`<div class="bar"><i style=${`width:${item.fraction * 100}%`}></i></div>`
              : nothing
          }
        </div>
      </div>
    `
  }
```

- [ ] **Step 2: Add the shared block styles**

Append to the `css` block:

```css
.grid.rectangular,
.grid.rectangular-header,
.grid.rectangular-bleed {
  grid-template-columns: 1fr;
}

.cell.block {
  flex-direction: column;
  align-items: stretch;
  gap: calc(4px * var(--cw-scale));
  /* Must match layout.ts's RECT_BLOCK. */
  min-height: calc(104px * var(--cw-scale));
  border-radius: var(--cw-radius-inner);
  overflow: hidden;
}

.cell.block .head {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--cw-scale));
  min-width: 0;
}

.cell.block .name {
  font: var(--cw-text-caption-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--cw-comp-tint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell.block .body {
  display: flex;
  flex-direction: column;
  gap: calc(3px * var(--cw-scale));
  flex: 1;
}

.cell.block .reading {
  font: var(--cw-text-title-1);
  letter-spacing: -0.02em;
  color: var(--cw-label);
}

.cell.block .support {
  font: var(--cw-text-subheadline);
  color: var(--cw-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell.block .bar {
  margin-top: auto;
  height: calc(5px * var(--cw-scale));
  border-radius: var(--cw-radius-pill);
  background: var(--cw-track);
  overflow: hidden;
}

.cell.block .bar i {
  display: block;
  height: 100%;
  background: var(--cw-comp-tint);
}

.cell.block .glyph {
  color: var(--cw-comp-tint);
  --mdc-icon-size: calc(14px * var(--cw-scale));
}
```

- [ ] **Step 3: Add the header treatment**

```css
/* The Notes treatment: the strip carries the identity, the body gets the story. */
.cell.rectangular-header {
  gap: 0;
  background: var(--cw-fill);
}

.cell.rectangular-header .head {
  background: var(--cw-comp-tint);
  padding: calc(8px * var(--cw-scale)) calc(12px * var(--cw-scale));
}

.cell.rectangular-header .head .name,
.cell.rectangular-header .head .glyph {
  color: #fff;
  font-size: calc(14px * var(--cw-scale));
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
}

.cell.rectangular-header .head .glyph {
  --mdc-icon-size: calc(16px * var(--cw-scale));
}

.cell.rectangular-header .body {
  padding: calc(10px * var(--cw-scale)) calc(12px * var(--cw-scale));
}

.cell.rectangular-header .reading {
  font: var(--cw-text-title-3);
}
```

- [ ] **Step 4: Add the full-bleed treatment**

```css
/* The Weather treatment: the tint IS the card. White content in both themes, because
         the surface under it is the tint rather than the theme's, so the theme's label
         colour would be unreadable half the time. The overlay is what keeps the gradient
         from glowing in dark mode. */
.cell.rectangular-bleed {
  background-image: linear-gradient(150deg, var(--cw-comp-tint), var(--cw-comp-tint));
  background-color: var(--cw-comp-tint);
  padding: calc(14px * var(--cw-scale));
  position: relative;
}

.cell.rectangular-bleed::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(150deg, rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.22));
  pointer-events: none;
}

:host([dark]) .cell.rectangular-bleed::after {
  background: linear-gradient(150deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.05));
}

.cell.rectangular-bleed .name,
.cell.rectangular-bleed .reading,
.cell.rectangular-bleed .support,
.cell.rectangular-bleed .glyph {
  color: #fff;
  position: relative;
  z-index: 1;
}

.cell.rectangular-bleed .name {
  text-transform: none;
  letter-spacing: 0;
  font: 600 calc(14px * var(--cw-scale)) / calc(18px * var(--cw-scale)) var(--cw-font);
}

.cell.rectangular-bleed .reading {
  font: 500 calc(38px * var(--cw-scale)) / calc(40px * var(--cw-scale)) var(--cw-font);
}

.cell.rectangular-bleed .support {
  color: rgba(255, 255, 255, 0.92);
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS.

By eye, in `pnpm dev` after Task 9, or on a real dashboard: the header strip's white text is legible on every tint including yellow — if it is not, add a `--cw-comp-on-tint` token defaulting to `#fff` and set it to `var(--cw-label)` for `yellow`. Note the finding in `docs/complication-widget-rules.md`.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/cards/complication/complication-card.ts
git commit -m "feat: the three rectangular complication faces"
```

---

### Task 8: The visual editor

**Files:**

- Create: `src/cards/complication/complication-card-editor.ts`
- Modify: `src/cards/complication/complication-card.ts` (import the real tag)

**Interfaces:**

- Consumes: `CupertinoCardEditor` (`core/card-editor`); `defineElement` (`core/register`); `HaFormSchema` (`core/types/ha`); `COMPLICATION_STYLES`, `STYLE_LABELS`, `DEFAULT_STYLE` (Task 2); `TINTS` (Task 2); `ComplicationCardConfig` (Task 6).
- Produces: `COMPLICATION_EDITOR_TAG = 'cupertino-widgets-complication-editor'` from `complication-card-editor.ts`.

- [ ] **Step 1: Write the editor**

```ts
import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { ComplicationCardConfig } from './complication-card'
import { COMPLICATION_STYLES, DEFAULT_STYLE, STYLE_LABELS } from './style'
import { TINTS } from './tint'

export const COMPLICATION_EDITOR_TAG = 'cupertino-widgets-complication-editor'

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * Five rows, three of which say "Automatic".
 *
 * That ratio is the card's whole premise: everything derivable is derived, and the fields
 * exist for the cases where the derivation cannot know what somebody meant. A card with
 * only `entities` filled in is already a working card.
 */
const FIELDS: readonly HaFormSchema[] = [
  { name: 'entities', selector: { entity: { multiple: true, reorder: true } }, required: true },
  {
    name: 'style',
    selector: {
      select: {
        mode: 'dropdown',
        options: COMPLICATION_STYLES.map(style => ({ value: style, label: STYLE_LABELS[style] })),
      },
    },
  },
  { name: 'min', selector: { number: { mode: 'box' } } },
  { name: 'max', selector: { number: { mode: 'box' } } },
  {
    name: 'color',
    selector: {
      select: {
        mode: 'dropdown',
        options: TINTS.map(tint => ({ value: tint, label: capitalise(tint) })),
      },
    },
  },
]

const LABELS: Record<string, string> = {
  entities: 'Entities',
  style: 'Style',
  min: 'Minimum',
  max: 'Maximum',
  color: 'Colour',
}

const HELPERS: Record<string, string> = {
  entities: 'One or several. The card lays out however many you give it.',
  min: 'Leave blank and the range comes from the entity. Fill both in to gauge something with no natural range, like room temperature.',
  max: 'Leave blank and the range comes from the entity. Fill both in to gauge something with no natural range, like room temperature.',
  color: 'From what the entity measures. Set one only to overrule it.',
}

class CupertinoComplicationCardEditor extends CupertinoCardEditor<ComplicationCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return FIELDS
  }

  /**
   * A style shown rather than an empty dropdown: an unset control reads as broken, not as a
   * default. The first edit writes it through, which is what HA's own editors do.
   */
  protected override defaults(): Partial<ComplicationCardConfig> {
    return { style: DEFAULT_STYLE }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }
}

defineElement(COMPLICATION_EDITOR_TAG, CupertinoComplicationCardEditor)

export { CupertinoComplicationCardEditor }
```

- [ ] **Step 2: Wire it into the card**

In `complication-card.ts`, add the import (for the side effect as well as the constant, exactly as the battery card does):

```ts
import { COMPLICATION_EDITOR_TAG } from './complication-card-editor'
```

and replace the temporary `getConfigElement` body with:

```ts
  /**
   * A card with no editor loses its **Visibility** and **Layout** tabs too — the tab strip
   * is rendered only inside the GUI branch. See the contract on `CupertinoCardEditor`.
   */
  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(COMPLICATION_EDITOR_TAG) as LovelaceCardEditor
  }
```

adding `LovelaceCardEditor` to the type import from `core/types/ha`.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS.

- [ ] **Step 4: Verify the editor in a real Home Assistant**

Run: `pnpm verify` (builds, bumps the resource, brings the dev HA up), then add the card to a dashboard and open its editor.

Confirm: all five rows render; the style dropdown lists five options and changing it redraws the card live; leaving `min`/`max` empty writes no keys into the YAML tab; emptying the entity picker removes `entities` rather than writing `entities: []`; the **Layout** tab's sliders will not go below the floors, and the floors grow when you add entities.

That last one is the plan's single riskiest assumption (spec §10.2 — whether HA re-queries `getGridOptions()` after a config change). If the sliders do **not** update until the card is re-added, record the finding in `docs/ha-api-notes.md` and open a follow-up; the floors are still correct on load, which is the case that matters for a saved dashboard.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/complication/complication-card-editor.ts src/cards/complication/complication-card.ts docs/ha-api-notes.md
git commit -m "feat: visual editor for the complication card"
```

---

### Task 9: Showcase and docs

The showcase is how anybody evaluates this card without installing it, and `dev/site/catalog.ts` says plainly that a card not in it does not exist as far as the site is concerned.

**Files:**

- Create: `dev/complication-entities.ts`
- Create: `docs/complication-widget-rules.md`
- Modify: `dev/site/catalog.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: `COMPLICATION_CARD_TAG` (Task 6); `COMPLICATION_STYLES`, `STYLE_LABELS` (Task 2).
- Produces: `ENTITY_SETS`, `DEFAULT_ENTITY_SET`, `entitySet(name)` from `dev/complication-entities.ts`.

- [ ] **Step 1: Write the fixtures**

Create `dev/complication-entities.ts` modelled on `dev/battery-devices.ts` (open it first — it holds both the mock entities and the named sets). Provide sets chosen to hit each branch:

```ts
/**
 * The mock installation the complication card is shown against, and the named sets the
 * showcase offers. Chosen for the branch each one lands on rather than for realism.
 */
export const ENTITY_SETS = {
  gauge: ['sensor.demo_phone_battery'],
  'no-range': ['sensor.demo_lounge_temperature'],
  four: [
    'sensor.demo_lounge_temperature',
    'sensor.demo_lounge_humidity',
    'sensor.demo_water_tank',
    'sensor.demo_phone_battery',
  ],
  six: [
    'sensor.demo_lounge_temperature',
    'sensor.demo_lounge_humidity',
    'sensor.demo_water_tank',
    'sensor.demo_phone_battery',
    'sensor.demo_outside_temperature',
    'sensor.demo_pressure',
  ],
  word: ['sensor.demo_washing_machine'],
  'long-name': ['sensor.demo_extremely_long_entity_name'],
  unavailable: ['sensor.demo_offline'],
} as const
```

Open `dev/battery-devices.ts` first: it holds both the mock `HassEntity` objects _and_ the named sets over them, and the new file must do the same rather than splitting them. Export the states so `dev/mock-hass.ts` can merge them into its `states` map exactly as it already merges the battery ones — follow that wiring rather than inventing a second route.

The states to include, one per branch the card can take:

| Entity                                   | State         | Attributes                                                   | Branch it exercises                  |
| ---------------------------------------- | ------------- | ------------------------------------------------------------ | ------------------------------------ |
| `sensor.demo_phone_battery`              | `72`          | `device_class: battery`, `unit_of_measurement: '%'`          | a derived range, green               |
| `sensor.demo_lounge_temperature`         | `21.4`        | `device_class: temperature`, `unit_of_measurement: '°C'`     | no range → the icon face             |
| `sensor.demo_lounge_humidity`            | `46`          | `device_class: humidity`, `unit_of_measurement: '%'`         | a second tint in one card            |
| `sensor.demo_water_tank`                 | `21`          | `unit_of_measurement: '%'`                                   | a range from the unit alone          |
| `sensor.demo_outside_temperature`        | `24.0`        | `device_class: temperature`                                  | a sixth cell, for wrapping           |
| `sensor.demo_pressure`                   | `1013`        | `device_class: pressure`, `unit_of_measurement: 'hPa'`       | teal, and a four-digit reading       |
| `number.demo_target`                     | `5`           | `min: 1`, `max: 10`                                          | a range the entity asserts itself    |
| `sensor.demo_washing_machine`            | `Running`     | `icon: 'mdi:washing-machine'`                                | a state that is a word, not a number |
| `sensor.demo_extremely_long_entity_name` | `12`          | `friendly_name: 'Upstairs landing cupboard humidity sensor'` | truncation                           |
| `sensor.demo_offline`                    | `unavailable` | `friendly_name: 'Offline sensor'`                            | the dash and the dimmed face         |

- [ ] **Step 2: Add the catalog entry**

In `dev/site/catalog.ts`, import the tag and the fixtures, and add an entry beside the two existing ones. Controls, following the `ControlGroup` split the file documents — a control belongs in `card` when it survives installation:

| Control  | Group  | Kind                                                             |
| -------- | ------ | ---------------------------------------------------------------- |
| Style    | `card` | `select` over `COMPLICATION_STYLES` with `STYLE_LABELS`          |
| Entities | `card` | `select` over the names of `ENTITY_SETS`                         |
| Scale    | `card` | the shared `SCALE_*` range, exactly as the other two cards do it |

`toConfig` must emit `{ type, entities, style, scale }` and nothing else, so the Config tab prints a config somebody can genuinely paste. `toFixture` stays empty: like the battery card, this one reads `hass.states` as it would on a dashboard, so the mock installation is the whole of the harness.

Use `mdiGaugeLow` (or another `@mdi/js` export that exists — check before importing) as the sidebar icon.

- [ ] **Step 3: Check the showcase by eye**

Run: `pnpm dev`

Walk every style against every entity set at both footprints and drag the resizable box across the layout threshold. Confirm:

- circular loses its captions as cells narrow, and never draws a ring below 40 or above 96 design units;
- the `no-range` set draws icon-and-value with no ring;
- `unavailable` draws a dash and dims;
- `long-name` truncates with an ellipsis rather than wrapping or overflowing;
- the full-bleed style is legible in both themes (toggle the site's theme switch);
- the YAML in the Config pane is a config that would work if pasted.

Fix what this turns up before moving on. This step is the one that catches what unit tests cannot.

- [ ] **Step 4: Write the card's rules document**

Create `docs/complication-widget-rules.md`, in the register of `docs/battery-widget-rules.md`. It must record, with the reasoning rather than just the rule:

1. why the colour is identity and never a reading, and that this extends `ring.ts`'s argument;
2. when the ring disappears, and why that is the same style rather than a sixth one;
3. the range derivation table, and why `climate` is deliberately absent from it;
4. why there is no overflow state — the floors, and what they cost;
5. why the card does not scroll;
6. the advice that `rectangular-bleed` is a once-per-view style, and why;
7. what the supporting line will and will not say.

- [ ] **Step 5: Add a README section**

Add a section for the card between **The calendar** and **The batteries**, in the README's existing voice — prose about what it decides and why, not a config reference. Add it to the link list at the top, and to the "Status: early. Two cards." line, which becomes three.

Screenshots come from `pnpm shots`; add the card to `dev/shots.ts` following the two entries already there, run it, and reference the new images from the README table.

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm format:check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: showcase, screenshots and docs for the complication card"
```

---

## Verification checklist

Before calling this done, all of these must be true and observed rather than assumed:

- [ ] `pnpm test` passes, with new tests for `tint`, `range`, `model` and `layout`
- [ ] `pnpm typecheck` clean
- [ ] `pnpm build` clean
- [ ] `pnpm format:check` clean
- [ ] The battery card still works — it shares `core/ring.ts` now
- [ ] All five styles render correctly in `pnpm dev` at both footprints, in both themes
- [ ] The editor's five rows work in a real Home Assistant (`pnpm verify`)
- [ ] Tapping a complication opens that entity's more-info dialog, not another's
- [ ] The Layout tab will not drag the card below its floors
- [ ] `README.md` and `docs/complication-widget-rules.md` describe what actually shipped
