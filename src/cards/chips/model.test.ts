import { describe, expect, it } from 'vitest'

import {
  chipFromForm,
  chipKeys,
  chipRows,
  chipTemplates,
  chipToForm,
  CONTENT_INHERIT,
  inheritedIcon,
  inheritedName,
  readChip,
  readChips,
  truthy,
  type ChipConfig,
} from './model'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    context: { id: '' },
    ...over,
  }) as HassEntity

const hassWith = (...list: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
  }) as unknown as HomeAssistant

const HALL = entity({
  entity_id: 'sensor.hall',
  state: '21.4',
  attributes: { friendly_name: 'Hall', unit_of_measurement: '°C', device_class: 'temperature' },
})

describe('readChips', () => {
  it('reads a bare id into a drawable chip at the default content mode', () => {
    const [chip] = readChips(hassWith(HALL), ['sensor.hall'], {})
    expect(chip).toEqual({
      entityId: 'sensor.hall',
      name: 'Hall',
      icon: 'mdi:thermometer',
      value: '21.4°C',
      content: 'value',
      unavailable: false,
      color: undefined,
      visible: true,
      action: { action: 'more-info' },
    })
  })

  it('takes the card default, and lets a row override it', () => {
    const chips = readChips(
      hassWith(HALL),
      ['sensor.hall', { entity: 'sensor.hall', content: 'icon' }],
      {
        content: 'labeled',
      },
    )
    expect(chips.map(chip => chip.content)).toEqual(['labeled', 'icon'])
  })

  it('draws an entity that is not in hass at all, rather than dropping it', () => {
    // A chip has a configured identity to draw against — unlike the weather card, which
    // returns null because it has nothing of its own to show.
    const [chip] = readChips(hassWith(), [{ entity: 'sensor.gone', name: 'Gone' }], {})
    expect(chip).toMatchObject({
      entityId: 'sensor.gone',
      name: 'Gone',
      value: '—',
      unavailable: true,
    })
  })

  it('dashes and flags an entity that is present but not reporting', () => {
    const dead = entity({
      entity_id: 'sensor.hall',
      state: 'unavailable',
      attributes: { friendly_name: 'Hall' },
    })
    const [chip] = readChips(hassWith(dead), ['sensor.hall'], {})
    expect(chip).toMatchObject({ value: '—', unavailable: true, name: 'Hall' })
  })

  it('prefers a row name and icon over the entity own', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: 'Downstairs', icon: 'mdi:sofa' }],
      {},
    )
    expect(chip).toMatchObject({ name: 'Downstairs', icon: 'mdi:sofa' })
  })

  it('carries a per-row tap action, defaulting to more-info', () => {
    const rows = [
      { entity: 'sensor.hall', tap_action: { action: 'toggle' as const } },
      'sensor.hall',
    ]
    expect(readChips(hassWith(HALL), rows, {}).map(chip => chip.action.action)).toEqual([
      'toggle',
      'more-info',
    ])
  })
})

/**
 * The editor reads a chip before Home Assistant has necessarily handed it a `hass`, which the
 * card never has to. It should read like a chip whose entity is missing, because that is what
 * it is.
 */
describe('readChip without hass', () => {
  it('falls back to the configured identity and the placeholder glyph', () => {
    expect(readChip(undefined, { entity: 'sensor.hall' })).toMatchObject({
      name: 'sensor.hall',
      icon: 'mdi:eye',
      value: '—',
      unavailable: true,
    })
  })
})

/**
 * The two values the editor greys into its Icon and Name fields. A placeholder is a promise
 * about what happens when a field is left empty, so these have to be `readChip`'s own
 * fallbacks rather than a second guess at them.
 */
describe('the inherited placeholders', () => {
  it('answer what the card would draw for an entity it can see', () => {
    const hass = hassWith(HALL)
    expect(inheritedName(hass, 'sensor.hall')).toBe('Hall')
    expect(inheritedIcon(hass, 'sensor.hall')).toBe('mdi:thermometer')
  })

  it('answer what the card would draw for one it cannot', () => {
    expect(inheritedName(undefined, 'sensor.gone')).toBe('sensor.gone')
    expect(inheritedIcon(hassWith(), 'sensor.gone')).toBe('mdi:eye')
  })
})

