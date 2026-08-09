# Complication widget: the rules

One card, five faces, and the same premise stated a different way each time: point it at an
entity and it works out the name, the icon, the unit, the colour and whether there is a range
to gauge, so a config with nothing but `entities:` in it is already a working card. This is the
specification the card implements; the code follows it module by module, and
`src/cards/complication/*.test.ts` pins the worked cases below.

Read [`battery-widget-rules.md`](battery-widget-rules.md) first for the library's sizing story
and for `core/ring.ts`'s argument about colour, which this card extends rather than repeats.
The short version, because §2 below leans on it: a battery ring is always green because its
arc already says how full the device is, and a colour that stepped with the level would be a
second, coarser version of the same number. This card generalises that rule to a shape that has
no arc for most of what it draws.

---

## 1. What a complication is

```ts
{
  id: string,                  // the entity id: identity, and what a tap opens
  name: string,
  icon: string,                 // always an `mdi:` name, never empty
  value: string,                // formatted, unit included; an em dash for nothing to read
  numeric: number | null,
  range: Range | null,          // null means "draw no gauge" — see §3
  fraction: number | null,      // numeric placed in range, 0–1
  supporting: string | null,    // one line of context; see §7
  tint: TintName,                // fixed per entity; see §2
  unavailable: boolean
}
```

`model.ts` is the whole of the card's contact with Home Assistant, the same idea as the battery
card's own `model.ts`: every render function downstream reads a `Complication` and nothing
else, whether the entity behind it is a cheerful battery at 72% or a sensor that has not
reported since last Tuesday.

