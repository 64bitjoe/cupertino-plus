# The tiles card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sixth card — a wrapping grid of fixed-width tiles, each an icon, a name and a state line, each pressable — to replace the four foreign button-cards on the HomeOS dashboard.

**Architecture:** Almost everything is adoption. The wrapping arithmetic is extracted from `chips/layout.ts` into `core/wrapping.ts` generic over "a thing with a width", and both cards read it; `tintFor` moves from `complication/tint.ts` to `core/tint.ts`; templates, actions, entity reading and the container split are used as they stand. The genuinely new code is the tile's own shape, its model, and its editor.

**Tech Stack:** TypeScript 7 (`exactOptionalPropertyTypes`), Lit 3, vitest in `environment: 'node'` (no DOM — elements are verified by screenshot in the showcase, never by unit test), pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-07-tiles-card-design.md`](../specs/2026-09-07-tiles-card-design.md)

## Global Constraints

- **Home Assistant 2026.7+.** No compatibility shims for older frontends.
- **`hass` is always an argument, never reached for.** vitest runs in the node environment; a module reaching for a global would be untestable in the only harness this repo has.
- **No element is unit-tested.** There is no DOM under vitest. Pure functions carry the test burden; anything that renders is verified by screenshot in the showcase (`pnpm shots`, or `pnpm dev` plus Playwright).
- **Failures warn and carry on.** `console.warn` prefixed `[cupertino-plus]`, then fall back. Never throw from a push handler or a click handler.
- **An empty value is dropped from a config, never written.** Home Assistant strips `undefined` and nothing else, so `color: ''` would survive into somebody's YAML saying what its absence says.
- **`--cw-*` tokens in cards; Home Assistant's own variables in editors.**
- **No backticks inside a `css\`\`` template literal**, including in comments — a backtick terminates the template. This has broken the build twice; the existing CSS comments avoid them deliberately.
- **Every commit runs `pnpm typecheck && pnpm test && pnpm format`** before it is made.
- **The chips card must not change behaviour.** Tasks 1–2 move code it depends on; its 467 tests are the regression gate and must stay green without being edited, except where a moved import path forces it.

---

## Task 1: `core/wrapping.ts` — the arithmetic, made generic

The chips card's wrapping and floor code is correct and was expensive to get there: four releases fixed a measured width, content-priced items, elastic fills and a container inset in turn. The tiles card needs the same logic over a different item. Extract rather than copy — a second copy drifts on exactly those four details.

**Files:**

- Create: `src/core/wrapping.ts`
- Create: `src/core/wrapping.test.ts`
- Modify: `src/cards/chips/layout.ts` (re-export the moved names; keep what is chip-specific)

**Interfaces:**

- Consumes: `columnsFor`, `gridColumnsToPx`, `rowsFor`, `Floors` from `core/floors`.
- Produces:
  - `interface WrapItem { width: number; break?: boolean; fill?: boolean }`
  - `groupRows<T extends { break?: boolean }>(items: readonly T[]): T[][]`
  - `linesFor(items: readonly WrapItem[], usable: number, gap: number): number`
  - `const INSET = 16`

`bandFor`, `widthOf`, `rowHeightFor`, `floorsFor`, `ROW_SINGLE`, `ROW_LABELED` and `ChipBand` all stay in `chips/layout.ts` — they are about chips. Only the two genuinely generic functions move.

- [ ] **Step 1: Write the failing test**

Create `src/core/wrapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { groupRows, linesFor, INSET } from './wrapping'

describe('groupRows', () => {
  const at = (id: string, brk = false) => ({ id, break: brk })

  it('keeps everything on one row when nothing asks otherwise', () => {
    expect(groupRows([at('a'), at('b'), at('c')]).map(r => r.length)).toEqual([3])
  })

  it('starts a new row at an item that asks for one', () => {
    expect(groupRows([at('a'), at('b'), at('c', true), at('d')]).map(r => r.length)).toEqual([2, 2])
  })

  /**
   * Every item starts a row when it is the first one, so the flag says nothing there, and
   * honouring it would open with an empty row. Reachable by dragging a flagged item to the top.
   */
  it('ignores a break on the first item rather than opening with an empty row', () => {
    expect(groupRows([at('a', true), at('b')]).map(r => r.length)).toEqual([2])
  })

  it('allows consecutive breaks, one item to a row', () => {
    expect(groupRows([at('a'), at('b', true), at('c', true)]).map(r => r.length)).toEqual([1, 1, 1])
  })

  it('answers nothing for nothing', () => {
    expect(groupRows([])).toEqual([])
  })
})

describe('linesFor', () => {
  const w = (width: number, extra: Record<string, unknown> = {}) => ({ width, ...extra })

  it('fits what fits on one line', () => {
    expect(linesFor([w(100), w(100), w(100)], 320, 8)).toBe(1)
  })

  it('wraps when the next item would not fit', () => {
    expect(linesFor([w(100), w(100), w(100), w(100)], 320, 8)).toBe(2)
  })

  /** An item wider than the whole line still gets a line; it never gets zero. */
  it('gives an oversized item a line of its own rather than none', () => {
    expect(linesFor([w(500)], 320, 8)).toBe(1)
  })

  /**
   * Elastic: it takes the leftover and collapses when there is none, so it can never be the
   * thing that pushes a line onto the next one, and it contributes no gap of its own.
   */
  it('costs nothing for a filling item', () => {
    expect(linesFor([w(100), w(0, { fill: true }), w(100), w(100)], 320, 8)).toBe(1)
  })

  it('counts each configured row separately, so a break adds a line', () => {
    expect(linesFor([w(100), w(100, { break: true })], 320, 8)).toBe(2)
  })

  it('answers zero lines for no items', () => {
    expect(linesFor([], 320, 8)).toBe(0)
  })
})

describe('INSET', () => {
  it('is the shared card padding the floors price against', () => {
    expect(INSET).toBe(16)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/core/wrapping.test.ts`
Expected: FAIL — `Failed to resolve import "./wrapping"`.

- [ ] **Step 3: Create `src/core/wrapping.ts`**

