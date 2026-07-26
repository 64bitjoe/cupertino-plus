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

Two sizes, the two Apple offers on a home screen, laid out to match its widget
proportions on Home Assistant's 12-column sections grid:

| `size`   | grid   | rendered | shows                     |
| -------- | ------ | -------- | ------------------------- |
| `small`  | 6 × 4  | ~246×248 | today                     |
| `medium` | 12 × 4 | ~500×248 | today and what follows it |

`size` only sets the _starting_ footprint. Resizing a card by hand in the dashboard
editor always wins: the layout follows the card's measured width, and a card dragged
taller fills the extra height with more rows rather than leaving it blank.

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
editor, so there is no YAML to write. Two controls: the footprint, and which calendars
feed it.

The equivalent YAML, if you prefer it:

```yaml
type: custom:cupertino-widgets-calendar
size: small # small | medium. Optional; defaults to medium
entities: # optional; leave it out for every calendar
  - calendar.work
  - calendar.personal
```

| Option     | Default        | Meaning                                                         |
| ---------- | -------------- | --------------------------------------------------------------- |
| `size`     | `medium`       | Starting footprint. See the table above.                        |
| `entities` | every calendar | Which `calendar.*` entities to draw. Omit it rather than empty. |

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

The harness renders every card against a mock `hass` object, at both preset sizes plus
a drag-resizable box. Its controls exist to make the layout rules visible: **Data**
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
pnpm watch        # rebuild dist/ on change
```

Then hard-reload the browser (⌘⇧R). A reload is unavoidable: a custom element cannot be
redefined in a page that already registered it. That is why the harness above, not this,
is the loop you should live in.

When even a hard reload keeps serving an old bundle, bump the `?v=` on the resource URL
in `dev/ha-config/configuration.yaml` and run `pnpm ha:up`. Two caches sit in front of
that file and cover for each other: Home Assistant serves `/local/` with
`Cache-Control: public, max-age=2678400`, and the frontend's service worker catches
everything unmatched in a StaleWhileRevalidate `file-cache`. A shift-reload bypasses the
service worker for the document but not for its subresources, so the worker keeps
answering from its own copy — and the revalidation it fires behind you is served by the
month-old HTTP entry. Changing the URL misses both.

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
    size.ts             size presets and the sections-grid geometry they derive from
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
