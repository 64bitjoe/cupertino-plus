# Lock-screen chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fifth card, `cupertino-plus-chips`, drawing a wrapping row of monochrome pills — one per entity, each with a configurable tap action — plus the four shared modules that come out of `complication/` to serve it.

**Architecture:** Four extractions into `core/` first (each one leaves the complication card passing its existing tests), then the chips card built on top of them in the library's usual order: model, layout, element, editor, showcase. The card owns no colour, no gauge and no size modes; CSS flex-wrap does the wrapping and `layout.ts` prices only the floors that keep the box big enough.

**Tech Stack:** TypeScript 7, Lit 3, `@mdi/js`, vitest (node environment), Playwright for screenshots, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-16-lock-screen-chips-design.md`](../specs/2026-08-16-lock-screen-chips-design.md)

## Global Constraints

- **Design units everywhere.** Every length in a layout module is pixels at `scale: 1`. The measured box is divided by `scaleFactor` once, at the top of the function. CSS multiplies by `var(--cw-scale)`.
- **Only `--cw-*` tokens.** No raw colours in any stylesheet. `theme/tokens.ts` is the whole palette.
- **No scrolling, ever, and no hidden content.** A box too small produces a taller card and a higher floor, never a dropped chip. (Complication rules §5, §6.)
- **An unreadable entity is drawn, not dropped** — dashed and dimmed.
- **No card has a size field.** The Layout tab owns the footprint; `getGridOptions()` sets the floor.
- **`exactOptionalPropertyTypes` is on.** Never assign `undefined` to an optional property — build objects by conditional spread.
- **Backticks inside a `css` tagged template terminate it early.** House-style prose comments in stylesheets must not contain them.
- **Tests run in `environment: 'node'`.** No DOM. Card elements are verified by screenshot, not by test.
- **Commit after every task**, and run `pnpm test && pnpm typecheck && pnpm format:check` before each commit.
- **Node 22** provides `EventTarget` and `CustomEvent` as globals, which is what makes `core/actions.ts` testable.

---

## File Structure

**Created**

| File                                   | Responsibility                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/core/entity-view.ts`              | Reading one entity the same way for every card: rows, name, icon, formatted value, unavailability |
| `src/core/entity-view.test.ts`         | Its tests, including the unit-spacing fix                                                         |
| `src/core/floors.ts`                   | Grid-floor plumbing: `Floors`, `columnsFor`, `rowsFor`, `withFloors`                              |
| `src/core/floors.test.ts`              | Its tests, moved from `complication/layout.test.ts`                                               |
| `src/core/actions.ts`                  | `ActionConfig` and `runAction` — the five tap actions                                             |
| `src/core/actions.test.ts`             | Dispatch tests against a stub `hass`                                                              |
| `src/core/entities-form.ts`            | `mergeEntities`, generic over row type                                                            |
| `src/core/entities-form.test.ts`       | Moved from `complication/entities-form.test.ts`                                                   |
| `src/cards/chips/model.ts`             | Config + `hass` → `ChipView[]`                                                                    |
| `src/cards/chips/model.test.ts`        |                                                                                                   |
| `src/cards/chips/layout.ts`            | The height band and the floors                                                                    |
| `src/cards/chips/layout.test.ts`       |                                                                                                   |
| `src/cards/chips/chips-card.ts`        | The element                                                                                       |
| `src/cards/chips/chips-card-editor.ts` | The visual editor                                                                                 |
| `dev/chip-fixtures.ts`                 | Showcase entities                                                                                 |
| `docs/chips-widget-rules.md`           | The rules document                                                                                |

**Modified**

| File                                                      | Change                                             |
| --------------------------------------------------------- | -------------------------------------------------- |
| `src/cards/complication/model.ts`                         | Imports the moved helpers instead of defining them |
| `src/cards/complication/layout.ts`                        | Imports floors plumbing from `core/floors.ts`      |
| `src/cards/complication/entities-form.ts`                 | Deleted; its one export moves to core              |
| `src/cards/complication/complication-card-editor.ts`      | Imports `mergeEntities` from core                  |
| `src/cards/complication/complication-card.ts`             | Import path for `withFloors`                       |
| `src/index.ts`                                            | Registers the chips card                           |
| `dev/mock-hass.ts`, `dev/shots.ts`, `dev/site/catalog.ts` | Showcase wiring                                    |
| `README.md`, `docs/development.md`                        | Documentation                                      |

---

### Task 1: `core/entity-view.ts` — the shared entity reader

Everything the complication card knows about turning one entity into something drawable, minus the parts that are actually about complications (ranges, tints, the supporting line). Two cards need it now; the fourth review finding on unit spacing gets fixed here rather than inherited twice.

**Files:**

- Create: `src/core/entity-view.ts`
- Create: `src/core/entity-view.test.ts`
- Modify: `src/cards/complication/model.ts` (delete the moved helpers, import them)
- Modify: `src/cards/complication/entities-form.ts:22` (import `entityRows` from core)

**Interfaces:**

- Consumes: `HassEntity`, `HomeAssistant` from `core/types/ha`.
- Produces: `EntityRow`, `entityRows<T>`, `watchedIds`, `numberOf`, `iconFor`, `nameFor`, `formatValue`, `isUnavailable`, `UNAVAILABLE_STATES`, `VALUE_DASH`.

- [ ] **Step 1: Write the failing test for the unit fix and the generic row reader**

Create `src/core/entity-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { entityRows, formatValue, iconFor, nameFor, numberOf } from './entity-view'
import type { HassEntity, HomeAssistant } from './types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    context: { id: '' },
    ...over,
  }) as HassEntity

const hass = (over: Partial<HomeAssistant> = {}): HomeAssistant =>
  ({
    states: {},
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
    ...over,
  }) as unknown as HomeAssistant

describe('formatValue', () => {
  it('sets a degree unit tight against the numeral, like a percentage', () => {
    // The bug this fixes: `°C` took the generic space branch, so a thermostat read
    // `21.4 °C` where the frontend writes `21.4°C`.
    const read = entity({
      entity_id: 'sensor.hall',
      state: '21.4',
      attributes: { unit_of_measurement: '°C' },
    })
    expect(formatValue(hass(), read)).toBe('21.4°C')
  })

  it('still sets an ordinary unit off with a space', () => {
    const read = entity({
      entity_id: 'sensor.draw',
      state: '12',
      attributes: { unit_of_measurement: 'W' },
    })
    expect(formatValue(hass(), read)).toBe('12 W')
  })

  it('keeps a percentage tight', () => {
    const read = entity({
      entity_id: 'sensor.batt',
      state: '41',
      attributes: { unit_of_measurement: '%' },
    })
    expect(formatValue(hass(), read)).toBe('41%')
  })

  it('reads a non-numeric state as a sentence, underscores and all', () => {
    const read = entity({ entity_id: 'person.joe', state: 'not_home' })
    expect(formatValue(hass(), read)).toBe('Not home')
  })
})

describe('entityRows', () => {
  it('reads a bare scalar as a one-row list', () => {
    expect(entityRows('sensor.a')).toEqual([{ entity: 'sensor.a' }])
  })

  it('skips a row with no usable entity rather than failing the whole card', () => {
    expect(entityRows(['sensor.a', { name: 'no id' }, null, 7, { entity: 'sensor.b' }])).toEqual([
      { entity: 'sensor.a' },
      { entity: 'sensor.b' },
    ])
  })
})

describe('nameFor and iconFor', () => {
  it('names an entity by its friendly name, falling back to its id', () => {
    expect(nameFor(entity({ entity_id: 'sensor.a', attributes: { friendly_name: 'Hall' } }))).toBe(
      'Hall',
    )
    expect(nameFor(entity({ entity_id: 'sensor.a' }))).toBe('sensor.a')
  })

  it('prefers the entity own icon, then device class, then domain, then the fallback', () => {
    expect(iconFor(entity({ entity_id: 'sensor.a', attributes: { icon: 'mdi:custom' } }))).toBe(
      'mdi:custom',
    )
    expect(
      iconFor(entity({ entity_id: 'sensor.a', attributes: { device_class: 'humidity' } })),
    ).toBe('mdi:water-percent')
    expect(iconFor(entity({ entity_id: 'lock.front' }))).toBe('mdi:lock')
    expect(iconFor(entity({ entity_id: 'unheard_of.thing' }))).toBe('mdi:eye')
  })
})

describe('numberOf', () => {
  it('reads a finite number and rejects everything else, blank included', () => {
    expect(numberOf('21.4')).toBe(21.4)
    expect(numberOf('')).toBeNull()
    expect(numberOf('  ')).toBeNull()
    expect(numberOf('unavailable')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm exec vitest run src/core/entity-view.test.ts`
Expected: FAIL — `Failed to resolve import "./entity-view"`.

- [ ] **Step 3: Create `core/entity-view.ts` by moving the helpers**