**An unreadable entity is never dropped**, for the battery card's own reason. A sensor that has
gone `unavailable` becomes a dashed, dimmed complication rather than a missing one — the fact
that something stopped reporting is exactly what somebody puts a widget on a dashboard to find
out. An entity absent from `hass.states` entirely (a typo'd id, an integration not yet loaded)
gets the same treatment, keyed by the id it was configured with.

**Per-entity config beats card config beats derivation**, one key at a time. A row's own
`min`/`max`/`color` wins over the same key set once at the top of the card, which wins over
`range.ts`/`tint.ts`'s own guess — and each half of a range is resolved independently, so a row
narrowing only its floor still gets the card's ceiling rather than losing the gauge outright
(`model.test.ts`, "fills in the other half of the range from the card default, not from
nothing").

## 2. The colour is identity, never a reading

`core/ring.ts` argues that a battery ring's colour cannot track the level, because the arc has
already said what the level is and a colour stepping under it would be a second, coarser
opinion about the same number. A complication mostly has no arc to defer to — an `inline`
humidity reading is a number on a line, not a gauge — so `tint.ts` states the rule one level up:
the colour is not "how is this reading doing" at all, it is "what kind of thing is this". A
temperature complication is orange at 40°F and orange at 90°F, for the same reason a
thermometer icon does not change shape between them.

`tintFor` reads `device_class` first, because it is the more specific claim — a
`sensor.hallway` could be measuring anything, but `device_class: temperature` is a thermometer
whatever the entity is called — and falls back to the domain for the entities with no device
class to consult (`tint.test.ts`, "reads device_class before anything else" and "falls back to
the domain when there is no device class"). Both tables are keyed by what is being measured
rather than by the class name, so `moisture` and `water` land on the same blue as `humidity`
without the table saying so twice.

**`accent` is the answer for everything neither table recognises**, and it is a known,
disclosed limitation rather than a gap nobody noticed. It resolves to the theme's own primary
colour so an unrecognised entity still tints coherently with the rest of the dashboard, but
that also means it is the one tint this card cannot contrast-check at build time (§4) — a user
running a light custom accent reproduces the white-on-light failure §4 exists to prevent, on
`rectangular-header` and `rectangular-bleed`. There is no fix for that short of refusing to
honour a theme's accent colour at all, which would be a worse trade.

The tint is resolved once, into a `var(--cw-*)` reference rather than a literal hex, so it keeps
tracking `tokens.ts` — and the user's theme — for the whole time the complication sits on the
dashboard rather than only at the moment it happened to render.

## 3. When the ring disappears

An arc is a fraction, and a fraction needs both ends. Most entities have neither — a room at
21.4°C has no ceiling — so `range.ts` answers `null`, "there is no honest range here", far more
often than it answers with one. `circular` draws icon-and-value instead of a ring in that case,
and that is worth stating plainly: **it is the same style, not a sixth one.** A ring is one way
this style can render a complication; icon-and-value is the other, and which one appears is the
style showing what the entity's own data supports rather than the card inventing a scale nobody
asserted. The rectangular family makes the identical call for its progress bar — `item.fraction`
gates it the same way on all three chromes, whichever chrome is on screen.

### The range derivation table

| Source                                                              | Range                          |
| ------------------------------------------------------------------- | ------------------------------ |
| Card or row `min`/`max`, both set                                   | as given                       |
| `number` / `input_number`                                           | its own `min`/`max` attributes |
| `light`                                                             | 0–255 (`brightness`)           |
| `cover`                                                             | 0–100 (`current_position`)     |
| `device_class` in `battery`, `humidity`, `moisture`, `power_factor` | 0–100                          |
| `unit_of_measurement: '%'`                                          | 0–100                          |
| anything else                                                       | no gauge                       |

An override needs both halves to count: a `min` with no `max` (or the reverse) is refused
rather than guessed, the same rule a battery device's charging detection uses when a
`charging_entity` does not exist — an absent half is a config that has not said what it means,
not a smaller range. A range whose `max` does not exceed its `min` is refused too, because
`fractionOf`'s division has no honest answer for a span of zero (`range.test.ts`, "refuses a
range that is empty or backwards, rather than dividing by zero").

**`climate` is deliberately not in this table**, even though a thermostat carries
`min_temp`/`max_temp` right on its attributes. Drawing the current temperature against a
thermostat's own limits gives an arc that sits mid-scale and barely moves for as long as the
entity is on screen — nobody's living room spends its life near either end of what a thermostat
will accept as a setpoint — so the gauge would be technically present and practically mute,
which is worse than no gauge, not a smaller one. `min`/`max` on the card or the row is how
somebody who disagrees, and has a range in mind that means something for their thermostat, gets
one (`range.test.ts`, "gives a climate entity no range of its own").

## 4. The contrast a painted tint needs

`rectangular-header`'s strip and `rectangular-bleed`'s whole card both paint their text and
icon straight onto `item.tint`, which the ring and `inline` faces never do — there the tint is
a thin arc or a small glyph, not the surface under a paragraph. That difference was checked
against WCAG's contrast formula rather than by eye, against both the light and dark value of
every tint in `tokens.ts`, and white failed on four of the ten:

| Tint                               | White-on-tint contrast   | Passes 3:1? |
| ---------------------------------- | ------------------------ | ----------- |
| `yellow`                           | 1.4–1.5:1                | no          |
| `orange`, `green`, `teal`          | 2.0–2.6:1                | no          |
| `red`                              | 3.41–3.55:1              | by a hair   |
| `blue`, `indigo`, `purple`, `pink` | comfortably above 3:1    | yes         |
| `accent`                           | unknowable at build time | see §2      |

3:1 is WCAG's floor for large, bold text, which is what these two chromes set — but `yellow`,
`orange`, `green` and `teal` all miss even that, `yellow` by more than half. Those four are
given a fixed near-black, `#1d1d1f`, through `--cw-comp-on-tint`; the rest keep white.

The near-black is a literal value, deliberately **not** `var(--cw-label)`, which is white in
dark mode — the exact bug this exists to route around. What makes the fixed value correct
rather than merely convenient is that these four tint hexes barely move between themes
(`--cw-yellow` is `#ffcc00` light, `#ffd60a` dark): a hue that stays light in both themes needs
ink that stays dark in both themes, not ink that tracks the theme the way the label colour
does. `rectangular-bleed`'s dimmed, unavailable reading follows the same logic one level down —
60% opacity of whichever on-tint colour the tint chose, the same alpha `--cw-label-secondary`
already carries against `--cw-label` elsewhere in the library, just applied to the only ink
that is ever legible on this face's background.

## 5. Sizing: why there is no overflow state

The battery ring caps at four devices and lets the rest go unshown, because a fifth ring would
break the watch-face shape it is copying. A complication has no such shape to protect — a sixth
ring is still a ring, a fifth block is still a block — so instead of capping the count and
hiding the remainder, this card grows the footprint the count needs and tells Home Assistant
about it through `min_columns`/`min_rows`. `getGridOptions()` recomputes those floors from the
config on every call, so they can never go stale behind an entity list that just grew.

That is the whole of the overflow design, and the cost is worth stating in the same breath as
the benefit: **the Layout tab clamps its own sliders to whatever `floorsFor` returns**, so a
card holding six rings cannot be _dragged_ down to a box that holds four. There is no
`+2 more` indicator, no scroller, and no truncated state anywhere in this card — for every
footprint the Layout tab will offer, that is not an omission, it is what makes overflow
unreachable. The trade is a card that sometimes insists on being bigger than the user first
reached for — which is the honest cost, how much room the content actually needs rather than a
taste the card is imposing (`layout.test.ts`, "asks for more height as the entities pile up").

**The unreachable claim has one known gap, and it is a stale-config window rather than a hole
in the arithmetic.** `config.grid_options` is spread after whatever `getGridOptions()` returns
(`docs/ha-api-notes.md`), so Home Assistant only re-clamps a saved size against a _new_ floor
when the user next touches the Layout tab. Drag a two-entity `rectangular` card down to its
floor, then add a third entity in YAML: the floor `floorsFor` now computes is taller, but the
`rows` already saved on the card survives the edit until someone reopens the Layout tab and
moves the slider, and the card clips in the meantime. Closing that gap would mean the layout
itself yielding when its box is smaller than its content needs — the opposite of the guarantee
this section spends its whole argument making, and a design change, not a bug fix. It is left
open rather than papered over; see §9 below for it named as a possible future direction rather
than a silent gap.

## 6. Why the card does not scroll, ever

No face in this card puts a scroll region on any amount of content, and that is a design
decision rather than something §5's floors merely make unnecessary:

- **Apple's widgets are snapshots.** A watch complication has no gesture of its own; what does
  not fit in the frame is not part of the design, not content waiting behind a scrollbar.
- **Content below a fold is not glanceable.** The entire premise of a widget is that the
  answer is on screen the moment you look, which a partially visible row is not.
- **A scroll region nested in a scrolling dashboard steals the page scroll on touch.** The
  first drag over the card would scroll the card instead of the page underneath it, which is
  the opposite of what anybody dragging past a widget wants.
- **It makes a short drag indistinguishable from a tap.** Every cell in this card is already a
  tap target that opens that entity's more-info dialog; a scrollable cell turns the boundary
  between "flick past this" and "open this entity" into a timing question the card cannot
  answer honestly.

§5's floors are what make that design survivable rather than merely stated: the card can
refuse to scroll only because it has already refused to be dragged smaller than what it is
drawing needs.

## 7. `rectangular-bleed` is a once-per-view style

`rectangular-bleed` is the one face in the library that replaces the user's own theme surface
with the tint, edge to edge, rather than drawing a coloured accent on top of it — the Weather
app's treatment, not the Notes app's. That is a deliberate, occasional decision this face makes
for itself, and it does not scale the way the other four faces do: a dashboard of six
full-bleed complications stops reading as a dashboard and starts reading as six unrelated
posters, because the one thing that made any single one of them arresting — that it broke from
the surface around it — is no longer true once everything on the view has broken from it the
same way. Use it for the one reading that deserves the whole card's attention, and reach for
`rectangular-header` for the rest of a panel that wants the same colour-by-identity story
without spending the entire view on it.

## 8. The supporting line

One line of context under the reading, and only where deriving one is obviously right —
`supportingFor` is deliberately not a general-purpose attribute reader, because this is the one
place the card could easily turn noisy. A line reading `state_class: measurement` looks like it
means something and does not, which is worse than no line at all. So the function names exactly
the domains where a single attribute reads as a sentence on its own:

- **`climate`** gets its setpoint, `temperature`, worded by `hvac_mode`: `Heating to 22°`,
  `Cooling to 18°`, `Set to 21°` for the two modes with two setpoints under one number
  (`heat_cool`, `auto`). **`off`, `dry` and `fan_only` get no line at all**, along with every
  other mode this table has no entry for — the setpoint sits on the entity in every mode,
  `off` included, so a single test against `'cool'` would have mislabelled every other mode
  "Heating", `off` among them, and a thermostat sitting off at 22° reading "Heating to 22°" is
  not opaque, it is false (`model.test.ts`, "does not claim a climate entity is heating when it
  is off, and picks the right verb").
- **`media_player`** gets `media_title`, when there is one.
- **`cover`** gets `current_position`, as `NN% open`.
- **Everything else gets nothing.** Growing this table is a judgement call each render pass,
  not a mechanical addition — the honest failure mode for a domain not listed here is silence,
  not a guess dressed as a fact.

## 9. Still open

Decided rather than known, each one edit away from being decided differently.

- **`accent`'s contrast is unknowable at build time.** §2 and §4 both say why: a theme's own
  primary colour cannot be contrast-checked against a build-time table, so a light custom
  accent reproduces the white-text failure on `rectangular-header` and `rectangular-bleed`.
  Fixing it would mean reading the resolved colour at render time and computing contrast in
  the browser, which is a heavier feature than the other nine tints needed.
- **A `large` circular layout, mirroring the battery card's own open item.** This card has no
  count cap to lift the way the battery ring does — §5 already grows the footprint rather than
  hiding entities — so the pressure for a bigger preset is lower, but a config with a dozen
  circular entities still tiles into a tall, narrow card rather than a wide grid, for lack of a
  second column-count band to choose between.
- **A per-row style override.** Every entity in one card currently shares one `style`; mixing,
  say, one `rectangular-bleed` headline complication with a row of plain `circular` ones
  underneath would need a shape for that in the config, which today it does not have.
- **A saved size can go stale under a rising floor.** §5's "overflow is unreachable" claim
  holds only up to the Layout tab's own clamp, which fires when the tab is opened, not when
  the config changes underneath a size the user already saved — see §5's own note. The
  option not taken here is a layout that _yields_: if `packFor` were allowed to shrink a
  block below `RECT_BLOCK`, or drop a caption, or otherwise fit itself into a box smaller
  than `floorsFor` says it needs, a stale saved size would degrade gracefully instead of
  clipping. That is a real fix, and deliberately not this branch's: it would mean the count
  no longer unconditionally deciding the grid (the module comment on `packFor`'s own
  priority order), which three already-reviewed tasks were built against holding. Worth
  reopening only as its own considered change, not as a patch bolted onto the end of this
  one.
