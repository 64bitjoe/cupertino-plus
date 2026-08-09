# The complication card

A third card for the library: one card type that draws any entity in one of five faces
borrowed from watchOS complications. Where the calendar and the battery cards each know
what they are for, this one is told — it is the general-purpose widget the library does not
have yet, and its whole job is to make an arbitrary entity look like it belongs on a home
screen.

Design agreed 2026-08-08. Every decision below was taken deliberately; where the reasoning
is the interesting part, it is written down rather than summarised.

---

## 1. What it is

`type: custom:cupertino-widgets-complication`, configured with a list of entities and a
style. One entity fills the card; several are packed into it. Nothing else is required.

The name is Apple's. On a watch, a complication is a small element on the face showing one
piece of information from one app, drawn in that app's tint, tappable to open it. That is
exactly the thing a Home Assistant dashboard is short of, and the families Apple defines
(circular, rectangular, inline) map onto the shapes the sections grid hands out.

**What it is not.** It is not a replacement for HA's `tile` card, and not a gauge card with a
new coat of paint. The distinction is that everything here is derived from the entity —
name, icon, unit, colour, and whether there is a range to draw an arc against — so a card
with one field filled in is already right. The library's premise is sensible defaults
instead of a config to fill in, and this card is the hardest test of it.

## 2. Decisions taken, and why

| #   | Decision                                                        | Why                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **One card type, a `style` dropdown** — not one card per family | Five cards in the picker that differ only in appearance is five things to explain. One card whose look is a field is one.                                                                                                                                              |
| 2   | **`entities` is a list; one entity is the n=1 case**            | `base-card.ts` derives layout from the measured box, so a one-item list is not a special case, it is a short list. Mirrors the battery card exactly.                                                                                                                   |
| 3   | **Style applies to the whole card**                             | Mixing a ring and an inline row inside one card would need per-entity config and would look like a fruit bowl. Two cards is the honest answer.                                                                                                                         |
| 4   | **Colour is identity, never a reading**                         | Extends the rule already written into `ring.ts`: the value is the length of the arc, and a colour that moved with the value would be a second, coarser reading of the same number. Apple agrees — Notes is yellow and Weather is blue because that is _what they are_. |
| 5   | **Gauge range is derived, with an optional override**           | Some entities carry an honest range (battery, cover, `number`); most do not. Deriving where possible and drawing no gauge otherwise keeps the card truthful, and `min`/`max` exist for the person who knows their lounge is 16–24°.                                    |
| 6   | **Overflow is prevented by sizing, not handled**                | The card computes its own `min_rows` / `min_columns` from the count and style, so the Layout tab cannot drag it smaller than fits. No `+N more`, no scroller, no overflow state to design or test.                                                                     |
| 7   | **No scrolling, ever**                                          | Apple widgets are snapshots — content below a fold is not glanceable. A scroll region nested in a scrolling dashboard also steals the page scroll on touch and makes a short drag indistinguishable from a tap.                                                        |
| 8   | **No size field**                                               | The Layout tab already owns the footprint. `size.ts` documents at length why a second control for one outcome was removed; this card must not reintroduce it.                                                                                                          |

## 3. Configuration

```yaml
type: custom:cupertino-widgets-complication
entities:
  - sensor.lounge_temperature
  - sensor.lounge_humidity
  - sensor.water_tank_level
style: circular # circular | rectangular | rectangular-header | rectangular-bleed | inline
min: 16 # optional — forces a gauge range
max: 24 # optional
color: orange # optional — overrules the derived tint
scale: 100 # inherited from CupertinoCardConfig
```

```ts
export interface ComplicationCardConfig extends CupertinoCardConfig {
  entities?: (string | ComplicationEntityConfig)[]
  style?: ComplicationStyle // default: 'circular'
  min?: number
  max?: number
  color?: TintName
}

export interface ComplicationEntityConfig {
  entity: string
  name?: string
  icon?: string
  min?: number
  max?: number
  color?: TintName
}
```

