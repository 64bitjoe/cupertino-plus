# Cupertino Widgets

iOS-style widget cards for Home Assistant dashboards. Install, drop a card on a
dashboard, done — the cards pick sensible defaults instead of asking you to fill in a
config.

> **Status: early.** The calendar card currently renders placeholder content while the
> foundations are built. Not useful yet.

Requires a current Home Assistant (**2026.7 or newer**) — the cards track the latest
frontend APIs rather than carrying compatibility shims.

## Widgets

| Card                                | Status                      |
| ----------------------------------- | --------------------------- |
| `custom:cupertino-widgets-calendar` | scaffolding, hardcoded data |
| Battery levels                      | planned                     |
| To-do lists                         | planned                     |

Every widget comes in three sizes, laid out to match Apple's widget proportions on
Home Assistant's 12-column sections grid:

| `size`   | grid   | rendered | shape         |
| -------- | ------ | -------- | ------------- |
| `small`  | 6 × 4  | ~246×248 | square        |
| `medium` | 12 × 4 | ~500×248 | 2:1 (default) |
| `large`  | 12 × 8 | ~500×504 | square        |

`size` only sets the _starting_ footprint. Resizing a card by hand in the dashboard
editor always wins, and the card re-lays-out to whatever box it actually gets.

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

The minimum config is the card type:

```yaml
type: custom:cupertino-widgets-calendar
```

Pick a footprint:

```yaml
type: custom:cupertino-widgets-calendar
size: small
```

## Development

```bash
pnpm install
pnpm dev          # dev harness at http://localhost:5173 — no Home Assistant needed
```

The harness renders every card against a mock `hass` object, at all three preset
sizes plus a drag-resizable box, with a light/dark toggle and a slider that emulates
different dashboard section widths. This is the fast loop: full HMR.

### Against a real Home Assistant

A throwaway Home Assistant lives in `docker-compose.yml`. It is wired so that build
output is served without any copy step: `./dist` is mounted into the container's
`www/`, and the dashboard resource is pre-registered in
`dev/ha-config/configuration.yaml`.

```bash
pnpm ha:up        # http://localhost:8123 — create an account on first run
pnpm watch        # rebuild dist/ on change
```

Then hard-reload the browser (⌘⇧R). A hard reload is unavoidable: Home Assistant
serves `/local/` with a month-long cache header, and a custom element cannot be
redefined in a page that already registered it. That is why the harness above, not
this, is the loop you should live in.

```bash
pnpm ha:logs      # follow the container log
pnpm ha:reset     # wipe the instance completely (onboarding, state, dashboards)
```

One sharp edge worth knowing: the bind mount is tied to the inode of `dist`, so
deleting the _directory_ leaves the container pointing at an orphan and serving 404
for a bundle that is visibly there on the host. Vite is configured never to do this
(`emptyOutDir: false`), and `pnpm ha:up` recreates the container, so if you ever
`rm -rf dist` by hand just run `pnpm ha:up` again.

The dev instance loads the `demo` integration, so `calendar.calendar_1` and
`calendar.calendar_2` exist to develop against. For calendars you can write to, add
the **Local Calendar** integration in the UI.

### Layout

```
src/
  index.ts              bundle entry — imports every card, which self-register
  core/
    base-card.ts        hass/config contract, sizing, dark mode, re-render filter
    register.ts         collision-safe element definition + card-picker entry
    size.ts             size presets and the sections-grid geometry they derive from
    types/ha.ts         the slice of the Home Assistant API we depend on
  theme/
    tokens.ts           --cw-* tokens, bridged onto Home Assistant theme variables
    base-styles.ts      structural CSS shared by every card
  cards/<widget>/       one directory per widget
dev/                    mock-hass harness + the dev Home Assistant config
```

Cards read `--cw-*` tokens, never Home Assistant variables directly. `theme/tokens.ts`
is the single place that bridge lives, so a user's theme restyles every card for free.

[`docs/ha-api-notes.md`](docs/ha-api-notes.md) records the Home Assistant APIs this
library depends on, each verified against the frontend bundle shipped in the HA image
rather than against documentation — including several points where the widely-repeated
advice is now wrong.

## Licence

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
