import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'

import { isPressable, runAction, type ActionConfig } from '../../core/actions'
import { activationKey } from '../../core/gestures'
import { registerCard } from '../../core/register'
import type { LovelaceCardEditor } from '../../core/types/ha'
import { CupertinoChipsCard, type ChipsCardConfig } from '../chips/chips-card'
import { roomKeysOf, type RoomKeys } from '../../core/area-summary'
import { ROOM_EDITOR_TAG } from './room-card-editor'

export const ROOM_CARD_TAG = 'cupertino-plus-room'

export interface RoomCardConfig extends ChipsCardConfig, RoomKeys {
  /** Replaces the area's own name in the title. */
  name?: string
  /** Draw the title at all. On by default: the title is most of what makes this a room card. */
  show_name?: boolean
  /** What a press on the title does: usually `navigate` to the room's own view. */
  tap_action?: ActionConfig
}

/**
 * The top of a room in Apple's Home app: the room's name, and under it the status of what is in
 * it, one pill per fact ("72°", "2 Lights On", a red "Leak"), each opening the device behind it.
 *
 * A chips card with one room row and a title, and nothing else, so the pills are the chips
 * card's own: the same glass, the same press, the same sizing. `setConfig` is the whole of the
 * translation from a room card's keys to a chips card's, and the summary is
 * `core/area-summary.ts`'s, which the tiles card's room tiles read too.
 *
 * The title is Title 1, the Home app's room heading in a list rather than its navigation-bar
 * Large Title: this sits in a dashboard section, beside other cards, not at the top of a screen.
 */
class CupertinoRoomCard extends CupertinoChipsCard {
  static override styles: CSSResultGroup = [
    CupertinoChipsCard.styles,
    css`
      .title {
        font: var(--cw-text-title-1);
        color: var(--cw-label);
        letter-spacing: -0.01em;
        margin: 0;
        padding: 0 0 var(--cw-space-2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        /* The title's own box is the button, so a press reads the room's name and nothing wider. */
        width: fit-content;
        max-width: 100%;
        border-radius: var(--cw-radius-inner);
      }
      .surface .title {
        padding: var(--cw-inset) var(--cw-inset) 0;
      }
      .title.pressable {
        cursor: pointer;
      }
      .title.pressable:focus-visible {
        outline: 2px solid var(--cw-accent);
        outline-offset: 2px;
      }
      .title.pressable:active {
        opacity: 0.6;
      }
    `,
  ]

  private _room: RoomCardConfig | undefined

  public static override getStubConfig(): RoomCardConfig {
    return { type: `custom:${ROOM_CARD_TAG}` }
  }

  public static override getConfigElement(): LovelaceCardEditor {
    return document.createElement(ROOM_EDITOR_TAG) as LovelaceCardEditor
  }

  /**
   * The room card's keys, translated into the chips card's: one room row carrying the area, its
   * facts and its sensors, and the row colour as that row's. No area is not an error: a card
   * dropped from the picker has none yet, and draws its prompt until one is chosen.
   */
  public override setConfig(config: RoomCardConfig): void {
    if (!config) throw new Error('Invalid configuration')
    this._room = config
    super.setConfig({ ...config, entities: config.area ? [roomKeysOf(config)] : [] })
  }

  private get _title(): string {
    const room = this._room
    if (!room) return ''
    return room.name ?? (room.area ? (this.hass?.areas?.[room.area]?.name ?? room.area) : '')
  }

  protected override titleRows(): number {
    return this._room?.show_name === false ? 0 : 1
  }

  protected override renderTitle(): TemplateResult | typeof nothing {
    if (this._room?.show_name === false) return nothing
    const title = this._title || 'Choose a room'
    const action = this._room?.tap_action
    if (action === undefined || !isPressable(action)) return html`<h2 class="title">${title}</h2>`
    return html`<h2
      class="title pressable"
      role="button"
      tabindex="0"
      @click=${this._pressTitle}
      @keydown=${activationKey(this._pressTitle)}
    >
      ${title}
    </h2>`
  }

  private readonly _pressTitle = (): void => {
    const action = this._room?.tap_action
    if (this.hass && action && isPressable(action)) runAction(this.hass, this, action, undefined)
  }
}

registerCard(ROOM_CARD_TAG, CupertinoRoomCard, {
  name: 'Cupertino Room',
  description: "A room's name over what it is doing, the way the Home app shows a room.",
})

export { CupertinoRoomCard }
