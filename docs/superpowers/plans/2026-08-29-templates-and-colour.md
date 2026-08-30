# Templates and colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chips card Jinja templates in its fields, an opt-in colour for its glyph, and a gradient scrim in place of the flat one every glass pill draws today — with the template engine built in `core/` so the other four cards can adopt it later.

**Architecture:** One new core module (`core/templates.ts`) owns a `render_template` websocket subscription pool: it subscribes what a card wants, **prunes what it no longer wants**, and caches the last result per template. The chips model turns a config into a list of template requests and applies resolved results through an injected resolver function, so the whole read path stays pure and node-testable. Colour resolution moves to `core/tint.ts` beside the palette the complication card already owns. The gradient is CSS only, in `chips-card.ts`, with a separate dark-mode curve.

**Tech Stack:** TypeScript 7 (`exactOptionalPropertyTypes`), Lit 3, vitest in `environment: 'node'` (no DOM — elements are verified by Playwright screenshots in the showcase, never by unit test), pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-29-templates-and-colour-design.md`](../specs/2026-08-29-templates-and-colour-design.md)

## Global Constraints

- **Home Assistant 2026.7+.** No compatibility shims for older frontends.
- **`hass` is always an argument, never reached for.** `vitest.config.ts` runs in the node environment; a module that touched a global `document` or a global connection would be untestable in the only harness this repo has. This is why `core/actions.ts` takes `hass` and an element as parameters.
- **No element is unit-tested.** There is no DOM under vitest. Anything that renders is verified by screenshot in the showcase (`pnpm dev`, then Playwright). Pure functions carry the test burden; write them so they can.
- **Failures warn and carry on.** `console.warn` prefixed `[cupertino-plus]`, then fall back. Never throw from a push handler or a click handler — that is an unhandled rejection in somebody's dashboard rather than a message anybody sees. There is no toast mechanism in this library and this is not the place to add one.
- **An empty value is dropped from a config, never written.** Home Assistant strips `undefined` out of a config and nothing else, so an `entities: []` or a `color: ''` would survive into somebody's YAML saying exactly what its absence says.
- **`--cw-*` tokens in cards; Home Assistant's own variables in editors.** A widget that looks like a phone's should still have a config panel that looks like the dialog it is sitting in.
- **Every commit runs `pnpm typecheck && pnpm test && pnpm format`** before it is made.
- **Existing configs must not change appearance.** A chips card with no `color:` and no templates looks exactly as it does in v1.7.0 after every task in this plan.

---

## Task 1: Verify the `render_template` message shape

**Run this task in the main session, not in a dispatched subagent.** It needs the Home Assistant MCP connection, which subagents do not have. Everything after it builds on the answer.

Spec §8 records the outgoing message as a guess: `subscribeMessage`'s machinery is proven by the calendar's subscription, but the literal keys of `render_template` are carried over by analogy, the same gap `weather/source.ts` admits to in its own header.

**Files:**

- Modify: `docs/ha-api-notes.md` (append a "Template rendering" section)

**Interfaces:**

- Consumes: nothing.
- Produces: the confirmed message shape used verbatim by Task 2's `TemplatePool._open`. If verification contradicts what is written there, **Task 2's code changes and this plan's §2 note is corrected** — do not build on the guess.

- [ ] **Step 1: Render a template against the live installation**

Use the HA MCP tool `ha_eval_template` with a template that exercises the two things the chips card will actually do — read a state, and branch:

```
{{ 'yes' if is_state('sun.sun','above_horizon') else 'no' }} / {{ states('sun.sun') }}
```

Record what comes back, including its **type** — a bare `True`/`False` string, a real boolean, or a rendered string. Task 3's truthiness rules depend on this.

- [ ] **Step 2: Establish what the websocket subscription accepts**

`ha_eval_template` proves the Jinja half only. For the subscription itself, check the frontend's own usage. If `docker` is available (`docker info` succeeds), grep a live bundle the way `docs/ha-api-notes.md` records for the calendar:

```bash
docker run --rm ghcr.io/home-assistant/home-assistant:stable \
  sh -c "grep -ro 'render_template[^}]\{0,200\}' /usr/src/homeassistant/homeassistant/components/websocket_api/ | head -20"
```

If `docker` is not available, say so plainly in the notes rather than implying it was checked, and record the shape as **carried over by analogy** — exactly the wording `weather/source.ts` uses. The fallback in Step 3 is what makes that safe.

- [ ] **Step 3: Write the finding down**

Append to `docs/ha-api-notes.md`, under a new `## Template rendering` heading. Write what was actually established and what was not — a note claiming more than was checked is worse than no note. Include:

- the outgoing message keys (`type`, `template`, `variables`, `report_errors`),
- the push shape (`result`, `listeners`, and whether `error`/`level` arrive as messages or as a rejected subscribe),
- the **type of a boolean result**, from Step 1,
- whether `docker` was available, and therefore how strong the evidence is.

- [ ] **Step 4: Commit**

```bash
git add docs/ha-api-notes.md
git commit -m "docs: what is and is not known about render_template"
```

---

## Task 2: `core/templates.ts` — the subscription pool

**Files:**

- Create: `src/core/templates.ts`
- Create: `src/core/templates.test.ts`

**Interfaces:**

- Consumes: `HomeAssistant` from `core/types/ha` (its `connection.subscribeMessage<T>(cb, msg): Promise<() => Promise<void>>` is already typed).
- Produces:
  - `isTemplate(value: unknown): value is string`
  - `interface TemplateRequest { template: string; variables?: Record<string, unknown> }`
  - `requestKey(request: TemplateRequest): string`
  - `class TemplatePool` with `constructor(onResult: () => void)`, `sync(hass: HomeAssistant, wanted: readonly TemplateRequest[]): void`, `read(key: string): string | undefined`, `disconnect(): void`

- [ ] **Step 1: Write the failing tests**

