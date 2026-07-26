# Cupertino Widgets

iOS-style widget cards for Home Assistant dashboards. Install, drop a card on a
dashboard, done — the cards pick sensible defaults instead of asking you to fill in a
config.

> **Status: early.** The calendar card lays itself out exactly like Apple's and draws
> your real calendars. Reminders are not wired up yet — that needs `todo` entities — and
> the calendar card is the only one there is.

Requires a current Home Assistant (**2026.7 or newer**) — the cards track the latest
frontend APIs rather than carrying compatibility shims.

## Widgets

| Card                                | Status       |
| ----------------------------------- | ------------ |
| `custom:cupertino-widgets-calendar` | events, live |
| Battery levels                      | planned      |
| To-do lists                         | planned      |

**There is no size option.** Resize the card the normal way — the **Layout** tab in the
dashboard editor — and it works out which of Apple's two widget shapes fits the box you
gave it:

| measured width | layout | shows                     |
| -------------- | ------ | ------------------------- |
| under 340px    | small  | today                     |
| 340px and up   | medium | today and what follows it |

In a section of the usual ~500px that lands at roughly 8 columns and below for the
square, 9 and above for the 2:1. A card dragged taller fills the extra height with more
rows rather than leaving it blank, and one dragged narrow folds to a single column of
content. A freshly added card arrives full width by 4 rows and can be dragged down to
4 × 3.

What the calendar card decides to show, and in what order, is written down in
[`docs/calendar-widget-rules.md`](docs/calendar-widget-rules.md) — empty days
disappearing, `TOMORROW` meaning literally tomorrow, when a location earns its line,
when the rest becomes `2 more events` and when it just goes, why `5 – 6PM` prints only
one `PM`.

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
dev/                    mock-hass harness + the dev Home Assistant config
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