/**
 * A chip's config carries `tap_action` as an object and an `ha-form` row reads one key of one
 * flat object, so these two are the whole of the translation. They are a pair: whatever one
 * spreads out the other has to gather up, and a key neither of them mentions has to survive
 * the trip regardless.
 */
describe('chipToForm', () => {
  it('flattens the action and shows the sentinel for a row with no content override', () => {
    expect(chipToForm({ entity: 'light.hall' })).toEqual({
      entity: 'light.hall',
      name: undefined,
      icon: undefined,
      content: CONTENT_INHERIT,
      action: 'more-info',
      navigation_path: undefined,
      service: undefined,
    })
  })

  it('spreads an action argument into its own field', () => {
    expect(
      chipToForm({
        entity: 'person.joe',
        content: 'labeled',
        tap_action: { action: 'navigate', navigation_path: '/lovelace/people' },
      }),
    ).toMatchObject({ content: 'labeled', action: 'navigate', navigation_path: '/lovelace/people' })
  })
})

describe('chipFromForm', () => {
  const bare: ChipConfig = { entity: 'light.hall' }

  it('round-trips a row nobody has overridden back to just its entity', () => {
    expect(chipFromForm(bare, chipToForm(bare))).toEqual(bare)
  })

  it('writes no tap_action for a bare more-info, because that is what no tap_action means', () => {
    expect(chipFromForm(bare, { ...chipToForm(bare), name: 'Hall lamp' })).toEqual({
      entity: 'light.hall',
      name: 'Hall lamp',
    })
  })

  it('drops the content key for the sentinel and keeps a real override', () => {
    expect(chipFromForm(bare, { ...chipToForm(bare), content: CONTENT_INHERIT })).toEqual(bare)
    expect(chipFromForm(bare, { ...chipToForm(bare), content: 'icon' })).toEqual({
      ...bare,
      content: 'icon',
    })
  })

  it('gathers an argument back up, for the action that owns it', () => {
    expect(
      chipFromForm(bare, { ...chipToForm(bare), action: 'navigate', navigation_path: '/l/0' }),
    ).toEqual({ entity: 'light.hall', tap_action: { action: 'navigate', navigation_path: '/l/0' } })
  })

  /**
   * The argument fields are read only for the action that owns them. A path left over from a
   * row that used to navigate must not ride along inside a toggle: a config carrying an
   * argument its action cannot use reads as a bug the next time somebody opens the YAML tab.
   */
  it('leaves another action argument behind when the action changes', () => {
    const prior: ChipConfig = {
      entity: 'light.hall',
      tap_action: { action: 'navigate', navigation_path: '/l/0' },
    }
    expect(chipFromForm(prior, { ...chipToForm(prior), action: 'toggle' })).toEqual({
      entity: 'light.hall',
      tap_action: { action: 'toggle' },
    })
  })

  /**
   * The three keys the form deliberately does not draw (§7 of the rules). Losing them the
   * moment somebody renamed the chip beside them would be exactly the data loss `mergeEntities`
   * exists to prevent on the cards whose lists still go through a picker.
   */
  it('carries the YAML-only action keys through an unrelated edit', () => {
    const prior: ChipConfig = {
      entity: 'binary_sensor.kettle',
      tap_action: {
        action: 'call-service',
        service: 'switch.turn_on',
        target: { entity_id: 'switch.kettle' },
        data: { transition: 2 },
        entity: 'switch.kettle',
      },
    }
    expect(chipFromForm(prior, { ...chipToForm(prior), name: 'Kettle' })).toEqual({
      ...prior,
      name: 'Kettle',
    })
  })

  it('keeps an entity override even on an action that would otherwise be written away', () => {
    const prior: ChipConfig = {
      entity: 'sensor.hall',
      tap_action: { action: 'more-info', entity: 'climate.hall' },
    }
    expect(chipFromForm(prior, chipToForm(prior))).toEqual(prior)
  })

  it('answers nothing for a row whose entity has been cleared', () => {
    expect(chipFromForm(bare, { ...chipToForm(bare), entity: '' })).toBeUndefined()
  })

  it('falls back to the default action for a value that is not one', () => {
    expect(chipFromForm(bare, { ...chipToForm(bare), action: 'explode' })).toEqual(bare)
  })
})