Create `src/core/templates.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import type { HomeAssistant } from './types/ha'
import { isTemplate, requestKey, TemplatePool } from './templates'

/**
 * A connection that records every subscribe and hands back the push callback, so a test can
 * drive a result in at the moment it chooses. Modelled on `weather/source.test.ts`'s fake,
 * which is the only other place in this repo that tests a subscription without a browser.
 */
const fakeHass = () => {
  const opened: { message: Record<string, unknown>; push: (m: unknown) => void }[] = []
  const stops: ReturnType<typeof vi.fn>[] = []

  const subscribeMessage = vi.fn((push: (m: unknown) => void, message: Record<string, unknown>) => {
    const stop = vi.fn().mockResolvedValue(undefined)
    stops.push(stop)
    opened.push({ message, push })
    return Promise.resolve(stop)
  })

  return {
    hass: { connection: { subscribeMessage } } as unknown as HomeAssistant,
    opened,
    stops,
    subscribeMessage,
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('isTemplate', () => {
  it('recognises both delimiters and nothing else', () => {
    expect(isTemplate("{{ states('sensor.a') }}")).toBe(true)
    expect(isTemplate('{% if true %}yes{% endif %}')).toBe(true)
    expect(isTemplate('Front door')).toBe(false)
    expect(isTemplate('')).toBe(false)
    expect(isTemplate(undefined)).toBe(false)
    expect(isTemplate(42)).toBe(false)
  })
})

describe('requestKey', () => {
  /**
   * Variables are part of the identity, and leaving them out is the bug this asserts against:
   * two chips using `{{ states(config.entity) }}` would share one subscription and both read
   * the first chip's answer.
   */
  it('separates the same template used with different variables', () => {
    const a = { template: 'T', variables: { config: { entity: 'light.a' } } }
    const b = { template: 'T', variables: { config: { entity: 'light.b' } } }
    expect(requestKey(a)).not.toBe(requestKey(b))
  })

  it('is stable for the same request', () => {
    const one = { template: 'T', variables: { config: { entity: 'light.a' } } }
    const two = { template: 'T', variables: { config: { entity: 'light.a' } } }
    expect(requestKey(one)).toBe(requestKey(two))
  })

  it('treats an absent variables map as its own identity', () => {
    expect(requestKey({ template: 'T' })).toBe(requestKey({ template: 'T' }))
    expect(requestKey({ template: 'T' })).not.toBe(requestKey({ template: 'T', variables: {} }))
  })
})

describe('TemplatePool', () => {
  it('subscribes with the message Home Assistant expects', async () => {
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T', variables: { config: { entity: 'light.a' } } }])
    await flush()

    expect(opened[0]?.message).toEqual({
      type: 'render_template',
      template: 'T',
      variables: { config: { entity: 'light.a' } },
      report_errors: true,
    })
  })

  it('omits variables entirely when there are none', async () => {
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }])
    await flush()

    expect(opened[0]?.message).toEqual({
      type: 'render_template',
      template: 'T',
      report_errors: true,
    })
  })

  it('caches a pushed result and reports the change once', async () => {
    const { hass, opened } = fakeHass()
    const changes = vi.fn()
    const pool = new TemplatePool(changes)
    const key = requestKey({ template: 'T' })

    pool.sync(hass, [{ template: 'T' }])
    await flush()
    expect(pool.read(key)).toBeUndefined()

    opened[0]?.push({ result: 'Hall' })
    expect(pool.read(key)).toBe('Hall')
    expect(changes).toHaveBeenCalledTimes(1)

    // The same result again is not a change, and must not repaint the card.
    opened[0]?.push({ result: 'Hall' })
    expect(changes).toHaveBeenCalledTimes(1)
  })

  it('opens one subscription for a template two rows share', async () => {
    const { hass, subscribeMessage } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }, { template: 'T' }])
    await flush()

    expect(subscribeMessage).toHaveBeenCalledTimes(1)
  })

  /**
   * The prune, and the whole reason this is a pool rather than a subscribe helper. The weather
   * card shipped without one: an hourly forecast subscription stayed live at a layout that no
   * longer drew it, pushing into a field nothing read.
   */
  it('closes a subscription the card no longer wants', async () => {
    const { hass, stops } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'A' }, { template: 'B' }])
    await flush()

    pool.sync(hass, [{ template: 'A' }])
    await flush()

    expect(stops[1]).toHaveBeenCalled()
    expect(stops[0]).not.toHaveBeenCalled()
    expect(pool.read(requestKey({ template: 'B' }))).toBeUndefined()
  })

  it('does not resubscribe a template it already holds', async () => {
    const { hass, subscribeMessage } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'A' }])
    await flush()
    pool.sync(hass, [{ template: 'A' }])
    await flush()

    expect(subscribeMessage).toHaveBeenCalledTimes(1)
  })

  it('closes everything on disconnect', async () => {
    const { hass, stops } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'A' }, { template: 'B' }])
    await flush()
    pool.disconnect()

    expect(stops[0]).toHaveBeenCalled()
    expect(stops[1]).toHaveBeenCalled()
    expect(pool.read(requestKey({ template: 'A' }))).toBeUndefined()
  })

  it('warns on a reported error and leaves the field unresolved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'BAD' }])
    await flush()
    opened[0]?.push({ error: 'UndefinedError', level: 'ERROR' })

    expect(pool.read(requestKey({ template: 'BAD' }))).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('warns and forgets the slot when the subscribe itself is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subscribeMessage = vi.fn().mockRejectedValue(new Error('nope'))
    const hass = { connection: { subscribeMessage } } as unknown as HomeAssistant
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }])
    await flush()

    // Forgotten rather than left claimed, so a later sync can try again.
    pool.sync(hass, [{ template: 'T' }])
    await flush()

    expect(subscribeMessage).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('renders a non-string result as a string', async () => {
    const { hass, opened } = fakeHass()
    const pool = new TemplatePool(() => {})

    pool.sync(hass, [{ template: 'T' }])
    await flush()
    opened[0]?.push({ result: 42 })

    expect(pool.read(requestKey({ template: 'T' }))).toBe('42')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/core/templates.test.ts`
Expected: FAIL — `Failed to resolve import "./templates"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/templates.ts`:

