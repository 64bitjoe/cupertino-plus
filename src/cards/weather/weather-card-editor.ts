import { CupertinoCardEditor } from '../../core/card-editor'
import { PANEL_CONTAINER_FIELD, PANEL_DEFAULT_CONTAINER } from '../../core/container'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { WeatherCardConfig } from './weather-card'

export const WEATHER_EDITOR_TAG = 'cupertino-plus-weather-editor'

/**
 * Two rows, plus the scale every card in the library shares: the entity, and **Background**,
 * which is about the dashboard behind the card rather than about the weather.
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
  PANEL_CONTAINER_FIELD,
]

const LABELS: Record<string, string> = { entity: 'Weather entity', container: 'Background' }

const HELPERS: Record<string, string> = {
  entity: 'Everything else — the place, the units, the forecast — comes from this entity.',
}

/**
 * The weather card's visual editor.
 *
 * Two rows of the card's own — which entity, and which background — plus the library-wide
 * **Scale** the base class appends. Unlike the complication or battery cards, this card has
 * no per-row overrides to round-trip, so it needs no `toForm`/`fromForm`; `defaults()` is
 * here only so the Background dropdown shows `card` rather than an empty control that reads
 * as broken.
 */
class CupertinoWeatherCardEditor extends CupertinoCardEditor<WeatherCardConfig> {
  protected override fields(): readonly HaFormSchema[] {
    return FIELDS
  }

  protected override defaults(): Partial<WeatherCardConfig> {
    return { container: PANEL_DEFAULT_CONTAINER }
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
