import { CupertinoCardEditor, applyFormData } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { BatteryCardConfig } from './battery-card'
import { entityIds, mergeDeviceRows } from './model'

export const BATTERY_EDITOR_TAG = 'cupertino-widgets-battery-editor'

/**
 * One row of the card's own, plus the **Scale** every card in the library gets.
 *
 * One, because there is only one question the card cannot answer for itself: which devices.
 * Everything else it works out — the grid from the box, the percentages from how many
 * devices there are, the icon and the name from the entity.
 *
 * `reorder` is what makes the row worth being a picker rather than a text field: the order
 * of `entities` is the order of the rings and nothing sorts them, so dragging is the whole
 * of the layout control this card offers.
 *
 * The filter is `device_class: battery` and not merely `domain: sensor`, and that is a
 * trade with a loser. It turns a list of every sensor in the installation into a list of
 * the twelve that are batteries, which is the difference between a picker and a haystack;
 * the cost is that a battery percentage published without the device class cannot be
 * reached from here at all. The helper line says where it can be — the card itself checks
 * no domain, precisely so that config is not a broken one.
 */
const SCHEMA: readonly HaFormSchema[] = [
  {
    name: 'entities',
    selector: {
      entity: {
        multiple: true,
        reorder: true,
        filter: { domain: 'sensor', device_class: 'battery' },
      },
    },
  },
]

/**
 * The battery card's visual editor.
 *
 * The interesting part is not the one row — it is `toForm`/`fromForm` below, which is what
 * lets a config carrying per-device overrides survive being looked at in here.
 */
class CupertinoBatteryCardEditor extends CupertinoCardEditor<BatteryCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return SCHEMA
  }

  protected override label(schema: HaFormSchema): string {
    switch (schema.name) {
      case 'entities':
        return 'Devices'
      default:
        return super.label(schema)
    }
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    switch (schema.name) {
      case 'entities':
        return (
          'Drag to reorder — the rings follow this list. ' +
          'A sensor without the battery device class, or a charging sensor and a shorter ' +
          'name for a device, can be added in YAML.'
        )
      default:
        return super.helper(schema)
    }
  }

  /**
   * Flatten the rows to the ids the picker can show.
   *
   * `ha-entities-picker` maps over its value as a list of entity ids, so an
   * `{ entity, charging_entity }` object reaches it as an object and it throws — on the
   * first render, which is the one the selector's own coercion sits out (see `formData`).
   */
  protected override toForm(config: BatteryCardConfig): Record<string, unknown> {
    if (config.entities === undefined) return config
    return { ...config, entities: entityIds(config.entities) }
  }

  /**
   * Fold the ids the picker reported back into the rows the config already had.
   *
   * The rule itself is `mergeDeviceRows` — a statement about the config rather than about a
   * form, and the one part of this editor a test can reach without a browser.
   */
  protected override fromForm(
    config: BatteryCardConfig,
    data: Record<string, unknown>,
    fields: readonly string[],
  ): BatteryCardConfig {
    const next = applyFormData(config, data, fields)
    if (next.entities === undefined) return next
    return { ...next, entities: mergeDeviceRows(config.entities, next.entities) }
  }
}

defineElement(BATTERY_EDITOR_TAG, CupertinoBatteryCardEditor)

export { CupertinoBatteryCardEditor }
