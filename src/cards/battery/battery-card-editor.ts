import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { BatteryCardConfig } from './battery-card'
// Imported for the side effect as well as the type: the list element has to be defined by
// the time this editor renders it, and this is the only thing that reaches it.
import './device-list-editor'
import type { DevicesChangedDetail } from './device-list-editor'
import { deviceConfigs } from './model'

export const BATTERY_EDITOR_TAG = 'cupertino-widgets-battery-editor'

/**
 * The battery card's visual editor: the device list, then the **Scale** every card shares.
 *
 * There is no `ha-form` row of this card's own, and that is the point of it. The one question
 * it asks, which devices and what to draw for each, is a list whose rows are each a small
 * config, so it is a control rather than a field: `device-list-editor.ts` draws it, and the
 * long note there says why an entity picker and a stack of form panels could not.
 *
 * Everything the card reads is reachable from here. The icon, the charging sensor and the
 * name were YAML-only in earlier versions because `ha-entities-picker` reports a list of ids
 * and nothing else, which is a fact about that one selector, not about the option.
 */
class CupertinoBatteryCardEditor extends CupertinoCardEditor<BatteryCardConfig> {
  /**
   * None. `schema()` still appends **Scale**, so the form below the list is that one row.
   */
  protected override fields(): readonly HaFormSchema[] {
    return []
  }

  /**
   * The device list, handed the config's rows and trusted to report the whole list back.
   *
   * `deviceConfigs` is what makes the list element simple: it takes `entities` however
   * somebody wrote it (a bare id, an object, a scalar where a list was meant) and answers
   * with normalised rows, so the control only ever deals with one shape and a hand-written
   * config cannot make it throw.
   */
  protected override beforeForm(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing

    // The tag is written out rather than interpolated, because a lit template's tag names
    // are part of the template rather than values in it: `<${TAG}>` does not compile. The
    // constant beside it is what `defineElement` was given, and the two have to agree.
    return html`
      <cupertino-widgets-battery-devices
        .hass=${this.hass}
        .devices=${deviceConfigs(this._config.entities)}
        @devices-changed=${this._devicesChanged}
      ></cupertino-widgets-battery-devices>
    `
  }

  /**
   * The list reported. An empty one drops the key rather than writing `entities: []`, which
   * is what `applyFormData` does for the form's own rows and means the same thing: Home
   * Assistant strips `undefined` out of a config and nothing else, so an empty list would
   * survive into somebody's YAML saying exactly what its absence says.
   */
  private readonly _devicesChanged = (event: CustomEvent<DevicesChangedDetail>): void => {
    event.stopPropagation()
    if (!this._config) return

    const next: BatteryCardConfig = { ...this._config }
    if (event.detail.devices.length === 0) delete next.entities
    else next.entities = event.detail.devices

    this.emitConfig(next)
  }
}

defineElement(BATTERY_EDITOR_TAG, CupertinoBatteryCardEditor)

export { CupertinoBatteryCardEditor }