Move these out of `src/cards/complication/model.ts` **verbatim, comments included**: `UNAVAILABLE` (renamed `UNAVAILABLE_STATES` and exported), `VALUE_DASH`, `entityConfigs` (renamed `entityRows`, made generic), `watchedIds`, `numberOf`, `ICON_BY_DEVICE_CLASS`, `ICON_BY_DOMAIN`, `iconFor`, `formatValue`. Their long comments are the reasoning for the decisions and must travel with them.

The header, and the three things that change rather than move:

```ts
/**
 * Reading one Home Assistant entity the way every card in this library reads one.
 *
 * These started life inside `complication/model.ts` and moved here the moment a second card
 * needed them, which is the same test §10 of the family spec sets and the same one that moved
 * `ring.ts`. What stayed behind is what is genuinely about complications: ranges, tints, and
 * the supporting line. What came here is the part any card asking "what does this entity look
 * like" needs — and it is worth one module rather than two copies, because the copies would
 * drift on exactly the details nobody re-derives: which icon a `device_class` deserves, and
 * whether a unit takes a space.
 */

import type { HassEntity, HomeAssistant } from './types/ha'

/**
 * The least a configured row can be: an entity id, and the two overrides every card offers.
 * Cards extend it with their own (`ComplicationEntityConfig` adds a range and a colour;
 * `ChipConfig` adds a content mode and a tap action), which is why `entityRows` is generic.
 */
export interface EntityRow {
  entity: string
  name?: string
  icon?: string
}

export const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown'])

/** Not localised, like the rest of the library's own marks. */
export const VALUE_DASH = '—'

/** Whether an entity is present but not currently reporting. */
export const isUnavailable = (entity: HassEntity): boolean => UNAVAILABLE_STATES.has(entity.state)

/**
 * The rows the config asked for, in the order it asked for them, forgiving of every shape a
 * hand-written config can take. (Moved from `complication/model.ts`'s `entityConfigs`; see
 * that function's original reasoning, preserved below.)
 *
 * A card config is not typechecked on its way in, so `entities: sensor.phone` — a bare scalar
 * where a list was meant — is what somebody writes first, and it is worth reading as
 * `['sensor.phone']` rather than rejecting. Equally, a row with no usable `entity` is worth
 * skipping rather than crashing the whole card over one bad line.
 *
 * Generic in the row type, and unchecked beyond `entity`: the cast is the same trust the
 * original made, and each card's own reader is what decides whether the rest of a row means
 * anything.
 */
export const entityRows = <T extends EntityRow = EntityRow>(entities: unknown): T[] => {
  if (!entities) return []
  const list = Array.isArray(entities) ? entities : [entities]

  return list.flatMap(row => {
    if (typeof row === 'string') return [{ entity: row } as T]
    if (row && typeof row === 'object' && typeof (row as EntityRow).entity === 'string') {
      return [row as T]
    }
    return []
  })
}

/** Every entity id a card's rendering depends on: what `watchedEntities()` answers with. */
export const watchedIds = (entities: unknown): string[] =>
  entityRows(entities).map(row => row.entity)

/** The name to draw and to announce: the entity's own, falling back to its id. */
export const nameFor = (entity: HassEntity): string => {
  const friendly = entity.attributes.friendly_name
  return typeof friendly === 'string' && friendly !== '' ? friendly : entity.entity_id
}
```

Then `numberOf`, `ICON_BY_DEVICE_CLASS`, `ICON_BY_DOMAIN` and `iconFor` exactly as they were, with `numberOf` and `iconFor` gaining `export`.

`formatValue` moves with one change — the unit test above. Replace this line:

```ts
return unit === '%' ? `${formatted}${unit}` : `${formatted} ${unit}`
```

with:

```ts
return TIGHT_UNITS.test(unit) ? `${formatted}${unit}` : `${formatted} ${unit}`
```

and add above the function:

```ts
/**
 * The units that sit tight against the numeral rather than a space away from it.
 *
 * The frontend's own rule, and it is about the glyph rather than about the dimension: `%` and
 * the degree sign are read as part of the number, where `W` or `hPa` are a separate word. The
 * original of this function tested `unit === '%'` alone, so every temperature in the library
 * rendered as `21.4 °C` — a review finding deferred on the complication card, fixed here
 * rather than copied into a second one. Anchored at the start because a unit is `°C`, `°F`
 * or a bare `°`, never something ending in one.
 */
const TIGHT_UNITS = /^[%°]/
```

- [ ] **Step 4: Point the complication card at the moved code**

In `src/cards/complication/model.ts`: delete the moved declarations, and add the import. Keep `entityConfigs` as a typed alias so the card's own call sites and their meaning survive:

```ts
import {
  entityRows,
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  numberOf,
  VALUE_DASH,
  watchedIds,
} from '../../core/entity-view'

export { watchedIds }

/**
 * This card's rows, typed. `entityRows` is the shared reader; the type argument is what says
 * a complication row may also carry `min`, `max` and `color`.
 */
export const entityConfigs = (entities: unknown): ComplicationEntityConfig[] =>
  entityRows<ComplicationEntityConfig>(entities)
```

Replace the card's own `UNAVAILABLE.has(entity.state)` calls with `isUnavailable(entity)`, and its `entity.attributes.friendly_name ?? entity.entity_id` name resolution with `nameFor(entity)`.

In `src/cards/complication/entities-form.ts`, change the import to `import { entityRows } from '../../core/entity-view'` and call `entityRows<ComplicationEntityConfig>(prior)`.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS — the new file's tests plus every existing complication test. **The complication card's tests are the net under this extraction; if any of them fail, the move is wrong, not the test.**

- [ ] **Step 6: Typecheck, format, commit**

```bash
pnpm typecheck && pnpm format:check
git add src/core/entity-view.ts src/core/entity-view.test.ts src/cards/complication/
git commit -m "refactor: one entity reader for every card, and a unit that fits tight"
```

---

### Task 2: `core/floors.ts` — the grid-floor plumbing

`getGridOptions()` arithmetic that is about Home Assistant's grid rather than about any one card. Chips need the identical functions, and unlike `RING_MIN` (a statement of taste the complication card deliberately keeps to itself) this is plumbing.

**Files:**

- Create: `src/core/floors.ts`
- Create: `src/core/floors.test.ts`
- Modify: `src/cards/complication/layout.ts` (delete the moved helpers, import them)
- Modify: `src/cards/complication/complication-card.ts` (import `withFloors` from core)
- Modify: `src/cards/complication/layout.test.ts` (move the floors-plumbing cases out)

**Interfaces:**

- Consumes: `LovelaceGridOptions` from `core/types/ha`; `rowsToPx` from `core/size.ts`.
- Produces: `Floors`, `ASSUMED_SECTION_WIDTH`, `gridColumnsToPx`, `columnsFor`, `rowsFor`, `withFloors`.

- [ ] **Step 1: Write the failing test**

Create `src/core/floors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { columnsFor, rowsFor, withFloors } from './floors'
import { rowsToPx } from './size'

describe('columnsFor', () => {
  it('floors at the library minimum of four and caps at twelve', () => {
    expect(columnsFor(1)).toBe(4)
    expect(columnsFor(10_000)).toBe(12)
  })
})

describe('rowsFor', () => {
  it('always returns enough rows to cover the height asked for', () => {
    // The postcondition the unbounded search exists to guarantee, checked well past the
    // twelve rows the original hardcoded.
    for (const px of [1, 100, 248, 500, 1200, 4000]) {
      expect(rowsToPx(rowsFor(px))).toBeGreaterThanOrEqual(px)
    }
  })
})

describe('withFloors', () => {
  it('raises a numeric default up to the floor', () => {
    expect(withFloors({ columns: 6, rows: 4 }, { min_columns: 8, min_rows: 6 })).toEqual({
      columns: 8,
      rows: 6,
      min_columns: 8,
      min_rows: 6,
    })
  })

  it('never lowers a default that is already past the floor', () => {
    expect(withFloors({ columns: 12, rows: 9 }, { min_columns: 8, min_rows: 6 })).toMatchObject({
      columns: 12,
      rows: 9,
    })
  })

  it('leaves the literals alone, because Number(full) is NaN', () => {
    expect(
      withFloors({ columns: 'full', rows: 'auto' }, { min_columns: 8, min_rows: 6 }),
    ).toMatchObject({
      columns: 'full',
      rows: 'auto',
    })
  })

  it('falls back to the floor when there is no default at all', () => {
    expect(withFloors({}, { min_columns: 8, min_rows: 6 })).toMatchObject({ columns: 8, rows: 6 })
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm exec vitest run src/core/floors.test.ts`
Expected: FAIL — `Failed to resolve import "./floors"`.

- [ ] **Step 3: Create `core/floors.ts`**

Move `Floors`, `ASSUMED_SECTION_WIDTH`, `GRID_COLUMNS`, `GRID_GAP`, `gridColumnsToPx`, `columnsFor`, `rowsFor` and `withFloors` out of `src/cards/complication/layout.ts` **with their comments intact** — `rowsFor`'s comment in particular records a real bug and must not be lost. Export `gridColumnsToPx`, `columnsFor`, `rowsFor` and `withFloors`. Add the header:

```ts
/**
 * The arithmetic of Home Assistant's sections grid, and the floors a card asks it for.
 *
 * Split out of `complication/layout.ts` when the chips card needed the same functions. This is
 * plumbing rather than taste — how many whole grid columns cover a width is a fact about the
 * grid, not a judgement about a widget — which is the line the complication card's own
 * `RING_MIN` comment draws when it declines to share a number that *is* a judgement.
 *
 * `GRID_COLUMNS` and `GRID_GAP` are re-declared from Home Assistant's own geometry rather than
 * imported from `core/size.ts`, which does not export them; a review finding on the
 * complication card flagged that drift risk, and one copy here is the answer to it.
 */
```

Also fixes that deferred finding: with this module in place there is exactly one copy of the grid constants outside `size.ts`, not one per card.

- [ ] **Step 4: Point the complication card at it**

In `src/cards/complication/layout.ts`, delete the moved code and add:

```ts
import { columnsFor, rowsFor, type Floors } from '../../core/floors'

export type { Floors }
export { withFloors } from '../../core/floors'
```

The re-exports keep `complication-card.ts`'s existing imports working unchanged; verify with typecheck rather than editing the card if it compiles.

Move the `withFloors` and `rowsFor` cases out of `complication/layout.test.ts` into `core/floors.test.ts` (do not leave duplicates), keeping every case that is about this card's own floors (`floorsFor`) where it is.

- [ ] **Step 5: Run the whole suite, typecheck, format, commit**

```bash
pnpm test && pnpm typecheck && pnpm format:check
git add src/core/floors.ts src/core/floors.test.ts src/cards/complication/
git commit -m "refactor: the grid-floor arithmetic belongs to the grid, not to one card"
```

---

### Task 3: `core/actions.ts` — the five tap actions

New code, not a move. A dispatch table that takes its collaborators as arguments, which is what makes it testable in a node environment.

**Files:**

- Create: `src/core/actions.ts`
- Create: `src/core/actions.test.ts`

**Interfaces:**

- Consumes: `HomeAssistant` from `core/types/ha`; `cwNavigate` from `core/navigate`.
- Produces: `ActionName`, `ActionConfig`, `DEFAULT_ACTION`, `isPressable`, `runAction`.

- [ ] **Step 1: Write the failing test**

Create `src/core/actions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isPressable, runAction, type ActionConfig } from './actions'
import type { HomeAssistant } from './types/ha'

interface ServiceCall {
  domain: string
  service: string
  data?: Record<string, unknown>
  target?: Record<string, unknown>
}

const stubHass = (calls: ServiceCall[]): HomeAssistant =>
  ({
    callService: (
      domain: string,
      service: string,
      data?: Record<string, unknown>,
      target?: Record<string, unknown>,
    ) => {
      calls.push({ domain, service, ...(data ? { data } : {}), ...(target ? { target } : {}) })
      return Promise.resolve()
    },
  }) as unknown as HomeAssistant

/** A stand-in for the card element: Node 22 has EventTarget, so no DOM is needed. */
const stubElement = (seen: CustomEvent[]): EventTarget => {
  const target = new EventTarget()
  target.addEventListener('hass-more-info', event => seen.push(event as CustomEvent))
  return target
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runAction', () => {
  it('opens more-info by default, and for an absent config', () => {
    const seen: CustomEvent[] = []
    runAction(stubHass([]), stubElement(seen), undefined, 'sensor.hall')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.detail).toEqual({ entityId: 'sensor.hall' })
  })

  it('toggles through homeassistant.toggle', () => {
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement([]), { action: 'toggle' }, 'light.hall')
    expect(calls).toEqual([
      { domain: 'homeassistant', service: 'toggle', target: { entity_id: 'light.hall' } },
    ])
  })

  it('splits a dotted service and passes data and target through', () => {
    const calls: ServiceCall[] = []
    const config: ActionConfig = {
      action: 'call-service',
      service: 'script.goodnight',
      data: { speed: 'slow' },
      target: { area_id: 'bedroom' },
    }
    runAction(stubHass(calls), stubElement([]), config, 'sensor.hall')
    expect(calls).toEqual([
      {
        domain: 'script',
        service: 'goodnight',
        data: { speed: 'slow' },
        target: { area_id: 'bedroom' },
      },
    ])
  })

  it('warns rather than throwing when call-service has no usable service', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement([]), { action: 'call-service' }, 'sensor.hall')
    runAction(
      stubHass(calls),
      stubElement([]),
      { action: 'call-service', service: 'nodots' },
      'sensor.hall',
    )
    expect(calls).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('navigates through the router window', () => {
    const pushed: string[] = []
    const fired: string[] = []
    const fakeWindow = {
      name: 'ha-main-window',
      history: { pushState: (_s: unknown, _t: string, path: string) => pushed.push(path) },
      dispatchEvent: (event: Event) => {
        fired.push(event.type)
        return true
      },
    }
    vi.stubGlobal('window', fakeWindow)
    vi.stubGlobal('parent', fakeWindow)
    vi.stubGlobal('top', fakeWindow)

    runAction(
      stubHass([]),
      stubElement([]),
      { action: 'navigate', navigation_path: '/lovelace/1' },
      'sensor.hall',
    )
    expect(pushed).toEqual(['/lovelace/1'])
    expect(fired).toEqual(['location-changed'])
  })

  it('warns rather than navigating nowhere when the path is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runAction(stubHass([]), stubElement([]), { action: 'navigate' }, 'sensor.hall')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all for none', () => {
    const seen: CustomEvent[] = []
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement(seen), { action: 'none' }, 'sensor.hall')
    expect(seen).toEqual([])
    expect(calls).toEqual([])
  })

  it('lets a config name a different entity than the one pressed', () => {
    const seen: CustomEvent[] = []
    runAction(
      stubHass([]),
      stubElement(seen),
      { action: 'more-info', entity: 'sensor.other' },
      'sensor.hall',
    )
    expect(seen[0]?.detail).toEqual({ entityId: 'sensor.other' })
  })
})

describe('isPressable', () => {
  it('is true for everything except none', () => {
    expect(isPressable(undefined)).toBe(true)
    expect(isPressable({ action: 'toggle' })).toBe(true)
    expect(isPressable({ action: 'none' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm exec vitest run src/core/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Write `core/actions.ts`**

```ts
/**
 * What a press on a card does, beyond opening a dialog.
 *
 * Every card in this library fired `hass-more-info` and nothing else until the chips card
 * needed a press to toggle a light or move to another view — a chip that cannot do those is
 * not a replacement for the chips already on a dashboard. This is that capability, written
 * once, in `core/`, so the calendar, battery, complication and weather cards can adopt it
 * later rather than each growing a private copy.
 *
 * **The config shape is Home Assistant's, deliberately.** `{ action: 'navigate',
 * navigation_path: '/lovelace/0' }` is what every other custom card in the ecosystem takes,
 * so YAML written against one of those transfers unchanged and so does the muscle memory of
 * whoever wrote it. Inventing a tidier shape would have cost exactly that.
 *
 * `hass` and the element are arguments rather than things this module reaches for, which is
 * not only cleanliness: `vitest.config.ts` runs in node, so a module that read a global
 * `document` would be untestable in the only harness this repo has.
 */

import { cwNavigate } from './navigate'
import type { HomeAssistant } from './types/ha'

export type ActionName = 'more-info' | 'toggle' | 'navigate' | 'call-service' | 'none'

/**
 * One action, in Home Assistant's own vocabulary. Every field past `action` belongs to exactly
 * one of them, which is why they are all optional and why `runAction` validates rather than
 * trusting: a config is hand-writable, so `{ action: 'navigate' }` with no path is a thing a
 * user will produce and a thing this card must survive.
 */
export interface ActionConfig {
  action: ActionName
  /** `navigate` only. */
  navigation_path?: string
  /** `call-service` only, as `domain.service`. */
  service?: string
  data?: Record<string, unknown>
  target?: Record<string, unknown>
  /** Overrides the entity the action applies to. Rarely wanted; honoured where it is. */
  entity?: string
}

/**
 * More-info, because it is the action that needs no configuration and tells the user
 * something true about any entity at all.
 */
export const DEFAULT_ACTION: ActionConfig = { action: 'more-info' }

/**
 * Whether a press does anything — which decides whether the thing is drawn as a button at
 * all. A chip with `none` gets no role, no tab stop and no pressed state: an affordance that
 * lies about being interactive is worse than none, and a keyboard user tabbing through eight
 * chips that do nothing is the concrete version of that.
 */
export const isPressable = (config: ActionConfig | undefined): boolean =>
  (config?.action ?? DEFAULT_ACTION.action) !== 'none'

const warn = (message: string): void => console.warn(`[cupertino-plus] ${message}`)