```ts
/**
 * How a row of content-width things wraps, and how many lines that takes.
 *
 * Extracted from `chips/layout.ts` when the tiles card needed the same arithmetic over a
 * different item. Two cards wanting a thing is the point at which where it belongs becomes a
 * question worth answering — the same move `moveRow` and the tint palette already made.
 *
 * Worth stating what is being protected, because every line of this was earned by a bug the
 * chips card shipped and a user reported:
 *
 *  - the width must come from the card's own measurement rather than an assumed section width,
 *    or a card in a wide column is priced for a narrow one and buys empty rows;
 *  - each item must be priced from what it actually draws rather than a flat constant per kind,
 *    or a row that visibly fits is counted as two lines;
 *  - a filling item is elastic and costs nothing, or it invents a line the browser never draws;
 *  - the container's inset has to be passed in rather than assumed, because `glass` insets by
 *    nothing and `card` by 16.
 *
 * Those four are not obvious and are not recoverable by reading the rendered output. A second
 * copy of this file would lose them one at a time.
 *
 * Every number is a design unit: pixels at `scale: 1`.
 */

/** Must match `--cw-inset`, the padding inside the card — in `card` mode. `glass` passes 0. */
export const INSET = 16

/**
 * One thing being laid out, as far as the wrapping is concerned.
 *
 * Deliberately narrow: a width, and two flags. A caller's own view type satisfies it
 * structurally, which is what lets one function serve a chip and a tile without either card
 * learning about the other.
 */
export interface WrapItem {
  width: number
  /** Starts a new row. */
  break?: boolean
  /** Absorbs the row's leftover width; costs nothing and never pushes a line. */
  fill?: boolean
}

/**
 * The items split into the rows they were asked to be drawn on.
 *
 * An item carrying `break` starts a new row; everything else joins the row before it. A `break`
 * on the very first item is ignored rather than honoured into a leading empty row: every item
 * starts a row when it is the first one, so the flag says nothing there. That matters more than
 * it sounds, because dragging an item to the top is how a config acquires one, and an empty row
 * is a row of unexplained gap above the card's content.
 *
 * Generic over anything carrying `break`, so a caller passes its own rows and gets its own rows
 * back rather than a projection it then has to map against.
 */
export const groupRows = <T extends { break?: boolean }>(items: readonly T[]): T[][] => {
  const rows: T[][] = []
  for (const item of items) {
    if (item.break === true && rows.length > 0) rows.push([item])
    else if (rows.length === 0) rows.push([item])
    else (rows[rows.length - 1] as T[]).push(item)
  }
  return rows
}

/**
 * How many lines these items wrap onto at `usable` width.
 *
 * Each configured row wraps on its own, so the total is the sum of each row's own wrapping
 * rather than of the whole list's: a card using `break` split one-and-two is two lines, not one,
 * and an under-reported line count is a card handed a box too short for its content, which
 * `ha-card` resolves by clipping rather than by spilling.
 */
export const linesFor = (items: readonly WrapItem[], usable: number, gap: number): number =>
  groupRows(items).reduce((total, row) => {
    let used = 0
    let rowLines = 1
    for (const item of row) {
      // Elastic, so it never pushes a line, and it is skipped outright rather than contributing
      // a gap of its own.
      if (item.fill === true || item.width === 0) continue
      const need = used === 0 ? item.width : used + gap + item.width
      // `used > 0` is what stops an item wider than the whole line from wrapping onto a line it
      // would not fit either: it gets the line it is on, and overflows it visibly rather than
      // being counted twice.
      if (need > usable && used > 0) {
        rowLines += 1
        used = item.width
      } else {
        used = need
      }
    }
    return total + rowLines
  }, 0)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/wrapping.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Point the chips card at it**

In `src/cards/chips/layout.ts`:

1. Delete the `groupRows` declaration and the `INSET` declaration.
2. Add near the other imports:

```ts
import { groupRows, linesFor, INSET } from '../../core/wrapping'
```

3. Re-export both names, because `chips-card.ts` and `chips/layout.test.ts` import them from here:

```ts
// Re-exported rather than relocated in every caller: `groupRows` is this card's rows as far as
// the card is concerned, and `INSET` is its own padding. Where the arithmetic lives is
// `core/wrapping.ts`'s business, not theirs.
export { groupRows, INSET } from '../../core/wrapping'
```

4. Replace the hand-rolled line-counting `reduce` inside `floorsFor` with a call to `linesFor`, mapping each chip to its width once:

```ts
const lines = linesFor(
  chips.map(chip => ({
    width: widthOf(chip),
    ...(chip.break === true ? { break: true } : {}),
    ...(chip.fill === true ? { fill: true } : {}),
  })),
  usable,
  GAP,
)
```

The conditional spreads are not decoration: `exactOptionalPropertyTypes` rejects `break: undefined` against `break?: boolean`.

- [ ] **Step 6: Run everything**

Run: `pnpm typecheck && pnpm test`
Expected: PASS, 467 + 12 = 479 tests. **No chips test may be edited.** If one fails, the extraction changed behaviour and the extraction is wrong — fix the code, not the test.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add src/core/wrapping.ts src/core/wrapping.test.ts src/cards/chips/layout.ts
git commit -m "refactor(core): the wrapping arithmetic moves out of the chips card"
```

---

## Task 2: `tintFor` moves to `core/tint.ts`

The tiles card tints automatically from what an entity is. That function exists, in the complication card, and has since it shipped.

**Files:**

- Modify: `src/core/tint.ts` (gains `tintFor` and its two tables)
- Modify: `src/cards/complication/tint.ts` (re-export it; keep `onTintVar`)
- Modify: `src/core/tint.test.ts` (gains the moved tests)
- Modify: `src/cards/complication/tint.test.ts` (**loses** its `tintFor` block — see Step 2)

**Interfaces:**

- Consumes: `TintName`, `TINTS` (already in `core/tint.ts`), `HassEntity`.
- Produces: `tintFor(entity: HassEntity): TintName` from `core/tint`.

- [ ] **Step 1: Read what is moving**

Run: `sed -n '1,110p' src/cards/complication/tint.ts`

`BY_DEVICE_CLASS`, `BY_DOMAIN` and `tintFor` move verbatim. `onTintVar` and `NEEDS_DARK_ON_TINT` stay — they are about drawing content _on_ a tint, which only the complication card does.

- [ ] **Step 2: Move the tests, do not copy them**

`src/cards/complication/tint.test.ts` already has a `describe('tintFor')` block — checked, it is
there at line 14. Because Step 4 re-exports `tintFor`, that block would keep passing from its old
home, and the result would be two copies of the same assertions drifting apart. **Delete it from
`complication/tint.test.ts`** as part of this step, leaving that file testing only `onTintVar`,
which is what stays behind. Then remove `tintFor` from that file's import line.

