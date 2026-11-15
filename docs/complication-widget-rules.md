# Complication widget: the rules

One card, nine faces, two layouts, and the same premise stated a different way each time: point it at an
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
  unavailable: boolean,
  countdown: CountdownView | null, // §13: only with `countdown: true` and a moment to count to
  action: ActionConfig,          // §11: the tap, more-info unless the row says otherwise
  holdAction?: ActionConfig,     // present only when configured to do something
  doubleTapAction?: ActionConfig
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
every tint in `tokens.ts`, and white failed on four of the eleven:

| Tint                               | White-on-tint contrast   | Passes 3:1? |
| ---------------------------------- | ------------------------ | ----------- |
| `yellow`                           | 1.4–1.5:1                | no          |
| `orange`, `green`, `teal`          | 2.0–2.6:1                | no          |
| `red`                              | 3.41–3.55:1              | by a hair   |
| `blue`, `indigo`, `purple`, `pink` | comfortably above 3:1    | yes         |
| `grey`                             | 3.3:1                    | yes         |
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

**Why there is no "Custom…" colour.** The chips and tiles cards take any CSS colour; this card
keeps to the palette (and **Automatic**), in the row panel and in YAML alike. The table above is
the reason: every tint's on-tint ink was chosen from a contrast measurement in both themes, and
an arbitrary colour has none. Choosing the ink at run time would need CSS's `contrast-color()` or
relative-colour syntax, which not every browser Home Assistant supports (older companion-app
web views among them), and getting it wrong is white text on yellow — the failure this section
exists to prevent. `accent` (§2) is the one unmeasured tint, and it is the theme's own.

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

## 10. `container: glass | card`

`glass`, the default (**Background: Glass** in the editor), as on every card in the library
(calendar §11 has why), is the library's glass from `tokens.ts`, the tile's translucent gradient,
hairline and blur, drawn as a panel: the card keeps its shape, radius and inset, so `floorsFor`
and `packFor` price exactly what they priced before. The rings, bars and tint-painted blocks
are all drawn in the closed tint palette over a translucent track (`--cw-track`), and rendered
over a navy and a pale wallpaper every face kept its readings and captions legible. `card` is
the theme's own card, which is what this card drew before the default changed.

`rectangular-bleed` is the face glass changes least: its tint fills the card edge to edge
either way, so the choice shows only as the theme's border giving way to the glass hairline at
the rounded corners. That is deliberate rather than an omission: a bleed face is a block of
colour by design (§7), and making it translucent would be a different face.

## 11. Templates and actions

Every row of `entities:` can carry the same Jinja templates and gestures the chips and tiles
cards do, and they are edited the same way: open the row's panel in the visual editor.

| Key                 | What it does                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `name`              | The caption and the VoiceOver label. A literal or a template.                                                      |
| `icon`              | An `mdi:` name or a template answering one.                                                                        |
| `value`             | Printed in place of the reading. A template answering a bare number also moves the gauge, against the row's range. |
| `supporting`        | The one line under the reading on the rectangular faces, over §8's derived line.                                   |
| `tap_action`        | Home Assistant's own action shape. Absent is more-info, as every cell did before.                                  |
| `hold_action`       | Held for half a second (`core/gestures.ts`). Absent means no hold timer at all.                                    |
| `double_tap_action` | Delays a single tap by a quarter second, so only rows that set one pay it.                                         |

The templates are rendered with `TemplatePool` and the Mushroom-shaped variables (`config.entity`,
`entity`, `user`), so a template moved from a Mushroom card or a chip reads the same. A template
that has not answered yet, or answered blank, shows what the card would have derived rather than
a gap (`model.test.ts`, "falls back to what it would derive while a template has not answered").
An unavailable entity is still dashed whatever its reading template says: §1's rule that the card
never hides a sensor that stopped reporting outranks a template that might paper over it.

A cell with no action at all on any gesture is not a button — no role, no tab stop — for the
tiles card's reason. Enter and Space are a tap; a keyboard has no hold.

In the editor the panel shows, in order: Entity, Name, Icon, Colour (the palette or Automatic —
§4 says why there is no Custom…), Minimum and Maximum; then the row's own overrides — **Size**
and **Face** while the layout is bento (§16), **Recent history** on a face that can draw a line
and **History to show** once this row will draw one, and **Count down** (§15); then the three
gestures — **When pressed**, **When held**, **When double-tapped** — each with the rows its
action needs (Path, Web address, Service with its Target and Data, Entity, Assistant and Start
listening, and Ask before doing it with its Question). Those action rows are labelled by
`core/action-form.ts`, the same words in every card's panel. **Use templates** swaps the icon
picker for a text box and adds Reading and Supporting line. The switch is a view of the row,
never a config key, and a row whose YAML already holds a template opens with it on.

## 12. The history sparkline

`sparkline: true` draws the reading's recent history beside it on `rectangular`,
`rectangular-header`, `rectangular-bleed` and `inline`, the way the Stocks and Weather widgets
do; `sparkline_hours` (1–48, default 24) sets the window. `rectangular-graph` (§14) always draws
it. The circular faces never do: a line squeezed under a 40px ring is a smudge, not a trend.