/**
 * Run `config` against `entityId`, from `element`.
 *
 * Failures warn and return rather than throwing: this is called from a click handler, and an
 * exception there is an unhandled rejection in somebody's dashboard rather than a message
 * anybody sees. There is no toast mechanism in this library and this is not the place to add
 * one — the console names the card and the service, which is what a user reporting "the chip
 * does nothing" can be asked for.
 */
export const runAction = (
  hass: HomeAssistant,
  element: EventTarget,
  config: ActionConfig | undefined,
  entityId: string,
): void => {
  const resolved = config ?? DEFAULT_ACTION
  const target = resolved.entity ?? entityId

  switch (resolved.action) {
    case 'none':
      return

    case 'toggle':
      void hass
        .callService('homeassistant', 'toggle', undefined, { entity_id: target })
        .catch(() => warn(`could not toggle ${target}`))
      return

    case 'navigate': {
      const path = resolved.navigation_path
      if (!path) {
        warn('a navigate action has no navigation_path')
        return
      }
      cwNavigate(path)
      return
    }

    case 'call-service': {
      const service = resolved.service
      const dot = service ? service.indexOf('.') : -1
      if (!service || dot <= 0 || dot === service.length - 1) {
        warn(`a call-service action needs a domain.service, got ${String(service)}`)
        return
      }
      void hass
        .callService(
          service.slice(0, dot),
          service.slice(dot + 1),
          resolved.data,
          resolved.target ?? { entity_id: target },
        )
        .catch(() => warn(`${service} failed`))
      return
    }

    case 'more-info':
    default:
      element.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: target },
          bubbles: true,
          composed: true,
        }),
      )
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/core/actions.test.ts`
Expected: PASS, all nine cases.

- [ ] **Step 5: Typecheck, format, commit**

```bash
pnpm test && pnpm typecheck && pnpm format:check
git add src/core/actions.ts src/core/actions.test.ts
git commit -m "feat: the five things a press on a card can do"
```

---

### Task 4: `core/entities-form.ts` — the picker round-trip, shared

**Files:**

- Create: `src/core/entities-form.ts`
- Create: `src/core/entities-form.test.ts` (move `src/cards/complication/entities-form.test.ts` here)
- Delete: `src/cards/complication/entities-form.ts` and its test
- Modify: `src/cards/complication/complication-card-editor.ts:5` (import path)

**Interfaces:**

- Consumes: `EntityRow`, `entityRows` from `core/entity-view`.
- Produces: `mergeEntities<T extends EntityRow>(prior: unknown, ids: readonly string[]): (string | T)[]`.

- [ ] **Step 1: Move the test first, and make it generic**

`git mv src/cards/complication/entities-form.test.ts src/core/entities-form.test.ts`, change its import to `./entities-form`, and add one case proving the generic carries a foreign override through — the chips card's `tap_action` is the row shape the complication card never had:

```ts
it('carries an override this module has never heard of', () => {
  const prior = [{ entity: 'light.hall', tap_action: { action: 'toggle' } }]
  expect(mergeEntities(prior, ['light.hall'])).toEqual(prior)
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm exec vitest run src/core/entities-form.test.ts`
Expected: FAIL — `Failed to resolve import "./entities-form"`.

- [ ] **Step 3: Move the module**

`git mv src/cards/complication/entities-form.ts src/core/entities-form.ts`. Keep the whole file comment — it records the bug this function exists for. Change the import and the signature:

```ts
import { entityRows, type EntityRow } from './entity-view'

export const mergeEntities = <T extends EntityRow = EntityRow>(
  prior: unknown,
  ids: readonly string[],
): (string | T)[] => {
  const queues = new Map<string, T[]>()
  for (const row of entityRows<T>(prior)) {
    const queue = queues.get(row.entity)
    if (queue) queue.push(row)
    else queues.set(row.entity, [row])
  }

  return ids.map(id => {
    const row = queues.get(id)?.shift()
    return row && Object.keys(row).length > 1 ? row : id
  })
}
```

Add to the file comment, after the existing prose:

```
 * Generic since the chips card arrived: the rule ("a row is worth keeping when it says more
 * than its own id") is about the picker, not about what any one card's rows carry, and the
 * `Object.keys(row).length > 1` test that implements it never needed to know either.
```

- [ ] **Step 4: Update the complication editor's import**

In `src/cards/complication/complication-card-editor.ts`, change line 5 to:

```ts
import { mergeEntities } from '../../core/entities-form'
```

and its call to `mergeEntities<ComplicationEntityConfig>(config.entities, watchedIds(next.entities))`.

- [ ] **Step 5: Run everything, format, commit**

```bash
pnpm test && pnpm typecheck && pnpm format:check
git add -A src/core/entities-form.ts src/core/entities-form.test.ts src/cards/complication/
git commit -m "refactor: the picker round-trip is not one card's problem"
```

---

### Task 5: `chips/model.ts`

**Files:**

- Create: `src/cards/chips/model.ts`
- Create: `src/cards/chips/model.test.ts`

**Interfaces:**

- Consumes: `EntityRow`, `entityRows`, `formatValue`, `iconFor`, `isUnavailable`, `nameFor`, `VALUE_DASH` from `core/entity-view`; `ActionConfig`, `DEFAULT_ACTION` from `core/actions`.
- Produces: `CHIP_CONTENTS`, `ChipContent`, `DEFAULT_CONTENT`, `ChipConfig`, `ChipView`, `chipConfigs`, `readChips`.

- [ ] **Step 1: Write the failing test**

Create `src/cards/chips/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { readChips } from './model'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    context: { id: '' },
    ...over,
  }) as HassEntity

const hassWith = (...list: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
  }) as unknown as HomeAssistant

const HALL = entity({
  entity_id: 'sensor.hall',
  state: '21.4',
  attributes: { friendly_name: 'Hall', unit_of_measurement: '°C', device_class: 'temperature' },
})