```ts
/**
 * Jinja templates, rendered by Home Assistant and pushed back over the websocket.
 *
 * Home Assistant renders a template over a **subscription**, not a call: you subscribe with
 * the template string, it pushes a first result, and it pushes a new one every time anything
 * the template touched changes. So this is a pool rather than a helper, and it is the only
 * file in the library that speaks `render_template` — the same one-file-per-protocol split
 * `calendar/source.ts` and `weather/source.ts` make, for the reason the latter states: a
 * subscription's failure modes have nothing in common with a render's.
 *
 * ## Why `sync` and not `subscribe`
 *
 * The one operation a card actually wants is "here is every template I currently need" —
 * because the set changes under it, on every config edit and every layout flip. A pool that
 * only ever added would leak a subscription each time a chip's template changed or a chip was
 * deleted, pushing results into a field nothing reads. That is not hypothetical: the weather
 * card shipped with exactly that bug, an hourly forecast subscription left live at a layout
 * that no longer drew one. `sync` diffs in both directions, and the prune has a test of its
 * own.
 *
 * ## The token
 *
 * A slot is claimed **synchronously**, before the await that opens it, and carries a token
 * identifying the claim. Two `sync` calls racing each other — a config edit, a disconnect
 * immediately followed by a reconnect when a card is moved rather than removed — would
 * otherwise both see an unclaimed key and both open a live subscription to it. The same
 * reservation `weather-card.ts` makes per forecast kind and `CalendarFeed._live` makes per
 * calendar; this follows it rather than reinventing it.
 */

import type { HomeAssistant } from './types/ha'

/** What Home Assistant pushes back. `error` and `level` arrive only with `report_errors`. */
interface TemplatePush {
  result?: unknown
  error?: string
  level?: string
}

export interface TemplateRequest {
  template: string
  /**
   * Passed to the render as Jinja variables. The chips card passes
   * `{ config: { entity } }`, which is the shape mushroom uses, so
   * `{{ states(config.entity) }}` is one template reusable across every row rather than one
   * template per row.
   */
  variables?: Record<string, unknown>
}

const warn = (message: string): void => console.warn(`[cupertino-plus] ${message}`)

/**
 * Whether a configured string is a template rather than a literal.
 *
 * Both delimiters, because `{% if … %}` is a template with no `{{` in it at all. The cost of
 * the heuristic is a literal that genuinely contains `{{`, which is misread — vanishingly
 * rare, and it fails loudly, because the render errors and the warn names the template.
 */
export const isTemplate = (value: unknown): value is string =>
  typeof value === 'string' && (value.includes('{{') || value.includes('{%'))

/**
 * The identity of a request: the template AND its variables.
 *
 * Both halves are load-bearing. Without the template there is no dedupe; without the
 * variables, two chips using `{{ states(config.entity) }}` would share one subscription and
 * both read whichever chip subscribed first. `JSON.stringify` over a tuple rather than a
 * hand-rolled join, so a template containing the separator cannot collide with another.
 */
export const requestKey = (request: TemplateRequest): string =>
  JSON.stringify([request.template, request.variables ?? null])

interface Slot {
  token: object
  stop?: () => Promise<void>
  result?: string
}

export class TemplatePool {
  private readonly _slots = new Map<string, Slot>()

  /** Called when a result actually changed, so a card can `requestUpdate()`. */
  public constructor(private readonly _onResult: () => void) {}

  /** The last result for a request, or `undefined` before the first push. */
  public read(key: string): string | undefined {
    return this._slots.get(key)?.result
  }

  /**
   * Every template the caller currently needs. Opens what is new, closes what is gone, and
   * leaves what is unchanged alone — a resubscribe would drop a cached result and flash the
   * card back to its fallback for no reason.
   */
  public sync(hass: HomeAssistant, wanted: readonly TemplateRequest[]): void {
    const keys = new Set(wanted.map(requestKey))

    for (const [key, slot] of [...this._slots]) {
      if (keys.has(key)) continue
      this._slots.delete(key)
      void slot.stop?.()
    }

    for (const request of wanted) {
      const key = requestKey(request)
      if (this._slots.has(key)) continue
      const token = {}
      // Claimed before the await; see the token note at the top of the file.
      this._slots.set(key, { token })
      void this._open(hass, key, request, token)
    }
  }

  /** On the card leaving the DOM. Safe to call twice. */
  public disconnect(): void {
    for (const slot of this._slots.values()) void slot.stop?.()
    this._slots.clear()
  }

  private async _open(
    hass: HomeAssistant,
    key: string,
    request: TemplateRequest,
    token: object,
  ): Promise<void> {
    // `variables` omitted rather than sent as undefined: this goes on the wire, and a key
    // whose value is null is not the same request as a key that is absent.
    const message: Record<string, unknown> = {
      type: 'render_template',
      template: request.template,
      ...(request.variables ? { variables: request.variables } : {}),
      report_errors: true,
    }

    try {
      const stop = await hass.connection.subscribeMessage<TemplatePush>(
        push => this._pushed(key, token, request, push),
        message,
      )

      const slot = this._slots.get(key)
      if (slot?.token !== token) {
        // Superseded while the subscribe was in flight — pruned, or claimed again by a later
        // `sync`. Close what we just opened rather than leaving it live behind the new one.
        void stop().catch(() => {})
        return
      }
      slot.stop = () => stop().catch(() => {})
    } catch {
      warn(`could not subscribe to a template: ${request.template}`)
      // Forgotten rather than left claimed, so a later `sync` can try again.
      if (this._slots.get(key)?.token === token) this._slots.delete(key)
    }
  }

  private _pushed(
    key: string,
    token: object,
    request: TemplateRequest,
    push: TemplatePush | undefined,
  ): void {
    const slot = this._slots.get(key)
    if (!slot || slot.token !== token) return

    if (typeof push?.error === 'string') {
      warn(`a template failed to render (${push.error}): ${request.template}`)
      return
    }

    const result = push?.result === undefined ? undefined : String(push.result)
    if (slot.result === result) return
    slot.result = result
    this._onResult()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/core/templates.test.ts`
Expected: PASS, all cases.

Then the whole suite and the compiler: `pnpm typecheck && pnpm test`

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/core/templates.ts src/core/templates.test.ts
git commit -m "feat(core): a render_template subscription pool that prunes"
```

---

## Task 3: `core/tint.ts` — the palette moves, and learns CSS colours

The chips card is the second card to want the ten-name palette, which is the point at which where it lives becomes a question worth answering — the note `moveRow` carried in `battery/model.ts` until v1.7.0, and the same answer.

**Files:**

- Create: `src/core/tint.ts`
- Create: `src/core/tint.test.ts`
- Modify: `src/cards/complication/tint.ts` (re-export the moved names; keep `tintFor`)
- Modify: `src/cards/complication/tint.test.ts` (import the moved names from core)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `TINTS: readonly TintName[]` and `type TintName` — moved verbatim from `complication/tint.ts`
  - `tintVar(tint: TintName): string` — moved verbatim
  - `isTint(value: string): value is TintName`
  - `colorValue(value: string | undefined): string | undefined` — a palette name becomes `var(--cw-red)`; anything else is returned verbatim; a blank or absent value becomes `undefined`

`complication/tint.ts` keeps `tintFor` and `onTintVar` and re-exports `TINTS`, `TintName` and `tintVar` from core, so no complication-card file changes and no import in the library breaks.

- [ ] **Step 1: Write the failing test**

Create `src/core/tint.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { colorValue, isTint, TINTS, tintVar } from './tint'

describe('the palette', () => {
  it('holds the ten names tokens.ts carries', () => {
    expect(TINTS).toEqual([
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
    ])
  })

  it('resolves a name to a token reference rather than a literal', () => {
    expect(tintVar('red')).toBe('var(--cw-red)')
  })

  it('recognises a palette name and nothing else', () => {
    expect(isTint('teal')).toBe(true)
    expect(isTint('#ff8800')).toBe(false)
    expect(isTint('Teal')).toBe(false)
  })
})

/**
 * The chips card's `color:`. A palette name keeps tracking the theme through `tokens.ts`; an
 * arbitrary CSS colour is the escape hatch and is passed through untouched, because this
 * library has no business parsing CSS — the CSSOM does that at `setProperty` time and drops
 * what it cannot read, so a typo is a chip with no tint rather than a broken rule.
 */
describe('colorValue', () => {
  it('turns a palette name into its token', () => {
    expect(colorValue('blue')).toBe('var(--cw-blue)')
    expect(colorValue('accent')).toBe('var(--cw-accent)')
  })

  it('passes anything else through verbatim', () => {
    expect(colorValue('#ff8800')).toBe('#ff8800')
    expect(colorValue('var(--my-token)')).toBe('var(--my-token)')
    expect(colorValue('rgb(1 2 3)')).toBe('rgb(1 2 3)')
  })

  it('answers nothing for nothing, so a card can ask without checking first', () => {
    expect(colorValue(undefined)).toBeUndefined()
    expect(colorValue('')).toBeUndefined()
    expect(colorValue('   ')).toBeUndefined()
  })

  it('trims, because YAML makes trailing spaces easy and invisible', () => {
    expect(colorValue(' green ')).toBe('var(--cw-green)')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/core/tint.test.ts`
Expected: FAIL — `Failed to resolve import "./tint"`.

- [ ] **Step 3: Create `src/core/tint.ts`**

```ts
/**
 * The library's colour palette, and how a configured colour becomes a CSS value.
 *
 * The ten names were the complication card's alone until the chips card grew a `color:` of
 * its own. Two cards wanting a thing is the point at which where it belongs becomes a question
 * worth answering, which is the note `moveRow` carried in `battery/model.ts` until the chips
 * editor arrived; this is the same move. What stays behind in `complication/tint.ts` is
 * `tintFor`'s device-class guessing, which is that card's own rule — the chips card
 * deliberately does not tint automatically.
 */

/**
 * The closed palette a card's `color:` may name. Ten because that is what `tokens.ts` carries
 * under `--cw-*`: nine of Apple's system colours plus `accent`, which is the theme's own
 * primary rather than a fixed hue, for the entity that fits none of the nine.
 */
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

/**
 * The tint as a `--cw-*` reference, never a literal.
 *
 * A card that resolved this to a hex value at read time would bake in whichever theme happened
 * to be active when it ran; keeping it a `var()` means the colour keeps tracking `tokens.ts`,
 * and by extension the user's theme, for the whole time the card sits on the dashboard rather
 * than only at the moment it was drawn.
 */
export const tintVar = (tint: TintName): string => `var(--cw-${tint})`

export const isTint = (value: string): value is TintName =>
  (TINTS as readonly string[]).includes(value)

/**
 * A configured colour, resolved.
 *
 * A palette name becomes its token, so it stays theme-correct and dark-mode-correct. Anything
 * else is returned **verbatim** — `#ff8800`, `var(--my-token)`, `rgb(…)` — because parsing CSS
 * is not this library's job and the CSSOM already does it: the caller hands the result to
 * `element.style.setProperty`, which validates and silently drops what it cannot read. That is
 * why a bad colour is a chip with no tint rather than a broken rule, and why a config value
 * never becomes CSS text.
 *
 * Answers `undefined` for a blank, so a card can call it without checking first.
 */
export const colorValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return isTint(trimmed) ? tintVar(trimmed) : trimmed
}
```

- [ ] **Step 4: Point the complication card at it**

In `src/cards/complication/tint.ts`, delete the `TINTS` declaration, the `TintName` alias and the `tintVar` function, and re-export them from core. Put this immediately below the existing `import type { HassEntity }` line:

```ts
// The palette moved to `core/` when the chips card became its second consumer; re-exported
// rather than relocated in every caller, because `TINTS` is this card's `color:` option and
// every complication file that names it is naming that option, not the shared palette.
export { TINTS, tintVar, type TintName } from '../../core/tint'
import { TINTS, tintVar, type TintName } from '../../core/tint'
```

`tintFor` and `onTintVar` stay exactly as they are, along with `BY_DEVICE_CLASS` and `BY_DOMAIN`. Keep the file's existing header comment; add one sentence saying the palette now lives in core and why this file kept the guessing.

- [ ] **Step 5: Run everything**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. The complication card's own `tint.test.ts` should need no change; if it imports `TINTS` from `./tint`, the re-export keeps it working.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/core/tint.ts src/core/tint.test.ts src/cards/complication/tint.ts
git commit -m "refactor(core): the tint palette moves out of the complication card, and learns CSS colours"
```

---

## Task 4: The chips model reads and applies templates

The pure half of the feature, and the half a node test can reach. No element changes in this task.

**Files:**

- Modify: `src/cards/chips/model.ts`
- Modify: `src/cards/chips/model.test.ts`

**Interfaces:**

- Consumes: `isTemplate`, `TemplateRequest`, `requestKey` (Task 2); `colorValue` (Task 3).
- Produces:
  - `ChipConfig` gains `color?: string`, `value?: string`, `show?: string`
  - `ChipView` gains `color: string | undefined`, and `visible: boolean`
  - `ChipDefaults` gains `color?: string`
  - `type TemplateResolver = (template: string, entity?: string) => string | undefined`
  - `chipTemplates(entities: unknown, defaults: ChipDefaults): TemplateRequest[]`
  - `readChips(hass, entities, defaults, resolve?)` — a fourth, optional resolver argument
  - `readChip(hass, row, defaults?, resolve?)` — same
  - `truthy(result: string | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `src/cards/chips/model.test.ts`:

```ts
/**
 * The template requests a config asks for. This is what the card hands `TemplatePool.sync`,
 * so a field missed here is a field that never resolves.
 */
describe('chipTemplates', () => {
  it('finds a template in every templatable field, and ignores literals', () => {
    const requests = chipTemplates(
      [
        {
          entity: 'light.a',
          name: '{{ n }}',
          icon: '{{ i }}',
          color: '{{ c }}',
          value: '{{ v }}',
          show: '{{ s }}',
          tap_action: {
            action: 'navigate' as const,
            navigation_path: '{{ p }}',
          },
        },
        { entity: 'light.b', name: 'Plain' },
      ],
      {},
    )

    expect(requests.map(r => r.template).sort()).toEqual([
      '{{ c }}',
      '{{ i }}',
      '{{ n }}',
      '{{ p }}',
      '{{ s }}',
      '{{ v }}',
    ])
  })

  it("carries the row's own entity as a variable, so one template serves every row", () => {
    const requests = chipTemplates(
      [
        { entity: 'light.a', name: '{{ states(config.entity) }}' },
        { entity: 'light.b', name: '{{ states(config.entity) }}' },
      ],
      {},
    )

    expect(requests).toHaveLength(2)
    expect(requests.map(r => r.variables)).toEqual([
      { config: { entity: 'light.a' } },
      { config: { entity: 'light.b' } },
    ])
  })

  it('includes a templated card-level colour, with no entity of its own', () => {
    const requests = chipTemplates(['light.a'], { color: '{{ c }}' })
    expect(requests).toEqual([{ template: '{{ c }}' }])
  })

  it('asks for nothing when a config holds no templates', () => {
    expect(chipTemplates(['light.a', { entity: 'light.b', name: 'Plain' }], {})).toEqual([])
  })
})

/**
 * Home Assistant may render a boolean as a real boolean or as Python's `True`/`False`,
 * depending on the template; Task 1 established which. Both are accepted, and so is the set of
 * strings a user would reasonably expect to mean "no".
 */
describe('truthy', () => {
  it('reads the falsy set as false', () => {
    for (const no of ['', 'false', 'False', 'False ', 'None', 'none', '0', 'off', 'unavailable']) {
      expect(truthy(no)).toBe(false)
    }
  })

  it('reads anything else as true', () => {
    for (const yes of ['true', 'True', '1', 'on', 'yes', 'anything at all']) {
      expect(truthy(yes)).toBe(true)
    }
  })

  /** Before the first push. A `show` chip is hidden until its template answers. */
  it('reads an unresolved template as false', () => {
    expect(truthy(undefined)).toBe(false)
  })
})

describe('readChips with templates', () => {
  const resolve = (map: Record<string, string>) => (template: string) => map[template]

  it('falls back to the entity own values before a template resolves', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: '{{ n }}', icon: '{{ i }}' }],
      {},
      () => undefined,
    )
    expect(chip).toMatchObject({ name: 'Hall', icon: 'mdi:thermometer', visible: true })
  })

  it('applies a resolved name, icon and value', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: '{{ n }}', icon: '{{ i }}', value: '{{ v }}' }],
      {},
      resolve({ '{{ n }}': 'Hallway', '{{ i }}': 'mdi:sofa', '{{ v }}': 'warm' }),
    )
    expect(chip).toMatchObject({ name: 'Hallway', icon: 'mdi:sofa', value: 'warm' })
  })

  it('falls back to the formatted state for a value that renders empty', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', value: '{{ v }}' }],
      {},
      resolve({ '{{ v }}': '' }),
    )
    expect(chip?.value).toBe('21.4°C')
  })

  it('hides a chip whose show template is false, and shows one that is true', () => {
    const chips = readChips(
      hassWith(HALL),
      [
        { entity: 'sensor.hall', show: '{{ a }}' },
        { entity: 'sensor.hall', show: '{{ b }}' },
        { entity: 'sensor.hall' },
      ],
      {},
      resolve({ '{{ a }}': 'True', '{{ b }}': 'False' }),
    )
    expect(chips.map(chip => chip.visible)).toEqual([true, false, true])
  })

  it('resolves a colour through the palette, and passes a CSS colour through', () => {
    const chips = readChips(
      hassWith(HALL),
      [
        { entity: 'sensor.hall', color: 'red' },
        { entity: 'sensor.hall', color: '#ff8800' },
        { entity: 'sensor.hall', color: '{{ c }}' },
        { entity: 'sensor.hall' },
      ],
      {},
      resolve({ '{{ c }}': 'teal' }),
    )
    expect(chips.map(chip => chip.color)).toEqual([
      'var(--cw-red)',
      '#ff8800',
      'var(--cw-teal)',
      undefined,
    ])
  })

  it("lets a chip own colour beat the card's", () => {
    const chips = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', color: 'red' }, 'sensor.hall'],
      { color: 'blue' },
      () => undefined,
    )
    expect(chips.map(chip => chip.color)).toEqual(['var(--cw-red)', 'var(--cw-blue)'])
  })

  it('templates the tap action target', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [
        {
          entity: 'sensor.hall',
          tap_action: { action: 'navigate' as const, navigation_path: '{{ p }}' },
        },
      ],
      {},
      resolve({ '{{ p }}': '/lovelace/people' }),
    )
    expect(chip?.action).toEqual({ action: 'navigate', navigation_path: '/lovelace/people' })
  })

  /** §4 of the spec: the dim is the signal, and a dimmed orange chip says two things. */
  it('drops the colour of a chip that is not reporting', () => {
    const dead = entity({
      entity_id: 'sensor.hall',
      state: 'unavailable',
      attributes: { friendly_name: 'Hall' },
    })
    const [chip] = readChips(hassWith(dead), [{ entity: 'sensor.hall', color: 'red' }], {})
    expect(chip).toMatchObject({ unavailable: true, color: undefined })
  })
})
```

Update the import at the top of the file to add `chipTemplates`, `truthy` to the existing list from `./model`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/cards/chips/model.test.ts`
Expected: FAIL — `chipTemplates is not a function`.

