import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FLOW,
  DEFAULT_WASH,
  flowFor,
  orientationFor,
  readTile,
  readTiles,
  stateLinesFor,
  tileConfigs,
  tileFromForm,
  tileHasTemplates,
  tileKeys,
  tileRows,
  tileTemplates,
  tileToForm,
  tileLabel,
  tilesHaveGlyphs,
  tileWatchedIds,
  washFor,
  type TileConfig,
} from './model'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    ...over,
  }) as HassEntity

const hassWith = (...list: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
  }) as unknown as HomeAssistant

const GARAGE = entity({
  entity_id: 'cover.garage',
  state: 'closed',
  attributes: { friendly_name: 'Garage', device_class: 'garage' },
})

describe('readTiles', () => {
  it('reads a bare id into a drawable tile', () => {
    const [tile] = readTiles(hassWith(GARAGE), ['cover.garage'], {})
    expect(tile).toMatchObject({
      entityId: 'cover.garage',
      name: 'Garage',
      unavailable: false,
      visible: true,
      break: false,
    })
    expect(tile?.value).not.toBe('')
  })

  /** §3: a tile carries an identity, unlike a chip. */
  it('tints itself from what the entity is, with no colour configured', () => {
    const [tile] = readTiles(hassWith(GARAGE), ['cover.garage'], {})
    expect(tile?.color).toBe('var(--cw-indigo)')
  })

  /**
   * The one place the tiles card overrides the shared table, settled against a render: `accent`
   * is the theme's primary, which under Home Assistant's default theme is a light blue that sits
   * beside a person's or a humidity sensor's `blue` as another blue tile. A scene is the
   * commonest occupant of a shortcut grid, so it gets a colour of its own.
   */
  it('tints a scene purple rather than the accent a complication would give it', () => {
    const scene = entity({ entity_id: 'scene.movie_night', attributes: {} })
    expect(readTiles(hassWith(scene), ['scene.movie_night'], {})[0]?.color).toBe('var(--cw-purple)')
  })

  it('still tints a domain neither table knows with the accent', () => {
    const plain = entity({ entity_id: 'switch.kettle', state: 'off', attributes: {} })
    expect(readTiles(hassWith(plain), ['switch.kettle'], {})[0]?.color).toBe('var(--cw-accent)')
  })

  it('lets a configured colour beat the automatic one', () => {
    const [tile] = readTiles(hassWith(GARAGE), [{ entity: 'cover.garage', color: 'green' }], {})
    expect(tile?.color).toBe('var(--cw-green)')
  })

  it('lets a card-level colour beat the automatic one, and a tile beat the card', () => {
    const tiles = readTiles(
      hassWith(GARAGE),
      ['cover.garage', { entity: 'cover.garage', color: 'red' }],
      { color: 'blue' },
    )
    expect(tiles.map(t => t.color)).toEqual(['var(--cw-blue)', 'var(--cw-red)'])
  })

  /** The dim is the signal that a tile is not reporting; a crisp tint undercuts it. */
  it('drops the colour of a tile that is not reporting', () => {
    const dead = entity({
      entity_id: 'cover.garage',
      state: 'unavailable',
      attributes: { friendly_name: 'Garage' },
    })
    expect(readTiles(hassWith(dead), ['cover.garage'], {})[0]).toMatchObject({
      unavailable: true,
      color: undefined,
      value: '—',
    })
  })
})

/**
 * §4: a tile with no entity is a navigation tile — Climate, Scenes and Cats in the config being
 * replaced are exactly this. Unlike a chip it is never a spacer.
 */
