# Cupertino Widgets

Widget cards for Home Assistant dashboards, styled like the ones on a phone's home screen.
Install, drop a card on a dashboard, done — the cards pick sensible defaults instead of
asking you to fill in a config, and they take their shape from the box you drag them into
rather than from a size setting you have to think about.

> **Status: early.** The calendar card lays itself out exactly like Apple's and draws
> your real calendars. Reminders are not wired up yet — that needs `todo` entities — and
> the calendar card is the only one there is.

Requires a current Home Assistant (**2026.7 or newer**) — the cards track the latest
frontend APIs rather than carrying compatibility shims.

**[Try the cards in your browser →](https://sabbaken.github.io/cupertino-widgets/)** Every
size, live, with the sample data and the clock under your control — and the config to paste
when you like what you see. Nothing to install.

## The widgets

| Card                                | Status       |
| ----------------------------------- | ------------ |
| `custom:cupertino-widgets-calendar` | events, live |
| Battery levels                      | planned      |
| To-do lists                         | planned      |

### Calendar

Today's date, then today's events, then as much of the days after today as the card has
room for — one continuous flow, poured through however many columns the footprint gives
it. Each event is tinted with the colour of the calendar it came from. Empty days are not
listed as empty, they simply do not appear, and whatever ran out of room at the bottom
becomes `2 more events`.

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/calendar-medium.png" width="540"
           alt="A medium calendar card: Friday 24, Design review and Lunch with Anna in the left column, Dentist and tomorrow's Market run in the right, then 3 more events">
      <br />
      <sub><b>Medium.</b> A full day, then tomorrow. <code>Dentist</code> is still today —
      the flow simply ran out of left column.</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/images/calendar-small.png" width="286"
           alt="A small square calendar card: Friday 24, an all-day Poznań trip, Standup, and 1 more event">
      <br />
      <sub><b>Small.</b> Today and nothing else, ever. The badge is an all-day event,
      which has no time to show and so gets a row to itself.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/images/calendar-empty-today.png" width="540"
           alt="A medium calendar card: No Events Today on the left, tomorrow's Market run and Coffee with Marta on the right">
      <br />
      <sub><b>Medium, on a quiet day.</b> Nothing today, so it says so — and rather than
      leave the other column empty as well, the flow starts there with tomorrow.</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/images/calendar-dark.png" width="540"
           alt="A medium calendar card on a dark theme: Design review today, then a SUNDAY, JUL 26 heading over Market run and Coffee with Marta">
      <br />
      <sub><b>Medium, dark theme.</b> Tomorrow is empty here, so it is skipped — and the
      heading becomes a date, because <code>TOMORROW</code> has to mean literally
      tomorrow.</sub>
    </td>
  </tr>
</table>

Those four are fixtures rather than anybody's real week, and they are generated rather
than cropped: `pnpm shots` renders the cards against a frozen clock and writes the files.
See [Screenshots](#screenshots).

What the card decides to show, and in what order, is written down in
[`docs/calendar-widget-rules.md`](docs/calendar-widget-rules.md) — empty days
disappearing, `TOMORROW` meaning literally tomorrow, when a location earns its line, when
the rest becomes `2 more events` and when it just goes, why `5 – 6PM` prints only one
`PM`.

### Size

**There is no size option.** Resize the card the normal way — the **Layout** tab in the
dashboard editor — and it works out which of Apple's two widget shapes fits the box you
gave it:

| measured width | layout | shows                     |
| -------------- | ------ | ------------------------- |
| under 340px    | small  | today                     |
| 340px and up   | medium | today and what follows it |

In a section of the usual ~500px that lands at roughly 8 columns and below for the
square, 9 and above for the 2:1.

Two footprints are worth knowing, and they are the ones in the screenshots above:

| footprint       | comes out at  | Apple's shape    |
| --------------- | ------------- | ---------------- |
| **6 × 4** rows  | ~246 × 248 px | the small square |
| **12 × 4** rows | ~500 × 248 px | the medium 2:1   |

Everything between and around them works — that is the whole point of measuring the box
instead of reading a preset. A card dragged taller fills the extra height with more rows
rather than leaving it blank, and one dragged narrow folds to a single column of content.
But those are the flexibility, not the design: the two above are the proportions the
content was laid out for. A freshly added card arrives full width by 4 rows and can be
dragged down to 4 × 3.

**`scale` is the other question.** The footprint settles how much room the card has; `scale`
settles how large what goes in it is drawn — the type at 80% or 130% of the size above,
along with the spacing around it, for a wall tablet read from across the room or a dense
dashboard read at a desk. It is not a preset of the two shapes and it is not a substitute
for dragging: what fits changes, the two shapes do not. See [Usage](#usage).

## Install

### HACS

Add this repository as a custom repository of type **Dashboard**, then download it.
HACS registers the dashboard resource for you.

### Manually

1. Download `cupertino-widgets.js` from the
   [latest release](../../releases/latest) into `config/www/`.
2. Add it under **Settings → Dashboards → ⋮ → Resources** as
   `/local/cupertino-widgets.js`, type **JavaScript module**.

## Usage

Add the card from the dashboard's card picker and configure it there — it has a visual
editor, so there is no YAML to write. Three controls: which calendars feed it, which clock
it prints times in, and how large to draw it. The footprint is the Layout tab's job, not
ours.

The equivalent YAML, if you prefer it:

```yaml
type: custom:cupertino-widgets-calendar
entities: # optional; leave it out for every calendar
  - calendar.work
  - calendar.personal
time_format: system # optional; system | 12 | 24
scale: 100 # optional; 80–130, percent
```

`12` and `24` are read whether or not you quote them, and so is `scale`.

| Option        | Default        | Meaning                                                         |
| ------------- | -------------- | --------------------------------------------------------------- |
| `entities`    | every calendar | Which `calendar.*` entities to draw. Omit it rather than empty. |
| `time_format` | `system`       | `system` follows your profile; `12` or `24` overrides it.       |
| `scale`       | `100`          | Percent. Draws the whole widget larger or smaller. 80–130.      |

**On `system`.** It follows the time format in your Home Assistant profile, and that
setting's own auto-detection reads the browser's locale — which is the only channel a
browser offers. macOS keeps its 24-hour switch outside the locale and Chrome does not fold
it in, so a Mac set to AM/PM behind a browser set to British English detects 24-hour and
there is no web API that would know better. That is what `12` and `24` are for.

**On `scale`.** The dashboard you work in and the tablet on the hallway wall want different
type, and dragging a card wider only ever gave you more of the same 17px of it. This is the
other knob: one factor over the whole widget — type, rows, spacing and insets together — so
the card at 120% is the card at 100% seen from closer up rather than a differently
proportioned one.

It is spent out of the row budget, which is the trade worth knowing about. The same
footprint that holds 4 rows beside the date and 7 in the second column at 100% holds 2 and
5 at 130%, and 6 and 9 at 80% — so a card scaled up wants dragging taller, and a card
scaled down fills the height it already has with more of the day. Values outside 80–130 are
clamped rather than refused: past those the widget stops looking like itself, mostly
because the layout's own thresholds start moving under it.
[`docs/calendar-widget-rules.md`](docs/calendar-widget-rules.md) has the arithmetic.

Plus `grid_options`, which is Home Assistant's own and is what the Layout tab writes.

Each calendar is subscribed separately over `calendar/event/subscribe`, so the card
follows Home Assistant rather than polling it. Colours come from the colour set on the
calendar in Home Assistant's entity settings, and otherwise from this library's own
palette, dealt by the same sorted order Home Assistant's own calendar panel uses.

> Reminders — the grey rows with a circle — are `todo` entities and are not read yet.
> Everything the card draws today comes from `calendar.*`.

## Development

```bash
pnpm install
pnpm dev          # the showcase at http://localhost:5173 — no Home Assistant needed
pnpm test         # the layout rules, as unit tests
```

`pnpm dev` serves the same page that is published at
[sabbaken.github.io/cupertino-widgets](https://sabbaken.github.io/cupertino-widgets/), with
full HMR: every card against a mock `hass` object, in a box the sections grid would have
given it. This is the fast loop.

The top of it is what a visitor sees: **Small** and **Medium**, each labelled with the
footprint the Layout tab would give it, plus a box whose corner drags. They stand on a
plane painted with Home Assistant's own background, and the site gives each card a width
and a height and not one other property — so a card there is a card on a dashboard.

The settings column down the right-hand side leads with the config to paste and a Copy
button, then every knob that changes it, grouped by whether it belongs to the card.
**Scale** is the one in the Card group, and the only one of these that ends up in the YAML
above it — every card in the library has it, so it is here whichever widget is on screen.
The rest stand in for Home Assistant. **Calendars** picks either `Live`, which makes the
card resolve `entities` and subscribe to the mock's calendars exactly as it would in Home
Assistant, or one of the fixtures built to hit every layout branch (an empty today, a
skipped empty tomorrow, locations that fit and locations that do not, reminders, all-day, a
tail that turns into `2 more events`). Only the first exercises the wire mapping; only the
rest can reach every layout rule. **Clock** flips between the system format and an explicit
12 or 24 hours, and **Section width** emulates a wider or narrower dashboard section, which
re-boxes every footprint on the page.

**Advanced** is the part that is there for working on a card rather than for choosing one:
the in-between footprints, and the card's real editor — reached the way Home Assistant
reaches it, through `getConfigElement()` — driving a live card beside the config it writes.
That editor's `ha-form` is a stand-in (`dev/ha-stubs.ts`): the behaviour is real, the widget
is not, so check how it _reads_ in the dev Home Assistant below.

```bash
pnpm build:site   # the same page as static files in dist-site/
pnpm preview:site # serve that build
```

The site is published to GitHub Pages by `.github/workflows/pages.yml` on every push to
`main`. It is served from a subdirectory, so the build hard-codes that prefix; a fork
serving it from a domain root wants `SITE_BASE=/ pnpm build:site`.

`pnpm test` covers the parts with no pixels in them — selection, ordering, column
packing, time formatting — including the worked examples at the bottom of the rules
document.

### Against a real Home Assistant

A throwaway Home Assistant lives in `docker-compose.yml`. It is wired so that build
output is served without any copy step: `./dist` is mounted into the container's
`www/`, and the dashboard resource is pre-registered in
`dev/ha-config/configuration.yaml`.

```bash
pnpm ha:up        # http://localhost:8123 — create an account on first run
pnpm verify       # build, bust the cache, restart — the one command to trust
```

**`pnpm verify` is the answer to "am I looking at my change?"** It builds, bumps the `?v=`
on the resource URL, and force-recreates the container. Nothing else is reliable, and it is
worth knowing why, because the failure mode is not "stale" — it is _one build behind_,
which reads as flaky rather than as cached.

Two caches sit in front of that file and cover for each other:

- Home Assistant serves `/local/` with `Cache-Control: public, max-age=2678400`. 31 days.
- The frontend's service worker ends its route table with a catch-all that `/local/` falls
  into: `registerRoute(/\/.*/, new StaleWhileRevalidate({ cacheName: 'file-cache',
plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400 })] }))`. Stale-while-revalidate
  answers from cache and refreshes behind you, so a reload shows the **previous** build and
  the current one appears on the reload after that.

A hard reload (⌘⇧R) does not rescue you, and the reason is specific: Home Assistant loads
a dashboard resource by appending a `<script type="module">` at runtime — `loadModule` in
the bundle is `url => appendScript('script', url, 'module')`. A force-reload takes the
service worker off the navigation and the subresources the parser found in the HTML; it has
no bearing on a fetch a script issues afterwards. So the worker answers the bundle from its
own copy, and the revalidation it fires behind you is served by the month-old HTTP entry.

Changing the URL misses both caches — they key on the full URL including the query, since
that catch-all route sets no `ignoreSearch`. A reload of some kind is unavoidable
regardless: a custom element cannot be redefined in a page that already registered it.
Which is the real argument for the showcase above being the loop you live in, and this one
being the loop you finish in.

If you would rather stay in the browser: DevTools → Application → Service Workers →
**Bypass for network**, plus **Disable cache** on the Network tab. Both only hold while
DevTools is open.

```bash
pnpm watch        # rebuild dist/ on change, if you want the file fresh without restarting
```

```bash
pnpm ha:logs      # follow the container log
pnpm ha:reset     # wipe the instance completely (onboarding, state, dashboards)
```

One sharp edge worth knowing: the bind mount of `dist` is fragile, and when it breaks
the container serves 404 for a bundle that is visibly there on the host. Two ways to
break it — deleting the _directory_ (Vite is configured never to, via
`emptyOutDir: false`), and `docker compose restart`, which keeps the existing container
and brings its mount back stale. `pnpm ha:up` force-recreates the container and
re-resolves the mount, so it is the fix for both, and it is what to use instead of
`restart` after editing `configuration.yaml`.

The dev instance loads the `demo` integration, so `calendar.calendar_1` and
`calendar.calendar_2` exist to develop against. For calendars you can write to, add
the **Local Calendar** integration in the UI.

### Screenshots

The README is the first shop window — before the site, before installing anything — which
means the pictures in it have to be as cheap to regenerate as the code is to rebuild, or
they will quietly go out of date. One command, run by hand whenever the cards change:

```bash
pnpm shots
```

It starts the same Vite dev server the showcase runs on, opens `dev/shots.html` in
headless Chromium, and clips one PNG into `docs/images/` per entry in `dev/shots.ts`'s
`SHOTS` list. That list is the whole edit surface: a shot is a fixture, a footprint in
Layout-tab columns and rows, and a theme. Nothing is cropped by hand — a hand-cropped
screenshot is a screenshot nobody can reproduce.

Two things the script does that a manual screenshot cannot:

- **Freezes the clock**, at Friday 24 July 2026, 09:41, in `Europe/Warsaw`. Half the
  calendar's rules are about `now`, so unfrozen, every run would produce different pixels
  in every file and each one would land in `git diff` — which is how a generated gallery
  stops being regenerated. The date is a Friday so that both heading forms appear across
  the set, and 09:41 because the fixtures anchor today to the next half hour, so
  everything today starts at a round 10:00.
- **Waits to be told.** The page sets `__SHOTS_READY__` only once every card has settled
  into the layout its box implies. A card guesses `medium` for its first frame and learns
  better when its ResizeObserver reports, so a camera firing on `load` would photograph
  the two-column layout inside a small box — reliably, and only in the one place nobody
  looks before committing.

Chromium is a one-off download:

```bash
pnpm exec playwright install chromium
```

Run it on macOS if you have the choice. The cards ask for `-apple-system` first, so that
is where the type comes out as SF rather than as whatever the machine has instead.

### Layout

```
src/
  index.ts              bundle entry — imports every card, which self-register
  core/
    base-card.ts        hass/config contract, sizing, dark mode, re-render filter
    card-editor.ts      the visual-editor half of that contract, over ha-form
    register.ts         collision-safe element definition + card-picker entry
    size.ts             the sections-grid geometry, and which layout a measured box gets
    types/ha.ts         the slice of the Home Assistant API we depend on
  theme/
    tokens.ts           --cw-* tokens, bridged onto Home Assistant theme variables
    base-styles.ts      structural CSS shared by every card
  cards/<widget>/       one directory per widget
dev/
  site/                 the showcase — one entry per widget in catalog.ts
  ha-stubs.ts           stand-ins for the Home Assistant elements cards use
  mock-hass.ts          a `hass` object good enough to develop against
  shots.ts              the README's screenshots, as a page a camera can point at
  ha-config/            the throwaway Home Assistant instance
docs/images/            the README's screenshots — generated, never hand-edited
```

The calendar card is split so that the rules can be read and tested without a browser:

```
cards/calendar/
  calendar-card.ts      the element: measure the box, draw what the two below decide
  calendar-card-editor.ts   the two fields the dashboard editor shows
  flow.ts               what to show and in what order — one stream of rows
  layout.ts             how much of that stream fits, in columns of a row budget
  format.ts             times, section headings, the date block
  datetime.ts           day arithmetic in the display timezone
  model.ts              the item shape every data source has to produce
  source.ts             the Home Assistant end: subscriptions, colours, wire mapping
  demo-data.ts          fixtures for the showcase, never for a dashboard
```

Cards read `--cw-*` tokens, never Home Assistant variables directly. `theme/tokens.ts`
is the single place that bridge lives, so a user's theme restyles every card for free.

[`docs/ha-api-notes.md`](docs/ha-api-notes.md) records the Home Assistant APIs this
library depends on, each verified against the frontend bundle shipped in the HA image
rather than against documentation — including several points where the widely-repeated
advice is now wrong.

## Licence

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
