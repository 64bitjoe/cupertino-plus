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

import { cwBack, cwNavigate } from './navigate'
import type { HomeAssistant } from './types/ha'

/**
 * Every action a press can be configured as, in the order an editor should offer them:
 * the two that need nothing said about them first, then the moves (another view, the view
 * before, a web page), then a service call and the voice assistant, and last the one that
 * switches the whole affordance off.
 *
 * A list rather than a bare union because the chips editor draws a dropdown from it, and a
 * union that only exists at the type level cannot be iterated: the version of this that had
 * both would be two lists to keep in step, and the one the compiler checks is not the one the
 * user sees.
 *
 * `back` is this library's own, since Home Assistant has none: a Mushroom back chip calls
 * history back, and a `navigate` with a fixed path is a different thing on a subview reached
 * from two places. `url` and `assist` are Home Assistant's, run by Home Assistant (see
 * `runAction`).
 */
export const ACTION_NAMES = [
  'more-info',
  'toggle',
  'navigate',
  'back',
  'url',
  'call-service',
  'assist',
  'none',
] as const

/**
 * The names a config may use that the editors do not offer. `perform-action` is the name Home
 * Assistant's own editor has written since 2024.8, for exactly what `call-service` does, so YAML
 * copied from any native card arrives with it; reading only the old name sent that YAML to
 * more-info without a word. `fire-dom-event` is what browser_mod and its kind listen for.
 */
export type ActionName = (typeof ACTION_NAMES)[number] | 'perform-action' | 'fire-dom-event'

/** Home Assistant's own confirmation dialog, which `runAction` hands the press to when set. */
export interface ActionConfirmation {
  text?: string
  title?: string
  confirm_text?: string
  dismiss_text?: string
  exemptions?: { user: string }[]
}

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
  /** `url` only. */
  url_path?: string
  /** `call-service` only, as `domain.service`. */
  service?: string
  /** `perform-action`'s name for `service`. Either is read for either action. */
  perform_action?: string
  data?: Record<string, unknown>
  /** The name `data` had before 2023; read when `data` is absent, as Home Assistant does. */
  service_data?: Record<string, unknown>
  target?: Record<string, unknown>
  /** Overrides the entity the action applies to. Rarely wanted; honoured where it is. */
  entity?: string
  /** `assist` only, passed through to Home Assistant's voice dialog. */
  pipeline_id?: string
  start_listening?: boolean
  /** `true` for Home Assistant's default wording, or the dialog's text and buttons. */
  confirmation?: boolean | ActionConfirmation
}

/** The service an action calls, whichever of the two names it was written under. */
export const serviceOf = (config: ActionConfig): string | undefined =>
  config.perform_action ?? config.service

/** Whether an action is a service call, whichever of the two names it was written under. */
export const isServiceAction = (config: ActionConfig): boolean =>
  config.action === 'call-service' || config.action === 'perform-action'

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
 * Ask the companion app for a tap of the vibration motor, as Home Assistant's own cards do
 * after a toggle or a service call. The app listens on the window for `haptic`; a browser
 * listens for nothing, and the event goes nowhere at no cost.
 */
const haptic = (element: EventTarget, kind: 'light' | 'failure'): void => {
  element.dispatchEvent(new CustomEvent('haptic', { detail: kind, bubbles: true, composed: true }))
}

/**
 * Whether Home Assistant should run this press rather than this module.
 *
 * Three actions only Home Assistant can run, and one modifier only it can draw. `assist` opens
 * the frontend's voice dialog, which is a lazy import inside the app that a card cannot reach;
 * `url` is a `window.open` that the frontend first passes through its own URL sanitiser, which a
 * second copy here would drift from; `fire-dom-event` is a contract with browser_mod and its
 * kind that the frontend owns. And a `confirmation` is Home Assistant's dialog, with the
 * service's translated name in it and the per-user exemptions honoured, none of which belongs
 * in a card library.
 *
 * The frontend takes these through `hass-action`, an event its root element has listened for
 * since 2024.1 (`src/state/action-mixin.ts`) and which its own picture, alert and shortcut
 * cards fire. Everything else stays here, because this module's version is the one that warns
 * in the console when a config is broken and the one the templates have already resolved.
 */
const delegated = (config: ActionConfig): boolean =>
  config.action === 'assist' ||
  config.action === 'url' ||
  config.action === 'fire-dom-event' ||
  (config.confirmation !== undefined && config.confirmation !== false)

/**
 * Run `config` against `entityId`, from `element`.
 *
 * Failures warn and return rather than throwing: this is called from a click handler, and an
 * exception there is an unhandled rejection in somebody's dashboard rather than a message
 * anybody sees. There is no toast mechanism in this library and this is not the place to add
 * one — the console names the card and the service, which is what a user reporting "the chip
 * does nothing" can be asked for.
 *
 * `entityId` is optional because the chips card now allows a chip with no entity at all — a
 * spacer, or one built entirely from templates. `toggle` and `more-info` both need a real
 * target and warn rather than calling Home Assistant with `entity_id: undefined` when neither
 * the chip nor an explicit `tap_action.entity` override supplies one; `navigate` and
 * `call-service` never needed `entityId` in the first place, so they are unaffected.
 */
export const runAction = (
  hass: HomeAssistant,
  element: EventTarget,
  config: ActionConfig | undefined,
  entityId: string | undefined,
): void => {
  const resolved = config ?? DEFAULT_ACTION
  const target = resolved.entity ?? entityId

  if (delegated(resolved)) {
    // Always as a tap: the gesture has already been decided by the time this runs, and the
    // config handed over holds only the action that gesture chose.
    element.dispatchEvent(
      new CustomEvent('hass-action', {
        detail: {
          config: { ...(target !== undefined ? { entity: target } : {}), tap_action: resolved },
          action: 'tap',
        },
        bubbles: true,
        composed: true,
      }),
    )
    return
  }

  switch (resolved.action) {
    case 'none':
      return

    case 'toggle':
      if (!target) {
        warn('a toggle action has no entity to toggle')
        haptic(element, 'failure')
        return
      }
      haptic(element, 'light')
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

    case 'back':
      cwBack()
      return

    case 'perform-action':
    case 'call-service': {
      const service = serviceOf(resolved)
      const dot = service ? service.indexOf('.') : -1
      if (!service || dot <= 0 || dot === service.length - 1) {
        warn(`a ${resolved.action} action needs a domain.service, got ${String(service)}`)
        haptic(element, 'failure')
        return
      }
      haptic(element, 'light')
      void hass
        .callService(
          service.slice(0, dot),
          service.slice(dot + 1),
          resolved.data ?? resolved.service_data,
          resolved.target,
        )
        .catch(() => warn(`${service} failed`))
      return
    }

    case 'more-info':
    default:
      if (!target) {
        warn('a more-info action has no entity to show')
        return
      }
      element.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: target },
          bubbles: true,
          composed: true,
        }),
      )
  }
}