- **Only for a number.** A word, an unavailable sensor and a countdown draw no line and cost no
  fetch.
- **Fetched once, shared, refreshed by the sample.** Cached per entity and window across every
  card on the page, and asked again only once older than one sample's width (between a minute
  and fifteen minutes; `refreshMsFor`). The live reading is spliced onto the end at draw time,
  so the dot is never as old as the fetch. A failed fetch is remembered as empty for the same
  span, so a core without `history` is not asked on every render.
- **Statistics first, for a busy sensor.** A power meter reporting every second is 86,000 raw
  rows a day. An entity with a `state_class` is asked of `recorder/statistics_during_period`
  instead — five-minute means up to a day's window, hourly beyond (the `state` for a total,
  which has no mean), units as the entity reports them — a few hundred rows whatever its rate.
  Statistics lag the clock by up to a period; the live reading bridges the gap. Only when the
  statistics answer nothing does it fall back to the raw history.
- **Raw history is fetched incrementally.** `history/history_during_period` with
  `minimal_response` and `no_attributes` for the first fetch; each refresh after asks only for
  what changed since the last (`include_start_time_state: false`) and appends it, trimming what
  slid out of the window.
- **Pooled on arrival, drawn once a minute.** Whatever arrives is pooled into quarter-sample
  buckets (`reducePoints`) — each bucket's mean, count and newest reading, so the line is drawn
  as the raw readings would draw it — and the geometry is memoised per entry by the points, the
  live reading and the minute, so a repaint changes nothing it need not. An entry nobody has read
  for two refresh periods is dropped, and the cache holds at most 200.
- **Resampled, not plotted raw.** 48 samples across the window, each the mean of the readings
  inside it or the last reading before it (a state holds until it changes), smoothed through
  midpoints so the curve never overshoots a real reading. A flat line sits mid-height.
- **Read aloud as a range.** VoiceOver hears "21.4°C, between 19.2°C and 22.1°C over the last
  24 hours", since a line cannot be read.
- **Reduced motion.** The line fades in over `--cw-duration`; with reduced motion it appears.

## 13. Countdowns

`countdown: true` turns every entity in the card that holds a moment into the Timer
complication: the reading is the time left and the gauge drains with it. Anything else in the
card is untouched, which is why it is one switch rather than a per-row choice.

| Entity                       | Counts down to                     | Drains over                                   |
| ---------------------------- | ---------------------------------- | --------------------------------------------- |
| `timer.*` active             | `finishes_at`                      | its `duration`                                |
| `timer.*` paused / idle      | (held at `remaining` / `duration`) | its `duration`                                |
| `device_class: timestamp`    | the state                          | `countdown_hours`, else since it last changed |
| `input_datetime` with a date | the state                          | `countdown_hours`, else since it last changed |
| `input_datetime`, time only  | the next time the clock reads it   | `countdown_hours`, else a day                 |
| `calendar.*` off             | the next event's `start_time`      | `countdown_hours`, else since it last changed |
| `calendar.*` on              | the event's `end_time` ("Now")     | the event's length                            |

"Since it last changed" is the moment the finish time or alarm was set, so the ring starts full
when the countdown starts, as a timer's does. Time left is printed rounded up, as a timer is —
`12:34` under an hour, `4h 05m` under a day, `2d 4h` beyond — and VoiceOver hears it in words
("12 minutes 34 seconds left"). The supporting line says when ("at 14:30", "Fri 14:30"), or the
calendar event's title, or "Paused".

**The clock only runs while it is worth running.** The card wakes exactly when the printed
value next changes — the next second under an hour, the next minute above it — never on a blind
interval, and not at all while the card is off screen (`IntersectionObserver`) or the tab is
hidden. A card with no running countdown sets no timer. The ring slides between its once-a-second
values with a one-second linear transition; with reduced motion it steps.

**Times are the server's.** A naive date-time from Home Assistant — an `input_datetime`'s state,
a calendar's `start_time` and `end_time` — is a wall clock in the server's zone
(`hass.config.time_zone`), so it is read there, not in the browser's: an alarm at 07:00 is 07:00
at home on a laptop abroad (`zonedTime`, by `Intl` with a guess and a correction across DST, as
the calendar card does). The "at 14:30" is printed in the zone the profile chooses — the
server's under `time_zone: server`, the browser's otherwise — and in its clock format through
`timePreferences` (12, 24, the language's or the system's).

**Back from a background tab, at once.** A hidden tab's wake is cancelled; on its return the
card redraws immediately rather than wait for one, so a countdown over an hour (which wakes by
the minute) is never a minute stale.

A countdown whose entity has no colour of its own takes its Apple counterpart's: orange for
timers and times, red for calendars, and the matching glyph instead of the generic eye.

## 14. The three watchOS faces

- **`gauge`** — the Lock Screen's `accessoryCircular` gauge: a 240° arc open at the bottom, the
  reading in the middle, the glyph in the gap and a ringed marker where the fill ends. Without a
  range or a countdown it draws what `circular` draws.