- [ ] **Step 3: Implement in `src/cards/chips/model.ts`**

Add to the imports:

```ts
import { isTemplate, type TemplateRequest } from '../../core/templates'
import { colorValue } from '../../core/tint'
```

Extend the two interfaces and the defaults:

```ts
export interface ChipConfig extends EntityRow {
  content?: ChipContent
  /** A palette name, any CSS colour, or a template resolving to either. Tints the glyph. */
  color?: string
  /** Replaces the printed reading. Almost always a template; a literal is legal and odd. */
  value?: string
  /** Whether the chip is drawn at all. Hidden until it resolves; see `truthy`. */
  show?: string
  tap_action?: ActionConfig
}

export interface ChipDefaults {
  content?: ChipContent
  /** The card-level colour. A row's own `color` beats it, exactly as `content` works. */
  color?: string
}
```

`ChipView` gains two fields:

```ts
/** A resolved CSS value for the glyph, or `undefined` for the row's default ink. */
color: string | undefined
/** False only for a chip whose `show` template says so, or has not answered yet. */
visible: boolean
```

Then add, below `chipConfigs`:

```ts
/**
 * How a template's result reaches the model.
 *
 * A function rather than a pool, so this module stays pure and node-testable: the card owns
 * the subscription and passes its `read` in. `entity` is the row the template belongs to,
 * which has to be part of the lookup for the same reason it is part of `requestKey` — two rows
 * sharing `{{ states(config.entity) }}` have two different answers.
 */
export type TemplateResolver = (template: string, entity?: string) => string | undefined

/** Every field of a chip that may hold a template, in the order the editor shows them. */
const TEMPLATED_FIELDS = ['name', 'icon', 'color', 'value', 'show'] as const

/**
 * Every template a config asks for, ready for `TemplatePool.sync`.
 *
 * A field missed here is a field that never resolves, so this and the reading below have to
 * agree about what is templatable; the shared `TEMPLATED_FIELDS` list is what keeps them
 * honest, and the action's two argument fields are appended by hand because they live one
 * level down.
 *
 * The card-level colour has no entity, so it carries no variables at all — which also makes
 * it a different `requestKey` from the same template used on a row, correctly: they are two
 * questions with two answers.
 */
export const chipTemplates = (entities: unknown, defaults: ChipDefaults): TemplateRequest[] => {
  const requests: TemplateRequest[] = []

  if (isTemplate(defaults.color)) requests.push({ template: defaults.color })

  for (const row of chipConfigs(entities)) {
    const variables = { config: { entity: row.entity } }

    for (const field of TEMPLATED_FIELDS) {
      const raw = row[field]
      if (isTemplate(raw)) requests.push({ template: raw, variables })
    }

    // Bound first rather than reached through `row.tap_action?.…`: a type predicate narrows
    // the expression it was handed, not the object behind it, so the optional-chain version
    // passes `isTemplate` and then fails to compile on `action.navigation_path`.
    const action = row.tap_action
    if (action) {
      if (isTemplate(action.navigation_path)) {
        requests.push({ template: action.navigation_path, variables })
      }
      if (isTemplate(action.service)) requests.push({ template: action.service, variables })
    }
  }

  return requests
}

/**
 * What a rendered `show` means.
 *
 * Home Assistant may hand back a real boolean or Python's `True`/`False` as a string,
 * depending on the template; `String()` in the pool makes both arrive here as text. The falsy
 * set is deliberately generous — a user writing `{{ 'off' }}` means off — and `undefined` is
 * false, which is the "hidden until it answers" rule: a chip that flashes *in* reads as a
 * dashboard loading, a chip that flashes *out* reads as a bug.
 */
const FALSY = new Set(['', 'false', 'none', '0', 'off', 'unavailable', 'unknown'])

export const truthy = (result: string | undefined): boolean =>
  result !== undefined && !FALSY.has(result.trim().toLowerCase())
```

