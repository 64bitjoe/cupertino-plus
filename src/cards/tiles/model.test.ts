import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FLOW,
  DEFAULT_WASH,
  flowFor,
  readTile,
  readTiles,
  tileConfigs,
  tileFromForm,
  tileKeys,
  tileRows,
  tileTemplates,
  tileToForm,
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

  /** §5: the state line is a dash rather than absent, so the grid stays regular. */
  it('draws a dash for its state line rather than collapsing', () => {
    expect(readTiles(hassWith(), [{ name: 'Scenes' }], {})[0]?.value).toBe('—')
  })

  /** A literal empty `value:` is not a template result, but it must read as "no override" too. */
  it('treats a literal empty value as no override', () => {
    const [entityTile] = readTiles(hassWith(GARAGE), [{ entity: 'cover.garage', value: '' }], {})
    const [bareTile] = readTiles(hassWith(GARAGE), ['cover.garage'], {})
    expect(entityTile?.value).toBe(bareTile?.value)
    expect(entityTile?.value).not.toBe('')
    expect(readTiles(hassWith(), [{ name: 'Scenes', value: '' }], {})[0]?.value).toBe('—')
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
    expect(requests[0]?.variables).toEqual({ config: { entity: 'cover.garage' } })
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
