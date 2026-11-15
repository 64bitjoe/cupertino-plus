import {
  actionRows,
  gestureHelper,
  gestureLabel,
  actionFromForm,
  actionToForm,
} from '../../core/action-form'
import { roomFromForm, roomHelper, roomLabel, roomRows, roomToForm } from '../../core/area-form'
import { ROOM_KEYS } from '../../core/area-summary'
import { CupertinoCardEditor } from '../../core/card-editor'
import { FLOATING_CONTAINER_FIELD, FLOATING_CONTAINER_HELPER } from '../../core/container'
import { defineElement } from '../../core/register'
import { SCALE_FIELD } from '../../core/scale'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import { CHIP_ALIGNMENTS, DEFAULT_ALIGNMENT } from '../chips/model'
import { ALIGNMENT_LABELS, CONTENT_LABELS, dropdown } from '../chips/chips-card-editor'
import type { RoomCardConfig } from './room-card'

export const ROOM_EDITOR_TAG = 'cupertino-plus-room-editor'

/** A fact's reading is its words, so the chips card's "Icon and reading" says "words" here. */
const ROOM_CONTENT_LABELS: Record<string, string> = { ...CONTENT_LABELS, value: 'Icon and words' }

/**
 * The room first (which room, which facts, which sensors), then the title and what pressing it
 * does, then how the pills look. The order somebody sets a room card up in.
 */
const fields = (
  data: Record<string, unknown>,
  hass: HomeAssistant | undefined,
): readonly HaFormSchema[] => [
  ...roomRows(data, { hass }),
  { name: 'show_name', selector: { boolean: {} } },
  ...(data.show_name === false
    ? []
    : [{ name: 'name', selector: { text: {} } }, ...actionRows(data, false)]),
  { name: 'content', selector: dropdown(['value', 'icon'], ROOM_CONTENT_LABELS) },
  { name: 'alignment', selector: dropdown(CHIP_ALIGNMENTS, ALIGNMENT_LABELS) },
  FLOATING_CONTAINER_FIELD,
]

const LABELS: Record<string, string> = {
  show_name: 'Show the room name',
  name: 'Name',
  action: 'When the name is pressed',
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
  content: 'Pills show',
  alignment: 'Alignment',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  name: "Leave empty for the area's own name.",
  action: "Usually Go to a view, with the room's own dashboard view as the path.",
  content: 'Icon only keeps the words as each pill’s label for VoiceOver.',
  container: FLOATING_CONTAINER_HELPER,
}

/** Keys this editor writes from the panel rather than with `applyFormData`. */
const OWN_KEYS = new Set<string>([...ROOM_KEYS, 'tap_action', 'show_name'])

export class CupertinoRoomCardEditor extends CupertinoCardEditor<RoomCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return fields(this._config ? this.toForm(this._config) : {}, this.hass)
  }

  protected override defaults(): Partial<RoomCardConfig> {
    return { content: 'value', alignment: DEFAULT_ALIGNMENT, container: 'glass' }
  }

  protected override label(schema: HaFormSchema): string {
    return (
      LABELS[schema.name] ??
      roomLabel(schema.name) ??
      gestureLabel(schema.name) ??
      super.label(schema)
    )
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return (
      HELPERS[schema.name] ??
      roomHelper(schema.name, 'chips') ??
      gestureHelper(schema.name) ??
      super.helper(schema)
    )
  }

  protected override toForm(config: RoomCardConfig): Record<string, unknown> {
    return {
      ...config,
      ...roomToForm(config),
      // A title presses to nothing unless told otherwise, whatever the room holds.
      ...actionToForm(config.tap_action, undefined),
      show_name: config.show_name !== false,
    }
  }

  /**
   * The plain keys (name, content, alignment, background, scale) folded back as every editor
   * does; the room and the title's press rebuilt from the panel, each written only when it says
   * something. `show_name` is written only when it is off, since on is what its absence means.
   */
  protected override fromForm(
    config: RoomCardConfig,
    data: Record<string, unknown>,
    formFields: readonly string[],
  ): RoomCardConfig {
    const plain = formFields.filter(
      name => ['name', 'content', 'alignment', 'container'].includes(name) || name === SCALE_FIELD,
    )
    const outside = super.fromForm(config, data, plain)
    const kept = Object.fromEntries(
      Object.entries(outside).filter(([key]) => !OWN_KEYS.has(key)),
    ) as RoomCardConfig
    const next: RoomCardConfig = { ...kept, ...roomFromForm(data) }
    if (data.show_name === false) next.show_name = false
    const press = actionFromForm(config.tap_action, data, 'none')
    if (press !== undefined) next.tap_action = press
    return next
  }
}

defineElement(ROOM_EDITOR_TAG, CupertinoRoomCardEditor)
