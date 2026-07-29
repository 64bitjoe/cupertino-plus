import { CupertinoCardEditor, applyFormData } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import type { BatteryCardConfig } from './battery-card'
import {
  deviceConfigs,
  inheritedIcon,
  inheritedName,
  readDevice,
  writeDeviceRows,
  type BatteryDeviceConfig,
} from './model'

export const BATTERY_EDITOR_TAG = 'cupertino-widgets-battery-editor'

/**
 * Which devices, and in what order.
 *
 * `reorder` is what makes this worth being a picker rather than a text field: the order of
 * `entities` is the order of the rings and nothing sorts them, so dragging is the whole of
 * the layout control this card offers.
 *
 * The filter is `device_class: battery` and not merely `domain: sensor`, and that is a
 * trade with a loser. It turns a list of every sensor in the installation into a list of
 * the twelve that are batteries, which is the difference between a picker and a haystack;
 * the cost is that a battery percentage published without the device class cannot be
 * reached from here. The helper line says so — the card itself checks no domain, precisely
 * so that config is not a broken one.
 */
const DEVICES_ROW: HaFormSchema = {
  name: 'entities',
  selector: {
    entity: {
      multiple: true,
      reorder: true,
      filter: { domain: 'sensor', device_class: 'battery' },
    },
  },
}

/**
 * The form field a device's panel lives under, and the reason it is prefixed.
 *
 * `ha-form` keys a panel's data by the panel's name, so these sit in the same flat object
 * as `entities` and `scale` — one key per configured device, and they must not be mistaken
 * for config keys on the way back out. The entity id is the key rather than the device's
 * position because the position moves: removing the first of three devices shifts the other
 * two up, and a panel matched by index would have handed the first device's icon to the
 * second. Keying by the thing that identifies the row survives reordering, removal and
 * re-adding without a special case for any of them.
 */
const PANEL_PREFIX = 'cw_device:'

const panelKey = (entity: string): string => `${PANEL_PREFIX}${entity}`

const isPanelKey = (field: string): boolean => field.startsWith(PANEL_PREFIX)

/**
 * The three fields a device carries beyond its entity — the ones Home Assistant cannot
 * work out on the card's behalf.
 *
 * In the order of what they change: the icon and the bolt are drawn, the name is not (§6 of
 * the rules says why it is a tooltip). Each is offered as an override with the inherited
 * value greyed into the empty field, so the panel reads as "this is what you will get" and
 * an untouched device keeps nothing in the config at all.
 */
const panelSchema = (
  hass: HomeAssistant | undefined,
  config: BatteryDeviceConfig,
): readonly HaFormSchema[] => [
  {
    name: 'icon',
    selector: { icon: { placeholder: inheritedIcon(hass, config.entity) } },
  },
  {
    name: 'charging_entity',
    /* The `battery_charging` binary sensor an integration that knows publishes — the same
       narrowing as the devices row above, and for the same reason. A sensor that reports
       charging some other way needs nothing here: `model.ts` reads `is_charging` and
       `battery_state` off the battery sensor's own attributes for free. */
    selector: {
      entity: { filter: { domain: 'binary_sensor', device_class: 'battery_charging' } },
    },
  },
  {
    name: 'name',
    selector: { text: { placeholder: inheritedName(hass, config.entity) } },
  },
]

/**
 * The battery card's visual editor: the device list, then a panel per device, then Scale.
 *
 * Everything the card reads is reachable from here, which is the whole point of the panels
 * — the icon, the charging sensor and the name used to be YAML-only, because a multiple
 * entity picker reports a list of ids and nothing else. Home Assistant's own answer to a
 * list whose rows carry more than that is either a bespoke row editor (its entities card) or
 * the newer `object` selector, which draws a sortable list and opens a modal per row. Both
 * were tried on paper and neither won: the picker is how somebody adds four batteries in
 * four clicks, and dropping it to gain per-row fields would have made the common case worse
 * to fix the rare one. A named `expandable` per device keeps the picker and puts the fields
 * one click away — and, unlike a modal, it can show the inherited icon and name as
 * placeholders, since `_schema` inside the object selector's dialog drops the `context` that
 * would be needed to work them out there.
 */