/**
 * The list on its way back into the config. A row with nothing but an entity in it goes back
 * as a bare string, so a config hand-written as a plain id list does not sprout objects just
 * because somebody opened a panel and closed it again.
 */
describe('chipRows', () => {
  it('flattens a row that says nothing more than its own id', () => {
    expect(chipRows([{ entity: 'sensor.a' }, { entity: 'light.b', content: 'icon' }])).toEqual([
      'sensor.a',
      { entity: 'light.b', content: 'icon' },
    ])
  })

  it('drops a row with no entity at all', () => {
    expect(chipRows([{ entity: '' }, { entity: 'sensor.a' }])).toEqual(['sensor.a'])
  })
})

/**
 * `repeat` cannot be handed two rows with one key, and this card's config may legally name the
 * same entity twice — `readChips` draws both, so the editor has to render both.
 */
describe('chipKeys', () => {
  it('keys an ordinary list by entity id and nothing else', () => {
    expect(chipKeys([{ entity: 'sensor.a' }, { entity: 'light.b' }])).toEqual([
      'sensor.a',
      'light.b',
    ])
  })

  it('suffixes the later occurrences of a repeated entity', () => {
    expect(
      chipKeys([{ entity: 'sensor.a' }, { entity: 'light.b' }, { entity: 'sensor.a' }]),
    ).toEqual(['sensor.a', 'light.b', 'sensor.a#1'])
  })
})

/**
 * The template requests a config asks for. This is what the card hands `TemplatePool.sync`,
 * so a field missed here is a field that never resolves.
 */
describe('chipTemplates', () => {
  it('finds a template in every templatable field, and ignores literals', () => {
    const requests = chipTemplates(
      [
        {
          entity: 'light.a',
          name: '{{ n }}',
          icon: '{{ i }}',
          color: '{{ c }}',
          value: '{{ v }}',
          show: '{{ s }}',
          tap_action: {
            action: 'navigate' as const,
            navigation_path: '{{ p }}',
          },
        },
        { entity: 'light.b', name: 'Plain' },
      ],
      {},
    )

    expect(requests.map(r => r.template).sort()).toEqual([
      '{{ c }}',
      '{{ i }}',
      '{{ n }}',
      '{{ p }}',
      '{{ s }}',
      '{{ v }}',
    ])
  })

  it("carries the row's own entity as a variable, so one template serves every row", () => {
    const requests = chipTemplates(
      [
        { entity: 'light.a', name: '{{ states(config.entity) }}' },
        { entity: 'light.b', name: '{{ states(config.entity) }}' },
      ],
      {},
    )

    expect(requests).toHaveLength(2)
    expect(requests.map(r => r.variables)).toEqual([
      { config: { entity: 'light.a' } },
      { config: { entity: 'light.b' } },
    ])
  })

  it('includes a templated card-level colour, with no entity of its own', () => {
    const requests = chipTemplates(['light.a'], { color: '{{ c }}' })
    expect(requests).toEqual([{ template: '{{ c }}' }])
  })

  it('asks for nothing when a config holds no templates', () => {
    expect(chipTemplates(['light.a', { entity: 'light.b', name: 'Plain' }], {})).toEqual([])
  })
})

/**
 * Home Assistant may render a boolean as a real boolean or as Python's `True`/`False`,
 * depending on the template; Task 1 established which. Both are accepted, and so is the set of
 * strings a user would reasonably expect to mean "no".
 */
describe('truthy', () => {
  it('reads the falsy set as false', () => {
    // `false` lower-case is what `String(false)` gives for the boolean HA actually sends;
    // `False` is what a `| string` filter gives. Both arrive in practice, so both are here.
    for (const no of [
      '',
      'false',
      'False',
      'False ',
      'None',
      'none',
      'null',
      '0',
      'off',
      'unavailable',
    ]) {
      expect(truthy(no)).toBe(false)
    }
  })

  it('reads anything else as true', () => {
    for (const yes of ['true', 'True', '1', 'on', 'yes', 'anything at all']) {
      expect(truthy(yes)).toBe(true)
    }
  })

  /** Before the first push. A `show` chip is hidden until its template answers. */
  it('reads an unresolved template as false', () => {
    expect(truthy(undefined)).toBe(false)
  })
})

