import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { WeatherCardConfig } from './weather-card'

export const WEATHER_EDITOR_TAG = 'cupertino-plus-weather-editor'

/**
 * One row, plus the scale every card in the library shares.
 *
 * There is nothing else to ask. The location, the units, the condition words, the glyphs
 * and the forecast all come off the entity, and the footprint belongs to the Layout tab.
 * A weather card that asked which units you wanted would be asking you to repeat something
 * Home Assistant already knows and can change under it.
 */
const FIELDS: readonly HaFormSchema[] = [
  {
    name: 'entity',
    selector: { entity: { filter: { domain: 'weather' } } },
    required: true,
  },
]

const LABELS: Record<string, string> = { entity: 'Weather entity' }

const HELPERS: Record<string, string> = {
  entity: 'Everything else — the place, the units, the forecast — comes from this entity.',
}

/**
 * The weather card's visual editor.
 *
 * One row of the card's own — which entity — plus the library-wide **Scale** the base
 * class appends. Nothing else: unlike the complication or battery cards, this card has no
 * per-row overrides to round-trip and no field whose absence would render as a broken
 * empty control, so it needs neither `defaults()` nor `toForm`/`fromForm` — `fields()`,
 * `label()` and `helper()` are the whole of what this class adds to `CupertinoCardEditor`.
 */
class CupertinoWeatherCardEditor extends CupertinoCardEditor<WeatherCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return FIELDS
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }
}

defineElement(WEATHER_EDITOR_TAG, CupertinoWeatherCardEditor)

export { CupertinoWeatherCardEditor }