The block below is the replacement, richer than the one being deleted; write it in
`src/core/tint.test.ts`:

```ts
import type { HassEntity } from './types/ha'

const entity = (entity_id: string, attributes: Record<string, unknown> = {}): HassEntity =>
  ({ entity_id, state: '0', attributes, last_changed: '', last_updated: '' }) as HassEntity

/**
 * The tint an entity gets when nobody has said. Moved here from the complication card when the
 * tiles card became its second caller — the same test §10 of the family spec sets, and the one
 * that moved `ring.ts` and the palette before it.
 */
describe('tintFor', () => {
  it('reads device_class first, because it is the more specific claim', () => {
    expect(tintFor(entity('sensor.hallway', { device_class: 'temperature' }))).toBe('orange')
    expect(tintFor(entity('sensor.tank', { device_class: 'humidity' }))).toBe('blue')
  })

  it('falls back to the domain for an entity with no device class', () => {
    expect(tintFor(entity('lock.front_door'))).toBe('red')
    expect(tintFor(entity('light.kitchen'))).toBe('yellow')
    expect(tintFor(entity('person.joe'))).toBe('blue')
  })

  it('prefers what an entity measures over what it is', () => {
    // A light reporting a temperature is a thermometer, whatever its domain says.
    expect(tintFor(entity('light.sensor_lamp', { device_class: 'temperature' }))).toBe('orange')
  })

  /** `accent` is the theme's own primary, so an unrecognised entity still fits the dashboard. */
  it('answers accent for what neither table knows', () => {
    expect(tintFor(entity('sensor.mystery'))).toBe('accent')
    expect(tintFor(entity('wibble.thing'))).toBe('accent')
  })
})
```

Add `tintFor` to the existing `import { … } from './tint'` at the top of that file.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/core/tint.test.ts`
Expected: FAIL — `tintFor is not a function`.

- [ ] **Step 4: Move the code**

Cut `BY_DEVICE_CLASS`, `BY_DOMAIN` and `tintFor` out of `src/cards/complication/tint.ts` and paste them into `src/core/tint.ts` unchanged. `core/tint.ts` will need `import type { HassEntity } from './types/ha'`.

In `src/cards/complication/tint.ts`, re-export it beside the existing palette re-export:

```ts
export { TINTS, tintFor, tintVar, type TintName } from '../../core/tint'
```

and make sure the file's own `import` line brings in only what `onTintVar` and `NEEDS_DARK_ON_TINT` still reference — an unused import is a typecheck error here.

- [ ] **Step 5: Run everything**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. The complication card's own files should need no edit; the re-export is what keeps them working.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/core/tint.ts src/core/tint.test.ts src/cards/complication/tint.ts
git commit -m "refactor(core): tintFor moves out of the complication card"
```

---

## Task 3: `tiles/model.ts` — what a tile is

**Files:**

- Create: `src/cards/tiles/model.ts`
- Create: `src/cards/tiles/model.test.ts`

**Interfaces:**

- Consumes: `isTemplate`, `TemplateRequest` (`core/templates`); `colorValue`, `tintFor` (`core/tint`); `formatValue`, `iconFor`, `isUnavailable`, `nameFor`, `pictureFor`, `VALUE_DASH` (`core/entity-view`); `ACTION_NAMES`, `DEFAULT_ACTION`, `ActionConfig`, `ActionName` (`core/actions`).
- Produces:
  - `interface TileConfig { entity?, name?, icon?, color?, value?, show?, break?, tap_action? }`
  - `interface TileView { entityId, name, icon, picture, value, color, unavailable, visible, break, action }`
  - `interface TilesDefaults { color?: string }`
  - `tileConfigs(tiles: unknown): TileConfig[]`
  - `tileWatchedIds(tiles: unknown): string[]`
  - `tileTemplates(tiles: unknown, defaults: TilesDefaults): TemplateRequest[]`
  - `readTiles(hass, tiles, defaults, resolve?): TileView[]`
  - `readTile(hass, row, defaults?, resolve?): TileView`
  - `tileKeys(rows: readonly TileConfig[]): string[]`
  - `tileRows(rows: readonly TileConfig[]): (string | TileConfig)[]`
  - `tileToForm(config: TileConfig): Record<string, unknown>`
  - `tileFromForm(prior: TileConfig, data: Record<string, unknown>): TileConfig`
  - `TILE_FALLBACK_ICON = 'mdi:apps'`

This is deliberately the chips model's shape. **Read `src/cards/chips/model.ts` end to end before starting** — it is the reference, and every departure below is intentional rather than an oversight:

| Chips                     | Tiles              | Why                                                         |
| ------------------------- | ------------------ | ----------------------------------------------------------- |
| `content` per chip        | none               | every tile draws icon + name + value                        |
| `fill`                    | none               | a fixed-width grid has no use for an elastic item           |
| `spacer`                  | none               | ditto — an entity-less tile is a navigation tile, not a gap |
| colour opt-in             | `tintFor` fallback | §3 of the spec                                              |
| `FALLBACK_ICON` `mdi:eye` | `mdi:apps`         | a tile with no icon is a shortcut, not an unreadable sensor |

- [ ] **Step 1: Write the failing test**

