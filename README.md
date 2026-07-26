# Cupertino Widgets

iOS-style widget cards for Home Assistant dashboards. Install, drop a card on a
dashboard, done — the cards pick sensible defaults instead of asking you to fill in a
config, and they take their shape from the box you drag them into rather than from a size
setting you have to think about.

> **Status: early.** The calendar card lays itself out exactly like Apple's and draws
> your real calendars. Reminders are not wired up yet — that needs `todo` entities — and
> the calendar card is the only one there is.

Requires a current Home Assistant (**2026.7 or newer**) — the cards track the latest
frontend APIs rather than carrying compatibility shims.

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
           alt="A small square calendar card: Friday 24, an all-day Kraków trip, Standup, and 1 more event">
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
editor, so there is no YAML to write. One control: which calendars feed it. The size is
the Layout tab's job, not ours.

The equivalent YAML, if you prefer it:

```yaml
type: custom:cupertino-widgets-calendar
entities: # optional; leave it out for every calendar
  - calendar.work
  - calendar.personal
```

| Option     | Default        | Meaning                                                         |
| ---------- | -------------- | --------------------------------------------------------------- |
| `entities` | every calendar | Which `calendar.*` entities to draw. Omit it rather than empty. |

Plus `grid_options`, which is Home Assistant's own and is what the Layout tab writes.

Each calendar is subscribed separately over `calendar/event/subscribe`, so the card
follows Home Assistant rather than polling it. Colours come from the colour set on the
calendar in Home Assistant's entity settings, and otherwise from the iOS palette, dealt
by the same sorted order Home Assistant's own calendar panel uses.

> Reminders — the grey rows with a circle — are `todo` entities and are not read yet.
> Everything the card draws today comes from `calendar.*`.

## Development

```bash
pnpm install
pnpm dev          # dev harness at http://localhost:5173 — no Home Assistant needed
pnpm test         # the layout rules, as unit tests
```

The harness renders every card against a mock `hass` object, at four footprints either
side of the layout threshold plus a drag-resizable box. Its controls exist to make the layout rules visible: **Data**
picks either `live (websocket)`, which makes the card resolve `entities` and subscribe to
the mock's calendars exactly as it would in Home Assistant, or one of the fixtures built
to hit every layout branch (an empty today, a skipped empty tomorrow, locations that fit
and locations that do not, reminders, all-day, a tail that turns into `2 more events`).
Only the first exercises the wire mapping; only the rest can reach every layout rule.
**Clock**
flips between 12- and 24-hour formatting, and there is a dark-theme toggle and a
slider that emulates different dashboard section widths. This is the fast loop: full
HMR.

The **Visual editor** panel runs the card's real editor — reached the way Home Assistant
reaches it, through `getConfigElement()` — against a live card, and prints the config it
writes. Its `ha-form` is a stand-in (`dev/ha-stubs.ts`): the behaviour is real, the
widget is not, so check how it _reads_ in the dev Home Assistant below.

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
Which is the real argument for the harness above being the loop you live in, and this one
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

There is no website for this project, so the README is the shop window — which means the
pictures in it have to be as cheap to regenerate as the code is to rebuild, or they will
quietly go out of date. One command, run by hand whenever the cards change:

```bash
pnpm shots
```

It starts the same Vite dev server the harness runs on, opens `dev/shots.html` in
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
dev/                    mock-hass harness, the screenshot page, the dev HA config
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
  demo-data.ts          fixtures for the dev harness, never for a dashboard
```

Cards read `--cw-*` tokens, never Home Assistant variables directly. `theme/tokens.ts`
is the single place that bridge lives, so a user's theme restyles every card for free.

[`docs/ha-api-notes.md`](docs/ha-api-notes.md) records the Home Assistant APIs this
library depends on, each verified against the frontend bundle shipped in the HA image
rather than against documentation — including several points where the widely-repeated
advice is now wrong.

## Licence

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