Rewrite `readChip` to take the resolver and apply it. The whole function:

```ts
export const readChip = (
  hass: HomeAssistant | undefined,
  row: ChipConfig,
  defaults: ChipDefaults = {},
  resolve: TemplateResolver = () => undefined,
): ChipView => {
  // A field is its template's result when it has one, its literal otherwise, and `undefined`
  // when a template has not answered yet — which every caller below treats as "fall back",
  // so nothing is ever blank while a template resolves.
  const field = (raw: string | undefined): string | undefined => {
    if (!isTemplate(raw)) return raw
    const result = resolve(raw, row.entity)
    return result === undefined || result === '' ? undefined : result
  }

  const entity = hass?.states[row.entity]
  const content = row.content ?? defaults.content ?? DEFAULT_CONTENT
  const visible = row.show === undefined ? true : truthy(field(row.show))
  const name = field(row.name)
  const icon = field(row.icon)

  const action = readAction(row.tap_action, field)

  if (!hass || !entity) {
    return {
      entityId: row.entity,
      name: name ?? row.entity,
      icon: icon ?? FALLBACK_ICON,
      value: VALUE_DASH,
      content,
      unavailable: true,
      // A chip that cannot be read is dimmed to say so; a dimmed orange chip says two things.
      color: undefined,
      visible,
      action,
    }
  }

  const unavailable = isUnavailable(entity)
  return {
    entityId: row.entity,
    name: name ?? nameFor(entity),
    icon: icon ?? iconFor(entity),
    value: unavailable ? VALUE_DASH : (field(row.value) ?? formatValue(hass, entity)),
    content,
    unavailable,
    color: unavailable ? undefined : colorValue(field(row.color) ?? field(defaults.color)),
    visible,
    action,
  }
}

/**
 * The action, with its one argument resolved if it was a template.
 *
 * Rebuilt rather than mutated: `row.tap_action` is the user's config object, and a card that
 * wrote a rendered path back into it would persist a template's output as though somebody had
 * typed it.
 */
const readAction = (
  action: ActionConfig | undefined,
  field: (raw: string | undefined) => string | undefined,
): ActionConfig => {
  if (!action) return DEFAULT_ACTION
  if (!isTemplate(action.navigation_path) && !isTemplate(action.service)) return action

  const next: ActionConfig = { ...action }
  const path = field(action.navigation_path)
  const service = field(action.service)
  if (path === undefined) delete next.navigation_path
  else next.navigation_path = path
  if (service === undefined) delete next.service
  else next.service = service
  return next
}
```

And `readChips` gains the fourth argument, passing it through:

```ts
export const readChips = (
  hass: HomeAssistant,
  entities: unknown,
  defaults: ChipDefaults,
  resolve?: TemplateResolver,
): ChipView[] => chipConfigs(entities).map(row => readChip(hass, row, defaults, resolve))
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/cards/chips/model.test.ts`
Expected: PASS.

Then: `pnpm typecheck && pnpm test`. The existing `readChips` tests pass unchanged — the resolver defaults to "nothing resolves", which is the no-templates case.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/cards/chips/model.ts src/cards/chips/model.test.ts
git commit -m "feat(chips): read templates, colour, value and show in the model"
```

---

## Task 5: The showcase can render templates

Before the card is wired up, the harness needs to be able to answer a template — otherwise the next task's screenshots show every templated field on its fallback and prove nothing.

**Files:**

- Modify: `dev/mock-hass.ts` (a `render_template` branch in `subscribeMessage`)
- Modify: `dev/chip-fixtures.ts` (canned template answers, and a templated chip set)

**Interfaces:**

- Consumes: nothing from earlier tasks — this is harness code.
- Produces: `TEMPLATE_RESULTS: Record<string, string>` exported from `dev/chip-fixtures.ts`, and a `templates` entry in `CHIP_SETS`.

- [ ] **Step 1: Add the canned answers to `dev/chip-fixtures.ts`**

```ts
/**
 * What the mock installation answers for each template the fixtures use.
 *
 * The showcase cannot run Jinja, so this is a lookup keyed by the exact template string — a
 * stub, and honest about being one in the way `dev/ha-stubs.ts` is about `ha-form`. It is
 * enough to prove the wiring: that a template's result reaches the field, that an unresolved
 * one falls back, and that `show: false` removes a chip from the row.
 */