The object form exists for the same reason it does on the battery card: per-entity `name`,
`icon`, `min`, `max` and `color` override the card-level values, which in turn override the
derived ones. A bare entity id is what the visual editor writes and what nearly every config
will hold.

**Precedence, in one line:** per-entity config → card config → derived from the entity.

### The editor

`getConfigElement()` returns a `ComplicationCardEditor` built on the shared
`CupertinoCardEditor` in `src/core/card-editor.ts`, so it is an `ha-form` schema and inherits
the whole contract documented there. Fields:

| Field             | Selector                         | Default    | Helper                                                                                                                            |
| ----------------- | -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Entities          | `entity` (multiple)              | —          | "One or several. The card lays out however many you give it."                                                                     |
| Style             | `select`                         | `circular` | —                                                                                                                                 |
| Minimum / Maximum | `number`                         | blank      | "Leave blank and the range comes from the entity. Fill these in to gauge something with no natural range, like room temperature." |
| Colour            | `select`                         | blank      | "From what the entity measures. Set one only to overrule it."                                                                     |
| Scale             | `SCALE_ROW` from `core/scale.ts` | 100        | reused verbatim                                                                                                                   |

Three of the five say _Automatic_ and can be left alone forever. No field asks about size.

Per-entity overrides are **not** in the visual editor for v1 — the entity picker writes bare
ids, and anyone wanting per-entity `name`/`min` uses the YAML tab. A row editor like
`device-list-editor.ts` is a follow-up, not part of this.

## 4. The five styles

Each style is a separate render function over the same normalised model. They differ in what
they draw, not in what they know.

### `circular`

A ring gauge: the arc for the reading, the value in the middle, the name under it while
there is room. Reuses `cards/battery/ring.ts` arithmetic — that module is already pure,
already in its own coordinate space, and already tested; it moves to `core/ring.ts` and the
battery card imports it from there.

**When the entity has no range**, no ring is drawn and the face becomes icon over value over
name. This is the same style, not a sixth one: what changes is what the data supports, which
is a decision the card makes rather than one the user configures.

### `rectangular`

Name in the tint as a caption, the reading large, one supporting line, and a thin bar when
there is a range. Colour appears only on the caption and the bar, so this is the style that
disappears politely into somebody's custom theme.

### `rectangular-header`

The Notes treatment. A tinted strip carries the icon and the name; the body gets the state
at size, a supporting line, and a quieter third line. Best of the five at entities whose
answer is a word rather than a number, where a gauge has nothing to measure — appliances,
locks, media players.

### `rectangular-bleed`

The Weather treatment. The tint becomes the card: a gradient fill, white content, the value
set large. Loudest, most Apple-looking, and the one that overrides the user's theme surface —
so the docs say to use it once per view, as the headline, not six times.

### `inline`

One line: icon, name, value. With decision 2 this stacks into a list as entities are added,
separated by hairlines. The shortest card in the library.

### The supporting line

`rectangular`, `rectangular-header` and `rectangular-bleed` each have one. It is derived, in
this order, and omitted when nothing qualifies:

1. a domain-specific line where one is obviously right (`climate` → the target temperature;
   `media_player` → the title; `cover` → position);
2. otherwise nothing.

Deliberately _not_ a dump of attributes. A line that says `state_class: measurement` is
worse than no line, and this is the one place the card could easily become noisy.

## 5. Turning an entity into a complication

One module, `model.ts`, is the whole of the card's contact with `hass`, exactly as on the
battery card. Everything downstream sees a `Complication` and nothing else.

```ts
export interface Complication {
  id: string // what a tap opens
  name: string
  icon: string // an MDI path, or a marker to defer to <ha-state-icon>
  value: string // already formatted, unit included
  numeric: number | null // for the arc; null when the state is not a number
  range: { min: number; max: number } | null // null means: draw no gauge
  supporting: string | null
  tint: TintName
  unavailable: boolean
}
```

### Value