- **`bezel`** — the Graphic Bezel: the name in the tint around the top of the rim on a
  `textPath`, cut with an ellipsis at 20 characters rather than run into the gap, and a smaller
  ring (or the glyph) with the reading inside. It never asks for a caption row, so its rings are
  as large as the cell allows.
- **`rectangular-graph`** — the graph complication: name, reading, the window's high and low
  beside it, and the history filling the block. Each block asks for 148 design units rather
  than 104, and `floorsFor` prices that. A reading with no history to draw falls back to the bar.

`gauge` and `bezel` tile exactly as `circular` does (`isCircular`); `rectangular-graph` stacks
with the rectangular family.

### The ring's short form

A countdown inside a ring — `circular`, `gauge` and `bezel` — prints its short form, the way the
Watch sets a countdown complication: `12:34` under an hour; `4:18` over a small `HR` under a day;
`2` over `DAYS` beyond. `4h 18m` on one line is wider than the inside of a 40-unit ring and
crowded the gauge's arc ends; the stacked form fits at every footprint (`shortRemaining`). The
rectangular and inline faces keep the long form, and VoiceOver always hears it in words. A
reading template still wins, printed as written.

### The graph face at small sizes

`rectangular-graph` is the one face that reflows rather than only stacking (`packGraph` in
`layout.ts`). A graph squeezed below `GRAPH_MIN` (96 units) is no graph, so when the box cannot
stack every block at that height it puts them side by side, two small graphs per row like the
Lock Screen's small rectangular widgets, and drops each cell's high and low once it is narrower
than 180 units. Only if even that cannot hold them all are the ones that do not fit left out —
whole, never drawn with their graph cut off, which is what stacking used to do at the Small
footprint. `floorsFor` still asks for the comfortable single column, so in Home Assistant this
mostly matters while a card is being dragged, or under a saved size that predates an added
entity (§5's stale-config window).

### `corner`: the Infograph corners

watchOS's Infograph face sets a complication in each corner of the screen: the reading tucked
into the corner, a curved gauge running past it along the round bezel. In a grid cell this is
honest so long as the arc follows a circle around the _card's_ middle rather than the cell's,
and that is how it is drawn: each cell holds a square anchored to its outer corner, and the arc
is a quarter of a circle centred on the square's inner corner (`cornerArc`). A card of four reads
as one face — four gauges round a centre, a reading in each corner — and the left-hand gauges
fill upward and the right-hand ones mirror them. The arc stops 28 units short of the square's
edges, which keeps the corner clear for the reading and the name; a long name ellipsizes rather
than run into the arc, so this face wants short names (a row's own **Name** is the fix). Two
across always; a fifth entity starts a new pair of corners below. With no range or countdown the
arc is not drawn and the reading stands alone in its corner.

## 15. Per-entity history and countdowns

`sparkline` and `countdown` are card switches, and each row may answer them for itself:
`sparkline: true | false`, `sparkline_hours` (1–48), `countdown: true | false`. Absent follows
the card. In the row panel they are **Recent history** and **Count down**, three-way dropdowns
— _Same as the card (on/off)_, _On for this entity_, _Off for this entity_ — whose first option
says what the card is currently set to, and **History to show**, offered only once this row
will actually draw a line (`rowOverrideFields`). Recent history is offered only on a face that
can draw one; on the graph face, _Off_ swaps the graph for the bar. `historyFor` in `model.ts`
is the one place the row, the card and the face are folded together, and the card fetches
history per window, so rows with different hours each get their own.

## 16. Bento

`layout: bento` gives each entity a rounded cell of its own, packed into one grid with even
gutters — the keynote feature grid, or a macOS widget stack — instead of one panel of equal
cells. The card draws no panel; each cell is a surface of its own in the `container`'s paint
(glass, or the theme's card). `bento.ts` holds every decision, and the card draws what it says:

- **The footprint sets the grid**: as many 96-unit columns as fit, two to six (two at Small,
  four at Medium), and as many rows; the rows used share the card's height.
- **Sizes**: a row's `size` — `small` (1×1), `wide` (2×1), `tall` (1×2), `large` (2×2) — or,
  absent, the hero rule: the first entity Large if the grid holds it beside everything else,
  then Wide, then Small; the rest Small.
- **Faces**: a row's `style`, or the one its size reads best as — a square is a ring (the card's
  own circular face if it has one), a wide cell a rectangle (the graph for a number), a tall
  cell the gauge, the hero the graph for a number, the gauge for a range or countdown.
- **Packing**: dense first fit, rows then columns, so smalls fill the hole beside a large. A cell
  that does not fit tries smaller sizes before it is left out, and one left out is left out
  whole; nothing is drawn past the card's edge. Each face is sized to its own cell exactly as it
  would be to a card that size.

In the editor, **Layout** is a card row; **Size** and **Face** appear in each entity's panel
only while the layout is bento. The floor (`bentoFloors`) is two columns and enough rows for every
entity at Small, since packing shrinks before it drops.