export const TEMPLATE_RESULTS: Record<string, string> = {
  "{{ 'Home' if is_state('person.joe','home') else 'Out' }}": 'Out',
  "{{ 'mdi:lock-open' if is_state('lock.front_door','unlocked') else 'mdi:lock' }}": 'mdi:lock',
  "{{ 'red' if states('sensor.hall_temperature')|float > 20 else 'blue' }}": 'red',
  "{{ states('sensor.hall_temperature') }}° in the hall": '21.4° in the hall',
  "{{ is_state('light.kitchen','on') }}": 'False',
}
```

And a set that uses them, added to `CHIP_SETS`:

```ts
  templates: [
    { entity: HALL_TEMPERATURE, color: "{{ 'red' if states('sensor.hall_temperature')|float > 20 else 'blue' }}" },
    { entity: JOE, name: "{{ 'Home' if is_state('person.joe','home') else 'Out' }}", content: 'labeled' },
    { entity: FRONT_DOOR, icon: "{{ 'mdi:lock-open' if is_state('lock.front_door','unlocked') else 'mdi:lock' }}", color: 'green' },
    { entity: HALL_TEMPERATURE, value: "{{ states('sensor.hall_temperature') }}° in the hall" },
    // Hidden: the row draws four chips, not five.
    { entity: KITCHEN_LIGHT, show: "{{ is_state('light.kitchen','on') }}" },
  ],
```

- [ ] **Step 2: Answer the subscription in `dev/mock-hass.ts`**

Import `TEMPLATE_RESULTS` at the top, then add this branch beside the existing three, immediately after the `weather/subscribe_forecast` block:

```ts
// The template engine's own subscription — see `core/templates.ts`. Keyed by the exact
// template string, because this harness cannot run Jinja; a template nobody wrote an
// answer for pushes an error, which is the branch worth being able to see.
if (message.type === 'render_template') {
  const template = String(message.template)
  const result = TEMPLATE_RESULTS[template]
  queueMicrotask(() =>
    callback(
      (result === undefined
        ? { error: 'no fixture for this template', level: 'ERROR' }
        : { result }) as never,
    ),
  )
}
```

- [ ] **Step 3: Check it by hand**

Run: `pnpm dev`, open `http://localhost:5173/#/chips`, and switch the fixture set to `templates` in the controls. Nothing renders differently yet — the card does not read templates until Task 6 — but the browser console should show `[mock-hass] subscribeMessage` entries once it does. Confirm the dev server compiles with no type error.

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
pnpm format
git add dev/mock-hass.ts dev/chip-fixtures.ts
git commit -m "chore(dev): the showcase answers render_template from fixtures"
```

---

## Task 6: The chips card renders templates and colour

**Files:**

- Modify: `src/cards/chips/chips-card.ts`

**Interfaces:**

- Consumes: `TemplatePool`, `requestKey` (Task 2); `chipTemplates`, `readChips`, `ChipView.color`, `ChipView.visible` (Task 4).
- Produces: nothing further tasks import.

- [ ] **Step 1: Add the pool and its lifecycle**

Add to the imports:

```ts
import { requestKey, TemplatePool } from '../../core/templates'
// `ChipDefaults` is a type import, and `chipTemplates` a value one; the existing block from
// './model' already mixes both, so extend it rather than adding a second.
import { chipTemplates, type ChipDefaults } from './model'
```

Add the field and the two lifecycle hooks to the class:

```ts
  /**
   * The card's template subscriptions.
   *
   * `requestUpdate` rather than a state field: a resolved template changes what `_chips`
   * computes, and `_chips` is a getter reading `this._config` and the pool. `shouldUpdate`
   * would otherwise swallow the repaint, because nothing in `hass` changed.
   */
  private readonly _templates = new TemplatePool(() => this.requestUpdate())

  public override disconnectedCallback(): void {
    this._templates.disconnect()
    super.disconnectedCallback()
  }

  /**
   * Kept in step with the config on every update, not only on `setConfig`: the set of
   * templates changes when the config does, and `sync` is a diff, so calling it when nothing
   * moved costs a `Set` build and closes nothing.
   */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this.hass || !this._config) return
    this._templates.sync(this.hass, chipTemplates(this._config.entities, this._defaults))
  }
```

`PropertyValues` needs adding to the `lit` type import.

- [ ] **Step 2: Route the resolver into the model**

Replace the `_chips` getter and add `_defaults` beside it:

```ts
  /** The card-level defaults every row inherits from. */
  private get _defaults(): ChipDefaults {
    const content = this._config?.content
    const color = this._config?.color
    return { ...(content ? { content } : {}), ...(color ? { color } : {}) }
  }

  private get _chips(): ChipView[] {
    if (!this.hass || !this._config) return []
    return readChips(this.hass, this._config.entities, this._defaults, (template, entity) =>
      this._templates.read(
        requestKey(entity === undefined ? { template } : { template, variables: { config: { entity } } }),
      ),
    )
  }
```

The `requestKey` reconstruction here must match `chipTemplates`'s exactly, or every lookup misses. That is the one thing to check twice in this task: **the card-level colour has no variables, a row's field always does.**

Add `color?: string` to `ChipsCardConfig`.

- [ ] **Step 3: Draw the colour and drop the hidden chips**

In `render()`, filter before anything else is computed from the list:

```ts
const chips = this._chips.filter(chip => chip.visible)
```

The `bandFor(chips)` call and the `chips.length === 0` branch then both operate on what is
actually drawn, which is right: a row of one visible chip is a row of one, and a card whose every
chip is hidden draws `No Entities` — the honest answer, since there is nothing to show.

Three things are deliberately **not** changed here, and each would be a bug if it were:

- **`getGridOptions`.** `_floorBand` reads the config, not `_chips`, so a hidden chip still
  counts toward the floor and the card does not clip when it comes back.
- **`watchedEntities()`.** It is built from `watchedIds(this._config?.entities)`, which is the
  config. A hidden chip stays watched: its own `show` template usually depends on the very
  entity it is hiding, and a chip that stopped watching that could never return.
- **The accessible name** in `_renderChip`, which is `${chip.name}, ${…chip.value}`. It picks up
  a templated `value` for free, including on an `icon` chip that prints no reading — which is
  spec §3's rule that a `value` on an icon-only chip is not drawn but is still what the chip
  says out loud. Verify it in Task 6's screenshots by reading the DOM's `aria-label`, not by
  looking at the picture.

In `_renderChip`, hand the colour to the glyph:

```ts
        <span class="pill">
          <ha-icon
            class="glyph"
            style=${chip.color ? `--cw-chip-tint:${chip.color}` : nothing}
            .icon=${chip.icon}
          ></ha-icon>
          ${body}
        </span>
```

Add the rule to the stylesheet, immediately after the existing `.glyph` block:

```css
/* The tint paints the glyph and nothing else: the reading, the caption and the pill stay
         one ink, so a row of six chips still reads as one band rather than as six competing
         highlights. §4 of the spec has the argument, and core/ring.ts has the older version of
         it — a coloured number is a second, blurrier opinion about a number already printed.
         The fallback is the row's own ink, so a chip with no colour is untouched. */
.glyph {
  color: var(--cw-chip-tint, inherit);
}
```

- [ ] **Step 4: Verify in the showcase**

Run `pnpm dev`, open `#/chips`, switch to the `templates` fixture set, and confirm with Playwright screenshots at the `medium` footprint in **both** themes:

- the hall chip's glyph is red and its text is not,
- the person chip reads `Out` rather than the entity's own name,
- the lock chip's glyph is `mdi:lock` and green,
- the fourth chip prints `21.4° in the hall`,
- **four chips are drawn, not five** — the kitchen light's `show` rendered `False`.

Save the light-theme shot as `docs/images/chips-templates.png`.