Create `src/cards/tiles/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  readTile,
  readTiles,
  tileConfigs,
  tileFromForm,
  tileKeys,
  tileRows,
  tileTemplates,
  tileToForm,
  tileWatchedIds,
  type TileConfig,
} from './model'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    ...over,
  }) as HassEntity

const hassWith = (...list: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
  }) as unknown as HomeAssistant

const GARAGE = entity({
  entity_id: 'cover.garage',
  state: 'closed',
  attributes: { friendly_name: 'Garage', device_class: 'garage' },
})

describe('readTiles', () => {
  it('reads a bare id into a drawable tile', () => {
    const [tile] = readTiles(hassWith(GARAGE), ['cover.garage'], {})
    expect(tile).toMatchObject({
      entityId: 'cover.garage',
      name: 'Garage',
      unavailable: false,
      visible: true,
      break: false,
    })
    expect(tile?.value).not.toBe('')
  })

  /** §3: a tile carries an identity, unlike a chip. */
  it('tints itself from what the entity is, with no colour configured', () => {
    const [tile] = readTiles(hassWith(GARAGE), ['cover.garage'], {})
    expect(tile?.color).toBe('var(--cw-indigo)')
  })

  it('lets a configured colour beat the automatic one', () => {
    const [tile] = readTiles(hassWith(GARAGE), [{ entity: 'cover.garage', color: 'green' }], {})
    expect(tile?.color).toBe('var(--cw-green)')
  })

  it('lets a card-level colour beat the automatic one, and a tile beat the card', () => {
    const tiles = readTiles(
      hassWith(GARAGE),
      ['cover.garage', { entity: 'cover.garage', color: 'red' }],
      { color: 'blue' },
    )
    expect(tiles.map(t => t.color)).toEqual(['var(--cw-blue)', 'var(--cw-red)'])
  })

  /** The dim is the signal that a tile is not reporting; a crisp tint undercuts it. */
  it('drops the colour of a tile that is not reporting', () => {
    const dead = entity({
      entity_id: 'cover.garage',
      state: 'unavailable',
      attributes: { friendly_name: 'Garage' },
    })
    expect(readTiles(hassWith(dead), ['cover.garage'], {})[0]).toMatchObject({
      unavailable: true,
      color: undefined,
      value: '—',
    })
  })
})

/**
 * §4: a tile with no entity is a navigation tile — Climate, Scenes and Cats in the config being
 * replaced are exactly this. Unlike a chip it is never a spacer.
 */
describe('a tile with no entity', () => {
  it('draws what it was given and never becomes a spacer', () => {
    const [tile] = readTiles(hassWith(), [{ name: 'Climate', icon: 'mdi:snowflake' }], {})
    expect(tile).toMatchObject({
      entityId: undefined,
      name: 'Climate',
      icon: 'mdi:snowflake',
      unavailable: false,
    })
  })

  /** §5: the state line is a dash rather than absent, so the grid stays regular. */
  it('draws a dash for its state line rather than collapsing', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.value).toBe('—')
  })

  it('defaults its press to doing nothing, not more-info', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.action).toEqual({ action: 'none' })
  })

  it('honours an explicit tap action', () => {
    const [tile] = readTiles(
      hassWith(),
      [{ name: 'Climate', tap_action: { action: 'navigate', navigation_path: '/cat-climate' } }],
      {},
    )
    expect(tile?.action).toEqual({ action: 'navigate', navigation_path: '/cat-climate' })
  })

  it('has no automatic tint, having no entity to read one from', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.color).toBeUndefined()
  })
})

describe('templates', () => {
  const resolve = (map: Record<string, string>) => (t: string) => map[t]

  it('replaces the state line', () => {
    const [tile] = readTiles(
      hassWith(GARAGE),
      [{ entity: 'cover.garage', value: '{{ v }}' }],
      {},
      resolve({ '{{ v }}': 'All Closed' }),
    )
    expect(tile?.value).toBe('All Closed')
  })

  it('falls back to the entity reading before a template answers', () => {
    const [tile] = readTiles(
      hassWith(GARAGE),
      [{ entity: 'cover.garage', value: '{{ v }}' }],
      {},
      () => undefined,
    )
    expect(tile?.value).not.toBe('')
  })

  it('hides a tile whose show template is false', () => {
    const tiles = readTiles(
      hassWith(GARAGE),
      [
        { entity: 'cover.garage', show: '{{ a }}' },
        { entity: 'cover.garage', show: '{{ b }}' },
      ],
      {},
      resolve({ '{{ a }}': 'True', '{{ b }}': 'False' }),
    )
    expect(tiles.map(t => t.visible)).toEqual([true, false])
  })

  it('asks for every templatable field, and carries the row entity as a variable', () => {
    const requests = tileTemplates(
      [{ entity: 'cover.garage', name: '{{ n }}', value: '{{ v }}', color: '{{ c }}' }],
      {},
    )
    expect(requests.map(r => r.template).sort()).toEqual(['{{ c }}', '{{ n }}', '{{ v }}'])
    expect(requests[0]?.variables).toEqual({ config: { entity: 'cover.garage' } })
  })

  it('gives an entity-less row no variables, matching the card-level colour', () => {
    expect(tileTemplates([{ name: '{{ n }}' }], {})).toEqual([{ template: '{{ n }}' }])
  })
})

describe('tileConfigs', () => {
  it('keeps a row with no entity', () => {
    expect(tileConfigs([{ name: 'Climate' }])).toEqual([{ name: 'Climate' }])
  })

  it('reads a bare string as an entity', () => {
    expect(tileConfigs(['cover.garage'])).toEqual([{ entity: 'cover.garage' }])
  })

  it('drops what cannot be a tile at all', () => {
    expect(tileConfigs([null, 42, 'cover.garage'])).toEqual([{ entity: 'cover.garage' }])
  })
})

describe('tileWatchedIds', () => {
  it('contributes nothing for a tile with no entity', () => {
    expect(tileWatchedIds(['cover.garage', { name: 'Climate' }])).toEqual(['cover.garage'])
  })
})

describe('tileKeys', () => {
  it('keys by entity, suffixing repeats and positioning the entity-less', () => {
    expect(tileKeys([{ entity: 'cover.a' }, { name: 'X' }, { entity: 'cover.a' }])).toEqual([
      'cover.a',
      '#1',
      'cover.a#1',
    ])
  })
})

describe('the form round trip', () => {
  const bare: TileConfig = { entity: 'cover.garage' }

  it('round-trips a row nobody has overridden', () => {
    expect(tileFromForm(bare, tileToForm(bare))).toEqual(bare)
  })

  it('writes no tap_action for a bare more-info', () => {
    expect(tileFromForm(bare, { ...tileToForm(bare), name: 'Garage' })).toEqual({
      entity: 'cover.garage',
      name: 'Garage',
    })
  })

  it('turns a tile into an entity-less one rather than deleting it', () => {
    expect(tileFromForm(bare, { ...tileToForm(bare), entity: '' })).toEqual({})
  })

  it('carries the YAML-only action keys through an unrelated edit', () => {
    const prior: TileConfig = {
      entity: 'cover.garage',
      tap_action: {
        action: 'call-service',
        service: 'cover.open_cover',
        target: { entity_id: 'cover.garage' },
        data: { x: 1 },
      },
    }
    expect(tileFromForm(prior, { ...tileToForm(prior), name: 'Garage' })).toEqual({
      ...prior,
      name: 'Garage',
    })
  })
})

describe('tileRows', () => {
  it('flattens a row that says nothing more than its own id', () => {
    expect(tileRows([{ entity: 'cover.a' }, { entity: 'cover.b', name: 'B' }])).toEqual([
      'cover.a',
      { entity: 'cover.b', name: 'B' },
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/cards/tiles/model.test.ts`
Expected: FAIL — `Failed to resolve import "./model"`.

