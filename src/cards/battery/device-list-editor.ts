/**
 * The battery card's device list, as one control.
 *
 * A device is four things — which sensor, which icon, which charging sensor, what to call it
 * — and this draws each of them as one row of a sortable list: an `ha-expansion-panel`
 * carrying the four fields, with a drag handle beside it and a delete button in its summary.
 * A picker at the bottom adds the next one.
 *
 * ## Why an element of its own rather than `ha-form` rows
 *
 * `ha-form` can nest — a named `expandable` node draws a panel and its rows read an object
 * of their own (`docs/ha-api-notes.md` has the mechanism) — and the card was built that way
 * first, with a multiple entity picker above the panels for adding and reordering. It worked
 * and it read as two controls for one list: the device's identity in the picker, the rest of
 * it in a panel further down, and a delete that meant unticking a checkbox somewhere else.
 * Nothing in `ha-form` can hang a handle or a bin off a panel, so the panels could never be
 * the list itself.
 *
 * Home Assistant hand-rolls this same element for its entities card
 * (`hui-entities-card-row-editor`), and everything below is borrowed from it: `ha-sortable`
 * around a wrapper the rows sit in, an `item-moved` event carrying two indices, a picker
 * with nothing in it as the add control, and clearing a row's entity as the way to say
 * delete. Its own rows open a dialog to be edited; ours expand in place, which is the one
 * departure and the reason this exists.
 *
 * ## What it may render
 *
 * Only elements Home Assistant has already defined by the time an editor is open —
 * `ha-sortable`, `ha-expansion-panel`, `ha-icon-button`, `ha-svg-icon`, `ha-icon` and
 * `ha-form` all ride in the `lovelace` panel's own chunk group, checked with the script in
 * `docs/ha-api-notes.md`. `ha-entity-picker` and `ha-icon-picker` do **not**, and are
 * reached the only safe way there is: through an `ha-form` row whose selector asks for them,
 * so `ha-selector` does the lazy import it exists to do. A bare `<ha-entity-picker>` here
 * would be an undefined element, which renders as nothing at all and looks like a bug in
 * this file.
 */