Then check the prune by hand: in the showcase, switch the fixture set from `templates` to `mixed` and back, and confirm the console shows `[mock-hass] unsubscribed` lines. A set switch that only ever logged subscribes means `sync` is not pruning.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm test && pnpm format
git add src/cards/chips/chips-card.ts docs/images/chips-templates.png
git commit -m "feat(chips): templates and a tinted glyph on the card"
```

---

## Task 7: The gradient scrim

Independent of everything above; touches CSS only. Do it after Task 6 so the screenshots can show colour and material together.

**Files:**

- Modify: `src/cards/chips/chips-card.ts` (the `.glass .pill` rule and a dark-mode block)
- Modify: `docs/images/chips-glass.png`, `docs/images/chips-glass-dark.png` (repaint, if a dark shot exists — check `dev/shots.ts` for the list)

**Interfaces:** none.

- [ ] **Step 1: Replace the flat scrim**

The current rule:

```css
.glass .pill {
  color: var(--cw-label);
  background: color-mix(in srgb, var(--cw-label) 14%, transparent);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
}
```

becomes:

```css
/* The scrim is a gradient rather than a flat wash, which is how both iOS glass and
         Material surfaces are actually lit: denser at the bottom, with a bright hairline along
         the top edge for the specular line. It is a BACKGROUND layer, so it composites over
         backdrop-filter rather than replacing it — the blur still samples the dashboard — and
         it stays low-alpha for exactly that reason: a dense scrim is a translucent pill that
         has stopped being translucent. */
.glass .pill {
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

/* Not the same gradient inverted. The light still comes from above, but the surface is
         dark: the top edge gets BRIGHTER relative to the body and the body gets LESS dense,
         where the light-mode version gets denser downward. Flipping one gradient would light
         the pill from underneath. */
:host([dark]) .glass .pill {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--cw-label) 16%, transparent),
    color-mix(in srgb, var(--cw-label) 9%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--cw-label) 20%, transparent);
}
```

`:host([dark])` is the reflected property `CupertinoCard` already sets from `hass.themes.darkMode`; check `tokens.ts` for the selector the rest of the library uses and match it exactly rather than assuming this one.

- [ ] **Step 2: Confirm the blur survived**

This is the step that matters, and it must be a browser check rather than an argument:
`backdrop-filter` is disabled by any ancestor with `opacity < 1`, and the whole point of the
glass container is that it samples the dashboard.

**`docs/images/chips-glass.png` cannot prove it.** `dev/shots.css` stages every shot on a flat
`#8a8a8e`, and a blur of a flat colour is that colour — the committed screenshot would look
identical whether the blur worked or not. The original check was a manual one over a patterned
background, and this needs the same.

So: run `pnpm dev`, open `#/chips`, and in the browser devtools put a repeating gradient behind
the card, e.g.

```js
document.querySelector('.stage').style.background =
  'repeating-linear-gradient(45deg, #333 0 12px, #ccc 12px 24px)'
```

The pill must still show the stripes through it, softened, now with a visible vertical gradient
across the pill and a light hairline along its top edge. Screenshot that state into the
scratchpad as the evidence for this task; it is not a committed doc image, because the striped
background is a test rig rather than something a reader should see.

- [ ] **Step 3: Repaint the screenshots**

Run: `pnpm shots` and inspect every chips image it regenerates. Only the glass ones should change; if `chips-card.png` (the `container: card` shot) moved, the rule is leaking outside `.glass` and must be scoped.

- [ ] **Step 4: Commit**

```bash
pnpm typecheck && pnpm test && pnpm format
git add src/cards/chips/chips-card.ts docs/images/
git commit -m "feat(chips): a gradient scrim on the glass pill, lit for each theme"
```

---

## Task 8: The editor — a Colour row and a template switch

**Files:**

- Modify: `src/cards/chips/chip-list-editor.ts`
- Modify: `src/cards/chips/chips-card-editor.ts`
- Modify: `src/cards/chips/model.ts` (`chipToForm` / `chipFromForm` gain the new fields)
- Modify: `src/cards/chips/model.test.ts`

**Interfaces:**

- Consumes: `TINTS` (Task 3); `isTemplate` (Task 2); `ChipConfig`'s new fields (Task 4).
- Produces: nothing further tasks import.

- [ ] **Step 1: Extend the form translation and test it**

`chipToForm` gains three keys; `chipFromForm` reads them back. Add to `chipToForm`'s returned object:

```ts
  color: config.color,
  value: config.value,
  show: config.show,
```

and to `chipFromForm`, beside the existing `name`/`icon` handling:

```ts
const color = text(data.color)
if (color !== undefined) next.color = color

const value = text(data.value)
if (value !== undefined) next.value = value

const show = text(data.show)
if (show !== undefined) next.show = show
```

Add these cases to `describe('chipFromForm')` in `src/cards/chips/model.test.ts`:

```ts
it('round-trips the three new fields', () => {
  const prior: ChipConfig = {
    entity: 'light.hall',
    color: 'red',
    value: '{{ v }}',
    show: '{{ s }}',
  }
  expect(chipFromForm(prior, chipToForm(prior))).toEqual(prior)
})

it('drops a colour that has been cleared', () => {
  const prior: ChipConfig = { entity: 'light.hall', color: 'red' }
  expect(chipFromForm(prior, { ...chipToForm(prior), color: '' })).toEqual({
    entity: 'light.hall',
  })
})
```

Run: `pnpm vitest run src/cards/chips/model.test.ts` — expect FAIL, then implement, then PASS.

- [ ] **Step 2: Add the Colour row to the chip panel**

In `chip-list-editor.ts`, add the constants:

```ts
/** The sentinel the colour dropdown uses for "type a CSS colour instead". Never a config value. */
const COLOR_CUSTOM = 'custom'

/** `accent` reads as a word rather than a colour, so it is spelt out rather than capitalised. */
const TINT_LABELS: Record<string, string> = {
  accent: 'Accent — your theme own',
}

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

const COLOR_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [
      { value: '', label: 'None — the row default' },
      ...TINTS.map(value => ({ value, label: TINT_LABELS[value] ?? titleCase(value) })),
      { value: COLOR_CUSTOM, label: 'Custom…' },
    ],
  },
}
```

and put the row in `chipSchema` between `content` and `icon`, with the conditional custom field directly after it — the same pattern the tap action's argument already uses:

```ts
    { name: 'color', selector: COLOR_SELECTOR },
```

```ts
if (data.color === COLOR_CUSTOM) {
  rows.push({ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } })
}
```

The dropdown holds a palette name, `''`, or the sentinel; `color_custom` holds the literal. Both fold into one `color` key on the way out, in the element's `_rowChanged` before `chipFromForm` is called:

```ts
// The dropdown and its custom field are two controls for one key. Folded here rather than
// in `chipFromForm`, which is a rule about the config and should not know that the editor
// draws this as two things.
const value = { ...event.detail.value }
if (value.color === COLOR_CUSTOM) value.color = value.color_custom
delete value.color_custom
```

and are split on the way in, in `_renderChip`:

```ts
const data = chipToForm(config)
const configured = typeof data.color === 'string' ? data.color : ''
if (configured && !(TINTS as readonly string[]).includes(configured)) {
  data.color = COLOR_CUSTOM
  data.color_custom = configured
}
```

Add labels and helpers:

```ts
  color: 'Colour',
  color_custom: 'Custom colour',
```

```ts
  color: 'Tints the glyph only. The reading and the pill stay one ink.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
```

- [ ] **Step 3: Add the template switch**

Add to the element:

```ts
  /**
   * Which chips are showing their template fields, by row key.
   *
   * A view of a row rather than a property of one, so it writes no config key — the same
   * arrangement `_open` already uses for which panels are expanded. `icon` is an icon picker
   * and `color` is a dropdown, and a template cannot be typed into either; this switch swaps
   * both for plain text boxes and reveals the two fields that only make sense as templates.
   */
  private readonly _templating = new Set<string>()

  /**
   * On by default for a chip whose config already holds a template, so a config written in
   * YAML opens showing what it actually says rather than a picker that cannot represent it.
   */
  private _isTemplating(config: ChipConfig, key: string): boolean {
    if (this._templating.has(key)) return true
    return [config.name, config.icon, config.color, config.value, config.show].some(isTemplate)
  }
```