describe('a tile with no entity', () => {
  it('draws what it was given and never becomes a spacer', () => {
    const [tile] = readTiles(hassWith(), [{ name: 'Climate', icon: 'mdi:snowflake' }], {})
    expect(tile).toMatchObject({
      entityId: undefined,
      name: 'Climate',
      icon: 'mdi:snowflake',
      unavailable: false,
    })
  })

  /**
   * §5: nothing for its state line, not a dash. A dash is what a tile that is not reporting
   * shows, and a navigation tile has nothing to report; the element keeps the line's height.
   */
  it('reads an empty state line rather than a dash', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.value).toBe('')
  })

  it('reads an empty state line when its value template renders nothing', () => {
    const [tile] = readTiles(hassWith(), [{ name: 'Scenes', value: '{{ x }}' }], {}, () => '')
    expect(tile?.value).toBe('')
  })

  it('still draws a value it was given', () => {
    expect(readTiles(hassWith(), [{ name: 'Garage', value: 'All Closed' }], {})[0]?.value).toBe(
      'All Closed',
    )
  })

  /** The dash keeps its one meaning: an entity that is not reporting. */
  it('leaves the dash to an entity tile that is not reporting', () => {
    expect(readTile(hassWith(), { entity: 'cover.gone' }).value).toBe('—')
  })

  /** A literal empty `value:` is not a template result, but it must read as "no override" too. */
  it('treats a literal empty value as no override', () => {
    const [entityTile] = readTiles(hassWith(GARAGE), [{ entity: 'cover.garage', value: '' }], {})
    const [bareTile] = readTiles(hassWith(GARAGE), ['cover.garage'], {})
    expect(entityTile?.value).toBe(bareTile?.value)
    expect(entityTile?.value).not.toBe('')
    expect(readTiles(hassWith(), [{ name: 'Scenes', value: '' }], {})[0]?.value).toBe('')
  })

  it('defaults its press to doing nothing, not more-info', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.action).toEqual({ action: 'none' })
  })

  it('honours an explicit tap action', () => {
    const [tile] = readTiles(
      hassWith(),
      [{ name: 'Climate', tap_action: { action: 'navigate', navigation_path: '/cat-climate' } }],
      {},
    )
    expect(tile?.action).toEqual({ action: 'navigate', navigation_path: '/cat-climate' })
  })

  it('has no automatic tint, having no entity to read one from', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.color).toBeUndefined()
  })
})

describe('templates', () => {
  const resolve = (map: Record<string, string>) => (t: string) => map[t]

  it('replaces the state line', () => {
    const [tile] = readTiles(
      hassWith(GARAGE),
      [{ entity: 'cover.garage', value: '{{ v }}' }],
      {},
      resolve({ '{{ v }}': 'All Closed' }),
    )
    expect(tile?.value).toBe('All Closed')
  })

  it('falls back to the entity reading before a template answers', () => {
    const [tile] = readTiles(
      hassWith(GARAGE),
      [{ entity: 'cover.garage', value: '{{ v }}' }],
      {},
      () => undefined,
    )
    expect(tile?.value).not.toBe('')
  })

  it('hides a tile whose show template is false', () => {
    const tiles = readTiles(
      hassWith(GARAGE),
      [
        { entity: 'cover.garage', show: '{{ a }}' },
        { entity: 'cover.garage', show: '{{ b }}' },
      ],
      {},
      resolve({ '{{ a }}': 'True', '{{ b }}': 'False' }),
    )
    expect(tiles.map(t => t.visible)).toEqual([true, false])
  })

  it('asks for every templatable field, and carries the row entity as a variable', () => {
    const requests = tileTemplates(
      [{ entity: 'cover.garage', name: '{{ n }}', value: '{{ v }}', color: '{{ c }}' }],
      {},
    )
    expect(requests.map(r => r.template).sort()).toEqual(['{{ c }}', '{{ n }}', '{{ v }}'])
    expect(requests[0]?.variables).toEqual({
      config: { entity: 'cover.garage' },
      entity: 'cover.garage',
    })
  })

  it('gives an entity-less row no variables, matching the card-level colour', () => {
    expect(tileTemplates([{ name: '{{ n }}' }], {})).toEqual([{ template: '{{ n }}' }])
  })
})

describe('readTile', () => {
  it('draws an entity that does not exist as unavailable, with the shortcut icon', () => {
    expect(readTile(hassWith(), { entity: 'cover.gone' })).toMatchObject({
      name: 'cover.gone',
      icon: 'mdi:apps',
      unavailable: true,
      value: '—',
      color: undefined,
    })
  })
})