- [ ] **Step 3: Write `src/cards/tiles/model.ts`**

Copy `src/cards/chips/model.ts` and adapt it. The five differences are the table in this task's preamble. Concretely:

- `TileConfig` is `ChipConfig` minus `content` and `fill`.
- `TileView` is `ChipView` minus `content`, `fill` and `spacer`.
- `readTile`'s entity-less branch: `name: name ?? ''`, `icon: icon ?? TILE_FALLBACK_ICON`, `value: value ?? VALUE_DASH`, `color: colorValue(field(row.color, …) ?? field(defaults.color, undefined))`, `unavailable: false`, `action: readAction(…, NO_TARGET_ACTION)`. There is no `spacer` computation at all.
- `readTile`'s entity branch colour: the configured colour, then the card default, then `tintVar(tintFor(entity))` — and `undefined` when `unavailable`:

```ts
    color: unavailable
      ? undefined
      : (colorValue(field(row.color, row.entity) ?? field(defaults.color, undefined)) ??
        tintVar(tintFor(entity))),
```

- `TEMPLATED_FIELDS` is `['name', 'icon', 'color', 'value', 'show']` — the same five; `content` is gone and was never templatable anyway.
- `tileToForm`/`tileFromForm` are `chipToForm`/`chipFromForm` minus the `content` key and its `CONTENT_INHERIT` sentinel, and minus `fill`. Keep `break`.

Import `tintFor` and `tintVar` from `../../core/tint`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/cards/tiles/model.test.ts`
Expected: PASS. Then `pnpm typecheck && pnpm test`.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/tiles/
git commit -m "feat(tiles): what a tile is, and how a config row becomes one"
```

---

## Task 4: `tiles/layout.ts` — the grid's floor

**Files:**

- Create: `src/cards/tiles/layout.ts`
- Create: `src/cards/tiles/layout.test.ts`

**Interfaces:**

- Consumes: `groupRows`, `linesFor`, `INSET`, `WrapItem` (`core/wrapping`); `columnsFor`, `gridColumnsToPx`, `rowsFor`, `Floors` (`core/floors`).
- Produces:
  - `const TILE_WIDTH = 112`, `const TILE_HEIGHT = 96`, `const GAP = 8`
  - `interface TileBand { break?: boolean }`
  - `floorsFor(tiles: readonly TileBand[], measured?: number, inset?: number): Floors`

- [ ] **Step 1: Write the failing test**

Create `src/cards/tiles/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { floorsFor, TILE_HEIGHT, TILE_WIDTH } from './layout'

const tiles = (n: number, at?: number) =>
  Array.from({ length: n }, (_, i) => (i === at ? { break: true } : {}))

describe('the tile size', () => {
  it('is the shape the spec picked, wider than tall', () => {
    expect(TILE_WIDTH).toBe(112)
    expect(TILE_HEIGHT).toBe(96)
    expect(TILE_WIDTH).toBeGreaterThan(TILE_HEIGHT)
  })
})

describe('floorsFor', () => {
  it('never asks for less than the library minimum, even with no tiles', () => {
    expect(floorsFor([])).toEqual({ min_columns: 4, min_rows: 1 })
  })

  it('fits more tiles per line in a wider card, and so asks for less height', () => {
    const wide = floorsFor(tiles(4), 640, 0)
    const narrow = floorsFor(tiles(4), 260, 0)
    expect(narrow.min_rows).toBeGreaterThan(wide.min_rows)
  })

  it('grows as tiles are added', () => {
    expect(floorsFor(tiles(8), 260, 0).min_rows).toBeGreaterThan(
      floorsFor(tiles(2), 260, 0).min_rows,
    )
  })

  /** A break splits one line into two, and the floor has to know or the card clips. */
  it('asks for the height a forced row actually needs', () => {
    const flowing = floorsFor(tiles(4), 640, 0)
    const split = floorsFor(tiles(4, 2), 640, 0)
    expect(split.min_rows).toBeGreaterThan(flowing.min_rows)
  })

  /**
   * Glass insets by nothing, and the difference is not cosmetic: it is what decides whether a
   * row of tiles fits the grid rows it asks for. The chips card lost a release to this.
   */
  it('asks for less when nothing is inset', () => {
    expect(floorsFor(tiles(4), 640, 0).min_rows).toBeLessThanOrEqual(
      floorsFor(tiles(4), 640, 16).min_rows,
    )
  })

  it('is wide enough for two tiles side by side', () => {
    expect(floorsFor(tiles(4)).min_columns).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/cards/tiles/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Write `src/cards/tiles/layout.ts`**

```ts
/**
 * How tall a grid of tiles is, and how much box the card must be allowed to have.
 *
 * Small, because `core/wrapping.ts` does the arithmetic and this file only supplies the
 * numbers. That split is the point of the extraction: a tile and a chip wrap by the same rules
 * and differ only in how wide one of them is.
 *
 * Every number is a design unit: pixels at `scale: 1`, matching the stylesheet in
 * `tiles-card.ts` multiplied by `var(--cw-scale)`.
 */

import { columnsFor, gridColumnsToPx, rowsFor, type Floors } from '../../core/floors'
import { groupRows, linesFor, INSET } from '../../core/wrapping'

export { groupRows, INSET }

/**
 * One tile's footprint.
 *
 * A tile does NOT size to its content, which is the one place this card and the chips card
 * genuinely disagree about layout rather than about numbers: a chip is a label and wants to be
 * as wide as its label, and a grid of ragged-width tiles is not a grid. 112 x 96 is wide enough
 * for a two-word name at footnote size and close to the shape of the cards this replaces.
 * Flagged in §9 of the spec as chosen rather than measured — one constant to change.
 */
export const TILE_WIDTH = 112
export const TILE_HEIGHT = 96

/** The gap between tiles, across and down. Must match `--cw-space-2`. */
export const GAP = 8

