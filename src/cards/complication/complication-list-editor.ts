/**
 * The complication card's entity list, as one control: a `SortablePanelList`
 * (`core/panel-list.ts`, which has the long arguments) of complication rows.
 *
 * A complication row differs from a tile's by what it is: always an entity (there is no entity-less
 * complication), with overrides for what the derivation guesses — name, icon, colour, range —
 * then what a press does, then, behind **Use templates**, the reading and the supporting line.
 * The row form's translation lives in `model.ts` (`complicationToForm`/`complicationFromForm`),
 * where the tests reach it.
 */

import { css, type CSSResultGroup } from 'lit'
import { property } from 'lit/decorators.js'

import { allActionRows } from '../../core/action-form'
import {
  iconSelector,
  SortablePanelList,
  textSelector,
  type PanelSummary,
} from '../../core/panel-list'
import { defineElement } from '../../core/register'
import { tintLabel } from '../../core/tint'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import { inheritedIcon, inheritedName } from '../chips/model'
import {
  COLOR_AUTOMATIC,
  complicationFromForm,
  complicationKeys,
  complicationRows,
  complicationToForm,
  rowHasTemplates,
  type ComplicationEntityConfig,
} from './model'
import { rowHelper, rowLabel, rowOverrideFields, type CardContext } from './fields'
import { DEFAULT_SPARKLINE_HOURS } from './history'
import { DEFAULT_STYLE } from './style'
import { TINTS } from './tint'

export const COMPLICATION_LIST_TAG = 'cupertino-plus-complication-list'

/** The event this element reports with. The detail is the whole list, in order. */
export interface ComplicationsChangedDetail {
  entities: (string | ComplicationEntityConfig)[]
}

/**
 * The palette and Automatic, and deliberately no "Custom…": the header and full-bleed faces
 * paint text straight onto the tint, and `onTintVar` picks that text's ink per palette colour
 * from contrast measured against both themes. An arbitrary CSS colour has no such measurement,
 * so it could put white text on yellow — see §2 of docs/complication-widget-rules.md.
 */
const COLOR_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [
      { value: COLOR_AUTOMATIC, label: 'Automatic — from what it measures' },
      ...TINTS.map(value => ({ value, label: tintLabel(value) })),
    ],
  },
}

/**
 * One row's fields, in the order somebody fills a panel in: the entity, the overrides they will
 * usually skip, what a press does, and — with templates on — the two slots that only make sense
 * as templates. Templating swaps the icon picker for a text box, since a template cannot be
 * typed into a picker, and the view picker for a path box (`actionRows`' own rule).
 */
const rowSchema = (
  hass: HomeAssistant | undefined,
  row: ComplicationEntityConfig,
  data: Record<string, unknown>,
  templating: boolean,
  card: CardContext,
): readonly HaFormSchema[] => [
  { name: 'entity', selector: { entity: {} }, required: true },
  { name: 'name', selector: textSelector(inheritedName(hass, row.entity)) },
  templating
    ? { name: 'icon', selector: { text: { placeholder: "{{ 'mdi:timer' }}" } } }
    : { name: 'icon', selector: iconSelector(inheritedIcon(hass, row.entity)) },
  { name: 'color', selector: COLOR_SELECTOR },
  { name: 'min', selector: { number: { mode: 'box' } } },
  { name: 'max', selector: { number: { mode: 'box' } } },
  ...rowOverrideFields(data, card),
  ...allActionRows(data, templating),
  ...(templating
    ? [
        {
          name: 'value',
          selector: { text: { placeholder: '{{ states(entity) | round(0) }}%' } },
        },
        {
          name: 'supporting',
          selector: { text: { placeholder: "{{ state_attr(entity, 'friendly_name') }}" } },
        },
      ]
    : []),
  { name: 'templating', selector: { boolean: {} } },
]

const ADD_LABEL = 'Add an entity'

class CupertinoComplicationList extends SortablePanelList<ComplicationEntityConfig> {
  static override styles: CSSResultGroup = [
    SortablePanelList.styles,
    css`
      :host {
        margin-bottom: 16px;
      }
    `,
  ]

  protected readonly eventName = 'complications-changed'
  protected readonly detailKey = 'entities'
  protected readonly addLabel = ADD_LABEL
  protected readonly addHint =
    'Any entity. Open a row to rename it, change its colour or range, or choose what a tap, a ' +
    'hold or a double tap does.'
  protected readonly emptyText = 'No entities yet. Add one below to draw your first complication.'
  /** No Duplicate: a complication per entity is the card's whole model. */
  protected override readonly duplicable = false
  protected override readonly openAdded = false
  /** The palette and Automatic, with no Custom…; see `COLOR_SELECTOR` above. */
  protected override readonly customColor = false

  /** The card's own settings, which each row's overrides are offered against. */
  @property({ attribute: false }) public card: CardContext = {
    style: DEFAULT_STYLE,
    sparkline: false,
    sparklineHours: DEFAULT_SPARKLINE_HOURS,
    countdown: false,
  }

  protected keysFor(rows: readonly ComplicationEntityConfig[]): string[] {
    return complicationKeys(rows)
  }

  protected configRows(
    rows: readonly ComplicationEntityConfig[],
  ): (string | ComplicationEntityConfig)[] {
    return complicationRows(rows)
  }

  protected hasTemplates(row: ComplicationEntityConfig): boolean {
    return rowHasTemplates(row)
  }

  protected toForm(row: ComplicationEntityConfig): Record<string, unknown> {
    return complicationToForm(row)
  }

  protected fromForm(
    prior: ComplicationEntityConfig,
    value: Record<string, unknown>,
  ): ComplicationEntityConfig {
    return complicationFromForm(prior, value)
  }

  protected formSchema(
    row: ComplicationEntityConfig,
    data: Record<string, unknown>,
    templating: boolean,
  ): readonly HaFormSchema[] {
    return rowSchema(this.hass, row, data, templating, this.card)
  }

  /** The row's own name and icon, unless they are templates, else what its entity gives. */
  protected panelSummary(row: ComplicationEntityConfig): PanelSummary {
    const header =
      row.name && !row.name.includes('{') ? row.name : inheritedName(this.hass, row.entity)
    const icon =
      row.icon && !row.icon.includes('{') ? row.icon : inheritedIcon(this.hass, row.entity)
    return { header: header ?? row.entity, secondary: row.entity, icon }
  }

  protected fieldLabel(name: string): string {
    return rowLabel(name)
  }

  protected fieldHelper(name: string): string | undefined {
    return rowHelper(name)
  }
}

defineElement(COMPLICATION_LIST_TAG, CupertinoComplicationList)

export { CupertinoComplicationList }