describe('tileConfigs', () => {
  it('keeps a row with no entity', () => {
    expect(tileConfigs([{ name: 'Climate' }])).toEqual([{ name: 'Climate' }])
  })

  it('reads a bare string as an entity', () => {
    expect(tileConfigs(['cover.garage'])).toEqual([{ entity: 'cover.garage' }])
  })

  it('drops what cannot be a tile at all', () => {
    expect(tileConfigs([null, 42, 'cover.garage'])).toEqual([{ entity: 'cover.garage' }])
  })
})

describe('tileWatchedIds', () => {
  it('contributes nothing for a tile with no entity', () => {
    expect(tileWatchedIds(['cover.garage', { name: 'Climate' }])).toEqual(['cover.garage'])
  })
})

describe('tileKeys', () => {
  it('keys by entity, suffixing repeats and positioning the entity-less', () => {
    expect(tileKeys([{ entity: 'cover.a' }, { name: 'X' }, { entity: 'cover.a' }])).toEqual([
      'cover.a',
      '#1',
      'cover.a#1',
    ])
  })
})

describe('the form round trip', () => {
  const bare: TileConfig = { entity: 'cover.garage' }

  it('round-trips a row nobody has overridden', () => {
    expect(tileFromForm(bare, tileToForm(bare))).toEqual(bare)
  })

  it('writes no tap_action for a bare more-info', () => {
    expect(tileFromForm(bare, { ...tileToForm(bare), name: 'Garage' })).toEqual({
      entity: 'cover.garage',
      name: 'Garage',
    })
  })

  it('turns a tile into an entity-less one rather than deleting it', () => {
    expect(tileFromForm(bare, { ...tileToForm(bare), entity: '' })).toEqual({})
  })

  /** A blank tile's form reports action 'none'; picking an entity must not freeze that in. */
  it('leaves a blank tile pressable when it is given an entity', () => {
    expect(tileFromForm({}, { ...tileToForm({}), entity: 'light.kitchen' })).toEqual({
      entity: 'light.kitchen',
    })
  })

  it('still writes an explicit none the user chose on a tile that has an entity', () => {
    expect(tileFromForm(bare, { ...tileToForm(bare), action: 'none' })).toEqual({
      entity: 'cover.garage',
      tap_action: { action: 'none' },
    })
  })

  it('carries the YAML-only action keys through an unrelated edit', () => {
    const prior: TileConfig = {
      entity: 'cover.garage',
      tap_action: {
        action: 'call-service',
        service: 'cover.open_cover',
        target: { entity_id: 'cover.garage' },
        data: { x: 1 },
      },
    }
    expect(tileFromForm(prior, { ...tileToForm(prior), name: 'Garage' })).toEqual({
      ...prior,
      name: 'Garage',
    })
  })
})

describe('tileRows', () => {
  it('flattens a row that says nothing more than its own id', () => {
    expect(tileRows([{ entity: 'cover.a' }, { entity: 'cover.b', name: 'B' }])).toEqual([
      'cover.a',
      { entity: 'cover.b', name: 'B' },
    ])
  })
})

describe('washFor', () => {
  it('defaults to washing on hover or press, the choice the first live dashboard made', () => {
    expect(DEFAULT_WASH).toBe('hover')
    expect(washFor(undefined)).toBe('hover')
  })

  it('reads the two values it knows', () => {
    expect(washFor('hover')).toBe('hover')
    expect(washFor('always')).toBe('always')
  })

  /** A typo or a stray YAML type draws the default rather than an unwashed or broken card. */
  it('falls back to the default for anything else', () => {
    expect(washFor('Always')).toBe('hover')
    expect(washFor('never')).toBe('hover')
    expect(washFor('')).toBe('hover')
    expect(washFor(true)).toBe('hover')
    expect(washFor(null)).toBe('hover')
  })
})

