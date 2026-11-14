import { allActionRows, gestureHelper, gestureLabel } from '../../core/action-form'
import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import { SCALE_FIELD } from '../../core/scale'
import type { HaFormSchema } from '../../core/types/ha'
import { CHIP_CONTENTS, chipFromForm, chipToForm, DEFAULT_CONTENT } from '../chips/model'
import type { BadgeConfig } from './badge'

export const BADGE_EDITOR_TAG = 'cupertino-plus-badge-editor'

const CONTENT_LABELS: Record<string, string> = {
  icon: 'Icon only',
  value: 'Icon and reading',
  labeled: 'Icon, name and reading',
}

/**
 * The badge's rows: a chip panel's, flattened into the one form, since a badge is one chip.
 *
 * Text boxes rather than the icon and colour pickers, where the chip panel offers both behind a
 * templating switch. A badge's reason for being on a dashboard is usually a template (a count of
 * lights on, a status in words), so the boxes are the common case here rather than the escape
 * hatch; a palette name or an `mdi:` name typed into them works as it would in YAML.
 */
const fields = (data: Record<string, unknown>): readonly HaFormSchema[] => [
  { name: 'entity', selector: { entity: {} } },
  {
    name: 'content',
    selector: {
      select: {
        mode: 'dropdown',
        options: CHIP_CONTENTS.map(value => ({ value, label: CONTENT_LABELS[value] ?? value })),
      },
    },
  },
  { name: 'name', selector: { text: {} } },
  { name: 'icon', selector: { text: { placeholder: 'mdi:lightbulb-group' } } },
  { name: 'color', selector: { text: { placeholder: 'amber' } } },
  { name: 'value', selector: { text: { placeholder: "{{ states('sensor.a') }}" } } },
  { name: 'show', selector: { text: { placeholder: "{{ is_state('light.a','on') }}" } } },
  ...allActionRows(data, true),
]

const LABELS: Record<string, string> = {
  entity: 'Entity',
  content: 'Badge content',
  name: 'Name',
  icon: 'Icon',
  color: 'Colour',
  value: 'Reading',
  show: 'Show when',
  action: 'When pressed',
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
}

const HELPERS: Record<string, string> = {
  entity: 'Optional. Without one, build the badge from the fields below.',
  name: 'The caption over the reading, and the screen-reader label. May be a template.',
  icon: 'An mdi: name, or a template that answers one.',
  color:
    'A palette name (red, orange, yellow, green, teal, blue, indigo, purple, pink, grey, accent), any CSS colour, or a template.',
  value: "Replaces the entity's reading. A template, usually.",
  show: 'The badge is shown only while this is true. Hidden until it answers.',
  service: 'As domain.service. Its data and target stay in YAML, and either may be a template.',
}

/** The keys a badge's row may carry, which `fromForm` replaces wholesale from the panel's answer. */
const ROW_KEYS = new Set([
  'entity',
  'name',
  'icon',
  'content',
  'color',
  'value',
  'show',
  'tap_action',
  'hold_action',
  'double_tap_action',
])

/**
 * The badge's editor. The library's card editor, because it is the library's form with Scale
 * under it, and the translation in and out is the chip panel's own (`chipToForm` and
 * `chipFromForm`), so a badge and a chip can never disagree about what a field writes.
 */
class CupertinoBadgeEditor extends CupertinoCardEditor<BadgeConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return fields(this._config ? this.toForm(this._config) : {})
  }

  protected override defaults(): Partial<BadgeConfig> {
    return { content: DEFAULT_CONTENT }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? gestureLabel(schema.name) ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? gestureHelper(schema.name) ?? super.helper(schema)
  }

  protected override toForm(config: BadgeConfig): Record<string, unknown> {
    return { ...config, ...chipToForm(config) }
  }

  /**
   * Everything that is not the row (`type`, `scale`, Home Assistant's `visibility`) kept as it
   * was or as the Scale row says; the row itself rebuilt by `chipFromForm`, which drops what is
   * empty, including a hold or double tap left at Nothing.
   */
  protected override fromForm(
    config: BadgeConfig,
    data: Record<string, unknown>,
    formFields: readonly string[],
  ): BadgeConfig {
    const outside = super.fromForm(
      config,
      data,
      formFields.filter(name => name === SCALE_FIELD),
    )
    const kept = Object.fromEntries(Object.entries(outside).filter(([key]) => !ROW_KEYS.has(key)))
    return { ...(kept as BadgeConfig), ...chipFromForm(config, data) }
  }
}

defineElement(BADGE_EDITOR_TAG, CupertinoBadgeEditor)
