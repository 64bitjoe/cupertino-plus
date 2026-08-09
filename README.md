# Cupertino Widgets

Widget cards for [Home Assistant](https://www.home-assistant.io/) dashboards, styled like the
ones on a phone's home screen: sensible defaults instead of a config to fill in, and a shape
taken from the box you drag them into rather than from a size setting.

**[Live demo](https://sabbaken.github.io/cupertino-widgets/)** ·
**[Install](#install)** ·
**[The calendar](#the-calendar)** ·
**[The complications](#the-complications)** ·
**[The batteries](#the-batteries)** ·
**[Card rules](docs/calendar-widget-rules.md)** ·
**[Ring rules](docs/battery-widget-rules.md)** ·
**[Complication rules](docs/complication-widget-rules.md)**

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/sabbaken)
[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/sabbaken)

[![CI status](https://github.com/sabbaken/cupertino-widgets/actions/workflows/ci.yml/badge.svg)](https://github.com/sabbaken/cupertino-widgets/actions/workflows/ci.yml)
[![Release status](https://github.com/sabbaken/cupertino-widgets/actions/workflows/release.yml/badge.svg)](https://github.com/sabbaken/cupertino-widgets/actions/workflows/release.yml)
[![License: AGPL-3.0](https://img.shields.io/github/license/sabbaken/cupertino-widgets)](./LICENSE)
[![Home Assistant 2026.7+](https://img.shields.io/badge/Home%20Assistant-2026.7%2B-41BDF5?logo=homeassistant&logoColor=white)](https://www.home-assistant.io/)

The demo runs every size live, with sample data and the clock under your control, and hands
you the config to paste when you like what you see: nothing to install to look.

> **Status: early.** Three cards. The calendar draws your real calendars and to-do lists and
> lays itself out exactly like the phone's. The battery card draws any battery sensors you
> point it at. The complication card draws any entity at all, as a ring, a block or a line,
> and works out most of what it needs from the entity itself.
>
> It needs a current Home Assistant, **2026.7 or newer**: the cards track the latest
> frontend APIs rather than carrying compatibility shims.

## The calendar

Today's date, then today's events, then as much of the days after today as the card has
room for, one continuous flow poured through however many columns the footprint gives it.
Each event is tinted with the colour of the calendar it came from, and anything due out of
your to-do lists joins the same flow at its own time. Empty days are not listed as empty,
they simply do not appear, and whatever is left of the day the card ran out of room in
becomes `2 more events`.

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/calendar-medium.png" width="420"
           alt="A medium calendar card: Friday 24, Design review and Lunch with Anna in the left column, Dentist and tomorrow's Market run in the right, then 2 more events">
      <br />
      <sub><b>Medium.</b> A full day, then tomorrow. <code>Dentist</code> is still today;
      the flow simply ran out of left column.</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/calendar-small.png" width="222"
           alt="A small square calendar card: Friday 24, an all-day Poznań trip, Standup, and 1 more event">
      <br />
      <sub><b>Small.</b> Today and nothing else, ever. The badge is an all-day event, which
      has no time to show and so gets a row to itself.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/images/calendar-empty-today.png" width="420"
           alt="A medium calendar card: No Events Today on the left, tomorrow's Market run and Coffee with Marta on the right">
      <br />
      <sub><b>A quiet day.</b> Nothing today, so it says so, and rather than leave the
      other column empty as well, the flow starts there with tomorrow.</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/images/calendar-dark.png" width="420"
           alt="A medium calendar card on a dark theme: Design review today with a SUNDAY, JUL 26 heading under it, and Market run, Coffee with Marta and Training in the right column">
      <br />
      <sub><b>Dark theme.</b> It follows the one you picked in Home Assistant. Tomorrow is
      empty here, so it is skipped, and the heading becomes a date, because
      <code>TOMORROW</code> has to mean literally tomorrow.</sub>
    </td>
  </tr>
</table>

Those are fixtures rather than anybody's real week. What the card decides to show, and in
what order, is written down in
[`docs/calendar-widget-rules.md`](docs/calendar-widget-rules.md), down to why `5 – 6PM`
prints only one `PM`.

## The complications

One card, pointed at one entity or several, with a `style` choosing the look: a ring, a plain
block, a block with a coloured header strip, a block whose colour fills the whole card, or a
single line meant to sit among others like it. Everything else it works out for itself — the
name, the icon, the unit, and whether there is a range to draw an arc against, all come off the
entity, not off a form somebody had to fill in.

The colour is not a reading. It is fixed the moment an entity is chosen — a temperature reads
orange at 40° and orange at 90° — because a colour that stepped with the number would just be a
second, blurrier opinion about the number the reading already gives, and that is doubly true
next to a ring whose arc has already said what the level is. And the ring itself only appears
where there is an honest range to draw it against: a room's temperature has no ceiling, so that
complication draws its icon and its reading with no gauge at all, rather than one drawn against
a scale nobody asserted.

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/complication-medium.png" width="420"
           alt="A medium complication card: an unringed temperature reading, then humidity, water tank and phone battery each in their own coloured ring">
      <br />
      <sub><b>Medium.</b> A ring where there is a range to gauge, a plain reading where
      there is none — the same style, not a different one.</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/complication-small.png" width="222"
           alt="A small square complication card: the same four entities, with no captions under the rings because the column is too narrow to hold one">
      <br />
      <sub><b>Small.</b> The same four entities. The captions are gone because the column
      is too narrow to hold a name without clipping it, not because the card ran out of
      room for the rings themselves.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/images/complication-inline.png" width="222"
           alt="A small square complication card in the inline style: four hairline-separated rows, each an icon, a name and a reading">
      <br />
      <sub><b>Inline.</b> One line per entity, hairline-separated, for a complication meant
      to sit among others rather than to fill a cell of its own.</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/images/complication-bleed-dark.png" width="420"
           alt="A medium complication card on a dark theme, full-bleed: a teal card reading Pressure, 1,013 hPa in dark ink over the whole tinted surface">
      <br />
      <sub><b>Full-bleed, dark theme.</b> The tint is the whole card here, so the text
      needs its own dark ink on four of the ten tints — teal among them — where white
      fails the same contrast check a ring or an icon never has to pass.</sub>
    </td>
  </tr>
</table>

[`docs/complication-widget-rules.md`](docs/complication-widget-rules.md) has the whole
argument: why the colour is identity rather than a reading, when the ring is allowed to
disappear, why a thermostat gets no gauge by default, and why the card never scrolls.

## The batteries

A ring per device, green all the way, with the level read off the length of the arc and a bolt
on whatever is charging. Point it at the battery sensors you actually care about and it works
out the rest: how many rings across, whether there is room for the percentages, and how big to
draw them. **Four devices per card at these two sizes**: two across in the square, four across
in the wide one.

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/battery-medium.png" width="420"
           alt="A medium battery card: four green rings with a phone at 72%, a watch at 41% charging, earbuds at 8% and a tablet at 100% charging">
      <br />
      <sub><b>Medium.</b> Four devices fit one row, so they keep their percentages. The bolts
      are the two on a charger.</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/battery-small.png" width="222"
           alt="A small square battery card: two green rings, a phone at 72% and a watch at 41% charging">
      <br />
      <sub><b>Small.</b> One or two devices in the square is the left half of the medium card,
      percentages and all.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/images/battery-compact.png" width="222"
           alt="A small square battery card: four green rings without percentages, in a two by two grid">
      <br />
      <sub><b>Three or more in the square.</b> The percentages come off and the grid closes up;
      a caption is worth a row of its own, and past one row there is nowhere to keep buying
      it.</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/images/battery-dark.png" width="420"
           alt="A medium battery card on a dark theme: four rings reading 72%, 41% charging, 22% and a dash, the last one an empty ring with a dimmed doorbell icon">
      <br />
      <sub><b>Dark theme.</b> It follows the one you picked in Home Assistant. The last ring is
      empty with its icon dimmed and a dash for a reading, since that device has stopped
      reporting, which is a thing the card says rather than hides.</sub>
    </td>
  </tr>
</table>

The ring is green at 5% as much as at 95%, and that is on purpose: the arc's length is already
the reading, so a colour changing underneath it would be a second, coarser version of the same
number. [`docs/battery-widget-rules.md`](docs/battery-widget-rules.md) has the whole argument,
along with every rule above.

## Install

Through [HACS](https://hacs.xyz/), which is where a dashboard card belongs; it registers the
resource for you and tells you when there is a new version.

1. Open **HACS** in the Home Assistant sidebar.
2. **⋮** in the top right → **Custom repositories**.
3. Paste `https://github.com/sabbaken/cupertino-widgets` into **Repository**, pick
   **Dashboard** as the **Type**, and press **Add**.
4. Search HACS for **Cupertino Widgets**, open it, and press **Download**.
5. Reload the browser once, so the dashboard picks the new resource up.

Then add a card. The next section shows how.

## Adding a card

All three cards are in the dashboard's card picker (**Cupertino Calendar**, **Cupertino
Complication** and **Cupertino Batteries**), and all three have a visual editor, so there is no
YAML to write unless you want to.

### The calendar

Five fields: **Calendars**, which calendars feed it; **Reminders**, whether your to-do items
are drawn beside the events; **To-do lists**, which lists those come from; **Clock**, which
format it prints times in; and **Scale**, how large to draw it. Leave all of them alone and
you get every calendar, every to-do list, your Home Assistant time format, and 100%.

The equivalent YAML, if you prefer it:

```yaml
type: custom:cupertino-widgets-calendar
entities: # optional; leave it out for every calendar
  - calendar.work
  - calendar.personal
show_reminders: true # optional; false leaves your to-do lists out entirely
todo_entities: # optional; leave it out for every to-do list
  - todo.chores
time_format: system # optional; system | 12 | 24
scale: 100 # optional; 80–130, percent
```

| Option           | Default          | Meaning                                                          |
| ---------------- | ---------------- | ---------------------------------------------------------------- |
| `entities`       | every calendar   | Which `calendar.*` entities to draw. Omit it rather than empty.  |
| `show_reminders` | `true`           | Whether reminders are drawn. `false` reads no to-do list at all. |
| `todo_entities`  | every to-do list | Which `todo.*` entities to read. Omit it rather than empty.      |
| `time_format`    | `system`         | `system` follows your profile; `12` or `24` overrides it.        |
| `scale`          | `100`            | Percent. Draws the whole widget larger or smaller. 80–130.       |

`12`, `24` and `scale` are read whether or not you quote them.

**On reminders.** A reminder is a to-do item with a **due date**: the date is what gives it a
day to be drawn on, so an item without one never appears, and neither does one you have ticked
off. An item due at a time reads like an event, with the time under its title; one due on a
date reads as a single line, with no invented midnight under it. Both are drawn in the same
stream as the events rather than in a section of their own, which is where a to-do due at half
past ten belongs: between the nine o'clock meeting and the noon one.

**On `system`.** It follows the time format in your Home Assistant profile, and that
setting's own auto-detection reads the browser's locale, which is the only channel a
browser offers. A Mac set to AM/PM behind a browser set to British English detects 24-hour
and there is no web API that would know better. That is what `12` and `24` are for.

Colours come from the colour set on each calendar in Home Assistant's entity settings, and
otherwise from this library's own palette, dealt in the same order Home Assistant's own
calendar panel deals its own, so a calendar keeps the colour you have got used to. A to-do
list has no colour to take in Home Assistant, so its circle comes from that palette by the
position of the list. Every calendar and every list is subscribed to rather than polled, so
the card follows Home Assistant as events and items change.

### The complications

Six fields: **Entities**, which one or several to draw; **Style**, which of the five faces to
use; **Minimum** and **Maximum**, an optional range to gauge; **Colour**, an optional override;
and **Scale**. Leave everything but Entities alone and the card still works — name, icon, unit,
colour and whether there is a range to gauge all come off the entity itself.

```yaml
type: custom:cupertino-widgets-complication
entities:
  - sensor.living_room_temperature
  - sensor.living_room_humidity
style: circular # optional; circular | rectangular | rectangular-header | rectangular-bleed | inline
scale: 100 # optional; 80–130, percent
```

A row can carry more than an id, for the entities the card cannot read a range or a colour
off on its own:

```yaml
entities:
  - entity: sensor.workshop_temperature
    min: 10 # both halves are required together, or neither counts
    max: 30
    color: red # overrules the colour the entity's device class or domain would pick
```

| Option      | Default    | Meaning                                                                                 |
| ----------- | ---------- | --------------------------------------------------------------------------------------- |
| `entities`  | none       | Which entities to draw, in the order the faces follow them. Ids or rows.                |
| `style`     | `circular` | `circular` \| `rectangular` \| `rectangular-header` \| `rectangular-bleed` \| `inline`. |
| `min`/`max` | derived    | A range to gauge, card-wide or per row. Both are required together.                     |
| `color`     | derived    | Overrules the colour the entity's `device_class` or domain would pick.                  |
| `scale`     | `100`      | Percent. Draws the whole widget larger or smaller. 80–130.                              |

**No gauge is not a mistake.** A room's temperature has no ceiling to draw an arc against, so
that complication draws its icon and its reading with nothing round them, rather than a ring
scaled against a number nobody gave it. `min`/`max` is how you give it one, for the entities —
a thermostat's current temperature is the usual case — where the honest answer is "there is a
range, but only you know what it is".

**The colour never moves.** It is fixed the moment the entity is chosen — from what
`device_class` or the domain says the entity measures — and stays that colour at every reading,
for the reason [`docs/complication-widget-rules.md`](docs/complication-widget-rules.md) argues
at length: a colour that stepped with the number would be a second, blurrier version of the
reading the card is already showing.

**`rectangular-bleed` is worth using sparingly.** It replaces the card's own surface with the
tint, edge to edge, which is arresting once and busy six times over on the same dashboard. Save
it for the one reading that deserves the whole card, and reach for `rectangular-header` for the
rest of a panel that wants the same colour without spending the whole view on it.

### The batteries

A list of devices, then **Scale**. This is the one card that draws nothing useful before it is
configured: it says `No Devices`, because an installation's battery sensors are every remote,
every valve and every door contact, and no order over them would be the one you meant.

Press **Add a device** (which opens the list of sensors straight away), pick one, and it joins
the list as a panel of its own. Open
the panel and everything about that device is in one place: which **battery sensor**, its
**icon**, its **charging sensor** and its **name**. Drag a panel by the handle to move its ring;
the bin in its header removes it. Each field shows what the card will draw if you leave it
empty, and the picker does not offer a sensor that is already in the list, so nothing here
needs YAML.

```yaml
type: custom:cupertino-widgets-battery
entities:
  - sensor.phone_battery
  - sensor.watch_battery
  # a row can carry more than an id, for the things a sensor cannot say itself:
  - entity: sensor.tablet_battery
    charging_entity: binary_sensor.tablet_charging
    name: Tablet
    icon: mdi:tablet
scale: 100 # optional; 80–130, percent
```

| Option            | Default          | Meaning                                                           |
| ----------------- | ---------------- | ----------------------------------------------------------------- |
| `entities`        | none             | Which devices, in the order the rings follow. Ids or rows.        |
| `charging_entity` | the sensor's own | A `binary_sensor` that is `on` while the device charges.          |
| `name`            | `friendly_name`  | Tooltip and screen-reader label only; never drawn.                |
| `icon`            | the sensor's own | Any `mdi:` name. This is the only thing that says _which_ device. |
| `scale`           | `100`            | Percent. Draws the whole widget larger or smaller. 80–130.        |

**Four rings, and a longer list is not an error.** Both sizes here draw four devices and stay
quiet about the rest, so a card given six shows the first four and looks pixel-for-pixel like
a card given four. Writing six now is groundwork for a `large` size with two rows to put them
in; until then four is the design rather than a shortfall, and the wide card in particular does
not stack a stub row under a full one.

**Worth setting `icon`.** Home Assistant computes a battery sensor's icon from its level, so
without one you get a battery glyph inside a battery ring, six times over. It sits under the
battery sensor in a device's panel, and it is the one thing on this card that says _which_
device a ring is. The only sensor the picker cannot offer you is a battery percentage published
without the `battery` device class; that one still works, it just has to be named in YAML.

**Charging is detected without help** where the sensor says so itself: `is_charging` or
`battery_state` on its attributes, which is what many integrations publish. `charging_entity`
is for the rest, and it is the separate binary sensor the companion app and friends ship.

A device whose sensor cannot be read is still drawn: an empty ring, a dimmed icon and a dash
instead of a percentage. That is the point of putting the card up.

## How big it is

**There is no size option.** Resize a card the normal way (the **Layout** tab in the dashboard
editor) and it works out which of the two widget shapes fits the box you gave it. The calendar
shows today in the square and today plus what follows it in the wider 2:1; the battery card
puts two rings across the square and four across the 2:1. The line is at 340px of card, roughly
9 of the 12 columns in a section of the usual width, and it moves with `scale`, because larger
type needs more room before two columns of it stop truncating every title.

| footprint       | comes out at  | shape            |
| --------------- | ------------- | ---------------- |
| **6 × 4** rows  | ~246 × 248 px | the small square |
| **12 × 4** rows | ~500 × 248 px | the medium 2:1   |

Everything between and around them works too; that is the whole point of measuring the box
instead of reading a preset. A card dragged taller fills the extra height rather than leaving it
blank: the calendar with more rows of the week, the battery card with bigger rings, since its
rows are its devices and there is nothing else to put there. One dragged narrow folds to a
single column, or to two rings across. But those two footprints are the proportions the content
was laid out for. A new card arrives full width and 4 rows tall, and can be dragged down to 4
columns by 3 rows; a square that short holds the date and the next event and nothing else, so it
is one to leave at 100% or below.

**`scale` is the other question.** The footprint settles how much room the card has; `scale`
settles how large what goes in it is drawn: the type at 80% or 130% of the size above, along
with the spacing around it, for a wall tablet read from across the room or a dense dashboard
read at a desk. One factor over the whole widget, so the card at 120% is the card at 100% seen
from closer up rather than a differently proportioned one.

It is spent out of whatever the card has to give, which is the trade worth knowing about. On the
calendar that is rows: the same footprint that holds 4 under the date and 7 in the second column
at 100% holds 2 and 5 at 130%, and 6 and 9 at 80%, so a card scaled up wants dragging taller and
a card scaled down fills the height it has with more of the day. On the battery card the rows
are the devices and cannot be given up, so the rings shrink instead: the same four devices in
the same box, drawn smaller. Values outside 80–130 are clamped rather than refused.

The Layout tab writes its footprint into `grid_options`, which is Home Assistant's own and
belongs to every card rather than to this one.

## The widgets

| Widget                          | Status                      |
| ------------------------------- | --------------------------- |
| Calendar                        | events, live                |
| Battery levels                  | live                        |
| Complications                   | any entity, live            |
| Reminders, in the calendar card | to-do items with a due date |
| A to-do list of its own         | planned                     |

## Development

`pnpm dev` serves the showcase with no Home Assistant needed, `pnpm test` runs the layout
rules as unit tests. [`docs/development.md`](docs/development.md) has the rest: the two
loops, how the screenshots are generated, and where everything lives.

## Licence

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