`chipSchema` takes a `templating: boolean` and branches on it: when true, `icon` and `color` become `{ text: {} }` rows, the `color_custom` row is not drawn, and two rows are appended:

```ts
if (templating) {
  rows.push({ name: 'value', selector: { text: { placeholder: "{{ states('sensor.a') }}" } } })
  rows.push({ name: 'show', selector: { text: { placeholder: "{{ is_state('light.a','on') }}" } } })
}
```

The switch itself is a `boolean` row at the end of the panel, named `templating`, handled in `_rowChanged` before `chipFromForm` and then deleted from the data so it never reaches the config:

```ts
if (typeof value.templating === 'boolean') {
  if (value.templating) this._templating.add(key)
  else this._templating.delete(key)
}
delete value.templating
```

Labels and helpers:

```ts
  templating: 'Use templates',
  value: 'Reading',
  show: 'Show when',
```

```ts
  templating:
    'Swaps the icon and colour pickers for text boxes, so you can write a template in them.',
  value: 'Replaces what the chip prints. Falls back to the entity own reading if it is empty.',
  show: 'The chip is drawn only while this is true. Hidden until it answers.',
```

- [ ] **Step 4: Add the card-level Colour row**

In `chips-card-editor.ts` the card-level colour needs the same two-controls-for-one-key
arrangement, written out here rather than referred back to — an implementer may be reading this
task on its own.

`FIELDS` is a constant today; it becomes a function of the current data so the custom row can be
conditional, exactly as `chipSchema` is:

```ts
const fields = (data: Record<string, unknown>): readonly HaFormSchema[] => {
  const rows: HaFormSchema[] = [
    { name: 'content', selector: CONTENT_SELECTOR },
    { name: 'color', selector: COLOR_SELECTOR },
  ]
  if (data.color === COLOR_CUSTOM) {
    rows.push({ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } })
  }
  rows.push({ name: 'container', selector: CONTAINER_SELECTOR })
  return rows
}
```

`COLOR_SELECTOR` and `COLOR_CUSTOM` move to `model.ts` in Step 2 rather than being declared
twice — both editors import them from there, the same way `DEFAULT_CONTAINER` already lives in
`model.ts` so the editor can have it as a value without closing an import cycle.

`CupertinoCardEditor.fields()` takes no argument, so override `toForm` and `fromForm` to do the
folding, which is what that pair exists for:

```ts
  protected override toForm(config: ChipsCardConfig): Record<string, unknown> {
    const data: Record<string, unknown> = { ...config }
    const configured = typeof config.color === 'string' ? config.color : ''
    if (configured && !isTint(configured)) {
      data.color = COLOR_CUSTOM
      data.color_custom = configured
    }
    return data
  }

  protected override fromForm(
    config: ChipsCardConfig,
    data: Record<string, unknown>,
    formFields: readonly string[],
  ): ChipsCardConfig {
    const folded = { ...data }
    if (folded.color === COLOR_CUSTOM) folded.color = folded.color_custom
    delete folded.color_custom
    return super.fromForm(config, folded, formFields)
  }
```

`fields()` returns `fields(this.toForm(this._config))` so the schema and the data agree about
whether the custom row is showing.

Label: `Row colour`. Helper: `'Tints every glyph in the row. A chip can say otherwise in its own
panel above.'`

- [ ] **Step 5: Drive it in the showcase**

Run `pnpm dev`, open `#/chips`, expand **Advanced**, and with Playwright:

- add a chip, set its Colour to `Red`, confirm the config pane shows `color: red` and the preview's glyph is red;
- set Colour to `Custom…`, type `#ff8800`, confirm `color: "#ff8800"`;
- turn **Use templates** on, confirm Icon and Colour become text boxes and Reading and Show when appear;
- type a template into Reading, confirm it lands in the config and that turning the switch off does **not** delete it;
- reload with a config whose `name` is a template, and confirm the switch comes up already on.

Note that the showcase's `ha-form` stub renders `select` as radios and `boolean` as a checkbox; that is a stub limitation, not a bug. Save a screenshot of the open panel in template mode.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm test && pnpm format
git add src/cards/chips/
git commit -m "feat(chips): colour and template fields in the visual editor"
```

---

## Task 9: The documentation catches up

**Files:**

- Modify: `docs/chips-widget-rules.md` (§3 rewritten, a new templates section, §9 updated)
- Modify: `README.md` (the chips paragraph and the Configuring table)
- Modify: `docs/ha-api-notes.md` (only if Task 6 or 8 learned something Task 1 did not)

**Interfaces:** none.

- [ ] **Step 1: Rewrite §3 of the chips rules**

§3 is currently titled "The colour: this card opts out of identity" and argues for one ink. It is being **narrowed, not deleted**. Keep the argument, then state what changed and why the argument still holds for what it now covers:

- colour paints the **glyph** only; the reading, the caption and the pill stay one ink,
- it is **opt-in** — no `color:` means no colour, so nothing on an existing dashboard moves,
- ten palette names from `core/tint.ts`, or any CSS colour, passed through `setProperty`,
- a chip's own colour beats the card's,
- an unavailable chip drops its colour, because §8's dim is the signal.

- [ ] **Step 2: Add a templates section**

A new numbered section after §7 (What a press does), covering: the `{{`/`{%` rule; the six templatable fields plus the action's two; that `entity` is never templatable and why; `{{ states(config.entity) }}` and what the deduplication buys; hidden-until-answered for `show`; the fallback-on-error contract; and the subscription cost from spec §10. Include a worked YAML block — the `templates` fixture set from Task 5 is a good one, since it is known to render.

Renumber the sections after it.

- [ ] **Step 3: Update §9 "Still open"**

Remove the bullets that this work closed, and add what it opened: whether the gradient should reach `container: card` and the other four cards' surfaces, and that the engine is built for the other cards but wired only into this one.

- [ ] **Step 4: Update the README**

The chips paragraph gains a sentence on templates and colour. The Configuring table's Chips row currently reads `entities, and what a press on each one does`; it stays accurate, so change it only if the sentence above makes it read oddly.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add docs/ README.md
git commit -m "docs: templates, the narrowed colour rule, and the new material"
```

---

## Task 10: Release

- [ ] **Step 1: Full check**

```bash
pnpm typecheck && pnpm test && pnpm format:check && pnpm build
```

- [ ] **Step 2: Merge, version, tag**

```bash
git checkout worktree-complication-card
git merge --ff-only <branch>
npm version --no-git-tag-version --allow-same-version 1.8.0
git add package.json
git commit -m "chore: release v1.8.0"
git tag -a v1.8.0 -m "v1.8.0 — templates, chip colour, and the gradient scrim"
git push fork worktree-complication-card:main
git push fork v1.8.0
```

- [ ] **Step 3: Install it**

Wait for the Release workflow to attach `cupertino-plus.js`, then over the HA MCP connection: `ha_manage_hacs` `update_information`, then `download` at `v1.8.0`, then update the dashboard resource's `hacstag` to `1328517397180`. Hard-refresh the browser.

---

## Notes for the executor

**Task 1 is not optional and not dispatchable.** Everything from Task 2 onward assumes a message shape that has not been verified in this environment. Run it in the main session, and if it contradicts the code in Task 2, change Task 2 rather than working around it.

**The prune is the bug this design exists to avoid.** If you find yourself simplifying `TemplatePool.sync` into a subscribe helper, re-read the header comment: the weather card shipped without a prune and leaked a live subscription into a field nothing read.

**Do not unit-test an element.** vitest runs in node here. If a behaviour can only be checked by rendering, it is a screenshot, and the plan says which.

**`requestKey` is computed in two places** — `chipTemplates` builds the requests, `chips-card.ts` reconstructs the key to read a result. They must agree exactly, including the card-level colour having no `variables`. A mismatch is silent: every field falls back forever, and nothing errors.