describe('flowFor', () => {
  /** Today's grid, so a card configured before the option existed draws exactly as it did. */
  it('defaults to wrapping', () => {
    expect(DEFAULT_FLOW).toBe('wrap')
    expect(flowFor(undefined)).toBe('wrap')
  })

  it('reads the two values it knows', () => {
    expect(flowFor('wrap')).toBe('wrap')
    expect(flowFor('row')).toBe('row')
  })

  it('falls back to the default for anything else', () => {
    expect(flowFor('Row')).toBe('wrap')
    expect(flowFor('rows')).toBe('wrap')
    expect(flowFor('')).toBe('wrap')
    expect(flowFor(false)).toBe('wrap')
    expect(flowFor(null)).toBe('wrap')
  })
})

describe('selected', () => {
  const resolve = (map: Record<string, string>) => (template: string) => map[template]

  it('reads a template with the truthy rule, and asks for it', () => {
    const rows = [
      { entity: 'cover.garage', selected: '{{ a }}' },
      { entity: 'cover.garage', selected: '{{ b }}' },
    ]
    const tiles = readTiles(
      hassWith(GARAGE),
      rows,
      {},
      resolve({ '{{ a }}': 'True', '{{ b }}': 'off' }),
    )
    expect(tiles.map(t => t.selected)).toEqual([true, false])
    expect(tileTemplates(rows, {}).map(r => r.template)).toEqual(['{{ a }}', '{{ b }}'])
  })

  it('is false while its template has not answered, and for a tile without one', () => {
    const tiles = readTiles(
      hassWith(GARAGE),
      [{ entity: 'cover.garage', selected: '{{ a }}' }, 'cover.garage'],
      {},
    )
    expect(tiles.map(t => t.selected)).toEqual([false, false])
  })

  it('never selects a tile that is not reporting', () => {
    const [tile] = readTiles(hassWith(), [{ entity: 'cover.garage', selected: 'true' }], {})
    expect(tile?.selected).toBe(false)
  })

  it('round-trips through the panel, with a hold left untouched', () => {
    const prior: TileConfig = {
      entity: 'cover.garage',
      selected: '{{ x }}',
      hold_action: { action: 'more-info' },
    }
    expect(tileFromForm(prior, tileToForm(prior))).toEqual(prior)
  })
})

describe('orientationFor and stateLinesFor', () => {
  it('takes the two orientations and defaults to vertical', () => {
    expect(orientationFor('horizontal')).toBe('horizontal')
    expect(orientationFor('sideways')).toBe('vertical')
  })

  it('clamps the state lines to one to three, and reads a number written as text', () => {
    expect(stateLinesFor(2)).toBe(2)
    expect(stateLinesFor('3')).toBe(3)
    expect(stateLinesFor(9)).toBe(3)
    expect(stateLinesFor(0)).toBe(1)
    expect(stateLinesFor(undefined)).toBe(1)
    expect(stateLinesFor('many')).toBe(1)
  })
})