describe('readChips with templates', () => {
  const resolve = (map: Record<string, string>) => (template: string) => map[template]

  it('falls back to the entity own values before a template resolves', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: '{{ n }}', icon: '{{ i }}' }],
      {},
      () => undefined,
    )
    expect(chip).toMatchObject({ name: 'Hall', icon: 'mdi:thermometer', visible: true })
  })

  it('applies a resolved name, icon and value', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: '{{ n }}', icon: '{{ i }}', value: '{{ v }}' }],
      {},
      resolve({ '{{ n }}': 'Hallway', '{{ i }}': 'mdi:sofa', '{{ v }}': 'warm' }),
    )
    expect(chip).toMatchObject({ name: 'Hallway', icon: 'mdi:sofa', value: 'warm' })
  })

  it('falls back to the formatted state for a value that renders empty', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', value: '{{ v }}' }],
      {},
      resolve({ '{{ v }}': '' }),
    )
    expect(chip?.value).toBe('21.4°C')
  })

  it('hides a chip whose show template is false, and shows one that is true', () => {
    const chips = readChips(
      hassWith(HALL),
      [
        { entity: 'sensor.hall', show: '{{ a }}' },
        { entity: 'sensor.hall', show: '{{ b }}' },
        { entity: 'sensor.hall' },
      ],
      {},
      resolve({ '{{ a }}': 'True', '{{ b }}': 'False' }),
    )
    expect(chips.map(chip => chip.visible)).toEqual([true, false, true])
  })

  it('resolves a colour through the palette, and passes a CSS colour through', () => {
    const chips = readChips(
      hassWith(HALL),
      [
        { entity: 'sensor.hall', color: 'red' },
        { entity: 'sensor.hall', color: '#ff8800' },
        { entity: 'sensor.hall', color: '{{ c }}' },
        { entity: 'sensor.hall' },
      ],
      {},
      resolve({ '{{ c }}': 'teal' }),
    )
    expect(chips.map(chip => chip.color)).toEqual([
      'var(--cw-red)',
      '#ff8800',
      'var(--cw-teal)',
      undefined,
    ])
  })

  it("lets a chip own colour beat the card's", () => {
    const chips = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', color: 'red' }, 'sensor.hall'],
      { color: 'blue' },
      () => undefined,
    )
    expect(chips.map(chip => chip.color)).toEqual(['var(--cw-red)', 'var(--cw-blue)'])
  })

  it('resolves a templated card-level colour, which carries no entity of its own', () => {
    const seen: (string | undefined)[] = []
    const chips = readChips(
      hassWith(HALL),
      ['sensor.hall', { entity: 'sensor.hall', color: 'green' }],
      { color: '{{ c }}' },
      (template, entity) => {
        seen.push(entity)
        return template === '{{ c }}' ? 'red' : undefined
      },
    )
    // The card-level colour is registered by `chipTemplates` with no variables, so it must be
    // looked up the same way, or the key misses and the tint silently never appears.
    expect(seen).toContain(undefined)
    // A row's own colour still wins over the card's.
    expect(chips.map(chip => chip.color)).toEqual(['var(--cw-red)', 'var(--cw-green)'])
  })

  it('templates the tap action target', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [
        {
          entity: 'sensor.hall',
          tap_action: { action: 'navigate' as const, navigation_path: '{{ p }}' },
        },
      ],
      {},
      resolve({ '{{ p }}': '/lovelace/people' }),
    )
    expect(chip?.action).toEqual({ action: 'navigate', navigation_path: '/lovelace/people' })
  })

  /** §4 of the spec: the dim is the signal, and a dimmed orange chip says two things. */
  it('drops the colour of a chip that is not reporting', () => {
    const dead = entity({
      entity_id: 'sensor.hall',
      state: 'unavailable',
      attributes: { friendly_name: 'Hall' },
    })
    const [chip] = readChips(hassWith(dead), [{ entity: 'sensor.hall', color: 'red' }], {})
    expect(chip).toMatchObject({ unavailable: true, color: undefined })
  })
})