class CupertinoBatteryCardEditor extends CupertinoCardEditor<BatteryCardConfig> {
  /**
   * The devices row, and one panel per device the config names.
   *
   * Derived on every render rather than held: adding a device in the picker has to grow a
   * panel for it, and the summary line carries the device's own name and glyph, which come
   * out of `hass` and change under the editor while it is open.
   */
  protected override fields(): readonly HaFormSchema[] {
    return [DEVICES_ROW, ...this._panels()]
  }

  private _panels(): readonly HaFormSchema[] {
    return deviceConfigs(this._config?.entities).map(config => {
      // The name and icon the card is drawing for this device right now, overrides
      // included — so the summary line is the row as it appears on the widget, and a
      // device given its own icon is recognisable in the editor by the same glyph.
      const device = readDevice(this.hass, config)

      return {
        type: 'expandable',
        name: panelKey(config.entity),
        title: device.name,
        icon: device.icon,
        schema: panelSchema(this.hass, config),
      }
    })
  }

  protected override label(schema: HaFormSchema): string {
    switch (schema.name) {
      case 'entities':
        return 'Devices'
      // The three below are a panel's rows. One label each covers every panel: `ha-form`
      // asks the same `computeLabel` for the rows inside an expandable as for the rows
      // outside one, and a device's panel is the context that says which device it is.
      case 'icon':
        return 'Icon'
      case 'charging_entity':
        return 'Charging sensor'
      case 'name':
        return 'Name'
      default:
        return super.label(schema)
    }
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    switch (schema.name) {
      case 'entities':
        return (
          'Drag to reorder — the rings follow this list, and each device gets a panel of ' +
          'its own below. A battery sensor published without the battery device class is ' +
          'not listed here; it still works if you add it in YAML.'
        )
      case 'icon':
        return 'Says which device this is — the ring already says the level.'
      case 'charging_entity':
        return (
          'A binary sensor that is on while this device is charging. Only needed when the ' +
          'battery sensor does not report it itself.'
        )
      case 'name':
        return 'The tooltip and the screen-reader label. The card never draws it.'
      default:
        return super.helper(schema)
    }
  }

  /**
   * The config as the form reads it: the ids for the picker, and one object per device for
   * its panel.
   *
   * Flattening `entities` is not a nicety. `ha-entities-picker` maps over its value as a
   * list of entity ids, so an `{ entity, charging_entity }` object reaches it as an object
   * and it throws — on the first render, which is the one the selector's own coercion sits
   * out (see `formData`).
   */
  protected override toForm(config: BatteryCardConfig): Record<string, unknown> {
    if (config.entities === undefined) return config

    const rows = deviceConfigs(config.entities)
    const panels = rows.map(({ entity, ...panel }) => [panelKey(entity), panel] as const)

    return { ...config, entities: rows.map(row => row.entity), ...Object.fromEntries(panels) }
  }

  /**
   * The form's answer, folded back into the config.
   *
   * The panels are stripped from the field list rather than filtered afterwards: they are
   * the form's own bookkeeping and must never reach `applyFormData`, which would write a
   * `cw_device:sensor.phone_battery` key straight into somebody's YAML. What they hold goes
   * into the rows instead, and the rule for that is `writeDeviceRows` — a statement about
   * the config rather than about a form, and the one part of this editor a test can reach
   * without a browser.
   */
  protected override fromForm(
    config: BatteryCardConfig,
    data: Record<string, unknown>,
    fields: readonly string[],
  ): BatteryCardConfig {
    const next = applyFormData(
      config,
      data,
      fields.filter(field => !isPanelKey(field)),
    )
    if (next.entities === undefined) return next

    return {
      ...next,
      entities: writeDeviceRows(next.entities, entity => data[panelKey(entity)]),
    }
  }
}

defineElement(BATTERY_EDITOR_TAG, CupertinoBatteryCardEditor)

export { CupertinoBatteryCardEditor }
