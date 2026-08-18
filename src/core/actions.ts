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
        .callService(service.slice(0, dot), service.slice(dot + 1), resolved.data, resolved.target)
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
