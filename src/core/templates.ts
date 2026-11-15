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

import type { ActionConfig } from './actions'
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
 * What a rendered `show` means. Home Assistant may hand back a real boolean or Python's
 * `True`/`False` as a string; both arrive here as text. The falsy set is deliberately generous
 * (a user writing `{{ 'off' }}` means off), and `undefined` is false: hidden until it answers.
 * Here rather than in any one card's model, because a room's own icons read it from
 * `core/area-summary.ts` too.
 */
const FALSY = new Set(['', 'false', 'none', 'null', '0', 'off', 'unavailable', 'unknown'])

export const truthy = (result: string | undefined): boolean =>
  result !== undefined && !FALSY.has(result.trim().toLowerCase())

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

/**
 * How a template's result reaches a model.
 *
 * A function rather than a pool, so a model stays pure and node-testable: the card owns the
 * subscription and passes its `read` in. `entity` is the row the template belongs to, which has
 * to be part of the lookup for the same reason it is part of `requestKey` — two rows sharing
 * `{{ states(config.entity) }}` have two different answers.
 */
export type TemplateResolver = (template: string, entity?: string) => string | undefined

/**
 * The one way a template becomes a request, for the model registering it and the card looking
 * its result up again: both call this, so the two keys cannot disagree.
 *
 * The variables are Mushroom's, so a template moved over from one of its cards reads the same
 * names: `config.entity` and `entity` are the row's entity id, and `user` is the name of whoever
 * is looking. `config.entity` came first and stays; `entity` and `user` arrived with the
 * migration, where a template written `{{ is_state(entity, 'on') }}` had nothing to read.
 *
 * Each is present only when it has a value, and with neither the request carries no `variables`
 * key at all. That is what used to be stated as "no entity means no variables" and is the same
 * rule, widened by one: a request is keyed by exactly what it was rendered with, so two ways of
 * writing nothing can never hash to two keys (`chipTemplates`' note has the bug that is about).
 */
export const templateRequest = (
  template: string,
  entity: string | undefined,
  user: string | undefined,
): TemplateRequest => {
  const variables: Record<string, unknown> = {}
  if (entity !== undefined) {
    variables.config = { entity }
    variables.entity = entity
  }
  if (user !== undefined) variables.user = user
  return Object.keys(variables).length > 0 ? { template, variables } : { template }
}

/** The action fields that are one string, any of which may be a template. */
export const ACTION_TEXT_FIELDS = [
  'navigation_path',
  'url_path',
  'service',
  'perform_action',
] as const

/**
 * The action fields that are a tree, whose string leaves may be templates: a service's data
 * and its target, at any depth (`entity_id: ['{{ … }}', light.hall]` is a leaf in a list).
 */
export const ACTION_TREE_FIELDS = ['data', 'service_data', 'target'] as const

/** The three gestures a row can configure, in the order the models register their templates. */
export const ACTION_KEYS = ['tap_action', 'hold_action', 'double_tap_action'] as const

const templatesIn = (value: unknown, out: string[]): void => {
  if (isTemplate(value)) out.push(value)
  else if (Array.isArray(value)) for (const item of value) templatesIn(item, out)
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) templatesIn(item, out)
  }
}

/** Every template one action holds, in its text fields and anywhere in its data and target. */
export const actionTemplates = (action: ActionConfig | undefined): string[] => {
  const out: string[] = []
  if (!action) return out
  for (const key of ACTION_TEXT_FIELDS) templatesIn(action[key], out)
  for (const key of ACTION_TREE_FIELDS) templatesIn(action[key], out)
  return out
}

/** A row that may carry the three gestures, each an action that may hold templates. */
type ActionRow = { [Key in (typeof ACTION_KEYS)[number]]?: ActionConfig | undefined }

/**
 * Whether a row holds a template in any of `fields` or anywhere in its three actions: what
 * decides that an editor panel opens with its templating switch on, so a config written in YAML
 * opens showing what it says rather than a picker that cannot represent it.
 */
export const hasRowTemplates = <Row extends ActionRow>(
  row: Row,
  fields: readonly (keyof Row)[],
): boolean =>
  fields.some(field => isTemplate(row[field])) ||
  ACTION_KEYS.some(key => actionTemplates(row[key]).length > 0)

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
   * A model's `TemplateResolver` over this pool, for one viewer: rebuilds each key with the same
   * `templateRequest` the registration used, so the two cannot disagree about it.
   */
  public resolver(user: string | undefined): TemplateResolver {
    return (template, entity) => this.read(requestKey(templateRequest(template, entity, user)))
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

    // `null` collapses to absent alongside `undefined`, and that is not tidiness: HA parses a
    // render's output, so `{{ none }}` arrives as a JSON null and `String(null)` is the word
    // "null" — a name that would print as `null` and a `show` that would read as true, because
    // no falsy-word list contains it. Verified against the handler; see
    // `docs/ha-api-notes.md`'s "The result is a native type, not a string".
    const raw = push?.result
    const result = raw === undefined || raw === null ? undefined : String(raw)
    if (slot.result === result) return
    // Assigned conditionally, not `slot.result = result`: `result` is typed `string |
    // undefined`, but `exactOptionalPropertyTypes` makes `result?: string` reject an explicit
    // `undefined` — the property must be absent, not present-and-undefined.
    if (result === undefined) delete slot.result
    else slot.result = result
    this._onResult()
  }
}