/**
 * The fewest tiles the floor pretends fit across, so a multi-tile card cannot be dragged into a
 * single column. Two rather than the chips card's three: a tile is more than twice a chip's
 * width, and a floor of three would make the narrowest reachable card wider than most sections.
 */
const FLOOR_TILES_ACROSS = 2

/** The one thing the floor reads off a tile. A full `TileView` satisfies it structurally. */
export interface TileBand {
  break?: boolean
}

/**
 * The floor: wide enough for two tiles side by side, and tall enough for every line they wrap
 * onto at the width the card actually has.
 *
 * `measured` is the card's own width in design units once the ResizeObserver has reported one.
 * Without it the lines are counted against an assumed section, which is how the chips card spent
 * four releases handing users empty grid rows.
 */
export const floorsFor = (
  tiles: readonly TileBand[],
  measured?: number,
  inset: number = INSET,
): Floors => {
  const across = Math.min(Math.max(tiles.length, 1), FLOOR_TILES_ACROSS)
  const min_columns = columnsFor(across * TILE_WIDTH + (across - 1) * GAP + 2 * inset)

  if (tiles.length === 0) return { min_columns, min_rows: 1 }

  const usable = Math.max(TILE_WIDTH, (measured ?? gridColumnsToPx(min_columns)) - 2 * inset)

  const lines = linesFor(
    tiles.map(tile => ({
      width: TILE_WIDTH,
      ...(tile.break === true ? { break: true } : {}),
    })),
    usable,
    GAP,
  )

  const content = lines * TILE_HEIGHT + (lines - 1) * GAP + 2 * inset

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/cards/tiles/layout.test.ts`
Expected: PASS. Then `pnpm typecheck && pnpm test`.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/tiles/layout.ts src/cards/tiles/layout.test.ts
git commit -m "feat(tiles): the grid floor, on the shared wrapping arithmetic"
```

---

## Task 5: `tiles-card.ts` — the element

**Files:**

- Create: `src/cards/tiles/tiles-card.ts`
- Modify: `src/index.ts` (import for the side effect, re-export the tag)

**Interfaces:**

- Consumes: everything from Tasks 3 and 4, plus `CupertinoCard` (`core/base-card`), `TemplatePool`/`requestKey` (`core/templates`), `isPressable`/`runAction` (`core/actions`), `withFloors`/`Floors` (`core/floors`), `registerCard` (`core/register`).
- Produces: `TILES_CARD_TAG = 'cupertino-plus-tiles'`, `interface TilesCardConfig`.

**Read `src/cards/chips/chips-card.ts` end to end first.** This element is its sibling and every hard-won piece of it applies here: the template pool's lifecycle, the measured-width floor, the high-water mark, the glass/card container split, the press handlers bound unconditionally, and the row containers.

- [ ] **Step 1: Write the card**

The structure, in order:

```ts
export const TILES_CARD_TAG = 'cupertino-plus-tiles'

export interface TilesCardConfig extends CupertinoCardConfig {
  tiles?: unknown
  color?: string
  container?: ChipsContainer // imported from chips/model — one vocabulary, not two
}
```

Copy these from `chips-card.ts` unchanged in shape, substituting tile names:

- `_templates = new TemplatePool(() => this.requestUpdate())`, `disconnectedCallback`, `willUpdate` calling `super` then `this._templates.sync(this.hass, tileTemplates(this._config.tiles, this._defaults))`
- `watchedEntities()` → `tileWatchedIds(this._config?.tiles)`
- `_defaults` → `{ ...(color ? { color } : {}) }`
- `_tiles` getter with the resolver, **reconstructing `requestKey` exactly as `tileTemplates` builds it** — no `variables` key at all when there is no entity. A mismatch here is silent and the chips card shipped it once.
- `_floorWidth`, `_floorInset`, `_floorMax`, `_floorFor`, `getGridOptions` returning `{ ...withFloors(super.getGridOptions(), floors), rows: floors.min_rows }`
- `_press`, `_key`

`render()`:

```ts
const tiles = this._tiles.filter(tile => tile.visible)
const container = this._config.container ?? DEFAULT_CONTAINER
const klass = container === 'glass' ? 'glass' : 'surface'

if (tiles.length === 0) {
  return html`<ha-card class=${klass}><div class="empty">${NO_TILES}</div></ha-card>`
}

return html`
  <ha-card class=${klass} aria-label=${`${tiles.length} tiles`}>
    <div class="tiles">
      ${groupRows(tiles).map(
        row => html`<div class="row">${row.map(tile => this._renderTile(tile))}</div>`,
      )}
    </div>
  </ha-card>
`
```

`_renderTile(tile)` draws a fixed-size box: the icon (or `<img class="portrait">` when `tile.picture`), the name, the state line. `role`/`tabindex`/`aria-label` exactly as the chips card does, including that a `none` action is not a button. Accessible name is `` `${tile.name}, ${tile.unavailable ? 'unavailable' : tile.value}` `` with the same empty-part filter.

The stylesheet, with **no backticks in any comment**:

```css
ha-card.glass {
  background: none;
  border: none;
  box-shadow: none;
}

.tiles {
  display: flex;
  flex-direction: column;
  gap: var(--cw-space-2);
  padding: var(--cw-inset);
  align-content: flex-start;
  min-width: 0;
}

/* Glass paints no surface, so an inset is padding inside a box nobody can see: across it
         misaligns the grid from every other card in the column, and down it buys empty grid
         rows. The chips card lost a release to each half of this. */
.glass .tiles {
  padding: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-2);
  min-width: 0;
}

.tile {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: calc(112px * var(--cw-scale));
  height: calc(96px * var(--cw-scale));
  padding: calc(12px * var(--cw-scale));
  border-radius: calc(20px * var(--cw-scale));
  box-sizing: border-box;
  transition: opacity var(--cw-duration-fast) var(--cw-ease);
}

.glass .tile {
  color: var(--cw-label);
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--cw-label) 10%, transparent),
    color-mix(in srgb, var(--cw-label) 18%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 8%, transparent);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
}

:host([dark]) .glass .tile {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--cw-label) 16%, transparent),
    color-mix(in srgb, var(--cw-label) 9%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 20%, transparent);
}

.surface .tile {
  color: var(--cw-label);
  background: var(--cw-track);
}

/* A tinted tile washes itself, at the weights a tinted chip uses. */
.glass .tile.tinted {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--cw-tile-tint) 16%, transparent),
    color-mix(in srgb, var(--cw-tile-tint) 24%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-tile-tint) 22%, transparent);
}

:host([dark]) .glass .tile.tinted {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--cw-tile-tint) 30%, transparent),
    color-mix(in srgb, var(--cw-tile-tint) 20%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-tile-tint) 38%, transparent);
}

.surface .tile.tinted {
  background: color-mix(in srgb, var(--cw-tile-tint) 22%, var(--cw-track));
}

.glyph {
  --mdc-icon-size: calc(24px * var(--cw-scale));
  flex: none;
  color: var(--cw-tile-tint, inherit);
}

.portrait {
  width: calc(26px * var(--cw-scale));
  height: calc(26px * var(--cw-scale));
  border-radius: 50%;
  object-fit: cover;
}

.name {
  font: var(--cw-text-footnote);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.state {
  font: var(--cw-text-caption-2);
  color: var(--cw-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile.unknown {
  opacity: 0.55;
}
.tile.cw-pressable:active {
  opacity: 0.8;
}
.tile.unknown.cw-pressable:active {
  opacity: 0.44;
}
.tile[role='button']:focus-visible {
  outline: 2px solid var(--cw-accent);
  outline-offset: 2px;
}

.empty {
  font: var(--cw-text-callout);
  color: var(--cw-label-secondary);
  margin: auto;
}

@media (prefers-reduced-motion: reduce) {
  .tile {
    transition: none;
  }
}
```

Register at the bottom:

```ts
registerCard(TILES_CARD_TAG, CupertinoTilesCard, {
  name: 'Cupertino Tiles',
  description: 'A grid of shortcut tiles for your dashboard.',
})
```

- [ ] **Step 2: Wire it into the bundle**

In `src/index.ts`, beside the chips card's two lines:

```ts
import './cards/tiles/tiles-card'
```

```ts
export { TILES_CARD_TAG } from './cards/tiles/tiles-card'
```

- [ ] **Step 3: Check it compiles and nothing regressed**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS. No new tests here — this is an element.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/cards/tiles/tiles-card.ts src/index.ts
git commit -m "feat(tiles): the card"
```

---

## Task 6: The showcase, and the first look

The tile size is flagged in §9 as chosen rather than measured. This is where it gets measured.

**Files:**

- Create: `dev/tile-fixtures.ts`
- Modify: `dev/site/catalog.ts` (a `tiles` widget entry)
- Modify: `dev/shots.ts` (shots)

**Interfaces:**

- Produces: `TILE_STATES`, `TILE_SETS`, `tileSet(name)`, mirroring `dev/chip-fixtures.ts`.

- [ ] **Step 1: Write the fixtures**

Model `dev/tile-fixtures.ts` on `dev/chip-fixtures.ts`. The default set reproduces the four cards being replaced, because the whole point is comparing against them:

```ts
export const TILE_SETS: Record<string, readonly unknown[]> = {
  shortcuts: [
    { entity: GARAGE, name: 'Garage', icon: 'mdi:garage', value: 'All Closed' },
    {
      name: 'Climate',
      icon: 'mdi:snowflake',
      color: 'blue',
      tap_action: { action: 'navigate', navigation_path: '/cat-climate' },
    },
    {
      name: 'Scenes',
      icon: 'mdi:party-popper',
      color: 'purple',
      tap_action: { action: 'navigate', navigation_path: '/scenes' },
    },
    {
      name: 'Cats',
      icon: 'mdi:cat',
      color: 'orange',
      tap_action: { action: 'navigate', navigation_path: '/cat-pets' },
    },
  ],
  entities: [HALL_TEMPERATURE, KITCHEN_LIGHT, FRONT_DOOR, JOE],
  unavailable: [SHED_TEMPERATURE, HALL_TEMPERATURE],
}
```

Reuse the entity constants and `HassEntity` shapes from `dev/chip-fixtures.ts` by importing them rather than redeclaring — a second `sensor.hall_temperature` with a different reading is how the showcase starts lying.

- [ ] **Step 2: Add the catalog entry and the shots**

Follow the `chips` entry in `dev/site/catalog.ts`, with one omission: its `content` prop (the
card-level content mode) has no tiles equivalent, because a tile has no content modes. The tiles
entry's props are the fixture-set select, the container select and the shared scale — checked
against the chips entry, which is at `dev/site/catalog.ts:417`. Then add to `dev/shots.ts`:

```ts
  { name: 'tiles-glass', caption: 'four shortcut tiles on glass, each tinted for what it is',
    tag: TILES_CARD_TAG, config: tilesShot('shortcuts'), columns: 12, rows: 4, theme: 'light' },
  { name: 'tiles-dark', caption: 'the same grid against a dark ground',
    tag: TILES_CARD_TAG, config: tilesShot('shortcuts'), columns: 12, rows: 4, theme: 'dark' },
  { name: 'tiles-entities', caption: 'plain entity tiles: the tint comes from what each one is',
    tag: TILES_CARD_TAG, config: tilesShot('entities'), columns: 12, rows: 4, theme: 'light' },
```

- [ ] **Step 3: Look at it**

Run: `pnpm shots`, then read `docs/images/tiles-glass.png` and `docs/images/tiles-dark.png`.

Judge three things and change the constants if they are wrong — this is the step §9 asked for:

1. **112 × 96.** Does a two-word name fit without ellipsis? Is the tile too tall for its content, or too cramped?
2. **The automatic tints.** Does a `cover` reading indigo and a `scene` reading `accent` look right in a grid, or does the palette need a tiles-specific table?
3. **The wash weight.** It was tuned for a small pill; a tile is six times the area, and the same alpha may read as much stronger.

Record what you changed and why in the commit message.

- [ ] **Step 4: Drive it in the browser**

Run `pnpm dev`, open `http://localhost:5173/#/tiles`, and confirm with Playwright:

- `getGridOptions()` reports a `rows` that matches the rendered content, not the shared `rows: 4` default;
- the grid reflows — at 640px wide it fits more per line than at 260px;
- a press on a navigation tile does not throw (the console stays clean);
- an unavailable tile is dimmed and untinted.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm test && pnpm format
git add dev/ docs/images/
git commit -m "feat(tiles): the showcase, and the size settled against a render"
```

---

## Task 7: The editor

**Files:**

- Create: `src/cards/tiles/tile-list-editor.ts`
- Create: `src/cards/tiles/tiles-card-editor.ts`
- Modify: `src/cards/tiles/tiles-card.ts` (`getConfigElement`)
- Modify: `src/cards/tiles/model.test.ts` (form round-trip cases, if Task 3's did not cover the colour fold)

**Interfaces:**

- Consumes: `tileConfigs`, `tileKeys`, `tileRows`, `tileToForm`, `tileFromForm`, `readTile` (Task 3); `COLOR_SELECTOR`, `COLOR_CUSTOM` (`chips/model` — imported, not re-declared); `CupertinoCardEditor` (`core/card-editor`).
- Produces: `TILES_EDITOR_TAG`, `TILES_LIST_TAG`, `interface TilesChangedDetail`.

**The decision §9 left to this plan: do not extract the list editor yet.** There would then be three copies (battery, chips, tiles), which is exactly where drift starts — but extracting a shared sortable-panel-list from two shipped editors is a refactor of working code with no test coverage below the DOM, and doing it _while_ writing a third consumer means a bug in the extraction and a bug in the new card are indistinguishable. Write the third copy, then extract all three in a task of its own with the three working editors as the spec. Record that as a follow-up in the rules doc.

- [ ] **Step 1: Write the list editor**

Copy `src/cards/chips/chip-list-editor.ts` and adapt. Remove: the content dropdown, the fill switch. Keep: entity picker, colour dropdown plus `Custom…` with its `_colorCustom` view state, icon, name, the action dropdown with its one conditional argument (including the `navigation` selector outside template mode), the `break` switch hidden on the first row, the template switch with its `_templating` view state, the drag handle, the duplicate button, the delete button, and the two add buttons.

The `_colorCustom` logic has a subtlety worth copying exactly rather than rewriting: a config naming a real palette colour clears the flag before it is read, however that config arrived, so a YAML edit back to `color: red` does not leave the panel showing `Custom…` with `red` typed into it.

- [ ] **Step 2: Write the card editor**

Copy `src/cards/chips/chips-card-editor.ts`. Rows: **Row colour** (the shared `COLOR_SELECTOR` plus its conditional custom field, with the same `toForm`/`fromForm` fold) and **Background**. No content row — there are no content modes. `beforeForm()` renders `<cupertino-plus-tiles-list>` fed by `tileConfigs(this._config.tiles)`, and `_tilesChanged` writes `tiles` back, deleting the key when the list is empty.

- [ ] **Step 3: Point the card at it**

In `tiles-card.ts`:

```ts
import { TILES_EDITOR_TAG } from './tiles-card-editor'

  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement(TILES_EDITOR_TAG) as LovelaceCardEditor
  }