Formatted through Home Assistant's own locale-aware state formatting, so `21.4°C` respects
the user's decimals and unit system rather than this card reimplementing it. An entity that
is `unavailable` or `unknown` renders an em dash and a dimmed face, and is **never dropped** —
the battery card's rule, for the battery card's reason: a device that stopped reporting is
exactly what somebody puts a widget on a dashboard to find out.

### Range

Derived, and only where the range is real:

| Source                                                                        | Range                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| `device_class: battery`, `humidity`, `moisture`, `power_factor` with unit `%` | 0–100                                     |
| Any entity whose unit is `%`                                                  | 0–100                                     |
| `cover` (`current_position`)                                                  | 0–100                                     |
| `light` (`brightness`)                                                        | 0–255, presented as %                     |
| `number` / `input_number`                                                     | the entity's own `min` / `max` attributes |
| `climate` current temperature                                                 | **none** — see below                      |
| anything else                                                                 | **none** — no arc, no bar                 |

The `climate` row is the one I am least sure of and it is called out for review in §10.
Everything else is a range the integration itself asserts.

### Colour

From `device_class` first, then domain, to the palette `theme/tokens.ts` already carries:
`--cw-red`, `--cw-orange`, `--cw-yellow`, `--cw-green`, `--cw-blue`, `--cw-indigo`,
`--cw-purple`, `--cw-pink` and `--cw-accent`, each already given an Apple value per
appearance. Only `--cw-teal` is missing and gets added. No new token layer: a second
palette that had to agree with the first is a way to get it wrong.

`TintName` is exactly that palette and nothing wider: `red`, `orange`, `yellow`, `green`,
`teal`, `blue`, `indigo`, `pink`, `accent`. A closed set rather than a free colour value,
so the `color:` field can be a dropdown in the editor and so no config can put a colour on
a card that the theme has no answer for in dark mode.

| Measures                                     | Tint               |
| -------------------------------------------- | ------------------ |
| temperature                                  | orange             |
| humidity, moisture, water                    | blue               |
| battery, energy consumption                  | green              |
| power, current, voltage                      | yellow             |
| illuminance                                  | yellow             |
| pressure                                     | teal               |
| carbon dioxide, air quality                  | indigo             |
| `lock`, `binary_sensor` (door/window/safety) | red                |
| `media_player`                               | pink               |
| anything unrecognised                        | the theme's accent |

The colour is fixed per entity and does not move with the reading. See decision 4.

### Icon

The model always answers with an `mdi:` name, and `<ha-icon>` draws it — the element the
battery card already uses, which needs no import dance and resolves whatever name a user put
in `attributes.icon`. The chain is: the config's `icon`, then the entity's own
`attributes.icon`, then a small table keyed on `device_class` and then domain, then
`mdi:eye` as the mark that means "something, unspecified".

`<ha-state-icon>` was the first answer and is the more obviously correct one — it resolves an
entity's icon exactly as the rest of the frontend does. Two things ruled it out. The dev
harness has no stub for it (`dev/ha-stubs.ts` stubs `ha-icon` and `ha-svg-icon` only), so the
showcase would draw nothing and the one place this card gets looked at properly would be
blind. And its state-dependent resolution is the wrong behaviour here for the reason the
battery card's own icon note gives: `mdi:battery-70` restates the number the ring has already
drawn, at a coarser resolution, which is the same mistake as a colour that moves with the
reading.

The cost is a lookup table that will be missing somebody's device class on day one. That is
a table anybody can extend in one line, and `attributes.icon` is ahead of it in the chain for
everybody who has set one.

## 6. Layout and sizing

`layout.ts`, pure, unit-tested, priced in design units — the battery card's `layout.ts` is
the model to follow, including dividing the measured box by the scale factor once at the top
and pricing everything after that against the CSS as written.

**How each style packs.** Not the same, because the faces are not the same shape:

| Style                                                    | Several entities become                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `circular`                                               | a grid — how many across from the measured width, how many down from the count           |
| `rectangular`, `rectangular-header`, `rectangular-bleed` | a vertical stack, one per row, full width; these are already card-shaped and do not tile |
| `inline`                                                 | a vertical stack of rows separated by hairlines                                          |