describe('room tiles', () => {
  const LAMP = entity({ entity_id: 'light.lamp', state: 'on' })
  const DOOR = entity({
    entity_id: 'binary_sensor.door',
    state: 'on',
    attributes: { device_class: 'door' },
  })
  const house = {
    ...hassWith(LAMP, DOOR),
    entities: {
      'light.lamp': { entity_id: 'light.lamp', area_id: 'den' },
      'binary_sensor.door': { entity_id: 'binary_sensor.door', area_id: 'den' },
    },
    areas: { den: { area_id: 'den', name: 'Den', icon: 'mdi:television' } },
  } as unknown as HomeAssistant

  it('takes its name, icon and state line from the area, and adds the reading after', () => {
    expect(readTile(house, { area: 'den' })).toMatchObject({
      name: 'Den',
      icon: 'mdi:television',
      value: 'Door Open · Light On',
    })
    expect(readTile(house, { area: 'den', value: '👨🏻‍💻' }).value).toBe('Door Open · Light On · 👨🏻‍💻')
    expect(readTile(house, { area: 'den', summary: ['lights'] }).value).toBe('Light On')
  })

  it('watches everything in the room', () => {
    expect(tileWatchedIds([{ area: 'den' }], house).sort()).toEqual([
      'binary_sensor.door',
      'light.lamp',
    ])
  })

  it('shows the default parts ticked, and writes no summary key until they change', () => {
    const prior: TileConfig = { area: 'den' }
    const form = tileToForm(prior)
    expect(form.summary).toContain('lights')
    expect(tileFromForm(prior, form)).toEqual({ area: 'den' })
    // Kept in the order the panel reports, which is the order the user dragged them into.
    expect(tileFromForm(prior, { ...form, summary: ['lights', 'alerts'] })).toEqual({
      area: 'den',
      summary: ['lights', 'alerts'],
    })
  })
  describe('summary_style: icons', () => {
    const SENSOR = entity({ entity_id: 'sensor.den_t', state: '20.6' })
    const LAMP_2 = entity({ entity_id: 'light.lamp_2', state: 'on' })
    const room = {
      ...house,
      states: { ...house.states, [SENSOR.entity_id]: SENSOR, [LAMP_2.entity_id]: LAMP_2 },
      entities: {
        ...house.entities,
        'light.lamp_2': { entity_id: 'light.lamp_2', area_id: 'den' },
      },
    } as unknown as HomeAssistant
    const config: TileConfig = {
      area: 'den',
      summary_style: 'icons',
      temperature_entity: 'sensor.den_t',
      summary: ['open', 'temperature', 'lights'],
    }

    it('leaves the readings on the line and moves the statuses to glyphs', () => {
      const tile = readTile(room, { ...config, value: 'Joe' })
      expect(tile.value).toBe('21° · Joe')
      expect(tile.glyphs.map(glyph => [glyph.part, glyph.count])).toEqual([
        ['open', undefined],
        ['lights', 2],
      ])
    })

    it('says what every glyph means in the label', () => {
      expect(tileLabel(readTile(room, config))).toBe('Den, 21°, Door Open, 2 Lights On')
    })

    it('draws no glyphs in words, or on a tile that is not a room', () => {
      expect(readTile(room, { ...config, summary_style: 'words' }).glyphs).toEqual([])
      expect(readTile(room, { ...config, summary_style: 'words' }).value).toBe(
        'Door Open · 21° · 2 Lights On',
      )
      expect(readTile(room, { entity: 'light.lamp', summary_style: 'icons' }).glyphs).toEqual([])
    })

    it('reserves the row card-wide when any room draws one', () => {
      expect(tilesHaveGlyphs([config, 'light.lamp'])).toBe(true)
      expect(tilesHaveGlyphs([{ area: 'den' }, 'light.lamp'])).toBe(false)
      expect(tilesHaveGlyphs([{ entity: 'light.lamp', area: 'den', summary_style: 'icons' }])).toBe(
        false,
      )
    })

    it('shows words in the panel by default and writes the key only when it is icons', () => {
      expect(tileToForm({ area: 'den' }).summary_style).toBe('words')
      expect(tileToForm({ entity: 'light.lamp' }).summary_style).toBeUndefined()
      const form = tileToForm({ area: 'den' })
      expect(tileFromForm({ area: 'den' }, form)).toEqual({ area: 'den' })
      expect(tileFromForm({ area: 'den' }, { ...form, summary_style: 'icons' })).toEqual({
        area: 'den',
        summary_style: 'icons',
      })
      expect(tileFromForm(config, { ...tileToForm(config), area: '' })).not.toHaveProperty(
        'summary_style',
      )
    })
  })
})

describe('tileHasTemplates', () => {
  it('reads a template in any templated field', () => {
    expect(tileHasTemplates({ entity: 'light.a', selected: '{{ true }}' })).toBe(true)
    expect(tileHasTemplates({ entity: 'light.a', name: 'Plain' })).toBe(false)
  })

  it('counts a template inside any of the three actions', () => {
    expect(
      tileHasTemplates({
        entity: 'light.a',
        tap_action: { action: 'navigate', navigation_path: '/{{ states("input_text.view") }}' },
      }),
    ).toBe(true)
    expect(
      tileHasTemplates({
        hold_action: {
          action: 'call-service',
          service: 'light.turn_on',
          data: { brightness_pct: '{{ 40 }}' },
        },
      }),
    ).toBe(true)
    expect(
      tileHasTemplates({ double_tap_action: { action: 'navigate', navigation_path: '/x' } }),
    ).toBe(false)
  })
})