```

- [ ] **Step 4: Drive it in the showcase**

`pnpm dev`, `#/tiles`, expand **Advanced**, and confirm with Playwright:

- adding a tile writes `tiles: ['…']` and opens its panel;
- **Add a blank tile** writes `{}` and opens in template mode;
- Colour → a palette name writes `color: green`; → `Custom…` reveals a text box and writes the literal; clearing removes the key;
- duplicate writes two rows;
- **Start a new row** is absent on the first tile and present on the second;
- the switches never reach the config.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm test && pnpm format
git add src/cards/tiles/
git commit -m "feat(tiles): the visual editor"
```

---

## Task 8: Documentation

**Files:**

- Create: `docs/tiles-widget-rules.md`
- Modify: `README.md` (six cards, not five; a section; the Configuring table)
- Modify: `docs/chips-widget-rules.md` (§3 gains a pointer to the card that took the other side)

- [ ] **Step 1: Write the rules doc**

Follow `docs/chips-widget-rules.md`'s voice: argue for the decisions rather than list them. Sections: what a tile is; the grid and why it wraps rather than taking a column count; colour and why this card carries an identity where the chips card refuses one; templates and the entity-less tile; the state line and its dash; the press; degradation; still open (the three §9 flags, plus the list-editor extraction Task 7 deferred).

Reference `docs/images/tiles-glass.png`.

- [ ] **Step 2: Update the README**

"Five of them" → "Six of them". Add a **The tiles** section after the chips one. Add the row to the Configuring table:

```
| Tiles        | `custom:cupertino-plus-tiles`        | which shortcuts, and what each one opens     |
```

Also update the fork note, which currently reads "The complication, weather and chips cards are the additions here."

- [ ] **Step 3: Commit**

```bash
pnpm format
git add docs/ README.md
git commit -m "docs: the tiles card's rules"
```

---

## Task 9: Release

- [ ] **Step 1: Full check**

```bash
pnpm typecheck && pnpm test && pnpm format:check && pnpm build
```

- [ ] **Step 2: Merge, version, tag** — **stop and ask before pushing.** A push to the fork and an install onto the live Home Assistant are both outward-facing and are not this plan's to take unprompted.

```bash
git checkout worktree-complication-card
git merge --ff-only <branch>
npm version --no-git-tag-version --allow-same-version 1.14.0
git add package.json && git commit -m "chore: release v1.14.0"
git tag -a v1.14.0 -m "v1.14.0 — the tiles card"
```

- [ ] **Step 3: Install** — after consent: push, wait for the Release workflow to attach `cupertino-plus.js`, then `ha_manage_hacs` `update_information` → `download` at `v1.14.0` → bump the dashboard resource's `hacstag` to `13285173971140`.

---

## Notes for the executor

**The chips card is the reference implementation, not a suggestion.** Six things in it were each earned by a bug a user reported: content-priced widths, the measured width, the high-water floor mark, no inset in glass, per-item content rather than a card-wide band, and `requestKey` reconstructed identically on both sides. Tasks 4 and 5 reuse or restate all six. If a step here seems to be doing something the long way, that is why — check the chips card's comment before simplifying it.

**`requestKey` is built in `tileTemplates` and rebuilt in `_tiles`.** They must agree byte for byte, including that an entity-less row carries no `variables` key at all. A mismatch is silent: every templated field falls back forever and nothing errors.

**Do not unit-test an element.** vitest runs in node. If a behaviour can only be checked by rendering, it is a screenshot, and the task says which.

**Task 6 step 3 is a real decision point, not a formality.** The tile size and the tint tables are flagged in the spec as guesses. Look at the render and change them if they are wrong.