describe('readChips', () => {
  it('reads a bare id into a drawable chip at the default content mode', () => {
    const [chip] = readChips(hassWith(HALL), ['sensor.hall'], {})
    expect(chip).toEqual({
      entityId: 'sensor.hall',
      name: 'Hall',
      icon: 'mdi:thermometer',
      value: '21.4°C',
      content: 'value',
      unavailable: false,
      action: { action: 'more-info' },
    })
  })

  it('takes the card default, and lets a row override it', () => {
    const chips = readChips(
      hassWith(HALL),
      ['sensor.hall', { entity: 'sensor.hall', content: 'icon' }],
      {
        content: 'labeled',
      },
    )
    expect(chips.map(chip => chip.content)).toEqual(['labeled', 'icon'])
  })

  it('draws an entity that is not in hass at all, rather than dropping it', () => {
    // A chip has a configured identity to draw against — unlike the weather card, which
    // returns null because it has nothing of its own to show.
    const [chip] = readChips(hassWith(), [{ entity: 'sensor.gone', name: 'Gone' }], {})
    expect(chip).toMatchObject({
      entityId: 'sensor.gone',
      name: 'Gone',
      value: '—',
      unavailable: true,
    })
  })

  it('dashes and flags an entity that is present but not reporting', () => {
    const dead = entity({
      entity_id: 'sensor.hall',
      state: 'unavailable',
      attributes: { friendly_name: 'Hall' },
    })
    const [chip] = readChips(hassWith(dead), ['sensor.hall'], {})
    expect(chip).toMatchObject({ value: '—', unavailable: true, name: 'Hall' })
  })

  it('prefers a row name and icon over the entity own', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: 'Downstairs', icon: 'mdi:sofa' }],
      {},
    )
    expect(chip).toMatchObject({ name: 'Downstairs', icon: 'mdi:sofa' })
  })

  it('carries a per-row tap action, defaulting to more-info', () => {
    const rows = [
      { entity: 'sensor.hall', tap_action: { action: 'toggle' as const } },
      'sensor.hall',
    ]
    expect(readChips(hassWith(HALL), rows, {}).map(chip => chip.action.action)).toEqual([
      'toggle',
      'more-info',
    ])
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm exec vitest run src/cards/chips/model.test.ts`
Expected: FAIL — `Failed to resolve import "./model"`.

- [ ] **Step 3: Write `chips/model.ts`**

```ts
/**
 * What a chip is, and how a config row plus `hass` becomes one.
 *
 * The whole of this card's contact with `hass`. Everything past it draws a `ChipView` and
 * knows nothing about entities — the same split `complication/model.ts` and `weather/model.ts`
 * make, and for the same reason.
 *
 * Almost every line of the actual reading is `core/entity-view.ts`'s, which is the point of
 * that module existing: a chip and a complication should never disagree about what a
 * thermostat's reading looks like. What is this card's own is the content mode, the tap
 * action, and the decision to draw an entity that is not there.
 */

import { DEFAULT_ACTION, type ActionConfig } from '../../core/actions'
import {
  entityRows,
  formatValue,
  iconFor,
  isUnavailable,
  nameFor,
  VALUE_DASH,
  type EntityRow,
} from '../../core/entity-view'
import type { HomeAssistant } from '../../core/types/ha'

/**
 * How much of a chip is drawn. `icon` is the glyph alone; `value` adds the reading; `labeled`
 * stacks a small caption over the reading. Three flat strings rather than a pair of booleans,
 * because they are three designs rather than two independent switches — there is no
 * "caption but no reading" chip.
 */
export const CHIP_CONTENTS = ['icon', 'value', 'labeled'] as const

export type ChipContent = (typeof CHIP_CONTENTS)[number]

/** Glyph and reading: the one that says something without a caption to explain it. */
export const DEFAULT_CONTENT: ChipContent = 'value'

export interface ChipConfig extends EntityRow {
  content?: ChipContent
  tap_action?: ActionConfig
}

export interface ChipView {
  entityId: string
  /** The caption in `labeled` mode, and the accessible name in every mode. */
  name: string
  /** An `mdi:` name for `ha-icon` — never a raw path; see the card's own note. */
  icon: string
  /** Formatted with its unit, or the dash when there is nothing to read. */
  value: string
  content: ChipContent
  unavailable: boolean
  action: ActionConfig
}

export interface ChipDefaults {
  content?: ChipContent
}

export const chipConfigs = (entities: unknown): ChipConfig[] => entityRows<ChipConfig>(entities)

/**
 * Every configured row, in order, as something drawable.
 *
 * Nothing is ever dropped. A row whose entity is missing from `hass.states` entirely still
 * produces a chip — dashed, flagged unavailable, named from the row or from the id it asked
 * for. That follows the complication card rather than the weather card: a chip has a
 * configured identity of its own to draw, where a weather card without its entity has no
 * location, no unit and nothing honest to put on the screen. It also means a typo in a config
 * shows up as a dashed chip you can see rather than as a row that silently is not there.
 */
export const readChips = (
  hass: HomeAssistant,
  entities: unknown,
  defaults: ChipDefaults,
): ChipView[] =>
  chipConfigs(entities).map(row => {
    const entity = hass.states[row.entity]
    const content = row.content ?? defaults.content ?? DEFAULT_CONTENT
    const action = row.tap_action ?? DEFAULT_ACTION

    if (!entity) {
      return {
        entityId: row.entity,
        name: row.name ?? row.entity,
        icon: row.icon ?? 'mdi:eye',
        value: VALUE_DASH,
        content,
        unavailable: true,
        action,
      }
    }

    const unavailable = isUnavailable(entity)
    return {
      entityId: row.entity,
      name: row.name ?? nameFor(entity),
      icon: row.icon ?? iconFor(entity),
      value: unavailable ? VALUE_DASH : formatValue(hass, entity),
      content,
      unavailable,
      action,
    }
  })
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/cards/chips/model.test.ts`
Expected: PASS, all six cases.

- [ ] **Step 5: Commit**

```bash
pnpm test && pnpm typecheck && pnpm format:check
git add src/cards/chips/
git commit -m "feat: a config row and an entity become a chip"
```

---

### Task 6: `chips/layout.ts` — the height band and the floors

**Files:**

- Create: `src/cards/chips/layout.ts`
- Create: `src/cards/chips/layout.test.ts`

**Interfaces:**

- Consumes: `ChipContent`, `ChipView` from `./model`; `Floors`, `columnsFor`, `rowsFor`, `gridColumnsToPx` from `core/floors`.
- Produces: `ROW_SINGLE`, `ROW_LABELED`, `bandFor`, `rowHeightFor`, `floorsFor`.

**Note on what this module does NOT do:** it never computes which chip lands on which line. CSS `flex-wrap` does that, against real text metrics this module cannot see. What it prices is the floor — how tall the box must be allowed to get — which needs only a nominal chip width and is honest about being nominal.

- [ ] **Step 1: Write the failing test**

Create `src/cards/chips/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { bandFor, floorsFor, rowHeightFor, ROW_LABELED, ROW_SINGLE } from './layout'
import type { ChipView } from './model'

const chip = (content: ChipView['content']): ChipView => ({
  entityId: 'sensor.a',
  name: 'A',
  icon: 'mdi:eye',
  value: '1',
  content,
  unavailable: false,
  action: { action: 'more-info' },
})

describe('bandFor', () => {
  it('is the tallest mode present, so one labeled chip promotes the whole row', () => {
    expect(bandFor([chip('icon'), chip('value')])).toBe('value')
    expect(bandFor([chip('icon'), chip('labeled'), chip('value')])).toBe('labeled')
    expect(bandFor([chip('icon')])).toBe('icon')
  })

  it('answers the default band for an empty card rather than throwing', () => {
    expect(bandFor([])).toBe('value')
  })
})

describe('rowHeightFor', () => {
  it('never draws a row shorter than the 44-unit tap target', () => {
    expect(rowHeightFor('icon')).toBe(ROW_SINGLE)
    expect(rowHeightFor('value')).toBe(ROW_SINGLE)
    expect(ROW_SINGLE).toBeGreaterThanOrEqual(44)
    expect(rowHeightFor('labeled')).toBe(ROW_LABELED)
    expect(ROW_LABELED).toBeGreaterThan(ROW_SINGLE)
  })
})

describe('floorsFor', () => {
  it('grows the row floor as chips wrap onto more lines', () => {
    const four = floorsFor([chip('value'), chip('value'), chip('value'), chip('value')])
    const twelve = floorsFor(Array.from({ length: 12 }, () => chip('value')))
    expect(twelve.min_rows).toBeGreaterThan(four.min_rows)
  })

  it('asks for more height for a labeled band than for a plain one', () => {
    const plain = floorsFor(Array.from({ length: 6 }, () => chip('value')))
    const labeled = floorsFor([...Array.from({ length: 5 }, () => chip('value')), chip('labeled')])
    expect(labeled.min_rows).toBeGreaterThanOrEqual(plain.min_rows)
  })

  it('fits more icon-only chips on a line than labeled ones', () => {
    const icons = floorsFor(Array.from({ length: 8 }, () => chip('icon')))
    const labels = floorsFor(Array.from({ length: 8 }, () => chip('labeled')))
    expect(icons.min_rows).toBeLessThan(labels.min_rows)
  })

  it('never asks for less than the library minimum, even with no chips', () => {
    expect(floorsFor([])).toEqual({ min_columns: 4, min_rows: 1 })
  })
})
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm exec vitest run src/cards/chips/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Write `chips/layout.ts`**

```ts
/**
 * How tall a row of chips is, and how much box the card must be allowed to have.
 *
 * Deliberately small next to the other cards' layout modules, because this card gives most of
 * the job away: chips are content-width and CSS `flex-wrap` decides which of them lands on
 * which line, against text metrics no module running in node can see. Guessing at those and
 * then rendering with `flex-wrap` anyway would produce two answers that disagree, and the one
 * the user sees would be the CSS.
 *
 * What cannot be given away is the floor. `getGridOptions()` is answered before anything is
 * measured, and if it under-reports, Home Assistant hands the card a box too short for its own
 * content and `ha-card` clips the overflow — the failure the complication card's §5 exists to
 * prevent, where a chip is not drawn small, it is simply not drawn. So this module prices the
 * floor against a nominal chip width and errs generous.
 *
 * Every number is a design unit: pixels at `scale: 1`, matching the stylesheet in
 * `chips-card.ts` multiplied by `var(--cw-scale)`.
 */

import { columnsFor, gridColumnsToPx, rowsFor, type Floors } from '../../core/floors'
import { DEFAULT_CONTENT, type ChipContent, type ChipView } from './model'

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/** The gap between one chip and the next, both across and down. Must match `--cw-space-2`. */
const GAP = 8

/**
 * A one-line chip's row height.
 *
 * The pill itself draws at 30 units, and this is 44, which is not a mistake: a press can now
 * toggle a light, so the chip is a real touch target and 44 is the floor for one. The extra
 * 14 units are hit box, not paint — see `.chip` in the card's stylesheet, where the pill is
 * centred inside a taller pressable box. Pricing the row at the target rather than at the
 * pill is what stops two lines of chips from overlapping each other's targets.
 */
export const ROW_SINGLE = 44

/**
 * A `labeled` chip's row height: caption (11) over reading (17) with a 2-unit gap, plus the
 * pill's own vertical padding, comes to 48 — past the tap-target floor on its own.
 */
export const ROW_LABELED = 48

/**
 * A nominal chip width per content mode, for the floor arithmetic only.
 *
 * Not measured and not measurable here: a chip is as wide as its name and reading, which
 * depend on the font, the locale and the entity. These are the widths of a typical chip of
 * each kind at `scale: 1` — a glyph and a short reading — and they are used for one purpose,
 * to estimate how many chips share a line. A real row that runs wider than the estimate wraps
 * one chip earlier than the floor predicted, which costs a line of height the floor already
 * allowed for elsewhere; the error is bounded and it points the safe way.
 */
const NOMINAL_WIDTH: Record<ChipContent, number> = {
  icon: 52,
  value: 96,
  labeled: 128,
}

/**
 * The tallest content mode in the card, which every chip in it draws at.
 *
 * One `labeled` chip promotes the whole row rather than standing a head above its neighbours
 * — the same instinct as the battery card refusing to draw a full row with a stub beneath it.
 * An empty card answers the default rather than throwing, because `getGridOptions()` is called
 * on a card with no entities yet, the moment it is dropped from the picker.
 */
export const bandFor = (chips: readonly ChipView[]): ChipContent => {
  if (chips.some(chip => chip.content === 'labeled')) return 'labeled'
  if (chips.some(chip => chip.content === 'value')) return 'value'
  return chips.length === 0 ? DEFAULT_CONTENT : 'icon'
}

export const rowHeightFor = (band: ChipContent): number =>
  band === 'labeled' ? ROW_LABELED : ROW_SINGLE

/**
 * The widest the floor pretends a card is: three nominal chips side by side.
 *
 * This is the number that makes the whole floor honest, and getting it wrong breaks the
 * guarantee in both directions, so it is worth spelling out.
 *
 * The row floor has to be computed against the *narrowest* box the user can reach, because
 * that is the box that wraps onto the most lines — price the height against a wide card and a
 * user who drags it narrow gets more lines than the floor allowed and `ha-card` clips them,
 * which is the exact failure §5 exists to prevent. But "narrowest reachable" is itself set by
 * `min_columns`, which this function also chooses, so a floor computed against a one-chip
 * width would be self-fulfilling: twelve chips at one per line is ten grid rows of height, and
 * because `withFloors` raises the *default* rows to the floor, a freshly dropped card would
 * arrive as a tall column nobody asked for.
 *
 * Three is the resolution. A multi-chip card cannot be dragged narrower than three chips
 * across, and the height is priced at exactly that width — so the floors are reachable, the
 * card cannot be narrowed into clipping, and a twelve-chip row lands at four rows rather than
 * ten. A card with one or two chips floors at its own width, since there is nothing to wrap.
 */
const FLOOR_CHIPS_ACROSS = 3

/**
 * The floor: wide enough that the chips cannot be crushed into a column, and tall enough for
 * every line they wrap onto at exactly that width.
 */
export const floorsFor = (chips: readonly ChipView[]): Floors => {
  const band = bandFor(chips)
  const width = NOMINAL_WIDTH[band]

  const across = Math.min(Math.max(chips.length, 1), FLOOR_CHIPS_ACROSS)
  const min_columns = columnsFor(across * width + (across - 1) * GAP + 2 * INSET)

  if (chips.length === 0) return { min_columns, min_rows: 1 }

  const usable = Math.max(width, gridColumnsToPx(min_columns) - 2 * INSET)
  const perLine = Math.max(1, Math.floor((usable + GAP) / (width + GAP)))
  const lines = Math.ceil(chips.length / perLine)
  const content = lines * rowHeightFor(band) + (lines - 1) * GAP + 2 * INSET

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/cards/chips/layout.test.ts`
Expected: PASS, all six cases.

- [ ] **Step 5: Commit**

```bash
pnpm test && pnpm typecheck && pnpm format:check
git add src/cards/chips/layout.ts src/cards/chips/layout.test.ts
git commit -m "feat: how tall a row of chips has to be allowed to get"
```

---

### Task 7: `chips-card.ts` — the element

**Files:**

- Create: `src/cards/chips/chips-card.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `CupertinoCard`, `CupertinoCardConfig` from `core/base-card`; `registerCard` from `core/register`; `withFloors` from `core/floors`; `runAction`, `isPressable`, `type ActionConfig` from `core/actions`; `watchedIds` from `core/entity-view`; `readChips`, `bandFor`, `floorsFor`.
- Produces: `CHIPS_CARD_TAG`, `ChipsCardConfig`, `CupertinoChipsCard`.

- [ ] **Step 1: Write the element**

Create `src/cards/chips/chips-card.ts`. The container split is the one thing to get exactly right — `glass` must leave nothing opaque between the pill and the dashboard, or `backdrop-filter` samples the card instead of the wallpaper:

```ts
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'

import { CupertinoCard, type CupertinoCardConfig } from '../../core/base-card'
import { isPressable, runAction } from '../../core/actions'
import { watchedIds } from '../../core/entity-view'
import { withFloors } from '../../core/floors'
import { registerCard } from '../../core/register'
import type { LovelaceCardEditor, LovelaceGridOptions } from '../../core/types/ha'
import { bandFor, floorsFor, rowHeightFor } from './layout'
import { readChips, type ChipContent, type ChipView } from './model'
// Imported for the side effect as well as the constant: the editor tag has to be defined by
// the time getConfigElement is asked for it.
import { CHIPS_EDITOR_TAG } from './chips-card-editor'

export const CHIPS_CARD_TAG = 'cupertino-plus-chips'

export type ChipsContainer = 'glass' | 'card'

export const DEFAULT_CONTAINER: ChipsContainer = 'glass'

export interface ChipsCardConfig extends CupertinoCardConfig {
  entities?: unknown
  content?: ChipContent
  container?: ChipsContainer
}

const NO_ENTITIES = 'No Entities'
```

The class, its stylesheet and its render. Every colour is a token; the glass scrim is `--cw-label`'s own family at low alpha rather than a hardcoded white, which is what keeps it right in both themes:

```ts
class CupertinoChipsCard extends CupertinoCard<ChipsCardConfig> {
  static override styles: CSSResultGroup = [
    CupertinoCard.styles,
    css`
      /* The glass container is the reason this card exists, and it is the first card in the
         library that must not paint a surface: backdrop-filter samples whatever is behind the
         element, so an opaque ha-card between the pill and the dashboard means the blur
         samples the card and achieves nothing but cost. */
      ha-card.glass {
        background: none;
        border: none;
        box-shadow: none;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cw-space-2);
        padding: var(--cw-inset);
        align-content: flex-start;
        min-width: 0;
      }

      /* The pressable box, not the pill. layout.ts prices the row at 44 units for this: a
         press can toggle a light now, so the target is a real one even though the paint
         inside it is smaller. */
      .chip {
        display: inline-flex;
        align-items: center;
        min-height: calc(var(--cw-chip-row) * 1px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: calc(6px * var(--cw-scale));
        padding: calc(7px * var(--cw-scale)) calc(13px * var(--cw-scale));
        border-radius: var(--cw-radius-pill);
        min-width: 0;
      }

      .chip.labeled .pill {
        align-items: center;
      }

      .stack {
        display: flex;
        flex-direction: column;
        gap: calc(2px * var(--cw-scale));
        min-width: 0;
      }

      /* One ink for the whole row: this card has no per-entity colour at all, which is
         §4 of its rules and the whole difference between a Lock Screen accessory and the
         Home Screen widget the complication card draws. */
      .glass .pill {
        color: var(--cw-label);
        background: color-mix(in srgb, var(--cw-label) 14%, transparent);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
      }

      /* No blur in card mode: blurring against an opaque surface samples the surface. */
      .surface .pill {
        color: var(--cw-label);
        background: var(--cw-track);
      }

      .glyph {
        --mdc-icon-size: calc(17px * var(--cw-scale));
        flex: none;
      }

      .value {
        font: var(--cw-text-footnote);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(140px * var(--cw-scale));
      }

      .caption {
        font: var(--cw-text-caption-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cw-label-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(140px * var(--cw-scale));
      }

      /* Dashed and dimmed, the library's contract for an entity that is not reporting. */
      .chip.unknown .pill {
        opacity: 0.55;
      }

      .chip[role='button']:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
      }

      .empty {
        font: var(--cw-text-callout);
        color: var(--cw-label-secondary);
        margin: auto;
      }
    `,
  ]

  public static getStubConfig(): ChipsCardConfig {
    return { type: `custom:${CHIPS_CARD_TAG}` }
  }

  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(CHIPS_EDITOR_TAG) as LovelaceCardEditor
  }

  protected override watchedEntities(): string[] {
    return watchedIds(this._config?.entities)
  }

  private get _chips(): ChipView[] {
    if (!this.hass || !this._config) return []
    const content = this._config.content
    return readChips(this.hass, this._config.entities, content ? { content } : {})
  }

  /**
   * The floors, recomputed on every call: both halves depend on a config that changes under
   * the card, exactly as the complication card's own `getGridOptions` does.
   */
  public override getGridOptions(): LovelaceGridOptions {
    return withFloors(super.getGridOptions(), floorsFor(this._chips))
  }

  /**
   * The handlers are bound unconditionally and guard inside, rather than being bound only for
   * a pressable chip. A conditional `@click=${cond ? handler : nothing}` is the shape that
   * reads better and the one to avoid here: an event binding is not an attribute binding, and
   * feeding it a sentinel is a different code path in lit-html from feeding it a function.
   * Guarding inside is one branch either way and cannot be got subtly wrong.
   */
  private _press(chip: ChipView) {
    return (): void => {
      if (!this.hass || !isPressable(chip.action)) return
      runAction(this.hass, this, chip.action, chip.entityId)
    }
  }

  private _key(chip: ChipView) {
    return (event: KeyboardEvent): void => {
      if (!isPressable(chip.action)) return
      // Space scrolls the dashboard otherwise, and Enter would submit a form the card may be
      // sitting inside.
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this._press(chip)()
    }
  }

  /**
   * One chip. A chip whose action is `none` is not a button: no role, no tab stop, no pressed
   * state — an affordance that lies about being interactive is worse than none, and eight of
   * them in a keyboard user's tab order is the concrete version of that.
   */
  private _renderChip(chip: ChipView, band: ChipContent): TemplateResult {
    const pressable = isPressable(chip.action)
    const label = `${chip.name}, ${chip.value}`

    const body =
      band === 'labeled'
        ? html`<span class="stack"
            ><span class="caption">${chip.name}</span><span class="value">${chip.value}</span></span
          >`
        : band === 'value'
          ? html`<span class="value">${chip.value}</span>`
          : nothing

    return html`
      <div
        class="chip ${band} ${chip.unavailable ? 'unknown' : ''} ${pressable ? 'cw-pressable' : ''}"
        role=${pressable ? 'button' : nothing}
        tabindex=${pressable ? 0 : nothing}
        aria-label=${pressable ? label : nothing}
        title=${chip.name}
        @click=${this._press(chip)}
        @keydown=${this._key(chip)}
      >
        <span class="pill">
          <ha-icon class="glyph" .icon=${chip.icon}></ha-icon>
          ${body}
        </span>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing

    const chips = this._chips
    const container = this._config.container ?? DEFAULT_CONTAINER
    const klass = container === 'glass' ? 'glass' : 'surface'

    if (chips.length === 0) {
      return html`<ha-card class=${klass}><div class="empty">${NO_ENTITIES}</div></ha-card>`
    }

    const band = bandFor(chips)
    return html`
      <ha-card
        class=${klass}
        style=${`--cw-chip-row:${rowHeightFor(band)}`}
        aria-label=${`${chips.length} chips`}
      >
        <div class="chips">${chips.map(chip => this._renderChip(chip, band))}</div>
      </ha-card>
    `
  }
}

registerCard(CHIPS_CARD_TAG, CupertinoChipsCard, {
  name: 'Cupertino Chips',
  description: 'A row of lock-screen-style chips for your dashboard.',
})

export { CupertinoChipsCard }
```

- [ ] **Step 2: Register it in the bundle**

In `src/index.ts`, mirroring the four cards already there:

```ts
import './cards/chips/chips-card'
```

and

```ts
export { CHIPS_CARD_TAG } from './cards/chips/chips-card'
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all clean. The element itself has no test — the suite is `environment: 'node'` — which is why Task 9's screenshots are not optional.

- [ ] **Step 4: Commit**

```bash
pnpm format:check
git add src/cards/chips/chips-card.ts src/index.ts
git commit -m "feat: the chips card, glass and surface"
```

---

### Task 8: The visual editor

**Files:**

- Create: `src/cards/chips/chips-card-editor.ts`

**Interfaces:**

- Consumes: `CupertinoCardEditor` from `core/card-editor`; `defineElement` from `core/register`; `mergeEntities` from `core/entities-form`; `watchedIds` from `core/entity-view`; `CHIP_CONTENTS`, `DEFAULT_CONTENT`, `type ChipConfig`; `DEFAULT_CONTAINER`, `type ChipsCardConfig`.
- Produces: `CHIPS_EDITOR_TAG`, `CupertinoChipsCardEditor`.

**Scope decision, and it is a reduction from the spec's §8.** The editor draws **card-level rows only**: entities, the default content mode, the container, and the shared scale. Per-chip `content`, `tap_action`, `name` and `icon` are YAML, and they survive the visual editor untouched because `mergeEntities` is what rebuilds the list. This matches the complication card exactly — its editor also surfaces only the entity list while its rows carry five possible overrides — and it keeps two unverified frontend APIs (`expandable` form nodes and the `ui_action` selector) off the critical path. Revisit as its own task once one of them can be checked against a running frontend; §11 of the spec already records both as unverified.

- [ ] **Step 1: Write the editor**

```ts
import { CupertinoCardEditor } from '../../core/card-editor'
import { mergeEntities } from '../../core/entities-form'
import { watchedIds } from '../../core/entity-view'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import { DEFAULT_CONTAINER, type ChipsCardConfig } from './chips-card'
import { CHIP_CONTENTS, DEFAULT_CONTENT, type ChipConfig } from './model'

export const CHIPS_EDITOR_TAG = 'cupertino-plus-chips-editor'

const CONTENT_LABELS: Record<string, string> = {
  icon: 'Icon only',
  value: 'Icon and reading',
  labeled: 'Icon, name and reading',
}

const CONTAINER_LABELS: Record<string, string> = {
  glass: 'Glass — floats on the dashboard',
  card: 'Card — draws its own surface',
}

const FIELDS: readonly HaFormSchema[] = [
  { name: 'entities', selector: { entity: { multiple: true, reorder: true } }, required: true },
  {
    name: 'content',
    selector: {
      select: {
        mode: 'dropdown',
        options: CHIP_CONTENTS.map(value => ({ value, label: CONTENT_LABELS[value] ?? value })),
      },
    },
  },
  {
    name: 'container',
    selector: {
      select: {
        mode: 'dropdown',
        options: ['glass', 'card'].map(value => ({
          value,
          label: CONTAINER_LABELS[value] ?? value,
        })),
      },
    },
  },
]

const LABELS: Record<string, string> = {
  entities: 'Entities',
  content: 'Chip content',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  entities: 'One chip each, in this order. The row wraps when it runs out of width.',
  content: 'The default for every chip. A single chip can override it in YAML.',
  container:
    'Glass has no card behind it, so a wallpaper shows through. Card is safer on a busy background.',
}

/**
 * The chips card's visual editor.
 *
 * Three rows and the shared scale. Per-chip overrides — a name, an icon, a content mode, a tap
 * action — are YAML, exactly as the complication card's per-row overrides are, and they survive
 * a trip through this form for the same reason: `toForm` flattens `entities` to the bare ids
 * `ha-entities-picker` can render, and `fromForm` puts the rows back with `mergeEntities`
 * rather than letting the picker's report overwrite them.
 */
class CupertinoChipsCardEditor extends CupertinoCardEditor<ChipsCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return FIELDS
  }

  /** Shown rather than blank: an unset dropdown reads as broken, not as a default. */
  protected override defaults(): Partial<ChipsCardConfig> {
    return { content: DEFAULT_CONTENT, container: DEFAULT_CONTAINER }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }

  protected override toForm(config: ChipsCardConfig): Record<string, unknown> {
    return { ...config, entities: watchedIds(config.entities) }
  }

  protected override fromForm(
    config: ChipsCardConfig,
    data: Record<string, unknown>,
    fields: readonly string[],
  ): ChipsCardConfig {
    const next = super.fromForm(config, data, fields)
    const merged = mergeEntities<ChipConfig>(config.entities, watchedIds(next.entities))

    const withEntities: ChipsCardConfig = { ...next }
    if (merged.length === 0) delete withEntities.entities
    else withEntities.entities = merged

    return withEntities
  }
}

defineElement(CHIPS_EDITOR_TAG, CupertinoChipsCardEditor)

export { CupertinoChipsCardEditor }
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm format:check
git add src/cards/chips/chips-card-editor.ts
git commit -m "feat: visual editor for the chips card"
```

---

### Task 9: Showcase, screenshots, docs

**Files:**

- Create: `dev/chip-fixtures.ts`
- Create: `docs/chips-widget-rules.md`
- Modify: `dev/mock-hass.ts`, `dev/shots.ts`, `dev/site/catalog.ts`, `README.md`, `docs/development.md`

- [ ] **Step 1: Fixtures**

Create `dev/chip-fixtures.ts`, following `dev/complication-entities.ts`'s shape. Every entity here is chosen for a branch the card actually has — a fixture that exercises nothing is a picture nobody learns from:

```ts
/**
 * The mock entities the chips card is shown against, and the named sets the showcase offers.
 *
 * Chosen for the branch each one lands on, the rule `complication-entities.ts` and
 * `weather-fixtures.ts` both state outright:
 *
 *  - **A temperature in `°C`**, which is the visible proof of the unit fix in
 *    `core/entity-view.ts`: it must read `21.4°C`, not `21.4 °C`.
 *  - **A battery percentage**, the other tight unit.
 *  - **A lock**, whose state is a word rather than a number.
 *  - **A person who is `not_home`**, the humanised-state path — it must read `Not home`.
 *  - **A light**, so the showcase has something a `toggle` action would make sense on.
 *  - **A sensor that has stopped reporting**, for the dashed-and-dimmed contract.
 */

import type { HassEntity } from '../src/core/types/ha'

const entity = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity =>
  ({
    entity_id: entityId,
    state,
    attributes,
    last_changed: '',
    last_updated: '',
    context: { id: entityId },
  }) as HassEntity

export const CHIP_STATES: HassEntity[] = [
  entity('sensor.hall_temperature', '21.4', {
    friendly_name: 'Hall',
    unit_of_measurement: '°C',
    device_class: 'temperature',
  }),
  entity('sensor.phone_battery', '41', {
    friendly_name: 'Phone',
    unit_of_measurement: '%',
    device_class: 'battery',
  }),
  entity('lock.front_door', 'locked', { friendly_name: 'Front door' }),
  entity('person.joe', 'not_home', { friendly_name: 'Joe' }),
  entity('light.kitchen', 'on', { friendly_name: 'Kitchen' }),
  entity('sensor.shed_temperature', 'unavailable', {
    friendly_name: 'Shed',
    device_class: 'temperature',
  }),
]

const ALL = CHIP_STATES.map(one => one.entity_id)

/** Twelve rows out of six entities, so the wrap is forced rather than hoped for. */
const MANY = [...ALL, ...ALL]

export const CHIP_SETS: Record<string, unknown[]> = {
  mixed: ALL,
  one: ['sensor.hall_temperature'],
  many: MANY,
  actions: [
    { entity: 'light.kitchen', tap_action: { action: 'toggle' } },
    { entity: 'lock.front_door', tap_action: { action: 'more-info' } },
    { entity: 'person.joe', tap_action: { action: 'none' } },
  ],
  unavailable: ['sensor.shed_temperature', 'sensor.hall_temperature'],
}

export const DEFAULT_CHIP_SET = 'mixed'

export const chipSet = (name: string): unknown[] =>
  CHIP_SETS[name] ?? CHIP_SETS[DEFAULT_CHIP_SET] ?? []
```

Then wire the states into `dev/mock-hass.ts`'s `STATES` map exactly as `WEATHER_STATES` is:

```ts
import { CHIP_STATES } from './chip-fixtures'
// …
  // The chips card's entities; see `chip-fixtures.ts`.
  ...Object.fromEntries(CHIP_STATES.map(one => [one.entity_id, one])),
```

- [ ] **Step 2: Catalog entry**

Add a `chips` widget to `dev/site/catalog.ts`, mirroring the `weather` entry's shape, with three selects so the site can show every combination:

```ts
const CHIP_SET_LABELS: Record<string, string> = {
  mixed: 'A mixed row',
  one: 'A single chip',
  many: 'Twelve chips: the row wraps',
  actions: 'Tap actions: toggle, more-info, and one that does nothing',
  unavailable: 'Not reporting',
}

const chips: Widget = {
  id: 'chips',
  name: 'Chips',
  tagline: 'A row of small things, each one tappable.',
  icon: mdiRhombusOutline,
  tag: CHIPS_CARD_TAG,

  props: [
    {
      kind: 'select',
      name: 'set',
      label: 'Entities',
      description: 'A mock set, chosen for the branch each one lands on.',
      group: 'card',
      options: Object.keys(CHIP_SETS).map(value => ({
        value,
        label: CHIP_SET_LABELS[value] ?? titleCase(value),
      })),
      initial: DEFAULT_CHIP_SET,
    },
    {
      kind: 'select',
      name: 'content',
      label: 'Chip content',
      description: 'The default for every chip in the card.',
      group: 'card',
      options: CHIP_CONTENTS.map(value => ({ value, label: titleCase(value) })),
      initial: DEFAULT_CONTENT,
    },
    {
      kind: 'select',
      name: 'container',
      label: 'Background',
      description: 'Glass floats on the dashboard; card draws its own surface.',
      group: 'card',
      options: [
        { value: 'glass', label: 'Glass' },
        { value: 'card', label: 'Card' },
      ],
      initial: DEFAULT_CONTAINER,
    },
  ],

  config: (props: Record<string, string>) => ({
    entities: chipSet(props.set ?? DEFAULT_CHIP_SET),
    content: props.content ?? DEFAULT_CONTENT,
    container: props.container ?? DEFAULT_CONTAINER,
  }),
}
```

Add `chips` to the exported `WIDGETS` array. Match the surrounding entries' exact `Widget` and `props` typing rather than the sketch above where the two differ — `catalog.ts` is the authority on its own shapes.

- [ ] **Step 3: Screenshots, and look at them**

Add these to the shots array in `dev/shots.ts`, following the existing entries' field-for-field shape:

```ts
const chipsShot = (set: string, over: Record<string, unknown> = {}): Partial<LovelaceCardConfig> => ({
  entities: chipSet(set),
  ...over,
})

  {
    name: 'chips-glass',
    caption: 'a mixed row on glass: one ink, no card behind the pills',
    tag: CHIPS_CARD_TAG,
    config: chipsShot('mixed'),
    columns: 12,
    rows: 2,
    theme: 'light',
  },
  {
    name: 'chips-card',
    caption: 'the same row with a surface under it, for a busy background',
    tag: CHIPS_CARD_TAG,
    config: chipsShot('mixed', { container: 'card' }),
    columns: 12,
    rows: 2,
    theme: 'light',
  },
  {
    name: 'chips-labeled',
    caption: 'labeled: a caption over each reading, and every chip the taller height',
    tag: CHIPS_CARD_TAG,
    config: chipsShot('mixed', { content: 'labeled' }),
    columns: 12,
    rows: 3,
    theme: 'light',
  },
  {
    name: 'chips-icons',
    caption: 'icon only: the tightest the row goes',
    tag: CHIPS_CARD_TAG,
    config: chipsShot('mixed', { content: 'icon' }),
    columns: 6,
    rows: 2,
    theme: 'light',
  },
  {
    name: 'chips-wrapped',
    caption: 'twelve chips: the row wraps rather than clipping, and the floor grew with it',
    tag: CHIPS_CARD_TAG,
    config: chipsShot('many'),
    columns: 12,
    rows: 4,
    theme: 'light',
  },
  {
    name: 'chips-dark',
    caption: 'dark: the same one ink, resolved the other way, with a dashed chip for a dead sensor',
    tag: CHIPS_CARD_TAG,
    config: chipsShot('unavailable'),
    columns: 6,
    rows: 2,
    theme: 'dark',
  },
```

Then:

```bash
pnpm build && pnpm shots
```

**Open every generated PNG and read it.** This step is not a formality: reading the screenshots is what caught the circular caption overflowing and the `rectangular-bleed` that did not bleed, and neither would have failed a test. Specifically check that the wrapped row's second line is not overlapping the first, that a `labeled` chip and a `value` chip in the same row are the same height, and that the glass pill is actually translucent rather than a flat grey.

- [ ] **Step 4: The rules document**

Write `docs/chips-widget-rules.md` in the shape of `docs/complication-widget-rules.md`, carrying at minimum: what a chip is and how it differs from a complication; §4's no-colour rule and why; the two containers and the contrast limitation `container: 'card'` exists to answer; the height band; the floors-not-scrolling rule; the five actions and the YAML for each; and a "still open" section naming the per-chip editor and the two unverified frontend APIs.

- [ ] **Step 5: README**

Add a **The chips** section with a screenshot and a one-paragraph description, add the row to the card table (`custom:cupertino-plus-chips` — entities, and what each one does), and change "Four of them" to "Five of them" and "The four types" to "The five types".

- [ ] **Step 6: Full verification**

```bash
pnpm test && pnpm typecheck && pnpm build && pnpm build:site && pnpm format:check
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: showcase, screenshots and docs for the chips card"
```

---

## Verification checklist

- [ ] `pnpm test` passes, with new tests for `entity-view`, `floors`, `actions`, `entities-form`, the chip model and the chip layout
- [ ] `pnpm typecheck`, `pnpm build`, `pnpm build:site`, `pnpm format:check` all clean
- [ ] The complication card still works — four modules moved out from under it
- [ ] A temperature reads `21.4°C`, not `21.4 °C`, on every card that draws one
- [ ] Chips wrap onto a second line rather than being clipped, and the floor grows with them
- [ ] One `labeled` chip makes every chip in that card the same taller height
- [ ] A glass chip over the showcase wallpaper is translucent; a card chip is not blurred
- [ ] Tapping a chip opens more-info; a `toggle` chip toggles; a `navigate` chip moves the view
- [ ] A chip with `action: 'none'` is not focusable and has no button role
- [ ] A chip whose entity does not exist draws dashed rather than vanishing
- [ ] `README.md` and `docs/chips-widget-rules.md` describe what shipped

## Deliberately deferred

**The per-chip editor.** Content mode and tap action are YAML per chip, surfaced in the visual
editor only as card-level defaults. Both frontend APIs that would do better — `expandable` form
nodes and the `ui_action` selector — are unverified here (§11 of the spec), and the complication
card already ships the same arrangement for its own five per-row overrides. Worth its own task
once either API can be checked against a running frontend, at which point `mergeEntities` already
guarantees the YAML those users wrote survives the upgrade.