**Packing.** The count decides the grid, the grid decides the cell, the face fits the cell.
Columns come from `cwLayout` and the measured width; rows from the count, bounded by what the
height can hold at a face still worth looking at. Names and supporting lines are dropped when
their cell is too narrow, in that order — never shrunk into a second type size. The battery
card's `labeled` / `compact` split is the same decision and its reasoning applies verbatim.

**The floors.** `getGridOptions()` returns `min_rows` and `min_columns` computed from the
entity count and the style, so the Layout tab clamps its own sliders to a footprint that
actually fits. This is what makes decision 6 work: overflow is not handled because it cannot
be reached. Defaults stay as `core/size.ts` provides them; only the floors are card-specific.

Per-style floors (design units, at scale 100), to be confirmed against the harness during
implementation:

| Style          | Minimum per entity                                           |
| -------------- | ------------------------------------------------------------ |
| `circular`     | a cell holding a ring at `RING_MIN` plus its gap             |
| `rectangular*` | one card's worth — these do not tile; several entities stack |
| `inline`       | one row height plus its hairline                             |

## 7. Tap

Tapping a complication opens the more-info dialog for that entity, via the existing
`core/navigate.ts` helper. This matches both the watch (a complication opens its app) and
every other card in Home Assistant. In a multi-entity card the tap target is the individual
complication, not the card.

No `tap_action` config in v1. It is the obvious follow-up and costs nothing to add later;
shipping without it keeps the editor at five fields.

## 8. Theming and accessibility

- Every colour goes through a `--cw-*` token. Cards never read HA theme variables directly.
- Dark mode via `:host([dark])` as elsewhere — reflected from `hass.themes.darkMode`, never
  `prefers-color-scheme`.
- `rectangular-bleed` needs its own contrast treatment: white content on the tint in both
  themes, with the gradient darkened in dark mode so it does not glow.
- Each complication gets an accessible name of "_name_, _value_" and a role that reflects
  that it is activatable. Arcs are decorative and hidden from the accessibility tree — the
  value is present as text.

## 9. Testing

Unit tests, in the style already established (`layout.test.ts`, `model.test.ts`):

- **`model.test.ts`** — range derivation per the table in §5, including the entities that
  must yield no range; tint derivation; unavailable and non-numeric states; the
  per-entity → card → derived precedence chain.
- **`layout.test.ts`** — packing at each style across counts and box sizes; the point at
  which names are dropped; the computed floors matching what the layout actually needs.
- **`ring.test.ts`** — moves with `ring.ts` to `core/`, unchanged; the battery card's own
  tests must still pass against it.
- **Showcase** — an entry in `dev/site/catalog.ts` with controls for style, entity set and
  scale, plus fixtures chosen to hit each branch: an entity with a range, one without, an
  unavailable one, a long name, a non-numeric state.

## 10. Assumptions flagged for review

1. ~~**`climate` gauge range.**~~ **Resolved: `climate` gets no derived range.** Drawing a
   current temperature against a thermostat's own `min_temp`/`max_temp` gives an arc that sits
   mid-scale and barely moves, which is a gauge that says nothing. `min`/`max` are how somebody
   who wants one gets it. Pinned by a test in the implementation plan.
2. **`getGridOptions()` recomputation.** The floors depend on config, so HA must re-query
   after a config change for decision 6 to hold in the editor. If it does not, the floors are
   still correct on load and the fallback is to shrink to fit rather than to add an overflow
   state.
3. **Tap without `tap_action`.** Assumed acceptable for v1.
4. **Per-entity overrides are YAML-only in v1.** Assumed acceptable.

## 11. Out of scope

Corner complications (the family exists to fill the corner of a round face; on a rectangle it
is a circular gauge with worse balance). A watch-face card. Per-entity styles. `tap_action`.
A row editor for per-entity overrides. History, sparklines or anything drawn from more than
the current state.