import { mdiDrag, mdiTrashCanOutline } from '@mdi/js'
import { LitElement, css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { defineElement } from '../../core/register'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import {
  deviceRows,
  inheritedIcon,
  inheritedName,
  moveRow,
  readDevice,
  type BatteryDeviceConfig,
} from './model'

export const BATTERY_DEVICES_TAG = 'cupertino-widgets-battery-devices'

/** The event this element reports with. The detail is the whole list, in order. */
export interface DevicesChangedDetail {
  devices: (string | BatteryDeviceConfig)[]
}

/**
 * The four fields of one device.
 *
 * `entity` first because it is what the row *is*; the icon next because it is the one thing
 * on this card that says which device a ring belongs to; the name last because it is the
 * only one of the four that changes nothing on screen (§6 of the rules — it is the tooltip).
 *
 * Both entity rows are filtered, and the filters are a trade with a known loser. A list of
 * every sensor in an installation is a haystack, so the device row asks for
 * `device_class: battery` and the charging row for `battery_charging` — the classes an
 * integration that knows publishes. The cost is a battery percentage published without the
 * class, which cannot be picked here at all; the card checks no domain and no class, so such
 * a config is still a working one, and the helper line says where to write it.
 *
 * The two placeholders are what the card would draw if the fields were left empty, so the
 * panel reads as "this is what you will get" rather than as a blank to be guessed at. They
 * are passed rather than left to `context: { icon_entity: … }`, which Home Assistant would
 * answer with the entity's *state* icon: for a battery sensor that is computed from the
 * level, so it would offer `mdi:battery-70` where this card draws `mdi:battery`.
 */
const deviceSchema = (
  hass: HomeAssistant | undefined,
  config: BatteryDeviceConfig,
): readonly HaFormSchema[] => [
  {
    name: 'entity',
    required: true,
    selector: { entity: { filter: { domain: 'sensor', device_class: 'battery' } } },
  },
  { name: 'icon', selector: { icon: { placeholder: inheritedIcon(hass, config.entity) } } },
  {
    name: 'charging_entity',
    selector: {
      entity: { filter: { domain: 'binary_sensor', device_class: 'battery_charging' } },
    },
  },
  { name: 'name', selector: { text: { placeholder: inheritedName(hass, config.entity) } } },
]

/** The add row: one empty picker, and the same filter the device row uses. */
const ADD_SCHEMA: readonly HaFormSchema[] = [
  {
    name: 'entity',
    selector: { entity: { filter: { domain: 'sensor', device_class: 'battery' } } },
  },
]

const LABELS: Record<string, string> = {
  entity: 'Battery sensor',
  icon: 'Icon',
  charging_entity: 'Charging sensor',
  name: 'Name',
}

/**
 * Not localised, like the rest of the library's own words — Home Assistant has a translated
 * string for a list of entities and none for any of this.
 */
const HELPERS: Record<string, string> = {
  icon: 'Says which device this is — the ring already says the level.',
  charging_entity:
    'A binary sensor that is on while this device is charging. Only needed when the ' +
    'battery sensor does not report it itself.',
  name: 'The tooltip and the screen-reader label. The card never draws it.',
}

const ADD_LABEL = 'Add a device'

const ADD_HELPER =
  'Pick a battery sensor and it joins the list. A sensor published without the battery ' +
  'device class is not offered here; it still works if you add it in YAML.'

class CupertinoBatteryDevices extends LitElement {
  /**
   * Home Assistant's own furniture, not ours — no `--cw-*` token appears here, for the
   * reason `CupertinoCardEditor` gives: a widget that looks like a phone's should still have
   * a config panel that looks like the dialog it is sitting in. The spacing scale, the
   * divider and the secondary text colour are all HA's.
   */
  static override styles: CSSResultGroup = css`
    :host {
      display: block;
    }

    .devices {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* The handle and the panel side by side, aligned to the top rather than centred: the
       panel grows downwards when it is opened, and a handle that centred itself against an
       expanded panel would drift away from the row it drags. 48px is ha-expansion-panel's
       own summary height, so the handle sits against the middle of the summary line. */
    .device {
      display: flex;
      align-items: flex-start;
    }

    .handle {
      display: flex;
      align-items: center;
      height: 48px;
      padding-inline-end: 8px;
      color: var(--secondary-text-color);
      cursor: grab;
    }

    /* Otherwise a drag that starts on the glyph is a drag of the glyph, and the row stays
       where it is. */
    .handle > * {
      pointer-events: none;
    }

    ha-expansion-panel {
      flex: 1;
      min-width: 0;
    }

    ha-expansion-panel ha-icon {
      color: var(--secondary-text-color);
    }

    .remove {
      --ha-icon-button-size: 36px;
      color: var(--secondary-text-color);
    }

    .fields {
      display: block;
      padding: 8px 0 16px;
    }

    .add {
      display: block;
      margin-top: 16px;
    }

    .empty {
      margin: 0 0 16px;
      color: var(--secondary-text-color);
      font-size: 13px;
    }
  `

  @property({ attribute: false }) public hass?: HomeAssistant

  /** Normalised by the editor, so every row here is known to have an entity in it. */
  @property({ attribute: false }) public devices: readonly BatteryDeviceConfig[] = []

  /**
   * Which panels are open, by entity id.
   *
   * Held here rather than left to each `ha-expansion-panel`, because this element re-renders
   * from the config on every keystroke: an `expanded` that only lived in the panel would be
   * whatever the recycled DOM node happened to have. By entity id and not by position so a
   * dragged row keeps its panel open, which is also why the rows are keyed below.
   */
  private readonly _open = new Set<string>()

  private readonly _computeLabel = (schema: HaFormSchema): string =>
    LABELS[schema.name] ?? schema.name

  private readonly _computeHelper = (schema: HaFormSchema): string | undefined =>
    HELPERS[schema.name]

  private readonly _computeAddLabel = (): string => ADD_LABEL

  private readonly _computeAddHelper = (): string => ADD_HELPER

  private _emit(rows: readonly unknown[]): void {
    this.dispatchEvent(
      new CustomEvent<DevicesChangedDetail>('devices-changed', {
        detail: { devices: deviceRows(rows) },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * One row's form reported. It carries the whole row, so it replaces the whole row.
   *
   * A row whose entity has been cleared is dropped rather than kept as a device with no
   * sensor — see `deviceRow`, and note that `deviceRows` would drop it anyway. Doing it here
   * as well is not belt-and-braces: it keeps `_open` from holding an id nothing will render.
   */
  private readonly _rowChanged = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
    index: number,
  ): void => {
    event.stopPropagation()
    const value = event.detail.value
    const previous = this.devices[index]
    const next = [...this.devices]

    if (typeof value.entity !== 'string' || value.entity === '') {
      next.splice(index, 1)
      if (previous) this._open.delete(previous.entity)
    } else {
      next[index] = value as unknown as BatteryDeviceConfig
      // The panel stays open across the rename that a changed entity amounts to.
      if (previous && previous.entity !== value.entity && this._open.delete(previous.entity)) {
        this._open.add(value.entity)
      }
    }

    this._emit(next)
  }

  private readonly _remove = (event: Event, index: number): void => {
    // `ha-expansion-panel` toggles on any click inside its summary unless the event has
    // been defaulted away — `_toggleContainer` opens with `if (e.defaultPrevented) return`.
    // Without this the row would be deleted and the panel above it would open.
    event.preventDefault()
    event.stopPropagation()

    const going = this.devices[index]
    if (going) this._open.delete(going.entity)
    const next = [...this.devices]
    next.splice(index, 1)
    this._emit(next)
  }

  private readonly _moved = (event: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    event.stopPropagation()
    this._emit(moveRow(this.devices, event.detail.oldIndex, event.detail.newIndex))
  }

  /**
   * The add picker reported an entity.
   *
   * Nothing is emitted for the empty value the picker reports when it is cleared, and the
   * duplicate is refused: two rings for one sensor is not something anybody means, and the
   * rows are keyed by entity id.
   */
  private readonly _add = (event: CustomEvent<{ value: Record<string, unknown> }>): void => {
    event.stopPropagation()
    const entity = event.detail.value.entity
    if (typeof entity !== 'string' || entity === '') return
    if (this.devices.some(device => device.entity === entity)) return

    this._open.add(entity)
    this._emit([...this.devices, { entity }])
  }

  private readonly _toggled = (event: CustomEvent<{ expanded: boolean }>, entity: string): void => {
    if (event.detail.expanded) this._open.add(entity)
    else this._open.delete(entity)
  }

  private _renderDevice(config: BatteryDeviceConfig, index: number): TemplateResult {
    // Name and icon as the card is drawing them right now, overrides included — so a row is
    // recognisable in the editor by the same glyph it has on the widget.
    const device = readDevice(this.hass, config)

    return html`
      <div class="device">
        <div class="handle">
          <ha-svg-icon .path=${mdiDrag}></ha-svg-icon>
        </div>
        <ha-expansion-panel
          outlined
          .header=${device.name}
          .secondary=${config.entity}
          .expanded=${this._open.has(config.entity)}
          @expanded-changed=${(event: CustomEvent<{ expanded: boolean }>) =>
            this._toggled(event, config.entity)}
        >
          <ha-icon slot="leading-icon" .icon=${device.icon}></ha-icon>
          <ha-icon-button
            slot="icons"
            class="remove"
            .path=${mdiTrashCanOutline}
            .label=${`Remove ${device.name}`}
            @click=${(event: Event) => this._remove(event, index)}
          ></ha-icon-button>
          <ha-form
            class="fields"
            .hass=${this.hass}
            .data=${config}
            .schema=${deviceSchema(this.hass, config)}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) =>
              this._rowChanged(event, index)}
          ></ha-form>
        </ha-expansion-panel>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing

    return html`
      ${
        this.devices.length === 0
          ? html`<p class="empty">No devices yet — the card will say so too.</p>`
          : nothing
      }
      <!-- The wrapper is required rather than tidy: ha-sortable makes its FIRST child
           sortable, so without one the rows would not be the things being dragged. The rows
           are keyed by entity id so that a drag moves the row rather than rewriting every
           row's contents — which is what keeps an open panel open and the caret where it
           was. ha-sortable rolls its own DOM change back on drop and leaves the reordering
           to this render, so the key is the whole of what makes a drag land. -->
      <ha-sortable handle-selector=".handle" @item-moved=${this._moved}>
        <div class="devices">
          ${repeat(
            this.devices,
            device => device.entity,
            (device, index) => this._renderDevice(device, index),
          )}
        </div>
      </ha-sortable>
      <ha-form
        class="add"
        .hass=${this.hass}
        .data=${{}}
        .schema=${ADD_SCHEMA}
        .computeLabel=${this._computeAddLabel}
        .computeHelper=${this._computeAddHelper}
        @value-changed=${this._add}
      ></ha-form>
    `
  }
}

defineElement(BATTERY_DEVICES_TAG, CupertinoBatteryDevices)

export { CupertinoBatteryDevices }
